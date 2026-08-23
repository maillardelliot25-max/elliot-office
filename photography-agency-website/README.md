# Liming Lens Productions — Website

A dependency-free site for the agency: services, a bookable-quote calculator, portfolio
gallery, team, the 12-month training/contract program, FAQ, a working application form, and
a dedicated equipment rentals & promotions page.

## Structure
- `index.html` — the main site (all sections, one page)
- `rentals.html` — Equipment Rental Offerings, Coverage Tiers (no pricing), and
  Promotions & Influencer Packages; shares the same header/footer/CSS/JS as `index.html`
- `css/style.css` — theme tokens, layout, dark/light mode
- `js/script.js` — theme toggle, mobile nav, pricing calculator, FAQ accordion, gallery
  filter, scroll reveal, form handling. Page-specific blocks (calculator, application form)
  are guarded with an element-existence check so the same script runs safely on both pages.

## Running locally
No build step. Open `index.html` directly, or serve it:
```
python3 -m http.server 8080
```

## The application form is live
Submitting the form on `index.html` POSTs straight to a dedicated Supabase project
(`liming-lens-productions`, project ref `vwtcxasrejpwftooqfjg`) — a `website_inquiries`
table with row-level security that only allows public **inserts** (nobody can read other
people's submissions through the public API). To see submissions, log into
[supabase.com](https://supabase.com), open that project, and check
**Table Editor → website_inquiries**.

The connection details (`SUPABASE_URL` / `SUPABASE_ANON_KEY`) are at the top of
`js/script.js`. The anon/publishable key is meant to be public in client-side code — it
can only do what the table's RLS policy allows, which is insert-only.

If you'd rather get an email/Slack ping on every new submission instead of checking the
table manually, add a Supabase Database Webhook (Database → Webhooks) on
`website_inquiries` INSERT events, pointed at a Zapier/Make/Resend endpoint.

## Deploying (Vercel)
This is a static site — no build command, no framework, no `package.json` needed. Two ways
to get it live:

**Fastest — drag and drop, no Git required:**
1. Go to [vercel.com/new](https://vercel.com/new).
2. Drag the `photography-agency-website` folder (this folder, not the whole repo) onto the
   page.
3. Done — it deploys in seconds with zero configuration.

**Connect the GitHub repo instead:**
The repo root (`elliot-office`) also has unrelated projects in it (`AI_Empire`, `Jarvis`), so
when importing via Git you must tell Vercel where this site actually lives:
1. Import the `elliot-office` repo in the Vercel dashboard.
2. In the project's **Root Directory** setting, enter `photography-agency-website`.
3. Leave Build Command / Output Directory blank (static site, nothing to build).
4. Deploy.

Either way, once you have a real domain, update the canonical links if you add any
(currently there are none) and the contact email/phone in the footer (see below).

## Things to customize before launch
- **Contact info in the footer** — `hello@yourdomain.com` and `+1 868 000 0000` are
  placeholders on both pages. Real visitors will click these (`mailto:` / `tel:` links).
- Replace placeholder team names/bios in the `#team` section with real ones (and real
  photos instead of the initials avatars). Three of the four profiles are currently
  role-titles (e.g. "Festival & Carnival Lead") rather than named people, since real names
  weren't available yet — swap in names once you have them.
- Update rates in `#rates` (the pricing calculator's base/hourly/add-on numbers, in
  `js/script.js` under `RATES`) to match your actual pricing — the current numbers are
  illustrative placeholders.
- **`#portfolio` gallery is placeholder content.** The 16 tiles show a small inline SVG icon
  (mic, confetti, feather fan, rings) per genre — Caribbean Artists, Fetes, Parties &
  Carnival, Weddings — over a colored gradient. These are self-contained illustrations, not
  photos: nothing is fetched from the network, so they render identically everywhere. Replace
  the `<div class="gallery-visual">...</div>` in each `.gallery-item` with a real `<img>` once
  you have actual event photography to show.
- The favicon (browser tab icon) is a simple placeholder mark — a dark rounded square with a
  red circle — defined inline in each page's `<head>`. Swap in a real logo mark when you have
  one.
