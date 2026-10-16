-- Throwaway-database test of 052_coplan_links.sql (T434). NEVER run against the
-- live project: it creates and drops a database named t052. Run with psql from
-- the repo root on a scratch cluster, e.g. port 55433:
--   psql -h 127.0.0.1 -p 55433 -U postgres -d postgres -f supabase/diagnostics/052_coplan_links_test.sql
-- Expect "T052 scenario passed" and "down ok, collaborators kept: 1".
-- Throwaway test of 052_coplan_links.sql against stubs of auth, 002, 011, 020.
\set ON_ERROR_STOP 1
drop database if exists t052;
create database t052;
\c t052
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
create table public.trip_plans (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), label text);
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id), addressee_id uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending','accepted','blocked')),
  created_at timestamptz not null default now(), responded_at timestamptz, check (requester_id <> addressee_id));
create unique index friendships_pair_uniq on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create table public.trip_collaborators (
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id), invited_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(), responded_at timestamptz,
  primary key (trip_plan_id, user_id), check (user_id <> invited_by));
grant usage on schema public to anon, authenticated;

\i supabase/migrations/052_coplan_links.sql
-- twice is safe
\i supabase/migrations/052_coplan_links.sql

insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222'), ('33333333-3333-4333-8333-333333333333');
insert into public.trip_plans (id, user_id, label) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Portugal');

create temp table out (k text, v text);
do $$
declare tok text; r record; n int;
begin
  -- owner makes a link
  perform set_config('test.uid', '11111111-1111-4111-8111-111111111111', true);
  select token into tok from public.create_coplan_link('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  if tok !~ '^[0-9a-f]{64}$' then raise exception 'bad token %', tok; end if;
  select count(*) into n from public.list_coplan_links('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  if n <> 1 then raise exception 'owner lists % links', n; end if;
  select status into r from public.accept_coplan_link(tok);
  if r.status <> 'own' then raise exception 'owner accept gave %', r.status; end if;

  -- someone else cannot make or list links on it
  perform set_config('test.uid', '22222222-2222-4222-8222-222222222222', true);
  begin perform public.create_coplan_link('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); raise exception 'stranger made a link';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.list_coplan_links('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  if n <> 0 then raise exception 'stranger lists % links', n; end if;
  if public.revoke_coplan_link(tok) then raise exception 'stranger revoked'; end if;

  -- guest joins: friend + co-planner, twice is idempotent
  select * into r from public.accept_coplan_link(tok);
  if r.status <> 'joined' or r.label <> 'Portugal' then raise exception 'join gave % %', r.status, r.label; end if;
  select * into r from public.accept_coplan_link(tok);
  if r.status <> 'joined' then raise exception 'second join gave %', r.status; end if;
  select count(*) into n from public.trip_collaborators where user_id = '22222222-2222-4222-8222-222222222222' and status = 'accepted';
  if n <> 1 then raise exception 'collaborator rows %', n; end if;
  select count(*) into n from public.friendships where status = 'accepted';
  if n <> 1 then raise exception 'friendships %', n; end if;

  -- a pending request between the two becomes accepted; a blocked one refuses
  insert into public.friendships (requester_id, addressee_id, status) values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'blocked');
  perform set_config('test.uid', '33333333-3333-4333-8333-333333333333', true);
  select * into r from public.accept_coplan_link(tok);
  if r.status <> 'blocked' then raise exception 'blocked gave %', r.status; end if;

  -- unknown token, revoked token
  select * into r from public.accept_coplan_link(repeat('0', 64));
  if r.status <> 'gone' then raise exception 'unknown gave %', r.status; end if;
  perform set_config('test.uid', '11111111-1111-4111-8111-111111111111', true);
  if not public.revoke_coplan_link(tok) then raise exception 'owner could not revoke'; end if;
  perform set_config('test.uid', '22222222-2222-4222-8222-222222222222', true);
  select * into r from public.accept_coplan_link(tok);
  if r.status <> 'gone' then raise exception 'revoked gave %', r.status; end if;

  -- five live links at most
  perform set_config('test.uid', '11111111-1111-4111-8111-111111111111', true);
  for i in 1..5 loop perform public.create_coplan_link('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); end loop;
  begin perform public.create_coplan_link('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); raise exception 'sixth link made';
  exception when raise_exception then if sqlerrm <> 'too_many_links' then raise; end if; end;

  -- rate limit: 20 tries an hour
  perform set_config('test.uid', '22222222-2222-4222-8222-222222222222', true);
  for i in 1..20 loop perform public.accept_coplan_link(repeat('1', 64)); end loop;
  select * into r from public.accept_coplan_link(repeat('1', 64));
  if r.status <> 'too_many' then raise exception 'rate limit gave %', r.status; end if;

  -- signed out
  perform set_config('test.uid', '', true);
  begin perform public.accept_coplan_link(tok); raise exception 'anon accepted';
  exception when insufficient_privilege then null; end;
  raise notice 'T052 scenario passed';
end $$;

-- down
drop function if exists public.accept_coplan_link(text);
drop function if exists public.revoke_coplan_link(text);
drop function if exists public.list_coplan_links(uuid);
drop function if exists public.create_coplan_link(uuid);
drop table if exists public.coplan_link_attempts;
drop table if exists public.coplan_links;
select 'down ok, collaborators kept: ' || count(*) from public.trip_collaborators;
