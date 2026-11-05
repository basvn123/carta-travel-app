-- 063_signed_out_policy_helpers_down.sql
--
-- *** DOWN MIGRATION FOR 063, APPLIED BY THE OWNER ONLY TO ROLL BACK T1078. ***
-- Paste in the Supabase SQL editor. No data changes. The three helpers go
-- back to `authenticated` only, and group_all_joined gets 058's body back
-- (without the caller's role check). Afterwards a signed-out read of the
-- group trip and shared list tables answers 42501 again, and
-- test_rls_policies.mjs needs its three KNOWN_UNCALLABLE entries back.

create or replace function public.group_all_joined(g uuid, ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(cardinality(ids), 0) > 0 and not exists (
    select 1 from unnest(ids) as x(id)
     where not exists (
       select 1 from public.group_trip_members m
        where m.group_id = g and m.user_id = x.id and m.status = 'joined'
     )
  );
$$;

revoke all on function public.group_role(uuid) from public, anon;
grant execute on function public.group_role(uuid) to authenticated;
revoke all on function public.group_all_joined(uuid, uuid[]) from public, anon;
grant execute on function public.group_all_joined(uuid, uuid[]) to authenticated;
revoke all on function public.shared_list_role(uuid) from public, anon;
grant execute on function public.shared_list_role(uuid) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.group_role(uuid)', 'execute')
     or has_function_privilege('anon', 'public.shared_list_role(uuid)', 'execute')
     or has_function_privilege('anon', 'public.group_all_joined(uuid, uuid[])', 'execute') then
    raise exception 'anon can still execute a helper';
  end if;
  raise notice '063 rolled back: the helpers are authenticated only again';
end;
$$;

notify pgrst, 'reload schema';
