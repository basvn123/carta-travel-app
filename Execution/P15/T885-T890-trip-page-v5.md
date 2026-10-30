# T885 to T890: the trip page v5, one calm page

## Task ID

T885 to T890, one batch (CLAUDE.md "Batches"), branch `p15-trip-hub`.

## Date

2026-10-30

## Shared header

The owner sent three screenshots of a planned trip (Corfu) and the My trips card. They asked for research on what a planned-trip page must show first, how a traveller changes a trip, and where ideas and documents go, in Carta's colours and clean on phone, iPad and desktop. Then they approved the design published as the artifact "Your Trip, One Page" ("I love it go").

**The owner's open decisions, defaulted as the artifact proposed:**

- countdown and booking status on the trip cards: yes;
- the checklist starts from Carta's list: TripExtras' existing basics;
- email forwarding: later (T889-c);
- "Opnieuw met je antwoorden" keeps the old trip as a version: not built (T888-a).

**Research behind the design, in the artifact:**

- what comes first: TripIt's "next up", Airbnb's countdown and its Change reservation with old and new totals;
- choosing dates: Google Flights' date grid;
- documents: forwarding and imports in TripIt, Kayak, Tripsy and Lambus;
- layout: NN/g on bottom sheets, and the Material window size classes.

**How it was checked.** This session has no app data and no access to the live site, so each task ran static checks only (eslint on the touched files, `npm test`, design-lint). The end check was one throwaway harness (`continent-app/__t891/`, deleted, never committed). It rendered the real `TripSummary` with a synthetic Corfu trip, using the figures from the owner's screenshot: flights €548, stay €826, food €710.16, total €2,084.16, budget €1,800 a person.

The harness ran through the app's own Vite config. Playwright drove it at 390x844, 820x1180 and 1440x900:

- the Overview;
- Breakdown opened;
- Change your trip, then Dates: picking 2 June and applying;
- the Notes tab with the basics added.

**What it found:**

| Check | Result |
|---|---|
| Page errors | none |
| Sideways overflow | none at any width |
| Clipped text | none |
| Impact before Apply | "Nu €2.084 / wo 2 jun €2.000 / €84 minder" |
| Trip bar after Apply | "wo 2 jun tot wo 9 jun" |

Four fixes came out of it (see T885, T887 and T888).

**The design rules.** The look is the owner's free direction (carta-design: the T878 design-freedom note and "Trips for you v2"), with Carta's colours:

- ink, the umber tints, and rust only for a warning;
- the four cost colours only in the cost card;
- sun yellow only on the cheapest start day.

The one new design-lint hit is the head's photo fade (a gradient), the same approved fade as on Trips for you. `DESIGN.md` is unchanged: no token changed.

---

## T885: the head, one photo with the name, the countdown and what is booked

### What changed

**The head:**
- One photo carries the trip's name, the country (in the reader's language) and how many places, over an ink fade.
- Two white pills sit on the photo: the countdown ("Nog 218 dagen", "Dag 3 van 8", "Voorbij") and how much is booked ("1 van 3 geboekt").
- `shownTripName`: a name that is only the country a finder trip landed with ("Greece" for a week in Corfu) shows its places instead ("Corfu").

**The trip bar** replaces the five chips. Wanneer, Wie, Vanuit and Verblijf each show a label over a value with a pencil, and each opens its own editor (T836 for the first three, the Lifestyle sheet for Verblijf). The places chip became the line under the name.

**Trip settings** moves from the gear on the top row into the More menu.

The helpers live in `planner/trip/tripHead.js`: `countdownText`, `shownTripName` and `bookedCount`.

### Files touched

`continent-app/src/planner/TripSummary.jsx`, `TripSummary.css`, `trip/tripHead.js` (new), `TripPlannerTab.jsx` (More menu item), the six i18n files (tp.cd.*, tp.bookedOf, tp.places1/N, tp.bar.*), `continent-app/tests/tripHead.test.mjs` (new).

### Commands run

eslint on the touched files, `node --test tests/tripHead.test.mjs`, `npm test`, design-lint.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Name of a Corfu trip that landed as "Greece" | Greece | Corfu |
| Controls in the top row | 4 (save, more, share, settings) | 3 (save, more, share), plus Wijzig je reis from 1024 px (T888) |

### What broke and how it was fixed

Found in the end check:
- The place line read the wire's English country ("Greece"). It now uses `Intl.DisplayNames` ("Griekenland").
- A trip bar with three cells left a hole on a phone. The last odd cell now takes the row, below 600 px only.

Both fixes are in commit 06e7acf0d.

### What is still open

T885-a: the trip bar shows Verblijf only where the settings context offers the Lifestyle sheet. Check on a trip opened from My trips.

### End check screens

The head at 390, 820 and 1440 px, with and without a photo. Also a two-place trip ("Split en Hvar"), a running trip and a past trip.

### Rollback procedure

`git revert 06e7acf0d 40bf24eff`.

---

## T886: what the trip costs, said once

### What changed

- **`CostCard` (new):** the total for the group or per person, the cost bar in the four cost colours, and the budget line (`BudgetCard compact`: no title, no second total).
- **Opbouw:** a button at the top that folds the four groups open as icon rows (`CostTiles is-rows`), each opening its group in the Costs tab. Under them: Kosten and "Voeg toe wat je betaalde".
- **Placement:** the side column from 1024 px on every tab, and the Overview on a phone.
- **Dock:** no figure any more. It holds Wijzig je reis and Plan je dagen.
- **Side column tools:** Plan je dagen, Wijzig je reis and Delen.

### Files touched

`continent-app/src/planner/trip/CostCard.jsx` (new), `trip/BudgetCard.jsx` (compact), `TripSummary.jsx`, `TripSummary.css`, `TripPlannerTab.jsx` (compact budget), the six i18n files (tp.change).

### Commands run

eslint, `npm test`, design-lint.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Places the group total shows on the Overview (phone) | 3 (band, budget card, dock) | 1 (the cost card) |

### What broke and how it was fixed

Nothing in the end check.

### What is still open

None.

### End check screens

The cost card closed and open, Groep / Per persoon, a trip without a budget ("Set a budget"), and the dock on a phone.

### Rollback procedure

`git revert 797ca1b2c`.

---

## T887: one route timeline that books

### What changed

- **One list:** ReadyToBook's rows are now `bookRows()` (exported, pure apart from the PaidField elements). Each node of the route carries where it stands (Geboekt, or Te boeken with its link out) and Add what you paid. A hop between stops that can be booked becomes a node of its own. The separate Ready to book list left the Overview.
- **Overnight flights** name their arrival day and their stops: "14:05 tot 07:50 zo 6 jun, 1 tussenstop".
- **A stop's figure** is its bed, labelled "verblijf", instead of bed and food together without a label.
- **Nog te boeken** opens the Overview: what is booked out of what can be, then the next part with its Boek link.
- **The car advice** offers "Huurauto toevoegen" with what it does to the total. The figure comes from `quoteDelta({ transportPref: 'car' })`, memoised in the parent. While the advice stands, an empty Getting around reads "Huurauto aangeraden" instead of "Niet nodig".

### Files touched

`continent-app/src/planner/trip/ReadyToBook.jsx`, `TripSummary.jsx`, `TripSummary.css`, `trip/CostCard.jsx`, `trip/CostTiles.jsx`, `TripPlannerTab.jsx`, the six i18n files (tp.toBook, tp.next.*, tp.book, tp.arrNext, tp.fig.stay, tp.car.*, tp.tile.carAdvised).

### Commands run

eslint, `npm test`, design-lint.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Times a flight's price shows on the Overview | 3 (tile, route, Ready to book) | 2 (the route, and the cost card's Breakdown when opened) |
| Getting around while a car is advised | "Not needed" | "Hire car advised" |

### What broke and how it was fixed

The end check found the Boek link underlined; fixed in commit 7f09cc65c. In review, I gave the "To book" chip the neutral tone rather than best-value yellow, so yellow keeps its one meaning.

### What is still open

- T887-a: the sub-line of a `bookRows` flight (as Nog te boeken shows it) does not name an overnight arrival day the way the route does.
- T887-b: check on real data that "Huurauto toevoegen, +€…" matches the total after the tap.

### End check screens

The route with an overnight flight, a booked flight, a stay with an Airbnb link, a two-place trip with a train hop, the car advice, and Nog te boeken with everything booked.

### Rollback procedure

`git revert 7f09cc65c 7737bf279`.

---

## T888: Change your trip, one sheet for every input of the price

### What changed

**Where it opens:** `ChangeTripSheet` (new) opens from the dock on a phone, and from the side column and a "Wijzig je reis" pill in the top row from 1024 px.

**Dates opens inside the sheet:**
- the start days three either side of the trip's own, with the same nights (`shiftDays` in `trip/changeTrip.js`);
- each with what it does to the group's total (`quoteDelta`);
- the cheapest marked as best value;
- then the old total, the new one and the difference, before Apply.

Apply saves through `saveChip('dates')`, exactly as the dates chip does, so Undo takes it back. When a flight is booked, one line says new dates do not move that booking.

**The other rows** open their own editors: Wie, Vanuit, Vluchten (Change flight), Verblijf en Lifestyle, Plaatsen (the Reisplan tab) and Alle reisinstellingen.

**Je wijzigingen** holds Undo and Redo.

### Files touched

`continent-app/src/planner/trip/ChangeTripSheet.jsx` (new), `trip/changeTrip.js` (new), `TripSummary.jsx`, `TripSummary.css`, `TripPlannerTab.jsx` (quoteDelta, onDates, onFlights), the six i18n files (tp.cx.*), `continent-app/tests/changeTrip.test.mjs` (new).

### Commands run

eslint, `node --test tests/changeTrip.test.mjs`, `npm test`, design-lint.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Price of nearby start days before changing dates | none | 6 days, each with its difference |
| Old and new total shown before a date change applies | no | yes |

### What broke and how it was fixed

The end check found that the seventh start day wrapped to a second row on a phone. The strip is narrower now (fixed in 9278aa709). In review, the placeholder for an unknown price was a middot, which the copy rules ban; it is now empty.

### What is still open

Three parts of the approved design were not built because the plumbing does not exist yet:
- T888-a: "Opnieuw met je antwoorden", the plan flow again with the answers filled in and the current trip kept as a version. A guest has one device-trip slot, so starting over would overwrite the trip.
- T888-b: "Kopie als variant" needs a save-as.
- T888-c: a Versies list. The edit history keeps undo and redo only, not named steps with totals.

### End check screens

The sheet on a phone (a bottom sheet) and from 600 px (a dialog). Dates with a past day near today, a booked flight, and Undo after Apply.

### Rollback procedure

`git revert 9278aa709 d40e71ef9`.

---

## T889: a Notes tab

### What changed

The trip page has a fifth tab, Notities, holding the trip extras inline (TripItinerary section `extras`):
- the bookings, with Carta's booking reader (MagicImportZone, parse-booking) and its inbox;
- the notes;
- the packing list, with "Voeg de basics toe".

The tool sheets in Reisplan stay as they were.

### Files touched

`continent-app/src/planner/TripItinerary.jsx`, `TripSummary.jsx`, `TripSummary.css`, `TripPlannerTab.jsx`, the six i18n files (tp.tab.notes, tp.notes.lead).

### Commands run

eslint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

Nothing in the end check.

### What is still open

- T889-a: the extras keep their older styling, and a booking's estimate shows a tilde ("~€ 276,00"), which the price rule removed elsewhere. Restyle them to the trip page's look.
- T889-b: documents on the trip. The device-only file store (dayFileStore) belongs to the day planner; give the trip a documents section on the same store.
- T889-c: a personal address to forward booking emails to. It needs an inbound mail route; owner decision.

### End check screens

The Notes tab at 390 and 1440 px, the basics added, and a booking dropped on the reader.

### Rollback procedure

`git revert d35db2ca6`.

---

## T890: the Plan home's trip cards

### What changed

- **Names:** a trip named only after its country ("Italy" for a week in Rome) shows its places, on device trips and account trips alike.
- **Places, not stops:** "1 stop" reads "1 plek" (it read like a flight with a stop).
- **Countdown:** a planned trip with dates shows it ("Nog 218 dagen") where "Planned" stood.

### Files touched

`continent-app/src/planner/flow/PlanFlow.jsx`, `flow/PlanHome.jsx`.

### Commands run

eslint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Card title of a Rome trip saved as "Italy" | Italy | Rome |

### What broke and how it was fixed

Not in the end check (the Plan home needs the app's data); static checks only.

### What is still open

T890-a: the card carries no total and no booked count, because the device and account trip records do not hold them.

### End check screens

Plan home with a device trip and an account trip, one planned with dates and one still planning.

### Rollback procedure

`git revert ddfebcad6`.

---

## Rollback of the whole batch

Revert newest first:

`git revert 9278aa709 7f09cc65c 06e7acf0d ddfebcad6 d35db2ca6 d40e71ef9 7737bf279 797ca1b2c 40bf24eff`

No data, schema or saved-trip format changed. The trip page reads the same records.

## Notes on filling this template

- One report for the batch, a section per task with the template's headings.
- Not deployed: this environment has no Cloudflare credentials and no app data (T885-b in the register).
