# Beach Day Concierge

A booking platform for a beach-day concierge service in Trinidad & Tobago: a
client books a specific beach, date, and zone; the business claims that zone
with chairs/setup before the client arrives, delivers food, and relays any
drink order to a partner bar across the road (the business never stocks or
sells alcohol directly).

Launch beach: **Maracas Bay**. The data model is multi-beach from day one —
see [Adding a new beach](#adding-a-new-beach).

## Tech stack

- **Next.js 16** (App Router, TypeScript, Server Actions, Route Handlers)
- **Tailwind CSS 4**
- **Prisma 7** + SQLite (via `@prisma/adapter-better-sqlite3`) for the dev
  database — swap the datasource/adapter for Postgres in production without
  touching the schema shape
- The zone map is hand-rolled SVG (polygons over either a generated
  illustrative backdrop or a real beach photo), not a third-party map widget

## Getting started

```bash
npm install
npm run db:push   # create the SQLite schema
npm run db:seed   # seed Maracas Bay: zones, packages, add-ons, a vendor, sample bookings
npm run dev
```

Visit `http://localhost:3000` for the customer-facing site and
`http://localhost:3000/admin` for the ops dashboard. `npm run db:seed` is
idempotent — it clears and re-seeds every table, so re-run it any time you
want to reset to a clean demo state.

## Architecture notes

### Data model (`prisma/schema.prisma`)

`Beach → Zone`, `Beach → Package`, `Beach → AddOn`, `Beach → Vendor` are all
scoped per-beach, so every beach is a self-contained configuration. `Booking`
references a beach/zone/package/date and owns a list of `BookingAddOn` line
items (with a price snapshot, so later price changes don't rewrite history).

Double-booking is prevented at the application layer
(`src/lib/booking.ts#createBooking`): the availability check and the insert
run inside a single Prisma transaction, so two clients racing for the same
zone/date can't both win.

### The zone map

Zone polygons are stored as JSON point arrays in the beach's own coordinate
space (`Beach.mapWidth` / `mapHeight`), not real GPS — precision here is about
relative position on the sand, not literal navigation. `src/lib/zoneGrid.ts`
generates a curved "shoreline band" of zones (rows × cols) with section and
amenity tags assigned from position; `src/components/ZoneMap.tsx` renders
them as an interactive, filterable SVG overlay, color-coded by availability
for the selected date.

If a beach has a real photo, set `Beach.mapImageUrl` and the map renders that
as the backdrop instead of the generated illustration
(`src/components/BeachBackground.tsx`) — no code changes needed.

### Payments

Online card payment (WiPay, the common regional processor) isn't wired up
yet. The booking flow implements the fallback the brief calls for: a booking
is created as `PENDING` / `UNPAID`, the confirmation page shows bank-transfer
instructions and a reference, and staff mark it `DEPOSIT_PAID` / `PAID` from
the admin manifest once the transfer lands. Swapping in WiPay later means
adding a provider in `src/lib/` and a redirect step in
`src/components/BookingWizard.tsx` — the data model (`paymentMethod`,
`paymentStatus`, `amountPaid`) already supports either path.

### Admin

- **Daily manifest** (`/admin/manifest`) — every booking for a date, across
  all beaches, with day-of toggles (setup complete / food delivered) and
  payment actions.
- **Prep checklist** (`/admin/prep`) — chairs needed, package-bundled food by
  guest count, extra food add-ons, and drink-relay orders grouped by zone (for
  the runner to take to the partner bar).
- **Beaches & zones** (`/admin/beaches`) — add a beach and generate its zone
  grid from the admin UI.
- **Packages** / **Add-ons** / **Vendors** — per-beach catalog management.

## Adding a new beach

No code changes required:

1. `/admin/beaches` → add the beach (name, region, map dimensions).
2. Generate its zone grid (pick rows/cols) — or hand-author a `Zone` set via
   the same `polygon`/`section`/`amenities` JSON shape if you need a custom
   layout.
3. Add its packages and add-ons.
4. Optionally set `mapImageUrl` to a real photo once you have one.

## What's intentionally out of scope

- No alcohol inventory, licensing, or direct sale — drink-relay add-ons are
  requests fulfilled by the partner bar, never the business.
- No "roping off" of beach space is modeled — zone claiming is physical
  setup only.
