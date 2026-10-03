# Everything that is open, as one plan

Consolidated 2026-10-02 by T300, covering every report from T001 to T297, after
each one was fact-checked against the repository (the verdicts are in
`Execution/P0/T300-factcheck-and-open-consolidation.md`). This is now the one
open-items document. It replaces, for reading purposes, the three procedure
files (`P2/_OPEN-stripe-launch.md`, `P2/_OPEN-gemini-billing.md`,
`P3/_OPEN-hetzner.md`, which are stale and carry a banner saying so) and Part D
of `PARALLEL-WAVES-PLAN.md`. `_OPEN.md` stays the record of every row.

How to read it. Every stage and step carries a tag: **[DONE]** with the task
that did it, **[PARTLY]**, **[OPEN]**, or **[CHANGED]** where a later decision
changed the step. The original text of each step is kept under its tag.
Everything only you can do is gathered in Part E at the end, grouped by kind;
every open Claude row and the wave that takes it is in Part F; what the
fact-check found is in Part G. Claude's work runs in waves from
`Execution/_WAVES.md`.

Where things stand on 2026-10-02 evening: stages 0, 1, 4, 5 and 6 are done.
Production is on Cloudflare Pages (direct upload, project `carta-app`) and reads
its data from R2. Nothing of stages 2, 3, 7, 8 or 10 has been done, so none of
migrations 019 to 047 that the earlier stages list are live yet (check 019 and
020 in 2.1 step 5). Root `main` is about 160 commits ahead of GitHub and the app
`master` is ahead too; pushing is now safe (T291-c, T293), because a push no
longer deploys anything.

---

Original introduction (2026-10-01, covering T001 to T077). Work down this file from the top.
Each stage says who does it, about how long it takes and how you know it
worked. When a stage says "Claude session", open Claude Code and say "run
session A from _OPEN-MASTER.md" (or B, C, D).

This file now contains the three procedure files `P2/_OPEN-stripe-launch.md`,
`P2/_OPEN-gemini-billing.md` and `P3/_OPEN-hetzner.md`; you do not need to open
them. `_OPEN.md` stays the record of every row, and where this file and a
report disagree, the report wins. Row ids in brackets join each step back to
`_OPEN.md`.

## The whole plan on one screen

| Stage | Who | Time | What it gets you | Status 2026-10-02 |
|---|---|---|---|---|
| 0 | You | done | 16.8 GB free on C:, the master snapshot off the laptop | [DONE] 2026-10-01 |
| 1 | Claude session A | one session | The blockers fixed and all task branches merged into main | [DONE] T253 to T258, T252 (reflog step T252-a still yours) |
| 2 | You | 45 min | Admin panel, MFA, moderation, telemetry and the GDPR export live | [OPEN] nothing pasted; now 18 pastes with 047 and 048 |
| 3 | You | 45 min | Gemini compliant, AI cost caps proven, AI telemetry live | [PARTLY] 3.1 done (T259); 3.2 changed; 3.3 to 3.5 open |
| 4 | Claude session B | one session | The pipeline safe to run unattended, R2 scripts ready | [DONE] T260 to T264 |
| 5 | You | an evening | R2 bucket, everything copied off the laptop, app data served from R2 | [DONE] T288 to T291 (four security follow-ups open) |
| 6 | You, then Claude session C | an hour | Off Vercel onto Cloudflare Pages, build artifacts untracked | [DONE] T293 to T296; the untrack was reverted (T297), Vercel deletion after 2026-10-09 |
| 7 | You | about 2 days, mostly waiting | The weekly pipeline on a Hetzner box, about 70 GB freed on the laptop | [OPEN] the laptop clean-out (7.11) was partly done early |
| 8 | You | short sessions over 2 weeks | Self-hosted images, takedowns and credits proven live | [OPEN] needs stage 7 |
| 9 | Claude session D and onward | whenever | All remaining code work, no manual steps | [PARTLY] D1, D2, D3, D5a, D6 done (T265 to T270); the rest is in `_WAVES.md` |
| 10 | You | 2 hours | Stripe, last, once the eenmanszaak exists | [OPEN] needs T014 |

After stage 10 there is a short list of product decisions (none blocks a
stage) and three loose ends, then the new Parts E, F and G.

Rules that hold everywhere: never `supabase db push` against
`ntssxktaduxzpsmejwyv`, paste migrations by hand into the SQL editor. After
every paste, look for the self-check notice named in the step; it is the
difference between "it ran" and "it is right". Since stage 6 (T293)
production is the Cloudflare Pages project `carta-app`, deployed by hand with
`npx wrangler pages deploy dist --project-name carta-app --branch main` after
`npm run build:pages`; a push to GitHub reaches no domain.

---

# Stage 0. You, 15 minutes, on the laptop

[DONE] 2026-10-01.

Done 2026-10-01. C: has 16.8 GB free, the Visual Studio installer cache
(T020) was already gone, and the master snapshot is on `D:\carta-backups\`
(T005).

Docker is deliberately left alone. Its disk holds the trailslab, valhalla and
brouter volumes, and Clean / Purge data would delete them, so T023's vhdx
reclaim is dropped. Stage 7.11 says when it is safe to shrink, and it stays
optional.

---

# Stage 1. Claude session A: the blockers and the merge

[DONE] 2026-10-01 by T253 (018 bound), T254 (MFA flow), T255 (fare harvests retired),
T256 (estimates, later replaced by T273: Carta shows no flight price at all), T257 (--remote),
T258 (the merge and the push) and T252 (gc and LFS prune). One step is still yours: the
reflog expiry the session guard refused (T252-a, Part E).

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

[OPEN] Nothing has been pasted. Two migrations joined the list since it was written: 047
(wave 6, T284) and 048 (wave 7, T315), rows 16 and 17 below once they are merged. Step 1 of
2.1 changed with the move to Pages.

The app is already written against every migration in this stage. Until each
is pasted the matching screen shows a "could not find the function" error or
quietly drops data. This is the cheapest result in the whole plan.

## 2.1 Before the first paste

1. [CHANGED] Production is on Cloudflare Pages now. Deploy the current `main` build with
   `npm run build:pages` and the wrangler command in the rules above, so the live app
   matches the migrations you are about to paste. (Originally: promote the stage 1
   Preview of `main` to Production in Vercel.)
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
5. Check whether 019 and 020 are live (added 2026-10-02, T275). 037 refuses to
   run without 019, and 039 breaks if 020 is pasted after it, so both must be
   in before paste 7:
   `select to_regclass('public.trip_collaborators') as t020, (select count(*) from information_schema.columns where table_schema='public' and table_name='trip_plans' and column_name='published_at') as t019;`
   `t019` = 1 means 019 is live and `t020` = trip_collaborators means 020 is
   live. Pastes 6a and 6b below are only for the ones that are not live;
   paste 6c (046) is needed either way.

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
| 6a | 019_public_guides (only if 2.1 step 5 says not live) | T275 | it runs clean | 037 refuses to run; there is no guides gallery |
| 6b | 020_coplanners (only if not live) | T275 | it runs clean | no co-planning; pasted after 039 it breaks 038 and 039 |
| 6c | 046_coplanner_invite_fix (always, right after 020) | T274-a | co-planner invite policy self-check passed | every co-planner invite is refused (020 calls are_friends, which 011 revoked) |
| 7 | 036_admin_public_guides | T067-c | admin public guides self-check passed | the Guides tab shows an error |
| 8 | 037_content_reports | T068-a | content reports self-check passed | the report form on a guide answers "did not send" |
| 9 | 038_admin_unpublish_guide | T069-a | admin unpublish guide self-check passed | Unpublish errors and nothing changes |
| 10 | 039_statement_of_reasons | T070-a | statement of reasons self-check passed | a takedown gets no statement of reasons |
| 11 | 043_override_review_lifecycle | T074-a | override review lifecycle self-check passed | the override review page cannot save |
| 12 | 040_edge_errors | T071-a | edge errors self-check passed | every AI failure makes one dropped RPC call |
| 13 | 041_pipeline_health | T072-b | pipeline health self-check passed | the Overview card reads hasRun:false |
| 14 | 042_parse_failures | T073-a | parse failures self-check passed | structural booking-parse failures go unrecorded |
| 15 | 045_admin_followups | T268-a | admin followups self-check passed | MFA refusals leave no audit row, no guide view counter, no config visibility switch, the export misses edge errors |
| 16 | 047 (wave 6, T284, once merged) | T284's owner row | its self-check notice | client crashes are not stored, no 'data' feedback kind, no audited expiry change |
| 17 | 048 (wave 7, T315, once merged) | T315's owner row | its self-check notice | no priced-trip, affiliate-click or error-rate figures; the export misses Article 15 tables |

044 is NOT in this list: it rebuilds the Stripe functions, so it goes in
stage 10 right after 031 (T265-a).

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
code. The pipeline health and AI failure cards on the Overview render
(T300-s); the cards T270 added stay hidden until 026, 042 and 045 are in
(T270-b). In GitHub, the `admin-rpc-security` Actions job from the stage 1 push
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
| 020 | 046's invite fix, so every co-planner invite is refused | 046 (T274) |
| 014, 015, 016, 017, 018, 019, 024, 032, 033, 034 or 036 | parts of 045 | 045 (T268-b; the full list is in 045's header) |
| 043, after 045 | 043 fails at its first UPDATE, because 045 dropped `note` | do not re-paste 043 after 045 |

The rule behind all of these: after pasting any migration by hand, re-paste
every later migration that names it.

## 2.6 After the first real content report

Run `select source_header, count(*) from public.content_reports group by 1;`.
`cf-connecting-ip` means the per-address limit is sound; `x-forwarded-for`
means a Claude session must change `report_guide` to take the last trusted
entry (T068-c).

---

# Stage 3. You, 45 minutes: Gemini compliance and AI telemetry

[PARTLY] 3.1 is done (T259, with screenshots in `P2/evidence/T259/`). 3.2 changed. 3.3 to
3.5 are open.

The Google Cloud project behind `GEMINI_API_KEY` has no billing account that
can be shown. The Gemini API Additional Terms effective 2026-03-23 allow only
Paid Services when serving users in the EEA, Switzerland or the UK, and a Paid
Service is defined by the billing account existing, not by money changing
hands. So step 1 is a compliance step, and the budget makes sure it never
becomes a spending one.

## 3.1 Google Cloud console

[DONE] by T259: project `gen-lang-client-0445365032` is linked to billing (Prepay Tier 1)
and the EUR 50 budget exists. Two follow-ups are yours: rename the key's project and remove
the empty second "Carta" project (T259-a), and read how prepaid spend shows in the budget
(T259-b).

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

[CHANGED by T300] The vault secrets below are for the facts store, and the fact-check found
that migration 030 has no cron block: 030 became the AI usage rollup, and the facts migration
T041 designed was never written (T300-n). Skip the two secrets until T147 (wave 17) writes
that migration. Do enable `pg_cron` now; 044 needs it in stage 10. The original text:

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

[DONE] 2026-10-01 by T260 (the truncate guard, item 1), T261 (items 2 to 5), T262 (items 6, 7
and the 14-day rule in item 9), T263 (item 8 and the reboot skip in item 9) and T264
(item 10).

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

[DONE] 2026-10-02. 5.1 and 5.2 by T288 (with T289's Windows fix), 5.3 by T290 (data on R2,
the CSP) and T291 (the cutover). Two closures rest on weaker evidence than the rows asked
for, as T288 says itself: the lifecycle list output was not seen (T045-b) and a streamed
`pg_restore -f -` replaced the scratch-database restore (T045-d). Still yours from this
stage, all in Part E: the key and token clean-up (T288-a, T291-b), the trailslab dump that
expires 2026-11-01 (T288-b), and applying the six-origin CORS rule (T296-a).

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

   It must list archive/snapshots/ at 60 days, archive/db/ at 30 days and
   archive/runs/ at 14 days (T262).
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

[DONE] 2026-10-02 by T293 (Pages, direct upload, the apex redirect), T294 (`_redirects` and
LF pinning), T295 (`check:pages` and `build:pages` in ci, the unread app_data.json dropped)
and T296 (preview CORS). Not done: the untrack of `continent-app/public` (item 1) was tried
in T292 and reverted in T297, because about 48,000 of those files are pipeline exports with
no regeneration path yet (T297-a, wave 18). Yours: delete the Vercel project after
2026-10-09 (T293-a).

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

# Stage 7. You, about three days, mostly waiting: the orchestrator box

[OPEN] Not started. Three things changed since it was written: the box is a CPX22
(x86) while Hetzner has no ARM stock, and `provision.sh` now gives it an IPv4 by
default (T299, closing T300-w); set `VITE_DATA_BASE` in 7.3 straight away, because the cutover is live; and 7.11 was partly
done early (see there). Wave 9 (T324) lands the box readiness code first: the heartbeat on
every failure, the image job widened, arm64 portability.

About EUR 6.60 a month. Do not run a real step on the box while a laptop run
is in progress; the two machines would each write their own master.

State on 2026-10-02 (T298), which changes this stage in four places:

- The Windows task `TravelAppFareRefresh` is already disabled. The laptop's
  inputs and caches were removed that afternoon (most of 7.11), so its Monday
  run would have started about forty due tasks with nothing to read. Until
  step 7.9 nothing runs the pipeline on a schedule, and nothing needs to:
  production reads the data in R2, which does not change on its own.
- Stage 5 is live, so `VITE_DATA_BASE` is set on the box from the start (7.3).
- A production build is split since T291: `dist/` is the app shell and
  `dist-data/` the data. Step 7.8 compares both.
- The box gets the layer files (trails, cycling, regions, trips, dossier and
  the rest) from its clone of `main`, which tracks them again since T297.
  T297-a does not block this stage. The box refreshes only the weekly tasks;
  the monthly and quarterly ones have no home yet (T048-h).

## 7.1 Hetzner project and token (T046-c)

In the Hetzner Cloud Console create a project named Carta, then Security, API
tokens, a Read & Write token (shown once). Install the hcloud CLI from
https://github.com/hetznercloud/cli/releases (on the laptop:
`hcloud-windows-amd64.zip`, with `hcloud.exe` in a folder on the Git Bash
PATH such as `~/bin`; it was not installed on 2026-10-02) and, in the Git Bash
shell you provision from only:

```
export HCLOUD_TOKEN=<token>
hcloud server-type describe cpx22      # proves the token, shows the price and stock per location
```

Never write this token into a file in the repository.

On 2026-10-03 every ARM type (CAX11 to CAX41) was out of stock in every
location, and had been since 2026-09-03, so the box is a **CPX22**: AMD x86,
2 vCPU, 4 GB, 80 GB disk. `provision.sh` supports it since T299. When ARM
stock returns, a CAX11 is the cheaper default; `hcloud server-type describe
cax11` shows it.

## 7.2 Provision (T046-a, T046-d)

IPv4 is on by default (T299): github.com has no IPv6 address, so an IPv6-only
box cannot clone, and the laptop has no IPv6 to reach one. About EUR 0.60 a
month. From the repo root in Git Bash, in the window with `HCLOUD_TOKEN`:

```
CARTA_SERVER_TYPE=cpx22 bash infra/hetzner/cax11/provision.sh --dry-run
CARTA_SERVER_TYPE=cpx22 bash infra/hetzner/cax11/provision.sh
```

Location fsn1 (the default): stage 8's workers start in the orchestrator's
location. The script prints the IPv4 address at the end; `<address>` below is
that address, never the IPv6 one. The box clones GitHub `main`, so anything
the box needs must be pushed first. Wait five to ten minutes, then:

```
ssh -i ~/.ssh/carta_orchestrator_ed25519 carta@<address> 'cloud-init status --wait; tail -n 30 /var/log/carta-bootstrap.log'
```

The log must show "ok: architecture amd64" near the top.

It must end "finished, all steps ok". If not, fix the cause and run
`sudo carta-bootstrap` on the box.

## 7.3 Secrets file (T046-e)

```
ssh -i ~/.ssh/carta_orchestrator_ed25519 carta@<address>
nano ~/.config/carta/env
```

A copy of `env.example`, mode 600. Copy the values from the laptop's repo-root
`.env`, and `CARTA_SUPABASE_URL` and `CARTA_SUPABASE_SERVICE_KEY` from stage 2.
For the five `RCLONE_CONFIG_R2_*` lines, give the box its own key pair rather
than the laptop's: in Cloudflare, R2, Manage API tokens, create an Account API
token named `carta-box` with Object Read & Write on the bucket `carta` only,
and use its Access Key ID and Secret Access Key. The laptop's `carta-rclone`
pair is due to be replaced anyway (T288-a), and a separate pair can be revoked
without touching the other machine. `HCLOUD_TOKEN` stays blank until stage 8.

Set `VITE_DATA_BASE=https://data.carta-europetravel.com/data` now: the stage 5
cutover is live (T291), so every good weekly run uploads its data to R2 by
itself (T262, push-data phase 1). The app shell and the prune stay a hand step
after a run (T262-a, at the end of this stage).

## 7.4 Verify the box (T046-f)

At least ten minutes after the last boot, from the laptop:

```
bash infra/hetzner/cax11/verify.sh <address>
```

It must print ALL CHECKS PASSED, including "architecture x86_64" and
"placeholder job fired N time(s)".

## 7.5 Prepare the box (T048-a)

```
bash ~/carta/infra/hetzner/cax11/run_pipeline.sh --pull-only
```

GNU time, the PostgreSQL 17 client and the app's node_modules come with the
box since T263; `verify.sh` in 7.4 checks all three. Only a box provisioned
before T263 needs `sudo apt-get install -y time` here.

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

Both builds are split (T291), so compare the app shell and the data
separately. On the box, after 7.7:

```
cd ~/carta/infra/hetzner/cax11
~/venv/bin/python compare_wire.py summarize ~/carta/continent-app/dist      -o ~/box_shell.json
~/venv/bin/python compare_wire.py summarize ~/carta/continent-app/dist-data -o ~/box_data.json
```

On the laptop, from the repo root (`build:pages` sets `VITE_DATA_BASE` itself,
T295):

```
(cd continent-app && npm run build:pages)
python infra/hetzner/cax11/compare_wire.py summarize continent-app/dist      -o laptop_shell.json
python infra/hetzner/cax11/compare_wire.py summarize continent-app/dist-data -o laptop_data.json
scp -i ~/.ssh/carta_orchestrator_ed25519 carta@<address>:box_shell.json carta@<address>:box_data.json .
python infra/hetzner/cax11/compare_wire.py compare laptop_shell.json box_shell.json
python infra/hetzner/cax11/compare_wire.py compare laptop_data.json  box_data.json
```

Both must print SAME SHAPE. Measured on the laptop on 2026-10-02: the shell is
16 top-level files plus `fonts/`, the data 4 top-level files and 14
directories with 52,307 files. With no fare harvest the `fares/` files are
frozen, so they must match exactly; any key, type, file-set or schema
difference is a bug for Claude.

## 7.9 Switch the schedule, same day (T048-e, T048-f)

On the box:

```
sudo bash ~/carta/infra/hetzner/cron/install.sh --dry-run
sudo bash ~/carta/infra/hetzner/cron/install.sh
```

Monday 09:00 Brussels, 48 hour timeout, Sunday 04:00 reboot window. The
laptop half of this step was done on 2026-10-02 (T298); check it is still off:

```
schtasks /Query /TN TravelAppFareRefresh /V /FO LIST | findstr /C:"Scheduled Task State"
```

From now on the box's master is the newest. Before any master write on the
laptop, pull first: `python pipeline/archive/push.py --pull --only master-current`.
To go back: `install.sh --disable` on the box. Re-enabling the laptop task
(`schtasks /Change /TN TravelAppFareRefresh /ENABLE`) only makes sense after
`python pipeline/archive/push.py --pull` has restored its inputs.

After each weekly run the new data is in R2, but the boot index and app shell
change only with an app deploy (T262-a). Until the box deploys by itself, do
this on the laptop when a run added or changed destinations, from the repo
root:

```
python pipeline/archive/push.py --pull --only master-current
cd continent-app
npm run build:pages
npx wrangler pages deploy dist --project-name carta-app --branch main
node scripts/r2/push-data.mjs --live --prune
```

## 7.10 Weekly database dumps from the box (T048-g)

```
pg_dump --version                         # 17 or newer; carta-bootstrap installs it (T263)
gpg --import carta-backups.pub.asc        # the public half from stage 5.2, copied over with scp
nano ~/.config/carta/env                  # add SUPABASE_DB_URL and CARTA_BACKUP_KEY
```

Only on a box provisioned before T263, install the client by hand first:

```
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt-get update && sudo apt-get install -y postgresql-client-17
```

## 7.11 Clear the laptop, about 70 GB (T045-e)

[PARTLY] Done early on 2026-10-02 (T293's report): `data/raw`, the eleven archived cache
layers, `data/history` and `data/models` are gone, which freed 69 GB. `app_data/`, `logs/`,
the trailslab volume and the tool caches stay, because local builds and deploys still need
the master. Consequence: any data-lane task first needs `python pipeline/archive/push.py
--pull`. The rest of this step stays for after 7.9.

Most of this was done on 2026-10-02, to free disk for the stage 6 build:
`data/raw`, `data/history`, `data/models` and the eleven archived cache
layers under `cache/` are gone (T293 report), and the laptop task was
disabled the same day (T298). What remains is `app_data/backups`,
`app_data/app_data.json`, the tool data, `logs`, `pipeline/logs` and
`$CARTA_ARCHIVE_OUT`. Keep `app_data/app_data.json` as long as you deploy
from the laptop: `npm run build:pages` reads it (pull it fresh first, as in
7.9). The checks below for paths already removed have nothing left to check;
run the rest.

Only once the box runs the weekly pipeline, first every remaining check from
the T045 report must print "0 differences found":

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
rm -rf data/raw data/history data/models        cache/photos/emb cache/photos/dumps cache/photos/models cache/photos/sheets cache/photos/geograph.sqlite        cache/beaches cache/cycling cache/lakes cache/iab cache/regions cache/trails cache/mountains cache/trips        app_data/backups        tools/trailslab/valhalla/data tools/brouter/segments data/trails/famous_registry_full.json        data/derived/tp_fares.json tools/reachability/cache logs pipeline/logs "$CARTA_ARCHIVE_OUT"
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

[OPEN] Needs stage 7. The image-side code it relies on is done (T269: published-first
sources, re-upload policy, garbage collection, the placeholder and nothing-owed marker).

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
fare trace against the live site (T061-c, T056-b, T059-c). [CHANGED] The
fare trace and the shard measurement no longer wait for this stage: the data
host is live, so wave 8 (T200) runs T056-b and T059-c, and wave 16 (T231)
re-runs T061-c.

---

# Stage 9. Claude, whenever: the code work with no manual steps

[PARTLY] Each group below is tagged. What is left of every group is a session in
`Execution/_WAVES.md`; Part F maps each open row to its wave.

Each group is one session. Say "run session D1" and so on. None of them needs
anything from you except reviewing the result.

**D1. Payments and quota, safe to write before Stripe exists.** [DONE] T265 (migration 044),
except T037-d (wave 9, T323), T265-b and T032-d (wave 7, T314), T033-e (done by T270).
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

**D2. Admin and moderation follow-ups.** [DONE] T268 (migration 045) and T270, except T068-h
(wave 11, T333), T075-c (wave 19), T270-d (wave 7), T268-c (wave 9) and T268-e and T268-g
(wave 6).
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

**D3. Harness repairs.** [DONE] T266, with round two in wave 6 (T281).
These block honest verification of everything else, so do D3 early if a
session ever reports a failing harness. `verify_explore.mjs` at 28 of 30,
`verify_mountains.mjs`, `verify_places_tab.mjs` and the trips selectOption
(T052-g, T054-i), `verify_account_panel.mjs` at 380px (T020), harnesses that
assume a server on 4173 (T054-i), screenshots taken mid-transition (T062-g),
the missing harness steps for Guides, Reports, Unpublish and statements
(T067-f, T068-f, T069-f, T070-f), a real fixture image for the diff viewer
(T076-a), the layer-page LCP harness committed (T052-e), the dead
`verify_reach_filter.mjs` (T027).

**D4. Speed.** [OPEN] Wave 7, T271 (the cutover it waited for is live).
First paint waits for every country shard; render from the boot index and
load detail on demand (T054-d, T055-c, T059-b). The destination page's phone
CLS of 0.309, the one failing Core Web Vital (T011). Trip page INP, never
measured (T011). The phone price map INP sample (T055-d), tiles in viewport
mode (T061-b). The Windows EPERM in `stage-data.mjs` (T059-d) and the `sw.js`
comment (T059-e).

**D5. Images and the photo pipeline.** [PARTLY] D5a done by T269; the CSP hosts and hotlinks
(T052-f, T053-a, T052-d) wait for stage 8 (wave 19, T329); the CAX41 items wait for stage 7.
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

**D6. Frozen fares and the rest.** [DONE] T267, then T273 removed the flight figures entirely;
left: the grounding items (wave 9 T323, wave 11 T327), T072-c and T072-d (wave 18), the
archive move of the retired harvesters (wave 7, T311).
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

[OPEN] Waits for the eenmanszaak (T014). Two additions since it was written: the e2e test
document gets the 044 checks first (T300-u, wave 7), and migration 050 (refunds in the
margin and OSS figures, wave 20) pastes after 044. Decide the commercial-terms gates before
the first sale (T300-e).

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
(T043-a), which needed 026's sales columns, then `044_payments_quota.sql`
(T265-a, added 2026-10-02). 044 keeps the higher tier, caps pass expiry, adds
the day ledger and the real Stripe fee. It refuses to run without 021, 022,
025, 026, 027 and 031. If its notice says pg_cron is off, enable pg_cron and
run the one cron.schedule line it prints. 044 must be in before both deploys
below: the webhook calls the twelve-argument `grant_pass` and checkout calls
`pass_can_buy`. Then:

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

| Row | Question | Recommendation | Status |
|---|---|---|---|
| T056-a | Keep the Travelpayouts Drive script in `index.html`? | Remove it; Travelpayouts is retired and it makes 8 vendor requests a page load | [DONE] decided by T275, removed by T276 |
| T059-a | Build production with the viewport catalogue? | Not yet; carta-design has no rule for the partial-list state | [OPEN] |
| T041-a | Live-grounding allowance on the passes | 10 Trip, 30 Year, decided before stage 10 because the offer prints it | [OPEN] blocks T148 |
| T074-c | Should an overdue temporary override stop applying? | Yes, after a 14-day grace period | [OPEN] |
| T063-e | Do handing out a pass and resetting quota need TOTP too? | Yes for set_tier, no for reset_quota and unban | [OPEN] |
| T065-b | Count config, override and feedback saves in the rate budget? | Own list, so a busy config day cannot block a ban | [OPEN] |
| T067-d | Public plan whose author has no profile row | Repair the missing profiles once, then refuse publishing without one | [OPEN] |
| T069-c | Can an owner republish a taken-down guide at once? | No, locked until a complaint is decided | [OPEN] |
| T069-d | Does a takedown revoke the plan's share links? | Yes | [OPEN] |
| T068-g, T070-g | How long to keep reports and statements | Reports 12 months with the email cleared on decision, statements 3 years | [OPEN] |
| T070-d | Email route for notices and statements | Supabase Auth SMTP through an EU provider; never the Claude API | [OPEN] T213 (wave 7) designs the emails either way |

Decided since by the owner (T272 and T275, 2026-10-02), all [DONE]: Carta does
not price flights (a flight counts only when the traveller types their fare;
T273 removed the estimates); routing is Carta's own track on its MapLibre map;
the web app plus store apps, Android first (T247, T248 wait for your
accounts, T272-b); prerendered pages on R2 behind one Pages Function; the badge
reads Recommended; the month strip as built; the first-run design approved as
written (but see T300-k: that design still prices flights, so it comes back to
you); the paste list corrected; the Travelpayouts script removed; free trail
GPX and KML; hikers lead the audience order; no third-party analytics; visitors
read from the host's dashboard; no cold press before the launch gates; a
support mailbox yes (you create it, T216-a); no launch date yet (T207-a).

---

# Three loose ends

1. [DONE, found by T300] The file exists at `additional docs/Carta/Plan/Architecture/`
   (committed in 4b2d8e19f). Original text: `CARTA_CLOUD_ARCHITECTURE.md` is cited by T004, T006, T007 and the Hetzner
   cost figures, and does not exist in the repository. If you have it
   somewhere, give it to a Claude session to commit; if it never existed, say
   so and the citations get corrected.
2. [OPEN] Task number T062 is used twice, in P3 and in P4 (T062-c). Renumber the P3
   one to T062b in a later housekeeping task; nothing depends on the number.
3. [DONE, decided] Commit `4b2d8e19f` carries T011 to T056's app work under a T057 message
   (T062-a). Decided in stage 1: it stays, recorded here, and is not rewritten.
   Found by T300: because of this, the rollback written in the T057 report (`git
   revert 4b2d8e19f`) would revert eight tasks. The real T057 change is app commit
   `bdd125d`; revert that instead. Likewise T053's rollback names `203b334`, a
   commit that was amended; the T053 commit on master is `9699a48`.

---

# Part E. Everything only you can do

Gathered 2026-10-02 by T300 from every open row with Owner `user` in `_OPEN.md`, from Part D
of `PARALLEL-WAVES-PLAN.md`, and from the fact-check. Each line names its row; the row in
`_OPEN.md` and the report behind it have the detail. Stages 2, 3, 7, 8 and 10 above already
give the order for their groups; E2 to E6 list the same rows so you can tick them here.

## E1. Now, no dependencies, mostly minutes each

- [ ] T291-c: Push root `main` and continent-app `master` to GitHub. Safe since T293: a push deploys nothing, and origin is about 160 commits behind what production runs
- [ ] T288-a: Finish the stage 5.2 wrap-up the owner was doing when T288 was written: delete the Carta backups secret key from the laptop keyring once the offline copy is confirmed, and replace both carta-rclone R2 tokens with one new pair kept only in the password...
- [ ] T291-b: Roll the carta-r2-admin Cloudflare token, whose value was pasted into the session on 2026-10-02, and delete the unused Carta user token
- [ ] T296-a: Apply the new CORS rule with node scripts/r2/push-data.mjs --cors --live from continent-app (a Cloudflare token with R2 edit, after the T291-b roll) and check the list shows six origins including https://preview.carta-app.pages.dev
- [ ] T288-b: The only trailslab dump (archive/db/trailslab/trailslab-2026-10-02.dump.gpg) expires on 2026-11-01 under the 30-day archive/db/ rule, and the build box skips the trailslab dump because the lab is on the laptop
- [ ] T252-a: Expire the root repository's reflogs except refs/stash, then git gc --prune=now
- [ ] T259-a: Two Google Cloud projects are both named Carta: gen-lang-client-0445365032 holds the Gemini key and the budget, carta-503222 holds nothing
- [ ] T259-b: AI Studio shows the key's project on a Prepay Tier 1 billing tier
- [ ] T300-j: No Cloudflare data processing addendum has been checked or accepted since hosting (Pages) and storage (R2) moved there
- [ ] T300-a: The EUIPO trademark search for "Carta" was never run (T022 wrote a guess
- [ ] T300-v: PARALLEL-WAVES-PLAN.md, Execution/_WAVES.md and the Execution/_queue tools are untracked in git
- [ ] T270-a: The owner reads and approves the two privacy policy paragraphs T270 added to PrivacyPolicy.jsx (Gemini processing outside the EEA under Google's DPA and SCCs
- [ ] T276-b: Returning visitors keep the three third-party localStorage keys (am_user_session, emerald_manual_placements_stub, emerald_poi_exclusions_stub) from before
- [ ] T293-a: Delete (or at least detach the two domains from) the Vercel project carta-travel-app after 2026-10-09, once a week on Pages has passed without a rollback
- [ ] LIVE-a: Probably fixed by the T291 cutover (production now reads /poi/ from R2): open the Carta bot day plan once and close the row if it answers
- [ ] T083-c: The rls-policies CI job has never run on GitHub because nothing is pushed
- [ ] T084-c: The trip-validator workflow fails by design until T085, T139, T084-a and T084-b land and has not yet run on GitHub

## E2. Stage 2: the pastes and the checks around them

- [ ] T034-a: Paste migrations 022 then 027
- [ ] T216-d: The export answer relies on export_user_data()
- [ ] T063-b: Owner enrols a TOTP factor on the owner account through the T063-a flow and confirms TOTP is enabled in the project Auth settings
- [ ] T063-c: Paste migration 032 into the Supabase SQL editor (never db push) and check for "admin MFA self-check passed"; until then delete and ban need only aal1, and applying it before T063-a and T063-b locks both buttons
- [ ] T064-a: Paste migration 033 into the Supabase SQL editor after 032 (never db push) and check for "admin audit rollback self-check passed"; it needs content_overrides live, and 018 as committed cannot apply until T031-d is fixed
- [ ] T065-a: Paste migration 034 into the Supabase SQL editor after 033 (never db push) and check for "admin guard tiers self-check passed"; paste it again after any later re-paste of 033, which would otherwise put admin_set_config and admin_set_override back on the...
- [ ] T066-a: Paste migration 035 into the Supabase SQL editor after 034 (never db push), check for "site config visibility self-check passed" and run select key, public from public.site_config to confirm only announcement, features and maintenance are public
- [ ] T067-c: Paste migration 036 into the Supabase SQL editor after 035 (never db push) and check for "admin public guides self-check passed"; until then the Guides tab shows the "could not find the function" error with a retry
- [ ] T068-a: Paste migration 037 into the Supabase SQL editor after 036 (never db push) and check for "content reports self-check passed"; until then the report form on a guide answers "did not send" and the Reports tab shows the missing-function error
- [ ] T069-a: Paste migration 038 into the Supabase SQL editor after 037 (never db push) and check for "admin unpublish guide self-check passed"; until then Unpublish in the Guides and Reports tabs shows the "could not find the function" error and nothing changes
- [ ] T070-a: Paste migration 039 into the Supabase SQL editor after 038 (never db push), ideally before any real takedown, and check for "statement of reasons self-check passed"; a takedown made under 038 alone gets no statement and needs one written by hand from its...
- [ ] T074-a: Paste migration 043 into the Supabase SQL editor after 034 (never db push), check for "override review lifecycle self-check passed", and deploy the app build from this branch with it: the new admin page cannot save before the paste, an older one gets...
- [ ] T071-a: Paste migration 040 into the Supabase SQL editor (never db push) and look for the self-check notice
- [ ] T072-b: Paste migration 041 into the Supabase SQL editor (never db push) and look for "pipeline health self-check passed"; until then admin_health names pipeline_runs as missing and the Overview card reads hasRun:false
- [ ] T073-a: Paste migration 042 into the Supabase SQL editor (never db push) and look for "parse failures self-check passed"; until then the RPC calls from bookingImport.js answer "could not find the function", logged and ignored, so nothing breaks but nothing is...
- [ ] T268-a: Paste 045_admin_followups.sql in stage 2 after 042 (row 15) and look for "admin followups self-check passed"; needs 035, 036, 040 and 043 live
- [ ] T270-b: The five admin reads T270 draws (admin_list_config, admin_list_public_guides paging, admin_oss_threshold, admin_parse_failures, admin_list_content_reports) show nothing until migrations 026, 042 and 045 are pasted into the live project
- [ ] T219-d: docs/FEEDBACK-LOOP.md assumes migration 017 (public.feedback) is live, as _OPEN-MASTER stage 2 does by not pasting it
- [ ] T072-a: Set CARTA_SUPABASE_URL and CARTA_SUPABASE_SERVICE_KEY on the machine that runs run_pipeline.py
- [ ] T073-b: The parse-booking Edge Function code was changed to return reason codes but was never deployed
- [ ] T300-s: After pasting 040 and 041, open the admin Overview and confirm the pipeline health and AI failure cards render (asked in the T072 report, never registered)
- [ ] T077-b: The suite proves the migrations as committed produce a closed admin surface, not that the live project matches them
- [ ] T069-b: 038 re-creates 020's guard_coplanner_write with a takedown exception
- [ ] T070-b: 039 re-creates the takedown body, the report list and the co-planner guard
- [ ] T068-c: After the first real report run select source_header, count(*) from public.content_reports group by 1

## E3. Stage 3: Gemini telemetry and the cap proofs

- [ ] T038-a: Paste migration 028_model_fallback_events.sql into the Supabase SQL editor and apply it to the live project
- [ ] T039-a: Paste migration 029_cache_hit_instrumentation.sql into the Supabase SQL editor and apply it
- [ ] T039-d: The SQL in 029 was never executed
- [ ] T042-a: Paste migration 030_ai_usage_rollup.sql into the Supabase SQL editor and apply it
- [ ] T038-b: Redeploy plan-day to ntssxktaduxzpsmejwyv after migration 028 is applied, so logging begins on the live function
- [ ] T039-b: Redeploy plan-day to ntssxktaduxzpsmejwyv after 029 is applied, so the v5 key and the hit-rate logging both go live
- [ ] T042-b: Redeploy plan-day, parse-booking and suggest-city to ntssxktaduxzpsmejwyv after 030 is applied, so refusals start being recorded
- [ ] T036-b: Manually test 429 rejection on live Supabase by setting AI_GLOBAL_DAILY_CAP to 1, calling plan-day twice, confirming second returns 429 with code global_cap, then restore cap to 200
- [ ] T037-b: The live refund path has never been checked against the deployed functions
- [ ] T042-c: The daily percentages assume a global cap of 200 because AI_GLOBAL_DAILY_CAP lives in the Edge Function environment where SQL cannot read it
- [ ] T039-c: Read the live hit rate off the admin panel a week after the redeploy and record it
- [ ] T042-e: Read the cap refusal counts a week after the redeploy, in the same sitting as the cache rate T039-c asks for
- [ ] T039-e: No live v4 baseline exists, because the old key was never instrumented
- [ ] T040-a: Run the live A/B on the prompt trim after plan-day is redeployed: set PROMPT_TRIM=false as a Supabase secret for a control window, unset it for a treatment window of similar length and traffic, then compare ai_model_events and a manual read of sampled...
- [ ] T040-b: Run the 20-real-plan side-by-side quality check: pull or reconstruct 20 real candidate decks, generate each once with PROMPT_TRIM unset and once set to false against a real Gemini key, and read the 20 pairs for any visible difference in stop selection or...
- [ ] T041-b: Before the cron block in migration 030 runs on the live project: enable pg_cron and pg_net under Database, Extensions, and create the vault secrets refresh_facts_url and refresh_facts_key

## E4. Stage 7: the CAX11 box

- [ ] T046-a: Decide IPv4 for the orchestrator: IPv6-only (the default) cannot reach GitHub, so the clone and the hcloud download fail
- [ ] T300-w: T046-a: provision.sh still defaults to IPV4=0 although _OPEN-MASTER 7.2 says IPv4 is on
- [ ] T046-c: Create the Hetzner Cloud project and a Read & Write API token, install hcloud on the laptop, export HCLOUD_TOKEN in the provisioning shell only
- [ ] T046-d: Run infra/hetzner/cax11/provision.sh, wait for cloud-init, confirm /var/log/carta-bootstrap.log ends "finished, all steps ok" (else sudo carta-bootstrap)
- [ ] T046-e: Fill /home/carta/.config/carta/env on the box from env.example (mode 600)
- [ ] T046-f: Run infra/hetzner/cax11/verify.sh against the box and get ALL CHECKS PASSED including the "cron fired" line
- [ ] T048-a: Prepare the box for verification: install GNU time, check out p3-pipeline-cron-migration, run infra/hetzner/cax11/run_pipeline.sh --pull-only to re-sync the venv to constraints.txt and fetch the gitignored master and fare history (or scp them from the laptop)
- [ ] T048-b: Verify the twelve weekly steps on the box one at a time with verify_tasks.sh in weekly_tasks.txt order, keeping logs/arm64_verify
- [ ] T048-c: First full weekly run on the box through weekly.sh with every weekly key forced (none is due after T048-b), ending exit 0
- [ ] T048-d: Compare the box's wire with a laptop build using compare_wire.py and get SAME SHAPE; this is T048's done condition
- [ ] T048-e: Install the real units on the box with infra/hetzner/cron/install.sh (Monday 09:00 timer, 48 h timeout, no boot run, Sunday reboot window, logrotate)
- [ ] T048-f: Disable TravelAppFareRefresh with schtasks /Change /TN TravelAppFareRefresh /DISABLE only after T048-d passes and T048-j is decided, the same day as T048-e [closed by T298]
- [ ] T048-g: Weekly Supabase dumps from the box need the PGDG postgresql-client-17 (Ubuntu 24.04 ships 16), the backup public key from T045-d and SUPABASE_DB_URL plus CARTA_BACKUP_KEY in the secrets file
- [ ] T048-j: Decide how the box's output reaches production: it rewrites tracked files under continent-app/public and builds dist, but nothing commits, pushes or deploys them (on the laptop a hand step) [closed by T298]
- [ ] T262-a: The box now uploads each good week's data to R2 (push-data.mjs phase 1), but the boot index and app shell on the app host change only with an app deploy, and phase 2 (--prune) must wait for that deploy
- [ ] T218-b: Create a Healthchecks.io (or similar) check, weekly period with about a day of grace, alerting the owner, and set its URL as CARTA_HEARTBEAT_URL in the box's ~/.config/carta/env
- [ ] T045-e: Laptop clean-out with the T045 report's rm command, only after T045-c and T045-d pass their checks

## E5. Stage 8: images, then the first bills

- [ ] T047-f: Optional, before T047-b: a separate R2 token for workers (CARTA_WORKER_R2_ACCESS_KEY_ID and _SECRET_ACCESS_KEY in the secrets file), because the worker carries its R2 credentials in user data readable from the metadata service
- [ ] T047-a: Set up the on-demand worker on the CAX11: a second Read & Write HCLOUD_TOKEN in the secrets file, infra/hetzner/cax41/verify.sh ends 0 failed, spawn.sh --dry-run selftest, carta-worker-sweep.timer installed and enabled
- [ ] T047-b: First real spawn: spawn.sh selftest ends outcome ok, the worker disappears from hcloud server list --selector role=worker, selftest.txt in R2 shows aarch64 16 cores
- [ ] T047-c: Ctrl-C a live spawn.sh selftest after the create and confirm the worker is deleted, the live twin of verify.sh's failure-path checks
- [ ] T047-d: First real heavy job, T047's done condition: spawn.sh valhalla_tiles switzerland ends ok, the worker is deleted, archive/built/valhalla/switzerland holds the tiles, cost recorded
- [ ] T049-a: Before the first image_transcode run: bucket and cdn domain live (T044-a to c, T045-f first), RCLONE_CONFIG_R2_* on the box (T045-a), selftest proven (T047-b), beaches-cache.tar.gz pushed to archive/caches with no hold, the derive.py branch pushed
- [ ] T049-b: On the box: verify.sh ends 0 failed and spawn.sh --dry-run image_transcode beaches prints create, wait, promote, delete, sweep
- [ ] T049-c: First real spawn.sh image_transcode beaches: outcome ok, curl on a 640.avif and a 320.webp shows 200, the immutable Cache-Control and the right Content-Type
- [ ] T049-d: Repeat the beaches run until its report shows left 0 (about 8 runs at the laptop's measured 4.9 s per source, about EUR 0.45 each): T049's done condition, beaches fully derived and served from cdn.carta-europetravel.com
- [ ] T049-e: Optional Cloudflare Cache Rule on cdn.carta-europetravel.com /img/ as insurance against an upload path that forgets Cache-Control
- [ ] T269-a: Once the R2 credential exists (after T049-a), run derive.py sources <every layer> on the laptop after each export and push the printed files to img/manifest/_sources/, so image_transcode runs published titles first and the wire layers have a source list
- [ ] T269-d: Before the first promoted clip_sweep, run the T047-g procedure in docs/PHOTOS.md ("Moving the photo caches to the CAX41"): clip_parity.py on the box, the caches pushed without a hold, and the decision of which machine owns each cache/<layer> written into...
- [ ] T269-e: After the first real derive runs, run derive.py gc against the live img/ listing and img/manifest copy, read gc-plan.json, then repeat with --apply (needs the R2 credential)
- [ ] T050-a: First real takedown that proves R2 delete, Cloudflare edge purge and manifest rewrite all happen live, once a real RCLONE_CONFIG_R2_*, CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID exist
- [ ] T051-a: Live check that attribution travels with the self-hosted copy: read the beaches manifest back from R2 and run verify_attribution_cdn.py --manifest --head 5 once the first real derive run has landed
- [ ] T052-a: Production LCP for the picture switch: once T049-c has put beaches objects in R2 and T052-b has put the CDN host in the CSP, join the live manifest into the beaches wire, measure ?pic=off against ?pic=beaches on a Vercel Preview, then set...
- [ ] T047-e: After the first invoice with CAX41 runs, decide whether Hetzner bills wall-clock or started hours (the ledger prices both) and enter hetzner_cax41 in T043's infra_ledger as actual
- [ ] T055-a: The production comparison is still a loopback stand-in: a real measurement against data.carta-europetravel.com and a live Cloudflare Pages deploy needs T054-a to T054-c done first
- [ ] T055-b: The Tier 0 monthly bill (about EUR 9.50-10.90) is still unconfirmed against an invoice
- [ ] T061-a: First paint and tile counts were measured with Chromium's 4x CPU throttle on loopback, the same stand-in T011 uses, not on a real mid-range phone or a throttled network

## E6. Stage 10: Stripe, once the eenmanszaak exists

- [ ] T030-a: Verify or create the two Stripe Prices: 699 and 1499 EUR, one_time, eur, note the ids and the mode
- [ ] T033-a: Confirm tax_behavior is inclusive on both Prices
- [ ] T032-a: Fill the Stripe Dashboard Terms of service URL, then set CHECKOUT_TERMS_URL; the secret before the field makes every checkout 502
- [ ] T033-b: Dashboard Tax: Belgian origin address, Belgium-only registration, threshold monitoring on with a read email
- [ ] T032-b: Paste migration 025 into the SQL editor
- [ ] T033-c: Paste migration 026 before redeploying the webhook
- [ ] T043-a: Paste migration 031_margin_dashboard.sql into the Supabase SQL editor and apply it
- [ ] T265-a: Paste supabase/migrations/044_payments_quota.sql in stage 10.2 right after 031 and before the checkout and stripe-webhook deploys (it refuses to run without 021, 022, 025, 026, 027 and 031)
- [ ] T030-b: Set STRIPE_SECRET_KEY, STRIPE_PRICE_TRIP, STRIPE_PRICE_YEAR as Supabase secrets, then deploy checkout and stripe-webhook (webhook with --no-verify-jwt)
- [ ] T031-a: Make the real test purchases per supabase/functions/checkout/test_purchase_e2e.md on fresh accounts, never the owner account
- [ ] T032-c: Confirm on a real purchase that the Stripe page shows Carta's waiver wording and pass_grants reads consent accepted
- [ ] T033-d: Confirm tax resolves in test mode: German and Belgian address both show the Belgian rate, amount_tax 121 on 699
- [ ] T217-a: Test docs/REFUND_SOP.md once against a real refund of a T031-a test purchase, following it literally, and correct any step the Dashboard contradicts (Stripe Tax reversal, fee kept)
- [ ] T043-b: T016 (bookkeeping and a cost ledger) has never been done and no ledger artefact exists in the repository, so 031 defines the contract instead: public.infra_ledger, keyed (month, item), integer cents, EUR, source model or actual, written through...
- [ ] T043-c: The done condition for T043, reconciling the dashboard to the bookkeeping ledger for one full month, cannot be met until T043-b is done
- [ ] T300-e: Commercial-terms gates found in T010 and T021 with no row: Ferryhopper, OpenSky and Numbeo terms forbid or limit commercial use

## E7. The business and the legal text

- [ ] T014: Decide and register the business entity (eenmanszaak); Stripe, the Play account and the Imprint wait for it
- [ ] T015: Get the VAT answer in writing from an accountant
- [ ] T016: Set up bookkeeping and a cost ledger; infra_ledger (031) is its database half
- [ ] T033-g: T015, the accountant's VAT answer, does not exist as a file
- [ ] T300-h: The Imprint (T012) still has placeholders for the registered entity (name, number, address) that only T014 can fill
- [ ] T032-e: The Article 16(m) classification (digital content, not service) in the terms is unreviewed by anyone qualified
- [ ] T273-b: The Terms of Service section "Every figure is an estimate" (TermsOfService.jsx) still describes flight fares as Carta's estimates with carrier and freshness notes
- [ ] T070-e: Arts
- [ ] T070-c: The statement shows one reason
- [ ] T068-d: The notice form asks for no name and no good-faith statement (Art
- [ ] T068-g: content_reports keeps every row forever, including the reporter's email and the source hash
- [ ] T070-g: moderation_statements keeps every statement and complaint forever
- [ ] T217-d: pass_grants cascades on user deletion, erasing the purchase record and the only copy of the waiver evidence
- [ ] T070-d: No transactional email route exists, so the statement of reasons reaches the owner only in My trips
- [ ] T206-c: A CC licence alone does not let an upload flow into OpenStreetMap (CC BY 4.0 needs the OSMF waiver, CC BY-SA is incompatible)
- [ ] T206-d: FFRandonnée claims copyright on GR itineraries and requires a contract for any reproduction
- [ ] T216-a: Create the mailbox support@carta-europetravel.com (alias forwarding to the owner, send-as enabled, phone notification on), then switch the CONTACT constant in Imprint.jsx, TermsOfService.jsx, PrivacyPolicy.jsx and AccountPanel.jsx to it
- [ ] T216-b: After a month of keeping the two-day answer time, decide whether the Terms contact paragraph should state it instead of 30 days

## E8. Decisions (each row has the options; most can be answered in one line to a Claude session)

- [ ] T041-a: Decide the live-grounding allowance for T148: the design proposes plan_tiers.grounded 10 on the Trip Pass and 30 on the Year Pass in place of 40 and 120
- [ ] T059-a: Decide whether to build production with VITE_CATALOGUE=viewport: the first paint drops to 1.91 MB from CRL and the Explore map pans shard by shard, but every list (and the Explore map's tier legend counts) briefly shows only the places near the origin, and...
- [ ] T074-c: An overdue temporary override keeps applying to travellers indefinitely
- [ ] T063-e: admin_set_tier, admin_reset_quota and admin_unban_user stay on aal1
- [ ] T065-b: admin_guard counts only set_tier, reset_quota, delete_user, ban_user and unban_user toward the destructive budget, so config, override and feedback saves are not limited by their own count
- [ ] T067-d: A public plan whose author has no profiles row (010's signup trigger swallows its own failure) is public by its column but absent from the gallery
- [ ] T069-c: The owner can publish a taken-down guide again straight away (their own update policy allows it, the test shows it)
- [ ] T069-d: A takedown does not revoke the plan's share links (009's get_shared_trip ignores visibility), so content taken off the gallery stays readable by anyone holding an old link
- [ ] T265-c: T035-c can only be closed by a comment-only edit to applied migration 006, which the wave rules forbid
- [ ] T111-a: Spec 0.4 says 47 countries but its own 0.1 table, every layer harvest and COUNTRIES in coverage.py hold 45
- [ ] T111-c: Three contract proxies to confirm: trail fame threshold 0.4 (no named threshold exists in pipeline/trails), lake anchor "article in two or more languages" read as Wikidata sitelinks >= 2, "regional highpoint" read as any highpoint_of value
- [ ] T113-f: Decide whether a GMBA range top-three miss should count against a country's trails contract cell in coverage.py (spec 0.4's trails rule is per NUTS3 only)
- [ ] T121-a: Decide whether to build a routable node graph and a "make me a 40 km loop from node 42" product on cycle_nodes and cycle_node_edges (NL and BE only today)
- [ ] T126-b: Decide whether the new rejects (marker, over 2 km) may veto a P18 image, and have the wiring compute distance_m from image and feature coordinates
- [ ] T177-c: Basemap for route trips: stay on Carto Voyager with no relief, or add a MapLibre hillshade layer from a terrain tile host
- [ ] T187-d: The mind map's P10.7, T340 and M11 nodes cite an Original Carta.xmind User Interface branch that is not in the repo (only Carta-Master-Plan.xmind exists)
- [ ] T226-d: The original mind map (Carta-structured.xmind and Carta.xmind) that the master plan cites as "Original Carta.xmind" lives only in the owner's Downloads folder
- [ ] T202-a: The one claim no competitor can copy, the priced leg from the traveller's own airport to a specific trail, beach or summit, is unshipped: DestinationsTab.jsx turns origin and price off for the outdoors layers by design
- [ ] T204-a: The source says paid acquisition reopens when contribution per user is "several times higher" but gives no number
- [ ] T205-g: hreflang wave two covers trails, beaches, lakes and mountains only
- [ ] T246-d: No written design rule exists for an add-to-home-screen hint
- [ ] T255-a: The monthly flight_times task still calls the Ryanair timetable for CRL and BRU departure times
- [ ] T176-b: The planner My Maps KML and the trip and day PDFs stay behind the pass
- [ ] T278-b: An own fare's home airport is inferred (the last stop's own airport, else the wizard arrival), and its airport-to-centre transfer is only taken where the routed flight uses the same airport
- [ ] T219-a: Feedback loop recommended, pending the owner: option A in docs/FEEDBACK-LOOP.md (one Report a problem link on the item pages and price surfaces, the existing form prefilled with the item, landing in the existing Feedback inbox with an Open in Content button)
- [ ] T226-a: The owner confirms the content decision: one content type (pages generated from the records, every figure read at build time with its provenance word), one platform (the domain), no social, video, podcast or newsletter platform at launch, and the platform...
- [ ] T062-a: Commit 4b2d8e19f carries T011 to T056's work under a T057 message (84 files, all genuinely absent from main), so reverting T057 would revert eight tasks' app code
- [ ] T062-c: Task number T062 is used twice: Execution/P3/T062-uncommitted-work-and-queue-runner.md (rows T062-a, T062-b) and Execution/P4/T062-admin-component-split.md (rows from T062-c)
- [ ] T089: Surface or strip the orphan fields (tags, basecamps, snapshot); blocks T089, wave 10
- [ ] T093: OK the confidence model; blocks T093, wave 11
- [ ] T101: Price two trip lengths, or state the seven-day assumption; blocks T101, wave 13
- [ ] T125: The German cap on trails; blocks T125 (data lane)
- [ ] T122: The peak target (3,000 to 5,000); blocks T122 (data lane)
- [ ] T172: Stacked bar versus carta-design's receipt rule; blocks T172, wave 14
- [ ] T194: Is the home page the landing page; blocks T194 and T209, wave 15
- [ ] T141: Upload terms (with T206-c); blocks T333, wave 11
- [ ] T127: A Flickr API key; blocks T127, wave 19
- [ ] T081: The alert channel; blocks T081, wave 17
- [ ] P10: carta-design rules for the InfoDot, the carousel, the slider, the sticky rail and the bento grid; block T156, T162, T167, T173, T165 and T179
- [ ] T211: Approve docs/ONBOARDING_AND_EMPTY_STATES.md and the revised docs/FIRST_RUN_RESULT.md once wave 6 (T211, row T300-k) delivers them; T099 and T124 wait for it

## E9. Data runs only you start (the data lane in Execution/_WAVES.md)

- [ ] PULL: First restore the inputs the clean-out removed: python pipeline/archive/push.py --pull
- [ ] T085-a: The tracked wire continent-app/public/journeys still holds the old comma ranges
- [ ] T087-a: Rebuild the journeys wire on the main checkout (build_wire.py with the image cache) and commit it, so bestPeriod.avoidMonths reaches production
- [ ] T280-a: The published trails wire still carries 160 photo records (150 files, 53 card heroes) that owe a credit and name nobody
- [ ] T107: Trail titles and bug fixes go live on the next trailslab attributes.py run and export (T107-a, T108-g)
- [ ] T113: Famous-trail registry rescan: famous_registry.py --all --refresh (T113-a)
- [ ] T111: Coverage rerun: python pipeline/regions/coverage.py writes the reason codes into coverage.json
- [ ] T177-b: The route track wire through local Valhalla and BRouter (T177-b)

## E10. Accounts and setup

- [ ] T205-f: Create the Search Console property for https://www.carta-europetravel.com/, a Bing Webmaster Tools property and an IndexNow key
- [ ] T218-d: Subscribe the owner address to status.supabase.com, www.cloudflarestatus.com and status.stripe.com, and confirm Stripe webhook failure emails and Supabase usage emails reach a read inbox
- [ ] T272-b: The mobile decision (web app and store apps) needs an Apple Developer Program membership, a Google Play developer account (business, after the T014 entity) and a way to build iOS from Windows
- [ ] T207-b: Open the Hacker News, Product Hunt, Reddit, OSM forum and OSM (OSMBC) accounts and use them normally for 30 days before launch

## E11. Tests only a person can run

- [ ] T095: Hand-price 40 to 50 destinations into tools/benchmark/samples/hotels.csv and re-run the benchmark (T095)
- [ ] T096-a: The stay hold-out is 12 towns in 3 countries, mostly Mallorca resorts, so no stay or weekly accuracy figure can be quoted yet
- [ ] T187-b: Run the five-person first-run test in the last section of docs/FIRST_RUN_RESULT.md on T099's preview build or a printed mock, and record the time-to-answer figure

## E12. Launch

- [ ] T207-a: Choose the launch date (Tuesday to Thursday) and make the go decision once T227 to T231 have passed
- [ ] T220-a: Choose and write the launch date D (Tuesday to Thursday) into T207-a no later than D-42
- [ ] T220-b: Write the soft launch roster (15 people: 5 strangers who are also the T187-b testers, 5 hikers who start walks from towns, 5 likely pass buyers) in a private file outside the repository, with the invitation wording
- [ ] T220-c: The soft launch needs T227, T228, T232 and T235 passed by D-15 (T207 had them at D-7)
- [ ] T220-d: Approve the soft launch invitation wording, including the written statement that a pass is refundable (docs/REFUND_SOP.md), and the proposed pass marks (one recorded purchase, one inbox message answered in two working days, all findings triaged by D-10)
- [ ] T207-e: Reddit's rules could not be fetched
- [ ] T208-b: Outlet submission routes (EU-Startups returned 403, Culture Routes Society's site did not resolve, UK and EU outlets were not fetched) are unverified
- [ ] T206-e: The rules widgets of r/Ultralight, r/trailrunning, r/Garmin, r/openstreetmap, r/ultrarunning and r/wahoofitness and every Facebook group could not be read, so their promotion rules are unverified
- [ ] T232: Supabase Free to Pro before launch (T232)
- [ ] T236: Launch (T236), after the P13 gates (waves 16 and 20)

# Part F. Every open Claude row and the wave that takes it

Generated from `_OPEN.md` and `Execution/_WAVES.md` (first session whose prompt names the row).
A row with no wave either waits on your decision (named) or on a data-lane run.

| Row | Taken by | Item |
|---|---|---|
| T032-d | Wave 7, session 7: T314 (opus) | Nothing shows the refund-exposure count from pass_grants_no_consent_idx |
| T035-c | waits on your row T265-c | Migration 006's header still says the Gemini project must never have a billing account |
| T037-d | Wave 9, session 8: T323 (sonnet) | Part C of test_ai_quota.mjs is a source pattern check, not an execution test |
| T040-c | Wave 9, session 8: T323 (sonnet) | The measured token reduction is under 0.5 percent on real traffic, far short of the brief's ~30-50 percent estimate, because the count-based |
| T041-c | Wave 9, session 8: T323 (sonnet) | The EUR 0.05 per grounded unit in pricing.js line 45 and unit economics 2.2 does not match Google's published price (5,000 free search reque |
| T041-d | Wave 11, session 8: T327 (opus) | suggest-city stays on live grounding because its discoveries depend on the stay point and wish |
| T041-e | Wave 11, session 8: T327 (opus) | The plan-day cache key must fold in the newest fetched_at of the facts a plan used, which bumps the CACHE_KEY_VERSION T039 introduces in log |
| T041-f | Wave 11, session 8: T327 (opus) | parking_check.py already keeps grounded parking facts with sources and a checked date in cache/dossier, and common.py holds the aggregator b |
| T046-g | closes with stage 7.7 (T048-c) | First full pipeline run on the box |
| T048-h | Wave 18, session 3: T328 (sonnet) | The box runs the weekly tier only (CARTA_MAX_CADENCE=weekly) |
| T047-h | Wave 9, session 9: T324 (sonnet) | planetiler and image_transcode are stubs that exit 3: no Planetiler profile or consumer exists (architecture 5.4), and pipeline/photos/deriv |
| T047-i | Wave 18, session 3: T328 (sonnet) | Nothing consumes archive/built/valhalla yet: the trails lab still builds its own tiles from tools/trailslab/valhalla/prepare.py |
| T047-j | Wave 18, session 3: T328 (sonnet) | jobs/valhalla_tiles.sh uses ghcr.io/valhalla/valhalla-scripted:latest like the compose file |
| T052-d | Wave 19, session 1: T329 (opus) | Nothing yet fetches img/manifest/<layer>.json from R2 before the beaches, lakes and mountains exports or passes --img-manifest to them (run_ |
| T052-f | Wave 19, session 1: T329 (opus) | Only the beach, lake and mountain pages switched |
| T053-a | Wave 19, session 1: T329 (opus) | The removal gate for the six Wikimedia and Geograph hosts from img-src: all call sites in T052-f must be moved to CDN derivatives, and T049- |
| T054-d | Wave 7, session 1: T271 (opus) | The first paint still waits for all 43 country files (12.2 MB, 1.9 MB gzip) because every screen reads the full record |
| T054-h | Wave 18, session 3: T328 (sonnet) | After T054-c, the root repo's tracked copies of continent-app/public data (about 48,000 files) are no longer deployed |
| T055-c | Wave 7, session 1: T271 (opus) | First paint still waits for all 43 country files after the split build, so LCP/INP did not improve in this task's measurement |
| T055-d | Wave 7, session 1: T271 (opus) | The phone price map's INP rose to 312 ms in the split-build run (one of three samples hit 584 ms) |
| T056-b | Wave 8, session 8: T200 (sonnet) | Run continent-app/scripts/verify_no_runtime_fares.mjs once against the split build (VITE_DATA_BASE) and once against the live deploy, so far |
| T059-b | Wave 7, session 1: T271 (opus) | The default screens rank all of Europe, so the first paint still waits for all 238 shards (12.2 MB, ~80 MB at 25,000) |
| T059-c | Wave 8, session 8: T200 (sonnet) | The full-load path now makes 238 requests instead of 43 and the shards gzip ~235 KB worse in total |
| T059-d | Wave 7, session 1: T271 (opus) | scripts/r2/stage-data.mjs fails with EPERM renaming a dist/ directory when postbuild runs straight after vite build on this Windows machine  |
| T059-e | Wave 7, session 1: T271 (opus) | public/sw.js still says its /dest/ rule keeps "one cached copy per country"; it keys on path, so it keeps one per region shard and behaves c |
| T061-b | Wave 7, session 1: T271 (opus) | The 17-tiles-per-session figure is for the default catalogue mode and one representative session (open, zoom continent-to-city, pan once) |
| T061-c | Wave 16, session 4: T231 (sonnet) | Re-measure FCP and tiles-per-session at launch with continent-app/scripts/perf/tiles_and_paint_T061.mjs, unchanged, so the before/after comp |
| T062-g | Wave 6, session 2: T281 (sonnet) | verify_admin_panel.mjs screenshots are taken mid CSS transition and differ run to run on six of twelve images, so they cannot gate a refacto |
| T068-h | Wave 11, session 9: T333 (opus) | Only guides can be reported: the author byline (handle, display name, emoji) in the gallery and any future public surface such as photo uplo |
| T072-c | Wave 18, session 3: T328 (sonnet) | report_pipeline_run() was tested at the unit level (fake HTTP server, real files on this machine) and never inside a real run_pipeline.py ex |
| T072-d | Wave 18, session 3: T328 (sonnet) | layer_row_counts() only covers beaches, lakes, mountains, trails, cycling and regions, the layers with a published top-level wire |
| T075-c | Wave 19, session 1: T329 (opus) | Orphan detection runs in the browser against the public catalogue files |
| T255-b | Wave 18, session 3: T328 (sonnet) | infra/hetzner/cron/carta-weekly.service keeps TimeoutStartSec=48h with a comment built on the retired 29.8 h fare chain |
| T252-b | Wave 9, session 6: T321 (opus) | The rating-tests CI job fails the distribution contract on main (curated/fitted sd gap 0.280 >= 0.18) |
| T252-c | Wave 9, session 5: T320 (sonnet) | The secret-scan CI job fails on placeholders (whsec_..., sk-ant-...) in Execution reports, test_purchase_e2e.md and docs/HANDOFF_LLM_RUNS.md |
| T265-b | Wave 7, session 7: T314 (opus) | Split from T034-c: a paywall left open through a tab close or hard navigation still records no dismissed event |
| T265-d | Wave 6, session 2: T281 (sonnet) | scripts/verify_paywall.mjs reads ../supabase/migrations and ignores CARTA_REPO_ROOT, so it fails in a sibling worktree pair although it pass |
| T078-a | Wave 6, session 6: T285 (sonnet) | src/ingestion/README.md still carries a hand-typed roster table (24 rows against 29 registered collectors) and an "adding a source" sentence |
| T078-b | Wave 7, session 3: T310 (sonnet) | continent-app/src/data/attribution.js is still derived from the ledger by hand via the "ready to paste" section |
| T078-c | Wave 7, session 3: T310 (sonnet) | run_all --list does not print the cadence or licence rows the registry now attaches to every collector class (cls.run, cls.sources) |
| T078-d | Wave 7, session 3: T310 (sonnet) | The retired describe.py row in the ledger's trails section still describes a Claude API provider that T264 removed from the live scripts |
| T083-b | Wave 6, session 5: T284 (opus) | The ErrorBoundary sends log_edge_error('app', 'client_crash', 'client') but 040's fn and code lists refuse both values, so no row is stored |
| T084-a | Wave 10, session 10: T332 (sonnet) | The trip validator reports budget-sum-mismatch on 58 trips (98 errors |
| T084-b | Wave 7, session 2: T143 (opus) | The trip validator reports accommodation-not-slept on 34 trips (46 errors, mostly one hotel per budget tier while the itinerary sleeps in on |
| T084-d | Wave 6, session 6: T285 (sonnet) | Trips/carta-unified/carta-unified/README.md still says "0 errors, 482 warnings" and lists the 15% budget drift as a known gap |
| T096-b | Wave 7, session 4: T311 (opus) | The Spanish national stay prior (32.63 to 38.73 euro pp/night) underprices resort coast by 17 to 56 euro pp/night on every Mallorca, Girona  |
| T096-c | Wave 7, session 4: T311 (opus) | The Geneva Inside Airbnb snapshot parses to a 0.16 euro median whole-home price (977 listings), so the Geneva anchor is absent or wrong |
| T096-d | Wave 8, session 9: T097 (sonnet) + T098 (sonnet) | T097 should publish the food figure (88% of destinations within 6 euro a day, country CI 79% to 93%, tools/benchmark/results/2026-10-01.md)  |
| T107-a | data lane (Part E9), owner-started run | The title ladder is code only |
| T107-b | Wave 7, session 4: T311 (opus) | Rung 1 (Wikidata label) never fires: no stored label column feeds title_ladder(wikidata_label=) |
| T107-c | data lane, after the first real attributes.py run | After-figures were measured on the wire without tags or anchors |
| T108-c | Wave 7, session 4: T311 (opus) | scenic.py stores only the plain name tag, so 799 rows keep non-Latin highlight names |
| T108-d | Wave 6, session 7: T286 (opus) | The card (DestinationsTab.jsx), the KML fact line, AroundHere.jsx and destinationPdf.js print a single stored ascent (+7 m on Korab 9) |
| T108-e | Wave 6, session 7: T286 (opus) | rate.py chooses bigClimb and dayOut from stored ascent and distance alone |
| T108-f | Wave 6, session 7: T286 (opus) | export_wire.py ships validate.py's difficulty beside f.g (11,596 rows disagree) and AroundHere/destinationPdf read it |
| T108-g | data lane (Part E9), owner-started run | The pipeline half (uphill grading, trailhead rg.s3/sc, display_bugs counts) reaches the wire only after regionize.py --refresh, attributes.p |
| T111-b | Wave 9, session 10: T124 (sonnet) | coverage.json carries the country contract and a code on every non ok region, but no screen prints spec 4.6's inline coverage sentence or sp |
| T111-d | Wave 6, session 6: T285 (sonnet) | docs/REGIONS.md describes coverage.json without the per region code field or the contract block |
| T111-e | Wave 8, session 4: T112 (sonnet) | coverage.py --strict exits 1 on a blank contract cell but nothing runs it on a build |
| T192-a | Wave 6, session 3: T282 (sonnet) | The last exhaustive-deps warning, i18n/index.jsx:125 (loaded called unnecessary), is deliberate and needs a disable comment carrying the rea |
| T192-b | Wave 6, session 3: T282 (sonnet) | Promote react-hooks/exhaustive-deps from warn to error in continent-app/eslint.config.js so a regression fails lint |
| T192-c | Wave 6, session 3: T282 (sonnet) | browse/CategoryRail.jsx:41 carries an unused exhaustive-deps disable directive |
| T192-d | Wave 6, session 4: T283 (opus) | 76 exhaustive-deps disable comments remain in src and hide hand-picked dependency lists (one hid a stale stay-price bug) |
| T195-a | Wave 10, session 6: T325 (sonnet) | The carta-design SKILL.md body still teaches the reverted Timetable palette (cool greys, --signal blue, Instrument Sans, IBM Plex Mono, no s |
| T195-b | Wave 6, session 9: T196 (sonnet) | styles.css carries 378 hex literals outside :root while DESIGN.md says never to hardcode one |
| T195-c | Wave 8, session 2: T199 (sonnet) | index.html still loads Instrument Sans, IBM Plex Mono and Inter Tight from Google Fonts although only Fraunces, Plus Jakarta Sans and JetBra |
| T268-c | Wave 9, session 4: T319 (opus) | The guide view counter keeps a per-day salted hash of a reader's user id or address for two days |
| T268-e | Wave 6, session 3: T282 (sonnet) | The Content tab trail layer has no countries: public/trails/index.json names the field country while ContentSection.jsx filters on cc, so tr |
| T268-g | Wave 6, session 2: T281 (sonnet) | verify_admin_panel.mjs hardcodes port 4192 and 10 s waits that fail under load, and lacks the two T268 checks (grid save sends p_country |
| T085-b | Wave 7, session 2: T143 (opus) | Prose ranges (food, hotel, airport lines) are text, not {low, high}; structured fields belong with the K1 schema task |
| T267-a | Wave 7, session 4: T311 (opus) | harvest_wizzair.py, harvest_vueling.py, harvest_volotea.py (and the idle harvest_ryanair_schedules.py) are still in pipeline/ because moving |
| T267-d | Wave 6, session 2: T281 (sonnet) | The smoke gate now settles on selectors instead of five-second waits and the contract gate now checks the split wires, but only the contract |
| T267-e | Wave 9, session 5: T320 (sonnet) | The new queue gate in Execution/_queue/run_queue.ps1 (committed report plus app-repo changes the task left behind) was tested on a throwaway |
| T269-b | Wave 7, session 4: T311 (opus) | run_pipeline.py should run derive.py sources after the layer exports and push the result, so the published list never goes stale |
| T269-c | Wave 9, session 9: T324 (sonnet) | infra/hetzner/jobs/image_transcode.sh accepts only beaches, lakes and mountains and requires a cache tarball |
| T269-g | Wave 18, session 3: T328 (sonnet) | The sources pass reads a whole wire subtree and takes 5 to 13 minutes per layer on the laptop (trails 798 s) |
| T113-a | data lane (Part E9), owner-started run | Committed famous_registry.json predates the Phase 2 classifier (no highway/trail_signal evidence, stale OSM fame cache), so not_a_walk reads |
| T113-b | Wave 7, session 4: T311 (opus) | pipeline/trails/waymarked.py is not in run_pipeline.py's trails_registry task, so the monthly build reads a Waymarked harvest that goes stal |
| T113-c | Wave 7, session 3: T310 (sonnet) | docs/tos/data_licenses.md has no row for the Waymarked Trails route list (ODbL OSM data via waymarkedtrails.org, ids/names/refs/groups only) |
| T113-d | Wave 9, session 7: T322 (sonnet) | 1,930 Waymarked national/international routes in the registry are not in the wire (FR 317, ES 285, DE 270) |
| T113-e | Wave 9, session 7: T322 (sonnet) | 367 GMBA ranges and 217 NUTS3 regions publish walks with no registry walk (Central Balkan Mountains, Cyclades, Agrafa, Kopaonik), so the gat |
| T113-g | Wave 7, session 4: T311 (opus) | famous_registry.wd_query pulls neither P402 (OSM relation id) nor P18 (image) that spec 6.1 names |
| T157-a | Wave 7, session 6: T313 (sonnet) | Ten violations of banned-terms rule found in i18n: ODbL and GLO-30 appear in dest.routesCredit and cycle.sourceNote credit strings in six la |
| T201-b | Wave 6, session 6: T285 (sonnet) | docs/1.CARTA.md, README.md and the PRODUCT.md "Brand voice" example still say 1,570 destinations |
| T126-a | Wave 19, session 9: T138 (opus) | vision_prompt.py is untested against a real Gemini model |
| T177-b | Wave 14, session 7: T178 (sonnet) | Build the chosen path: stage spec per route day, pipeline/journeys/track.py routing through local Valhalla and BRouter with elevation.py, th |
| T177-d | Wave 20, session 2: T334 (sonnet) | dayStats is a prose string on 519 of 525 route days and typeSpecific.gpxReady is true on 30 trips with no file behind it |
| T187-c | Wave 11, session 6: T099 (opus) | T099 implements the first-run receipt as designed: line order and provenance rows, the receipt.* keys in six catalogues, the orientation lin |
| T266-a | Wave 6, session 2: T281 (sonnet) | Harness failures still unowned from T054-i: the destination page phone overflow (verify_destination_page.mjs), the country_brief phone click |
| T266-c | Wave 6, session 2: T281 (sonnet) | T062-g: verify_admin_panel.mjs shots now stop transitions, wait for fonts, settle 300 ms and ask for reduced motion, but two clean back to b |
| T266-e | Wave 6, session 2: T281 (sonnet) | Not covered by the new harness steps: the Reports tab "Open owner" hand-off (the stub's owner is a deleted account), the too_many answer of  |
| T087-b | Wave 6, session 8: T287 (sonnet) | Adopt the shared MonthStrip component on the beach, lake and mountain pages |
| T202-b | Wave 20, session 3: T210 (sonnet) | The competitor prices in T202's comparison are a 2026-10-02 snapshot |
| T204-b | Wave 16, session 5: T336 (sonnet) | T205, T207 and T208 must test every channel against the €0.17 ceiling using the three questions in docs/GTM-ACQUISITION-CONSTRAINT.md |
| T205-b | Wave 8, session 3: T212 (sonnet) | index.html title and og:title separate Carta from Europe Travel with a middot, which the copy rules ban |
| T205-c | Wave 8, session 1: T223 (sonnet) | T223 must reserve the section words (trails, beaches, lakes, mountains, cycling, regions, trips, cost, {n}-days) inside every country namesp |
| T205-d | Wave 10, session 1: T222 (haiku) | The page floor (title, coordinates, licensed image, three measured facts) has not been counted: 27,310 listed-only rows and coast or range r |
| T205-e | Wave 21, session 3: T239 (sonnet) | Geometric dedup has not run (ROUTES.md R0), so overlapping trail and cycling relations will be duplicate pages with no honest canonical |
| T205-h | Wave 8, session 1: T223 (sonnet) | The SEO plan exists only in Execution/P12/T205-programmatic-seo.md |
| T121-b | Wave 7, session 4: T311 (opus) | The hiking ingest (ingest_osm_routes.py) does not drop network:type=node_network relations, so about 98,823 node edges sit in the hiking sto |
| T197-a | Wave 6, session 9: T196 (sonnet) | The component-adoption gate in docs/COMPONENT_ROLES.md is vacuous until the T196 generic-pattern detector exists |
| T197-b | Wave 6, session 3: T282 (sonnet) | PassModal.jsx and planner/AiDayPlanModal.jsx are aria-modal dialogs with no useFocusTrap and no Escape handler in the component, against the |
| T197-d | Wave 10, session 9: T335 (sonnet) | No shared Button component exists (90 button class families in styles.css) |
| T217-b | Wave 20, session 4: T330 (opus) | Refunds are invisible to admin_oss_threshold and admin_margin: add refunded_cents, refunded_at, refund_id to pass_grants, a webhook branch f |
| T217-c | Wave 6, session 5: T284 (opus) | No audited way to move entitlements.expires_at without resetting period_start (admin_set_tier gives a fresh allowance) |
| T218-a | Wave 8, session 6: T316 (opus) | Build the status surface from docs/INCIDENT_RUNBOOK.md: a static status file on the data host read once at boot and shown through the site b |
| T218-c | Wave 9, session 9: T324 (sonnet) | weekly.sh exits 3 when the R2 publish or archive step fails after run_pipeline.py has already pinged success, so that failure alerts nobody |
| T218-e | Wave 16, session 6: T235 (sonnet) | Rehearse each of the five runbook responses once (failed webhook in test mode, Gemini key unset, a killed weekly run, data host down, Supaba |
| T246-b | Wave 20, session 8: T331 (sonnet) | The reopen trigger on conversion cannot be measured: paywall events carry no platform or display-mode bucket |
| T246-c | Wave 20, session 8: T331 (sonnet) | The Stripe checkout round trip from an installed home-screen web app is untested: out-of-scope navigation to the hosted checkout and the ret |
| T270-d | Wave 7, session 8: T315 (opus) | The Audit tab shows previous beside new but has no revert action: the RPCs cannot delete a config key that was new or empty an override note |
| T088-a | Wave 7, session 2: T143 (opus) | Gateway airports are parsed in the browser from one hand-written string and 79 of 223 trips fall back to a single airport plus an info butto |
| T206-b | Wave 11, session 9: T333 (opus) | No upload path exists for routes or photos, so the CC BY or CC BY-SA licence choice (destinations spec 2.8) has nothing to attach to |
| T206-f | Wave 20, session 2: T334 (sonnet) | The journey GPX button of trips spec F4 is not wired: typeSpecific.gpxReady is set on 30 of 253 journeys and no page reads it |
| T207-c | Wave 9, session 2: T318 (sonnet) | The explainer needs a public home that is not a landing page (platform decided in T226), and the Data sources credits (43 entries, AccountPa |
| T207-f | Wave 16, session 4: T231 (sonnet) | No traffic ceiling for Supabase or the hosting is measured, so the launch rollback has no load figure |
| T207-g | Wave 6, session 6: T285 (sonnet) | public/sitemap.xml holds 1 URL; the search channel the acquisition constraint depends on is not live until T221 and T222 land, and doc claim |
| T208-c | Wave 16, session 5: T336 (sonnet) | Draft a short courtesy note, with a link to the credit, for the bodies credited in attribution.js (43 entries) to send at launch, and ask th |
| T214-c | Wave 8, session 2: T199 (sonnet) | index.html loads the stylesheet from fonts.googleapis.com, sending every visitor's IP to Google before the app runs (LG Muenchen I, 3 O 1749 |
| T214-d | Wave 21, session 7: T243 (sonnet) | If T243 wants route-level traffic it adds one first-party page_view RPC in the shape of 022 (route and day only, no identifier, guests inclu |
| T215-b | Wave 7, session 8: T315 (opus) | Priced-trip completions are not recorded anywhere |
| T215-c | Wave 7, session 8: T315 (opus) | Affiliate clicks leave through decorated links in affiliate.js, activityAffiliates.js and omio.js and nothing counts them |
| T215-d | Wave 7, session 8: T315 (opus) | The error rate is a count of failed AI calls with no denominator and no client-side errors |
| T216-c | Wave 20, session 8: T331 (sonnet) | Send each canned answer in docs/SUPPORT.md once against a real or test case (with T217-a) and correct any wording the reality contradicts |
| T276-a | Wave 6, session 2: T281 (sonnet) | scripts/verify_csp.mjs holds three hard-coded copies of the old CSP (with emrldtp.com and the script hash) and several verify scripts list e |
| T176-a | Wave 20, session 2: T334 (sonnet) | Journey GPX (typeSpecific.gpxReady, 30 of 253) is still not wired |
| T176-c | Wave 6, session 2: T281 (sonnet) | Open one loop and one one-way trail on the dev server as a signed-out visitor, press GPX and KML, and check the border-trail subtitle (Korab |
| T277-a | Wave 6, session 6: T285 (sonnet) | PRODUCT.md "The one rule the numbers follow" first paragraph still words the harvested, cached, estimate chain in flight terms |
| T278-a | Wave 6, session 3: T282 (sonnet) | The bag check panel (BagCheck.jsx, carrier cabin-bag allowances) is no longer rendered because an unpriced route names no carrier |
| T279-a | Wave 6, session 2: T281 (sonnet) | verify_fare_provenance.mjs checks the trip receipt only |
| T219-b | Wave 10, session 7: T326 (sonnet) | Build the front door in the app repo: the link on DestinationPage, TrailPage, BeachPage, LakePage, MountainPage and the cycling page, the fo |
| T219-c | Wave 6, session 5: T284 (opus) | One migration after 045: add 'data' to the kind check on public.feedback and 'cycle' to the layer check on content_overrides, with self-chec |
| T220-e | Wave 10, session 1: T222 (haiku) | The lag between submitting the D-28 sitemap and pages being indexed is unmeasured |
| T226-b | Wave 9, session 2: T318 (sonnet) | Build the explainer "Where the numbers come from" as one prerendered page on the domain at a path T223 reserves outside the country namespac |
| T226-c | Wave 15, session 10: T225 (sonnet) | Build the monthly data notes page and its Atom feed in the sitemap build: the coverage.json difference between builds, the freshness report, |
| T092-a | Wave 7, session 2: T143 (opus) | The gateway parse is a fallback for hand-written text on 79 trips |
| T092-b | Wave 7, session 2: T143 (opus) | Currency line and extended budget notes are not part of the fixed rows |
| W5-a | Wave 6, session 2: T281 (sonnet) | verify_trail_page.mjs fails two checks on the merged tree ("trips still show the sort chips", "city day cards render [0 cards]") while all i |
| T288-c | Wave 7, session 4: T311 (opus) | pipeline/archive/pack.py has no guard for a FAT32 target: lakes-cache (4.7 GB) stopped at 4 GiB on D: with Errno 28 "No space left"; check t |
| T288-d | Wave 8, session 7: T317 (sonnet) | The T045 report's restore command runs pg_restore --clean --if-exists against the live trailslab database |
| T294-a | Wave 8, session 7: T317 (sonnet) | Cloudflare Pages answers every unknown path on the app host with index.html and 200, because the deploy has no top-level 404.html |
| T296-b | Wave 8, session 7: T317 (sonnet) | Split from T054-i: push-data.mjs --prune syncs each current R2_TIER entry, so the objects of an entry later removed from R2_TIER stay in r2: |
| T296-c | Wave 6, session 2: T281 (sonnet) | Split from T054-i: screen harness failures seen in T054 still have no owner (destination page phone overflow, reach_filter CRL premise, REGI |
| T297-a | Wave 18, session 3: T328 (sonnet) | Untracking continent-app/public (T054-h, tried in T292 and reverted in T297) needs a regeneration path first: about 48,000 of the files are  |
| T300-b | Wave 9, session 4: T319 (opus) | The Article 30 record in the T022 report is wrong in six places (transfers, Supabase DPA version, a Gemini consent gate that does not exist, |
| T300-c | Wave 9, session 4: T319 (opus) | The privacy policy (T017) says analytics events are kept 90 days and automatically deleted |
| T300-d | Wave 7, session 3: T310 (sonnet) | T010 says it wrote storable-copy verdicts into docs/tos/data_licenses.md, but the ledger was never edited |
| T300-f | Wave 9, session 9: T324 (sonnet) | arm64 portability from T006 with no row: the pgrouting image is amd64-only (swap to a multi-arch build), and trailslab scripts use pgrep and |
| T300-g | Wave 7, session 1: T271 (opus) | T011 found the phone destination page CLS at 0.309 (the one failing Core Web Vital) and never measured the trip page INP; both belong to the |
| T300-i | Wave 7, session 8: T315 (opus) | The GDPR export (024, T020) covers four tables |
| T300-k | Wave 6, session 10: T211 (fable) | docs/FIRST_RUN_RESULT.md (T187, approved by T272) builds the receipt on Carta flight estimates, which T272 banned the same day |
| T300-l | Wave 6, session 6: T285 (sonnet) | T275 closed T215-a by choosing the host server-side dashboard as the visitor source, but docs/LAUNCH-METRICS.md still shows the gap and name |
| T300-n | Wave 11, session 8: T327 (opus) | The facts store (T041 design, migration "030_facts.sql") was never written and 030 became the AI usage rollup, so the pg_cron, pg_net and va |
| T300-o | Wave 6, session 5: T284 (opus) | T034 left the admin_guard read-burst rate limit untested and unregistered |
| T300-p | Wave 7, session 4: T311 (opus) | T121 found a redundant second clause in harvest_cycling.is_node_network and left it unregistered |
| T300-q | Wave 7, session 6: T313 (sonnet) | scripts/ci/banned-terms.mjs (T157) drops French strings that contain an apostrophe, so it reports 10 hits where 12 exist (ODbL 10, GLO-30 5  |
| T300-r | Wave 9, session 8: T323 (sonnet) | T038 says the fallback-chain log is fire-and-forget, but plan-day/index.ts awaits the insert before returning |
| T300-u | Wave 7, session 7: T314 (opus) | supabase/functions/checkout/test_purchase_e2e.md predates 044: add checks that a Year holder buying a Trip Pass keeps Year, a sixth purchase |

# Part G. What the fact-check found

All 150 reports from T001 to T294 were checked against the repository on 2026-10-02 (T300). 97 hold
up, 39 have small inaccuracies (wrong cross-references after the T017 to T022 renumbering, counts
off by one, omitted files, em dashes in older reports), 3 were reversed by a later owner decision
(T187, T246, T256), 3 are about live systems only (T288, T291, T293), and 8 have a material
discrepancy. The eight, and what was done about each:

- T010: the storable-copy verdicts were never written into the licence ledger (row T300-d, wave 7).
- T017: the privacy policy promises analytics deleted after 90 days; no code does that (T300-c, wave 9).
- T022: the EUIPO search was never run (T300-a, yours) and the Article 30 record is wrong in six places (T300-b, wave 9).
- T057: its rollback would revert eight tasks; revert app commit bdd125d instead (loose end 3).
- T075: orphan detection flagged every override after a failed fetch; T270 fixed it (T300-m, closed).
- T206: '16,973 EuroVelo sections' is the count of all cycling route files; the families hold 665. Do not reuse it in outreach.
- T272: approved a first-run design that prices flights on the day it banned flight pricing (T300-k, wave 6, then your re-approval).
- T292: the untrack assumed npm run data regenerates the files; it does not, and T297 reverted it (T054-h reopened, T297-a).

Register fixes made by T300: 12 statuses corrected (T270-c, T266-d, T036-c closed by the tasks that
really did them; T054-h reopened; four disk-space rows closed at 59 GB free; T041-b retargeted to
T147; three duplicates cross-referenced) and 23 rows added (T300-a to T300-w), mostly open items
from the P0 and P1 reports, which predate the register and were never entered. T295 to T298 were
merged after the check and are not covered. The full verdict table is in
`Execution/P0/T300-factcheck-and-open-consolidation.md`.
