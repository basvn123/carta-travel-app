-- Day-plan cloud sync (standalone day plans + per-plan picks and prefs).
-- Run this once in your Supabase project's SQL Editor, after 002_trip_plans.sql.
-- Additive only. Day plans keep working from localStorage for guests; this
-- table lets a signed-in account carry them across devices.

-- One row per plan id per user. plan_id is text because day plans are keyed
-- three ways in the app: 'local:<ms>' for standalone plans, a trip_plans uuid
-- for day picks attached to a saved trip, and 'tripdraft' for the unsaved
-- draft (the app never syncs that last one, but the shape allows it).
-- payload: { plan: {...}|null, assignments: {...}, prefs: {...}|null }
-- deleted_at is a tombstone: a delete on one device must also delete on the
-- next device, not get resurrected by its older local copy.
create table if not exists public.day_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, plan_id)
);

create index if not exists day_plans_user_id_idx on public.day_plans(user_id);

alter table public.day_plans enable row level security;

-- drop-then-create rather than a bare create, so re-running this file on a
-- project that already has the table is a no-op instead of a 42710. Postgres
-- has no `create policy if not exists`, and the later migrations in this
-- directory all use this shape for the same reason.
drop policy if exists "day_plans_select_own" on public.day_plans;
create policy "day_plans_select_own" on public.day_plans
  for select using (auth.uid() = user_id);
drop policy if exists "day_plans_insert_own" on public.day_plans;
create policy "day_plans_insert_own" on public.day_plans
  for insert with check (auth.uid() = user_id);
drop policy if exists "day_plans_update_own" on public.day_plans;
create policy "day_plans_update_own" on public.day_plans
  for update using (auth.uid() = user_id);
drop policy if exists "day_plans_delete_own" on public.day_plans;
create policy "day_plans_delete_own" on public.day_plans
  for delete using (auth.uid() = user_id);

-- PostgREST caches the schema, and a table it has not noticed answers 404
-- PGRST205, which is indistinguishable from the table not existing at all.
-- That is exactly the false trail this migration was chased down, so it now
-- ends by telling PostgREST to look again.
notify pgrst, 'reload schema';
