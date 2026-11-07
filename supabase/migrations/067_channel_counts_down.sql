-- Down for 067_channel_counts.sql (T1109, K12).
drop function if exists public.admin_channel_weekly(int);
drop function if exists public.channel_visit(text, text);
drop table if exists public.channel_counts;
drop table if exists public.channel_daily_total;
