# T042: AI usage rollup RPC and admin view

## Task ID

T042

## Date

2026-09-24

## What changed

The AI surface has been measuring itself since migration 007 and none of it
reached a reader. The quota ledger counted every unit spent, the daily total
counted the shared ceiling, 028 counted model fallbacks and 029 counted cache
lookups, and the admin panel showed exactly one number out of all of it:
`aiToday`, a bare integer in `admin_stats` with nothing to compare it against.
An owner could not tell whether the cache change from T039 had worked, whether
anyone was near a cap, or whether one account was eating the margin.

Migration 030 adds `admin_ai_usage(p_days)`, one owner-gated RPC that answers
all of that from the tables that already exist, and the admin panel gained a
section that renders it with plan and ground kept apart everywhere.

One new table was unavoidable, and it is the interesting part of this task. The
brief asks for the count of user-cap rejections versus global-cap rejections,
and nothing was recording either. A refusal has only ever been an HTTP 429:
`ai_consume` returns `user_cap` or `global_cap`, the Edge Function turns it into
a response, and the fact is gone. It cannot be reconstructed afterwards, because
a refusal by definition writes nothing anywhere, so a row in `ai_usage` sitting
exactly at a cap is indistinguishable from the same row with a hundred refused
calls behind it. So `public.ai_cap_events` records one row per refusal, in the
same shape and for the same reason `ai_cache_events` exists in 029: a rate or a
count needs the events that did not produce a row, and a counter on the thing
that succeeded can never hold them.

The two counts are read together or not at all, which is why the panel puts them
side by side and says so in the copy beneath. A high `user_cap` count with zero
`global_cap` is demand: people want more than their tier gives, and the next
place to look is the paywall funnel two cards up. Any `global_cap` count above
zero is a capacity problem, and whoever hit it was refused a generation they had
already paid for. Summing them would turn two opposite diagnoses into one
meaningless number.

The same reasoning drives the separation of plan and ground through every figure
in the section. They are not two flavours of one unit. A plan unit is tokens on
Gemini Flash and costs effectively nothing; a ground unit is a billed Google
Search query, and on Gemini 3 one grounded generation can run several of them. A
single blended "AI calls" figure would hide the only line item that reliably
costs money behind the one that does not, which is precisely the blind spot the
section exists to close.

Two design points worth knowing in six months. First, the daily percentages are
computed against an assumed ceiling and the panel says so on screen. The real
cap is `AI_GLOBAL_DAILY_CAP` in the Edge Function environment, which SQL cannot
read; the RPC checks a `site_config` key named `ai_global_daily_cap` in case an
operator has mirrored it, and otherwise assumes 200, matching the `|| 200`
default in all three functions. A percentage against the wrong ceiling is worse
than no percentage, so the ceiling is printed next to the figure rather than
hidden inside it. Second, the plan and ground spend totals are period-keyed, not
day-keyed. `ai_usage` rows are keyed by entitlement period, which for a Year Pass
holder is one row covering 365 days, so "units spent in the window" is not a
question that table can answer. What the RPC returns is units spent in periods
that started inside the window, and `ai_daily_total` carries the genuine daily
series beside it. Both are here because they answer different questions.

`logCapRejection` in `passes.mjs` is the single door all three Edge Functions
write through, best-effort and never awaited, so telemetry cannot fail or slow a
traveller's request. Wiring it turned up one real bug in `suggest-city`: when a
grounded request loses a race and degrades to an ungrounded answer, `kind` still
reads `ground` while `quota` has been rewritten by a second `plan` consume, so a
later refusal logged against `kind` would have recorded a ground refusal for a
call that only ever asked for a plan unit. It logs against `useGrounding`
instead. The grounded degrade itself is now logged, having previously been
swallowed entirely.

The UI is one self-contained `AiUsage` component so T062 can lift it out whole.
It adds no chart library, reuses `Sparkbars` and the existing `adminpage-*`
classes, and adds exactly one CSS class: `adminpage-table-static`, which removes
the pointer cursor and hover fill from the heaviest-accounts table. The user
table opens a detail panel on a row click and carries both to say so; a table
that only reports must not make the same offer.

## Files touched

**Created:**
- `supabase/migrations/030_ai_usage_rollup.sql`
- `Execution/P2/T042-ai-usage-telemetry.md`

**Modified (Edge Functions):**
- `supabase/functions/_shared/passes.mjs`
- `supabase/functions/plan-day/index.ts`
- `supabase/functions/parse-booking/index.ts`
- `supabase/functions/suggest-city/index.ts`

**Modified (app):**
- `continent-app/src/auth/admin.js`
- `continent-app/src/admin/AdminPage.jsx`
- `continent-app/src/styles.css`
- `continent-app/scripts/verify_admin_panel.mjs`

**Modified (execution):**
- `Execution/_OPEN.md`
- `Execution/P2/_OPEN-gemini-billing.md`

## Commands run

Root repo:

```
git checkout -b p2-ai-usage-telemetry
git add supabase/migrations/030_ai_usage_rollup.sql supabase/functions/_shared/passes.mjs \
        supabase/functions/plan-day/index.ts supabase/functions/parse-booking/index.ts \
        supabase/functions/suggest-city/index.ts
git commit -m "T042: Add the AI usage rollup RPC and record cap refusals"
```

App repo:

```
git checkout -b p2-ai-usage-telemetry
git add src/admin/AdminPage.jsx src/auth/admin.js src/styles.css scripts/verify_admin_panel.mjs
git commit -m "T042: Surface the AI usage rollup in the admin panel"
```

SQL verification, on a throwaway container because the local 5432 server rejects
every credential a session has (T036-c). Docker needs the PATH prepend on this
machine, and `MSYS_NO_PATHCONV=1` is needed or Git Bash rewrites the container
paths in `docker cp` and `docker exec`:

```
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"
export MSYS_NO_PATHCONV=1
docker run --rm -d --name carta-t042 -e POSTGRES_PASSWORD=t042 -p 55433:5432 postgres:16-alpine
docker exec carta-t042 psql -U postgres -c "create role anon; create role authenticated; create role service_role;"
docker exec carta-t042 psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/fixture.sql
docker exec carta-t042 psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/030.sql
docker exec carta-t042 psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/seed.sql
docker exec carta-t042 psql -U postgres -At -c "select jsonb_pretty(public.admin_ai_usage(30));"
docker rm -f carta-t042
```

The fixture is a minimal stand-in for the parts of the live schema 030 touches:
`auth.users`, `auth.uid()`, `site_config`, `entitlements`, `ai_usage`,
`ai_daily_total`, `ai_plan_cache`, `ai_cache_events`, and an `admin_guard(text)`
returning null. It is a scratch file, not committed, and reproducing it takes
two minutes from the column lists in 007, 014 and 029.

App verification, from `continent-app/`:

```
npm run build
npm run lint
npx eslint src/admin/AdminPage.jsx src/auth/admin.js
node scripts/verify_admin_panel.mjs
```

## Config and secrets set

None. The RPC reads an optional `site_config` key `ai_global_daily_cap`, which
does not exist and does not need to; the function falls back to 200 to match the
Edge Function defaults. Setting it is worth doing only if the live
`AI_GLOBAL_DAILY_CAP` ever moves away from 200, and it is a plain
`admin_set_config` call, not a secret.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| AI figures visible in the admin panel | 1 (`aiToday`, uncompared) | 14 across four groups | +13 |
| Cap refusals recorded anywhere | 0, unrecoverable | 1 row per refusal, by reason, kind and tier | new |
| Plan and ground separated in the UI | no | yes, in every figure | new |
| RPC response on the seeded container | no function | see below | new |
| Vite build | passes | passes, 1m 58s | no change |
| eslint on the two changed app files | 0 errors | 0 errors, 0 warnings | no change |
| `verify_admin_panel.mjs` checks | 27 | 28 | +1 |

On the seeded test container, `admin_ai_usage(30)` returned, against three users
and four days of totals: `today` 143, `globalCap` 200, `daysAtCap` 1, `peakDay`
`{2026-09-23, 200}`, `plan` 56 units over 3 accounts, `ground` 31 units over 2
accounts, `cache` 40 hits of 120 lookups for a 33.3 percent rate, `topUsers`
ranked heavy (41 plan, 27 ground, year) above mid (12 plan, 4 ground, trip)
above free (3 plan, 0 ground), `rejections` 4 user-cap against 2 global-cap with
the plan and ground split beneath each, and `rejectionsByTier` showing free with
3 user-cap and year with 2 global-cap.

Four behaviours were checked besides the happy path. The days argument clamps:
0 and -5 both return 1, 9999 returns 365, null returns 30. Inserting
`ai_global_daily_cap` as 300 into `site_config` moved `globalCap` to 300 and
`daysAtCap` from 1 to 0, which is correct, the 200-unit day is no longer at a
300 cap. A guard returning `forbidden` makes the whole call return
`{"error": "forbidden"}` and nothing else. Re-running the whole migration
produced only `already exists, skipping` notices and completed, so it is
idempotent.

No live figures were read. Nothing has been applied to
`ntssxktaduxzpsmejwyv`, and the panel on the live project will render nothing
for this section until 030 is pasted, because `adminAiUsage` returns an error
and the render is gated on it.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `verify_admin_panel.mjs` step 8b failed with a strict-mode violation on `.adminpage-spark` | The overview had one sparkline chart and the check selected it unscoped; the new section adds a second | Scoped the signups assertions to the Signups card by heading text, and the provider split to its own card |
| `suggest-city` would have logged a ground refusal for a plan-only call | After the grounded degrade, `kind` still says `ground` but `quota` was rewritten by a `plan` consume | Log against `useGrounding`, which the degrade updates, with a comment saying why |
| Heredoc-written regexes in the harness were syntactically invalid | Bash strips one escape level, so `\\s` became `\s` and the literal newline broke the regex | Replaced them with whitespace-flattened substring checks, which are clearer here anyway |
| `docker cp` and `docker exec -f` resolved container paths as Windows paths | Git Bash MSYS path conversion rewrites `/tmp/x.sql` to `C:\...` | `export MSYS_NO_PATHCONV=1` |

One failure was found and deliberately not fixed. Step 11 of
`verify_admin_panel.mjs`, "the non-admin hub changed shape", fails. It was
confirmed pre-existing by stashing every change from this task and re-running
the harness on the clean tree, where it fails identically. It is unrelated to
this work, it concerns the account hub rather than the admin panel, and fixing
it would mean touching files this task does not name. It is registered as
T042-d.

## What is still open

Migration 030 has to be pasted into the Supabase SQL editor by hand, and the
three Edge Functions redeployed after it. Until both happen the section renders
nothing on the live project and no refusal is recorded. The order matters:
pasting the migration first is harmless, redeploying first means the functions
insert into a table that does not exist, which is swallowed by the best-effort
wrapper but records nothing. Both rows are in the register with an Order
consistent with the gemini-billing sequence, and the procedure file has been
extended to carry the full run from 028 through 030 in one place, since T039,
T040 and T041 added rows to the register without extending it.

The cap refusal counts start empty and stay empty until the redeploy, so the
first useful read of that number is a week after it. The same is true of the
cache rate, which T039 already registered as T039-c; the two should be read in
the same sitting.

The assumed global cap is the weakest part of this. The panel is honest about
it, but a percentage against a number SQL cannot verify is a figure that can
quietly become wrong the day somebody changes the secret. The `site_config`
mirror makes it fixable in one `admin_set_config` call and nothing enforces that
the two agree. A check that compares them would need the Edge Function to write
its own cap somewhere, which is a change to three functions for one number and
did not seem worth it inside this task.

Step 11 of the admin harness fails on a clean tree, as described above.

## The seven carta-design questions

The section reuses the admin panel's existing components, so most of these are
answered by not having introduced anything.

No hex value was written. The one new CSS rule sets `cursor: default` and
`background: transparent`, and every other style comes from the existing
`adminpage-*` classes, which already resolve to the app's tokens.

No warm neutral, no serif face, no gradient and no shadow. Nothing new was
styled.

`--flag` is not used in this section and appears nowhere on the admin page.

The mono rule holds. Every figure in the section is a measured count and every
one is set in mono, through `.adminpage-tile b`, `.adminpage-barnum`,
`.adminpage-ranknum` and the `.mono` cell class. Tier names are set in mono in
the table because they are field values rather than prose. All explanatory copy
is sans.

No button was added, so the one-primary rule is untouched.

The headings carry numbers: "AI usage (30 days)", "Daily consumption",
"Refusals by tier", "Heaviest accounts". There are no em dashes in the section,
the RPC or the migration, and none of the banned words appear.

The thing removed: an earlier draft gave the heaviest-accounts table a fifth
column showing each account's share of total spend as a percentage. It was
arithmetic the reader can do from two columns that were already there, and it
pushed the table wide enough to scroll on a narrow window. The two unit columns
say the same thing and rank the list.

## Rollback procedure

App repo: `git revert dd4fa99`, or `git checkout p2-prompt-token-trim -- src/admin/AdminPage.jsx src/auth/admin.js src/styles.css scripts/verify_admin_panel.mjs`. The section is gated on the RPC answering without an error, so reverting the app alone leaves a harmless unused RPC.

Root repo: `git revert 99d58bf69`. That restores the three Edge Functions and
`passes.mjs` to their pre-T042 state and removes the migration file.

Database, if 030 has already been applied:

```
drop function if exists public.admin_ai_usage(int);
drop table if exists public.ai_cap_events;
```

Both are in the down block at the end of the migration. Dropping the table loses
the refusal history, which is the only data this task creates and which exists
nowhere else, so take a copy first if any of it has been read. Nothing else in
the schema depends on either object, and the Edge Functions tolerate the table
being absent because `logCapRejection` swallows its own failures.
