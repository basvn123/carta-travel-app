# T071: Edge error telemetry through a first-party RPC

## Task ID

T071

## Date

2026-09-28

## What changed

An AI failure the traveller sees is now also written down. Before this task the three client wrappers turned ai_timeout, ai_bad_output, url_unreachable and ai_error into a message and stored nothing: loaded with the Supabase client stubbed, 0 of 3 wrappers made any write, and there was no table to write to. Now each wrapper sends the failure to a database function, `log_edge_error`, on its way out, and in the test database 8 of 8 failures sent through the real wrapper code arrive as rows in `public.edge_errors`. The work is migration `supabase/migrations/040_edge_errors.sql`, which is not applied to the live project, one small client module and three edited wrappers. Migrations 021 to 040 are all written but not applied to the live Supabase project.

### Route chosen: a first-party RPC, not Sentry

I chose the database insert RPC. Sentry was the other option named in the plan, and it would have given stack traces and release tracking, but it is a third-party script that stores and reads identifiers in the browser and sends device, page and IP data to a processor outside the project. The Legal plan is plain about the consequence: the moment Sentry or Plausible is added, a consent banner is needed. For four error codes that is a poor trade. The codes are already structured, the server already names them, and the only thing missing was somewhere to put them. A table in the project we already run does that with no new processor and no new script.

### The cookie-consent question

No banner is needed, and this task does not change that. Article 5(3) of the ePrivacy Directive covers storing information on, or reading it from, the user's device. The writer stores nothing on the device: no cookie, no local storage, no session or device id. It is one RPC through the Supabase client the app already has, carrying the Authorization header of the session that already exists for sign-in, which is strictly necessary and exempt. The row itself holds no IP, no user agent, no page, no pasted URL and no document or model content; the table has no column for any of them, and the migration's self-check refuses to apply if a ninth column appears. One honest caveat: Supabase's own platform request logs record the caller's IP for every API call, this one included, exactly as they do for every other call the app makes. That is the existing processor relationship the privacy policy already describes, not something this task adds.

What the task does add is personal data under GDPR: each row carries the caller's user id. The lawful basis is legitimate interest in keeping the service working, the retention is 90 days, and the privacy policy should say so in one sentence (T071-b). That is a disclosure, not a consent question.

### How it works

`continent-app/src/planner/edgeFailure.js` holds one function, `reportEdgeFailure(fn, code, meta)`. It drops any code that is not one of the four, then calls `supabase.rpc('log_edge_error', ...)` without awaiting it and swallows both a rejected promise and an error result. The three wrappers, `aiDayPlan.js` (plan-day), `aiCitySuggest.js` (suggest-city) and `bookingImport.js` (parse-booking), call it in two places: in the error branch after the code has been worked out, with the status of the function's answer and the `status` field the function passes on from upstream; and in the branch where the function answered 2xx but the wrapper's own shape check refused the body, with origin `client`. The request is dispatched before the wrapper returns its `{ ok: false, code }`, so it goes out before any screen has the code to show. The screens themselves (`AiDayPlanModal.jsx`, `MagicImportZone.jsx`, the day planner tab) were not touched: they only ever see the wrapper's result, so intercepting at the wrapper covers every caller, including the two `requestAiDayPlan` call sites in `DayPlannerTab.jsx`.

The recorded set is ai_timeout, ai_bad_output, url_unreachable and ai_error. The first three are the codes the plan names. ai_error is included because it is the catch-all the functions answer when Gemini returns a non-retryable status, and the one the wrapper falls back to when a function crashes without a readable body; leaving it out would hide the largest class of failure. Codes that describe the traveller's own state (auth, user_cap, global_cap, too_few, url_empty, nothing_found) or a switched-off function (no_ai) are not failures of the service and are not recorded. `network` (the wrapper itself threw) is not recorded either; when the network is gone the RPC cannot reach the database anyway. A request that never got an answer shows up as ai_error with no HTTP status, which is how supabase-js reports a fetch failure.

A row is when, who (null once the account is deleted, as in 022), which function, which code, origin (`edge` or `client`), the function's HTTP status and the upstream status: Gemini's for ai_error, the booking site's for url_unreachable, always a number, never a body. The two statuses are what make the data useful: a run of 429s from Gemini and a run of 403s from one booking site are both "failures" and have nothing else in common.

`log_edge_error` is security definer, executable by authenticated only, and never raises. It returns without writing when there is no session, when any argument is outside its closed list, when the caller has already written 100 rows in the last 24 hours, or when the global day has reached 50,000 rows (022's single-statement ceiling). It also deletes up to 500 rows older than 90 days on every call, so retention holds without a scheduler, which this database does not have. The table has row level security on and no policies, and the table grants are revoked from anon and authenticated, so nothing reads or writes it except the two functions and the service role.

`admin_edge_errors(days)` is the reader, at the read tier: total, distinct users, counts per code with the client share, per function and code, per upstream status, and a zero-filled daily series split by code. The window is capped at 90 days so a long window cannot pretend to be longer than the retention. It returns counts only; there is no RPC that returns one failure. `admin.js` gets the matching `adminEdgeErrors(days)`. 040 also re-creates `admin_health` from 016's body with `edge_errors` added to the list, so until 040 is pasted the admin panel's existing missing-tables line names it. No screen shows the report yet (T071-c).

## Files touched

All paths from the repo root. App files are committed in both repos.

**Created:**
- `supabase/migrations/040_edge_errors.sql`
- `continent-app/src/planner/edgeFailure.js`
- `continent-app/scripts/admin/test_edge_errors.mjs`
- `Execution/P4/T071-error-telemetry.md`

**Modified:**
- `continent-app/src/planner/aiDayPlan.js` (6 lines)
- `continent-app/src/planner/aiCitySuggest.js` (6 lines)
- `continent-app/src/planner/bookingImport.js` (7 lines)
- `continent-app/src/auth/admin.js` (`adminEdgeErrors`)
- `Execution/_OPEN.md` (rows T071-a to T071-d)

`edgeFailure.js` is the one file the prompt did not name. The three wrappers need one shared writer, and putting it inside `aiDayPlan.js` would have made the booking import pull in `dayDraft.js` and the pricing module it imports. `AiDayPlanModal.jsx` and `MagicImportZone.jsx` were read and not changed, for the reason above.

## Commands run

```
git checkout -b p4-error-telemetry
git -C continent-app checkout -b p4-error-telemetry

# before: the three wrappers as committed on p4-statement-of-reasons, loaded
# in Node with the Supabase client stubbed, each answering ai_timeout
# (scratch probe, not committed): 0 rpc calls from 3 wrappers

# throwaway cluster (Git Bash); $S is the session scratchpad
"/c/Program Files/PostgreSQL/18/bin/initdb.exe" -D "$S/pg71" -U postgres --auth=trust -E UTF8
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg71" -o "-p 55434" -l "$S/pg71.log" -w start
PGPORT=55434 node continent-app/scripts/admin/test_edge_errors.mjs     # clean runs
# mutation checks, each on a working copy, restored after: the per-user cap
# removed; the no-session guard removed; anon granted execute on the writer;
# the client shape-check report removed from aiCitySuggest.js
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg71" -w stop
rm -rf "$S/pg71" "$S/pg71.log"
PGPORT=55434 node continent-app/scripts/admin/test_edge_errors.mjs     # skip path, exits 0 with SKIPPED

# from continent-app/
npx eslint src/planner/edgeFailure.js src/planner/aiDayPlan.js src/planner/aiCitySuggest.js src/planner/bookingImport.js src/auth/admin.js
npm run build
npm test
```

The harness was not retyped: its imports, psql helpers, Supabase stubs, the 018 patched-copy block and the skip block were sliced from `test_admin_unpublish_guide.mjs` (T069) by line range, with the database name changed; the header, seed, assertions and the client section are new. It applies 002, 004, 006, 007, 009, 010, 011, 014 to 017, 018 (from a `{5,255}` patched copy, T031-d; 018 is not edited), 032 to 034, measures the before state, and applies 040. 018 is in the chain only because 033 and 034 refuse to apply without it.

The client section imports the real `aiDayPlan.js`, `aiCitySuggest.js` and `bookingImport.js` in Node. A `module.register` resolve hook serves `src/lib/supabaseClient.js` from a data: URL whose `supabase` is a stub: `functions.invoke` answers the way the live functions fail, and `rpc` runs the call in the test database as a signed-in user. So the path from a failing function to a stored row is the committed code end to end, with only the network replaced. It checks that each wrapper still returns the same code, that exactly one row is written and that the write happened before the wrapper resolved, and that the row has the right function, code, origin and statuses; then that eleven non-failures (auth, user_cap, global_cap, too_few, NOT_FOUND to no_ai, quota_check, url_empty, nothing_found and three successes) write nothing; then that an RPC answering "function not found" (040 not pasted) or rejecting (offline) leaves the wrapper's answer unchanged.

In the test the stub's rpc runs synchronously, so the row exists before the wrapper resolves. In the browser the request is dispatched before the wrapper returns and completes a moment later; if the tab closes in that moment the row can be lost.

No screen changed, so nothing was checked visually. The build passes and the writer is in the built bundle.

To apply live: paste 040 into the Supabase SQL editor for ntssxktaduxzpsmejwyv and look for "edge errors self-check passed". Never `db push`. It needs 015 and 016, which are older than the unapplied range. The self-check confirms RLS on with no policies, no client table grant, the eight columns, that all three functions are security definer with an empty search_path, not executable by anon and executable by authenticated, that the writer writes nothing without a session, and that the reader and admin_health refuse a caller who is not an admin.

## Config and secrets set

None. No new package, no new script host, no environment variable.

## Before/after measurements

Measured in the throwaway database and in Node with the Supabase client stubbed. The live project was not touched.

| Metric | Before | After | Delta |
|---|---|---|---|
| Wrappers that persist a failure | 0 of 3 | 3 of 3 | +3 |
| Simulated failures through the real wrappers that reach the store | none can (no call, no table) | 8 of 8 | +8 |
| Failure codes recorded | 0 | 4 | +4 |
| Non-failure answers that write a row | | 0 of 11 | |
| Cookies or device storage added | 0 | 0 | 0 |
| Third-party scripts or processors added | 0 | 0 | 0 |
| Rows older than 90 days after one write | | 1 to 0 | |
| test_edge_errors.mjs | | 119 of 119 | |
| npm test | not run | 92 of 92 | |

Each of the four mutations was caught: removing the per-user cap fails 2 assertions; removing the no-session guard and granting anon execute are both refused by the migration's own self-check; removing the client report from `aiCitySuggest.js` fails 2 assertions.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A Bash heredoc holding the migration failed with "unexpected EOF" | The known wrapper problem with long heredocs full of apostrophes (T068 to T070 hit it too) | Wrote the file with the Write tool and spliced 016's admin_health body in by line range with a script |
| `aiDayPlan.js` showed a 350-line diff after the first edit | Python's text mode read CRLF as LF and wrote LF back | Rewrote the file with CRLF; the diff is 6 lines |
| The harness aborted at 033, then at 034 | Both check that 018's content_overrides exists | Added 018 to the chain the way T069 does, with the patched copy |
| The first try of the fourth mutation matched nothing | A `git stash` round trip for the before measurement had left `aiCitySuggest.js` with CRLF in the working tree | Matched with CRLF; the index copy is LF and git normalises it on commit |

## What is still open

The owner has to paste 040 into the live SQL editor (T071-a). Until then every failure makes one RPC call that answers "could not find the function" and is dropped, which costs nothing visible, and the admin panel's missing-tables line names edge_errors. 040 re-creates admin_health, so pasting 016 again after it takes edge_errors off that list; paste 040 again to put it back. Nothing else is at stake in that order.

The privacy policy does not yet mention the failure record. One sentence under the AI features section is enough: when an AI request fails, Carta keeps the function, the error code and the HTTP status with the account for 90 days to find and fix outages, under legitimate interest (T071-b). `PrivacyPolicy.jsx` and its translations are outside this task.

No admin screen shows `admin_edge_errors` yet. The data is there and `adminEdgeErrors` is ready; a card in the Overview beside the model report, designed to the carta-design rules, is a separate task (T071-c). Until then an admin reads it with `select public.admin_edge_errors(30)` in the SQL editor while signed in, or through the service role.

`export_user_data` (024) does not include a person's edge_errors rows. They are personal data while the account exists, so the export should list them; add them the next time 024 is edited (T071-d).

Not verified: anything against a real Supabase project, including the RPC through PostgREST and supabase-js (the test uses `set role` with claims, and a stubbed client); failures from the live Edge Functions in a browser; and whether a closed tab loses the in-flight row in practice.

## Rollback procedure

Live, if 040 has been pasted, run its down section:

```
drop function if exists public.admin_edge_errors(int);
drop function if exists public.log_edge_error(text, text, text, int, int);
drop table if exists public.edge_error_daily_total;
drop table if exists public.edge_errors;
-- then paste 016's admin_health block again (optional: without it the panel
-- lists edge_errors as missing)
notify pgrst, 'reload schema';
```

Dropping the table deletes the stored failures; that is intended, they are telemetry.

In git:

```
git -C continent-app revert 3667e74
git revert <the T071 report commit> 941e7e13a
```

or drop the branch `p4-error-telemetry` in both repos before merge. Reverting the app without the migration is safe: nothing else calls the functions. Reverting the migration without the app leaves the wrappers making one failing RPC per failure, which they ignore, the same state as before 040 is pasted.
