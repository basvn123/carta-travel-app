-- 078_circles_down.sql
--
-- *** DOWN MIGRATION FOR 078, APPLIED BY THE OWNER ONLY TO ROLL BACK G16. ***
-- Paste in the Supabase SQL editor. One way: every kring, proposal, vote,
-- date range and home airport is deleted. Trips a kring already made stay,
-- with their co-planners, because they live in trip_plans and
-- trip_collaborators. The app keeps working: a missing table hides the
-- Kringen section.

drop function if exists public.circle_people();
drop trigger if exists circle_availability_cap on public.circle_availability;
drop function if exists public.circle_availability_cap();
drop trigger if exists circles_owner_member on public.circles;
drop function if exists public.circles_owner_member();
drop table if exists public.circle_availability;
drop table if exists public.circle_votes;
drop table if exists public.circle_proposals;
drop table if exists public.circle_members;
drop table if exists public.circles;
drop function if exists public.circle_role(uuid);
