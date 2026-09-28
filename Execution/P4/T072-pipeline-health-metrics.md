# T072: Pipeline health metrics on admin_health()

## Task ID

T072

## Date

2026-09-28

## What changed

Before this task the pipeline's own health lived only in a terminal window and in logs/pipeline_state.json on whoever's machine ran it. If run_pipeline.py had a bad week nobody outside that terminal would know, and admin_health had nothing to say about the catalogue's freshness: 16 fields, one boolean per table, edge_errors the newest. Now run_pipeline.py writes one row to a new Supabase table, pipeline_runs, at the end of every run, whether the run succeeded or not, and admin_health carries a 17th field naming that table. A new reader, admin_pipeline_health(), returns the most recent run flattened: when it finished, how many hours ago, which task keys ran, were skipped, failed or soft-failed, a row count per layer (beaches, lakes, mountains, trails, cycling, regions), and the fare model's drift-gate verdict. The admin Overview tab shows it in a new card, and picks up an adjacent open item (T071-c) by also showing the AI-failure report that had a ready client function and no screen.

The write is a plain HTTP POST from Python to PostgREST with a service-role key, no Supabase client library, gated on two new environment variables the same way the existing heartbeat() is gated on CARTA_HEARTBEAT_URL: absent, it logs one line and does nothing; present, a failure to reach Supabase is logged and never fails the pipeline run. That shape is deliberate. The prompt that named this task says the plan depends on P3 having moved the pipeline to Hetzner; it has not (T046 to T048 shipped the infra code, not the move), so the mechanism had to work unchanged regardless of which machine calls it. A plain HTTP POST does that; a mechanism that assumed a systemd service or a mounted secrets file would not have.

## Files touched

All paths from the repo root. App files are committed in both repos.

**Created:**
- `supabase/migrations/041_pipeline_health.sql`
- `continent-app/src/components/admin/PipelineHealth.jsx`
- `continent-app/src/components/admin/EdgeErrors.jsx`
- `continent-app/scripts/admin/test_pipeline_health.mjs`
- `Execution/P4/T072-pipeline-health-metrics.md`

**Modified:**
- `run_pipeline.py` (new: `DRIFT_REPORT` path constant, `_LAYER_INDEX_FIELDS`, `layer_row_counts()`, `read_drift_gate()`, `report_pipeline_run()`, one call at the end of `main()`)
- `continent-app/src/auth/admin.js` (`adminPipelineHealth`)
- `continent-app/src/components/admin/useOverview.js` (`pipelineHealth`, `edgeErrors` state)
- `continent-app/src/components/admin/Overview.jsx` (renders the two new cards)

## Commands run

```
git checkout -b p4-pipeline-health-metrics
git -C continent-app checkout -b p4-pipeline-health-metrics

# throwaway cluster (Git Bash); $S is the session scratchpad
"/c/Program Files/PostgreSQL/18/bin/initdb.exe" -D "$S/pg72" -U postgres --auth=trust -E UTF8
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg72" -o "-p 55434" -l "$S/pg72.log" -w start
PGPORT=55434 PSQL="/c/Program Files/PostgreSQL/18/bin/psql.exe" node continent-app/scripts/admin/test_pipeline_health.mjs
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg72" -w stop
rm -rf "$S/pg72" "$S/pg72.log"

# Python-level check of the write step, no database involved:
#   1. layer_row_counts() and read_drift_gate() against the real
#      continent-app/public and logs/drift_report.json on this machine
#   2. report_pipeline_run() with no env vars: logs a skip line, no exception
#   3. report_pipeline_run() against a local http.server standing in for
#      PostgREST: asserts the path, the apikey/Authorization headers and
#      the JSON body (ran/skipped/failed/soft_failed/layer_counts/
#      drift_gate/dest_count)
"/c/Program Files/Python311/python" -c "..."   # ad hoc, not committed

# continent-app/
npx eslint src/components/admin/PipelineHealth.jsx src/components/admin/EdgeErrors.jsx src/components/admin/Overview.jsx src/components/admin/useOverview.js src/auth/admin.js
npm run build
npm test
```

The SQL test harness is sliced from `test_edge_errors.mjs` (T071) the same way that file was sliced from `test_admin_unpublish_guide.mjs` (T069): the STUBS block, the psql helpers and the migration chain (002, 004, 006, 007, 009, 010, 011, 014 to 018 with the {5,255} patched copy of 018 from T031-d, 032 to 034, then 040) are unchanged; the seed, the role helpers and every assertion from "before 041" onward are new.

One thing the harness needed that T071's did not: `service_role` in real Supabase has the `BYPASSRLS` attribute, set at project provisioning, not by any migration in this repo. A plain `create role service_role nologin` (what the shared STUBS block had been doing) does not have it, so the writer's own insert was refused by pipeline_runs' RLS-on-no-policies the same way an ordinary authenticated caller would be, which is not what happens live. The stub now does `create role service_role nologin bypassrls`, and because Postgres roles are cluster-wide rather than per-database, the harness also puts it back to `nobypassrls` in its `finally` block so a sibling file, `test_site_config_visibility.mjs`, which deliberately asserts `service_role` is neither superuser nor bypassrls for a different reason (that admin RPCs do not rely on it), is not left depending on run order.

## Config and secrets set

None on the live project. Two new environment variables the write step reads and that nothing sets yet:

- `CARTA_SUPABASE_URL` - the project's REST base, e.g. `https://ntssxktaduxzpsmejwyv.supabase.co`.
- `CARTA_SUPABASE_SERVICE_KEY` - the service role key. Deliberately not the app's `VITE_SUPABASE_*` pair (`continent-app/.env`), which ships to the browser; this one is set only in the environment that runs `run_pipeline.py`. Not added to `.env.example` in this task: that file is not named in the task's declared scope, and the two vars are noted here instead. Whoever sets them up should add the pair to `.env.example` at the repo root, following the existing convention for pipeline-only secrets there.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| admin_health table fields | 16 | 17 | +1 |
| Overview cards that show catalogue freshness | 0 | 1 (Pipeline health) | +1 |
| Overview cards that show AI failures (T071-c) | 0 | 1 (AI failures) | +1 |
| Layers with a published row count in admin_health's reach | 0 | 6 (beaches, lakes, mountains, trails, cycling, regions) | +6 |
| SQL test assertions (test_pipeline_health.mjs) | 0 | 46 of 46 | +46 |
| npm test | 92 of 92 | 92 of 92 | 0 |
| npm run build | passes | passes | 0 |

Layer counts read from the real `continent-app/public` on this machine while testing `layer_row_counts()`: beaches 2,746, lakes 1,681, mountains 740, trails 17,619, cycling 506, regions 4,849. These are today's published wire, not a measurement the task promised to move; they are here so a future report can compare.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| service_role's insert into pipeline_runs was refused by RLS in the test harness | The STUBS block created `service_role` as a plain role; real Supabase's service_role has BYPASSRLS, set at provisioning, not by any migration | `create role service_role nologin bypassrls` in the stub, reverted to `nobypassrls` in the harness's `finally` block because roles are cluster-wide and a sibling test file depends on the opposite |
| A leftover `service_role` from an earlier test file's run kept the wrong attribute even after the fix | `if not exists` only sets bypassrls on first creation; the role already existed on the shared cluster without it | Added an `else alter role service_role bypassrls` branch so every run of this file brings it in line regardless of what an earlier file left behind |

## What is still open

CARTA_SUPABASE_URL and CARTA_SUPABASE_SERVICE_KEY are not set anywhere yet, on the laptop or anywhere else, so no real run will report until the owner sets them (T072-a, owner: a secret, only the owner can place it). Until then, and until migration 041 is pasted into the live SQL editor (T072-b, owner: the same paste step T071-a already asked for), the Overview card reads `{"hasRun": false}` and admin_health names pipeline_runs as missing, exactly like every other unapplied-migration gap in this admin surface.

The write step was tested at the unit level: `layer_row_counts()` and `read_drift_gate()` against the real files on this machine, and `report_pipeline_run()` against a fake local HTTP server standing in for PostgREST. It was never run inside an actual `run_pipeline.py` execution, because the prompt says not to run the full pipeline (T072-c, next task: run `run_pipeline.py --only <something cheap>` with the two env vars set against a throwaway Supabase project or a local PostgREST, once one exists, and confirm a real row lands).

The layer list in `_LAYER_INDEX_FIELDS` (beaches, lakes, mountains, trails, cycling) plus the regions directory count are the layers with a published wire under `continent-app/public` today. Other layers named in run_pipeline.py's task list, trips, crowding, bathing_water, lodging, geonames, nature, climate, unesco, guide, images, events, parking, activities, overture, are not published as their own top-level wire the same way and are not counted here; a later task can decide whether any of them deserves a count of its own (T072-d, next task).

The Overview card was built and read against the real component tree (build passes, lint passes, `npm test` passes), but was not opened in a running browser signed in as an admin, because no unapplied migration in this branch, 041 included, is live: `npm run dev` would show the panel refusing everything below auth the same way it does today, which proves nothing new. The next task that pastes 021 to 041 into a real project (or the owner, when they do the paste) should open the Overview tab once and look at both new cards with real or seeded data.

`export_user_data` (024) does not include pipeline_runs; it does not need to, since the table carries no user_id and is not personal data, so this is noted only to close the loop, not as an open item.

## Rollback procedure

Live, if 041 has been pasted, run its down section:

```
drop function if exists public.admin_pipeline_health();
drop table if exists public.pipeline_runs;
-- then paste 040's admin_health block again (optional: without it the
-- panel lists pipeline_runs as missing)
notify pgrst, 'reload schema';
```

Dropping the table deletes the stored run history; that is intended, it is operational telemetry, not user data.

The write step is inert with no environment variables set, so removing `report_pipeline_run()`'s call site in `run_pipeline.py` (or simply never setting CARTA_SUPABASE_URL / CARTA_SUPABASE_SERVICE_KEY) is a complete and safe rollback of the pipeline side with nothing further to undo.

In git:

```
git -C continent-app revert bf48a25
git revert af8abe44f
```

or drop the branch `p4-pipeline-health-metrics` in both repos before merge. Reverting the app without the migration leaves `adminPipelineHealth` unused; reverting the migration without the app leaves the write step posting to an endpoint that answers "could not find the table," logged and ignored, the same as before 041 is pasted.
