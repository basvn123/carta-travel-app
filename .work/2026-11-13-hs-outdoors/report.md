# Report: outdoors lane of the house style run (G1, G8)

- **Status:** done. Judges 100 then 108 of 135; the one criterion under its mark (one coherent system, 3) waits on an integration step in the place lane's file
- **Date:** 2026-11-16 to 2026-11-17
- **Level:** L2, `crew:design` playbook (autonomous; Stage 7 pre-approved by the owner)
- **Branch:** `p15-hs-outdoors` (worktree `wt/hs-outdoors`), from `p15-housestyle`; the lane merged `p15-housestyle` at `e890b35789` (the place lane's template) before building, so the diff base is `e890b35789`.
- **ROADMAP:** G1 (house style), G8 (no grey tile), G10 (one axe fix)

## Result
The trail, cycle, beach, lake and mountain pages now read as a walker's instrument in the house style. Right under the name sits **the board**: the measured figures (grade, length, time, climb, high point, route; or water class, underfoot, length, faces; or height, prominence, way up, season) as one paper panel with hairlines between cells, label over a tabular figure, the figure the loudest thing. The jump bar and the hook follow it. On a desktop the 380 px side card no longer repeats what the board says: it holds the one umber primary, the secondaries and the stay, now the kit's **signpost plate** (the town, how far, the day it costs on the tip). Below 1024 px the foot bar's figures wait until the board has scrolled away. Before you go, Getting there and the shore read as rows on hairlines with bare icons; the grade, water class, months, cells, facilities and the route block are paper panels; every drawn measure is on the one umber ramp. No grey tile: a list without a single photo is rows, one missing photo among photos is the kind's world tile. The tablet has its own layout. Nothing the pages did was removed.

## How the run went
1. **Explore** (2 explorers): `explore-item-pages.md` (render tree, the function-parity checklist, states, redundant text, pinned selectors), `explore-lists-kit.md` (nearby, near page, lists, the kit and the DESIGN.md rules that bind).
2. **Directions** (`directions.md`): A the walk board, B map leads, C profile ribbon.
3. **Critique** (2 critics): `critique-clarity-angles.md`, `critique-a11y-feel-system.md`. Both ranked A first; B broke the pinned section order, C split the profile's scrub from its map and would animate at first paint.
4. **Decision** (`decision.md`): A with the critics' fixes (board before the jump bar, desktop mosaic 320 px, each figure once, world tiles, the profile scrub as the signature act, no draw at load, no relief).
5. **Build** (this session), checks, shots.
6. **Judges**: judge 1 (100 of 135, FAIL on four criteria, 5 blocking), fix round, judge 2 (see below).

## What changed, per screen (before, after)
| Screen | Before (`start/`, after the place template) | After (`shots/`) |
|---|---|---|
| Item head and first view (all five) | Head, jump bar, a 20 px hook, then six grey tiles with icon discs; at 1440 the facts sat below the fold beside a side card that repeated five of them | Head, the board (two across on a phone, three from 600 px, four in one row when there are four, an odd last cell closing the frame), jump bar, hook; at 1440 the board ends above the fold beside the side card |
| Side card (1024 px up) | Sunken card, "The walk" title, a five-row table repeating the facts, primary, GPX and Directions, a beige stay box "24 km, €134 a person a day" | Paper card on a hairline: rows only the card has (sea in a month, warmest month, parking, entry, paved share), the primary, secondaries, the stay plate |
| Foot bar (below 1024) | Figures and the climb link always shown | "Add to day" always; the figures and the climb link rise once the board has scrolled away |
| Tablet 820 | A stretched phone: six full-width tiles, two full-width buttons, a full-width stay box | Board three across; secondaries beside the stay plate; rows two across; cards three across |
| Route (trail, cycle) | Sunken block, map, profile; side note "Loop" | Paper panel; the profile's steepness on the umber ramp; the scrub's map pin settles when it lands; no side note |
| Before you go, Getting there, the shore, routes to the top | Sunken tiles each with a subline ("Marked on the ground", "You finish where you started", "Estimated from the height and the climate") | Rows on hairlines with bare icons; sublines only where they add ("Estimated", "Route GR 7", the one-way "plan the way back") |
| Water class, months, cells, facilities, surface mix, stages | Sunken panels, lagoon-blue months and steps | Paper panels; the umber ramp; the current month on the selected wash |
| Along the way, Other X nearby | Six grey tiles with a drawn dot | Rows on hairlines when no item has a photo; photo cards with the world tile for a single missing photo |
| German, 360 | "Alpinwanderung" broke mid-letter in the board | Hyphenates at a syllable (`hyphens: auto`, the page's `lang`) |

Screenshots (not committed): `.work/2026-11-13-hs-outdoors/shots/<screen>-<width>.png` for trail, beach, lake, mountain, cycle at 390, 820, 1180, 1440, with scrolled views `-s1` to `-s6`; `trail-de-390/820/1440.png`; `trail-360-360.png`; sweep `shots/sweep.json`. Lists (explore lane's styling, unchanged here): `shots-lists/`. Before: `start/` and the orchestrator's `shots-before/`. Rounds: `r1/` to `r5/`.

## Every function kept
The checklist is `explore-item-pages.md` section 2. What moved or changed in presentation only:
- **The board moved above the jump bar**; the hook below it. Same data, same order of sections, same ids.
- **Side card rows marked `board: true`** are not drawn beside the board (the board shows them on the same screen); below 1024 px the card never had rows.
- **The foot bar's figures** and the "climb, loop" link (it scrolls to the first section) are hidden while the board is in view; the jump bar does the same scroll, and both come back once the board leaves.
- **The shape row** under Getting there is drawn only for a one way route (the board's Route cell says Loop or Out and back); the Route section's side note (the same word) is not drawn.
- **Stay nearby** is the same link to the same page, with the same name, distance and `formatMoney(view.day(...))` price and the traveller's unit, drawn as the kit's `Plate`.
- **Cycle map**: `role="img"` became `role="group"` with the same name (axe nested-interactive: the role hid the map's zoom buttons).
- Copy: `ox.seasonEst` "Estimated", `ox.waymarkedRef` "Route {ref}"; retired `ox.seasonText`, `ox.waymarkedText`, `ox.shapeLoop`, `ox.shapeBack`, `ox.stayLine`, `ox.stayPrice` (no reader left), in all six catalogues.

## Checks
See `checks.md`. Final: `npm test` 2,122 tests, 25 fail, exactly the sparse baseline (`test-r4.txt`, after the last commit); `npm run lint` 0 errors; fast build ok; design-lint 0 violations in the lane's files; token-contrast 0 under; impeccable `[]`; axe on all five item pages at 390 and 1440 clean (`axe-items-r2.json`); width sweep 50 of 50 clean; the outdoor verify scripts fail the same way (or less) than on the base build served beside it (missing wire files in the sparse worktree, CORS from the production data host, stale selectors): `verify-lane/` against `verify-base/`.

## Judges
- `judgement-1.md`: 100 of 135, FAIL (ownable 3, system 3, craft 3, alive 3; every function 5). Its five blocking items: the scrub pin settle (built), the stay as the signpost plate (built), one fact grammar on the shared template (filed as an integration step: `foundation-requests.md` item 1, the place lane's file), no wall of placeholders, no orphan shape row and a key-based dedupe (built), the cycle axe fix committed (done).
- `judgement-2.md`: 108 of 135. Every function 5, accessibility 4, honest numbers 4, every size 4, alive 4; one criterion under its mark: one coherent system 3, because the place page still draws its facts as tiles. Judge 1's items 1, 2, 4 and 5 fixed; item 3 "acceptable for the lane's merge", but the run must not close until the orchestrator applies `foundation-requests.md` item 1 and a judge rechecks place and outdoor pages together. Its nits are fixed in `4fe2a8723f` (the lake's "23°" said once with its month, `ox.peakC` "{c}° in {month}" in six languages; a lone row's double rule; the doc wording). Not done: locale-aware `km1` in `TrailPage.jsx` (pre-existing, outside the lane's diff; German shows "102.2 km")

## Departures from the house style, and why
- The board is scoped to `.oxp`; the place page keeps its soft tiles until the orchestrator moves the rule into `88-place-template.css` (item 1 of `foundation-requests.md`).
- No relief band on outdoor pages: DESIGN.md does not list them (owner suggestion, `foundation-requests.md` item 4).
- Add to a day plan opens the day planner, so it has the press and no haptic (navigation, DESIGN.md).

## Final tokens
No token changed (roles only). New screen-scoped classes: `.ox-board`, `.ox-stay-plate`, `.ox-along.is-text`, `.ox-sim.is-text`; keyframes `ox-rise`, `ox-pin-settle`.

## Files changed
- `.claude/skills/carta-design/references/outdoors.md`: the outdoor look rules (new first section), the grade paragraph
- `continent-app/src/browse/OutdoorParts.jsx`: board order and wrapper, the foot bar's in-view rule, key-based card dedupe, the stay plate, rows without photos, world tiles, `MapSpot` removed
- `continent-app/src/browse/TrailPage.jsx`: card rows marked `board`, season and waymark sublines, the one-way shape row, no Route side note
- `continent-app/src/browse/CyclePage.jsx`: card rows marked `board`, the one-way shape row, no Route side note, the map's role
- `continent-app/src/browse/BeachPage.jsx`: card rows marked `board`, the world for its tiles
- `continent-app/src/browse/LakePage.jsx`: card rows marked `board`, the world for its tiles, the warmest month named in the board's note
- `continent-app/src/browse/MountainPage.jsx`: card rows marked `board`, the world for its tiles
- `continent-app/src/i18n/en.js`: `ox.seasonEst`, `ox.waymarkedRef` shortened, `ox.peakC` names the month; six keys retired
- `continent-app/src/i18n/nl.js`: the same, in Dutch
- `continent-app/src/i18n/de.js`: the same, in German
- `continent-app/src/i18n/fr.js`: the same, in French
- `continent-app/src/i18n/es.js`: the same, in Spanish
- `continent-app/src/i18n/it.js`: the same, in Italian
- `continent-app/src/styles/89-outdoor-page.css`: the outdoor house-style sheet
- `.work/2026-11-13-hs-outdoors/report.md`: this report

## For the orchestrator
- `foundation-requests.md`: item 1 (one fact grammar on the shared template) at integration; items 2 to 5 non-blocking.
- `handbook-notes.md`: ROADMAP lines (G1, G8 partly, T1039-a open), copy changes, project-map lines, owner suggestions.
- Lessons: the item pages' verify scripts read `public/` relative to the working directory: run them from a folder that holds the few wire files they need (`vcwd/`), never from the main checkout.

## How to undo
`git revert 4fe2a8723f 085f805abb 85627cc42a d31d37ea1c 836e2e2d81 e13fc85980 cc76bf798f` (newest first) on `p15-hs-outdoors`, plus the report commit. No data, schema, contract or token change.
