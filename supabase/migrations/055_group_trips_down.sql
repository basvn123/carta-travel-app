-- 055_group_trips_down.sql
--
-- *** DOWN MIGRATION FOR 055, APPLIED BY THE OWNER ONLY TO ROLL BACK T931. ***
-- Paste in the Supabase SQL editor. One way: every group trip, vote and
-- private budget is deleted. Trip plans a group already booked stay, with
-- their co-planners, because they live in trip_plans and trip_collaborators.
-- The app keeps working: a missing table hides the Group trips block.
-- If 058 (Settle up, T940) is applied, run 058_group_expenses_down.sql
-- first: its ledgers point at group_trips.

drop function if exists public.group_trip_people();
drop function if exists public.group_trip_band(uuid);
drop trigger if exists group_trips_owner_member on public.group_trips;
drop function if exists public.group_trips_owner_member();
drop table if exists public.group_trip_budgets;
drop table if exists public.group_trip_votes;
drop table if exists public.group_trip_options;
drop table if exists public.group_trip_members;
drop table if exists public.group_trips;
drop function if exists public.group_role(uuid);
