-- 059_shared_saved_lists_down.sql
--
-- *** DOWN MIGRATION FOR 059, APPLIED BY THE OWNER ONLY TO ROLL BACK T941. ***
-- Paste in the Supabase SQL editor. One way: every shared list, its members,
-- items, notes and votes are deleted. Private lists are untouched, because
-- they live on the device and in user_settings, not in these tables.
-- The app keeps working: a missing table hides shared lists and Share.

drop function if exists public.shared_list_people();
drop trigger if exists shared_lists_owner_member on public.shared_lists;
drop function if exists public.shared_lists_owner_member();
drop table if exists public.shared_list_votes;
drop table if exists public.shared_list_items;
drop table if exists public.shared_list_members;
drop table if exists public.shared_lists;
drop function if exists public.shared_list_role(uuid);

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename like 'shared_list%') then
    raise exception 'a shared list table is still there';
  end if;
  raise notice 'shared saved lists removed';
end;
$$;
