# T601 to T604: Explore v8 (owner review of v7, 2026-10-22)

## Shared header

**Date:** 2026-10-22

**Batch:** four tasks from the owner's review of v7 (two screenshots and a voice note, then an addendum): the overview hero (T601), category tabs framed as Places with no permanent left panel and no Country (T602), no count on the map panel (T603), quick chips and the filter pane as one control (T604, the addendum "make sure the styling aligns with the actual filter panel").

**Branches:** app `p11-explore-v8` from master ade65c7, with T601, T603 and T604 in `wt/t601-hero` (`p11-v8-hero`) and T602 in `wt/t602-tabs` (`p11-v8-tabs`), merged with no conflicts; root `p11-explore-v8` from main 1f383f158.

**App commits:** T601 30a44ce, 53b99ba; T602 f0a15a7; T603 f5ac843; T604 751c9d3.

**Checks (static):** eslint no new errors (the `collectKpins` error in ExploreMap.jsx is on master already); `npm test` 651 of 651; design-lint nothing from this batch; NOPUBLIC build 6.4 s.

**End check (browser, once):** dev server 5191, Playwright 1440x900, 1880x1000 and 390x844 with `flow7.mjs` (overview, Ask Carta, a quick chip, a chip popover, Map, a pin, Open, Back, List, the arrow back, Where with Lakes and Croatia, Where with Trails and Italy, the Trails map, the Beaches map, Plan, Lifestyle). No horizontal scroll, no Ask door in the header, the filter pane closed by default. One defect fixed (T601). The Beaches map step failed in the script only (it clicked a hidden twin); clicking the visible pill opened the map on both widths.

**Rollback:** `git -C continent-app reset --hard ade65c7` and `git reset --hard 1f383f158`, or `git revert` of the commits above.

---

## T601: the overview hero

### What changed
The overview's top is a hero: a licensed Commons photograph as a band across the content width, a solid panel over its lower edge with "Where to next?", a small Ask Carta pill and one joined What | Where | Search field (Search is the one primary, the field rises on focus), the Map pill after it, the photo credit under the band. Under it the categories are kit Tabs on every browse tab, then quiet quick chips. Places' filter pane is closed until Filters is pressed.

### Files touched
Modified: `continent-app/src/browse/ExploreTab.jsx`, `src/browse/ExploreCategories.jsx`, `src/styles/84-explore-overview.css`, i18n `explore.*`.

### Commands run
eslint; flow7; screenshots at 1880 px.

### Config and secrets set
None.

### Before/after measurements
| Metric | Before | After | Delta |
|---|---|---|---|
| Ask Carta caption on the overview | 1 sentence | none | -1 |
| Filter pane open by default in the focused view (desktop) | yes | no | closed |

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| At 1440 and 1880 px the hero sat centred and narrower than the rails, so the left edges did not line up | the band was capped at 1240 px | the band takes the rails' width; only the panel is capped (53b99ba) |

### What is still open
T601-a: on a phone the hero is about 490 px tall before the first rail.

### Rollback
`git -C continent-app revert 53b99ba 30a44ce`.

### End check list
Overview at 390, 1440 and 1880; tabs on every browse tab.

---

## T602: category tabs framed as Places

### What changed
Trails, Beaches, Lakes, Mountains and Cycling lost their permanent left panel and the Country fold. All filters, Sort and the quick chips sit on top; on a desktop All filters slides the 320 px pane in (closed by default), on a phone it opens the sheet. A tab's country comes from a country typed in Where or from the settings line's Countries when one country is chosen, and shows as the band and a removable chip. The trip library keeps its own Filters door.

### Files touched
Modified: `continent-app/src/browse/DestinationsTab.jsx`, `src/browse/WhereBar.jsx` (SortPill, FilterChipBar props), `src/styles/83-where-bar.css`.

### Commands run
eslint; flow7.

### Config and secrets set
None.

### Before/after measurements
| Metric | Before | After | Delta |
|---|---|---|---|
| Category tabs with a permanent left panel (desktop) | 5 of 5 | 0 of 5 | -5 |

### What broke and how it was fixed
No issues found in the end check.

### What is still open
T602-a: the old `.places-side .side-facets` and `.dtab-filters` rules in `63-v6-destinations.css` are unused.

### Rollback
`git -C continent-app revert f0a15a7`.

### End check list
Each category tab at both widths, All filters on desktop and phone, Sort, a typed country.

---

## T603: no count on the map panel

### What changed
"3,045 places on the map" is read by screen readers only.

### Files touched
Modified: `continent-app/src/browse/MapPlacePanel.jsx`, `src/styles/81-map-panel.css`.

### Commands run
eslint.

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
No issues.

### What is still open
None.

### Rollback
`git -C continent-app revert f5ac843`.

### End check list
The desktop map panel with no pick.

---

## T604: quick chips and the filter pane as one control

### What changed
Each quick chip on Places opens a popover that draws the filter pane's own section (same controls, words, order and state); a set chip shows its value in the selected tint with a tick. Toolbar action pills and filter chips share one 36 px height and pill radius. The pane itself got a polish pass: Size under Kind of place, Good to know as compact rows.

### Files touched
Modified: `continent-app/src/browse/ExploreFilterRail.jsx` (`ExploreQuickFilters`, `only`), `src/styles/78-filter-pane.css`, `src/browse/ExploreTab.jsx`, `src/styles/84-explore-overview.css`, i18n `explore.*`.

### Commands run
eslint; flow7 (Budget popover).

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
No issues.

### What is still open
T604-a: the outdoor tabs' chips still use `FilterChipBar` popovers, not the pane's own sections as Places does.

### Rollback
`git -C continent-app revert 751c9d3`.

### End check list
Each quick chip's popover against its pane section; toolbar and chip heights.
