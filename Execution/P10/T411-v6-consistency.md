# T411: one traveller, one trip, the consistency pass across every surface

## Task ID

T411 (design wave V6, session 1; T369 waves). Branch `p10-v6-consistency` in both repos.

## Date

2026-10-13 (started 2026-10-09, paused on a usage limit, resumed and finished 2026-10-13).

## What changed

Carta now reads as one product at the joins between its ten surfaces. The work started from a planning journey walked end to end on the merged V5 build (landing, Explore, Lifestyle, Destinations, a town, a trail, a journey, the trip wizard and planned view, save, share, two days in the day planner, My trips) on iPhone 13 in WebKit, a Pixel 5 and a 360 x 740 touch context in Chromium, and desktop at 1280 x 800. Every step of that journey was reachable before and after on all four devices; what broke was consistency, not a step.

The fixes are the shared ones. Every dismissible surface closes with the house CloseIcon: 18 buttons that drew a typed "×" or "x" (wizard, planner, itinerary, extras, ledger, country brief, country picker map, the AI day plan dialog, day planner, day builder, add panel, admin page, config manager) now draw it, and `.panel-close` (the destination bar on desktop, the sign-in dialog, the guides panel) is the transparent `--ink-soft` close in a `--tap` box instead of a dark disc. The destination, region and country pages use ArrowLeftIcon for their back control, and the destination back is named "Back", not "Close". The page the nav calls "My trips" is called that in the four toasts and the tooltip that said "Saved trips", and its Favorites tab takes the word Explore uses ("Shortlist" in English, "Merkliste" in German; the other four languages already matched). One h1 per view: Explore's bar title is no h1 while a destination, My trips or Account stands over it, and the shell rule that hides a tab's h1 under a page now covers the destination page and any inert tab. Motion in shared places reads the tokens (the shared Button, the three `transition: all` rules, the flashcard deck, the fold chevron). All 363 top-level `:hover` rules that sat outside `@media (hover: hover)` are now inside it, mechanically, with order and specificity unchanged. `100vh` is `100dvh` in the five rules left. Selected and accent states follow the house rules: the wizard step rail and the picked-country chip are ink, fold icons are `--ink-soft` on every detail page at 20 px (the two page overrides went), the AI and pass dialogs lost their accent disc tile, the pass ticks are ink, the destination's Shortlisted state is the ink fill. The three live side stripes the detector found, and the day-trip card's, are plain borders. Controls that were pills or 8 to 12 px are 6 px. Touch targets reach `--tap` on a coarse pointer (DateField, the day save and back-to-trip, the Explore cut chips, planning map pins through a pseudo-element hit box) and the MonthStrip info button is 32 px on a fine pointer. Page titles on the destination and journey pages are 28 / 40 px, the verdict label is `--ui`, the day planner's town chips are `--ui`. The selected My trips tab shows the house count chip. The country page facts no longer use middots. The destination PDF builds its fallback palette from the token mirror (`--accent`, `--ink-mute` and four more are now mirrored, so the lint checks them). Dead rules other waves could not delete are gone (about 220 lines). The trail and cycle heroes use the lowercase `fetchpriority` React accepts.

Measured effect: the quality floor's two floor failures went from 4 two-h1 screens and 7 phone targets under 44 px to 0 and 2, and its console errors from 4 to 0; the detector went from 9 findings to 0 over the whole `src` tree; the design lint baseline matches 141 violations instead of 146 with 0 new.

## Files touched

Root repo:

**Created:**
- docs/design-v6/plans/V6-consistency.md (the plan, committed first)
- Execution/P10/T411-v6-consistency.md

**Modified:**
- Execution/_OPEN.md (20 rows closed, 15 rows added)

App repo (`continent-app`), all listed in `docs/design-v6/OWNERSHIP.md`:

**Modified:**
- src/App.jsx, src/browse/ExploreTab.jsx (the page-over flag on the bar title)
- src/browse/CountryPage.jsx, CyclePage.jsx, DestinationPage.jsx, Fold.jsx, RegionPage.jsx, TrailPage.jsx
- src/components/PassModal.jsx, src/components/admin/ConfigManager.jsx, src/admin/AdminPage.jsx
- src/map/CountryPickerMap.jsx, src/map/tokenColors.js, src/lib/destinationPdf.js
- src/planner/AiDayPlanModal.jsx, CountryBrief.jsx, DayAddPanel.jsx, DayExploreBuilder.jsx, DayPlannerTab.jsx, ExpenseLedger.jsx, GuidedTripWizard.jsx, ReadyTripsStep.jsx, TripExtras.jsx, TripItinerary.jsx, TripPlannerTab.jsx
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (five keys: trip.savedNotice, trip.updatedNotice, day.savedToast, dayws.saveTitle, saved.tabFavorites)
- src/styles/03, 10, 11, 12, 13, 15, 17, 18, 19, 20, 21, 23, 24, 25, 26, 30, 33, 38, 60, 62, 64, 66, 67, 68, 69 (`*.css`)
- scripts/verify_shortlist.mjs (one assertion: the tab is now named Shortlist; the old name stays in the pattern, with a comment)

## Commands run

Planning, from the root worktree: `impeccable.cmd context --target ../T411-app/src/App.jsx` (it resolved the app repo as root and reported NO_PRODUCT_MD, the known gap T372-g, so PRODUCT.md and DESIGN.md were read directly). The critique ran dual-agent: Assessment A (design review, a Playwright walk of the journey on the four devices) and Assessment B (the detector over `src`, the design lint, a stylesheet tally and the ownership check) as two isolated sub-agents; A finished before B's output entered the synthesis. The run is unattended (owner instruction 2026-10-07): no decision page, live mode or question tool; every open choice kept Carta's palette, type and identity.

In the app worktree: `node node_modules/vite/bin/vite.js --port 5201 --strictPort` (dev server, stopped), `vite build` then `vite preview --port 5201` for verify_day_dates (stopped), `npm run lint`, `npm test`, `node scripts/ci/design-lint.mjs`, `node scripts/check_ownership.mjs ../T411/docs/design-v6/OWNERSHIP.md`, the six-catalogue parse of session rule 8, `impeccable detect --json` over every changed file and over `src`, `rm -rf dist dist-data`. Harnesses: `verify_keyboard.mjs --port 5201` and `verify_quality_floor.mjs <label> --port=5201` before and after, and every harness the ten briefs name through a scratch runner (`wt/_scratch/T411/s/sweep.sh`, with `CARTA_PORT=5201` and `CARTA_REPO_ROOT` set). Harnesses that hard-code a preview port were reached through a scratch TCP forwarder to 5201 (`s/fwd.mjs`, not a second Vite); two whose ports another session's stale preview held (4209, 4213) were run from a temporary copy with the port set to 5201 and the copy deleted. To tell my failures from old ones, the failing set was run once on the V5 base by `git checkout 95c26a6 -- src`, then `git checkout HEAD -- src` (no stash). Scratch scripts outside both repos: `s/close.py` (CloseIcon swap), `s/dead.py` (dead-selector removal that keeps comments and live selectors), `s/wrap.py` with `s/hov.py` (the T410 hover wrapper), `s/ed.py` (exact edits that keep line endings), `W/walk.mjs` (the journey walk, copied from Assessment A).

## Config and secrets set

None committed. The main checkout's `continent-app/.env` (the public anon configuration, gitignored) was copied into the app worktree for the harness runs and deleted before the end.

## Before/after measurements

| Metric | Before (V5 merged) | After | Delta |
|---|---|---|---|
| verify_quality_floor: screens without exactly one h1 | 4 | 0 | -4 |
| verify_quality_floor: phone targets under 44 px | 7 | 2 | -5 |
| verify_quality_floor: console errors | 4 | 0 | -4 |
| verify_keyboard surface checks | 22 of 22 | 22 of 22 | 0 |
| impeccable detect, whole `src` | 9 (side-tab) | 0 | -9 |
| design lint (found / baselined / new) | 146 / 146 / 0 | 141 / 141 / 0 | -5 |
| Close buttons drawn as a typed glyph | 18 | 0 | -18 |
| `:hover` rules outside `(hover: hover)` (one parser, comments stripped) | 374 | 11 (rules nested inside another media block, left as they are) | -363 |
| `100vh` in stylesheets | 5 | 0 | -5 |
| Side stripes (3 px left borders) on live rules | 4 | 0 | -4 |
| Heuristic score (Assessment A, before only) | 22 of 40 | not re-scored | |
| Journey steps reachable, four devices | 13 of 13 each (desktop 12) | the same | 0 |

The two phone targets left are one journey cost bar segment (39 x 44) on the opened and closed journey screens; 60-v6-shell.css already gives it a 44 px `::after` hit box, which the floor cannot see (row T411-k). The before figures are this session's runs on the merged V5 build (`wt/_scratch/T411/run/qf-base.log`, `kb-base.log`), the after figures `qf-after.log`, `kb-after.log`; detector output in `wt/_scratch/T411/B/detect.json` and `detect-after-all.json`.

The device walk after the change (`wt/_scratch/T411/W/walk-*.json`): no page errors on any device; the destination page from Explore exposes one h1 and every control in its head is 6 px; on all three phones the on-screen keyboard case holds (viewport 40 percent shorter: the focused search at 233 to 277 px, the bottom nav hidden, the field 16 px). Ten after screenshots are in `design-v6-shots/consistency/` (V6-destination, wizard, mytrips, keyboard, day and landscape, on iphone, android and desktop).

Phone findings the prompt asks for: landscape (844 x 390) still gives the content little room (rows T403-a, T406-b, T411-h); tap only works, since every hover rule is now behind `(hover: hover)` and no step of the journey needed one; the keyboard case passes; safe areas and `100dvh` are in every full-height rule; the one primary is still under the bottom nav on the landing page and the day planner on a tall phone (T392-b, T411-c); no swipe is the only way to do anything on the walked path.

Harness results, after (every harness the ten briefs name, plus the two floors):

| Result | Harnesses |
|---|---|
| Pass | bottom_nav, desktop_shell, filter_sheet, focus_trap, lifestyle, tab_switching, top_bar, landing, receipt, explore, fare_provenance, map_size_cards, shortlist (after its update), category_rail, paging, places_search, places_tab, regions (30 of 30), destination_page, hero_images, routes_block, transport_links, beaches, mountains, route_page, trail_free_gpx, trails, journey_claims, journeys, pack_grid, trip_page (61 of 61), trips, booked_route, country_brief, handoffs, planner_t8, planner_v2, planner_v2_flow, ready_trips, when_step, where_quiz, day_dates (on a preview build), day_ideas, day_landing, day_overview, day_start_point, account_panel, admin_panel, friends, guides, past_trip, paywall, saved, trip_share, keyboard (22 of 22) |
| Fail, the same as on the V5 base or as reported by V5 | country_cards 4 checks (Explore's guide cards, T394-h); cycling 75 of 78, lakes 83 of 84, trail_page 50 of 51 (T396-d, T386-h); day_workspace 2 checks (it looks for the sheet straight after Escape, before its exit animation ends; same on the base); day_steps (needs the plan-day function, T389-h); trip_landing (a MapLibre error on the country picker's dashed line, same on the base); stay_tiers (waits for an Explore Lifestyle door that moved to the settings line, T405-f); quality_floor (the cost bar segment above) |
| Not run | prerender (needs the build:pages output, T412's step) |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| verify_shortlist found no grouped shortlist | The harness opened the My trips tab by the word "Favorites", which this task renamed | Pattern now matches Shortlist or Favorites, with a comment |
| The first dead-rule pass mangled comments | The script split a rule's leading comment at its commas as if it were selectors | Files restored from the copies taken before the run; the script now treats leading comments as part of the rule's lead |
| The removed pass upsell block took `.account-pass-cta` with it | That one rule in the block is still drawn | Restored with a comment |
| `sed -i` rewrote some CRLF files as LF (whole-file diffs) | Git Bash sed on Windows | Every changed file matched back to its HEAD line endings before the commit |
| Two harnesses passed against the wrong build | Another session's stale `vite preview` holds ports 4209 and 4213 | Re-run from a temporary copy on 5201: trip_page 61 of 61, regions 30 of 30 |
| verify_fare_provenance started its own Vite | The runner passed `--port 5201` where it reads a URL | Re-run with the URL; it passes. The stray Vite it started was stopped |

## What is still open

Carried as rows because each is a feature, a product call or a rule, not a consistency fix, all from the critique: the trip planner's hand-off drops the town and the dates (T411-a); one trip shows three different figures and the destination head disagrees with its receipt, which needs a decision on what each surface reads (T411-b, owner); the day planner's primary under the bottom nav (T411-c); the guest save path (T411-d); the pass dialog that opens by itself on the planned view (T411-e, owner); the journey strip's range without "est." (T411-f); trail figures formatted two ways (T411-g); the wizard's fixed chrome at about half a phone (T411-h); back labels that name their list, bottom nav labels at 10.5 px, the settings line's focus offset and the install hint for a guest (T411-i); the remaining legacy style debt each owner retires (T411-j); the quality floor cannot see pseudo-element hit boxes (T411-k); harnesses with hard-coded preview ports (T411-l); three failures that are the same on the base (T411-m); native review of the five changed keys and the shortlist word inside four languages (T411-n, owner); the real-phone checks of T414 (T411-o, owner).

Rows closed by this task: T383-g, T394-f, T399-e and T409-c (already done by earlier merges, verified here); T403-e, T410-e (verify_keyboard 22 of 22); T410-g and T405-b (the PDF palette); T390-h and T410-d (21-chat-passes); T395-b, T397-d, T399-b, T399-c, T399-d, T395-d, T395-i; T407-d, T410-c, T410-f. Left open on purpose: T405-f (its verify_stay_tiers half), T404-d (its LCP half; the middots are fixed), T403-b (the count spacing was not reproduced), T393-d (the star's colour is the owner's), and every row that needs a new rule or a larger layout change (T392-a, T392-b, T395-a, T395-c, T398-c, T400-b, T401-d, T403-a, T406-b, T406-c, T408-b, T408-c, T409-b, T409-e, T409-f, T409-g, T410-h, T410-i).

Carta-design's seven questions on the diff. 1: no hex outside the tokens; the mirror gained six checked values. 2: no gradient, colour or second saturated hue was added; accent was removed from eight places. 3: ochre stays on ratings (the verdict label moved to `--rate-soft` text in `--ui`), teal and `--danger` untouched. 4: mono was taken off the day planner's town names; no number moved out of mono. 5: one primary per view held (quality floor 0). 6: no headline changed; the diff has no em dash or banned word. 7: removed: the accent disc tiles, the side stripes, the dark close disc and about 220 lines of dead rules.

## Rollback procedure

App: `git -C continent-app revert df63967 aa24819` (or drop the branch before merging). Root: `git revert` the report commit and `5d23e1aa4` (the plan). No data, migration, deploy or secret is involved.
