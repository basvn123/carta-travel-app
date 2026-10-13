# T440: Explore part 2: the filter rail on the kit, and the settings line as a booking bar (Explore redesign, step 5 of 9)

## Task ID

T440

## Date

2026-10-13

## What changed

**The filter rail.** The owner said the rail's buttons "feel like AI". It is now built from the kit, with each kind of choice drawn by the one part made for it. Every filter Explore had is still there; only the controls changed.

- **Trip type.** Nine Tiles, two across: icon over the word in the narrow desktop panel, icon beside the word in the phone sheet.
- **Budget and month.** Labelled selects (kit Field). They moved in from the row above the list, so every input that narrows the list now lives in one place, and the input row is gone.
- **Rating.** One choice row: Any, Very good, Excellent, Exceptional, each meaning "this band and up". Old `xv` links still work: a list of tiers reads as its lowest tier.
- **On/off filters.** Switches: hidden gems, no car needed, not crowded, near the sea, UNESCO World Heritage, best of its country, only my shortlist.
- **Long lists.** Size of place, what you do with it, and country sit in quiet folds that start closed. A fold shows how many of its filters are on.
- **Country.** The checklist gained a "Find a country" field and keeps the link to each country page.
- **Headings and clearing.** Headings are 12 px, 600 weight, secondary text. The "Refine" eyebrow is gone; "Clear all" appears once anything is on.
- **Chips above the list.** One chip per filter. The rating chip says "Excellent and up" in the reader's language, replacing the English tier names.

**The Filters sheet.** It is shared by Explore, Destinations and the trip filters. Its button reads "Show places" with no count, and an empty result still says so in words. Clear all and Show places are kit Buttons. On Explore the phone's Filters door is a kit Button, with the count of the traveller's own active filters.

**The settings line.** From 769 px it is a full-width booking bar on Explore, Destinations and the Trip planner:
- origin, dates, people and Lifestyle are equal segments, label over value, with hairlines between them;
- language and Prices in EUR sit compact at the end;
- a phone keeps its one-line face that drops parts from the left.

**Explore's remaining controls.** The empty-state actions, the "Did you mean" suggestions and the country-page link are now kit Buttons.

**Cleanup.** 86 dead rules for the old toggles, the input row and the old country list were removed from 14, 25, 46 and 62. `CategoryRail.jsx` is now just the shared icon map.

## Files touched

**Modified (app, mirrored in root):**
- continent-app/src/browse/ExploreFilterRail.jsx (rewritten on the kit)
- continent-app/src/browse/CategoryRail.jsx (icon map only)
- continent-app/src/browse/ExploreTab.jsx (rail props, input row removed, rating chip, kit buttons)
- continent-app/src/browse/PlacesFilterSheet.jsx (kit foot, no count)
- continent-app/src/styles/62-v6-explore.css (the T440 rail block; dead rules removed), 60-v6-shell.css (booking bar), 14-filters-panels.css, 25-feature-pages.css, 46-owner-calls.css (dead rules removed)
- continent-app/src/i18n/{en,nl,de,fr,es,it}.js (8 new keys each)
- continent-app/scripts/verify_explore.mjs, verify_category_rail.mjs (rewritten passes), verify_filter_sheet.mjs, verify_quality_floor.mjs (selectors, no-count contract)
- continent-app/scripts/ci/design-lint.baseline.json

**Modified (root):** Execution/_OPEN.md. **Created (root):** this report.

## Commands run

```
node <scratchpad>/t440a.cjs, t440b.cjs, t440c.cjs, t440s.cjs, t440v.cjs, catrail.cjs
node <scratchpad>/cssprune.cjs <dead-class regex> 14 24 25 62 46     (86 rules)
npx vite build && npx vite preview --port 5231
node <scratchpad>/t440shots.mjs        (1440 x 900 en and de, 1280 x 720, 390 x 844 en and de: rail, filtered, Destinations and Trip planner bars, phone sheet)
node scripts/verify_explore.mjs http://localhost:5231/              (73 of 73)
node scripts/verify_category_rail.mjs http://localhost:5231         (21 of 21)
node scripts/verify_quality_floor.mjs t440e --port=5231 --only=explore   (8 screens, every floor check passes)
impeccable detect --json ExploreFilterRail.jsx PlacesFilterSheet.jsx CategoryRail.jsx   ([])
node scripts/ci/design-lint.mjs        (0 new); --update-baseline
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Raw buttons: ExploreTab, ExploreFilterRail, CategoryRail, PlacesFilterSheet | 14, 8, 1, 4 (27) | 4, 0, 0, 2 (6) |
| Places a traveller sets a filter on Explore | the rail and the input row above the list | the rail only |
| Count on the Filters sheet button | "Show 1,211 places" | "Show places" |
| Settings line on desktop | parts clustered at the left, label beside value | a full-width bar of equal segments, label over value |
| 62-v6-explore.css meter: font sizes, radii, legacy reads | 25, 11, 76 | 20, 7, 54 |
| 25-feature-pages.css meter: font sizes, radii, legacy reads | 256, 111, 541 | 247, 102, 513 |
| Lint baseline total | 9,985 | 9,885 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The phone Filters sheet drew the rail unstyled (huge headings, tall tiles) | The sheet renders outside `.explore-shell`, which scoped the new rules | The rail rules are scoped to `.xrail` itself |
| Budget and month selects cut to "Any bu" | Side by side in a 216 px panel | Stacked |
| Trip-type labels broke mid-word ("Beac h") in the desktop panel | Row tiles in a narrow column | The panel uses icon-over-word tiles at 56 px; the wider phone sheet keeps row tiles |
| `budgetSteps` would be read before it was defined | It lived in the removed input row block, after the rail element | Moved above the rail |
| The sheet lost its `is-empty` marker | The kit Button swap | The class is set on the Button |

## What is still open

- **T440-a.** `verify_filter_sheet.mjs` is an older Explore sheet harness that `verify_explore` already supersedes; its checks still look for facet chips Explore no longer has. Retire it or rewrite it with the Destinations migration (T428).
- **T440-b.** A journey page cost-bar segment is a 41 x 44 px target on a phone (quality floor, the "pages" flow). It predates this task and belongs to the trips migration (T431).
- **T440-c.** Explore keeps 4 raw buttons: the row's opener (it carries the hover preview), the search clear (T442) and the floating List/Map switch (T441).

## Rollback procedure

Revert the T440 commits in both repos. The old rail, the input row, the "Show N places" sheet and the clustered settings line come back. No data, schema or config changed.
