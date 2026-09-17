# Agent Builder Platform — Web

The actual website: the 2-input intake flow, an operator dashboard, and
reseller-scoped (white-label) views, per the build spec's Phase 2-3
roadmap. Deployed on Vercel, backed by Postgres via Supabase.

## Running it locally

```bash
npm install
cp .env.example .env   # fill in SUPABASE_URL and SUPABASE_ANON_KEY
npm run seed            # creates an operator tenant + a demo reseller tenant + one demo trend-brief client
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

`SUPABASE_URL`/`SUPABASE_ANON_KEY` are the only required env vars. Beyond that:

- Intent classification is local keyword matching against the catalog by
  default. Set `ANTHROPIC_API_KEY` to upgrade it (and brief generation) to
  real Claude calls.
- The trend-brief archetype's execution is real (synthetic data source →
  brief). With no `SMTP_*` set, the run is logged with the full brief text
  but no email is actually sent (dry-run). Set `SMTP_*` to send for real.

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
- **Auth doesn't exist.** Anyone with the deployed URL can use the intake
  flow, see the dashboard, and trigger runs. Fine for an internal demo;
  add real auth before sharing this URL outside the company.
- **Reseller white-label** is brand-name swapping via `?tenant=`, not
  real subdomain/custom-domain routing.
- **OAuth/connections** (Instagram, calendar, etc. per the spec's
  "one-click activate") isn't built — trend-brief only needs an email
  address, which the intake flow already collects directly.

## Data model

`abp_tenants`, `abp_clients`, `abp_agent_instances`, `abp_agent_runs`,
`abp_intake_queue` — matching the build spec's "Data model (core tables)"
section. Table names are prefixed `abp_` because they live inside a
Supabase project shared with other unrelated apps, not a dedicated one —
the account's free-tier project limit was already used up by other active
projects when this was built. Row Level Security is disabled on all five
tables (server-only access via `SUPABASE_ANON_KEY`, which is never sent to
the browser); nothing about that affects the other tables in the shared
project. Schema lives in the migration applied via the Supabase MCP tools,
not checked into this repo as a `.sql` file — see `lib/supabase.js` for the
table names if you need to recreate it elsewhere.

## Related

- `../` (the CLI) — the original Phase 1 trend-brief pipeline this app's
  `lib/agents/trendBrief.js` is ported from. Both can run independently;
  the CLI still uses its own local SQLite-free, file-based flow.
- See the "AI Agent Builder Platform — Product & Build Spec" doc for the
  full roadmap (Phase 4: expand the catalog; beyond that: real auth,
  Stripe billing, OAuth connections).
