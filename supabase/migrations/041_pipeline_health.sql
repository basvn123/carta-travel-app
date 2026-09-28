-- 041_pipeline_health.sql
--
-- Pipeline health: the admin panel learns when the catalogue was last built,
-- how big each natural-feature layer is, and whether the fare model's drift
-- gate is clean, so a stale run is visible without opening a terminal.
--
-- WHY. run_pipeline.py runs on the owner's laptop today (T046 to T048 shipped
-- the Hetzner infra code but the pipeline itself has not moved; see Execution/
-- P3). On a laptop a failed or skipped run is loud: the console sits there.
-- Once the pipeline runs unattended on a box nobody is watching, the same
-- failure is silent. The plan (Carta BackEnd.md, Phase 4) asks admin_health
-- to carry the last successful run, the row counts per layer and the
-- drift-gate result, so staleness shows up on a screen someone actually
-- opens.
--
-- WHY A TABLE THE PIPELINE WRITES, NOT A SCAN admin_health DOES ITSELF. Postgres
-- cannot read public/beaches/index.json or logs/drift_report.json; those live
-- on the machine that ran the pipeline, not in the database. So the write has
-- to happen at the end of the run, from wherever that run happens to be. A
-- small table that one write step upserts is the same shape as 028's
-- ai_model_events and 029's ai_cache_events: service_role inserts, admins
-- read through a definer RPC, no policies, RLS on.
--
-- WHAT IT ADDS.
--
--   public.pipeline_runs   one row per pipeline run: when it finished, ran /
--                          skipped / failed / soft-failed task keys, per-layer
--                          row counts (jsonb), and the drift-gate verdict
--                          (jsonb, mirrors logs/drift_report.json). service_role
--                          insert only, no update, no delete from the API.
--   public.admin_pipeline_health()
--                          the reader. Returns the most recent row, flattened,
--                          plus how many hours old it is. read tier.
--   public.admin_health()  041's body, with pipeline_runs added to the table
--                          list (016's pattern, continued by 040).
--
-- WHAT THIS DOES NOT DO. It does not move the pipeline to Hetzner (that is
-- P3's job, not done: see Execution/P3 and CLAUDE.md's Hetzner batch note).
-- It does not run the pipeline; run_pipeline.py's write step was tested at
-- the unit level (continent-app/scripts/admin/test_pipeline_health.mjs and a
-- one-off Python call), not against a real run. It does not touch the
-- estimation model or the drift threshold logic in src/estimation/drift.py;
-- it only reads the report drift.py already writes.
--
-- Apply in the Supabase SQL editor for ntssxktaduxzpsmejwyv. Never `db push`.
-- Requires 015 (admin_guard) and 040 (admin_health, which this re-creates).
--
-- DOWN (paste in this order):
--   drop function if exists public.admin_pipeline_health();
--   drop table if exists public.pipeline_runs;
--   -- then paste 040's admin_health block again to take pipeline_runs off
--   -- the list (harmless if skipped: the panel names it as missing)
--   notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- The store. One row per run. service_role inserts at the end of
-- run_pipeline.py; nothing else writes it.
-- ---------------------------------------------------------------------------
create table if not exists public.pipeline_runs (
  id           bigint generated always as identity primary key,
  finished_at  timestamptz not null default now(),
  -- The task keys from run_pipeline.py's TASKS list, exactly as it logs them
  -- at the end of main(): ran, skipped (guard refused or held), failed
  -- (stopped the ship), soft_failed (estimation/ingestion layer, retried
  -- next run). Arrays of text, not jsonb: order matches the run's own log.
  ran          text[] not null default '{}',
  skipped      text[] not null default '{}',
  failed       text[] not null default '{}',
  soft_failed  text[] not null default '{}',
  -- Row counts per layer, read from each layer's own published index.json
  -- (n_beaches, n_lakes, n_mountains, n_trips, n_routes) or counted from its
  -- published directory (regions has no index.json). One flat object,
  -- {"beaches": 2456, "lakes": ...}, so a new layer needs no migration to
  -- start reporting, only a change to the write step.
  layer_counts jsonb not null default '{}'::jsonb,
  -- Mirrors logs/drift_report.json: verdict (ok/minor/major/concept),
  -- action (none/warn/retrain), max_psi, worst_feature, the two MAPE figures.
  -- Null when the fare_model task did not run or the report file is absent
  -- (drift.py exit 2: no model or no snapshot yet), which the reader must
  -- tell apart from a clean "ok" gate.
  drift_gate   jsonb,
  -- dest_count() at the end of the run, for the same reason the log line
  -- prints it: the plainest single sanity check that a run actually did
  -- something.
  dest_count   int
);

create index if not exists pipeline_runs_finished_at_idx
  on public.pipeline_runs (finished_at desc);

alter table public.pipeline_runs enable row level security;
-- No policies, deliberately, as in 022, 028, 029: the only ways in are the
-- reader below and the service role.

-- ---------------------------------------------------------------------------
-- The reader. The most recent run, flattened, plus its age. read tier.
-- ---------------------------------------------------------------------------
create or replace function public.admin_pipeline_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err text := public.admin_guard('read');
  v_row public.pipeline_runs%rowtype;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  select * into v_row from public.pipeline_runs order by finished_at desc limit 1;

  if not found then
    return jsonb_build_object('hasRun', false);
  end if;

  return jsonb_build_object(
    'hasRun',        true,
    'finishedAt',    v_row.finished_at,
    'ageHours',      round(extract(epoch from (now() - v_row.finished_at)) / 3600.0, 1),
    'ran',           to_jsonb(v_row.ran),
    'skipped',       to_jsonb(v_row.skipped),
    'failed',        to_jsonb(v_row.failed),
    'softFailed',    to_jsonb(v_row.soft_failed),
    'ok',            cardinality(v_row.failed) = 0,
    'layerCounts',   v_row.layer_counts,
    'driftGate',     v_row.drift_gate,
    'destCount',     v_row.dest_count
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_health: 040's body, with pipeline_runs added to the list
-- ---------------------------------------------------------------------------
create or replace function public.admin_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err text := public.admin_guard('read');
  v_out jsonb := '{}'::jsonb;
  t     text;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  foreach t in array array[
    'profiles', 'entitlements', 'plan_tiers', 'pass_grants', 'ai_usage',
    'ai_daily_total', 'trip_plans', 'trip_plan_stops', 'day_plans',
    'friendships', 'trip_shares', 'user_achievements',
    'admin_users', 'admin_audit_log', 'site_config', 'edge_errors',
    'pipeline_runs'
  ] loop
    v_out := v_out || jsonb_build_object(
      t, to_regclass('public.' || t) is not null);
  end loop;

  return jsonb_build_object('tables', v_out);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- RLS is on with no policies, so nothing reads or writes pipeline_runs
-- through PostgREST except service_role, which bypasses RLS on this project
-- (set at Supabase provisioning, not by any migration here) the same way
-- 028's ai_model_events and 029's ai_cache_events rely on it. The insert
-- grant below is what makes service_role able to write once RLS is out of
-- its way; without bypassrls the grant alone would still be refused, the
-- same denial a plain authenticated caller gets.
--
-- Supabase default-grants every new table in public to anon and
-- authenticated; RLS with no policies already denies them, and this takes
-- the grant back as well (022's reasoning, continued by 028/029/040).
revoke all on public.pipeline_runs from anon, authenticated;
revoke all on sequence public.pipeline_runs_id_seq from anon, authenticated;

revoke all on table public.pipeline_runs from public, anon;
grant insert on table public.pipeline_runs to service_role;
grant select on table public.pipeline_runs to service_role;

revoke all on function public.admin_pipeline_health() from public, anon;
grant execute on function public.admin_pipeline_health() to authenticated, service_role;

revoke all on function public.admin_health() from public, anon;
grant execute on function public.admin_health() to authenticated, service_role;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  f       text;
  cfg     text[];
  v_count int;
begin
  -- The store is closed to clients: RLS on, no policies, no table grant.
  if not exists (
    select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relname = 'pipeline_runs' and c.relrowsecurity
  ) then
    raise exception 'pipeline_runs does not have row level security on';
  end if;
  select count(*) into v_count
    from pg_policies where schemaname = 'public' and tablename = 'pipeline_runs';
  if v_count <> 0 then
    raise exception 'pipeline_runs has % policies; it is meant to have none', v_count;
  end if;
  if exists (
    select 1 from information_schema.table_privileges
     where table_schema = 'public' and table_name = 'pipeline_runs'
       and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'a client role has direct table privileges on pipeline_runs';
  end if;

  -- Definer functions, empty search_path, no anon execute, authenticated yes.
  foreach f in array array[
    'public.admin_pipeline_health()',
    'public.admin_health()'
  ] loop
    if not (select prosecdef from pg_proc where oid = f::regprocedure::oid) then
      raise exception '% is not SECURITY DEFINER', f;
    end if;
    select proconfig into cfg from pg_proc where oid = f::regprocedure::oid;
    if cfg is null or not ('search_path=""' = any(cfg)) then
      raise exception '% does not pin search_path to empty (proconfig %)', f, cfg;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'anon can execute %', f;
    end if;
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'authenticated cannot execute %', f;
    end if;
  end loop;

  -- Applied from the SQL editor there is no session, so the reader must
  -- refuse and the writer must stay closed to authenticated (only
  -- service_role inserts; there is no RPC wrapper to check here).
  if (public.admin_pipeline_health() ->> 'error') is null then
    raise exception 'admin_pipeline_health answered a caller who is not an admin';
  end if;
  if (public.admin_health() ->> 'error') is null then
    raise exception 'admin_health answered a caller who is not an admin';
  end if;
  if has_table_privilege('authenticated', 'public.pipeline_runs', 'INSERT') then
    raise exception 'authenticated can insert into pipeline_runs; only service_role may';
  end if;

  raise notice 'pipeline health self-check passed';
end;
$$;
