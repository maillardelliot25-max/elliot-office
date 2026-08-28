"""
Structured decision logging shared between the live engine (``main.py``)
and the offline calibration/backtesting tool (``calibration.py``).

Every risk-evaluated decision the engine makes - approved or rejected,
directional or arbitrage - is appended as one JSON line to a log file.
This is deliberately append-only, flat JSON so it survives partial writes
(one line = one record) and can be read back with nothing more than the
standard library.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger("vyrobot.decision_log")

SCHEMA_VERSION = 1


def _append_sync(path: str, record: Dict[str, Any]) -> None:
    record = {"schema_version": SCHEMA_VERSION, "ts": time.time(), **record}
    try:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, default=str) + "\n")
    except OSError:
        logger.exception("Failed to append decision record to %s", path)


async def log_decision(path: str, record: Dict[str, Any]) -> None:
    """Appends one JSON record without blocking the event loop."""
    await asyncio.to_thread(_append_sync, path, record)


def read_decisions(path: str) -> List[Dict[str, Any]]:
    """Reads every well-formed record from the log. Corrupt/partial trailing
    lines (e.g. from a hard process kill mid-write) are skipped, not fatal."""
    file_path = Path(path)
    if not file_path.exists():
        return []

    records: List[Dict[str, Any]] = []
    with file_path.open("r", encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                logger.warning("Skipping malformed decision-log line %d in %s", line_no, path)
    return records


def directional_record(
    *,
    dry_run: bool,
    venue: str,
    market_id: str,
    question: str,
    item_title: str,
    item_url: str,
    llm_probability: float,
    llm_confidence: float,
    llm_rationale: str,
    mid_price: float,
    spread_pct: float,
    approved: bool,
    reason: str,
    side: str = "none",
    size_usd: float = 0.0,
    contracts: float = 0.0,
    limit_price: float = 0.0,
    order_id: str = "",
    order_status: str = "",
) -> Dict[str, Any]:
    return {
        "kind": "directional",
        "dry_run": dry_run,
        "venue": venue,
        "market_id": market_id,
        "question": question,
        "item_title": item_title,
        "item_url": item_url,
        "llm_probability": llm_probability,
        "llm_confidence": llm_confidence,
        "llm_rationale": llm_rationale,
        "mid_price": mid_price,
        "spread_pct": spread_pct,
        "approved": approved,
        "reason": reason,
        "side": side,
        "size_usd": size_usd,
        "contracts": contracts,
        "limit_price": limit_price,
        "order_id": order_id,
        "order_status": order_status,
    }


def arbitrage_record(
    *,
    dry_run: bool,
    pair_id: str,
    question: str,
    leg_a_venue: str,
    leg_a_market_id: str,
    leg_a_side: str,
    leg_a_price: float,
    leg_b_venue: str,
    leg_b_market_id: str,
    leg_b_side: str,
    leg_b_price: float,
    edge_pct: float,
    approved: bool,
    reason: str,
    contracts: float = 0.0,
    notional_usd: float = 0.0,
    expected_profit_usd: float = 0.0,
    order_a_id: str = "",
    order_b_id: str = "",
    leg_risk: bool = False,
) -> Dict[str, Any]:
    return {
        "kind": "arbitrage",
        "dry_run": dry_run,
        "pair_id": pair_id,
        "question": question,
        "leg_a_venue": leg_a_venue,
        "leg_a_market_id": leg_a_market_id,
        "leg_a_side": leg_a_side,
        "leg_a_price": leg_a_price,
        "leg_b_venue": leg_b_venue,
        "leg_b_market_id": leg_b_market_id,
        "leg_b_side": leg_b_side,
        "leg_b_price": leg_b_price,
        "edge_pct": edge_pct,
        "approved": approved,
        "reason": reason,
        "contracts": contracts,
        "notional_usd": notional_usd,
        "expected_profit_usd": expected_profit_usd,
        "order_a_id": order_a_id,
        "order_b_id": order_b_id,
        "leg_risk": leg_risk,
    }
