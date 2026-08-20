-- What this database actually has, answered from inside Postgres.
--
-- WHY THIS EXISTS. The admin panel was diagnosed from the outside, by asking
-- the REST API whether a table answered. That was a mistake worth writing
-- down: PostgREST returns 404 PGRST205 for THREE different situations, and
-- they need completely different fixes.
--
--   1. The table genuinely does not exist.       -> apply the migration
--   2. The table exists, but PostgREST has not   -> notify pgrst, 'reload schema'
--      noticed it yet (stale schema cache).
--   3. The table exists and PostgREST knows it,  -> grant the privileges
--      but neither anon nor authenticated holds
--      any privilege on it, so it is not exposed.
--
-- From outside, all three look identical. From in here they do not. Run this
-- in the Supabase SQL editor whenever a table seems to be missing, before
-- concluding anything.
--
-- Reading the output:
--   exists      false means the migration was never applied. That is case 1.
--   rls         should be true for every table holding user data.
--   policies    0 with rls true means deny-all. Correct for admin_users and
--               admin_audit_log; a bug for anything the app reads directly.
--   anon_*      what a signed-out visitor may do through the API.
--   auth_*      what a signed-in traveller may do. If these are all false on
--               a table the app reads, that is case 3 and cloud sync for that
--               feature is silently broken no matter what the code does.

select
  t.name                                                as table_name,
  to_regclass('public.' || t.name) is not null          as exists,
  coalesce((select c.relrowsecurity from pg_class c
             where c.oid = to_regclass('public.' || t.name)), false) as rls,
  coalesce((select count(*) from pg_policies p
             where p.schemaname = 'public' and p.tablename = t.name), 0) as policies,
  case when to_regclass('public.' || t.name) is null then null
       else has_table_privilege('anon', 'public.' || t.name, 'SELECT') end as anon_select,
  case when to_regclass('public.' || t.name) is null then null
       else has_table_privilege('authenticated', 'public.' || t.name, 'SELECT') end as auth_select,
  case when to_regclass('public.' || t.name) is null then null
       else has_table_privilege('authenticated', 'public.' || t.name, 'INSERT') end as auth_insert
from (values
  ('profiles'), ('entitlements'), ('plan_tiers'), ('pass_grants'),
  ('ai_usage'), ('ai_daily_total'), ('ai_plan_cache'),
  ('trip_plans'), ('trip_plan_stops'), ('day_plans'),
  ('friendships'), ('trip_shares'), ('user_achievements'),
  ('feedback'), ('admin_users'), ('admin_audit_log'), ('site_config')
) as t(name)
order by exists, t.name;

-- Every admin function, and who may call it. authenticated should be true on
-- the admin_* ones (they gate themselves internally), anon false on all of
-- them, and both false on the internal helpers admin_log, admin_guard and
-- admin_user_counts.
select
  p.proname                                          as function_name,
  pg_get_function_identity_arguments(p.oid)          as args,
  p.prosecdef                                        as security_definer,
  has_function_privilege('anon', p.oid, 'execute')          as anon_can_call,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_call
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname like 'admin\_%' or p.proname in ('is_admin', 'submit_feedback'))
order by p.proname;

-- Whoever is on the admin list. Should be exactly the people you expect.
select u.email, a.note, a.created_at
  from public.admin_users a
  join auth.users u on u.id = a.user_id
 order by a.created_at;

-- Finally, make PostgREST re-read the schema, which fixes case 2 above and
-- costs nothing when it was not the problem.
notify pgrst, 'reload schema';
