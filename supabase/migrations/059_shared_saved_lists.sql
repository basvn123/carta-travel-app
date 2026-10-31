-- 059_shared_saved_lists.sql
--
-- *** SCHEMA MIGRATION, APPLIED BY THE OWNER (T941). ***
-- Paste in the Supabase SQL editor after 056 (057 and 058 are other tasks'
-- and do not touch these tables, so the order among them does not matter).
-- Never `db push` against ntssxktaduxzpsmejwyv. Pasting twice is safe. Look
-- for "shared saved lists self-check passed". The way back is
-- 059_shared_saved_lists_down.sql, which drops everything this file creates.
--
-- Shared Saved lists (T941, My trips, Saved): the owner of a list shares it
-- with accepted friends. Every member adds saved things, writes a note on an
-- item and votes, one vote per member per item. The owner manages the
-- members and may remove any item.
--
-- WHAT IT ADDS
--
--   shared_lists          the list: owner and name.
--   shared_list_members   who is in it. The owner is a member from the start
--                         (a trigger writes the row). Only the OWNER adds a
--                         member, and only an ACCEPTED FRIEND of the owner
--                         (link_status_with_me, 012). The owner removes
--                         anyone; a member may leave.
--   shared_list_items     one row per saved thing (`item_key` is the app's
--                         favourite key, `kind:id`), unique per list, with
--                         who added it, the name, country and photo the
--                         adder's app showed, and one shared note.
--   shared_list_votes     one row per member per item (primary key item,
--                         user).
--
--   shared_list_role(l)   SECURITY DEFINER: 'owner', 'member' or null.
--   shared_list_people()  SECURITY DEFINER: the handle, name and emoji of
--                         everyone in the lists you are in, so a co-member
--                         who is not your friend still has a face.
--
-- Only members read or write anything here; nobody else sees that a list
-- exists.
--
-- THE APP WITHOUT THIS FILE. src/auth/sharedLists.js reads these tables; a
-- missing table (42P01 or PGRST205) or function (PGRST202) answers
-- `{ missing: true }`, and Saved shows no shared lists and no Share action.

-- ---------------------------------------------------------------- tables

create table if not exists public.shared_lists (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shared_lists_owner_idx on public.shared_lists(owner_id);

create table if not exists public.shared_list_members (
  list_id    uuid not null references public.shared_lists(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  added_by   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index if not exists shared_list_members_user_idx on public.shared_list_members(user_id);

create table if not exists public.shared_list_items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.shared_lists(id) on delete cascade,
  item_key   text not null check (item_key ~ '^[a-z]{2,12}:' and char_length(item_key) <= 160),
  name       text check (name is null or char_length(name) <= 120),
  cc         text check (cc is null or cc ~ '^[A-Za-z]{2}$'),
  img        text check (img is null or (char_length(img) <= 600 and img ~ '^https://')),
  note       text check (note is null or char_length(note) <= 140),
  added_by   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (list_id, item_key)
);
create index if not exists shared_list_items_list_idx on public.shared_list_items(list_id);

create table if not exists public.shared_list_votes (
  item_id    uuid not null references public.shared_list_items(id) on delete cascade,
  list_id    uuid not null references public.shared_lists(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index if not exists shared_list_votes_list_idx on public.shared_list_votes(list_id);

-- ---------------------------------------------------------------- role

-- Every policy asks one question through this one SECURITY DEFINER function,
-- so no policy subqueries a table whose own policy subqueries back (42P17).
create or replace function public.shared_list_role(l uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null
    when exists (select 1 from public.shared_lists s where s.id = l and s.owner_id = auth.uid()) then 'owner'
    when exists (select 1 from public.shared_list_members m where m.list_id = l and m.user_id = auth.uid()) then 'member'
    else null
  end;
$$;
revoke all on function public.shared_list_role(uuid) from public, anon;
grant execute on function public.shared_list_role(uuid) to authenticated;

-- The owner is a member from the first moment.
create or replace function public.shared_lists_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.shared_list_members (list_id, user_id, added_by)
  values (new.id, new.owner_id, new.owner_id)
  on conflict (list_id, user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.shared_lists_owner_member() from public, anon, authenticated;
drop trigger if exists shared_lists_owner_member on public.shared_lists;
create trigger shared_lists_owner_member
  after insert on public.shared_lists
  for each row execute function public.shared_lists_owner_member();

-- ---------------------------------------------------------------- RLS

alter table public.shared_lists        enable row level security;
alter table public.shared_list_members enable row level security;
alter table public.shared_list_items   enable row level security;
alter table public.shared_list_votes   enable row level security;

-- shared_lists: members read; the owner creates, renames and deletes.
drop policy if exists "shared_lists_select" on public.shared_lists;
create policy "shared_lists_select" on public.shared_lists
  for select using ((select public.shared_list_role(id)) is not null);
drop policy if exists "shared_lists_insert" on public.shared_lists;
create policy "shared_lists_insert" on public.shared_lists
  for insert with check (auth.uid() is not null and owner_id = auth.uid());
drop policy if exists "shared_lists_update" on public.shared_lists;
create policy "shared_lists_update" on public.shared_lists
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "shared_lists_delete" on public.shared_lists;
create policy "shared_lists_delete" on public.shared_lists
  for delete using (owner_id = auth.uid());
revoke update on public.shared_lists from authenticated;
grant update (name, updated_at) on public.shared_lists to authenticated;

-- shared_list_members: members read the roster; only the owner adds, and
-- only an accepted friend; the owner removes anyone, a member may leave.
drop policy if exists "shared_list_members_select" on public.shared_list_members;
create policy "shared_list_members_select" on public.shared_list_members
  for select using ((select public.shared_list_role(list_id)) is not null);
drop policy if exists "shared_list_members_insert" on public.shared_list_members;
create policy "shared_list_members_insert" on public.shared_list_members
  for insert with check (
    (select public.shared_list_role(list_id)) = 'owner'
    and added_by = auth.uid()
    and user_id <> auth.uid()
    and (select public.link_status_with_me(user_id)) = 'accepted'
  );
drop policy if exists "shared_list_members_delete" on public.shared_list_members;
create policy "shared_list_members_delete" on public.shared_list_members
  for delete using (
    (select public.shared_list_role(list_id)) = 'owner'
    or (user_id = auth.uid() and (select public.shared_list_role(list_id)) = 'member')
  );
-- No update: membership has nothing to edit.
revoke update on public.shared_list_members from authenticated;

-- shared_list_items: members read and add (as themselves) and write the
-- note; the owner or the person who added an item removes it.
drop policy if exists "shared_list_items_select" on public.shared_list_items;
create policy "shared_list_items_select" on public.shared_list_items
  for select using ((select public.shared_list_role(list_id)) is not null);
drop policy if exists "shared_list_items_insert" on public.shared_list_items;
create policy "shared_list_items_insert" on public.shared_list_items
  for insert with check (
    added_by = auth.uid()
    and (select public.shared_list_role(list_id)) is not null
  );
drop policy if exists "shared_list_items_update" on public.shared_list_items;
create policy "shared_list_items_update" on public.shared_list_items
  for update using ((select public.shared_list_role(list_id)) is not null)
  with check ((select public.shared_list_role(list_id)) is not null);
revoke update on public.shared_list_items from authenticated;
grant update (note) on public.shared_list_items to authenticated;
drop policy if exists "shared_list_items_delete" on public.shared_list_items;
create policy "shared_list_items_delete" on public.shared_list_items
  for delete using (
    added_by = auth.uid()
    or (select public.shared_list_role(list_id)) = 'owner'
  );

-- shared_list_votes: members see every vote (the faces on an item); each
-- writes only their own, for an item of the same list.
drop policy if exists "shared_list_votes_select" on public.shared_list_votes;
create policy "shared_list_votes_select" on public.shared_list_votes
  for select using ((select public.shared_list_role(list_id)) is not null);
drop policy if exists "shared_list_votes_insert" on public.shared_list_votes;
create policy "shared_list_votes_insert" on public.shared_list_votes
  for insert with check (
    user_id = auth.uid()
    and (select public.shared_list_role(list_id)) is not null
    and exists (
      select 1 from public.shared_list_items i
       where i.id = item_id and i.list_id = shared_list_votes.list_id
    )
  );
drop policy if exists "shared_list_votes_delete" on public.shared_list_votes;
create policy "shared_list_votes_delete" on public.shared_list_votes
  for delete using (user_id = auth.uid());
revoke update on public.shared_list_votes from authenticated;

-- ---------------------------------------------------------------- people

-- The people in your lists, for the faces. A co-member is someone the owner
-- chose to share with, so the others in the list see their handle and name,
-- as group_trip_people (055) does for a group.
create or replace function public.shared_list_people()
returns table (list_id uuid, user_id uuid, handle text, display_name text, avatar_emoji text)
language sql
stable
security definer
set search_path = public
as $$
  select m.list_id, m.user_id, p.handle, p.display_name, p.avatar_emoji
    from public.shared_list_members m
    join public.profiles p on p.user_id = m.user_id
   where auth.uid() is not null
     and public.shared_list_role(m.list_id) is not null;
$$;
revoke all on function public.shared_list_people() from public, anon;
grant execute on function public.shared_list_people() to authenticated;

-- ---------------------------------------------------------------- self-check

do $$
declare
  t text;
begin
  foreach t in array array['shared_lists', 'shared_list_members', 'shared_list_items', 'shared_list_votes'] loop
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t and rowsecurity) then
      raise exception 'row level security is off on %', t;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd = 'SELECT') then
      raise exception '% has no select policy', t;
    end if;
  end loop;
  -- Only the owner adds members, and only an accepted friend.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'shared_list_members' and cmd = 'INSERT'
       and with_check like '%owner%' and with_check like '%link_status_with_me%'
  ) then
    raise exception 'shared_list_members insert must be the owner adding an accepted friend';
  end if;
  -- Nobody outside a list can call the people function as anon.
  if has_function_privilege('anon', 'public.shared_list_people()', 'execute') then
    raise exception 'anon must not execute shared_list_people';
  end if;
  raise notice 'shared saved lists self-check passed';
end;
$$;
