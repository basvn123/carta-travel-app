-- Down for 074_ai_reports.sql (T1215, row T1156-d). Paste in the SQL editor.
-- ONE-WAY FOR THE DATA: every AI report received goes. Export it first
-- (select * from public.ai_reports) if the eval sets still need its rows.
-- The app needs no rollback to survive this: the report button gets
-- PGRST202 (no such function), says it could not send and offers the mail.

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'carta_ai_reports_prune') then
    perform cron.unschedule('carta_ai_reports_prune');
  end if;
end;
$cron$;

drop function if exists public.admin_list_ai_reports(text, text, int, int);
drop function if exists public.ai_report(text, text, text, text, text, text, text);
drop function if exists public.ai_reports_prune();
drop table if exists public.ai_reports;
drop table if exists public.ai_report_salt;

notify pgrst, 'reload schema';
