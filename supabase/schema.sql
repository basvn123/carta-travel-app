-- Carta accounts: saved trips + saved settings.
-- Run this once in your Supabase project's SQL Editor (Project -> SQL Editor -> New query).
-- Auth itself (users, passwords, email confirmation, password reset) is handled
-- entirely by Supabase's built-in `auth.users` table - nothing to create for that.

create extension if not exists "pgcrypto";

-- One row per destination a user has bookmarked with full trip details
-- (dates, group size, baggage, lifestyle spend, etc.) so they can reopen it later.
create table if not exists public.saved_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_id text not null,
  city text not null,
  country text,
  depart_date date,
  return_date date,
  choices jsonb not null default '{}'::jsonb,
  label text,
  created_at timestamptz not null default now()
);

create index if not exists saved_trips_user_id_idx on public.saved_trips(user_id);

alter table public.saved_trips enable row level security;

create policy "saved_trips_select_own" on public.saved_trips
  for select using (auth.uid() = user_id);
create policy "saved_trips_insert_own" on public.saved_trips
  for insert with check (auth.uid() = user_id);
create policy "saved_trips_delete_own" on public.saved_trips
  for delete using (auth.uid() = user_id);

-- One row per user: their last-used filters/preferences, restored on next login.
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "user_settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);
create policy "user_settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);
create policy "user_settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id);
