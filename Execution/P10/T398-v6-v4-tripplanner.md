# T398: visual and dynamic: Trip planner (design wave V4)

## Task ID

T398 (design wave V4, session 8 of 10; surface key 'tripplanner'; no mind-map prompt).

## Date

2026-10-08

## What changed

The trip planner now shows a choice one way and spends its accent on one thing per view. Every selected card on the surface (the Booked answers, the match cards, the country grid, the picked trip, the stops in the editor and the itinerary) has a 2 px ink border and an ink tick, and every selected chip or segment (the quiz answers, the trip lengths, the leg modes, the dates mode, the city pills, Overview and Day by day) is ink fill with white text. On a Pixel 5 the walk counted `--accent-bg` on 7 elements across the steps before (the Booked card, the Trips country chip and length chip, the Getting there mode, two stop numbers and the day Plan button on the planned view) and on 0 after; the only accent fills left are each view's one primary and the two numbered pins of the live route. The country picker map draws picked countries in ink and recommendations as a dashed ink line; the city map's picked pills and the fly-in pin are ink.

Text no longer sits on a photograph. The match card's country name, the country grid's name, shortlist count and tick, the trip card's length, star and tick, the country brief's name and the day view's head all moved into a paper band under the picture, and the scrims behind them were deleted. On a phone the match card and trip card photographs are 3:1, so two trip cards now show in the first screen of a Pixel 5 (one before) and the photo is 37 percent of a trip card at 390 px (row T398-f says why it is not yet a third). The match card's reasons became a run of labelled values ("1,276" in mono over "rated trails"), formatted through `Intl.NumberFormat`, with no bullet.

The receipt is set as carta-design's receipt. Its head is a `--paper-dim` band with the label in `--ui`, the party in mono, the sum in mono to the cent and the figure a person beside it (Fraunces carried both before, row T388-j). Opened, it has the shared cost bar over hairline lines with their figures in 15 px mono, the 2 px ink rule over the sum, and an `--accent-bg` footer with one counterfactual read from the receipt's own lines ("One more night in Rome (Fiumicino): +€158.07"). Every figure on the surface's receipts and running estimate is now to the cent (€1,247.65 on Getting there, Finish and the receipt, where V3 showed €1,248), as carta-design asks of a receipt line.

Figures update in place. The running estimate and the receipt's total and per person figure dip once through the shared `useSettledFigure()` when an input changes them, the delta stands beside the figure in mono for three seconds (ink when up, green when down), and the remount trick, the 0.55 s bump and the 1.1 s sweep with its gradient are gone. Raising the travellers on the receipt from 2 to 3 changed €1,247.65 to €1,896.82 with the figure's right edge fixed at the same x on all four devices. The planned trip's route draws itself once, leg by leg, through an opt-in `revealRoute` prop on TripMap: at most `--dur-4` a leg and 900 ms in all, once per mount, the whole line at once under reduced motion; the day planner and the trip page, which also mount TripMap, are unchanged. Press feedback (scale 0.97 in `--dur-1`) is on every choice card and chip, with a reduced-motion branch.

Day by day no longer runs a pill per day off the right edge of a phone. The planned view has two tabs, Overview and Day by day, and a day switcher ("Day 2 of 7", the date in mono) between Previous and Next at `--tap`, which also answers the arrow keys; every day stays reachable from Your days. Each leg on the planned route says what its figure buys, in words under the mono facts: "train fare ~€21.96 a person", "fuel and tolls for the car". The wizard's head is one line on a phone (the step name beside "Step x of 7", the bar under both), so the fixed chrome fell from 147 to 126 px on the first steps and from 193 to 172 px from Trips on (row T388-i).

How it was decided, unattended (owner instruction 2026-10-07, impeccable's AUTONOMY_DIRECTIVE_CHECK proceed case): impeccable context ran once from the root worktree with `--target src/planner/TripPlannerTab.jsx`; the critique of the V3 result and the plan are `docs/design-v6/plans/V4-tripplanner.md`, committed before the first app edit. Refinement preserves: palette, faces and the incumbent wizard, map and receipt stayed. Four calls were mine. The day track of brief V4-7 became the house day switcher, because the shared DayTrack cannot report the shown day back (no `onSelect`) and the planner's day view drives the map. Money is to the cent everywhere on this surface, which makes the running estimate a little wider; on a 360 px phone the figure a person wraps under the party's figure. The trip card shows its length once, in the caption, so the length chips are bare numbers with "8 days" as their accessible name. The planning maps' picks are ink rather than accent, reading carta-design's "a picked place carries an ink tick, and only the live route and its numbered stop pins are accent".

## Files touched

Root repo (branch p10-v6-visual-tripplanner):

**Created:**
- docs/design-v6/plans/V4-tripplanner.md
- Execution/P10/T398-v6-v4-tripplanner.md

**Modified:**
- Execution/_OPEN.md (rows T398-a to T398-f; T388-g, T388-i and T388-j closed by T398)

App repo continent-app (branch p10-v6-visual-tripplanner), every src file owned by 'tripplanner' in docs/design-v6/OWNERSHIP.md:

**Modified:**
- src/planner/GuidedTripWizard.jsx (the estimate settles in place, delta in words, figures to the cent, the country grid's caption band)
- src/planner/TripItinerary.jsx (the receipt head, cost bar and counterfactual footer, the day switcher, the leg inclusion phrase, the day view's caption band, figures to the cent)
- src/planner/TripPlannerTab.jsx (revealRoute on the planned map)
- src/planner/CountryMatchCards.jsx (caption band, labelled values)
- src/planner/ReadyTripsStep.jsx (caption band, bare length chips)
- src/planner/CountryBrief.jsx (the hero's scrim removed)
- src/map/TripMap.jsx (the one-time route reveal, sliceLines)
- src/map/CountryPickerMap.jsx (picks in ink)
- src/styles/67-v6-tripplanner.css (every new rule and the overrides of rules in files this surface does not own)
- src/styles/11-trip-planner.css, 12-guided-trip.css, 19-guide-ratings.css, 26-shortlist-extras.css (selection, count chip, receipt, tabs and estimate rules changed in place; the scrim, bump, sweep, hover-lift, dead per-city hero and old caption rules deleted)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (6 keys under the planner's `trip.` prefix: dayByDay, inclTrain, inclBus, inclFerry, inclCar, oneMoreNight)
- scripts/verify_planner_v2.mjs, verify_planner_v2_flow.mjs, verify_planner_t8.mjs, verify_where_quiz.mjs, verify_when_step.mjs, verify_ready_trips.mjs, verify_country_brief.mjs (assertions updated with a comment, none deleted)

No new file under src/, so OWNERSHIP.md needed no row; `node scripts/check_ownership.mjs <root>/docs/design-v6/OWNERSHIP.md` prints OK. Nothing was edited in 17, 18, 20 or 24.

## Commands run

In the app worktree: `node node_modules/vite/bin/vite.js build` (five builds, dist/ and dist-data/ deleted at the end), `node node_modules/vite/bin/vite.js preview --port 5208 --strictPort --host 127.0.0.1`, the scratch walk `wt/_scratch/T398/walk.mjs` (iPhone 13 WebKit, Pixel 5 and 360 x 740 Chromium, 1280 x 800), the scratch runner `wt/_scratch/T398/run-harness.sh` for the seven harnesses on port 5208, `node scripts/verify_booked_route.mjs`, `node scripts/verify_handoffs.mjs`, `node scripts/shoot-planners.mjs --url=http://127.0.0.1:5208/ --only=trip`, `node scripts/verify_keyboard.mjs --port 5208`, `node scripts/verify_quality_floor.mjs final --port=5208 --out=<scratch> --only=trip`, `npx eslint src`, `npm test`, `node scripts/ci/design-lint.mjs` (and with `--root` on an export of the base src for the before figure), the six-catalogue parse of session rule 8, `node scripts/check_ownership.mjs`, and `sh .claude/skills/impeccable/scripts/impeccable detect --json <the 13 changed src files>`. The harness screenshots that land in `shots/` and `scripts/shots/` and the keyboard audit folder were moved to `wt/_scratch/T398/`. Every preview, harness server and browser was stopped.

## Config and secrets set

None.

## Before/after measurements

Sources: the scratch walk on the built app, before at app master e2d9e1e (`wt/_scratch/T398/before/`, Pixel 5 and desktop) and after on the final build (`wt/_scratch/T398/walk-final.txt`, all four devices); the design lint run on an export of the base src against the current tree; the harness logs in `wt/_scratch/T398/h-final/`.

| Metric | Before | After | Delta |
|---|---|---|---|
| `--accent-bg` elements in view across the wizard and planned view (Pixel 5) | 7 | 0 | -7 |
| Accent fills that are not the view's primary or the live route's pins (Pixel 5) | 2 (Booked tick, chosen trip tick) | 0 | -2 |
| Text on a photograph (match card, grid card, trip card, brief hero, day hero) | 5 kinds | 0 | -5 |
| Gradients in the surface's stylesheets (not counting the two solid rule lines in 19) | 5 | 0 | -5 |
| Fixed wizard chrome on a phone, first steps / from Trips (Pixel 5) | 147 / 193 px | 126 / 172 px | -21 px |
| Wizard head on a phone | 86 px | 65 px | -21 px |
| Trip cards in the first screen (Pixel 5) | 1 | 2 | +1 |
| First match card after the last quiz answer (Pixel 5) | 352 px | 341 px | -11 px |
| One trip's total, Getting there / Finish / receipt | €1,248 / €1,248 / €1,248 | €1,247.65 on all three | to the cent |
| Same trip with an entered €120 fare (row T388-g) | not walked | €1,367.65 on all three | agree |
| Receipt: Fraunces on a number | 2 (label and sum) | 0 | -2 |
| Receipt parts (cost bar, 2 px rule, counterfactual footer) | rule only, 1 px | all three | +2 |
| Figure motion on a reprice | remount, 0.55 s bump, 1.1 s sweep | one opacity dip, delta in words 3 s | sweep and bump gone |
| Day pills on a 7-day trip (overflowing at 390 px) | 8 buttons | 2 tabs, Previous and Next | -4 controls, no overflow |
| Priced leg lines saying what the figure buys | 0 | every one in the walk | all |
| Planned sheet scroll height (iPhone 13) | 1,127 px | 1,159 px | +32 px (the per person line and the tab bar) |
| Design lint entries in the surface's 13 files | 61 | 51 | -10 |
| Design lint, whole src | 0 new | 180 found, 0 new | 0 new |
| impeccable detect on the 13 changed src files | 2 | 2 (the day planner's two side stripes, row T388-e) | 0 |
| npm run lint | 0 errors | 0 errors, 62 warnings | 0 |
| npm test | 367 | 367 pass | 0 |

Harnesses on the final build:

| Harness | Result |
|---|---|
| verify_planner_v2 | 43 of 43 |
| verify_planner_v2_flow | 47 of 47 |
| verify_planner_t8 | 41 of 41 |
| verify_where_quiz | 28 of 28 |
| verify_when_step | 13 of 13 |
| verify_ready_trips | 90 of 90 |
| verify_country_brief | 68 of 68 |
| verify_booked_route | OK at laptop and phone |
| verify_handoffs | 1 failed, the day planner's Back to trip (row T388-h, unchanged) |
| shoot-planners --only=trip | 22 screens, 0 offenders |
| verify_keyboard | 20 of 20 |
| verify_quality_floor --only=trip | 22 views: one h1, no skipped level, no second primary, no small target on the phone, no gradient |

The phone checks the wave asks for, on the final build: no horizontal scroll on any step or the planned view at 390, 393, 360 and 1280 px; landscape (844 x 390, 851 x 393) keeps the planned footer on screen with no sideways scroll; with the viewport 40 percent shorter and the origin field focused, the field and its Search button stay visible and the bottom nav stays below them (field bottom 264 of 398 px on the iPhone 13, 289 of 436 on the Pixel 5, 297 of 444 at 360 x 740); every new hover rule sits in `@media (hover: hover)` and nothing new depends on hover or a swipe (the day switcher's arrow keys are a shortcut for its two buttons); the new controls are 44 px on a coarse pointer (the day switcher's buttons measured 44 px on the three phones, 32 px under a fine pointer); the planned footer and the wizard footer keep their primary in the lower half within thumb reach. The safe areas and `100dvh` were not touched by this wave; the three `100vh` heights in 19 and the one in 26 stay for V5 as DIRECTION part 7 says.

Screenshots: ten V4 viewport JPEGs in `design-v6-shots/tripplanner/` (where, trips and planned on the iPhone 13 and the desktop; booked, receipt and day on the Pixel 5; getting at 360 x 740), outside both repos.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Six harnesses stopped at their first click on the desktop pass | shell V3 made the header tabs links (rule "Navigation"); the harnesses looked for a button named Trip planner and fell back to the phone's plus, which is hidden on desktop | the locator is `a, button`, with a comment, in all seven |
| verify_ready_trips "the media box is 16/7" at 375 px | the phone photograph is 3:1 now (rule "Caption band") | the expected ratio depends on the width, with a comment |
| verify_country_brief "the info button is bottom-right" | the caption band took the bottom of the card, so the round info button moved to the photograph's top-right corner | the check asks for top-right, with a comment |
| The running estimate pushed "a person" and Details off a 360 px band | figures to the cent are wider | on a phone the figure a person wraps under the party's figure |
| The leg inclusion phrase counted as prose in mono | it was joined into the mono fact line | it is its own line in `--ui` under the facts |
| A `sed -i` turned TripMap.jsx to LF and a heredoc wrote a NUL into CountryMatchCards.jsx | Git Bash rewrites line endings; the shell ate an escape | both restored before the first commit; later edits used a replacer that keeps CRLF |
| verify_booked_route and verify_handoffs left four `vite preview` processes running | they spawn through a shell and kill only the shell on Windows | stopped by hand; row T398-e |

## What is still open

Each item is also a row in Execution/_OPEN.md.

T398-a (owner): what only a real phone can prove after V4: the route reveal's smoothness on a phone GPU, the 0.97 press scale and the figure's opacity dip under a real finger, the day switcher's buttons in the thumb zone of a tall phone, and the estimate band's wrap with iOS Safari's own font rendering at 360 px. WebKit on Windows passed all four as far as it can.

T398-b (owner): native review of the 6 new strings in de, es, fr, it and nl (trip.dayByDay, trip.inclTrain, trip.inclBus, trip.inclFerry, trip.inclCar, trip.oneMoreNight).

T398-c (next task, V5 T408 or V6): brief V4-10, the shared element into the planned view, is not built. The planned top card has no photograph for the trip card's photograph to land on, and the direction allows a non-image shared element only when both sides show the same figures; the trip card shows beds and days, the receipt the whole trip with legs. A same-figure pair (the Finish card's total and the receipt's head) would need the two to be the same component.

T398-d (next task, V5 T408): what V4 saw and left to polish: 999 px pills on the match card's Add and What's there, the CountryPickerMap card's buttons at 36 px with 999 px radii, the "×" glyph on the Trips country chip, the trip length chips as 999 px circles, the receipt's travellers stepper at 24 px, and dead rules in 19 (`.guide-path*`, `.guide-mode-card*`, `.guide-country-suggest*`) that no component renders.

T398-e (next task, harness owner): verify_booked_route.mjs and verify_handoffs.mjs spawn `npx vite preview` with `shell: true` and kill only the shell, so on Windows the preview keeps running on 4191 and 4211 after the harness exits; kill the process tree (or spawn node directly) so a wave session does not leak two servers per run.

T398-f (next task, V5 T408): at 390 px the trip card's photograph is 37 percent of the card, above the third rule N5 sets, because the caption band holds the length, the route, the cost line, the length chips and two buttons; V5 decides between a shorter photograph and a denser caption (the length chips and the length line say the same thing).

Rows this task leaves open on purpose: T388-c (moving the wizard rules out of 24, 17, 18 and 20): the wave gate allows changed app paths only in files OWNERSHIP gives to 'tripplanner', and the move deletes lines from those files, so V4 overrode from 67 again; the V6 consistency pass may touch every file. T388-d (the Lifestyle opener beside the receipt's travellers) waits on shell. T388-e (the two detector findings) is the day planner's. T382-g (verify_trip_landing and verify_receipt) is not in this surface's harness list and was not claimed.

## Carta-design's seven questions

1. Any hex value outside the `:root` of styles.css? No. Every new rule reads tokens; the map colours come from `token()`.
2. Any gradient, any colour not in DESIGN.md, a second saturated hue? No. Five gradients were deleted (the match card scrim, the grid card scrim, the estimate sweep, the dead per-city hero, the day hero) and the brief's scrim element is no longer rendered; none was added.
3. Ochre only for ratings, teal only for gems, `--danger` only for destruction? Yes. The trip star keeps `--rate` as before; nothing new uses ochre, teal or `--danger`.
4. Mono prose or sans column numbers? The leg's inclusion phrase is `--ui` under the mono facts; the match card's counts and the receipt's figures are mono. The quality floor still finds the stop date lines ("Sun, Oct 11 → Wed, Oct 14, 3 nights") in mono, which this wave did not touch.
5. More than one primary in a view? No. The day view's "Plan this day in the Day planner" and the per-day Plan buttons became secondaries; the quality floor counted no second primary on any of the 22 trip views.
6. Headlines with a verb or a number, no em dashes or banned words? No new heading. The diff carries no em dash, en dash or middot and none of the banned words in the six catalogues.
7. Remove one thing: the estimate band's sweep, a gradient that moved across the band on every answer and said nothing the figure did not.

## Rollback procedure

App: after the merge, `git -C continent-app revert --no-edit <merge commit>`, or before it reset the branch to e2d9e1e; the commits are ec2ca69, 7022dad, f28262b, 8608bde, 6c96d41, fb1cd4e and 100dd63. Root: revert the report commit and the plan commit 0913f0d73. Nothing is stored differently: no draft field, no migration, no data, no secrets, so a revert is a code change only.
