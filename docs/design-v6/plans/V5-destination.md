# V5 plan: Destination (town) page

T405, design wave V5, 2026-10-09. Surface key `destination`. Written in planning mode from `docs/design-v6/briefs/destination.md` (part 6, the V5 list, and its Direction check), `docs/design-v6/DIRECTION.md`, `docs/design-v6/OWNERSHIP.md`, the T385 and T395 reports and the carta-design skill. Committed before the first app commit and then carried out. The report (`Execution/P10/T405-v6-v5-destination.md`) says what was done and what stayed open.

## Audit and critique of the V4 result (impeccable audit and critique, run unattended)

Method: the built V4 state (app 592db0d) served by `vite preview` on port 5205; the detector over the surface files; the design lint; a phone walk with device descriptors (iPhone 13 on WebKit, Pixel 5, 360 x 740, landscape) on Rome (FCO), Valbona Valley (gem:valbona) and Zungoli (gem:zungoli) with every fold expanded, measuring tap targets, sideways overflow, heading order and where focus lands on open.

Detector: 8 findings, all `side-tab`, 7 in 18-detail-panel.css and 1 in 19-guide-ratings.css, on day planner and guide rules (T395-d); none in a JSX file or in 64-v6. Design lint: 166 violations, all baselined, 0 new. Landscape (750 x 342): 9 controls under 44 px, the gallery takes 200 of 342 px.

Findings and what this plan does with each:

1. [P1] Tap targets under 44 px on a touch screen: the gallery arrows and the close cross in landscape (38 px), the receipt's selects and dates (28 px), the highlight Wikipedia links, the parking Google Maps and Waze links, the credit link (brief V5-1). Item 1.
2. [P1] Focus on open lands on Back (phone) or on Share (desktop), which shows a ring the traveller did not ask for; the place name is an h2 over h3 folds and h4 subheads, so the outline has no h1 (brief V5-3, V5-4). Items 3 and 4.
3. [P1] A failed PDF writes to the console and nothing else; a dismissed share sheet copies the link silently; a blocked clipboard says nothing (brief V5-5). Item 5.
4. [P2] Receipt-like lines round: neighbourhood nights print `€${n}`, tier lines and the bed-price fold summary round to whole euros (brief V5-6, T385-i). Item 6.
5. [P2] The PDF follows the old order (must-sees first, costs late), carries the pre-T363 accent `#e05a47` and mute `#7d8393`, and rounds the tier and neighbourhood prices (brief V5-7, T363-b for this file). Item 7.
6. [P2] The gallery height uses `vh`, and in a short landscape window it is 200 of 342 px, above the 40 percent hero rule (T395-h). Item 2.
7. [P2] Long names and long languages: unchecked in German, French and Dutch at 360 px. Item 8.
8. [P3] `verify_hero_images.mjs` looks for `.panel-hero-img`, which the page has not rendered since its v2 gallery (T385-g). Item 9.

Choices made where impeccable would ask (the owner's proceed instruction, 2026-10-07): refinement, never a new direction. Palette, faces and the receipt stay. Where the brief says "two decimals" for a price, the page uses `eurExact()` from `lib/format.js`, the same helper the landing receipt runs on; a whole-euro figure from the dossier is then printed with `.00`, which is honest about the precision the data has. The day figure (cost.dayEur) is an estimate shown in whole euros everywhere, page and PDF alike, so it stays whole.

## Changes, in order

1. Tap targets (brief V5-1). In 64-v6, inside `@media (pointer: coarse)`: the back arrow, close cross, bar buttons, gallery arrows, the highlight Wikipedia link, the parking links and the receipt's selects and dates are `--tap`; a fine pointer keeps 28 to 32 px. Done when the walk's under-44 count on a touch screen is 0 for this page's own controls.
2. Dynamic viewport and landscape (T395-h). The gallery height reads `dvh`; in a short landscape window it is 40 dvh. Done when the landscape gallery is at most 40 percent of the viewport height.
3. Focus on open (brief V5-3, rule 10). DestinationPage.jsx: on a fine pointer the place name (`tabIndex -1`) takes focus and shows no ring; on a coarse pointer the back arrow keeps it. Done when `verify_keyboard.mjs` reports 20 of 20.
4. Headings (brief V5-4). The place name is the h1, folds are h2 (the `level` prop of `Fold`, no change to Fold.jsx), subheads inside folds h3, and RoutesFromHere's block heads h3. Done when the quality floor reports clean heading order for the page.
5. Errors (brief V5-5). A failed PDF shows "The PDF could not be made. Try again in a moment." in a polite status line under the bar; a blocked clipboard shows "Your browser blocked copying. Copy the link yourself:" with the link selectable; a dismissed share sheet copies nothing. Three new `dest.*` keys in six catalogues. Done when a forced failure shows the line.
6. Numbers (brief V5-6, T385-i). Neighbourhood nights, tier lines and the bed-price summary go through `eurExact()`. The `dest.tier*` and `dest.sleepSummary` strings lose their euro sign in six catalogues, because the figure arrives formatted. Done when grep finds no `€${` in the surface's files.
7. PDF parity (brief V5-7). destinationPdf.js: the order follows the page (at a glance, cost, when to go, routes, around, things to do, must-sees, trips, sleep, tips, festivals, parking, checklist, practical, credits); the palette reads the current tokens; tier and neighbourhood prices print to the cent. The one day figure is `cost.dayEur`, as on the page. Done when the PDF's day figure matches the page.
8. Long names and empty data. A place name, a German compound and a long neighbourhood wrap instead of pushing a row sideways. Walk in en, de, es, fr, it and nl at 360 and 390 px; Zungoli (a town with almost nothing) and Valbona Valley (trails). Done when no horizontal scroll and no ellipsis on an action label.
9. Harnesses (brief V5-9). `verify_hero_images.mjs` repointed at the first gallery slide, with a comment. Any assertion that encodes the old design is updated with a comment, never deleted.
10. Detector and lint (brief V5-8): `impeccable detect --json` over every changed file; `node scripts/ci/design-lint.mjs` 0 new.

Not in this wave, as register rows: the receipt's own sizes and settle (FirstRunReceipt.jsx, landing's); the fold icon size (Fold.jsx, shell's); the outdoor pin hues (shared tokens); the side-tab findings in 18-detail-panel.css and 19-guide-ratings.css (rules of other views); the token-mirror module for the PDF (T363-b, no owner file).

## Checks

Six i18n catalogues parse; `npm run lint` 0 errors; `npm test`; `node scripts/ci/design-lint.mjs` 0 new; `node scripts/check_ownership.mjs`; `npm run build`, then delete dist/ and dist-data/; `impeccable detect --json` over every changed file. Harnesses on a preview at 5205: verify_destination_page, verify_routes_block, verify_stay_tiers, verify_transport_links, verify_hero_images, verify_keyboard (20 of 20), verify_quality_floor. Phone walk with device descriptors, landscape, tap only, keyboard at 60 percent height, safe areas. After screenshots to `design-v6-shots/destination/V5-*` with the V3 and V4 view names. Measured before and after: controls under 44 px on a touch screen, landscape gallery share of the viewport, heading order, focus target on open, detector findings, harness results.
