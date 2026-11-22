-- 076, G12 (My trips redesign, decision 6, Volgen): followed prices.
-- The down migration is 076_account_things_watch_down.sql. Apply by pasting
-- in the SQL editor after 075. Never applied live by the session that wrote it.
--
-- account_things (065) takes a sixth kind, 'watch': one row per followed
-- stay, flight or place day ({ id, kind, ref, label, placeKey, unitNote,
-- source, pts: [{ at, eur }], alert, at }; stop following is a tombstone).
-- Same owner-only RLS, cap and size check as the other kinds, so it cascades
-- on account delete and is in export_user_data (069) as accountThings.
-- Before this file the app's watch sync (src/lib/watchStore.js) gets 23514
-- for 'watch' and turns itself off; the item stays on the device and the
-- other kinds keep syncing.

alter table public.account_things drop constraint if exists account_things_kind_check;
alter table public.account_things add constraint account_things_kind_check
  check (kind in ('kept', 'journey', 'trip', 'device_trip', 'taste', 'watch'));

notify pgrst, 'reload schema';
