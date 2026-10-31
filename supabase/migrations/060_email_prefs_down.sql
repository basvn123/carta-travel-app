-- 060_email_prefs_down.sql
--
-- *** DOWN MIGRATION FOR 060, APPLIED BY THE OWNER ONLY TO ROLL BACK T944. ***
-- Paste in the Supabase SQL editor. Every account's email switches, consent
-- times and the log of sent emails are deleted (one way). Account then hides
-- the Emails group and the notify function finds nothing to send.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'carta_notify_reminders') then
    perform cron.unschedule('carta_notify_reminders');
  end if;
end;
$$;

drop function if exists public.notify_reminder_candidates(date, date);
drop trigger if exists email_prefs_stamp on public.email_prefs;
drop function if exists public.email_prefs_stamp();
drop table if exists public.email_log;
drop table if exists public.email_prefs;
