# Agent Builder Platform — Phase 1

Phase 1 of the build spec: one archetype (trend brief), one pilot client,
no dashboard, no intent classification. Goal is to prove the output is
good enough to pay for before building anything heavier.

## What this is

A single agent run: fetch trend data for a client's watch topics, turn it
into a short brief, email it, log the run (cost, usage, delivery outcome).
Runs with no API keys and no signup by default.

## Running it

```bash
npm install
npm start
```

No `.env` needed. Out of the box:

- Data source is synthetic example findings (`src/lib/dataSource.js`).
- The brief is written by a local template engine — no LLM call, no cost.
- No `SMTP_*` vars → the email is written to `output/*.eml` instead of
  sent.

To upgrade a piece later, `cp .env.example .env` and fill in what you need:
`ANTHROPIC_API_KEY` switches the brief generator to real Claude output;
`SMTP_*` sends the email for real. `src/config/client.json` holds the
(currently generic/mock) pilot client's config — point it at a real client
when one is chosen.

## Layout

- `src/lib/dataSource.js` — the "one real data source" the spec calls
  for; currently synthetic example data, swap for a real search/scrape API.
- `src/lib/briefGenerator.js` — local template-based brief writer by
  default; switches to the Claude Messages API when `ANTHROPIC_API_KEY`
  is set.
- `src/lib/emailDelivery.js` — delivery + dry-run fallback (the "hands").
- `src/lib/costCeiling.js` — per-run cost estimate and hard ceiling, per
  the architecture section's cost-control guidance.
- `src/lib/runLog.js` — appends every run to `logs/agent_runs.jsonl`
  (input/output/cost), the minimum observability the spec calls out as
  commonly skipped and regretted.
- `src/archetypes/trend-brief/` — the archetype's system prompt and
  orchestration.

## Not in scope for Phase 1

Per the build spec's roadmap: intent classification, slot filling, the
operator dashboard, multi-tenant isolation, billing, and the archetype
catalog beyond trend-brief. See the "AI Agent Builder Platform — Product &
Build Spec" doc for the full roadmap (Phases 2–4).
