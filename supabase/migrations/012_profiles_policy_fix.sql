-- Repair: every read of public.profiles fails with 42501.
--
-- WHAT BROKE. Migration 011 widened the profiles SELECT policy to people you
-- have a link with, and expressed that through friend_link_status:
--
--   using (auth.uid() = user_id
--          or (select public.friend_link_status(auth.uid(), user_id))
--              in ('pending', 'accepted'))
--
-- and then, in the same file, revoked EXECUTE on that function from anon and
-- authenticated, because it answers "are these two people linked" about ANY
-- pair and nobody outside the database has business asking that.
--
-- Both halves were right on their own and fatal together. An RLS policy
-- expression is evaluated with the privileges of the role running the query,
-- not the privileges of whoever wrote the policy, so the revoke made the
-- policy uncallable and every select on profiles returned
-- "permission denied for function friend_link_status". Including a traveller
-- reading their OWN row, because Postgres does not guarantee that the left
-- side of an OR short-circuits the right.
--
-- The symptom was silent: fetchMyProfile threw, the callers had a bare
-- .catch(() => {}) on the theory that a missing profile is not something a
-- traveller can act on, and the handle block simply never rendered. Nothing
-- in the browser tests could see it either, since they stub the REST layer.
-- Both of those are addressed alongside this file.
--
-- THE FIX, and why not simply granting EXECUTE. Granting friend_link_status
-- to authenticated would work and would hand every signed-in account an
-- oracle for any pair of user ids, which is the exact thing the revoke was
-- protecting. Instead the policy now calls a function that can only answer
-- about the caller: one argument, the other person, with auth.uid() supplied
-- from inside. There is no way to ask it about two other people.
--
-- Apply in the Supabase SQL editor. Live project policy: never `db push`
-- against ntssxktaduxzpsmejwyv; paste this file there by hand.
-- Requires 011_friends.sql.

-- ---------------------------------------------------------------------------
-- A link check that is safe to hand to the caller
-- ---------------------------------------------------------------------------
-- security definer so it does not re-enter friendships' own RLS (the 42P17
-- note in 011 still applies), stable so a policy evaluates it once per
-- statement rather than once per row, and one-armed so it cannot be used to
-- learn anything about a pair the caller is not half of.
--
-- Returns NULL for an anonymous caller, which makes the policy arm false and
-- leaves anon exactly as unable to read profiles as it was meant to be.
create or replace function public.link_status_with_me(other uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select f.status
    from public.friendships f
   where auth.uid() is not null
     and least(f.requester_id, f.addressee_id) = least(auth.uid(), other)
     and greatest(f.requester_id, f.addressee_id) = greatest(auth.uid(), other)
   limit 1;
$$;

grant execute on function public.link_status_with_me(uuid) to anon, authenticated;

-- friend_link_status stays revoked. It is still used, but only from inside
-- are_friends, which is itself called only from security definer functions
-- owned by postgres, so the owner's privileges apply and no client needs it.

drop policy if exists "profiles_select_visible" on public.profiles;
create policy "profiles_select_visible" on public.profiles
  for select using (
    auth.uid() = user_id
    or (select public.link_status_with_me(user_id)) in ('pending', 'accepted')
  );

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  n int;
begin
  -- The policy must not name the function no client may execute.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT'
       and coalesce(qual, '') like '%friend_link_status%'
  ) then
    raise exception 'the profiles policy still calls friend_link_status, which no client may execute';
  end if;

  -- Whatever a policy on profiles does call, both client roles must be able
  -- to execute, or reading a profile raises 42501 instead of returning rows.
  if not exists (
    select 1 from information_schema.role_routine_grants
     where routine_schema = 'public' and routine_name = 'link_status_with_me'
       and grantee = 'authenticated' and privilege_type = 'EXECUTE'
  ) then
    raise exception 'authenticated cannot execute link_status_with_me, so the policy is still uncallable';
  end if;

  -- And the one-armed shape is the point: two arguments would restore the
  -- oracle the revoke existed to prevent.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'link_status_with_me';
  if n <> 1 then
    raise exception 'expected exactly 1 link_status_with_me, found %', n;
  end if;
  if (select pronargs from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.proname = 'link_status_with_me') <> 1 then
    raise exception 'link_status_with_me takes more than one argument, which reopens the pair oracle';
  end if;

  -- Every account can still be counted, which is the read that was failing.
  select count(*) into n from public.profiles;
  raise notice 'profiles policy repaired, % profile(s) present', n;
end;
$$;
