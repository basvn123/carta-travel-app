-- 055_group_trips.sql
--
-- *** SCHEMA MIGRATION, APPLIED BY THE OWNER (T931). ***
-- Paste in the Supabase SQL editor after 054. Never `db push` against
-- ntssxktaduxzpsmejwyv. Pasting twice is safe. Look for
-- "group trips self-check passed". The way back is
-- 055_group_trips_down.sql, which drops everything this file creates.
--
-- Group trips (T931, the Together page): a few accepted friends decide one
-- trip together. Each member votes on WHEN (date options) and WHERE (place
-- options), one vote per member per question, and each member may say the
-- most they want to spend a day. Nobody else can read that number.
--
-- WHAT IT ADDS
--
--   group_trips          the trip being decided: owner, title, and the trip
--                        plan it became once booked.
--   group_trip_members   who is in it: 'invited' until they say yes, then
--                        'joined'. The owner is a joined member from the
--                        start (a trigger writes the row). Only an ACCEPTED
--                        FRIEND OF THE OWNER can be invited, checked in the
--                        insert policy through link_status_with_me (012).
--   group_trip_options   the date options (start and end) and the place
--                        options (a catalogue destination id).
--   group_trip_votes     one row per member per question (primary key
--                        group, kind, user), pointing at one option of that
--                        group and that kind.
--   group_trip_budgets   one row per member: their maximum a day, in whole
--                        euros a person. RLS lets a member read ONLY their
--                        own row. No policy, function or view in this file
--                        returns another member's value.
--
--   group_trip_band(g)   SECURITY DEFINER. Returns the group's band and
--                        nothing else: band_top, members_set, members.
--   group_trip_people()  SECURITY DEFINER. The handle, name and emoji of
--                        everyone in the groups you are in, so voters' faces
--                        can be drawn for co-members who are not your friend.
--
-- THE BAND, DEFINED. "What fits everyone" is the LOWEST maximum any member
-- set, rounded DOWN to a multiple of 5 euros: a day price at or under it is
-- within every member's maximum. The band is the range from 0 up to that
-- top; there is no lower bound, because nobody has a minimum. It is returned
-- only once at least THREE members have set a maximum. With two, the lower
-- of the two values would be the other person's own number whenever it is
-- below yours, which is exactly what must stay private. With three or more
-- the top is still one member's (rounded) value, but nobody can tell whose.
-- Below three members set, band_top is null and the app shows the band as
-- not ready.
--
-- THE APP WITHOUT THIS FILE. src/auth/groupTrips.js reads these tables; a
-- missing table (42P01 or PGRST205) or function (PGRST202) answers
-- `{ missing: true }`, and the Together page draws no Group trips block.

-- ---------------------------------------------------------------- tables

create table if not exists public.group_trips (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title          text not null check (char_length(btrim(title)) between 1 and 80),
  booked_plan_id uuid references public.trip_plans(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists group_trips_owner_idx on public.group_trips(owner_id);

create table if not exists public.group_trip_members (
  group_id     uuid not null references public.group_trips(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'invited' check (status in ('invited', 'joined')),
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (group_id, user_id)
);
create index if not exists group_trip_members_user_idx on public.group_trip_members(user_id);

create table if not exists public.group_trip_options (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.group_trips(id) on delete cascade,
  kind           text not null check (kind in ('when', 'where')),
  start_date     date,
  end_date       date,
  destination_id text check (destination_id is null or destination_id ~ '^[A-Za-z0-9_:.-]{1,80}$'),
  created_by     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  check (
    (kind = 'when' and start_date is not null and end_date is not null and end_date > start_date
      and destination_id is null)
    or (kind = 'where' and destination_id is not null and start_date is null and end_date is null)
  )
);
create index if not exists group_trip_options_group_idx on public.group_trip_options(group_id);

create table if not exists public.group_trip_votes (
  group_id   uuid not null references public.group_trips(id) on delete cascade,
  kind       text not null check (kind in ('when', 'where')),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  option_id  uuid not null references public.group_trip_options(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, kind, user_id)
);

create table if not exists public.group_trip_budgets (
  group_id   uuid not null references public.group_trips(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  max_day    integer not null check (max_day between 1 and 9999),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ---------------------------------------------------------------- role

-- Every policy below asks one question, "what is this account in that
-- group", through this one SECURITY DEFINER function, so no policy subqueries
-- a table whose own policy subqueries back (42P17, the trap 011 documents).
create or replace function public.group_role(g uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null
    when exists (select 1 from public.group_trips t where t.id = g and t.owner_id = auth.uid()) then 'owner'
    else (select m.status from public.group_trip_members m where m.group_id = g and m.user_id = auth.uid())
  end;
$$;
revoke all on function public.group_role(uuid) from public, anon;
grant execute on function public.group_role(uuid) to authenticated;

-- The owner is a joined member from the first moment.
create or replace function public.group_trips_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_trip_members (group_id, user_id, status, invited_by, responded_at)
  values (new.id, new.owner_id, 'joined', new.owner_id, now())
  on conflict (group_id, user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.group_trips_owner_member() from public, anon, authenticated;
drop trigger if exists group_trips_owner_member on public.group_trips;
create trigger group_trips_owner_member
  after insert on public.group_trips
  for each row execute function public.group_trips_owner_member();

-- ---------------------------------------------------------------- RLS

alter table public.group_trips        enable row level security;
alter table public.group_trip_members enable row level security;
alter table public.group_trip_options enable row level security;
alter table public.group_trip_votes   enable row level security;
alter table public.group_trip_budgets enable row level security;

-- group_trips: seen by the owner, joined and invited members.
drop policy if exists "group_trips_select" on public.group_trips;
create policy "group_trips_select" on public.group_trips
  for select using ((select public.group_role(id)) is not null);
drop policy if exists "group_trips_insert" on public.group_trips;
create policy "group_trips_insert" on public.group_trips
  for insert with check (auth.uid() is not null and owner_id = auth.uid());
drop policy if exists "group_trips_update" on public.group_trips;
create policy "group_trips_update" on public.group_trips
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "group_trips_delete" on public.group_trips;
create policy "group_trips_delete" on public.group_trips
  for delete using (owner_id = auth.uid());
revoke update on public.group_trips from authenticated;
grant update (title, booked_plan_id, updated_at) on public.group_trips to authenticated;

-- group_trip_members: the roster is visible to joined members and the owner;
-- an invited person sees their own row (their invitation).
drop policy if exists "group_trip_members_select" on public.group_trip_members;
create policy "group_trip_members_select" on public.group_trip_members
  for select using (
    user_id = auth.uid()
    or (select public.group_role(group_id)) in ('owner', 'joined')
  );
drop policy if exists "group_trip_members_insert" on public.group_trip_members;
create policy "group_trip_members_insert" on public.group_trip_members
  for insert with check (
    (select public.group_role(group_id)) = 'owner'
    and invited_by = auth.uid()
    and status = 'invited'
    and user_id <> auth.uid()
    and (select public.link_status_with_me(user_id)) = 'accepted'
  );
-- Saying yes is the invitee's own update, and only status and the time move.
drop policy if exists "group_trip_members_respond" on public.group_trip_members;
create policy "group_trip_members_respond" on public.group_trip_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid() and status = 'joined');
revoke update on public.group_trip_members from authenticated;
grant update (status, responded_at) on public.group_trip_members to authenticated;
-- Declining, leaving and the owner removing someone are the same delete.
drop policy if exists "group_trip_members_delete" on public.group_trip_members;
create policy "group_trip_members_delete" on public.group_trip_members
  for delete using (
    user_id = auth.uid()
    or (select public.group_role(group_id)) = 'owner'
  );

-- group_trip_options: joined members read and add; the owner or the person
-- who added one removes it.
drop policy if exists "group_trip_options_select" on public.group_trip_options;
create policy "group_trip_options_select" on public.group_trip_options
  for select using ((select public.group_role(group_id)) in ('owner', 'joined'));
drop policy if exists "group_trip_options_insert" on public.group_trip_options;
create policy "group_trip_options_insert" on public.group_trip_options
  for insert with check (
    created_by = auth.uid()
    and (select public.group_role(group_id)) in ('owner', 'joined')
  );
drop policy if exists "group_trip_options_delete" on public.group_trip_options;
create policy "group_trip_options_delete" on public.group_trip_options
  for delete using (
    created_by = auth.uid()
    or (select public.group_role(group_id)) = 'owner'
  );

-- group_trip_votes: joined members see everyone's vote (the faces on a
-- poll); each writes only their own, for an option of the same group and
-- question.
drop policy if exists "group_trip_votes_select" on public.group_trip_votes;
create policy "group_trip_votes_select" on public.group_trip_votes
  for select using ((select public.group_role(group_id)) in ('owner', 'joined'));
drop policy if exists "group_trip_votes_insert" on public.group_trip_votes;
create policy "group_trip_votes_insert" on public.group_trip_votes
  for insert with check (
    user_id = auth.uid()
    and (select public.group_role(group_id)) in ('owner', 'joined')
    and exists (
      select 1 from public.group_trip_options o
       where o.id = option_id and o.group_id = group_trip_votes.group_id and o.kind = group_trip_votes.kind
    )
  );
drop policy if exists "group_trip_votes_update" on public.group_trip_votes;
create policy "group_trip_votes_update" on public.group_trip_votes
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.group_trip_options o
       where o.id = option_id and o.group_id = group_trip_votes.group_id and o.kind = group_trip_votes.kind
    )
  );
drop policy if exists "group_trip_votes_delete" on public.group_trip_votes;
create policy "group_trip_votes_delete" on public.group_trip_votes
  for delete using (user_id = auth.uid());

-- group_trip_budgets: your own row and nothing else, in every direction.
drop policy if exists "group_trip_budgets_select_own" on public.group_trip_budgets;
create policy "group_trip_budgets_select_own" on public.group_trip_budgets
  for select using (user_id = auth.uid());
drop policy if exists "group_trip_budgets_insert_own" on public.group_trip_budgets;
create policy "group_trip_budgets_insert_own" on public.group_trip_budgets
  for insert with check (
    user_id = auth.uid()
    and (select public.group_role(group_id)) in ('owner', 'joined')
  );
drop policy if exists "group_trip_budgets_update_own" on public.group_trip_budgets;
create policy "group_trip_budgets_update_own" on public.group_trip_budgets
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "group_trip_budgets_delete_own" on public.group_trip_budgets;
create policy "group_trip_budgets_delete_own" on public.group_trip_budgets
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------- functions

-- The band, and only the band (definition at the top of this file).
create or replace function public.group_trip_band(g uuid)
returns table (band_top integer, members_set integer, members integer)
language sql
stable
security definer
set search_path = public
as $$
  with ok as (
    select public.group_role(g) in ('owner', 'joined') as allowed
  ), b as (
    select count(*)::int as n, min(bu.max_day) as low
      from public.group_trip_budgets bu
      join public.group_trip_members m on m.group_id = bu.group_id and m.user_id = bu.user_id and m.status = 'joined'
     where bu.group_id = g
  ), m as (
    select count(*)::int as n from public.group_trip_members where group_id = g and status = 'joined'
  )
  select
    case when b.n >= 3 then (floor(b.low / 5.0) * 5)::int else null end,
    b.n,
    m.n
  from b, m, ok
  where ok.allowed;
$$;
revoke all on function public.group_trip_band(uuid) from public, anon;
grant execute on function public.group_trip_band(uuid) to authenticated;

-- The people in your groups, for the faces. A co-member is somebody who
-- chose to join the same group, so their handle and name are shown to the
-- others in it, as list_trip_coplanners (020) does for a shared trip.
create or replace function public.group_trip_people()
returns table (group_id uuid, user_id uuid, status text, handle text, display_name text, avatar_emoji text)
language sql
stable
security definer
set search_path = public
as $$
  select m.group_id, m.user_id, m.status, p.handle, p.display_name, p.avatar_emoji
    from public.group_trip_members m
    join public.profiles p on p.user_id = m.user_id
   where auth.uid() is not null
     and public.group_role(m.group_id) in ('owner', 'joined', 'invited')
     -- An invited person sees the owner only, not the rest of the roster.
     and (
       public.group_role(m.group_id) in ('owner', 'joined')
       or m.user_id = auth.uid()
       or m.user_id = (select t.owner_id from public.group_trips t where t.id = m.group_id)
     );
$$;
revoke all on function public.group_trip_people() from public, anon;
grant execute on function public.group_trip_people() to authenticated;

-- ---------------------------------------------------------------- self-check

do $$
declare
  t text;
begin
  foreach t in array array['group_trips', 'group_trip_members', 'group_trip_options', 'group_trip_votes', 'group_trip_budgets'] loop
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t and rowsecurity) then
      raise exception 'row level security is off on %', t;
    end if;
  end loop;
  -- The budget table has exactly one select policy and it names the caller.
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'group_trip_budgets' and cmd = 'SELECT') <> 1 then
    raise exception 'group_trip_budgets must have exactly one select policy';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'group_trip_budgets' and cmd = 'SELECT'
       and qual like '%user_id = auth.uid()%'
       and qual not like '%group_role%'
  ) then
    raise exception 'the group_trip_budgets select policy must read the caller''s own row only';
  end if;
  raise notice 'group trips self-check passed';
end;
$$;
