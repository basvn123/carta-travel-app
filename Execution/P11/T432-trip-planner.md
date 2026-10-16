# T432: Trip planner redesign (wizard, review, planned trip)

## Task ID

T432

## Date

2026-10-16

## What changed

The trip planner now has one price. Before, the last wizard step and the planned trip summed the same trip twice, through two functions with different inputs: the Albania test week read €671.80 on the last step and €791.80 one tap later (the airport transfers were only in the second sum), the planner dropped a typed car cost, a train ticket still picked up an airport transfer, the wizard and the planner read the Lifestyle from two places, and a flexible date could price a different week. `lib/tripTotal.js` `priceTrip()` now prices every part of a trip once, and the wizard prices the exact state it hands over (`wizardPlannerState()`, the transform `loadFromWizard` applies), so the figure on every step, on the published-trip cards, on the planned trip and in the PDF is one figure by construction. A walk of five budget shapes (a couple, a family of four in dorms, a solo foodie in a hotel, a group of six, a trip with no fare typed) shows the same total from Getting there to the planned trip, and a typed fare moves the total by exactly the fare.

The flow follows how people plan (research: Expedia/Luth path to purchase, Fesenmaier and Jeng's hierarchy, drip-pricing studies, Wanderlog, Stippl, TripIt, Polarsteps, Lambus): what is booked, where from, a new Who step (the party and the Lifestyle panel's two answers as tiles that write the same `choices.stay_tier` and `choices.lifestyle`), when, where, the trip, getting there, review. A price card (`planner/PlanTotal.jsx`) stands beside every step from 1100 px and behind the footer's figure on a phone: the total and the figure a person, dates, people and Lifestyle changeable on any step, and the receipt with each line marked as Carta's estimate, the traveller's own, or not in the total. The traveller's own price sits on the thing it paid for (each leg, each bed, the way there and the way home, each kept apart), says whose it is ("Your fare for 2 people") and replaces the estimate, never adds to it. Booked is three large tiles with no subtitles; the fare promises Carta stopped making are gone; the review frames its photo whole at 16:9 with its caption under it.

The planned trip on a phone is a page, not a full-screen map behind a sheet: the price card first, a map card whose pins say "Berat, 3 nights" and open a full-screen map where a tapped pin shows the stop with its nights changeable, the route as one timeline, compact days, Before you go as a track of cards, export and share. On desktop the data column is 52 percent of the screen. The PDF is now a Figtree booklet on the T430 kit (`lib/planPdf.js`) priced from the same function. The dual-agent impeccable critique scored the first build 21/40 and, after one fix batch, 25/40.

## Files touched

**Created (continent-app):**
- src/lib/tripTotal.js (the one price: priceTrip, tripLines, tripReadiness, wizardPlannerState, paidEur)
- src/lib/planPdf.js (the planned trip's booklet)
- src/planner/PlanTotal.jsx (the price card, the phone's figure, the price field)
- src/planner/planHooks.js (useLifestyleLabel, useTotalDelta)
- src/planner/LifestyleChoices.jsx (the Who step's Lifestyle tiles)
- tests/tripTotal.test.mjs (10 tests over a budget matrix)
- scripts/verify_trip_price_consistency.mjs (five budgets walked in the browser)
- scripts/measure_trip_planner.mjs (before and after numbers, 390x844 and 1440x900)

**Modified (continent-app):**
- src/hooks/useTripPlanner.js (prices through priceTrip; live Lifestyle; own stays; save, load and share carry them)
- src/planner/GuidedTripWizard.jsx (Who step, hand-over as a value, price card, Booked tiles, review, kit controls on When)
- src/planner/TripPlannerTab.jsx (phone page and map card, full map, stop card, PDF hook)
- src/planner/TripItinerary.jsx (overview rebuilt: price card, route timeline with price fields, days, exports)
- src/planner/TravelLegsSection.jsx (money on every leg, estimates beside it)
- src/planner/CheapTipsSection.jsx (Before you go as a track)
- src/planner/ReadyTripsStep.jsx, src/planner/CountryMatchCards.jsx (whole-trip card price, estimate mark for "national")
- src/map/TripMap.jsx (pin tags)
- src/lib/shareLink.js (own stays and the split fare survive a share)
- src/browse/LifestylePanel.jsx (exports its profile tables)
- src/App.jsx (no settings line on the Trip tab; the planner carries its Lifestyle)
- src/styles/67-v6-tripplanner.css (the T432 sections at the end)
- src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js (55 plan.* keys, and wizard.summaryDates where it was missing)
- scripts/shoot-planners.mjs (Who and Review steps, two overview scroll shots)

**Created (root):**
- Execution/P11/T432-trip-planner.md, Execution/P11/T432-shots/ (flow before and after at 375 and 1280, measure screens at 390 and 1440, the booklet and its pages, measure-before.json, measure-after.json), Execution/P11/T432-critique/ (the two critique snapshots)

## Commands run

```bash
# worktrees (a T457 session held both checkouts)
git -C continent-app worktree add ../../wt/t432-app -b p11-trip-planner master
git worktree add --no-checkout ../wt/t432-root -b p11-trip-planner main   # sparse: Execution, continent-app/src, scripts, tests
# node_modules and the untracked public data linked in from the main checkout (junctions, hardlinks)

# in wt/t432-app
npx vite --port 4240 --strictPort
npm test                                   # 402 pass
node scripts/ci/design-lint.mjs            # 0 new
node scripts/ci/token-contrast.mjs         # 0 under the floor
node scripts/ci/banned-terms.mjs           # none
npx vite build                             # builds
node scripts/verify_trip_price_consistency.mjs --url=http://localhost:4240/
node scripts/measure_trip_planner.mjs --url=http://localhost:4241/ --label=before --shots=../t432-root/Execution/P11/T432-shots   # master on 4241
node scripts/measure_trip_planner.mjs --url=http://localhost:4240/ --label=after --shots=../t432-root/Execution/P11/T432-shots
node scripts/shoot-planners.mjs --url=http://localhost:4240/ --only=trip   # 0 offenders, 28 screens

# impeccable (from the repo root)
impeccable.cmd context --target continent-app/src/planner/GuidedTripWizard.jsx
impeccable.cmd detect --json <the seven planner files>    # []
impeccable.cmd critique-storage write src/planner <snapshot>  # 21/40, then 25/40
```

## Config and secrets set

None.

## Before/after measurements

Before is master at 88d499c (T457 merged), after is p11-trip-planner, the same trip (Nothing booked, CRL, two people, flexible October, Albania by hand, the first published trip, no fare typed).

| Metric | Before | After | Delta |
|---|---|---|---|
| Price on the last wizard step, phone and desktop | €671.80 | €791.80 | +€120.00 (the transfers now counted from the start) |
| Price the planned trip opens on | €791.80 | €791.80 | the two now agree |
| Budgets showing one figure from Getting there to the planned trip (walk of 5) | not measured before (0 of 1 tried agreed) | 5 of 5 | |
| Chosen published-trip card against the trip total | €666 (beds and days) against €792 | €792 against €791.80 | one figure |
| Phone planned trip: map share of the first screen | 78% | 20% | -58 pp |
| Phone fixed chrome on the wizard steps | 30 to 37% | 25% | to the carta-design quarter |
| Phone fixed chrome on the planned trip | 33% | 18% | -15 pp |
| Desktop 1440 wizard: content width share (column and price rail) | 61 to 74% | 96% | |
| Desktop 1440 planned trip: data column share | 31% | 52% | +21 pp |
| Words in the first phone screen: Booked, From, When, Getting there, last step, planned | 40, 72, 63, 129, 80, 106 | 27, 61, 67, 75, 59, 53 | fewer on 5 of 6 |
| Words in the first desktop screen: Getting there, last step, planned | 166, 108, 130 | 139, 64, 81 | |
| Tap targets under 44 px, 28 screens of shoot-planners | 0 | 0 | |
| impeccable critique (dual agent) | 23/40 (T377 brief, the old planner) | 21/40 first build, 25/40 after the fix batch | +2 on the old planner, +4 on the build |
| impeccable detector, the seven planner files | not run | [] | |
| design-lint raw buttons in src/planner | 316 | 281 | -35 (wizard 62 to 49, itinerary 24 to 9, travel legs 7 to 2) |
| design-lint new violations | | 0 | |
| Tests | 392 | 402 | +10 (tripTotal) |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The planned trip cost €120 more than the last wizard step | Airport transfers only in useTripPlanner's grandTotal | One function, priceTrip, priced from the state the wizard hands over |
| A train ticket picked up an airport transfer | An own fare that was not a flight still took the routed flight's airport | Non-flight arrivals land at the first stop or the named arrival |
| A typed car cost vanished on the planned trip | `owncar` returned before reading ownFlight | The typed figure replaces the drive estimate, each direction apart |
| The Lifestyle panel moved every price but the planned trip's days | The trip froze the habits it was handed | The planner reads the panel live |
| Next stayed disabled on the new Who step | canNext did not name it | Who never blocks |
| A one-way fare made "there and home" read as settled | One travel line | Two lines, there and home |
| "Use Carta's estimate" under a flight fare | One reset label | "Leave out of the total" where Carta has no figure |
| The trip card said €666 and choosing it showed €792 | Cards priced beds and days only | Cards price the whole trip through priceTrip |
| The card said 7 nights where the trip slept 6 | Dates read the When answer | Dates read the trip once it has stops |
| A map pin painted over the phone footer | The map card had no stacking context | isolation on the card |
| Price inputs measured 42 px | The box carried the border | The input is the bordered box |
| useTripPlanner edit through a heredoc failed | Bash heredoc quoting | Scripts written to the scratchpad and run from there |

## What is still open

The first and second critique left items this task did not take, each a register row:

- T432-a: InfoDot on est., the readiness line and Move the whole trip waits on T193-a's glossary.
- T432-b: one locale-aware date formatter for the planner (four formats still meet on one trip, "Fri 16 Oct", "16 Oct 2026", arrows and "to").
- T432-c: German and the other languages: older planner strings T432 did not add still fall back to English in de (the From and Where headings, Planning around, the month chips, Travellers, Change), country names come from the data in English.
- T432-d: TripMap pins have a 26 px hit box, and a tapped pin turns ink while the rest stay brown (the reverse of the rule).
- T432-e: the same leg reads 72 km on Getting there (the published leg) and 93 km on the planned trip (the routed leg).
- T432-f: DateField on a phone: day cells 45 by 26 px, and enabled out-of-month days at 2.22:1.
- T432-g: eight steps with no shortcut for a known trip, and the bottom nav stays visible during the flow; whether Booked, From and Who become the price card's inputs is the owner's call.
- T432-h: children are priced as adults (no child rates in the data) and there is no age field.
- T432-i: Before you go's country card is CountryIntel inside a card, with a green "Budget-friendly" fill and "/day"; flatten it into fact rows.
- T432-j: Edit stops (the editor view) keeps the older UI.
- T432-k: carta-design asks one per person per day figure on a priced page; the price card shows the trip and a person, not a day.
- T432-l: Move the whole trip's "-1" and "+1" buttons, and the leg mode chips selected by tint without a tick.
- T432-m: the Where quiz's spend answer no longer changes the Lifestyle (the Who step owns it); the Trip tab no longer shows the settings line (language and currency stay in Account); the owner confirms both.
- T432-n: the real-phone pass: the price field's numeric keyboard, the full map's gestures and the sticky footer over Safari's bar.

Closed: T418-a (the When step's fare copy is gone), T377-d (the owner kept Booked as the first step and asked for it larger).

## Rollback procedure

Both repos took a `--no-ff` merge of `p11-trip-planner`. Revert the merge commit in each (`git revert -m 1 <merge>` in continent-app on master and in the root on main) and push the root. No data, schema or wire change: saved trips keep loading because the new fields (`ownStays`, `costOut`, `costBack`) are optional and older records price as before (an unsplit fare reads as one line). Drafts in `carta.tripDraft.v1` and `carta.plannerDraft.v1` carry the new fields harmlessly after a rollback.
