-- 056_friend_visibility_down.sql
--
-- *** DOWN MIGRATION FOR 056, APPLIED BY THE OWNER ONLY TO ROLL BACK T932. ***
-- Paste in the Supabase SQL editor. Every account's "Friends see" switches
-- are deleted (one way); friends then see only what list_friend_trips shows.
-- Blocks already written stay blocked rows in friendships, as 011 defines.

drop function if exists public.block_friend_link(uuid);
drop function if exists public.list_friend_shares();
drop table if exists public.friend_visibility;
