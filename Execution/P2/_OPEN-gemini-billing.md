> SUPERSEDED 2026-10-02 (T300). This procedure is stale: paste orders, retired fare steps and
> Vercel steps no longer match the repository. Follow `Execution/_OPEN-MASTER.md` stage 3 instead,
> and Part E there for the owner rows. The text below is kept unchanged as history.

# Open items after T035 to T038: what the owner must do for the Gemini billing posture

Written 2026-09-24 at the close of the Gemini billing batch. This gathers the
"What is still open" sections of the four reports into one ordered list, because
each report only sees its own slice and the order across them matters. The
reports themselves are the record and are not changed by this file; where this
file and a report disagree, the report wins and this file is stale.

The single fact that shapes everything: the Google Cloud project behind
GEMINI_API_KEY has no billing account that this repository can show. The Gemini
API Additional Terms effective 2026-03-23 say that only Paid Services may be
used when making API clients available to users in the EEA, Switzerland or the
UK, and the terms define a Paid Service by the billing account existing, not by
money changing hands. Carta's travellers are European, so attaching billing is
the compliance step. Once it is attached the quota caps stop being a billing
impossibility and become a cost ceiling that has to hold, which is why the
budget alert and the live cap checks follow it in this order.

Nothing below has been done from a session. gcloud is not installed on this
machine, the console is not reachable from a session, and no session writes to
the live Supabase project ntssxktaduxzpsmejwyv. Every step is the owner's.

## 1. Google Cloud console, in this order

Attach an active Cloud Billing account to the project that issued
GEMINI_API_KEY. The only thing tying the key to a project is where the key was
created, so open AI Studio or the Credentials page, find the key in use on the
live Supabase instance, and note its project. Then Billing, Account management:
link that project to a billing account. (T035-a, order 7)

Prove it against the right project and keep the output:

```
gcloud billing projects describe PROJECT_ID
```

The answer must show billingEnabled true and a billingAccountName. A console
screenshot of Billing, Account management with the project listed under the
linked account is equally good evidence. Re-check this after any key rotation,
because a rotated key can come from a different project and break compliance
with no code change. (T035-a)

Create the budget. Billing, Budgets and alerts, Create budget, named "Carta
Gemini usage cap", scoped to that project, amount EUR 50, period monthly, alert
thresholds at 50 percent, 90 percent and 100 percent, each emailing the billing
account owner at an address somebody reads. Save. (T036-a, order 8)

## 2. Live checks on Supabase, after the budget exists

Confirm the global daily cap returns a clean 429. In the Dashboard, under the
plan-day function secrets, set AI_GLOBAL_DAILY_CAP to 1. From a signed-in
account make two plan-day requests. The first must return 200. The second must
return 429 with a JSON body whose code is the string global_cap. Restore the
cap to 200 before leaving. (T036-b, order 9)

Confirm the refund fires on a real failure. On a test account, note the
ai_usage row for kind plan, spend one unit by requesting a plan, then force the
Gemini call to fail after quota was spent (a bad GEMINI_MODEL value is the
simplest way) and request again. ai_usage must return to its prior value.
Restore the model afterwards. (T037-b, order 9)

Both checks touch live secrets, so do them one at a time and restore each
before the next. The 429 mapping is a code read plus a source-pattern
assertion in test_global_cap.mjs, not an execution test, because Deno is not
installed here. These two steps are the only proof against the deployed
functions.

## 3. Migration and redeploy, last

Paste supabase/migrations/028_model_fallback_events.sql into the SQL editor and
run it. It creates ai_model_events and the admin_ai_model_report RPC, gated by
admin_guard. Never run db push. (T038-a)

Then redeploy plan-day so every successful generation writes its model and a
fell_back flag:

```
supabase functions deploy plan-day --project-ref ntssxktaduxzpsmejwyv
```

Deploy only after the migration, or the best-effort insert fails silently and
the admin card stays empty. (T038-b)

## 4. Local test runs, optional

The two quota suites need a writable PostgreSQL. The local server on 5432
rejects every credential a session has, and there is no pgpass file, so the
recorded runs used a throwaway container:

```
docker run --rm -d --name carta-quota -e POSTGRES_PASSWORD=t037 -p 55433:5432 postgres:16-alpine
PGPASSWORD=t037 PGPORT=55433 node continent-app/scripts/ai/test_global_cap.mjs
PGPASSWORD=t037 PGPORT=55433 node continent-app/scripts/ai/test_ai_quota.mjs
docker rm -f carta-quota
```

Expected: 49 and 112 assertions passing. Without a database both skip loudly
and exit 0 without claiming a pass. If the 5432 password is known, set
PGPASSWORD and PGPORT to it instead. (T036-c)

## Rows for a next task, not the owner

T037-a: nothing runs either suite; add an npm script that runs both.
T037-c: ai_refund decrements ai_daily_total for current_date unconditionally,
so a unit spent before midnight and refunded after it comes out of the next
day's shared ceiling. Needs a day on the spend or a refund that names the day,
so a migration of its own.
T037-d: the call-site check in test_ai_quota.mjs is a source-pattern check and
does not prove the branch runs; real coverage needs the Edge Functions under
Deno with a stub client.
T035-c: migration 006's header still says the Gemini project must never have a
billing account; correct it in place.

## Summary of the order

| Order | Row | Where | What |
|---|---|---|---|
| 7 | T035-a | Google Cloud | Attach billing to the key's project and keep the describe output |
| 8 | T036-a | Google Cloud | EUR 50 monthly budget, alerts at 50, 90 and 100 percent |
| 9 | T036-b | Supabase | Cap at 1, two calls, second is 429 global_cap, restore 200 |
| 9 | T037-b | Supabase | Force a failure after a spend, ai_usage returns, restore |
| 10 | T038-a | Supabase | Paste migration 028 |
| 11 | T038-b | Supabase | Redeploy plan-day |

## 5. The telemetry migrations, 029 and 030

Added by T042. T039, T040 and T041 put rows in the register without extending
this file, so the whole run from 028 to 030 is written out once here.

Three migrations feed the admin panel's AI sections and each needs a paste
followed by a redeploy. The order within a pair is not interchangeable: paste
first, redeploy second. Redeploying first means the function writes into a table
that does not exist, and because all three telemetry writes are best-effort and
swallow their own failures, nothing will tell you it happened. You will simply
have a section full of zeroes over a week of real traffic.

| Order | Row | Where | What |
|---|---|---|---|
| 10 | T038-a | Supabase | Paste migration 028_model_fallback_events.sql |
| 11 | T038-b | Supabase | Redeploy plan-day |
| 12 | T039-a | Supabase | Paste migration 029_cache_hit_instrumentation.sql |
| 12 | T041-b | Supabase | Before anything schedules against 030, enable pg_cron and pg_net and create the vault secrets refresh_facts_url and refresh_facts_key |
| 13 | T039-b | Supabase | Redeploy plan-day again, so the v5 cache key and the hit-rate logging both go live |
| 14 | T039-c | Admin panel | A week later, read the live hit rate and record it |
| 15 | T040-a, T040-b | Supabase, local | The prompt trim A/B and the 20-plan quality read |
| 16 | T042-a | Supabase | Paste migration 030_ai_usage_rollup.sql |
| 17 | T042-b | Supabase | Redeploy plan-day, parse-booking AND suggest-city; 030 is the first migration all three write to |
| 17 | T042-c | Supabase | Only if AI_GLOBAL_DAILY_CAP is not 200: set the site_config key ai_global_daily_cap to the real number, or every percentage in the AI usage section is computed against the wrong ceiling |
| 18 | T042-e | Admin panel | A week after 17, read the cap refusal counts alongside the hit rate from 14 |

Steps 12 and 13 can be folded into 16 and 17 if none of it has been applied
yet: paste 029 and 030 in that order, then redeploy all three functions once.
The pairs are written separately because 029 was ready first.

## 6. The margin dashboard, 031

Added by T043. Migration 031 is the odd one out in this run and the reason is
worth stating once: it needs no redeploy. Every telemetry migration from 028 to
030 added a table that an Edge Function writes to, so each one had to be pasted
before the function that writes to it was redeployed. 031 adds a read over
ledgers that already exist plus one owner-writable table, and nothing in the
request path touches either. So the paste is the whole deployment and it can
land at any point after 026, which is where the sales columns it reads come
from.

The two steps after it are not code. The dashboard's infrastructure line is
seeded with the figures CARTA_UNIT_ECONOMICS.md models rather than bills anybody
has read, and it reports the month as not reconciled while that is true. Making
it true is T016, the bookkeeping task, and reading the reconciliation line
afterwards is the only thing that closes T043's done condition.

| Order | Row | Where | What |
|---|---|---|---|
| 19 | T043-a | Supabase | Paste migration 031_margin_dashboard.sql. No redeploy follows it |
| 20 | T043-b | Bookkeeping | T016: enter one closed month of real infrastructure invoices through admin_set_infra_cost with source actual, one call per line item |
| 21 | T043-c | Admin panel | Read the reconciliation line on that month and record the ledger figure, the dashboard figure and the difference |
