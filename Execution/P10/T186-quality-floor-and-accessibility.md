# T186: G4 + 5.7: The quality floor, and respect the design system

## Task ID

T186 (mind-map number T190). Branch p10-g4-quality-floor in both repos. App commit 5d6fd7e on top of master 49abb75; the root commit carries this report and the register rows.

## Date

2026-10-06

## What changed

Every screen the quality-floor audit reaches now passes the floor that carta-design, spec 5.7 and G4 set, except for two things only the owner can decide: the colour of three token pairs, and whether a desktop mouse target may be smaller than 44 px. The audit that proves it is in the repo as continent-app/scripts/verify_quality_floor.mjs and exits 1 when a floor check fails, so the floor can be checked by anyone with a built preview.

T193 had already measured and fixed Explore and both planners. This task took its audit, brought it into the repo (T193-d, T166-g) and widened it in two directions. In reach, it now also opens the Destinations tab (the list and the trails category), a journey page, an itinerary page, the destination page, a region page, the five detail pages (trail, cycling route, beach, lake, mountain), My trips, the account hub and the terms of service: 102 screens at 380 and 1280 px, up from 46. In what it checks, it adds five things the floor names and T193 did not measure: motion with prefers-reduced-motion emulated, fake controls (a pointer cursor nothing can focus, an a without href, a button role on a div), the serif outside its display role, gradients, and --ink-mute outside the 12 to 14 px it is allowed at. It also reports bare figures set in the sans without tabular figures. Contrast failures are tagged [token] when they are one of the three pairs the owner decides (T193-b) and [usage] otherwise, and the header and bottom nav are no longer left out of the text checks, because that is where the worst one was.

The fixes, by floor item.

Reduced motion. 48 rules wrote their own reduced-motion branch and the rest never did, so with the preference set the audit still found 629 running transitions and animations. styles/02-base.css now carries one motion floor for the whole app: under prefers-reduced-motion: reduce every animation and transition runs for 0.01 ms, once, with no delay, and smooth scrolling becomes a jump. The duration is 0.01 ms rather than none on purpose: an entrance keyframe that ends on its visible state (the route drawn in the bot's building stage, a sheet with fill-mode forwards) lands on that end state at once instead of staying on its first frame, and an infinite pulse plays once and stops. Scripted smooth scrolls bypass CSS, so ten call sites now ask lib/motion.js for the behaviour; MapLibre's easeTo and flyTo already jump on their own when the preference is set (checked in maplibre-gl-dev.js, no call passes essential). The 3D flyover and the section hero are not built yet (T180-b); lib/motion.js is the door they must use to become a static oblique (T186-d).

The mono rule. 97 CSS rule blocks set an uppercase mono label. All are now sentence-case --ui at 600, 12 px for labels and 11 px for badges, with --ink-mute moved to --ink-soft where the label is a group heading rather than metadata; the one that is a measured fact (the itinerary's day date) keeps mono and loses the capitals. The bottom nav and the header nav were uppercase mono too, and the phone's bottom nav labels were --accent-soft, which is 2.52:1 on the paper. They are now --ui at 10.5 px in sentence case, --ink-soft when inactive and --accent with the tick when active; this is the one visible chrome change in the task and the owner should look at it (T186-e). Carta-design also says sentence case everywhere, so the 36 remaining uppercase sans rules dropped their capitals and tracking as well. Two fact rows set words in mono (a journey's "per person for the week" note, and the bike a cycling route suits); the words are sans now and the figures stay mono.

One h1, headings in order. The Destinations tab had no heading at all; it carries an sr-only h1 that steps aside (display: none) while a full page with its own h1 is open over it. My trips had no heading either and gets the same. The account hub's overline is its h1 unless a view heading names the page, then that heading is. My trips and the account hub cover the screen, so the tab behind them is now inert while they are open, which also keeps Tab and a screen reader out of a page nobody can see. Fold, the folding section the long pages share, takes an optional level and then puts its toggle inside a heading (the WAI accordion pattern); the journey and itinerary pages pass 2, the destination page passes 3 under its h2 city name, so the h3 and h4 inside fold bodies stop skipping a level.

Real a and real button. The audit finds no fake control on any screen, before or after. The terms, privacy and imprint texts and the sign-in modal were plain divs; they are now role dialog with aria-modal and a label, and use the shared useFocusTrap, so focus goes in, Tab stays in, Escape closes and focus goes back.

Tap targets. On a phone every control the audit reaches is at least 44 px, down from 155 under it. The new rules sit in one block at the end of styles/26-shortlist-extras.css, beside T193's: the Destinations search, country picker and locate button, every map's zoom buttons (the map class adds the specificity MapLibre's late stylesheet needs), the destination page's bar, section nav, score and layer tabs, the region page's close and share, the detail pages' action row, month-strip info button, sources and credit fold, and the destination map's pins, which grow a transparent box instead of growing. Credit links inside a line of type grow a transparent ::before so no letter moves. The audit exempts a link inside a sentence, as WCAG does.

Contrast and colour roles. Every [usage] contrast failure is gone (79 to 0). Indicator colours were set as text: the crowd and water badges, the lake's "You can swim" and the mountain's way up. The word is now --ink and the colour stays in the border and tint. The cheapest band on Explore's ink preview card was the data green at 3.04:1 and is paper at 600. Two pressed toggles in the account hub (the side nav row and the language option) were filled --accent and counted as second primaries; they are --ink-fill, as DESIGN.md says for an active toggle. "Expand all" on the destination page was ochre, which is for ratings only; it is ink.

What the spec asks that this task did not build or changed on purpose. G4 says no warm neutrals and no serif face, and L6 repeats it; both are retired by T198 and the T325 carta-design rewrite (--paper is the house ground, Fraunces is the display face), and carta-design wins, so neither was touched. G4's --signal button is --accent in this codebase and its --flag yellow does not exist as a token: carta-design marks the cheapest pin as the one emphasised pin and gives no yellow, so nothing yellow was added. The serif check found nothing out of role at any size, so card and page names in Fraunces stay as they are.

## Files touched

App repo (continent-app), branch p10-g4-quality-floor, commit 5d6fd7e.

Created:
- scripts/verify_quality_floor.mjs (the audit; T193's flows, widened)
- src/lib/motion.js

Modified:
- src/App.jsx (the tabs inert behind My trips and the account hub)
- src/auth/AccountPanel.jsx, src/auth/SavedTripsPanel.jsx, src/auth/AuthModal.jsx
- src/components/TermsOfService.jsx, PrivacyPolicy.jsx, Imprint.jsx
- src/browse/Fold.jsx, JourneyPage.jsx, JourneyRoute.jsx, TripPage.jsx, DestinationPage.jsx, DestinationsTab.jsx (one sr-only h1), MemberPlaces.jsx
- src/browse/CyclePage.jsx (one className on the bike line; the only edit to the five detail pages or DetailSkeleton.jsx)
- src/planner/CartaChatPlanner.jsx, DayExploreBuilder.jsx, GuidedTripWizard.jsx, RouteBuildingStage.jsx, TravelLegsSection.jsx, TripPlannerTab.jsx (the smooth-scroll calls only)
- src/styles/02-base.css, 10-shell.css to 26-shortlist-extras.css except 01-tokens.css, 03-button.css and 27-states.css; 28-detail-skeleton.css untouched. In 23-places-pages.css, which the detail pages share, the edits are the swim and way-up words and seven uppercase rules made sentence case (the fledger legend, four share and co-planner titles, lpage-month-m, places-sugg-head).

No i18n file changed (the new h1s use nav.places and nav.myTrips, which exist in all six). No token in :root changed, so DESIGN.md is untouched.

Root repo, branch p10-g4-quality-floor:
- Execution/P10/T186-quality-floor-and-accessibility.md (this report)
- Execution/_OPEN.md (rows T186-a to T186-h; T166-g closed by T186)

Deleted: none.

## Commands run

In C:\Users\Gebruiker\Documents\Portfolio\wt\T186-app. wt\vite.t186.mjs wraps vite.config.js with its own cacheDir (wt\vite-cache-t186).

```
node node_modules/vite/bin/vite.js build --config ../vite.t186.mjs          (base, then branch)
node node_modules/vite/bin/vite.js preview --config ../vite.t186.mjs --port 5206 --strictPort --host 127.0.0.1
bash ../T186-run-audit.sh before|after     (the audit in ten chunks, one flow and width each)
node scripts/verify_quality_floor.mjs after/pages-mobile --port=5206 --out=../T186-shots --only=pages --vp=mobile
python ../T186-compare.py before after
bash ../T186-run-harness.sh before|after   (beaches, lakes, mountains, trail_page, cycling, keyboard, bottom_nav)
node scripts/verify_keyboard.mjs --port 5206 --out ../T186-shots/keyboard-final
python ../T186-mono-scan.py .               (static count of uppercase mono rule blocks)
python ../T186-eyebrow-fix.py . ; python ../T186-sentence-case.py .
npx eslint src ; npm test ; node scripts/ci/design-lint.mjs
npm run build ; rm -rf dist dist-data
```

The helper scripts, logs, both audit runs (audit.json, summary.json and a screenshot of every screen at 380 and 1280 px) and the harness logs are in C:\Users\Gebruiker\Documents\Portfolio\wt\T186-shots\ and beside it in wt\, outside the repo. The preview server was stopped at the end.

## Config and secrets set

None.

## Before/after measurements

From T186-shots/before and T186-shots/after, 102 screens in each (the same screens), by T186-compare.py. Before is the base build (master 49abb75) served by vite preview; after is the branch build. Both runs used the same audit script. Two chunks were run a second time: the before run's desktop pages, because the first run's My trips selector looked for the phone label and missed the desktop one ("Saved trips"); and the after run's phone pages, after the credit-link tap box grew from 41 to 44 px.

| Metric | Before | After | Delta |
|---|---|---|---|
| Screens audited (380 and 1280 px) | 102 | 102 | 0 |
| Screens with horizontal scroll | 0 | 0 | 0 |
| Screens without exactly one h1 | 12 | 0 | -12 |
| Skipped heading levels | 12 | 0 | -12 |
| Views with more than one filled primary | 2 | 0 | -2 |
| Targets under 44 px, phone | 155 | 0 | -155 |
| Uppercase mono eyebrows | 114 | 0 | -114 |
| Prose set in mono | 12 | 4 | -8 |
| Fake controls | 0 | 0 | 0 |
| Running motion under reduced motion | 629 | 0 | -629 |
| Serif out of its display role | 0 | 0 | 0 |
| Gradients | 0 | 0 | 0 |
| Text under 4.5:1, usage | 79 | 0 | -79 |
| Text under 4.5:1, the three token pairs | 1,183 | 1,154 | -29 |
| Targets under 44 px, desktop | 982 | 982 | 0 |
| --ink-mute outside 12 to 14 px | 455 | 431 | -24 |
| Bare figures in the sans without tabular-nums | 167 | 167 | 0 |
| Console errors | 0 | 0 | 0 |
| Uppercase mono rule blocks in src/styles (static) | 97 | 0 | -97 |
| text-transform: uppercase in src/styles (static) | 134 | 0 | -134 |

By surface, the floor items went to zero everywhere; the larger moves were on the new surfaces: phone targets 96 to 0 on the pages and 59 to 0 on the detail pages, h1 failures 12 to 0 (all on Destinations and the account hub), motion 235 and 104 to 0. The four "prose in mono" left are the itinerary's date lines ("Mon 05 Oct, Thu 08 Oct, 3 nights"), measured facts the word-count heuristic counts as words, as T193 noted.

Harnesses, against vite preview of the base build and of the branch build:

| Harness | Before | After |
|---|---|---|
| verify_keyboard | 20 of 20 | 20 of 20 (and again on the final build) |
| verify_beaches | 68 of 68 | 68 of 68 |
| verify_lakes | 81 of 81 | 81 of 81 |
| verify_mountains | 83 of 83 | 83 of 83 |
| verify_trail_page | 50 of 50 | 50 of 50 |
| verify_cycling | 70 of 72 | 70 of 72 (the same two wire checks) |
| verify_bottom_nav | 19 checks, 0 failed | 19 checks, 0 failed |

npm run lint: 0 errors, 72 warnings, the same 72 as the base. npm test: 176 pass. design-lint: 196 violations, 196 in the baseline, 0 new. npm run build passes. The final 2 px change to the credit-link tap box came after the layer harness run; the keyboard audit was run again on that final build.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first two before runs were thrown away | The audit was still changing (chrome left out of the text checks, a color(srgb) background read as 0 to 1, the account hub not seen as a layer, inline links counted as targets) | Fixed the script, then ran the before audit once more from scratch, so before and after use the same script |
| My trips never opened at 1280 px in the before run | The desktop header says "Saved trips", the phone's nav says "My trips" | The audit matches either label; the desktop pages chunk was run again on the base build |
| White text on a card photo read as 1.18:1 on paper-dim | The photo is a sibling of the text, not an ancestor, so the ground walk missed it | The audit skips text whose box sits inside an img, picture or canvas within five ancestors |
| Two h1s on the account hub | The overline became an h1 and a guest's home view also shows a "Preferences" heading | The overline is the h1 only when no view heading is shown |
| My trips lost its only h1 | Making the tabs behind it inert hid Explore's h1, which had been standing in for it | An sr-only h1 in the panel |
| A python edit through a bash heredoc dropped a regex backslash | The known heredoc trap | Edits with backslashes went through a script file |
| sed -i rewrote the audit with LF endings | sed on a CRLF file | Rewritten byte-wise with CRLF; later edits kept the endings |
| The session stopped on the account's usage limit mid-run | External | The background audit and harnesses had finished; work continued from the uncommitted tree |

## carta-design pre-ship questions

1. No hex value added; every colour in the diff is a token.
2. No gradient, no new colour, no second saturated hue; the indicator colours on badges and verdict words left the text for borders and tints.
3. Ochre left "Expand all" and now marks ratings only; teal untouched; --danger untouched.
4. Mono now carries figures only: 97 uppercase mono labels and two mono sentences moved to the sans.
5. No view the audit reaches has more than one filled primary; two accent-filled toggles became --ink-fill.
6. No headline was added and no string changed; the diff has no em dashes, middots or banned words.
7. Removed: the uppercase and tracking on 134 rules, which carried nothing the words did not.

## What is still open

Three token pairs still fail 4.5:1 and make up all 1,154 remaining contrast failures: --ink-mute on --paper (3.51:1, 3.21:1 on --paper-dim), --accent as text (3.40:1) and white on --accent (3.67:1, every primary label). Measured alternatives for the owner: --ink-mute at #656b7a gives 4.94:1 on paper, 4.51:1 on paper-dim and 5.33:1 on white. For the accent there are two routes. One darker accent for fill and text, such as #c2412e, gives 4.75:1 as text on paper and 5.14:1 for a white label, but sits 1.17:1 from --danger (#b3372a), so destruction and action would read alike. Or the fill stays and primary labels go --ink (4.87:1 on the current accent), with a separate darker text token for accent-coloured words. A token change is a DESIGN.md decision (T186-a, with T193-b).

982 controls are under 44 px at 1280 px on these screens (side-panel chips, calendar days, the destination page's small actions). The phone is fixed; the desktop waits on the fine-pointer decision in T335-b (T186-b, with T193-c).

T181 and T182 finished on their own branches and change the five detail pages and DetailSkeleton. The detail pages pass the floor on this branch, but the new modules may add controls, headings or mono text; run verify_quality_floor.mjs --only=detail after both merge (T186-c).

The 3D flyover, the section hero and the 3D toggle are not built (T180-b). When they land, reduced motion must turn the flyover into a static oblique; lib/motion.js prefersReducedMotion() is the door (T186-d).

The bottom nav and header nav labels changed look: sentence-case sans instead of uppercase mono, and the phone's inactive tabs are --ink-soft instead of --accent-soft (the "red tabs" of mobile chrome v4), because that colour is 2.52:1 as text. The owner should confirm it (T186-e).

167 bare figures on these screens are set in the sans without tabular figures. Whether each one sits in a column (where the rule asks for mono or tabular-nums) is a per-surface reading the script cannot make, so it is reported, not gated (T186-f). 431 runs of --ink-mute sit outside 12 to 14 px, mostly 10 to 11.5 px metadata in rules this task did not otherwise touch (T186-g).

The audit is not in ci or the launch gate, like verify_keyboard (T190-g); add both to the T204 gate (T186-h). It still cannot reach the states T193-d lists (the bot's result, the day workspace, the edit-stops view, a trip after an imported plan), so T193-d stays open for the seeding; the script itself is in the repo, which closes T166-g. No screen reader was run (T190-f covers the manual EN 301 549 pass).

## Rollback procedure

In continent-app, git revert 5d6fd7e (or drop the branch before merging). In the root repo, revert the report commit, which removes the T186 rows and reopens T166-g. CSS, JSX and one script only; no migration, no data, no wire, no i18n and no token change.
