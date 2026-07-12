-- Multi-stop trip plans (Trip Planner / Day Planner feature).
-- Run this once in your Supabase project's SQL Editor, after schema.sql.
-- Additive only - does not touch saved_trips or user_settings, which keep
-- powering the existing single-destination "Save trip" flow unchanged.

create extension if not exists "pgcrypto";

-- One row per saved multi-city trip plan.
create table if not exists public.trip_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trip_plans_user_id_idx on public.trip_plans(user_id);

alter table public.trip_plans enable row level security;

create policy "trip_plans_select_own" on public.trip_plans
  for select using (auth.uid() = user_id);
create policy "trip_plans_insert_own" on public.trip_plans
  for insert with check (auth.uid() = user_id);
create policy "trip_plans_update_own" on public.trip_plans
  for update using (auth.uid() = user_id);
create policy "trip_plans_delete_own" on public.trip_plans
  for delete using (auth.uid() = user_id);

-- One row per stop within a trip plan, in visit order.
-- user_id is denormalized from the parent trip_plans row (set once at insert
-- time by the app, mirroring the direct auth.uid()=user_id RLS pattern used
-- everywhere else in this schema) rather than checked via a join/subquery.
create table if not exists public.trip_plan_stops (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position int not null,
  destination_id text not null,
  city text not null,
  country text,
  arrive_date date,
  depart_date date,
  transport_mode text,
  transport_notes jsonb,
  choices jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trip_plan_stops_trip_plan_id_idx on public.trip_plan_stops(trip_plan_id);
create index if not exists trip_plan_stops_user_id_idx on public.trip_plan_stops(user_id);

alter table public.trip_plan_stops enable row level security;

create policy "trip_plan_stops_select_own" on public.trip_plan_stops
  for select using (auth.uid() = user_id);
create policy "trip_plan_stops_insert_own" on public.trip_plan_stops
  for insert with check (auth.uid() = user_id);
create policy "trip_plan_stops_update_own" on public.trip_plan_stops
  for update using (auth.uid() = user_id);
create policy "trip_plan_stops_delete_own" on public.trip_plan_stops
  for delete using (auth.uid() = user_id);
