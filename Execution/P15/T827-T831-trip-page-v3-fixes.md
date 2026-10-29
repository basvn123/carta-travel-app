# T827 to T831: the five open items of the trip page v3 batch

## Shared header

**Date.** 2026-10-29.

**Ask.** The owner, in chat, on the five items left open by T819 to T826: "fix all of these". The items:
1. the €8 gap between the days screen and the trip page (T826-a);
2. the tab lost on a reload (T819-a);
3. no sticky price bar on a phone (T819-b);
4. Edit trip in its own workspace (T822-a);
5. saved Carta trips not in My trips (T824-a).

**Task numbers.** T827 to T831. T826 was the highest number.

**Branch.** The same unmerged batch branches, `p15-trip-page-v3`, in continent-app and in the root repo. One commit per task; T828 has two.

**Checks.**
- `npm test`: 997 of 997 (5 new `draftState` tests).
- ESLint on every touched file: 0 errors.
- NOPUBLIC fast build.
- `wt/v3-walk.mjs`: 124 of 124 at 390, 1024 and 1440 px, with no page or console errors.
- `wt/v3-carta.mjs`: 42 of 42.

**Earlier report.** `Execution/P15/T819-T826-trip-page-v3.md`.

## T827: one total on the days screen and the trip page

**What changed.**
- **The gap:** the day planner priced the stored trip draft at the app's stay and Lifestyle, with no flights picked in Getting there. After a different flight was picked it said €1,939.20 where the trip page said €1,931.20.
- **The fix:** it now prices the draft the way the trip planner does. That means the trip's own stay, the trip's eating habits (a finder trip's, until the app's Lifestyle moves), the flight ranking, and the picked flights over the live answers.
- **Where:** `lib/price/draftState.js` (`draftQuoteState`, `draftLifestyle`).

**Files.**
- Created: `src/lib/price/draftState.js`, `tests/draftState.test.mjs`.
- Modified: `src/planner/DayPlannerTab.jsx`.

**Measurements.**

| Metric | Before | After |
|---|---|---|
| Days screen total after a flight pick | 1,939.20 | 1,931.20 |
| Trip page total | 1,931.20 | 1,931.20 |

**What broke.** Nothing.

**Rollback.** Revert the T827 commit.

## T828: the tab in the address, and places that wait while they load

**What changed.**
- **The tab:** the trip page's tab rides in the address as `?tt=itinerary`, `?tt=costs` or `?tt=days`. Overview leaves the address clean. A reload or a copied link opens the same tab.
- **A second fix, found by the reload walk:**
  - **The symptom:** right after a reload, "Let Carta plan them" planned 1 day and said the other 6 had too few places.
  - **The cause:** `ensurePois` answered a second request for a town whose list was already loading with the short placeholder list (8 places, 0 candidates).
  - **The fix:** it now waits for the load in progress.
  - **The result:** 7 of 7 days are planned. This was also the cause of the "6 of 7, one had too few places" in the first batch.

**Files.** Modified: `src/planner/TripPlannerTab.jsx`, `src/planner/DayPlannerTab.jsx`.

**Measurements.**

| Metric | Before | After |
|---|---|---|
| Tab after a reload on Costs | Overview | Costs |
| Days Carta plans on Hallstatt and Salzburg | 6 (1 after a reload) | 7 |

**What broke.** Nothing.

**Rollback.** Revert the two T828 commits.

## T829: the phone price bar

**What changed.**
- **Where it shows:** below 1024 px the trip page keeps a bar over the bottom nav, with the total and Plan your days. In edit mode it shows Done instead.
- **What it does:** the figure follows the Group / Per person switch, and tapping it opens the Costs tab.
- **Layering:** it sits under the My trips and Account pages and every sheet, and it leaves with the trip page.
- **Phone tools:** the in-page Plan your days button is no longer repeated on a phone.

**Files.** Modified: `src/planner/TripSummary.jsx`, `src/planner/TripSummary.css`.

**Measurements.** At 390 px the bar sits directly on the nav (bottom 780 against nav top 780).

**What broke.** Nothing. The walk was moved to the bar's button.

**Rollback.** Revert the T829 commit.

## T830: Edit trip inside the trip page

**What changed.** Edit trip is now the trip page in edit mode.
- **Kept from the trip page:** the same top row, photos and chips. The name becomes a field.
- **Where the tabs were:** an Editing bar with Done.
- **The body:** the stop editor sits in the body's column.
- **From 1024 px:** the map card and the total sit beside the editor.
- **On a phone:** the map card sits over the editor, and Done is in the phone bar.
- The half-screen map workspace remains only while the wizard is open.

**Files.** Modified: `src/planner/TripSummary.jsx`, `src/planner/TripSummary.css`, `src/planner/TripPlannerTab.jsx`, the six `src/i18n/*.js` (`tp.editing`).

**Measurements.** Not measured. The walk checks that Edit opens inside `.tpg.is-edit` with its stop cards and the map, and that Done comes back, at all three widths.

**What broke.** Nothing.

**Still open.** The old `plan-ws` edit workspace is still in the code for the wizard path (T830-a).

**Rollback.** Revert the T830 commit.

## T831: saved Carta trips in My trips

**What changed.**
- **The section:** the bookmark on Carta's trips page now also lands in My trips, as "Saved from Carta's trips" under Kept trips in the Shortlist. Each row shows the photo, the name, where and the days, the price from a person a day, Open (the week's page) and Remove.
- **The count:** the Shortlist tab counts saved weeks.
- **The empty line:** it no longer shows when only saved weeks are there.

**Files.**
- Created: `src/auth/mytrips/SavedJourneys.jsx`.
- Modified: `src/auth/SavedTripsPanel.jsx`, the six `src/i18n/*.js` (`tp.saved.*`).

**Measurements.** Not measured.

**What broke.** Nothing.

**Still open.** Saved weeks are on this device only. They do not sync to the account (T831-a).

**Rollback.** Revert the T831 commit. The device key `carta.savedJourneys.v1` is harmless if left.

## End check covered

All in `wt/v3-walk.mjs` and `wt/v3-carta.mjs`, at 390, 1024 and 1440 px:
- the days screen total against the trip page;
- reload on Costs, and Overview clearing the address;
- the phone bar on the nav, and no bar on a laptop;
- Edit inside the page, and Done;
- Carta plans 7 of 7 days;
- save on Carta's trips, then the row in My trips, then Open.
