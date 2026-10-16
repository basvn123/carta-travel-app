-- 052_coplan_links.sql
--
-- Invite someone to plan a trip with a link (T434). Until now a co-planner
-- had to be an accepted friend first (020, 046): the owner sent a friend
-- request, waited, then invited from a list. Wanderlog, the planner people
-- compare Carta with, adds tripmates by link in one step. This file adds the
-- same: the owner makes a link, the person who opens it while signed in
-- joins the trip as a co-planner and becomes a friend of the owner, which is
-- what every co-planner already is under 020's rule.
--
-- WHAT IT ADDS
--
--   coplan_links          one row per link: a 64-character random token, the
--                         plan, who made it, when it ends (7 days) and
--                         whether it was withdrawn. No policies at all: the
--                         table is reachable only through the four functions
--                         below, so a token can never be listed by a select.
--   coplan_link_attempts  who tried a token and when, for the rate limit.
--   create_coplan_link(plan)   the owner's own plan only; at most 5 live
--                              links per plan. Returns the token and its end.
--   list_coplan_links(plan)    the owner's live links on their own plan.
--   revoke_coplan_link(token)  the owner withdraws one.
--   accept_coplan_link(token)  signed in only; 20 tries an hour per account.
--                              Answers one status word:
--                                joined   added (or already on it)
--                                own      the caller owns the trip
--                                gone     unknown, expired or withdrawn
--                                blocked  a friendship between the two is
--                                         marked blocked; nothing is added
--                                too_many the rate limit
--
-- The friendship the link creates is accepted on both sides at once: the
-- owner made the link to share the trip, and the guest chose to open it
-- while signed in. Removing either later uses the existing controls (Friends
-- and the share panel), which delete the same rows 011 and 020 always did.
--
-- ORDER. Paste in the Supabase SQL editor after 046 (it relies on 011's
-- friendships pair index and 020's trip_collaborators). Never `db push`
-- against ntssxktaduxzpsmejwyv. Pasting twice is safe. Look for
-- "coplan links self-check passed". Then run
-- `node scripts/verify_live_policies.mjs` from continent-app/.
--
-- THE APP WITHOUT THIS FILE. The share panel calls create_coplan_link; a
-- missing function (PGRST202) hides the "Invite by link" row, and a link
-- opened before this paste says it could not be opened. Nothing else moves.
--
-- DOWN, in this order:
--   drop function if exists public.accept_coplan_link(text);
--   drop function if exists public.revoke_coplan_link(text);
--   drop function if exists public.list_coplan_links(uuid);
--   drop function if exists public.create_coplan_link(uuid);
--   drop table if exists public.coplan_link_attempts;
--   drop table if exists public.coplan_links;
--   notify pgrst, 'reload schema';
-- Co-planners and friendships made through links stay, as rows of 011 and
-- 020; nothing of the trips themselves is touched either way.

do $$
begin
  if to_regclass('public.trip_collaborators') is null then
    raise exception 'Paste 020_coplanners.sql (and 023, 046) before 052_coplan_links.sql';
  end if;
  if to_regclass('public.friendships') is null then
    raise exception 'Paste 011_friends.sql before 052_coplan_links.sql';
  end if;
end $$;

create table if not exists public.coplan_links (
  token        text primary key check (token ~ '^[0-9a-f]{64}$'),
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  created_by   uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  revoked_at   timestamptz,
  uses         int not null default 0
);
create index if not exists coplan_links_plan_idx on public.coplan_links (trip_plan_id);
alter table public.coplan_links enable row level security;
revoke all on public.coplan_links from anon, authenticated;

create table if not exists public.coplan_link_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists coplan_link_attempts_idx on public.coplan_link_attempts (user_id, at);
alter table public.coplan_link_attempts enable row level security;
revoke all on public.coplan_link_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
create or replace function public.create_coplan_link(plan uuid)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  live int;
  tok text;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from public.trip_plans p where p.id = plan and p.user_id = me) then
    raise exception 'not your trip' using errcode = '42501';
  end if;
  select count(*) into live from public.coplan_links l
   where l.trip_plan_id = plan and l.revoked_at is null and l.expires_at > now();
  if live >= 5 then
    raise exception 'too_many_links' using errcode = 'P0001';
  end if;
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.coplan_links (token, trip_plan_id, created_by) values (tok, plan, me);
  return query select l.token, l.expires_at from public.coplan_links l where l.token = tok;
end;
$$;
revoke all on function public.create_coplan_link(uuid) from public;
grant execute on function public.create_coplan_link(uuid) to authenticated;

-- ---------------------------------------------------------------------------
create or replace function public.list_coplan_links(plan uuid)
returns table (token text, created_at timestamptz, expires_at timestamptz, uses int)
language sql
stable
security definer
set search_path = public
as $$
  select l.token, l.created_at, l.expires_at, l.uses
    from public.coplan_links l
    join public.trip_plans p on p.id = l.trip_plan_id
   where l.trip_plan_id = plan
     and p.user_id = auth.uid()
     and l.revoked_at is null
     and l.expires_at > now()
   order by l.created_at desc;
$$;
revoke all on function public.list_coplan_links(uuid) from public;
grant execute on function public.list_coplan_links(uuid) to authenticated;

-- ---------------------------------------------------------------------------
create or replace function public.revoke_coplan_link(link text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update public.coplan_links l set revoked_at = now()
   where l.token = link and l.created_by = auth.uid() and l.revoked_at is null;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function public.revoke_coplan_link(text) from public;
grant execute on function public.revoke_coplan_link(text) to authenticated;

-- ---------------------------------------------------------------------------
create or replace function public.accept_coplan_link(link text)
returns table (status text, trip_plan_id uuid, label text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  l public.coplan_links%rowtype;
  tries int;
  edge public.friendships%rowtype;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;

  select count(*) into tries from public.coplan_link_attempts a
   where a.user_id = me and a.at > now() - interval '1 hour';
  if tries >= 20 then
    return query select 'too_many'::text, null::uuid, null::text;
    return;
  end if;
  insert into public.coplan_link_attempts (user_id) values (me);

  select * into l from public.coplan_links c
   where c.token = link and c.revoked_at is null and c.expires_at > now();
  if not found then
    return query select 'gone'::text, null::uuid, null::text;
    return;
  end if;

  if l.created_by = me then
    return query select 'own'::text, l.trip_plan_id, (select p.label from public.trip_plans p where p.id = l.trip_plan_id);
    return;
  end if;

  select * into edge from public.friendships f
   where least(f.requester_id, f.addressee_id) = least(me, l.created_by)
     and greatest(f.requester_id, f.addressee_id) = greatest(me, l.created_by);
  if found and edge.status = 'blocked' then
    return query select 'blocked'::text, null::uuid, null::text;
    return;
  end if;
  if found then
    update public.friendships set status = 'accepted', responded_at = coalesce(responded_at, now())
     where id = edge.id and status <> 'accepted';
  else
    insert into public.friendships (requester_id, addressee_id, status, responded_at)
    values (l.created_by, me, 'accepted', now());
  end if;

  insert into public.trip_collaborators (trip_plan_id, user_id, invited_by, status, responded_at)
  values (l.trip_plan_id, me, l.created_by, 'accepted', now())
  on conflict (trip_plan_id, user_id)
  do update set status = 'accepted', responded_at = coalesce(public.trip_collaborators.responded_at, now());

  update public.coplan_links set uses = uses + 1 where token = l.token;

  return query select 'joined'::text, l.trip_plan_id, (select p.label from public.trip_plans p where p.id = l.trip_plan_id);
end;
$$;
revoke all on function public.accept_coplan_link(text) from public;
grant execute on function public.accept_coplan_link(text) to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Self-check: the tables are closed to direct reads, the four functions exist
-- and anon cannot run any of them.
do $$
begin
  if has_table_privilege('authenticated', 'public.coplan_links', 'select') then
    raise exception 'coplan_links must not be readable by authenticated';
  end if;
  if has_function_privilege('anon', 'public.accept_coplan_link(text)', 'execute') then
    raise exception 'anon must not run accept_coplan_link';
  end if;
  if to_regprocedure('public.create_coplan_link(uuid)') is null
     or to_regprocedure('public.list_coplan_links(uuid)') is null
     or to_regprocedure('public.revoke_coplan_link(text)') is null then
    raise exception 'a coplan link function is missing';
  end if;
  raise notice 'coplan links self-check passed';
end $$;
