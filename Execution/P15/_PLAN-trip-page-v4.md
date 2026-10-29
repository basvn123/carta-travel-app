# Trip page v4: one page you change in place

Plan, 2026-10-29. Not started; nothing here is committed. Inputs:
- the owner's two screenshots of the live trip page (Costs inside Edit, and Editing your trip);
- `Downloads/plan carta.md`, the owner's audit;
- `Downloads/plan carta.pdf`, the reference board (Mindtrip, Booking, Airbnb, Wanderlog, and Carta today);
- the code as deployed by T833 (`TripSummary.jsx`, `TripPlannerTab.jsx`, `useTripPlanner.js`, `TripItinerary.jsx`, `PlanTotal.jsx`, `flow/TripSettingsSheet.jsx`).

Every task below is held to the same bar on a phone (360 and 390 px) and on a desktop (1024 and 1440 px). Each task names what it does on both.

## 1. What is wrong today

1. **Editing is a different page.** Edit trip swaps the tabs for a long form ("When are you travelling?", "Where are you travelling from?", the stops, then "Your trip costs"). It repeats what the chips already show. The fields look unstyled: underlined dates and a tiny origin pill. Beside it, a large map stands with nothing to do.
2. **The cost block in Edit breaks the rules and the layout.**
   - "€2,107.16 in total" is underlined, so it reads as a link.
   - The People and Lifestyle box has a hairline that stops at half width.
   - "0 of 3 prices are your own" is a method line, which carta-design bans.
   - The total also appears in the rail, so it shows twice.
   - In Costs, the headings run into their figures ("Flights€494.00").
3. **Before you go is a pager of sentences.** Each card is headed "2 of 8" and a full regulation sentence ("Vignette required on motorways: EUR 12.80/10 days ..."). The grammar is at most four short icon rows plus Show all.
4. **The chips only half work.** Dates, People and From all open the same Trip settings sheet. Places jumps to a tab. None edits in place.
5. **Trip settings mixes two jobs.** It holds the trip's inputs (When, From, Who, Sleep and spend, What matters most) and also sharing (Who can see it?). It is a list of chevron rows.
6. **The route cannot be shaped where it is shown.** The model already supports a lot:
   - `reorderStop`, `moveStop`, `setStopNights`, `removeStop` and `addStop`;
   - `setLegMode` per hop, `setOwnLeg` and `setOwnStay`;
   - `setTransferMode`, `setFlightHours`, and `returnAnchorId` in the price engine.

   Most of it is only reachable from the Edit form, or not reachable at all.
7. **Days is a bare list** ("Day 1, Hallstatt, Plan"). It has no content, no pace, no ideas and no way to protect a day you like.

## 2. The idea in one line

There is no edit mode. Every fact is changed where it is shown: the chips in the head, the stops and hops in Itinerary, the lines in Costs and the days in Days. The price settles in place, and every change can be undone.

## 3. What we take from the references, and what carta-design changes

| From | We take | Carta's form (carta-design wins) |
|---|---|---|
| Mindtrip | The chip strip under the title, where each chip edits its own fact | Desktop: a popover anchored to the chip (`--elev-2`, `--radius-control`). Phone: a sheet with one primary. Lifestyle opens the one Lifestyle panel, never a second control |
| Mindtrip | Undo / Redo beside the tabs | Carta's rule is "runs at once, Undo for 6 s". A lasting Undo / Redo pair is new and needs owner decision **D1** |
| Mindtrip | An Ideas tray | Days tab: places kept for the trip that are not on a day yet, each with "Add to Day N". Drag is a shortcut, never the only way |
| Mindtrip | Chats in the trip | **Not taken.** Ask Carta has one door (Explore) |
| Airbnb | Arrival and departure cards per stay | Each stop in Itinerary shows check-in and check-out days and nights, as label-over-value rows |
| Booking | Expandable cost groups with badges | Costs becomes the receipt in four groups, each line editable in place. No "free cancellation" style claims, since Carta takes no booking |
| Wanderlog | A budget card with a bar | Rail card: total against budget, an 8 px ink thin bar (no brown, no legend), "€234 under your budget", Edit budget |
| Audit | Share and Invite apart from settings | A Share sheet: who can see it (kit Segmented), Copy link, PDF, calendar, Google Maps. Trip settings keeps the trip's inputs only |
| Audit | Hex colours, terracotta, "Dribbble 4k" prompts | **Not taken.** Tokens only (`--action` brown, `--surface`, `--border`). /impeccable is used as a process, not as those prompts |
| Audit | A currency toggle on the page | **Not taken.** Currency lives in Account |
| Audit | Invite tripmates to edit together | **Later.** Needs the social layer and sync (open row T831-a first) |

## 4. Batches

Task numbers are indicative. Each batch takes its numbers at the start (the highest in `git log --all` and `Execution/` is T833 today), runs on one batch branch, ends with one report, and does one browser round at 360, 390, 768, 1024 and 1440 px.

### Batch 0: the design board (1 task, before any code)

**T834: trip page v4 board.** An /impeccable board published as an artifact, built in Carta tokens. It shows every screen at 390 and 1440 px:
- the head with chip popovers (Dates, People, From, Lifestyle, Places) and their phone sheets;
- the inline name edit;
- Itinerary as the route editor (flight, stop cards, hops, Add stop, Swap city, Change flight sheet, Stay per stop);
- Costs as the four-group receipt;
- Days with pace, lock and the Ideas tray;
- the rail (map, budget card, Plan your days, Share) and the phone dock.

The owner marks it up the way the T819 board was marked. Nothing is built before that. Done means a board approved, with each panel marked keep, change or drop.

### Batch A: edit in place, no edit mode (4 tasks)

- **Chip editors.**
  - Dates: a range calendar with the nights note. When the window and the planned nights disagree, one line offers "Move the end to 11 Jul" or "Take a night from Salzburg".
  - People: Adults, Children and Babies steppers (the `PartyEditor` rows).
  - From: `OriginPicker`.
  - Lifestyle: the existing sheet.
  - Places: opens Itinerary at the route.
  - Desktop shows popovers under the chip; the phone shows sheets. The chip row scrolls sideways on a phone and wraps on a desktop. Prices settle through `settleFigure()`.
- **Name in place.** Click the name and it becomes a field: Enter saves, Escape restores. On a phone it is the same field at 16 px.
- **Remove edit mode.**
  - Delete `mode='edit'`, the Editing bar, "Done, back to the trip" and the Edit trip tool.
  - Keep the stepwise form only for a trip with no stops or no dates. That is where `listBody` still has a job; walk it, and check T832-a's country-page entry.
  - Fix or drop the half-width hairline, the underlined total and the method line on the way.
- **Undo.** Every change to a stop, a hop, a price or a date goes into a history in `useTripPlanner` (snapshots of the draft). A toast "Removed Salzburg. Undo" holds for 6 s.
  - If **D1** is yes: Undo and Redo IconButtons in the tab row on desktop, and in the More menu on a phone.
  - This also settles T809-a (delete asks for a confirm while the rule wants Undo).

### Batch B: the route editor, Itinerary tab (5 tasks)

- **Stop cards.**
  - Each card shows the photo, name, and check-in and check-out days (Airbnb's two rows), plus a nights stepper (`setStopNights`).
  - Changing nights offers the same move-end-or-take-a-night choice as Dates. The cap waits on T812-b (21 against 60).
  - Order changes with Move up and Move down buttons (`moveStop`); a drag handle (`reorderStop`) is a pointer shortcut on desktop. Keyboard: the buttons.
  - Remove gives an Undo. "Add a stop here" sits between cards.
  - On a phone the cards are full width and the actions sit in one row under the name.
- **Swap city.** A sheet with five nearby places from the catalogue, ranked like Explore (Score, day price, distance). Each shows what the trip total becomes. Picking one keeps the dates and nights. It uses `removeStop` and `addStop` at the same index, so it is one Undo step.
- **Hops between stops.**
  - One line per hop gives the mode, time and price; Change opens a sheet with the ways that exist for that hop (train, bus, car, ferry) and their times and prices (`setLegMode`), plus "I've paid for this" (`setOwnLeg`).
  - The mode switch has five options against the Segmented kit's four-option rule. That is design call T812-a; if Segmented is refused, the choice becomes a list of rows.
- **Change flight.** A sheet with what the swept data really has:
  - the cheapest on your dates;
  - the best times (`setFlightHours` bands);
  - other airports near the first and last stop (`anchorId`);
  - a different airport home (`returnAnchorId`, open-jaw);
  - a day earlier or later.

  Each option shows the airline mark, times, "Google Flights, checked {date}", and what it changes in the total ("+€45"). Add your fare stays. Nothing in this sheet invents a fare: an option the sweep does not hold is not shown.
- **Stay per stop.**
  - "I already have a place" (`setOwnStay`: zero, or what was paid).
  - Links to Booking, Airbnb and Google Hotels with the stop's dates and guests filled in, plus "prices may have changed".
  - A stay type per stop (an entire place here, a B&B there) changes the price engine (`lib/price/stay.js` reads a per-stop tier, falling back to the trip's Lifestyle). That is owner decision **D2**, and it carries tests that the four tiles still add up to `grandTotal` to the cent.

### Batch C: Costs and the rail (3 tasks)

- **Costs as the receipt.**
  - Four groups: Flights, Getting around, Stay, Food and drink. Each is a fold with its lines in cents, the figure right-aligned and the heading spaced from its sum.
  - Each line has its edit in place: a flight opens Change flight, a hop opens Change, a stay opens Stay, and food opens Lifestyle.
  - Group / Per person stays. The thin bar above the lines follows the cost bar rule.
  - A tile on Overview opens its group.
- **Budget.**
  - The trip budget (`draft.guide.budget`, `budgetCheck`) can be set and edited from the rail card and from Costs.
  - After any change that crosses it, a toast says "€120 over your budget".
  - Desktop: the rail card under the map. Phone: the dock reads the total, and a tap opens Costs with the budget line first.
- **Rail and Share.**
  - The desktop sticky rail holds the map, the budget card, Plan your days (the one primary) and Share.
  - Share sheet: who can see it (from `VisibilityChoice`), Copy link ("Link copied"), PDF, calendar (`dayPlanIcs`) and Google Maps (`dayPlanKml`).
  - Trip settings loses visibility and keeps the trip's inputs, restyled as label-over-value rows.
  - The top row is All trips, then Save, Share and Settings.

### Batch D: Days (4 tasks)

- **Day cards.**
  - Each day shows the date, the base, the first three planned items, and the day's cost a person.
  - It carries a pace Segmented (Relaxed, Balanced, Packed). Pace is one trip-wide value today, so per-day pace is a model change.
  - Plan this day, and Lock: a locked day is untouched by Plan the rest.
  - Phone: one card per row. Desktop: two across, beside the rail.
- **Ideas tray.** Places kept for this trip but not on a day yet: the shortlist for the stops' towns plus `useStopIdeas`. Each has "Add to Day N"; drag is a desktop shortcut. Phone: a section above the days. Desktop: the top of the tab, as a row.
- **Free day and best route.** "Add a free day" between days, which moves the end date with the nights choice. Best route reorders a day by distance and asks first, as the day rules already say.
- **Plan the rest with locks.** The Gemini `plan-day` route skips locked days and items. No Claude API. T823-a (a real signed-in walk of the live function) is the owner's step and stays with them.

### Batch E: end check and deploy (1 task)

- The full walk at 360, 390, 768, 1024 and 1440 px: every chip, sheet, popover, Undo, and each tab on a Carta trip, a finder trip and a hand-built one.
- `npm test`, the verify scripts, design-lint and token-contrast.
- One screenshot per screen and width.
- Then merge, the push, and the deploy after the owner says so.

## 5. Phone and desktop, the shared rules

- **Phone (below 769 px).**
  - Chips scroll sideways; every editor is a sheet with a handle, a 44 px close and one primary under the last field.
  - The dock (total and Plan your days) sits above the bottom nav and reads `env(safe-area-inset-bottom)`; it hides while a sheet's field has focus.
  - Tabs stick under the head.
  - Nothing relies on drag or hover. 360 px has no horizontal scroll, and every control is 44 px.
- **Tablet (769 to 1023 px).** It works as the phone does, with wider cards and the map in Overview. Popovers become sheets.
- **Desktop (1024 px and up).**
  - Content is capped at 1180 px, with a two-column body: tabs on the left and the sticky rail on the right.
  - Editors are popovers anchored to what opened them; Escape closes them and returns focus.
  - Drag, hover and keyboard shortcuts are additions; the buttons stay.
  - No large empty map beside a form: the map follows the tab, highlighting the stop or day in focus.

## 6. Decisions for the owner

- **D1.** Undo / Redo buttons that always show (Mindtrip), or only the 6 s Undo toast (Carta's rule today)?
- **D2.** Allow a different stay type per stop? This changes the price engine.
- **D3.** Per-day pace (a model change), or keep one pace for the trip?
- **D4.** Should "Add a day trip from a base" (Salzburg to Berchtesgaden and back) join Batch B, or wait for its own batch?
- **D5.** Board first (Batch 0), or straight into Batch A?

The open register rows this plan would close or depends on: T809-a, T812-a, T812-b, T818-a (repricing on a swap), T823-a and T832-a.
