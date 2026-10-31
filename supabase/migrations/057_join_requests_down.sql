-- 057_join_requests_down.sql
--
-- *** DOWN MIGRATION FOR 057, APPLIED BY THE OWNER ONLY TO ROLL BACK T939. ***
-- Paste in the Supabase SQL editor. One way: every pending "Ask to join"
-- request is deleted. Requests already accepted stay as co-planners in
-- trip_collaborators (020), which this file does not touch; the owner or
-- the co-planner removes them there as before. The app keeps working: a
-- missing table hides the Ask to join button.

drop function if exists public.list_join_requests();
drop function if exists public.answer_join_request(uuid, boolean);
drop function if exists public.ask_to_join(uuid);
drop table if exists public.trip_join_requests;
