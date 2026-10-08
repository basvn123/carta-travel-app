# T384: structure, information and flow: Destinations browse

## Task ID

T384 (design wave V3, session 4 of 10; surface key `destinations`).

## Date

2026-10-08

## What changed

The Destinations tab now opens shorter and narrows the same way on both widths. On a phone the six categories sit as a 2 x 3 grid of equal buttons (all six on screen at 360 px; at 380 px only four of six showed before), the active one in ink, and the accent tick that sat over every tile is gone. Inline, under the search field, each section shows one short facet group only (water quality, swimming, how to reach the top, length for cycling, length for walks); every other group lives in the Filters sheet, which a phone opens from its Filters button and a desktop now opens from a new "All filters" row in the side panel, so desktop Beaches reaches 9 of 9 facet groups where it reached 1. Every filter that is on shows as one removable chip above the list (shell's FilterChips, unchanged), ending in "Clear all", which takes the section back to its opening. The opening itself has six icons instead of nine; on a phone it draws the first two rails and turns the other four cuts into one row of chips that apply the same saved filter; walks gain a first rail "Half a day to a day (5 to 20 km)". The search field ranks catalogue towns by how their name matches (exact, prefix, word start, inside a word) through a new pure module, `src/lib/placeSearch.js`. The tab remembers the last category, country and near place in this browser. The Trails country index carries each country's count of published walks in mono, shows the flag on paper instead of two letters of the name when a cover is missing, and offers "Walks near me". A walk card says "Waymarked" after its kind when the wire knows. The `countryName` helper no longer throws on a link without a country, which was crashing the whole app on `#tour=` links (row T375-a). Finally, the `.places-*` and `.side-*` rules this surface owned inside `24-destination-workspace.css` moved into `63-v6-destinations.css`, deleted from 24 in the same commit, with three of them changed on the way: the active sort, the active desktop chip and the search focus ring no longer spend the accent.

How it works, for whoever maintains it. The facet model is still built once (`facetGroups` in DestinationsTab.jsx) and rendered twice; what changed is the filter that decides the inline set: a group shows inline only when it carries `toolbar: true` or has a chip on, on both widths, where it used to be "every group" on the phone and "anything not marked false" on the desktop. Trail length and the composed trips' pace and scale gained the flag. The chip row is built from the same model, so a chip and its sheet entry can never disagree. The remembered state is one localStorage key, `carta.places.v1`, read once per mount before the first `useState`, validated field by field and ignored when malformed; the effects that open a category, country or place from a link run after it, so a link always wins. The opening's phone limit is a `maxRails` prop on SectionOpening (null on desktop); the cut chips call the rail's own `onSeeAll`, so their count is the grid's count.

Choices made where impeccable would have asked, under the owner's instruction to proceed (2026-10-07), each keeping Carta's palette, type and identity: refinement, never a new direction; the near place is not a chip in the active row, because its heading already carries the Clear button and two buttons that undo one thing are one too many (the brief's target table keeps "Near header Clear: same"); the trail index has no sort control, because it would add a control to a screen this wave is cutting and the count on every card answers the same question; the desktop "All filters" sheet opens centred rather than hanging off the button, because the button sits low in a tall panel and a hanging sheet ran off the screen; Filters on this tab is a secondary scoped to the toolbar, so Explore's phone Filters door, which shares the class, keeps the look 46-owner-calls.css gives it; FilterChips' shared look is an ochre ground, so this tab overrides it to the N6 form from its own v6 sheet until shell restyles the component.

## Files touched

App repo (branch `p10-v6-build-destinations`, one commit):

**Modified:**
- src/browse/DestinationsTab.jsx
- src/browse/SectionOpening.jsx
- src/lib/openingScreen.js
- src/lib/cardFillings.js
- src/styles/23-places-pages.css
- src/styles/24-destination-workspace.css (175 lines deleted, nothing added: the moved rules, OWNERSHIP.md rule 5)
- src/styles/63-v6-destinations.css
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (8 keys each: `places.sideAria`, `places.sideBrowse`, `places.sideRefine`, `places.allFilters`, `places.walksNearMe`, `open.moreCuts`, `open.trail.railDay`, `trails.cardWaymarked`)
- tests/openingScreen.test.mjs, tests/cardFillings.test.mjs
- scripts/verify_places_tab.mjs, scripts/verify_places_search.mjs (assertions updated with a comment each, none deleted)

**Created:**
- src/lib/placeSearch.js
- tests/placeSearch.test.mjs

Root repo (branch `p10-v6-build-destinations`):

**Modified:**
- docs/design-v6/OWNERSHIP.md (row for `src/lib/placeSearch.js`, destinations count 21 to 22)
- Execution/_OPEN.md

**Created:**
- docs/design-v6/plans/V3-destinations.md (the plan, committed before the first app edit)
- Execution/P10/T384-v6-v3-destinations.md

## Commands run

In the app worktree, with the shared node_modules broken (see What broke), against a private install:

    npm ci --ignore-scripts   (in _scratch/T384/nmfull, from the worktree's package.json and lock)
    node node_modules/vite/bin/vite.js build          (base, before any edit, then after)
    node node_modules/vite/bin/vite.js preview --port 5204 --strictPort
    node scripts/verify_places_tab.mjs http://localhost:5204/   (and the other five; verify_regions on its own 4213 preview)
    node scripts/verify_keyboard.mjs --port 5204
    node scripts/verify_quality_floor.mjs t384 --port=5204 --only=pages --out=<scratch>
    node --test --test-concurrency=1 "tests/*.test.mjs"
    node node_modules/eslint/bin/eslint.js src
    node scripts/ci/design-lint.mjs
    node scripts/check_ownership.mjs <root worktree>/docs/design-v6/OWNERSHIP.md
    sh .claude/skills/impeccable/scripts/impeccable detect --json <every changed file>
    for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
    rm -rf dist dist-data

Impeccable `context --target src/browse/DestinationsTab.jsx` ran once from the root worktree. Screenshots and measurements came from a scratch Playwright script outside both repos.

## Config and secrets set

None. The new localStorage key `carta.places.v1` is per viewer and holds no secret.

## Before/after measurements

Harnesses, each run on a built app with `vite preview` (before: the branch base, built before any edit; after: the final build):

| Harness | Before | After |
|---|---|---|
| verify_places_tab | 38 of 38 | 39 of 39 (one check added: the mountain sheet holds the groups the row leaves out) |
| verify_category_rail | 8 pass, then a timeout on `.explore-filter-btn` | the same; it drives Explore's CategoryRail, which OWNERSHIP.md gives to explore |
| verify_places_search | crashed at its "General" category step, no result | 41 of 41 |
| verify_regions | 30 of 30, `#region=` opens the page | 30 of 30 |
| verify_country_cards | 28 of 28 | 28 of 28 |
| verify_paging | 7 of 7 | 7 of 7 |
| verify_keyboard | not run | 20 of 20 |
| verify_quality_floor, pages, phone: dest-list, dest-trails, region | not run | 0 findings on each (one visible h1, no small target, no contrast failure) |

The surface on a phone. "Before" is the V1 walk in the brief (part 2, dev server at 380 px); "after" is the built app on a Pixel 5 (393 x 851, Chromium) and an iPhone 13 (WebKit), which agreed within 120 px.

| Metric | Before | After |
|---|---|---|
| Categories on screen at 380 px (360 px after) | 4 of 6 | 6 of 6 |
| Band 1 icons | 9 | 6 |
| Rails on a phone opening | 6 | 2, plus 4 cut chips |
| Visible buttons, Beaches, Lakes, Mountains, Cycling opening | 159 to 171 | 79 to 105 |
| Opening scroll height, same four sections | 18,479 to 19,593 px | 17,001 to 18,121 px |
| Height of bands 1 and 2 on a phone | not measured in V1 | 1,667 px |
| Inline facet groups on Lakes after typing a country | 9 groups, 30 or more chips | 1 group, 3 chips; first card at 464 px |
| Facet groups reachable on desktop Beaches | 1 of 9 | 9 of 9 (1 inline, 9 in the sheet) |
| Trails country cards with a two-letter monogram | several ("AU", "BU") | 0 of 41 |
| Trails country cards with a published count | 0 | 41 of 41 |
| Horizontal overflow at 360, 393 and 1280 px, and 844 x 390 | 0 | 0 |
| Impeccable detector findings over the changed files | 0 in JSX (V1); CSS not scanned | 2 in CSS, 1 fixed (see What broke), 1 left to its owner |
| Design lint | 213 violations, 213 in the baseline | 212, 212 in the baseline, 0 new |
| npm test | not run | 347 of 347 |
| eslint | not run | 0 errors, 70 warnings (one in DestinationsTab.jsx, present before this task) |

The opening's scroll height did not reach the brief's target of under 8,000 px. The bands are now 1,667 px; what fills the rest is Band 3, the first page of 36 cards, which a phone lays out one per row (37-card-fillings.css). A smaller first page would meet the target, but verify_paging holds 36 per page and the brief keeps it, so that is a decision for V4 (row T384-g), not a quiet change here.

Phone checks. Landscape at 844 x 390 takes the desktop layout (the side panel), with no horizontal scroll; the country picker (38 px high) and the locate button (30 px) are under `--tap` there, which is V5's polish (row T384-l). Tap only: every new hover rule sits in `@media (hover: hover)`, and the facet chip hover that left ink text on an ink chip after a tap is fixed. The on-screen keyboard: with the search field focused and the viewport 40 percent shorter (393 x 511), the field ends at 250 px and the bottom nav starts at 425 px, so nothing covers it. Safe areas: the column keeps its `env(safe-area-inset-bottom)` padding; this task adds no fixed bar and no full-height layout, so nothing new reads `100vh` or `100dvh`. Thumb reach: the tab has no single primary; the categories, the main choice, sit in the top third, which a choice rather than an action may. Swipe is never the only way: a rail's every row is reachable through its "See all" or its cut chip. What only a real phone can prove is row T384-i.

Screenshots (JPEG, quality 80, viewport only, nine) in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\destinations\`: V3-opening-iphone, V3-opening-android, V3-opening-desktop, V3-search-iphone, V3-grid-android, V3-filters-android, V3-filters-desktop, V3-walks-android, V3-walks-desktop.

Carta-design's seven questions, over the diff. One: no hex outside `:root`; the moved rules lost their two rgba whites. Two: no gradient and no new colour; the accent left the active sort, the active desktop chip, the category tick and the search focus shadow, so the only accent left on the tab is focus rings and the sheet's one primary. Three: ochre is left only on ratings; the ochre FilterChips ground is overridden on this tab; teal and `--danger` are untouched. Four: mono carries counts only (the walk count, the cut counts, the filter count); every new label is in the sans. Five: one primary per view, the sheet's "Show N places"; the Filters and All filters doors are secondaries. Six: the new strings are labels without a verb, which is how the existing panel labels read ("Browse", "Narrow the list", "All filters", "Walks near me", "More ways in", "Waymarked"), plus one with a number ("Half a day to a day (5 to 20 km)"); none has a dash or a banned word. Seven, remove one thing: the accent tick over each category tile went, and so did the inline wall of thirty chips above the first lake on a phone.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `npm run build` failed: "vite is not recognized", then rolldown's native binding, then `@babel/runtime` missing | The shared `continent-app/node_modules` in the main checkout has lost its `.bin` folder and every scoped package except `@rolldown`, `@supabase`, `@types` and `@vitejs` (51 of 226 top-level packages missing on 2026-10-08 around 04:00; the folder was modified at 03:46 and 04:14 by something outside this session). Session rule 4 forbids touching it | A private `npm ci --ignore-scripts` from this worktree's lock into the scratch folder, the worktree's node_modules junction pointed at it for the session and restored to the shared folder at the end. Its `playwright` was 1.61.1 against a browser cache for 1.63.0, so `playwright` and `playwright-core` were junctions to the shared, intact copies. Row T384-a |
| `#tour=` links crashed the app | `Intl.DisplayNames.of` throws a RangeError on an empty code | countryName returns '' for no code and the code itself when the engine refuses it |
| verify_places_search timed out on its first step in the baseline | It was written against the General category, removed in UX pass 1 | Rewritten to rank the Beaches list from the same anchors, every changed assertion commented |
| "The input reserves room for it" failed once the harness ran past its old step | On a phone the locate button is `--tap` wide (26-shortlist-extras.css) and the input kept 42 px of padding | The input's right padding is `--tap` plus `--space-1` on a phone, in 63 |
| A tapped facet chip read blank | The chip hover (`:hover:not(:disabled)`, ink text) outranked the selected state and stuck after a tap | Hover only under `@media (hover: hover)` and never on a chip that is on |
| The desktop sheet ran off the screen when opened from the panel | useAnchoredSheet hangs the sheet under its button with a 320 px floor | The panel's door opens the sheet centred (no anchor) |
| Design lint, one new finding (`shadow-literal`) | The moved search focus ring was a box-shadow, in the baseline only at its old place | The ring is an `--accent` border, the input rule of carta-design |
| Detector: bounce easing in 23-places-pages.css (friend badge pop) | An elastic `cubic-bezier(.2, 1.4, .4, 1)` | `var(--ease-out)`; the second finding, a side-tab accent border on `.dayp-summary` in 24, is the day planner's rule and is row T384-k |

## What is still open

The shared node_modules is broken (row T384-a). Every session that builds from the main checkout's node_modules will fail the way this one did; it needs `npm ci` in `continent-app/` by the owner or the orchestrator before the merge build.

Brief item V3-6, the coverage line under the heading stating its aim, is not built. Its copy is the owner's (row T373-e, left open), and the aim must be read from the quota model, which the footer does not read today. Row T384-b carries the build for V4 once T373-e is answered.

Brief item V3-9, a door from the tab to the region pages, is not built. RegionPage opens only from App.jsx's boot-time hash reader (`readRegionFromUrl`, read once and cached), so an in-tab `<a href="#region=...">` changes the hash and opens nothing. App.jsx is shell's; it needs a hashchange listener or an `onOpenRegion` prop for the tab (row T384-c). Row T373-d is closed: on a built app the deep link opens the page (verify_regions, "#region= opens the region page", PASS before and after), so the V1 failure was the dev server's.

FilterChips is shell's and its shared look is an ochre `--rate-bg` ground with a "×" glyph, where rule N6 asks for `--paper-dim`, `--ink`, a `--rule` border and the close rule asks for CloseIcon. This tab overrides the colours from 63; the component and the glyph are shell's (row T384-d).

verify_category_rail drives Explore's CategoryRail and has timed out on `.explore-filter-btn` since before this task; it is explore's harness now (row T384-e).

Row T380-g, the two h1: the second is Explore's `.xbar-title`, which stays in the DOM inside the hidden Explore tab. The quality floor counts one visible h1 on every Destinations screen, so nothing is wrong on this surface; whether a hidden tab should keep its h1 is explore's or shell's question, and the row stays open for them with this finding.

The rules of `24-destination-workspace.css` that are this surface's but did not move: the composed-trips block between the TRIPS-LAYER markers (`.places-tripbar`, `.trip-slider`, `.places-icard`, `.itin-card-*`), which also styles the composed route page's controls, and the two selectors shared with Explore (`.places-shell, .explore-shell`). 20 of the 67 counted matches remain in 24, most of them comments and header-search rules (row T384-f).

The 8,000 px opening target needs a smaller first page on a phone (row T384-g). Search cannot find Ghent from "Gent": the catalogue carries one name per town and no local or exonym names (row T384-h, data lane). What only a real phone can prove (the keyboard's real height against the viewport, momentum on the rails, iOS Safari's bar collapse in landscape, the 2 x 3 grid under a large text setting) is row T384-i. The five new language columns need a native read (row T384-j). The detector's side-tab finding on the day planner's `.dayp-summary` is row T384-k. Desktop and landscape targets under `--tap` (facet chips 27 px on a fine pointer, the country picker 38 px, the locate button 30 px) are V5's polish (row T384-l).

The month fact (row T380-e) is brief item V4-8 and is not a V3 item; it waits for the shell's settings line in V4. T373-c (which category a first visit opens on) stays the owner's; the remembered state now decides every visit after the first.

## Rollback procedure

App repo: `git -C <app> revert <T384 app commit>` on master after the merge, or drop the branch before it. The revert brings back the 175 lines in 24-destination-workspace.css and empties the T384 part of 63 in one step; nothing else depends on the new keys or on `placeSearch.js`. The localStorage key `carta.places.v1` is harmless if left behind; the old code never reads it. Root repo: revert the three T384 commits (plan, OWNERSHIP row, report and register). If only the OWNERSHIP row is reverted while the app keeps `placeSearch.js`, `check_ownership.mjs` fails, so revert both or neither.
