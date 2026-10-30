# T901 to T904: the Plan home and Carta's own trips

## Task ID

T901 to T904, one batch (CLAUDE.md "Batches"), branch `p15-plan-home`.

## Date

2026-10-30

## Shared header

The owner sent two screenshots:

- the Plan tab's first page: the slogan, a photo fan, and four grey "Your trip" cards;
- Carta's own trips.

They asked for research, then an artifact, for two things: a clean and engaging first page that gives an overview and serves navigation, and Carta's own trips in the style of the other tabs. They judged "Plan Home and Carta Trips" (https://claude.ai/artifact/SFoWerFjzpXifFdsdxhM9E): "I really like it", with "then you have my go" on three changes:

- the line "1 upcoming, 6 being planned" goes;
- the line "258 trips, each planned day by day with its beds and costs" goes;
- on a phone, a row shows two whole photos, as on Trips for you, with clean space at the screen's edge.

All three are built.

**Research behind the design, in the artifact:**

- **What opens first:** Expedia opens trips on Upcoming, TripIt lists past trips under the upcoming ones, and Airbnb's 2025 Trips tab shows the itinerary.
- **Dashboard rules:** status comes before promotion, and a marketing block shows only when there is no data.
- **Drafts:** Wix and Cloudscape use lists for sets people manage.
- **Phone rows:** carousel attention decays along the row (2026 eye-tracking).
- **Collection pages:** Intrepid's count and filters, Baymard's filter row, Airbnb's category icons.
- **Even cards:** titles clamped to two lines so prices line up.

**The owner's open decisions, defaulted as the artifact proposed:**

- With no dated trip, Up next shows the last edited draft (as "Continue planning").
- Past stays a tab.
- Card titles keep the written title, clamped to two lines.

**How it was checked.** Each task ran static checks: eslint on the touched files, `npm test` and design-lint. The end check was one throwaway harness (`continent-app/__t905/`, deleted, never committed). It rendered:

- the real `PlanHome` with six example trips, covering upcoming, planning, empty drafts and past;
- the real `CartaTrips` on the app's own `public/journeys` library, all 258 trips.

Playwright drove it at 390x900 and 1440x900. There was no horizontal overflow and no page errors. The journey photographs come from Commons, which this session cannot reach, so the cards showed their grey ground; the only console errors were those blocked image loads.

**What it showed:**

- **Plan home, desktop:** Up next (photo, "In 218 days", the name, dates, nights, places, Open trip), then the tabs with their counts, then Carta's trips in season beside them.
- **Plan home, phone:** the same, stacked.
- **Carta's own trips, phone:** two whole cards a row inside the gutter in both rows (In season now, The cheapest weeks). The style row showed every style with its icon, the 258-trip count sat right of In season and Filters, and the desktop In season row had four cards.

## T901: Carta's trips in the card of Trips for you

### What changed

`TripPlaceCard` is used by Carta's own trips and now by the Plan home. Its new layout:

- **On the photo:** at 4:5, one badge (In season, else the length), the bookmark, and on an ink fade the countries and the name, two lines at most.
- **Under the photo:** the flag with places and nights, then one price line, "From €35 a person a day", with the flight chip beside it.
- **Gone:** the style and months line.

The classes moved from `tpc` (shared with the trip page's cost card) to `ctc`.

### Files touched

- **Modified:** `continent-app/src/browse/TripPlaceCard.jsx`, `styles/planners.css`
- **Created:** `styles/planners/90-plan-home.css`

### Commands run

eslint, design-lint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

Nothing.

### What is still open

- The old `.tpc-*` card rules in `styles/86-plan-flow.css` are now unused by this card (T901-a).

### End check screens

Carta's own trips and the Plan home's Carta row at 390 and 1440.

### Rollback procedure

`git revert` the T901 commit.

## T902: Carta's own trips in the style of the other tabs

### What changed

- **Top:**
  - Plan / Carta's own trips as a breadcrumb, in place of Back;
  - the title alone, without its lede line (the owner's change);
  - the styles as Explore's category row, All first, each with an icon;
  - In season and Saved as quick filters beside Filters, with the count.
- **Unfiltered:** two rows, In season now and the new The cheapest weeks (the lowest a person a day), then every trip.
- **Layout:**
  - **Rows:** two whole cards on a phone inside the gutter, the next pair a swipe away (the owner's change); four from 769 px.
  - **Grid:** two, then three, then four across.

### Files touched

- **Modified:** `planner/flow/CartaTrips.jsx`, `styles/planners/90-plan-home.css`, i18n (1 key)

### Commands run

eslint, design-lint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Whole cards in a phone row (390 px) | 1 and a part (72% wide, running to the screen edge) | 2 inside the gutter | as asked |

### What broke and how it was fixed

- **Fade on the style row:** design-lint flagged the gradient mask that faded the row's end. It was dropped, and the row simply scrolls.

### What is still open

- **Missing quick filters:** "Under €50 a day" and "7 nights" from the artifact were not built as quick chips. The budget band and the month stay in the Filters sheet, whose bands are relative cost thirds, not a fixed €50 (T902-a).

### End check screens

Carta's own trips at 390 and 1440.

### Rollback procedure

`git revert` the T902 commit.

## T903: the Plan home opens on your trips

### What changed

With at least one trip, `PlanHome` shows:

- **Header:** Your trips (no count line, the owner's change), with New trip and Carta's own trips.
- **The kept-trip price drop line**, when there is one.
- **Up next:** the nearest dated trip, else the newest draft, as one wide card. It has the photo, the countdown, the name, dates, nights and places, and Open trip.
- **Tabs:** Upcoming, Planning and Past, each with a count; the first tab with trips opens.
  - Dated trips appear as photo cards: two to a row on a phone, three from 769 px. Each card has a countdown pill and a More menu.
  - Drafts appear as rows, newest first: a cover, the name, the dates or months and nights, the state, and the More menu.
- **Carta's trips in season:** the cheapest two this month, with See all N. They sit beside the tabs from 1100 px and under them before.

With no trips, the slogan, the actions and the fan stay as they were. The old trip grid and its `TripCard` are removed.

### Files touched

- **Modified:** `planner/flow/PlanHome.jsx`, `planner/flow/PlanFlow.jsx` (`onOpenJourney`), `styles/planners/90-plan-home.css`, i18n (14 keys)

### Commands run

eslint, design-lint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| What the first screen of Plan shows to someone with trips | the slogan and the photo fan | Up next with its countdown and the trips by state | the page leads with the traveller's own trips |

### What broke and how it was fixed

Nothing found.

### What is still open

- **Up next has fewer facts than the artifact:** no days-planned bar and no next steps (book flights, plan empty days). The home's trip records do not carry booking state or planned days (T903-a).
- **Plan your days:** the button was not built on Up next. The home has no door into the days of a trip that is not open (T903-b).
- **Deploy:** the batch is merged, not deployed (T903-c).

### End check screens

The Plan home at 390 and 1440.

### Rollback procedure

`git revert` the T903 commit; the old grid comes back.

## T904: names, edit times and Delete empty drafts

### What changed

- **Names:** a trip with no places reads "New trip, 7 nights", never "Your trip".
- **Edit times:** every trip carries when it was last edited. Device trips use `updatedAt`; account trips use `updated_at` or `created_at`. A draft row says "Edited 2 days ago", using `Intl.RelativeTimeFormat` in the reader's language.
- **Covers:** a trip with no photo shows its first letter on one of four Carta colours.
- **Delete empty drafts:** under the drafts, the ones on this device with no places and no dates can be deleted in one step, asked once in place.

### Files touched

- **Modified:** `planner/flow/PlanFlow.jsx`, `planner/flow/PlanHome.jsx`, `styles/planners/90-plan-home.css`, i18n (6 keys)

### Commands run

eslint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Drafts on the owner's screenshot called "Your trip" | 3 of 4 | 0 | each named |

### What broke and how it was fixed

Nothing.

### What is still open

Nothing new.

### End check screens

The Planning tab at 390 and 1440.

### Rollback procedure

`git revert` the T904 commit.
