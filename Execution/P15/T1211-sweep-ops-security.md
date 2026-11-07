# T1211: register follow-up sweep, ops and security

ROADMAP item: register follow-up (ops and security), status recorded on C10 and H8. Round 3 session S127, batch 15. Branch `p15-s127-sweep-ops-security`, from `p15-round3`.

## Date

2026-11-07

## What changed

The round 2 ops and security rows (raised by T1157 to T1164) were swept: 32 open `next task` rows before, 19 closed by T1211, 13 still open with a reason below, 0 moved to the owner. In code: parse-booking now resolves every fetch hop and refuses private, loopback, link-local, metadata and mapped addresses and any redirect into them (T1164-m); Pages' default `Access-Control-Allow-Origin: *` on static answers is detached in `_headers` (checked on a local `wrangler pages dev`: header present before, absent after); every Edge Function wrapped in `withCors` writes one JSON `auth_refused` line per 401 or 403, with no token or address in it; the Edge Function auth tests run a second time on the real Deno runtime in CI (80 of 80 pass under Deno 2.9.6); the uptime monitor can alert on a nightly backup older than 36 hours (off until the owner switches it on); every migration now rebuilds and passes its own self-test on a plain Postgres (`schema.sql` loaded first, the stub's `auth.uid()` reads `request.jwt.claims`), and the backup test is strict about it; the SLO panel is an Admin section and `slo.json` is in the config reference. In docs: the six security documents ASVS L2 expects are written, ASVS gaps went from 50 to 39 (169 met), CLAUDE.md points the deploy at `ship.mjs`, names `worktree.mjs` and bans Bash heredocs for writing files, and the HANDBOOK, SCHEMA and two area docs name the files that exist after T1163. The CSS of the 26 components T1163 deleted is gone (239 rules, 855 lines, CSS -19.6 KB raw and -3.0 KB gzip). Lint warnings went from 36 to 14: the 22 removed were all capitalised args used as JSX tags.

## Research

- **T1164-l, malware scanning of uploads** (research subagent, 2026-11-07). Options: ClamAV (clamd, GPLv2, needs 1.2 to 2.4 GiB RAM on the shared 4 GB box), VirusTotal (free tier bars commercial use, uploads are shared with partners: not acceptable for user photos), Cloudflare WAF malicious-upload detection (Enterprise add-on, only for requests through a zone; Supabase has none), commercial APIs (Cloudmersive, GuardDuty for S3 as reference: a new US subprocessor and cost), and the current rebuild (content disarm and reconstruction). Choice: keep the rebuild as a documented compensating control. Signature scanners find known samples, while what a hostile JPEG, PNG or GPX carries is a polyglot, a metadata script or a trailer, which the rebuild removes; the original upload is never served. Revisit with ClamAV on a separate VM if PDF, Office or archives are ever accepted. Links: https://github.com/OWASP/ASVS/blob/master/5.0/en/0x14-V5-File-Handling.md, https://docs.clamav.net/manual/Installing/Docker.html, https://blog.clamav.net/2024/01/clamav-debian-multi-arch-docker-images.html, https://docs.virustotal.com/docs/terms-of-service, https://developers.cloudflare.com/waf/detections/malicious-uploads/, https://cloudmersive.com/virus-api, https://arxiv.org/abs/2407.01529 (Koch et al., image polyglots).
- **T1164-k, Deno test job.** The research is T1164's (its report, Research: a `deno test` job with an import map and a pinned setup-deno). Pinned here: `denoland/setup-deno` v2.0.5 (commit 22d081ff, 2026-07-03) and Deno 2.9.6 (2026-08-27), the version run here.
- **T1159-c, backup alert.** No new tool: the existing 15-minute uptime monitor (`scripts/monitor/check.py`) reads the `status/backup.json` the nightly backup already writes.
- Everything else: none chosen.

## Files touched

- CI: `.github/workflows/ci.yml` (load smoke test step, `edge-deno` job), `.github/workflows/zap.yml` (the local scan gets the deploy's 404.html).
- App: `continent-app/src/admin/AdminPage.jsx`, `src/components/admin/SloPanel.jsx`, `src/i18n/{en,de,es,fr,it,nl}.js` (`admin.nav.slo`), `eslint.config.js`, `public/_headers`, 19 stylesheets under `src/styles/`, `src/planner/TripSummary.css` and `src/styles.css` (dead CSS; `styles/29-derived-modules.css` and `styles/35-lifestyle-slider.css` deleted), `tests/edgeHttp.test.mjs`, `tests/parseBookingSsrf.test.mjs` (new), `tests/fixtures/edge-auth/world.mjs`, `tests/fixtures/edge-auth/deno.json` (new).
- Edge Functions: `supabase/functions/_shared/http.mjs` (`securityEvent`), `supabase/functions/parse-booking/fetchGuard.mjs` (new), `parse-booking/index.ts`, `parse-booking/README.md`.
- Ops and box: `ops/supabase_local_stub.sql`, `scripts/monitor/check.py`, `scripts/monitor/targets.json`, `scripts/stays_scrape.bat`, `pipeline/finish_run.ps1`, `pipeline/trails/refresh_after_scenic.ps1`, `pipeline/beaches/run_reenrich.ps1`, `pipeline/beaches/run_reenrich_rest.ps1`, `pipeline/cycling/run_all.ps1` (one `PYTHONUTF8` line each, contents only, no moves), `requirements-ml.txt`, `infra/hetzner/README.md`, `pipeline/README.md`.
- Tests (Python): `tests/test_monitor_check.py`, `tests/test_backup_restore.py`.
- Docs: `CLAUDE.md`, `docs/README.md`, `docs/HANDBOOK.md`, `docs/SCHEMA.md`, `docs/areas/climate-crowds.md`, `docs/areas/trip-library.md`, `docs/reference/config.md` (generated), `scripts/docs/config_reference.py`, `docs/runbooks/backup-restore.md`, `docs/security/asvs.md`, `docs/security/threat-model.md`, new `docs/security/crypto-inventory.md`, `log-inventory.md`, `data-classification.md`, `session-policy.md`, `dependency-remediation.md`, `resource-heavy-features.md`.
- Register and plan: `Execution/_OPEN.md`, `Execution/_OPEN-CLOSED.md`, `ROADMAP.md` (C10 and H8 status).

## Commands run

```
python -I scripts/docs/config_reference.py                      # regenerate docs/reference/config.md
npx wrangler@4.158.0 pages dev .fastbuild --port 8788           # header and 404 check, local only
deno test --no-check --allow-read --allow-env --allow-net=none \
  --config continent-app/tests/fixtures/edge-auth/deno.json continent-app/tests/edgeAuth.test.mjs
pip install --dry-run model2vec==0.10.0 -c constraints.txt      # half 1 resolves (hub 2.4.0)
pip install --dry-run sentence-transformers==3.3.1 "huggingface-hub>=0.34,<1.0" -c constraints.txt   # half 2 resolves (hub 0.36.2)
```

No pipeline run, no migration applied, no deploy, no scan of anything but a local build.

## Config and secrets set

None. `scripts/monitor/targets.json` gains a `backup` block with `enabled: false`.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Open `next task` rows of T1157 to T1164 | 32 | 13 | -19 closed, 0 moved to the owner |
| ASVS 5.0.0 L2 gaps (`docs/security/asvs.md`) | 50 (met 158) | 39 (met 169) | -11 |
| `Access-Control-Allow-Origin` on `/` and `/boot.json`, local Pages | `*` | absent | detached |
| Unknown path on local Pages with the deploy's 404.html | 200 (fast build, no 404.html) | 404 | as deployed |
| Migrations failing their self-test on a plain Postgres | 2 (048, 056) | 0 | -2 |
| Edge auth tests on the Deno runtime | 0 | 80 pass | +80 |
| `npm test` | 1,963 pass | 1,980 pass, 0 fail | +17 |
| Lint warnings (`npm run lint`) | 36 | 14 | -22 (JSX tag false positives) |
| Built CSS, fast build | 1,271,044 B raw, 211,269 B gzip | 1,251,414 B raw, 208,301 B gzip | -19,630 raw, -2,968 gzip |
| Design lint violations | 4,595 | 4,459, 0 new | -136 |
| Config reference keys | 305 in 6 files | 324 in 7 files | +19 (slo.json) |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The local branch existed and `git reset --hard` was refused | an earlier start of this session | fast-forward merge of `origin/p15-round3` (the branch had no own commits) |
| Two subagent worktrees started on `main`, not the sweep branch | worktree isolation takes the default branch | each agent rebased its work onto the sweep branch before committing; merged here |
| `asvs.md` merge conflict | two agents changed the summary counts | recounted per chapter: totals 169, 45, 39 match the requirement rows |
| `T1211-a` landed mid-file | an agent moved T1164-m in place | moved the row to the end of `_OPEN.md` |
| `schema.sql` not found in the backup test | the test copies the repo into a temp dir readable by `postgres` | copy `supabase/schema.sql` there too |
| Full pytest: 2 failures (`test_rating_inputs`, `test_rating_stability`) | Git LFS pointer files in this container; CI pulls them | none needed; unrelated to this task |

## Screens checked

No traveller-facing behaviour change was intended. `verify_csp.mjs` loaded 40 screens of the fast build with the real header and saw 0 CSP violations. The Admin SLO section is owner-only and rendered by `tests/slo.test.mjs`. No screenshots were taken: the dead-CSS removal only drops selectors no live code uses, and the end check of the batch should still glance at the place page, the day planner (`.flash` kept) and the Admin bar at phone and desktop width.

## What is still open

Rows of this group still open, with the reason:

- T1157-b: there is still no `/api/stays` Pages Function; stays come from static shards, so there is nothing to wire.
- T1158-c: the 10x load figure needs real per-user rates from E4 and K12, which have no live data yet.
- T1159-b: retire the weekly dump only after the nightly one has run for a week (gated on owner step T1159-a).
- T1160-d: review SLO targets after a month of real snapshots (time-gated on T1160-b).
- T1161-h: close the five old rows once the owner rows T1161-a to -e are done.
- T1161-i: the dry-run write is in `run_pipeline.py`, which S123 owns this batch (with T1107-e).
- T1163-a, T1163-f, T1163-g: refactors their own rows defer to "where a screen is next touched"; S124 and S125 edit those screens this batch.
- T1163-e: moving 125 exports touches dozens of app files that S124 and S125 are editing this batch.
- T1164-c: an insert-only path for the Pages AI sink needs a key decision (a narrow role means a new signed JWT secret) and live verification against Supabase.
- T1164-g: PKCE changes how sign-up confirmation is detected (`type=signup` in the hash) and breaks magic links opened on another device; it cannot be tested here without Supabase, and the cross-device trade-off wants a look on the preview.
- T1164-i: the refused-request log lines are in; shipping them and failed sign-ins to a separate store with an alert (Sentry exists, T1120) and the SQL admin-guard refusals remain.

New rows: T1211-a (owner decision: an open-internet exception or an egress proxy for link import), T1211-b (owner: confirm `Deno.resolveDns` on the Edge runtime), T1211-c (owner: switch on the backup alert), T1211-d (config reference reader for configs passed as arguments), T1211-e (`.flash` CSS clash), T1211-f (Sign out scope), T1211-g (refine token key), T1211-h (SECRETS.md rows), T1211-i (dependency coverage), T1211-j (`/api/ask/answer` limit), T1211-k (parser hardening behind the upload control).

## Owner steps (for the checklist)

- [T1211-a] Decide how link import reaches the internet | ASVS wants an outbound allowlist and a tiny DNS rebinding window remains after the new address check | read the T1164-m notes in supabase/functions/parse-booking/README.md; choose keep the open-internet exception (record it) or route parse-booking through an egress proxy that checks the connected address; tell the next session | docs/security/asvs.md (V13.2.4, V13.2.5)
- [T1211-b] Check DNS lookups work on the Edge runtime | the new SSRF check fails closed, so without Deno.resolveDns every URL import would answer url_unreachable | deploy parse-booking to the preview project; import one booking by URL; if it answers url_unreachable, report it before deploying to main | supabase/functions/parse-booking/README.md
- [T1211-c] Switch on the backup freshness alert | a stopped nightly backup is otherwise invisible until a restore is needed | after T1159-a, open https://data.carta-europetravel.com/status/backup.json and check it answers 200; set "backup.enabled" to true in scripts/monitor/targets.json; commit | docs/runbooks/backup-restore.md

## Rollback procedure

`git revert` of the T1211 commits on `p15-s127-sweep-ops-security` (or of the merge). Nothing is one-way: no data changed, no migration was written or applied, nothing was deployed. Register moves revert with their commits.
