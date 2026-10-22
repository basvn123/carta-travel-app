# T595 to T600: Explore v7 (owner review of v6, 2026-10-22)

## Shared header

**Date:** 2026-10-22

**Batch:** six tasks from the owner's review of Explore v6 (11 points with four screenshots): the overview's top section (T595), fewer words (T596), Getting there inside Lifestyle (T597), the focused view's head and quick filters (T598), lead cards with photographs (T599), and a map on every outdoor tab (T600).

**Owner points and where they went:** 1, 2, 5, 6 and 7 (doors, Show all and Map at the top; a cleaner top; a Where that works; Ask Carta inside the section and only on Explore; filters on the non-map part) went to T595 and T598; 3, 9 and 10 (counts, the footer sentence, the Good for help line) to T596; 4 (transport choice in Lifestyle) to T597; 8 (empty grey lead cards) to T599; 11 (maps and compact filters on every tab, Where for every kind, human copy) to T600, T598 and T599.

**Branches:** app repo `p11-explore-v7` from master b1d5ec1; T595 with T598, T597, T599 and T600 built in worktrees (`wt/t595-top`, `wt/t597-way`, `wt/t599-lead`, `wt/t600-outdoor`, branches `p11-v7-*`) and merged into it with no conflicts; T596 made on the batch branch. Root repo `p11-explore-v7` from main 22fac6c74 carries the mirror, the design rules, this report and the register.

**App commits:** T595 eb44ce3, 4c35b72; T596 ae6ce9f; T597 fb7040c; T598 4f18d1f, 671aad9; T599 3ad1b10, 8c4f10f; T600 66a8546, 3d01e10. ExploreTab.jsx, 84-explore-overview.css and the i18n files carry more than one task.

**Checks (static):** eslint on every touched file, no new errors (the `collectKpins` exhaustive-deps error in ExploreMap.jsx is on master already); `npm test` in the main checkout 651 of 651 pass (649 before; T600 added 2 URL tests); design-lint: no finding from this batch; NOPUBLIC build passes (4.6 s).

**End check (browser, once, on the merged batch):** dev server 5191, Playwright at 1440x900 and 390x844 with the click-through script (scratchpad `flow7.mjs`): overview, the Ask Carta door, a quick chip, a quick filter popover, Map, pick a pin, Open, Back, List, the round arrow back, Where with Lakes and "Croatia", the Lakes map, Where with Trails and "Italy", the Trails map, the Beaches map Europe-wide, the Plan tab (no Ask door), Lifestyle with Getting there. Checked in the DOM at every step: no horizontal scroll, no Ask door in the header, no doors at the foot. Five defects found and fixed (see each task). The machine ran low on memory during the round (another Vite on 5173 held 2.7 GB), which made one round time out; it was rerun.

**Rollback for the batch:** `git -C continent-app reset --hard b1d5ec1` and `git reset --hard 22fac6c74` on the two branches, or `git revert` of the commits above. No data, schema or server state changed.

---

## T595: the overview's top in one block

### What changed
The overview now opens on one compact block: "Where to next?", Ask Carta as a field-like door with an example question (the chat's only door: it left the desktop header, the phone's top bar and the Plan tab), one bar with What, Where, Search and the Map toggle, then one row with the category pills and the quick chips (the rails' doors such as Hidden gems and Go without a car, Countries on a phone, All filters, Show all places). Where works for every kind: Places searches places, any other kind opens its tab with the text. Nothing waits at the foot of the overview any more.

### Files touched
Modified: `continent-app/src/browse/ExploreTab.jsx` (OverviewHero, quick chips, overview pane), `src/styles/84-explore-overview.css`, `src/styles/76-ask-door.css`, `src/browse/StartDialog.jsx`, `src/planner/PlanAsk.jsx` (renders nothing), i18n `explore.*`.

### Commands run
eslint; flow7 at both widths.

### Config and secrets set
None.

### Before/after measurements
| Metric | Before | After | Delta |
|---|---|---|---|
| Ask Carta doors in the app | 3 (desktop header, phone bar, Plan) | 1 (Explore overview) | -2 |
| Overview controls below the rails (doors, Show all, Map) | 3 | 0 | -3 |
| What choices whose Where field works | 1 of 7 | 6 of 7 (Trip styles has none) | +5 |

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| The phone Search button was an empty white box | its word is hidden on a phone and it had no icon | the button keeps its search icon (4c35b72) |
| The Countries pill sat on top of "Go without a car" | the settings line's `flex: 1 1 0` rule let it shrink to nothing in a scrolling row | the pill keeps its size in rows of pills (671aad9) |

### What is still open
T595-a: `explore.heroDoor` is unused and the `ac-in-header` and `ac-in-plan` rules in `76-ask-door.css` are dead.

### Rollback
`git -C continent-app revert 4c35b72 eb44ce3`.

### End check list
Overview at both widths, the Ask door, each What with a Where text, the quick chips, All filters.

---

## T596: fewer words

### What changed
The footer lost its positioning sentence; the focused view's title and the filter pane's head no longer show "3,073 places" (the count stays for screen readers); Good for lost its help line ("Pick how you will use the place.").

### Files touched
Modified: `continent-app/src/components/SiteFooter.jsx`, `src/browse/ExploreFilterRail.jsx`, `src/browse/ExploreTab.jsx`.

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
`git -C continent-app revert ae6ce9f`.

### End check list
Footer, the focused head, the pane head.

---

## T597: Getting there inside Lifestyle

### What changed
The Lifestyle panel has a Getting there row (Any way, Plane, Train, Bus, Car) bound to the same setting as the settings line, so choosing Plane in either place prices flights only. One leak was closed: the trip total fell back to a car price when Plane was chosen and no flight was found; it now shows no total, as for an unreachable place.

### Files touched
Modified: `continent-app/src/browse/LifestylePanel.jsx`, `src/styles/14-filters-panels.css`, `src/lib/runtime_pricing.js` (one line).

### Commands run
eslint.

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
No issues in the end check (Lifestyle open at 1440 shows the row and fits the screen).

### What is still open
T597-a: under Plane a place without a flight shows no total and no reason; whether it should say "No flight on these dates" is the owner's copy call.

### Rollback
`git -C continent-app revert fb7040c`.

### End check list
Lifestyle at both widths, Plane then the settings line, a place without a flight.

---

## T598: the focused view's head and quick filters

### What changed
The focused view's head is one row: a round arrow back and the title on the left, the pills (Share, Sort, Filters, Saved, Map) on the right. Under it a row of quick filter chips (Kind of place, Budget, Month, Good for, Rating, Flight time), each a small popover on the pane's own state, then the active chips. In map view on desktop the map starts under the chips and fills the screen.

### Files touched
Modified: `continent-app/src/browse/ExploreTab.jsx`, `src/styles/84-explore-overview.css`, i18n `explore.*`.

### Commands run
eslint; flow7.

### Config and secrets set
None.

### Before/after measurements
| Metric | Before | After | Delta |
|---|---|---|---|
| Rows from the category pills to the first card, desktop 1440 | 5 (pills, back link, title, count, chips) | 4 (pills, head, quick chips, active chips) | -1 |
| Top of the first card, desktop 1440 focused view | 369 px | 348 px | -21 px |

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| The back arrow stood on its own row above the title (both widths), and on a phone the pills came between arrow and title | an older `.xbar-lead` column rule | arrow and title share one row, the pills scroll under them on a phone (671aad9) |

### What is still open
T598-a: the sticky desktop map does not grow taller once the list has scrolled.

### Rollback
`git -C continent-app revert 671aad9 4f18d1f`.

### End check list
Focused head at both widths, a quick filter popover, the desktop map height.

---

## T599: lead cards with photographs

### What changed
Each rail's grey lead card now shows what the rail holds: the title, an optional short line, a fanned stack of the rail's first three photographs, one large figure ("From ~€35 a day"), up to two small facts and See all. The machine-sounding lines went ("The highest Scores across Europe."); only three rails keep a line, rewritten short in six languages. ExploreRails gained `hideDoors`.

### Files touched
Modified: `continent-app/src/browse/StoryRail.jsx`, `src/styles/80-story-rail.css`, `src/browse/ExploreRails.jsx`, `src/browse/TripStylesRow.jsx`, `src/browse/SectionOpening.jsx`, i18n `rail.*` (six keys deleted).

### Commands run
eslint; design-lint.

### Config and secrets set
None.

### Before/after measurements
| Metric | Before | After | Delta |
|---|---|---|---|
| Rail lines under a lead card's heading (Explore) | 9 | 3 | -6 |

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| Explore's lead cards had no photo stack, the outdoor ones showed blank white frames | the stack read a `photo` prop that wrapped cards do not carry, and kept placeholders | the callers pass photo URLs and the stack keeps only real photos, loaded at once (8c4f10f) |

### What is still open
None.

### Rollback
`git -C continent-app revert 8c4f10f 3ad1b10`.

### End check list
Overview rails and an outdoor tab's openings, both widths.

---

## T600: a map on every outdoor tab

### What changed
Beaches, Lakes, Mountains and Cycling have a Europe-wide map; Trails maps each country's best walks until a country is picked, then every walk of that country as a route. Every outdoor tab has the compact head (pills, one What and Where row with the Map or List pill, quick chips) and the map fills the screen under it. Beach, lake and mountain pins carry the Score. Text typed into the overview's Where reaches the tab (`dq`), and a country name on Trails or Cycling picks that country.

### Files touched
Modified: `continent-app/src/browse/DestinationsTab.jsx`, `src/browse/WhereBar.jsx`, `src/styles/83-where-bar.css`, `src/browse/OutdoorMap.jsx`, `src/browse/ExploreMap.jsx` (`pinFig`), `src/App.jsx`, `src/lib/urlState.js`, `tests/urlPlaces.test.mjs`, i18n `where.*`.

### Commands run
eslint; npm test; flow7.

### Config and secrets set
None. New URL param `dq`.

### Before/after measurements
| Metric | Before | After | Delta |
|---|---|---|---|
| Outdoor tabs with a map at Europe level | 0 of 5 | 5 of 5 | +5 |
| Unit tests | 649 | 651 | +2 |

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| Trails opened from the overview with "Italy" showed an empty list | the hand-off raced the category change, so the text stayed and filtered walks by name | any Where text that is a country's name picks that country and clears itself (3d01e10) |
| The quick chips were hidden on desktop outdoor tabs | a desktop rule kept only the pane | the chips show on every width, as on Places (3d01e10) |

### What is still open
T600-a: when filters leave no map rows, the map view falls back to the list while the pill still reads List.
T600-b: Trails at Europe level maps each country's best walks (339), not every walk.

### Rollback
`git -C continent-app revert 3d01e10 66a8546`.

### End check list
Each outdoor tab at Europe level and with a country, list and map, both widths; Where from the overview.
