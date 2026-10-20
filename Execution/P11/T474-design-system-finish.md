# T474: Roadmap 1.2 finished, the T435 rest list built

## Task ID

T474

## Date

2026-10-21

## What changed

T435 left roadmap 1.2 (one design system) at "mostly done" with eight rows, T435-a to T435-h. This task builds all eight, each at its cause rather than at its symptom. The ninth row, T435-i, is the owner's call and stays open.

**T435-a, the journey link.** A cold `#journey=<id>` link landed on the Trips list and never opened the week. The cause was a take-once handover. `lib/journeys.js` handed the id out once, and `JourneysSection` took it on mount. React's doubled effect in development, and any remount, lost the id, and the handover only worked if the list happened to be on screen.

- **The door.** App now holds the pending journey (`pendingJourney`) and hands it to Destinations as `openJourney`, the same door every other shared item uses. Destinations opens the page, then reports it consumed, so nothing can drop the id. A link's own history entry becomes the list first (`dropJourneyHash`), so Back from the week lands on Trips.
- **Starred weeks.** A starred journey in My trips now opens its week through the same door, which closes the old row T391-a.
- **Real links.** Journey tiles and the "nearest across the border" rows are real `<a href="#journey=...">` links. A plain click opens the week in place; a modifier click opens a new tab, which now cold-loads correctly.

**T435-b, the photo credits.** On the journey pages, 84 of 337 photographs carried an author and licence. The trip harvest takes Wikipedia lead images, which come with a page and a place name only. A new pipeline step, `pipeline/journeys/credits.py`, fills both fields:

- **Sources.** It reads first from the licence caches the dossier already keeps (through `TaslStore`, read only). For the rest it asks the photo's own wiki, Commons or a language Wikipedia, in batches of 50, and caches the answers in `cache/journey_licences.json`.
- **Tidying.** Licence names take the Commons spelling ("Cc-by-sa-3.0" becomes "CC BY-SA 3.0"). Wiki furniture is dropped from authors ("(talk)", a "User:" prefix).
- **Links.** A credited photo's `page` now points to its file page, the source of the licence.
- **Behaviour.** The step is idempotent, and `build_wire.py` calls it after writing the wire, so a rebuild keeps the credits. All 337 journey-page photographs now carry a licence and 332 an author; the other five are public-domain files that name none. Across all 610 photograph entries on the wire, the result is the same, every one licensed.

**T435-c, the one Lifestyle.** The journey price card had two private sliders ("Where you sleep", "How you spend"), a second Lifestyle control.

- **One row.** They are gone. One Lifestyle row (the kit Button, label over value: "Lifestyle / Entire place, Easygoing") opens the app's one Lifestyle panel. Under it, one sentence states the trip's own range: "~€780 to €1,250 est. a person for this trip, from the simplest beds and cooking to a hotel and dinners out."
- **How the Lifestyle places the price.** `lib/tripPrice.js lifestyleShares()` turns the traveller's real Lifestyle into the two shares the price was already built from:
  - **Beds:** the way to sleep in the panel's comfort order, dorm to hotel.
  - **Habits:** a day of eating and drinking on the reference basket the price bands use, between the thriftiest preset and the most generous.
- **The panel opens on top.** The panel used to open hidden behind full-screen pages other than the destination page. The lift rule now covers `.tpage` too.
- **Presets.** The Lifestyle presets moved to `lib/lifestyleProfiles.js`, so pure modules and tests can read them.

**T435-d, one unit wording.**

- **One order.** Where two units apply, the order is now "a person a day" in all six languages. The variants it replaces were "a day a person" (match cards, the country brief), "a day here, a person" (the day planner) and "each" (the receipt, past trips).
- **The receipt.** Its per-person line printed `~€38.12 each`, a bare tilde without "est."; it now goes through `formatEst`. Car hire printed "about €38"; it now shows the house estimate mark on the destination receipt, in Getting there and in the PDF.
- **Day trips.** The fares glued "/car" and " a person" onto a figure. They now use one template per unit (`day.farePerPerson`, `day.farePerCar`), with the estimate through the formatter.
- **Dead keys.** Eighteen keys were removed from all six languages, every one dead or carrying the old wording: the sliders' eight, the glued suffixes' four, and six unused unit keys.

**T435-e, one page bar and one focus rule.**

- **The bar.** There were four bar implementations and no bar on the region page. Now there is one component, `browse/PageBar.jsx`: a quiet back button that names its list, the page's name once its heading has scrolled away, and save and share. The destination page loses its phone arrow and desktop cross, and says "← Explore" (or the tab it closes to) on both sizes. The trip page loses its raw buttons and its star, which was the only star left where the app uses a bookmark.
- **The region page.** It gets the bar, and its "Coast, Belgium" line now sits under its h1.
- **The notch bug.** The bar is now `content-box`. The item pages' bar was a 52 px border-box with the notch inset as padding, so an installed app on a notched iPhone had a few pixels of bar left.
- **The focus rule.** There were four arrival-focus variants; now there is one hook, `hooks/usePageArrival.js`, the written carta-design rule. Opened by pointer, touch or a boot link, focus goes to the h1. From the keyboard, it goes to the bar's first control. `useFocusTrap` now treats "no input yet" (a shared link) as not-keyboard, so a cold page opens with no ring.

**T435-f, CSS per route.**

- **The split.** A new tool, `scripts/css-routes.mjs`, moves 188.7 KB of source rules that only the trip and day planners, or the admin page, render into `src/styles/planners/` and `src/styles/admin/`. They load with the route's chunk, imported by `TripPlannerTab`, `DayPlannerTab` and `AdminPage`. The CSS before first paint went from 893,642 to 741,278 bytes (141,817 to 120,310 gzip).
- **How a rule qualifies.** A rule moves only if two things hold:
  - one of its classes is named by no chunk but the route's, read from the real build;
  - no rule that loads after it could override it: its own file, later files, the existing lazy sheets, maplibre-gl.css, or the other route, at equal specificity on a shared property.

  A rule that fails either test stays global.
- **What I rejected.** Wrapping the app in cascade layers was the first design. It would have changed how maplibre-gl.css and `!important` interact with every rule, so I rejected it.
- **Proof.** `--check` re-proves both conditions on any build: 1,825 route selectors, all route-only, none overridable. It is wired into `npm run ci` after the build. A computed-style diff of every element on 11 screens at 390 and 1440 px, between the build just before the split and the build just after, is in the measurements below.
- **What stays open.** The two eager JavaScript chunks the review named are recorded, not changed. "useFocusTrap" is a misnamed shared chunk holding supabase-js (52 KB gzip, imported synchronously by about 30 modules). The i18n chunk is English only (the five other languages already load lazily). Both are auth and i18n architecture changes for their own tasks (T474-b, T474-c).

**T435-g, the z-index ladder.**

- **The ladder.** There were 48 values and 150 literals. There are now 17 tokens in `01-tokens.css`, from `--z-sticky` 10 to `--z-max` 9999, plus two pin layers inside the map.
- **The rewrite.** Every z-index of 10 or more (70 literals) now reads a token, or a step inside its band (`calc(var(--z-page) + 40)` for a destination page). Values are unchanged, so the order is the one the app shipped with. 1 to 9 stays a number, as stacking inside one component.
- **The lint rule.** A new design-lint rule, `z-index-literal`, keeps it so; the self-test seeds it.
- **The docs.** DESIGN.md records the ladder.

**T435-h, the tails.**

- **Field radius.** Explore's sort select, Explore's search trigger, the Destinations search field and the header search take the control radius, like every field beside them. The header search also gets the field's focus ring.
- **The statement toggle.** "Read the statement" in My trips is the kit's small secondary button.
- **The phone refine row.** On a phone, Explore's sort leads the active filter chips as a dropdown chip ("Sort Rating"), in one row that scrolls sideways. It used to take a row of its own above two wrapped rows of chips; the list starts about 70 px higher. The floating List/Map control stays, by design: the end of the list clears it.
- **Chip tap floor.** Explore's chips get the 44 px tap floor on touch. The T435 chip rule had pinned them at 32 px, below the floor Destinations keeps.
- **The section rail.** It carries the selected mark, the underline, on every page; it was the destination page's alone, so the trail page had the tint without it.
- **Capital names.** Names that EU registers publish in capitals ("VOIDOKILIA", "LIMNOTHALASSA GIALOVAS KAI NISOS SFAKTIRIA") print through `displayName()` in the case of every other name. It changes only a name with no lower-case letter, so mixed-case names and short acronyms stay.
- **Comments.** 22 stylesheet comments in 10 files named the retired Fraunces and terracotta; they now say "the heading face" and "action-brown".

## Files touched

**Modified (app repo, continent-app):**

- **The journey door:**
  - src/App.jsx: the pending journey, the back label for pages over the shell
  - src/browse/DestinationsTab.jsx: openJourney
  - src/browse/JourneysSection.jsx: real links, the take-once effect removed
  - src/lib/journeys.js: dropJourneyHash in place of takePendingJourney
- **The page bar:**
  - src/browse/DetailSkeleton.jsx, src/browse/JourneyPage.jsx, src/browse/TripPage.jsx, src/browse/RegionPage.jsx and src/browse/DestinationPage.jsx: PageBar and usePageArrival
  - src/hooks/useFocusTrap.js: lastInputWasKeyboard; no input counts as not-keyboard
- **The Lifestyle:**
  - src/browse/TripPriceCard.jsx: the one Lifestyle row
  - src/lib/tripPrice.js: lifestyleShares; the slider stops removed
  - src/lib/costIndex.js: refDayFood exported
  - src/browse/LifestylePanel.jsx: PROFILES from lib
- **Units and estimates:**
  - src/components/ReceiptCard.jsx: per person through formatEst
  - src/browse/DestPriceCard.jsx and src/browse/GettingThere.jsx: car hire with the estimate mark
  - src/lib/destinationPdf.js: car hire with the estimate mark
  - src/planner/DayTripTransport.jsx: one template per unit
- **The tails:**
  - src/browse/BeachPage.jsx, src/browse/LakePage.jsx and src/browse/Signature.jsx: displayName
  - src/lib/format.js: displayName
  - src/browse/FilterChips.jsx: the lead slot
  - src/browse/ExploreTab.jsx: the sort leads the chips on a phone
  - src/auth/ModerationNotice.jsx: the kit button
- **Route sheets:** src/planner/TripPlannerTab.jsx, src/planner/DayPlannerTab.jsx and src/admin/AdminPage.jsx import them.
- **Strings:** src/i18n/en.js, nl.js, de.js, fr.js, es.js and it.js: 8 keys reworded, 3 added, 18 removed, each in all six.
- **Stylesheets:**
  - src/styles.css: the header names the route sheets
  - src/styles/01-tokens.css: the z-index ladder
  - src/styles/10-shell.css, 12-guided-trip.css, 14-filters-panels.css, 15-map-overlays.css, 16-auth.css, 17-saved-trips.css, 18-detail-panel.css, 22-account-admin.css, 31-infodot.css, 38-first-run.css, 40-upload.css, 42-feedback.css, 46-owner-calls.css, 60-v6-shell.css, 69-v6-account.css and 70-mytrips.css: the ladder, and comment wording where named
  - src/styles/11-trip-planner.css, 19-guide-ratings.css, 20-day-planner-flow.css, 21-chat-passes.css, 67-v6-tripplanner.css and 68-v6-dayplanner.css: the split, and the ladder where they had a value
  - src/styles/23-places-pages.css: the ladder; the statement toggle's fixed height
  - src/styles/24-destination-workspace.css: the ladder, the split, the dead destination bar, the header search
  - src/styles/25-feature-pages.css: the ladder, the region shell, the sort select, the dead bar selectors
  - src/styles/26-shortlist-extras.css: the split, the dead bar selectors
  - src/styles/34-section-rail.css: the selected mark
  - src/styles/45-empty-states.css: a.cov-near-row
  - src/styles/62-v6-explore.css: the search trigger, the phone refine row, the chip tap floor
  - src/styles/63-v6-destinations.css: the search field
  - src/styles/64-v6-destination.css: the ladder, the dead bar, the Lifestyle lift over .tpage, the rail mark
  - src/styles/70-item-pages.css: the shared page bar, the Lifestyle row
- **Lint:**
  - scripts/ci/design-lint.mjs: the z-index-literal rule
  - scripts/ci/fixtures/design-lint/bad/src/styles/t425.css and good/src/clean.css: its fixtures
  - scripts/ci/design-lint.baseline.json: rebased for the rules that moved files; the total is 7,788, down from 7,795
- **Harnesses:**
  - scripts/verify_destination_page.mjs and scripts/verify_explore.mjs: back names the list, no cross
  - scripts/verify_explore.mjs: reads the sort on screen, now that it is twinned
- **Other:**
  - tests/tripPrice.test.mjs: three tests for lifestyleShares
  - package.json: ci:css-routes in the ci chain

**Created (app repo):**

- src/browse/PageBar.jsx
- src/hooks/usePageArrival.js
- src/lib/lifestyleProfiles.js
- scripts/css-routes.mjs
- src/styles/planners.css with src/styles/planners/ (eleven parts)
- src/styles/admin.css with src/styles/admin/22-account-admin.css
- tests/displayName.test.mjs

**Modified (root repo):**

- pipeline/journeys/build_wire.py: calls credits.py after writing the wire
- continent-app/public/journeys/: 263 of 274 files credited
- DESIGN.md: the ladder, the page bar, arrival focus, units, the route sheets row, the sync line
- .claude/skills/carta-design/SKILL.md: units, the page bar
- Roadmap/Carta roadmap.md: row 1.2
- Execution/_OPEN.md
- the continent-app mirror

**Created (root repo):**

- pipeline/journeys/credits.py
- cache/journey_licences.json
- Execution/P11/T474-design-system-finish.md

## Commands run

```
cd continent-app
node scripts/css-routes.mjs --split <build>/assets       # after a NOPUBLIC build of the source
npx vite build && node scripts/css-routes.mjs --check dist/assets
node scripts/ci/design-lint.mjs --self-test
node scripts/ci/design-lint.mjs --update-baseline        # moved rules only, total 7,788
node scripts/ci/token-contrast.mjs
npx eslint src
npm test
cd ..
python pipeline/journeys/credits.py                      # Commons and en.wikipedia, 87 file names asked
python pipeline/journeys/credits.py --check --no-fetch   # 610/610
```

Browser checks (Playwright, scratch scripts outside the repo):

- the cold `#journey=` link at 390 and 1440, and on a first visit
- the five page types: bar height, back label, arrival focus, no horizontal scroll
- the price card's Lifestyle row: open, pick, reprice
- the phone refine row and the list's end against the floating switch
- the computed-style diff between the builds before and after the split. The harness could not open My trips and Account by clicking, so those two rows re-measured the Destinations page; the admin page needs a signed-in admin and was not captured. The trip and day planners, the two routes the split serves, were.

## Config and secrets set

None. The Commons and Wikipedia API calls take no key; they identify themselves with the pipeline's existing User-Agent.

## Before/after measurements

Before is the state at the start of the task: app master 2333e97, the wire of 2026-10-15, and the T435 report's figures where it measured them.

| Metric | Before | After | Delta |
|---|---|---|---|
| Cold `#journey=` link opens the week (390, 1440, first visit) | 0 of 3 | 3 of 3 | +3 |
| Journey page photographs with a licence | 84 / 337 | 337 / 337 | +253 |
| Journey page photographs with an author | 84 / 337 | 332 / 337 | +248 (5 public domain, no author) |
| Lifestyle controls on the journey price card | 2 sliders of its own | 1 row to the app's panel | -1 |
| Unit orders for "a person" with "a day" (English) | 3 | 1 | -2 |
| Bare-tilde or "about" estimates in receipts and car hire | 3 | 0 | -3 |
| Page bar implementations / arrival focus rules | 4 / 4 | 1 / 1 | -3 / -3 |
| CSS before first paint | 893,642 B (141,817 gzip) | 741,278 B (120,310 gzip) | -152,364 B (-21,507 gzip, -15%) |
| Eager JS index chunk | 735,579 B (229,321 gzip) | 732,867 B (228,714 gzip) | -2,712 B |
| z-index literals of 10 or more | 70 (plus 6 already on a token) | 0 (78 on a token) | -70 |
| Distinct z-index literals | 48 | 11 (-1 to 8, inside a component) | -37 |
| Design lint, whole app | 7,795 | 7,788 | -7 |
| Design-lint meter (raw-button, font-size, radius, legacy-token, money) | 423, 1,751, 782, 4,680, 47 | 419, 1,747, 781, 4,666, 47 | -4, -4, -1, -14, 0 |
| Token contrast pairs under the floor | 0 | 0 | 0 |
| npm test | 451 | 456 (450 pass in the worktree, see below) | +5 tests |
| Computed style of every element, the build before the split against the build after (11 screens at 390 and 1440, 95,007 elements, 61 properties each) | | 0 elements differ | 0 |
| css-routes --check on the final build | | 1,825 route selectors, all route-only, none overridable | |
| Harnesses on the final build | | destination page all pass, journeys all pass, Explore 103/103, trail page all pass, beaches all pass, focus trap 15/15 | |
| Quality floor walker on the final build (76 screens at 390 and 1440, 4 aborted as in T435) | pass (T435) | pass: no horizontal scroll, one h1, no skipped heading, one primary, 0 phone targets under 44 px, 0 console errors | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The Lifestyle panel opened hidden behind the journey page | The lift rule over full-screen pages covered `.destp` only | `body:has(.destp, .tpage)` |
| The first route split left five route rules overridable | A file whose route part fell under 1 KB stayed whole, but its rules had counted as moved while the safety pass ran | The split now settles again with those files global, to a fixpoint, and `--check` caught it; the 12 split files were restored from git and the split re-run |
| A cascade-layer design for CSS per route | Layers would have changed how maplibre-gl.css and every `!important` resolve against the app's rules | Rejected before writing it; the split instead keeps a rule global unless nothing later could override it |
| Explore's chips were 32 px on touch | T435's `.explore-shell .xchip { min-height: 32px }` beat the phone's tap floor | A coarse-pointer floor for the chips and the sort chip, as Destinations has |
| `passSubscription.test.mjs` fails in the worktree | It imports `../../supabase/...`, which exists only inside the main checkout | Not a code fault; the suite is rerun in the main checkout after the merge |
| The quality floor found one phone target under 44 px: the sort chip's select, 42 px inside the chip's 1 px edge | The chip had the tap floor, the select inside it did not | The select spans the chip's edge (`height: calc(100% + 2px); margin-block: -1px`); the rerun reads 0 |
| verify_explore failed "search pass ran" on a strict-mode locator | The sort select is drawn twice now (bar and, on a phone, the chip row) | The harness reads `.xgrid-sort select:visible`, the codebase's rule for twinned controls; 103/103 |
| verify_lakes reports GB 54 of 60 and IE 19 of 25 lakes | Data floors on the lakes wire; this task changes no lake data | Not a regression of this task; left as the lakes layer's |
| `npx eslint src` reports 1 error, in ExploreMap.jsx:621 | A missing hook dependency in a file this task does not touch | Recorded as T474-g; not changed here |

## What is still open

T474-a: region pages can be shared but not saved. A region is not a favourite kind, so their page bar has back and share only. Making it one touches lib/favorites.js (`FAV_KINDS`), hooks/useFavoriteItems.js (a resolver through `loadRegion`), the My trips groups and their opener, and the six languages' group label.

T474-b: supabase-js (52 KB gzip) loads before the first paint, in the shared chunk the bundler named after useFocusTrap. About 30 modules import `supabase` from lib/supabaseClient.js synchronously. Deferring it means an async `getSupabase()` through the auth layer, with sign-in tested end to end, so it is its own task.

T474-c: the English strings (105 KB gzip) load before the first paint. The other five languages already load on demand. Splitting the English table by surface, so a screen loads its own keys, is an i18n architecture task.

T474-d: 1,089 planner and admin rules stay in the first paint, because a later rule could override them at equal specificity. Raising or merging those pairs, then running `node scripts/css-routes.mjs --split <build>/assets` again, moves more. A third family, the item pages (70-item-pages, 65-v6-outdoor, 66-v6-trips), was not split, because their parts are shared with the eager destination page; it needs its own family in `FAMILIES`.

T474-e: the trip price card places beds in the panel's comfort order (dorm, private room, entire place, hotel). The reference stay prices rank an entire place below a private room per person. That suits a written range that runs from the simplest beds to the most comfortable; the owner may prefer price order.

T474-f: a real-phone round on an iPhone with a notch, as the installed app. Check the page bar's height under the inset, and that the back label fits at 360 px in German. T468-a covers the other phone checks.

T474-g: `npx eslint src` reports one error in src/browse/ExploreMap.jsx:621, a missing `collectKpins` dependency in a `useCallback`. The file is outside this task.

T435-i stays the owner's: the map pins' bare tilde.

## Rollback procedure

**App repo:** run `git revert -m 1 <merge of p11-design-system-finish>`. It restores the stylesheets, the sliders and the page bars. The route sheets go with it, because their rules come back to the domain files in the same revert.

**Root repo:** revert the merge of p11-design-system-finish into main. It returns the wire's journey files to their uncredited state and removes credits.py and its cache. To keep the credits but undo the app, revert only the app merge; the app reads `author` and `licence` when they are present and ignores them otherwise.

Nothing was deployed, so there is no production rollback.
