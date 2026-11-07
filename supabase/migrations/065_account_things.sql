-- 065_account_things.sql
--
-- Accounts that keep your work (T1104, ROADMAP I5). Until now four things a
-- traveller makes stayed in one browser: the trips kept from the trip finder
-- (carta.keptTrips.v1), Carta's own trips they bookmarked
-- (carta.savedJourneys.v1), the trips in progress on the Plan home
-- (carta.trips.v1) and the one trip kept without an account
-- (carta.deviceTrip.v1). Settings, the shortlist, saved lists and visited
-- countries already ride in user_settings (schema.sql), day plans in
-- day_plans (004), account trips in trip_plans (002) and chats in ask_chats
-- (054). This table carries the four that were left, so a signed-in
-- traveller's work follows them to a second device.
--
-- WHAT IT ADDS
--
--   account_things  one row per thing per user: kind ('kept', 'journey',
--                   'trip', 'device_trip'), the id the app made, the thing
--                   itself as a jsonb object, updated_at (the app's own
--                   stamp of the last change, the merge currency) and
--                   deleted_at as a tombstone, as day_plans and ask_chats
--                   do, so a thing removed on one device goes from the
--                   other too. A tombstone's body is emptied.
--   RLS             the owner reads and writes their own rows only; anon
--                   has no grant at all.
--   a cap           at most 1000 rows per account (the app keeps 24 kept
--                   trips and 200 bookmarks; trips in progress have no
--                   limit, tombstones count), and a body at most 256 KB, so
--                   a runaway client cannot fill the table.
--
-- The merge rule lives in the app (src/auth/accountSync.js, HANDBOOK
-- "Accounts that keep your work"); the database only stores rows and keeps
-- one account out of another's.
--
-- Data export: the app adds these rows to the export file itself, as it does
-- for ask_chats, so export_user_data() (024, 048) is not touched. Account
-- deletion removes them through the foreign key's cascade.
--
-- ORDER. Paste in the Supabase SQL editor after 064. Never `db push`
-- against the live project. Pasting twice is safe. Look for
-- "account things self-check passed". Then run
-- `node scripts/verify_live_policies.mjs` from continent-app/.
--
-- THE APP WITHOUT THIS FILE. The sync reads account_things on sign-in; a
-- missing table (PGRST205 or 42P01) turns the sync off for that visit and
-- the things stay on the device, exactly as before.
--
-- DOWN: 065_account_things_down.sql.

create table if not exists public.account_things (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  kind       text        not null check (kind in ('kept', 'journey', 'trip', 'device_trip')),
  item_id    text        not null check (item_id ~ '^[^[:cntrl:]]{1,120}$'),
  body       jsonb       not null default '{}'::jsonb
             check (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 262144),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, kind, item_id)
);

create index if not exists account_things_user_updated on public.account_things (user_id, updated_at desc);

alter table public.account_things enable row level security;

drop policy if exists "account_things_select_own" on public.account_things;
create policy "account_things_select_own" on public.account_things
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "account_things_insert_own" on public.account_things;
create policy "account_things_insert_own" on public.account_things
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "account_things_update_own" on public.account_things;
create policy "account_things_update_own" on public.account_things
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "account_things_delete_own" on public.account_things;
create policy "account_things_delete_own" on public.account_things
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.account_things from anon;
grant select, insert, update, delete on public.account_things to authenticated;

-- At most 1000 rows per account, counted on insert (an update of an existing
-- row, a tombstone included, never trips it). Security definer so the count
-- sees every row of the account whatever the caller's policies; the empty
-- search_path and the qualified name keep a caller's schema out of it (the
-- T1087 rule the RLS suite asserts).
create or replace function public.account_things_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.account_things where user_id = new.user_id) >= 1000 then
    raise exception 'account_things: at most 1000 rows per account' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.account_things_cap() from public, anon, authenticated;

drop trigger if exists account_things_cap on public.account_things;
create trigger account_things_cap
  before insert on public.account_things
  for each row execute function public.account_things_cap();

notify pgrst, 'reload schema';

-- Self-check.
do $$
declare n int;
begin
  if to_regclass('public.account_things') is null then
    raise exception 'account_things is missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.account_things'::regclass) then
    raise exception 'account_things has row level security off';
  end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'account_things';
  if n <> 4 then raise exception 'account_things has % policies, expected 4', n; end if;
  if has_table_privilege('anon', 'public.account_things', 'select') then
    raise exception 'anon must not read account_things';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'account_things_cap' and not tgisinternal) then
    raise exception 'account_things_cap trigger is missing';
  end if;
  raise notice 'account things self-check passed';
end $$;
