# T809 to T815: the Plan flow after Help me choose, made clean (batch Plan flow v2)

## Shared header

**Date.** 2026-10-29.

**Ask.** The owner, in chat on 2026-10-29, with /impeccable: optimise the whole Plan flow after Help me choose so it is clean, simple, modern and professional on phone and desktop. They asked for:
- icons where words are used today;
- detail behind buttons;
- photos everywhere;
- the Plan home always first, with several trips;
- a clickable trip card that opens a preview of the whole trip before planning;
- a redone Getting there, Review and post-planning overview;
- a check of the calendar flow.

**Owner calls** (asked with the question tool before building):
- **Trip preview:** one preview with tabs (Overview, Cost) replaces the price sheet.
- **Where trips live:** trips are kept on the device for everyone, and account trips appear in the same list.
- **After Finish:** land on a summary card first (See trip details, Plan your days), with no modal.

**Task numbers.** T809 to T815. `git log --all` stopped at T808 and every worktree's `Execution/` folder agreed. The next free number is T816.

**Audit before building.** `wt/t809-audit.mjs` walked the live flow (the TF4 build) at 390 and 1440 px. Shots are in `wt/t809-audit/`. It found:
- The trip card photo rendered as a 2 px strip, which is why the owner saw no image.
- The Plan tab skipped the home whenever a trip existed, and the app held one trip only.
- The card stacked ten blocks of text and only the price opened anything.
- The two filter rows were unlabelled and wrapped unevenly.
- The receipt's cost bar carried no meaning.
- The wizard showed a double progress (bar and stepper), and Getting there opened on an address search and six airport chips.
- Finish dropped a "Plan your days?" modal onto a dense page.

**Branches and worktrees.**
- **Batch branch:** `p15-plan-flow-v2` in root worktree `Portfolio/wt/pf2-batch`. It is sparse (continent-app without public, Execution, supabase/functions). `continent-app/public` and `node_modules` there are junctions to the main checkout.
- **Task branches, run in parallel by four agents** (each in `wt/pf2-<name>`, merged with `--no-ff`):
  - `p15-pf2-home` (T809)
  - `p15-pf2-finder` (T810, T811)
  - `p15-pf2-wizard` (T812, T813)
  - `p15-pf2-trip` (T814, T815)
- **Shared agent brief:** `wt/pf2-brief/SHARED.md`.

**Commits.**
| Commit | Task |
|---|---|
| `85de94860` | T809 |
| `fbb0fb53a` | T810 and T811 (one commit: same card, stylesheet and language files; split, the first would not build) |
| `d54bee78c` | T812 and T813 (one commit: the old Review imported a component T812 removes) |
| `01cbb55d4` | T815 |
| `ab907b657` | T814 (imports T815's `lib/tripDates.js`, so revert both together) |
| `f0f3ef176` | T815, the finder's month order (found by T815, fixed on the batch branch) |
| `b87a0b347` | T812 end check fix |
| `475d240b0` | T814 end check fix |

The merge commits are `1734fa05b`, `bf1308648`, the finder merge and `2689f12bb`.

**Checks on the merged batch.**
- **`npm test`:** 980 of 980 pass (959 before; 21 new across tripsStore, finderCard, wizardFlightChoices, tripDates and recommendTrips). The T792-b pair passes here.
- **ESLint:** every touched file and all six language files have 0 errors. The 4 warnings were there before.
- **design-lint:** 33 violations, the same 33 as `main` today (a line-by-line diff is empty), none in this batch's files.
- **impeccable detect:** `[]` on each agent's files.

**Fast build and measure.**
- **Build:** NOPUBLIC `wt/vite.pf2-batch.mjs` into `wt/dist-pf2-after`.
- **Measure:** `wt/t806-measure.mjs`.
- **Before:** the TF4 tip `wt/dist-pf2-base`.

| Measure | Before | After | Delta |
|---|---|---|---|
| Assets | 132 | 132 | 0 |
| Modulepreloads | 37 | 37 | 0 |
| First-paint JS bytes | 1,361,956 | 1,369,991 | +8,035 |
| Plan tab first-load JS bytes | 2,884,162 | 2,902,967 | +18,805 |
| Bytes only the finder reaches | 73,140 | 85,359 | +12,219 |
| `npm test` tests / pass | 959 / 959 | 980 / 980 | +21 |

- **First paint:** App now imports tripsStore and keptStore (keptStore was a Plan chunk of its own).
- **Plan tab:** TripSummary, tripDates, the wizard's new CSS and Review, and the English strings.
- **Finder:** TripPreview.

**End check.**
- **Walk:** `wt/pf2-end-walk.mjs`, one walk on the merged build (served by `wt/t809-serve.mjs` on 5820, with the T795 flight fixtures), at 390 and 1440 px. Plan home, Help me choose, Trips for you, the preview and its Cost tab, Plan this trip, Getting there (pick another flight), Review, Finish, the summary, See trip details and back, All trips, opening the trip again, Plan from Explore.
- **First round:** 24 of 30. Two defects, both fixed on the batch branch (see T812 and T814, "What broke"); the other four fails were the walk's own selector.
- **Second round:** 30 of 30, no page or console errors.
- **Evidence:** shots in `wt/pf2-end-shots/`, results in `wt/pf2-end-walk.json`.

**Not merged, not mirrored, not deployed.** The batch waits for the owner to look at it (row T815-h).

---

## T809: Plan home always first, with all your trips

### What changed
- **Plan always opens the Plan home.** Pressing Plan from another place opens `planstart`; inside Plan it keeps the view on screen. Deep links are unchanged.
- **New device trips store (`src/planner/tripsStore.js`).**
  - Record `carta.trips.v1`: `{ v, activeId, trips }`.
  - A trip is a snapshot of the five keys that make the trip in progress: `carta.plannerDraft.v1`, `carta.tripDraft.v1`, and the draft's day plan, prefs and extras. Each entry carries a summary (name, cover, dates or months, nights, stops, status, planId, deviceKey).
  - Operations: list, open, start new, delete, openOrStart.
  - Migration: a device's single existing trip becomes the first entry.
  - `onTripSwitch` lets `plannerStore` reload. `TripPlannerTab` and `DayPlannerTab` take `key={activeTripId}` so they remount on a switch.
- **PlanHome: "Your trips".**
  - Each trip is a card with its photo (or the first stop's, or a route-icon placeholder), name, dates, nights and stops with icons, a Planning or Planned pill, and the whole card as one link.
  - A More menu offers Delete with a confirm.
  - Account trips are listed too (cloud icon), with no duplicates of device trips.
  - Layout: rows on a phone; a 3 to 4 column grid under the opening from 1024 px.
- **Start planning always starts a new trip.** The previous one stays in the list.
- **My trips "Open" and Kept trips "Plan this trip"** go through the list. They no longer overwrite or drop the open trip (closes T806-b).
- **New prop** `onPlanHome` on TripPlannerTab, used by T814's "All trips".

### Files touched
- `src/App.jsx`
- `src/planner/flow/PlanFlow.jsx`
- `src/planner/flow/PlanHome.jsx`
- `src/planner/tripsStore.js` (new)
- `src/planner/plannerStore.js` (reload)
- `src/styles/86-plan-flow.css`
- `src/i18n/*.js` (13 `pf.home.*` keys)
- `tests/tripsStore.test.mjs` (new, 9 tests)

### What broke and how it was fixed
The finder agent ran this agent's i18n script by mistake (same scratchpad filename), duplicating the 13 keys. One copy was removed in each language before the commit.

### What is still open
- The delete confirm follows the brief, but carta-design wants an immediate delete with a 6 s Undo (owner).
- An account trip opened while signed out opens empty (`loadRestorableDraft` drops a draft with a planId).
- `deviceTripStore` (Save trip without an account) is still one trip; with many trips the pass rule needs confirming (owner).
- The account trips are fetched on every Plan home visit; cache them.
- `carta.dayOpen.v1` is not part of a trip's snapshot.

### Rollback procedure
`git revert -m 1 1734fa05b` on the batch branch, then `git revert 475d240b0` (it uses the blank-name rule this task's list reads).
- **Data:** the `carta.trips.v1` key stays harmless on devices. The open trip's own keys are untouched by a revert.

## T810: Trips for you

### What changed
- **The photo bug.** HeroImage's 3:2 size attributes had no CSS height. It is now an aspect-ratio box with cover images.
- **Photos per card.** A trip with several places shows two photos. A place with no photo falls back to the best photo from the same country.
- **The card, led by the photo.**
  - On the photo: the match pill and the Keep heart.
  - Under it: the name, one icon line (flag and country, nights, bases), "€969 a person" with "all in" or "without the flight", and an under/over budget badge.
  - Three icon figures: plane, bed, fork (food plus getting around).
  - The top reason and the catch.
  - Compare and Skip, quiet, in the foot.
- **Removed from the card:** the cost bar, the inclusion chips, the budget ruler, the group total and the extra reasons.
- **The whole card opens the preview.** The heart, Compare and Skip do not. The name is the card's one accessible button, and focus returns to it on close.
- **Toolbar.**
  - The answers sit in one line ("+N more") with Edit answers, which lists each answer to reopen.
  - Three labelled single-choice levers (Flight, Food, Bases) sit on one row from 769 px; a phone gets one Adjust button that opens a sheet.
  - The trip count sits under the title.
- **Width.** The stage widens to 1200 px for this screen. The grid is 1, 2 or 3 columns.

### Files touched
- `src/planner/finder/TripCard.jsx` (rewritten)
- `src/planner/finder/TripsForYou.jsx`
- `src/planner/finder/finderText.js`
- `src/planner/finder/finderHooks.js`
- `src/styles/87-trip-finder.css`
- `src/i18n/*.js`
- `tests/finderCard.test.mjs`

### What broke and how it was fixed
After the first screenshot round:
- The answer line listed every answer; it now stops at "+N more".
- "All in" was capitalised mid-line.
- The desktop Food chips stretched to the height of the stay column.

### What is still open
- The match pill on the photo uses the Explore v6 Score-pill exception to "no text on a photograph" (owner to confirm).
- The fork figure is food plus getting around, but the icon reads as food only.
- The like icons are a new mapping: hiking is BootIcon, nightlife MusicIcon, wellness LotusIcon (owner to look).

### Rollback procedure
`git revert -m 1` of the finder merge commit. This reverts T811 too; they are one commit.

## T811: Trip preview

### What changed
- **New `TripPreview.jsx`** replaces `TripReceipt.jsx` (deleted), along with `TripBar`, `WhyMatch`, `barSegments`, `inclusions` and `budgetLine` and their tests.
- **Gallery.** Up to 12 photos: each place plus its best sights from the per-place POI files the app already loads. Swipe on a phone, arrows on desktop.
- **Header.** Name, flag and country, dates, nights, bases, match.
- **Overview tab.**
  - The route, with a photo and nights per place.
  - Why it fits: an icon and a bar per like, the reasons and the catch.
  - Things to see and do (NotYet where a place has none).
  - Day highs and crowds for the month.
- **Cost tab.**
  - Food and Stay chips that reprice this trip only, through the line picker's swap.
  - Icon rows (plane, bed, fork, bus, ticket), each with a Why-this-price disclosure. A row with options opens the line picker inside the preview.
  - The group total.
  - No cost bar.
- **Pinned foot.** The total a person and for the group, the price change after a swap, the heart, and Plan this trip.
- **Layout.** Desktop: a centred dialog up to 1040 px wide and 90 % high. Phone: a sheet at 58 % that goes full height by the handle, More or scrolling.
- **Accessibility.** Focus trap; Escape closes a picker first; Overview and Cost are a tablist.

### Files touched
- `src/planner/finder/TripPreview.jsx` (new)
- `src/planner/finder/FindingTrips.jsx`
- `src/planner/finder/TripReceipt.jsx` (deleted)
- `src/planner/finder/LinePicker.jsx` and `TripCompare.jsx` (comments; Compare's open now opens the preview)
- `src/styles/87-trip-finder.css`
- `src/i18n/*.js`

### What broke and how it was fixed
design-lint caught:
- the legacy `--ink` in the backdrop, now `--text`;
- a euro sign in a code comment.

### What is still open
- With the Cost tab open, the group total shows twice (under the rows and in the foot); one could go (owner).
- The preview's Food and Stay chips change one trip, while the toolbar's Food lever re-ranks the list. The two are separate on purpose (owner to confirm).
- Photo captions name the place, not the photographer: the catalogue's credit field holds a page title.
- `tf.rc.close`, `tf.rc.whyPrice` and `tf.rc.whyMatch` are unused in all six languages; remove them.

### Rollback procedure
Same as T810 (one commit).

## T812: Wizard chrome and Getting there

### What changed
- **Chrome: one head row.** Back, the step's name, and one stepper.
  - **Desktop:** the steps are inline, the current one in brown tint, done steps clickable. There is no progress bar.
  - **Phone:** "3 of 4" over the name opens a step list, so Where and Stay can be reopened (closes T801-d). One thin line is the only progress.
- **The "Planning around" chips** are gone in the flow.
- **Bottom bar.** Start over as a quiet link, the running total (a tap opens the receipt) with trip size under it, and Next. The map column no longer repeats the total.
- **Getting there.**
  - The origin collapses to "From Brussels (BRU)" with Change.
  - The dates are one line with a calendar icon and ‹ ›. Moving the trip already worked; the walk confirmed it moves both legs and the flight lookups.
  - One card per leg, each with a five-icon mode switch.
  - A flown leg offers up to three of the day's flights: the trip's own first, then the cheapest and the quickest. A pick reprices through the planner's own price function.
  - "I'll book my own" opens the fare field.
  - Ticket links sit behind "Find tickets".
  - A calm no-fare state replaces the orphan "There" label.
- **Date audit item.** The end date handed to the planner follows the stops' nights (each at least 1).

### Files touched
- `src/planner/wizard/WizardChrome.jsx`
- `src/planner/wizard/WizardAside.jsx`
- `src/planner/wizard/OriginCard.jsx`
- `src/planner/wizard/StepGettingThere.jsx`
- `src/planner/wizard/flightChoices.js` (new)
- `src/planner/TravelLegsSection.jsx` (rewritten; `TravelLegsSummary` removed)
- `src/planner/GuidedTripWizard.jsx`
- `src/hooks/useTripPlanner.js` (end check)
- `src/styles/planners/88-pf2-wizard.css` (new)
- `src/i18n/*.js`
- `tests/wizardFlightChoices.test.mjs` (new)

### What broke and how it was fixed
- **On the task branch:**
  - The fare field's own reset said "Leave out of the total" on a flight; it is hidden there and "Use a suggested flight" was added.
  - The phone footer's trip size sat beside the total.
  - The date line wrapped at 390 px.
  - Fare fields were always open on non-flight legs.
- **End check:** the flight picked on Getting there was dropped at Finish. The planned trip re-ranked its own flights from the live answers, so the summary showed KL 14:55 after Ryanair 06:30 was picked.
  - **Fix (`b87a0b347`):** the wizard hands `flightPicks` over, and `useTripPlanner` keeps them in the draft (reset on clear) and merges them into its live flights with the wizard's own `pickedLive`, keyed by day. A moved trip therefore ignores a stale pick.
  - **Walked again:** the summary shows the 06:30 flight at both widths.

### What is still open
- The five-option mode switch breaks the Segmented kit's four-option rule (icon only, labelled; owner or design call).
- Per-stop nights are clamped to 21 in GuidedTripWizard (lines 414, 848 and 878) against the trip maximum of 60.
- The phone step menu lets a seeded trip go back to Where, where changing places drops the finder's priced plan (by design; worth a look).

### Rollback procedure
`git revert b87a0b347`, then `git revert -m 1 2689f12bb`. T813 goes with the merge.
- **Data:** the `flightPicks` key in a stored draft is ignored once reverted.

## T813: Review

### What changed
- **Photos.** A strip with one photo per stop and its credit (swipeable on a phone).
- **Trip line.** The name with dates and travellers as icon lines.
- **Your route.** A timeline: the out flight, each stop (nights, bed price, and a "Find or add a stay" fold with the booking-price field), the hops and the home flight.
- **What it costs.** The planner's receipt lines with icons and the totals. "What the price holds" opens the existing sheet.
- **Edit** jumps to Stay or Getting there.
- Desktop keeps the map. Finish is unchanged.

### Files touched
- `src/planner/wizard/StepReview.jsx`
- the T812 CSS and i18n

### What broke and how it was fixed
Nothing beyond T812's list.

### What is still open
The end check found that Review's total (€1,931.20 with the picked flight) and the summary's after Finish (€1,953.20) still differ by €22. This is the known hand-over gap of T802-c in a new place; T801-f says the planned trip does not read the stay tier or Lifestyle the wizard priced.

### Rollback procedure
With T812 (one commit).

## T814: Trip summary after planning

### What changed
- **New `TripSummary.jsx` and `TripSummary.css`.**
  - A photo strip of the stops, the name, dates and people with icons.
  - A route timeline: home, flight out, each stop (thumbnail, nights, dates, bed), flight home, home.
  - The planner's own total for the group and a person.
  - See trip details (the full page), Plan your days (DaysPrompt with `skipAsk`), Edit trip, save and settings.
  - "All trips" (`onPlanHome`).
- **When it shows.** Finish, opening a saved, device or shared trip, and a trip opened from the Plan home all land on the summary. The arrival modal is removed. The full page has a "Trip summary" back button.
- **TripHome** (no stops yet) shares the summary's head.

### Files touched
- `src/planner/TripSummary.jsx` (new)
- `src/planner/TripSummary.css` (new)
- `src/planner/TripPlannerTab.jsx`
- `src/planner/flow/TripFlow.jsx` (TripHome)
- `src/planner/flow/DaysPrompt.jsx`
- `src/planner/flow/setupScreens.jsx` (end check)
- `src/i18n/*.js` (8 `trip.sum.*` keys)

### What broke and how it was fixed
- **On the task branch:**
  - The round buttons sat on an empty row.
  - On a phone the total and actions were below the fold; they now come first.
  - The desktop photo strip was too tall.
  - A box-shadow ring failed design-lint.
- **End check, the trip's name.** The summary showed the route label ("Austria") over the name the traveller typed. A blank name was stored as the literal "My trip", which then beat the route label on the Plan home card.
  - **Fix (`475d240b0`):** the summary prefers the typed name, and a blank name stays blank.

### What is still open
- Airlines show as their code ("FR") on the summary while Getting there names them ("Ryanair"); the summary reads the airline list, which the local NOPUBLIC serve may lack. Confirm on a real build.

### Rollback procedure
`git revert 475d240b0 ab907b657`. Revert T815's `01cbb55d4` together with it, since the summary imports `lib/tripDates.js`.

## T815: Calendar and date flow

### What changed
**New `src/lib/tripDates.js`:** UTC-safe date helpers with tests run under Pacific/Auckland. Findings fixed:
1. **Several months picked.** The planner used the first in calendar order (November and January picked in October planned January). Fixed in `draftPatch`, and on the batch branch in the finder's `setupMonth` (`f0f3ef176`, with a test).
2. **A booking imported after the old end** left the trip ending before it started. Fixed.
3. **Changing When on a planned trip.** A new end was ignored, an empty trip got 0 nights, and the end drifted. Fixed with `movedWindow`.
4. **`addDaysISO` was a day early east of UTC+12.** Fixed in WhenScreen.
5. **The top card and summary** now say "x of n nights planned" when the stops and the dates differ.
6. **Limits.** The end is clamped to the max date, and the trip page's end must be at least start + 1.
7. **StepWhen.** Its 21-night cap now follows the shared 60 (`MAX_TRIP_NIGHTS`), and its raw buttons are now kit buttons.

Checked and fine: the DateField calendar at 390 px, the stops moving with a new start, `lib/dates.js`, and `plannerStore` dropping a stale past start.

### Files touched
- `src/lib/tripDates.js` (new)
- `src/planner/flow/setupScreens.jsx` (WhenScreen)
- `src/planner/wizard/StepWhen.jsx`
- `src/planner/TripPlannerTab.jsx`
- `src/planner/flow/tripSettings.js` (outside the declared list, minimal: `draftPatch` takes `today`)
- `src/lib/recommend/candidates.js` (batch branch)
- `tests/tripDates.test.mjs` (new, 7)
- `tests/recommendTrips.test.mjs` (+1)

### What broke and how it was fixed
Nothing in this task's own work broke. The month-order bug sat in the finder's file (T810's owner), so it was fixed on the batch branch after the merge.

### What is still open
- One month starts on three days: Explore the 1st, the wizard the 5th, the finder the first Saturday. One shared rule is needed (owner).
- `appSync.js` `addDaysISO` still has the east-of-UTC+12 off-by-one.
- One minimum date is needed: the wizard says today, the flow tomorrow, and "On a trip now" sends Explore today.

### Rollback procedure
`git revert f0f3ef176 01cbb55d4` (with T814, see above). The date rules are pure code; nothing stored changes shape.
