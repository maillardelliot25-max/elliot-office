"""
calibration.py - offline calibration / backtesting harness for the VyRobot
Prediction Engine.

Reads the JSONL decision log written by main.py (see decision_log.py),
cross-references each directional decision's market against the venue's
current resolution status, and reports:

  * LLM calibration: predicted probability vs. realized outcome frequency,
    bucketed into deciles, plus an overall Brier score. This measures
    whether the LLM's probability estimates are trustworthy at all,
    independent of whether a trade was ever placed.
  * Simulated P&L: what would have happened, in dollars, had every
    APPROVED directional decision actually been executed at its recorded
    limit price and size.
  * Arbitrage summary: count / notional / expected profit of arbitrage
    opportunities (these don't need outcome resolution - the edge is
    locked in at execution time by construction, not by who wins).

Usage:
    python calibration.py                  # human-readable report to stdout
    python calibration.py --csv out.csv    # also write per-decision detail to CSV

Resolution lookups hit each venue's public market-data REST endpoint and
are inherently best-effort: Polymarket's CLOB REST API is keyed by
condition_id while this engine tracks markets by outcome token_id, so
Polymarket resolution detection will not work for every market shape.
Kalshi resolution lookups use its public per-ticker market endpoint.
Decisions whose resolution can't be determined are reported as such, never
silently dropped or counted as a loss.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import aiohttp

from config import AppConfig, load_config
from decision_log import read_decisions

logger = logging.getLogger("vyrobot.calibration")


@dataclass
class ResolvedDecision:
    record: Dict[str, Any]
    resolved: bool
    yes_won: Optional[bool]  # True/False once known, None if unresolved or undeterminable


# --------------------------------------------------------------------------- #
# Best-effort venue resolution lookups
# --------------------------------------------------------------------------- #

async def _fetch_kalshi_resolution(session: aiohttp.ClientSession, rest_url: str, ticker: str) -> Optional[bool]:
    url = f"{rest_url}/markets/{ticker}"
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status != 200:
                return None
            data = await resp.json(content_type=None)
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
        return None

    market = data.get("market", data) if isinstance(data, dict) else {}
    status = str(market.get("status", "")).lower()
    result = str(market.get("result", "")).lower()
    if status not in ("finalized", "settled") or result not in ("yes", "no"):
        return None
    return result == "yes"


async def _fetch_polymarket_resolution(session: aiohttp.ClientSession, clob_rest_url: str, market_id: str) -> Optional[bool]:
    url = f"{clob_rest_url}/markets/{market_id}"
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status != 200:
                return None
            data = await resp.json(content_type=None)
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
        return None

    if not isinstance(data, dict) or not data.get("closed"):
        return None
    for token in data.get("tokens", []):
        if token.get("winner") is True:
            return str(token.get("outcome", "")).lower() == "yes"
    return None


async def resolve_decisions(records: List[Dict[str, Any]], config: AppConfig) -> List[ResolvedDecision]:
    resolved: List[ResolvedDecision] = []
    cache: Dict[Tuple[str, str], Optional[bool]] = {}

    async with aiohttp.ClientSession() as session:
        for record in records:
            if record.get("kind") != "directional":
                resolved.append(ResolvedDecision(record, False, None))
                continue

            venue = record.get("venue")
            market_id = record.get("market_id")
            key = (venue, market_id)
            if key not in cache:
                if venue == "kalshi":
                    cache[key] = await _fetch_kalshi_resolution(session, config.kalshi.rest_url, market_id)
                elif venue == "polymarket":
                    cache[key] = await _fetch_polymarket_resolution(session, config.polymarket.clob_rest_url, market_id)
                else:
                    cache[key] = None

            yes_won = cache[key]
            resolved.append(ResolvedDecision(record, yes_won is not None, yes_won))

    return resolved


# --------------------------------------------------------------------------- #
# Calibration + simulated P&L math
# --------------------------------------------------------------------------- #

def compute_calibration(resolved: List[ResolvedDecision]) -> Dict[str, Any]:
    """Brier score + decile calibration buckets over every resolved
    directional decision's raw LLM probability, regardless of whether a
    trade was actually approved/executed on it."""
    pairs: List[Tuple[float, float]] = []
    for rd in resolved:
        if rd.record.get("kind") != "directional" or not rd.resolved:
            continue
        p = rd.record.get("llm_probability")
        if p is None:
            continue
        pairs.append((float(p), 1.0 if rd.yes_won else 0.0))

    if not pairs:
        return {"n": 0, "brier_score": None, "buckets": []}

    brier_score = sum((p - r) ** 2 for p, r in pairs) / len(pairs)

    buckets = []
    for i in range(10):
        lo, hi = i / 10.0, (i + 1) / 10.0
        in_bucket = [(p, r) for p, r in pairs if (lo <= p < hi) or (i == 9 and p == 1.0)]
        if not in_bucket:
            buckets.append({"range": (lo, hi), "n": 0, "mean_p": None, "realized_freq": None})
            continue
        buckets.append(
            {
                "range": (lo, hi),
                "n": len(in_bucket),
                "mean_p": sum(p for p, _ in in_bucket) / len(in_bucket),
                "realized_freq": sum(r for _, r in in_bucket) / len(in_bucket),
            }
        )

    return {"n": len(pairs), "brier_score": brier_score, "buckets": buckets}


def compute_simulated_pnl(resolved: List[ResolvedDecision]) -> Dict[str, Any]:
    """What would have happened, in dollars, had every APPROVED directional
    decision been executed at its recorded limit price and contract size."""
    trades = []
    for rd in resolved:
        r = rd.record
        if r.get("kind") != "directional" or not r.get("approved") or not rd.resolved:
            continue
        side = r.get("side")
        contracts = float(r.get("contracts", 0.0) or 0.0)
        limit_price = float(r.get("limit_price", 0.0) or 0.0)
        if contracts <= 0 or limit_price <= 0 or side not in ("buy", "sell"):
            continue

        cost_per_contract = limit_price if side == "buy" else (1.0 - limit_price)
        side_won = (rd.yes_won is True and side == "buy") or (rd.yes_won is False and side == "sell")
        payout_per_contract = 1.0 if side_won else 0.0
        pnl = contracts * (payout_per_contract - cost_per_contract)
        trades.append({"pnl": pnl, "won": side_won, "notional": contracts * cost_per_contract})

    if not trades:
        return {"n": 0, "total_pnl": 0.0, "win_rate": None, "total_notional": 0.0, "roi_pct": None}

    total_pnl = sum(t["pnl"] for t in trades)
    total_notional = sum(t["notional"] for t in trades)
    return {
        "n": len(trades),
        "total_pnl": total_pnl,
        "win_rate": sum(1 for t in trades if t["won"]) / len(trades),
        "total_notional": total_notional,
        "roi_pct": (total_pnl / total_notional) if total_notional > 0 else None,
    }


def summarize_arbitrage(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Arbitrage opportunities don't need outcome resolution: the edge is
    locked in at execution by construction (buy YES + buy NO < $1), so this
    is a straight tally rather than a wait-for-resolution simulation."""
    approved = [r for r in records if r.get("kind") == "arbitrage" and r.get("approved")]
    dry_run = [r for r in approved if r.get("reason") == "approved (dry run)"]
    executed = [r for r in approved if r not in dry_run]
    leg_risk_events = [r for r in approved if r.get("leg_risk")]

    return {
        "n_total": len(approved),
        "n_executed": len(executed),
        "n_dry_run": len(dry_run),
        "n_leg_risk": len(leg_risk_events),
        "total_expected_profit_usd": sum(r.get("expected_profit_usd", 0.0) or 0.0 for r in approved),
        "total_notional_usd": sum(r.get("notional_usd", 0.0) or 0.0 for r in approved),
    }


# --------------------------------------------------------------------------- #
# Report rendering
# --------------------------------------------------------------------------- #

def _ascii_bar(fraction: Optional[float], width: int = 20) -> str:
    if fraction is None:
        return "?" * width
    filled = round(max(0.0, min(1.0, fraction)) * width)
    return "#" * filled + "-" * (width - filled)


def print_report(calibration: Dict[str, Any], pnl: Dict[str, Any], arb: Dict[str, Any], total_records: int) -> None:
    line = "=" * 78
    print(line)
    print("VyRobot Prediction Engine - Calibration & Backtest Report")
    print(line)
    print(f"Decision log records read: {total_records}\n")

    print("-- LLM calibration: predicted probability vs. realized outcome frequency --")
    if calibration["n"] == 0:
        print(
            "No resolved directional decisions yet. Let the engine run (dry-run is fine) "
            "until at least a few watched markets have settled, then re-run this report."
        )
    else:
        print(f"Resolved decisions used: {calibration['n']}    Brier score: {calibration['brier_score']:.4f}")
        print("(0.0 = perfect, 0.25 = a no-skill coin-flip baseline, 1.0 = worst possible)\n")
        header = f"{'p-bucket':<10}{'n':>5}   {'mean p':>8}  {'actual freq':>12}"
        print(header)
        print("-" * len(header))
        for b in calibration["buckets"]:
            lo, hi = b["range"]
            label = f"{lo:.1f}-{hi:.1f}"
            if b["n"] == 0:
                print(f"{label:<10}{0:>5}   {'--':>8}  {'--':>12}")
                continue
            print(
                f"{label:<10}{b['n']:>5}   {b['mean_p']*100:>6.1f}%  {b['realized_freq']*100:>10.1f}%   "
                f"pred [{_ascii_bar(b['mean_p'], 12)}] actual [{_ascii_bar(b['realized_freq'], 12)}]"
            )
        print(
            "\nWell-calibrated means each row's 'actual freq' tracks its 'mean p' closely. "
            "Bars pulling apart in the same direction across most rows is systematic "
            "over/under-confidence, not noise -- do not trust Kelly sizing off that model "
            "until it is fixed or the confidence floor is raised."
        )
    print()

    print("-- Simulated P&L: directional trades executed at their recorded limit price/size --")
    if pnl["n"] == 0:
        print("No resolved, approved directional decisions yet.")
    else:
        print(f"Resolved trades: {pnl['n']}    Win rate: {pnl['win_rate']*100:.1f}%")
        print(f"Total notional risked: ${pnl['total_notional']:.2f}")
        if pnl["roi_pct"] is not None:
            print(f"Total simulated PnL:   ${pnl['total_pnl']:.2f}  (ROI {pnl['roi_pct']*100:.1f}%)")
        else:
            print(f"Total simulated PnL:   ${pnl['total_pnl']:.2f}")
    print()

    print("-- Cross-exchange arbitrage --")
    print(f"Approved opportunities: {arb['n_total']}  (executed: {arb['n_executed']}, dry-run: {arb['n_dry_run']})")
    print(
        f"Total notional: ${arb['total_notional_usd']:.2f}    "
        f"Total expected profit: ${arb['total_expected_profit_usd']:.2f}"
    )
    if arb["n_leg_risk"]:
        print(f"WARNING: {arb['n_leg_risk']} arbitrage execution(s) hit leg risk (one side failed). Review vyrobot.log.")
    print(line)


def write_csv(resolved: List[ResolvedDecision], path: str) -> None:
    if not resolved:
        return
    fieldnames = sorted({key for rd in resolved for key in rd.record.keys()} | {"resolved", "yes_won"})
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for rd in resolved:
            row = dict(rd.record)
            row["resolved"] = rd.resolved
            row["yes_won"] = rd.yes_won
            writer.writerow(row)


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #

async def _async_main(csv_path: Optional[str]) -> None:
    config = load_config()
    records = read_decisions(config.decisions_log_path)
    if not records:
        print(f"No decisions found at {config.decisions_log_path}.")
        print("Run main.py first (dry-run is fine) so it has some logged decisions to analyze.")
        return

    resolved = await resolve_decisions(records, config)
    calibration = compute_calibration(resolved)
    pnl = compute_simulated_pnl(resolved)
    arb = summarize_arbitrage(records)

    print_report(calibration, pnl, arb, len(records))

    if csv_path:
        write_csv(resolved, csv_path)
        print(f"\nPer-decision detail written to {csv_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="VyRobot Prediction Engine calibration/backtest report")
    parser.add_argument("--csv", help="Optional path to write per-decision detail as CSV", default=None)
    args = parser.parse_args()

    logging.basicConfig(level=logging.WARNING, format="%(levelname)s: %(message)s")

    try:
        asyncio.run(_async_main(args.csv))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
