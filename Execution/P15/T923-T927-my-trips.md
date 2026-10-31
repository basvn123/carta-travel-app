# T923 to T927: My trips, rebuilt as the next trip, Saved lists and Your Europe

## Task ID

T923 to T927, one batch (CLAUDE.md "Batches"), branch `p15-my-trips`.

## Date

2026-10-31

## Shared header

The owner asked for /impeccable deep research on what a My trips page should hold. They also asked:

- Make it unique and differentiated.
- Show how it could be clean, interactive and gamified.
- Show what users can edit, upload and share.
- Cover phone, iPad and desktop, aligned with the rest of the app.

They then allowed a full redesign. The artifact "My Trips, Rebuilt" (https://claude.ai/artifact/XHdCgVWUyjtsDMmLcjbcF4) showed two concepts: A, three redesigned tabs, and B, one timeline from Someday to Been with a map. The owner chose: "I want A".

The open questions took the artifact's defaults:

- Drafts are listed under "Being planned", with a link to Plan.
- The factual milestones stay.
- Price drops are shown on the page only.

One agent built T923 to T927 in sequence in a worktree. The coordinator merged the work and ran one end check, which led to one fix commit.

**How it was checked.**

- **Static checks:** eslint has 0 errors. `npm test` passes, 1,147 tests, including the new `tests/myTripsHub.test.mjs` and `tests/savedLists.test.mjs`. design-lint reports 168 violations, the same count as `main`.
- **End check:** the real app on the dev server, with the `?savedmock` seam (fixtures in dev only):
  - `?savedmock`: a trip happening today.
  - `?savedmock=next`: the next trip's focal card.

  Trips, Saved and Your Europe were looked at, at 390 and 1,440. The next trip was also looked at, at 820. There was no overflow and no page errors.

## T923: the shell and the Trips tab

### What changed

**The page shell.**

- The left rail on desktop and the three large tiles on a phone are gone.
- In their place: the title "My trips", with "Add a booking" and "New trip" from 700 px, and sticky underline tabs: Trips, Saved and Your Europe, with counts.

**The next trip is the focal card:**

- the photo, with a countdown pill ("21 days to Lisbon");
- the dates and nights, and the crew;
- "Ready for the trip", in four steps: dates, getting there booked, beds booked n of m, days planned n of m;
- the price a person a day and for the party;
- one price nudge, only when the beds for the trip's dates cost less than the first time My trips priced the trip in this browser, with that date named;
- buttons: Plan the days, the next missing step, Open trip;
- a menu: edit, plan days, share, and remove with undo.

**Below the card:** Coming up rows, Being planned rows (drafts, with "All in Plan"), the friends line, the moderation notice and the install hint.

### Files touched

`continent-app/src/auth/SavedTripsPanel.jsx`, `mytrips/MyTripsTabs.jsx`, `mytrips/TripCards.jsx`, `src/lib/myTrips.js` (readiness and money), `src/styles/70-mytrips.css`, `src/App.jsx` (`savedEur` recorded on save, `onPlanStops`), and `i18n/*.js` (115 `mt.*` keys in the batch).

### What broke and how it was fixed

The end check, `677f5ad629`:

1. On a phone the Saved list covers showed two and a half cards. They now show two whole cards, the owner's rule.
2. A phone had no way to "Add a booking" during a trip: the header buttons start at 700 px, and the readiness block is not shown in Today mode. An upload icon now sits beside the title below 700 px.

### What is still open

No trip stores its bed price at planning time. So the nudge compares against the first price My trips saw in this browser, not the plan (T923-a).

### Rollback procedure

`git revert 677f5ad629 219b9a0fe8`, together with the later tasks that build on the shell.

## T924: during a trip

### What changed

When a trip is happening today, Trips opens on Today:

- **The day:** day n of m and the place; the day's plan as a timeline (done, next, later), with booked tickets marked.
- **The money:** today's spend against the plan, with a category bar and "Add a spend".
- **Quick tiles:** bookings, tomorrow, photos (added to this day's memory) and who's going.

### Files touched

`mytrips/TodayCard.jsx` (new), `src/lib/myTrips.js`, and `PastTripForm.jsx` (it now exports `readPhoto`).

### What is still open

Nothing beyond T923.

### Rollback procedure

`git revert 913456c810 678c519332`.

## T925: Saved

### What changed

- **Lists:** "All saved" plus named lists. Each has a 2 x 2 photo cover; lists can be created, renamed, moved and deleted with undo, and an item can be in several lists. They are stored like favorites, on the device and in the account through `user_settings` (`useAccountSync`).
- **Each item shows:**
  - its kind and country;
  - today's price;
  - the change since saving, when `savedEur` was recorded at save time (saves made from now on);
  - the cheapest month, once the stay curve has loaded;
  - an editable note.
- **Filters and map:** kind filters and "Price fell". The map sits beside the list from 1,024 px, with a List or Map pill below that width.
- **Plan from saves:** tick boxes bring up a bar, "Plan a trip with these". It hands places to the planner with 2 nights each.

### Files touched

`mytrips/SavedTab.jsx` (new), `src/lib/savedLists.js` (new), and `src/hooks/useAccountSync.js`.

### What is still open

- Sharing a list for others to add and vote needs a server table. The existing `fav=` link would overwrite the recipient's shortlist, so sharing was not built (T925-a).
- Only places hand over to the planner; trails and the other kinds do not (T925-b).
- Price-drop alerts by email or push need consent and a sender (T925-c).

### Rollback procedure

`git revert 754e767051 57202c207e`. Saved lists left on devices are ignored by older code.

## T926: Your Europe and the year recap

### What changed

Your Europe replaces Visited:

- **The tile map:** one square per country, laid out geographically. Countries you have been to are filled, the next trip is outlined, and saved countries are dashed. "Mark a country" keeps the manual marks.
- **Figures:** countries of the 43 in the catalogue, nights away, a day a person from logged spend, and the cheapest great day.
- **Milestones:** only those the data backs (in the fixtures: All of Benelux, next trip completes Iberia, the longest trip).
- **The journal:** past trips by year, each with its photo count, its cost a day and its rating. Trips still missing them show "Add photos" and "How was it?". "Add a past trip" is at the end.

"Your 2026 in Europe" opens a recap with a switch for each figure. "Share as an image" draws a PNG on a canvas.

### Files touched

`mytrips/YourEurope.jsx`, `mytrips/YearRecap.jsx` (new), and `src/lib/myTrips.js` (milestones, spend).

### What is still open

- **Highest point:** never shows, because trips carry no elevation (T926-a).
- **Night train:** only shows if a logged leg is marked `night`, and the past-trip form has no such option (T926-a).
- **"Against Carta's estimate":** rare, because hand-logged trips have no stops (T926-a).
- **Possibly unused code:** the old record-map CSS (`.mt-band`, `savedmap`) and `RecordMapDialog` (T926-b).

### Rollback procedure

`git revert f83997b6b9 6e4760ac9b`.

## T927: Add a booking

### What changed

A sheet, reached from the header, the phone icon and the readiness block:

1. Choose or drop a PDF or image, or take a photo.
2. It is read by the existing Gemini `parse-booking` route.
3. The fields come back editable, with uncertain ones flagged, and the stay price is set against Carta's estimate.
4. The trip whose dates match is picked; another can be chosen.
5. Once attached, the readiness steps update.

Email forwarding is not built.

### Files touched

`mytrips/AddBookingSheet.jsx` (new).

### What is still open

Nothing beyond the deploy.

### Rollback procedure

`git revert 3e72bbcb57`.

## Batch

**Config and secrets set:** none.

**Design departures for the owner to review** (carta-design design freedom):

- visited countries filled in deep brown on the tile map;
- words on a photo under one tint on the recap card;
- a solid countdown pill on the focal photo.

**Deploy:** not possible from this session. The register row for it is T918-c.
