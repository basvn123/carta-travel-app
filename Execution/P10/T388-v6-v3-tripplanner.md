# T388: structure, information and flow: Trip planner (design wave V3)

## Task ID

T388 (design wave V3, session 8 of 10; surface key 'tripplanner'; no mind-map prompt).

## Date

2026-10-08

## What changed

The trip planner now shows money from the first place the traveller looks at, and shows the same figure on every screen. One trip walked on the built app (Italy, Naples and Rome, 8 days, 2 travellers) reads ~€1,248 est. on Getting there, €1,248 on Finish and €1,248 in the planned receipt; the V1 walk read €586 on the wizard and €771 one screen later for one Albania trip. The wizard and the planned view now price a stop through one function (`stopStayCost` in `src/lib/trip_planner_pricing.js`) and pick a leg's mode by one rule (`pickLegMode`), and the wizard hands its daily lifestyle to the planner, which used to price the days at the app default. Every country card (the six match cards and all 43 grid cards in the walk) carries "From €N a day a person" from the same cost index Explore reads (`computeCosts` in `src/lib/costIndex.js`), the country brief's Budget row is now the range of its towns' day cost instead of a word, and every ready-made trip card carries "~€N est. for 2 people, beds and days", priced stop by stop with the receipt's own function, so picking it changes nothing but the legs.

The flow was put in the traveller's order. The party is asked on From, with the origin, through the shared Stepper, so every estimate prices the real party; Finish states it with a Change button. The five answered quiz questions fold into one line with one Edit, so the first match card starts at 341 px on a Pixel 5 after the last answer. Getting there builds its legs from the stops on every path; before, the build-your-own and booked-beds paths said "No trip chosen yet". When a picked trip is shorter than the window, the footer says "6 of 7 nights planned. One night is free." in words, and the old footer line lost its middots. The draft now keeps the answers that decide the step list (booked, nights, order, the travel answers, the arrival, the pace, the stay style), so a reload lands on the same named step with the same answers. A leg's mode that Carta guessed is marked as a guess and is no longer stored or recapped as the traveller's answer.

Things that misled or did nothing were removed or merged. The planned view's close cross called `clearPlan()` and emptied an unsaved trip with one tap; without the clear, its only job would have been Edit stops, so it is gone (merge duplicate controls) and Start over, with its confirm, is the one way to clear a trip. The phone launcher card that opened a new wizard over a trip that already had stops is gone, and so is the guide call to action that could never render, with its gradient. The planned view leads with its receipt (the total's top is 194 px into the sheet on a phone, 145 px on a laptop), the bookings, notes, packing and spend book are one fold, and "Know before you go" and "Travel cheaper" are one country facts fold; the sheet's scroll height went from 2,546 px to 1,127 px on an iPhone 13. The planned footer is one row: Plan your days (the one primary), Save trip and a More menu holding Edit stops, Replan route and Start over (in `--danger` text, still confirmed). The wizard footer is one row on a phone: Start over moved into the steps sheet, and the recap band scrolls with the step instead of standing as fixed chrome. Strings that were English in every language now go through the catalogues: the tip categories and the fold's labels, TripMap's pin titles, CityPickerMap's "Fly here", the stays line of the estimate, the city list group titles and search placeholder, and the itinerary's weekday and month names through `Intl.DateTimeFormat`.

Brief item 13, the move of the wizard rules out of `24-destination-workspace.css`, `17`, `18` and `20` into `67-v6-tripplanner.css`, was not done in V3; the v6 sheet overrides what V3 needed (rule 5 allows it) and the move is left to V4, which rewrites those rules (row T388-c). Brief item 11, the fare-promise copy, is the owner's (T377-c); one of its three strings, `trip.launcherSub`, is gone with the launcher.

How it was decided, since this run was unattended (owner instruction 2026-10-07, impeccable's AUTONOMY_DIRECTIVE_CHECK proceed case): impeccable context ran once from the root worktree with `--target src/planner/TripPlannerTab.jsx`, shape was run without its interview and its brief is the plan (`docs/design-v6/plans/V3-tripplanner.md`, committed before the first app edit). Every call kept the palette, type and identity ("Refinement preserves"). Three calls were mine: the cross is removed rather than kept as a close-only control (it would duplicate Edit stops, and the grip already lowers the sheet by tap, drag and keyboard); a country card's "from" figure carries the word "national" whenever the cheapest town's bed or food figure is a national stand-in, which is almost every card today (the rule asks for the pedigree word; the InfoDot that should explain it on first use is shell's component and is left to V4); a trip card's figure is beds and days only, said in words, because the legs depend on Getting there answers the card cannot know.

## Files touched

Root repo (branch p10-v6-build-tripplanner):

**Created:**
- docs/design-v6/plans/V3-tripplanner.md
- Execution/P10/T388-v6-v3-tripplanner.md

**Modified:**
- Execution/_OPEN.md (rows T388-a to T388-j; T377-a, T377-e, T377-g and T377-j closed by T388)

App repo continent-app (branch p10-v6-build-tripplanner), all owned by 'tripplanner' in docs/design-v6/OWNERSHIP.md:

**Modified:**
- src/planner/TripPlannerTab.jsx (More menu, cross and launcher and guide CTA removed, one country facts fold)
- src/planner/GuidedTripWizard.jsx (draft restore, Getting there on every path, one pricing path, party on From, cost on cards, footer, recap in the body on a phone, guessed legs, strings)
- src/planner/plannerStore.js (the new draft fields and their defaults)
- src/planner/TripItinerary.jsx (receipt first, admin fold, Intl dates)
- src/planner/CheapTipsSection.jsx (the merged "Know before you go" fold, translated labels)
- src/planner/CountryMatchCards.jsx (DayCostLine)
- src/planner/CountryBrief.jsx (the Budget row as a day cost range)
- src/planner/ReadyTripsStep.jsx (the trip card's beds-and-days line)
- src/planner/WhereQuiz.jsx (the folded answers)
- src/hooks/useTripPlanner.js (stayCosts and the leg mode through the shared functions, the handed-over lifestyle)
- src/lib/trip_planner_pricing.js (stopStayCost, pickLegMode)
- src/map/TripMap.jsx, src/map/CityPickerMap.jsx (translated pin titles)
- src/styles/67-v6-tripplanner.css (every new rule)
- src/styles/11-trip-planner.css (dead launcher, guide CTA, cross and old footer rules deleted; no height or width transition)
- src/styles/19-guide-ratings.css (recap chip font, row T377-j; no max-width or width transition)
- src/styles/26-shortlist-extras.css (the cross's tap rule deleted)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (42 keys added under wizard, ready, match, brief, quiz and the planner's trip keys; ready.footPicked rewritten; 7 keys nothing reads any more removed: trip.launcherSub, trip.closeOverviewAria, trip.closeOverviewTitle, trip.guideCta, trip.guideCtaSub, trip.knowTitle, wizard.estStays)
- scripts/verify_planner_v2.mjs, verify_planner_v2_flow.mjs, verify_planner_t8.mjs, verify_where_quiz.mjs, verify_when_step.mjs, verify_ready_trips.mjs, verify_booked_route.mjs (assertions that encoded the old design updated, each with a comment; none deleted)

**Created:**
- tests/plannerStore.test.mjs (the draft keeps and resets the new fields)
- tests/tripPricing.test.mjs (stopStayCost and pickLegMode, the shared pricing)

No new src file, so OWNERSHIP.md needed no row; `node scripts/check_ownership.mjs <root>/docs/design-v6/OWNERSHIP.md` prints OK.

## Commands run

In the app worktree: the node_modules junction repointed to `wt/_scratch/T384/nmfull/node_modules` (read only) and back at the end. `npm run build` on the merged base, then `npx vite preview --port 5208 --strictPort --host 127.0.0.1` and the ten harnesses (scratch runner `wt/_scratch/T388/run-harness.sh`); after the changes the same on three later builds. `npx eslint src`, `npm test`, `node scripts/ci/design-lint.mjs`, `node scripts/ci/design-lint.mjs --root <base src export> --baseline scripts/ci/design-lint.baseline.json` for the before figure, the six-catalogue parse of session rule 8, `node scripts/check_ownership.mjs`, `sh .claude/skills/impeccable/scripts/impeccable detect --json <changed files>` (and on the base versions of the same files), `scripts/verify_keyboard.mjs --port 5208`, `scripts/verify_quality_floor.mjs after --port=5208 --out=<scratch>`, and the scratch walk `wt/_scratch/T388/walk.mjs` (iPhone 13 WebKit, Pixel 5 and 360 x 740 Chromium, 1280 x 800). dist/ and dist-data/ deleted after every build; every preview stopped.

## Config and secrets set

None.

## Before/after measurements

Sources: the V1 brief and walk (`docs/design-v6/briefs/tripplanner.md`, figures at 380 px), the scratch walk output `wt/_scratch/T388/walk-*.json` (after), the harness logs in `wt/_scratch/T388/h-before/` and `h-final/`, `detect-before.json` and `detect-after2.json` in the same folder.

| Metric | Before | After | Delta |
|---|---|---|---|
| Wizard total against planned total, one trip | €586 against €771 (V1, Albania) | €1,248 and €1,248 (Italy, all four devices) | one figure |
| Country cards with a day cost (match / grid) | 0 / 0 | 6 of 6 / 43 of 43 | +49 |
| Trip cards with a figure | 0 | every card in the walk | all |
| Accent-filled buttons on trip cards in view | 12 (V1 walk) | 0 | -12 |
| First euro figure in the flow | step 6 of 7 | step 4 (Where, on every country card) | 2 steps earlier |
| Planned sheet scroll height, phone | 2,546 px | 1,127 px (iPhone 13), 1,162 px (360 px) | -1,419 px |
| Planned total's top inside the sheet | under the route | 194 px (phones), 145 px (desktop) | first under the top card |
| Planned footer | 4 to 5 stacked buttons | 1 row: 2 buttons and More | one row |
| Wizard footer rows on a phone | 2 on Trips | 1 on every step, every device | one row |
| Fixed wizard chrome on a phone, worst step (head + total + recap + footer) | about 420 px of 800 incl. the bottom nav (V1) | 193 px (head 86, total 46, footer 61; the recap scrolls) | about -230 px |
| First match card after the last quiz answer | under five answered rows | 341 px (Pixel 5), 367 px (360 x 740), 184 px (iPhone 13) | in the first screen |
| Controls removed or merged | | cross, launcher card and its button, guide call to action; Edit stops, Replan, Start over into More | 3 removed, 3 merged |
| English-only strings on the surface (CheapTipsSection 11, TripMap 6, CityPickerMap 1, wizard 8, itinerary month and weekday names 2) | 28 | 0 (the tip texts themselves excepted, row T377-f) | -28 |
| impeccable detect on the 17 changed files | 6 (4 layout transitions, 2 side stripes) | 2 (the two side stripes, day planner rules, row T388-e) | -4 |
| Design lint, whole src | 213 found, 0 new | 205 found, 0 new | -8 |
| npm run lint | 0 errors | 0 errors, 70 warnings (as on the base) | 0 |
| npm test | 341 tests | 350 pass (9 new) | +9 |
| Draft fields a reload restores | step, countries, dates, quiz, trip pick | plus booked, nights, order, travel answers, arrival, pace, stay style | +7 |

Harnesses, before (merged base 61449ab, built) and after (final build):

| Harness | Before | After |
|---|---|---|
| verify_planner_v2 | stopped at Where on `.guide-ccard-n` (gone since T362) | 43 of 43 |
| verify_planner_v2_flow | 19 of 21, desktop pass stopped on `.wmode-btn` | 47 of 47 |
| verify_planner_t8 | 41 of 41 | 41 of 41 |
| verify_where_quiz | 27 of 27 | 28 of 28 |
| verify_when_step | stopped on the calendar (looked for it on step one) | 13 of 13 |
| verify_ready_trips | 88 of 88 | 90 of 90 |
| verify_country_brief | 68 of 68 | 68 of 68 |
| verify_booked_route | failed (two toggles, three steps, calendar on step one) | OK at laptop and phone, legs on the booked-beds path |
| verify_handoffs | 1 failed: day workspace Back to trip | the same 1 (a day planner control, row T388-h) |
| shoot-planners | all 11 trip views ok on mobile; the day page crashed | the same; the run stops on the day page (memory) |
| verify_keyboard | not run | 20 of 20 |
| verify_quality_floor | not run | all 22 trip views: one h1, no skips, no second primary, no small targets on mobile; the run stops on the day planner (memory) |

The phone checks the wave asks for, on the built app: no horizontal scroll on any step at 390, 393, 360 and 1280 px; landscape (844 x 390 and 851 x 393) keeps the planned footer on screen with no sideways scroll; nothing depends on hover (the new hover rules sit in `@media (hover: hover)`); with the viewport 40 percent shorter and the origin field focused, the field and its Search button stay visible (field bottom 264 px of 398 on the iPhone 13, 289 of 436 on the Pixel 5) and the bottom nav stays below them; the planned footer and the wizard footer keep their primary in the lower half within thumb reach; every new control is 44 px on a coarse pointer (the walk's small-target scan of the party card found none on the three phones; the party steppers are the shared Stepper's 44 px buttons). The safe area under the home bar is read by the modal wizard's footer as before; the inline wizard sits above the bottom nav, which carries the inset. Three `100vh` heights remain in `19-guide-ratings.css` and one in `26-shortlist-extras.css`; DIRECTION part 7 gives their replacement to V5.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The planned footer's Save trip squeezed its label at 390 px | Save trip was allowed to shrink in the one-row footer | Save trip keeps its width, Plan your days ellipsises if it must |
| verify_planner_v2 failed "store: transit stays empty" once Getting there worked on the build-your-own path | the step writes Carta's guessed mode into the same answers, and the draft stored it as the traveller's own (`enteredByTraveller: true`) | a guessed mode is marked `guessed` and the draft and the recap skip it; anything the traveller sets clears the mark |
| verify_ready_trips "gone, the price per day" | the new beds-and-days line reused the class T5 retired with a per-day price | the line has its own class, `wtrip-total`; the old check still proves the per-day price is gone |
| Country grid cards could not hold a cost line | the card was a fixed 4:3 box with the photo button absolutely filling it | the card is a column in the v6 sheet, the photo keeps 4:3, the figure sits in a paper band under it |
| A first `sed -i` turned GuidedTripWizard.jsx to LF line endings | Git Bash sed rewrites line endings | restored to CRLF before the first commit; later edits went through a small Python replacer that keeps them |

## What is still open

Each item is also a row in Execution/_OPEN.md.

T388-a (owner): what only a real phone can prove on this surface: the real keyboard's height against the From step's field and its Search button, iOS Safari's bar collapse under the wizard footer in landscape, the sheet grip's drag and its momentum, and the More menu's tap target in the thumb zone. WebKit on Windows passed all four as far as it can.

T388-b (owner): native review of the 42 new strings in de, es, fr, it and nl (written by this session).

T388-c (next task, V4 T398): move the wizard rules out of `24-destination-workspace.css`, `17-saved-trips.css`, `18-detail-panel.css` and `20-day-planner-flow.css` into `67-v6-tripplanner.css` under OWNERSHIP rule 5. Not moved in V3 because V4 rewrites the same rules (selected state, caption bands, the receipt), and moving roughly 1,300 lines twice risks the cascade for nothing; V3 overrides from the v6 sheet in the meantime.

T388-d (next task, shell T391): pass the Lifestyle opener into TripPlannerTab from App.jsx (an `onOpenLifestyle` prop, beside the `lifestyle` and `stayTier` it already passes) so the planned receipt can place the shared LifestyleButton beside its travellers stepper, as OWNERSHIP's hand-off asks; the private steppers on From are already the shared Stepper.

T388-e (next task, dayplanner T389 or T399): the detector's two remaining findings are day planner rules in tripplanner-owned sheets, `.daytrip-reco`'s 3 px accent stripe in `11-trip-planner.css` and `.day-tier-must`'s 3 px border in `19-guide-ratings.css`; the day planner moves them into `68-v6-dayplanner.css` under rule 5 and drops the stripes.

T388-f (next task, V6 consistency pass): shrink `scripts/ci/design-lint.baseline.json` with `--update-baseline` after the V3 merges (this branch finds 205 against 213) so the fixed entries cannot return unnoticed; not done here because every V3 session changes the same counts.

T388-g (next task, V4 T398): the wizard and the receipt agree for beds, days and Carta's legs; one input was not walked: when the traveller enters their own fare, the planner adds the airport transfers at both ends (`flightTransfer`, T278) and the wizard's running estimate does not. Walk a trip with an entered fare and add the transfer line to the estimate if the totals differ.

T388-h (next task, dayplanner): verify_handoffs fails "day workspace: offers Back to trip for a trip-born day" (`.day-topcard-trip`) before and after this task; it is the day planner's control.

T388-i (next task, V4 T398): the fixed wizard chrome on a phone is 193 px, inside the 200 px of 800 that rule N7 sets but 29 percent of the iPhone 13's 664 px viewport; the step name line in the head (86 px) is the next thing to fold into the "Step x of 7" line.

T388-j (next task, V4 T398, brief V4 item 3): the planned receipt's total and its "Estimated total" label are set in Fraunces (`.itin-overview-total`), against the rule that Fraunces never carries a number; the receipt's typesetting is V4's.

Rows this task leaves open on purpose: T377-c (owner: the two remaining fare-promise strings, `wizard.flexNote` and `wizard.flexPadBtn`; the third, `trip.launcherSub`, is deleted with the launcher), T377-d and T377-f (owner).

## Carta-design's seven questions

1. Any hex value outside the `:root` of styles.css? No; every new rule reads tokens.
2. Any gradient, any colour not in DESIGN.md, a second saturated hue? No; one gradient was deleted (the guide call to action) and none added.
3. Ochre only for ratings, teal only for gems, `--danger` only for destruction? Yes; `--danger` is used once, for Start over in the More menu and the steps sheet, which clears the trip.
4. Mono prose or sans column numbers? No new case: the cost lines set only the figure in mono and the words in `--ui`, and "Add children" moved from mono to `--ui`. The planned receipt's total in Fraunces is pre-existing and is row T388-j.
5. More than one primary in a view? No; the trip cards' twelve accent Choose buttons became secondaries, and the planned footer has Plan your days as its one primary (Save trip becomes primary only when there is no day planner door). The quality floor counted no second primary on any trip view.
6. Headlines with a verb or a number, no em dashes or banned words? The new headings are "Who is going", "Know before you go", "Bookings, notes and packing", "Travel cheaper"; the diff carries no em dash, en dash, middot (one middot pair removed with `ready.footPicked`) and no banned word in any of the six catalogues.
7. Remove one thing: the close cross on the planned view, which did harm, and the launcher card, which did nothing a trip with stops needed.

## Rollback procedure

App: `git -C continent-app revert --no-edit 73274af 1facda3 f39c9d8 5952951 f8bb4bb` after the merge (or reset the branch to 61449ab before it). Root: revert the report commit and the plan commit 2553e0b8e. The draft store change is additive: a draft written by this build carries extra fields an older build ignores, and an older draft loads here with the defaults, so no data migration is involved either way. No migration, no data, no secrets.
