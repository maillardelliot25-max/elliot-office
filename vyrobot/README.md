# VyRobot Prediction Engine

An async, Termux-native trading bot for Polymarket and Kalshi that turns
polled news into LLM-scored probability estimates and sizes positions with
a hard-capped fractional-Kelly criterion.

## Files

| File | Purpose |
|---|---|
| `setup.sh` | Termux/Android bootstrap: system packages + Python venv + pip deps |
| `config.py` | Env-driven configuration, risk constants, logging setup |
| `market_client.py` | `BaseMarketClient`, `StateManager`, `PolymarketClient`, `KalshiClient` |
| `analytics.py` | News ingestion, LLM scoring, Kelly sizing, `RiskManager` |
| `main.py` | Async event loop tying data streams to trade decisions |
| `.env.example` | Template for all environment variables / secrets |
| `markets.json.example` | Template for the news-keyword -> market watch-list |

## 1. Install (Termux, one time)

```bash
pkg install -y git
git clone <your-fork-url> vyrobot-checkout
cd vyrobot-checkout/vyrobot
chmod +x setup.sh
./setup.sh
```

`setup.sh` installs `python`, `clang`, `openssl`, `git`, `build-essential`,
`rust`/`cmake`/`libsecp256k1` (needed to compile `web3.py`'s native
dependencies on-device), creates a `venv/`, installs every pip dependency,
and copies `.env.example` to `.env`.

## 2. Configure

```bash
nano .env               # API keys, wallet key, risk knobs — VYROBOT_DRY_RUN=true by default
cp markets.json.example markets.json
nano markets.json       # which markets to watch and which keywords route news to them
```

Required secrets, only for the venues you enable:

- **Polymarket**: `VYROBOT_POLYMARKET_PRIVATE_KEY` (Polygon wallet), plus CLOB
  `VYROBOT_POLYMARKET_API_KEY/SECRET/PASSPHRASE` for private endpoints.
- **Kalshi**: `VYROBOT_KALSHI_API_KEY_ID` and a path to your RSA private key
  PEM in `VYROBOT_KALSHI_PRIVATE_KEY_PATH`.
- **LLM**: `VYROBOT_LLM_API_KEY` (Anthropic or OpenAI).

Leave `VYROBOT_POLYMARKET_ENABLED` / `VYROBOT_KALSHI_ENABLED` at `false`
until credentials are in place — the engine will otherwise skip that venue
gracefully but with no execution target.

## 3. Run (dry run first — always)

```bash
source venv/bin/activate
termux-wake-lock            # keep the process alive while Termux is backgrounded
python main.py
```

In dry-run mode (`VYROBOT_DRY_RUN=true`, the default) the engine streams
order books, ingests news, scores it with the LLM, runs full risk checks,
and logs every trade it *would* place — without ever calling
`place_limit_order`. Watch `vyrobot.log` (also mirrored to stdout).

## 4. Go live

Only after validating dry-run behavior:

```bash
python main.py --live
```

or set `VYROBOT_DRY_RUN=false` in `.env`.

## 5. Safety model (always enforced, not just configurable defaults)

- Hard cap: **no single order exceeds 5% of total tracked capital**, even if
  Kelly sizing recommends more, and even if `VYROBOT_MAX_ALLOCATION_PCT` is
  misconfigured above 0.05 (the loader clamps it).
- Hard floor: **trades require LLM confidence >= 0.75**; anything lower is
  rejected before sizing is even computed.
- Hard gate: **if the current bid/ask spread exceeds 5% of mid-price, the
  order is aborted** — no execution into illiquid books.
- Daily loss circuit breaker halts new trades once realized+marked losses
  reach `VYROBOT_MAX_DAILY_LOSS_PCT` of tracked capital for the day.
- All order submission uses **limit** prices derived from the live book
  (best ask for buys / `1 - best bid` for sells) with **IOC** time-in-force
  by default, so the bot never chases the book or accepts slippage.

## 6. Stopping

`Ctrl+C` (SIGINT) or `SIGTERM` triggers a graceful shutdown: background
tasks are cancelled, websockets and HTTP sessions are closed, and the final
in-memory state (orders/positions/balances) is flushed to
`state_snapshot.json` so the next run can resume context.

## Notes on scope

This is real trading software that moves real money once `--live` is set
and API/wallet credentials are configured — treat `.env` and any PEM/private
key files as highly sensitive, keep them out of version control (see the
included `.gitignore`), and validate thoroughly in dry-run against your own
paper/test credentials before enabling `--live`.
