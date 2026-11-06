-- 060_email_prefs_down.sql
--
-- *** DOWN MIGRATION FOR 060, APPLIED BY THE OWNER ONLY TO ROLL BACK T944. ***
-- Paste in the Supabase SQL editor. Every account's email switches, consent
-- times and the log of sent emails are deleted (one way). Account then hides
-- the Emails group and the notify function finds nothing to send.

do $$
begin
  -- Dynamic, so the file also runs where pg_cron (and so cron.job) is
  -- absent: a static reference to cron.job fails at parse time there.
  if to_regclass('cron.job') is not null then
    execute $q$select cron.unschedule(jobname) from cron.job where jobname = 'carta_notify_reminders'$q$;
  end if;
end;
$$;

drop function if exists public.notify_reminder_candidates(date, date);
drop trigger if exists email_prefs_stamp on public.email_prefs;
drop function if exists public.email_prefs_stamp();
drop table if exists public.email_log;
drop table if exists public.email_prefs;
