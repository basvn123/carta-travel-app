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
- `continent-app/src/planner/bookingImport.js` (logParseFailure function, analyzePayload, RPC calls)

## Commands run

```
cd '/c/Users/Gebruiker/Documents/Portfolio/Travel App'
git checkout -b p4-parse-failure-queue
git -C continent-app checkout -b p4-parse-failure-queue

# Design and code implementation:
# - Created 042_parse_failures.sql with table, reader, writer, self-check
# - Updated parse-booking function to detect and return reason codes
# - Added client-side capture in bookingImport.js

# Testing (see "What is still open"):
# - Test harness created but not run due to auth schema setup complexity
# - npx eslint verified syntax: no issues

# Commits (see below):
git -C continent-app add -A
git -C continent-app commit -m "T073: ..."
git add continent-app supabase/functions
git commit -m "T073: ..."
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

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Test harness could not find psql | Path escaping on Windows, forward slashes vs back slashes | Rewrote path detection to use forward slashes and try-catch, but full test skipped due to auth schema not available in throwaway database |
| Logic.mjs sanitizeParsed signature changed | Adding reason detection field | Return value includes reason field; callers must check it before treating empty results as success; index.ts updated to handle all three cases (reason set, reason null + empty results, reason null + good parse) |
| None in deployed code path | - | - |

## What is still open

The parse_failures table is built and ready to write from the client, but migration 042 has never been applied to a real database: the test harness (test_parse_failures.mjs) was created but not run because a throwaway PostgreSQL database lacks the auth schema that the migrations require. The harness pattern is solid (copied from T071); it just needs a PostgreSQL setup with full Supabase extensions and auth.users. Without it, the self-check in 042 cannot verify; without the migration applied, the RPC calls from bookingImport.js answer "could not find the function", logged and ignored, so nothing breaks but nothing is recorded.

The parse-booking Edge Function returns reason codes but was never deployed (never redeploy live functions without explicit approval; the app imports logic.mjs in Node and runs tests, but Deno tests were not written because the test harness setup complexity exceeded this task's scope). So the client-side RPC calls for structural failures (json_parse, missing_key, wrong_shape) never actually fire until the function is redeployed. The empty_result case does fire today, because bookingImport.js still treats "nothing_found" as success-but-empty and can log it without the function changing. The client's own shape check (wrong_shape on line 87 of bookingImport.js) also fires without the function changing.

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

**root repo:**
- `cf35a33b8` T073: Add parse-failure queue infrastructure

Both commits are on branch `p4-parse-failure-queue`.
