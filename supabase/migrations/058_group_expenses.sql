-- 058_group_expenses.sql
--
-- *** SCHEMA MIGRATION, APPLIED BY THE OWNER (T940). ***
-- Paste in the Supabase SQL editor AFTER 055 (it needs 055's group_trips,
-- group_trip_members and group_role) and after 057. Never `db push`
-- against ntssxktaduxzpsmejwyv. Pasting twice is safe. Look for
-- "group expenses self-check passed". The way back is
-- 058_group_expenses_down.sql.
--
-- Settle up (T940, the Together page): the members of a group trip log
-- what they paid for the group, see who owes whom in the fewest transfers
-- (worked out in the browser by src/together/settle.js), pay each other
-- OUTSIDE Carta (Tikkie, bunq.me, a Revolut link) and mark a transfer as
-- paid. Carta never moves money and never holds a card.
--
-- WHAT IT ADDS
--
--   group_trip_expenses     one row per expense: who paid, the amount in
--                           euro cents, a short description, and the joined
--                           members it is split among, equally.
--   group_trip_settlements  one row per "Mark as paid": who paid whom and
--                           how much, in euro cents.
--   pay_links               one row per account: a payment link (an https
--                           address) the account chose to show the members
--                           of its group trips. Nobody else can read it.
--   group_pay_links(g)      SECURITY DEFINER. The payment links of the
--                           joined members of group g, for a joined member
--                           of g only.
--
-- WHO SEES WHAT. Every row of the two ledgers is readable and writable only
-- by the group's owner and joined members (055's group_role). A payer, a
-- payee and everyone an expense is split among must be joined members. An
-- expense or a settlement is removed by whoever wrote it (or the group's
-- owner); nothing is updated in place, so the ledger is what was written.
--
-- THE APP WITHOUT THIS FILE. src/auth/groupExpenses.js answers
-- `{ missing: true }` for a missing table or function, and the group page
-- draws no Settle up.

create table if not exists public.group_trip_expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.group_trips(id) on delete cascade,
  paid_by      uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null check (amount_cents between 1 and 10000000),
  description  text not null default '' check (char_length(description) <= 80),
  split_among  uuid[] not null check (cardinality(split_among) between 1 and 50),
  created_by   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now()
);
create index if not exists group_trip_expenses_group_idx on public.group_trip_expenses (group_id);

create table if not exists public.group_trip_settlements (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.group_trips(id) on delete cascade,
  from_user    uuid not null references auth.users(id) on delete cascade,
  to_user      uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null check (amount_cents between 1 and 10000000),
  created_by   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  check (from_user <> to_user)
);
create index if not exists group_trip_settlements_group_idx on public.group_trip_settlements (group_id);

create table if not exists public.pay_links (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  url        text not null check (url ~ '^https://[A-Za-z0-9.-]+(/[^[:space:]<>"]*)?$' and char_length(url) <= 300),
  updated_at timestamptz not null default now()
);

-- Whether every id is a joined member (or the owner) of group g. SECURITY
-- DEFINER so a policy can ask it without re-entering 055's member policies.
create or replace function public.group_all_joined(g uuid, ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(cardinality(ids), 0) > 0 and not exists (
    select 1 from unnest(ids) as x(id)
     where not exists (
       select 1 from public.group_trip_members m
        where m.group_id = g and m.user_id = x.id and m.status = 'joined'
     )
  );
$$;
revoke all on function public.group_all_joined(uuid, uuid[]) from public, anon;
grant execute on function public.group_all_joined(uuid, uuid[]) to authenticated;

alter table public.group_trip_expenses    enable row level security;
alter table public.group_trip_settlements enable row level security;
alter table public.pay_links              enable row level security;

-- group_trip_expenses: the group's members only.
drop policy if exists "group_expenses_select" on public.group_trip_expenses;
create policy "group_expenses_select" on public.group_trip_expenses
  for select using ((select public.group_role(group_id)) in ('owner', 'joined'));
drop policy if exists "group_expenses_insert" on public.group_trip_expenses;
create policy "group_expenses_insert" on public.group_trip_expenses
  for insert with check (
    created_by = auth.uid()
    and (select public.group_role(group_id)) in ('owner', 'joined')
    and (select public.group_all_joined(group_id, array[paid_by]))
    and (select public.group_all_joined(group_id, split_among))
  );
drop policy if exists "group_expenses_delete" on public.group_trip_expenses;
create policy "group_expenses_delete" on public.group_trip_expenses
  for delete using (
    (select public.group_role(group_id)) in ('owner', 'joined')
    and (created_by = auth.uid() or (select public.group_role(group_id)) = 'owner')
  );
revoke update on public.group_trip_expenses from authenticated, anon;

-- group_trip_settlements: the group's members only; a transfer is marked
-- paid by one of the two people in it.
drop policy if exists "group_settlements_select" on public.group_trip_settlements;
create policy "group_settlements_select" on public.group_trip_settlements
  for select using ((select public.group_role(group_id)) in ('owner', 'joined'));
drop policy if exists "group_settlements_insert" on public.group_trip_settlements;
create policy "group_settlements_insert" on public.group_trip_settlements
  for insert with check (
    created_by = auth.uid()
    and auth.uid() in (from_user, to_user)
    and (select public.group_role(group_id)) in ('owner', 'joined')
    and (select public.group_all_joined(group_id, array[from_user, to_user]))
  );
drop policy if exists "group_settlements_delete" on public.group_trip_settlements;
create policy "group_settlements_delete" on public.group_trip_settlements
  for delete using (
    created_by = auth.uid()
    and (select public.group_role(group_id)) in ('owner', 'joined')
  );
revoke update on public.group_trip_settlements from authenticated, anon;

-- pay_links: your own row, in every direction. Group members read it only
-- through group_pay_links().
drop policy if exists "pay_links_select_own" on public.pay_links;
create policy "pay_links_select_own" on public.pay_links
  for select using (user_id = auth.uid());
drop policy if exists "pay_links_insert_own" on public.pay_links;
create policy "pay_links_insert_own" on public.pay_links
  for insert with check (user_id = auth.uid());
drop policy if exists "pay_links_update_own" on public.pay_links;
create policy "pay_links_update_own" on public.pay_links
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "pay_links_delete_own" on public.pay_links;
create policy "pay_links_delete_own" on public.pay_links
  for delete using (user_id = auth.uid());

create or replace function public.group_pay_links(g uuid)
returns table (user_id uuid, url text)
language sql
stable
security definer
set search_path = public
as $$
  select l.user_id, l.url
    from public.pay_links l
    join public.group_trip_members m on m.user_id = l.user_id and m.group_id = g and m.status = 'joined'
   where public.group_role(g) in ('owner', 'joined');
$$;
revoke all on function public.group_pay_links(uuid) from public, anon;
grant execute on function public.group_pay_links(uuid) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['group_trip_expenses', 'group_trip_settlements', 'pay_links'] loop
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t and rowsecurity) then
      raise exception 'row level security is off on %', t;
    end if;
  end loop;
  -- The ledgers are read by the group's members and nobody else.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename in ('group_trip_expenses', 'group_trip_settlements')
       and cmd = 'SELECT' and qual not like '%group_role%'
  ) then
    raise exception 'the group ledgers must be readable by the group''s members only';
  end if;
  -- A payment link is read by its owner only; members go through the function.
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'pay_links' and cmd = 'SELECT') <> 1
     or not exists (
       select 1 from pg_policies
        where schemaname = 'public' and tablename = 'pay_links' and cmd = 'SELECT'
          and qual like '%user_id = auth.uid()%'
     ) then
    raise exception 'pay_links must be readable by its owner only';
  end if;
  raise notice 'group expenses self-check passed';
end;
$$;
