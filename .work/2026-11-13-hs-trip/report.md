# Report: trip lane of the house style (G1)

Status: done. Judge 1 98/135 FAIL (four blocking, `judgement-1.md`), fixed in `2927503427`; judge 2 109/135 PASS, nothing blocking (`judgement-2.md`). Fix at integration (judge 2): craft (C4 at 3): sweep the tabs and sheets, one-stop, long-name and empty-trip shots, the 1440 head gap; the 1.5 s roll window against DESIGN.md's 1 s.
Branch: `p15-hs-trip` (worktree `wt/hs-trip`), base `1bc221b9de`; commits `0fdf3aac05`, `81de557762`, `2927503427`. ROADMAP: G1, with G3 (one cost card look, trip side) and G10 (three angles).

## What was done
L2 crew run (design playbook): three explorers (trip page, day planner, sheets and kit), three proposals (A the path, B the cost post, C the workspace), three critics (all picked A), decision `decision.md` (A with the critics' fixes), build by the lane orchestrator, judge 1 (98/135, four blocking), one fix round, judge 2.

## What changed, per screen (before: `before/`, after: `shots/`)
| Screen | Before | After | Files |
|---|---|---|---|
| Trip page head | Name, chips and pencil on the photo over a dark fade | Name, where line and status chips on the page; photo beside them (under 769: above, 5:2); no text on the photo | `planner/TripSummary.jsx`, `planner/TripSummary.css` |
| Journey line | none | New static line: stop pills as long as their nights, legs with mode icons (dashed for flights), home discs, "N nights" | `planner/trip/JourneyLine.jsx` (new), `TripSummary.css` |
| Your route | White cards, boarding-pass flights with a plane on a dashed line | A footpath: day stamps, a path column (umber beside stays, dashed ink under flights, ink under hops), signpost plates for stays, leg plates for flights, drives and hops, status and Book in a quiet row; car advice as a branch | `planner/trip/Journey.jsx`, `TripSummary.css` |
| Still to book | Ticket passes with perforation, primary Book on every card | Paper panels, plain hairline between the ends, secondary Book, painted pager | `planner/trip/BookPasses.jsx`, `TripSummary.css` |
| Cost card (arc that ships) | Umber gradient slab, ring gauge, coloured discs | Paper cost post, ink total plate (`Figure`), weighted train of the four parts, budget line with its bar, umber icons; `COST_CARD_UMBER` untouched, `ccard-arc` class kept | `planner/trip/CostCard.jsx`, `TripSummary.css` (scoped `.tpg .ccard`) |
| Layout | 820 = stretched phone; side column map first | Tablet: route left, cost post right (sticky on tall screens); wide: cost post, tools, map; Plan your days in the top row from 1024 | `TripSummary.jsx`, `TripSummary.css` |
| Itinerary, Costs, Notes tabs | Lagoon/sun/terracotta colours, old cards | Itinerary on the path with umber number discs and paper panels; Costs receipt as a paper panel with the train's fills, a group without a figure says Not yet (was 0.00); kit, export, Before you go and notes in umber/beige | `TripSummary.css`, `planner/PlanTotal.jsx` (one presentational branch) |
| Change your trip, Share | Boxed rows with beige tiles | Setting rows on hairlines, umber icons | `TripSummary.css` |
| TripTrace map | Lagoon sea, planes on dashed arcs | Map land/water tokens, umber route, dotted flights, no plane | `TripSummary.css` |
| Day planner | Title three times, boxed arrows, three prices, blue/black pins, entrance animation at first paint | Drawer strip as the day's signpost plate; h1 hidden only in the drawer; round arrows and a date pill; Start your day without the cost fact (valid `dl`); stops numbered on an umber path; Best order glide on the settle spring; tablet column for kit, guide, exports | `planner/days/DayHouse.css` (new), `DayCost.jsx`, `days/DayStart.jsx`, `days/DayBody.jsx`, `DayPlannerTab.jsx` (import), `DayPlanPanel.jsx` (glide timing), `styles/planners/68-v6-dayplanner.css`, `styles/planners/89-plan-days.css` |
| Copy (six languages) | | `tp.map.title` Map; `dayws.routeChecked` Every walk checked; `dst.plan` Fill this day; `dayws.emptyCarta` Fill Day {n}; `tp.cx.shift`, `dayr.before` shorter; `dayws.costBarName` holds the visible words; new `tp.line.label`, `tp.hopFrom` under the lane marker | `src/i18n/*.js` |
| Docs | | `references/trip.md` gains "The look" | `.claude/skills/carta-design/references/trip.md` |

Every changed file: `git diff --stat 1bc221b9de..p15-hs-trip`.

## Function parity
No control, handler, data field, ARIA name the code reads, data-testid or JS-load-bearing class removed. Moves: Plan your days from the side tools to the top row (wide, same handler); map card after the route (phone) and last in the side column (wide); countdown and booked chips off the photo; the hop's towns now "Bus to Lake Bled" with "From Ljubljana"; the day cost fact in Start your day no longer drawn (it is the strip's and the cost bar's figure); "Day 1" kept. Two accessible names changed for the better (WCAG 2.5.3): `dayws.costBarName` now contains its visible words; spaces added between figure and unit.

## Checks (final, at `2927503427`)
| Check | Result |
|---|---|
| `npm test` | 2,111 tests, 25 fail, exactly the sparse baseline (`baseline-fails.txt` = `fails-run3.txt`) |
| `npm run lint` | 0 errors, 13 warnings (unchanged) |
| design-lint | 4,399 found, all in the baseline, 0 new (10 fewer than at the base) |
| token-contrast | 0 under the floor |
| css-routes `--check` | all route-only, none overridable |
| axe (lane script `axe_lane.mjs`, 9 screens x 390/820/1280) | serious/critical 0 (`axe-3.json`, `axe-4.json`) |
| Width sweep 360 to 1920, EN and DE | clean at the first run (`sweep-1.json`, `shots/sweep-de.json`); the last EN run (`shots/sweep-en.json`) clean except one load timeout opening the day at 1920 (the same width was clean before) |
| Verify scripts | identical to `verify-before/` for every script except `verify_trip_page`, which fails to open `#itin=` today on the base commit too (`verify-after/verify_trip_page-base-now.txt`, 47/59): the shared data changed, not the lane |
| impeccable detector | not run (tool time); design-lint and axe cover its mechanical rules |

## Screenshots
`shots/<screen>-<width>.png` (and `-full`): trip, trip-itinerary, trip-costs, trip-days, trip-notes, trip-change, trip-sharesheet, trip-share-offer, day, day-start at 390, 820, 1440; trip and day also at 360, 1180, 1920. German at 360 in `w-de/`.

## Departures from the house style
- The cost post's train is hand-built from the kit's wagon classes (FR 1).
- The day map's stay pin and ferry leg keep the map's look (FR 4, foundation-owned).
- The StepMini fill on the day landing stays ink (FR 2, kit).

## Open items
`foundation-requests.md` (4), `handbook-notes.md` (ROADMAP, project map, owner suggestions: journey line as navigator, dead day step keys, `data.notYet` wording).

## How to undo
`git revert 2927503427 81de557762 0fdf3aac05`. No data, schema or storage change.
