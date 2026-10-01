# Everything that is open, as one plan

Rewritten 2026-10-01, covering T001 to T077. Work down this file from the top.
Each stage says who does it, about how long it takes and how you know it
worked. When a stage says "Claude session", open Claude Code and say "run
session A from _OPEN-MASTER.md" (or B, C, D).

This file now contains the three procedure files `P2/_OPEN-stripe-launch.md`,
`P2/_OPEN-gemini-billing.md` and `P3/_OPEN-hetzner.md`; you do not need to open
them. `_OPEN.md` stays the record of every row, and where this file and a
report disagree, the report wins. Row ids in brackets join each step back to
`_OPEN.md`.

## The whole plan on one screen

| Stage | Who | Time | What it gets you |
|---|---|---|---|
| 0 | You | done | 16.8 GB free on C:, the master snapshot off the laptop |
| 1 | Claude session A | one session | The blockers fixed and all task branches merged into main |
| 2 | You | 45 min | Admin panel, MFA, moderation, telemetry and the GDPR export live |
| 3 | You | 45 min | Gemini compliant, AI cost caps proven, AI telemetry live |
| 4 | Claude session B | one session | The pipeline safe to run unattended, R2 scripts ready |
| 5 | You | an evening | R2 bucket, everything copied off the laptop, app data served from R2 |
| 6 | You, then Claude session C | an hour | Off Vercel onto Cloudflare Pages, build artifacts untracked |
| 7 | You | about 2 days, mostly waiting | The weekly pipeline on a Hetzner box, about 70 GB freed on the laptop |
| 8 | You | short sessions over 2 weeks | Self-hosted images, takedowns and credits proven live |
| 9 | Claude session D and onward | whenever | All remaining code work, no manual steps |
| 10 | You | 2 hours | Stripe, last, once the eenmanszaak exists |

After stage 10 there is a short list of product decisions (none blocks a
stage) and three loose ends.

Rules that hold everywhere: never `supabase db push` against
`ntssxktaduxzpsmejwyv`, paste migrations by hand into the SQL editor. After
every paste, look for the self-check notice named in the step; it is the
difference between "it ran" and "it is right". A push to GitHub only makes a
Vercel Preview; promote it by hand.

---

# Stage 0. You, 15 minutes, on the laptop

Done 2026-10-01. C: has 16.8 GB free, the Visual Studio installer cache
(T020) was already gone, and the master snapshot is on `D:\carta-backups\`
(T005).

Docker is deliberately left alone. Its disk holds the trailslab, valhalla and
brouter volumes, and Clean / Purge data would delete them, so T023's vhdx
reclaim is dropped. Stage 7.11 says when it is safe to shrink, and it stays
optional.

---

# Stage 1. Claude session A: the blockers and the merge

You do nothing here except say yes to the push at the end.

1. Migration 018 line 93: change the regex bound `{5,600}` to `{5,255}`.
   Postgres caps repetition at 255 so the file fails on any fresh database
   and breaks `supabase start` locally (T031-d).
2. The admin page's MFA flow: TOTP enrolment and an aal2 step-up before
   delete and ban, and the `mfa_required` sentence in `useErrText.js`
   (T063-a). You need it in stage 2, before migration 032.
3. Retire every fare harvest. There is no live fare source any more:
   Ryanair goes the way of Wizz Air, Vueling, Volotea and Travelpayouts. Remove
   `fares`, `fares_targeted`, `wizz_fares`, `vueling_fares`, `volotea_fares`
   and `tp_stage` from the weekly schedule in `run_pipeline.py` and from
   `infra/hetzner/cax11/weekly_tasks.txt`, and empty `HARVESTED_FAMILY` in
   `pipeline/harvest_all_origins.py` and `src/ingestion/pricing/travelpayouts.py`
   (T046-l, T058-b). `fare_history` and `fare_model` leave the weekly
   schedule too: with no new fares they would re-append and retrain on the
   same frozen data every week. The scripts and the fare model stay in the
   repository, so a source can be switched back on later.
4. The fares already in the app are frozen, and they are 46 to 54 days old
   and getting older (T048-m). Show every flight price as an estimate, never
   as a quote, using the estimate styling Explore already has (T058-e). This
   is the one user-facing change in this session.
5. `continent-app/scripts/r2/provision.sh`: add `--remote` to
   `wrangler r2 object put`, or its markers land in local Miniflare and the
   R2 verify in stage 5 fails (T045-f).
6. `continent-app/src/i18n/en.js`: remove the duplicate `admin.colAction` key
   that fails eslint (T074-f).
7. Git housekeeping, T252: a mirror backup, then `git reflog expire
   --expire=now --all`, `git gc --prune=now --aggressive` and `git lfs
   prune`. About 901 MB back, no commit hash changes, no force-push.
8. The merge. About sixty task branches (p0 to p4) are unmerged and
   `origin/main` is still `8b53babed`. Merge them all into `main` in stack
   order, in both repositories (the root and `continent-app/` are separate
   git trees), and confirm `npm run build` passes. This one merge closes
   three owner rows: the P2 stack merge (P2-merge), the box needing a branch
   with `infra/hetzner/` (T046-b), and 043 needing the T074 build deployed
   (T074-a). The Stripe code merges too; it does nothing until stage 10 gives
   it secrets. Commit `4b2d8e19f` carries eight tasks' work under a T057
   message; it stays as a recorded attribution defect (T062-a).
9. Claude stops and asks before `git push`. Say yes.

Done when: `origin/main` contains `infra/hetzner/` and the T077 test file, and
a Vercel Preview of `main` exists.

---

# Stage 2. You, 45 minutes: admin, moderation and telemetry

The app is already written against every migration in this stage. Until each
is pasted the matching screen shows a "could not find the function" error or
quietly drops data. This is the cheapest result in the whole plan.

## 2.1 Before the first paste

1. Promote the stage 1 Preview of `main` to Production in Vercel.
2. Take a fresh encrypted Supabase dump and copy it to `D:\carta-backups\`,
   the same way T004 did. The standing rule is a fresh dump before any batch
   of migrations.
3. In the Supabase Dashboard, Authentication, confirm TOTP MFA is enabled.
   Then, in the app's admin page, enrol a TOTP factor on the owner account
   with the flow stage 1 built (T063-b). Pasting 032 before this locks the
   delete and ban buttons.
4. In the SQL editor, check that 018 is live:
   `select to_regclass('public.content_overrides');`
   It should return the table name (018 was applied before the regex bound
   was noticed, per T066 and T077). If it returns null, paste
   `018_content_overrides.sql` first, as fixed in stage 1.

## 2.2 The pastes, in this order

Strictly one after the other. Each self-check asserts the ones before it.

| # | Migration | Row | Look for | Until it is pasted |
|---|---|---|---|---|
| 1 | 022_paywall_events | T034-a (half) | it runs clean | 024 cannot apply (it exports these rows) |
| 2 | 024_export_user_data | T020 | export user data self-check passed | the GDPR download in the account panel reports a missing function |
| 3 | 032_admin_mfa_destructive | T063-c | admin MFA self-check passed | delete and ban need only a password session |
| 4 | 033_admin_audit_rollback | T064-a | admin audit rollback self-check passed | the audit log has no previous/new detail |
| 5 | 034_admin_guard_tiers | T065-a | admin guard tiers self-check passed | config and override saves stay on the read tier |
| 6 | 035_site_config_visibility | T066-a | site config visibility self-check passed | every site_config key is world-readable |
| 7 | 036_admin_public_guides | T067-c | admin public guides self-check passed | the Guides tab shows an error |
| 8 | 037_content_reports | T068-a | content reports self-check passed | the report form on a guide answers "did not send" |
| 9 | 038_admin_unpublish_guide | T069-a | admin unpublish guide self-check passed | Unpublish errors and nothing changes |
| 10 | 039_statement_of_reasons | T070-a | statement of reasons self-check passed | a takedown gets no statement of reasons |
| 11 | 043_override_review_lifecycle | T074-a | override review lifecycle self-check passed | the override review page cannot save |
| 12 | 040_edge_errors | T071-a | edge errors self-check passed | every AI failure makes one dropped RPC call |
| 13 | 041_pipeline_health | T072-b | pipeline health self-check passed | the Overview card reads hasRun:false |
| 14 | 042_parse_failures | T073-a | parse failures self-check passed | structural booking-parse failures go unrecorded |

After paste 6, run `select key, public from public.site_config;` and confirm
only announcement, features and maintenance are public (T066-a).

022 is the paywall events table only. It needs no Stripe setup and does
nothing visible on its own; it is here because 024 reads it. Its partner 027
waits for stage 10.

## 2.3 Two things that are not pastes

1. On the machine that runs `run_pipeline.py` (the laptop now, the box after
   stage 7), set `CARTA_SUPABASE_URL` and `CARTA_SUPABASE_SERVICE_KEY`
   (T072-a). Without them the pipeline health card stays empty even after
   paste 13.
2. Redeploy parse-booking, which was changed to return reason codes and
   never deployed (T073-b):

```
supabase functions deploy parse-booking --project-ref ntssxktaduxzpsmejwyv
```

## 2.4 Check it worked

Open the admin page: the Overview, Guides, Reports, Content and Audit tabs
all load without a missing-function error, and delete asks for your TOTP
code. In GitHub, the `admin-rpc-security` Actions job from the stage 1 push
is green (T077-d). Working through 2.2 is also what makes the live database
match the migrations T077's test checks (T077-b).

## 2.5 The re-paste trap, for later

Nothing fails at paste time when a later re-paste undoes an earlier
migration's work; a feature just stops working. Keep this table:

| If you ever re-paste | It undoes | Paste again |
|---|---|---|
| 014 | 035's visibility rules | 035 |
| 033 | 034's guard tiers | 034 |
| 018, 033 or 034 | 043's review lifecycle | 043 |
| 020 | 038's takedown exception, so every takedown fails | 038 (T069-b) |
| 020, 037 or 038 | 039's takedown body and report fields | 039 (T070-b) |
| 016 | 040's entry on the health list | 040 |

The rule behind all six: after pasting any migration by hand, re-paste every
later migration that names it.

## 2.6 After the first real content report

Run `select source_header, count(*) from public.content_reports group by 1;`.
`cf-connecting-ip` means the per-address limit is sound; `x-forwarded-for`
means a Claude session must change `report_guide` to take the last trusted
entry (T068-c).

---

# Stage 3. You, 45 minutes: Gemini compliance and AI telemetry

The Google Cloud project behind `GEMINI_API_KEY` has no billing account that
can be shown. The Gemini API Additional Terms effective 2026-03-23 allow only
Paid Services when serving users in the EEA, Switzerland or the UK, and a Paid
Service is defined by the billing account existing, not by money changing
hands. So step 1 is a compliance step, and the budget makes sure it never
becomes a spending one.

## 3.1 Google Cloud console

1. Find the project that issued the key in use (AI Studio or the Credentials
   page), then Billing, Account management: link that project to an active
   billing account (T035-a). Prove it and keep the output:

```
gcloud billing projects describe PROJECT_ID
```

   It must show `billingEnabled: true` and a `billingAccountName`. Re-check
   after any key rotation, because a new key can come from another project.

2. Billing, Budgets and alerts, Create budget: name "Carta Gemini usage cap",
   scoped to that project, EUR 50, monthly, alerts at 50, 90 and 100 percent
   to an address you read (T036-a).

## 3.2 Supabase, before the pastes

Database, Extensions: enable `pg_cron` and `pg_net`. Then create two vault
secrets, `refresh_facts_url` and `refresh_facts_key` (T041-b). Without them
the cron block in 030 schedules nothing and says nothing.

## 3.3 Paste, then redeploy, never the other way round

The telemetry writes are best-effort and swallow their own failures, so a
redeploy before its paste just gives you a week of zeroes.

1. Check whether 028 is already live:
   `select to_regclass('public.ai_model_events');`
   If null, paste `028_model_fallback_events.sql` (T038-a).
2. Paste `029_cache_hit_instrumentation.sql` (T039-a). Its SQL has only ever
   been read, never run, so a syntax error would first show here (T039-d).
3. Paste `030_ai_usage_rollup.sql` (T042-a).
4. Redeploy all three functions once (T038-b, T039-b, T042-b):

```
supabase functions deploy plan-day --project-ref ntssxktaduxzpsmejwyv
supabase functions deploy parse-booking --project-ref ntssxktaduxzpsmejwyv
supabase functions deploy suggest-city --project-ref ntssxktaduxzpsmejwyv
```

Migration 031, the margin dashboard, is not here. It reads the sales columns
that Stripe's migration 026 adds, so it waits for stage 10.

## 3.4 Prove the caps hold on the live functions

One at a time, restoring each before the next.

1. In the plan-day secrets set `AI_GLOBAL_DAILY_CAP` to 1. From a signed-in
   account request two plans: the first returns 200, the second 429 with code
   `global_cap`. Set the cap back to 200 (T036-b).
2. On a test account, note its `ai_usage` row for kind plan, request one plan,
   then set `GEMINI_MODEL` to a bad value and request again. `ai_usage` must
   return to its earlier value. Restore the model (T037-b).

If you ever change `AI_GLOBAL_DAILY_CAP` for good, set the `site_config` key
`ai_global_daily_cap` to the same number, or every percentage in the AI usage
section is computed against 200 (T042-c).

## 3.5 One week later, five minutes

Put it in your calendar now. Read the cache hit rate and the cap refusal
counts off the admin panel and write both into the register rows (T039-c,
T042-e). The first week of each starts cold, so do not read it sooner.

Optional, only if you want them: the live A/B on the prompt trim and the
20-plan side-by-side read, both written out in the T040 report (T040-a,
T040-b). The trim saves under 0.5 percent, so skipping both costs little. A
v4 cache baseline (T039-e) is no longer possible once step 3.3 has run, which
is fine. The local quota tests use a throwaway Docker database rather than the
5432 server (T036-c); Claude handles that when it runs them.

---

# Stage 4. Claude session B: safe to run unattended

Stage 7 puts the pipeline on a timer on a box nobody watches. These fixes come
first because each one fails silently there.

1. `pipeline/cycling/_truncate_lc.py` runs a destructive `TRUNCATE TABLE` on
   import, with no `__main__` guard (T028).
2. `run_pipeline.py` around line 2587: a task that raises instead of
   returning false skips the state write, the ship decision, the freshness
   report and the heartbeat failure ping (T029).
3. The ten backfill tasks stay off any timer; `images` and `activities` are
   null-risk writers (T028). Monthly and quarterly tasks are not on the box
   yet either (T048-h).
4. `bathing_water` runs before `guard_beaches` and `guard_lakes`, or a fresh
   box skips both layers for 90 days (T029).
5. `poi_enrich` duplicates `poi_images` and `must_descs` with different
   retries (T029).
6. The box's weekly run calls `push-data` after the build, so its output
   reaches production through R2 (T054-e). This answers T048-j, see stage 5.
7. `logs/pipeline_state.json` added to the R2 push and pull so a rebuilt box
   remembers its last runs (T048-k).
8. `cloud-init.yaml`: install with `-c constraints.txt`, GNU time, the PGDG
   Postgres 17 client and `npm ci`, and the README and `env.example` brought
   up to date (T048-i).
9. The Sunday reboot window skips while a CAX41 spawn is live (T047-l), and
   `archive/runs/` gets a 14-day lifecycle rule (T047-k).
10. Remove the `anthropic` provider from `rewrite_intros.py` and
    `parking_check.py`, which CLAUDE.md forbids (T041-g).

---

# Stage 5. You, an evening: R2 and the data cutover

One decision is already made here: the box's output reaches production as R2
data shards, not as a git push from the box (T048-j). That route is built
(T054), needs no deploy key, and its cutover is what makes the Pages move in
stage 6 possible.

You need a Cloudflare API token with R2 and DNS rights, and three ids from the
dashboard: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`, and later the R2
access keys.

## 5.1 The bucket and the two domains

From `continent-app/`, with `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_ZONE_ID` exported. The bucket name `carta` cannot be changed later.
Everything else in this stage and stage 8 needs the bucket, so nothing starts
before it (T044-d).

```
bash scripts/r2/provision.sh --dry-run  # read every command first
bash scripts/r2/provision.sh            # bucket "carta", its prefixes and both domains (T044-a, T044-b)
```

This attaches `cdn.carta-europetravel.com` and `data.carta-europetravel.com`.
Give the certificates a few minutes, then:

```
node scripts/r2/verify.mjs              # both PASS with the expected Cache-Control (T044-c)
```

## 5.2 rclone and the archive

1. Install rclone. In Cloudflare create an R2 API token with Object Read and
   Write on bucket `carta` only, and export the five `RCLONE_CONFIG_R2_*`
   variables listed in the T045 report (T045-a).
2. Lifecycle rules first, so no snapshot ever sits without its expiry
   (T045-b):

```
python pipeline/archive/push.py --lifecycle
```

   It must list archive/snapshots/ at 60 days and archive/db/ at 30 days.
3. Pack and push, onto a disk with about 11 GB free outside the repo, then
   every rclone check in the T045 report (T045-c):

```
python pipeline/archive/pack.py --out <dir>
python pipeline/archive/push.py --out <dir>
```

4. Create the backup gpg key and keep the private half offline. Make the first
   trailslab and Supabase dumps with the T045 report's commands, push both,
   and restore the trailslab one into a scratch database once to prove it
   reads (T045-d).

## 5.3 App data from R2

From `continent-app/`:

1. CORS, so browsers accept the data host (T054-a):

```
node scripts/r2/push-data.mjs --cors          # prints the two wrangler commands
node scripts/r2/push-data.mjs --cors --live   # must list five origins, GET and HEAD
```

2. Split build and phase 1 upload, which adds and replaces and deletes nothing
   (T054-b):

```
VITE_DATA_BASE=https://data.carta-europetravel.com/data CARTA_SKIP_CSP_CHECK=1 npm run build
node scripts/r2/push-data.mjs --rclone-dry-run    # about 52,000 objects, 1.1 GB the first time
node scripts/r2/push-data.mjs --live
node scripts/r2/verify-data.mjs                   # must end PASS
node scripts/r2/verify-data.mjs --all
```

3. Ask Claude for the one-line CSP change: `https://data.carta-europetravel.com`
   into `connect-src` in `continent-app/vercel.json` and
   `continent-app/public/_headers` (T053-b). The build refuses a split build
   without it, so this order cannot be skipped by accident.
4. Cut over (T054-c). Set `VITE_DATA_BASE=https://data.carta-europetravel.com/data`
   in Vercel Production, rebuild from the same master, deploy and promote.
   Load the map, `#dest=BRU` and a trail link, and in the network panel check
   that `dest/`, `poi/`, `dossier/` and `trails/` come from the data host with
   200 and no CORS error. This also fixes the production POI 404s found in
   T025. Only then:

```
node scripts/r2/push-data.mjs --live --prune
```

   Rollback: remove `VITE_DATA_BASE` and redeploy; the app serves everything
   same-origin again.

---

# Stage 6. You, an hour, then Claude session C: off Vercel

With app data on R2, `npm run check:pages` passes (61 files against the
20,000 ceiling). Run the cut-over runbook in `Execution/P1/T024-cloudflare-pages-migration.md`
as written. This ends the breach of Vercel's Hobby terms and the missing
Vercel processor agreement (T018) without paying for Vercel Pro. Set
`VITE_DATA_BASE` in the Pages Production environment the same way as in 5.3.

Then Claude session C:

1. T025, untrack `continent-app/public` and add the 21 generated paths to
   `.gitignore`, with the runbook in the T025 report (T054-h).
2. `check:pages` into `npm run ci` (T054-f), and the unread 12.5 MB
   `dist/app_data.json` dropped from the build (T054-g).
3. CORS for the Pages preview origins (T054-i) and `.gitattributes` pinning
   `_headers` and `_redirects` to LF (T024).

The git history rewrite (T026) becomes possible after this, with you at the
keyboard. It is optional: T252 in stage 1 already took the free 901 MB, and
the rewrite only matters if GitHub starts warning about repository size.

---

# Stage 7. You, about three days, mostly waiting: the CAX11 box

About EUR 6.60 a month. Do not run a real step on the box while a laptop run
is in progress; the two machines would each write their own master. The
Windows task `TravelAppFareRefresh` stays the live schedule until step 7.9.

## 7.1 Hetzner project and token (T046-c)

In the Hetzner Cloud Console create a project named Carta, then Security, API
tokens, a Read & Write token (shown once). Install the hcloud CLI from
https://github.com/hetznercloud/cli/releases and, in the shell you provision
from only:

```
export HCLOUD_TOKEN=<token>
hcloud server-type describe cax11      # proves the token and shows the price
```

Never write this token into a file in the repository.

## 7.2 Provision (T046-a, T046-d)

IPv4 is on: github.com has no IPv6 address, so an IPv6-only box cannot clone
(about EUR 0.60 a month). From the repo root in Git Bash:

```
bash infra/hetzner/cax11/provision.sh --dry-run
IPV4=1 bash infra/hetzner/cax11/provision.sh
```

The box clones `main`, which has everything since stage 1. Wait five to ten
minutes, then:

```
ssh -i ~/.ssh/carta_orchestrator_ed25519 carta@<address> 'cloud-init status --wait; tail -n 30 /var/log/carta-bootstrap.log'
```

It must end "finished, all steps ok". If not, fix the cause and run
`sudo carta-bootstrap` on the box.

## 7.3 Secrets file (T046-e)

```
ssh -i ~/.ssh/carta_orchestrator_ed25519 carta@<address>
nano ~/.config/carta/env
```

A copy of `env.example`, mode 600. Copy the values from the laptop's repo-root
`.env`, the five `RCLONE_CONFIG_R2_*` lines from stage 5, and
`CARTA_SUPABASE_URL` and `CARTA_SUPABASE_SERVICE_KEY` from stage 2.
`HCLOUD_TOKEN` stays blank until stage 8.

## 7.4 Verify the box (T046-f)

At least ten minutes after the last boot, from the laptop:

```
bash infra/hetzner/cax11/verify.sh <address>
```

It must print ALL CHECKS PASSED, including "placeholder job fired N time(s)".

## 7.5 Prepare the box (T048-a)

```
sudo apt-get install -y time
bash ~/carta/infra/hetzner/cax11/run_pipeline.sh --pull-only
```

This pins the Python packages to the laptop's versions and pulls the master
from R2. Run it twice; the second run must not warn "no
app_data/app_data.json".

## 7.6 Verify the four weekly steps, one at a time (T048-b)

```
bash ~/carta/infra/hetzner/cax11/verify_tasks.sh --next
bash ~/carta/infra/hetzner/cax11/verify_tasks.sh <step>
bash ~/carta/infra/hetzner/cax11/verify_tasks.sh --status
```

With every fare task retired in stage 1, four steps remain, in order:
`country_context`, `image_audit`, `ingestion`, `ship`. Each runs a dry run and
then the real run. `ingestion` writes the raw open-data mirror (5.3 GB on the
laptop against the box's 40 GB disk), so run it in the background and watch
`df -h`:

```
nohup bash ~/carta/infra/hetzner/cax11/verify_tasks.sh ingestion > ~/verify_ingestion.out 2>&1 &
```

If a step fails, stop there and hand `~/carta/logs/arm64_verify/<step>.log` to
a Claude session. Do not edit on the box.

## 7.7 First full weekly run (T048-c, closes T046-g)

```
CARTA_PIPELINE_ENABLED=1 nohup bash ~/carta/infra/hetzner/cax11/weekly.sh -- --only ingestion,country_context,image_audit > ~/first_run.out 2>&1 &
```

A few hours now that the 25-hour fare refresh is gone. It must end exit 0 in
`~/logs/weekly.log` (exit 3 means the pipeline was fine and an R2 step
failed). Fares are not refreshed by this or any run; the app shows them as
estimates from stage 1 on.

## 7.8 Compare with a laptop build (T048-d)

On the box:

```
~/venv/bin/python ~/carta/infra/hetzner/cax11/compare_wire.py summarize ~/carta/continent-app/dist -o ~/box_wire.json
```

On the laptop, from the repo root:

```
(cd continent-app && npm run build)
python infra/hetzner/cax11/compare_wire.py summarize continent-app/dist -o laptop_wire.json
scp -i ~/.ssh/carta_orchestrator_ed25519 carta@<address>:box_wire.json .
python infra/hetzner/cax11/compare_wire.py compare laptop_wire.json box_wire.json
```

It must print SAME SHAPE. With no fare harvest the `fares/` files are frozen,
so they must match exactly; any key, type, file-set or schema difference is a
bug for Claude.

## 7.9 Switch the schedule, same day (T048-e, T048-f)

On the box:

```
sudo bash ~/carta/infra/hetzner/cron/install.sh --dry-run
sudo bash ~/carta/infra/hetzner/cron/install.sh
```

Monday 09:00 Brussels, 48 hour timeout, Sunday 04:00 reboot window. Then on
the laptop:

```
schtasks /Change /TN TravelAppFareRefresh /DISABLE
schtasks /Query /TN TravelAppFareRefresh /V /FO LIST | findstr /C:"Scheduled Task State"
```

From now on the box's master is the newest. Before any master write on the
laptop, pull first: `python pipeline/archive/push.py --pull --only master-current`.
To go back: `/ENABLE` on the laptop and `install.sh --disable` on the box.

## 7.10 Weekly database dumps from the box (T048-g)

```
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt-get update && sudo apt-get install -y postgresql-client-17
gpg --import carta-backups.pub.asc        # the public half from stage 5.2, copied over with scp
nano ~/.config/carta/env                  # add SUPABASE_DB_URL and CARTA_BACKUP_KEY
```

## 7.11 Clear the laptop, about 70 GB (T045-e)

Only now, when the box runs the weekly pipeline and the laptop is no longer
the system of record. Doing it earlier would leave the laptop's own weekly
task with no inputs.

First every check from the T045 report must print "0 differences found":

```
rclone check data/raw/geofabrik r2:carta/archive/inputs/geofabrik --one-way
rclone check data/raw/dem       r2:carta/archive/inputs/dem       --one-way
rclone check data/raw           r2:carta/archive/inputs/raw       --one-way --exclude "/geofabrik/**" --exclude "/dem/**"
rclone check app_data/backups   r2:carta/archive/snapshots        --one-way
rclone check "$CARTA_ARCHIVE_OUT" r2:carta/archive/caches         --one-way --include "*.tar.gz"
rclone check app_data r2:carta/archive/master --one-way --include "/app_data.json"
rclone ls r2:carta/archive/db/                                       # both dumps listed
```

Then, from the repo root:

```
rm -rf data/raw data/history data/models        cache/photos/emb cache/photos/dumps cache/photos/models cache/photos/sheets cache/photos/geograph.sqlite        cache/beaches cache/cycling cache/lakes cache/iab cache/regions cache/trails cache/mountains cache/trips        app_data/backups app_data/app_data.json        tools/trailslab/valhalla/data tools/brouter/segments data/trails/famous_registry_full.json        data/derived/tp_fares.json tools/reachability/cache logs pipeline/logs "$CARTA_ARCHIVE_OUT"
git status --short        # must show no deletions: every path above is gitignored
```

Measured 2026-10-01: `data/raw` is 58 GB (Geofabrik 29 GB, elevation 24 GB),
the caches about 10 GB, `app_data` 1 GB and the tool data about 2 GB. Any of
it can be pulled back from R2 with `python pipeline/archive/push.py --pull`.

Docker's disk (`docker_data.vhdx`, 28.5 GB measured 2026-10-01) is separate
and optional. It holds the trailslab, valhalla and brouter volumes, which you
still use. Only if you decide to stop running the trails lab locally: after
the trailslab dump from stage 5.2 has restored once into a scratch database,
`docker compose -f tools/trailslab/docker-compose.yml down -v`, then reclaim
the vhdx in Docker Desktop. Never use Clean / Purge data while you want those
volumes.

---

# Stage 8. You, short sessions over about two weeks: images

The CAX41 is a 16-core box that the CAX11 creates for a heavy job and deletes
when done, about EUR 0.06 to 0.45 a run.

## 8.1 Set up the worker (T047-a, T047-f)

Create a second Hetzner Read & Write token and put it in the box's
`~/.config/carta/env` as `HCLOUD_TOKEN`. Recommended: a separate R2 token for
workers as `CARTA_WORKER_R2_ACCESS_KEY_ID` and
`CARTA_WORKER_R2_SECRET_ACCESS_KEY`, so a worker's credentials can be revoked
alone. Then on the box:

```
cd ~/carta && git pull
bash infra/hetzner/cax41/verify.sh                 # ends "0 failed"
bash infra/hetzner/cax41/spawn.sh --dry-run selftest
sudo install -m 0644 infra/hetzner/cax41/carta-worker-sweep.service infra/hetzner/cax41/carta-worker-sweep.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now carta-worker-sweep.timer
```

## 8.2 Prove a worker comes and goes (T047-b, T047-c)

```
bash infra/hetzner/cax41/spawn.sh selftest
```

In a second terminal, `watch -n 30 'hcloud server list --selector role=worker'`
shows it appear and disappear. Passes on "outcome ok, exit 0", an empty list,
and `rclone cat r2:carta/archive/built/selftest/selftest.txt` showing aarch64
and 16 cores. Then start the selftest again and press Ctrl-C after the first
"worker:" line: it must print "deleting carta-worker-selftest-..." and the
list must be empty a minute later.

## 8.3 One heavy job (T047-d)

```
bash infra/hetzner/cax41/spawn.sh valhalla_tiles switzerland
```

Passes when `rclone ls r2:carta/archive/built/valhalla/switzerland/` lists
`valhalla_tiles.tar`, `valhalla.json` and `SOURCE.txt`. Hand the digest in
SOURCE.txt to Claude to pin (T047-j).

## 8.4 The image ladder, beaches first (T049-a to T049-d)

Push the beaches cache from the laptop:

```
python pipeline/archive/pack.py --only beaches-cache --out <dir with 1 GB free>
python pipeline/archive/push.py --only beaches-cache --out <the same dir>
```

Then on the box, the dry run first (T049-b), then the first real run (T049-c):

```
bash infra/hetzner/cax41/spawn.sh --dry-run image_transcode beaches
bash infra/hetzner/cax41/spawn.sh image_transcode beaches
```

Check one image the CDN serves:

```
rclone copyto r2:carta/img/manifest/beaches.json /tmp/beaches.json
python3 -c "import json;m=json.load(open('/tmp/beaches.json'));f=next(iter(m['files'].values()));h=f['h'];print(m['count'],'files');print(f'https://cdn.carta-europetravel.com/img/{h[:2]}/{h[2:4]}/{h}/640.avif')"
curl -sI <that URL> | grep -iE '^(HTTP|cache-control|content-type)'
```

Expect 200, `public, max-age=31536000, immutable` and `image/avif`. Repeat the
spawn until a run reports `left` 0, about eight runs at EUR 0.45. Then lakes,
then mountains, the same way. Optional: a Cloudflare Cache Rule on
`cdn.carta-europetravel.com/img/` as insurance (T049-e).

## 8.5 Prove takedowns and credits work live (T050-a, T051-a)

Pick a derived title nobody wants published; this takedown is permanent. With
`CLOUDFLARE_API_TOKEN` (Zone, Cache Purge) and `CLOUDFLARE_ZONE_ID` set:

```
python pipeline/photos/takedown.py add "<title>" --dry-run
python pipeline/photos/takedown.py add "<title>" --reason "T050-a proof"
```

It must print `r2: ok`, `edge: ok` and `manifest[<layer>]: ok`, and `curl -I`
on its five URLs (`derive.py key "<title>"` prints them) must no longer return
the old image. Then the credit check:

```
rclone cat r2:carta/img/manifest/beaches.json > beaches-live.json
python pipeline/photos/verify_attribution_cdn.py --manifest beaches-live.json --head 5
```

It must exit 0. Open one 640.avif and its Commons page and confirm by eye it
is the same photograph.

## 8.6 Turn the faster images on (T052-a)

```
rclone copyto r2:carta/img/manifest/beaches.json cache/img_manifest/beaches.json
python pipeline/beaches/export_beaches.py --img-manifest cache/img_manifest/beaches.json
```

It must print "image ladder joined into N of M image records" with N above
zero. Deploy a Preview, measure one beach page five times each with
`?pic=off` and `?pic=beaches` (Lighthouse mobile preset, the command is in the
T052 report). If the median paint improved and the credit line is unchanged,
set `VITE_PICTURE_LAYERS=beaches` in Production. Lakes and mountains follow,
added to the comma list.

## 8.7 First real bills

After the first month: compare the Hetzner invoice's CAX41 lines with
`python3 infra/hetzner/cax41/cost.py mtd --month YYYY-MM` to learn whether
Hetzner bills wall-clock or started hours (T047-e), and compare the Hetzner
and Cloudflare totals with the modelled EUR 9.50 to 10.90 a month (T055-b).
Measure production speed for real now that everything is live (T055-a,
T061-a); ask Claude to rerun `scripts/perf/tiles_and_paint_T061.mjs` and the
fare trace against the live site (T061-c, T056-b, T059-c).

---

# Stage 9. Claude, whenever: the code work with no manual steps

Each group is one session. Say "run session D1" and so on. None of them needs
anything from you except reviewing the result.

**D1. Payments and quota, safe to write before Stripe exists.**
A Year Pass holder buying a Trip Pass is downgraded (T031-b). Repeated
purchases extend `expires_at` without limit (T031-c). Re-running the 007
insert undoes 021 (T030-d). The pricing UI does not read `plan_tiers` as the
007 header claims (T030-c). `ai_refund` takes a unit from the next day after
midnight and `admin_margin` books AI units on the purchase month; both need a
day on the spend, so one migration (T037-c, T043-e). The expiring paywall gate
has no call site (T034-b). Funnel attribution is an estimate (T034-c). An npm
script that runs both quota tests (T037-a), and real Deno coverage (T037-d).
Admin rows for the refund exposure and the OSS figure (T032-d, T033-e), an OSS
check on a schedule (T033-f), the real Stripe fee stored (T043-d). The
outdated 006 header (T035-c).

**D2. Admin and moderation follow-ups.**
Refused aal1 actions leave no audit row (T063-d). The Audit tab shows previous
beside new (T064-b) and a race on new keys (T064-c). Restore 017's maintenance
check that 033 dropped (T065-c). The swallowed feedback-status error (T065-d)
and the pinned test assertions (T065-e). Mark config keys public or private
from the admin page (T066-b) and the stale comments (T066-c, T067-e, T069-g,
T070-h). A real view counter (T067-a), pagination for public guides (T067-b).
A new-reports badge so a notice cannot sit unseen (T068-b), and a report path
for author bylines (T068-h). The privacy-policy sentences for the AI failure
record and for Gemini processing outside the EU (T071-b, T018), and
`edge_errors` in the GDPR export (T071-d). The parse-failure and overdue
override cards (T073-c, T074-b). The override row gets a country code, which
fixes the missing photo and the empty diff column (T074-e, T076-b), and the
note column is retired (T074-d). Orphan detection caching and detail
(T075-a, T075-b, T075-c), the diff viewer's field list (T076-c).
`admin_get_audit` onto `admin_guard` (T077-c), the migration list read from
the directory (T077-a). The account-hub check that fails on a clean tree
(T042-d).

**D3. Harness repairs.**
These block honest verification of everything else, so do D3 early if a
session ever reports a failing harness. `verify_explore.mjs` at 28 of 30,
`verify_mountains.mjs`, `verify_places_tab.mjs` and the trips selectOption
(T052-g, T054-i), `verify_account_panel.mjs` at 380px (T020), harnesses that
assume a server on 4173 (T054-i), screenshots taken mid-transition (T062-g),
the missing harness steps for Guides, Reports, Unpublish and statements
(T067-f, T068-f, T069-f, T070-f), a real fixture image for the diff viewer
(T076-a), the layer-page LCP harness committed (T052-e), the dead
`verify_reach_filter.mjs` (T027).

**D4. Speed.**
First paint waits for every country shard; render from the boot index and
load detail on demand (T054-d, T055-c, T059-b). The destination page's phone
CLS of 0.309, the one failing Core Web Vital (T011). Trip page INP, never
measured (T011). The phone price map INP sample (T055-d), tiles in viewport
mode (T061-b). The Windows EPERM in `stage-data.mjs` (T059-d) and the `sw.js`
comment (T059-e).

**D5. Images and the photo pipeline.**
The remaining CSP hosts and the surfaces that still hotlink Wikimedia
(T052-f, T053-a). Feed the manifest into the exports automatically (T052-d)
and write the placeholder and the nothing-owed marker in derive.py (T052-c,
T051-c). A published-first derive pass (T049-f), the re-upload policy
(T049-i), garbage collection (T049-j, T050-c), the other Tier A layers
(T049-k), the cycling and dossier photo count check (T051-d). The CLIP check on
arm64 and cache ownership (T047-g), the Planetiler stub (T047-h), the trails
lab reading the built Valhalla tiles (T047-i). The image items from the P0
audits: the 3,983 wire images with no cache behind them, non-image files kept
out of the transcoder, and a few thousand names probed for 404s before big
runs (T007, T008).

**D6. Frozen fares and the rest.**
The planner's flight row uses the same three steps as Explore (T058-a), the
flight-cost contract written into `docs/SCHEMA.md` (T058-c), the dead expiry
slot (T058-d), unused fare exports removed (T056-c). The grounding design work
for P9 (T041-c, T041-d, T041-e, T041-f) and the prompt-size question (T040-c).
`report_pipeline_run()` tested inside a real run (T072-c), more layer counts
(T072-d). The `docs/SCHEMA.md` header says version 15, it is 17 (T029); the
contract gate checks the split wires (T029); the smoke test's five-second
waits (T029). The queue gate that catches work left in `continent-app/`
(T062-b), and `ContentSection.jsx` moved into `components/admin/` (T062-e).
The T027 stale comments and unused CSS. `practical_layer.py` has no
consumer: wire or archive it (T028). `harvest_ryanair_schedules.py` and the
retired carrier harvesters move to the archive tier, since no fare source is
live.

---

# Stage 10. You, last: Stripe

Do this when the eenmanszaak exists. Nothing is half-finished in the meantime:
Stripe has never been live, there are no Stripe secrets on the live project,
the two functions are not deployed and `pass_grants` is empty. The code is
already on `main` from stage 1.

## 10.1 Stripe Dashboard, in this order

1. Product catalogue: create or verify the two Prices, Trip Pass 699 EUR and
   Year Pass 1499 EUR, currency eur, one_time. Note both ids and whether they
   are test or live (T030-a).
2. On both Prices, `tax_behavior` must be inclusive. Exclusive means a
   Belgian buyer pays 8.46 and the app shows a price nobody pays (T033-a).
3. Settings, Business, Public details: Terms of service URL
   `https://carta-europetravel.com/?legal=terms`. **Before** the secret in
   10.2, or every checkout returns 502 (T032-a).
4. Settings, Tax: origin address the Belgian establishment, registration
   Belgium only, threshold monitoring on with an email you read (T033-b).

## 10.2 Supabase

Take a fresh database dump first, as in stage 2. Then the secrets, test mode
first:

```
supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_PRICE_TRIP=price_... STRIPE_PRICE_YEAR=price_... CHECKOUT_TERMS_URL=https://carta-europetravel.com/?legal=terms --project-ref ntssxktaduxzpsmejwyv
```

Paste in this order (022 went in at stage 2): `021_free_tier_once.sql`,
`025_withdrawal_waiver.sql` (T032-b), `026_oss_threshold.sql` (T033-c),
`027_paywall_funnel_kinds.sql` (T034-a), then `031_margin_dashboard.sql`
(T043-a), which needed 026's sales columns. 026 must be in before the webhook
deploy, because the webhook calls the nine-argument `grant_pass`. Then:

```
supabase functions deploy checkout --project-ref ntssxktaduxzpsmejwyv
supabase functions deploy stripe-webhook --no-verify-jwt --project-ref ntssxktaduxzpsmejwyv
```

Create the webhook endpoint in the Dashboard and set `STRIPE_WEBHOOK_SECRET`
from the `whsec_` it gives (T030-b).

## 10.3 The test purchases

Follow `supabase/functions/checkout/test_purchase_e2e.md`, ten steps, on two
fresh accounts, never the owner account (it holds a year pass to 2126 and every
expiry check would land there) (T031-a). Confirm the Stripe page shows Carta's
waiver checkbox and `pass_grants` reads consent accepted with a timestamp
(T032-c). A German and a Belgian address both carry the Belgian rate:
`amount_total` 699 and `amount_tax` 121 (T033-d). Then switch the secrets to
live mode.

## 10.4 The same week

1. Open-Meteo's free tier is non-commercial and the 7-day forecast ships on
   it. Move to the paid API before the first sale (T010).
2. Enter real infrastructure invoices in the admin margin page through
   `admin_set_infra_cost` with source `actual`, then read the reconciliation
   line for that month (T043-b, T043-c).

---

# Product decisions

None blocks a stage. Each has a recommendation, so most can be answered in a
line to a Claude session.

| Row | Question | Recommendation |
|---|---|---|
| T056-a | Keep the Travelpayouts Drive script in `index.html`? | Remove it; Travelpayouts is retired and it makes 8 vendor requests a page load |
| T059-a | Build production with the viewport catalogue? | Not yet; carta-design has no rule for the partial-list state |
| T041-a | Live-grounding allowance on the passes | 10 Trip, 30 Year, decided before stage 10 because the offer prints it |
| T074-c | Should an overdue temporary override stop applying? | Yes, after a 14-day grace period |
| T063-e | Do handing out a pass and resetting quota need TOTP too? | Yes for set_tier, no for reset_quota and unban |
| T065-b | Count config, override and feedback saves in the rate budget? | Own list, so a busy config day cannot block a ban |
| T067-d | Public plan whose author has no profile row | Repair the missing profiles once, then refuse publishing without one |
| T069-c | Can an owner republish a taken-down guide at once? | No, locked until a complaint is decided |
| T069-d | Does a takedown revoke the plan's share links? | Yes |
| T068-g, T070-g | How long to keep reports and statements | Reports 12 months with the email cleared on decision, statements 3 years |
| T070-d | Email route for notices and statements | Supabase Auth SMTP through an EU provider; never the Claude API |

---

# Three loose ends

1. `CARTA_CLOUD_ARCHITECTURE.md` is cited by T004, T006, T007 and the Hetzner
   cost figures, and does not exist in the repository. If you have it
   somewhere, give it to a Claude session to commit; if it never existed, say
   so and the citations get corrected.
2. Task number T062 is used twice, in P3 and in P4 (T062-c). Renumber the P3
   one to T062b in a later housekeeping task; nothing depends on the number.
3. Commit `4b2d8e19f` carries T011 to T056's app work under a T057 message
   (T062-a). Decided in stage 1: it stays, recorded here, and is not rewritten.
