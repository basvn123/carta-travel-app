-- Badges: milestones in the social layer, awarded by the database.
--
-- WHY THE DATABASE AND NOT THE CLIENT. A badge is a claim ("somebody opened a
-- link I made"), and a claim the client writes for itself is a checkbox, not a
-- claim. So the table below takes no client writes at all: every grant happens
-- inside a trigger or a definer function, at the moment the qualifying row is
-- written, which is also what keeps the profile cheap to load. Reading badges
-- is one indexed select on (user_id, badge); nothing is ever aggregated at
-- read time.
--
-- WHAT EACH BADGE MEANS, in this app's own verbs:
--
--   icebreaker       You sent your first friend request. Trigger on
--                    friendships INSERT; the primary key makes seconds free.
--
--   copilot          You showed a plan to your friends: a trip's visibility
--                    was set to 'friends' while you had at least one accepted
--                    friend to show it to. Trigger on trip_plans UPDATE.
--
--   local_guide      A share link you made was opened by somebody who is not
--                    you. get_shared_trip is stable and cannot write, so the
--                    reader's screen calls shared_trip_opened() after a
--                    successful load. Anonymous viewers count, which is the
--                    point of a link. Holding a live token IS the criterion,
--                    so anon being able to call it grants nothing it should
--                    not, and the insert is idempotent.
--
--   catalyst         Your invite brought somebody new: a friend request whose
--                    sender's account is under 7 days old, aimed at an account
--                    older than theirs. The invite link (#friend=) never
--                    reaches a server by design, so the arrival of the new
--                    account's first request is the evidence, not the click.
--
--   well_connected   Three accepted friendships. The trigger counts on the
--                    accept, never on read, and the client draws its progress
--                    ring from the friend list it has already fetched.
--
-- The badge list is a CHECK constraint rather than an enum: adding a badge is
-- a one-line ALTER, and a dropped enum value is a headache nobody needs.
--
-- Privacy: badges are readable by the person who earned them and nobody else.
-- Rule 1 of migration 011 (the friend list is private) would leak through a
-- public 'well_connected' badge, so nothing here is visible to friends or
-- strangers until that is decided deliberately.
--
-- Apply in the Supabase SQL editor. Live project policy: never `db push`
-- against ntssxktaduxzpsmejwyv; paste this file there by hand.
-- Requires 009_trip_shares.sql and 011_friends.sql.

-- ---------------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------------
create table if not exists public.user_achievements (
  user_id   uuid not null references auth.users(id) on delete cascade,
  badge     text not null check (badge in
              ('icebreaker', 'copilot', 'local_guide', 'catalyst', 'well_connected')),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge)
);

alter table public.user_achievements enable row level security;

drop policy if exists "achievements_select_own" on public.user_achievements;
create policy "achievements_select_own" on public.user_achievements
  for select using (auth.uid() = user_id);

-- No insert, update or delete policy exists, and the grants say so too:
-- a badge that could be self-written would not be worth rendering.
revoke all on public.user_achievements from anon;
revoke insert, update, delete on public.user_achievements from authenticated;

-- ---------------------------------------------------------------------------
-- The one writer
-- ---------------------------------------------------------------------------
-- Everything below goes through this. ON CONFLICT DO NOTHING is what makes
-- every trigger idempotent: the first qualifying act wins, every later one is
-- a no-op, and no trigger has to ask "was this already earned".
create or replace function public.award_badge(who uuid, what text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.user_achievements (user_id, badge)
  values (who, what)
  on conflict (user_id, badge) do nothing;
$$;

revoke all on function public.award_badge(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- icebreaker and catalyst: the moment a request is sent
-- ---------------------------------------------------------------------------
-- security definer because the caller is whoever pressed "Ask", and they hold
-- no write on user_achievements and no read on auth.users. Runs as the owner,
-- like every definer function in 011.
create or replace function public.badge_on_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_since timestamptz;
  addressee_since timestamptz;
begin
  perform public.award_badge(new.requester_id, 'icebreaker');

  -- catalyst goes to the RECEIVER: a brand-new account asking an older one is
  -- what an answered invite looks like from the database's side. The age check
  -- keeps two week-old accounts from minting each other catalysts.
  select u.created_at into requester_since from auth.users u where u.id = new.requester_id;
  select u.created_at into addressee_since from auth.users u where u.id = new.addressee_id;
  if requester_since > now() - interval '7 days'
     and addressee_since < requester_since then
    perform public.award_badge(new.addressee_id, 'catalyst');
  end if;

  return new;
end;
$$;

drop trigger if exists badge_on_friend_request on public.friendships;
create trigger badge_on_friend_request
  after insert on public.friendships
  for each row execute function public.badge_on_friend_request();

-- ---------------------------------------------------------------------------
-- well_connected: the moment a third friendship is accepted
-- ---------------------------------------------------------------------------
create or replace function public.badge_on_friend_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  person uuid;
  n int;
begin
  if new.status <> 'accepted' or old.status = 'accepted' then
    return new;
  end if;
  -- Both sides just gained a friend, so both counts may have crossed three.
  foreach person in array array[new.requester_id, new.addressee_id] loop
    select count(*) into n
      from public.friendships f
     where f.status = 'accepted'
       and person in (f.requester_id, f.addressee_id);
    if n >= 3 then
      perform public.award_badge(person, 'well_connected');
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists badge_on_friend_accept on public.friendships;
create trigger badge_on_friend_accept
  after update on public.friendships
  for each row execute function public.badge_on_friend_accept();

-- ---------------------------------------------------------------------------
-- copilot: the moment a trip is shown to friends
-- ---------------------------------------------------------------------------
-- UPDATE only, deliberately: every trip is created private (011's default),
-- so showing one is always a visibility flip. The friend check means setting
-- a trip to 'friends' with nobody to see it earns nothing yet; flipping it
-- again once a friend exists does, which is the honest reading of "a friend
-- can follow your plan".
create or replace function public.badge_on_trip_shown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visibility = 'friends'
     and new.visibility is distinct from old.visibility
     and exists (
       select 1 from public.friendships f
        where f.status = 'accepted'
          and new.user_id in (f.requester_id, f.addressee_id)
     ) then
    perform public.award_badge(new.user_id, 'copilot');
  end if;
  return new;
end;
$$;

drop trigger if exists badge_on_trip_shown on public.trip_plans;
create trigger badge_on_trip_shown
  after update of visibility on public.trip_plans
  for each row execute function public.badge_on_trip_shown();

-- ---------------------------------------------------------------------------
-- local_guide: the moment a share link is opened by somebody else
-- ---------------------------------------------------------------------------
-- Volatile on purpose (it writes), which is why it is not folded into
-- get_shared_trip. Only a token that would actually open a trip counts, the
-- same liveness test 009's reader applies, and the owner opening their own
-- link proves nothing about anybody else reading it.
create or replace function public.shared_trip_opened(share_token uuid)
returns void
language plpgsql
volatile
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
  if auth.uid() is not null and auth.uid() = s.owner_id then
    return;
  end if;
  perform public.award_badge(s.owner_id, 'local_guide');
end;
$$;

revoke all on function public.shared_trip_opened(uuid) from public;
grant execute on function public.shared_trip_opened(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  n int;
begin
  -- Exactly one policy, and it only reads.
  select count(*) into n
    from pg_policies
   where schemaname = 'public' and tablename = 'user_achievements';
  if n <> 1 then
    raise exception 'user_achievements has % policies, expected exactly the select-own one', n;
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'user_achievements' and cmd = 'SELECT'
  ) then
    raise exception 'the one policy on user_achievements is not a select policy';
  end if;

  -- No client role can write the ledger. If one can, a badge is a checkbox.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'user_achievements'
       and grantee in ('anon', 'authenticated')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'a client role can write user_achievements directly';
  end if;

  -- And no client role can call the writer.
  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_schema = 'public' and routine_name = 'award_badge'
       and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then
    raise exception 'a client role can execute award_badge';
  end if;

  -- The open-recorder is callable by both client roles, or no open would ever
  -- be recorded: share links work signed out, and that is their point.
  if not exists (
    select 1 from information_schema.role_routine_grants
     where routine_schema = 'public' and routine_name = 'shared_trip_opened'
       and grantee = 'anon' and privilege_type = 'EXECUTE'
  ) or not exists (
    select 1 from information_schema.role_routine_grants
     where routine_schema = 'public' and routine_name = 'shared_trip_opened'
       and grantee = 'authenticated' and privilege_type = 'EXECUTE'
  ) then
    raise exception 'shared_trip_opened is not callable by both client roles';
  end if;

  -- All three triggers stand.
  select count(*) into n
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal
     and t.tgname in ('badge_on_friend_request', 'badge_on_friend_accept', 'badge_on_trip_shown');
  if n <> 3 then
    raise exception 'expected 3 badge triggers, found %', n;
  end if;

  -- Every function on the award path runs as its owner, or the caller's
  -- missing grants (correctly) break it.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('award_badge', 'badge_on_friend_request',
                       'badge_on_friend_accept', 'badge_on_trip_shown',
                       'shared_trip_opened')
     and not p.prosecdef;
  if n <> 0 then
    raise exception '% badge function(s) are not security definer', n;
  end if;

  raise notice 'achievements self-check passed';
end;
$$;
