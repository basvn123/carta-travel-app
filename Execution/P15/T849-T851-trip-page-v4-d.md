# T849 to T851: trip page v4 Batch D, the Days tab

## Shared header

**Date.** 2026-10-29.

**Ask.** The owner, in chat: "Start Batch D".

**What Batch D covers.** Board panel 9 (change) and owner decision D3 (`Execution/P15/T834-board/marks.md`):
- let the traveller add their own ideas;
- make sure they can plan by hand as well;
- the "a person" figure can go;
- a day as detailed or as high level as the traveller wants;
- a pace per day.

This closes register row T839-d.

**Task numbers.** T849 to T851. T848 was the highest.

**Branches.** Both stacked on Batch C, nothing merged:
- continent-app `p15-trip-page-v4-d` (from `p15-trip-page-v4-c` `d82ae74`): `4369622`, `df73d9d`, `382b8ba`.
- Root `p15-trip-page-v4-d`: sync `37daf1634`, then this report.

**Checks.**
- `npm test`: 1029 of 1029 (1023 before; 6 new: 3 day names, 3 own ideas).
- ESLint on every touched file: 0 errors. The one warning in DayPlannerTab.jsx (an unused disable directive at line 561) was there before.
- NOPUBLIC fast build.

**End check.**
- `Execution/P15/T849-T851-walk/walk-d.mjs` on the build plus `public/`: 48 of 48 at 390, 1024 and 1440 px, no page or console errors (`walk.json`).
- The seed is the Slovenia trip, with three places planned on day 1 in the day planner's own store (`carta.dayplan.tripdraft`).
- The walk covers:
  - the cards, with day 1 reading back "Ljubljanica | Ljubljana Castle | Ljubljana Cathedral" from Ljubljana's fetched place shard;
  - an empty day, and no price;
  - an own idea, kept and then put on day 5;
  - day 2 in a few words;
  - day 3 Packed, stored as `dayPace {"0-2":"packed"}`;
  - all of it kept after a reload.
- Screenshots are in `Portfolio/wt/v4d-shots/`.

**Rollback, the whole batch.**
- `git -C continent-app checkout p15-trip-page-v4-c` and delete `p15-trip-page-v4-d`.
- The same in the root.
- The new store fields (`ideas`, `dayNotes`, `dayPace`) are optional and ignored by older code.

---

## T849: the Days tab, a card a day of what it holds

**What changed.** The Days tab (`planner/trip/TripDays.jsx`, replacing the bare list) shows every day as a card:
- **What a card holds:**
  - Day N and where it is (the base, or the day out from T843) with its date;
  - the first four places planned on it by name ("and 3 more");
  - the activities routed to it from a booking.
- **How names are read.** Places come from the day planner's own records through the same list it indexes (`dayNames.js`): the town's full coordinate list, fetched from its shard when not on the wire, then the plan's own places. The tab re-reads whenever the day store changes (`useTripDayStore.js`).
- **No price on a day,** as the owner asked.
- **Actions:**
  - "Plan it myself" (or "Change this day") opens the day in the day planner: planning by hand.
  - "Let Carta plan the days" at the top plans the empty days.
- Cards are one column on a phone and two from 769 px.

**Files.**
- New: `src/planner/trip/TripDays.jsx`, `src/planner/trip/useTripDayStore.js`, `src/planner/trip/dayNames.js`, `tests/dayNames.test.mjs`.
- Modified: `src/planner/TripPlannerTab.jsx`, `src/planner/TripSummary.css`, the six i18n files (`tp.days.*`).

**Commit.** `4369622`.

**Measurements.** Not measured.

**What broke.** No issues.

**Still open.**
- **T849-a.** The old Days list let a booked activity routed to a day (`dayExtras`) be removed with a cross. The cards show them but cannot remove them; the day planner and the trip's bookings tool still can.
- **T849-b.**
  - Ideas kept from Carta's own idea sections (`prefs.savedIdeas`, the day planner's days overview) do not show on the Days tab.
  - "Let Carta plan" works on all empty days, not one chosen day.

**End check covered.** Seven cards; day 1's three names; "Nothing planned yet" on an empty day; no "a person"; a plan action on each card; Let Carta plan the days; no sideways scroll.

**Rollback.** Revert `4369622`. The Days tab goes back to TripItinerary's day list.

## T850: your own ideas

**What changed.** "Your ideas" sits above the days (`OwnIdeas.jsx`, `ownIdeas.js`):
- anything in your own words, added with one field;
- each idea kept for later or put on a day with one select ("For later" first), and removed with a tap;
- an idea on a day shows on that day's card after its places.
- **Where it is kept:** the trip extras. `dayPlanStore` now keeps `ideas` and `dayNotes` (it whitelisted its fields), so the account sync carries them like the bookings and notes.

**Files.**
- New: `src/planner/trip/OwnIdeas.jsx`, `src/planner/trip/ownIdeas.js`, `tests/ownIdeas.test.mjs`.
- Modified: `src/planner/dayPlanStore.js` (kept CRLF), `src/planner/trip/TripDays.jsx`, `src/planner/TripSummary.css`, the six i18n files (`tp.ideas.*`).

**Commit.** `df73d9d`.

**Measurements.** Not measured.

**What broke.** No issues.

**Still open.** None.

**End check covered.** Add an idea, keep it for later, put it on day 5, see it on the card, and find it there after a reload.

**Rollback.** Revert `df73d9d`. Stored ideas stay in the extras, unread.

## T851: a day as loose or as close as wanted, and its own pace

**What changed.**
- **The high-level way:** "Plan it in a few words" (`DayNote.jsx`), a line or two of your own on the card, kept in the trip extras' `dayNotes`. A day with words no longer says "Nothing planned yet".
- **The detailed way:** "Plan it myself", place by place in the day planner.
- **Pace per day** (owner D3): each card has its own pace (Relaxed, Balanced, Packed), kept in the day planner's prefs as `dayPace` keyed by stop and day. The day planner reads it for the open day's route and timing (`DayPlannerTab` `dayPace`), and Carta's day-by-day queue sends it for that day, before the trip's own pace.

**Files.**
- New: `src/planner/trip/DayNote.jsx`.
- Modified: `src/planner/trip/TripDays.jsx`, `src/planner/DayPlannerTab.jsx` (two lines, kept CRLF), `src/planner/TripSummary.css`, the six i18n files (`tp.note.*`, `tp.pace.*`).

**Commit.** `382b8ba`.

**Measurements.** Not measured.

**What broke.**

| What | Cause | Fix |
|---|---|---|
| A day with only a few words still read "Nothing planned yet" | The empty line looked at places only | It also looks at the day's words (before the commit) |

**Still open.**
- **T851-a.** The day planner's own pace setting, inside a day, still writes the trip-wide pace. A pace changed there does not become that day's pace. It should write `dayPace` for the open day.

**End check covered.** Day 2 in a few words; day 3 Packed while day 4 keeps Balanced; the stored `dayPace`; all kept after a reload.

**Rollback.** Revert `382b8ba`.
