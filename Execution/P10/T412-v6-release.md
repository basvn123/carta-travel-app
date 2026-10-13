# T412: release: the full check, the before and after gallery, the preview deploy

## Task ID

T412 (design wave V6, session 1, after T411 in the same worktrees). Branch `p10-v6-release` in both repos. The app repo has no commit from this task.

## Date

2026-10-13.

## What changed

Nothing in the app source. This task measured the merged V5 plus T411 build, built the before and after gallery, wrote the morning page and deployed the build to the design preview. The preview is live at https://design.carta-app.pages.dev (deploy id f90ca4fe, branch `design`); production was not touched.

The full check passes except for known failures that are the same as on the V5 base. The one new thing is a preview-only effect: `verify_landing` fails its "coverage that fails" check against a built `vite preview` and passes 69 of 69 against the dev server (the aborted `coverage.json` request is probably served from the browser cache in a build; row T412-c).

Impeccable context was not re-run: no screen was edited, and the detector ran over the whole `src` tree instead (0 findings). Decision taken unattended under the owner's instruction of 2026-10-07: the preview was built with `VITE_E2E_SEAMS` set empty, so the test seams that `continent-app/.env` turns on (it sets 1) do not ship.

## Files touched

Root repo:

**Created:**
- docs/design-v6/plans/V6-release.md (the plan, committed first)
- docs/design-v6/MORNING.md
- Execution/P10/T412-v6-release.md

**Modified:**
- Execution/_OPEN.md (rows T412-a to T412-e added)

Outside the repos: `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\index.html` (the gallery; 71 pairs, 10 V1 views shown alone because no later shot of that exact view exists, plus the T411 consistency set).

App repo: no change.

## Commands run

In the app worktree (`wt/T411-app`, branch `p10-v6-release`): `npm run lint`, `npm test`, `node scripts/ci/design-lint.mjs`, `node scripts/ci/banned-terms.mjs`, the six-catalogue parse of session rule 8, `impeccable detect --json src`, `npm run build`, `vite preview --port 5201`, `verify_keyboard.mjs --port 5201`, `verify_quality_floor.mjs release --port=5201`, the sweep runner over 61 harnesses on 5201, three harnesses re-run from temporary copies with their hard-coded port changed to 5203 (regions, route_page, trip_page, because ports 4209 and 4213 belong to stale V5 servers), `verify_landing --port=5202` against a dev server, `verify_fare_provenance http://127.0.0.1:5201`. Then `VITE_E2E_SEAMS= npm run build:pages` and `npx wrangler pages deploy dist --project-name carta-app --branch design --commit-dirty=true`. Then a Playwright pass over the live preview. `dist/`, `dist-data/`, the temporary harness copies, the two audit folders the harnesses write and the copied `.env` were deleted. The servers on 5201, 5202 and 5203 were stopped; 4209 and 4213 were left alone.

## Config and secrets set

None committed. The app's public `.env` was copied into the worktree for the run and deleted. No push-data, no secret, no migration, no `--branch main`.

## Before/after measurements

| Metric | Before (T411 report) | After (this release build) | Delta |
|---|---|---|---|
| `npm run lint` errors | 0 | 0 (65 warnings) | 0 |
| `npm test` | 368 pass | 368 pass | 0 |
| Design lint (found / baselined / new) | 141 / 141 / 0 | 141 / 141 / 0 | 0 |
| Detector findings over `src` | 0 | 0 | 0 |
| verify_keyboard surface checks | 22 of 22 | 22 of 22 | 0 |
| Quality floor: phone targets under 44 px | 2 | 2 (the cost bar segment, T411-k) | 0 |
| Quality floor: screens without one h1, console errors | 0, 0 | 0, 0 (107 screens, 0 aborted) | 0 |
| Surface harnesses passing | n/a | 54 of 62 | |
| Gallery pairs (V1 before, latest after) | 0 | 71 (plus 10 single V1 shots) | +71 |
| Pages deploy | n/a | 94 files, 7.9 MiB | |

Harness results. Pass (54): account_panel, admin_panel, beaches, booked_route, bottom_nav, category_rail, country_brief, day_dates, day_ideas, day_landing, day_overview, day_start_point, desktop_shell, destination_page, explore, filter_sheet, focus_trap, friends, guides, handoffs, hero_images, journey_claims, journeys, landing (on the dev server), lifestyle, map_size_cards, mountains, pack_grid, paging, past_trip, paywall, places_search, places_tab, planner_t8, planner_v2, planner_v2_flow, ready_trips, receipt, regions (re-run), route_page (13 of 13), routes_block, saved, shortlist, tab_switching, top_bar, trail_free_gpx, trails, transport_links, trip_page (61 of 61), trip_share, trips, when_step, where_quiz, fare_provenance (with its URL).

Fail, the same as on the V5 base and in the T411 report (rows T394-h, T396-d, T386-h, T389-h, T405-f, T411-m): country_cards (4 checks), cycling (75 of 78), lakes (1 check), trail_page (1 check, "card is facts only"), day_workspace (2 checks), day_steps (needs the plan-day function), trip_landing (a MapLibre line-dasharray error), stay_tiers (timed out at 900 seconds; it waits for an Explore Lifestyle door that moved). Not run: prerender.

## The preview

`npm run build:pages` passed (94 files, far under the 20,000 ceiling). The deploy succeeded: https://f90ca4fe.carta-app.pages.dev, alias https://design.carta-app.pages.dev. The R2 data CORS admits the alias, so places, trails and journeys load.

Opened on iPhone 13 (WebKit), Pixel 5 and 1280 x 800 (Chromium) with the console and the network log captured: Explore, the Valbona destination, a trail (63433, Albania), a journey (Vienna), the trip planner, the day planner and My trips. Each opens, with no page errors and no failed requests. Two issues, both outside this task:

- The data host answers 404 for `https://data.carta-europetravel.com/data/trails/stubs/AL.json`, on the places and trail views on all three devices. The trail page still renders from the full file. This is the owner's data push (runbook C3). I did not run push-data.
- The destination page logs two CSP errors on every device because `connect-src` does not list `api.open-meteo.com`, so the 7-day forecast never loads. Already in the register as T221-h and T413-b.

One observation from my own quick check: with My trips open over the landing page, two h1 elements have a layout box in my query. The quality floor, which understands the page-over rule, counts 0 two-h1 screens over 107 screens, so I treat this as my query's limit, not a defect.

Seams: the preview was built with the test seams off, so the harnesses (which rely on them) ran on the local build, not on the preview. The prerender harness needs the `build:pages` output and was not run.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| regions, route_page, trip_page failed in the first sweep | They hard-code ports 4213 and 4209, which stale V5 servers hold, so they tested the old build | Re-run from temporary copies on port 5203: all pass (regions, route_page 13 of 13, trip_page 61 of 61). Copies deleted |
| verify_landing "covfail" failed on the build | The harness aborts `coverage.json`; on a built preview the table still drew | Run on the dev server: 69 of 69. Raised as T412-c |
| verify_stay_tiers timed out | Known (T405-f) | None here |

## What is still open

- T412-a (user): promote the design preview to production with the runbook's block C steps C2 to C5 (`Execution/_OWNER-RUNBOOK.md`). Do C3's `push-data.mjs --live` first so `trails/stubs/AL.json` exists.
- T412-b (user): the data host lacks `trails/stubs/AL.json` (404). It belongs to the C3 data push; check other country stubs after the push.
- T412-c (next task): verify_landing's covfail check passes on the dev server and fails on a built preview; make it robust so the release check can use a build.
- T412-d (next task): 10 V1 views have no same-named later screenshot (merged or renamed since V3); the gallery shows them alone.
- T412-e (next task): three harnesses hard-code ports 4209 and 4213; same fix as the existing row T411-l, listed so the release run is not repeated by hand.

## Rollback procedure

The deploy is on the `design` branch alias of the carta-app Pages project only. To remove it, delete the preview deployment in the Cloudflare dashboard (Workers and Pages, carta-app, Deployments, f90ca4fe) or deploy a later build to the same branch; production (`main`) is unchanged. In the repos: drop the `p10-v6-release` branches, or `git revert` the report commit and `0cef42376` (the plan). The gallery folder can be deleted; it is outside the repos.
