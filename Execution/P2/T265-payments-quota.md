# T265 payments and quota, SQL and functions

## Task ID

T265 (stage 9 group D1 of Execution/_OPEN-MASTER.md). Branch p2-d1-payments-quota in both repos.

## Date

2026-10-02

## What changed

One new migration, 044_payments_quota.sql, plus the two Stripe Edge Functions and a few app files, closing eleven of the thirteen D1 register rows.

A Year Pass holder who buys a Trip Pass now keeps tier year and the allowance they are inside, and gets 30 more days (T031-b, the first of the three candidates in the T031 report). No pass can end more than 1,095 days (three years) from now: grant_pass clamps to that, and a new service-role RPC, pass_can_buy, lets the checkout function refuse with 409 pass_max before Stripe charges for days the cap would take away (T031-c). The modal has a sentence for that refusal in all six locales.

A new table, ai_usage_days, records each granted AI unit by user, day and kind. ai_refund now takes the unit off the day it was spent, so a refund after midnight no longer eats into the next day's shared ceiling (T037-c). admin_margin prices the units spent inside the month instead of the whole allowance of a period that opened in it (T043-e).

pass_grants gains reason, fee_cents and fee_currency. The client sends the paywall gate reason to the checkout function, which puts it in the Stripe session metadata; the webhook writes it on the sale, and admin_paywall_funnel joins on it. The one-hour nearest-checkout estimate is now only a fallback for rows without a reason, and the RPC says which method it used (T034-c, attribution half). The webhook also expands the payment intent to its balance transaction and stores Stripe's real fee; admin_margin reports stripe.basis as charge, mixed or modelled, and the Margin admin panel words its Stripe line from that (T043-d).

A guard-free oss_threshold_check() writes one oss_alerts row per year once the cross-border EU figure passes site_config oss_warn_pct (default 70 percent). It schedules itself weekly (Monday 06:00 UTC) through pg_cron when the extension is on, and otherwise prints the one line to run. admin_oss_threshold returns the alerts so the later tile (T033-e) can draw them (T033-f).

044 pins plan_tiers.free back to 2 plans and its self-check refuses to pass otherwise, so it is the file to paste after any re-run of the 007 insert (T030-d). The pricing UI keeps reading src/lib/pricing.js; the false 007 claim is corrected in the table comment, and scripts/verify_plan_tiers.mjs fails when pricing.js and the migrations disagree (T030-c).

The expiry banner now opens the modal with reason 'expiring' through openPrices(reason), so the expiring gate has a call site, its heading shows, and verify_paywall_funnel.mjs passes (T034-b). `npm run test:quota` runs verify_plan_tiers, test_global_cap, test_ai_quota and the new test_passes, and the plan-day README says when to run it (T037-a).

Paste order. 044 cannot go before the stage 10 pastes as the session note suggested, because it redefines grant_pass, admin_paywall_funnel, admin_oss_threshold and admin_margin from 025, 026, 027 and 031 and refuses to run without them. It goes in stage 10.2 directly after 031, and before `supabase functions deploy checkout` and `stripe-webhook`. The webhook calls the twelve-argument grant_pass by name, and checkout calls pass_can_buy, so both functions must deploy after 044.

## Files touched

Root repo (wt/T265):

**Modified:**
- supabase/functions/checkout/index.ts (gate reason into session metadata, pass_can_buy before Stripe, 409 pass_max, 400 on bad_tier)
- supabase/functions/stripe-webhook/index.ts (reason from metadata, fee from the balance transaction, three new grant_pass arguments)
- supabase/functions/plan-day/README.md (when and how to run npm run test:quota)
- Execution/_OPEN.md (eleven rows closed, T265-a to T265-d added)

**Created:**
- supabase/migrations/044_payments_quota.sql
- Execution/P2/T265-payments-quota.md

App repo (wt/T265-app):

**Modified:**
- package.json (one script, test:quota; nothing else)
- src/hooks/usePaywall.jsx (openPrices takes an optional gate reason)
- src/components/AnnouncementBar.jsx (expiry banner opens 'expiring')
- src/components/PassModal.jsx (pass_max and quota_check codes)
- src/lib/checkout.js (sends the reason)
- src/components/admin/Margin.jsx (Stripe line and AI note read the new fields)
- src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js (pass.errMax)
- scripts/ai/test_ai_quota.mjs (chain to 044; the cross-day refund group now proves the fix instead of pinning the bug; two T042 pattern drifts fixed)
- scripts/ai/test_global_cap.mjs (chain to 044)
- scripts/verify_paywall_funnel.mjs (counts openPrices('x') as a call site)

**Created:**
- scripts/ai/test_passes.mjs (89 assertions: stacking, horizon, pass_can_buy, funnel join, margin fee basis and day ledger, OSS check)
- scripts/verify_plan_tiers.mjs

Every script that reads supabase/ honours CARTA_REPO_ROOT, because in a worktree pair the root checkout is a sibling and not the parent.

## Commands run

```
initdb -D <scratch>/pg -U postgres --pwfile=<pw> -A scram-sha-256 -E UTF8
pg_ctl -D <scratch>/pg -o "-p 55441" start
cd continent-app
PGPASSWORD=test PGPORT=55441 CARTA_REPO_ROOT=<root> npm run test:quota
CARTA_REPO_ROOT=<root> node scripts/verify_paywall_funnel.mjs
VITE_SUPABASE_URL=http://127.0.0.1:5999 VITE_SUPABASE_ANON_KEY=fake npx vite --port 5201
node <scratch>/shoot.cjs   (Playwright, 380 and 1280 wide)
pg_ctl -D <scratch>/pg stop
```

Nothing was pasted on the live project and nothing deployed.

## Config and secrets set

None. 044 reads an optional site_config key oss_warn_pct (default 70). The checkout function now also uses SUPABASE_SERVICE_ROLE_KEY, which the platform sets.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Year holder's tier after buying a Trip Pass | trip, 60 plans | year, 300 plans | kept |
| Ceiling on entitlements.expires_at | none | now + 1,095 days | capped |
| plan_tiers.free after a 007 re-run, then 044 | 3 | 2 | -1 |
| Refund after midnight debits | today's shared counter | the spend's own day | fixed |
| Funnel purchases attributed by join key | 0 percent | every sale with a reason | join |
| Stripe fee basis on admin_margin | modelled only | charge, mixed or modelled | observed |
| Gates in GATES with a call site | 8 of 9 | 9 of 9 | +1 |
| verify_paywall_funnel.mjs | fails | ok | |
| Quota and pass assertions run by one command | 0 (no script) | 267 (55 + 123 + 89) plus verify_plan_tiers | +267 |

All 267 assertions pass against PostgreSQL 18 on port 55441, with Part A executed, not skipped.

Browser check, 380 and 1280 wide, on the Vite dev server with a fake Supabase URL intercepted by Playwright: the pass modal opened with reason 'expiring' shows "Your pass is nearly up", pressing buy sends {"tier":"trip","reason":"expiring"} and a 409 pass_max shows the new sentence; the Margin panel with a mixed fee basis reads "2 observed from the charge, 1 modelled at 1.5% + EUR 0.25 in the EEA, all plus 0.5% tax". No horizontal scroll and no page errors at either width. The live banner and live admin page need a signed-in session and were exercised only through these components.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Two earlier sessions stopped before committing | usage limit, then a process exit | reviewed their uncommitted work line by line against 007, 021, 026, 027 and 031, kept it, committed early |
| test_ai_quota and test_global_cap pattern checks failed on plan-day | T042 put logging between the branch and the return | patterns allow the gap |
| A pass_can_buy bad_tier answer read as pass_max | one branch for every not-ok | 400 bad_tier first |
| verify_paywall.mjs fails in this worktree | it reads ../supabase and ignores CARTA_REPO_ROOT; passes in the main checkout | left alone (not named), raised T265-d |
| Vite took about five minutes to scan dependencies | node_modules and its .vite cache are shared with the main checkout and other sessions | waited; harness navigates on commit |

## What is still open

T037-d stays open. Real coverage of the Edge Functions needs Deno, which is not installed on this machine, and a harness that runs checkout, stripe-webhook and plan-day against a stub Supabase client. Installing a runtime is a tooling decision outside this task, so Part B and C of the tests remain source pattern checks and say so.

T035-c stays open. Closing it means a comment edit to applied migration 006, which the wave rules forbid. 044's header now carries the correction on record. The owner decides (T265-c).

T034-c is closed for attribution; the second half, a dismissal through a tab close or hard navigation, is still not recorded and is now its own row (T265-b).

The owner pastes 044 in stage 10.2 after 031 and before the two function deploys, and turns on pg_cron if the notice says it is off (T265-a). Until the webhook is deployed after 044, fee_cents and reason stay empty and the dashboards fall back to modelled and estimated figures, which they label.

The fee is read once, at checkout.session.completed. For a payment method that settles later the balance transaction may not exist yet; that sale is then modelled and counted under modelledRows. Not a row, since the fallback is labelled.

T032-d and T033-e (admin tiles) were not touched; they belong to wave 3.

Register rows: closed T031-b, T031-c, T030-d, T030-c, T037-c, T043-e, T034-b, T034-c, T037-a, T043-d, T033-f. Open T037-d, T035-c. New T265-a to T265-d.

## Rollback procedure

Code: `git revert` the T265 commits in both repos (root and continent-app) on p2-d1-payments-quota, or do not merge the branch.

Database, only if 044 was pasted: run the DOWN block in 044's header in its order. It drops the twelve-argument grant_pass and re-pastes 026's, re-pastes the admin_paywall_funnel (027), admin_margin (031), admin_oss_threshold (026), ai_consume and ai_refund (007) blocks, unschedules carta_oss_weekly, and drops oss_threshold_check, oss_alerts, ai_usage_days and the three pass_grants columns. Dropping the columns loses the gate and the real fee on every sale made since, so export pass_grants first on a database with sales. Redeploy the previous checkout and stripe-webhook functions after the down migration, never before, or the webhook will call a grant_pass that no longer exists and Stripe will retry until it does.
