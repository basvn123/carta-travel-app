-- 078_circles.sql
--
-- *** SCHEMA MIGRATION, APPLIED BY THE OWNER (G16, decision 0017). ***
-- Paste in the Supabase SQL editor after 077. Never `db push` against
-- ntssxktaduxzpsmejwyv. Pasting twice is safe. Look for
-- "circles self-check passed". The way back is 078_circles_down.sql,
-- which drops everything this file creates.
--
-- Kringen (G16, the Vrienden page): a lasting group of friends that keeps
-- proposing trips. Members vote each proposal up or down, mark the dates
-- they can travel and name their own home airport, so the app can show the
-- best window and each member's fare. A kring is PRIVATE: only the owner
-- invites, and only accepted friends of the owner (owner answer 2026-11-23).
--
-- WHAT IT ADDS
--
--   circles               the kring: owner and name (1 to 40 characters).
--   circle_members        who is in it: 'invited' until they say yes, then
--                         'joined'. The owner is a joined member from the
--                         start (a trigger writes the row). A member's home
--                         airport (an IATA code, their own choice, shown to
--                         the kring) lives here.
--   circle_proposals      a trip someone proposed: a catalogue destination.
--   circle_votes          one row per member per proposal, value 1 or -1.
--                         No row means no vote; the score is the sum.
--   circle_availability   date ranges a member can travel, at most 20 a
--                         member in one kring (a trigger counts them).
--
--   circle_role(c)        SECURITY DEFINER: 'owner', 'joined', 'invited' or
--                         null, the one question every policy asks.
--   circle_people()       SECURITY DEFINER. The handle, name and emoji of
--                         everyone in the kringen you are in, for the faces.
--
-- THE APP WITHOUT THIS FILE. src/auth/circles.js reads these tables; a
-- missing table (42P01 or PGRST205) or function (PGRST202) answers
-- `{ missing: true }`, and the Vrienden page draws no Kringen section.

-- ---------------------------------------------------------------- tables

create table if not exists public.circles (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists circles_owner_idx on public.circles(owner_id);

create table if not exists public.circle_members (
  circle_id    uuid not null references public.circles(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'invited' check (status in ('invited', 'joined')),
  home_airport text check (home_airport is null or home_airport ~ '^[A-Z]{3}$'),
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create index if not exists circle_members_user_idx on public.circle_members(user_id);

create table if not exists public.circle_proposals (
  id             uuid primary key default gen_random_uuid(),
  circle_id      uuid not null references public.circles(id) on delete cascade,
  destination_id text not null check (destination_id ~ '^[A-Za-z0-9_:.-]{1,80}$'),
  created_by     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now()
);
create index if not exists circle_proposals_circle_idx on public.circle_proposals(circle_id);

create table if not exists public.circle_votes (
  circle_id   uuid not null references public.circles(id) on delete cascade,
  proposal_id uuid not null references public.circle_proposals(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  value       smallint not null check (value in (-1, 1)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (proposal_id, user_id)
);
create index if not exists circle_votes_circle_idx on public.circle_votes(circle_id);

create table if not exists public.circle_availability (
  id         uuid primary key default gen_random_uuid(),
  circle_id  uuid not null references public.circles(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  start_date date not null,
  end_date   date not null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists circle_availability_circle_idx on public.circle_availability(circle_id, user_id);

-- ---------------------------------------------------------------- role

-- One SECURITY DEFINER question for every policy, so no policy subqueries a
-- table whose own policy subqueries back (42P17, the trap 011 documents).
create or replace function public.circle_role(c uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null
    when exists (select 1 from public.circles k where k.id = c and k.owner_id = auth.uid()) then 'owner'
    else (select m.status from public.circle_members m where m.circle_id = c and m.user_id = auth.uid())
  end;
$$;
revoke all on function public.circle_role(uuid) from public, anon;
grant execute on function public.circle_role(uuid) to authenticated;

-- The owner is a joined member from the first moment.
create or replace function public.circles_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.circle_members (circle_id, user_id, status, invited_by, responded_at)
  values (new.id, new.owner_id, 'joined', new.owner_id, now())
  on conflict (circle_id, user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.circles_owner_member() from public, anon, authenticated;
drop trigger if exists circles_owner_member on public.circles;
create trigger circles_owner_member
  after insert on public.circles
  for each row execute function public.circles_owner_member();

-- At most 20 ranges a member in one kring: enough for any calendar, and a
-- ceiling on what one account can write.
create or replace function public.circle_availability_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.circle_availability a
       where a.circle_id = new.circle_id and a.user_id = new.user_id) >= 20 then
    raise exception 'at most 20 date ranges a member' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.circle_availability_cap() from public, anon, authenticated;
drop trigger if exists circle_availability_cap on public.circle_availability;
create trigger circle_availability_cap
  before insert on public.circle_availability
  for each row execute function public.circle_availability_cap();

-- ---------------------------------------------------------------- RLS

alter table public.circles             enable row level security;
alter table public.circle_members      enable row level security;
alter table public.circle_proposals    enable row level security;
alter table public.circle_votes        enable row level security;
alter table public.circle_availability enable row level security;

-- circles: seen by the owner, joined and invited members (an invited person
-- needs the name to say yes).
drop policy if exists "circles_select" on public.circles;
create policy "circles_select" on public.circles
  for select using ((select public.circle_role(id)) is not null);
drop policy if exists "circles_insert" on public.circles;
create policy "circles_insert" on public.circles
  for insert with check (auth.uid() is not null and owner_id = auth.uid());
drop policy if exists "circles_update" on public.circles;
create policy "circles_update" on public.circles
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "circles_delete" on public.circles;
create policy "circles_delete" on public.circles
  for delete using (owner_id = auth.uid());
revoke update on public.circles from authenticated;
grant update (name, updated_at) on public.circles to authenticated;

-- circle_members: the roster is visible to joined members and the owner; an
-- invited person sees their own row (their invitation).
drop policy if exists "circle_members_select" on public.circle_members;
create policy "circle_members_select" on public.circle_members
  for select using (
    user_id = auth.uid()
    or (select public.circle_role(circle_id)) in ('owner', 'joined')
  );
-- Only the owner invites, and only an accepted friend of the owner.
drop policy if exists "circle_members_insert" on public.circle_members;
create policy "circle_members_insert" on public.circle_members
  for insert with check (
    (select public.circle_role(circle_id)) = 'owner'
    and invited_by = auth.uid()
    and status = 'invited'
    and home_airport is null
    and user_id <> auth.uid()
    and (select public.link_status_with_me(user_id)) = 'accepted'
  );
-- A member writes only their own row: saying yes and their home airport.
drop policy if exists "circle_members_own" on public.circle_members;
create policy "circle_members_own" on public.circle_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid() and status = 'joined');
revoke update on public.circle_members from authenticated;
grant update (status, responded_at, home_airport, updated_at) on public.circle_members to authenticated;
-- Declining, leaving and the owner removing someone are the same delete.
drop policy if exists "circle_members_delete" on public.circle_members;
create policy "circle_members_delete" on public.circle_members
  for delete using (
    user_id = auth.uid()
    or (select public.circle_role(circle_id)) = 'owner'
  );

-- circle_proposals: joined members read and add; the creator or the owner
-- removes one.
drop policy if exists "circle_proposals_select" on public.circle_proposals;
create policy "circle_proposals_select" on public.circle_proposals
  for select using ((select public.circle_role(circle_id)) in ('owner', 'joined'));
drop policy if exists "circle_proposals_insert" on public.circle_proposals;
create policy "circle_proposals_insert" on public.circle_proposals
  for insert with check (
    created_by = auth.uid()
    and (select public.circle_role(circle_id)) in ('owner', 'joined')
  );
drop policy if exists "circle_proposals_delete" on public.circle_proposals;
create policy "circle_proposals_delete" on public.circle_proposals
  for delete using (
    created_by = auth.uid()
    or (select public.circle_role(circle_id)) = 'owner'
  );

-- circle_votes: joined members see every vote (the faces on a proposal);
-- each writes only their own, for a proposal of the same kring.
drop policy if exists "circle_votes_select" on public.circle_votes;
create policy "circle_votes_select" on public.circle_votes
  for select using ((select public.circle_role(circle_id)) in ('owner', 'joined'));
drop policy if exists "circle_votes_insert" on public.circle_votes;
create policy "circle_votes_insert" on public.circle_votes
  for insert with check (
    user_id = auth.uid()
    and (select public.circle_role(circle_id)) in ('owner', 'joined')
    and exists (
      select 1 from public.circle_proposals p
       where p.id = proposal_id and p.circle_id = circle_votes.circle_id
    )
  );
drop policy if exists "circle_votes_update" on public.circle_votes;
create policy "circle_votes_update" on public.circle_votes
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
revoke update on public.circle_votes from authenticated;
grant update (value, updated_at) on public.circle_votes to authenticated;
drop policy if exists "circle_votes_delete" on public.circle_votes;
create policy "circle_votes_delete" on public.circle_votes
  for delete using (user_id = auth.uid());

-- circle_availability: joined members see everyone's ranges (the lanes);
-- each writes only their own.
drop policy if exists "circle_availability_select" on public.circle_availability;
create policy "circle_availability_select" on public.circle_availability
  for select using ((select public.circle_role(circle_id)) in ('owner', 'joined'));
drop policy if exists "circle_availability_insert" on public.circle_availability;
create policy "circle_availability_insert" on public.circle_availability
  for insert with check (
    user_id = auth.uid()
    and (select public.circle_role(circle_id)) in ('owner', 'joined')
  );
drop policy if exists "circle_availability_delete" on public.circle_availability;
create policy "circle_availability_delete" on public.circle_availability
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------- functions

-- The people in your kringen, for the faces. A co-member chose to join the
-- same kring, so their handle and name are shown to the others in it, as
-- group_trip_people (055) does. An invited person sees only the owner.
create or replace function public.circle_people()
returns table (circle_id uuid, user_id uuid, status text, home_airport text, handle text, display_name text, avatar_emoji text)
language sql
stable
security definer
set search_path = public
as $$
  select m.circle_id, m.user_id, m.status, m.home_airport, p.handle, p.display_name, p.avatar_emoji
    from public.circle_members m
    join public.profiles p on p.user_id = m.user_id
   where auth.uid() is not null
     and public.circle_role(m.circle_id) in ('owner', 'joined', 'invited')
     and (
       public.circle_role(m.circle_id) in ('owner', 'joined')
       or m.user_id = auth.uid()
       or m.user_id = (select k.owner_id from public.circles k where k.id = m.circle_id)
     );
$$;
revoke all on function public.circle_people() from public, anon;
grant execute on function public.circle_people() to authenticated;

-- ---------------------------------------------------------------- grants

revoke all on public.circles, public.circle_members, public.circle_proposals,
  public.circle_votes, public.circle_availability from anon;
grant select, insert, delete on public.circles, public.circle_members, public.circle_proposals,
  public.circle_votes, public.circle_availability to authenticated;

-- ---------------------------------------------------------------- self-check

do $$
declare
  t text;
begin
  foreach t in array array['circles', 'circle_members', 'circle_proposals', 'circle_votes', 'circle_availability'] loop
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t and rowsecurity) then
      raise exception 'row level security is off on %', t;
    end if;
  end loop;
  -- Nobody signed out reads a kring.
  if has_table_privilege('anon', 'public.circles', 'select') then
    raise exception 'anon must not read circles';
  end if;
  raise notice 'circles self-check passed';
end;
$$;
