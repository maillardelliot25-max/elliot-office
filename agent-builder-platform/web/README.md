# Agent Builder Platform — Web

The actual website: the 2-input intake flow, an operator dashboard, and
reseller-scoped (white-label) views, per the build spec's Phase 2-3
roadmap. Runs fully locally with no API keys, no signup, and no external
database — SQLite via Node's built-in `node:sqlite`.

## Running it

```bash
npm install
npm run seed   # creates an operator tenant + a demo reseller tenant + one demo trend-brief client
npm run dev
```

Open http://localhost:3000 — it redirects to `/dashboard`.

- **`/new`** — the 2-input flow: describe the business and what to
  automate, get matched to a catalog archetype, fill in the few slots it
  can't infer, preview the actual generated output, then activate.
- **`/dashboard`** — operator view across every tenant/client/agent:
  status, price vs. cost this month, links into each agent.
- **`/dashboard?tenant=<slug>`** — the same dashboard scoped to one
  reseller, with their brand name swapped in (the spec's "reseller mode").
- **`/queue`** — requests the classifier couldn't confidently match,
  queued for manual review (how the catalog is meant to grow).
- **`/agents/<id>`** — an agent's config, a **Run now** button that
  executes the real pipeline, pause/resume, and full run history.

No `.env` needed by default:

- Intent classification is local keyword matching against the catalog.
- The trend-brief archetype's execution is real (synthetic data source →
  local template brief → dry-run email written to `output/*.eml`).
- Set `ANTHROPIC_API_KEY` in `.env` (see `.env.example`) to upgrade both
  classification and brief generation to real Claude calls. Set `SMTP_*`
  to actually send the delivery email instead of writing a dry-run file.

## What's real vs. stubbed

- **trend-brief** is the only archetype with a working execution engine
  (`lib/agents/trendBrief.js`), per the roadmap's "one archetype first"
  guidance. The other six catalog archetypes (social poster, booking
  responder, review watcher, competitor tracker, inbox triager, event
  promoter) classify correctly, price correctly, and can be activated —
  but "Run now" returns a clearly labeled not-implemented stub instead of
  doing anything. Building on this: implement `lib/agents/<id>.js` and
  register it in `lib/agents/index.js`.
- **Billing** is data only — each agent has a `price_usd_month` and the
  dashboard shows cost-vs-price, but there's no live Stripe integration.
- **Auth** doesn't exist yet — this is a local single-operator tool, not
  yet deployed or multi-user. Don't put it on the open internet as-is.
- **Reseller white-label** is brand-name swapping via `?tenant=`, not
  real subdomain/custom-domain routing.
- **OAuth/connections** (Instagram, calendar, etc. per the spec's
  "one-click activate") isn't built — trend-brief only needs an email
  address, which the intake flow already collects directly.

## Data model

`lib/db.js` — `tenants`, `clients`, `agent_instances`, `agent_runs`,
`intake_queue`, matching the build spec's "Data model (core tables)"
section. SQLite file lives at `data/app.sqlite` (gitignored) — delete it
and re-run `npm run seed` to reset to a clean demo state.

## Related

- `../` (the CLI) — the original Phase 1 trend-brief pipeline this app's
  `lib/agents/trendBrief.js` is ported from. Both can run independently.
- See the "AI Agent Builder Platform — Product & Build Spec" doc for the
  full roadmap (Phase 4: expand the catalog; beyond that: real auth,
  Stripe billing, OAuth connections, deployment).
