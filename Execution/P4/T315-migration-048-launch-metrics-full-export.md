# T315: migration 048, launch metrics and the full GDPR export

## Task ID

T315 (register rows T215-b, T215-c, T215-d, T300-i, T270-d; no mind-map prompt). Branch p4-migration-048 in the root repo and in continent-app.

## Date

2026-10-03

## What changed

One new migration, supabase/migrations/048_launch_metrics_and_full_export.sql, gives the three missing launch numbers an instrument and widens the GDPR export to every table that holds a traveller's rows. The app writes the three numbers and the admin Overview reads them. Nothing is pasted anywhere: the owner pastes 048 after 047 at _OPEN-MASTER stage 2.2 (row T315-a).

The three numbers live in one table, public.launch_counts, which holds one integer per day per (event, target, surface) and nothing else. There is no user column, no time of day, no page and no device, so it is not personal data and is not in the export. This is the shape T214 asked for: a first-party RPC, no identifier, guests included, capped per day, no script, so still no consent banner. A row per event was rejected on purpose, because a microsecond timestamp next to a sub-ID is already half a session trail. The writer, launch_count(event, target, surface), is open to anon and authenticated, never raises, drops unknown events and unknown partners, cleans the surface to [a-z0-9_-] and 32 characters, and stops at 200,000 ticks a day in all and 2,000 distinct keys a day (so a loop that invents a sub-ID per call cannot grow the table). The reader, admin_launch_metrics(days), is on admin_guard('read') and returns counts only.

T215-b, priced trips. GuidedTripWizard's finish() ticks trip_priced once when the traveller presses the last button and the priced trip opens in the planner: surface 'ready' for a published journey, 'built' for a trip put together in the wizard. That is the one place a priced trip is completed; loading a saved trip is not a completion.

T215-c, affiliate clicks. The partner links are rendered in many components, so one capture-phase listener on the document (installed from main.jsx) counts a click or a middle click on any anchor whose href carries this build's own decoration. Each of affiliate.js, omio.js and activityAffiliates.js gained a small reverse parser (aviasalesClickOf, omioClickOf, activityClickOf) that recognises only the marker, tracking link or partner id the module itself adds, and returns the partner and the sub-ID it already carries for the partner's dashboard ('leg', 'wiz_inter', 'dest-book', 'dest-do'). An undecorated link is never counted, because it cannot earn. A link inside an exported PDF is outside the app and is not counted. The local .env sets no partner id, so until the owner sets them in the build (row T315-b) the count stays at zero, which is the honest answer.

T215-d, the error rate. The three AI wrappers (aiDayPlan.js, aiCitySuggest.js, bookingImport.js) tick ai_call just before they invoke the function, so the AI failures card has a denominator observed by the same client that records the numerator (040). Both count signed-in callers only: the writer drops a guest ai_call, reading auth.uid() as a yes or no and storing nothing of it. The rate counts both from countedSince, the first day in the window with a counted call, so the weeks of failures before 048 is pasted cannot inflate it; with no counted call the rate is null and the card hides the tile rather than showing 0%. The plan in docs/LAUNCH-METRICS.md was to divide by plan plus ground units from admin_ai_usage, but those units are consumed by ai_consume, which 044 replaces and which parse-booking does not go through, so a client-side count is both closer to the numerator and free of 044. Whether client errors are in scope: render crashes are, and 047 already stores them under their own crashes key and keeps them off the AI card (a crash is a fault in the build, an AI failure is a fault in a model); T284-b draws them. Other browser errors (an unhandled rejection, window.onerror) are not recorded and should not be for launch: there is nothing to act on without a stack, and a stack is the kind of payload T214 ruled out.

T300-i, the export. export_user_data() goes to schema 3, starting from 045's body with every key and field kept (tripPlans gains visibility and publishedAt). New keys: profile, dayPlans (whole payloads, tombstones included because the rows are still held), tripShares, coplanners, friends, entitlement, passGrants, aiUsage (007's period counters, 006's legacy per-day ledger, and 044's ai_usage_days once 044 is pasted), aiModelEvents, parseFailures, achievements, feedback, reportsFiled, moderationStatements and accountActions (what an admin did to the account, action and time only). A friend's or co-planner's handle appears only where row level security already shows the caller that profile, a pending or accepted link (012); no other person's user id is ever in the file. Left out on purpose: guide_views (a daily-salted hash, unattributable), content_reports.source_hash, the admins' own ids on handled_by, decided_by and actor, the per-day totals, and admin_users (an admin's own membership row; harmless to add later).

The guard against 044 holds. 048 re-creates no function 044 creates or replaces. The three columns 044 adds to pass_grants are read through to_jsonb(row), which answers null for a missing column, and ai_usage_days is read through EXECUTE only when to_regclass finds it, so the body compiles and runs on both sides of 044. This was proven by applying 002 to 047 without 044, then 048, then 044, then 048 again: every self-check notice came back, and with a row in ai_usage_days the export showed it under aiUsage.byDay.

T270-d stays open. The row allows a revert action only if one RPC can undo every audited kind, and none can: delete_user erases the account (005), and view_user, note and mfa_refused changed nothing to undo. Only set_config and override_set or override_clear carry a before-and-after pair (033). Whether a revert limited to those is wanted is an owner decision (row T315-e).

On screen: a new Overview card, "Priced trips and partner clicks", sits after the active-users block and before the paywall funnel, with four tiles, a per-day chart, clicks by partner and clicks by surface. The AI failures card gains a Failure rate tile, an AI calls tile and one line naming the failures, the calls, the start day and the per-function rates. Both use the existing adminpage classes only; no CSS and no i18n changed (the admin page is English only).

## Files touched

**Created (root):**
- supabase/migrations/048_launch_metrics_and_full_export.sql
- Execution/P4/T315-migration-048-launch-metrics-full-export.md

**Modified (root):**
- docs/LAUNCH-METRICS.md (three rows from Gap or Partial to the new sources, the Overview order, the migration list, the reading note on the rate)
- Execution/_OPEN.md (T215-b, T215-c, T215-d, T300-i closed by T315; T315-a to T315-e added)

**Created (app, continent-app):**
- src/lib/launchEvents.js
- src/components/admin/LaunchMetrics.jsx

**Modified (app):**
- src/main.jsx (installs the click listener)
- src/lib/affiliate.js, src/lib/omio.js, src/lib/activityAffiliates.js (one reverse parser each)
- src/planner/GuidedTripWizard.jsx (the trip_priced tick in finish)
- src/planner/aiDayPlan.js, src/planner/aiCitySuggest.js, src/planner/bookingImport.js (the ai_call tick)
- src/auth/admin.js (adminLaunchMetrics)
- src/components/admin/useOverview.js, Overview.jsx, EdgeErrors.jsx
- scripts/admin/test_admin_rpc_security.mjs (floors to 41 functions and 47 migrations, section 11)
- scripts/admin/test_rls_policies.mjs (sections 4c and 4d)
- scripts/verify_admin_panel.mjs (stubs for admin_launch_metrics and admin_edge_errors, the check in 10b, card screenshots at both widths)

No existing migration, no i18n file, no styles.css, nothing in rule 4's list.

## Commands run

Git Bash. $S is the session scratchpad; $M is C:/Users/Gebruiker/Documents/Portfolio/wt/T315/supabase/migrations.

```
"/c/Program Files/PostgreSQL/18/bin/initdb.exe" -D "$S/pg315" -U postgres --auth=trust -E UTF8
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg315" -o "-p 55448" -l "$S/pg315.log" -w start

# from wt/T315-app, before (HEAD) and after
PGPORT=55448 CARTA_MIGRATIONS_DIR=$M node scripts/admin/test_admin_rpc_security.mjs
PGPORT=55448 CARTA_MIGRATIONS=$M node scripts/admin/test_rls_policies.mjs
PGPORT=55448 CARTA_MIGRATIONS_DIR=$M node scripts/admin/test_admin_followups.mjs

# mutation: the extended harnesses against a copy of the migrations without 048
PGPORT=55448 CARTA_MIGRATIONS_DIR=$S/mig_no048 node scripts/admin/test_admin_rpc_security.mjs
PGPORT=55448 CARTA_MIGRATIONS=$S/mig_no048 node scripts/admin/test_rls_policies.mjs

# paste order (scratch script $S/mkdb.sh): 002 to 047 without 044, then 048, 044, 048
bash $S/mkdb.sh order315 '^044_'
psql -p 55448 -d order315 -f $M/044_payments_quota.sql
psql -p 55448 -d order315 -f $M/048_launch_metrics_and_full_export.sql

# browser: vite dev on 5208 (config outside the repo, wt/vite.t315.mjs), the two
# public VITE_SUPABASE_* values passed from the main checkout's .env as environment
npx vite --config ../vite.t315.mjs --port 5208 --strictPort --host 127.0.0.1
VERIFY_PORT=5208 node scripts/verify_admin_panel.mjs
# verify_planner_t8.mjs run once from a temporary copy that also captured the
# launch_count requests (copy deleted), against http://127.0.0.1:5208/
# a temporary click probe at 380px and 1440px with a test Omio link and GYG id
# set only in the dev server's environment (deleted)

npx eslint <the changed files>; npm run lint
npx vite build --config ../vite.t315.mjs; rm -rf dist dist-data
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg315" -w stop
```

## Config and secrets set

None committed. For the click probe only, the dev server ran with VITE_OMIO_TRACKING_LINK=https://omio.sjv.io/c/1111/2222/3333 and VITE_GYG_PARTNER_ID=T315TEST in its environment; both are fake and were never written to a file.

## Before/after measurements

Database figures from the throwaway PostgreSQL 18 on 55448 with every migration applied in filename order; the live project was not touched.

| Metric | Before | After | Delta |
|---|---|---|---|
| Launch metrics in docs/LAUNCH-METRICS.md marked Gap or Partial | 3 | 0 | -3 |
| Public tables with a user column on auth.users that the export reads (of 21) | 4 | 20 | +16 |
| Top-level data keys in the export | 5 (schema 2) | 20 (schema 3) | +15 |
| admin_* functions discovered | 40 | 41 | +1 |
| test_admin_rpc_security.mjs assertions, all passing | 183 | 201 | +18 |
| test_rls_policies.mjs assertions, all passing | 355 | 397 | +42 |
| test_admin_followups.mjs assertions, all passing | 86 | 86 | 0 |
| Harnesses against the stack without 048: failing assertions | | admin 3 (run aborts in section 11), RLS 5 | |
| verify_admin_panel.mjs at 1440px and 380px | | 61 ok, 0 failures | |
| verify_planner_t8.mjs | | 41 of 41, one trip_priced 'ready' tick sent on finish | |
| Click probe, both widths: ticks for 6 clicks (decorated Omio twice inside 1.5 s, plain Omio, decorated GYG, foreign GYG id, GYG middle click) | | 3 (omio/leg, getyourguide/dest-book twice) | |

test_admin_followups.mjs stays at 86 and still asserts schema 2. That is correct and worth knowing: it pastes 045 a second time at the end, which is exactly the re-paste trap the 048 header names, so the export it calls is 045's again.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| 048's first apply stopped in its self-check ("could refer to either a PL/pgSQL variable or a table column") | The self-check declared a variable n, and launch_counts has a column n | Renamed the variable to v_cnt |
| The RLS export check failed on the victim's display name | The profiles fixture's owner control updates display_name to 'tampered' | Compare on the handle instead |
| Vite would not start from a config in the scratchpad, then from wt/ | The config imported 'vite' from a folder with no node_modules | Imported vite by its absolute file URL, as the T314 config does |
| The first admin harness run timed out waiting for the app | Cold dependency bundling took about 90 seconds under the parallel sessions' load | Reran once warm; the app loaded in 4 s |
| A borrowed run of verify_booked_route.mjs failed ("expected three steps with stays booked, got 6") | That harness predates the current wizard; not this task | Used verify_planner_t8.mjs instead; not fixed here |

## What is still open

T315-a (user). Paste 048 in the SQL editor at _OPEN-MASTER stage 2.2, after 047 (row 16). 044 may come before or after it. Look for "launch metrics and full export self-check passed". Re-pasting 024 or 045 later puts the export back to schema 1 or 2; paste 048 again after either. Until the paste, every tick answers "function not found" and is dropped, the Launch card and the rate tile hide themselves, and the export stays schema 2.

T315-b (user). Clicks are counted only on decorated links. The local .env has VITE_TP_MARKER and VITE_OMIO_TRACKING_LINK empty and no GYG or Viator id; whether the Cloudflare Pages build sets any was not checked. Without them the click count is zero by construction.

T315-c (next task). account.exportHint in the six locales still says the file holds trips, stops and pass offers. Schema 3 holds much more; the hint should name day plans, profile, friends, purchases and the account history. An i18n edit, so it was left out of a migration task.

T315-d (user). The privacy policy was not changed. The counters are not personal data, but one sentence saying they exist, and one naming what the export now holds, would keep the policy complete. Owner approves the wording, as T270-a did.

T315-e (user), with T270-d still open. A revert on the Audit tab can only ever cover set_config, override_set and override_clear. If the owner wants that partial revert, it is a later migration and a button; if not, T270-d can be closed as declined.

For the orchestrator: T314 (session 7) may have raised a register row asking migration 048 for a refund-exposure RPC (T032-d). This session could not see it and 048 does not contain it; that RPC belongs in 049 or later. main.jsx gained three lines and Overview.jsx and useOverview.js gained a card; T271 and T314 may touch the same files, so expect small merge conflicts there.

## Rollback procedure

Before the paste: do not merge p4-migration-048, or `git revert` the T315 commit in the root repo and the T315 commit in continent-app. Nothing else changed.

After the paste: run the DOWN block in the 048 header. It drops admin_launch_metrics, launch_count, launch_daily_total and launch_counts, then has you paste section 7 of 045 (export_user_data schema 2 with its revoke and grant lines). It is one-way for the counters only: the daily counts are lost. No traveller data is touched, because 048 only reads it. The app keeps working on either side of the down: the ticks are fire and forget, the card and the rate tile hide when their function is missing, and the export download takes any schema. Revert the app commit to remove the ticks and the card.
