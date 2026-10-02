# T284: migration 047, three small schema fixes

## Task ID

T284 (register rows T083-b, T219-c, T217-c, T300-o; no mind-map prompt). Branch p4-migration-047 in the root repo and in continent-app.

## Date

2026-10-02

## What changed

One new migration, supabase/migrations/047_small_schema_fixes.sql, makes three changes that three earlier tasks could not make because no migration was allowed to them. A fourth row, a missing test, is closed in the admin harness. Nothing is pasted anywhere: the owner pastes 047 at _OPEN-MASTER stage 2.2 row 16, after 045 and 046 (row T284-a).

Client crashes are stored (T083-b). Since T083 the ErrorBoundary calls log_edge_error('app', 'client_crash', 'client') once per render crash, and 040 refused both words in the table checks and again in the writer, so every call was dropped. 047 adds 'app' to the fn check and 'client_crash' to the code check, adds the same two words to the two lists in log_edge_error, and binds them with a new constraint, edge_errors_crash_pair_check: fn 'app' if and only if code 'client_crash', and a crash always has origin 'client'. A forged ('plan-day', 'client_crash') or ('app', 'ai_timeout') call is still dropped without a row. Nothing else about the crash is stored; the table keeps 040's eight columns.

The decision on where a crash shows: not on the AI failures card. A render crash is a fault in this build of the app, an AI failure is a fault in a model or a booking site, and the card's headline tiles ("Failures", "Travellers affected") would add the two. So admin_edge_errors keeps every key it had (total, users, lastAt, byCode, byFunction, byUpstream, daily) counting only the three AI functions, and gains one key, crashes, with total, users, lastAt and a zero-filled daily series over the same window. EdgeErrors.jsx reads only the old keys, so the card stays correct with no app change. A card that draws the crashes is register row T284-b. The writer's caps (100 rows per account per day, 50,000 a day in all, from 040) are shared by crashes and AI failures.

'data' feedback and 'cycle' overrides (T219-c). The kind check on public.feedback admits 'data' and the layer check on content_overrides admits 'cycle'. The constraint change alone would have done nothing: submit_feedback (017) rewrote any kind outside its own list to 'other', and admin_set_override (045) refused any layer outside its own list with bad_layer. So 047 re-creates both from their current bodies with the one word added and every other line unchanged. The row asked for this after T219-b, the app build that sends the new kind. It is done first because the widened checks are harmless before anything sends the values, and T219-b no longer waits on a migration. The app side (an i18n label for the new kind, a cycle layer in the override console and in the orphan check) is row T284-d, to go with T219-b.

An audited way to move a pass's expiry (T217-c). admin_adjust_expiry(p_user, p_days) moves entitlements.expires_at by whole days, back or forward, and nothing else. Tier and period_start stay, so the AI allowance is not reset. That reset is why admin_set_tier could not be used and why the refund procedure fell back to a bare UPDATE in the SQL editor. It sits behind admin_guard('destructive'), writes one admin_audit_log row (action adjust_expiry, with days and the previous and new expiry, tier and period start), sets source to 'manual' as the procedure's update did, and refuses with an error word rather than raising: bad_days, not_found, no_live_pass, would_expire, beyond_horizon, or the guard's forbidden and slow_down. The ceiling is 1095 days from now, the value 044 names pass_horizon_days(). It is written out as a number rather than called, because 044 pastes after 047 (stage 10). docs/REFUND_SOP.md step 4 now calls the function instead of the UPDATE. There is no Admin button yet, so the step still runs in the SQL editor with one claims line that tells the function who is calling. The block was run as written against the scratch database and moved a Year Pass back 30 days with period_start kept and one audit row. Without the claims line it answers forbidden. The button is row T284-c.

The read-burst limit is tested (T300-o). T034 never simulated a burst inside admin_guard's window. test_admin_rpc_security.mjs now has a section with 14 assertions on the budget. A burst of 70 admin reads in one session is never refused and writes no audit row, so reads spend no budget. 59 logged actions pass, the 60th refuses both tiers with slow_down, a read RPC and the user list both hand slow_down back, another actor's 100 rows do not count, and rows older than 60 seconds stop counting. 9 set_tier rows pass the destructive tier and the 10th refuses it while the read tier still passes. admin_adjust_expiry answers slow_down there, which shows it sits on the destructive tier.

The guard against 044 holds. 047 reads no table and calls no function that 044 creates, and re-creates none that 044 replaces. The only functions it re-creates are log_edge_error and admin_edge_errors (040), submit_feedback (017) and admin_set_override (045). This was proven by applying the stack in paste order: 002 to 043, 045, 046, then 047 without 044, then 044, then 047 again. Every self-check notice came back, and 047's twice.

## Files touched

**Created:**
- supabase/migrations/047_small_schema_fixes.sql (root repo)
- Execution/P4/T284-migration-047-small-schema-fixes.md (root repo)

**Modified:**
- docs/REFUND_SOP.md (root repo; step 4, the expiry change)
- Execution/_OPEN.md (root repo; T083-b, T217-c, T219-c and T300-o closed by T284; rows T284-a to T284-d added)
- continent-app/scripts/admin/test_admin_rpc_security.mjs (app repo; floors to 40 functions and 46 migrations, sections 7 to 10)
- continent-app/scripts/admin/test_rls_policies.mjs (app repo; a cycle row in the content_overrides fixture, section 4b)

No app source file, no i18n file, no screen. No existing migration was edited.

## Commands run

Git Bash. $S is the session scratchpad; $M is C:/Users/Gebruiker/Documents/Portfolio/wt/T284/supabase/migrations (the app worktree's harnesses resolve the migrations relative to the repo layout, which the sparse worktree pair does not have, so the directory is passed in).

```
"/c/Program Files/PostgreSQL/18/bin/initdb.exe" -D "$S/pg284" -U postgres --auth=trust -E UTF8
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg284" -o "-p 55445" -l "$S/pg284.log" -w start

# before (HEAD), after (047 and the extended harnesses), from wt/T284-app
PGPORT=55445 CARTA_MIGRATIONS_DIR=$M node scripts/admin/test_admin_rpc_security.mjs
PGPORT=55445 CARTA_MIGRATIONS=$M node scripts/admin/test_rls_policies.mjs

# mutation: the extended harnesses against a copy of the migrations without 047
PGPORT=55445 CARTA_MIGRATIONS_DIR=$S/mig_no047 node scripts/admin/test_admin_rpc_security.mjs
PGPORT=55445 CARTA_MIGRATIONS=$S/mig_no047 node scripts/admin/test_rls_policies.mjs

# the other harness that applies the whole directory
PGPORT=55445 CARTA_MIGRATIONS_DIR=$M node scripts/admin/test_admin_followups.mjs

# scratch scripts (not committed): paste order without 044, the down block,
# the REFUND_SOP step 4 block run verbatim
node $S/paste_order.mjs scripts/admin/test_admin_rpc_security.mjs $M $S
node $S/down_test.mjs scripts/admin/test_admin_rpc_security.mjs $M $S
node $S/sop_test.mjs scripts/admin/test_admin_rpc_security.mjs $M $S ../T284/docs/REFUND_SOP.md

npx eslint --no-ignore scripts/admin/test_admin_rpc_security.mjs scripts/admin/test_rls_policies.mjs

"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg284" -w stop
```

test_parse_failures.mjs also reads the directory, but it applies a fixed list ending at 042 and takes no directory override, so 047 cannot reach it. It cannot run from this worktree layout for the same reason (it looks for wt/supabase/migrations).

## Config and secrets set

None.

## Before/after measurements

Measured on the throwaway PostgreSQL 18.1 on 55445 with every migration applied in filename order. The live project was not touched.

| Metric | Before | After | Delta |
|---|---|---|---|
| Rows stored for the ErrorBoundary's call from a signed-in traveller | 0 | 1 | +1 |
| Forged crash pairs stored (three shapes tried) | 0 | 0 | 0 |
| Crash rows counted in the AI failures total (scratch: 1 AI failure, 2 crashes) | n/a (not storable) | 0; crashes.total 2 | |
| feedback kinds the table and submit_feedback accept | 3 | 4 | +1 |
| content_overrides layers the table and admin_set_override accept | 5 | 6 | +1 |
| Audited ways to move expires_at without resetting period_start | 0 | 1 | +1 |
| Assertions on admin_guard's rate budget | 0 | 14 | +14 |
| admin_* functions discovered | 39 | 40 | +1 |
| test_admin_rpc_security.mjs assertions, all passing | 138 | 183 | +45 |
| test_rls_policies.mjs assertions, all passing | 335 | 355 | +20 |
| test_admin_followups.mjs assertions, all passing | | 86 | |
| Extended harnesses against the stack without 047: failing assertions | | admin 20 (and the run aborts on the crash insert), RLS 4 | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| test_rls_policies.mjs did not parse after the first edit | An apostrophe in a single-quoted check name ("caller's") | Reworded to "caller id" |
| The register showed every line changed | The rewrite wrote CRLF over a file the index holds as LF, plus one stray carriage return | Rewrote the file with LF only; the diff is the four status cells and four new rows |
| A first draft of 047's self-check flagged its own function | The "never assigns period_start or tier" regex matched the `e.tier = 'free'` test in the guard clause | Narrowed the regex to the update statement on entitlements |

## What is still open

T284-a (user). Paste 047 in the Supabase SQL editor at _OPEN-MASTER stage 2.2 row 16, after 045 and 046. 044 may come before or after it. Look for the notice "small schema fixes self-check passed". Until then a crash still costs one dropped RPC, and the refund procedure's step 4 has no function to call. Re-pasting 017, 040 or 045 later undoes part of 047, so paste 047 again after any of them (the 047 header lists which part).

T284-b (next task). No admin card draws the crashes key yet. An App crashes card beside EdgeErrors.jsx on the Overview, owner-only and not i18n'd like its neighbours, would show a release that crashes.

T284-c (next task). admin_adjust_expiry has no button. A move-expiry control in UserDetail.jsx (a wrapper in auth/admin.js, the error words in useErrText.js, strings in the six i18n files) takes step 4 of the refund procedure out of the SQL editor completely. Then rewrite step 4 to use it.

T284-d (next task, with T219-b). The app side of the two new values. FeedbackInbox.jsx renders the kind through account.feedbackKind.<kind>, which has no 'data' entry. The override console (ContentSection.jsx) has no cycle layer. fetchValidItemIds in lib/overrides.js lists beach, lake, mountain and trail only, so a cycle override would read as an orphan.

A design note, not a row. admin_guard's destructive budget counts five action names fixed in 015, and 'adjust_expiry' is not one of them. Ten adjust_expiry calls in a minute are therefore not stopped by the destructive budget, only by the overall 60 a minute. Adding the name means re-creating admin_guard, which was out of scope here. For a function the owner uses a few times a year, the overall budget plus the audit row is enough.

No screen was touched, so nothing was checked in a browser. The CI workflow rls-policies.yml runs test_rls_policies.mjs on a change to a migration and will pick up 047 on the first push (T083-c).

## Rollback procedure

Before it is pasted: `git revert` the T284 commit in the root repo and the T284 commit in continent-app, or do not merge the branches. Nothing else changed.

After it is pasted: run the DOWN block in the 047 header in the SQL editor, in its order. It restores the three checks, takes the crash pair constraint off, drops admin_adjust_expiry, and has you re-paste the four functions from 040 (log_edge_error, admin_edge_errors), 017 (submit_feedback only) and 045 (admin_set_override and its two grant lines). It is one-way for three kinds of row: crash rows are deleted, 'cycle' override rows are deleted (export them first if they matter), and 'data' feedback rows are relabelled 'bug'. Audit rows written by admin_adjust_expiry stay. The block was run as written on a scratch database seeded with one row of each kind. It left the 040, 017 and 018 checks and function bodies in place, and 047 then applied cleanly on top of it again. Then revert docs/REFUND_SOP.md step 4 to the UPDATE.
