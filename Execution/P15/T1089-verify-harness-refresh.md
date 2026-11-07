# T1089: Verify harness refresh (A3, row T1083-a)

## Date

2026-11-06

## What changed

On a booting dev server, 89 of the 98 runnable `continent-app/scripts/verify_*.mjs` harnesses failed (selectors left the app). After this task 52 of the 84 that remain pass or skip cleanly, 14 were retired to `continent-app/scripts/retired/` because the feature or markup is gone, and 32 still fail or time out and are filed as register rows. Fifteen register rows whose harness now passes or is retired moved to `_OPEN-CLOSED.md`. The done condition (every remaining harness passes) is not met. verify_csp, verify_data_host, verify_prerender, verify_trails_export and verify_admin_panel were not run (they need a build or another session owns them).

## Files touched

- `continent-app/scripts/verify_*.mjs`: about 60 edited, 14 moved to `continent-app/scripts/retired/` (each starts with a "Retired T1089" comment).
- New helpers: `continent-app/scripts/lib/authConfigured.mjs`, `lib/verify_env.mjs`, `lib/verify_planflow.mjs`.
- `Execution/_OPEN.md`, `Execution/_OPEN-CLOSED.md`, this report. No app source touched.

## Commands run

- `npm ci` in continent-app; the preinstalled Playwright 1.63 was linked over the 1.61 in node_modules (its browser build is the one in the container).
- `node scripts/sync-data.mjs --split-only` (builds `public/boot.json` and `public/dest/` from the 14 MB `public/app_data.json`; the 140 MB master is absent). Without it the app shows "couldn't load travel data" and every harness fails.
- Dev servers on 4173 and 4185; each harness: `CARTA_PORT=<port> node scripts/verify_X.mjs http://localhost:<port>/`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Harnesses failing (of 98 run) | 89 | 32 (of 84 remaining) | 57 fixed, skipped or retired |
| Passing or clean SKIP | 9 | 52 | +43 |
| Retired | 0 | 14 | +14 |

After figures come from one pass at 70 s each, then a rerun at 200 s of the 17 that timed out (4 more passed). Load from five agents on two servers caused some timeouts.

## What broke

Early runs showed 87 failures that were really an unbooted app (missing split data and the wrong Playwright build), so the first baselines were thrown away. Agents wrote probe directories into `scripts/`; two were committed in interim commits and removed again.

## What is still open

Register rows T1089-a to T1089-f. Failing now: country_brief, country_cards, desktop_shell, home, trail_page, trails, trip_price_consistency, day_landing, beaches, mountains, place_classes, pack_grid, paging, past_trip, paywall, paywall_funnel, origin_control, from_picker, destinations, friends, friend_badges (stale selectors, T1089-a); keyboard, quality_floor, lifestyle, omio_ui, phone_chrome, explore (slow or partial, T1089-b); lakes, cycling, photo_contract, journey_claims (data, T1089-c); url_scheme (passes for an agent given a dossier dir, fails in the bulk run). Skips never ran for real (T1089-f).

## Rollback

`git revert` the T1089 commits; retired files can be moved back from `scripts/retired/`.

## Owner steps (for the checklist)

- [T1089-f] Run the SKIPped harnesses for real | they skip here for lack of an account, a build, network or the full dataset | on the owner's box with Supabase configured and the 140 MB master present run `node scripts/sync-data.mjs`; build with the fast build; run verify_account_panel, continue_trip, data_export, status_banner, viewport_catalogue, omio_ui, joins, google_flights, day_routes and plan_mocks against `npm run dev`; report any failure | Execution/P15/T1089-verify-harness-refresh.md
