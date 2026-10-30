# T876: plan flow walk fixes with the owner, deployed

## Task ID

T876

## Date

2026-10-30

## What changed

The owner walked the live plan flow screen by screen and named fixes as they went. All of them are in one commit, because nearly every fix touched the same files (the six language files and `setupScreens.jsx`). Each fix is listed below with where it lives. The flow after "Start planning" changed shape: the four doors ("How much should Carta plan?") are gone. The help-me-choose questions run straight away and end on a new "How do you want to plan?" (whole trip at once, or decide the flights first). A new "How will you get around there?" question feeds both the scoring and the pricing. The search screen became a timed brief that stands at least 4 seconds. Production now serves this build.

**Setup questions**
- Kind sheet, Tell, Booked, Sleep, From, Airports, Pick: the help lines and row subtitles the owner named are removed (`questions.js` helpKey, `PlanFlow.jsx`, `setupScreens.jsx` PickScreen).
- Tell: the "N questions left" line is removed. With no text typed, the screen fits 375x667 without a scroll: the field is 3 rows, the empty booking status line is taken out of the flow, and a double gap is removed (`QuestionScreen.jsx`, `planners/86-plan-flow.css`). With a long sentence it still overflows on short phones (T876-e).
- Where you sleep: three tiles (apartment or holiday home, hotel, hostel), no prices, no whole place/room row. Fine tune sits at the right of the "How you spend" heading (`StayTypes.jsx`, `LifestyleStep.jsx`).
- Where from: country first (`FromCountryPanel` in `FromPicker.jsx`), with an optional town or address searched inside that country (`geocode.js` gains `countryCode`). A country stands for the airport town nearest its capital (a 45-country table; the median of its towns otherwise). Use my location never worked in production, because `public/_headers` sent `Permissions-Policy: geolocation=()`. It now sends `geolocation=(self)`.
- Airports: a line shows where the drives are measured from: "From Spain, times from Madrid" for a country, "From Gent" for a town.
- Create trip: the three visibility chips sit on one line (the link chip reads "Link" and keeps "Anyone with the link" as its label for screen readers). The dates card's two halves are equal and a long value wraps, where four or more months used to push "How long" off the card.
- Budget: a Per person / Total for N toggle, which starts on the total for a party with children. The quick amounts follow the toggle, and one line gives the other reading ("About €1,800 per person"). A group budget keeps its own total (`tripSettings.js` budgetOfRaw, `per` and `groupEur`). `eur` stays the per-person figure every check compares against, and it follows the party size when that changes.

**After Start planning (`TripFlow.jsx`, `flowGraph.js`)**
- The doors screen, "I know where I'm going", "I've booked part of it" and the "Carta's own trips" link are removed from this flow. The last question, `g:how`, sets the trip's door. Flights first goes to the flight-first screen; the whole trip goes to Trips for you.
- Every step carries the trip settings gear in its own head, level with back, instead of a bar floating above (`PlanStage.jsx` SheetHead `end`, threaded into `DoorScreens.jsx`, `FindingTrips.jsx` and `TripsForYou.jsx`).
- What kind of trip: "One way" is removed. The finder only ever built it as towns (`config/recommend.json` fallbackShapes); a saved answer still loads.
- What are you up for: the photo credits fold behind one small "Photo credits" link. The CC BY / BY-SA photos still need their credit; the owner accepted the small link as the way to give it.
- What should Carta pick: the help line and the subtitles are removed (Where to go keeps "Places that fit your answers").

**Flow rules**
- Continue skips only questions the Tell sentence answered and that haven't been seen on their own screen yet (`continueTo` in `flowGraph.js`, used by PlanFlow and TripFlow). Before this, going back and pressing Continue jumped past every answered question.
- No flying (the way there is train or car, or How far is "No flying", via `noFlying()`): no airports question, no "How far", no "How do you want to plan", no Flight row on the pick screen, and no airports chip.

**Getting around (new question `g:around`)**
- Public transport, Taxis and rides, Rent a car, Whatever fits best. It comes after "How far", and is skipped when driving their own car or with a rental car booked.
- `wantsNoCar()` in `candidates.js`: public transport or taxis means no car. Places with `car_need` take the `match.js` car conflict, road-trip shapes are dropped, and trips are priced without a car (`transportFor` returns 'auto'). Rent a car prices every shape with a hire car. "A car" left the avoid question; an older answer still counts.
- Taxi fares are not measured anywhere, so a taxi answer is priced with the public transport figure and the slot says "Public transport" (T876-a).

**Searching (`FindingTrips.jsx`, `87-trip-finder.css`, built with the impeccable and carta-design skills)**
- The answers assemble into the trip's brief in Carta's receipt grammar. Each line starts as a still grey bar and its answer writes itself in, one line after another over about 2.8 seconds. Each answer is ticked once the stage of real work that applies it is done. Under a 2 px ink rule, one live line names the work in hand and ends on "N trips found". The first trips' own photos fan in above, three distinct ones, with the names under them.
- The screen stands at least 4 seconds from its first frame, then holds "N trips found" for 0.7 seconds. A run that's already done on arrival (back from a trip) or a trip's own address skips the hold. This reverses T867's "no minimum", by the owner's word. Reduced motion: everything stands at once and the ticks still come. Nothing loops; the live dot stays still.

## Files touched

**Modified (app, commit 6db2e2f, mirrored in the root repo):**
- `continent-app/public/_headers`
- `continent-app/src/components/FromPicker.jsx`
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (new keys only: from.*, pf.reach.via, pf.vis.linkShort, pf.likes.creditsBtn, pf.budget.*, pf.q.how, pf.o.how*, pf.q.aroundTrip, pf.o.aroundCar, pf.o.aroundMix, tf.load.brief, tf.load.found*)
- `continent-app/src/lib/geocode.js`, `src/lib/plan/parseTrip.js`, `src/lib/recommend/candidates.js`, `src/lib/recommend/trips.js`
- `continent-app/src/planner/finder/DoorScreens.jsx`, `FindingTrips.jsx`, `TripsForYou.jsx`, `finderText.js`
- `continent-app/src/planner/flow/LifestyleStep.jsx`, `PlanFlow.jsx`, `PlanStage.jsx`, `QuestionScreen.jsx`, `StayTypes.jsx`, `TripFlow.jsx`, `VisibilityChoice.jsx`, `flowGraph.js`, `questions.js`, `setupScreens.jsx`, `tellChips.js`, `tripSettings.js`
- `continent-app/src/styles/77-settings-v2.css`, `86-plan-flow.css`, `87-trip-finder.css`, `planners-held.css`, `planners/86-plan-flow.css`
- `continent-app/tests/endToEnd.test.mjs`, `flowGraph.test.mjs`, `parseTrip.test.mjs`, `tellChips.test.mjs`

**Created:**
- `Execution/P15/T876-plan-flow-walk.md`

## Commands run

1. `npx eslint <touched files>` and `npm test` after each fix; `node scripts/ci/design-lint.mjs` (no new violations in the touched rules); `impeccable detect` on the loader (none).
2. Browser checks with throwaway Playwright scripts against `npx vite --port 5199`: Tell fit at 4 sizes, the From picker (country, town search, Use my location with a fixed position), the car walk, back and Continue, the budget for a family and a solo traveller, and the loader timed inside the page.
3. `git -C continent-app checkout -b p15-plan-flow-walk`, commit 6db2e2f, then master fast-forwarded to it.
4. `VITE_E2E_SEAMS= npm run build:pages`: PASS, 280 files (19,720 under the ceiling), entry `index-DNhyVmBx.js`. `node scripts/css-routes.mjs --check dist/assets`: 1 problem, the known T833-a; no hold needed.
5. `node scripts/r2/push-data.mjs --rclone-dry-run`: 0 B, 44 of 44 checks, so no data push.
6. `npx wrangler pages deploy dist --project-name carta-app --branch preview` (fe849e99), then a smoke walk on preview.carta-app.pages.dev.
7. `npx wrangler pages deploy dist --project-name carta-app --branch main` (db83239f), then the same walk on www.carta-europetravel.com.
8. Root: this report, the register rows and the sync of the 37 app files, then `git push origin main`.

## Config and secrets set

`Permissions-Policy` in `public/_headers`: `geolocation=()` became `geolocation=(self)`. No secrets.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Tell, empty, 375x667: scroll overflow | 71 px | 0 px | -71 |
| Tell, empty, 360x740 / 390x844 / 414x896 | fits | fits | 0 |
| Search screen stand (in-page, dev, phone and desktop) | as long as the work (about 1 s) | 3,991 to 4,009 ms | owner's 4 s |
| Search screen stand, production walk | n/a | 3,991 ms | |
| Help-me-choose questions (nothing answered) | 7 | 9 (around, how) | +2 |
| Production `Permissions-Policy` geolocation | () | (self) | Use my location works |
| `npm test` | 1109 | 1114 | +5 |
| Live entry | `index-DdQJtM0h.js` (Pages 8c452891) | `index-DNhyVmBx.js` (Pages db83239f) | |

## What broke and how it was fixed

- My first "times from Madrid" line used `meta` before it was declared, which crashed the airports step. The browser walk caught it before the commit, and it's fixed. Lint didn't flag it.
- Picking only a country first put Spain in Seville (the Canary Islands dragged an average position southwest). Fixed with the capital table.
- `answerChips` briefly referenced an undefined `guide`. It was caught on reading and fixed before any run.
- Three older tests compared the whole budget object. The per-person figures are unchanged (500, 375); the expectations now include `per` and `groupEur`.
- During the merge, `git checkout master` rewrote the working files to master and then failed to write `.git/HEAD` (a transient Windows lock). Nothing was lost: the commit was already on the branch. The 37 paths were restored from 6db2e2f with `git restore`, master was moved with `git branch -f`, and HEAD was repointed with `git symbolic-ref`. `dist/` had been built from the committed source before that, so the build was unaffected.
- The hashed preview URL (fe849e99.carta-app.pages.dev) cannot load the travel data, because the data host's CORS doesn't allow it. The walk ran on the preview alias instead and passed.
- The T874 walk (`walk-g-remote.mjs`) expects the door screen, which is gone by design, so it no longer applies. A new smoke walk replaced it for this deploy.

## What is still open

- Taxi fares are not priced; a taxi answer uses the public transport figure (T876-a).
- The Tell sentence does not set the getting-around answer (T876-b).
- The day planner's "How do you get around?" is still asked separately, though `g:around` could fill it (T876-c).
- `KnowDoor.jsx`, `BookedDoor.jsx`, the `.pf-door*` styles, `KnowBuildScreen` and the removed screens' i18n keys are now unused, left in place for a clean rollback (T876-d).
- Tell with a long sentence still overflows on 360x740 (17 px) and 375x667 (49 px); the owner hasn't chosen between pinning Continue, smaller chips, or leaving it (T876-e).
- The trip page budget card shows a group budget per person (T876-f).
- Czech Republic has no flag in the country list (T876-g).
- "Room in a home" chosen on Explore leaves none of the three planner stay tiles selected (T876-h).
- The T874 remote walk needs rewriting for the new flow before the next deploy walk (T876-i).

## Rollback procedure

- **Production:** in the Pages dashboard, roll back to 8c452891 (or `npx wrangler pages deployment list --project-name carta-app`).
- **Code:** `git -C continent-app revert 6db2e2f` and revert the root sync commit. Saved trips stay readable either way: `guide.around`, `budget.per` and `budget.groupEur` are optional, and older code ignores them.
- **Geolocation header:** reverting `_headers` turns Use my location off in production again.

## Notes on filling this template

One task for the whole walk, because the fixes share files. The browser end check ran per fix during the walk and once more on preview and production.
