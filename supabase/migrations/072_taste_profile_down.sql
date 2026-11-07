-- Down for 072_taste_profile.sql (T1152, ROADMAP F3). Paste in the SQL editor.
-- ONE-WAY FOR THE DATA: the taste rows in account_things and the counts go.
-- Every device keeps its own verdicts in local storage (carta.taste.v1), so
-- nothing a traveller sees on a device they used is lost. The app needs no
-- rollback to survive this: the taste sync gets 23514 and turns itself off,
-- and taste_tick is fire and forget.

drop function if exists public.admin_taste_weekly(int);
drop function if exists public.taste_tick(text, text, int);
drop table if exists public.taste_counts;
drop table if exists public.taste_daily_total;

delete from public.account_things where kind = 'taste';
alter table public.account_things drop constraint if exists account_things_kind_check;
alter table public.account_things add constraint account_things_kind_check
  check (kind in ('kept', 'journey', 'trip', 'device_trip'));

notify pgrst, 'reload schema';
