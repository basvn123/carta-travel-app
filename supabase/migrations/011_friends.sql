-- Friends: two accounts that have agreed to see each other's trips.
--
-- THE RLS TRAP THIS MIGRATION IS BUILT AROUND. A policy on `profiles` that
-- subqueries `friendships`, where `friendships` has a policy that subqueries
-- back, is Postgres error 42P17, infinite recursion in policy. So every cross
-- table check goes through ONE security definer function, friend_link_status,
-- which runs as the owner and therefore does not re-enter RLS. It is `stable`,
-- and every policy calls it wrapped as `(select ...)` so Postgres evaluates it
-- once per statement instead of once per row. On a trip list that is the
-- difference between instant and unusable.
--
-- TWO PRIVACY RULES, and they are the point of this file:
--
--   1. THE FRIEND LIST IS PRIVATE. A friendships row is readable only by the
--      two people named in it. There is no friends-of-friends listing at any
--      depth, and no query path that returns a third party's friends. Who
--      travels with whom should not be inferable by walking a graph.
--
--   2. CREW ON SOMEBODY ELSE'S TRIP IS A NAME, NEVER A LINK. A shared or
--      friend-visible trip carries its crew as names with no account behind
--      them, because project_trip_payload (migration 009) strips people[].
--      userId unconditionally. Without that, viewer A would learn that B was
--      on the trip while A and B have never met, and rule 1 would be undone
--      through the back door. A name tells you about the journey; a link tells
--      you about somebody's social graph.
--
-- WHY day_plans IS NOT OPENED UP. That table is one jsonb payload per
-- (user_id, plan_id) carrying the group's expense ledger, imported booking
-- references, private notes and the photographs. "Let a friend read the row"
-- and "let a friend see the trip" are different permissions, so friends read
-- through get_friend_trip, which reuses migration 009's projection. The
-- whitelist is written once and called twice, because two copies is how one of
-- them drifts.
--
-- Apply in the Supabase SQL editor. Live project policy: never `db push`
-- against ntssxktaduxzpsmejwyv; paste this file there by hand.
-- Requires 009_trip_shares.sql and 010_profiles.sql.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- The graph
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  -- 'pending'  asked, not yet answered
  -- 'accepted' both sides agreed; this is the only status that grants anything
  -- 'blocked'  do not ask again. No UI issues this yet, but the state exists
  --            so that declining (which deletes the row, leaving the door open)
  --            and refusing for good are not forced to be the same act.
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'blocked')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

-- One edge per pair, in either direction: A asking B and B asking A must not
-- both be able to exist, or accepting one leaves the other dangling forever.
create unique index if not exists friendships_pair_uniq on public.friendships (
  least(requester_id, addressee_id), greatest(requester_id, addressee_id)
);
create index if not exists friendships_requester_idx on public.friendships(requester_id);
create index if not exists friendships_addressee_idx on public.friendships(addressee_id);

alter table public.friendships enable row level security;

-- Rule 1, enforced. Only the two people in the row can see it, so there is no
-- query that lists anybody else's friends.
drop policy if exists "friendships_select_own" on public.friendships;
create policy "friendships_select_own" on public.friendships
  for select using (auth.uid() in (requester_id, addressee_id));

-- You may only ask on your own behalf, and only ever as a pending request:
-- nobody gets to insert themselves as an accepted friend.
--
-- There is deliberately NO "and the addressee has a profile" check here, and
-- the reason is worth writing down because the obvious version of this policy
-- is broken. A subquery against public.profiles inside this WITH CHECK runs
-- under the caller's own RLS, and the profiles policy below only shows a
-- stranger once a link already exists. So the check would be false for exactly
-- the case it exists to allow, and every FIRST friend request would be
-- refused. It also buys nothing: addressee_id is a foreign key into
-- auth.users, so a request can only ever name a real account, and migration
-- 010's trigger gives every account a profile.
drop policy if exists "friendships_insert_own" on public.friendships;
create policy "friendships_insert_own" on public.friendships
  for insert with check (
    auth.uid() = requester_id
    and status = 'pending'
  );

-- Only the person who was asked can answer. The requester cannot accept their
-- own request, which is the whole reason the row has two sides.
drop policy if exists "friendships_respond" on public.friendships;
create policy "friendships_respond" on public.friendships
  for update using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id and status in ('accepted', 'blocked'));

-- Either side can walk away: declining, cancelling and unfriending are all
-- the same act on the same row. With one exception, found in review: a
-- BLOCKED row may not be deleted by the person it blocks. Deleting is how a
-- request is declined, so without this guard the requester could delete the
-- block and simply ask again, which makes blocking a suggestion rather than
-- a refusal. The addressee (the one who blocked) can always undo it.
drop policy if exists "friendships_delete_own" on public.friendships;
create policy "friendships_delete_own" on public.friendships
  for delete using (
    auth.uid() = addressee_id
    or (auth.uid() = requester_id and status <> 'blocked')
  );

-- Answering a request may change the answer and nothing else.
--
-- The policy above pins addressee_id after the write, but a WITH CHECK cannot
-- see the OLD row, so on its own it would still let the addressee rewrite
-- requester_id and manufacture an accepted friendship with a third party who
-- never asked for one. This is the same shape of hole migrations 003 and 008
-- closed for trip_plan_stops, and the fix here is column privileges: the two
-- columns that name the people become unwritable, so no policy has to defend
-- them. Answering stays possible because status and responded_at do not.
revoke update on public.friendships from authenticated;
grant update (status, responded_at) on public.friendships to authenticated;

-- ---------------------------------------------------------------------------
-- The one cross-table check
-- ---------------------------------------------------------------------------
-- security definer so it does not re-enter friendships' own RLS (see the 42P17
-- note at the top). stable so a policy can cache it per statement.
create or replace function public.friend_link_status(a uuid, b uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select f.status
    from public.friendships f
   where least(f.requester_id, f.addressee_id) = least(a, b)
     and greatest(f.requester_id, f.addressee_id) = greatest(a, b)
   limit 1;
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.friend_link_status(a, b) = 'accepted', false);
$$;

-- ---------------------------------------------------------------------------
-- Profiles widen to the people you have a link with
-- ---------------------------------------------------------------------------
-- Pending counts, not just accepted: an incoming request that shows a bare
-- uuid instead of a person is not a request anybody can answer. A blocked link
-- grants nothing in either direction.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_visible" on public.profiles;
create policy "profiles_select_visible" on public.profiles
  for select using (
    auth.uid() = user_id
    or (select public.friend_link_status(auth.uid(), user_id)) in ('pending', 'accepted')
  );

-- ---------------------------------------------------------------------------
-- A trip can be shown to friends
-- ---------------------------------------------------------------------------
-- Default 'private', so applying this migration exposes not one existing trip.
-- 'link' is what migration 009's tokens already do and is recorded here only
-- so one column can state the whole answer to "who can see this".
alter table public.trip_plans
  add column if not exists visibility text not null default 'private';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trip_plans_visibility_check'
  ) then
    alter table public.trip_plans
      add constraint trip_plans_visibility_check
      check (visibility in ('private', 'friends', 'link'));
  end if;
end;
$$;

-- trip_plans and trip_plan_stops RLS is deliberately NOT widened. Friends read
-- through the two functions below, so the decision about what leaves an
-- account stays in one place, and a mistake in a policy cannot open the main
-- tables by accident.

-- ---------------------------------------------------------------------------
-- Hardening of migration 009, from the security review of 2026-08-19
-- ---------------------------------------------------------------------------
-- Two holes were found in what 009 shipped, and since both of its functions
-- are `create or replace`d here, this migration repairs the live definitions
-- in the same paste that adds friends.
--
-- F1. get_shared_trip returned each stop's `choices` column whole, with a
--     comment claiming nothing private lives in it. Wrong: the FIRST stop's
--     choices carries the wizard's trip configuration, including
--     `anchorOrigin`, which is the traveller's own home address, plus their
--     own-booking details (ownFlight, ownLegs, carHome) and baggage choices.
--     A shared itinerary therefore leaked where its owner lives. The fix is
--     the same shape as everything else here: a whitelist, written once,
--     used by both readers. A viewer needs a stop's coordinates to pin it
--     and its nights to describe it; it needs nothing else.
--
-- F2. project_trip_payload passed `photos` through untouched. The payload is
--     client-writable, so an entry whose src is a remote URL would make
--     every viewer of that trip fetch it: a tracking pixel reporting who
--     looked, and from where, to whoever crafted the payload. Only inline
--     `data:image/` sources survive now, capped at the editor's own ceiling
--     of 8, so a photo can be a picture and cannot be a phone call.

-- What a stop's choices may say to a reader: where to pin it, how long it
-- was. Everything else in that column is the owner's trip configuration.
create or replace function public.project_stop_choices(choices jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'lat',    choices -> 'lat',
    'lon',    choices -> 'lon',
    'past',   choices -> 'past',
    'custom', choices -> 'custom',
    'nights', choices -> 'nights'
  ));
$$;

-- The stops of one plan, projected. Both readers call this, for the same
-- reason both call project_trip_payload: a whitelist written twice is a
-- whitelist that drifts. transport_notes is deliberately absent, it carries
-- flight booking details.
create or replace function public.project_trip_stops(p_plan uuid)
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
           'arrive_date',    st.arrive_date,
           'depart_date',    st.depart_date,
           'transport_mode', st.transport_mode,
           'choices',        public.project_stop_choices(coalesce(st.choices, '{}'::jsonb))
         ) order by st.position), '[]'::jsonb)
    from public.trip_plan_stops st
   where st.trip_plan_id = p_plan;
$$;

-- 009's payload projection, redefined with the photo filter. Otherwise
-- unchanged; the reasoning lives with the original in 009_trip_shares.sql.
create or replace function public.project_trip_payload(
  payload jsonb,
  include_memory boolean
) returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  extras jsonb := coalesce(payload -> 'extras', '{}'::jsonb);
  mem    jsonb := extras -> 'memory';
  people jsonb;
  safe_photos jsonb;
  out_memory jsonb;
begin
  -- Names only. Entries are objects since tripCrew.js, bare strings before it.
  select coalesce(jsonb_agg(
           case when jsonb_typeof(e) = 'string'
                then jsonb_build_object('name', e)
                else jsonb_build_object('name', coalesce(e -> 'name', '""'::jsonb))
           end
         ), '[]'::jsonb)
    into people
    from jsonb_array_elements(
           case when jsonb_typeof(extras -> 'people') = 'array'
                then extras -> 'people' else '[]'::jsonb end
         ) e;

  if mem is null or jsonb_typeof(mem) <> 'object' then
    out_memory := null;
  else
    out_memory := jsonb_build_object(
      'v',          mem -> 'v',
      'places',     mem -> 'places',
      'legs',       mem -> 'legs',
      'travellers', mem -> 'travellers'
    );
    if include_memory then
      -- F2: a photograph is an inline image or it is nothing.
      select coalesce(jsonb_agg(x.ph), '[]'::jsonb)
        into safe_photos
        from (
          select ph
            from jsonb_array_elements(
                   case when jsonb_typeof(mem -> 'photos') = 'array'
                        then mem -> 'photos' else '[]'::jsonb end
                 ) ph
           where jsonb_typeof(ph) = 'object'
             and left(coalesce(ph ->> 'src', ''), 11) = 'data:image/'
           limit 8
        ) x;
      out_memory := out_memory || jsonb_build_object(
        'story',      mem -> 'story',
        'highlights', mem -> 'highlights',
        'rating',     mem -> 'rating',
        'spend',      mem -> 'spend',
        'photos',     safe_photos,
        'cover',      mem -> 'cover'
      );
    end if;
    out_memory := jsonb_strip_nulls(out_memory);
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'plan',        payload -> 'plan',
    'assignments', coalesce(payload -> 'assignments', '{}'::jsonb),
    'extras',      jsonb_strip_nulls(jsonb_build_object(
                     'people', people,
                     'memory', out_memory
                   ))
  ));
end;
$$;

-- 009's reader, redefined onto the shared stops projection (F1). The token
-- logic is unchanged; the reasoning lives with the original.
create or replace function public.get_shared_trip(share_token uuid)
returns table (
  trip_plan_id uuid,
  label        text,
  scope        text,
  created_at   timestamptz,
  stops        jsonb,
  payload      jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.trip_shares;
begin
  select * into s
    from public.trip_shares ts
   where ts.token = share_token
     and ts.revoked_at is null
     and (ts.expires_at is null or ts.expires_at > now());

  if not found then
    return;
  end if;

  return query
  select
    p.id,
    p.label,
    s.scope,
    p.created_at,
    public.project_trip_stops(p.id),
    coalesce((
      select public.project_trip_payload(dp.payload, s.scope = 'memory')
        from public.day_plans dp
       where dp.user_id = s.owner_id
         and dp.plan_id = p.id::text
         and dp.deleted_at is null
    ), '{}'::jsonb)
  from public.trip_plans p
  where p.id = s.trip_plan_id
    and p.user_id = s.owner_id;
end;
$$;

revoke all on function public.project_stop_choices(jsonb) from public, anon, authenticated;
revoke all on function public.project_trip_stops(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reading a friend's trips
-- ---------------------------------------------------------------------------
-- The shelf: every trip your accepted friends have set to 'friends', with just
-- enough to draw a card. No payload here, so opening the list is cheap and the
-- photographs only travel when somebody actually opens a trip.
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
  destination_ids text[]
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
       from public.trip_plan_stops st where st.trip_plan_id = tp.id and st.destination_id is not null)
  from public.trip_plans tp
  join public.profiles pr on pr.user_id = tp.user_id
  where tp.visibility = 'friends'
    and auth.uid() is not null
    and tp.user_id <> auth.uid()
    and public.are_friends(auth.uid(), tp.user_id)
  order by tp.updated_at desc
  limit 200;
$$;

-- One friend's trip, in full, through migration 009's projection. The caller
-- must be an accepted friend AND the trip must be set to 'friends': neither
-- alone is enough, and a trip flipped back to private disappears immediately.
create or replace function public.get_friend_trip(wanted_plan uuid)
returns table (
  trip_plan_id uuid,
  owner_handle text,
  owner_name   text,
  label        text,
  stops        jsonb,
  payload      jsonb
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

  if not found
     or tp.visibility <> 'friends'
     or auth.uid() is null
     or tp.user_id = auth.uid()
     or not public.are_friends(auth.uid(), tp.user_id) then
    return;
  end if;

  return query
  select
    tp.id,
    pr.handle,
    pr.display_name,
    tp.label,
    public.project_trip_stops(tp.id),
    -- The same whitelist a link share gets, and for the same reason. It is
    -- what strips people[].userId, which is privacy rule 2 at the top.
    coalesce((
      select public.project_trip_payload(dp.payload, true)
        from public.day_plans dp
       where dp.user_id = tp.user_id
         and dp.plan_id = tp.id::text
         and dp.deleted_at is null
    ), '{}'::jsonb)
  from public.profiles pr
  where pr.user_id = tp.user_id;
end;
$$;

revoke all on function public.friend_link_status(uuid, uuid) from public, anon, authenticated;
revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_friend_trips() from public, anon;
revoke all on function public.get_friend_trip(uuid) from public, anon;
grant execute on function public.list_friend_trips() to authenticated;
grant execute on function public.get_friend_trip(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  n int;
begin
  -- Nothing existing was exposed by adding the column.
  select count(*) into n from public.trip_plans where visibility <> 'private';
  if n > 0 then
    raise exception '% existing trip(s) are not private after the migration', n;
  end if;

  -- The pair index really is direction-blind. Proven on the catalogue rather
  -- than by inserting rows, since auth.users here belong to real people.
  select count(*) into n
    from pg_indexes
   where schemaname = 'public' and indexname = 'friendships_pair_uniq';
  if n <> 1 then
    raise exception 'the direction-blind pair index is missing';
  end if;

  -- Rule 1: exactly one select policy on friendships, and it names both sides.
  select count(*) into n
    from pg_policies
   where schemaname = 'public' and tablename = 'friendships' and cmd = 'SELECT';
  if n <> 1 then
    raise exception 'friendships has % select policies, expected exactly 1', n;
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'friendships' and cmd = 'SELECT'
       and qual like '%requester_id%' and qual like '%addressee_id%'
  ) then
    raise exception 'the friendships select policy does not pin both sides of the row';
  end if;

  -- No policy on friendships may reach into another table. Beyond the 42P17
  -- risk, a subquery here runs under the caller's own RLS, and the profiles
  -- policy hides a stranger until a link exists, so such a check would refuse
  -- exactly the first request it was meant to permit.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'friendships'
       and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%profiles%'
  ) then
    raise exception 'a friendships policy subqueries profiles, which would refuse every first request';
  end if;

  -- The two columns that name the people must not be writable, or the person
  -- who was asked could rewrite who asked them.
  if exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'friendships'
       and grantee = 'authenticated' and privilege_type = 'UPDATE'
       and column_name in ('requester_id', 'addressee_id', 'id')
  ) then
    raise exception 'authenticated can still update the identity columns of a friendship';
  end if;
  if not exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'friendships'
       and grantee = 'authenticated' and privilege_type = 'UPDATE'
       and column_name = 'status'
  ) then
    raise exception 'authenticated cannot update status, so no request could ever be answered';
  end if;

  -- F1: a stop's choices must shed the trip's cost configuration, and above
  -- all anchorOrigin, which is the traveller's own home address.
  if public.project_stop_choices(jsonb_build_object(
       'anchorOrigin', jsonb_build_object('label', 'my home address'),
       'ownFlight', jsonb_build_object('pnr', 'ABC123'),
       'ownLegs', jsonb_build_object('0', true),
       'carHome', true,
       'legModes', jsonb_build_array('train'),
       'baggage', 'cabin',
       'groupSize', 2,
       'lat', 38.72, 'lon', -9.14, 'nights', 3
     )) <> jsonb_build_object('lat', 38.72, 'lon', -9.14, 'nights', 3) then
    raise exception 'project_stop_choices does not reduce a stop to the pin whitelist';
  end if;

  -- F2 of the hardening block: only inline data: images survive.
  if jsonb_array_length(
       public.project_trip_payload(jsonb_build_object('extras', jsonb_build_object(
         'memory', jsonb_build_object(
           'photos', jsonb_build_array(
             jsonb_build_object('id', 'ok', 'src', 'data:image/jpeg;base64,AAA'),
             jsonb_build_object('id', 'pixel', 'src', 'https://evil.example/p.png'),
             jsonb_build_object('id', 'js', 'src', 'javascript:alert(1)')
           )))), true) -> 'extras' -> 'memory' -> 'photos') <> 1 then
    raise exception 'the projection lets a photo src through that is not an inline image';
  end if;

  -- The redefinition of project_trip_payload must not have loosened 009's
  -- original whitelist while adding the photo filter.
  if jsonb_exists(
       public.project_trip_payload(jsonb_build_object('extras', jsonb_build_object(
         'expenses', jsonb_build_array(1),
         'memory', jsonb_build_object('story', 's'))), false) -> 'extras', 'expenses') then
    raise exception 'the redefined projection leaks expenses';
  end if;

  -- A blocked row is deletable only by the person who blocked.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'friendships' and cmd = 'DELETE'
       and qual like '%blocked%'
  ) then
    raise exception 'the delete policy does not protect a blocked row from its requester';
  end if;

  -- Rule 2: the projection both readers share still strips a crew userId.
  if jsonb_exists(
       public.project_trip_payload(
         jsonb_build_object('extras', jsonb_build_object(
           'people', jsonb_build_array(jsonb_build_object('name', 'Sofie', 'userId', 'u-1'))
         )), true
       ) -> 'extras' -> 'people' -> 0, 'userId') then
    raise exception 'the shared projection leaks a crew userId, privacy rule 2 is broken';
  end if;

  -- trip_plans itself was not widened: still exactly the four owner policies.
  select count(*) into n
    from pg_policies where schemaname = 'public' and tablename = 'trip_plans';
  if n <> 4 then
    raise exception 'trip_plans has % policies, expected the original 4', n;
  end if;

  raise notice 'friends self-check passed';
end;
$$;
