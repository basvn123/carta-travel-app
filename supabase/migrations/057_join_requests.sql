-- 057_join_requests.sql
--
-- *** SCHEMA MIGRATION, APPLIED BY THE OWNER (T939). ***
-- Paste in the Supabase SQL editor after 056 (it needs 002, 011, 012 and
-- 020; not 055 or 056). Never `db push` against ntssxktaduxzpsmejwyv.
-- Pasting twice is safe. Look for "join requests self-check passed". The
-- way back is 057_join_requests_down.sql.
--
-- "Ask to join" (T939, the Together page): a friend asks to join a trip
-- you show them, you see it under "To answer" and say yes or no. Yes makes
-- them a co-planner of that trip through 020's own table
-- (trip_collaborators, status 'accepted', invited_by you), the same row an
-- invitation they accepted would leave, so everything 020 grants and guards
-- (is_coplanner, the stop policies, guard_coplanner_write, Leave) applies
-- unchanged. No is a delete and is silent, as a declined friend request is.
--
-- WHAT IT ADDS
--
--   trip_join_requests     one row per pending request: the trip, who asks,
--                          and the trip's owner. Only the two people it
--                          names can read it. Nobody inserts or updates it
--                          directly; the functions below do, after their
--                          checks. The asker may withdraw (delete) and the
--                          owner may decline (delete).
--   ask_to_join(plan)      SECURITY DEFINER. Files a request when the trip
--                          is shown to friends (visibility 'friends'), its
--                          owner is an ACCEPTED friend of the caller (011's
--                          are_friends), and the caller is not already on
--                          it. Answers 'requested', 'already' (on the trip
--                          or asked before) or 'gone'.
--   answer_join_request(req, yes)
--                          SECURITY DEFINER, the trip's owner only. Yes
--                          writes the accepted trip_collaborators row (the
--                          two must still be accepted friends) and removes
--                          the request; no removes it. Answers 'joined',
--                          'declined' or 'gone'.
--   list_join_requests()   SECURITY DEFINER. Requests to your trips (with
--                          the asker's handle, name and face, and the trip's
--                          label and cities) and your own pending requests
--                          (trip ids only, for the "Requested" button).
--
-- THE APP WITHOUT THIS FILE. src/auth/joinRequests.js answers an empty list
-- when the table or a function is missing (42P01, PGRST205, PGRST202,
-- 42883), and the Together page draws no "Ask to join" button.

create table if not exists public.trip_join_requests (
  id           uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (trip_plan_id, requester_id),
  check (requester_id <> owner_id)
);
create index if not exists trip_join_requests_owner_idx on public.trip_join_requests (owner_id);
create index if not exists trip_join_requests_requester_idx on public.trip_join_requests (requester_id);

alter table public.trip_join_requests enable row level security;

drop policy if exists "join_requests_select" on public.trip_join_requests;
create policy "join_requests_select" on public.trip_join_requests
  for select using (auth.uid() in (requester_id, owner_id));
drop policy if exists "join_requests_delete" on public.trip_join_requests;
create policy "join_requests_delete" on public.trip_join_requests
  for delete using (auth.uid() in (requester_id, owner_id));
-- No insert or update policy: with RLS on, nobody writes a row except
-- through ask_to_join and answer_join_request.
revoke insert, update on public.trip_join_requests from authenticated, anon;

create or replace function public.ask_to_join(plan uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  if auth.uid() is null then return 'gone'; end if;
  select tp.user_id into owner from public.trip_plans tp
   where tp.id = plan and tp.visibility = 'friends';
  if owner is null or owner = auth.uid() then return 'gone'; end if;
  if not public.are_friends(auth.uid(), owner) then return 'gone'; end if;
  if exists (select 1 from public.trip_collaborators c where c.trip_plan_id = plan and c.user_id = auth.uid()) then
    return 'already';
  end if;
  insert into public.trip_join_requests (trip_plan_id, requester_id, owner_id)
  values (plan, auth.uid(), owner)
  on conflict (trip_plan_id, requester_id) do nothing;
  if not found then return 'already'; end if;
  return 'requested';
end;
$$;
revoke all on function public.ask_to_join(uuid) from public, anon;
grant execute on function public.ask_to_join(uuid) to authenticated;

create or replace function public.answer_join_request(req uuid, yes boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.trip_join_requests%rowtype;
begin
  if auth.uid() is null then return 'gone'; end if;
  select * into r from public.trip_join_requests
   where id = req and owner_id = auth.uid();
  if not found then return 'gone'; end if;
  delete from public.trip_join_requests where id = r.id;
  if not yes then return 'declined'; end if;
  -- The trip must still be yours and the asker still your friend.
  if not exists (select 1 from public.trip_plans tp where tp.id = r.trip_plan_id and tp.user_id = auth.uid())
     or not public.are_friends(auth.uid(), r.requester_id) then
    return 'gone';
  end if;
  insert into public.trip_collaborators (trip_plan_id, user_id, invited_by, status, responded_at)
  values (r.trip_plan_id, r.requester_id, auth.uid(), 'accepted', now())
  on conflict (trip_plan_id, user_id) do update set status = 'accepted', responded_at = now();
  return 'joined';
end;
$$;
revoke all on function public.answer_join_request(uuid, boolean) from public, anon;
grant execute on function public.answer_join_request(uuid, boolean) to authenticated;

create or replace function public.list_join_requests()
returns table (
  id           uuid,
  trip_plan_id uuid,
  mine         boolean,
  requester_id uuid,
  handle       text,
  display_name text,
  avatar_emoji text,
  trip_label   text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  -- Requests to your trips, with who asks.
  select r.id, r.trip_plan_id, false, r.requester_id, p.handle, p.display_name, p.avatar_emoji,
         tp.label, r.created_at
    from public.trip_join_requests r
    join public.trip_plans tp on tp.id = r.trip_plan_id
    left join public.profiles p on p.user_id = r.requester_id
   where auth.uid() is not null and r.owner_id = auth.uid()
  union all
  -- Your own requests: the trip id and nothing about anyone else.
  select r.id, r.trip_plan_id, true, r.requester_id, null, null, null, null, r.created_at
    from public.trip_join_requests r
   where auth.uid() is not null and r.requester_id = auth.uid();
$$;
revoke all on function public.list_join_requests() from public, anon;
grant execute on function public.list_join_requests() to authenticated;

do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'trip_join_requests' and rowsecurity) then
    raise exception 'row level security is off on trip_join_requests';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'trip_join_requests' and cmd in ('INSERT', 'UPDATE', 'ALL')
  ) then
    raise exception 'trip_join_requests must be written only through ask_to_join and answer_join_request';
  end if;
  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'trip_join_requests' and cmd = 'SELECT'
         and qual like '%requester_id%' and qual like '%owner_id%') <> 1 then
    raise exception 'trip_join_requests must be readable only by the two people it names';
  end if;
  raise notice 'join requests self-check passed';
end;
$$;
