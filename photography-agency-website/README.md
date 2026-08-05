# Liming Lens Productions — Website

A single-page, dependency-free site for the agency: services, bookable rate tiers,
team, the 12-month training/contract program, FAQ, and an application form.

## Structure
- `index.html` — all page content/sections
- `css/style.css` — theme tokens, layout, dark/light mode
- `js/script.js` — theme toggle, mobile nav, pricing toggle, FAQ accordion, scroll reveal, form handling

## Running locally
No build step. Open `index.html` directly, or serve it:
```
python3 -m http.server 8080
```

## Things to customize before launch
- Replace placeholder team names/bios in the `#team` section with real ones (and real photos instead of the initials avatars).
- Update rates in `#rates` to match your actual pricing.
- Replace the contact email/phone in the footer and form copy.
- Swap in real photo/video work — hero section and service cards are built to hold background images (`.hero-bg`, `.card-icon`).

## Known gap: the application form has no backend
Right now submitting the form just shows a success message client-side — nothing is
actually sent anywhere. Before launch, wire it to one of:
- **Formspree / Netlify Forms** — zero backend code, fastest to set up.
- **Supabase** (already available as an MCP tool in this environment) — store applications
  in a table, and you get a dashboard for free.
- **EmailJS** — sends straight to an inbox from client-side JS.
