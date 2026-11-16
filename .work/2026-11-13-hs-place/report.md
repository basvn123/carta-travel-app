# Report: place lane of the house style run

- **Status:** done (judge PASS, 111 of 135)
- **Date:** 2026-11-16
- **Level:** L2, `crew:design` playbook (autonomous; Stage 7 pre-approved by the owner)
- **Branch:** `p15-hs-place` (worktree `wt/hs-place`, from `p15-housestyle` at `1bc221b9de`)
- **ROADMAP:** G1 (house style), G3 (one cost card look, place side), G9 (trust made visible), G5, G10

## Result
The place page now leads with what a day costs: after the photo and the name comes a paper cost post whose loudest figure is the day a person, with its formation (getting there, bed, food) and the stay for the party on one signpost plate. On a phone it sits before the tabs; on a tablet it is a two-column card; from 1024 px it is a sticky column that starts beside the photos, so the day, the total and "Plan a trip here" are in the first view at every angle. Region and country pages share the skeleton (photo, name, a paper decision block with the day on a signpost plate and the one primary), the rating sheet reads as a receipt, and every Score in the app is the ink plate. Visual only: no handler, rule or data source changed.

## How the run went
1. **Explore** (3 explorers): `explore-place-page.md` (render tree, function parity list, states, CSS map), `explore-region-country-verify.md` (region, country, rating sheet, verify scripts and the selectors they pin), `explore-kit-proto.md` (the kit as built, the hybrid prototype's place page, before shots).
2. **Directions** (`directions.md`): A post first, B a day plate in the head, C a signpost band. Proposers skipped: the look was decided and the foundation's prototype already fixed the parts; the open question was structure.
3. **Critique** (2 critics, 5 lenses): `critique-clarity-angles.md` and `critique-a11y-brand-feel.md`. Both ranked A first; B had two blockers (a head figure that cannot follow the way picked inside the card, a second plate), C lost the sticky price.
4. **Decision** (`decision.md`): A with the critics' fixes: the day row first and loudest inside the post, the post before the tabs on a phone, a two-column post on a tablet (no second breakpoint for the primary), the desktop post sticky from the top of the page with its own scroll.
5. **Build** (this session): 3 commits, then 1 judge fix commit; checks after each round.
6. **Judge**: a fresh judge, two rounds (see "Judgement").

## What changed, per screen (before, after)
- **Place page, head.** Before: star chip Score, rank pills scrolling sideways, title 32/48 px. After: the Score on the ink plate with its word, rank tags that wrap (axe flagged the scrolling row), title at `--text-headline`.
- **Place page, cost post.** Before: an umber gradient slab titled "Your trip", below the intro, facts, why and overview on a phone (price only in the foot bar), starting at y 580 of 900 on desktop. After: paper post right after the head; the day figure at display size with `PriceItems` on it and the formation under it; the stay on a signpost plate (the engine's total rolling only after the traveller's own change, with a delta note and one polite announcement); the primary right under it on desktop; ways as leg plates in a radio group with arrow keys; stay types as kit choice chips; the receipt as kit cost rows with dotted leaders, a Rounding line and "Not yet" under the total.
- **Place page, layout.** Phone: inset photo track capped at 228 px; the foot bar's figure waits until the post's day row has scrolled away (no duplicate in the first view). Tablet: the post is a two-column card. Desktop: photos in the main column, the 380 px post sticky beside them.
- **Place page, sections.** Jump bar: anchor links with the umber paint bar (was ink pills). Climate bars, stay prices by month and the price-feel scale: one umber ramp (was green). Around tiles: photo above, kind and count below (was text on a dark gradient over the photo with a blurred disc); the relief band from the place's own peaks heads the section when the dossier has heights. A sight without a photo: the world tint.
- **Rating sheet.** The plate and its word, the standing as receipt rows, the parts with the figure as text and a thin umber bar that draws once on open (was sunken tiles and a dark bar).
- **Region page.** Before: a full-width photo with a sparse right column below it; "Bed and food in Ostend: €167 a person a day". After: the photo in the main column and a paper decision block beside it from the top: a signpost plate "Ostend, a person a day, €167", best months, the primary.
- **Country page.** The same decision block: the plate under "Typical day" (its info dot kept), the month strip with good months on the beige wash and the umber bar, getting around, the primary, "Show every place". The photo strip takes the focus so a keyboard can scroll it (axe).

## Screenshots
- Final, every screen at 390, 820, 1180, 1440: `.work/2026-11-13-hs-place/shots/<screen>-<width>.png` (`place` Brussels, `place-gem` Valbona, `place-szg` Salzburg, `region`, `country`, `rating`), sweep and axe in `shots/sweep.json`.
- Scrolled views: `scroll/szg1440-*.png`, `scroll/szg390-*.png`. German: `shots-de/`. Before: `shots-start/`. Rounds: `shots-r1/`, `shots-r2/`.

## Checks
- `npm test`: 2111 tests, 25 failures, the same 25 as the sparse-checkout baseline (`baseline-failures.txt`, `npm-test-r1.txt`); no new failure.
- `npm run lint`: 0 errors. `design-lint`: 0 new (violations went from 4397 to 4393). `token-contrast`: 0 under the floor. Fast build: passes.
- `verify_destination_page`, `verify_rating_words`, `verify_crowd_line_gone`, `verify_relief` (390, 820, 1440), `verify_axe --only place` (0 serious or critical, 0 stops without a ring): pass.
- `verify_why_chips`, `verify_regions`, `verify_hero_images`: fail the same way on the base build (environmental: sparse data, CORS from the production data host); details in `handbook-notes.md`.
- Width sweep 360 to 1920 on all six screens: see `shots/sweep.json`.
- Impeccable detector on the changed files: no findings (`impeccable.json`).
- Signature moment, measured in the browser (`sigcheck.mjs`, Salzburg at 1440): ArrowUp on the checked way moves the pick; the total goes €2,489 to €2,471 with `hs-roll is-down`, a "-€18" delta note and one polite announcement "Total €2,471"; only the checked plate is a tab stop (`-1,0,-1`).
- `verify_handoffs`: the place page's doors (Plan a trip here, Plan one day, the page closes, Belgium picked, Which days in Brussels) pass; its planner checks fail identically on the base build.

## Departures from the house style, and why
- The formation's own day figure is hidden in the post (the day is printed above at display size); a foundation request asks for a prop instead.
- The receipt's leader alignment is fixed locally (a foundation request asks the kit to do it).
- The relief band on the place page has no flat side (cut at 0 %): no text of ours sits on it, so the rule "text on the flat side only" holds trivially.

## Foundation requests, notes
`foundation-requests.md` (4 items), `handbook-notes.md` (ROADMAP lines, shared-file effects on other lanes, i18n, environmental verify failures, owner suggestions).

## Files changed
- `.claude/skills/carta-design/references/place.md`: the place look rules.
- `continent-app/src/browse/DestPriceCard.jsx`: the cost post markup (kit parts; handlers unchanged).
- `continent-app/src/browse/DestinationPage.jsx`: the photos in the main column, the post after the head, the dock's figure watcher.
- `continent-app/src/browse/DestNearby.jsx`: the relief band in Around.
- `continent-app/src/browse/RegionPage.jsx`, `continent-app/src/browse/CountryPage.jsx`: the day as a signpost plate.
- `continent-app/src/browse/CountryGallery.jsx`: the strip focusable where its slides are not links.
- `continent-app/src/i18n/en.js`, `nl.js`, `de.js`, `fr.js`, `es.js`, `it.js`: 4 new keys, `destx.dayCosts` changed, 2 keys retired.
- `continent-app/src/styles/88-place-template.css`: the post, layout, jump bar, gallery, tiles, relief, rating sheet, dock.
- `continent-app/src/styles/19-guide-ratings.css`: the Score plate.
- `continent-app/src/styles/23-places-pages.css`: the month strip.
- `continent-app/src/styles/25-feature-pages.css`: region and country pages.
- `continent-app/src/styles/74-dest-food.css`, `continent-app/src/styles/94-when-stay.css`: the umber ramps.
- Run folder files under `.work/2026-11-13-hs-place/` (report and INDEX line are committed per decision 0002; the rest stays local).

## How to undo
`git revert` the lane's commits (`git log --oneline 1bc221b9de..p15-hs-place`). No data migration, no schema change.

## Judgement
- **Round 1** (`judgement-1.md`): 109 of 135, FAIL on Craft only (3, pass at 4): in German at 390 the foot bar's dates line ran under the primary. Function parity scored 5 of 5 (every handler kept, checked against the explorers' lists). Optional fixes: the go wagon under "a person a day" read as a daily cost, no tab stop when no way is checked, a hyphen as the Rounding minus, the relief blaze outside the band.
- **Fix round** (commit `9ce90aa2c5`): the dates line keeps to its column and ends in an ellipsis; the day row shows bed and food only (the return fare stays in the ways list with its unit); the first way takes the tab stop when none is checked; a true minus sign; the relief's cut line and blaze are hidden (no flat side). Not done on purpose: renaming the country plate (it names the place the price belongs to, as the region plate does, and "Typical day" carries a visible info dot) and filling the stone under the short desktop decision block (optional).
- **Round 2** (`judgement-2.md`): **PASS, 111 of 135**, every criterion at or above its pass mark. The one remaining optional point (bed €97 + food €63 under a €159 day) is recorded in `references/place.md`: each wagon is rounded on its own; the day is the engine's figure.
- Checks after the fix round: `npm test` 25 failures, identical to the sparse baseline; lint 0 errors; design-lint 0 new; token-contrast 0 under; sweep 0 failures; axe 0 serious or critical.

## Next step
For the orchestrator: merge `p15-hs-place` into `p15-housestyle` at integration; apply `foundation-requests.md` (Formation without its day slot, leaders in the kit, a PlateGroup, sheet motion on DialogSheet) and drop the local workarounds; read `handbook-notes.md` for the shared-file effects (the Score plate app-wide, the jump bar and gallery on the journey and item pages, the month strip) and the ROADMAP lines for G1, G3 and G9.
