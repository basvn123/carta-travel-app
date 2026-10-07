# Execution Report: T365

## Task ID

T365: migration 051, the owner's moderation and admin decisions (register row T362-d, wave 16c session 8)

## Date

2026-10-07

## What changed

The eleven decisions the owner took on 2026-10-07 in block A3 of `Execution/_OWNER-RUNBOOK.md` (rows T063-e, T065-b, T067-d, T068-d, T068-g, T069-c, T069-d, T070-c, T070-g, T074-c, T217-d) now exist as one migration, `supabase/migrations/051_moderation_and_admin_decisions.sql`, and the app screens that use it. Before, a hijacked aal1 admin session could hand out a pass, ten bans in a minute blocked every config save, an overdue temporary override applied forever, a taken-down guide could be republished at once and its share links kept working, a takedown named no ground, a notice needed no good-faith statement, reports and statements were kept forever, and deleting an account erased its purchase records. After 051 each of those is the other way round, and a 76-assertion test against a throwaway database proves each one. The migration is not applied anywhere live; it was pasted only on a throwaway PostgreSQL 18 cluster on port 55448, in paste order, then reversed with its own down block (the schema came back byte for byte apart from pg_dump's random restrict token) and pasted again.

### The database half, section by section

1. **admin_guard gets a `live` tier (T065-b).** The owner chose "their own list, so a busy config day cannot block a ban". The `live` tier keeps the overall cap of 60 logged actions a minute and adds its own cap of 20 a minute counted over `set_config`, `config_visibility`, `override_set`, `override_clear`, `feedback_new`, `feedback_open` and `feedback_done`. Twenty is this task's choice (twice the destructive cap of 10 in 015), stated in the migration header. The destructive list and its cap of 10 are 015's, unchanged.
2. **Four functions move to the live tier.** `admin_set_config` and `admin_set_config_public` (045's bodies), `admin_set_override` (047's body) and `admin_set_feedback_status` (034's body) were copied byte for byte by a script that also refuses unless `admin_guard('destructive')` occurs exactly once in each body; the diff printed by the script shows that one line changed per function and nothing else.
3. **aal2 for admin_set_tier (T063-e).** 015's body with 045's refusal pattern right after the guard: below aal2, or with no `aal` claim, it returns `{error: 'mfa_required'}` and writes one `mfa_refused` audit row. `admin_reset_quota` and `admin_unban_user` stay on aal1, as decided.
4. **Overdue temporary overrides stop after 14 days (T074-c).** 018's read policy `content_overrides_read_all` (using true) is replaced by `content_overrides_read_applying`, which admits a row while its status is not temporary or `review_by + 14 days` is still ahead. The browser keeps its three-column grant from 043; the admin reads through the definer `admin_list_overrides` and still sees every row.
5. **Missing profiles repaired once (T067-d).** 010's own backfill loop, row by row.
6. **The publish gate (T067-d, T069-c).** A trigger function `trip_plans_publish_gate()` on `trip_plans` (before insert and before update) refuses a plan becoming public when the owner has no profile (hint `profile_required`) or when any statement of reasons about the plan has complaint status none, open or upheld (hint `moderation_locked`). Only a complaint decided `reversed` lifts the lock. The owner's words were "locked until a complaint is decided"; reading "decided" as "decided either way" would let an upheld takedown be republished the minute it was upheld, so the lock lifts on reversal only. 039's reinstatement runs under its `carta.reinstate_plan` marker and passes the gate. A statement purged after its 3 years takes its lock with it.
7. **A takedown revokes the share links (T069-d).** `admin_unpublish_guide` sets `revoked_at` on every live `trip_shares` row of the plan; no row is deleted, and the self-check still refuses the word delete in the takedown body.
8. **The ground (T070-c).** `admin_unpublish_guide` is now `(p_plan_id, p_reason, p_ground, p_ground_ref)`; the two-argument version is dropped so no call is ambiguous. `p_ground` is `illegal` (with the law relied on, 3 to 300 characters) or `terms` (with the item of the content rule, `c1` to `c7`). Both are stored on new columns `moderation_statements.ground` and `ground_ref`, granted to the owner's column select. New refusals: `bad_ground`, `bad_ground_ref`.
9. **The good-faith tick and an optional name (T068-d).** `report_guide` is now `(p_plan_id, p_reason, p_contact_email, p_reporter_name, p_good_faith)` and refuses with `good_faith_required` unless the tick is true; a name over 200 characters is `bad_name`. The three-argument version is dropped. New columns `content_reports.reporter_name` and `good_faith` (null on older rows). `admin_list_content_reports` (039's body) returns `reporterName` and `goodFaith`. The receipt and decision by email wait for J6 (row T365-d).
10. **Retention (T068-g, T070-g).** A trigger clears a report's contact email the moment its status leaves `new`, so every path that decides clears it; the paste also clears emails on reports already decided (one-way). `moderation_retention_purge()` deletes decided reports 12 months after the decision and statements 3 years after the later of the statement and its complaint decision; it never touches a `new` report or a statement with an open complaint. It runs on every accepted report and is scheduled daily through pg_cron when that extension is on (the throwaway cluster has no pg_cron, so the notice telling the owner how to schedule it was the path exercised).
11. **pass_grants outlive the account (T217-d).** The foreign key to `auth.users` is replaced by `pass_grants_user_id_fkey ... on delete set null`, and `user_id` may be null.
12. **export_user_data** (048's body, still schema 3) carries `reporterName` and `goodFaith` on `reportsFiled` and `ground` and `groundRef` on `moderationStatements`.

The self-check at the end asserts all of the above, calls the refusing paths with no session, and checks that a refused `report_guide` stores nothing; it prints "moderation and admin decisions self-check passed".

### The app half

- `ReportGuide.jsx` and `guides.js`: an optional name field with a tied label and hint, and a required good-faith checkbox (`.auth-check`, the existing 44 px row). A notice without the tick is refused in words with focus moved to the tick; the `?guidesmock` seam refuses the same way.
- `UnpublishGuide.jsx`, `useUnpublishGuide.js`, `admin.js`: the takedown form asks for the ground with two radio pills, then either a labelled law field or the seven rule items as pills; Send stays disabled until the ground and its reference are given. `bad_ground` and `bad_ground_ref` are worded. The done notice also counts the share links revoked.
- `ModerationNotice.jsx`, `moderation.js`, the `?savedmock` statement in `SavedTripsPanel.jsx`: the owner's statement shows the ground (the rule's title in the owner's language, or the law as written) and, until reversed, that the guide cannot be published again. If 051 is not pasted yet, the statement read falls back to 039's columns on error 42703 instead of hiding every statement.
- `TripSharePanel.jsx`: the two publish refusals each get a sentence.
- `UserDetail.jsx`: the pass control shows the MFA step-up and Apply waits for aal2.
- `ContentReports.jsx`: a card shows the name given and whether the notice was confirmed in good faith, and on a new report with an email says the email is cleared on decision so the moderator replies first.
- `overrides.js` and `ContentSection.jsx`: `OVERDUE_GRACE_DAYS = 14`, `stopsApplyingAt`, `appliesToTravellers`; the review list says when an overdue temporary patch stops, or stopped, showing to travellers.
- `TermsOfService.jsx`: a new section "Public guides: the content rule" with seven numbered items and the notice-and-action route, marked in the header comment as a draft for the owner's legal review (J4, row T365-c). "Last updated" moved from 3 October to 7 October 2026.
- Strings: 19 traveller keys in each of the six catalogues (`guides.report*`, `moderation.ground*`, `moderation.rule.c1` to `c7`, `moderation.lock*`, `share.visLocked`, `share.visNoProfile`); 14 admin keys added and 3 changed in `en.js` only, as every admin string is. All six parse.

carta-design's seven questions for this diff: no hex value, no new CSS; no gradient or new colour; ochre, teal and `--danger` untouched (the takedown keeps its existing outlined danger buttons); no mono on prose (the rule titles are pills in `--ui`, which is why `.adminpage-select`, a mono control, was not used); one primary per view (the report form's Send, the admin Apply); no em dashes or banned words; removed in review: a `gld-report-faith` class name that had no CSS behind it.

## Files touched

Root repository (branch p4-migration-051):

**Created:**
- supabase/migrations/051_moderation_and_admin_decisions.sql
- Execution/P4/T365-moderation-admin-decisions-051.md

**Modified:**
- Execution/_OPEN.md (T362-d closed by T365; rows T365-a to T365-g)

App repository continent-app (branch p4-migration-051):

**Created:**
- scripts/admin/test_moderation_decisions.mjs

**Modified:**
- src/community/ReportGuide.jsx, src/community/guides.js
- src/components/admin/UnpublishGuide.jsx, src/components/admin/useUnpublishGuide.js, src/components/admin/ContentReports.jsx, src/components/admin/ContentSection.jsx, src/components/admin/UserDetail.jsx
- src/auth/admin.js, src/auth/moderation.js, src/auth/ModerationNotice.jsx, src/auth/SavedTripsPanel.jsx, src/auth/TripSharePanel.jsx
- src/components/TermsOfService.jsx
- src/lib/overrides.js
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js
- scripts/verify_admin_panel.mjs, scripts/verify_guides.mjs, scripts/verify_saved.mjs

**Deleted:**
- None. No existing migration was touched.

## Commands run

Git Bash; $S is the session scratchpad, $M the root worktree's `supabase/migrations`. Live credentials were unset in every shell.

```
# 051 assembled from a template plus byte-exact slices of 015, 014, 034, 039, 045, 047 and 048
python $S/build051.py $M $S/051.tpl.sql $S/051_out.sql

# throwaway cluster
"/c/Program Files/PostgreSQL/18/bin/initdb.exe" -D "$S/pg365" -U postgres --auth=trust -E UTF8
"/c/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D "$S/pg365" -o "-p 55448" -l "$S/pg365.log" -w start

# paste order (stubs from test_rls_policies.mjs first); see "What broke" for 025 and 026
$S/mkdb.sh p365 002 ... 020 023 022 024 032 033 034 035 046 036 037 038 039 043 040 041 042 045 047 028 029 030 025 026 048 051
psql -p 55448 -d p365 -f 021, 027, 031, 044, then 051 again        # stage 10 after 051, then a second paste
$S/mkdb.sh p365c <same chain> 051 021 027 031 044; psql -f $S/selfcheck.sql   # 044 after 051 leaves 051 intact
$S/mkdb.sh p365b <chain to 048>; $S/mkdb.sh p365d <chain to 048> 051
psql -p 55448 -d p365d -f $S/down.sql        # the header's DOWN steps with the named blocks pasted
pg_dump -s p365b; pg_dump -s p365d; diff     # identical apart from the \restrict token
psql -p 55448 -d p365d -f 051                # re-apply: self-check passed

# from wt/T365-app, migrations copied to $S/mig
PGPORT=55448 CARTA_MIGRATIONS=$S/mig node scripts/admin/test_moderation_decisions.mjs
#   and a mutation copy (cap 20 to 200, lock on 'open' only, no link revocation): 5 assertions failed
PGPORT=55448 ... node scripts/admin/test_admin_rpc_security.mjs, test_rls_policies.mjs, test_admin_followups.mjs,
  test_admin_mfa.mjs, test_admin_guard_tiers.mjs, test_admin_public_guides.mjs, test_content_reports.mjs,
  test_admin_unpublish_guide.mjs, test_statement_of_reasons.mjs, test_override_review.mjs
pg_ctl -D "$S/pg365" -m fast -w stop; rm -rf "$S/pg365"

npm run lint; npm test; node scripts/ci/design-lint.mjs
npm run build; rm -rf dist dist-data
# one dev server, port 5218, config and cacheDir outside the repo, fake Supabase host
VITE_SUPABASE_URL=https://ntssxktaduxzpsmejwyv.supabase.invalid VITE_SUPABASE_ANON_KEY=stub \
  node node_modules/vite/bin/vite.js --config ../T365-vite.config.mjs
CARTA_PORT=5218 node scripts/verify_guides.mjs; node scripts/verify_saved.mjs; node scripts/verify_admin_panel.mjs
node ../T365-shots/shoot.mjs                  # 380 and 1280 px screenshots, page errors, sideways scroll
```

The Supabase host given to the dev server does not resolve, so nothing could reach the live project; every call the harnesses check is answered by their own route stubs.

## Config and secrets set

None. Nothing was pasted into or deployed to the live project.

## Before/after measurements

All database figures from `test_moderation_decisions.mjs` on the throwaway cluster (every migration in numeric order, 051 last). "Before" is the behaviour of the earlier migrations named, as their reports measured it or as the code reads.

| Metric | Before | After | Delta |
|---|---|---|---|
| Config saves accepted in a minute after 10 bans (T065 report, after 034) | 0 | accepted | decoupled |
| Live-effect saves accepted in a minute on their own budget | 60 (overall cap only) | 20, the 21st answers slow_down | own cap |
| admin_set_tier from an aal1 session | succeeds (015) | mfa_required, 1 mfa_refused row, pass unchanged | refused |
| Overrides anon reads among 5 test rows (one temporary 15 days overdue) | 5 | 4 | -1 |
| Live share links of a guide after its takedown (T069 report: they keep working) | 2 of 2 | 0 of 2, other guides untouched, 0 rows deleted | -2 |
| Owner republishing a taken-down guide (T069 test) | allowed | refused while none, open or upheld; allowed after reversed | locked |
| Takedowns that store a ground | 0 | every one | new |
| Notices accepted without a good-faith tick | all | 0 | refused |
| Contact email kept after the report is decided | yes | cleared | cleared |
| Decided reports and statements kept | forever | 12 months and 3 years | bounded |
| pass_grants rows kept after the buyer's account is deleted | 0 (cascade, 007) | 1 of 1, user_id null | kept |
| test_moderation_decisions.mjs | | 76 of 76 | new |
| Earlier admin SQL harnesses with 051 in the chain (10 files) | | all passing, 0 failures | |
| verify_admin_panel.mjs | | OK, 63 ok lines | |
| verify_guides.mjs | | all checks passed | |
| verify_saved.mjs failures | 1 (stale tab colour check, also on the stashed baseline) | 1, the same | 0 |
| npm test | | 259 of 259 | |
| design-lint new violations | | 0 (196 in the baseline) | 0 |
| npm run lint errors | | 0 | |

Screenshots in `C:\Users\Gebruiker\Documents\Portfolio\wt\T365-shots\`: the report form with the tick refused, the owner's statement with ground and lock, and the Terms content rule, each at 380 and 1280 px with no page error and no sideways scroll; plus the harness shots of the takedown form, the Reports card, the account detail and the admin page at 380 px.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| 048 did not apply in the stage 2 order of `_OPEN-MASTER.md` (028 to 030 and 025, 026 not yet in) | 048 needs `ai_model_events` (028), and its self-check calls `export_user_data`, which reads `pass_grants.amount_cents` and `currency` (026) and the consent columns (025) | The test chain pastes 028 to 030 and 025, 026 before 048; 051 inherits the same need. Not fixed in 048 (out of scope); register row T365-b |
| 051's self-check failed on its own admin_set_tier check | `public.plan_tiers` first appears in the declare block (`%rowtype`), before the aal check | Look for `from public.plan_tiers` instead |
| The down block left `pass_grants.user_id` nullable | Step 6 only restored the cascade | Step 6 sets NOT NULL again when no orphaned row exists |
| A config save in the harness answered bad_value | 045's shape check on the `announcement` key | The harness saves a free key |
| en.js failed to parse after the admin keys went in | A heredoc ate the backslash before an apostrophe | Re-escaped the one string; all six catalogues parse |
| verify_admin_panel step 5 and 7b would fail | Apply now waits for MFA, and a second step-up box made two matches | Step 5 asserts the wait, the change runs after 7b; 7b's locators are scoped to the ban box |

## What is still open

The owner pastes 051 (T365-a): right after 048, stage 2 row 18, looking for "moderation and admin decisions self-check passed", and the app build of this branch goes live the same day, because an older build's report form answers "did not send" (good_faith_required) and its takedown answers bad_ground. pg_cron is optional: without it the purge runs on every accepted report, and the paste prints the one line that schedules it daily. 049 (T147) and 050 (T330) do not have to come first.

048 cannot paste where `_OPEN-MASTER.md` puts it (T365-b): its own self-check needs 025 and 026, which that file holds back to stage 10. Either paste 025 and 026 (columns only, no Stripe setup) before 048, or move 048 and 051 to stage 10 after 026. `_OPEN-MASTER.md` is outside this task's files.

The content rule in the Terms is a draft (T365-c, owner step J4), as are the good-faith wording and the new "Last updated" date. Its seven items are the only values 051 accepts as a terms ground, so a reworded item means changing the `moderation.rule.*` keys, and a removed item means a migration.

The notifier's receipt and decision by email (Art. 16(4), 16(5)) wait for the email route (T365-d, after J6). The decision mail has to leave before the decision commits, since 051 clears the email in that transaction.

The privacy policy does not yet state the retention periods, the optional name or that purchase records outlive a deleted account (T365-e). `admin_adjust_expiry` (047) can still extend a live pass by up to 1095 days on aal1; whether it joins `admin_set_tier` on aal2 is the owner's call (T365-f). `verify_saved.mjs` has one stale assertion that fails before and after this task (T365-g).

Row T362-d is closed by this task. The eleven source rows were already closed by T362 with the decisions.

Not verified: anything against the real project (pg_cron, PostgREST's handling of the trigger hint, the RLS policy through supabase-js), and the translations by native speakers.

## Rollback procedure

Before 051 is pasted live: drop the branch `p4-migration-051` in both repos, or revert the commits (root: the migration commit and the report commit; app: the one T365 commit). The app commit reverted alone puts the old forms back, which against a pasted 051 answer good_faith_required and bad_ground.

After 051 is pasted live: run the DOWN block in its header, in order. It was proven on the throwaway cluster: the schema came back identical to the pre-051 state. One-way parts: emails cleared on decided reports, rows purged since the paste, and the names and ticks in the dropped columns (export `content_reports` first); `pass_grants` keeps any row orphaned since the paste and its column then stays nullable; the profiles created by the repair stay. Then revert the app commit and deploy.
