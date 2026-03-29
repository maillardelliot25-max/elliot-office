"""
JARVIS — Bookkeeping (Plaid + QuickBooks/Wave)
===============================================
Real-time transaction monitoring, expense categorization,
and financial summaries — all autonomous.
"""

import logging
from datetime import datetime, timedelta
from typing import Any
import httpx
from config.settings import settings

logger = logging.getLogger("jarvis.bookkeeping")


CATEGORY_RULES = {
    "aws":         "Cloud Infrastructure",
    "openai":      "AI / Software Tools",
    "anthropic":   "AI / Software Tools",
    "vercel":      "Cloud Infrastructure",
    "github":      "Developer Tools",
    "stripe":      "Payment Processing",
    "zoom":        "Communications",
    "slack":       "Communications",
    "figma":       "Design Tools",
    "notion":      "Productivity",
    "uber":        "Transportation",
    "lyft":        "Transportation",
    "delta":       "Travel",
    "marriott":    "Accommodation",
    "starbucks":   "Meals & Entertainment",
}


class BookkeepingHandler:
    """
    Autonomous financial tracking.
    Connects to Plaid for bank/card data.
    Categorizes expenses in real-time using merchant rules + LLM fallback.
    Generates weekly P&L summaries.
    """

    PLAID_BASE = "https://production.plaid.com"  # use sandbox.plaid.com for testing

    def __init__(self):
        self.plaid_client_id = settings.PLAID_CLIENT_ID
        self.plaid_secret    = settings.PLAID_SECRET
        self.access_token    = settings.PLAID_ACCESS_TOKEN   # from Plaid Link flow
        self.headers = {
            "Content-Type":      "application/json",
            "PLAID-CLIENT-ID":   self.plaid_client_id,
            "PLAID-SECRET":      self.plaid_secret
        }

    # ─── TRANSACTIONS ────────────────────────────────────────────────────────
    async def get_recent_transactions(self, days: int = 7) -> list[dict]:
        """Fetches and categorizes transactions from the last N days."""
        end_date   = datetime.today().strftime("%Y-%m-%d")
        start_date = (datetime.today() - timedelta(days=days)).strftime("%Y-%m-%d")

        payload = {
            "access_token": self.access_token,
            "start_date":   start_date,
            "end_date":     end_date,
            "options":      {"count": 100, "offset": 0}
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.PLAID_BASE}/transactions/get",
                json=payload,
                headers=self.headers,
                timeout=20
            )
            resp.raise_for_status()
            data = resp.json()

        transactions = data.get("transactions", [])
        return [self._enrich_transaction(t) for t in transactions]

    def _enrich_transaction(self, txn: dict) -> dict:
        """
        Adds Jarvis-specific categorization to a raw Plaid transaction.
        Priority: merchant rule → Plaid category → LLM fallback.
        """
        name     = txn.get("name", "").lower()
        amount   = txn.get("amount", 0)
        date     = txn.get("date", "")
        merchant = txn.get("merchant_name", name)

        # Rule-based categorization
        category = None
        for keyword, cat in CATEGORY_RULES.items():
            if keyword in name:
                category = cat
                break

        if not category:
            plaid_cats = txn.get("category", [])
            category   = plaid_cats[-1] if plaid_cats else "Uncategorized"

        return {
            "id":          txn.get("transaction_id"),
            "date":        date,
            "merchant":    merchant,
            "amount":      amount,
            "currency":    txn.get("iso_currency_code", "USD"),
            "category":    category,
            "account":     txn.get("account_id"),
            "pending":     txn.get("pending", False),
            "notes":       ""
        }

    # ─── ACCOUNTS ───────────────────────────────────────────────────────────
    async def get_balances(self) -> list[dict]:
        """Returns current balances for all linked accounts."""
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.PLAID_BASE}/accounts/balance/get",
                json={"access_token": self.access_token},
                headers=self.headers,
                timeout=15
            )
            resp.raise_for_status()
            accounts = resp.json().get("accounts", [])

        return [{
            "name":      a["name"],
            "type":      a["type"],
            "subtype":   a["subtype"],
            "balance":   a["balances"]["current"],
            "available": a["balances"].get("available"),
            "currency":  a["balances"].get("iso_currency_code", "USD")
        } for a in accounts]

    # ─── REPORTS ────────────────────────────────────────────────────────────
    async def generate_weekly_summary(self) -> dict:
        """Generates a P&L-style weekly expense summary."""
        transactions = await self.get_recent_transactions(days=7)
        balances     = await self.get_balances()

        totals_by_category: dict[str, float] = {}
        for txn in transactions:
            if not txn["pending"]:
                cat = txn["category"]
                totals_by_category[cat] = totals_by_category.get(cat, 0) + txn["amount"]

        total_spend = sum(totals_by_category.values())

        return {
            "period":             f"Last 7 days ending {datetime.today().strftime('%Y-%m-%d')}",
            "total_spend":        round(total_spend, 2),
            "spend_by_category":  {k: round(v, 2) for k, v in
                                   sorted(totals_by_category.items(), key=lambda x: -x[1])},
            "transaction_count":  len(transactions),
            "account_balances":   balances,
            "top_merchant":       (max(transactions, key=lambda x: x["amount"])["merchant"]
                                   if transactions else "N/A")
        }

    async def flag_large_transaction(self, threshold: float = 500.0) -> list[dict]:
        """Flags any transaction above the threshold for review."""
        transactions = await self.get_recent_transactions(days=1)
        flagged = [t for t in transactions if t["amount"] >= threshold]
        if flagged:
            logger.warning(f"[BOOKKEEPING] {len(flagged)} large transaction(s) flagged.")
        return flagged

    async def execute(self, step: str, context: dict) -> Any:
        """Routes bookkeeping action steps from the master loop plan."""
        step_lower = step.lower()
        if "balance"     in step_lower: return await self.get_balances()
        if "transaction" in step_lower: return await self.get_recent_transactions()
        if "summary"     in step_lower: return await self.generate_weekly_summary()
        if "flag"        in step_lower: return await self.flag_large_transaction()
        return {"status": "unknown_action", "step": step}
