"""
Market client layer for the VyRobot Prediction Engine.

Contains:
    * Shared data models (OrderBook, Order, Position, Balance)
    * A thread-safe in-memory StateManager (no external DB dependency)
    * BaseMarketClient: the abstract contract every venue must implement
    * PolymarketClient: Polygon / Web3.py / CLOB REST+WS implementation
    * KalshiClient: Kalshi native V2 REST+WS implementation
"""
from __future__ import annotations

import abc
import asyncio
import base64
import hashlib
import hmac
import json
import logging
import secrets
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

import aiohttp
import websockets
from websockets.exceptions import ConnectionClosed, InvalidStatusCode, WebSocketException

from config import KalshiConfig, PolymarketConfig

logger = logging.getLogger("vyrobot.market_client")


# --------------------------------------------------------------------------- #
# Exceptions
# --------------------------------------------------------------------------- #

class MarketClientError(Exception):
    """Base class for all market-client failures."""


class RateLimitError(MarketClientError):
    """Raised on HTTP 429; carries the suggested retry-after (seconds)."""

    def __init__(self, message: str, retry_after: float = 1.0):
        super().__init__(message)
        self.retry_after = retry_after


class NonceCollisionError(MarketClientError):
    """Raised when an on-chain transaction nonce has already been consumed."""


class OrderRejectedError(MarketClientError):
    """Raised when the venue rejects an order (bad price, insufficient funds, etc)."""


class AuthenticationError(MarketClientError):
    """Raised on 401/403 responses or signature failures."""


# --------------------------------------------------------------------------- #
# Data models
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class OrderBookLevel:
    price: float
    size: float


@dataclass(frozen=True)
class OrderBook:
    market_id: str
    bids: Tuple[OrderBookLevel, ...]   # sorted descending by price
    asks: Tuple[OrderBookLevel, ...]   # sorted ascending by price
    timestamp: float

    @property
    def best_bid(self) -> Optional[OrderBookLevel]:
        return self.bids[0] if self.bids else None

    @property
    def best_ask(self) -> Optional[OrderBookLevel]:
        return self.asks[0] if self.asks else None

    @property
    def mid_price(self) -> Optional[float]:
        bid, ask = self.best_bid, self.best_ask
        if bid is None or ask is None:
            return None
        return (bid.price + ask.price) / 2.0

    @property
    def spread_pct(self) -> Optional[float]:
        bid, ask = self.best_bid, self.best_ask
        if bid is None or ask is None or bid.price <= 0 or ask.price <= 0:
            return None
        mid = (bid.price + ask.price) / 2.0
        if mid <= 0:
            return None
        return (ask.price - bid.price) / mid


@dataclass
class Order:
    order_id: str
    venue: str
    market_id: str
    side: str               # "buy" or "sell"
    price: float
    size: float
    order_type: str         # "limit"
    time_in_force: str      # "GTC" or "IOC"
    status: str = "submitted"   # submitted -> open -> partially_filled -> filled/cancelled/rejected
    filled_size: float = 0.0
    avg_fill_price: float = 0.0
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    client_order_id: str = field(default_factory=lambda: uuid.uuid4().hex)


@dataclass
class Position:
    market_id: str
    venue: str
    side: str            # "yes"/"long" or "no"/"short"
    size: float
    avg_entry_price: float
    updated_at: float = field(default_factory=time.time)


@dataclass
class Balance:
    asset: str
    total: float
    available: float
    updated_at: float = field(default_factory=time.time)


# --------------------------------------------------------------------------- #
# Thread-safe in-memory state manager
# --------------------------------------------------------------------------- #

class StateManager:
    """A lightweight, thread-safe, in-memory store for everything the engine
    needs to track: order books, open/closed orders, positions, balances.

    Termux background execution does not justify running a full database
    server; this store is a plain dict guarded by an ``RLock`` so it is safe
    to touch both from asyncio callbacks and from any executor threads used
    for blocking calls (e.g. web3.py RPC calls, feedparser parsing).
    """

    def __init__(self, snapshot_path: Optional[str] = None) -> None:
        self._lock = threading.RLock()
        self._orderbooks: Dict[str, OrderBook] = {}
        self._orders: Dict[str, Order] = {}
        self._positions: Dict[str, Position] = {}
        self._balances: Dict[str, Balance] = {}
        self._daily_pnl_usd: float = 0.0
        self._snapshot_path = Path(snapshot_path) if snapshot_path else None

    # -- order books ------------------------------------------------------- #
    def update_orderbook(self, book: OrderBook) -> None:
        with self._lock:
            self._orderbooks[book.market_id] = book

    def get_orderbook(self, market_id: str) -> Optional[OrderBook]:
        with self._lock:
            return self._orderbooks.get(market_id)

    # -- orders -------------------------------------------------------------#
    def upsert_order(self, order: Order) -> None:
        with self._lock:
            order.updated_at = time.time()
            self._orders[order.order_id] = order

    def get_order(self, order_id: str) -> Optional[Order]:
        with self._lock:
            return self._orders.get(order_id)

    def get_open_orders(self, venue: Optional[str] = None) -> List[Order]:
        with self._lock:
            orders = [o for o in self._orders.values() if o.status in ("submitted", "open", "partially_filled")]
            if venue:
                orders = [o for o in orders if o.venue == venue]
            return orders

    # -- positions ----------------------------------------------------------#
    def upsert_position(self, position: Position) -> None:
        with self._lock:
            position.updated_at = time.time()
            self._positions[f"{position.venue}:{position.market_id}"] = position

    def get_position(self, venue: str, market_id: str) -> Optional[Position]:
        with self._lock:
            return self._positions.get(f"{venue}:{market_id}")

    def all_positions(self) -> List[Position]:
        with self._lock:
            return list(self._positions.values())

    # -- balances -------------------------------------------------------- #
    def set_balance(self, venue: str, balance: Balance) -> None:
        with self._lock:
            self._balances[f"{venue}:{balance.asset}"] = balance

    def get_balance(self, venue: str, asset: str) -> Optional[Balance]:
        with self._lock:
            return self._balances.get(f"{venue}:{asset}")

    def total_capital_usd(self) -> float:
        with self._lock:
            return sum(b.total for b in self._balances.values())

    # -- daily PnL circuit breaker ------------------------------------------#
    def record_pnl(self, delta_usd: float) -> float:
        with self._lock:
            self._daily_pnl_usd += delta_usd
            return self._daily_pnl_usd

    def reset_daily_pnl(self) -> None:
        with self._lock:
            self._daily_pnl_usd = 0.0

    def get_daily_pnl(self) -> float:
        with self._lock:
            return self._daily_pnl_usd

    # -- persistence (best-effort crash resilience, not a source of truth) -#
    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "orders": {k: vars(v) for k, v in self._orders.items()},
                "positions": {k: vars(v) for k, v in self._positions.items()},
                "balances": {k: vars(v) for k, v in self._balances.items()},
                "daily_pnl_usd": self._daily_pnl_usd,
                "saved_at": time.time(),
            }

    def dump_to_disk(self) -> None:
        if self._snapshot_path is None:
            return
        data = self.snapshot()
        try:
            fd, tmp_name = tempfile.mkstemp(
                dir=str(self._snapshot_path.parent), prefix=".vyrobot_state_", suffix=".tmp"
            )
            with open(fd, "w", encoding="utf-8") as fh:
                json.dump(data, fh, default=str)
            Path(tmp_name).replace(self._snapshot_path)
        except OSError as exc:
            logger.warning("Failed to persist state snapshot: %s", exc)

    def load_from_disk(self) -> None:
        if self._snapshot_path is None or not self._snapshot_path.exists():
            return
        try:
            raw = json.loads(self._snapshot_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Failed to load state snapshot: %s", exc)
            return
        with self._lock:
            self._daily_pnl_usd = float(raw.get("daily_pnl_usd", 0.0))
            for key, pdata in raw.get("positions", {}).items():
                self._positions[key] = Position(**pdata)
            for key, bdata in raw.get("balances", {}).items():
                self._balances[key] = Balance(**bdata)
        logger.info("Restored in-memory state from snapshot at %s", self._snapshot_path)


# --------------------------------------------------------------------------- #
# Base client contract
# --------------------------------------------------------------------------- #

class BaseMarketClient(abc.ABC):
    """Abstract contract every venue-specific client must satisfy."""

    venue: str = "base"

    def __init__(self, state: StateManager) -> None:
        self.state = state

    @abc.abstractmethod
    async def connect(self) -> None:
        """Open HTTP session(s) and any required websocket connections."""

    @abc.abstractmethod
    async def disconnect(self) -> None:
        """Tear down all network resources cleanly."""

    @abc.abstractmethod
    async def stream_orderbook(self, market_ids: List[str]) -> None:
        """Long-running task: keep ``self.state`` updated with live order
        books for the given market ids, with automatic reconnect on
        disconnect. Returns only when cancelled."""

    @abc.abstractmethod
    async def get_orderbook(self, market_id: str) -> OrderBook:
        """One-shot REST fetch of the current order book (used as a
        fallback / bootstrap before the websocket stream catches up)."""

    @abc.abstractmethod
    async def get_balances(self) -> Dict[str, Balance]:
        """Fetch and return current balances, keyed by asset symbol."""

    @abc.abstractmethod
    async def get_positions(self) -> Dict[str, Position]:
        """Fetch and return current open positions, keyed by market id."""

    @abc.abstractmethod
    async def place_limit_order(
        self, market_id: str, side: str, price: float, size: float, time_in_force: str = "GTC"
    ) -> Order:
        """Submit a limit order. ``time_in_force`` is one of GTC/IOC."""

    @abc.abstractmethod
    async def cancel_order(self, order_id: str) -> bool:
        """Cancel a resting order. Returns True if the venue confirmed
        cancellation (or the order was already terminal)."""


# --------------------------------------------------------------------------- #
# Shared async HTTP helper with 429 / network resilience
# --------------------------------------------------------------------------- #

async def _request_with_resilience(
    session: aiohttp.ClientSession,
    method: str,
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    json_body: Optional[Dict[str, Any]] = None,
    params: Optional[Dict[str, Any]] = None,
    timeout_seconds: float = 15.0,
    max_retries: int = 4,
) -> Dict[str, Any]:
    """Issues an HTTP request with exponential-backoff retry on 429 / 5xx /
    network errors. Raises typed exceptions on unrecoverable failures."""

    last_exc: Optional[Exception] = None
    for attempt in range(max_retries + 1):
        try:
            timeout = aiohttp.ClientTimeout(total=timeout_seconds)
            async with session.request(
                method, url, headers=headers, json=json_body, params=params, timeout=timeout
            ) as resp:
                if resp.status == 429:
                    retry_after = float(resp.headers.get("Retry-After", 2 ** attempt))
                    logger.warning("429 rate-limited on %s %s; retrying in %.1fs", method, url, retry_after)
                    if attempt == max_retries:
                        raise RateLimitError(f"Rate limited after {max_retries} retries: {url}", retry_after)
                    await asyncio.sleep(retry_after)
                    continue

                if resp.status in (401, 403):
                    body = await resp.text()
                    raise AuthenticationError(f"Auth failure {resp.status} on {url}: {body[:300]}")

                if resp.status >= 500:
                    body = await resp.text()
                    last_exc = MarketClientError(f"Server error {resp.status} on {url}: {body[:300]}")
                    if attempt == max_retries:
                        raise last_exc
                    backoff = min(2 ** attempt, 30) + secrets.randbelow(1000) / 1000.0
                    logger.warning("%s; retrying in %.1fs (attempt %d/%d)", last_exc, backoff, attempt + 1, max_retries)
                    await asyncio.sleep(backoff)
                    continue

                if resp.status >= 400:
                    body = await resp.text()
                    raise OrderRejectedError(f"Request rejected {resp.status} on {url}: {body[:500]}")

                text = await resp.text()
                if not text:
                    return {}
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    return {"raw": text}

        except (aiohttp.ClientConnectionError, aiohttp.ServerDisconnectedError, asyncio.TimeoutError) as exc:
            last_exc = exc
            if attempt == max_retries:
                raise MarketClientError(f"Network failure calling {url}: {exc}") from exc
            backoff = min(2 ** attempt, 30) + secrets.randbelow(1000) / 1000.0
            logger.warning("Network error on %s (%s); retrying in %.1fs", url, exc, backoff)
            await asyncio.sleep(backoff)

    raise MarketClientError(f"Exhausted retries calling {url}: {last_exc}")


async def _reconnecting_websocket_loop(
    name: str,
    url: str,
    on_connect: Callable[[Any], Awaitable[None]],
    on_message: Callable[[str], Awaitable[None]],
    should_stop: Callable[[], bool],
    extra_headers: Optional[Dict[str, str]] = None,
    ping_interval: float = 20.0,
    max_backoff: float = 60.0,
) -> None:
    """Generic reconnect-forever websocket consumer.

    Handles disconnects, malformed frames, and slow networks transparently
    with exponential backoff, and re-runs ``on_connect`` (typically a
    subscribe message) after every successful reconnect.
    """
    backoff = 1.0
    while not should_stop():
        try:
            connect_kwargs: Dict[str, Any] = {"ping_interval": ping_interval, "ping_timeout": ping_interval}
            if extra_headers:
                connect_kwargs["extra_headers"] = extra_headers
            async with websockets.connect(url, **connect_kwargs) as ws:
                logger.info("[%s] websocket connected: %s", name, url)
                backoff = 1.0
                await on_connect(ws)
                async for raw_message in ws:
                    try:
                        await on_message(raw_message)
                    except json.JSONDecodeError as exc:
                        logger.warning("[%s] malformed websocket frame ignored: %s", name, exc)
                    except Exception:
                        logger.exception("[%s] error handling websocket message", name)
        except asyncio.CancelledError:
            raise
        except (ConnectionClosed, InvalidStatusCode, WebSocketException, OSError, asyncio.TimeoutError) as exc:
            if should_stop():
                break
            logger.warning("[%s] websocket disconnected (%s); reconnecting in %.1fs", name, exc, backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, max_backoff)
        except Exception:
            if should_stop():
                break
            logger.exception("[%s] unexpected websocket failure; reconnecting in %.1fs", name, backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, max_backoff)
    logger.info("[%s] websocket loop stopped", name)


# --------------------------------------------------------------------------- #
# Polymarket client
# --------------------------------------------------------------------------- #

_ERC20_BALANCE_ABI = [
    {
        "constant": True,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "type": "function",
    },
    {
        "constant": True,
        "inputs": [
            {"name": "_owner", "type": "address"},
            {"name": "_spender", "type": "address"},
        ],
        "name": "allowance",
        "outputs": [{"name": "remaining", "type": "uint256"}],
        "type": "function",
    },
    {"constant": True, "inputs": [], "name": "decimals", "outputs": [{"name": "", "type": "uint8"}], "type": "function"},
]

_POLYMARKET_ORDER_EIP712_TYPES = {
    "EIP712Domain": [
        {"name": "name", "type": "string"},
        {"name": "version", "type": "string"},
        {"name": "chainId", "type": "uint256"},
        {"name": "verifyingContract", "type": "address"},
    ],
    "Order": [
        {"name": "salt", "type": "uint256"},
        {"name": "maker", "type": "address"},
        {"name": "signer", "type": "address"},
        {"name": "taker", "type": "address"},
        {"name": "tokenId", "type": "uint256"},
        {"name": "makerAmount", "type": "uint256"},
        {"name": "takerAmount", "type": "uint256"},
        {"name": "expiration", "type": "uint256"},
        {"name": "nonce", "type": "uint256"},
        {"name": "feeRateBps", "type": "uint256"},
        {"name": "side", "type": "uint8"},
        {"name": "signatureType", "type": "uint8"},
    ],
}


class PolymarketClient(BaseMarketClient):
    """Polymarket CLOB client.

    * REST (aiohttp) against the CLOB HTTP API for order-book snapshots,
      order submission, and cancellation.
    * WebSocket against the CLOB market channel for live order-book deltas.
    * Web3.py against a Polygon RPC endpoint for on-chain USDC balance /
      allowance checks (execution itself happens off-chain via the CLOB;
      Polymarket settles on-chain through the CTF Exchange contract).
    """

    venue = "polymarket"

    def __init__(self, config: PolymarketConfig, state: StateManager) -> None:
        super().__init__(state)
        self.config = config
        self._session: Optional[aiohttp.ClientSession] = None
        self._ws_tasks: List[asyncio.Task] = []
        self._stopping = False
        self._nonce_lock = asyncio.Lock()

        self._w3 = None
        self._account = None
        if config.private_key:
            # Imported lazily so the module still loads if web3 isn't needed
            # (e.g. Kalshi-only deployments) and to keep import errors local.
            from web3 import Web3
            from eth_account import Account

            self._w3 = Web3(Web3.HTTPProvider(config.polygon_rpc_url, request_kwargs={"timeout": 15}))
            self._account = Account.from_key(config.private_key)
            self._Account = Account

    # -- lifecycle ----------------------------------------------------------#
    async def connect(self) -> None:
        self._session = aiohttp.ClientSession()
        self._stopping = False
        logger.info("Polymarket client connected (REST base=%s)", self.config.clob_rest_url)

    async def disconnect(self) -> None:
        self._stopping = True
        for task in self._ws_tasks:
            task.cancel()
        for task in self._ws_tasks:
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        self._ws_tasks.clear()
        if self._session:
            await self._session.close()
            self._session = None
        logger.info("Polymarket client disconnected")

    # -- auth headers for private CLOB endpoints (L2 HMAC auth) -------------#
    def _l2_auth_headers(self, method: str, request_path: str, body: str = "") -> Dict[str, str]:
        if not (self.config.api_key and self.config.api_secret and self.config.api_passphrase and self._account):
            raise AuthenticationError("Polymarket API credentials are not fully configured")

        timestamp = str(int(time.time()))
        message = f"{timestamp}{method.upper()}{request_path}{body}"
        secret_bytes = base64.urlsafe_b64decode(self.config.api_secret)
        signature = hmac.new(secret_bytes, message.encode("utf-8"), hashlib.sha256).digest()
        signature_b64 = base64.urlsafe_b64encode(signature).decode("utf-8")

        return {
            "POLY-ADDRESS": self._account.address,
            "POLY-SIGNATURE": signature_b64,
            "POLY-TIMESTAMP": timestamp,
            "POLY-API-KEY": self.config.api_key,
            "POLY-PASSPHRASE": self.config.api_passphrase,
            "Content-Type": "application/json",
        }

    # -- order book ------------------------------------------------------ #
    @staticmethod
    def _parse_book_levels(raw_levels: List[Dict[str, Any]]) -> Tuple[OrderBookLevel, ...]:
        levels = [OrderBookLevel(price=float(lv["price"]), size=float(lv["size"])) for lv in raw_levels]
        return tuple(levels)

    async def get_orderbook(self, market_id: str) -> OrderBook:
        assert self._session is not None, "call connect() first"
        url = f"{self.config.clob_rest_url}/book"
        data = await _request_with_resilience(
            self._session, "GET", url, params={"token_id": market_id},
            timeout_seconds=self.config.request_timeout_seconds,
        )
        bids = sorted(self._parse_book_levels(data.get("bids", [])), key=lambda lv: lv.price, reverse=True)
        asks = sorted(self._parse_book_levels(data.get("asks", [])), key=lambda lv: lv.price)
        book = OrderBook(market_id=market_id, bids=tuple(bids), asks=tuple(asks), timestamp=time.time())
        self.state.update_orderbook(book)
        return book

    async def stream_orderbook(self, market_ids: List[str]) -> None:
        if not market_ids:
            logger.warning("Polymarket stream_orderbook called with no market ids; skipping")
            return

        async def on_connect(ws) -> None:
            subscribe_msg = {"type": "market", "assets_ids": market_ids}
            await ws.send(json.dumps(subscribe_msg))

        async def on_message(raw: str) -> None:
            payload = json.loads(raw)
            events = payload if isinstance(payload, list) else [payload]
            for event in events:
                asset_id = event.get("asset_id") or event.get("market")
                if not asset_id:
                    continue
                event_type = event.get("event_type", "book")
                if event_type == "book":
                    bids = sorted(self._parse_book_levels(event.get("bids", [])), key=lambda lv: lv.price, reverse=True)
                    asks = sorted(self._parse_book_levels(event.get("asks", [])), key=lambda lv: lv.price)
                    book = OrderBook(market_id=asset_id, bids=tuple(bids), asks=tuple(asks), timestamp=time.time())
                    self.state.update_orderbook(book)
                elif event_type == "price_change":
                    existing = self.state.get_orderbook(asset_id)
                    if existing is None:
                        continue
                    bids, asks = list(existing.bids), list(existing.asks)
                    for change in event.get("changes", []):
                        side = change.get("side")
                        price = float(change.get("price", 0.0))
                        size = float(change.get("size", 0.0))
                        target = bids if side == "BUY" else asks
                        target[:] = [lv for lv in target if lv.price != price]
                        if size > 0:
                            target.append(OrderBookLevel(price=price, size=size))
                    bids.sort(key=lambda lv: lv.price, reverse=True)
                    asks.sort(key=lambda lv: lv.price)
                    self.state.update_orderbook(
                        OrderBook(market_id=asset_id, bids=tuple(bids), asks=tuple(asks), timestamp=time.time())
                    )

        await _reconnecting_websocket_loop(
            name="polymarket",
            url=self.config.clob_ws_url,
            on_connect=on_connect,
            on_message=on_message,
            should_stop=lambda: self._stopping,
        )

    # -- balances / positions ---------------------------------------------- #
    async def get_balances(self) -> Dict[str, Balance]:
        if self._w3 is None or self._account is None:
            logger.warning("Polymarket wallet not configured; returning empty balances")
            return {}

        loop = asyncio.get_running_loop()

        def _read_balance() -> Tuple[float, int]:
            contract = self._w3.eth.contract(
                address=self._w3.to_checksum_address(self.config.usdc_contract_address),
                abi=_ERC20_BALANCE_ABI,
            )
            decimals = contract.functions.decimals().call()
            raw_balance = contract.functions.balanceOf(self._account.address).call()
            return raw_balance / (10 ** decimals), decimals

        raw_balance, _decimals = await loop.run_in_executor(None, _read_balance)
        balance = Balance(asset="USDC", total=raw_balance, available=raw_balance)
        self.state.set_balance(self.venue, balance)
        return {"USDC": balance}

    async def get_positions(self) -> Dict[str, Position]:
        assert self._session is not None, "call connect() first"
        if not self.config.api_key:
            logger.warning("Polymarket API key not configured; cannot fetch positions")
            return {}
        request_path = "/positions"
        url = f"{self.config.clob_rest_url}{request_path}"
        headers = self._l2_auth_headers("GET", request_path)
        data = await _request_with_resilience(
            self._session, "GET", url, headers=headers, timeout_seconds=self.config.request_timeout_seconds
        )
        positions: Dict[str, Position] = {}
        for item in data.get("positions", []) if isinstance(data, dict) else []:
            market_id = str(item.get("asset_id") or item.get("token_id"))
            pos = Position(
                market_id=market_id,
                venue=self.venue,
                side="yes" if float(item.get("size", 0.0)) >= 0 else "no",
                size=abs(float(item.get("size", 0.0))),
                avg_entry_price=float(item.get("avg_price", 0.0)),
            )
            positions[market_id] = pos
            self.state.upsert_position(pos)
        return positions

    # -- order signing & submission ------------------------------------ #
    def _sign_order(
        self, token_id: str, side: str, price: float, size: float, expiration: int
    ) -> Dict[str, Any]:
        """Builds and EIP-712 signs a Polymarket CLOB order.

        For a BUY: makerAmount = USDC paid (price * size), takerAmount = shares bought (size).
        For a SELL: makerAmount = shares sold (size), takerAmount = USDC received (price * size).
        Amounts are expressed in the token's base units (6 decimals for USDC,
        6 decimals for Polymarket conditional token shares).
        """
        if self._account is None:
            raise AuthenticationError("Polymarket wallet private key not configured")

        usdc_units = int(round(price * size * 1_000_000))
        share_units = int(round(size * 1_000_000))
        side_code = 0 if side == "buy" else 1  # 0 = BUY, 1 = SELL per CLOB convention
        maker_amount, taker_amount = (usdc_units, share_units) if side == "buy" else (share_units, usdc_units)

        order_struct = {
            "salt": secrets.randbits(64),
            "maker": self._account.address,
            "signer": self._account.address,
            "taker": "0x0000000000000000000000000000000000000000",
            "tokenId": int(token_id),
            "makerAmount": maker_amount,
            "takerAmount": taker_amount,
            "expiration": expiration,
            "nonce": secrets.randbits(32),
            "feeRateBps": 0,
            "side": side_code,
            "signatureType": 0,
        }

        typed_data = {
            "types": _POLYMARKET_ORDER_EIP712_TYPES,
            "domain": {
                "name": "Polymarket CTF Exchange",
                "version": "1",
                "chainId": self.config.chain_id,
                "verifyingContract": self.config.ctf_exchange_address,
            },
            "primaryType": "Order",
            "message": order_struct,
        }

        signed = self._Account.sign_typed_data(
            self.config.private_key, full_message=typed_data
        )
        order_struct["signature"] = signed.signature.hex()
        return order_struct

    async def place_limit_order(
        self, market_id: str, side: str, price: float, size: float, time_in_force: str = "GTC"
    ) -> Order:
        assert self._session is not None, "call connect() first"
        if side not in ("buy", "sell"):
            raise ValueError(f"Invalid side: {side}")
        if not (0.0 < price < 1.0):
            raise ValueError(f"Polymarket prices must be in (0, 1); got {price}")

        expiration = 0 if time_in_force == "GTC" else int(time.time()) + 30
        order_type = "GTC" if time_in_force == "GTC" else "FOK"

        async with self._nonce_lock:
            try:
                signed_order = self._sign_order(market_id, side, price, size, expiration)
            except Exception as exc:  # signature/library failure is unrecoverable for this order
                raise OrderRejectedError(f"Failed to sign Polymarket order: {exc}") from exc

        body = {"order": signed_order, "owner": self.config.api_key, "orderType": order_type}
        body_json = json.dumps(body, separators=(",", ":"))
        request_path = "/order"
        url = f"{self.config.clob_rest_url}{request_path}"

        try:
            headers = self._l2_auth_headers("POST", request_path, body_json)
        except AuthenticationError:
            raise

        try:
            data = await _request_with_resilience(
                self._session, "POST", url, headers=headers, json_body=body,
                timeout_seconds=self.config.request_timeout_seconds,
            )
        except OrderRejectedError:
            order = Order(
                order_id=uuid.uuid4().hex, venue=self.venue, market_id=market_id, side=side,
                price=price, size=size, order_type="limit", time_in_force=time_in_force, status="rejected",
            )
            self.state.upsert_order(order)
            raise

        order_id = str(data.get("orderID") or data.get("order_id") or uuid.uuid4().hex)
        status = str(data.get("status", "open"))
        order = Order(
            order_id=order_id, venue=self.venue, market_id=market_id, side=side,
            price=price, size=size, order_type="limit", time_in_force=time_in_force, status=status,
        )
        self.state.upsert_order(order)
        logger.info("Polymarket order placed: %s %s %.4f @ %.4f (id=%s)", side, market_id, size, price, order_id)
        return order

    async def cancel_order(self, order_id: str) -> bool:
        assert self._session is not None, "call connect() first"
        request_path = "/order"
        url = f"{self.config.clob_rest_url}{request_path}"
        body = {"orderID": order_id}
        body_json = json.dumps(body, separators=(",", ":"))
        headers = self._l2_auth_headers("DELETE", request_path, body_json)
        try:
            await _request_with_resilience(
                self._session, "DELETE", url, headers=headers, json_body=body,
                timeout_seconds=self.config.request_timeout_seconds,
            )
        except OrderRejectedError as exc:
            logger.warning("Polymarket cancel for %s rejected (likely already filled/cancelled): %s", order_id, exc)
            return False
        order = self.state.get_order(order_id)
        if order:
            order.status = "cancelled"
            self.state.upsert_order(order)
        return True


# --------------------------------------------------------------------------- #
# Kalshi client
# --------------------------------------------------------------------------- #

class KalshiClient(BaseMarketClient):
    """Kalshi native V2 REST + WebSocket client.

    Auth uses Kalshi's RSA-PSS request signing scheme: every private request
    carries ``KALSHI-ACCESS-KEY``, ``KALSHI-ACCESS-TIMESTAMP`` and
    ``KALSHI-ACCESS-SIGNATURE`` headers, where the signature is an RSA-PSS
    (SHA256, MGF1) signature over ``f"{timestamp}{method}{path}"`` made with
    the account's private key.
    """

    venue = "kalshi"

    def __init__(self, config: KalshiConfig, state: StateManager) -> None:
        super().__init__(state)
        self.config = config
        self._session: Optional[aiohttp.ClientSession] = None
        self._stopping = False
        self._private_key = None

        if config.private_key_pem_path:
            from cryptography.hazmat.primitives import serialization

            pem_bytes = Path(config.private_key_pem_path).read_bytes()
            self._private_key = serialization.load_pem_private_key(pem_bytes, password=None)

    async def connect(self) -> None:
        self._session = aiohttp.ClientSession()
        self._stopping = False
        logger.info("Kalshi client connected (REST base=%s)", self.config.rest_url)

    async def disconnect(self) -> None:
        self._stopping = True
        if self._session:
            await self._session.close()
            self._session = None
        logger.info("Kalshi client disconnected")

    def _sign(self, method: str, path: str) -> Dict[str, str]:
        if not (self.config.api_key_id and self._private_key):
            raise AuthenticationError("Kalshi API credentials are not fully configured")

        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding

        timestamp_ms = str(int(time.time() * 1000))
        message = f"{timestamp_ms}{method.upper()}{path}".encode("utf-8")
        signature = self._private_key.sign(
            message,
            padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.DIGEST_LENGTH),
            hashes.SHA256(),
        )
        return {
            "KALSHI-ACCESS-KEY": self.config.api_key_id,
            "KALSHI-ACCESS-TIMESTAMP": timestamp_ms,
            "KALSHI-ACCESS-SIGNATURE": base64.b64encode(signature).decode("utf-8"),
            "Content-Type": "application/json",
        }

    # -- order book ---------------------------------------------------------#
    async def get_orderbook(self, market_id: str) -> OrderBook:
        assert self._session is not None, "call connect() first"
        path = f"/markets/{market_id}/orderbook"
        url = f"{self.config.rest_url}{path}"
        data = await _request_with_resilience(
            self._session, "GET", url, timeout_seconds=self.config.request_timeout_seconds
        )
        book_raw = data.get("orderbook", {})
        # Kalshi quotes YES/NO in integer cents (1-99); normalize to [0, 1].
        yes_levels = book_raw.get("yes", []) or []
        no_levels = book_raw.get("no", []) or []
        bids = sorted(
            (OrderBookLevel(price=level[0] / 100.0, size=float(level[1])) for level in yes_levels),
            key=lambda lv: lv.price, reverse=True,
        )
        # NO bids translate to YES asks: ask_price = 1 - no_bid_price.
        asks = sorted(
            (OrderBookLevel(price=1.0 - level[0] / 100.0, size=float(level[1])) for level in no_levels),
            key=lambda lv: lv.price,
        )
        book = OrderBook(market_id=market_id, bids=tuple(bids), asks=tuple(asks), timestamp=time.time())
        self.state.update_orderbook(book)
        return book

    async def stream_orderbook(self, market_ids: List[str]) -> None:
        if not market_ids:
            logger.warning("Kalshi stream_orderbook called with no tickers; skipping")
            return

        local_books: Dict[str, Dict[str, Dict[int, float]]] = {
            m: {"yes": {}, "no": {}} for m in market_ids
        }

        def _rebuild_and_store(ticker: str) -> None:
            yes_side = local_books[ticker]["yes"]
            no_side = local_books[ticker]["no"]
            bids = sorted(
                (OrderBookLevel(price=p / 100.0, size=s) for p, s in yes_side.items() if s > 0),
                key=lambda lv: lv.price, reverse=True,
            )
            asks = sorted(
                (OrderBookLevel(price=1.0 - p / 100.0, size=s) for p, s in no_side.items() if s > 0),
                key=lambda lv: lv.price,
            )
            self.state.update_orderbook(
                OrderBook(market_id=ticker, bids=tuple(bids), asks=tuple(asks), timestamp=time.time())
            )

        async def on_connect(ws) -> None:
            subscribe_msg = {
                "id": 1,
                "cmd": "subscribe",
                "params": {"channels": ["orderbook_delta"], "market_tickers": market_ids},
            }
            await ws.send(json.dumps(subscribe_msg))

        async def on_message(raw: str) -> None:
            payload = json.loads(raw)
            msg_type = payload.get("type")
            msg = payload.get("msg", {})
            ticker = msg.get("market_ticker")
            if ticker not in local_books:
                return
            if msg_type == "orderbook_snapshot":
                local_books[ticker]["yes"] = {int(p): float(s) for p, s in msg.get("yes", [])}
                local_books[ticker]["no"] = {int(p): float(s) for p, s in msg.get("no", [])}
                _rebuild_and_store(ticker)
            elif msg_type == "orderbook_delta":
                side_key = "yes" if msg.get("side") == "yes" else "no"
                price = int(msg.get("price"))
                delta = float(msg.get("delta", 0))
                current = local_books[ticker][side_key].get(price, 0.0)
                new_size = max(current + delta, 0.0)
                if new_size <= 0:
                    local_books[ticker][side_key].pop(price, None)
                else:
                    local_books[ticker][side_key][price] = new_size
                _rebuild_and_store(ticker)

        auth_headers = None
        try:
            auth_headers = self._sign("GET", "/trade-api/ws/v2")
        except AuthenticationError:
            logger.warning("Kalshi websocket connecting unauthenticated (public data only)")

        await _reconnecting_websocket_loop(
            name="kalshi",
            url=self.config.ws_url,
            on_connect=on_connect,
            on_message=on_message,
            should_stop=lambda: self._stopping,
            extra_headers=auth_headers,
        )

    # -- balances / positions ---------------------------------------------- #
    async def get_balances(self) -> Dict[str, Balance]:
        assert self._session is not None, "call connect() first"
        path = "/portfolio/balance"
        url = f"{self.config.rest_url}{path}"
        headers = self._sign("GET", path)
        data = await _request_with_resilience(
            self._session, "GET", url, headers=headers, timeout_seconds=self.config.request_timeout_seconds
        )
        usd_cents = float(data.get("balance", 0))
        usd = usd_cents / 100.0
        balance_usd = Balance(asset="USD", total=usd, available=usd)
        balance_usdt_equiv = Balance(
            asset="USDT_EQUIV", total=usd * self.config.usd_to_usdt_rate, available=usd * self.config.usd_to_usdt_rate
        )
        self.state.set_balance(self.venue, balance_usd)
        self.state.set_balance(self.venue, balance_usdt_equiv)
        return {"USD": balance_usd, "USDT_EQUIV": balance_usdt_equiv}

    async def get_positions(self) -> Dict[str, Position]:
        assert self._session is not None, "call connect() first"
        path = "/portfolio/positions"
        url = f"{self.config.rest_url}{path}"
        headers = self._sign("GET", path)
        data = await _request_with_resilience(
            self._session, "GET", url, headers=headers, timeout_seconds=self.config.request_timeout_seconds
        )
        positions: Dict[str, Position] = {}
        for item in data.get("market_positions", []):
            ticker = str(item.get("ticker"))
            contracts = float(item.get("position", 0))
            pos = Position(
                market_id=ticker,
                venue=self.venue,
                side="yes" if contracts >= 0 else "no",
                size=abs(contracts),
                avg_entry_price=float(item.get("market_exposure", 0)) / 100.0 if contracts else 0.0,
            )
            positions[ticker] = pos
            self.state.upsert_position(pos)
        return positions

    # -- orders ---------------------------------------------------------- #
    async def place_limit_order(
        self, market_id: str, side: str, price: float, size: float, time_in_force: str = "GTC"
    ) -> Order:
        assert self._session is not None, "call connect() first"
        if side not in ("buy", "sell"):
            raise ValueError(f"Invalid side: {side}")
        if not (0.0 < price < 1.0):
            raise ValueError(f"Kalshi prices must be in (0, 1); got {price}")

        path = "/portfolio/orders"
        url = f"{self.config.rest_url}{path}"
        client_order_id = uuid.uuid4().hex
        body = {
            "ticker": market_id,
            "client_order_id": client_order_id,
            "action": side,
            "side": "yes",
            "count": int(round(size)),
            "type": "limit",
            "yes_price": int(round(price * 100)),
            "time_in_force": "immediate_or_cancel" if time_in_force == "IOC" else "good_till_cancelled",
        }
        headers = self._sign("POST", path)

        try:
            data = await _request_with_resilience(
                self._session, "POST", url, headers=headers, json_body=body,
                timeout_seconds=self.config.request_timeout_seconds,
            )
        except OrderRejectedError:
            order = Order(
                order_id=client_order_id, venue=self.venue, market_id=market_id, side=side,
                price=price, size=size, order_type="limit", time_in_force=time_in_force, status="rejected",
            )
            self.state.upsert_order(order)
            raise

        order_payload = data.get("order", {})
        order_id = str(order_payload.get("order_id", client_order_id))
        status = str(order_payload.get("status", "resting"))
        filled = float(order_payload.get("taker_fill_count", 0) or 0)
        order = Order(
            order_id=order_id, venue=self.venue, market_id=market_id, side=side,
            price=price, size=size, order_type="limit", time_in_force=time_in_force,
            status="filled" if filled >= size else ("partially_filled" if filled > 0 else status),
            filled_size=filled, client_order_id=client_order_id,
        )
        self.state.upsert_order(order)
        logger.info("Kalshi order placed: %s %s %.0f @ %.2f (id=%s)", side, market_id, size, price, order_id)
        return order

    async def cancel_order(self, order_id: str) -> bool:
        assert self._session is not None, "call connect() first"
        path = f"/portfolio/orders/{order_id}"
        url = f"{self.config.rest_url}{path}"
        headers = self._sign("DELETE", path)
        try:
            await _request_with_resilience(
                self._session, "DELETE", url, headers=headers, timeout_seconds=self.config.request_timeout_seconds
            )
        except OrderRejectedError as exc:
            logger.warning("Kalshi cancel for %s rejected (likely already filled/cancelled): %s", order_id, exc)
            return False
        order = self.state.get_order(order_id)
        if order:
            order.status = "cancelled"
            self.state.upsert_order(order)
        return True
