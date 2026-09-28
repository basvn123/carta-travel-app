# T073: Build the parse-failure queue

## Task ID

T073

## Date

2026-09-28

## What changed

The parse-booking Edge Function now reports structural failure reasons (json_parse, missing_key, wrong_shape, empty_result) alongside ai_bad_output. The client captures input metadata and queues parse failures with a new RPC into a dedicated parse_failures table with 30-day retention. Before this task, only edge_errors (140) recorded that parsing failed; nothing said whether the failure was malformed JSON, a missing required field, wrong types, or empty results. Nothing said whether the input was a URL, a PDF, an image, or text, how large it was, or what app version sent it. That metadata lets the parsing prompt be improved without storing documents or URLs.

## Files touched

All paths from the repo root.

**Created:**
- `supabase/migrations/042_parse_failures.sql`
- `continent-app/scripts/admin/test_parse_failures.mjs`

**Modified:**
- `supabase/functions/parse-booking/index.ts` (added reason field to responses)
- `supabase/functions/parse-booking/logic.mjs` (sanitizeParsed detects structural failures)
- `continent-app/src/planner/bookingImport.js` (logParseFailure function, analyzePayload, RPC calls;
  the call that logs json_parse/missing_key/wrong_shape was fixed to read from the error branch,
  see "What broke and how it was fixed")
- `continent-app/scripts/admin/test_parse_failures.mjs` (fixed to actually run; see below)

## Commands run

```
cd '/c/Users/Gebruiker/Documents/Portfolio/Travel App'
git checkout -b p4-parse-failure-queue
git -C continent-app checkout -b p4-parse-failure-queue

# Design and code implementation:
# - Created 042_parse_failures.sql with table, reader, writer, self-check
# - Updated parse-booking function to detect and return reason codes
# - Added client-side capture in bookingImport.js

# throwaway cluster (Git Bash); $S is the session scratchpad
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg73" -o "-p 55434" -l "$S/pg73.log" -w start
PGPORT=55434 PSQL="/c/Program Files/PostgreSQL/18/bin/psql.exe" node continent-app/scripts/admin/test_parse_failures.mjs
# fixed the harness (auth stub, 018 patch, claims encoding, SET/CRLF stripping,
# drop-database-from-itself, SKIPPED preflight); re-ran until green:
# 22 checks, 0 failures
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg73" -w stop

cd continent-app
npx eslint src/planner/bookingImport.js scripts/admin/test_parse_failures.mjs
npm test          # 92 pass, 0 fail
npm run build      # clean, ~2m

# Commits (see below):
git -C continent-app add src/planner/bookingImport.js scripts/admin/test_parse_failures.mjs
git -C continent-app commit -m "T073: Fix parse-failure logging path and run the test harness"
git add continent-app supabase/migrations/042_parse_failures.sql
git commit -m "T073: Add migration 042 (parse_failures) and the app-side fix"
```

## Config and secrets set

None. The RPC log_parse_failure is fire-and-forget; failures never raise and never block. Migration 042 requires 015 (admin_guard) and 041 (admin_health, which 042 re-creates).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Structural failure reasons captured | 0 | 4 (json_parse, missing_key, wrong_shape, empty_result) | +4 |
| Input metadata fields stored per failure | 0 | 5 (kind, size_b, mime_type, check_failed, app_version) | +5 |
| Retention days | n/a | 30 | - |
| Per-user rate limit failures/day | n/a | 100 | - |
| Global rate limit failures/day | n/a | 5000 | - |
| Table columns with document/URL data | n/a | 0 | - |
| NPX eslint checks | n/a | 0 errors | - |
| test_parse_failures.mjs checks | 0 written, 0 run | 22 written, 22 passing against a throwaway PostgreSQL cluster | +22 |
| npm test (continent-app) | n/a | 92 pass, 0 fail | - |
| npm run build | n/a | clean, ~2m | - |

## What broke and how it was fixed

The parse-booking function returns `reason` inside the error body for a 502
(`ai_bad_output`), never in a successful `data` response: `json_parse` comes
from the JSON.parse catch, `missing_key`/`wrong_shape` from
`sanitizeParsed`'s new `reason` field. supabase-js surfaces a non-2xx
response as `error`, never `data`. An earlier pass of this task wrote the
logging call into the success branch of `requestBookingImport`, checking
`data.reason` after a call that only fails, never succeeds, when reason is
set. `data.reason` never exists, so `json_parse`, `missing_key` and
`wrong_shape` never got logged; the queue would have quietly recorded
nothing for those three reasons even after the Edge Function is redeployed.
Moved the check into the `error` branch, reading `reason` from the same
parsed error body that already yields `code` and `upstream`. `empty_result`
(the 200 `nothing_found` response) and the client's own `wrong_shape` check
(an unusable `data` shape) were already correct and unchanged: they do not
go through `error` at all.

| What | Cause | Fix |
|---|---|---|
| json_parse/missing_key/wrong_shape never logged | logParseFailure was called from the success path, checking `data.reason`, but the function only sets `reason` in a 502 error body | Moved the call into the `error` branch of `requestBookingImport`, reading `reason` from `error.context.json()` alongside `code` and `upstream` |
| logic.mjs sanitizeParsed signature changed | Adding reason detection field | Return value includes reason field; callers must check it before treating empty results as success; index.ts updated to handle all three cases (reason set, reason null + empty results, reason null + good parse) |
| test_parse_failures.mjs failed on migration 002 with "schema auth does not exist" | The harness applied migrations straight into a bare PostgreSQL cluster with no auth schema; test_edge_errors.mjs and test_pipeline_health.mjs create one (auth.users, auth.uid(), the anon/authenticated/service_role roles) before applying anything, and this file never did | Added the same STUBS block (copied from test_edge_errors.mjs) before the migration loop, seeded auth.users for every uid the test uses, and added an admin_users row so the reader tests can run as an actual admin |
| migration 018 failed with "invalid regular expression: invalid repetition count(s)" | Known issue (T071): 018 as committed carries a `{5,600}` regex bound this PostgreSQL build refuses | Added the same patch-and-retry fallback test_edge_errors.mjs uses: on that specific error, apply a copy with `{5,600}` replaced by `{5,255}`, for this test only |
| Every `sqlAsAuth` call raised "invalid input syntax for type json" | The harness base64-encoded `request.jwt.claims`; every migration's `auth.uid()`/`auth.jwt()` parses that setting as raw JSON with `::jsonb`, never base64 | Set the claims as plain (SQL-escaped) JSON text instead |
| Every count/reader check compared against the wrong row, or against `'SET'` | psql's `-tc` runs the whole batch as one command; `set role` and `select set_config(...)` each print their own line ahead of the real query's rows, and on Windows every line carries a trailing `\r` that broke exact string comparisons | `sqlAs` now drops a leading `SET` line, `sqlAsAuth` drops the extra `set_config` row, and `psqlRun` strips `\r` and trims every line before returning it |
| `drop database` failed with "cannot drop the currently open database" on both setup and teardown, silently swallowed by a try/catch | Every psqlRun connected with `-d carta_t073_test`, including the call meant to drop that same database | Added `dropTestDb()`, which always connects to the `postgres` database to issue the drop; setup and teardown both use it |
| A server that cannot be reached crashed with an uncaught exception (exit 1) instead of skipping | `setup()` called `execFileSync` directly for `create database`, with no SKIPPED detection ahead of it | Added a preflight `select 1` against the `postgres` database before touching anything; on failure the script logs `SKIPPED: ...` and exits 0 |

Once these were fixed the harness matched what its own docstring already
claimed to prove; checks were added for the pieces the previous pass wrote
into the docstring but never into the test body: direct table access denied
for a signed-in user, the nine-column check, the per-user and global caps,
the 30-day prune keeping a 29-day row, account deletion nulling user_id, and
pasting 042 twice being safe.

## What is still open

The parse_failures table is built and tested against a throwaway PostgreSQL cluster (22 checks pass), but migration 042 has never been applied to the real database. Paste it into the Supabase SQL editor for ntssxktaduxzpsmejwyv and look for "parse failures self-check passed" (T073-a). Until then, the RPC calls from bookingImport.js answer "could not find the function", logged and ignored, so nothing breaks but nothing is recorded.

The parse-booking Edge Function returns reason codes but was never deployed (never redeploy live functions without explicit approval; the app imports logic.mjs in Node and runs tests, but Deno tests were not written because the test harness setup complexity exceeded this task's scope). So the client-side RPC calls that read `reason` from the function's error body (json_parse, missing_key, wrong_shape via the 502 path, bookingImport.js lines 139-151) never actually fire until the function is redeployed, because the live function still answers the old way. The empty_result case does fire today, because bookingImport.js still treats "nothing_found" as an answer worth logging (line 157) without the function changing. The client's own shape check (wrong_shape on line 161 of bookingImport.js, an unusable `data` body) also fires without the function changing.

The reader function admin_parse_failures(days) is ready and the admin_health update names parse_failures as a table to check, but no admin screen yet displays the data (T073-c). An admin reads it with `select public.admin_parse_failures(7)` in the SQL editor while signed in.

The window into parse failures works today because the logs are there: every failure writes an ai_bad_output code to edge_errors (T071), which the admin can read with a status breakdown. This queue adds the structural reason, the input kind, and the version that sent it. That richer metadata is the value of the task; it sits in the table waiting to be read once 042 is pasted and the next admin screen task (T073-c) designs a card for it.

## Rollback procedure

If 042 is pasted into Supabase and needs to come back:

```
drop function if exists public.admin_parse_failures(int);
drop function if exists public.log_parse_failure(text, int, text, text, text);
drop table if exists public.parse_failures;
-- then paste 041's admin_health block again (optional: without it the
-- panel lists parse_failures as missing)
notify pgrst, 'reload schema';
```

In git, reverting is simple because parse_failures is new:

```
git -C continent-app revert 9b06ca0
git revert cf35a33b8
```

Reverting the app code leaves logParseFailure() unused and the RPC calls swallowed. Reverting the migration without the app code leaves the calls posting to an endpoint that answers "could not find the function," logged and ignored, the same state as before 042 is pasted.

---

## Notes on the design choice

The task posed a choice: extend the existing edge_errors table or build a dedicated parse_failures table. The decision was parse_failures.

parse_failures needs richer metadata than edge_errors: input_kind (url/pdf/image/text), input_size_b (bytes), mime_type, check_failed (four reasons), app_version. These fields are specific to parsing failures and don't map to the generic edge_errors model (which tracks function, code, origin, two HTTP statuses for all three AI functions). A dedicated table keeps the privacy guarantee provable: the column allow-list self-check in 042 can verify the exact nine columns and refuse to apply if the set drifts. Extending edge_errors would require adding nine new columns to an already-broad table, making the privacy check harder to audit and the table harder to maintain. The isolation also means parse failures can have their own retention (30 days vs 90 for edge_errors) and rate limits (100/user, 5000/global vs 100/user, 50000/global for edge_errors), tuned to the volume of each failure mode.

parse_failures also isolates change to a single topic: structural parsing improvements. When the prompt is tuned based on this data, the schema and retention don't need to change for edge_errors, which may evolve for other reasons (suggesting other failure reasons to track, extending retention for long-term trends, etc.).

The one cost is two separate tables and readers. The benefit is clarity: an admin reading parse_failures knows they are looking at parsing metadata, not a jumble of four types of failure. The size is also bounded (30 days of parsing failures, not 90 days of all AI failures), so the data is newer and more actionable.

---

## Notes on the implementation

The Edge Function (parse-booking/index.ts) now returns a reason field in error responses. The client reads it and logs it via RPC. The function code was changed but not deployed, so this task documents the shape for the day when a redeploy is approved.

The client captures input metadata by analyzing the payload structure: URL presence, file count, single file mime type, and estimated binary sizes (base64 to binary ~4/3, plus text length). An input with a URL and text is marked as kind='url'. A single PDF file is kind='pdf', a single image is kind='image', text is kind='text', and multiple files stay unmarked (mimeType=''). This captures the intent of the traveller's import without storing the contents.

The RPC log_parse_failure is fire-and-forget, decorated with the same pattern as log_edge_error (T071): never raises, returns void, swallows its own exceptions, rate-limited per user and globally, and prunes rows past 30 days on every write. It runs synchronously in the test but asynchronously in the browser; the client does not await it.

---

## Commits

**continent-app repo:**
- `9b06ca0` T073: Add parse-failure queue infrastructure on the client
- `3137893` T073: Fix parse-failure logging path and run the test harness

**root repo:**
- `cf35a33b8` T073: Add parse-failure queue infrastructure
- `b538942be` T073: Report and register rows for parse-failure queue
- `185ce5c71` T073: Add migration 042 (parse_failures) and the app-side fix
- (this commit) T073: Correct the report and close T073-d in the register

All on branch `p4-parse-failure-queue`.
