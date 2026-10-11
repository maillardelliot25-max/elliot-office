# Browser games — working notes

Notes so future sessions (and future games) can pick up where we left off.

## What the user wants
- GTA-style open-world games that run in a browser, **especially on Android** (touch controls, good performance).
- Large, LA-style maps, violence (guns, cops, explosions), extensive customization.
- **Human-looking characters, not block figures.**
- Original names and content only. No Rockstar/GTA assets, logos, or brand names.

## Harbor City Heat (games/harbor-city-heat)
- `index.html` is the full game: one file, three.js r128 from cdnjs, no other assets.
- `src/` holds the same code split into parts. Build: `cat p1.html p2.js … p10.js` (in that order) gives the artifact page.
  To make `index.html`, wrap that page in a doctype/head/body with charset and viewport meta tags.
- Parts:
  - p1: HTML and CSS.
  - p2: utilities, save, renderer, sky, textures, terrain, pier.
  - p3: city generation (merged geometry per chunk), districts, streetlights, palms, billboards, shops.
  - p4: particles, glows, people (smooth merged-mesh humans), car models and mods.
  - p5: entities (traffic AI, driving physics, peds, cops, helicopter, rockets, pickups).
  - p6: weapons, player control, camera, world simulation, jobs, GPS.
  - p7: synthesized audio and radio.
  - p8: HUD, minimap, big map.
  - p9: menus (character creator, mod garage, gun shop, settings).
  - p10: input, respawn, day/night, main loop, boot.
- Saves to localStorage key `hch2`.
- Graphics presets Low/Medium/High plus Auto, which steps down when FPS stays under 26.
- Testing: headless Chromium (`/opt/pw-browsers/chromium`, swiftshader).
  - The proxy blocks the CDN, so fetch three.js with `npm pack three@0.128.0` and point the test page at the local file.
  - `window.__hch` exposes test hooks.

## Update 3 (latest)
- Law escalation: 1–2★ police, 3★ SWAT (vans, armored, SMGs, 4-man squads), 4★ police helicopter, 5★ army (olive SUVs, soldiers with rifles) plus an army gunship that fires rockets.
- Units are in `UNITS` (p4): hp, speed, reaction time, accuracy, burst fire, armor. Helicopters live in the `helis` array.
- Civilian archetypes are in `ARCH` (p5): local, jogger, elder, business, tourist, thug (armed, shoots back), brawler (fists). Each has its own walk/run speed, reaction delay and bravery.
- Weapons (`WEAP`, p6): 9mm, .45, compact SMG, pump shotgun, assault rifle, battle rifle, sniper (scope), LMG, RPG.
  - Each has a magazine and reload time, recoil and bloom, damage falloff, and semi or full auto.
- Sports cars: new GT coupe and Supercar types, more common in rich areas. Paloma Motorsport dealers sell them.

## Ideas not done yet
Tanks, gangs and turf, more mission types, a freeway, swimming, an aircraft, rigged or skinned human models.
