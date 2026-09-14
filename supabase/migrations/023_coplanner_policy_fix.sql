-- Repair: every read of public.trip_plans and public.trip_plan_stops fails
-- with 42501, so every account's Planned and Visited trips are invisible.
--
-- WHAT BROKE. Migration 020 widened the four policies on each of those tables
-- to accepted co-planners, and expressed that through is_coplanner:
--
--   using (auth.uid() = user_id
--          or (select public.is_coplanner(id, auth.uid())))
--
-- and then, in the same file, revoked EXECUTE on that function from anon and
-- authenticated, because it answers "is this person on that trip" about ANY
-- pair and nobody outside the database has business asking that.
--
-- This is migration 011's mistake, exactly, one table over. An RLS policy
-- expression is evaluated with the privileges of the role running the query,
-- not the privileges of whoever wrote the policy, so the revoke made all
-- eight policies uncallable and every select returned "permission denied for
-- function is_coplanner". Including an owner reading their OWN trip: the left
-- side of the OR does not short-circuit the right, and wrapping the call as
-- (select ...) makes it an InitPlan that is evaluated once per statement no
-- matter what the other arm says.
--
-- The symptom was silent in exactly the way 012's was. SavedTripsPanel's
-- loadTripPlans has a bare .catch(() => {}), so a table that refuses to be
-- read and a table with nothing in it render the same empty tab. No rows were
-- ever deleted; they were only refused.
--
-- THE FIX, and why not simply granting EXECUTE. Granting is_coplanner to
-- authenticated would work and would hand every signed-in account an oracle
-- for any (trip, person) pair, which is the exact thing the revoke was
-- protecting. Instead the policies now call a function that can only answer
-- about the caller: one argument, the trip, with auth.uid() supplied from
-- inside. There is no way to ask it who else is on somebody's holiday.
--
-- Apply in the Supabase SQL editor. Live project policy: never `db push`
-- against ntssxktaduxzpsmejwyv; paste this file there by hand.
-- Requires 020_coplanners.sql.

-- ---------------------------------------------------------------------------
-- A co-planner check that is safe to hand to the caller
-- ---------------------------------------------------------------------------
-- Stable so a policy evaluates it once per statement rather than once per
-- row, and one-armed so it cannot be used to learn who travels with whom.
--
-- security definer is NOT what stops this from re-entering trip_collaborators'
-- own RLS and looping back through the policy that called it. What stops that
-- is that the function runs as its OWNER, the owner is postgres, postgres owns
-- trip_collaborators, and a table owner is exempt from RLS unless the table
-- carries FORCE ROW LEVEL SECURITY. So `alter table public.trip_collaborators
-- force row level security` would bring 011's 42P17 straight back through this
-- function. The self-check at the foot of this file asserts it is off.
--
-- Returns false for an anonymous caller, which makes the policy arm false and
-- leaves anon exactly as unable to read trips as it was meant to be.
create or replace function public.is_coplanner_me(plan uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_collaborators c
     where auth.uid() is not null
       and c.trip_plan_id = plan
       and c.user_id = auth.uid()
       and c.status = 'accepted'
  );
$$;

grant execute on function public.is_coplanner_me(uuid) to anon, authenticated;

-- is_coplanner(plan, who) stays revoked. It is still used, but only from
-- inside list_trip_coplanners, which is a security definer function owned by
-- postgres, so the owner's privileges apply and no client needs it.

-- ---------------------------------------------------------------------------
-- trip_plans: the same four policies, same widening, callable this time
-- ---------------------------------------------------------------------------
drop policy if exists "trip_plans_select_own" on public.trip_plans;
create policy "trip_plans_select_own" on public.trip_plans
  for select using (
    auth.uid() = user_id
    or (select public.is_coplanner_me(trip_plans.id))
  );

drop policy if exists "trip_plans_insert_own" on public.trip_plans;
create policy "trip_plans_insert_own" on public.trip_plans
  for insert with check (auth.uid() = user_id);

drop policy if exists "trip_plans_update_own" on public.trip_plans;
create policy "trip_plans_update_own" on public.trip_plans
  for update using (
    auth.uid() = user_id
    or (select public.is_coplanner_me(trip_plans.id))
  );

-- Deleting stays the owner's alone, as it was in 020.
drop policy if exists "trip_plans_delete_own" on public.trip_plans;
create policy "trip_plans_delete_own" on public.trip_plans
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- trip_plan_stops: likewise, with 003, 008 and 020 intact
-- ---------------------------------------------------------------------------
-- Every reference to the row being written stays qualified. Unqualified
-- `user_id` inside these subqueries would resolve to trip_plans.user_id,
-- since the inner scope wins, and the check would then be trivially true.
drop policy if exists "trip_plan_stops_select_own" on public.trip_plan_stops;
create policy "trip_plan_stops_select_own" on public.trip_plan_stops
  for select using (
    auth.uid() = user_id
    or (select public.is_coplanner_me(trip_plan_stops.trip_plan_id))
  );

drop policy if exists "trip_plan_stops_insert_own" on public.trip_plan_stops;
create policy "trip_plan_stops_insert_own" on public.trip_plan_stops
  for insert with check (
    exists (
      select 1 from public.trip_plans p
       where p.id = trip_plan_stops.trip_plan_id
         -- 003's rule, and 020's: the row belongs to the PLAN'S owner.
         and p.user_id = trip_plan_stops.user_id
         and (
           p.user_id = auth.uid()
           or (select public.is_coplanner_me(p.id))
         )
    )
  );

drop policy if exists "trip_plan_stops_update_own" on public.trip_plan_stops;
create policy "trip_plan_stops_update_own" on public.trip_plan_stops
  for update using (
    auth.uid() = user_id
    or (select public.is_coplanner_me(trip_plan_stops.trip_plan_id))
  )
  with check (
    exists (
      select 1 from public.trip_plans p
       where p.id = trip_plan_stops.trip_plan_id
         and p.user_id = trip_plan_stops.user_id
         and (
           p.user_id = auth.uid()
           or (select public.is_coplanner_me(p.id))
         )
    )
  );

drop policy if exists "trip_plan_stops_delete_own" on public.trip_plan_stops;
create policy "trip_plan_stops_delete_own" on public.trip_plan_stops
  for delete using (
    auth.uid() = user_id
    or (select public.is_coplanner_me(trip_plan_stops.trip_plan_id))
  );

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  n int;
  plans int;
  stops int;
begin
  -- No policy may still name the two-armed function no client may execute.
  -- `is_coplanner(` matches only that one; is_coplanner_me renders with its
  -- own name and a single argument.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename in ('trip_plans', 'trip_plan_stops')
       and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%is_coplanner(%'
  ) then
    raise exception 'a policy still calls is_coplanner(plan, who), which no client may execute';
  end if;

  -- Whatever a policy calls, both client roles must be able to execute, or
  -- reading a trip raises 42501 instead of returning rows.
  -- has_function_privilege rather than information_schema.role_routine_grants:
  -- those views show only the grants the CURRENT user is party to, so under an
  -- unexpected role they come back empty and raise a false alarm that rolls
  -- back a correct repair. This asks the question directly.
  if not has_function_privilege('authenticated', 'public.is_coplanner_me(uuid)', 'EXECUTE') then
    raise exception 'authenticated cannot execute is_coplanner_me, so the policies are still uncallable';
  end if;
  if not has_function_privilege('anon', 'public.is_coplanner_me(uuid)', 'EXECUTE') then
    raise exception 'anon cannot execute is_coplanner_me, so a signed-out visitor gets 42501 instead of no rows';
  end if;

  -- The one-armed shape is the point: two arguments would restore the oracle
  -- the revoke existed to prevent.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'is_coplanner_me';
  if n <> 1 then
    raise exception 'expected exactly 1 is_coplanner_me, found %', n;
  end if;
  if (select pronargs from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.proname = 'is_coplanner_me') <> 1 then
    raise exception 'is_coplanner_me takes more than one argument, which reopens the trip oracle';
  end if;

  -- The general one must stay unreachable, or this file has traded one leak
  -- for the leak it was fixing.
  if to_regprocedure('public.is_coplanner(uuid, uuid)') is not null
     and (has_function_privilege('anon', 'public.is_coplanner(uuid, uuid)', 'EXECUTE')
          or has_function_privilege('authenticated', 'public.is_coplanner(uuid, uuid)', 'EXECUTE')) then
    raise exception 'is_coplanner(plan, who) is executable by a client role again';
  end if;

  -- The ownership exemption this whole design leans on, asserted rather than
  -- assumed. See the note on is_coplanner_me above.
  if (select relforcerowsecurity from pg_class
       where oid = 'public.trip_collaborators'::regclass) then
    raise exception 'trip_collaborators forces row level security, so is_coplanner_me re-enters its own policies';
  end if;

  -- The guards 011, 019 and 020 rely on: still exactly four policies each.
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

  -- Deleting a trip stays the owner's alone (020's rule).
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'trip_plans' and cmd = 'DELETE'
       and coalesce(qual, '') like '%coplanner%'
  ) then
    raise exception 'a co-planner can delete somebody else''s trip';
  end if;

  -- 003, 008 and 020 survive: a stop still cannot be parented onto a plan
  -- whose owner it does not belong to.
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

  -- Nothing was lost while the tables were unreadable. Counted as the owner
  -- of this transaction, which bypasses RLS, so this is the true row count.
  select count(*) into plans from public.trip_plans;
  select count(*) into stops from public.trip_plan_stops;
  raise notice 'co-planner policy repaired: % trip(s), % stop(s) present', plans, stops;
end;
$$;

-- The proof the self-check above cannot give: run the failing query as the
-- role that was failing. A migration runs as the owner, who bypasses RLS
-- entirely, so counting rows there says nothing about whether a client can.
-- Under `set local role authenticated` the policy is evaluated with the
-- client role's privileges, which is what raised 42501 before this file.
-- auth.uid() is null with no JWT, so this reads back zero rows rather than
-- somebody's trips, and the only thing being asserted is that it reads at
-- all.
do $$
begin
  set local role authenticated;
  perform count(*) from public.trip_plans;
  perform count(*) from public.trip_plan_stops;
  reset role;
  raise notice 'both tables are readable by the authenticated role again';
exception
  -- The fault this file exists to fix, still present: abort the paste.
  when insufficient_privilege then
    reset role;
    -- Unless the editor's own role simply may not become `authenticated`, in
    -- which case the proof could not be attempted and says nothing either way.
    if sqlerrm like '%permission denied to set role%' then
      raise notice 'could not become the authenticated role, so this proof was skipped; run scripts/verify_live_policies.mjs instead';
    else
      raise exception 'a client role still cannot read the trip tables: %', sqlerrm;
    end if;
  when others then
    -- Anything else here is not evidence about the policies: a pooled
    -- connection that refuses set local role, an editor quirk. Rolling the
    -- repair back over one of those would cost a good paste to catch nothing,
    -- and verify_live_policies.mjs is better evidence regardless, since it
    -- authenticates as a real user and reads real rows.
    reset role;
    raise notice 'could not read the trip tables as authenticated: % (%). Run scripts/verify_live_policies.mjs to check the repair.', sqlerrm, sqlstate;
end;
$$;
