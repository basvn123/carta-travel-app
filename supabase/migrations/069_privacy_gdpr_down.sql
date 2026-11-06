-- 069_privacy_gdpr_down.sql: undo 069 (T1118).
--
-- Drops the retention job and its function, the erase trigger and its
-- function, the schema 4 export and its helper, and puts schema 3 back under
-- its own name with its grants. What the sweep or an account deletion
-- already removed stays removed: those deletes are one-way by design.

do $down$
begin
  -- Dynamic, so the file also runs where pg_cron (and so cron.job) is absent.
  if to_regclass('cron.job') is not null then
    execute $q$select cron.unschedule(jobname) from cron.job where jobname = 'carta_privacy_retention'$q$;
  end if;
end;
$down$;

drop function if exists public.privacy_retention_sweep();

drop trigger if exists on_auth_user_deleted_privacy on auth.users;
drop function if exists public.privacy_erase_account();

do $exp$
begin
  if to_regprocedure('public.export_user_data_v3()') is not null then
    drop function if exists public.export_user_data();
    alter function public.export_user_data_v3() rename to export_user_data;
  end if;
end;
$exp$;

revoke all on function public.export_user_data() from public, anon;
grant execute on function public.export_user_data() to authenticated, service_role;

drop function if exists public.privacy_rows(text, text, text[], uuid);
