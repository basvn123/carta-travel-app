# T314: payments follow-ups without a migration

## Task ID

T314 (wave 7, session 7; register rows T265-b, T032-d, T300-u). Branch p2-payments-followups in both repos.

## Date

2026-10-03

## What changed

Three rows were taken. Two are closed and one is left open with its RPC written down.

T265-b is closed. Before this task, the funnel counted an offer as shown and never as dismissed if the traveller closed the tab, reloaded, or typed a new address while the pass modal stood open. That happened because only the modal's close handler sent the dismissed event. The paywall provider now listens for pagehide while a gate is open and sends the dismissed event with a new function, trackPaywallOnExit in src/lib/paywallEvents.js.

It does not use supabase-js. supabase-js reads the session through a promise and sends with an ordinary fetch, and a page that is being unloaded cancels both. A fetch with keepalive survives the unload, but it must be sent in the same tick as pagehide. So everything it needs is held ahead of time: the URL and anon key from the Vite env, and the access token cached from onAuthStateChange, which also fires on every token refresh. Signed out, it sends the anon key, the same thing supabase-js sends, and paywall_event is granted to anon in 022. navigator.sendBeacon was ruled out because it cannot carry the apikey header PostgREST needs.

Buying is not a dismissal. startCheckout calls markCheckoutRedirect just before window.location.assign, and the pagehide that navigation causes is then skipped. If the traveller presses Back on Stripe and the page comes back from the back-forward cache, a pageshow listener clears the mark. A dismissal already sent from pagehide is not sent again if that restored modal is then closed by hand, so one opening is counted as dismissed at most once.

T300-u is closed. supabase/functions/checkout/test_purchase_e2e.md now proves ten claims instead of seven. Step 0 checks that 044 is pasted (`select public.pass_horizon_days()` must answer 1095). Steps 5 and 6 send a gate reason and check it in both metadata copies and on pass_grants.reason. They also check fee_cents and fee_currency against the fee shown in the Dashboard. The tier-change paragraph at the end of step 9 used to record an open question; it is now a pass or fail check that a Year holder buying a Trip Pass keeps tier year, keeps the period start and allowance, and gains 30 days. A new step 9b drives the year account to the three-year horizon and expects 409 pass_max with no Stripe session. The clean-up covers ai_usage_days, and the evidence list now expects six pass_grants rows.

The row says "a sixth purchase gets 409 pass_max". The arithmetic in 044 gives a slightly different count, and the document follows the arithmetic. Here is the chain on the year account: year 365, trip kept as year 395, year 760, then year again. That last purchase crosses the horizon only in part, so pass_can_buy allows it and grant_pass clamps it to 1,095 days (044, pass_can_buy refuses only when `v_from >= v_limit - interval '1 day'`). So the sixth sale in the document is the clamped one, and the seventh attempt is the one refused.

T032-d stays open. No RPC returns the refund-exposure count. pass_grants has only the select-own policy from 007, so an admin cannot count other users' rows from the client either. No migration was allowed here, so the RPC is written into a new row, T314-a, for migration 048 or the next free number. The tile follows once the RPC exists.

## Files touched

Root repo (wt/T314):

**Modified:**
- supabase/functions/checkout/test_purchase_e2e.md (the 044 checks: claims 8 to 10, the 044 precondition, reason and fee in steps 5 and 6, the stacking check in step 9, new step 9b, ai_usage_days in the clean-up, six rows in the evidence)
- Execution/_OPEN.md (T265-b and T300-u closed by T314, T314-a added)

**Created:**
- Execution/P2/T314-payments-followups.md

App repo (wt/T314-app):

**Modified:**
- src/lib/paywallEvents.js (trackPaywallOnExit, markCheckoutRedirect, isLeavingForCheckout, the token cache and the pageshow reset)
- src/hooks/usePaywall.jsx (the pagehide listener while a gate is open; handleClose skips a dismissal already sent)
- src/lib/checkout.js (marks the Stripe redirect before navigating)

No i18n file, no stylesheet and no migration was touched.

## Commands run

```
# throwaway Postgres for the quota suite
initdb -D <scratch>/pg -U postgres --pwfile=<pw> -A scram-sha-256 -E UTF8
pg_ctl -D <scratch>/pg -o "-p 55447" start
cd wt/T314-app
CARTA_REPO_ROOT=<wt/T314> PGPASSWORD=test PGPORT=55447 PGHOST=127.0.0.1 npm run test:quota
CARTA_REPO_ROOT=<wt/T314> node scripts/verify_paywall.mjs
CARTA_REPO_ROOT=<wt/T314> node scripts/verify_paywall_funnel.mjs
npx eslint src/lib/paywallEvents.js src/lib/checkout.js src/hooks/usePaywall.jsx
npm run lint

# browser check: Vite with a fake Supabase URL, a real HTTP stub on 5999
VITE_SUPABASE_URL=http://127.0.0.1:5999 VITE_SUPABASE_ANON_KEY=fakeanonkey \
  npx vite --config ../vite.t314.mjs --port 5207 --strictPort
node <scratch>/t314/shoot.cjs          # after the change
# the same harness with the three files reset to HEAD, for the before figure
pg_ctl -D <scratch>/pg stop -m fast
```

vite.t314.mjs sits in the wt folder, beside the worktrees and outside both repos, only to give Vite its own cacheDir. The stub on 5999 is a plain node http server rather than Playwright interception. That way the keepalive request goes through a real CORS preflight, as it would against supabase.co (content type JSON plus the apikey and Authorization headers). Nothing touched the live project, Stripe or production.

## Config and secrets set

None.

## Before/after measurements

The browser harness ran each case at 380 by 800 and 1280 by 900.

| Metric | Before | After | Delta |
|---|---|---|---|
| Hard navigations with the modal open that record a dismissed event (signed out and signed in, two widths) | 0 of 4 | 4 of 4 | +4 |
| Exit requests carrying the right bearer (anon key signed out, user token signed in) | 0 of 4 | 4 of 4 | +4 |
| Leaving for Stripe after a buy press that records a dismissed event | 0 of 2 | 0 of 2 | unchanged, as intended |
| Modal closed by hand, then a navigation: dismissed events per opening | 1 | 1 | no double count |
| Browser harness checks passing | 20 of 28 | 28 of 28 | +8 |
| Claims proved by test_purchase_e2e.md | 7 | 10 | +3 |
| pass_grants rows the e2e run ends with | 4 | 6 | +2 |

The suites named by the T265 and T032 reports pass: `npm run test:quota` is 267 assertions (55 + 123 + 89) plus verify_plan_tiers, all passing on PostgreSQL 18 on port 55447. verify_paywall.mjs and verify_paywall_funnel.mjs are ok. `npm run lint` ends with 0 errors and 72 warnings. The two warnings in usePaywall.jsx are the react-refresh ones that were already there. At both widths the modal showed no horizontal scroll and no page errors. The 409 pass_max sentence showed under the pass grid, and the modal stayed open after it.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A Vite config in the scratchpad could not import vite | the scratchpad has no node_modules above it | the config sits in the wt folder and imports vite by absolute path from the main checkout's node_modules |
| paywallEvents.js came out with LF endings on the first write | the edit went through a script that wrote LF | rewritten with CRLF, so the diff is only the 83 added lines |

## What is still open

T032-d stays open. The admin tile needs an RPC no migration has, and this task could not write SQL. Row T314-a gives the shape: admin_refund_exposure(), security definer, behind admin_guard('read'), granted to authenticated and not anon. It returns the count and amount_cents sum of sales with consent_tos distinct from 'accepted' in the last 14 days, the all-time count, and the 14-day sale count, read through pass_grants_no_consent_idx from 025. After that come the tile beside the paywall funnel tiles, its wrapper in src/auth/admin.js, and a higher MIN_FUNCTIONS in scripts/admin/test_admin_rpc_security.mjs. The wave note named migration 048, but T315 owns 048 in this same wave and had its own scope, so the row says 048 or the next free number.

Three limits of the pagehide path, none worth a row. First, if the access token has expired at the moment of pagehide (a tab left idle while the refresh failed), PostgREST answers 401 and that one event is lost, which is still better than before. Second, a modal open when the browser kills a background tab without firing pagehide is still not counted. Third, the keepalive was proved in headless Chromium only; older browsers without fetch keepalive lose the event exactly as before.

The e2e procedure in test_purchase_e2e.md is still for the owner to run in stage 10.3, after 044 and the two function deploys. That is already on the owner's list in `_OPEN-MASTER.md`, so it is not a new row.

Register: closed T265-b and T300-u. Open T032-d. New T314-a.

## Rollback procedure

Code: do not merge p2-payments-followups, or `git revert` the T314 commits on it in both repos. The app commit is self-contained (three files). Reverting it brings back the old behaviour, where only the close button records a dismissal. The root commit holds the e2e document, the register and this report. Nothing was deployed and no database changed, so there is nothing else to undo.
