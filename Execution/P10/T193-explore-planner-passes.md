# T193: Explore tab, Trip Planner and Day Planner passes

## Task ID

T193 (mind-map number T346). Branch p10-explore-planner-passes in both repos.

## Date

2026-10-04

## What changed

The three surfaces the enhancement specs leave out now use the shared component set the rest of the app was moved onto in waves 12 to 14, and they meet the carta-design quality floor on every screen the audit reaches at 380 px. Explore is the Explore tab (grid, rails, map, filter sheet). The Trip Planner is the inline guided wizard, its seven steps and the planned view with its sheet of actions. The Day Planner is the four-step flow (stay, when, ideas, how), the bot's questions and the build-it-myself builder with its tray.

The source the task names, the original mind map's Explore Tab, Trip Planner and Day Planner nodes, is not in the repo (the same gap T187 recorded as T187-d). I worked from the master plan's P10.7 and T346 nodes, the feature list in 1.CARTA.md, Part 4 of the destinations enhancement spec (the InfoDot, plain-language numbers, the banned surface terms, the three questions) and the reports of the tasks that built the shared pieces: T164 (folds with a preview), T166 (one primary action), T185 and T189 (skeletons and error states), T190 (keyboard and focus) and T335 (the shared Button).

How each treatment landed, surface by surface.

One primary action. Every step of both planners and the planned trip view now draw their actions with the shared Button from components/Button.jsx: the wizard footer's Back and Next (and "Let Carta arrange it" on the last step), the day flow's Continue on the stay, when and ideas steps, the builder tray's "Let Carta plan my day" and "Open my day", and the five planned-trip actions. Planning the days is the primary when that door exists and Save trip steps down to the secondary variant beside it; without the door, Save is the primary. The bespoke rules those buttons used to carry (10 and 12 px radii, a rgba glow on hover, 40 px heights, the ink hover trick) are gone; what is left in their stylesheets only places them. The other wizard controls that share the .guide-next and .guide-back classes keep their old look, because those rules are now scoped to :not(.btn). The shared primary gained one rule in styles/03-button.css: a primary that cannot act yet goes flat and neutral (--paper-dim, --rule, --ink-soft) instead of a dimmed terracotta, which is the reasoning the trip wizard already wrote down for its own Next, now carried by the component so both planners get it.

Several things that were filled with the accent and read as second primaries became what DESIGN.md says they are. A pressed toggle is --ink-fill: the picked day in the shared calendar (this closes T166-d; the nights between two picked days now sit on --paper-dim instead of a terracotta tint), the active trip kind tiles on Explore on both widths (Destinations already did this since T166), the pressed filter toggles in the Explore filter sheet, an added card in the builder, an added country in the trip quiz, and the traveller's own answers in the bot's chat. The per-card "Add" in the country list is a row action, so it is the secondary face now and the step's Next stays its one primary. The audit finds no view with more than one filled primary on any screen it reaches, down from six. The two that remain everywhere are chrome and are still the owner's call (T166-a, T166-c).

Skeletons, never spinners or words. Explore's map, while maplibre downloads, used the app's full-screen pulse; it is now a LoadingBlock drawn inside the map's own frame, so the canvas lands without a jump. The day planner's address search for ideas said "Looking…" in grey type; it now shows two list-row skeletons where the hits land.

Errors that say what failed and what to do. The published-trip loaders reject on a dropped connection (lib/publishedJson.js), and two trip planner surfaces had no failure path: the ready-trips list sat on its skeleton forever and the picked trip's detail did the same. Both now show an ErrorBlock with a retry, which closes the planner half of T189-b. Saving a trip printed the service's own e.message; it now says the trip did not save and to check the connection, and the raw error goes to the console. The day planner folded a failed fetch of the saved trips into "you have no trips"; the Continue-a-trip block now says the trips did not load and offers a retry.

The quality floor. Each view now has exactly one h1. On the inline wizard the step question is the h1 (it steps down to h2 when the wizard is a modal, or while a trip's own page with its own h1 is open over it), the day flow's questions are h1s, and the planned trip view, the bot and the builder, whose visible titles are an editable field or a chat header, carry an sr-only h1 with the same words. Section headings moved up a level to close the gaps: Explore's rail titles, the wizard's PlannerSection titles, the ready-trips list title and the country brief's groups (h5 to h3). On a phone every control the audit can see on Explore is at least 44 px: the search field, Filters, Lifestyle, the shortlist star, the sort, the floating list and map switch, the filter chips and toggles, the filter sheet's selects and country rows, the map's zoom buttons, and "See all", which keeps its look and takes a transparent tap box. The planner's route pins take the same transparent ring the day map's pins already had, and the "Edit" pill on the Finish step gets the width as well as the height.

The mono rule. 108 uppercase mono eyebrows on these screens are gone: "Planning around", "Step 4 of 7", "Details", "How long, roughly?", "Continue a trip", "Or pick another date", "Recommended", "Must see", the quiz's answered labels, the Finish step's fact labels, the side panel's "Trip style" and "Refine", and the rest. Each is now a sentence-case label in --ui at 12 px and 600, in --ink-soft rather than --ink-mute, because a group label is not metadata. Phrases that were set in mono moved to --ui: "22 km, about 39 min drive" on builder cards, the estimate's line notes, "2 cities, 6 nights" and "Start over" in the wizard footer, the file-type hint in the import zone. Prices, dates, counts and the running total stay in mono. The running estimate's total was terracotta at weight 700; it is --ink at 600, because a total is a measured fact, not an alert.

Plain-language numbers and the three questions. Most of the work here had already been done on these surfaces, so I measured rather than rewrote. The Explore card states euros a day beside a five-step gauge that says cheap to pricey, the bot states walking budgets as "about 10,000 steps", the trip legs read "93 km, ~1 h 58 min, estimate, ~€6" with the est. flag, and the audit finds no visible block over 60 words on any audited screen, before or after. Read against the three questions (is this for me, can I do it, how do I get there), the Explore card answers the first with the photograph, kind and rating and the second with the euros a day; the third exists only as the "reachable within N hours" filter, which is an owner decision (T193-f). The planners ask their own three questions in order, one per screen. Two copy fixes came out of the reading: middot separators in the quiz's match line, the country brief and the ideas rows became commas, and the quiz's match line is ink instead of terracotta text.

The InfoDot and glossary (T156) are not built: they wait on an owner carta-design rule. Nothing here invents one. The terms on these surfaces that will want a dot when it lands are in T193-a.

## Files touched

App repo (continent-app), branch p10-explore-planner-passes.

Modified:
- src/browse/ExploreTab.jsx, src/browse/ExploreRails.jsx
- src/planner/GuidedTripWizard.jsx, TripPlannerTab.jsx, ReadyTripsStep.jsx, PlannerSection.jsx, CountryBrief.jsx, CountryMatchCards.jsx
- src/planner/DayPlannerTab.jsx, DayIdeasStep.jsx, DayTripCards.jsx, DayExploreBuilder.jsx
- src/styles/03-button.css, 11-trip-planner.css, 12-guided-trip.css, 13-day-planner.css, 15-map-overlays.css, 17-saved-trips.css, 19-guide-ratings.css, 20-day-planner-flow.css, 21-chat-passes.css, 24-destination-workspace.css, 25-feature-pages.css, 26-shortlist-extras.css (only the rules for Explore, the side panel, the filter bar, the calendar and the planners; no destination, trip, journey, trail, cycling, beach, lake, mountain or region page rule was edited)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js: four new keys in all six (state.tripsFailed, state.tripLoadFailed, state.tripSaveFailed, explore.mapLoading); wizard.stepOf now "Step {x} of {n}" in English and added to the five catalogues that lacked it. CRLF and the BOMs kept; all six parse.

Root repo, branch p10-explore-planner-passes:
- Execution/P10/T193-explore-planner-passes.md (this report)
- Execution/_OPEN.md (rows T193-a to T193-g; T166-d marked closed by T193)

Created: none in either repo. Deleted: none. No token in :root changed, so DESIGN.md is untouched.

The audit and its helpers live outside the repo: C:\Users\Gebruiker\Documents\Portfolio\wt\T193-audit.mjs (the flows are copied from scripts/shoot-planners.mjs, with a richer per-screen check), T193-run-audit.sh (runs it in six chunks so no process outlives the session's 30 minute background cap) and T193-compare.py.

## Commands run

```
cd C:\Users\Gebruiker\Documents\Portfolio\wt\T193-app
node node_modules/vite/bin/vite.js --config ../vite.t193.mjs --port 5207 --strictPort --host 127.0.0.1
node ../T193-audit.mjs before                      (on the base, before any edit)
bash ../T193-run-audit.sh after                    (on the branch)
python ../T193-compare.py before after
npm run lint ; npm test ; node scripts/ci/design-lint.mjs
npm run build
node node_modules/vite/bin/vite.js preview --config ../vite.t193.mjs --port 5207 --strictPort --host 127.0.0.1
node scripts/verify_keyboard.mjs --port 5207 --out ../T193-shots/keyboard
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
```

vite.t193.mjs wraps the app's vite.config.js with its own cacheDir (wt/vite-cache-t193), so the shared node_modules cache was not rebuilt. Both servers were stopped at the end and dist/ and dist-data/ deleted. Screenshots of every audited screen at 380 and 1280 px, before and after, are in C:\Users\Gebruiker\Documents\Portfolio\wt\T193-shots\.

How the audit counts. It drives the app headless with Playwright at 380 by 800 (touch, mobile user agent) and at 1280 by 850 through the screens below, and on each one records: horizontal overflow; visible h1 count and skipped heading levels; interactive elements under 44 px on either side (a negative-inset ::before counts as tap box, chrome in the header and bottom nav excluded, and the map's transparent T190 pin layer excluded because it ignores pointers); filled buttons whose background is --accent or its hover fills, outside the chrome; text whose colour against its first opaque background is under 4.5:1 (3:1 for large text, text on photographs skipped); mono text that is uppercase with letters (an eyebrow) or holds three or more words (prose); visible paragraphs or list items over 60 words; and visible text starting with "Loading". Explore: idle grid with rails, a filtered grid, the card preview (desktop), the map, the filter sheet (phone). Trip planner: steps 1 to 7 with the quiz, the country brief, the pick-by-hand tab, the trips step and the planned view (the trip page it opens is T180's and is left out of every figure). Day planner: start, the continue-a-trip sheet, when, ideas, how, the bot at question 3, the builder list, map and tray. The bot's result needs a signed-in account and timed out in both runs, so it is not in either column.

## Config and secrets set

None.

## Before/after measurements

From T193-shots/before/audit.json and T193-shots/after/audit.json, 46 screens in each (the same screens), by T193-compare.py. The before run was against the dev server on the base commit; the after run against the dev server on the branch, with the two trip planner chunks run again against the built preview after the last copy fix.

| Metric | Before | After | Delta |
|---|---|---|---|
| Screens without exactly one h1 | 38 | 0 | -38 |
| Skipped heading levels | 3 | 0 | -3 |
| Views with more than one filled primary | 6 | 0 | -6 |
| Filled accent buttons counted, all screens | 40 | 26 | -14 |
| Targets under 44 px, phone (380) | 101 | 0 | -101 |
| Targets under 44 px, desktop (1280) | 745 | 719 | -26 |
| Uppercase mono eyebrows | 108 | 0 | -108 |
| Prose set in mono | 34 | 4 | -30 |
| Text under 4.5:1 | 702 | 551 | -151 |
| Visible blocks over 60 words | 0 | 0 | 0 |
| Bare "Loading" text | 0 | 0 | 0 |
| Screens with horizontal scroll | 0 | 0 | 0 |
| Console errors | 0 | 0 | 0 |
| Shared Button uses in these surfaces' files | 0 | 13 | +13 |
| LoadingBlock uses | 4 | 6 | +2 |
| ErrorBlock uses | 0 | 5 | +5 |
| Loads that failed into a skeleton forever or into "nothing here" | 3 | 0 | -3 |
| Raw service error text shown to the traveller | 1 | 0 | -1 |
| Middot separators in these files (design-lint) | 4 | 0 | -4 |

The first run's tap check mistook the decorative accent bar on Explore's phone kind tiles (a ::before with positive insets) for a 16 by 4 px tap box; those 15 entries are taken out of the before figure, and the after run uses the corrected check. The four mono "prose" hits left are the itinerary's date lines ("Mon 05 Oct → Thu 08 Oct, 3 nights"), which are measured facts the heuristic counts as words. The shared-component counts are a grep over ExploreTab, ExploreRails, ExploreMap, ExploreFilterRail and src/planner/*.jsx at the base commit and on the branch.

The 551 contrast failures that remain are almost all three token pairs: --ink-mute on --paper (3.51:1), --accent as text on --paper (3.40:1) and white on --accent (3.67:1), which is every primary button label. Those are token decisions (T193-b). The 719 desktop targets under 44 px are mostly the desktop side panel's chips and toggles, the wizard's chips and the calendar, which wait on the fine-pointer decision in T335-b (T193-c).

Keyboard: scripts/verify_keyboard.mjs against the built preview passes 20 of 20 surface checks at 380 and 1280 px, the same as T190 left it: every stop has a visible ring, nothing is covered or pointer-only, and the trip and day planner walks (12 and 10 or 11 stops) pass. npm run lint: 0 errors, 73 warnings, the same 73 as the base commit (compared rule by rule). npm test: 166 pass. design-lint: 196 violations, 196 in the baseline, 0 new (the baseline still lists the four middots this task removed; running it with --update-baseline at merge would shrink it).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Two h1s while a trip's page was open from the Trips step | The wizard's step question became an h1 and the trip page, mounted over the wizard, has its own | The step title steps down to h2 while tripPageId is set |
| h1 straight to h3 on the Where, Getting there and Finish steps, and h2 to h5 in the country brief | PlannerSection drew h3 and the brief's groups were h5 | PlannerSection draws h2, brief groups h3 |
| Running estimate briefly lost its mono face | The eyebrow sweep turned every mono declaration in a listed rule to --ui, including the price | Put the price back in --mono by hand; the sweep only lists label rules |
| The first two audit runs and both dev servers were killed at 30 minutes | Background commands in this session are capped at 30 minutes | Vite started detached through Start-Process; the audit runs in six chunks |
| A sed edit rewrote a stylesheet with LF endings | sed -i on a CRLF file | Rewritten byte-wise with CRLF; later edits used a script that keeps endings |
| A heredoc ate the backslash in a regex | Known bash heredoc trap | Removed the now-pointless replace instead (the join no longer adds middots) |

The keyboard audit's detail is in T193-shots/keyboard/keyboard-audit.json.

## carta-design pre-ship questions

1. No hex value added anywhere; every colour is a token.
2. No gradient, no new colour, no second saturated hue; three accent fills became --ink-fill and one rgba glow became --shadow-2.
3. Ochre is untouched except that a hover in the filter sheet stopped using it; teal and --danger are not used.
4. Mono now carries only prices, dates, counts and the total; the 108 eyebrows and 30 phrases moved to --ui.
5. No view the audit reaches has more than one filled primary.
6. No headline was added; the new strings carry verbs, and the diff has no em dashes, middots or banned words.
7. Removed: the terracotta on the running estimate's total, which spent the action colour on a number.

## What is still open

The InfoDot and glossary are not built; they wait on the owner's carta-design rule and then on T156. When they land, these surfaces have terms to put behind a dot: the tier cuts on Explore's legend ("8.7+"), the est. flag on trip legs, the spend styles ("Shoestring"), "vignette" and "tolled" in the country brief, and the lifestyle words on the Lifestyle button (T193-a).

Three token pairs fail the 4.5:1 floor that carta-design and PRODUCT.md both state, and PRODUCT.md's claim that every pair clears AA is not true of them: --ink-mute on --paper, --accent as text, white on --accent. Changing a token is a DESIGN.md decision for the owner, so nothing here touched them (T193-b).

On a desktop, 719 controls on these screens are under 44 px, mostly chips, toggles and calendar days in the side panel and the wizard. That is the fine-pointer exception T335-b asks the owner to bless or refuse (T193-c).

The audit script is outside the repo, as T166's was (T166-g). It should become a verify script beside verify_keyboard.mjs, and it cannot reach the bot's result (it needs an account), the day workspace, the edit-stops view or the trip planner after an imported plan (T193-d).

Many bespoke button families on these surfaces still draw themselves: the day flow's chips, the stay search's Find, the bot's import bar, the country brief's Add, the trips step's Choose, the quiz chips. They should move to the shared Button with T335-a, one surface at a time (T193-e).

Explore answers "is this for me" and "can I afford it" on the card, but "how do I get there" only as a filter. Whether the card or its preview carries a travel time from the traveller's origin, where reachability data exists, is a product call (T193-f).

The new strings in de, es, fr, it and nl are my translations and have not had a native review (T193-g).

T189-b stays open for its other half: state.friendsFailed is still unwired in FriendsSpoke, which is not a planner file.

## Rollback procedure

In continent-app, revert the T193 commit on branch p10-explore-planner-passes (git revert, or drop the branch before merge). In the root repo, revert the report commit, which also removes the T193 rows and restores T166-d to open. Code, CSS and i18n only; no migration, no data, no wire change.
