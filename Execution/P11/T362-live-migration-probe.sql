-- Which migrations from 017 onward are live? Read-only: it only reads the catalog.
-- Paste into the Supabase SQL editor of ntssxktaduxzpsmejwyv and run; copy the result grid.
-- Each row tests one object that only that migration creates (written 2026-10-07, T362 follow-up).
with probe(migration, kind, name) as (values
  ('017','table','feedback'),
  ('018','table','content_overrides'),
  ('019','function','list_public_guides'),
  ('020','table','trip_collaborators'),
  ('021','function','ai_status'),
  ('022','function','paywall_event'),
  ('023','function','is_coplanner_me'),
  ('024','function','export_user_data'),
  ('025','column','pass_grants.consent_at'),
  ('026','column','pass_grants.amount_cents'),
  ('027','function','t034_gate_kind'),
  ('028','function','admin_ai_model_report'),
  ('029','function','admin_ai_cache_report'),
  ('030','function','admin_ai_usage'),
  ('031','function','eu_vat_bp'),
  ('032','function','admin_ban_user'),
  ('035','column','site_config.public'),
  ('036','function','admin_list_public_guides'),
  ('037','function','report_guide'),
  ('038','function','admin_unpublish_guide'),
  ('039','function','contest_moderation_decision'),
  ('040','function','log_edge_error'),
  ('041','function','admin_pipeline_health'),
  ('042','function','log_parse_failure'),
  ('043','function','admin_list_overrides'),
  ('044','function','pass_can_buy'),
  ('045','function','admin_set_config_public'),
  ('046','function','is_friend_me'),
  ('047','function','admin_adjust_expiry'),
  ('048','function','launch_count')
)
select p.migration, p.kind, p.name,
  case p.kind
    when 'table' then to_regclass('public.' || p.name) is not null
    when 'function' then exists (select 1 from pg_proc f join pg_namespace n on n.oid = f.pronamespace
                                 where n.nspname = 'public' and f.proname = p.name)
    when 'column' then exists (select 1 from information_schema.columns c
                               where c.table_schema = 'public'
                                 and c.table_name = split_part(p.name, '.', 1)
                                 and c.column_name = split_part(p.name, '.', 2))
  end as live,
  (select string_agg(pg_get_function_identity_arguments(f.oid), ' | ')
     from pg_proc f join pg_namespace n on n.oid = f.pronamespace
    where n.nspname = 'public' and f.proname = p.name and p.kind = 'function') as signature
from probe p
order by p.migration;
