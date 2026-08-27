"""
VyRobot Prediction Engine - main coordinating async event loop.

Wires together:
    * market data streaming (Polymarket + Kalshi)
    * async news ingestion
    * LLM-based signal scoring
    * fractional-Kelly sizing + hard risk gates
    * limit-order execution with retry/reconnect resilience

Designed to run as a single long-lived foreground process inside Termux:

    python main.py

Use ``termux-wake-lock`` before starting the process so Android does not
suspend the interpreter while the terminal app is backgrounded.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import signal
import time
from typing import Dict, List, Optional

import aiohttp

from analytics import (
    ArbitrageOpportunity,
    ArbitrageScanner,
    KellyCriterion,
    LLMScorer,
    NewsIngestor,
    NewsItem,
    RiskManager,
    compute_depth_adjusted_size,
)
from config import AppConfig, WatchedMarket, configure_logging, load_config
from market_client import (
    Balance,
    BaseMarketClient,
    KalshiClient,
    MarketClientError,
    Order,
    OrderRejectedError,
    PolymarketClient,
    StateManager,
)

logger = logging.getLogger("vyrobot.main")


class VyRobotEngine:
    """Owns the full lifecycle of the trading engine: connections,
    background tasks, the decision loop, and graceful shutdown."""

    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self.state = StateManager(snapshot_path=config.state_snapshot_path)
        self.clients: Dict[str, BaseMarketClient] = {}
        self.news = NewsIngestor(config.news)
        self.llm = LLMScorer(config.llm)
        self.risk = RiskManager(config.risk, KellyCriterion(config.risk.kelly_fraction))
        self.arbitrage = ArbitrageScanner(
            config.arbitrage_pairs, config.risk.min_arbitrage_edge_pct, config.risk.arbitrage_fee_buffer_pct
        )

        self._http_session: Optional[aiohttp.ClientSession] = None
        self._stopping = asyncio.Event()
        self._tasks: List[asyncio.Task] = []
        self._news_queue: "asyncio.Queue[NewsItem]" = asyncio.Queue(maxsize=1000)
        self._day_start = time.time()

        self._markets_by_venue: Dict[str, List[WatchedMarket]] = {"polymarket": [], "kalshi": []}
        for market in config.watched_markets:
            self._markets_by_venue.setdefault(market.venue, []).append(market)

    def _all_market_ids(self, venue: str) -> List[str]:
        """All market ids the engine needs live data for on ``venue``:
        the news-keyword watch-list plus either leg of any configured
        cross-exchange arbitrage pair."""
        ids = {m.market_id for m in self._markets_by_venue.get(venue, [])}
        for pair in self.config.arbitrage_pairs:
            if venue == "polymarket":
                ids.add(pair.polymarket_market_id)
            elif venue == "kalshi":
                ids.add(pair.kalshi_market_id)
        return list(ids)

    # ------------------------------------------------------------------ #
    # Setup / teardown
    # ------------------------------------------------------------------ #
    async def _build_clients(self) -> None:
        if self.config.polymarket.enabled:
            self.clients["polymarket"] = PolymarketClient(self.config.polymarket, self.state)
        if self.config.kalshi.enabled:
            self.clients["kalshi"] = KalshiClient(self.config.kalshi, self.state)

        if not self.clients:
            logger.warning(
                "No venues enabled (VYROBOT_POLYMARKET_ENABLED / VYROBOT_KALSHI_ENABLED are both "
                "false). The engine will run signal generation only, with no execution targets."
            )

        for venue, client in self.clients.items():
            try:
                await client.connect()
            except MarketClientError:
                logger.exception("Failed to connect %s client; it will be skipped", venue)

    async def start(self) -> None:
        logger.info(
            "Starting VyRobot Prediction Engine (dry_run=%s, venues=%s)",
            self.config.dry_run, list(self.clients.keys()) or list(v for v in ("polymarket", "kalshi")
                                                                     if getattr(self.config, v).enabled),
        )
        self.state.load_from_disk()
        self._http_session = aiohttp.ClientSession()
        await self._build_clients()

        # Bootstrap order books via REST before the websocket streams catch up.
        for venue, client in self.clients.items():
            for market_id in self._all_market_ids(venue):
                try:
                    await client.get_orderbook(market_id)
                except MarketClientError as exc:
                    logger.warning("Initial order-book fetch failed for %s:%s: %s", venue, market_id, exc)

        # Long-running background tasks.
        for venue, client in self.clients.items():
            market_ids = self._all_market_ids(venue)
            if market_ids:
                self._tasks.append(asyncio.create_task(client.stream_orderbook(market_ids), name=f"stream:{venue}"))

        self._tasks.append(asyncio.create_task(self._news_poll_task(), name="news_poll"))
        self._tasks.append(asyncio.create_task(self._decision_loop_task(), name="decision_loop"))
        self._tasks.append(asyncio.create_task(self._balance_refresh_task(), name="balance_refresh"))
        self._tasks.append(asyncio.create_task(self._snapshot_task(), name="state_snapshot"))
        self._tasks.append(asyncio.create_task(self._daily_reset_task(), name="daily_reset"))
        if self.config.arbitrage_pairs:
            self._tasks.append(asyncio.create_task(self._arbitrage_scan_task(), name="arbitrage_scan"))

    async def stop(self) -> None:
        logger.info("Stopping VyRobot Prediction Engine...")
        self._stopping.set()
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        self._tasks.clear()

        for venue, client in self.clients.items():
            try:
                await client.disconnect()
            except MarketClientError:
                logger.exception("Error disconnecting %s client", venue)

        if self._http_session:
            await self._http_session.close()
            self._http_session = None

        self.state.dump_to_disk()
        logger.info("VyRobot Prediction Engine stopped cleanly")

    async def run_forever(self) -> None:
        await self.start()
        try:
            await self._stopping.wait()
        finally:
            await self.stop()

    # ------------------------------------------------------------------ #
    # News ingestion -> queue
    # ------------------------------------------------------------------ #
    async def _news_poll_task(self) -> None:
        assert self._http_session is not None

        async def on_items(items: List[NewsItem]) -> None:
            for item in items:
                try:
                    self._news_queue.put_nowait(item)
                except asyncio.QueueFull:
                    logger.warning("News queue full; dropping oldest item to make room")
                    try:
                        self._news_queue.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                    self._news_queue.put_nowait(item)

        await self.news.poll_forever(self._http_session, on_items, should_stop=self._stopping.is_set)

    # ------------------------------------------------------------------ #
    # Decision loop: news -> relevant markets -> LLM score -> risk -> order
    # ------------------------------------------------------------------ #
    def _match_markets(self, item: NewsItem) -> List[WatchedMarket]:
        haystack = item.text.lower()
        matches = []
        for markets in self._markets_by_venue.values():
            for market in markets:
                if any(keyword in haystack for keyword in market.keywords):
                    matches.append(market)
        return matches

    async def _decision_loop_task(self) -> None:
        assert self._http_session is not None
        logger.info("Decision loop started")
        while not self._stopping.is_set():
            try:
                try:
                    item = await asyncio.wait_for(
                        self._news_queue.get(), timeout=self.config.decision_loop_interval_seconds
                    )
                except asyncio.TimeoutError:
                    continue

                matches = self._match_markets(item)
                if not matches:
                    continue

                score = await self.llm.score_news(self._http_session, item)
                if score is None:
                    logger.debug("No LLM score produced for item %s", item.item_id)
                    continue

                logger.info(
                    "Scored news %r -> p=%.3f c=%.3f (%s)",
                    item.title[:80], score.probability, score.confidence, score.rationale[:120],
                )

                for market in matches:
                    await self._evaluate_and_trade(market, score)

            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Unexpected error in decision loop; continuing")
        logger.info("Decision loop stopped")

    async def _evaluate_and_trade(self, market: WatchedMarket, score) -> None:
        client = self.clients.get(market.venue)
        if client is None:
            return

        book = self.state.get_orderbook(market.market_id)
        if book is None:
            try:
                book = await client.get_orderbook(market.market_id)
            except MarketClientError as exc:
                logger.warning("Could not fetch order book for %s:%s: %s", market.venue, market.market_id, exc)
                return

        total_capital = self.state.total_capital_usd()
        if total_capital <= 0:
            logger.warning("Total capital reported as $%.2f; skipping trade for %s", total_capital, market.market_id)
            return

        open_positions = len(self.state.all_positions())
        daily_pnl = self.state.get_daily_pnl()

        decision = self.risk.evaluate(score, book, total_capital, open_positions, daily_pnl)
        if not decision.approved:
            logger.info("Trade rejected for %s (%s): %s", market.market_id, market.venue, decision.reason)
            return

        logger.info(
            "Trade APPROVED: %s %s %.4f contracts @ %.4f (~$%.2f) on %s [%s]",
            decision.side, market.market_id, decision.contracts, decision.limit_price,
            decision.size_usd, market.venue, market.question[:80],
        )

        if self.config.dry_run:
            logger.info("DRY RUN active; order not sent to %s", market.venue)
            return

        # Dynamic depth-based downscale: re-check the freshest order book
        # available right now (it may have moved since ``decision`` was
        # computed a moment ago) and shrink the Kelly-derived contract
        # count to whatever size that book can actually absorb without the
        # volume-weighted fill price drifting past the configured slippage
        # tolerance. This is what prevents a large Kelly-sized bet from
        # walking a thin book into a materially worse average price than
        # the one it was sized against.
        execution_book = self.state.get_orderbook(market.market_id) or book
        adjusted_contracts, expected_vwap = compute_depth_adjusted_size(
            execution_book, decision.side, decision.contracts, self.config.risk.max_slippage_pct
        )
        if adjusted_contracts < decision.contracts:
            logger.info(
                "Depth-based downscale for %s: %.4f -> %.4f contracts (expected VWAP %.4f vs limit %.4f, "
                "tolerance %.2f%%)",
                market.market_id, decision.contracts, adjusted_contracts, expected_vwap,
                decision.limit_price, self.config.risk.max_slippage_pct * 100,
            )

        execution_notional = adjusted_contracts * decision.limit_price
        if adjusted_contracts <= 0 or execution_notional < self.config.risk.min_order_notional_usd:
            logger.info(
                "Order for %s skipped after depth-based downscaling: only $%.2f tradable within %.2f%% "
                "slippage tolerance",
                market.market_id, execution_notional, self.config.risk.max_slippage_pct * 100,
            )
            return

        try:
            order = await client.place_limit_order(
                market_id=market.market_id,
                side=decision.side,
                price=decision.limit_price,
                size=adjusted_contracts,
                time_in_force="IOC",
            )
            logger.info("Order submitted: %s (status=%s)", order.order_id, order.status)
        except OrderRejectedError as exc:
            logger.error("Order rejected by %s for %s: %s", market.venue, market.market_id, exc)
        except MarketClientError as exc:
            logger.error("Order submission failed for %s on %s: %s", market.market_id, market.venue, exc)

    # ------------------------------------------------------------------ #
    # Cross-exchange arbitrage: scan -> risk-size -> concurrent two-leg execution
    # ------------------------------------------------------------------ #
    async def _arbitrage_scan_task(self) -> None:
        logger.info(
            "Arbitrage scanner started: %d pair(s), interval=%.0fs",
            len(self.config.arbitrage_pairs), self.config.arbitrage_scan_interval_seconds,
        )
        while not self._stopping.is_set():
            try:
                if "polymarket" in self.clients and "kalshi" in self.clients:
                    for opportunity in self.arbitrage.scan(self.state):
                        await self._evaluate_and_execute_arbitrage(opportunity)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Unexpected error in arbitrage scan cycle; continuing")
            try:
                await asyncio.wait_for(self._stopping.wait(), timeout=self.config.arbitrage_scan_interval_seconds)
            except asyncio.TimeoutError:
                pass
        logger.info("Arbitrage scanner stopped")

    async def _evaluate_and_execute_arbitrage(self, opportunity: ArbitrageOpportunity) -> None:
        total_capital = self.state.total_capital_usd()
        if total_capital <= 0:
            return

        open_positions = len(self.state.all_positions())
        daily_pnl = self.state.get_daily_pnl()

        decision = self.risk.evaluate_arbitrage(opportunity, total_capital, open_positions, daily_pnl)
        if not decision.approved:
            logger.debug("Arbitrage opportunity %s rejected: %s", opportunity.pair_id, decision.reason)
            return

        logger.info(
            "ARBITRAGE APPROVED: pair=%s edge=%.4f contracts=%.4f notional=$%.2f expected_profit=$%.2f "
            "[leg A: %s %s %s @ %.4f | leg B: %s %s %s @ %.4f]",
            opportunity.pair_id, opportunity.edge_pct, decision.contracts, decision.notional_usd,
            decision.expected_profit_usd,
            opportunity.leg_a.venue, opportunity.leg_a.side, opportunity.leg_a.market_id, opportunity.leg_a.price,
            opportunity.leg_b.venue, opportunity.leg_b.side, opportunity.leg_b.market_id, opportunity.leg_b.price,
        )

        if self.config.dry_run:
            logger.info("DRY RUN active; arbitrage legs not sent for %s", opportunity.pair_id)
            return

        await self._execute_arbitrage_legs(opportunity, decision.contracts)

    async def _execute_arbitrage_legs(self, opportunity: ArbitrageOpportunity, contracts: float) -> None:
        """Submits both legs concurrently to minimize leg risk (the window
        in which one side fills and the other does not, leaving a naked
        directional position instead of the intended locked payout). If one
        leg fails after the other has already filled, this attempts a
        best-effort unwind of the filled leg rather than leaving it open."""
        leg_a, leg_b = opportunity.leg_a, opportunity.leg_b
        client_a = self.clients.get(leg_a.venue)
        client_b = self.clients.get(leg_b.venue)
        if client_a is None or client_b is None:
            logger.error("Cannot execute arbitrage %s: missing client for one leg", opportunity.pair_id)
            return

        async def _submit(client: BaseMarketClient, leg) -> Order:
            fresh_book = self.state.get_orderbook(leg.market_id)
            size = contracts
            if fresh_book is not None:
                adjusted, vwap = compute_depth_adjusted_size(
                    fresh_book, leg.side, contracts, self.config.risk.max_slippage_pct
                )
                if adjusted < size:
                    logger.info(
                        "Arbitrage leg %s:%s downscaled %.4f -> %.4f contracts on live depth (VWAP %.4f)",
                        leg.venue, leg.market_id, size, adjusted, vwap,
                    )
                size = adjusted
            if size <= 0:
                raise OrderRejectedError(f"No tradable depth within slippage tolerance for {leg.venue}:{leg.market_id}")
            return await client.place_limit_order(
                market_id=leg.market_id, side=leg.side, price=leg.price, size=size, time_in_force="IOC",
            )

        order_a, order_b = await asyncio.gather(
            _submit(client_a, leg_a), _submit(client_b, leg_b), return_exceptions=True
        )

        a_failed = isinstance(order_a, Exception)
        b_failed = isinstance(order_b, Exception)

        if a_failed:
            logger.error("Arbitrage leg A failed for %s (%s): %s", opportunity.pair_id, leg_a.venue, order_a)
        if b_failed:
            logger.error("Arbitrage leg B failed for %s (%s): %s", opportunity.pair_id, leg_b.venue, order_b)

        if a_failed and not b_failed:
            logger.critical(
                "LEG RISK: leg B filled on %s but leg A failed on %s for arbitrage %s; attempting "
                "best-effort unwind of leg B",
                leg_b.venue, leg_a.venue, opportunity.pair_id,
            )
            await self._unwind_leg(client_b, leg_b, order_b)
        elif b_failed and not a_failed:
            logger.critical(
                "LEG RISK: leg A filled on %s but leg B failed on %s for arbitrage %s; attempting "
                "best-effort unwind of leg A",
                leg_a.venue, leg_b.venue, opportunity.pair_id,
            )
            await self._unwind_leg(client_a, leg_a, order_a)
        elif not a_failed and not b_failed:
            logger.info(
                "Arbitrage %s executed cleanly: order_a=%s order_b=%s",
                opportunity.pair_id, order_a.order_id, order_b.order_id,
            )

    async def _unwind_leg(self, client: BaseMarketClient, leg, filled_order: Order) -> None:
        """Best-effort flatten of a single filled arbitrage leg when its
        counterpart failed to execute, to avoid being left with a naked
        directional position. This deliberately crosses the spread
        (accepting slippage) because eliminating leg risk takes priority
        over price once the arbitrage's guaranteed-payout structure is
        already broken."""
        try:
            opposite_side = "sell" if leg.side == "buy" else "buy"
            book = self.state.get_orderbook(leg.market_id)
            if book is None:
                logger.critical(
                    "Cannot auto-unwind leg %s:%s: no order book available. MANUAL INTERVENTION REQUIRED.",
                    leg.venue, leg.market_id,
                )
                return

            aggressive_price = book.best_bid.price if opposite_side == "sell" else (
                book.best_ask.price if book.best_ask else None
            )
            if opposite_side == "sell" and book.best_bid is None:
                aggressive_price = None
            if aggressive_price is None:
                logger.critical(
                    "Cannot auto-unwind leg %s:%s: no liquidity on the unwind side. MANUAL INTERVENTION REQUIRED.",
                    leg.venue, leg.market_id,
                )
                return

            unwind_size = filled_order.filled_size or filled_order.size
            await client.place_limit_order(
                market_id=leg.market_id, side=opposite_side, price=aggressive_price,
                size=unwind_size, time_in_force="IOC",
            )
            logger.warning("Unwind order submitted for %s:%s (%.4f contracts)", leg.venue, leg.market_id, unwind_size)
        except MarketClientError:
            logger.exception(
                "Failed to auto-unwind leg %s:%s; MANUAL INTERVENTION REQUIRED to close residual exposure.",
                leg.venue, leg.market_id,
            )

    # ------------------------------------------------------------------ #
    # Periodic maintenance tasks
    # ------------------------------------------------------------------ #
    async def _balance_refresh_task(self) -> None:
        while not self._stopping.is_set():
            for venue, client in self.clients.items():
                try:
                    balances = await client.get_balances()
                    for asset, bal in balances.items():
                        logger.debug("[%s] balance %s: total=%.4f available=%.4f", venue, asset, bal.total, bal.available)
                except MarketClientError as exc:
                    logger.warning("Balance refresh failed for %s: %s", venue, exc)
                try:
                    await client.get_positions()
                except MarketClientError as exc:
                    logger.warning("Position refresh failed for %s: %s", venue, exc)
            try:
                await asyncio.wait_for(self._stopping.wait(), timeout=self.config.balance_refresh_interval_seconds)
            except asyncio.TimeoutError:
                pass

    async def _snapshot_task(self) -> None:
        while not self._stopping.is_set():
            try:
                await asyncio.wait_for(self._stopping.wait(), timeout=60.0)
            except asyncio.TimeoutError:
                self.state.dump_to_disk()

    async def _daily_reset_task(self) -> None:
        while not self._stopping.is_set():
            try:
                await asyncio.wait_for(self._stopping.wait(), timeout=3600.0)
            except asyncio.TimeoutError:
                if time.time() - self._day_start >= 86400:
                    logger.info("Resetting daily PnL circuit breaker")
                    self.state.reset_daily_pnl()
                    self._day_start = time.time()


def _install_signal_handlers(loop: asyncio.AbstractEventLoop, engine: VyRobotEngine) -> None:
    def _handle_signal(sig_name: str) -> None:
        logger.info("Received %s; shutting down gracefully", sig_name)
        engine._stopping.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_signal, sig.name)
        except NotImplementedError:
            # add_signal_handler is unavailable on some constrained Termux/Android
            # Python builds; fall back to the default KeyboardInterrupt handling.
            signal.signal(sig, lambda *_args: engine._stopping.set())


async def _async_main(config: AppConfig) -> None:
    engine = VyRobotEngine(config)
    loop = asyncio.get_running_loop()
    _install_signal_handlers(loop, engine)
    await engine.run_forever()


def main() -> None:
    parser = argparse.ArgumentParser(description="VyRobot Prediction Engine")
    parser.add_argument(
        "--live", action="store_true",
        help="Disable dry-run mode and submit real orders (overrides VYROBOT_DRY_RUN).",
    )
    args = parser.parse_args()

    config = load_config()
    if args.live:
        config = AppConfig(**{**config.__dict__, "dry_run": False})

    configure_logging(config.log_level, config.log_file)
    logger.info("Configuration loaded. dry_run=%s", config.dry_run)

    try:
        asyncio.run(_async_main(config))
    except KeyboardInterrupt:
        logger.info("Interrupted by user")


if __name__ == "__main__":
    main()
