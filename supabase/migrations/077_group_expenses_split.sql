-- 077_group_expenses_split.sql
--
-- *** SCHEMA MIGRATION, APPLIED BY THE OWNER (G15, Uitgaven and Reiskas). ***
-- Paste in the Supabase SQL editor AFTER 058 (it extends 058's
-- group_trip_expenses). Never `db push` against ntssxktaduxzpsmejwyv.
-- Pasting twice is safe. Look for "group expenses split self-check passed".
-- The way back is 077_group_expenses_split_down.sql.
--
-- WHY. 058 split every expense equally among `split_among`, in euro, with
-- a description only, and nothing could be corrected in place. The
-- Uitgaven page (decision .work/2026-11-21-spend-capture/decision.md)
-- splits per person, keeps the currency a spend was paid in, has four
-- categories, edits a spend, and merges spends by a client id so a phone
-- that logged offline never writes one twice. Phase 1 runs on one phone
-- (the trip's extras); this file is what a shared Reiskas (phase 2, join
-- by link) writes to.
--
-- WHAT IT ADDS to group_trip_expenses (every column nullable or defaulted,
-- so 058's rows and 058's client keep working unchanged):
--
--   shares        jsonb   { "<member uid>": cents } summing to amount_cents,
--                         its keys inside split_among. Null means the old
--                         equal split, which is how an old row still reads.
--   currency      text    the ISO code the spend was paid in (default EUR)
--   amount_orig   numeric the amount in that currency
--   rate          numeric euro per unit of that currency when logged
--   category      text    food, transport, activities or other
--   client_id     text    the row id the phone made; unique per group, so a
--                         retried insert lands once (upsert on it)
--   spent_on      date    the day of the trip it was spent
--   updated_at    timestamptz
--
-- WHO MAY CHANGE WHAT. 058 revoked UPDATE. This grants UPDATE on the split
-- and the descriptive columns only (never group_id, paid_by, created_by or
-- created_at), and a policy lets only the row's writer, or the group's
-- owner, update it, with the same membership checks as an insert.

alter table public.group_trip_expenses
  add column if not exists shares      jsonb,
  add column if not exists currency    text not null default 'EUR',
  add column if not exists amount_orig numeric(12, 2),
  add column if not exists rate        numeric(14, 8),
  add column if not exists category    text,
  add column if not exists client_id   text,
  add column if not exists spent_on    date,
  add column if not exists updated_at  timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'group_trip_expenses_currency_check') then
    alter table public.group_trip_expenses add constraint group_trip_expenses_currency_check
      check (currency ~ '^[A-Z]{3}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'group_trip_expenses_category_check') then
    alter table public.group_trip_expenses add constraint group_trip_expenses_category_check
      check (category is null or category in ('food', 'transport', 'activities', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'group_trip_expenses_client_id_check') then
    alter table public.group_trip_expenses add constraint group_trip_expenses_client_id_check
      check (client_id is null or char_length(client_id) between 1 and 64);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'group_trip_expenses_orig_check') then
    alter table public.group_trip_expenses add constraint group_trip_expenses_orig_check
      check ((amount_orig is null or amount_orig > 0) and (rate is null or rate > 0));
  end if;
end;
$$;

create unique index if not exists group_trip_expenses_client_idx
  on public.group_trip_expenses (group_id, client_id) where client_id is not null;

-- A split is whole cents per member, inside split_among, adding up to the
-- amount. Immutable and pure, so it can sit in a check constraint.
create or replace function public.group_shares_ok(shares jsonb, among uuid[], amount integer)
returns boolean
language sql
immutable
set search_path = public
as $$
  -- CASE, not AND: SQL does not promise to test the type before jsonb_each.
  select case
    when shares is null then true
    when jsonb_typeof(shares) <> 'object' then false
    else not exists (
      select 1 from jsonb_each(shares) as s(k, v)
       where case
         when jsonb_typeof(v) <> 'number' then true
         when (v #>> '{}')::numeric <> floor((v #>> '{}')::numeric) or (v #>> '{}')::numeric < 0 then true
         when k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
         else not (k::uuid = any(among))
       end
    )
    and coalesce((select sum(case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric end)
                    from jsonb_each(shares) as s(k, v)), 0) = amount
  end;
$$;
revoke all on function public.group_shares_ok(jsonb, uuid[], integer) from public, anon;
grant execute on function public.group_shares_ok(jsonb, uuid[], integer) to authenticated;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'group_trip_expenses_shares_check') then
    alter table public.group_trip_expenses add constraint group_trip_expenses_shares_check
      check (public.group_shares_ok(shares, split_among, amount_cents));
  end if;
end;
$$;

-- Editing a spend: the columns a correction may touch, and nothing else.
revoke update on public.group_trip_expenses from authenticated, anon;
grant update (amount_cents, description, split_among, shares, currency, amount_orig, rate, category, spent_on, updated_at)
  on public.group_trip_expenses to authenticated;

drop policy if exists "group_expenses_update" on public.group_trip_expenses;
create policy "group_expenses_update" on public.group_trip_expenses
  for update using (
    (select public.group_role(group_id)) in ('owner', 'joined')
    and (created_by = auth.uid() or (select public.group_role(group_id)) = 'owner')
  ) with check (
    (select public.group_role(group_id)) in ('owner', 'joined')
    and (created_by = auth.uid() or (select public.group_role(group_id)) = 'owner')
    and (select public.group_all_joined(group_id, split_among))
  );

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'group_trip_expenses' and policyname = 'group_expenses_update'
  ) then
    raise exception 'the update policy is missing';
  end if;
  -- Only the listed columns are updatable: never who paid or who wrote it.
  if has_column_privilege('authenticated', 'public.group_trip_expenses', 'paid_by', 'UPDATE')
     or has_column_privilege('authenticated', 'public.group_trip_expenses', 'created_by', 'UPDATE')
     or has_column_privilege('authenticated', 'public.group_trip_expenses', 'group_id', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.group_trip_expenses', 'shares', 'UPDATE') then
    raise exception 'the column-level update grant is wrong';
  end if;
  if public.group_shares_ok('{"00000000-0000-0000-0000-000000000001": 5}'::jsonb, array['00000000-0000-0000-0000-000000000001'::uuid], 6) then
    raise exception 'a split that does not add up passed the check';
  end if;
  if not public.group_shares_ok('{"00000000-0000-0000-0000-000000000001": 6}'::jsonb, array['00000000-0000-0000-0000-000000000001'::uuid], 6) then
    raise exception 'a split that adds up failed the check';
  end if;
  raise notice 'group expenses split self-check passed';
end;
$$;

notify pgrst, 'reload schema';
