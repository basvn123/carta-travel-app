-- Down for 070_funnel_counts.sql (T1129, I11).
drop function if exists public.admin_funnel_weekly(int);
drop function if exists public.funnel_step(text);
drop table if exists public.funnel_counts;
drop table if exists public.funnel_daily_total;
