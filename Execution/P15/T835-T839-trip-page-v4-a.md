# T835 to T839: trip page v4 Batch A, edit in place with no edit mode

## Shared header

**Date.** 2026-10-29.

**Ask.** The owner, in chat, about the trip page:
- Two screenshots of the live trip page: Costs inside Edit, and Editing your trip.
- An audit (`Downloads/plan carta.md`) and a reference PDF (Mindtrip, Booking, Airbnb, Wanderlog).
- What they asked for: a page that gives the flexibility to change the plan and a full overview of it, top notch on phone and desktop, built step by step.

**Plan and board.**
- Plan: `Execution/P15/_PLAN-trip-page-v4.md`.
- Board: T834, https://claude.ai/artifact/DkrztyyjBAdUd4AEnS69C4.
- Owner marks: `Execution/P15/T834-board/marks.md`, pasted in chat. The board's store never received them.

**What the marks decided for this batch.**
- Panel 1 (the head: every chip edits its own fact): keep.
- Panel 2 (People, From, the name in place): keep.
- Panel 5 (changing nights balances the trip): keep.
- Panel 11 (every change can be undone): keep.
- Panel 3 (Overview), change: no "a person, a day" line, airline logo, a way to put in the price, check the phone overlap, small and simple, icons, no sub-lines.
- Panel 4 (Itinerary), change: no "Transfers, between stops"; a cleaner Change flight (Batch B).
- Panel 8 (Costs), change: BRU to FUE with the plane instead of "Getting there", everywhere.
- D1 (Undo): the toast and the buttons.

**Order changed from the plan.** The stop editor (nights, move, remove, add) existed only inside Edit trip. Removing the edit mode therefore needed the stop controls on the route first, so panels 4 and 5 moved from Batch B into this batch (T837).

**Task numbers.** T835 to T839. T834 was the highest in `git log --all` and `Execution/`.

**Branches.**
- continent-app `p15-trip-page-v4-a`, from master `effacb5`: 10 commits, `f4d9ab9` to `1c2bcd1`.
- Root `p15-trip-page-v4-a`, from `p15-trip-page-v4-board`: sync `32f1a2a67`, then this report.

**Checks.**
- `npm test`: 1012 of 1012 (999 before; 13 new: 8 edit history, 5 balance).
- ESLint on every touched file: 0 errors. The one warning (`Icon` unused in TripSummary's chip map) was there before.
- NOPUBLIC fast build: `wt/vite.pf2-batch.mjs` with `PF_ROOT` set to the main continent-app.
- `design-lint`: nothing new of its own kind in the touched files. The raw chip, tile and dock buttons and two shadow literals in TripSummary.css were already on master. The middots this batch met are gone.

**End check.**
- `Execution/P15/T835-T839-walk/walk-a.mjs` on the NOPUBLIC build plus `public/`, at 390, 1024 and 1440 px: 109 of 109, no page or console errors (`walk.json`).
- It seeds an Austria trip (Hallstatt 4 nights, Salzburg 3, 21 to 28 Nov, from Brussels) and walks:
  - the name;
  - Dates with balancing, Undo, Redo;
  - People and Undo;
  - From;
  - Itinerary: stepper, balance, Apply, Undo, Remove, Undo, Add a stop, and the More menu on a phone;
  - Costs;
  - Add what you paid.
- Screenshots are in `Portfolio/wt/v4a-shots/`.
- The dev server could not be used: its dependency scan hung for 5 minutes on two ports, and the older pf2 server on 5809 dropped requests. So the walk served the build with `serve-a.mjs` (scratchpad, a 30-line static server).

**Rollback, the whole batch.**
- `git -C continent-app checkout master` and delete branch `p15-trip-page-v4-a`.
- In the root: `git checkout p15-trip-page-v4-board` and delete branch `p15-trip-page-v4-a`.
- Nothing is merged, pushed or deployed. No data or schema changed.
- One task alone: `git revert` its commits in continent-app. The commits are listed per task, and the later fix commits name their task.

---

## T835: Undo and Redo on the trip page

**What changed.** Every change to a trip can be undone (owner D1: the message and the buttons).
- **How changes are recorded.** `planner/trip/editHistory.js` (pure) and `useEditHistory.js` watch the trip's editable state by value and record a step for each change, whichever control made it. That state is the planner's fields (`useTripPlanner` `editState`) plus the trip settings' dates, party, from and name.
- **What counts as one step.**
  - A burst of the same change within 900 ms (a stepper pressed five times, a name typed) is one step.
  - So is one action that lands over a few renders within 150 ms. For example, a chip saves both the planner and the trip settings.
- **Putting a step back.** `restoreEdit` in the hook, plus the trip settings and the app-wide When, party and From.
- **Where Undo lives.**
  - The message: "Removed Salzburg", "Changed the dates" and so on, with Undo, for 6 s in the shell's bottom slot. On a phone it sits above the dock.
  - From 1024 px: Undo and Redo IconButtons at the end of the tab row.
  - Below 1024 px: in the top row's More menu.
  - Keyboard: Ctrl or Cmd with Z, and with Shift+Z or Y for Redo, outside a field.
- **When the history starts fresh.** On another trip (plan id or device key), or when the page turns on again after the wizard. Loading a trip is never a step.

**Files.**
- New: `src/planner/trip/editHistory.js`, `src/planner/trip/useEditHistory.js`, `src/planner/trip/TripUndoToast.jsx`, `tests/editHistory.test.mjs`.
- Modified: `src/hooks/useTripPlanner.js` (`editState`, `restoreEdit`), `src/planner/TripPlannerTab.jsx`, `src/planner/TripSummary.jsx` and `.css`, `src/components/Icons.jsx` (`UndoIcon`, `RedoIcon`), the six `src/i18n/*.js` (`tp.undo.*`).

**Commits.** `f4d9ab9`, and the fix `841fad5`.

**Measurements.** Not measured.

**What broke.**

| What | Cause | Fix |
|---|---|---|
| The page crashed on the first change after an Undo ("reading 'key'", end check, People) | After Undo the history has no last change, and `record` read `h.last.key` | `h.last?.key`, a test for a change right after an Undo (`841fad5`) |

**Still open.**
- The Lifestyle chip opens the app-wide Lifestyle panel. That choice is not in the trip's state, so it is not a step (T835-a).

**End check covered.** Undo message after the Dates, People and Remove changes. Undo and Redo buttons at 1024 and 1440. The More menu items at 390. Undo restoring dates, party, nights and a removed stop.

**Rollback.** Revert `f4d9ab9` and `841fad5`. T836 and T837 read `tp.quoteDelta`, not the history, but the toast notes in T836 ride on it: revert T836 first or with it.

## T836: every chip edits its own fact, and the name in place

**What changed.** Each chip on the trip's head edits its own fact (board panels 1 and 2, kept).
- **Dates, People and From** open their own editor, `planner/trip/ChipEditor.jsx`. `SheetShell` hangs it from the chip from 1024 px and makes it a sheet below that.
- **Dates:** a start and an end on one calendar. When the window and the stops' nights disagree, `Balance.jsx` asks where the difference goes, using `lib/tripBalance.js` `datesOptions`:
  - give it to, or take it from, a stop (the last stop or the longest stay first);
  - or keep the stops and end on their date.

  Each choice shows what it does to the total. That comes from `quoteDelta`: the trip priced with the change against the same trip as it is, both on the swept fares.
- **People:** the PartyEditor steppers.
- **From:** the town search. Its note ("Flights are now priced from {town}.") rides on the change's Undo message.
- **Where answers go:** to the planner and the trip settings at once (and to the app-wide When, party and From), so they are one Undo step.
- **Places and Lifestyle** chips are unchanged: the Itinerary tab and the one Lifestyle panel.
- **The name** has a pencil beside it and becomes a field: Enter keeps, Escape restores. It saves the trip settings' name and the plan's label.
- **Opening low on the screen:** a chip in the lower part of the screen scrolls near the top before its editor opens (from the end check).
- **Copy:** the dates chip lost its middot.

**Files.**
- New: `src/planner/trip/ChipEditor.jsx`, `src/planner/trip/Balance.jsx`, `src/lib/tripBalance.js`, `tests/tripBalance.test.mjs`.
- Modified: `src/hooks/useTripPlanner.js` (`quoteDelta`), `src/planner/TripPlannerTab.jsx`, `src/planner/TripSummary.jsx` and `.css`, `src/planner/trip/editHistory.js` (settings changes fold into dates and people), the six i18n files (`tp.ed.*`, `tp.bal.*`, `tp.rename`).

**Commits.** `d983edb`, the scroll in `5340bf6`.

**Measurements.** Not measured.

**What broke.**

| What | Cause | Fix |
|---|---|---|
| The Dates editor squeezed into the space under a chip low on the screen (1440 shot) | The anchored panel only gets the height below its trigger | The chip scrolls near the top before the editor opens (`5340bf6`) |

**Still open.**
- People shows only the steppers. The kind of group, children's ages and slower walkers stay in Trip settings. This follows the board; no row.

**End check covered.**
- Dates opens anchored at 1024 and 1440 and as a sheet at 390, asks, Saves, and the chip changes.
- People to 3 adults and back.
- From opens and Escape closes it.
- The name renamed in place.

**Rollback.** Revert `d983edb` (and the T836 part of `5340bf6`). The chips then open Trip settings again.

## T837: the stops are changed on the route

**What changed.** The stops are changed on the Itinerary tab's route (board panels 4 and 5).
- **Each stop card** (`TripItinerary` `StopNights` and `StayDays`, fed by `stopEdit` from the page) has:
  - a nights stepper. Inside fixed dates it asks where the changed nights come from or go: move the end, or take them from or give them to another stop (`nightsOptions`), each with its effect on the total. Nothing moves until Apply.
  - the arrive and leave days as two tiles (Airbnb's check-in and check-out);
  - Move up, Move down and Remove (red text) under the stop. Remove runs at once, and Undo brings the stop back.
  - a grip that repeats the moves with a mouse only.
- **"Add a stop"** opens the one add-a-stop block (your shortlist, Carta's suggestions, any town by country). It is shared with the first-stops editor; its button is the kit's.
- **Flights by airports** (panel 8 "everywhere"): a flight is named by its airports, "BRU → SZG", where "Getting there" and "Getting home" stood. This covers Carta's flight and a planned route without a fare yet (`RouteCodes.jsx`, one plane per row).
- **On a phone** the stop's name keeps its room and the stepper wraps under it (from the end check).

**Files.**
- New: `src/planner/trip/RouteCodes.jsx`.
- Modified: `src/planner/TripItinerary.jsx` (kept in CRLF, as it is stored), `src/planner/TripPlannerTab.jsx`, `src/planner/TripSummary.css`, `src/components/Icons.jsx` (`GripIcon`; the file's endings normalised to its CRLF), the six i18n files (`tp.stop.*`).

**Commits.** `6a62eec`, `fc06113`, `5340bf6`.

**Measurements.** Not measured.

**What broke.**

| What | Cause | Fix |
|---|---|---|
| Hallstatt's name vanished beside the stepper at 390 | The stop button was `flex: 1` with `min-width: 0` beside a fixed stepper | `flex: 1 1 200px`, so the stepper wraps under (`5340bf6`) |
| The flight row showed two planes | `RouteCodes` drew its own plane in a row that has one | `icon={false}` in rows with a mark (`5340bf6`) |
| A trip without a swept fare still said "Getting there" | The codes came only from Carta's flight | The planned route's airports when there is no fare (`fc06113`) |
| The first T837 commit rewrote TripItinerary.jsx's line endings (2180 lines) | The script wrote LF to a file stored with CRLF | Amended before any later commit, with CRLF kept. The same check caught PlanTotal.jsx in T839 (stored LF) |

**Still open.**
- Board panel 4's cleaner Change flight, panel 6 (Change flight with the airline mark and preferences: only direct, between these hours) and panel 7 (Swap city as a choosing flow, by yourself or with Carta's questions) are Batch B (T837-a, T837-b).
- So are a stay type per stop (D2) and day trips from a base (D4) (T837-c, T837-d).
- The per-stop nights cap: the stepper allows 60, the wizard 21. Register row T812-b still decides it.

**End check covered.**
- Two editable stops with arrive and leave tiles.
- BRU → SZG on the way there.
- One more night in Hallstatt: Take them from Salzburg, Apply (5 and 2), Undo (4 and 3).
- Remove Salzburg: the message names it, and Undo brings it back.
- Add a stop opens.
- No sideways scroll at 390.

**Rollback.** Revert `5340bf6`, `fc06113` and `6a62eec` (after T838, which needs them: without T837 the route has no stop controls).

## T838: no edit mode on the trip page

**What changed.** The trip page has one layout.
- **Gone:** Edit trip, the Editing bar, Done, the side column's edit total and the dock's Done.
- **What used to open edit mode:**
  - A trip with stops always opens on its page.
  - My trips' Edit opens the Itinerary tab.
  - A shared trip without dates opens with the Dates editor up.
  - A draft kept from the old editor (planned false) opens planned.
- **Parts of the form with no other home** move under the route on the Itinerary tab:
  - how the trip gets between its stops (Carta picks, train and bus, rental car, own car with where you drive from);
  - a cheaper order of the stops.
- **What else went with the form:**
  - its dates and origin fields (now the chips) and its nights ring (the dates chip says it);
  - its stop list (now the route) and its receipt with People and Lifestyle (the chips and Costs);
  - its dead helpers: `NightsRing`, its `Stepper`, `LegRow`, `MODE_META`, the date bounds.
  - The T830 edit CSS, except the name field.

**Files.** Modified: `src/planner/TripPlannerTab.jsx` (443 lines out), `src/planner/TripSummary.jsx` and `.css`, `src/planner/TripItinerary.jsx` (`routeExtra`).

**Commit.** `9902c79`.

**Measurements.** Not measured.

**What broke.** No issues.

**Still open.**
- Strings no longer used in any language (T838-a): `tp.editing`, `trip.doneEditing`, `trip.sum.edit`, `trip.tripNeedsDates`, `trip.onToGettingThere`, `trip.whenTitle`, `trip.whereFromTitle`, `trip.nightsOfWindow`, `trip.overWindow`, `trip.deviceOnlyNote`, `trip.flightNotPriced`, `plan.readiness`, `tp.aDay`.
- The old editor's CSS (`.trip-stops`, `.trip-stop*`, `.nights-ring*`, `.trip-nights-summary`, `.trip-leg*`) is probably unused now and stays for a cleanup task that can prove it with css-routes (T838-b).
- T832-a (Plan a trip here on a country page while a trip exists) is unchanged by this batch and still open.

**End check covered.** No Edit trip and no Editing bar at every width. Between stops under the route. The trip opens on its page from Plan home.

**Rollback.** Revert `9902c79`. The edit mode comes back as it was in T830 to T832.

## T839: the overview's cost band, small and simple

**What changed.** The Overview's cost band follows board panel 3.
- **The band** is the total, the Group / Per person switch and four tiles of an icon, a word and a figure. Gone: "€965.60 a person, €276 a day" and every tile sub-line ("Transfers, between stops", "7 nights, €70 a night", the airline names).
- **The flights tile** shows the airlines' own marks (`AirlineMark`), named for screen readers.
- **"Add what you paid"** (a quiet button beside View breakdown) opens the Itinerary at the route's own price fields: the fare first, else a stay's.
- **The overview route** names a flight by its airports, with Carta's flight or a planned route, and its way line joins its parts with a comma, not a middot.
- **The receipt** (Costs) loses "N of M prices are your own", a method line. The budget line stays.
- **Phone overlap:** at 390 the band, the 2 by 2 tiles and the dock no longer overlap (end check screenshot `01-overview-full-390`).

**Files.** Modified: `src/planner/trip/CostTiles.jsx`, `src/planner/TripSummary.jsx` and `.css`, `src/planner/PlanTotal.jsx` (stored LF, kept), `src/planner/TripPlannerTab.jsx`, the six i18n files (`tp.addPaid`).

**Commits.** `6d2ac8f`, `4229f72`, `1c2bcd1`.

**Measurements.** Not measured.

**What broke.**

| What | Cause | Fix |
|---|---|---|
| The T839 commit rewrote PlanTotal.jsx to CRLF (656 lines) | The file is stored LF; it was added with autocrlf off | Re-added normally and amended (16 lines) |

**Still open.**
- "A way to really put in the price" was read as Add what you paid, opening the route's fields. Confirm or say where it should go (T839-a, owner).
- Panel 8: "the colours must be distinct" in Costs goes against carta-design's cost bar (the ink ramp, no colours, no legend). It needs the owner's call before Batch C (T839-b, owner).
- Panel 9 (Days: your own ideas, planning by hand, the day as detailed or as high level as wanted, no "a person" figure) and the rest of panel 8 are Batches C and D (T839-c, T839-d).

**End check covered.**
- Four tiles, no sub-lines and no band sub-line at every width.
- Add what you paid opens Itinerary.
- Costs has no "prices are your own".
- No sideways scroll.

**Rollback.** Revert `1c2bcd1`, `4229f72` and `6d2ac8f`.
