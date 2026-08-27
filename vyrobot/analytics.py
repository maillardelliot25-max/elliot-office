"""
Signal generation and quantitative risk layer for the VyRobot Prediction
Engine:

    * NewsIngestor      - async polling of RSS feeds + the free GDELT news API
    * LLMScorer         - async LLM call that turns a news item into (p, c)
    * KellyCriterion    - fractional Kelly position sizing
    * ArbitrageScanner  - cross-exchange (Polymarket <-> Kalshi) mispricing detector
    * RiskManager       - hard safety gates applied before every order, including
                          real-time order-book-depth-aware size downscaling
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any, Callable, Coroutine, Dict, List, Optional, Set, Tuple

import aiohttp

from config import ArbitragePair, LLMConfig, NewsConfig, RiskConfig
from market_client import OrderBook, OrderBookLevel, StateManager

logger = logging.getLogger("vyrobot.analytics")


# --------------------------------------------------------------------------- #
# News ingestion
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class NewsItem:
    item_id: str
    source: str
    title: str
    summary: str
    url: str
    published_at: float

    @property
    def text(self) -> str:
        return f"{self.title.strip()}. {self.summary.strip()}".strip()


def _hash_id(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


class NewsIngestor:
    """Polls free RSS feeds and the free GDELT Doc API on a fixed interval,
    de-duplicating items across cycles, and hands new items to a callback.
    """

    _RSS_NAMESPACES = {"atom": "http://www.w3.org/2005/Atom"}
    _GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"

    def __init__(self, config: NewsConfig) -> None:
        self.config = config
        self._seen_ids: Set[str] = set()
        self._seen_order: List[str] = []
        self._max_seen = 5000

    def _mark_seen(self, item_id: str) -> bool:
        """Returns True if newly seen (i.e. should be processed)."""
        if item_id in self._seen_ids:
            return False
        self._seen_ids.add(item_id)
        self._seen_order.append(item_id)
        if len(self._seen_order) > self._max_seen:
            stale = self._seen_order.pop(0)
            self._seen_ids.discard(stale)
        return True

    async def _fetch_rss(self, session: aiohttp.ClientSession, feed_url: str) -> List[NewsItem]:
        try:
            timeout = aiohttp.ClientTimeout(total=self.config.request_timeout_seconds)
            async with session.get(feed_url, timeout=timeout) as resp:
                if resp.status != 200:
                    logger.warning("RSS feed %s returned HTTP %d", feed_url, resp.status)
                    return []
                raw = await resp.read()
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            logger.warning("Failed to fetch RSS feed %s: %s", feed_url, exc)
            return []

        loop = asyncio.get_running_loop()
        try:
            items = await loop.run_in_executor(None, self._parse_rss_bytes, raw, feed_url)
        except ET.ParseError as exc:
            logger.warning("Failed to parse RSS feed %s: %s", feed_url, exc)
            return []
        return items

    def _parse_rss_bytes(self, raw: bytes, feed_url: str) -> List[NewsItem]:
        root = ET.fromstring(raw)
        results: List[NewsItem] = []

        # Standard RSS 2.0: <rss><channel><item>...
        for item_el in root.findall(".//item"):
            title = (item_el.findtext("title") or "").strip()
            summary = (item_el.findtext("description") or "").strip()
            link = (item_el.findtext("link") or "").strip()
            pub_date = item_el.findtext("pubDate")
            published_at = _parse_rfc822(pub_date) if pub_date else time.time()
            if not title:
                continue
            item_id = _hash_id(feed_url, link or title)
            if self._mark_seen(item_id):
                results.append(
                    NewsItem(item_id=item_id, source=feed_url, title=title, summary=summary,
                              url=link, published_at=published_at)
                )

        # Atom feeds: <feed><entry>...
        for entry_el in root.findall(".//atom:entry", self._RSS_NAMESPACES):
            title = (entry_el.findtext("atom:title", namespaces=self._RSS_NAMESPACES) or "").strip()
            summary = (entry_el.findtext("atom:summary", namespaces=self._RSS_NAMESPACES) or "").strip()
            link_el = entry_el.find("atom:link", self._RSS_NAMESPACES)
            link = link_el.get("href", "") if link_el is not None else ""
            if not title:
                continue
            item_id = _hash_id(feed_url, link or title)
            if self._mark_seen(item_id):
                results.append(
                    NewsItem(item_id=item_id, source=feed_url, title=title, summary=summary,
                              url=link, published_at=time.time())
                )

        return results

    async def _fetch_gdelt(self, session: aiohttp.ClientSession) -> List[NewsItem]:
        params = {
            "query": self.config.gdelt_query,
            "mode": "artlist",
            "format": "json",
            "maxrecords": str(self.config.max_items_per_cycle),
            "sort": "datedesc",
        }
        try:
            timeout = aiohttp.ClientTimeout(total=self.config.request_timeout_seconds)
            async with session.get(self._GDELT_URL, params=params, timeout=timeout) as resp:
                if resp.status != 200:
                    logger.warning("GDELT API returned HTTP %d", resp.status)
                    return []
                text = await resp.text()
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            logger.warning("Failed to fetch GDELT feed: %s", exc)
            return []

        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            logger.warning("GDELT API returned non-JSON payload; skipping cycle")
            return []

        results: List[NewsItem] = []
        for article in data.get("articles", []):
            title = (article.get("title") or "").strip()
            url = (article.get("url") or "").strip()
            if not title:
                continue
            item_id = _hash_id("gdelt", url or title)
            if self._mark_seen(item_id):
                results.append(
                    NewsItem(item_id=item_id, source="gdelt", title=title,
                              summary=article.get("domain", ""), url=url, published_at=time.time())
                )
        return results

    async def poll_once(self, session: aiohttp.ClientSession) -> List[NewsItem]:
        tasks = [self._fetch_rss(session, feed) for feed in self.config.rss_feeds]
        if self.config.gdelt_enabled:
            tasks.append(self._fetch_gdelt(session))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        items: List[NewsItem] = []
        for result in results:
            if isinstance(result, Exception):
                logger.warning("News source raised an unexpected error: %s", result)
                continue
            items.extend(result)
        return items[: self.config.max_items_per_cycle]

    async def poll_forever(
        self, session: aiohttp.ClientSession, on_items: Callable[[List[NewsItem]], Coroutine[Any, Any, None]],
        should_stop: Callable[[], bool],
    ) -> None:
        logger.info(
            "News ingestor started: %d RSS feeds, gdelt=%s, interval=%.0fs",
            len(self.config.rss_feeds), self.config.gdelt_enabled, self.config.poll_interval_seconds,
        )
        while not should_stop():
            try:
                items = await self.poll_once(session)
                if items:
                    logger.info("Ingested %d new news item(s)", len(items))
                    await on_items(items)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Unexpected error in news polling cycle; continuing")
            await asyncio.sleep(self.config.poll_interval_seconds)
        logger.info("News ingestor stopped")


_MONTHS = {
    m: i + 1
    for i, m in enumerate(
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    )
}


def _parse_rfc822(value: str) -> float:
    """Best-effort RFC822 pubDate parser (avoids an email.utils dependency
    quirk on some minimal Termux Python builds)."""
    try:
        match = re.search(
            r"(\d{1,2})\s+(\w{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})", value
        )
        if not match:
            return time.time()
        day, mon, year, hh, mm, ss = match.groups()
        month = _MONTHS.get(mon, 1)
        struct = time.struct_time(
            (int(year), month, int(day), int(hh), int(mm), int(ss), 0, 0, -1)
        )
        return time.mktime(struct)
    except (ValueError, TypeError):
        return time.time()


# --------------------------------------------------------------------------- #
# LLM scoring
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class LLMScore:
    probability: float   # implied probability p in [0, 1]
    confidence: float    # confidence c in [0, 1]
    rationale: str
    raw_text: str


_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)

_SCORING_INSTRUCTIONS = (
    "You are a quantitative news analyst for a prediction-market trading system. "
    "Read the news item below and output STRICT JSON ONLY, with no markdown fences and no "
    "prose outside the JSON object, in exactly this shape:\n"
    '{"probability": <float 0.00-1.00>, "confidence": <float 0.00-1.00>, "rationale": "<one sentence>"}\n\n'
    "\"probability\" is your best-estimate implied probability that the event described most "
    "directly relates to resolves YES / occurs, based strictly on the text given (do not use "
    "outside knowledge of events after this text). \"confidence\" reflects how directly and "
    "unambiguously the text bears on a concrete, resolvable outcome (0 = irrelevant or vague, "
    "1 = a direct, unambiguous, material update). If the text is not clearly relevant to any "
    "resolvable prediction-market question, set confidence low (< 0.3).\n\n"
    "News item:\n"
)


class LLMScorer:
    """Async LLM client that scores a single news item into (p, c)."""

    def __init__(self, config: LLMConfig) -> None:
        self.config = config

    def _build_request(self, item_text: str) -> Tuple[str, Dict[str, str], Dict[str, Any]]:
        prompt = _SCORING_INSTRUCTIONS + item_text

        if self.config.provider == "openai":
            headers = {
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json",
            }
            body = {
                "model": self.config.model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": self.config.max_tokens,
                "temperature": self.config.temperature,
            }
        else:  # anthropic
            headers = {
                "x-api-key": self.config.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            }
            body = {
                "model": self.config.model,
                "max_tokens": self.config.max_tokens,
                "temperature": self.config.temperature,
                "messages": [{"role": "user", "content": prompt}],
            }
        return self.config.api_url, headers, body

    @staticmethod
    def _extract_text(provider: str, data: Dict[str, Any]) -> str:
        if provider == "openai":
            choices = data.get("choices", [])
            if not choices:
                return ""
            return choices[0].get("message", {}).get("content", "")
        # anthropic
        content_blocks = data.get("content", [])
        return "".join(block.get("text", "") for block in content_blocks if isinstance(block, dict))

    @staticmethod
    def _parse_score(raw_text: str) -> Optional[LLMScore]:
        match = _JSON_OBJECT_RE.search(raw_text)
        if not match:
            logger.warning("LLM response contained no JSON object: %r", raw_text[:200])
            return None
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            logger.warning("LLM response JSON failed to parse: %r", match.group(0)[:200])
            return None

        try:
            p = float(parsed["probability"])
            c = float(parsed["confidence"])
        except (KeyError, TypeError, ValueError):
            logger.warning("LLM response missing/invalid probability or confidence: %r", parsed)
            return None

        p = min(max(p, 0.0), 1.0)
        c = min(max(c, 0.0), 1.0)
        rationale = str(parsed.get("rationale", ""))
        return LLMScore(probability=p, confidence=c, rationale=rationale, raw_text=raw_text)

    async def score_news(self, session: aiohttp.ClientSession, item: "NewsItem") -> Optional[LLMScore]:
        if not self.config.api_key:
            logger.error("LLM API key not configured; cannot score news item %s", item.item_id)
            return None

        url, headers, body = self._build_request(item.text)
        backoff = 1.0
        for attempt in range(self.config.max_retries + 1):
            try:
                timeout = aiohttp.ClientTimeout(total=self.config.timeout_seconds)
                async with session.post(url, headers=headers, json=body, timeout=timeout) as resp:
                    if resp.status == 429:
                        retry_after = float(resp.headers.get("Retry-After", backoff))
                        logger.warning("LLM API rate-limited (429); retrying in %.1fs", retry_after)
                        if attempt == self.config.max_retries:
                            return None
                        await asyncio.sleep(retry_after)
                        backoff = min(backoff * 2, 30)
                        continue
                    if resp.status >= 500:
                        logger.warning("LLM API server error %d; retrying in %.1fs", resp.status, backoff)
                        if attempt == self.config.max_retries:
                            return None
                        await asyncio.sleep(backoff)
                        backoff = min(backoff * 2, 30)
                        continue
                    if resp.status >= 400:
                        body_text = await resp.text()
                        logger.error("LLM API rejected request (%d): %s", resp.status, body_text[:300])
                        return None

                    data = await resp.json(content_type=None)
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                logger.warning("LLM API network error: %s; retrying in %.1fs", exc, backoff)
                if attempt == self.config.max_retries:
                    return None
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)
                continue

            raw_text = self._extract_text(self.config.provider, data)
            score = self._parse_score(raw_text)
            if score is None:
                return None
            return score

        return None


# --------------------------------------------------------------------------- #
# Kelly criterion sizing
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class KellyResult:
    side: str            # "buy" (yes) or "sell" (effectively buy the "no" leg)
    edge_b: float
    full_kelly_fraction: float
    applied_fraction: float


class KellyCriterion:
    """Fractional Kelly Criterion sizing for a binary contract.

    For a binary contract priced at ``market_price`` (cost to buy $1 of
    payout) and a model-estimated true probability ``p`` of the YES outcome:

        b  = (1 - market_price) / market_price      # net payout odds
        f* = (b * p - (1 - p)) / b                   # full-Kelly fraction

    A negative or non-positive f* means there is no edge on that side of the
    trade, so the same formula is evaluated for the NO leg (probability
    ``1 - p`` against price ``1 - market_price``) before concluding there is
    no tradable edge at all.
    """

    def __init__(self, kelly_fraction: float) -> None:
        self.kelly_fraction = kelly_fraction

    @staticmethod
    def _edge(market_price: float) -> float:
        if market_price <= 0.0 or market_price >= 1.0:
            return 0.0
        return (1.0 - market_price) / market_price

    @staticmethod
    def _full_kelly(p: float, b: float) -> float:
        if b <= 0:
            return 0.0
        return (b * p - (1.0 - p)) / b

    def compute(self, p: float, market_mid_price: float) -> KellyResult:
        p = min(max(p, 0.0), 1.0)
        market_mid_price = min(max(market_mid_price, 1e-6), 1 - 1e-6)

        b_yes = self._edge(market_mid_price)
        f_yes = self._full_kelly(p, b_yes)

        p_no = 1.0 - p
        price_no = 1.0 - market_mid_price
        b_no = self._edge(price_no)
        f_no = self._full_kelly(p_no, b_no)

        if f_yes <= 0.0 and f_no <= 0.0:
            return KellyResult(side="none", edge_b=0.0, full_kelly_fraction=0.0, applied_fraction=0.0)

        if f_yes >= f_no:
            full_fraction = f_yes
            edge_b = b_yes
            side = "buy"
        else:
            full_fraction = f_no
            edge_b = b_no
            side = "sell"

        applied_fraction = max(full_fraction, 0.0) * self.kelly_fraction
        return KellyResult(side=side, edge_b=edge_b, full_kelly_fraction=full_fraction, applied_fraction=applied_fraction)


# --------------------------------------------------------------------------- #
# Cross-exchange arbitrage
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class ArbitrageLeg:
    """One side of a two-leg arbitrage trade.

    ``side`` follows the same convention used throughout this codebase and
    ``market_client``: ``"buy"`` submits a literal buy order on the venue's
    YES book at ``price``; ``"sell"`` submits a sell order at ``price``,
    which is the mechanism used to obtain synthetic NO exposure at a true
    cost of ``1 - price`` (Kalshi supports this directly as a short; the
    Polymarket client mirrors it against the same simplified single-sided
    order-book model used elsewhere in this engine).
    """

    venue: str
    market_id: str
    side: str                # "buy" or "sell"
    price: float              # literal limit price to submit
    cost_per_contract: float  # true USD cost per contract (== price for buy, 1-price for sell)
    available_size: float     # depth resting at that exact top-of-book level


@dataclass(frozen=True)
class ArbitrageOpportunity:
    pair_id: str
    question: str
    leg_a: ArbitrageLeg
    leg_b: ArbitrageLeg
    edge_pct: float       # guaranteed profit per $1 of combined notional, net of the fee buffer
    max_contracts: float  # depth-limited ceiling, before capital sizing


class ArbitrageScanner:
    """Detects locked-in cross-venue mispricings between Polymarket and
    Kalshi markets that reference the same real-world event.

    For a pair of equivalent binary markets, buying YES on one venue and
    buying NO on the other locks in a payout of exactly $1 per contract
    regardless of outcome. If the combined cost of both legs is less than
    $1 (after a conservative flat fee-buffer), the difference is riskless
    profit modulo execution/leg risk and the assumption that both markets
    truly resolve identically.
    """

    def __init__(self, pairs: Tuple[ArbitragePair, ...], min_edge_pct: float, fee_buffer_pct: float) -> None:
        self.pairs = pairs
        self.min_edge_pct = min_edge_pct
        self.fee_buffer_pct = fee_buffer_pct

    def scan(self, state: StateManager) -> List[ArbitrageOpportunity]:
        opportunities: List[ArbitrageOpportunity] = []
        for pair in self.pairs:
            poly_book = state.get_orderbook(pair.polymarket_market_id)
            kalshi_book = state.get_orderbook(pair.kalshi_market_id)
            if poly_book is None or kalshi_book is None:
                continue
            if poly_book.best_bid is None or poly_book.best_ask is None:
                continue
            if kalshi_book.best_bid is None or kalshi_book.best_ask is None:
                continue

            # Direction A: buy YES on Polymarket, buy NO on Kalshi (sell Kalshi YES).
            cost_a = poly_book.best_ask.price + (1.0 - kalshi_book.best_bid.price)
            edge_a = 1.0 - cost_a - self.fee_buffer_pct

            # Direction B: buy YES on Kalshi, buy NO on Polymarket (sell Polymarket YES).
            cost_b = kalshi_book.best_ask.price + (1.0 - poly_book.best_bid.price)
            edge_b = 1.0 - cost_b - self.fee_buffer_pct

            if edge_a < self.min_edge_pct and edge_b < self.min_edge_pct:
                continue

            if edge_a >= edge_b:
                leg_a = ArbitrageLeg(
                    venue="polymarket", market_id=pair.polymarket_market_id, side="buy",
                    price=poly_book.best_ask.price, cost_per_contract=poly_book.best_ask.price,
                    available_size=poly_book.best_ask.size,
                )
                leg_b = ArbitrageLeg(
                    venue="kalshi", market_id=pair.kalshi_market_id, side="sell",
                    price=kalshi_book.best_bid.price, cost_per_contract=1.0 - kalshi_book.best_bid.price,
                    available_size=kalshi_book.best_bid.size,
                )
                edge_pct = edge_a
            else:
                leg_a = ArbitrageLeg(
                    venue="kalshi", market_id=pair.kalshi_market_id, side="buy",
                    price=kalshi_book.best_ask.price, cost_per_contract=kalshi_book.best_ask.price,
                    available_size=kalshi_book.best_ask.size,
                )
                leg_b = ArbitrageLeg(
                    venue="polymarket", market_id=pair.polymarket_market_id, side="sell",
                    price=poly_book.best_bid.price, cost_per_contract=1.0 - poly_book.best_bid.price,
                    available_size=poly_book.best_bid.size,
                )
                edge_pct = edge_b

            if edge_pct < self.min_edge_pct:
                continue

            opportunities.append(
                ArbitrageOpportunity(
                    pair_id=pair.pair_id, question=pair.question, leg_a=leg_a, leg_b=leg_b,
                    edge_pct=edge_pct, max_contracts=min(leg_a.available_size, leg_b.available_size),
                )
            )
        return opportunities


# --------------------------------------------------------------------------- #
# Order-book-depth-aware sizing (slippage protection)
# --------------------------------------------------------------------------- #

def compute_depth_adjusted_size(
    book: OrderBook, side: str, desired_contracts: float, max_slippage_pct: float
) -> Tuple[float, float]:
    """Walks the live order book from the top and returns the largest size
    (capped at ``desired_contracts``) that can be filled without the
    volume-weighted average price drifting more than ``max_slippage_pct``
    away from the top-of-book reference price.

    This is what lets the engine dynamically downscale a Kelly-derived bet
    size in real time: a book that is thin beyond the first level yields a
    smaller executable size than the one Kelly/RiskManager originally sized
    against, and the caller is expected to re-run this against the freshest
    available book immediately before submitting the order.

    Returns ``(allowed_size, expected_vwap)``. ``allowed_size`` of 0.0 means
    there is no tradable depth within tolerance at all.
    """
    levels: Tuple[OrderBookLevel, ...] = book.asks if side == "buy" else book.bids
    if not levels or desired_contracts <= 0:
        return 0.0, 0.0

    reference_price = levels[0].price
    if reference_price <= 0:
        return 0.0, 0.0

    max_price = reference_price * (1.0 + max_slippage_pct) if side == "buy" else reference_price * (1.0 - max_slippage_pct)

    cum_size = 0.0
    cum_cost = 0.0
    for level in levels:
        remaining = desired_contracts - cum_size
        if remaining <= 0:
            break
        take = min(level.size, remaining)
        if take <= 0:
            continue

        prospective_size = cum_size + take
        prospective_cost = cum_cost + take * level.price
        prospective_vwap = prospective_cost / prospective_size

        breaches = prospective_vwap > max_price if side == "buy" else prospective_vwap < max_price
        if breaches:
            # Solve for the partial size at this level that keeps the
            # cumulative VWAP exactly at the slippage boundary.
            denom = level.price - max_price
            if denom == 0:
                partial = 0.0
            else:
                partial = (max_price * cum_size - cum_cost) / denom
            partial = max(0.0, min(partial, take))
            cum_size += partial
            cum_cost += partial * level.price
            break

        cum_size = prospective_size
        cum_cost = prospective_cost

    if cum_size <= 0:
        return 0.0, 0.0

    allowed_size = min(cum_size, desired_contracts)
    vwap = cum_cost / cum_size
    return allowed_size, vwap


# --------------------------------------------------------------------------- #
# Risk manager
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class RiskDecision:
    approved: bool
    reason: str
    side: str = "none"
    size_usd: float = 0.0
    contracts: float = 0.0
    limit_price: float = 0.0


@dataclass(frozen=True)
class ArbitrageDecision:
    approved: bool
    reason: str
    contracts: float = 0.0
    notional_usd: float = 0.0
    expected_profit_usd: float = 0.0


class RiskManager:
    """Enforces every hard safety constraint before an order is ever built.

    All checks are conservative-by-default and are evaluated in a fixed
    order so the rejection reason is always the first violated constraint.
    """

    def __init__(self, config: RiskConfig, kelly: KellyCriterion) -> None:
        self.config = config
        self.kelly = kelly

    @staticmethod
    def mid_price(book: OrderBook) -> Optional[float]:
        return book.mid_price

    @staticmethod
    def spread_pct(book: OrderBook) -> Optional[float]:
        return book.spread_pct

    def evaluate(
        self,
        score: LLMScore,
        book: OrderBook,
        total_capital_usd: float,
        open_position_count: int,
        daily_pnl_usd: float,
    ) -> RiskDecision:
        # 1. Circuit breaker: daily loss limit.
        if total_capital_usd > 0 and (-daily_pnl_usd / total_capital_usd) >= self.config.max_daily_loss_pct:
            return RiskDecision(approved=False, reason="daily loss circuit breaker triggered")

        # 2. Confidence floor.
        if score.confidence < self.config.min_confidence:
            return RiskDecision(
                approved=False,
                reason=f"confidence {score.confidence:.2f} below floor {self.config.min_confidence:.2f}",
            )

        # 3. Portfolio concentration cap.
        if open_position_count >= self.config.max_open_positions:
            return RiskDecision(approved=False, reason="max open positions reached")

        # 4. Order book must have two-sided liquidity.
        if book.best_bid is None or book.best_ask is None:
            return RiskDecision(approved=False, reason="order book missing bid or ask")

        # 5. Spread gate.
        spread = self.spread_pct(book)
        if spread is None or spread > self.config.max_spread_pct:
            return RiskDecision(
                approved=False,
                reason=f"spread {spread if spread is not None else float('nan'):.4f} exceeds max {self.config.max_spread_pct:.4f}",
            )

        mid = self.mid_price(book)
        if mid is None:
            return RiskDecision(approved=False, reason="unable to compute mid price")

        # 6. Kelly sizing.
        kelly_result = self.kelly.compute(score.probability, mid)
        if kelly_result.side == "none" or kelly_result.applied_fraction <= 0.0:
            return RiskDecision(approved=False, reason="no positive Kelly edge")

        # 7. Hard 5% single-order allocation cap (never exceeded regardless
        #    of what Kelly recommends).
        capped_fraction = min(kelly_result.applied_fraction, self.config.max_allocation_pct)
        size_usd = total_capital_usd * capped_fraction

        if size_usd < self.config.min_order_notional_usd:
            return RiskDecision(approved=False, reason=f"sized order ${size_usd:.2f} below minimum notional")

        if kelly_result.side == "buy":
            limit_price = book.best_ask.price
        else:
            limit_price = 1.0 - book.best_bid.price

        if limit_price <= 0.0:
            return RiskDecision(approved=False, reason="invalid limit price computed")

        contracts = size_usd / limit_price

        return RiskDecision(
            approved=True,
            reason="approved",
            side=kelly_result.side,
            size_usd=size_usd,
            contracts=contracts,
            limit_price=limit_price,
        )

    def evaluate_arbitrage(
        self,
        opportunity: ArbitrageOpportunity,
        total_capital_usd: float,
        open_position_count: int,
        daily_pnl_usd: float,
    ) -> ArbitrageDecision:
        """Sizes a two-leg arbitrage trade under the same hard safety
        ceilings used for directional trades: the daily-loss circuit
        breaker, the portfolio position cap, and the 5% max-allocation cap
        (applied here to the *combined* notional of both legs, since the
        capital is deployed simultaneously across both venues)."""

        if total_capital_usd > 0 and (-daily_pnl_usd / total_capital_usd) >= self.config.max_daily_loss_pct:
            return ArbitrageDecision(approved=False, reason="daily loss circuit breaker triggered")

        if open_position_count >= self.config.max_open_positions:
            return ArbitrageDecision(approved=False, reason="max open positions reached")

        if opportunity.edge_pct < self.config.min_arbitrage_edge_pct:
            return ArbitrageDecision(
                approved=False,
                reason=f"edge {opportunity.edge_pct:.4f} below floor {self.config.min_arbitrage_edge_pct:.4f}",
            )

        combined_cost_per_contract = opportunity.leg_a.cost_per_contract + opportunity.leg_b.cost_per_contract
        if combined_cost_per_contract <= 0:
            return ArbitrageDecision(approved=False, reason="invalid combined leg cost")

        max_notional = total_capital_usd * self.config.max_allocation_pct
        max_contracts_by_capital = max_notional / combined_cost_per_contract

        contracts = min(opportunity.max_contracts, max_contracts_by_capital)
        notional_usd = contracts * combined_cost_per_contract

        if contracts <= 0 or notional_usd < self.config.min_order_notional_usd:
            return ArbitrageDecision(approved=False, reason=f"sized notional ${notional_usd:.2f} below minimum")

        expected_profit_usd = contracts * opportunity.edge_pct

        return ArbitrageDecision(
            approved=True,
            reason="approved",
            contracts=contracts,
            notional_usd=notional_usd,
            expected_profit_usd=expected_profit_usd,
        )
