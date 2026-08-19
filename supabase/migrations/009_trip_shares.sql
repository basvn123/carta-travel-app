-- Trip shares: a revocable, read-only link to one saved trip.
--
-- WHY A TABLE AND NOT THE EXISTING LINK. lib/shareLink.js already shares a
-- trip with no backend at all: the whole draft goes JSON, deflate, base64url
-- into the URL hash. That stays exactly as it is, and it stays the right
-- answer for an unsaved draft. It cannot be the answer for a SAVED trip, for
-- two reasons: a filed trip carries a memory whose photographs are downscaled
-- data URLs (see PastTripForm.jsx), which no URL will hold, and a link with
-- the trip baked into it can never be withdrawn. A token can.
--
-- WHY THE READ IS AN RPC AND NOT RLS. Opening this up through row policies on
-- trip_plans / trip_plan_stops / day_plans would scatter the decision about
-- what leaves an account across three tables. day_plans in particular is one
-- jsonb payload per (user_id, plan_id) that carries the group's expense
-- ledger, imported booking references, private notes and the photographs, so
-- "let someone read the row" and "let someone see the trip" are very
-- different permissions. Instead there is exactly ONE function that decides
-- what a share contains, project_trip_payload below, and it whitelists on the
-- way out. That mirrors what decodeTripShare already does on the way in.
--
-- Migration 011 (friends) reuses the same projection rather than writing a
-- second copy of the whitelist. Two copies is how one of them drifts.
--
-- SUPERSEDED IN PART BY 011. The 2026-08-19 security review found that the
-- get_shared_trip below returns each stop's `choices` column whole, and the
-- first stop's choices carries anchorOrigin, the traveller's home address.
-- Migration 011 `create or replace`s both functions here with a stops
-- whitelist and a photo-src filter; always apply 011 after this file.
--
-- Apply in the Supabase SQL editor. Live project policy: never `db push`
-- against ntssxktaduxzpsmejwyv; paste this file there by hand.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- The token
-- ---------------------------------------------------------------------------
-- One row per link handed out. Several may exist for one trip: an itinerary
-- sent to a colleague and a full memory sent to the people who were there are
-- different shares, and withdrawing one must not kill the other.
create table if not exists public.trip_shares (
  token        uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  -- 'itinerary' = where and when. 'memory' also carries how it was: the
  -- story, the rating, the photographs, and what the owner says it cost.
  scope        text not null default 'itinerary'
               check (scope in ('itinerary', 'memory')),
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists trip_shares_trip_plan_id_idx on public.trip_shares(trip_plan_id);
create index if not exists trip_shares_owner_id_idx on public.trip_shares(owner_id);

alter table public.trip_shares enable row level security;

-- The owner manages their own links. Nobody reads this table BY TOKEN: that
-- is the RPC's job, and it is security definer precisely so a reader never
-- needs a row policy here. Following 003 and 008, the insert check pins the
-- referenced plan to the inserting user, so a leaked plan uuid cannot be used
-- to mint a link to somebody else's trip.
create policy "trip_shares_select_own" on public.trip_shares
  for select using (auth.uid() = owner_id);

create policy "trip_shares_insert_own" on public.trip_shares
  for insert with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.trip_plans p
      where p.id = trip_plan_id and p.user_id = auth.uid()
    )
  );

create policy "trip_shares_update_own" on public.trip_shares
  for update using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.trip_plans p
      where p.id = trip_plan_id and p.user_id = auth.uid()
    )
  );

create policy "trip_shares_delete_own" on public.trip_shares
  for delete using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- The projection: the single place that decides what leaves an account
-- ---------------------------------------------------------------------------
-- Input is a day_plans payload, which looks like
--   { plan, assignments, prefs, extras }
-- and whose `extras` holds bookings, notes, checklist, expenses, people,
-- inbox, dayExtras and memory (see planner/dayPlanStore.js).
--
-- WHAT NEVER LEAVES, at any scope:
--   extras.expenses   the group's shared-spend ledger. Who paid what and who
--                     still owes whom, with other people's names attached. It
--                     is the one thing here that is somebody else's business
--                     as well as the owner's.
--   extras.bookings   confirmation numbers and booking references.
--   extras.inbox      the same, as imported.
--   extras.notes      written to self, not to a reader.
--   extras.checklist  the packing list.
--   extras.dayExtras  per-day notes, same reasoning.
--   prefs             the planner's own input knobs, not trip content.
--   people[].userId   a name tells a reader about the journey; a linked
--                     account tells them about somebody's social graph. The
--                     names go, the links never do. Migration 011 depends on
--                     this rule holding here.
--
-- WHAT SCOPE 'memory' ADDS: the story, the highlights, the rating, the
-- photographs, and memory.spend. That last one is the owner's own summary of
-- what the trip cost them, which is Carta's whole subject and theirs to
-- share. It is not the ledger, which stays behind regardless.
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
      out_memory := out_memory || jsonb_build_object(
        'story',      mem -> 'story',
        'highlights', mem -> 'highlights',
        'rating',     mem -> 'rating',
        'spend',      mem -> 'spend',
        'photos',     mem -> 'photos',
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

-- ---------------------------------------------------------------------------
-- The read
-- ---------------------------------------------------------------------------
-- security definer so a reader needs no row policies on the three tables this
-- touches, and so the whole decision lives in one auditable place. It is also
-- granted to `anon`: a share whose first screen is a signup wall does not get
-- opened, and the token itself is the credential.
--
-- Returns zero rows for an unknown, revoked or expired token, which is what
-- lets the client show "this link no longer works" without leaking whether
-- the token ever existed.
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
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'position',       st.position,
               'destination_id', st.destination_id,
               'city',           st.city,
               'country',        st.country,
               'arrive_date',    st.arrive_date,
               'depart_date',    st.depart_date,
               'transport_mode', st.transport_mode,
               -- `choices` carries an off-catalogue stop's coordinates, which
               -- the viewer needs to pin it. Nothing private lives in it.
               'choices',        st.choices
             ) order by st.position)
        from public.trip_plan_stops st
       where st.trip_plan_id = p.id
    ), '[]'::jsonb),
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

-- The function is the only door, so lock the direct one: revoke the default
-- execute-for-all on the projection helper, which is internal, and hand out
-- execute on the reader to both a signed-in user and an anonymous visitor.
revoke all on function public.project_trip_payload(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.get_shared_trip(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply, fails loudly rather than quietly leaking
-- ---------------------------------------------------------------------------
-- The whole safety of this feature is one whitelist, so it is worth a few
-- seconds proving that it holds before anybody hands out a link. Feed the
-- projection a payload carrying every private thing a real trip has, at both
-- scopes, and refuse the migration if any of it survives.
-- jsonb_exists(...) rather than the `?` operator throughout: plenty of SQL
-- clients read a bare `?` as a bind placeholder and mangle the statement.
-- The function form is the same test with no such ambiguity.
do $$
declare
  sample jsonb := jsonb_build_object(
    'plan', jsonb_build_object('id', 'local:1'),
    'assignments', jsonb_build_object('0', jsonb_build_object('0', jsonb_build_array(1, 2))),
    'prefs', jsonb_build_object('aiGroupSize', 4),
    'extras', jsonb_build_object(
      'bookings',  jsonb_build_object('flight', 'PNR-ABC123'),
      'notes',     'call the landlord about the key',
      'checklist', jsonb_build_array('passport'),
      'expenses',  jsonb_build_array(jsonb_build_object('desc', 'dinner', 'amount', 40, 'paidBy', 0)),
      'inbox',     jsonb_build_array(jsonb_build_object('ref', 'XY9')),
      'dayExtras', jsonb_build_object('0', 'met Ana at the station'),
      'people',    jsonb_build_array(
                     jsonb_build_object('name', 'Sofie', 'userId', 'uuid-of-sofie'),
                     'Jonas'
                   ),
      'memory',    jsonb_build_object(
                     'v', 1,
                     'places', jsonb_build_array(jsonb_build_object('city', 'Lisbon')),
                     'legs', jsonb_build_array(),
                     'travellers', jsonb_build_object('adults', 2),
                     'story', 'rain every afternoon',
                     'highlights', jsonb_build_array('the fortress at dusk'),
                     'rating', 8,
                     'spend', jsonb_build_object('flights', 120),
                     'photos', jsonb_build_array(jsonb_build_object('id', 'ph1', 'src', 'data:image/jpeg;base64,AAA')),
                     'cover', 'ph1'
                   )
    )
  );
  itinerary jsonb := public.project_trip_payload(sample, false);
  memory    jsonb := public.project_trip_payload(sample, true);
  leaked    text;
begin
  -- Nothing on this list may appear at EITHER scope.
  foreach leaked in array array['bookings', 'notes', 'checklist', 'expenses', 'inbox', 'dayExtras'] loop
    if jsonb_exists(itinerary -> 'extras', leaked)
       or jsonb_exists(memory -> 'extras', leaked) then
      raise exception 'project_trip_payload leaks extras.%', leaked;
    end if;
  end loop;
  if jsonb_exists(itinerary, 'prefs') or jsonb_exists(memory, 'prefs') then
    raise exception 'project_trip_payload leaks prefs';
  end if;

  -- A crew member's name travels, the account behind it never does.
  if jsonb_exists(itinerary -> 'extras' -> 'people' -> 0, 'userId')
     or jsonb_exists(memory -> 'extras' -> 'people' -> 0, 'userId') then
    raise exception 'project_trip_payload leaks a crew member userId';
  end if;
  if (memory -> 'extras' -> 'people' -> 0 ->> 'name') is distinct from 'Sofie'
     or (memory -> 'extras' -> 'people' -> 1 ->> 'name') is distinct from 'Jonas' then
    raise exception 'project_trip_payload dropped or mangled the crew names';
  end if;

  -- Scope 'itinerary' is where and when, nothing about how it was.
  foreach leaked in array array['story', 'highlights', 'rating', 'spend', 'photos', 'cover'] loop
    if jsonb_exists(itinerary -> 'extras' -> 'memory', leaked) then
      raise exception 'scope itinerary leaks memory.%', leaked;
    end if;
  end loop;

  -- Scope 'memory' is supposed to carry them, so prove it does.
  foreach leaked in array array['story', 'highlights', 'rating', 'spend', 'photos'] loop
    if not jsonb_exists(memory -> 'extras' -> 'memory', leaked) then
      raise exception 'scope memory is missing memory.%', leaked;
    end if;
  end loop;

  -- And the trip itself survives both.
  if not (jsonb_exists(itinerary, 'assignments')
          and jsonb_exists(itinerary -> 'extras' -> 'memory', 'places')) then
    raise exception 'project_trip_payload dropped the trip itself';
  end if;

  raise notice 'project_trip_payload self-check passed';
end;
$$;
