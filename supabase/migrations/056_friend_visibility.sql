-- 056_friend_visibility.sql
--
-- *** SCHEMA MIGRATION, APPLIED BY THE OWNER (T932). ***
-- Paste in the Supabase SQL editor after 055 (it does not depend on 055,
-- only on 004, 010, 011 and 012). Never `db push` against
-- ntssxktaduxzpsmejwyv. Pasting twice is safe. Look for
-- "friend visibility self-check passed". The way back is
-- 056_friend_visibility_down.sql.
--
-- "Friends see" (T932, the Together page): what an account shows its
-- ACCEPTED friends, one switch per kind. Trips stay chosen one by one, as
-- since 011 (trip_plans.visibility = 'friends'); this file adds the rest.
--
--   friend_visibility     one row per account, booleans only. The owner
--                         writes it; an accepted friend may read it (the
--                         booleans and nothing else are in the row). No row
--                         means the defaults below.
--
--     show_countries  default ON   the countries on your record
--     show_saves      default OFF  the places you saved
--     show_tips       default ON   your "Tip for friends" on a shown trip
--     show_meet       default ON   "Plans that meet" with your shown trips
--
--   list_friend_shares()  SECURITY DEFINER. One row per accepted friend with
--                         their switches and, only where a switch is on, the
--                         data it covers:
--                           countries   user_settings.settings.visitedCountries
--                           saves       user_settings.settings.favorites
--                           trips       per trip they show you: the stops
--                                       with their own dates (the same data
--                                       get_friend_trip already gives) and
--                                       the tip when show_tips.
--                         Saves never leave an account until it switches
--                         them on.
--   block_friend_link(link)  SECURITY DEFINER. Blocks the other side of a
--                         link you are in, silently: the row becomes
--                         'blocked' with you as the addressee, which is the
--                         shape 011 already protects (only the blocker can
--                         remove it, the other side cannot ask again).
--
-- COSTS ARE NEVER SHARED (owner, T937). Friends never see what somebody's
-- trips cost: there is no switch for it, and nothing in this file reads a
-- memory's spend, ledger or any amount. The self-check below fails if a
-- cost column or a cost key ever comes back.
--
-- THE TIP, DEFINED (T937). A trip's memory (pastTripMemory.js) is kept in
-- day_plans.payload.extras.memory. The tip is its own "Tip for friends"
-- field, memory.friendTip, trimmed, at most 160 characters, and only when
-- show_tips is on. The memory's story stays private: it is never read here,
-- nor are photos, the ledger or the crew.
--
-- AGE. Carta has no age signal today, so nothing here can switch friends
-- off for an account under 16 (GDPR Article 8). Raised for the owner.
--
-- THE APP WITHOUT THIS FILE. src/auth/friendVisibility.js answers the
-- defaults for your own switches (saving says it could not), and
-- list_friend_shares missing (PGRST202) gives no countries, saves or
-- tips for anyone: only what list_friend_trips already shows.

create table if not exists public.friend_visibility (
  user_id        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  show_countries boolean not null default true,
  show_saves     boolean not null default false,
  show_tips      boolean not null default true,
  show_meet      boolean not null default true,
  updated_at     timestamptz not null default now()
);

alter table public.friend_visibility enable row level security;

drop policy if exists "friend_visibility_select" on public.friend_visibility;
create policy "friend_visibility_select" on public.friend_visibility
  for select using (
    auth.uid() = user_id
    or (select public.link_status_with_me(user_id)) = 'accepted'
  );
drop policy if exists "friend_visibility_insert_own" on public.friend_visibility;
create policy "friend_visibility_insert_own" on public.friend_visibility
  for insert with check (auth.uid() = user_id);
drop policy if exists "friend_visibility_update_own" on public.friend_visibility;
create policy "friend_visibility_update_own" on public.friend_visibility
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "friend_visibility_delete_own" on public.friend_visibility;
create policy "friend_visibility_delete_own" on public.friend_visibility
  for delete using (auth.uid() = user_id);

-- A table made by an earlier draft of this file may still carry the cost
-- switch; it goes, so no cost setting is ever stored.
alter table public.friend_visibility drop column if exists show_costs;

-- An earlier draft returned a cost; the return type changed, so drop first.
drop function if exists public.list_friend_shares();
drop function if exists public.jsonb_num(jsonb);

create or replace function public.list_friend_shares()
returns table (
  friend_id      uuid,
  show_countries boolean,
  show_saves     boolean,
  show_tips      boolean,
  show_meet      boolean,
  countries      jsonb,
  saves          jsonb,
  trips          jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with friends as (
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as fid
      from public.friendships f
     where auth.uid() is not null
       and f.status = 'accepted'
       and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  ), vis as (
    select fr.fid,
           coalesce(v.show_countries, true)  as sc,
           coalesce(v.show_saves, false)     as ss,
           coalesce(v.show_tips, true)       as st,
           coalesce(v.show_meet, true)       as sm
      from friends fr
      left join public.friend_visibility v on v.user_id = fr.fid
  )
  select
    vis.fid, vis.sc, vis.ss, vis.st, vis.sm,
    case when vis.sc then coalesce(
      (select jsonb_agg(c) from (
         select c from jsonb_array_elements_text(
           case when jsonb_typeof(us.settings -> 'visitedCountries') = 'array' then us.settings -> 'visitedCountries' else '[]'::jsonb end
         ) c limit 80) x), '[]'::jsonb)
    else '[]'::jsonb end,
    case when vis.ss then coalesce(
      (select jsonb_agg(k) from (
         select k from jsonb_array_elements_text(
           case when jsonb_typeof(us.settings -> 'favorites') = 'array' then us.settings -> 'favorites' else '[]'::jsonb end
         ) k limit 200) y), '[]'::jsonb)
    else '[]'::jsonb end,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'trip_plan_id', tp.id,
        'stops', coalesce((
          select jsonb_agg(jsonb_build_object(
            'destination_id', s.destination_id, 'city', s.city,
            'arrive_date', s.arrive_date, 'depart_date', s.depart_date) order by s.position)
            from public.trip_plan_stops s where s.trip_plan_id = tp.id), '[]'::jsonb),
        'tip', case when vis.st then (
          select nullif(left(btrim(dp.payload #>> '{extras,memory,friendTip}'), 160), '')
            from public.day_plans dp
           where dp.user_id = tp.user_id and dp.plan_id = tp.id::text and dp.deleted_at is null
           limit 1) else null end
      ))
        from public.trip_plans tp
       where tp.user_id = vis.fid and tp.visibility = 'friends'
    ), '[]'::jsonb)
  from vis
  left join public.user_settings us on us.user_id = vis.fid;
$$;
revoke all on function public.list_friend_shares() from public, anon;
grant execute on function public.list_friend_shares() to authenticated;

-- Block the other side of a link, silently. Answers 'blocked' or 'gone'.
create or replace function public.block_friend_link(link uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.friendships%rowtype;
  other uuid;
begin
  if auth.uid() is null then return 'gone'; end if;
  select * into r from public.friendships
   where id = link and (requester_id = auth.uid() or addressee_id = auth.uid());
  if not found then return 'gone'; end if;
  other := case when r.requester_id = auth.uid() then r.addressee_id else r.requester_id end;
  if r.addressee_id = auth.uid() then
    update public.friendships set status = 'blocked', responded_at = now() where id = r.id;
  else
    -- The blocker must be the addressee for 011's delete rule to protect the
    -- block, so the row is written the other way round.
    delete from public.friendships where id = r.id;
    insert into public.friendships (requester_id, addressee_id, status, responded_at)
    values (other, auth.uid(), 'blocked', now());
  end if;
  -- A co-planner seat between the two goes with it, both ways.
  delete from public.trip_collaborators c
   using public.trip_plans tp
   where c.trip_plan_id = tp.id
     and ((tp.user_id = auth.uid() and c.user_id = other) or (tp.user_id = other and c.user_id = auth.uid()));
  return 'blocked';
end;
$$;
revoke all on function public.block_friend_link(uuid) from public, anon;
grant execute on function public.block_friend_link(uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'friend_visibility' and rowsecurity) then
    raise exception 'row level security is off on friend_visibility';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'friend_visibility' and cmd in ('INSERT', 'UPDATE')
       and coalesce(with_check, '') not like '%auth.uid() = user_id%'
  ) then
    raise exception 'only the owner may write a friend_visibility row';
  end if;
  -- Costs are never shared (T937): no cost switch, no cost in the shares.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'friend_visibility' and column_name = 'show_costs'
  ) then
    raise exception 'friend_visibility must not store a cost switch';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'list_friend_shares'
       and (pg_get_functiondef(p.oid) like '%day_cost%' or pg_get_functiondef(p.oid) like '%spend%'
            or pg_get_functiondef(p.oid) like '%{extras,memory,story}%')
  ) then
    raise exception 'list_friend_shares must not read a cost or the private story';
  end if;
  raise notice 'friend visibility self-check passed';
end;
$$;
