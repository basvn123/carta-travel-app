-- 063_signed_out_policy_helpers.sql
--
-- *** SCHEMA MIGRATION, APPLIED BY THE OWNER (T1078, ROADMAP C4). ***
-- Paste in the Supabase SQL editor AFTER 061 and 062. Never `db push`
-- against ntssxktaduxzpsmejwyv. Pasting twice is safe. Look for
-- "signed-out policy helpers self-check passed". The way back is
-- 063_signed_out_policy_helpers_down.sql.
--
-- THE FAULT (register row T1070-d). 055, 058 and 059 write their policies
-- with no TO clause, so they apply to every role, anon included, but they
-- grant the three helper functions those policies call to `authenticated`
-- only:
--
--   group_role(g)              055, called by the group trip and ledger policies
--   group_all_joined(g, ids)   058, called by the expense and settlement inserts
--   shared_list_role(l)        059, called by every shared list policy
--
-- An RLS expression runs with the privileges of whoever is querying, so a
-- signed-out read of group_trips, group_trip_members and the rest answered
-- 42501 (permission denied for function group_role) instead of an empty set:
-- the 011 fault class that 012 and 023 repaired for profiles and trips. Not a
-- leak (it was a refusal), but every signed-out PostgREST read of these
-- tables errored, and the row policy suite carried 28 policies as known
-- exceptions. test_rls_policies.mjs lists the 28.
--
-- THE FIX. Let anon execute the three helpers, after making sure each one
-- tells a signed-out caller nothing:
--
--   group_role and shared_list_role already answer null when auth.uid() is
--   null (their first CASE arm), so for anon every policy that calls them is
--   false and the read returns no rows. Granting them changes nothing for a
--   signed-in caller. They are re-created here with the same bodies so the
--   file is self-contained and the self-check can read the guard.
--
--   group_all_joined did NOT check the caller: given any group id and any
--   list of user ids it answered whether all of them were joined members.
--   That was a small membership oracle for every signed-in account (and
--   would have become one for anon). It now answers false unless the caller
--   is the owner or a joined member of that group, who can read the roster
--   anyway. The two policies that call it (058's expense and settlement
--   inserts) already require exactly that role in the same expression, so
--   their decisions do not change.
--
-- Why not scope the 28 policies `to authenticated` instead: that means
-- dropping and re-creating every one of them, a far larger paste for the
-- same outcome, and a future policy written in the house style (no TO
-- clause) would hit the same 42501 again. A helper that is safe for anon
-- cannot fault, whoever the policy applies to.
--
-- TESTED BY .github/workflows/rls-policies.yml
-- (continent-app/scripts/admin/test_rls_policies.mjs): no policy calls a
-- function its roles cannot execute (the three known entries are gone), and
-- for every fixture table anon can select from, a signed-out read returns
-- zero rows without an error.

do $pre$
begin
  if to_regprocedure('public.group_role(uuid)') is null
     or to_regprocedure('public.group_all_joined(uuid, uuid[])') is null
     or to_regprocedure('public.shared_list_role(uuid)') is null then
    raise exception 'a helper is missing; paste 055, 058 and 059 first';
  end if;
end;
$pre$;

-- ---------------------------------------------------------------- group_role
-- 055's body, unchanged: null for a signed-out caller.
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
revoke all on function public.group_role(uuid) from public;
grant execute on function public.group_role(uuid) to anon, authenticated;

-- ---------------------------------------------------------- shared_list_role
-- 059's body, unchanged: null for a signed-out caller.
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
revoke all on function public.shared_list_role(uuid) from public;
grant execute on function public.shared_list_role(uuid) to anon, authenticated;

-- ---------------------------------------------------------- group_all_joined
-- 058's body behind the caller's own role in the group: false for a
-- signed-out caller, an invitee and a stranger.
create or replace function public.group_all_joined(g uuid, ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.group_role(g) in ('owner', 'joined'), false)
     and coalesce(cardinality(ids), 0) > 0
     and not exists (
       select 1 from unnest(ids) as x(id)
        where not exists (
          select 1 from public.group_trip_members m
           where m.group_id = g and m.user_id = x.id and m.status = 'joined'
        )
     );
$$;
revoke all on function public.group_all_joined(uuid, uuid[]) from public;
grant execute on function public.group_all_joined(uuid, uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------- self-check
do $$
declare
  fn  text;
  bad text;
begin
  foreach fn in array array['public.group_role(uuid)', 'public.group_all_joined(uuid, uuid[])', 'public.shared_list_role(uuid)'] loop
    if not has_function_privilege('anon', fn, 'execute') then
      raise exception 'anon cannot execute %', fn;
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = fn::regprocedure) then
      raise exception '% must be SECURITY DEFINER', fn;
    end if;
    if not exists (select 1 from pg_proc p where p.oid = fn::regprocedure
                    and array_to_string(p.proconfig, ',') like '%search_path=public%') then
      raise exception '% must pin search_path', fn;
    end if;
  end loop;
  -- Each helper must tell a signed-out caller nothing.
  if position('auth.uid() is null then null' in pg_get_functiondef('public.group_role(uuid)'::regprocedure)) = 0
     or position('auth.uid() is null then null' in pg_get_functiondef('public.shared_list_role(uuid)'::regprocedure)) = 0 then
    raise exception 'group_role and shared_list_role must answer null for a signed-out caller';
  end if;
  if position('group_role(g)' in pg_get_functiondef('public.group_all_joined(uuid, uuid[])'::regprocedure)) = 0 then
    raise exception 'group_all_joined must check the caller''s role in the group first';
  end if;
  -- And it does, as written: with no claims set (the SQL editor, or a
  -- signed-out request) every answer is null or false.
  if public.group_role(gen_random_uuid()) is not null
     or public.shared_list_role(gen_random_uuid()) is not null
     or public.group_all_joined(gen_random_uuid(), array[gen_random_uuid()]) then
    raise exception 'a helper answered something other than null or false without a signed-in caller';
  end if;
  -- No policy on the group or shared list tables still calls a public
  -- function anon cannot execute.
  select string_agg(distinct p.tablename || '.' || p.policyname, ', ') into bad
    from pg_policies p
    cross join lateral (
      select pr.oid from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
       where n.nspname = 'public'
         and pr.proname in ('group_role', 'group_all_joined', 'shared_list_role')
         and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) like '%' || pr.proname || '(%'
    ) f
   where p.schemaname = 'public'
     and not has_function_privilege('anon', f.oid, 'execute');
  if bad is not null then
    raise exception 'these policies still call a helper anon cannot execute: %', bad;
  end if;
  raise notice 'signed-out policy helpers self-check passed';
end;
$$;

notify pgrst, 'reload schema';
