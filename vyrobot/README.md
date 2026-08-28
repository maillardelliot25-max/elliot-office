# VyRobot Prediction Engine

An async, Termux-native trading bot for Polymarket and Kalshi that turns
polled news into LLM-scored probability estimates and sizes positions with
a hard-capped fractional-Kelly criterion, a cross-exchange arbitrage
scanner, and real-time order-book-depth-aware slippage protection.

## Files

| File | Purpose |
|---|---|
| `setup.sh` | Termux/Android bootstrap: system packages + Python venv + pip deps |
| `config.py` | Env-driven configuration, risk constants, logging setup |
| `market_client.py` | `BaseMarketClient`, `StateManager`, `PolymarketClient`, `KalshiClient` |
| `analytics.py` | News ingestion, LLM scoring, Kelly sizing, `ArbitrageScanner`, `RiskManager` |
| `main.py` | Async event loop tying data streams, arbitrage, alerting, and depth-aware execution together |
| `decision_log.py` | Shared JSONL schema for every risk-evaluated decision (read by `calibration.py`) |
| `calibration.py` | Offline report: LLM calibration (Brier score), simulated P&L, arbitrage summary |
| `run_forever.sh` | Crash-resilient supervisor: restarts `main.py` with backoff if it dies |
| `termux_boot/start-vyrobot.sh` | Termux:Boot entry point so the bot survives a phone reboot |
| `.env.example` | Template for all environment variables / secrets |
| `markets.json.example` | Template for the news-keyword -> market watch-list |
| `arbitrage_pairs.json.example` | Template linking equivalent Polymarket/Kalshi markets |

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
cp arbitrage_pairs.json.example arbitrage_pairs.json
nano arbitrage_pairs.json   # optional: equivalent Polymarket/Kalshi market pairs to arbitrage
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
- **Depth-based dynamic downscaling**: immediately before every order is
  sent (both directional Kelly trades and each leg of an arbitrage),
  `analytics.compute_depth_adjusted_size` walks the live book from the top
  and shrinks the intended contract count to whatever size can be filled
  without the volume-weighted fill price drifting more than
  `VYROBOT_MAX_SLIPPAGE_PCT` (default 2%) from the top-of-book price. A
  book that has thinned out since sizing time yields a smaller order, never
  a worse fill.

## 6. Cross-exchange arbitrage

When both `VYROBOT_POLYMARKET_ENABLED` and `VYROBOT_KALSHI_ENABLED` are
`true` and `arbitrage_pairs.json` lists at least one pair of equivalent
markets (same real-world event, one Polymarket market id + one Kalshi
ticker), a background scanner (`analytics.ArbitrageScanner`) runs every
`VYROBOT_ARBITRAGE_SCAN_INTERVAL_SECONDS` and checks both directions:

- Buy YES on Polymarket + buy NO on Kalshi
- Buy YES on Kalshi + buy NO on Polymarket

If the combined cost of both legs is less than $1 by more than
`VYROBOT_MIN_ARBITRAGE_EDGE_PCT` (after subtracting a flat
`VYROBOT_ARBITRAGE_FEE_BUFFER_PCT` fee approximation — calibrate this
against each venue's real fee schedule), the position is sized against the
same 5% max-allocation cap (applied to the *combined* notional of both
legs) and the daily loss / open-position gates, then both legs are
submitted **concurrently** to minimize leg risk. If one leg fails after the
other has already filled, the engine logs a `CRITICAL` leg-risk alert and
attempts a best-effort unwind of the filled leg by immediately crossing the
spread on that same market — eliminating the residual naked position takes
priority over price at that point. Watch the log for `LEG RISK` and
`MANUAL INTERVENTION REQUIRED` markers; automated unwinds are best-effort,
not guaranteed.

## 7. Calibration & backtesting — do this before `--live`

Every risk-evaluated decision (approved or rejected, directional or
arbitrage) is appended as one JSON line to `decisions.jsonl` — venue,
market, the LLM's raw probability/confidence, the sizing, and the outcome
of execution. Nothing is held only in memory or lost between dry-run
sessions.

Run dry-run for a while (days, ideally until some watched markets have
actually settled), then:

```bash
python calibration.py
python calibration.py --csv detail.csv   # also dump every decision for spreadsheet review
```

This prints:

- **LLM calibration** — buckets every resolved decision's predicted
  probability into deciles and compares it against the realized outcome
  frequency in that bucket, plus an overall Brier score (0.0 = perfect,
  0.25 = a coin-flip baseline, 1.0 = worst). This tells you whether the
  LLM's `p` is trustworthy *before* you let Kelly size real money against
  it — a model that says "80%" and is right 50% of the time will lose
  money systematically no matter how good the sizing math is.
- **Simulated P&L** — what every approved directional decision would have
  earned or lost had it executed at its recorded limit price and size.
- **Arbitrage summary** — count/notional/expected profit of arbitrage
  opportunities (these don't need outcome resolution since the edge is
  locked in at execution, not dependent on who wins).

Resolution lookups against Polymarket/Kalshi are best-effort (see the
docstring in `calibration.py`) — unresolved or undeterminable decisions are
reported as such, never silently dropped or scored as losses.

## 8. Alerting (so you don't have to watch the log)

Set `VYROBOT_ALERT_WEBHOOK_URL` to any HTTP endpoint that accepts a POST
and the engine will push a notification on: a live trade executing, an
arbitrage executing, arbitrage **leg risk** (one leg filled and the other
didn't), and the daily loss circuit breaker tripping. The simplest
zero-signup option for a phone: install the free **ntfy** Android app,
subscribe to a topic name only you know, and set
`VYROBOT_ALERT_WEBHOOK_URL=https://ntfy.sh/<your-topic-name>`. Set
`VYROBOT_ALERT_ON_DRY_RUN=true` first to confirm the alert pipeline works
before going live. A failed or unreachable webhook never blocks or crashes
the engine — it's logged as a warning and trading continues.

## 9. Running unattended (crash recovery + surviving a reboot)

`main.py` handles reconnects internally, but if the Python process itself
dies (OOM kill, Android reclaiming resources), something needs to restart
it. Use the supervisor instead of calling `python main.py` directly for
any unattended run:

```bash
chmod +x run_forever.sh
./run_forever.sh --live       # or no args for dry-run
```

It restarts `main.py` with an exponential backoff on crash-looping,
resets the backoff once a run has been stable for 60s, and logs restarts
to `vyrobot_supervisor.log`.

To survive a phone reboot without manually reopening Termux: install the
**Termux:Boot** companion app (same source as Termux itself — F-Droid or
GitHub, not the Play Store build, which can't run boot scripts), open it
once to grant the permission, then:

```bash
mkdir -p ~/.termux/boot
cp termux_boot/start-vyrobot.sh ~/.termux/boot/start-vyrobot.sh
chmod +x ~/.termux/boot/start-vyrobot.sh
```

Edit the `VYROBOT_DIR` path at the top of that script to match where you
cloned this repo. After a reboot, Termux:Boot launches it automatically,
which starts `run_forever.sh` in the background.

## 10. Stopping

`Ctrl+C` (SIGINT) or `SIGTERM` triggers a graceful shutdown: background
tasks are cancelled, websockets and HTTP sessions are closed, and the final
in-memory state (orders/positions/balances) is flushed to
`state_snapshot.json` so the next run can resume context. If you're running
under `run_forever.sh`, stop it (not just `main.py`) with `Ctrl+C` or
`pkill -f run_forever.sh`, otherwise the supervisor will restart it.

## Notes on scope

This is real trading software that moves real money once `--live` is set
and API/wallet credentials are configured — treat `.env` and any PEM/private
key files as highly sensitive, keep them out of version control (see the
included `.gitignore`), and validate thoroughly in dry-run against your own
paper/test credentials before enabling `--live`.
