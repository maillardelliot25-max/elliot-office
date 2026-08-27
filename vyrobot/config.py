"""
Core configuration, credential loading, and risk parameters for the
VyRobot Prediction Engine.

All secrets are read from environment variables (optionally via a local
``.env`` file loaded with python-dotenv). Nothing sensitive is hardcoded.
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Tuple

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - dotenv is optional at runtime
    load_dotenv = None

BASE_DIR = Path(__file__).resolve().parent
_ENV_PATH = BASE_DIR / ".env"

if load_dotenv is not None and _ENV_PATH.exists():
    load_dotenv(dotenv_path=_ENV_PATH)

logger = logging.getLogger("vyrobot.config")


# --------------------------------------------------------------------------- #
# Environment helpers
# --------------------------------------------------------------------------- #

def _env(name: str, default: Optional[str] = None, required: bool = False) -> Optional[str]:
    value = os.environ.get(name, default)
    if required and not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw in (None, ""):
        return default
    try:
        return float(raw)
    except ValueError:
        logger.warning("Invalid float for %s=%r, using default %.4f", name, raw, default)
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw in (None, ""):
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning("Invalid int for %s=%r, using default %d", name, raw, default)
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw in (None, ""):
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on", "y"}


def _env_tuple(name: str, default: Tuple[str, ...] = ()) -> Tuple[str, ...]:
    raw = os.environ.get(name)
    if raw in (None, ""):
        return default
    return tuple(part.strip() for part in raw.split(",") if part.strip())


# --------------------------------------------------------------------------- #
# Logging
# --------------------------------------------------------------------------- #

def configure_logging(log_level: str = "INFO", log_file: Optional[str] = "vyrobot.log") -> None:
    """Configure standard-library logging for the whole engine.

    Termux background processes lose stdout easily when the terminal app is
    swapped out by Android, so we always also log to a rotating-free flat
    file next to the package so a run can be audited after the fact.
    """
    handlers: list[logging.Handler] = [logging.StreamHandler()]
    if log_file:
        file_path = BASE_DIR / log_file
        handlers.append(logging.FileHandler(file_path, encoding="utf-8"))

    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)-8s | %(name)-24s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=handlers,
        force=True,
    )
    # Quiet down noisy third-party loggers.
    logging.getLogger("websockets").setLevel(logging.WARNING)
    logging.getLogger("aiohttp").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


# --------------------------------------------------------------------------- #
# Config dataclasses
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class RiskConfig:
    """Hard safety limits. These are intentionally conservative and are
    enforced in ``analytics.RiskManager`` before every single order."""

    max_allocation_pct: float = 0.05          # Max 5% of capital per contract/order.
    min_confidence: float = 0.75              # Minimum LLM confidence to trade.
    max_spread_pct: float = 0.05              # Abort if bid/ask spread > 5% of mid.
    kelly_fraction: float = 0.5               # Fractional Kelly multiplier (half-Kelly default).
    max_open_positions: int = 10              # Portfolio-wide concurrent position cap.
    min_order_notional_usd: float = 1.0       # Skip dust-sized orders.
    max_daily_loss_pct: float = 0.15          # Circuit breaker: halt trading for the day.
    max_slippage_pct: float = 0.02            # Max tolerated VWAP deviation from top-of-book when sizing into depth.
    min_arbitrage_edge_pct: float = 0.02      # Minimum guaranteed cross-venue profit (after fee buffer) to act on.
    arbitrage_fee_buffer_pct: float = 0.02    # Flat approximation of combined venue taker fees for arb math.


@dataclass(frozen=True)
class LLMConfig:
    provider: str                 # "anthropic" or "openai"
    api_key: str
    model: str
    api_url: str
    max_tokens: int = 300
    temperature: float = 0.0
    timeout_seconds: float = 20.0
    max_retries: int = 4


@dataclass(frozen=True)
class NewsConfig:
    poll_interval_seconds: float
    rss_feeds: Tuple[str, ...]
    gdelt_query: str
    gdelt_enabled: bool
    max_items_per_cycle: int
    request_timeout_seconds: float = 15.0


@dataclass(frozen=True)
class PolymarketConfig:
    enabled: bool
    clob_rest_url: str
    clob_ws_url: str
    polygon_rpc_url: str
    private_key: Optional[str]
    funder_address: Optional[str]
    api_key: Optional[str]
    api_secret: Optional[str]
    api_passphrase: Optional[str]
    usdc_contract_address: str
    ctf_exchange_address: str
    chain_id: int
    watched_condition_ids: Tuple[str, ...]
    request_timeout_seconds: float = 15.0


@dataclass(frozen=True)
class KalshiConfig:
    enabled: bool
    rest_url: str
    ws_url: str
    api_key_id: Optional[str]
    private_key_pem_path: Optional[str]
    watched_tickers: Tuple[str, ...]
    usd_to_usdt_rate: float = 1.0
    request_timeout_seconds: float = 15.0


@dataclass(frozen=True)
class WatchedMarket:
    """Maps a tradable market to the news keywords that make it relevant."""

    venue: str            # "polymarket" or "kalshi"
    market_id: str         # condition_id / token_id for Polymarket, ticker for Kalshi
    question: str
    keywords: Tuple[str, ...]


@dataclass(frozen=True)
class ArbitragePair:
    """Links two markets on different venues that resolve on the same
    real-world event, so their implied probabilities must sum to ~1."""

    pair_id: str
    polymarket_market_id: str
    kalshi_market_id: str
    question: str


@dataclass(frozen=True)
class AppConfig:
    risk: RiskConfig
    llm: LLMConfig
    news: NewsConfig
    polymarket: PolymarketConfig
    kalshi: KalshiConfig
    watched_markets: Tuple[WatchedMarket, ...]
    arbitrage_pairs: Tuple[ArbitragePair, ...]
    arbitrage_scan_interval_seconds: float
    dry_run: bool
    state_snapshot_path: str
    decision_loop_interval_seconds: float
    balance_refresh_interval_seconds: float
    log_level: str
    log_file: str


DEFAULT_RSS_FEEDS: Tuple[str, ...] = (
    "https://feeds.reuters.com/reuters/topNews",
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://apnews.com/apf-topnews?output=rss",
    "https://www.federalreserve.gov/feeds/press_all.xml",
)


def _load_watched_markets() -> Tuple[WatchedMarket, ...]:
    """Loads market -> keyword mappings from a JSON file.

    Format::

        [
          {"venue": "polymarket", "market_id": "0xabc...", "question": "...",
           "keywords": ["fed", "interest rate", "fomc"]},
          {"venue": "kalshi", "market_id": "FED-24DEC-T4.5", "question": "...",
           "keywords": ["federal reserve", "rate hike"]}
        ]

    The file path is controlled by ``VYROBOT_MARKETS_FILE`` (default:
    ``markets.json`` next to this module). Missing file -> empty tuple, the
    engine simply ingests news without a live watch-list until configured.
    """
    markets_file = Path(_env("VYROBOT_MARKETS_FILE", str(BASE_DIR / "markets.json")))
    if not markets_file.exists():
        logger.warning("Watched-markets file %s not found; starting with an empty watch-list.", markets_file)
        return ()

    try:
        raw = json.loads(markets_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.error("Failed to parse watched-markets file %s: %s", markets_file, exc)
        return ()

    markets = []
    for entry in raw:
        try:
            markets.append(
                WatchedMarket(
                    venue=str(entry["venue"]).lower(),
                    market_id=str(entry["market_id"]),
                    question=str(entry.get("question", "")),
                    keywords=tuple(k.lower() for k in entry.get("keywords", [])),
                )
            )
        except (KeyError, TypeError) as exc:
            logger.warning("Skipping malformed watched-market entry %r: %s", entry, exc)
    return tuple(markets)


def _load_arbitrage_pairs() -> Tuple[ArbitragePair, ...]:
    """Loads cross-venue equivalent-market pairs for arbitrage scanning.

    Format::

        [
          {"pair_id": "fed-dec-cut", "polymarket_market_id": "...",
           "kalshi_market_id": "FED-24DEC-T4.50", "question": "..."}
        ]

    The file path is controlled by ``VYROBOT_ARBITRAGE_PAIRS_FILE`` (default:
    ``arbitrage_pairs.json`` next to this module). Missing file -> empty
    tuple, the arbitrage scanner simply has nothing to scan until configured.
    """
    pairs_file = Path(_env("VYROBOT_ARBITRAGE_PAIRS_FILE", str(BASE_DIR / "arbitrage_pairs.json")))
    if not pairs_file.exists():
        logger.info("Arbitrage-pairs file %s not found; cross-exchange scanning disabled.", pairs_file)
        return ()

    try:
        raw = json.loads(pairs_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.error("Failed to parse arbitrage-pairs file %s: %s", pairs_file, exc)
        return ()

    pairs = []
    for entry in raw:
        try:
            pairs.append(
                ArbitragePair(
                    pair_id=str(entry["pair_id"]),
                    polymarket_market_id=str(entry["polymarket_market_id"]),
                    kalshi_market_id=str(entry["kalshi_market_id"]),
                    question=str(entry.get("question", "")),
                )
            )
        except (KeyError, TypeError) as exc:
            logger.warning("Skipping malformed arbitrage-pair entry %r: %s", entry, exc)
    return tuple(pairs)


def load_config() -> AppConfig:
    """Builds the full application configuration from the environment."""

    risk = RiskConfig(
        max_allocation_pct=_env_float("VYROBOT_MAX_ALLOCATION_PCT", 0.05),
        min_confidence=_env_float("VYROBOT_MIN_CONFIDENCE", 0.75),
        max_spread_pct=_env_float("VYROBOT_MAX_SPREAD_PCT", 0.05),
        kelly_fraction=_env_float("VYROBOT_KELLY_FRACTION", 0.5),
        max_open_positions=_env_int("VYROBOT_MAX_OPEN_POSITIONS", 10),
        min_order_notional_usd=_env_float("VYROBOT_MIN_ORDER_NOTIONAL_USD", 1.0),
        max_daily_loss_pct=_env_float("VYROBOT_MAX_DAILY_LOSS_PCT", 0.15),
        max_slippage_pct=_env_float("VYROBOT_MAX_SLIPPAGE_PCT", 0.02),
        min_arbitrage_edge_pct=_env_float("VYROBOT_MIN_ARBITRAGE_EDGE_PCT", 0.02),
        arbitrage_fee_buffer_pct=_env_float("VYROBOT_ARBITRAGE_FEE_BUFFER_PCT", 0.02),
    )

    # Hard safety clamps regardless of what an operator puts in the environment.
    if risk.max_allocation_pct > 0.05:
        logger.warning(
            "VYROBOT_MAX_ALLOCATION_PCT=%.4f exceeds the hardcoded 5%% safety cap; clamping to 0.05.",
            risk.max_allocation_pct,
        )
        object.__setattr__(risk, "max_allocation_pct", 0.05)
    if risk.min_confidence < 0.75:
        logger.warning(
            "VYROBOT_MIN_CONFIDENCE=%.4f is below the hardcoded 0.75 floor; clamping to 0.75.",
            risk.min_confidence,
        )
        object.__setattr__(risk, "min_confidence", 0.75)

    llm_provider = _env("VYROBOT_LLM_PROVIDER", "anthropic").lower()
    if llm_provider == "openai":
        default_model = "gpt-4o-mini"
        default_url = "https://api.openai.com/v1/chat/completions"
    else:
        default_model = "claude-haiku-4-5-20251001"
        default_url = "https://api.anthropic.com/v1/messages"

    llm = LLMConfig(
        provider=llm_provider,
        api_key=_env("VYROBOT_LLM_API_KEY", default="") or "",
        model=_env("VYROBOT_LLM_MODEL", default_model) or default_model,
        api_url=_env("VYROBOT_LLM_API_URL", default_url) or default_url,
        max_tokens=_env_int("VYROBOT_LLM_MAX_TOKENS", 300),
        temperature=_env_float("VYROBOT_LLM_TEMPERATURE", 0.0),
        timeout_seconds=_env_float("VYROBOT_LLM_TIMEOUT_SECONDS", 20.0),
        max_retries=_env_int("VYROBOT_LLM_MAX_RETRIES", 4),
    )

    news = NewsConfig(
        poll_interval_seconds=_env_float("VYROBOT_NEWS_POLL_INTERVAL_SECONDS", 60.0),
        rss_feeds=_env_tuple("VYROBOT_RSS_FEEDS", DEFAULT_RSS_FEEDS),
        gdelt_query=_env("VYROBOT_GDELT_QUERY", "sourcelang:english") or "sourcelang:english",
        gdelt_enabled=_env_bool("VYROBOT_GDELT_ENABLED", True),
        max_items_per_cycle=_env_int("VYROBOT_NEWS_MAX_ITEMS_PER_CYCLE", 25),
        request_timeout_seconds=_env_float("VYROBOT_NEWS_REQUEST_TIMEOUT_SECONDS", 15.0),
    )

    polymarket = PolymarketConfig(
        enabled=_env_bool("VYROBOT_POLYMARKET_ENABLED", False),
        clob_rest_url=_env("VYROBOT_POLYMARKET_CLOB_REST_URL", "https://clob.polymarket.com"),
        clob_ws_url=_env(
            "VYROBOT_POLYMARKET_CLOB_WS_URL",
            "wss://ws-subscriptions-clob.polymarket.com/ws/market",
        ),
        polygon_rpc_url=_env("VYROBOT_POLYGON_RPC_URL", "https://polygon-rpc.com"),
        private_key=_env("VYROBOT_POLYMARKET_PRIVATE_KEY"),
        funder_address=_env("VYROBOT_POLYMARKET_FUNDER_ADDRESS"),
        api_key=_env("VYROBOT_POLYMARKET_API_KEY"),
        api_secret=_env("VYROBOT_POLYMARKET_API_SECRET"),
        api_passphrase=_env("VYROBOT_POLYMARKET_API_PASSPHRASE"),
        usdc_contract_address=_env(
            "VYROBOT_POLYGON_USDC_ADDRESS", "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"
        ),
        ctf_exchange_address=_env(
            "VYROBOT_POLYMARKET_CTF_EXCHANGE_ADDRESS", "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"
        ),
        chain_id=_env_int("VYROBOT_POLYGON_CHAIN_ID", 137),
        watched_condition_ids=_env_tuple("VYROBOT_POLYMARKET_CONDITION_IDS"),
    )

    kalshi = KalshiConfig(
        enabled=_env_bool("VYROBOT_KALSHI_ENABLED", False),
        rest_url=_env("VYROBOT_KALSHI_REST_URL", "https://trading-api.kalshi.com/trade-api/v2"),
        ws_url=_env("VYROBOT_KALSHI_WS_URL", "wss://trading-api.kalshi.com/trade-api/ws/v2"),
        api_key_id=_env("VYROBOT_KALSHI_API_KEY_ID"),
        private_key_pem_path=_env("VYROBOT_KALSHI_PRIVATE_KEY_PATH"),
        watched_tickers=_env_tuple("VYROBOT_KALSHI_TICKERS"),
        usd_to_usdt_rate=_env_float("VYROBOT_USD_TO_USDT_RATE", 1.0),
    )

    return AppConfig(
        risk=risk,
        llm=llm,
        news=news,
        polymarket=polymarket,
        kalshi=kalshi,
        watched_markets=_load_watched_markets(),
        arbitrage_pairs=_load_arbitrage_pairs(),
        arbitrage_scan_interval_seconds=_env_float("VYROBOT_ARBITRAGE_SCAN_INTERVAL_SECONDS", 10.0),
        dry_run=_env_bool("VYROBOT_DRY_RUN", True),
        state_snapshot_path=_env("VYROBOT_STATE_SNAPSHOT_PATH", str(BASE_DIR / "state_snapshot.json")),
        decision_loop_interval_seconds=_env_float("VYROBOT_DECISION_LOOP_INTERVAL_SECONDS", 5.0),
        balance_refresh_interval_seconds=_env_float("VYROBOT_BALANCE_REFRESH_INTERVAL_SECONDS", 30.0),
        log_level=_env("VYROBOT_LOG_LEVEL", "INFO") or "INFO",
        log_file=_env("VYROBOT_LOG_FILE", "vyrobot.log") or "vyrobot.log",
    )
