# T383: structure, information and flow: Explore (the map tab)

## Task ID

T383 (design wave V3, session 3 of 10). Branch `p10-v6-build-explore` in both repos.

## Date

2026-10-08

## What changed

Explore now puts the inputs first, then a count, then priced places, which is the structure the brief's V3 list asked for (docs/design-v6/briefs/explore.md, part 6). The plan is docs/design-v6/plans/V3-explore.md, committed before the first app edit (f637c3453). This session was resumed after a usage limit: the first run committed the plan and left sixteen uncommitted app files; the resumed run reviewed them against the plan, found all thirteen items built, fixed one more open row (T380-g), repaired one stale harness (verify_category_rail, row T384-e), and ran every check.

The control bar's h1 now carries the live count in `--mono` under the title ("3,855 places", "18 in view" on the map), counted from the same list the grid renders. Under it one input row holds what the figures depend on, in the traveller's order: the Lifestyle door (secondary chrome, no accent tint, explore N1 as amended), a budget ceiling select ("Up to €40 / 60 / 80 / 100 / 130 a day", URL `xb`), the month ("Good in Oct", URL `xm`, moved out of the Practical fold), No car needed (moved out of the Practical fold) and the shortlist as a labelled chip with its count. The fixed "Under €70 a day" toggle is gone; an old `xp=e` link lands on a €70 ceiling, shown as its own step. On a phone the row scrolls sideways inside itself at `--tap` height and the page never scrolls sideways.

The trip styles left their own tile strip (phone toolbar and desktop panel) and became the first group of the filter rail, so they now reach the phone through the Filters sheet, make removable chips, count on the Filters badge and reset with Clear all. "Kind of place" is renamed "Size of place" and starts closed. Phone chrome went from six rows to three (search and Filters on one row, count and sort on one row, the input row), and the first priced card's top moved from 490 px to 281 px at 380 x 800.

Every card shows the day cost. Rail cards gained the cost line; on grid cards the figure moved to line 1 beside the name and score and the gauge stayed on line 2. When the bed or food figure is a country-level stand-in, the figure carries the word "national" (explore N3, never colour alone). The first rail now leads with cost, "Under €N a day in <month>": tier 1 and up, in season this month, under the traveller's ceiling or (without one) the cheapest third rounded up to five euros, cheapest first, at most two per country among the first twelve. Its "See all" sets ceiling, month and the cost sort. The top-tier rail is second, gems third, and the month rail became a door. The tier key now counts the same rows as the rails (41 and 41, was 48 against 41).

On the map, from zoom 7 the keyboard layer's pins (at most 30) draw as price labels, the name in `--ui` and the day cost in `--mono` on `--bg-card`, and the one cheapest pin in view is the map's only `--accent` (explore N4). Clusters are stroked `--ink-mute`, not the rating ochre. Tips, pin cards and pin names for screen readers carry the day cost. Map and list are linked (explore N5): a card under the pointer or in focus rings its pin 2 px `--ink`, a pin under the pointer or in focus outlines its card and scrolls it into view unless the reader moved the list in the last second. On a phone the map takes the height under the chrome to the nav, on `100dvh`.

An empty grid now names its cause and offers the one action that changes it ("No place fits once Not crowded is added." with "Remove Not crowded", and "Clear all" when two or more filters are on); an empty shortlist offers "Show all places". The bare "?" pip is the words "Score key"; the typed "×" on the tier key and the search field are the house CloseIcon; the "→" arrows on the country banner and rows are the chevron icon. The floating List/Map switch no longer covers the last card (the feed reserves its height and the bottom safe area). Explore's h1 renders only while the tab shows; mounted under Destinations it is a plain div, which removes the second h1 on `?tab=places` (row T380-g).

Impeccable ran unattended under the owner's instruction of 2026-10-07. Context was run from the root worktree; as in V1 (row T372-g) it resolved the app repo as the project and reported NO_PRODUCT_MD, so PRODUCT.md and DESIGN.md were read directly and init was not run. Where shape would have asked, the plan took the option that keeps Carta's palette, type and identity; the choices are written in the plan's "Assumptions taken without an interview". One deviation from the brief: "tap on the price opens the preview" is met by the card's info control, which is now visible on a coarse pointer at 44 x 44, because the price sits inside the card's open-the-place button and a button cannot hold a button.

## Files touched

Root repo (`p10-v6-build-explore`):

**Created:**
- docs/design-v6/plans/V3-explore.md (commit f637c3453)
- Execution/P10/T383-v6-v3-explore.md

**Modified:**
- Execution/_OPEN.md (rows T383-a to T383-i; T372-a, T372-d and T380-g closed by T383)

App repo (`continent-app/`, `p10-v6-build-explore`):

**Modified:**
- src/browse/ExploreTab.jsx, ExploreMap.jsx, ExploreRails.jsx, ExploreFilterRail.jsx, CategoryRail.jsx, TierLegend.jsx
- src/components/CostSummary.jsx
- src/styles/62-v6-explore.css
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (22 new keys each under explore's prefixes, `results.empty` reworded)
- scripts/verify_explore.mjs, scripts/verify_map_size_cards.mjs, scripts/verify_category_rail.mjs (assertions that encoded the old design updated with a comment each, none deleted)

Every app file is owned by 'explore' in docs/design-v6/OWNERSHIP.md; no new src file, so no new OWNERSHIP row. `node scripts/check_ownership.mjs <root>/docs/design-v6/OWNERSHIP.md` passes.

## Commands run

In the app worktree, after repointing its node_modules junction to the private complete install (`wt\_scratch\T384\nmfull\node_modules`, row T384-a) and back at the end:

```
npm run lint
node scripts/ci/design-lint.mjs
node scripts/check_ownership.mjs "C:/Users/Gebruiker/Documents/Portfolio/wt/T383/docs/design-v6/OWNERSHIP.md"
npm test
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
git checkout --detach master; npx vite build; npx vite preview --port 5203 --strictPort   # baseline
CARTA_PORT=5203 node scripts/verify_explore.mjs   (and verify_shortlist, verify_fare_provenance, verify_map_size_cards)
node scripts/verify_keyboard.mjs --port 5203 --out <scratch>
node scripts/verify_quality_floor.mjs base --port=5203 --out=<scratch> --only=explore,pages
node scripts/verify_category_rail.mjs http://127.0.0.1:5203
git checkout p10-v6-build-explore; npx vite build; npx vite preview --port 5203 --strictPort   # after, same harnesses
sh .claude/skills/impeccable/scripts/impeccable detect --json <the eight changed src files>
rm -rf dist dist-data
```

The phone walk and the screenshots ran from scratch scripts in `wt\_scratch\T383\app\` (t383_measure, t383_checks, t383_phone, t383_shots, t383_h1).

## Config and secrets set

None.

## Before/after measurements

Baseline is the merged V2 state (app master 61449ab) as a preview build on port 5203; after is this branch, same build and port.

| Metric | Before | After | Delta |
|---|---|---|---|
| First priced card top, 380 x 800 | 490 px (V1 walk, brief part 1) | 281 px | -209 px |
| First priced card top, iPhone 13 / Pixel 5 / 360 x 740 / desktop 1280 x 800 | not measured | 281 / 281 / 297 / 304 px | |
| Phone chrome rows above the first card | 6 (brief part 1) | 3 | -3 |
| Euro figures on the first phone screen, 380 x 800 | 0 (brief part 1) | 4 | +4 |
| Euro figures on the first desktop screen | about 4 (brief heuristic 8) | 10 | +6 |
| Tier key top tier against the top rail | 48 against 41 | 41 and 41 | agree |
| Lifestyle doors on the page | 2 (phone toolbar, desktop panel) | 1 (input row) | -1 |
| Shortlist toggles | 2 | 1 | -1 |
| Trip-style strips | 2 (outside the filter state) | 0 (the rail's first group) | -2 |
| Fixed "Under €70" toggle | 1 | 0 (budget ceiling select, 5 steps) | replaced |
| Count line in the control bar | none | 1 | +1 |
| verify_explore | 68/68 | 72/72 | +4 checks |
| verify_shortlist | all passed (15) | all passed (15) | 0 |
| verify_fare_provenance | OK (56) | OK (56) | 0 |
| verify_map_size_cards | stopped at its first locator | all passed (17) | repaired |
| verify_category_rail | stopped at its first locator | 21/21 | repaired |
| verify_keyboard | 19/20 (explore-map @1280 focus timeout; an earlier baseline run gave 20/20) | 20/20 | |
| Quality floor, text under 4.5:1 (explore and pages flows) | 12 | 5 | -7 (all seven Explore views now 0) |
| Quality floor, phone targets under 44 px | 8 | 8 | 0 (all on the destination page, not Explore) |
| Quality floor, desktop targets under 44 px on Explore views (owner decision T193-b) | 79 to 82 | 90 to 93 | +11 (compact fine-pointer inputs, 32 px) |
| Visible h1 per screen, explore and pages | 1 | 1 | 0 |
| h1 in the DOM on ?tab=places after visiting Explore | 2 (row T380-g) | 1 | -1 |
| Impeccable detector findings, eight changed files | 0 | 0 | 0 |
| Design lint new violations | 0 | 0 (213 baseline) | 0 |
| npm run lint errors | 0 | 0 | 0 |
| npm test | 341 pass | 341 pass | 0 |

Phone checks (iPhone 13 on WebKit, Pixel 5 and 360 x 740 on Chromium with touch and mobile on). No sideways page scroll at any size, in landscape (844 x 390 class) or with the input row scrolled. With the search field focused and the viewport cut by 40 percent, the field stays in view (bottom 109 px of 398 and 436) and the bottom nav does not ride over it. Nothing depends on hover: the card preview opens from the info control by tap on both engines, the map pins open by tap, and the trip styles, budget and month are plain taps or native selects. The floating List/Map switch sits in thumb reach at the bottom and clears the last card (last card bottom 630 px, switch top 648 px). The feed's end padding includes `env(safe-area-inset-bottom)`; the phone map is sized on `100dvh`. Every input in the row is at least 44 px; the only phone controls under 44 px in the measured Explore pass are the eight card stars, whose tap box the quality floor counts at 44 px. No action is swipe-only: the input row and rails scroll sideways but every item is also reachable by the Filters sheet or "See all".

After screenshots (JPEG q80, viewport only) are in `design-v6-shots\explore\`: V3-grid-iphone, V3-grid-android, V3-grid-desktop, V3-map-iphone, V3-map-desktop, V3-filters-android, V3-preview-android, V3-preview-desktop, V3-empty-android (nine).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Two h1 elements on ?tab=places (row T380-g) | Explore stays mounted under Destinations and its control-bar h1 stayed in the DOM | The title renders as h1 only while `isActive`; a div otherwise |
| verify_map_size_cards stopped at its first locator | Written for the map-era Explore (From picker, size pill, ranked list) | Rewritten section by section against today's controls, a comment per change |
| verify_category_rail stopped at `.explore-filter-btn` (row T384-e) | The class was renamed to the shared `.places-filter-btn`, and the strip it tested is gone in V3 | Every check reads the V3 trip-style group, with comments where an expectation reversed (the Filters badge now counts styles) |
| verify_keyboard explore-map @1280 timed out on the baseline run | A focus timeout on the unchanged branch; an earlier baseline run of the same build passed | Not reproduced after; 20/20 |

## What is still open

The Lifestyle cell of the input row is the fallback for the shell's settings line (T381, row T380-e). When the settings line carries Lifestyle and the month from dates above every priced tab, Explore's Lifestyle cell goes and the month select becomes "the month from your dates, or Any" (T383-a).

The word "national" and the four role words have no InfoDot yet. The glossary and InfoDot belong to the shell, and the price line sits inside the card's button, so the dot needs a home outside it, most likely the compact receipt in the preview (T383-b).

The price labels overlap where towns are close (Cison di Valmarino over Follina near Treviso at zoom 8). Label collision is visual work for V4 (T383-c).

The phone map view keeps the grid under the map instead of the brief's bottom drawer, because a drawer is a new interaction with no written rule beyond DIRECTION part 7. It goes to V5 adapt (T383-d).

On a two-up phone grid the card preview is drawn over a 160 px card and clips its own text ("Sleep here, r..."). The brief's popover preview is V4 (T383-e).

The desktop map's count read "18 in view" while 19 labels were drawn at zoom 8 near Venice: the cheapest pin is forced into the label set from the rendered features, and the count comes from the viewport box the list uses. They should agree (T383-f, V5).

FilterChips draws its remove mark as a typed "×", and FilterChips is not Explore's file; the close-control rule should reach it in the V6 consistency pass (T383-g).

The de, es, fr, it and nl strings for the 22 new keys and the reworded `results.empty` were written by this session and need a native read (T383-h, owner).

What only a real phone can prove goes into one owner row (T383-i): the iOS and Android native select pickers for budget and month, the real keyboard's height against the `100dvh` map, Safari's address bar collapsing in landscape over the input row, scroll momentum in the sideways input row and rails, and haptics (none are used).

Row T384-e is resolved by the harness change in this branch, but the row is not in this branch's `_OPEN.md` (T384 is not merged here); the orchestrator should mark it closed by T383 after both merge.

## Carta-design's seven questions

1. No hex value outside `:root`: the v6 sheet uses tokens only, and ExploreMap reads `--ink-mute` live through `tokenColour()`.
2. No gradient, no new colour, no second saturated hue. The one `--accent` on the map is the cheapest pin; on the page the accent is only a focus ring.
3. Ochre stays on ratings and was taken off the clusters (a count, not a score); teal stays on gems; `--danger` is not used.
4. Mono is only on measured facts: the count, the day cost, the shortlist count, pin figures. The words "a day", "national" and the labels are `--ui`.
5. One primary per view at most (quality floor: 0 views with more than one).
6. The new headline "Under €85 a day in Oct" carries a number; no em dashes, no middots, no banned words in the diff.
7. Removed: the duplicate Lifestyle door, the duplicate shortlist toggle, both trip-style strips, the fixed €70 toggle and the bare "?" pip.

## Rollback procedure

Nothing is deployed and no data or schema changed. Before merge, delete the branch `p10-v6-build-explore` in both repos. After merge, revert the merge commits: in the app repo `git revert -m 1 <merge of p10-v6-build-explore>` (or revert 399ed76 and 7883be2), and in the root repo revert the report commit and f637c3453. Old `xp=e` links keep working either way (before V3 as the toggle, after V3 as a €70 ceiling). Close-marks on T372-a, T372-d and T380-g in `_OPEN.md` go back to `open` with the root revert.
