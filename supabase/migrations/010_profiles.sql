-- Profiles: the thing that has to exist before anything social can.
--
-- WHY THIS IS NEEDED AT ALL. Today one account cannot learn another account's
-- name. auth.users is not readable from the client, and user_metadata.full_name
-- is visible only to its owner. So there is currently no way to address another
-- person in this product, which is why friends (migration 011) cannot be built
-- until this lands. Nothing here is social by itself.
--
-- WHY A HANDLE AND NOT AN EMAIL. Finding people by email address turns the
-- database into an oracle that answers "does this person have a Carta
-- account", for any address anybody cares to try. A handle is a name its owner
-- chose to be findable by, which is a different thing, and it is the only
-- lookup this migration provides. There is deliberately no prefix search and
-- no listing: find_profile_by_handle takes one exact handle and returns at
-- most one row, and it is granted to `authenticated` only, so the lookup is
-- not open to the world the way get_shared_trip deliberately is.
--
-- WHAT IS STILL PRIVATE. Table-level select stays SELF ONLY in this migration.
-- Migration 011 widens it to accepted friends. Until then the only way to see
-- another profile is to already know the exact handle.
--
-- Apply in the Supabase SQL editor. Live project policy: never `db push`
-- against ntssxktaduxzpsmejwyv; paste this file there by hand.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- The profile
-- ---------------------------------------------------------------------------
-- Deliberately thin. Everything here is meant to be seen by somebody else, so
-- anything that is not is not allowed in: no email, no location, no counts.
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  handle       text not null unique
               check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text check (display_name is null or length(display_name) <= 60),
  -- One or two emoji, standing in for an avatar. No uploads: a photograph of a
  -- person is the one thing here that would need moderating.
  avatar_emoji text check (avatar_emoji is null or length(avatar_emoji) <= 8),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Self only for now. Migration 011 adds the accepted-friends arm.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = user_id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Handing out a handle
-- ---------------------------------------------------------------------------
-- Names the product needs for itself, or that would let somebody pose as it.
-- Small on purpose: a long blocklist is a maintenance burden that buys very
-- little, and the real defence against impersonation is that nobody can find
-- you unless you told them your handle.
create or replace function public.handle_reserved(candidate text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select candidate in (
    'carta', 'admin', 'administrator', 'support', 'help', 'root', 'system',
    'official', 'staff', 'team', 'api', 'www', 'null', 'undefined', 'me', 'you'
  );
$$;

-- A seed (normally the email local part) folded into something legal. Anything
-- outside [a-z0-9_] is dropped rather than transliterated: a handle is an
-- identifier, and a traveller with a non-Latin name deserves a real choice
-- rather than a mangled guess, so a seed that folds to nothing simply gets a
-- neutral handle they can change.
create or replace function public.fold_handle(seed text)
returns text
language sql
immutable
set search_path = public
as $$
  select left(regexp_replace(lower(coalesce(seed, '')), '[^a-z0-9_]', '', 'g'), 24);
$$;

-- The first free handle based on a seed. Suffixes with a number on collision,
-- and falls back to a random one when the seed is unusable or exhausted.
create or replace function public.claim_handle(seed text)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  base      text := public.fold_handle(seed);
  candidate text;
  n         int := 0;
begin
  if length(base) < 3 or public.handle_reserved(base) then
    base := 'traveller';
  end if;

  loop
    candidate := case when n = 0 then base else left(base, 24 - length(n::text)) || n::text end;
    exit when not exists (select 1 from public.profiles p where p.handle = candidate)
              and not public.handle_reserved(candidate);
    n := n + 1;
    -- A seed this contested is not worth another thousand probes; give this
    -- account a handle nobody is competing for and let them rename it.
    if n > 500 then
      return 'traveller_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    end if;
  end loop;

  return candidate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Every account gets one, with no step for anybody to forget
-- ---------------------------------------------------------------------------
-- security definer because the trigger runs as the inserting role during
-- signup, which has no business writing to public.profiles directly.
--
-- The exception handler is not defensive padding: this trigger sits on the
-- signup path, so a failure here would stop somebody creating an account at
-- all. A missing profile is a small, repairable problem; a signup that returns
-- an error is not.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (user_id, handle, display_name)
    values (
      new.id,
      public.claim_handle(split_part(coalesce(new.email, ''), '@', 1)),
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
    )
    on conflict (user_id) do nothing;
  exception when others then
    raise warning 'could not seed a profile for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts that existed before this migration. Row by row rather than one
-- INSERT ... SELECT, because claim_handle has to see each handle it just
-- issued in order to avoid colliding with it.
do $$
declare
  u record;
  made int := 0;
begin
  for u in
    select au.id, au.email, au.raw_user_meta_data
      from auth.users au
      left join public.profiles p on p.user_id = au.id
     where p.user_id is null
  loop
    insert into public.profiles (user_id, handle, display_name)
    values (
      u.id,
      public.claim_handle(split_part(coalesce(u.email, ''), '@', 1)),
      nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), '')
    )
    on conflict (user_id) do nothing;
    made := made + 1;
  end loop;
  raise notice 'backfilled % profile(s)', made;
end;
$$;

-- ---------------------------------------------------------------------------
-- The one lookup
-- ---------------------------------------------------------------------------
-- Exact match, one row, signed-in callers only. No prefix search and no
-- listing, so this cannot be walked to enumerate the user base; the most it
-- will confirm is whether one handle somebody already typed is taken, which is
-- the minimum any handle system has to admit.
--
-- Returns user_id because that is what a friend request in migration 011 has
-- to be addressed to. It is an opaque identifier, not a credential: knowing it
-- grants nothing, since every table is gated on auth.uid().
create or replace function public.find_profile_by_handle(wanted text)
returns table (
  user_id      uuid,
  handle       text,
  display_name text,
  avatar_emoji text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.handle, p.display_name, p.avatar_emoji
    from public.profiles p
   where p.handle = lower(trim(coalesce(wanted, '')))
     and auth.uid() is not null
   limit 1;
$$;

revoke all on function public.find_profile_by_handle(text) from public, anon;
grant execute on function public.find_profile_by_handle(text) to authenticated;
revoke all on function public.claim_handle(text) from public, anon, authenticated;
revoke all on function public.fold_handle(text) from public, anon, authenticated;
revoke all on function public.handle_reserved(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Self-check: runs on apply
-- ---------------------------------------------------------------------------
do $$
declare
  n int;
begin
  -- Folding behaves, including the cases a real signup will produce.
  if public.fold_handle('Bas.Van_Nieuwenhuyse123') <> 'basvan_nieuwenhuyse123' then
    raise exception 'fold_handle mangled a normal seed: %', public.fold_handle('Bas.Van_Nieuwenhuyse123');
  end if;
  if public.fold_handle('...') <> '' then
    raise exception 'fold_handle let punctuation through';
  end if;
  if length(public.fold_handle(repeat('a', 90))) <> 24 then
    raise exception 'fold_handle did not clamp a long seed';
  end if;

  -- A seed that folds to nothing, or to something reserved, still yields a
  -- legal handle rather than failing the signup that produced it.
  if public.claim_handle('') !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'claim_handle returned an illegal handle for an empty seed';
  end if;
  if public.claim_handle('admin') = 'admin' then
    raise exception 'claim_handle handed out a reserved handle';
  end if;

  -- Every account has exactly one profile, and every handle is legal.
  select count(*) into n from auth.users au
    left join public.profiles p on p.user_id = au.id where p.user_id is null;
  if n > 0 then
    raise exception '% account(s) still have no profile', n;
  end if;
  select count(*) into n from public.profiles p where p.handle !~ '^[a-z0-9_]{3,24}$';
  if n > 0 then
    raise exception '% profile(s) carry an illegal handle', n;
  end if;

  raise notice 'profiles self-check passed';
end;
$$;
