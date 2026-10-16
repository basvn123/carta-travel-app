# T458: trip planner, second pass after the owner's walk

## Task ID

T458

## Date

2026-10-16

## What changed

The trip planner T432 rebuilt now does what the owner found missing on a walk through it, and the gaps T432 left open are closed. The party is three groups (adults 12 and over, children 3 to 11, babies under 3) and the price follows it: a child counts half on beds, meals and train and bus fares, a baby travels free, and a car is still priced per car with every seat counted. Where the trip leaves from is one card with the near airports as choice chips, asked on Getting there (or after Booked when travel is held), so the flow is Booked, Who, When, Where, Trips, Getting there, Review. Every leg between stops shows "Find tickets" with up to four operator links in view, and every stay carries a "Find a place" link to Booking.com with its own dates and party. Review leads with a gallery of the stops' photographs, the airport transfers sit in the journey summary, and each stay names "Your booking price" instead of "Paid for this stay". The planned trip's Bookings, Packing, Notes and Expenses are four tiles under "Your trip kit" that open one tool each in a sheet, replacing the long fold at the foot of the page. Before you go is one swipe track of cards of one shape and height (best time, getting around, driving, food, must sees, insights, then tips). The route on the planned trip now shows the way from the airport to the first bed and from the last bed back, each with its mode and estimate, and the flight rows name the airport ("Flight to TIA") instead of a town without one. Map pins carry a small photograph and the nights; the tapped pin stays brown with an ink ring; the airports are pins of their own. Your stays (beds booked) is one card a stay with the kit stepper, its dates, the find link and the booking price, and Edit stops is on the kit (stepper, 44 px move and remove, transport as wrapping choice chips, a "Done, back to the trip" footer). The price card's people row opens the party editor inline, with room and hairlines between its rows. Dates read in the reader's language. The 92 planner strings that fell back to English in the other five languages are translated. A pen test found that a shared link could name `__proto__` or `constructor` as a stop and have it accepted; the decoder now refuses prototype names, typed prices cap at one million, and the stay link clamps the party. The price is still one figure from Getting there to the planned trip for all five test budgets, the family with two children included.

## Files touched

App repo (`continent-app/`, branch `p11-trip-planner-2`), mirrored into the root repo.

**Modified:**
- continent-app/src/lib/tripTotal.js (party groups and child weighting, transfers per direction)
- continent-app/src/hooks/useTripPlanner.js (children and babies state, draft, save, load)
- continent-app/src/lib/shareLink.js (children and babies, prototype ids refused)
- continent-app/src/lib/transportLinks.js (stayDatesLink, party clamp)
- continent-app/src/lib/dates.js (fmtDate in the reader's locale)
- continent-app/src/map/TripMap.jsx (photo in the pin tag)
- continent-app/src/planner/GuidedTripWizard.jsx (steps, origin card, party, Review gallery and stay actions, Your stays cards)
- continent-app/src/planner/PlanTotal.jsx (party row and inline editor, PaidField addLabel and cap)
- continent-app/src/planner/TravelLegsSection.jsx (ticket links in view, transfer rows in the summary)
- continent-app/src/planner/CheapTipsSection.jsx (uniform Before you go cards)
- continent-app/src/planner/TripItinerary.jsx (trip kit tiles and sheet, find links, transfer rows, airport on flight rows)
- continent-app/src/planner/TripExtras.jsx (one tool at a time, find links on bookings)
- continent-app/src/planner/TripPlannerTab.jsx (party, map airports and photo pins, Edit stops on the kit, footer)
- continent-app/src/styles/67-v6-tripplanner.css (T458 sections)
- continent-app/src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js (T458 keys and the 92 missing translations)
- continent-app/scripts/shoot-planners.mjs, measure_trip_planner.mjs, verify_trip_price_consistency.mjs (new step order, party rows)
- continent-app/scripts/verify_booked_route.mjs (repaired after T432 and extended to the Your stays cards; BASE_URL)
- continent-app/tests/tripTotal.test.mjs (children and babies)

**Created:**
- continent-app/src/planner/PartyEditor.jsx
- continent-app/src/lib/party.js
- continent-app/tests/shareLinkHostile.test.mjs
- Execution/P11/T458-trip-planner-2.md (this report)
- Execution/P11/T458-shots/ (stays, Edit stops before and after, Review, Overview)

**Deleted:**
- None

## Commands run

```
git -C continent-app checkout -b p11-trip-planner-2 master
npx vite --port 4250 --strictPort                         # in continent-app, the live preview
python scratchpad/add_keys.py <keys.json> src/i18n        # T458 keys and the 92 translations
npm test                                                  # 407 pass
node scripts/ci/design-lint.mjs ; node scripts/ci/token-contrast.mjs ; node scripts/ci/banned-terms.mjs
impeccable detect --json <the eight planner files and 67-v6-tripplanner.css>
node scripts/verify_trip_price_consistency.mjs --url=http://localhost:4250/
BASE_URL=http://localhost:4250 node scripts/verify_booked_route.mjs
node scripts/shoot-planners.mjs --url=http://localhost:4250/ --only=trip
node scripts/measure_trip_planner.mjs --url=http://localhost:4250/
git -C continent-app commit ; git -C continent-app checkout master ; git -C continent-app merge --no-ff p11-trip-planner-2
# root: mirror continent-app files, commit on p11-trip-planner-2, merge into main, push
```

## Config and secrets set

None.

## Before/after measurements

Before is T432's after (app master 43d5498), after is this branch, on the same trip (Nothing booked, CRL, two adults, flexible October, Albania by hand, the first published trip, no fare typed).

| Metric | Before | After | Delta |
|---|---|---|---|
| Price on the last wizard step and on the planned trip | €791.80 and €791.80 | €791.80 and €791.80 | unchanged, still one figure |
| Budgets with one figure from Getting there to the planned trip (walk of 5, one with two children) | 5 of 5 (children priced as adults) | 5 of 5 (children at half) | |
| Booked-stays walk (verify_booked_route, laptop and phone) | failing since T432 (old selectors) | passing, with new checks on dates, stepper, find link, bed price | |
| Hostile share links accepted as stops (`__proto__`, `constructor`, `prototype`, `hasOwnProperty`, `toString`) | 5 of 5 | 0 of 5 | |
| Planner strings falling back to English in nl, de, fr, es, it | 92 a language | 0 | -92 |
| Tap targets under 44 px, 26 screens of shoot-planners | 0 | 0 | |
| Phone fixed chrome, wizard and planned trip | 25% and 18% | 25% and 18% | |
| Words in the first phone screen: Booked, Who/From, When, Getting there, last step, planned | 27, 61, 67, 75, 59, 53 | 19, 45, 67, 72, 84, 66 | the last step and the planned trip gained the gallery caption, the stay actions and the kit |
| Words in the first desktop screen: Getting there, last step, planned | 139, 64, 81 | 151, 154, 74 | Review now carries the stays' actions (see T458-e) |
| Phone planned trip: map share of the first screen | 20% | 0% (the map card follows the kit, 150 px) | the owner asked for a smaller map (see T458-d) |
| Edit stops: move, remove and nights controls under 44 px | 4 to 5 a stop | 0 (the city info button is still small, T458-a) | |
| impeccable detector, the planner files | [] | [] | |
| design-lint raw buttons in src/planner | 281 | 267 | -14 |
| design-lint new violations | 0 | 0 | |
| Tests | 402 | 407 | +5 (children, four hostile-link tests) |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| shoot-planners timed out on the new step order | The script still clicked through a From step | From block removed; Who is step 2 |
| The consistency walk found no party stepper | `.wiz-party-row` became PartyEditor's `.party-row` | Selector updated |
| Airport pins were 42 px wide | The plain pin took its tag's width | `min-width: var(--tap)` on tagged plain pins |
| Two TIA pins and labels when the trip flies in and out of one airport | Both ends pinned | The out airport becomes a ghost point the route uses but the map does not pin |
| A `\b` in the date regex became a control character | Python string escaping in the edit script | `startsWith('en')` instead of a regex |
| verify_booked_route failed at its first step | T432 replaced the booked cards with kit tiles and the stop rows with new markup | Walk rewritten on the current markup and extended |
| Your stays squeezed each card on desktop and stacked its actions on the phone | Three columns beside the price card; 290 px of action row for 300 px of buttons | One column with the add card under it, one line a stay from 1100 px, the actions full width on the phone |
| Shared links accepted prototype names as stops | The decoder sliced any string id | `safeId` refuses names `Object.prototype` answers |
| Git Bash `sed -i` rewrote two CRLF files to LF | sed in text mode | Line ends restored; edits through the CRLF-safe script |
| A line-ending-only change to scripts/verify_trips.mjs from the T457 session rode into the T458 commit | `git add -A scripts` | Restored from master before the merge |

## What is still open

Edit stops still ends in its old trip receipt (the own-fare fields, the totals block and the "16 Oct 2026" date inputs with an arrow); the stops, the transport choice and the footer are on the kit, the receipt is not, and it repeats what the price card says. The next planner task should drop it in favour of the price card (T458-a).

The 92 strings were translated by a session, not a native speaker. Three calls want a native eye: German "Reisende(r)" for a traveller, French "Aller" for the way there, and French and Italian "{country}: ..." where the others say "in {country}". Country names still come from the data in English in every language (T458-b).

The child rule (half on beds, meals and public fares, babies free) is a rule of thumb: the data holds no child rates and the planner asks no ages. Booking.com links pass the number of children without ages, so Booking asks for them on arrival. Whether to collect ages is the owner's call (T458-c; T432-h is closed by this pass because the owner asked for the logic).

On the phone the planned trip's map is now a 150 px card after the trip kit and out of the first screen, as the owner asked for a smaller map; whether it should sit higher is the owner's call (T458-d).

Desktop Review reads 154 words in its first screen against 64 before, because every stay now carries "Find a place" and the booking price; a distill pass could fold those into one line a stay (T458-e).

The flight rows name the airport by its code ("Flight to TIA") because an own fare carries no origin and TripItinerary has no airport names; passing the origins table would let it read "Flight to Tirana" (T458-f).

Still open from T432 and not taken here: the glossary InfoDot (T432-a), the 72 against 93 km leg (T432-e), DateField on a phone (T432-f), the eight-step question now seven (T432-g, owner), the per-day figure (T432-k, owner), Move the whole trip's text buttons (T432-l), the two T432 calls (T432-m, owner) and the real-phone pass (T432-n, owner). Nothing is deployed.

## Rollback procedure

App repo: `git -C continent-app revert -m 1 <the T458 merge commit on master>` (or `git -C continent-app reset --hard 43d5498` before anything else lands). Root repo: `git revert -m 1 <the T458 merge commit on main>` and push. No data, schema or migration changed; drafts and share links saved with children and babies still load on the old code, which ignores the two fields.
