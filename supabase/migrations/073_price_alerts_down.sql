-- 073_price_alerts_down.sql
--
-- *** DOWN MIGRATION FOR 073, APPLIED BY THE OWNER ONLY TO ROLL BACK T1205. ***
-- Paste in the Supabase SQL editor. ONE-WAY FOR THE DATA: the saved alerts
-- and the consent records go with the tables. Export first if they matter:
--   select * from public.price_alerts;
--   select * from public.price_alert_consent;
-- The app needs no rollback to survive this: lib/priceAlerts.js treats a
-- missing table or function as "not available" and the alert button hides.

drop function if exists public.price_alert_save(text, text, text, jsonb, numeric, text, text);
drop function if exists public.price_alert_optin_claim(uuid);
drop function if exists public.price_alert_optin_unclaim(uuid);
drop function if exists public.price_alert_confirm(uuid);
drop function if exists public.price_alert_unsubscribe(uuid);
drop function if exists public.price_alerts_open();
drop function if exists public.price_alert_record(uuid, int);
drop function if exists public.price_alert_release(uuid);
drop function if exists public.price_alert_mail(uuid);
drop function if exists public.price_alert_purge();
drop table if exists public.price_alerts;
drop table if exists public.price_alert_consent;

notify pgrst, 'reload schema';

do $$
begin
  if to_regclass('public.price_alerts') is not null or to_regclass('public.price_alert_consent') is not null then
    raise exception 'the price alert tables are still there';
  end if;
  raise notice 'price alerts down done';
end $$;
