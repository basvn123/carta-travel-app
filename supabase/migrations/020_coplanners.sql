-- Co-planners: two accounts building one itinerary.
--
-- WHAT IS SHARED, AND WHAT IS DELIBERATELY NOT. A co-planner gets the
-- ITINERARY: the trip's name, its stops, their cities, their dates, their
-- nights and their transport. They do NOT get the day plan. That is one jsonb
-- payload per (user_id, plan_id) carrying the group's expense ledger, the
-- imported booking references, the private notes and the photographs
-- (migration 004), and handing all of it over is a different decision from
-- "help me work out where we are going". It is also a different mechanism:
-- day_plans is reconciled against local storage by a sync loop keyed on the
-- account, so a second writer there is a data-loss question, not a policy
-- question. Shared day planning is the next step, not this one, and the UI
-- says so rather than implying otherwise.
--
-- WHOSE ROW IS A STOP. Every trip_plan_stops row carries the PLAN OWNER's
-- user_id no matter who wrote it. This is the load-bearing decision in the
-- file. The owner's own SELECT policy filters on the stop's user_id, so a
-- stop written under the collaborator's id would be INVISIBLE to the owner of
-- the trip it belongs to: they would watch their co-planner add three cities
-- and see nothing. The insert check below therefore pins the row's user_id to
-- the plan's owner, which also keeps migrations 003 and 008 intact (a stop can
-- still never be re-parented onto somebody else's plan) and makes the rule
-- stricter for owners rather than looser.
--
-- WHY THE POLICY COUNT DOES NOT CHANGE. Migrations 011 and 019 both assert
-- that trip_plans has exactly four policies, as a guard against the table
-- being quietly opened up. So this migration REDEFINES those four rather than
-- adding a fifth, and the same for trip_plan_stops. Re-running 011 or 019
-- after this file still passes.
--
-- WHAT A CO-PLANNER MAY NOT TOUCH is defended by a trigger, not by a policy,
-- for the reason migration 011 gives about column privileges: a WITH CHECK
-- cannot see the OLD row, and column grants are role-wide so they cannot give
-- the owner more columns than the collaborator. The trigger simply pins
-- visibility, published_at and user_id back to their old values when the
-- writer is not the owner, so a collaborator's edit still lands and the three
-- fields they have no business moving do not move. Publishing somebody else's
-- trip, or handing it to a third account, is therefore impossible rather than
-- merely refused.
--
-- ONLY AN ACCEPTED FRIEND CAN BE INVITED, and only by the owner. Somebody who
-- can rewrite your itinerary is not a stranger you met in a gallery.
--
-- Apply in the Supabase SQL editor. Live project policy: never `db push`
-- against ntssxktaduxzpsmejwyv; paste this file there by hand.
-- Requires 011_friends.sql. Apply 019_public_guides.sql BEFORE this one.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Who is on a trip
-- ---------------------------------------------------------------------------
create table if not exists public.trip_collaborators (
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  invited_by   uuid not null references auth.users(id) on delete cascade,
  -- 'pending'  asked, not yet answered
  -- 'accepted' the only status that grants anything
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (trip_plan_id, user_id),
  check (user_id <> invited_by)
);

create index if not exists trip_collaborators_user_idx
  on public.trip_collaborators (user_id, status);

alter table public.trip_collaborators enable row level security;

-- The two people it names, and nobody else. There is no way to ask who else
-- is on a trip you are not on.
drop policy if exists "coplan_select_visible" on public.trip_collaborators;
create policy "coplan_select_visible" on public.trip_collaborators
  for select using (auth.uid() in (user_id, invited_by));

-- Only the OWNER of the plan invites, only on their own plan, only as
-- pending, and only somebody who is already an accepted friend.
--
-- are_friends is security definer (migration 011) so this subquery does not
-- re-enter friendships' RLS, and it is wrapped as a scalar select so Postgres
-- evaluates it once per statement.
drop policy if exists "coplan_insert_owner" on public.trip_collaborators;
create policy "coplan_insert_owner" on public.trip_collaborators
  for insert with check (
    auth.uid() = invited_by
    and status = 'pending'
    and exists (
      select 1 from public.trip_plans p
       where p.id = trip_collaborators.trip_plan_id
         and p.user_id = auth.uid()
    )
    and (select public.are_friends(auth.uid(), trip_collaborators.user_id))
  );

-- Only the person who was asked can answer, and the only answer is yes:
-- declining is a delete, exactly as it is for a friend request.
drop policy if exists "coplan_respond" on public.trip_collaborators;
create policy "coplan_respond" on public.trip_collaborators
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status = 'accepted');

-- The owner can withdraw, the collaborator can leave. Same act, same row.
drop policy if exists "coplan_delete" on public.trip_collaborators;
create policy "coplan_delete" on public.trip_collaborators
  for delete using (auth.uid() in (user_id, invited_by));

-- Same lesson as migration 011: a WITH CHECK cannot see the OLD row, so the
-- columns that name the people and the plan are made unwritable rather than
-- defended by a policy. Answering stays possible because status does not.
revoke update on public.trip_collaborators from authenticated;
grant update (status, responded_at) on public.trip_collaborators to authenticated;

-- ---------------------------------------------------------------------------
-- The one cross-table check
-- ---------------------------------------------------------------------------
-- security definer so a policy calling it does not re-enter this table's own
-- RLS; stable so a policy can cache it per statement. One-armed in spirit: it
-- answers about a plan and a person, and every caller passes auth.uid().
create or replace function public.is_coplanner(plan uuid, who uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_collaborators c
     where c.trip_plan_id = plan
       and c.user_id = who
       and c.status = 'accepted'
  );
$$;

-- ---------------------------------------------------------------------------
-- trip_plans: the same four policies, widened
-- ---------------------------------------------------------------------------
drop policy if exists "trip_plans_select_own" on public.trip_plans;
create policy "trip_plans_select_own" on public.trip_plans
  for select using (
    auth.uid() = user_id
    or (select public.is_coplanner(id, auth.uid()))
  );

drop policy if exists "trip_plans_insert_own" on public.trip_plans;
create policy "trip_plans_insert_own" on public.trip_plans
  for insert with check (auth.uid() = user_id);

drop policy if exists "trip_plans_update_own" on public.trip_plans;
create policy "trip_plans_update_own" on public.trip_plans
  for update using (
    auth.uid() = user_id
    or (select public.is_coplanner(id, auth.uid()))
  );

-- Deleting stays the owner's alone. A co-planner leaving is a row in
-- trip_collaborators, never somebody else's trip disappearing.
drop policy if exists "trip_plans_delete_own" on public.trip_plans;
create policy "trip_plans_delete_own" on public.trip_plans
  for delete using (auth.uid() = user_id);

-- The three fields a co-planner may not move, pinned rather than refused.
create or replace function public.guard_coplanner_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() <> old.user_id then
    new.user_id      := old.user_id;
    new.visibility   := old.visibility;
    new.published_at := old.published_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trip_plans_guard_coplanner on public.trip_plans;
-- After 019's stamp trigger, alphabetically and by intent: the stamp decides
-- published_at for an owner, this pins it back for anybody else.
create trigger trip_plans_guard_coplanner
  before update on public.trip_plans
  for each row execute function public.guard_coplanner_write();

-- ---------------------------------------------------------------------------
-- trip_plan_stops: the same four policies, widened, with 003 and 008 intact
-- ---------------------------------------------------------------------------
-- Every reference to the row being written is qualified. Unqualified
-- `user_id` inside these subqueries would resolve to trip_plans.user_id,
-- since the inner scope wins, and the check would then be trivially true.
drop policy if exists "trip_plan_stops_select_own" on public.trip_plan_stops;
create policy "trip_plan_stops_select_own" on public.trip_plan_stops
  for select using (
    auth.uid() = user_id
    or (select public.is_coplanner(trip_plan_stops.trip_plan_id, auth.uid()))
  );

drop policy if exists "trip_plan_stops_insert_own" on public.trip_plan_stops;
create policy "trip_plan_stops_insert_own" on public.trip_plan_stops
  for insert with check (
    exists (
      select 1 from public.trip_plans p
       where p.id = trip_plan_stops.trip_plan_id
         -- 003's rule, and the new one: the row belongs to the PLAN'S owner.
         and p.user_id = trip_plan_stops.user_id
         and (
           p.user_id = auth.uid()
           or (select public.is_coplanner(p.id, auth.uid()))
         )
    )
  );

drop policy if exists "trip_plan_stops_update_own" on public.trip_plan_stops;
create policy "trip_plan_stops_update_own" on public.trip_plan_stops
  for update using (
    auth.uid() = user_id
    or (select public.is_coplanner(trip_plan_stops.trip_plan_id, auth.uid()))
  )
  with check (
    exists (
      select 1 from public.trip_plans p
       where p.id = trip_plan_stops.trip_plan_id
         and p.user_id = trip_plan_stops.user_id
         and (
           p.user_id = auth.uid()
           or (select public.is_coplanner(p.id, auth.uid()))
         )
    )
  );

drop policy if exists "trip_plan_stops_delete_own" on public.trip_plan_stops;
create policy "trip_plan_stops_delete_own" on public.trip_plan_stops
  for delete using (
    auth.uid() = user_id
    or (select public.is_coplanner(trip_plan_stops.trip_plan_id, auth.uid()))
  );

-- day_plans is NOT widened. See the note at the top of this file: the ledger,
-- the booking references and the photographs live in that one payload, and a
-- co-planner was invited to help pick cities.

-- ---------------------------------------------------------------------------
-- Reading the people on a trip
-- ---------------------------------------------------------------------------
-- Who is on this trip, with their profile, for the owner and the accepted
-- co-planners. Anybody else gets nothing, so this is not a way to ask who
-- somebody travels with.
create or replace function public.list_trip_coplanners(wanted_plan uuid)
returns table (
  user_id      uuid,
  handle       text,
  display_name text,
  avatar_emoji text,
  status       text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.user_id, pr.handle, pr.display_name, pr.avatar_emoji, c.status, c.created_at
    from public.trip_collaborators c
    join public.profiles pr on pr.user_id = c.user_id
   where c.trip_plan_id = wanted_plan
     and auth.uid() is not null
     and (
       exists (select 1 from public.trip_plans p
                where p.id = wanted_plan and p.user_id = auth.uid())
       or public.is_coplanner(wanted_plan, auth.uid())
     )
   order by c.created_at;
$$;

-- The invitations waiting on YOU, with enough to say what is being offered.
create or replace function public.list_coplan_invites()
returns table (
  trip_plan_id uuid,
  label        text,
  owner_handle text,
  owner_name   text,
  cities       text[],
  countries    text[],
  status       text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.trip_plan_id,
    tp.label,
    pr.handle,
    pr.display_name,
    (select array_agg(st.city order by st.position)
       from public.trip_plan_stops st where st.trip_plan_id = tp.id),
    (select array_agg(distinct st.country)
       from public.trip_plan_stops st
      where st.trip_plan_id = tp.id and st.country is not null),
    c.status,
    c.created_at
  from public.trip_collaborators c
  join public.trip_plans tp on tp.id = c.trip_plan_id
  join public.profiles pr on pr.user_id = tp.user_id
  where c.user_id = auth.uid()
    and c.status = 'pending'
  order by c.created_at desc;
$$;

revoke all on function public.is_coplanner(uuid, uuid) from public, anon, authenticated;
revoke all on function public.guard_coplanner_write() from public, anon, authenticated;
revoke all on function public.list_trip_coplanners(uuid) from public, anon;
revoke all on function public.list_coplan_invites() from public, anon;
grant execute on function public.list_trip_coplanners(uuid) to authenticated;
grant execute on function public.list_coplan_invites() to authenticated;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  n int;
begin
  -- Nobody is co-planning anything the moment this applies.
  select count(*) into n from public.trip_collaborators;
  if n > 0 then
    raise exception '% collaborator row(s) exist straight after the migration', n;
  end if;

  -- The guards 011 and 019 rely on: still exactly four policies on each table.
  select count(*) into n
    from pg_policies where schemaname = 'public' and tablename = 'trip_plans';
  if n <> 4 then
    raise exception 'trip_plans has % policies, expected 4', n;
  end if;
  select count(*) into n
    from pg_policies where schemaname = 'public' and tablename = 'trip_plan_stops';
  if n <> 4 then
    raise exception 'trip_plan_stops has % policies, expected 4', n;
  end if;

  -- Deleting a trip stays the owner's alone.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'trip_plans' and cmd = 'DELETE'
       and coalesce(qual, '') like '%is_coplanner%'
  ) then
    raise exception 'a co-planner can delete somebody else''s trip';
  end if;

  -- day_plans was not widened: still the four owner-only policies, none of
  -- which has heard of a co-planner.
  select count(*) into n
    from pg_policies where schemaname = 'public' and tablename = 'day_plans';
  if n <> 4 then
    raise exception 'day_plans has % policies, expected the original 4', n;
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'day_plans'
       and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%coplan%'
  ) then
    raise exception 'day_plans was widened to co-planners, which hands over the ledger';
  end if;

  -- 003 and 008 survive: a stop still cannot be parented onto a plan whose
  -- owner it does not belong to.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'trip_plan_stops' and cmd = 'INSERT'
       and with_check like '%trip_plan_stops.user_id%'
  ) then
    raise exception 'the stop insert check no longer pins the row to the plan owner';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'trip_plan_stops' and cmd = 'UPDATE'
       and with_check like '%trip_plan_stops.user_id%'
  ) then
    raise exception 'the stop update check no longer pins the row to the plan owner';
  end if;

  -- The identity columns of a collaboration must not be writable, or the
  -- person who was asked could rewrite which trip they were asked about.
  if exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'trip_collaborators'
       and grantee = 'authenticated' and privilege_type = 'UPDATE'
       and column_name in ('trip_plan_id', 'user_id', 'invited_by')
  ) then
    raise exception 'authenticated can still update the identity columns of a collaboration';
  end if;
  if not exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'trip_collaborators'
       and grantee = 'authenticated' and privilege_type = 'UPDATE'
       and column_name = 'status'
  ) then
    raise exception 'authenticated cannot update status, so no invitation could be accepted';
  end if;

  -- The guard trigger is really attached, or publishing somebody else's trip
  -- would only be discouraged rather than impossible.
  if not exists (
    select 1 from pg_trigger
     where tgname = 'trip_plans_guard_coplanner' and not tgisinternal
  ) then
    raise exception 'the co-planner guard trigger is not attached to trip_plans';
  end if;

  -- Only a friend can be invited.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'trip_collaborators' and cmd = 'INSERT'
       and with_check like '%are_friends%'
  ) then
    raise exception 'the invite policy does not require an accepted friendship';
  end if;

  raise notice 'co-planners self-check passed';
end;
$$;
