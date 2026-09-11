# The International Trinidadian Jab & Performance Academy

A full-stack, Apple-inspired platform for The International Trinidadian Jab &
Performance Academy — founded by Master Instructor **King Aaron** (The
Accredited King of Jab) and technical lead **Elliot Maillard**.

## Stack

- **Next.js 14** (App Router, TypeScript) + Tailwind CSS
- **Framer Motion** for scroll/entry micro-interactions
- **GSAP + ScrollTrigger** for the signature Flambeau flame scroll sweep
- **Prisma + SQLite** for Enrollment, Booking, Certification, Product, and
  Order records
- **Zustand** for the Pro Shop cart (persisted to `localStorage`)
- **Zod** for API input validation

## Getting started

```bash
npm install
npm run db:push   # create the SQLite schema at prisma/dev.db
npm run db:seed   # seed sample products + certification registry records
npm run dev
```

Visit `http://localhost:3000`.

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Homepage — hero, heritage narrative, 5 Pillars, HSE, talent pipeline, King Aaron spotlight |
| `/academy` | Full 1-month curriculum + all-inclusive tuition breakdown |
| `/enroll` | Student Enrollment Engine (3-step form + waiver + tuition) |
| `/booking` | Talent Agency Booking Portal for directors/promoters |
| `/certification` | Public International Certification & Safety Registry search |
| `/shop` | Pro Shop e-commerce (catalog, cart, checkout) |
| `/king-aaron` | Extended founder biography |

## Backend engines (`src/app/api/*`)

- `POST /api/enroll` — creates an `Enrollment` record (waiver + cohort info)
- `POST /api/booking` — creates a `Booking` record for the talent agency
- `GET /api/certifications/verify?certId=` — public registry lookup
- `GET /api/shop/products` — product catalog
- `POST /api/shop/checkout` — creates an `Order` record

### Payments are demo/sandbox only

This environment has no live payment processor credentials. The enrollment
tuition step and Pro Shop checkout collect the required information and
persist orders/enrollments as `paid_demo` / `processing_demo`, clearly
labelled in the UI as a demo checkout. To go live, wire `src/app/api/enroll`
and `src/app/api/shop/checkout` to a real processor (e.g. Stripe) before
marking a record as paid.

## Seeded certification IDs (for testing `/certification`)

`ITJPA-2026-00001` through `ITJPA-2026-00005` (see `prisma/seed.ts`).

## Heritage framing

The homepage explicitly frames Trinidadian Jab (Diable) as satirical,
anti-colonial resistance theatre born in post-1838 emancipation Canboulay —
not a demonic or religious practice — per the Academy's stigma-prevention
mandate. See `src/lib/data.ts` (`heritageTimeline`, `heritageMythVsFact`) and
`src/components/HeritageSection.tsx`.
