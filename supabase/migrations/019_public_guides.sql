-- Public guides: a plan somebody published on purpose.
--
-- WHY THIS EXISTS, AND WHY IT IS KEYED ON PLANS RATHER THAN PEOPLE. The
-- social layer so far is closed by design: migration 011 states that the
-- friend list is private and that there is no browsing, no suggestions and no
-- people-you-may-know, because all three tell one person about another person
-- who never agreed to it. That rule is not relaxed here and cannot be: there
-- is still no way to list accounts, search names or walk the graph.
--
-- What becomes discoverable is a DOCUMENT. An author flips one trip to
-- 'public' and it joins a gallery under their handle. Nobody is introduced to
-- anybody; a thing somebody chose to publish is readable, which is what
-- publishing means. It is also the only community surface that works for an
-- account with zero friends, which every other idea in this layer does not.
--
-- THREE THINGS A PUBLIC GUIDE SHEDS THAT A FRIEND'S TRIP KEEPS, and each is
-- the difference between "somebody I let in" and "the open internet":
--
--   1. EXACT DATES. A friend seeing "3 to 9 September" is a friend who might
--      join you. The same line in public is a notice that your home is empty
--      on those nights. So the public projection carries the MONTH and the
--      number of nights, which is what a guide is actually about ("four
--      nights in Ghent, went in September"), and no date at all.
--
--   2. THE CREW. project_trip_payload already strips every people[].userId,
--      so a name never carries an account. But a public page naming Sofie
--      publishes Sofie, who did not publish anything. Public drops people
--      entirely.
--
--   3. THE SPEND. A guide is about a place. What the author personally paid
--      is theirs, and it is one screenshot away from being permanent.
--
-- HOW THE WHITELIST STAYS ONE WHITELIST. Migration 011 says a whitelist
-- written twice is a whitelist that drifts, and that still holds, so nothing
-- here re-lists what may travel. project_public_guide_payload CALLS
-- project_trip_payload and then only ever REMOVES from the result, so it
-- cannot be looser than the friend projection no matter how either changes.
-- project_public_stops is the same shape of narrowing over project_stop_choices.
--
-- Apply in the Supabase SQL editor. Live project policy: never `db push`
-- against ntssxktaduxzpsmejwyv; paste this file there by hand.
-- Requires 009_trip_shares.sql, 010_profiles.sql and 011_friends.sql.
-- 013_achievements.sql is optional: the badge award below is skipped when the
-- ledger is not there yet.

-- ---------------------------------------------------------------------------
-- One more visibility, and a stamp for when it was offered
-- ---------------------------------------------------------------------------
alter table public.trip_plans drop constraint if exists trip_plans_visibility_check;
alter table public.trip_plans
  add constraint trip_plans_visibility_check
  check (visibility in ('private', 'friends', 'link', 'public'));

-- Ordering the gallery by updated_at would put a typo fix above a guide
-- published this morning, so publishing has its own timestamp.
alter table public.trip_plans
  add column if not exists published_at timestamptz;

create index if not exists trip_plans_public_idx
  on public.trip_plans (published_at desc)
  where visibility = 'public';

-- The stamp is set by the database, not by the client, for the same reason
-- badges are: a client-written "published 5 minutes ago" is decoration.
-- Re-publishing an already-public trip does NOT restamp it, or every edit
-- would push the author back to the top of the gallery.
create or replace function public.stamp_published_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visibility = 'public' and coalesce(old.visibility, '') <> 'public' then
    new.published_at := now();
  elsif new.visibility <> 'public' then
    new.published_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trip_plans_stamp_published on public.trip_plans;
create trigger trip_plans_stamp_published
  before update on public.trip_plans
  for each row execute function public.stamp_published_at();

-- Insert too, so a plan created as public (no UI does this today) is stamped.
drop trigger if exists trip_plans_stamp_published_ins on public.trip_plans;
create trigger trip_plans_stamp_published_ins
  before insert on public.trip_plans
  for each row execute function public.stamp_published_at();

-- ---------------------------------------------------------------------------
-- The public projections, both strict narrowings of what friends already get
-- ---------------------------------------------------------------------------
-- A stop as a guide describes it: where, how long, and roughly when in the
-- year. Nights come from the dates when they are there and from the wizard's
-- own count when they are not, so a plan with no dates still says how long.
create or replace function public.project_public_stops(p_plan uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'position',       st.position,
           'destination_id', st.destination_id,
           'city',           st.city,
           'country',        st.country,
           -- 1 to 12, or null. A month is a season; a date is a diary.
           'month',          extract(month from st.arrive_date)::int,
           'nights',         coalesce(
                               (st.depart_date - st.arrive_date),
                               nullif(st.choices ->> 'nights', '')::int
                             )
         ) order by st.position), '[]'::jsonb)
    from public.trip_plan_stops st
   where st.trip_plan_id = p_plan;
$$;

-- The friend projection, minus the three things above. Only ever subtracts.
create or replace function public.project_public_guide_payload(payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  base   jsonb := public.project_trip_payload(payload, true);
  extras jsonb := coalesce(base -> 'extras', '{}'::jsonb);
  mem    jsonb := extras -> 'memory';
begin
  -- 2. The crew are people who published nothing.
  extras := extras - 'people';
  -- 3. What the author paid is theirs.
  if mem is not null and jsonb_typeof(mem) = 'object' then
    extras := jsonb_set(extras, '{memory}', mem - 'spend');
  end if;
  return jsonb_set(base, '{extras}', extras);
end;
$$;

-- ---------------------------------------------------------------------------
-- The gallery
-- ---------------------------------------------------------------------------
-- Anon-callable: a guide that needs an account to read is not published, and
-- the whole growth loop is somebody opening a link before they sign up.
--
-- No payload here, so browsing is cheap and the photographs only travel when
-- a guide is actually opened.
drop function if exists public.list_public_guides(text, int, int);
create or replace function public.list_public_guides(
  wanted_country text default null,
  max_rows       int  default 60,
  skip           int  default 0
)
returns table (
  trip_plan_id    uuid,
  owner_handle    text,
  owner_name      text,
  owner_emoji     text,
  label           text,
  cities          text[],
  countries       text[],
  destination_ids text[],
  months          int[],
  nights_total    int,
  published_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tp.id,
    pr.handle,
    pr.display_name,
    pr.avatar_emoji,
    tp.label,
    (select array_agg(st.city order by st.position)
       from public.trip_plan_stops st where st.trip_plan_id = tp.id),
    (select array_agg(distinct st.country)
       from public.trip_plan_stops st
      where st.trip_plan_id = tp.id and st.country is not null),
    (select array_agg(st.destination_id order by st.position)
       from public.trip_plan_stops st
      where st.trip_plan_id = tp.id and st.destination_id is not null),
    (select array_agg(distinct extract(month from st.arrive_date)::int)
       from public.trip_plan_stops st
      where st.trip_plan_id = tp.id and st.arrive_date is not null),
    (select sum(coalesce(
              (st.depart_date - st.arrive_date),
              nullif(st.choices ->> 'nights', '')::int, 0))::int
       from public.trip_plan_stops st where st.trip_plan_id = tp.id),
    tp.published_at
  from public.trip_plans tp
  join public.profiles pr on pr.user_id = tp.user_id
  where tp.visibility = 'public'
    and (wanted_country is null or exists (
          select 1 from public.trip_plan_stops st
           where st.trip_plan_id = tp.id and st.country = wanted_country))
  order by tp.published_at desc nulls last
  limit least(greatest(coalesce(max_rows, 60), 1), 120)
  offset greatest(coalesce(skip, 0), 0);
$$;

-- One published guide in full. Anon, and deliberately NOT gated on being
-- signed in: the point of publishing is that a stranger can read it.
create or replace function public.get_public_guide(wanted_plan uuid)
returns table (
  trip_plan_id uuid,
  owner_handle text,
  owner_name   text,
  owner_emoji  text,
  label        text,
  stops        jsonb,
  payload      jsonb,
  published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tp public.trip_plans;
begin
  select * into tp from public.trip_plans t where t.id = wanted_plan;
  -- Unpublished between the gallery and the tap: it simply is not there.
  if not found or tp.visibility <> 'public' then
    return;
  end if;

  return query
  select
    tp.id,
    pr.handle,
    pr.display_name,
    pr.avatar_emoji,
    tp.label,
    public.project_public_stops(tp.id),
    coalesce((
      select public.project_public_guide_payload(dp.payload)
        from public.day_plans dp
       where dp.user_id = tp.user_id
         and dp.plan_id = tp.id::text
         and dp.deleted_at is null
    ), '{}'::jsonb),
    tp.published_at
  from public.profiles pr
  where pr.user_id = tp.user_id;
end;
$$;

-- Somebody read it. Same shape as 009's shared_trip_opened and for the same
-- reason: get_public_guide is stable and cannot write, so the reader's screen
-- reports the open. Being published IS the criterion, so anon calling this
-- grants nothing, and the insert is idempotent.
--
-- The award is wrapped in a table check and called dynamically so this
-- migration also applies cleanly on a project without 013.
create or replace function public.public_guide_opened(wanted_plan uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  select tp.user_id into owner
    from public.trip_plans tp
   where tp.id = wanted_plan and tp.visibility = 'public';
  -- Reading your own guide is not an audience.
  if owner is null or owner = auth.uid() then
    return;
  end if;
  if to_regclass('public.user_achievements') is not null then
    execute 'select public.award_badge($1, $2)' using owner, 'local_guide';
  end if;
end;
$$;

revoke all on function public.project_public_stops(uuid) from public, anon, authenticated;
revoke all on function public.project_public_guide_payload(jsonb) from public, anon, authenticated;
revoke all on function public.stamp_published_at() from public, anon, authenticated;
grant execute on function public.list_public_guides(text, int, int) to anon, authenticated;
grant execute on function public.get_public_guide(uuid) to anon, authenticated;
grant execute on function public.public_guide_opened(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The friends shelf learns to say when a trip last moved
-- ---------------------------------------------------------------------------
-- So the shelf can read as a change log ("shared 2 days ago", a mark on what
-- is new since your last visit) instead of as a static list. Return type
-- changes, so the old signature has to go first.
drop function if exists public.list_friend_trips();
create or replace function public.list_friend_trips()
returns table (
  owner_id        uuid,
  owner_handle    text,
  owner_name      text,
  owner_emoji     text,
  trip_plan_id    uuid,
  label           text,
  start_date      date,
  end_date        date,
  cities          text[],
  countries       text[],
  destination_ids text[],
  updated_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tp.user_id,
    pr.handle,
    pr.display_name,
    pr.avatar_emoji,
    tp.id,
    tp.label,
    (select min(st.arrive_date) from public.trip_plan_stops st where st.trip_plan_id = tp.id),
    (select max(st.depart_date) from public.trip_plan_stops st where st.trip_plan_id = tp.id),
    (select array_agg(st.city order by st.position)
       from public.trip_plan_stops st where st.trip_plan_id = tp.id),
    (select array_agg(distinct st.country)
       from public.trip_plan_stops st where st.trip_plan_id = tp.id and st.country is not null),
    (select array_agg(st.destination_id order by st.position)
       from public.trip_plan_stops st where st.trip_plan_id = tp.id and st.destination_id is not null),
    tp.updated_at
  from public.trip_plans tp
  join public.profiles pr on pr.user_id = tp.user_id
  where tp.visibility = 'friends'
    and auth.uid() is not null
    and tp.user_id <> auth.uid()
    and public.are_friends(auth.uid(), tp.user_id)
  order by tp.updated_at desc
  limit 200;
$$;

revoke all on function public.list_friend_trips() from public, anon;
grant execute on function public.list_friend_trips() to authenticated;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  n int;
  sample jsonb;
begin
  -- Applying this must not publish a single existing trip.
  select count(*) into n from public.trip_plans where visibility = 'public';
  if n > 0 then
    raise exception '% trip(s) are public straight after the migration', n;
  end if;

  -- The narrowing really narrows. Feed the public projection a payload that
  -- has all three of the things public must shed and check all three are gone
  -- while the guide itself survives.
  sample := public.project_public_guide_payload(jsonb_build_object(
    'plan', jsonb_build_object('d1', jsonb_build_array('a')),
    'extras', jsonb_build_object(
      'expenses', jsonb_build_array(jsonb_build_object('amount', 40)),
      'people',   jsonb_build_array(jsonb_build_object('name', 'Sofie', 'userId', 'u-1')),
      'memory',   jsonb_build_object(
        'story', 'Rain every afternoon.',
        'spend', jsonb_build_object('currency', 'EUR', 'flights', 120),
        'places', jsonb_build_array(jsonb_build_object('city', 'Ghent'))
      ))));
  if jsonb_exists(sample -> 'extras', 'people') then
    raise exception 'a public guide names its crew';
  end if;
  if jsonb_exists(sample -> 'extras' -> 'memory', 'spend') then
    raise exception 'a public guide carries what the author spent';
  end if;
  if jsonb_exists(sample -> 'extras', 'expenses') then
    raise exception 'a public guide carries the expense ledger';
  end if;
  if (sample -> 'extras' -> 'memory' ->> 'story') is null then
    raise exception 'the public projection dropped the story, so it narrowed too far';
  end if;
  if (sample -> 'plan') is null then
    raise exception 'the public projection dropped the plan itself';
  end if;

  -- Rule 1: a public stop says the season, never the nights you are away.
  if exists (
    select 1
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = 'project_public_stops'
       and pg_get_functiondef(p.oid) like '%arrive_date%'
       and pg_get_functiondef(p.oid) like '%''arrive_date''%'
  ) then
    raise exception 'the public stop projection emits an arrive_date key';
  end if;

  -- The gallery and the reader must be reachable by a signed-out visitor, or
  -- publishing does not mean published.
  if not exists (
    select 1 from information_schema.routine_privileges
     where routine_schema = 'public' and routine_name = 'list_public_guides'
       and grantee = 'anon' and privilege_type = 'EXECUTE'
  ) then
    raise exception 'anon cannot read the guide gallery';
  end if;
  if not exists (
    select 1 from information_schema.routine_privileges
     where routine_schema = 'public' and routine_name = 'get_public_guide'
       and grantee = 'anon' and privilege_type = 'EXECUTE'
  ) then
    raise exception 'anon cannot open a published guide';
  end if;

  -- And the internals must NOT be.
  if exists (
    select 1 from information_schema.routine_privileges
     where routine_schema = 'public'
       and routine_name in ('project_public_stops', 'project_public_guide_payload')
       and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'a projection helper is callable by a client role';
  end if;

  -- trip_plans still has exactly its four owner policies: nothing here opens
  -- the table itself, every public read goes through a definer function.
  select count(*) into n
    from pg_policies where schemaname = 'public' and tablename = 'trip_plans';
  if n <> 4 then
    raise exception 'trip_plans has % policies, expected the original 4', n;
  end if;

  -- The friends shelf now reports when a trip moved.
  if not exists (
    select 1 from information_schema.routines r
     where r.routine_schema = 'public' and r.routine_name = 'list_friend_trips'
  ) then
    raise exception 'list_friend_trips did not survive being redefined';
  end if;

  raise notice 'public guides self-check passed';
end;
$$;
