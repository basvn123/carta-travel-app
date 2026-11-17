# Run report: plan lane of the house style run

- **Status:** done (see "Judges" for the last verdict)
- **Level:** L2, crew:design then crew:deep-task
- **Branch:** `p15-hs-plan` (pushed), worktree `wt/hs-plan`, off `p15-housestyle` at `1bc221b9de`
- **ROADMAP:** G1 (house style), with G5 (motion) and G10 (accessibility)
- **Dates:** 2026-11-16 to 2026-11-17, fully autonomous (owner, 2026-11-13)

## What was asked
Rebuild every plan screen in the footpath house style at phone, tablet and desktop, lighter and clearer, with every function, step and question kept (visual only), the umber brown kept, minimal text, and motion from the interaction kit. Plan home had no visible title; the library trip page used an older template.

## How it ran
1. Three explorers mapped the flow and wizard, the finder and found trip, and the library trip and journeys (`explore-flow.md`, `explore-finder.md`, `explore-library.md`), with function-parity checklists and every pinned selector.
2. Two proposers drew two layouts inside the decided style: A "Trail map" (wayfinding first, two panes from 769 px) and B "Signpost" (one centred column, progress in one plate) (`proposal-a-trail.md`, `proposal-b-signpost.md`).
3. Two critics (clarity, accessibility and three angles; house style and feel) preferred A; B reused the signpost plate as chrome and pushed tablet layouts to 1280 px (`critique-*.md`).
4. Decision: A with eleven critic fixes and two parts from B (`decision.md`).
5. Build in five batches, checks after each; then three fresh judges with two fix rounds (`judgement-1.md`, `-2.md`, `-3.md`).

## What changed, per screen (before: `shots-base/`; after: `shots/`)

| Screen | Before | After | Shots |
|---|---|---|---|
| Plan flow steps (tell, who, when, from and every question) | a 520 px white card floating on stone at 820 and 1440, the "Plan" back link cut off in the top right corner, title centred, position said twice | from 769 px a trail pane on the stone ground (each step a waymark on one line, its answer under it, the step in hand on the selected row with the blaze) beside a flat paper question pane; the question left aligned in the headline size; Continue pinned (sticky foot above the nav on a phone, the pane's foot from 769 px); the reading column centres from 1280 px; on a phone the step marks are a path (umber discs, the blaze, rings) with "2 of 4" beside it; the "Plan" crumb sits in normal flow | `flow-1..5-{390,820,1180,1440}.png` |
| Plan home, with trips | no visible title, Up next with white text over a dark fall on the photo and a looping drift, the Ready-made door a brown gradient with rgba shadows | "Your trips" title (new key, six languages), New trip the one umber action, the Ready-made door paper with an edge, Up next the photo or trip art with the name and dates beside or under it on paper, no loop, the draft row's menu in the row | `plan-home-trips-*.png` |
| Plan home, empty | beige secondary button, two umber buttons | Start planning the one umber action, Ready-made trips a paper door with an edge, the collection card flat on a hairline (its duplicate pill steps back; the card stays the link) | `plan-home-*.png` |
| Trips for you | name and country in white on the photo, match ring on the photo, amber warnings, ink-slab map button, beige refine banner | photo plus save disc only; name, match (ink arc with "89% match", never a Score), place, Best pick label and reasons, facts, the figure (loudest) and its unit under it; chips with a 1.5 px edge; paper map pill; the refine card a paper panel with a shorter sentence; warnings in `--danger`; "Cheapest" | `trip-finder-*.png` |
| Found trip | the head on the first photo on a phone, a dock floating mid-screen on a phone, the four old cost colours | the head after the gallery at every width, two panes from 769 px with a flat cost post, the dock stuck above the nav on a phone, the cost bar and line marks in the wagon paint with words, fact tiles on a hairline, the sights row keyboard-scrollable | `found-trip-*.png` |
| Library trip (`TripPage.jsx`) | a full-bleed photo, a 760 px column, a beige mono score box, a bordered fact grid, a full-width umber bar button | the house page grammar: a capped wrap, the photo with 16 px corners, the head flush under it with the Score plate, fact tiles, folds as before, and a post with the receipt's day figure and the one action (first in the DOM; the right column from 769 px, a sticky foot on a phone); the missing photo is the world tile, the gone state the error state | `library-trip-*.png` |
| Guided trip wizard | pill stepper, "Pick my cities" unreadable (ink on umber), sparkle icons, legacy tokens and radii | the stepper as waymarks (done discs, the blaze on the step in hand), the design door a readable paper button with the route mark, no sparkle, tokens and radius roles in `12-guided-trip.css` | `guided-1-*.png`, `guided-2-*.png` |
| Ready-made trip cards (`.ctc`) | name and countries in white on the photo, lagoon, sun and hex difficulty tags | name, countries and In season under the photo, neutral difficulty tags (the word carries it) | `carta-trips-*.png` |
| Trip styles and journeys lists | legacy tokens, a 19 px literal | roles and the type scale (`66-v6-trips.css`) | `trips-list-*.png`, `journey-*.png` |

Function parity: every control, handler, ARIA attribute and data field kept; moves only (the library primary into the post, the finder card's text and match under the photo, the found trip head after the gallery). The finder's `WIDE` breakpoint and every flow step, question and handler are untouched.

## Design tokens
No token changed. The lane reads the foundation's roles (`--surface*`, `--text*`, `--action*`, `--select-*`, `--wagon-*`, `--danger`, `--edge`, `--stroke-*`, `--radius-*`, `--elev-*`, `--text-*` sizes, `--dur-*`). One screen-scoped property: `--pf-trail-w` (232 px, 272 px from 1024, 296 px from 1280) in `86-plan-flow.css`.

## Checks
Full table: `checks.md`. On HEAD: `npm test` 25 failures, all in the sparse baseline, none new; lint 0 errors; design-lint 0 new (4,409 to 4,282 in the baseline); token-contrast 0; css-routes clean; impeccable 0; `verify_trip_page` 60/60 (with a new structure check); `verify_plan_short`, `verify_core_flow`, `verify_when_step` 13/13, `verify_carta_route` 20/20, `verify_plan_tiers` pass; axe 0 serious or critical on 8 screens at 390 and 1440; overflow sweep 80 of 80 over 10 widths (before the fix rounds) and 24 of 24 at 390, 820, 1440 on HEAD. Not green here, explained in `checks.md`: `verify_journeys` (sparse `public/` and fixed sleeps on a slow server), `verify_plan_mocks` U and N (the walk predates the current first steps), `verify_journey_claims` (needs `public/`), `verify_guides` (Explore's strip).

## Judges
- `judgement-1.md`: 90 of 135, no (verify evidence, axe re-run, calendar alignment, contradicting reference lines). Fixed in bc4362b347.
- `judgement-2.md`: 77 of 135, no: fix round 1 had nested the main column inside the post on the library trip page. Fixed in 0eeae6acbe, with a `verify_trip_page` check that keeps it fixed.
- `judgement-3.md`: 100 of 135; every hard criterion passes (criterion 11 at 5: no function lost, the library page fixed). One lane-caused blocker: hiding the See the trips pill let the fan photos cover the caption from 820 px. Fixed after the judge by restoring the pill (last commit), re-shot at 390, 820, 1180, 1440 (`shots/plan-home-*.png`). Still below threshold, all soft: 1 ownable 3, 2 clear and minimal 3, 4 craft 3, 9 feels alive 3; judge 3 also disagrees that `verify_journeys` fails only from fixed sleeps (not lane-caused, not yet green). The three-loop limit is reached: these go to the orchestrator's judges and integration.

## Departures from the house style, and why
- The found trip's cost bar uses the wagon paint without the `Formation` part: a trip total and a local-transport part do not fit the day formation (foundation request 3).
- The finder card copies the rail-card grammar instead of using `RailCard` (it needs controls outside the link and a match slot; foundation request 2).
- No ground graphic on the empty plan home: the relief is drawn only from a place's real peaks, and plan home has no place.

## Files changed
`.claude/skills/carta-design/references/plan.md`; `continent-app/scripts/verify_trip_page.mjs`; `src/browse/TripPage.jsx`, `TripPlaceCard.jsx`; `src/i18n/{en,nl,de,fr,es,it}.js` (`pf.home.tripsTitle` new, `tf.card.best`, `pf.refine.sub`); `src/planner/finder/FoundTripPage.jsx`, `TripCard.jsx`; `src/planner/flow/FlowRail.jsx`, `PlanHome.jsx`, `PlanStage.jsx`, `paintGuard.js` (new); `src/planner/wizard/StepStay.jsx`, `WizardChrome.jsx`; `src/styles/12-guided-trip.css`, `43-trip-length.css`, `66-v6-trips.css`, `86-plan-flow.css`, `87-trip-finder.css`, `items-held.css`, `items/24-destination-workspace.css` (two dead `.itin-use` rules deleted, place lane's file: css-routes required it), `items/66-v6-trips.css`, `planners-held.css`, `planners/88-pf2-wizard.css`, `planners/90-plan-home.css`.

## For the orchestrator
- ROADMAP, project map and integration items: `handbook-notes.md`. Foundation requests: `foundation-requests.md` (item 1, the disabled primary, should block integration).
- Tests changed: `scripts/verify_trip_page.mjs` waits for the page instead of a fixed sleep and gains one structure check; no behaviour check was weakened.

## How to undo
`git revert` the lane's 11 commits (a3816e914b to the last "keep the collection card's See the trips pill") in reverse order (or revert the merge of `p15-hs-plan`). No data migration, no schema change, nothing one-way.

## Polish round 1 (from the orchestrator's judges, 2026-11-17)

Input: `plan-fixes-r1.md`, `judgement-orch-plan-1.md` (100 of 135) and `judgement-orch-plan-2.md` (97 of 135), both "Merge: yes" with every function intact, soft criteria under the bar. First `git merge p15-housestyle` (clean, no conflicts), then the fixes. Commits: 9f322b2e57, 4c9b5ba008 (plus the merge cff7b77a07).

| Fix asked | Done |
|---|---|
| Unit said once | Cards print "From €124" (new key `pf.fromEur`, six languages); "A day, a person" (`tp.bud.kindDay`) heads the wizard country grid, the match cards, the trip-style lists and Ready-made trips (`.pl-unit-head`). Library trip: the post shows the trip total, the facts the day figure, so "€263.85 a day, two people" appears once. Up next drops "7 nights" when the name says it. The found trip's photo caption no longer repeats the title. The wizard's plain step name steps back where the stepper names it |
| Totals on the signpost plate | Found trip total and library trip total on `Plate variant="total"` (the library's is the receipt's own sum, the same figure as the cost fold's total line); the library post starts level with the head from 769 px (the wrap is one grid) |
| Card grids with the formation | Finder card: the house `Formation` (stay and food wagons, then the trip total; getting there outlined only when the total leaves the flight out). Ready-made cards: flag with the country. `RailCard` itself still lacks the slots these cards need (foundation request 2) |
| No polaroid fan | The plan home collection is a flat row of rounded photo tiles; the Ready-made door's three photos lie flat |
| Motion | The question settles in on a step change (`useStepIn`, settle curve, no overshoot); the chosen row's mark ticks in; the finder heart pops on the tap (`.hs-pop`); the found trip total rolls once after the traveller's own line swap (`Figure`). Reduced motion shows the end state |
| Disabled Continue | Reads unavailable in the flow and wizard feet (screen scope); cause and exact kit fix in foundation request 1 (`.btn-primary` overrides `.btn:disabled`) |
| Other exact fixes | When segments read word over value (no "Start Set a date"); compact library fact tiles and a tighter head gap; the calendar's day cells a hand high in the wide pane; Up next shows its trip art whole; the plan home tab takes the umber paint bar; "All" in Ready-made uses the route mark (the sparkle drew as an "AI" box) |

Not done, with reason: no ground graphic on the empty plan home (the relief needs a place's real peaks, and the blaze means chosen or here only); the journey page's dot separator ("Active ● Best in May") is in `JourneyPage`, outside this lane's changes.

Checks on HEAD 4c9b5ba008: `npm test` 25 failures, all in the sparse baseline, none new (2122 tests after the merge); lint 0 errors; design-lint 0 new (4,241 in the baseline); token-contrast 0; css-routes clean; `verify_trip_page` 60/60; `verify_plan_short`, `verify_core_flow` pass; `verify_when_step` 13/13; `verify_carta_route` 20/20; `verify_journeys` all pass except the wire pass (needs the full `public/`); axe 0 serious or critical and no overflow on 8 screens at 360, 390, 600, 768, 820, 1024, 1180, 1280, 1440, 1920 (80 of 80, `verify/sweep-p1.txt`). Shots re-taken at 390, 820, 1180, 1440 (`shots/`).

### Re-check fix (judgement-orch-plan-3.md)
Blocking item: polish round 1 had changed the shared `DayFrom` (`browse/JourneyCards.jsx`) to the short "From €124", so callers outside this lane's lists lost the unit: the country and region rails (`TripStylesRow.jsx` `WeeksRow`) and My trips' saved journeys (`SavedJourneys.jsx`). Fixed: `DayFrom` takes `short` (default off, so every other caller prints "From €124 a person a day" again); `StyleCard`, `JourneyCard` and `TripPlaceCard` pass it through, and it is set only where the list head states the unit: the trip-style grid (only when its head with the unit line renders), a style's trip list, and Ready-made trips. `npm test` 25 failures, all in the sparse baseline, none new; lint 0 errors; design-lint 0 new.
