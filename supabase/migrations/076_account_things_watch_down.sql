-- Down for 076_account_things_watch.sql (G12, Volgen). Paste in the SQL editor.
-- ONE-WAY FOR THE DATA: the watch rows in account_things go. Every device
-- keeps its own followed prices in local storage (carta.watch.v1), so nothing
-- a traveller sees on a device they used is lost. The app needs no rollback
-- to survive this: the watch sync gets 23514 and turns itself off.

delete from public.account_things where kind = 'watch';
alter table public.account_things drop constraint if exists account_things_kind_check;
alter table public.account_things add constraint account_things_kind_check
  check (kind in ('kept', 'journey', 'trip', 'device_trip', 'taste'));

notify pgrst, 'reload schema';
