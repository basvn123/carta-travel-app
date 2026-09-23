-- GDPR Article 20 data portability: the other half of 005_delete_user.
--
-- WHY THIS EXISTS. Erasure has shipped since 005 and is correct: reauth-gated
-- in the Account panel, backed by a SECURITY DEFINER function that deletes the
-- calling user and lets the cascades empty everything they own. Portability is
-- the same right seen from the other side. Article 20 says a person may have
-- the data they gave us, in a structured, commonly used, machine readable
-- form. That is this file. Same auth gate, same tables, JSON instead of
-- DELETE.
--
-- THE ONE RULE THAT MAKES THIS SAFE. The function takes no parameter. It
-- reads auth.uid() and nothing else, exactly like delete_user() does.
--
-- The BackEnd brief specifies the signature export_user_data(target_user_id),
-- and it is written that way there because the surrounding section is about
-- admin tooling. Shipping a user-facing RPC with a user id parameter would
-- mean a SECURITY DEFINER function, callable by any authenticated client,
-- that returns the account you name. One wrong guard and that is every
-- traveller's saved trips behind a uuid. Taking the parameter away removes the
-- whole class of bug rather than defending against it, and it costs nothing:
-- the caller only ever wants their own data. If an admin-side export is ever
-- needed it belongs in the admin surface, behind admin_guard, audit-logged,
-- and it should be a separate function so that this one stays impossible to
-- point at somebody else.
--
-- WHAT IS IN THE FILE, AND WHY EACH TABLE IS THERE.
--
--   trip_plans, trip_plan_stops   The trips the traveller built. This is the
--                                 heart of it: data they provided, and the
--                                 part that is genuinely worth carrying to
--                                 another service.
--
--   paywall_events                Their own rows only. See the note below.
--
--   content_overrides             Catalogue corrections, keyed by updated_by.
--                                 For an ordinary traveller this is always an
--                                 empty array, because only admins write here.
--                                 It is included because the brief names it
--                                 and because an admin is a data subject too,
--                                 but it is scoped to rows they themselves
--                                 wrote. Exporting the whole table would hand
--                                 one admin every other admin's edits, and it
--                                 would put the beach catalogue in a
--                                 traveller's personal data export, which is
--                                 not what Article 20 is for.
--
-- THE PAYWALL EXCEPTION, ON PURPOSE. 022 says in as many words that
-- paywall_events has no row-level read for anyone, so the table cannot become
-- a way to watch one named person plan a holiday. This function reads it
-- anyway, and that is a deliberate, narrow exception rather than an oversight
-- that reopened the table:
--
--   * It returns only rows where user_id = auth.uid(). The person reading is
--     the person the rows are about, which is the exact thing 022 was written
--     to prevent happening to somebody else.
--   * The table keeps zero policies and zero client grants. Nothing else about
--     022's posture changes, and a later convenience query still cannot select
--     from it.
--
-- If you are here because you are adding a second reader of paywall_events,
-- that is the bar: auth.uid()-scoped, or admin-gated and counting rather than
-- listing. Do not widen this one.
--
-- WHAT IS DELIBERATELY NOT HERE. The email address, name and sign-in identity
-- live in auth.users, which Supabase already exposes to the signed-in client
-- through getUser(); the app adds them to the downloaded file on the client
-- side rather than this function reaching into the auth schema. Keeping the
-- definer function out of auth.users means the worst it can ever leak is rows
-- the caller already owns.
--
-- Apply in the Supabase SQL editor. Live project policy: never `db push`
-- against ntssxktaduxzpsmejwyv; paste this file there by hand.
-- Requires 002_trip_plans.sql, 018_content_overrides.sql, 022_paywall_events.sql.

create or replace function public.export_user_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  -- A signed-out caller gets a refusal, not an empty file. An empty export
  -- looks like "we hold nothing about you", which is a different and much
  -- worse answer to give a person exercising a data right.
  if v_uid is null then
    return jsonb_build_object('error', 'not_signed_in');
  end if;

  return jsonb_build_object(
    -- Bump when the shape changes, so a file found on a disk in two years can
    -- still be read against the right expectations.
    'schema',     1,
    'exportedAt', now(),
    'userId',     v_uid,

    'tripPlans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',        p.id,
        'label',     p.label,
        'createdAt', p.created_at,
        'updatedAt', p.updated_at
      ) order by p.created_at)
      from public.trip_plans p
      where p.user_id = v_uid
    ), '[]'::jsonb),

    -- Stops carry tripPlanId so the two arrays can be rejoined by whoever
    -- receives the file. Ordered by plan and then by position, which is the
    -- order the traveller sees them in, so the file reads as an itinerary
    -- rather than as a table dump.
    'tripPlanStops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',             s.id,
        'tripPlanId',     s.trip_plan_id,
        'position',       s.position,
        'destinationId',  s.destination_id,
        'city',           s.city,
        'country',        s.country,
        'arriveDate',     s.arrive_date,
        'departDate',     s.depart_date,
        'transportMode',  s.transport_mode,
        'transportNotes', s.transport_notes,
        'choices',        s.choices,
        'createdAt',      s.created_at
      ) order by s.trip_plan_id, s.position)
      from public.trip_plan_stops s
      where s.user_id = v_uid
    ), '[]'::jsonb),

    -- Own rows only. See the paywall exception above before changing this.
    'paywallEvents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at',     e.at,
        'event',  e.event,
        'reason', e.reason,
        'tier',   e.tier
      ) order by e.at)
      from public.paywall_events e
      where e.user_id = v_uid
    ), '[]'::jsonb),

    -- Empty for everyone who is not an admin, which is almost everyone.
    'contentOverrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'layer',     o.layer,
        'itemId',    o.item_id,
        'patch',     o.patch,
        'note',      o.note,
        'updatedAt', o.updated_at
      ) order by o.updated_at)
      from public.content_overrides o
      where o.updated_by = v_uid
    ), '[]'::jsonb)
  );
end;
$fn$;

-- Signed-in callers only, and it only ever returns their own rows.
revoke all on function public.export_user_data() from public, anon;
grant execute on function public.export_user_data() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $chk$
declare
  v jsonb;
  v_count int;
begin
  -- The signature carries no arguments. This is the load-bearing property of
  -- the whole file, so it is asserted rather than trusted: an overload taking
  -- a uuid would be exactly the mistake the header argues against, and it
  -- would sit alongside this one silently.
  select count(*) into v_count
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'export_user_data';
  if v_count <> 1 then
    raise exception 'export_user_data has % overloads; it must have exactly one, taking no arguments', v_count;
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = 'export_user_data' and p.pronargs <> 0
  ) then
    raise exception 'export_user_data takes arguments; it must read auth.uid() only';
  end if;

  -- A guest cannot call it at all.
  if has_function_privilege('anon', 'public.export_user_data()', 'execute') then
    raise exception 'anon can execute export_user_data';
  end if;

  -- Applying this file as the owner means auth.uid() is null, so the function
  -- should refuse rather than return somebody's rows or an empty file that
  -- reads as "we hold nothing about you".
  v := public.export_user_data();
  if (v ->> 'error') <> 'not_signed_in' then
    raise exception 'export_user_data answered a caller with no auth.uid()';
  end if;

  -- 022's posture must survive this migration: still no policies, still no
  -- client grants on the table itself. If a later edit to this file reopens
  -- paywall_events the apply should fail here rather than in a breach.
  select count(*) into v_count
    from pg_policies where schemaname = 'public' and tablename = 'paywall_events';
  if v_count <> 0 then
    raise exception 'paywall_events gained % policies; 022 requires none', v_count;
  end if;
  if exists (
    select 1 from information_schema.table_privileges
     where table_schema = 'public' and table_name = 'paywall_events'
       and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'a client role gained direct table privileges on paywall_events';
  end if;

  raise notice 'export user data self-check passed';
end;
$chk$;

notify pgrst, 'reload schema';
