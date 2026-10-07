-- Are 032, 033 and 034 live? They change function bodies, so this reads the bodies. Read-only.
-- Paste into the Supabase SQL editor of ntssxktaduxzpsmejwyv and run; copy the one result row.
select
  (select bool_or(prosrc ilike '%aal%') from pg_proc
    where proname = 'admin_ban_user' and pronamespace = 'public'::regnamespace)         as m032_ban_needs_mfa,
  (select bool_or(prosrc ilike '%previous%') from pg_proc
    where proname = 'admin_set_config' and pronamespace = 'public'::regnamespace)       as m033_audit_keeps_previous,
  (select bool_or(prosrc ilike '%admin_guard(''destructive'')%') from pg_proc
    where proname = 'admin_set_config' and pronamespace = 'public'::regnamespace)       as m034_config_on_destructive_tier,
  (select bool_or(prosrc ilike '%admin_guard(''destructive'')%') from pg_proc
    where proname = 'admin_set_feedback_status' and pronamespace = 'public'::regnamespace) as m034_feedback_on_destructive_tier;
