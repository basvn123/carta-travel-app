-- 066_waitlist_down.sql
--
-- *** DOWN MIGRATION FOR 066, APPLIED BY THE OWNER ONLY TO ROLL BACK T1110. ***
-- Paste in the Supabase SQL editor. ONE-WAY FOR THE DATA: the addresses go
-- with the table. Export first if they matter:
--   select * from public.waitlist_signups;
-- The app needs no rollback to survive this: the form shows its "try again
-- later" line while the function cannot reach the table.

drop function if exists public.waitlist_join(text, text, text);
drop function if exists public.waitlist_confirm(text);
drop function if exists public.waitlist_unsubscribe(text);
drop function if exists public.waitlist_audience();
drop function if exists public.waitlist_purge(int);
drop table if exists public.waitlist_signups;

notify pgrst, 'reload schema';

do $$
begin
  if to_regclass('public.waitlist_signups') is not null then
    raise exception 'waitlist_signups is still there';
  end if;
  raise notice 'waitlist down done';
end $$;
