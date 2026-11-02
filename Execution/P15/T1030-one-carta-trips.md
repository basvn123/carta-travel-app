# T1030: one Carta's own trips, Plan's page

## Task ID
T1030 (T1031 to T1034 claimed alongside and unused; T1018 to T1029 belong to session travel-app-55)

## Date
2026-11-02

## What changed
The owner said Explore's and Plan's "Carta's own trips" are two different pages, and asked for one: Plan's. On that page they asked to:
- bring the style tabs up
- remove the big title and the "258 trips" count
- tighten the rows on a phone
- show the words on the photos without cutting them off
- under the photos, say something more useful than "4 places, 6 nights"

**One library.**
- Explore drops its umber block (`CartaOwnTrips.jsx` and `97-carta-own-trips.css` are deleted).
- `openTripStyles` (a style tile, a country page's "See all weeks") now opens Plan's Carta's own trips, with that style or country chosen. A country shows as a removable chip.
- A trip's page closing, by any path, hands back to Plan's page. Destinations reports `pageJourney` going from open to closed through `onJourneyClosed`, and App moves to Plan on the next tick, after its own Back handling.

**A live bug fixed on the way.** On the current site, a trip opened from Plan's Carta's own trips could not be closed: neither the back arrow nor the browser's Back worked.
- **Cause:** `JourneyPage` re-subscribed its `popstate` listener on every render, because `onClose` is a new function each time. App's own `popstate` listener runs first and re-renders the page, so the re-subscription removed the listener before its turn, and the new one does not receive the event it was added during.
- **Fix:** one listener for the page's life, reading `onClose` through a ref.
- **Measured** at 390 and 1440 px: before, the back arrow left the page open (reproduced on the live site); now both the back arrow and the browser's Back land on Plan's page.

**The page.**
- No big title. The heading stays for screen readers and focus, and the breadcrumb names the page.
- No count.
- The style tabs come right under the breadcrumb.
- Gaps between rows on a phone: section gap 20 → 12 px, heading 20 → 16 px, rail gap 16 → 12 px.

**The card** (`TripPlaceCard`):
- **On the photo:** the countries (wrapping, never cut) and the trip's name, whole. A "Name: what it is" title, 154 of 258, shows its name there; the longest name is 39 characters.
- **Under the photo:**
  - what the week is: the rest of that title, or the trip's highlights ("Sarria · Portomarín · Palas de Rei · Arzúa"), in full
  - its difficulty, in the journey's own localised scale word and tone (Gentle and Moderate in lagoon, Active in sun, Demanding and Expert in terracotta)
  - the days, then the price a person a day and the flight

  This replaces "4 places, 6 nights" and the flag.
- **The badge** shows only In season. The days moved under the photo.
- **Screen readers** get the full title and the countries.
- Measured: 0 cut-off names, descriptions or countries at 390 and 1440 px.

**Not deleted.** Explore's trip list inside `DestinationsTab` (the `trips` category) still exists. A trip page still opens over it, because Destinations' Back handling expects that, but no door shows it and closing a trip leaves it for Plan.

## Files touched
**Modified:**
- `continent-app/src/App.jsx`
- `continent-app/src/browse/ExploreTab.jsx`
- `continent-app/src/browse/DestinationsTab.jsx`
- `continent-app/src/browse/JourneyPage.jsx`
- `continent-app/src/browse/TripPlaceCard.jsx`
- `continent-app/src/planner/flow/PlanFlow.jsx`
- `continent-app/src/planner/flow/CartaTrips.jsx`
- `continent-app/src/styles/planners/90-plan-home.css`

**Deleted:**
- `continent-app/src/browse/CartaOwnTrips.jsx`
- `continent-app/src/styles/97-carta-own-trips.css`

**Created:** `Execution/P15/T1030-shots/`

## Commands run
Work ran in a sparse worktree (`wt/t1030`, branch `p15-carta-trips-unify` from main a6a0435807, no `public/`, `node_modules` junctioned), because session travel-app-55 was working uncommitted in the root checkout.

- `npx eslint` on the touched files: 0 errors. Warnings: `Icon` in JourneyPage (a false positive, predates this task); one warning added and then cleared by renaming the unused prop to `_onOpenStyles`.
- `npm test`: 1,070 pass, 7 fail. All 7 read files the sparse worktree does not have: `public/boot.json` and the home clips (5), and the root `supabase/functions/` (notify, passSubscription). None of them touch this task's files.
- NOPUBLIC build. Playwright at 390 px (touch) and 1440 px:
  - Explore: no folder
  - Plan → Carta's own trips: title screen-reader-only, no count, 0 cut texts
  - open a trip, then the back arrow: lands on Plan's page
  - open another, then the browser's Back: lands on Plan's page
  - the same steps on the live site reproduced the bug

## Config and secrets set
None.

## Before/after measurements
| | Before | After |
|---|---|---|
| Pages titled Carta's own trips | 2 (Explore's list, Plan's) | 1 (Plan's) |
| Back arrow on a trip opened from Plan | page stays open (live) | closes onto Plan's page |
| Browser Back on that trip | page stays open | closes onto Plan's page |
| Cut-off texts on cards (390 and 1440 px) | names cut at 2 lines | 0 |
| Under the photo | "4 places, 6 nights" | what the week is, difficulty, days, price |

## What broke and how it was fixed
- **The first close hook did nothing.** It sat on JourneyPage's `onClose`, which never ran because of the bug above. It moved to an effect on `pageJourney`.
- **Opening a trip without the trips category left Destinations half-switched.** Its own Back handling expects that category, so the category was restored on open.

## What is still open
- **T1030-a.** Explore's trip list (the `trips` category in `DestinationsTab`) is unreachable now, but it is still the layer a trip page opens over. Moving JourneyPage out of DestinationsTab (for example to App, over any tab) would let that list and its code be deleted.
- **T1030-b.** Branch `p15-carta-trips-unify` (worktree `wt/t1030`) is not merged. Session travel-app-55 has `p15-price-feel` (T1018) open in the root checkout. Merge order and deploy are the owner's call.

## Rollback procedure
`git revert` this task's code commit (on `p15-carta-trips-unify`). It restores `CartaOwnTrips.jsx` and its CSS.
