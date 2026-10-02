# T266: Harness repairs (stage 9, group D3)

## Task ID

T266

## Date

2026-10-02

## What changed

A dozen screen and admin harnesses in continent-app/scripts were brought back in line with the app as it is now, and the checks that were only ever run from scratch copies became permanent harness steps. No app source file changed. Everything is under scripts/ in the app repo.

Repaired because the app moved on: verify_explore.mjs (the bar has no count any more, and the phone rail is now the shared Filters sheet), verify_mountains.mjs (a bare .places-filter-btn found the hidden Explore button first), verify_places_tab.mjs and verify_trips.mjs (the country filter is the CountryPicker button and listbox, there is no General tab, the sight photos sit behind "more about the day", near mode needs a category that has distances), verify_account_panel.mjs (its 380px section now passes), verify_admin_panel.mjs (the non-admin hub has ten doors, not eight). Forty-two harnesses no longer assume a server on 4173: they read CARTA_PORT first. Twelve admin test scripts lost the dead {5,255} patched-copy fallback. The dead verify_reach_filter.mjs was deleted.

Added because the checks existed only in scratch copies: verify_admin_panel.mjs now covers the Guides tab, the Reports tab, Unpublish, Dismiss, and owners' complaints (Uphold, Reverse) with their refusals, and the same tabs at 380px. verify_guides.mjs covers the report form. verify_saved.mjs covers the statement of reasons and the complaint form. The diff viewer step now serves a real image for the replacement photo and checks that it painted. A new verify_flight_est_ui.mjs checks the "~" and "est." tag on both flight rows of the trip receipt on a desktop and a 380px phone. verify_places_tab.mjs checks that the city-day card is reachable and that its tilde and estimate title always agree. scripts/perf/baseline_vitals.mjs has a layer-page mode (LAYERS=1) with the CDN stand-in, pacing and offline third parties that T052 kept in its scratchpad.

The answer to "is the city-day card dead code" in T256-b is no. It renders under Destinations, Trips, the one-day chip, then a country. Across Spain and Italy from the default origin it showed flight prices with the "~" and the estimate title, and ground prices plain, which is the rule.

## Files touched

All in continent-app (the app repo, branch p4-d3-harness-repairs). Eleven commits.

**Modified:**
- scripts/admin/test_admin_audit_rollback.mjs, test_admin_guard_tiers.mjs, test_admin_public_guides.mjs, test_admin_rpc_security.mjs, test_admin_unpublish_guide.mjs, test_content_reports.mjs, test_edge_errors.mjs, test_override_review.mjs, test_parse_failures.mjs, test_pipeline_health.mjs, test_site_config_visibility.mjs, test_statement_of_reasons.mjs (T253-a)
- 42 screen and shot harnesses in scripts/ and scripts/ai/ (CARTA_PORT, commit 7b4a871)
- scripts/verify_explore.mjs, verify_mountains.mjs, verify_places_tab.mjs, verify_trips.mjs, verify_account_panel.mjs, verify_admin_panel.mjs, verify_guides.mjs, verify_saved.mjs
- scripts/perf/baseline_vitals.mjs

**Created:**
- scripts/verify_flight_est_ui.mjs (the existing verify_flight_estimates.mjs checks pricing maths and was left alone)

**Deleted:**
- scripts/verify_reach_filter.mjs (its component, ReachFilter.jsx, was removed in T027)

The root repo carries only this report and the register edit.

## Commands run

From continent-app in the worktree. The dev server was started on 5202 with the Supabase variables from the main checkout's .env exported into its environment (never copied into the worktree), because the account and admin harnesses seed a session for that project:

    set -a; . "../../Travel App/continent-app/.env"; set +a
    npx vite --config scripts/_probe/vite.t266.mjs --port 5202 --strictPort
    CARTA_PORT=5202 node scripts/verify_explore.mjs
    (the same for verify_mountains, verify_places_tab, verify_trips, verify_account_panel,
     verify_admin_panel, verify_guides, verify_saved, verify_flight_est_ui)
    LAYERS=1 OFFLINE=1 RUNS=1 PIC=off ONLY=beach-page:pic-off node scripts/perf/baseline_vitals.mjs

The vite config in scripts/_probe was a throwaway that only moved cacheDir to a private folder, because another session shares node_modules/.vite and kept invalidating it. It and the generated report were deleted before the last commit.

## Config and secrets set

None committed. The harnesses read CARTA_PORT (a port number, default as before). baseline_vitals.mjs reads LAYERS, PIC, CDN_DIR, CDN_PORT, PACE and OFFLINE, all optional.

## Before/after measurements

| Harness | Before | After |
|---|---|---|
| verify_explore.mjs | 28 of 30 checks, both passes timed out | 67 of 67 |
| verify_mountains.mjs | click timeout on the filter chips | all checks passed |
| verify_places_tab.mjs | threw at the country step | all checks passed (now with the city-day price rule) |
| verify_trips.mjs | threw on selectOption | 42 of 42 |
| verify_account_panel.mjs | failed at its 380px section | passed, including 380px |
| verify_admin_panel.mjs | failed step 11; had no Guides, Reports, Unpublish, Dismiss or complaints steps | passed with the new steps and the 380px pass |
| verify_guides.mjs, verify_saved.mjs | passed, without the report form and the statement | passed with both |
| verify_flight_est_ui.mjs | did not exist | passed on desktop and phone |

Each of these passed at least once on the final tree. They did not pass every time: with ten sessions running on this machine the Vite dev server answered in 4 to 100 seconds, and a run then failed on a first page.goto or a 15 second waitFor. Every failure I chased to its cause was that, not a check. Screenshot determinism (T062-g) was not shown: the compared runs were mixed with timed-out ones, so the figure is not measured.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Explore phone pass found 0 cards | The bottom nav mounts after the catalogue boots, later than the 2.5 s the harness waited, so the Explore tab was never clicked | Wait for the nav item |
| Explore "narrows live" check read a count that is gone | The bar has no count since Explore v5, and the tier legend counts the whole catalogue | Count the non-village cards on screen instead |
| verify_trips sight photo never loaded | Sights moved behind each day's "more about the day" toggle and the images are lazy | Open the first toggle and scroll to the photo |
| verify_places_tab near-mode check failed | On Trips a style card has no distance | Run it on Trails |
| Non-admin hub "changed shape" (T042-d) | Ten doors now, not eight, and the Lifestyle door has a second line of text | Assert the ten names |
| verify_guides final send never completed | The form keeps what was typed across Cancel, including the bad address | Clear the optional email first |
| Account and admin harnesses failed in step 1 on a dev server | The worktree has no .env, so Supabase was not configured | Export the variables from the main checkout into the server's environment |
| A fixed-time clock stopped the admin app loading | page.clock.setFixedTime broke its session timers | Dropped it; screenshots wait for fonts and stop transitions instead |
| verify_fare_provenance.mjs | Built on the removed map results list and a no-tilde baseline that T256 reversed | Not repaired, row T266-b |

## What is still open

T054-i stays open: its harness half is done (ports, trips, explore), but the destination page phone overflow, the country_brief phone click and the REGIONS.md pointers were not touched, and the CORS and prune halves are not harness work (row T266-a). T062-g stays open: screenshots now stop their own transitions, wait for fonts and settle, and the contexts ask for reduced motion, but two runs were never compared cleanly, so determinism is unproven (row T266-c). verify_fare_provenance.mjs is stale (row T266-b). The comment in urlState.js still says "(see ReachFilter)" (row T266-d). Not checked: the Reports tab "Open owner" hand-off, the too_many answer of the guide report form, and the statement of reasons against the real (not mocked) RPC (row T266-e).

## Rollback procedure

Every change is a script in the app repo. Revert the eleven T266 commits on p4-d3-harness-repairs (git revert, or reset the branch to 35179e5), then revert the root commit that carries this report and the register edit. Nothing else needs undoing: no migration, no data, no config, no dependency.
