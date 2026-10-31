-- 058_group_expenses_down.sql
--
-- *** DOWN MIGRATION FOR 058, APPLIED BY THE OWNER ONLY TO ROLL BACK T940. ***
-- Paste in the Supabase SQL editor. One way: every logged group expense,
-- every "Mark as paid" and every payment link is deleted. No money was ever
-- moved by Carta, so nothing outside these tables changes. The app keeps
-- working: a missing table hides Settle up.
--
-- Run it BEFORE 055_group_trips_down.sql if both are rolled back (the
-- ledgers point at group_trips).

drop function if exists public.group_pay_links(uuid);
drop table if exists public.group_trip_settlements;
drop table if exists public.group_trip_expenses;
drop table if exists public.pay_links;
drop function if exists public.group_all_joined(uuid, uuid[]);
