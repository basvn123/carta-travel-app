-- 065_account_things_down.sql
--
-- *** DOWN MIGRATION FOR 065, APPLIED BY THE OWNER ONLY TO ROLL BACK T1104. ***
-- Paste in the Supabase SQL editor. ONE-WAY FOR THE DATA: the rows in
-- account_things go with the table. Every device that synced keeps its own
-- copy in local storage, so nothing a traveller sees on a device they used
-- is lost; what is lost is the copy a new device would have pulled. Take an
-- export first if that matters (select * from public.account_things).
--
-- The app needs no rollback to survive this: without the table the sync
-- turns itself off (PGRST205 or 42P01) and the things stay on the device.
-- Roll the app back too (git revert of the T1104 commits) to stop the one
-- failing read per sign-in.

drop trigger if exists account_things_cap on public.account_things;
drop function if exists public.account_things_cap();
drop table if exists public.account_things;

notify pgrst, 'reload schema';

do $$
begin
  if to_regclass('public.account_things') is not null then
    raise exception 'account_things is still there';
  end if;
  raise notice 'account things down done';
end $$;
