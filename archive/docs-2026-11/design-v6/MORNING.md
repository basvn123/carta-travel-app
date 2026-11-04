# Carta design V6: the morning page

Written by T412, 2026-10-13. Six waves (V1 to V6) refined every surface of Carta on the same palette, type and identity. Nothing is merged to production: the result is a preview.

## Open these

- Preview: https://design.carta-app.pages.dev (deploy f90ca4fe). The per-deploy URL https://f90ca4fe.carta-app.pages.dev cannot read the data host; use the design alias.
- Before and after gallery: `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\index.html` (open it as a file). Phones first, 71 before and after pairs.

## What changed, per surface

- Landing and first result: a first result with a receipt, every control a 44 px target, selects that look the same in Chromium and WebKit.
- Explore: a calm page of control bar, three rails and a four-fact card; the star and info controls reach 44 px; a split map.
- Destinations and the destination page: one toolbar and 6 px chips; folds in the planning order with a cost receipt; one h1, one close and one back control in the house style.
- Trails, beaches, lakes, mountains, cycling: the picture and the facts a walker needs first; a 15 MB cycle hero is now 0.4 MB.
- Journeys, trip planner, day planner, My trips: the week at a glance; a real dialog wizard; a map-first day planner with undo; solid-band cards on My trips with the next trip as the focal card. T411 made the joins consistent: 18 typed close glyphs became one icon, and the page the nav calls My trips is called that everywhere.

## Check results (T412, on the merged V5 plus T411 build)

- `npm run lint` 0 errors (65 warnings, unchanged); `npm test` 368 of 368; design lint 141 found, 141 in the baseline, 0 new; banned terms none; six catalogues parse; the detector over `src` 0 findings; `npm run build` and `npm run build:pages` pass (94 files, 7.9 MiB).
- `verify_keyboard` 22 of 22. `verify_quality_floor`: one floor line fails, 2 phone targets under 44 px (one journey cost bar segment that already has a 44 px hit box the floor cannot see, row T411-k); 0 screens without one h1; 0 console errors.
- 62 surface harnesses: 54 pass. Eight fail exactly as on the V5 base (country_cards, cycling, lakes, trail_page, day_workspace, day_steps, trip_landing, stay_tiers); each has a register row. Detail in Execution/P10/T412-v6-release.md.
- Preview on iPhone 13 (WebKit), Pixel 5 and desktop: Explore, a destination, a trail, a journey, the trip planner, the day planner and My trips all open with no page errors.

## Still open

- Owner: push the data first (runbook C3; `trails/stubs/AL.json` answers 404 on the data host), then promote the preview to production with runbook block C (C2 to C5).
- The 7-day forecast is blocked by the CSP in `public/_headers` (api.open-meteo.com; rows T221-h, T413-b).
- Owner: native review of the new strings in de, es, fr, it and nl (T411-n) and a real-phone pass (T411-o).
- Product calls from the critique: the three figures for one trip and the pass dialog that opens by itself (T411-b, T411-e).
