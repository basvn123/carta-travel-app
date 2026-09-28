-- 036_admin_public_guides.sql
--
-- admin_list_public_guides(): every published guide, newest first, with its
-- author's email and its view count, for the Guides tab of the admin page.
--
-- WHY. Since 019 a traveller can publish a trip plan as a public guide, which
-- makes Carta a host of user content in the EU. Until now the admin had no way
-- to see what had been published: the public gallery (list_public_guides)
-- shows only what a visitor sees, and nothing in the admin surface read
-- trip_plans by visibility at all. Everything else in Phase 2 of the back end
-- plan (the DSA notice queue, the takedown RPC) needs this list to act on.
--
-- WHAT "PUBLIC" MEANS IN THIS SCHEMA. The plan says "where is_public = true".
-- There is no is_public column. A plan is public when trip_plans.visibility =
-- 'public' (the value 019 added to the check constraint that 011 created),
-- and 019 stamps published_at when it becomes public. This function reads
-- exactly that, the same predicate list_public_guides uses.
--
-- WHAT IT RETURNS. jsonb, in the shape every other admin read model has:
--
--   { "total": <int>, "viewsCounted": false, "rows": [ ... ] }
--
-- one row per public plan, ordered by published_at desc (nulls last), then
-- created_at desc, then id, so the order is stable:
--
--   id, label, userId, email, handle, displayName, avatarEmoji,
--   inGallery, publishedAt, createdAt, updatedAt, stops, cities, views
--
-- email comes from auth.users, read here inside SECURITY DEFINER. The
-- browser never joins to auth.users and cannot: it is not exposed to the
-- client roles. This is the only place the admin page learns an author's
-- address for a guide.
--
-- inGallery is false when the author has no profiles row. list_public_guides
-- and get_public_guide both INNER join profiles, so such a plan is public by
-- its column and yet invisible to every visitor. It happens when 010's signup
-- trigger could not seed a profile: the trigger swallows its own failure so
-- a signup never breaks, and leaves the account without one. The admin list LEFT joins,
-- so it shows every public plan and says which ones the public cannot reach.
--
-- VIEWS ARE NOT COUNTED ANYWHERE, so views is always 0 and viewsCounted is
-- false. This was checked, not assumed: trip_plans has no counter column, no
-- table records a read of a guide or of a share link, and the one hook that
-- fires when a guide is opened, public_guide_opened (019), only awards the
-- local_guide badge (013) and writes nothing that can be counted. The field
-- is in the shape now so the tab does not change when a counter exists; the
-- panel labels the column as not counted yet rather than presenting 0 as a
-- measurement. Building the counter is register row T067-a.
--
-- NO PAGINATION. The plan asks for all public guides, and there are none on
-- the live project that this file knows of. The payload per row is small (no
-- trip payload, no stops beyond city names). When the count grows past a few
-- hundred this needs p_limit and p_offset like admin_list_feedback; that is
-- register row T067-b.
--
-- GUARD. admin_guard('read') (015; 034 left the read tier as it was): a
-- non-admin gets {"error": "forbidden"} and an admin over 60 audit rows in
-- the last minute gets {"error": "slow_down"}. A read writes no audit row, as
-- admin_list_feedback and admin_list_users do not. STABLE, SECURITY DEFINER,
-- search_path = '' so every name below is schema qualified.
--
-- ORDER. Apply in the Supabase SQL editor AFTER 035. It needs 019 (visibility
-- 'public' and published_at on trip_plans) and 015 (admin_guard); the
-- self-check refuses to pass without them. Live project policy: never
-- `db push` against ntssxktaduxzpsmejwyv; paste this file there by hand and
-- look for the notice "admin public guides self-check passed". It is safe to
-- paste twice: it only creates or replaces one function and its grants.
--
-- DOWN MIGRATION (no table or row changed, so this is the whole revert):
--
--   drop function if exists public.admin_list_public_guides();
--   notify pgrst, 'reload schema';

create or replace function public.admin_list_public_guides()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err text := public.admin_guard('read');
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  return jsonb_build_object(
    'total',        (select count(*) from public.trip_plans where visibility = 'public'),
    -- No view counter exists in the schema; see the header.
    'viewsCounted', false,
    'rows',         coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',          tp.id,
        'label',       tp.label,
        'userId',      tp.user_id,
        'email',       u.email,
        'handle',      pr.handle,
        'displayName', pr.display_name,
        'avatarEmoji', pr.avatar_emoji,
        'inGallery',   pr.user_id is not null,
        'publishedAt', tp.published_at,
        'createdAt',   tp.created_at,
        'updatedAt',   tp.updated_at,
        'stops',       (select count(*) from public.trip_plan_stops st
                         where st.trip_plan_id = tp.id),
        'cities',      coalesce((select jsonb_agg(st.city order by st.position)
                                   from public.trip_plan_stops st
                                  where st.trip_plan_id = tp.id), '[]'::jsonb),
        'views',       0
      ) order by tp.published_at desc nulls last, tp.created_at desc, tp.id)
      from public.trip_plans tp
      left join auth.users u      on u.id = tp.user_id
      left join public.profiles pr on pr.user_id = tp.user_id
      where tp.visibility = 'public'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_list_public_guides() from public, anon;
grant execute on function public.admin_list_public_guides() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  fn  constant text := 'public.admin_list_public_guides()';
  src text;
  cfg text[];
  res jsonb;
begin
  -- What this reads has to be there, or the function fails on first call
  -- instead of here.
  if to_regprocedure('public.admin_guard(text)') is null then
    raise exception 'public.admin_guard(text) is missing; apply 015 first';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'trip_plans'
       and column_name = 'published_at'
  ) or not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'trip_plans'
       and column_name = 'visibility'
  ) then
    raise exception 'trip_plans has no visibility or published_at column; apply 011 and 019 first';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles is missing; apply 010 first';
  end if;

  if not (select prosecdef from pg_proc where oid = fn::regprocedure::oid) then
    raise exception '% is not SECURITY DEFINER', fn;
  end if;
  select proconfig into cfg from pg_proc where oid = fn::regprocedure::oid;
  if cfg is null or not ('search_path=""' = any(cfg)) then
    raise exception '% does not pin search_path to empty (proconfig %)', fn, cfg;
  end if;

  select pg_get_functiondef(fn::regprocedure::oid) into src;
  if src not like '%admin_guard(''read'')%' then
    raise exception '% does not pass admin_guard(''read'')', fn;
  end if;

  if has_function_privilege('anon', fn, 'execute') then
    raise exception 'anon can execute %', fn;
  end if;
  if not has_function_privilege('authenticated', fn, 'execute') then
    raise exception 'authenticated cannot execute %; the admin page calls it as authenticated', fn;
  end if;

  -- In the SQL editor there is no signed-in caller, so the guard must refuse.
  -- If this ever returns rows, the guard is not being consulted.
  res := public.admin_list_public_guides();
  if coalesce(res ->> 'error', '') <> 'forbidden' then
    raise exception '% answered a caller with no admin row with %, expected forbidden', fn, left(res::text, 200);
  end if;

  raise notice 'admin public guides self-check passed';
end;
$$;

notify pgrst, 'reload schema';
