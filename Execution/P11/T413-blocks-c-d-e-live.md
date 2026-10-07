# Execution Report: T413

## Task ID

T413: record blocks C, D and E1 to E3 of the owner runbook as live (the deploy, the pastes, the functions)

## Date

2026-10-07

## What changed

On the evening of 2026-10-07 the owner and this session put four days of merged work live. Production on Cloudflare Pages now runs waves 6 to 16c, including the darker contrast colours of T363, which the owner approved from the compare screenshots. The database is now current up to migration 051, apart from the Stripe set. The register had recorded almost all of stage 2 as never pasted, and that turned out to be wrong. A read-only catalog probe, run by the owner in the SQL editor, showed 017 to 024, 028 to 030 and 032 to 043 already live, with 025, 026, 027, 031 and 044 to 048 missing. Stage 2 therefore shrank to seven pastes, which the owner made in order after a fresh encrypted dump: 025, 026, 045, 046, 047, 048 and 051. Each ended in Success, and every one of these files raises an exception on a failed self-check, so Success means each check passed. 025 and 026 went in ahead of stage 10 because 048's export reads their columns (row T365-b). Both only add nullable columns and redefine grant_pass, which only the undeployed Stripe webhook calls. Migration 051 changes the report and takedown signatures, so the build went live minutes after it: a live call to report_guide answered good_faith_required before the deploy. Around the deploy, this session pushed main, created the carta-prerender bucket that wrangler.toml binds, uploaded the quiet status file (HTTP 200), built with build:pages, deployed a preview and checked it in a headless browser, deployed production and checked it the same way. The owner uploaded the data (verify-data PASS), turned on pg_cron and pg_net, and scheduled the moderation purge. This session redeployed plan-day (version 11), parse-booking and suggest-city. The prune dry run showed the live prune would delete three objects that must stay, so it was not run (row T413-a).

## Files touched

Root repository only.

**Created:**
- Execution/P11/T413-blocks-c-d-e-live.md
- Execution/P11/T362-live-migration-probe.sql (the catalog probe for 017 to 048)
- Execution/P11/T362-live-migration-probe-2.sql (the body probe for 032 to 034)

**Modified:**
- Execution/_OPEN.md (36 rows closed by T413, rows T413-a to T413-c added)
- Execution/_OWNER-RUNBOOK.md (a Progress section at the top)

**Deleted:**
- None

## Commands run

```
git push origin main                                         # C1
npx wrangler r2 bucket create carta-prerender                 # C2, the binding in wrangler.toml
node scripts/status_notice.mjs --clear
npx wrangler r2 object put carta/data/status.json --file <tmp>/carta-status.json --content-type application/json --cache-control "public, max-age=60" --remote
npm run build:pages                                           # C3, in continent-app
node scripts/r2/push-data.mjs --live                          # owner, Git Bash
node scripts/r2/verify-data.mjs                               # owner: PASS
npx wrangler pages deploy dist --project-name carta-app --branch preview
# owner: dump to r2:carta/archive/db/supabase/supabase-2026-10-07.dump.gpg (128,646 bytes)
# owner: the two probes, then 025, 026, 045, 046, 047, 048, 051 in the SQL editor
npx wrangler pages deploy dist --project-name carta-app --branch main
node scripts/r2/push-data.mjs --rclone-dry-run --prune        # owner: read, live prune not run
# owner: pg_cron and pg_net on; select cron.schedule('carta_moderation_retention', '17 3 * * *', ...)
npx supabase functions deploy parse-booking --project-ref ntssxktaduxzpsmejwyv
npx supabase functions deploy suggest-city  --project-ref ntssxktaduxzpsmejwyv
npx supabase functions deploy plan-day      --project-ref ntssxktaduxzpsmejwyv --use-api
```

The first plan-day deploy stalled while it downloaded the local edge-runtime Docker image and left the old version live. The `--use-api` retry bundles on Supabase's side and went through. The headless checks loaded `/` and `/#dest=LIS` at 380 and 1280 px and counted data-host responses, other failed responses, console errors and horizontal scroll.

## Config and secrets set

Cloudflare: the R2 bucket carta-prerender (private, no domain), and the object data/status.json (`{"enabled": false}`, Cache-Control public, max-age=60). Supabase: the pg_cron and pg_net extensions, and the cron job carta_moderation_retention at 17 3 * * *. No secret changed.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Waves live in production | 1 to 5 | 1 to 16c | +11 waves and the catch-up |
| Migrations 017 to 051 live (of 33 numbered files present) | 23 | 30 | +7 pasted (025, 026, 045 to 048, 051) |
| Data-host responses failing on / and #dest=LIS | not measured | 0 of 488 | |
| Console errors on those pages | not measured | 2 (the forecast CSP, row T413-b) | |
| data/status.json | 404 | 200 | fixed |
| Open owner rows | 242 after T362 | 234 | 36 closed here; waves 16b, 16c and T369 added rows in between |

The before count of 23 is the catalog probe's own result (017 to 024, 028 to 030, 032 to 043). 033 and 034 were confirmed by their bodies, and 049 and 050 do not exist yet. Still not live: 027, 031 and 044 (stage 10).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first build vanished before the upload | The wave orchestrator's close-out deletes continent-app/dist and dist-data in the main checkout | Waited for the orchestrator to go idle, then rebuilt |
| The register said stage 2 was never pasted | Earlier pastes were made without closing their rows | The catalog probes; 36 rows closed here with what was observed |
| plan-day kept its old version | The local Docker image pull stalled | `--use-api` |
| The live prune would delete data/status.json, data/.keep and data/_test | Phase 2 deletes every top-level name not in R2_TIER | Not run; row T413-a |

## What is still open

Row T413-a: the prune must keep data/status.json, data/.keep and data/_test before anyone runs it live. Row T413-b: the 7-day forecast is blocked by the CSP in production; it already was before this deploy, and it goes with the paid Open-Meteo decision (runbook J5). Row T413-c: two button labels are cut off on the destination page at 380 px. Still the owner's from block E: the cap proofs (E4, rows T036-b and T037-b) and the one-week read on or after 2026-10-14 (E5). Not checked tonight, rows left open: the admin Overview cards (T300-s, T270-b), the bot day plan (LIVE-a), a statement of reasons through a signed-in session (T281-b), and the TOTP enrolment row (T063-b). 032 is live, so delete and ban already need the code. Wave 17's database gate is met.

## Rollback procedure

The deploy: in the Cloudflare dashboard, Workers and Pages, carta-app, Deployments, roll back to the deployment of 2026-10-02. Then guide reports and takedowns fail, because 051 changed their signatures, unless 051 is also rolled back by its DOWN block (in the file's header, with its one-way steps). The migrations: each file carries its own DOWN block; the dump of 2026-10-07 in archive/db/supabase/ is the full restore point. The functions: redeploy an earlier commit of supabase/functions. The register and runbook changes: `git revert` of this task's merge.
