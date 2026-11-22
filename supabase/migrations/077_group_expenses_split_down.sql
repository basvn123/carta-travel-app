-- Down for 077_group_expenses_split.sql (G15). Paste in the SQL editor.
-- ONE-WAY FOR THE DATA: the per-person shares, the original currency and
-- amount, the category, the client id and the day are dropped. Each row
-- keeps its euro amount and split_among, so it reads as 058's equal split.
-- Rows written after 077 that were split unevenly lose that split. The
-- app's phase 1 does not write here (its kas lives in the trip extras),
-- so before phase 2 nothing is lost.

drop policy if exists "group_expenses_update" on public.group_trip_expenses;
revoke update on public.group_trip_expenses from authenticated, anon;

alter table public.group_trip_expenses drop constraint if exists group_trip_expenses_shares_check;
alter table public.group_trip_expenses drop constraint if exists group_trip_expenses_orig_check;
alter table public.group_trip_expenses drop constraint if exists group_trip_expenses_client_id_check;
alter table public.group_trip_expenses drop constraint if exists group_trip_expenses_category_check;
alter table public.group_trip_expenses drop constraint if exists group_trip_expenses_currency_check;
drop index if exists public.group_trip_expenses_client_idx;
drop function if exists public.group_shares_ok(jsonb, uuid[], integer);

alter table public.group_trip_expenses
  drop column if exists updated_at,
  drop column if exists spent_on,
  drop column if exists client_id,
  drop column if exists category,
  drop column if exists rate,
  drop column if exists amount_orig,
  drop column if exists currency,
  drop column if exists shares;

notify pgrst, 'reload schema';
