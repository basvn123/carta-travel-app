-- 048_launch_metrics_and_full_export.sql
--
-- Three launch numbers that nothing recorded, and the GDPR export widened to
-- everything Carta holds on a traveller. Written by T315 (register rows
-- T215-b, T215-c, T215-d and T300-i). Nothing here changes a row that exists
-- today.
--
-- 1. THREE COUNTERS, ONE TABLE (T215-b, T215-c, T215-d).
--    public.launch_counts holds one integer per day per (event, target,
--    surface) and nothing else:
--
--      event            target                          surface
--      trip_priced      ''                              'built' or 'ready'
--      affiliate_click  aviasales, omio, getyourguide,  the link's sub-ID
--                       viator                          ('leg', 'dest-book', ...)
--      ai_call          plan-day, suggest-city,         ''
--                       parse-booking
--
--    trip_priced is one tick when a traveller presses the last button of the
--    trip wizard and the priced trip opens in the planner: 'built' for a
--    trip they put together, 'ready' for one of the published journeys.
--    affiliate_click is one tick when a traveller follows a decorated
--    partner link inside the app (the surface is the sub-ID the link already
--    carries for the partner's own dashboard). ai_call is one tick each time
--    the app calls one of the three AI functions, so the AI failures card
--    finally has a denominator.
--
--    WHY A COUNTER AND NOT AN EVENT ROW. T214 decided the shape: first-party
--    RPCs only, no identifier of any kind, guests included, capped per day,
--    no script. A row per event would carry a timestamp to the microsecond,
--    and a timestamp next to a sub-ID is already half a session trail. A
--    counter per day cannot become one. There is no user_id column, no time
--    of day, no page, no device, no IP and no referrer, so the table is not
--    personal data once written, it is not in the GDPR export below, and it
--    needs no consent banner (nothing is stored on or read from the device).
--
--    GUESTS COUNT. A signed-out visitor prices trips and follows partner
--    links, and those are the people the launch numbers are about, so anon
--    may call the writer. The one exception is ai_call: the three functions
--    refuse a guest before any model runs, and log_edge_error (the numerator,
--    040) records signed-in callers only, so a guest's call is not counted
--    either. The writer reads auth.uid() for that one yes-or-no and stores
--    nothing of it.
--
--    CAPS, PER DAY. 200,000 ticks a day in all (launch_daily_total, the
--    pattern of paywall_daily_total in 022), tested by the statement that
--    increments it. And at most 2,000 distinct (event, target, surface) rows
--    a day, so a forged loop that invents a new sub-ID on every call cannot
--    grow the table faster than that. Unknown events and unknown targets are
--    dropped; an unknown surface is kept, cleaned to [a-z0-9_-] and 32
--    characters, because a new sub-ID showing up is exactly the signal that
--    a surface was added (022 treats a new paywall reason the same way).
--    The writer never raises: a counter must not be able to break a link.
--
--    THE READER. admin_launch_metrics(p_days) answers, for the window:
--      tripsPriced      { total, bySurface: [{ surface, n }], daily: [{ day, n }] }
--      affiliateClicks  { total, byPartner: [{ partner, n }],
--                         bySurface: [{ partner, surface, n }], daily }
--      aiCalls          { total, failures, rate, countedSince,
--                         byFunction: [{ fn, calls, failures, rate }] }
--    daily is zero-filled. The rate divides the AI failures of 040 (the three
--    AI functions only; client crashes stay off it, as 047 decided) by the
--    calls, counting both from countedSince, the first day in the window
--    with a counted call, so the days before this file was pasted (failures
--    but no calls) do not inflate it. With no calls counted, rate is null,
--    never zero. A failure is a call the traveller saw fail with ai_timeout,
--    ai_bad_output, url_unreachable or ai_error; a quota refusal or a
--    signed-out refusal is a call and not a failure.
--    Read tier of admin_guard, counts only, like every admin_* reader.
--
-- 2. THE FULL EXPORT (T300-i).
--    export_user_data() goes to schema 3. 045's body is the start: every key
--    it returned is still returned with the same fields (tripPlans gains two
--    fields, visibility and publishedAt). The new keys, each the caller's own
--    rows only:
--
--      profile            handle, display name, avatar, dates (or null)
--      dayPlans           every day plan with its whole payload, tombstones
--                         (deletedAt set) included, since those rows are
--                         still held
--      tripShares         the share links the caller made (the token is the
--                         link; the caller can read it in the app already)
--      coplanners         invitations sent and received, with the other
--                         side's handle
--      friends            friend requests sent and received, with the other
--                         side's handle
--      entitlement        the pass state: tier, period, expiry, source and
--                         the Stripe customer and checkout ids held for them
--      passGrants         every purchase: tier, dates, amount, the consent
--                         recorded at checkout, and (once 044 is pasted) the
--                         reason and fee
--      aiUsage            the AI allowance counters (007's, by period; 006's
--                         deprecated per-day ledger; and 044's per-day
--                         ledger once 044 is pasted)
--      aiModelEvents      which model answered each AI call (028)
--      parseFailures      the booking imports the app could not read (042):
--                         kind, size, type and which check failed, never the
--                         document
--      achievements       badges and when they were earned
--      feedback           what the caller sent through the feedback form
--      reportsFiled       the DSA notices the caller filed, with the outcome
--      moderationStatements  statements of reasons about the caller's guides
--      accountActions     what an admin did to the account (action and
--                         time only; no admin id, no detail)
--
--    THE OTHER SIDE OF A LINK. A friend's or co-planner's handle is in the
--    file only where row level security already lets the caller read that
--    profile: a pending or accepted friendship (012's link_status_with_me).
--    A blocked link keeps its row, with the handle null. No other person's
--    user id is ever in the file.
--
--    WHAT IS LEFT OUT, AND WHY. guide_views (045) holds only a hash that
--    changes daily and is gone after two days, so no row can be tied to the
--    caller. content_reports.source_hash is a salted hash of the network
--    address, useless to the caller and meaningful only as an abuse signal.
--    The handled_by, decided_by and actor ids are admins' ids, not the
--    caller's data. launch_counts, paywall_daily_total and the other daily
--    totals carry no identifier. Auth's own tables (email, sign-in times)
--    are added by the app from the session, as since 024.
--
--    044 AND THIS FILE. 044 pastes later (stage 10) and nothing here depends
--    on it: the three columns 044 adds to pass_grants are read through
--    to_jsonb(row), which answers null for a column that does not exist, and
--    044's ai_usage_days is read only when to_regclass finds it, through
--    EXECUTE, so the body compiles and runs either way. Nothing here
--    re-creates a function 044 creates or replaces.
--
-- 3. NOT IN THIS FILE: AN AUDIT REVERT (T270-d).
--    The row asked for a revert action only if one RPC can undo every
--    audited kind. It cannot: delete_user erases the account (005), so no
--    function can bring it back, and view_user, note and mfa_refused changed
--    nothing to undo. Only set_config and override_set or override_clear
--    carry a before-and-after pair (033). T270-d stays open.
--
-- ORDER. Paste in the Supabase SQL editor for ntssxktaduxzpsmejwyv by hand,
-- never `db push`, AFTER 047 (_OPEN-MASTER stage 2.2, after row 16). It needs
-- 015 (admin_guard), 040 and 047 (edge_errors with crashes apart), 045
-- (export_user_data schema 2 and content_overrides.country), and the tables of
-- 002 to 042; its self-check names whichever is missing. 044 may come before
-- or after it. Look for the notice "launch metrics and full export self-check
-- passed". Pasting it twice is safe.
--
-- RE-PASTE TRAPS. Re-pasting 024 or 045 after this file puts
-- export_user_data back to schema 1 or 2 (the export loses every key added
-- here). Paste 048 again after either.
--
-- DOWN (paste in this order). The counters are lost; nothing else is.
--   drop function if exists public.admin_launch_metrics(int);
--   drop function if exists public.launch_count(text, text, text);
--   drop table if exists public.launch_daily_total;
--   drop table if exists public.launch_counts;
--   -- then paste section 7 of 045_admin_followups.sql (export_user_data,
--   -- schema 2, with its revoke and grant lines), not the whole file
--   notify pgrst, 'reload schema';
-- The app keeps working before and after the down: the counters are fire
-- and forget and an unknown function is dropped, the Launch card hides when
-- its function is missing, and the export download takes any schema.

-- ===========================================================================
-- 1. The counters (T215-b, T215-c, T215-d)
-- ===========================================================================
create table if not exists public.launch_counts (
  day     date   not null default current_date,
  event   text   not null
            check (event in ('trip_priced', 'affiliate_click', 'ai_call')),
  -- The partner or the AI function; '' for trip_priced.
  target  text   not null default ''
            check (target ~ '^[a-z0-9_-]{0,32}$'),
  -- The sub-ID or the wizard path; '' for ai_call.
  surface text   not null default ''
            check (surface ~ '^[a-z0-9_-]{0,32}$'),
  n       bigint not null default 0 check (n >= 0),
  primary key (day, event, target, surface)
);

alter table public.launch_counts enable row level security;
-- No policies, deliberately, as in 022 and 040: the only ways in are the two
-- definer functions below and the service role. And no client grants at all,
-- so a later convenience policy still finds nothing to open.
revoke all on table public.launch_counts from public, anon, authenticated;

create table if not exists public.launch_daily_total (
  day date primary key,
  n   bigint not null default 0
);

alter table public.launch_daily_total enable row level security;
revoke all on table public.launch_daily_total from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The writer. Fire and forget: never raises, returns nothing to retry on.
-- ---------------------------------------------------------------------------
create or replace function public.launch_count(
  p_event   text,
  p_target  text default null,
  p_surface text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_target  text := lower(coalesce(p_target, ''));
  v_surface text := left(regexp_replace(lower(coalesce(p_surface, '')), '[^a-z0-9_-]', '', 'g'), 32);
  v_n       bigint;
  v_keys    int;
begin
  if p_event = 'trip_priced' then
    v_target := '';
    if v_surface not in ('built', 'ready') then
      v_surface := 'other';
    end if;
  elsif p_event = 'affiliate_click' then
    if v_target not in ('aviasales', 'omio', 'getyourguide', 'viator') then
      return;
    end if;
    if v_surface = '' then
      v_surface := 'none';
    end if;
  elsif p_event = 'ai_call' then
    -- The numerator (040) counts signed-in callers only, so the denominator
    -- does too. auth.uid() is read as a yes or no and never stored.
    if auth.uid() is null then
      return;
    end if;
    if v_target not in ('plan-day', 'suggest-city', 'parse-booking') then
      return;
    end if;
    v_surface := '';
  else
    return;
  end if;

  -- A new key for today only while today holds fewer than 2,000 keys. An
  -- existing key always counts (up to the daily total below).
  if not exists (select 1 from public.launch_counts c
                  where c.day = current_date and c.event = p_event
                    and c.target = v_target and c.surface = v_surface) then
    select count(*) into v_keys from public.launch_counts c where c.day = current_date;
    if v_keys >= 2000 then
      return;
    end if;
  end if;

  -- The global ceiling, tested by the statement that increments it (022), so
  -- two concurrent callers cannot both claim the last slot.
  insert into public.launch_daily_total as d (day, n)
    values (current_date, 1)
    on conflict (day) do update
      set n = d.n + 1
      where d.n < 200000
    returning n into v_n;
  if v_n is null then
    return;
  end if;

  insert into public.launch_counts as c (day, event, target, surface, n)
    values (current_date, p_event, v_target, v_surface, 1)
    on conflict (day, event, target, surface) do update
      set n = c.n + 1;

  delete from public.launch_daily_total where day < current_date - 400;
exception when others then
  -- A counter is never worth an error on the traveller's screen.
  return;
end;
$$;

revoke all on function public.launch_count(text, text, text) from public;
grant execute on function public.launch_count(text, text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The reader. Counts only, read tier.
-- ---------------------------------------------------------------------------
create or replace function public.admin_launch_metrics(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_err     text := public.admin_guard('read');
  v_days    int;
  v_first   date;
  v_counted date;
  v_calls   bigint := 0;
  v_fails   bigint := 0;
begin
  if v_err is not null then
    return jsonb_build_object('error', v_err);
  end if;

  v_days  := least(greatest(coalesce(p_days, 30), 1), 365);
  v_first := current_date - (v_days - 1);

  select min(day) into v_counted
    from public.launch_counts
   where event = 'ai_call' and day >= v_first and n > 0;

  if v_counted is not null then
    select coalesce(sum(n), 0) into v_calls
      from public.launch_counts
     where event = 'ai_call' and day >= v_counted;
    select count(*) into v_fails
      from public.edge_errors
     where fn in ('plan-day', 'suggest-city', 'parse-booking')
       and at >= v_counted::timestamptz;
  end if;

  return jsonb_build_object(
    'days',  v_days,
    'since', v_first,

    'tripsPriced', jsonb_build_object(
      'total', (select coalesce(sum(n), 0) from public.launch_counts
                 where event = 'trip_priced' and day >= v_first),
      'bySurface', coalesce((
        select jsonb_agg(jsonb_build_object('surface', surface, 'n', n) order by n desc, surface)
          from (select surface, sum(n) as n from public.launch_counts
                 where event = 'trip_priced' and day >= v_first
                 group by surface) s), '[]'::jsonb),
      'daily', (
        select jsonb_agg(jsonb_build_object('day', g.day, 'n', coalesce(x.n, 0)) order by g.day)
          from (select generate_series(v_first, current_date, interval '1 day')::date as day) g
          left join (select day, sum(n) as n from public.launch_counts
                      where event = 'trip_priced' and day >= v_first group by day) x
            on x.day = g.day)
    ),

    'affiliateClicks', jsonb_build_object(
      'total', (select coalesce(sum(n), 0) from public.launch_counts
                 where event = 'affiliate_click' and day >= v_first),
      'byPartner', coalesce((
        select jsonb_agg(jsonb_build_object('partner', target, 'n', n) order by n desc, target)
          from (select target, sum(n) as n from public.launch_counts
                 where event = 'affiliate_click' and day >= v_first
                 group by target) s), '[]'::jsonb),
      'bySurface', coalesce((
        select jsonb_agg(jsonb_build_object('partner', target, 'surface', surface, 'n', n)
                         order by n desc, target, surface)
          from (select target, surface, sum(n) as n from public.launch_counts
                 where event = 'affiliate_click' and day >= v_first
                 group by target, surface) s), '[]'::jsonb),
      'daily', (
        select jsonb_agg(jsonb_build_object('day', g.day, 'n', coalesce(x.n, 0)) order by g.day)
          from (select generate_series(v_first, current_date, interval '1 day')::date as day) g
          left join (select day, sum(n) as n from public.launch_counts
                      where event = 'affiliate_click' and day >= v_first group by day) x
            on x.day = g.day)
    ),

    'aiCalls', jsonb_build_object(
      'countedSince', v_counted,
      'total',    v_calls,
      'failures', v_fails,
      'rate',     case when v_calls > 0 then round(v_fails::numeric / v_calls, 4) end,
      'byFunction', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'fn', f.fn, 'calls', f.calls, 'failures', f.failures,
                 'rate', case when f.calls > 0 then round(f.failures::numeric / f.calls, 4) end)
               order by f.calls desc, f.fn)
          from (
            select k.fn,
                   coalesce((select sum(c.n) from public.launch_counts c
                              where c.event = 'ai_call' and c.target = k.fn
                                and c.day >= v_counted), 0) as calls,
                   (select count(*) from public.edge_errors e
                     where e.fn = k.fn and e.at >= v_counted::timestamptz) as failures
              from unnest(array['plan-day', 'suggest-city', 'parse-booking']) as k(fn)
             where v_counted is not null
          ) f), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.admin_launch_metrics(int) from public, anon;
grant execute on function public.admin_launch_metrics(int) to authenticated, service_role;

-- ===========================================================================
-- 2. export_user_data, schema 3 (T300-i)
-- ===========================================================================
-- 045's section 7 is the start; every key it returned keeps its fields. Still
-- no parameter, still auth.uid() only, paywall_events still under 024's
-- narrow exception.
create or replace function public.export_user_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid       uuid := auth.uid();
  v_out       jsonb;
  v_usage_day jsonb := null;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_signed_in');
  end if;

  -- 044's per-day AI ledger, when 044 has been pasted. EXECUTE, so this body
  -- compiles and runs on a project without the table.
  if to_regclass('public.ai_usage_days') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'kind', d.kind, 'n', d.n)
                                order by d.day, d.kind), '[]'::jsonb)
        from public.ai_usage_days d
       where d.user_id = $1
    $q$ into v_usage_day using v_uid;
  end if;

  v_out := jsonb_build_object(
    'schema',     3,
    'exportedAt', now(),
    'userId',     v_uid,

    'profile', (
      select jsonb_build_object(
        'handle',      p.handle,
        'displayName', p.display_name,
        'avatarEmoji', p.avatar_emoji,
        'createdAt',   p.created_at,
        'updatedAt',   p.updated_at)
      from public.profiles p
      where p.user_id = v_uid
    ),

    'tripPlans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',          p.id,
        'label',       p.label,
        'visibility',  p.visibility,
        'publishedAt', p.published_at,
        'createdAt',   p.created_at,
        'updatedAt',   p.updated_at
      ) order by p.created_at)
      from public.trip_plans p
      where p.user_id = v_uid
    ), '[]'::jsonb),

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

    'dayPlans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'planId',    d.plan_id,
        'payload',   d.payload,
        'updatedAt', d.updated_at,
        'deletedAt', d.deleted_at
      ) order by d.updated_at)
      from public.day_plans d
      where d.user_id = v_uid
    ), '[]'::jsonb),

    'tripShares', coalesce((
      select jsonb_agg(jsonb_build_object(
        'token',      t.token,
        'tripPlanId', t.trip_plan_id,
        'scope',      t.scope,
        'expiresAt',  t.expires_at,
        'revokedAt',  t.revoked_at,
        'createdAt',  t.created_at
      ) order by t.created_at)
      from public.trip_shares t
      where t.owner_id = v_uid
    ), '[]'::jsonb),

    -- Invitations both ways. The other side's handle only where row level
    -- security already shows the caller that profile (012).
    'coplanners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tripPlanId',  c.trip_plan_id,
        'role',        case when c.user_id = v_uid then 'invited' else 'inviter' end,
        'otherHandle', case when public.link_status_with_me(o.other) in ('pending', 'accepted')
                            then (select pr.handle from public.profiles pr where pr.user_id = o.other) end,
        'status',      c.status,
        'createdAt',   c.created_at,
        'respondedAt', c.responded_at
      ) order by c.created_at)
      from public.trip_collaborators c
      cross join lateral (select case when c.user_id = v_uid then c.invited_by else c.user_id end as other) o
      where c.user_id = v_uid or c.invited_by = v_uid
    ), '[]'::jsonb),

    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'direction',   case when f.requester_id = v_uid then 'sent' else 'received' end,
        'otherHandle', case when f.status in ('pending', 'accepted')
                            then (select pr.handle from public.profiles pr where pr.user_id = o.other) end,
        'status',      f.status,
        'createdAt',   f.created_at,
        'respondedAt', f.responded_at
      ) order by f.created_at)
      from public.friendships f
      cross join lateral (select case when f.requester_id = v_uid then f.addressee_id else f.requester_id end as other) o
      where f.requester_id = v_uid or f.addressee_id = v_uid
    ), '[]'::jsonb),

    'entitlement', (
      select jsonb_build_object(
        'tier',                e.tier,
        'periodStart',         e.period_start,
        'expiresAt',           e.expires_at,
        'source',              e.source,
        'stripeCustomerId',    e.stripe_customer_id,
        'lastCheckoutSession', e.last_session_id,
        'updatedAt',           e.updated_at)
      from public.entitlements e
      where e.user_id = v_uid
    ),

    -- reason, fee_cents and fee_currency arrive with 044; to_jsonb answers
    -- null for them before it is pasted.
    'passGrants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'checkoutSession', g.session_id,
        'tier',            g.tier,
        'grantedAt',       g.granted_at,
        'expiresAt',       g.expires_at,
        'amountCents',     g.amount_cents,
        'currency',        g.currency,
        'buyerCountry',    g.buyer_country,
        'consentTos',      g.consent_tos,
        'consentAt',       g.consent_at,
        'consentTermsUrl', g.consent_terms_url,
        'reason',          to_jsonb(g) -> 'reason',
        'feeCents',        to_jsonb(g) -> 'fee_cents',
        'feeCurrency',     to_jsonb(g) -> 'fee_currency'
      ) order by g.granted_at)
      from public.pass_grants g
      where g.user_id = v_uid
    ), '[]'::jsonb),

    'aiUsage', jsonb_build_object(
      'byPeriod', coalesce((
        select jsonb_agg(jsonb_build_object('periodStart', u.period_start, 'kind', u.kind, 'n', u.n)
                         order by u.period_start, u.kind)
        from public.ai_usage u
        where u.user_id = v_uid
      ), '[]'::jsonb),
      'byDayLegacy', coalesce((
        select jsonb_agg(jsonb_build_object('day', u.used_on, 'n', u.n) order by u.used_on)
        from public.ai_plan_usage u
        where u.user_id = v_uid
      ), '[]'::jsonb),
      'byDay', v_usage_day
    ),

    'aiModelEvents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at',       m.created_at,
        'model',    m.model,
        'kind',     m.kind,
        'fellBack', m.fell_back
      ) order by m.created_at)
      from public.ai_model_events m
      where m.user_id = v_uid
    ), '[]'::jsonb),

    'parseFailures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at',          x.at,
        'inputKind',   x.input_kind,
        'inputBytes',  x.input_size_b,
        'mimeType',    x.mime_type,
        'checkFailed', x.check_failed,
        'appVersion',  x.app_version
      ) order by x.at)
      from public.parse_failures x
      where x.user_id = v_uid
    ), '[]'::jsonb),

    'achievements', coalesce((
      select jsonb_agg(jsonb_build_object('badge', a.badge, 'earnedAt', a.earned_at)
                       order by a.earned_at)
      from public.user_achievements a
      where a.user_id = v_uid
    ), '[]'::jsonb),

    'feedback', coalesce((
      select jsonb_agg(jsonb_build_object(
        'createdAt', f.created_at,
        'kind',      f.kind,
        'message',   f.message,
        'email',     f.email,
        'context',   f.context,
        'status',    f.status,
        'handledAt', f.handled_at
      ) order by f.created_at)
      from public.feedback f
      where f.user_id = v_uid
    ), '[]'::jsonb),

    'reportsFiled', coalesce((
      select jsonb_agg(jsonb_build_object(
        'createdAt',    r.created_at,
        'planId',       r.plan_id,
        'planLabel',    r.plan_label,
        'reason',       r.reason,
        'contactEmail', r.contact_email,
        'status',       r.status,
        'decidedAt',    r.decided_at,
        'decisionNote', r.decision_note
      ) order by r.created_at)
      from public.content_reports r
      where r.reporter_id = v_uid
    ), '[]'::jsonb),

    'moderationStatements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'createdAt',          s.created_at,
        'planId',             s.plan_id,
        'planLabel',          s.plan_label,
        'restriction',        s.restriction,
        'source',             s.source,
        'facts',              s.facts,
        'automated',          s.automated,
        'contestUntil',       s.contest_until,
        'complaint',          s.complaint_body,
        'complaintAt',        s.complaint_at,
        'complaintStatus',    s.complaint_status,
        'complaintDecidedAt', s.complaint_decided_at,
        'complaintNote',      s.complaint_note,
        'reinstated',         s.reinstated
      ) order by s.created_at)
      from public.moderation_statements s
      where s.owner_id = v_uid
    ), '[]'::jsonb),

    'accountActions', coalesce((
      select jsonb_agg(jsonb_build_object('action', l.action, 'at', l.created_at)
                       order by l.created_at)
      from public.admin_audit_log l
      where l.target_user = v_uid
    ), '[]'::jsonb),

    -- Own rows only. See 024's paywall exception before changing this.
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
        'layer',      o.layer,
        'itemId',     o.item_id,
        'patch',      o.patch,
        'authorNote', o.author_note,
        'status',     o.status,
        'reviewBy',   o.review_by,
        'country',    o.country,
        'updatedAt',  o.updated_at
      ) order by o.updated_at)
      from public.content_overrides o
      where o.updated_by = v_uid
    ), '[]'::jsonb),

    -- The AI and booking-parse failures and app crashes the caller ran into
    -- (040, 047). Codes and statuses only.
    'edgeErrors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at',             x.at,
        'fn',             x.fn,
        'code',           x.code,
        'origin',         x.origin,
        'httpStatus',     x.http_status,
        'upstreamStatus', x.upstream_status
      ) order by x.at)
      from public.edge_errors x
      where x.user_id = v_uid
    ), '[]'::jsonb)
  );

  return v_out;
end;
$fn$;

revoke all on function public.export_user_data() from public, anon;
grant execute on function public.export_user_data() to authenticated, service_role;

-- ===========================================================================
-- Self-check: runs on apply
-- ===========================================================================
do $chk$
declare
  fn   text;
  v_cnt int;
  v    jsonb;
  k    text;
  def  text;
begin
  -- What this file builds on.
  if to_regprocedure('public.admin_guard(text)') is null then
    raise exception 'public.admin_guard(text) is missing; paste 015 and 034 first';
  end if;
  if to_regclass('public.edge_errors') is null then
    raise exception 'public.edge_errors is missing; paste 040 first';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'edge_errors_crash_pair_check') then
    raise exception 'edge_errors has no crash pair check; paste 047 first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'content_overrides'
                    and column_name = 'country') then
    raise exception 'content_overrides.country is missing; paste 045 first';
  end if;
  foreach k in array array['public.profiles', 'public.day_plans', 'public.trip_shares',
                           'public.trip_collaborators', 'public.friendships', 'public.entitlements',
                           'public.pass_grants', 'public.ai_usage', 'public.ai_plan_usage',
                           'public.ai_model_events', 'public.parse_failures', 'public.user_achievements',
                           'public.feedback', 'public.content_reports', 'public.moderation_statements',
                           'public.admin_audit_log'] loop
    if to_regclass(k) is null then
      raise exception '% is missing; paste 002 to 042 first', k;
    end if;
  end loop;

  -- 1. The counter tables are closed to clients.
  foreach k in array array['public.launch_counts', 'public.launch_daily_total'] loop
    if not (select relrowsecurity from pg_class where oid = k::regclass) then
      raise exception '% has row level security off', k;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public'
                and tablename = split_part(k, '.', 2)) then
      raise exception '% has a policy; it must have none', k;
    end if;
    if has_table_privilege('anon', k, 'select') or has_table_privilege('authenticated', k, 'select')
       or has_table_privilege('anon', k, 'insert') or has_table_privilege('authenticated', k, 'insert') then
      raise exception 'a client role can read or write %', k;
    end if;
  end loop;
  -- No column that could name a person.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'launch_counts'
                and column_name not in ('day', 'event', 'target', 'surface', 'n')) then
    raise exception 'launch_counts has a column beyond day, event, target, surface and n';
  end if;

  -- The writer: definer, pinned path, open to both client roles.
  fn := 'public.launch_count(text,text,text)';
  if not (select prosecdef from pg_proc where oid = fn::regprocedure::oid) then
    raise exception '% is not SECURITY DEFINER', fn;
  end if;
  if not exists (select 1 from pg_proc where oid = fn::regprocedure::oid
                  and array_to_string(proconfig, ',') like '%search_path=%') then
    raise exception '% has no pinned search_path', fn;
  end if;
  if not has_function_privilege('anon', fn, 'execute')
     or not has_function_privilege('authenticated', fn, 'execute') then
    raise exception '% must be callable signed in and signed out', fn;
  end if;

  -- The reader: definer, guarded, closed to anon, refuses a caller with no
  -- admin row (applied as the owner, auth.uid() is null).
  fn := 'public.admin_launch_metrics(integer)';
  if not (select prosecdef from pg_proc where oid = fn::regprocedure::oid) then
    raise exception '% is not SECURITY DEFINER', fn;
  end if;
  if has_function_privilege('anon', fn, 'execute') then
    raise exception 'anon can execute %', fn;
  end if;
  def := pg_get_functiondef(fn::regprocedure);
  if position('admin_guard(''read'')' in def) = 0 then
    raise exception '% does not gate on admin_guard(''read'')', fn;
  end if;
  if coalesce(public.admin_launch_metrics() ->> 'error', '') <> 'forbidden' then
    raise exception 'admin_launch_metrics answered a caller with no admin row';
  end if;

  -- The writer counts what it should and drops what it should. Run inside a
  -- block that is rolled back on purpose, so the self-check leaves no row.
  begin
    perform public.launch_count('trip_priced', null, 'built');
    perform public.launch_count('trip_priced', null, 'built');
    perform public.launch_count('trip_priced', null, 'somewhere');
    perform public.launch_count('affiliate_click', 'omio', 'leg');
    perform public.launch_count('affiliate_click', 'omio', 'Dest Book!');
    perform public.launch_count('affiliate_click', 'evilcorp', 'leg');
    perform public.launch_count('nonsense', 'omio', 'leg');
    perform public.launch_count('ai_call', 'plan-day', null);  -- no session: dropped
    if (select n from public.launch_counts where day = current_date and event = 'trip_priced'
          and target = '' and surface = 'built') is distinct from 2::bigint then
      raise exception 'launch_count did not count two built trips as 2';
    end if;
    if not exists (select 1 from public.launch_counts where day = current_date
                    and event = 'trip_priced' and surface = 'other') then
      raise exception 'an unknown trip surface was not kept as other';
    end if;
    if not exists (select 1 from public.launch_counts where day = current_date
                    and event = 'affiliate_click' and target = 'omio' and surface = 'destbook') then
      raise exception 'a sub-ID was not cleaned to [a-z0-9_-]';
    end if;
    if exists (select 1 from public.launch_counts where target = 'evilcorp' or event = 'nonsense')
       or exists (select 1 from public.launch_counts where event = 'ai_call') then
      raise exception 'launch_count stored an unknown partner, an unknown event or a guest AI call';
    end if;
    perform set_config('request.jwt.claims',
      '{"sub":"00000000-0000-0000-0000-0000000048c1","role":"authenticated"}', true);
    perform public.launch_count('ai_call', 'plan-day', 'ignored');
    perform set_config('request.jwt.claims', '', true);
    if not exists (select 1 from public.launch_counts where day = current_date
                    and event = 'ai_call' and target = 'plan-day' and surface = '' and n = 1) then
      raise exception 'a signed-in AI call was not counted';
    end if;
    raise exception using errcode = 'T3150', message = 'undo the self-check rows';
  exception when sqlstate 'T3150' then
    null;
  end;
  perform set_config('request.jwt.claims', '', true);

  -- 2. export_user_data: one, argument-free, closed to anon, schema 3 with
  --    every key. Called once as a made-up signed-in user so the keys are
  --    proved, not read off the source.
  select count(*) into v_cnt from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'export_user_data';
  if v_cnt <> 1 or exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                        where s.nspname = 'public' and p.proname = 'export_user_data' and p.pronargs <> 0) then
    raise exception 'export_user_data must be exactly one function taking no arguments';
  end if;
  if has_function_privilege('anon', 'public.export_user_data()', 'execute') then
    raise exception 'anon can execute export_user_data';
  end if;
  if coalesce(public.export_user_data() ->> 'error', '') <> 'not_signed_in' then
    raise exception 'export_user_data answered a caller with no auth.uid()';
  end if;
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000048c1","role":"authenticated"}', true);
  v := public.export_user_data();
  perform set_config('request.jwt.claims', '', true);
  if (v ->> 'schema') <> '3' then
    raise exception 'export_user_data did not return schema 3: %', left(v::text, 200);
  end if;
  foreach k in array array['tripPlans', 'tripPlanStops', 'dayPlans', 'tripShares', 'coplanners',
                           'friends', 'passGrants', 'aiModelEvents', 'parseFailures', 'achievements',
                           'feedback', 'reportsFiled', 'moderationStatements', 'accountActions',
                           'paywallEvents', 'contentOverrides', 'edgeErrors'] loop
    if jsonb_typeof(v -> k) <> 'array' then
      raise exception 'export_user_data key % is not an array', k;
    end if;
  end loop;
  if not (v ? 'profile') or not (v ? 'entitlement') or jsonb_typeof(v -> 'aiUsage') <> 'object' then
    raise exception 'export_user_data lacks profile, entitlement or aiUsage';
  end if;

  raise notice 'launch metrics and full export self-check passed';
end;
$chk$;

notify pgrst, 'reload schema';
