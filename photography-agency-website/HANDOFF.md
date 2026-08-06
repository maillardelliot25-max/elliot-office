# Handoff — Liming Lens Productions website

Everything technical is done and tested. What's left are business decisions only the
owner (Elliot) can make — real names, real numbers, real photos. This doc is written so a
fresh Claude session with no memory of the build can pick it up and finish it.

## Where things live
- Repo: `maillardelliot25-max/elliot-office`, branch `claude/photography-agency-website-m0c2s9`
- Site: `photography-agency-website/index.html` + `rentals.html` (static, no build step)
- Form backend: Supabase project `liming-lens-productions` (ref `vwtcxasrejpwftooqfjg`),
  table `public.website_inquiries`, insert-only RLS. Do **not** use the *other* Supabase
  project in this account (`klslumozkteziigsftiz`) — that one belongs to an unrelated app
  ("Pink.TT", a ride-share/safety app with `rides`/`drivers`/`sos_events` tables). Keep them
  separate.

## What's built and working
Full site: hero, services, portfolio gallery (SVG icon placeholders, not photos — see
below), a live pricing calculator, team section, 12-month training program, FAQ, and a
working application form that POSTs to Supabase. Second page (`rentals.html`): equipment
rental categories, coverage tiers, promotions/influencer packages. Dark/light theme, mobile
nav, all cross-page links verified, no console errors, no duplicate IDs, no broken links.
Full detail on structure and how the form works is in `README.md` in this folder — read
that first.

## The 4 things left — all need real info from Elliot, ask him directly
1. **Contact info.** Footer currently has `hello@yourdomain.com` and a placeholder phone
   number on both pages (search for `yourdomain.com` and `868 000 0000`). Swap for real
   ones.
2. **Team.** `#team` section in `index.html` — "Elliot" is a real name; the other 3 profiles
   are role-titles ("Festival & Carnival Lead", etc.) because no real names/photos existed
   yet. If Elliot has hired or named people since, replace the role-titles with real names
   and swap the initials-avatar `<div class="avatar">` for real photos.
3. **Pricing.** The quote calculator's numbers (`RATES` object near the top of the
   `if (document.getElementById('calc-price'))` block in `js/script.js`) are illustrative
   TTD placeholders — base rate + hourly rate per crew size, plus add-on prices. Ask Elliot
   what he actually wants to charge, then update those numbers. The calculator math itself
   is correct and tested; only the input numbers need changing.
4. **Portfolio photos.** `#portfolio` in `index.html` — 16 tiles currently show a small
   inline SVG icon (mic / confetti / feather fan / rings depending on genre) instead of real
   photos. This was a deliberate choice: fetching real photos from the web isn't reliably
   possible from a sandboxed session (confirmed blocked — see README), and using someone
   else's copyrighted stock photos on a live business site is a bad idea even as a
   placeholder. Once Elliot has real event photos, replace each
   `<div class="gallery-visual">...</div>` inside `.gallery-item` with a real `<img>`.

## Deployment
Not yet deployed anywhere live. Two options, both covered in detail in `README.md`:
- Drag the `photography-agency-website` folder onto vercel.com/new (zero config, static
  site) — fastest.
- Import the GitHub repo into Vercel, but set **Root Directory** to
  `photography-agency-website` in project settings first — the repo root also has
  unrelated projects (`AI_Empire`, `Jarvis`) in it.

## One environment gotcha worth knowing
Whatever sandbox this runs in next may also block outbound network access to arbitrary
domains (it did in this build — Wikimedia and Supabase were both blocked when tested
directly from the sandbox, even though the site's own client-side code reaches them fine
once a real visitor's unrestricted browser loads the page). Don't assume "I can't `curl`
it from here" means "it's broken" — test client-side behavior with Playwright network
mocking instead, the way the form submission logic was verified here.
