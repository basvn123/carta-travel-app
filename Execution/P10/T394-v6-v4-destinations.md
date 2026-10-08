# T394: visual and dynamic: Destinations browse

## Task ID

T394 (design wave V4, session 4 of 10; surface key `destinations`).

## Date

2026-10-08

## What changed

No text sits on a photograph on the Destinations tab any more. The country cards of the Trails index carry the flag, the name, the mono count and the chevron in a solid band under the photograph, and the band turns ink while pressed; the two gradient scrims are deleted. The composed trip cards moved their name, score and day chips from the photograph into the body. On the place cards (beaches, lakes, mountains, cycle routes, walks) the ochre seal moved from the photo's corner to the end of the name row, and the small facts that rode the corner (distance from a searched place, a swimming verdict that is not a plain yes, a lift to the top, whose photograph it is) now lead the hook line as words; a lake's verdict carries a 6 px dot in its tone so the colour is never the only carrier. Only the 6 px strip stays on the photograph, and each list whose cards carry one now opens with one sentence that says what the strip draws. When the traveller has their own dates on the settings line, every lake card says one month fact ("Water under 18 °C in November", "Warm enough to swim in July", the month in mono) and the lake strip outlines that month in ink. The opening's cards set their one figure in mono with its label under it ("145 km²", "Area"), and Band 1 sits inside the column instead of bleeding to the panel border. "See all N" is ink, not accent. The walk drawn without a photograph is an ink line on flat `--paper-dim` (it was an accent line on a radial gradient). A place line no longer repeats itself ("Montenegro, Montenegro" on the Bay of Kotor).

What moves, and only because the traveller did something. A category switch fades the new section in and lifts it 8 px in `--dur-2`. An active filter chip enters with opacity and scale from 0.9 in `--dur-1`. The tab's own buttons press to 0.97 in `--dur-1`; a card never scales, its caption band answers instead. Every place card and every rail and icon card now opens through `openShared`, so its photograph grows into the page header the beach, lake, mountain, trail and cycle pages already claimed (`DetailSkeleton` `hero.sharedKey`). The filter sheet rises from the bottom on a phone and fades and lifts 8 px on a desktop in `--dur-3`, and now also leaves, in `--dur-2`, through every door (cross, scrim, Escape, apply, swipe); the desktop sheet lost its grab handle, and an option with a zero count reads as dead. "Show N places", the Filters and All filters count chips and the cut counts settle in place with one opacity dip (`useSettledFigure`), never a count-up. The place card skeleton is still (it breathed in a loop), and the composed trips list loads as card skeletons instead of an ellipsis. The photo hover zooms on place, country and trip cards are gone. On a phone the six category buttons are one row each at `--tap` with a 20 px icon before the label, and once Band 3 starts, the row with Filters and the country sticks under the top chrome as a `--paper` band with a `--rule` border.

How it works, for whoever maintains it. `PlaceCard` takes three new props: `lead` (facts that lead the hook, each `{ key, cls, text }`, the classes kept for the harnesses), `note` (the month row; `undefined` draws no row, `null` an empty one of the same height) and `sharedKey`. `SectionOpening` takes `sharedKey(row)` and `describe` returns `factLabel`. `CardStrip` takes `month`. `PlacesFilterSheet` delays its parent's `onClose` by `durationMs('--dur-2')` (0 under reduced motion) and reads that callback through a ref; this also fixed a keyboard bug: the parent passes a fresh arrow every render, the focus trap effect depended on it, and every chip toggle sent focus back to the cross (after the fix, focus stays on the toggled chip, checked in the browser). `placeLine()` in `cardFillings.js` joins place parts and drops a repeat.

Choices taken where impeccable would have asked, under the owner's instruction to proceed (2026-10-07), each keeping Carta's palette, type and identity. Refinement only. The seal stays a chip and moves into the head row rather than onto a new band. The icon and rail cards do not gain a seal (brief V4-2 asked for one): it would put a chip back on a photograph; the label under the figure carries the family likeness instead. The strip stays on the photograph's bottom edge, keyed in words. The month fact appears on lakes only, because only the lake wire has monthly values. Row T384-g is decided: the phone keeps 36 cards a page (verify_paging holds it, and the sticky refine row keeps the filters in reach through the list); the 8,000 px opening target is retired for this wave.

## Files touched

App repo (branch `p10-v6-visual-destinations`, one commit `271365f`):

**Modified:**
- src/browse/DestinationsTab.jsx
- src/browse/PlaceCard.jsx
- src/browse/CardStrip.jsx
- src/browse/SectionOpening.jsx
- src/browse/PlacesFilterSheet.jsx
- src/lib/cardFillings.js (`placeLine`)
- src/styles/23-places-pages.css (scrims, radial ground, photo-of ground, overlay rules and hover zoom deleted; names in ink; category transition on tokens)
- src/styles/30-section-opening.css (Band 1 in the column, "See all" in ink, figure label)
- src/styles/37-card-fillings.css (seal in the head, corner and hover zoom rules deleted, skeleton still)
- src/styles/63-v6-destinations.css (the T394 section; two dead T384 phone rules removed)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (6 keys each: `places.monthSwim`, `places.monthCold`, `places.stripTrail`, `places.stripCycle`, `places.stripLake`, `places.stripMtn`)
- tests/cardFillings.test.mjs (one test for `placeLine`)

**Created:** none.

Root repo (branch `p10-v6-visual-destinations`):

**Created:**
- docs/design-v6/plans/V4-destinations.md (the plan, committed before the first app edit, `95aa52ca4`)
- Execution/P10/T394-v6-v4-destinations.md

**Modified:**
- Execution/_OPEN.md (rows T394-a to T394-i; T384-g closed)

## Commands run

In the app worktree, against the shared node_modules (intact today):

    node node_modules/vite/bin/vite.js build          (base, before any edit, then after; not npm run build, whose prebuild rewrites public/)
    node node_modules/vite/bin/vite.js preview --port 5204 --strictPort
    node --import <scratch>/pwfix.mjs scripts/verify_places_tab.mjs http://localhost:5204/   (and verify_paging, verify_places_search, verify_country_cards, verify_category_rail)
    CARTA_REPO_ROOT=<root worktree> node --import <scratch>/pwfix.mjs scripts/verify_regions.mjs   (from PowerShell, its own preview on 4213, with 5204 stopped)
    node --import <scratch>/pwfix.mjs scripts/verify_keyboard.mjs --port 5204
    node --import <scratch>/pwfix.mjs scripts/verify_quality_floor.mjs t394 --port=5204 --only=pages
    npm test
    npm run lint
    node scripts/ci/design-lint.mjs
    sh .claude/skills/impeccable/scripts/impeccable detect --json <every changed file>
    for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
    rm -rf dist dist-data

`pwfix.mjs` is a scratch preload outside both repos: the installed `playwright` is 1.61.1, which asks for `chromium_headless_shell-1228` and `webkit-2311`, and the shared browser cache holds 1243 and 2359. The preload points `launch()` at the installed builds; nothing was installed (row T394-g). Impeccable `context --target src/browse/DestinationsTab.jsx` ran once from the root worktree. The critique ran as two isolated subagents (A: design review from the source and twelve screenshots; B: the detector and greps); the browser overlay was skipped because the machine had about 2 GB free with five sessions running. Screenshots and the phone checks came from scratch Playwright scripts outside both repos.

## Config and secrets set

None.

## Before/after measurements

Harnesses on the built app (before: the branch base, built before any edit; after: the final build):

| Harness | Before | After |
|---|---|---|
| verify_places_tab | 39 of 39 PASS | 39 of 39 PASS |
| verify_paging | 7 of 7 | 7 of 7 |
| verify_places_search | 41 of 41 | 41 of 41 |
| verify_regions | could not start (reads `pipeline/regions/quotas.py` from the app's parent; fixed by `CARTA_REPO_ROOT`) | 30 of 30 |
| verify_country_cards | 24 of 28 | 24 of 28; the 4 failures are on Explore's guide cards (`.guide-ccard` price and tap box), not this tab's (row T394-h) |
| verify_category_rail | times out on `.explore-filterbar .places-filter-btn` | the same; Explore's harness (closed row T384-e) |
| verify_keyboard | not run | 15 of 16 cases PASS before the 500 s timeout on this loaded machine; all four Destinations cases PASS (destinations and destinations-trails at 380 and 1280); the one FAIL is journey @380, one stop without a ring, on the trips surface (row T394-h) |
| verify_quality_floor, pages | not run | Destinations views: h1 1, contrast 0, motion 0, gradients 0, small targets 0 on a phone and 3 on desktop (fine pointer); monoProse 10 on dest-list, all `span.jcap-fig.mono` of the trips surface's journey cards |

The surface:

| Metric | Before | After | Source |
|---|---|---|---|
| Gradients in the five surface stylesheets (code lines) | 5 (2 scrims, 1 radial ground, 2 mask lines) | 2 (the mask) | grep over 23, 30, 37, 45, 63 |
| Transitions or animations with a literal duration in those files | about 20 | 14 (all in 23, other surfaces' blocks of the old file) | grep |
| Text or chips on a photograph, place cards of a Beaches page | 36 seals, plus corner facts | 0 (`.pcard-band .pcard-seal, .pcard-corner, .places-card-scrim` count) | page query, Pixel 5 and iPhone 13 |
| Trails country cards with a caption band | 0 of 41 | 41 of 41, band 44 px | iPhone 13 WebKit |
| Phone category button height | about 53 px | 44 px (`--tap`), all six | Pixel 5 screenshot, 360 x 740 query |
| Lakes opening heading, top on Pixel 5 | about 327 px | about 309 px | B-opening-android, A-opening-android |
| Cards that open with a shared element | 0 (only the composed trip card) | every place, rail and icon card | code |
| Counts that settle in place | 0 | 4 (Show N, Filters badge, All filters chip, cut counts) | code |
| Refine row on a phone after scrolling into the list | scrolled away | stuck at the top of the tab's scroll box (102 px from the viewport top on both phones) | page query |
| Impeccable detector over the changed files | 0 (critique run, B) | 0 | detector, exit 0 |
| Design lint | 194 violations, 194 in the baseline | 189, 0 new | design-lint.mjs |
| npm test | 367 of 367 | 368 of 368 | node --test |
| eslint | 0 errors | 0 errors, 61 warnings (one in DestinationsTab.jsx, `Icon` unused, present before) | npm run lint |

Phone checks. iPhone 13 (WebKit), Pixel 5 and 360 x 740 (Chromium): no horizontal scroll of the page or the tab's scroll box in any of the six categories (the only boxes past the edge are inside the rails, which scroll by design). Landscape 844 x 390: no horizontal scroll. Tap only: every new hover rule sits in `@media (hover: hover)`; the press states are `:active`, so nothing waits on a hover. The on-screen keyboard: with the search focused and the viewport 40 percent shorter (393 x 511), the field ends at 277 px and the bottom nav starts at 425 px. Safe areas: no new fixed bar; the sticky refine row sticks inside the tab's own scroll box, under chrome that already reads the insets; nothing new reads `100vh`. Thumb reach: the tab's one primary is the sheet's "Show N places", at the foot of the sheet. Tap targets: the six categories are 44 px; the country band is 44 px; the country picker in the sticky row is the V3 control (38 px in landscape, row T384-l). Swipe: the sheet's swipe still has the cross and Escape; rails keep "See all" and the cut chips. Reduced motion: the section arrival and the sheet animations compute to `none`, and Escape closes the sheet at once. What only a real phone can prove is row T394-d.

Screenshots (JPEG, quality 80, viewport only, ten) in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\destinations\`: V4-opening-iphone, V4-opening-android, V4-opening-desktop, V4-walks-android, V4-walks-desktop, V4-grid-desktop, V4-sticky-iphone, V4-month-android, V4-filters-android, V4-filters-desktop.

Carta-design's seven questions, over the diff. One: no hex added; four rgba literals and two white text shadows were deleted with the scrims and the overlay. Two: no gradient and no new colour; the two scrims and the radial ground are gone, and the walk line left the accent. Three: ochre stays on the rating seal only; the lake verdict's dots use the tone tokens it already had, the month's good news uses `--status-success` as a 6 px dot beside ink words; `--danger` and teal untouched. Four: mono carries the figures, the counts and the month; every new sentence (the strip keys, the month fact) is in the sans. Five: one primary per view, the sheet's "Show N places"; "See all N" left the accent. Six: the new strings carry a number or a month, sentence case, no dash, no banned word. Seven, remove one thing: the hover zoom on every photo card, and the gradient scrim under every country name.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Playwright could not launch any browser | `playwright` 1.61.1 in node_modules asks for builds the shared cache lacks (`chromium_headless_shell-1228`, `webkit-2311`) | A scratch preload points `launch()` at the installed 1243 and 2359 builds; nothing installed (row T394-g) |
| verify_regions failed before any check | It reads `pipeline/regions/quotas.py` relative to the app's parent, which is `wt\` for a worktree | Run with `CARTA_REPO_ROOT` set to the root worktree, from PowerShell |
| Focus jumped to the sheet's cross after every chip toggle | The focus-trap effect depended on the parent's `onClose`, a fresh arrow each render | The sheet reads the parent's callback through a ref; its own `onClose` is stable |
| `.places-card-km` and the lake verdict would have stayed absolutely placed inside the hook | Their old rules in 23 were drawn for the photograph | Rewritten in 23 as inline words (the file is this surface's) |
| sed turned `es.js` to LF line endings | Git Bash sed on a CRLF file | Restored to CRLF before the commit; the diff is six lines a catalogue |

## What is still open

The cost line on outdoor cards (brief V4-7, carta-design "Cost on cards") is not built: the tab receives no cost map, App.jsx computes the one `computeCosts` map Explore prints, and a second map in the tab would be a second path to the same figure; it also needs a nearest priced town within 25 km per row (row T394-a).

Row T384-f stays open: the TRIPS-LAYER rules in `24-destination-workspace.css` cannot move in this wave, because the wave's scope excludes another surface's file and moving means deleting there. The trip card is restyled from 63 meanwhile. Row T384-b (the coverage line) still waits on T373-e.

The month fact shows on lake cards only; beaches, mountains and walks carry no monthly field on the wire (row T394-b). The iPhone (WebKit) draws Fraunces visibly heavier than Chromium at the opening heading and "Browse the full list" (row T394-c, shell). Real-phone checks (row T394-d). Native review of the six new strings (row T394-e). The shared sheet's own keyframes and its 44 percent scrim in `14-filters-panels.css` run on literals and differ from the one scrim rule; this tab overrides its own sheet's motion only (row T394-f). The browser cache and the installed Playwright disagree (row T394-g). Two harness failures on other surfaces (row T394-h). On a phone the opening's cut chips still stack one per line, a screen of long labels before Band 3, and rails have no arrow keys or mono position yet (brief V5-2): V5 polish (row T394-i).

## Rollback procedure

App repo: `git -C <app> revert 271365f` on master after the merge, or drop branch `p10-v6-visual-destinations` before it. Nothing else depends on the new props, the six keys or `placeLine`; the revert brings back the scrims, the corner facts on the photograph and the breathing skeleton in one step. Root repo: revert the plan commit `95aa52ca4` and the report commit; reverting the report commit reopens T384-g. No data, schema or migration is involved.
