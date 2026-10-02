-- 046_coplanner_invite_fix.sql
--
-- Repair: every co-planner invite sent from the client is refused with 42501.
--
-- WHAT BREAKS. Migration 020's insert policy on trip_collaborators,
-- coplan_insert_owner, requires that the invitee is an accepted friend, and
-- expresses that through are_friends:
--
--   and (select public.are_friends(auth.uid(), trip_collaborators.user_id))
--
-- Migration 011 revoked EXECUTE on are_friends from public, anon and
-- authenticated, because it answers "are these two people friends" about ANY
-- pair. An RLS policy expression runs with the privileges of the role running
-- the query, so once 020 is live every insert into trip_collaborators from a
-- signed-in traveller fails with "permission denied for function
-- are_friends". Nobody has seen it because 020 is not applied to the live
-- project yet. T083's row policy test found it (register row T083-a).
--
-- This is the fault 012 repaired for profiles and 023 repaired for trips,
-- one more time.
--
-- THE FIX, and why not a grant. Granting are_friends to authenticated would
-- work and would hand every signed-in account an oracle for any pair of user
-- ids, which is what 011's revoke protects. Instead the policy now calls a
-- one-armed function: one argument, the other person, with auth.uid()
-- supplied from inside. It can only answer "am I friends with this person",
-- which the caller can already learn by reading their own friendships rows
-- (011's friendships_select_own policy). It gives away nothing new.
--
-- security definer so it does not re-enter friendships' own RLS (011's 42P17
-- note). What actually keeps it out of that RLS is that the function runs as
-- its owner, postgres, who owns friendships and is exempt from RLS unless the
-- table carries FORCE ROW LEVEL SECURITY; the self-check asserts it does not.
-- Returns false for a signed-out caller, so the policy arm stays false for
-- anon, which has no insert grant that matters here anyway.
--
-- WHAT IT DOES NOT TOUCH. Only coplan_insert_owner is redefined, with the
-- same four conditions as 020; only the friendship arm changes. are_friends
-- and friend_link_status stay revoked. Nothing 044 or 045 defines is
-- redefined here.
--
-- ORDER. Paste right after 020 in the Supabase SQL editor (020 itself needs
-- 011 and 019 first). If 020 is ever pasted again, paste this file again
-- after it, because 020 recreates the broken policy. Live project policy:
-- never `db push` against ntssxktaduxzpsmejwyv; paste this file by hand.
-- Requires 011_friends.sql and 020_coplanners.sql.

-- ---------------------------------------------------------------------------
-- A friendship check that is safe to hand to the caller
-- ---------------------------------------------------------------------------
create or replace function public.is_friend_me(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select f.status = 'accepted'
      from public.friendships f
     where auth.uid() is not null
       and least(f.requester_id, f.addressee_id) = least(auth.uid(), other)
       and greatest(f.requester_id, f.addressee_id) = greatest(auth.uid(), other)
     limit 1
  ), false);
$$;

-- Least privilege: nobody by default, then the two client roles a policy
-- with no TO clause applies to. anon gets execute only so a signed-out
-- request is refused by the policy (false) rather than by a 42501.
revoke all on function public.is_friend_me(uuid) from public;
grant execute on function public.is_friend_me(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The invite policy: 020's rule, callable this time
-- ---------------------------------------------------------------------------
-- Only the OWNER of the plan invites, only on their own plan, only as
-- pending, and only somebody who is already an accepted friend.
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
    and (select public.is_friend_me(trip_collaborators.user_id))
  );

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  n int;
  chk text;
begin
  select count(*) into n
    from pg_policies where schemaname = 'public' and tablename = 'trip_collaborators';
  if n <> 4 then
    raise exception 'trip_collaborators has % policies, expected 020''s 4', n;
  end if;

  select with_check into chk
    from pg_policies
   where schemaname = 'public' and tablename = 'trip_collaborators'
     and policyname = 'coplan_insert_owner' and cmd = 'INSERT';
  if chk is null then
    raise exception 'coplan_insert_owner is missing';
  end if;
  if chk like '%are_friends%' then
    raise exception 'the invite policy still calls are_friends, which no client may execute';
  end if;
  if chk not like '%is_friend_me%' then
    raise exception 'the invite policy no longer requires an accepted friendship';
  end if;
  if chk not like '%invited_by%' or chk not like '%pending%' or chk not like '%trip_plans%' then
    raise exception 'the invite policy lost one of 020''s owner, pending or own-plan conditions';
  end if;

  if not has_function_privilege('authenticated', 'public.is_friend_me(uuid)', 'EXECUTE') then
    raise exception 'authenticated cannot execute is_friend_me, so invites are still refused';
  end if;
  if not has_function_privilege('anon', 'public.is_friend_me(uuid)', 'EXECUTE') then
    raise exception 'anon cannot execute is_friend_me, so a signed-out insert gets 42501 instead of a refusal';
  end if;

  -- One argument is the point: two would restore the pair oracle.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'is_friend_me';
  if n <> 1 then
    raise exception 'expected exactly 1 is_friend_me, found %', n;
  end if;
  if (select pronargs from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.proname = 'is_friend_me') <> 1 then
    raise exception 'is_friend_me takes more than one argument, which reopens the pair oracle';
  end if;

  -- The two-armed oracles stay out of reach of the client roles.
  if has_function_privilege('authenticated', 'public.are_friends(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.are_friends(uuid, uuid)', 'EXECUTE') then
    raise exception 'are_friends(a, b) is executable by a client role';
  end if;
  if has_function_privilege('authenticated', 'public.friend_link_status(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.friend_link_status(uuid, uuid)', 'EXECUTE') then
    raise exception 'friend_link_status(a, b) is executable by a client role';
  end if;

  -- The ownership exemption the definer function leans on.
  if (select relforcerowsecurity from pg_class
       where oid = 'public.friendships'::regclass) then
    raise exception 'friendships forces row level security, so is_friend_me re-enters its policies';
  end if;

  raise notice 'co-planner invite policy self-check passed';
end;
$$;

-- The proof the self-check cannot give: call the function as the role that
-- was failing. auth.uid() is null with no JWT, so the answer is false; the
-- only thing asserted is that the call is allowed at all.
do $$
declare
  ok boolean;
begin
  set local role authenticated;
  select public.is_friend_me('00000000-0000-0000-0000-000000000000'::uuid) into ok;
  reset role;
  if ok then
    raise exception 'is_friend_me said yes for a caller with no session';
  end if;
  raise notice 'is_friend_me is callable by the authenticated role';
exception
  when insufficient_privilege then
    reset role;
    if sqlerrm like '%permission denied to set role%' then
      raise notice 'could not become the authenticated role, so this proof was skipped';
    else
      raise exception 'the authenticated role still cannot call the invite check: %', sqlerrm;
    end if;
end;
$$;
