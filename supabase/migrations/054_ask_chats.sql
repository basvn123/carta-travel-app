-- 054_ask_chats.sql
--
-- Ask Carta's chats in the account (T575, owner 2026-10-22: "chats on
-- account"). Until now a chat lived in one browser (localStorage,
-- src/lib/ask/sessions.js). With this table a signed-in traveller's chats
-- follow them to a second device, the way Kayak's "Vraag AI" history does.
-- Signed out, nothing changes: chats stay on the device, and the first
-- sign-in after this paste brings that device's chats into the account.
--
-- WHAT IT ADDS
--
--   ask_chats   one row per chat per user: the chat id the app made, its
--               title (the first question), the turns as jsonb (each turn's
--               question, the written answer it got and the place it was
--               about; never a key, a token or anything from another user),
--               updated_at, and deleted_at as a tombstone, as day_plans
--               (004) does, so a chat deleted on one device goes from the
--               other too. A deleted chat's turns are emptied.
--   RLS         the owner reads and writes their own rows only; anon none.
--   a cap       at most 200 chats per account (the app keeps 30), and a
--               chat's turns at most 256 KB, so a runaway client cannot
--               fill the table.
--
-- Data export: the app adds these rows to the export file itself
-- (AuthContext exportUserData reads them under this RLS), so
-- export_user_data() (024, 048) is not touched. Account deletion removes
-- them through the foreign key's cascade.
--
-- ORDER. Paste in the Supabase SQL editor after 004. Never `db push`
-- against ntssxktaduxzpsmejwyv. Pasting twice is safe. Look for
-- "ask chats self-check passed". Then run
-- `node scripts/verify_live_policies.mjs` from continent-app/.
--
-- THE APP WITHOUT THIS FILE. The chat reads ask_chats when it opens for a
-- signed-in traveller; a missing table (PGRST205 or 42P01) turns the cloud
-- off for that visit and the chats stay on the device, as before.
--
-- DOWN, in this order:
--   drop trigger if exists ask_chats_cap on public.ask_chats;
--   drop function if exists public.ask_chats_cap();
--   drop table if exists public.ask_chats;
--   notify pgrst, 'reload schema';

create table if not exists public.ask_chats (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  chat_id    text        not null check (chat_id ~ '^[a-z0-9]{6,40}$'),
  title      text        not null default '' check (char_length(title) <= 120),
  turns      jsonb       not null default '[]'::jsonb
             check (jsonb_typeof(turns) = 'array' and pg_column_size(turns) <= 262144),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, chat_id)
);

create index if not exists ask_chats_user_updated on public.ask_chats (user_id, updated_at desc);

alter table public.ask_chats enable row level security;

drop policy if exists "ask_chats_select_own" on public.ask_chats;
create policy "ask_chats_select_own" on public.ask_chats
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "ask_chats_insert_own" on public.ask_chats;
create policy "ask_chats_insert_own" on public.ask_chats
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "ask_chats_update_own" on public.ask_chats;
create policy "ask_chats_update_own" on public.ask_chats
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "ask_chats_delete_own" on public.ask_chats;
create policy "ask_chats_delete_own" on public.ask_chats
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.ask_chats from anon;
grant select, insert, update, delete on public.ask_chats to authenticated;

-- At most 200 chats per account, counted on insert (an update of an existing
-- chat never trips it).
create or replace function public.ask_chats_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.ask_chats where user_id = new.user_id) >= 200 then
    raise exception 'ask_chats: at most 200 chats per account' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.ask_chats_cap() from public, anon, authenticated;

drop trigger if exists ask_chats_cap on public.ask_chats;
create trigger ask_chats_cap
  before insert on public.ask_chats
  for each row execute function public.ask_chats_cap();

notify pgrst, 'reload schema';

-- Self-check.
do $$
declare n int;
begin
  if to_regclass('public.ask_chats') is null then
    raise exception 'ask_chats is missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.ask_chats'::regclass) then
    raise exception 'ask_chats has row level security off';
  end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'ask_chats';
  if n <> 4 then raise exception 'ask_chats has % policies, expected 4', n; end if;
  if has_table_privilege('anon', 'public.ask_chats', 'select') then
    raise exception 'anon must not read ask_chats';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'ask_chats_cap' and not tgisinternal) then
    raise exception 'ask_chats_cap trigger is missing';
  end if;
  raise notice 'ask chats self-check passed';
end $$;
