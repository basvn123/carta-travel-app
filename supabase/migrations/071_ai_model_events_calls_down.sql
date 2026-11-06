-- Down for 071_ai_model_events_calls.sql (T1139, E4). One way for call rows: they are deleted.
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('carta_ai_events_prune');
  end if;
exception when others then null;
end;
$cron$;
drop function if exists public.ai_events_prune();
drop function if exists public.admin_ai_calls_weekly(int);
delete from public.ai_model_events where kind = 'call';
drop index if exists public.ai_model_events_feature_created_idx;
alter table public.ai_model_events drop constraint if exists ai_model_events_call_shape;
alter table public.ai_model_events
  drop column if exists feature, drop column if exists provider, drop column if exists prompt_id,
  drop column if exists prompt_version, drop column if exists tokens_in, drop column if exists tokens_out,
  drop column if exists tokens_estimated, drop column if exists cost_usd, drop column if exists latency_ms,
  drop column if exists outcome, drop column if exists code, drop column if exists attempts,
  drop column if exists query_hash;
alter table public.ai_model_events drop constraint if exists ai_model_events_kind_check;
alter table public.ai_model_events add constraint ai_model_events_kind_check check (kind in ('plan', 'ground'));
alter table public.ai_model_events alter column user_id set not null;
-- admin_ai_model_report keeps the plan/ground filter, which is harmless without call rows.
