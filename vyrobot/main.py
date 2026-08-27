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

from analytics import KellyCriterion, LLMScorer, NewsIngestor, NewsItem, RiskManager
from config import AppConfig, WatchedMarket, configure_logging, load_config
from market_client import (
    Balance,
    BaseMarketClient,
    KalshiClient,
    MarketClientError,
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

        self._http_session: Optional[aiohttp.ClientSession] = None
        self._stopping = asyncio.Event()
        self._tasks: List[asyncio.Task] = []
        self._news_queue: "asyncio.Queue[NewsItem]" = asyncio.Queue(maxsize=1000)
        self._day_start = time.time()

        self._markets_by_venue: Dict[str, List[WatchedMarket]] = {"polymarket": [], "kalshi": []}
        for market in config.watched_markets:
            self._markets_by_venue.setdefault(market.venue, []).append(market)

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
            for market in self._markets_by_venue.get(venue, []):
                try:
                    await client.get_orderbook(market.market_id)
                except MarketClientError as exc:
                    logger.warning("Initial order-book fetch failed for %s:%s: %s", venue, market.market_id, exc)

        # Long-running background tasks.
        for venue, client in self.clients.items():
            market_ids = [m.market_id for m in self._markets_by_venue.get(venue, [])]
            if market_ids:
                self._tasks.append(asyncio.create_task(client.stream_orderbook(market_ids), name=f"stream:{venue}"))

        self._tasks.append(asyncio.create_task(self._news_poll_task(), name="news_poll"))
        self._tasks.append(asyncio.create_task(self._decision_loop_task(), name="decision_loop"))
        self._tasks.append(asyncio.create_task(self._balance_refresh_task(), name="balance_refresh"))
        self._tasks.append(asyncio.create_task(self._snapshot_task(), name="state_snapshot"))
        self._tasks.append(asyncio.create_task(self._daily_reset_task(), name="daily_reset"))

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

        try:
            order = await client.place_limit_order(
                market_id=market.market_id,
                side=decision.side,
                price=decision.limit_price,
                size=decision.contracts,
                time_in_force="IOC",
            )
            logger.info("Order submitted: %s (status=%s)", order.order_id, order.status)
        except OrderRejectedError as exc:
            logger.error("Order rejected by %s for %s: %s", market.venue, market.market_id, exc)
        except MarketClientError as exc:
            logger.error("Order submission failed for %s on %s: %s", market.market_id, market.venue, exc)

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
