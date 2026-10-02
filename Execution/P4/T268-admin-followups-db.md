# T268 · admin follow-ups, database side

## Task ID

T268 (stage 9 group D2 of Execution/_OPEN-MASTER.md, the database half; wave 2, session 1)

## Date

2026-10-02

## What changed

One new migration, `supabase/migrations/045_admin_followups.sql`, closes fourteen register rows on the database side of the admin and moderation surface. It is not applied to the live project.

A refused delete or ban below aal2 now leaves an audit row. 032 raised, and the raise rolled back any write, so the attempt most worth recording left nothing in our own trail. 045 returns `{error: 'mfa_required'}` instead and writes one `mfa_refused` row (target, function, aal claim). The check still sits after the guard and before any read of the target, so an aal1 session learns nothing new. The app maps both the old hint and the new code to the same sentence (T063-d).

`admin_set_config` has 017's maintenance shape check back (lost in 033, carried by 034). While restoring it I found the check never worked for a missing field: `jsonb_typeof` of a missing key is NULL, the OR chain comes out NULL, and IF treats NULL as false, so `{"enabled": true}` with no message or text was accepted for both maintenance and announcement since 015. Every `jsonb_typeof` is now wrapped in `coalesce` (T065-c). `admin_set_config` and `admin_set_override` take a transaction advisory lock on the key before the previous-value read, so two admins creating the same new key or override at once no longer both log `previous.exists = false` (T064-c). The test proves this with two real parallel connections, and a mutation run without the lock fails it.

Two new RPCs let an admin read every site_config key (private ones too) and flip a key public or private: `admin_list_config()` on the read tier, `admin_set_config_public(key, public)` on the destructive tier, audited as `config_visibility` with previous and new. announcement, maintenance and features refuse to go private (`required_public`) because the app reads them signed out. The Site tab control is T270's (T066-b).

Guides now have a real view counter. `public_guide_opened`, which already fires on every open by someone other than the author, counts one view per viewer per guide per UTC day. Viewers are a sha256 of a private salt, the day and the viewer key (user id when signed in, otherwise the address by the same cf-connecting-ip first rule as 037, IPv6 by /64), so the same person hashes differently each day. Dedupe rows live two days; the running total is in `guide_view_counts`. No client role can read or write any of the three tables (T067-a). `admin_list_public_guides` reads those totals, says `viewsCounted: true`, and takes `p_limit` (default 100, max 500) and `p_offset`; the zero-argument 036 version is dropped so a call without arguments stays unambiguous, which also means today's admin page keeps working unchanged (T067-b).

`export_user_data` is now schema 2: the caller's own `edge_errors` rows are in the file (T071-d), and `contentOverrides` carries `authorNote`, `status`, `reviewBy` and `country` instead of `note`. 024 is not edited.

`content_overrides` gains a `country` column (ISO code of the wire file, checked `^[A-Z]{2}$`, not readable by the public), `admin_set_override` gains `p_country` (upper-cased, kept on a later save that sends none, `bad_country` when malformed), and `admin_list_overrides` returns it. The old `note` column, which 043 kept only as a mirror of `author_note`, is dropped along with the mirroring (T074-d). In the app, a save from the grid sends the grid's country, and an override opened from the review or orphan list loads its pipeline item from that country's file, so the editor shows the original photo and the diff viewer its before-column (T074-e, T076-b). Overrides saved before 045 have no country until their next save and keep the old stand-in. `adminSetOverride` retries without `p_country` when PostgREST answers PGRST202, so the new page works before and after the paste.

`admin_get_audit` gates on `admin_guard('read')` instead of `is_admin()`, so the last callable admin function without a rate budget has one (T077-c). The security test now accepts only `admin_guard` as the admission check.

The 045 header corrects 020's comment about trigger order: BEFORE triggers fire in name order, so `trip_plans_guard_coplanner` runs before `trip_plans_stamp_published`, which is the order 038 and 039 depend on (T069-g).

Tests: `test_admin_rpc_security.mjs` reads every `NNN_*.sql` file in filename order instead of a hand-kept list, asserts a floor of 44 migrations and that no two share a number, and stubs Supabase's default grants on schema public, which was the unexpressed prerequisite (023's self-check reads trip_plans as a client role) that kept the list manual (T077-a). `test_admin_audit_rollback.mjs` takes the expected guard tier from the last applied migration that defines each function, so it stays right if the test ever applies 034 (T065-e).

045 builds on nothing 044 creates and redefines nothing 044 replaces (grant_pass, ai_refund, ai_consume, admin_margin, the funnel and OSS functions). All tests apply 044 too, since they go in filename order.

## Files touched

**Created:**
- supabase/migrations/045_admin_followups.sql (root repo)
- continent-app/scripts/admin/test_admin_followups.mjs (app repo)
- Execution/P4/T268-admin-followups-db.md

**Modified:**
- continent-app/scripts/admin/test_admin_rpc_security.mjs
- continent-app/scripts/admin/test_admin_audit_rollback.mjs
- continent-app/src/admin/ContentSection.jsx
- continent-app/src/auth/admin.js
- continent-app/src/components/admin/useErrText.js
- Execution/_OPEN.md (14 rows closed, 7 rows added)

## Commands run

```
# throwaway cluster, Git Bash; $S is the session scratchpad
"C:/Program Files/PostgreSQL/18/bin/initdb.exe" -D $S/t268/pgdata -U postgres --auth=trust -E UTF8
"C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe" -D $S/t268/pgdata -o "-p 55441" -l pg.log start

# from wt/T268-app (the root migrations are in the sibling worktree)
PGPORT=55441 CARTA_MIGRATIONS_DIR=../T268/supabase/migrations node scripts/admin/test_admin_followups.mjs
PGPORT=55441 CARTA_MIGRATIONS_DIR=../T268/supabase/migrations node scripts/admin/test_admin_rpc_security.mjs
# every other scripts/admin/test_*.mjs was run through a scratch folder with
# junctions continent-app -> wt/T268-app and supabase -> wt/T268/supabase,
# node --preserve-symlinks-main, because they resolve ../../../supabase

# browser: production build without public/, public joined in by junctions,
# vite preview on 5201, a scratch copy of verify_admin_panel.mjs (port 5201,
# longer waits, the T268 checks below); not committed
npx eslint src/admin/ContentSection.jsx src/auth/admin.js src/components/admin/useErrText.js
```

## Config and secrets set

None. The app worktree needed a copy of the main checkout's `.env` for the browser build (gitignored, removed afterwards).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Callable admin functions without a rate budget | 1 (admin_get_audit) | 0 | -1 |
| Migrations applied by test_admin_rpc_security.mjs | 34 (hand-kept list) | 44 (whole directory) | +10 |
| Its assertions | 122 | 137 | +15 |
| admin_* functions it discovers | 37 floor | 39 found, floor 39 | +2 |
| Guide views shown in the Guides tab | always 0 (viewsCounted false) | counted, deduplicated per day | real |
| admin_list_public_guides rows per call | all (216 KB at 503 guides) | 100 by default, 500 max | paged |
| Keys in the GDPR export | 4 data arrays | 5 (edgeErrors) | +1 |
| Malformed maintenance values accepted | {"enabled":"yes"}, missing message | none | closed |
| Override opened from the review list: original photo and diff base | none | loaded when the row has a country | fixed for rows saved after 045 |

All fifteen `scripts/admin/test_*.mjs` pass on the 55441 cluster (the new one: 86 of 86). The scratch admin harness ran 41 ok and one failure, "the non-admin hub changed shape", which is the known T042-d (owned by T270's D2 list). Both new browser checks passed at 1360px and 380px: a grid save sends the grid country (ES), and the review-list editor for a lake with country IT shows Lake Como's pipeline photo and "Lake Como" in the diff before-column, with no sideways scroll at 380px.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A maintenance value with no message was accepted | jsonb_typeof of a missing key is NULL and IF treats the NULL chain as false; present since 015 for announcement and since 017 for maintenance | coalesce on every jsonb_typeof in 045, asserted in the test |
| Re-pasting 036 after 045 fails | 036's self-check calls admin_list_public_guides() and two versions exist | Documented in the 045 header and tested; paste 045 again |
| The first race test was flaky | Windows psql spawn took longer than the fixed 700 ms head start | Poll pg_locks until the first writer holds the advisory lock; hold for 5 s |
| verify_admin_panel never reached the hub on a dev server | the machine was under load from parallel sessions; dev transforms took minutes | Ran against a production build with a 5201 preview instead |
| Disk full (0 bytes free on C:) during the app commit | not this task; other sessions writing | Commit landed intact (checked with git show); scratch build deleted. Owner row T268-f |

## What is still open

The owner pastes 045 in stage 2 of _OPEN-MASTER after 042, as row 15, and looks for "admin followups self-check passed" (T268-a). It needs 035, 036, 040 and 043 live first; its self-check says which is missing. The app commit can deploy before or after: the override save falls back without the country, and both shapes of the MFA refusal read the same. The re-paste table in _OPEN-MASTER 2.5 should gain the rows in the 045 header: re-pasting 014, 015, 016, 017, 018, 019, 024, 032, 033, 034 or 036 means pasting 045 again, and re-pasting 043 now fails at its first UPDATE because note is gone. I may not edit _OPEN-MASTER, so this is a row for whoever owns it (T268-b).

The guide view counter keeps a per-day salted hash of a reader's user id or address for two days. That is pseudonymous personal data, so the privacy policy needs a sentence next to the T071-b one; T270 owns PrivacyPolicy (T268-c).

The UI halves of T066-b and T067-b are not built: a Site tab control over `adminListConfig` and `adminSetConfigPublic` (wrappers are in admin.js), and a "Show more" in the Guides tab using `p_limit` and `p_offset`. T270 says it uses the 045 RPCs (T268-d).

The Content tab cannot open trails by country: `public/trails/index.json` names the country `country`, while ContentSection filters on `cc`, so the trail grid has no countries. Found while checking country codes; not touched (T268-e).

`verify_admin_panel.mjs` hardcodes port 4192 and 10 s waits, which fail under load, and it does not yet carry the two T268 checks (grid save sends country; review-list editor loads the pipeline item). Folding them in belongs with the D3 harness repairs (T268-g).

C: was full while this task committed. Nothing was lost, but every parallel session is at risk until space is freed (T268-f).

## Rollback procedure

Before the paste: revert the two commits (root `git revert <045 commit>`, app `git revert <app commit>`). The app change is safe on its own either way.

After the paste, in the SQL editor, follow the DOWN block at the top of 045: re-add `note` filled from `author_note`, drop the seven-argument `admin_set_override`, the `country` column, the two config RPCs, the paged guides reader and the three guide view tables, then paste 032's delete and ban, 019's `public_guide_opened`, 036, 024, 014's `admin_get_audit`, 034's `admin_set_config` and 043 whole, and reload the schema. Dropping the view tables loses the counted views and dropping `country` loses the codes saved since; nothing else is one-way.
