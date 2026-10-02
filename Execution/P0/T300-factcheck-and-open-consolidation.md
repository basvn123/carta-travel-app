# T300: fact-check every report, consolidate the open items, table the next waves

## Task ID

T300

## Date

2026-10-02

## What changed

Every execution report from T001 to T294 (150 reports) was checked against the repository by nine read-only agents. Each report's concrete claims were tested: that the files and functions it names exist, that the commits it cites exist and touch the files it says, that the work is merged, that one to three of its figures re-derive from the data, and that its open items are in the register with the right status. The result is 97 verified, 39 with minor inaccuracies, 3 superseded by a later owner decision, 3 that depend on live systems only, and 8 with a material discrepancy. The eight are listed below with what was wrong. T295 to T297 were merged into main by another session while this check ran and are not covered.

Three documents now carry the result. `Execution/_OPEN-MASTER.md` is rewritten around its existing stages: every stage and step is marked done, partly done or open, nothing was removed, and it gains one consolidated list of every task only the owner can do (every open `user` row in `_OPEN.md`, the old Part D of `PARALLEL-WAVES-PLAN.md`, and what this check found) plus a map of every open `next task` row to the wave that takes it. `Execution/_WAVES.md` is new: waves 6 onward, ten sessions each, with the model, the task and the full prompt for every session, generated from the mind map by `Execution/_queue/waves_md.py`. The register `_OPEN.md` got status corrections where a row's status was wrong and 23 new rows (T300-a to T300-w) for open items that were never registered or that this check found.

The register started on 2026-09-24 (commit c604cfac3), after the P0 and P1 reports were written, so none of those reports' open items had a row. This check backfilled the ones still open.

## Files touched

**Created:**
- Execution/P0/T300-factcheck-and-open-consolidation.md
- Execution/_WAVES.md
- Execution/_queue/waves_md.py (left untracked like the other _queue tools, row T300-v)

**Modified:**
- Execution/_OPEN-MASTER.md (status markers on every stage, new parts: owner list, row-to-wave map, fact-check findings)
- Execution/_OPEN.md (status corrections, rows T300-a to T300-w)
- Execution/P2/_OPEN-stripe-launch.md, Execution/P2/_OPEN-gemini-billing.md, Execution/P3/_OPEN-hetzner.md (a superseded banner at the top; the body is unchanged)
- PARALLEL-WAVES-PLAN.md (a pointer at the top: waves 6 onward live in `Execution/_WAVES.md`, Part D lives in `_OPEN-MASTER.md`)

## Commands run

Read-only git and grep through nine agents (`git show --stat`, `git cat-file -t`, `git merge-base --is-ancestor`, `git ls-tree`, grep over the source, and small JSON recounts). No build, no pipeline, no database, no push. Then:

```
python Execution/_queue/waves_md.py          # writes Execution/_WAVES.md
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Reports fact-checked | 0 | 150 | +150 |
| Register rows | 471 | 494 | +23 |
| Rows with a wrong status corrected | 0 | 12 | +12 |
| Open items only in prose (no row), P0 to P1 and found here | about 20 | 0 | all registered |
| Places that list open items | 6 files (_OPEN.md, _OPEN-MASTER.md, three procedure files, PARALLEL-WAVES-PLAN Part D) | 2 (_OPEN.md the record, _OPEN-MASTER.md the plan) | -4 |

## What broke and how it was fixed

The eight material discrepancies. Reports are never edited after they close, so each is recorded here and, where work remains, as a register row.

| Report | What is false | Consequence and row |
|---|---|---|
| T010 | It says it wrote storable and not-storable verdicts into `docs/tos/data_licenses.md`. Commit 7884984b0 adds only the report; the ledger was not touched. | The storable-copy verdicts exist only in the report. The ledger is now generated from the registry (T078), so the verdict becomes a registry column. T300-d. |
| T017 | The privacy policy it wrote says analytics events are kept 90 days and "automatically deleted". Migration 022 prunes at 180 days, nothing schedules the prune, and 022 is not applied. | The published policy promises something no code does. T300-c. |
| T022 | The EUIPO trademark search was never run (the result section says "an actual search would likely reveal"; Legal.md line 100 still says "Not done"). The Article 30 record says no international transfers occur, gives the Supabase DPA as "v3 2024" (T018 found version 1 of 2026-08-01), claims a Gemini consent gate that does not exist, says there is no access tool although T020 shipped the export, claims a 90-day cron that does not exist, and omits Stripe. | No trademark clearance and an Article 30 record that is wrong in six places. T300-a (owner runs the search), T300-b (rewrite the record). |
| T057 | Its rollback reverts root commit 4b2d8e19f, which carries 84 files of T011 to T056 work (row T062-a), and never names the app commit bdd125d that carries the change. | Following the rollback as written would revert eight tasks. The correct rollback is `git -C continent-app revert bdd125d`. Recorded in `_OPEN-MASTER.md`, loose ends. |
| T075 | It says network failures "silently skip" orphan detection. In 6336bd6 a failed layer fetch left an empty set, so every override in that layer was flagged as an orphan, and the fetch ignored `dataUrl`. | T270 fixed it without a row. T300-m records it, closed by T270. |
| T206 | "17 EuroVelo families, 16,973 sections on the wire": the family files hold 665 sections (279 published); 16,973 is the count of all cycling route files. | Do not reuse the figure in outreach copy. No row; recorded here. |
| T272 | It decides that Carta does not price flights and, in the same report, approves `docs/FIRST_RUN_RESULT.md` "as written", although that design is a receipt built on Carta's estimated fares ("Flight out ~ EUR 58.98 est.", `receipt.flightOut`, `receipt.flightsNote`). | T099 would build the flight estimates the owner banned. T300-k: revise the design before T099; the owner approves it again. Taken by T211 in wave 6. |
| T292 | It says `npm run data` regenerates the 48,211 public files it untracked. Most of them are pipeline layer exports, not sync output. | T297 reverted it. T054-h was marked closed by T292 and is reopened here; T297-a carries the regeneration path. |

Minor inaccuracies (39 reports) are wrong cross-references from the renumbering of T017 to T022 (cfe1c744c moved each one slot), counts off by one, "Files touched" lists that omit `_OPEN.md`, em dashes in older reports, and rollback lines that name a commit later amended (T053 cites 203b334, the commit on master is 9699a48). The full table is the appendix.

Register status corrections made by this task: T270-c closed by T266 (check 11 was already fixed, app d47337f); T266-d closed by T267 (the urlState.js comment was rewritten in app 78c9563); T036-c closed by T265 (the quota tests run on a throwaway initdb server); T054-h reopened (T297 reverted T292); T290-b, T268-f, T269-h and T252-d closed by T300 (C: has 59 GB free, measured 2026-10-02 20:30); T041-b retargeted to T147 (migration 030 has no cron; the facts store migration it needs was never written); T035-c marked as waiting on the owner row T265-c; T092-a marked as the same item as T088-a; T187-d marked as the same file as T226-d.

## What is still open

The rows T300-a to T300-w in `_OPEN.md` carry everything this check found that is still to do. The owner's share is in `_OPEN-MASTER.md` Part E; the rest is assigned to a wave in `_OPEN-MASTER.md` Part F and in `_WAVES.md`. Three things a later task should know: T295 to T297 were not fact-checked; T288's closure of T045-b and T045-d rests on weaker evidence than the rows asked for (the lifecycle list was not seen, and a streamed `pg_restore -f -` replaced the scratch-database restore), which the T288 report says openly; and the files written here are left uncommitted in the main checkout because another session was working in it.

## Rollback procedure

Delete `Execution/_WAVES.md`, `Execution/_queue/waves_md.py` and this report, and restore the edited files from git: `git checkout -- Execution/_OPEN-MASTER.md Execution/_OPEN.md Execution/P2/_OPEN-stripe-launch.md Execution/P2/_OPEN-gemini-billing.md Execution/P3/_OPEN-hetzner.md`. `PARALLEL-WAVES-PLAN.md` is untracked, so remove its first pointer paragraph by hand. Nothing else changed.

---

## Appendix: verdict per report

Verdicts: VERIFIED (claims match the repository), MINOR (small inaccuracies), DISCREPANCY (a material claim is false), SUPERSEDED (accurate when written, reversed later by a named decision), UNVERIFIABLE (the claims are about live systems only).

### P0 and P1 (T001 to T022)

Background: register created 2026-09-24 (c604cfac3), after all P0/P1 reports; none of their open items were ever backfilled. P1 reports T017-T022 were renumbered one slot by cfe1c744c (commits carry old numbers).

| Report | Verdict | Findings |
|---|---|---|
| T001 | MINOR | Folders + template exist; no commit of its own (first committed inside T005's f725c0669). |
| T002 | VERIFIED | 4b8c7d996 creates 83-line CLAUDE.md. |
| T003 | VERIFIED | prod-2026-09 -> 8b53babed, on origin. |
| T004 | VERIFIED | ops/backup_supabase.sh, restore, docs/BACKUP.md; USB dump 51,132 bytes matches. CARTA_CLOUD_ARCHITECTURE.md later committed at additional docs/Carta/Plan/Architecture/ (4b2d8e19f). |
| T005 | MINOR | Says "off-machine" but copied to $TEMP; closed later by T023 (D:\carta-backups\app_data_masters with SHA256SUMS). |
| T006 | MINOR | Pins match; follow-ups sent to "T024" (now Pages); pgrouting multi-arch swap and Valhalla digest pin never done, no row. |
| T007 | VERIFIED | Arithmetic holds (222,097; 179,386; 1,076,316). |
| T008 | MINOR | 4:4:4 note says 19% more bytes, it is 23%; one figure mislabelled between two tables. |
| T009 | MINOR | 52,069 sums; sends R2 offload to "T031/T032" (wrong numbers). |
| T010 | DISCREPANCY | Claims it modified docs/tos/data_licenses.md with storable verdicts; commit 7884984b0 adds only the report; no ledger edit. Cites T026 as image ladder (it is the history rewrite). |
| T011 | VERIFIED | App 93e701d; JSON medians match (phone dest LCP 2,564, CLS 0.3085). |
| T012 | MINOR | Imprint on master (c0cf60e); report and code comments name T015 as the entity task (it is T014). |
| T013 | MINOR | ToS + LegalFromUrl on master; CHECKOUT_TERMS_URL gate in checkout/index.ts:116; wrong cross-ref (T022 for T032); production build never completed. |
| T017 | DISCREPANCY | Privacy policy promises analytics kept 90 days and "automatically deleted"; 022 prunes at 180 days, is unscheduled and unapplied. Two em dashes in added text. Says "still open: None". |
| T018 | MINOR | Docs only; stale numbering; Vercel gap moot after Pages move, but no Cloudflare DPA check and no row. |
| T019 | VERIFIED | compact attribution in 9 map files; visual check unrecorded. |
| T020 | VERIFIED | 024 reads auth.uid(), 4 tables; app d5210ce. |
| T021 | MINOR | Ledger diff matches; attribution.js reached app master only 2026-09-28 (c2355a3). |
| T022 | DISCREPANCY | EUIPO search never run ("an actual search would likely reveal"); Legal.md:100 still "Not done". Article 30 record wrong: says no international transfers (Vercel US, Gemini global), Supabase DPA "v3 2024" (is v1 2026-08-01), claims Gemini consent gate (none exists), says no access tool (T020 shipped export), claims 90-day cron (none), omits Stripe. |

- Register gaps (no rows ever): T006 pgrouting multi-arch + Valhalla digest + Linux portability; T007 3,983 wire images without cache, non-raster files; T008 dead Commons probe, keep originals in R2?; T010/T021 Open-Meteo non-commercial, Ferryhopper/OpenSky/Numbeo commercial gates; T011 trip INP, phone dest CLS 0.309; T012 Imprint placeholders await T014; T020 widen export (day plans, saved trips, profiles, friends, pass grants), verify_account_panel 380px; T022 EUIPO search; T018 Cloudflare DPA; T017/T022 false "90 days auto-deleted" privacy claim; T022 Article 30 record rewrite.

### P1 later, stage 5 and 6 (T023 to T029, T252 to T294)

Merge state: T288-T297 merged into main ~19:50 2026-10-02 (087f25af7, ad672b47a, febf9626c), NOT pushed; main 161 ahead of origin. T297 reverts T292.

| Report | Verdict | Findings |
|---|---|---|
| T023 | VERIFIED | app_data holds only app_data.json + manifest; D:\carta-backups\app_data_masters has 5 masters + SHA256SUMS. 6 em dashes. |
| T024 | MINOR | App 9cf6d3b creates _headers, _redirects, check-pages-limits, wrangler.toml; says vercel.json has 8 header rules (has 10). 14 em dashes. |
| T025 | VERIFIED | Counts match (48,224 vs 48,222 claimed). Untrack went T054-h, T292, reverted by T297. |
| T026 | VERIFIED | Analysis only; gc follow-up done by T252. |
| T027 | VERIFIED | f81c80f9d + app 46a1e43 delete 6 files; stale comments, CSS, verify_reach_filter gone now. |
| T028 | MINOR | Tier counts off by one (Manual 51 / Library 68 vs 50 / 69); "251" and "253" both used. |
| T029 | VERIFIED | 6 scripts/ci files; EXPECTED_SCHEMA_VERSION 17; run_pipeline bugs fixed by T261. |
| T252 | VERIFIED | 1 pack 528.44 MiB; D: bundle exists. |
| T260 | VERIFIED | __main__ guard, --yes. |
| T261 | VERIFIED | TASK_ALIASES, --allow-backfill; bathing_water before beaches/lakes. |
| T276 | VERIFIED | No emrldtp/travelpayouts/avs.io on master; verify_csp.mjs still 4 copies (T276-a). |
| T288 | UNVERIFIABLE | Live R2/gpg/dump claims; T045-b and T045-d closed on weaker proof than asked (lifecycle list never seen; streamed pg_restore -f - instead of scratch DB restore), stated openly. |
| T289 | VERIFIED | c259e21 shell only for npx. |
| T290 | VERIFIED | de41124 data host in connect-src in both files. |
| T291 | UNVERIFIABLE | Live Vercel deploy claims; "branches unmerged" now stale. |
| T292 | DISCREPANCY | Claim that npm run data regenerates the untracked files false (most are pipeline exports); reverted by T297. |
| T293 | UNVERIFIABLE | Live Pages/DNS claims; register edits correct. |
| T294 | VERIFIED | 689bc8d _redirects empty, LF pinned. |

- Register: T266-d fixed by T267 (should close). T054-h says closed by T292 but T297 reverted it (T297-a open). T290-b (C: too full) closeable: 69 GB free after T045-e. T046-b closer should be T258 not T252. T045-b/T045-d substitute evidence.
- Delta: T288 closes T044-a..d, T045-a..d, adds T288-a,b (user), T288-c,d (next). T290 closes T053-b, T054-a, T054-b; adds T290-a (closed T291), T290-b (user). T291 closes T054-c, T290-a; adds T291-a (closed T293), T291-b, T291-c (user). T292 closes T054-h (invalid). T293 adds T293-a (user), T293-b/c (closed T294). T294 adds T294-a. T295 closes T054-f, T054-g. T296 closes T054-i, adds T296-a..c. T297 adds T297-a.

### P2 (T030 to T043, T259, T264, T265)

All P2 commits merged (root main, app master).

| Report | Verdict | Findings |
|---|---|---|
| T030 | VERIFIED | 007 header claim and free row confirmed; 021 sets free to 2. |
| T031 | MINOR | e2e doc exists; opening says "eleven of twelve checks" but table has 14 observed, 1 static, 3 blocked. |
| T032 | VERIFIED | 025 consent_tos + index; app 79a8093. |
| T033 | VERIFIED | 026 buyer_country, admin_oss_threshold; T033-e closure by T270 real (OssThreshold.jsx). |
| T034 | MINOR | 027 + self-check; admin_guard read-burst test never done, no row. |
| T035 | VERIFIED | gcloud proof text in passes.mjs, plan-day, 007; 006:9 still says never billing. |
| T036 | VERIFIED | test_global_cap.mjs rewritten (c0d9a73); 49 = 21 + 28. |
| T037 | MINOR | Prose says Part A has 69 assertions; recorded output shows 65. Closures by T265 real. |
| T038 | MINOR | 028 exists; "fire-and-forget outside the response path" false: index.ts:613 awaits the insert; Files touched omits app 061ff87. |
| T039 | VERIFIED | CACHE_KEY_VERSION 5; 95.7%/98.4% re-derive; 029 never executed (T039-d stands). |
| T040 | VERIFIED | Token means re-derive (1,258 / 1,500). |
| T041 | MINOR | Design names 030_facts.sql but 030 was taken by T042's ai_usage_rollup; no facts migration exists, so T041-b points at nothing. |
| T042 | VERIFIED | 030 ai_cap_events, admin_ai_usage; seed sums add up. |
| T043 | MINOR | 031 verified; claim it "can happen at any point" wrong: reads 026 columns. |
| T259 | VERIFIED | 5 screenshots; project gen-lang-client-0445365032, Prepay Tier 1. |
| T264 | VERIFIED | No import anthropic left in any .py. |
| T265 | VERIFIED | 044 + self-check; pass_can_buy, keep-higher-tier, fee_cents; 11 rows closed in code. |

- Register: T041-b WRONG (no cron in 030; facts migration not written; MASTER 3.2 asks owner for vault secrets for a nonexistent migration; belongs with T147). T032-d open with no claimant. T036-c stale (T265 ran Part A on initdb 55441; Claude-owned). T035-c duplicates T265-c. No rows: T034 read-burst test, T038 admin display minimal. T259-a/b, T265-b/c/d missing from _OPEN-MASTER.
- Procedure files: _OPEN-stripe-launch.md stale (paste order lacks 021, 031, 044; nine-arg grant_pass now twelve; merge order obsolete; decisions now closed; test_purchase_e2e.md lacks 044 checks: higher tier kept, 409 pass_max, reason/fee_cents). _OPEN-gemini-billing.md stale (T035-a/T036-a done by T259; live cap checks ordered before 028 paste; 031 position; old test counts; T037-a/c closed). Superseded by _OPEN-MASTER.

### P3 early (T044 to T057)


| Report | Verdict | Findings |
|---|---|---|
| T044 | MINOR | Scripts exist (app 26341ba); --remote added later by T257; em dashes. |
| T045 | VERIFIED | manifest.yml, pack.py, push.py; 1,332 inputs, 29,306 cache files, 60/30-day rules re-derived. |
| T046 | VERIFIED | 8651cf19d, 8 infra files; pins in cloud-init; no ANTHROPIC key. |
| T047 | VERIFIED | 2d85d3616, 22 files; cost.py rates; GIT_LFS_SKIP_SMUDGE; rows a-l. |
| T048 | VERIFIED | 5281b5210; constraints.txt 72 pins; no OnBootSec. |
| T049 | MINOR | derive.py, manifest schema; 189,290 = 37,858 x 5 checks; says PHOTOS.md untouched but 31bf3c0bf edits it (T050 fold-in). |
| T050 | MINOR | r2_delete, edge_purge, manifest_purge present; Files touched omits _OPEN-hetzner.md/_OPEN.md; T050-b self-closed non-item. |
| T051 | VERIFIED | credit.py clean(), verify_attribution_cdn.py; app 97d88f1. |
| T052 | VERIFIED | App 645f59a (LayerPhoto, pictureFlag), root 2292849a6 (wire_ladder.py). |
| T053 | MINOR | Cited app commit 203b334 is an orphan (amended to 9699a48): rollback names the wrong commit; says six Wikimedia/Geograph hosts, img-src has seven; "lives in production now" unsupported. |
| T054 | VERIFIED | ee23f77, 25 files; R2_TIER 17 entries; sw.js carta-v7. |
| T055 | MINOR | Vitals re-derive exactly; says 312 ms "is the worst of three by design" but it is the median; calls register orders "_OPEN-hetzner steps". |
| T056 | VERIFIED | App 0d48811; trace 21 call sites, 1,884 requests re-derived. |
| T057 | DISCREPANCY | Rollback reverts 4b2d8e19f (84 files of T011-T056 work) and never names the app commit bdd125d that carries the change; bold headings, em dashes; edited after the fact (722f4486e). Figures 24.509 to 22.546 MB re-derive. |

- Register: T054-h should be reopened (T297 reverted T292). T047-h status is free text. T050-b self-closed non-item. T046-a open but MASTER 7.2 treats IPv4 as decided while provision.sh defaults IPV4=0 (needs IPV4=1 on the command line, as 7.2 says). T048-j data half answered by T262; only the app-deploy half remains (same as T262-a). T055-a and T056-b now actionable (T054-a..c closed).
- Hetzner file: superseded by MASTER stages 7-8; stale steps 1, 2, 9, 10, 11, 12, 14, 16, 17, 22, 29, 30-34; missing T045-e and T055-b.

### P3 later (T058 to T280)


| Report | Verdict | Findings |
|---|---|---|
| T058 | VERIFIED | Decision only; baseline 286 slices / 7,596 records re-counted exactly. |
| T059 | MINOR | Merged (app 4fc5b3d); "Files touched" names rows T059-a to e but T059-f was added later (19c184f10). |
| T060 | MINOR | Merged (app a45d5b2); lists _OPEN.md as modified but report commit 71bf42eac does not touch it (no rows raised). |
| T061 | MINOR | Harness and JSON match every figure; "Files touched: None" though 592f17e12 edits _OPEN.md; open section omits row IDs; 6 em dashes. |
| T062 (P3) | VERIFIED | Rescue commits bdd125d, afdb35e, c2355a3 on master; run_queue.ps1 on main; 4b2d8e19f carries 84 files. |
| T262 | VERIFIED | 103b75f73 touches all 7 files; push-data gated on VITE_DATA_BASE; lifecycle 14d rule. |
| T263 | VERIFIED | 302505b8e; cloud-init PGDG, constraints, npm ci; reboot skip on spawn.sh. |
| T267 | VERIFIED | App 78c9563 (21 files) + root 3614af1a4; all 7 claimed rows closed in code. |
| T269 | VERIFIED | ffeeeaada, f088a139f; derive.py sources/probe/gc; T047-g closed though parity run deferred to T269-d. |
| T273 | VERIFIED | App cc6212d, 37399fa; flight removed from totals; only ground legs priced. |
| T278 | VERIFIED | App f0ecf0e; ownFlightTransfers, removeOwnFare; only BagCheck.jsx (unrendered) reads carrier (T278-a). |
| T280 | VERIFIED | 69150fad4 + 7f41643c8, 9 tests; its count 160 vs T269's 102 left unreconciled. |

- Register: no missing rows; closers T255/T266/T267/T277/T278/T279/T280 verified in code. T058-b closed with HARVESTED_FAMILY=set() (row asked Ryanair family; fine after full retirement).

### P4 admin (T062 to T078)


| Report | Verdict | Findings |
|---|---|---|
| T062 (P4) | VERIFIED | App cb9d82f, c8538c4, root f8ff1d734 merged; AdminPage.jsx 2,033 to 151 lines. |
| T063 | VERIFIED | 032 aal2 check, hint mfa_required; 6a42fc9cd, 60df4c2 merged. |
| T064 | VERIFIED | 033 for update reads, exists:false marker; 9963d80dc, 234b754. |
| T065 | VERIFIED | 034 admin_guard('destructive'); 16956c6f7, 05e84da. |
| T066 | VERIFIED | 035 public column + policy, 3 public keys; report cites no hashes (a99ecd06b, 69a5852fa, app 6ab6aad exist). |
| T067 | VERIFIED | 2a07b9440, a243bc1; seven sections. |
| T068 | VERIFIED | 670b96749, 3938a9b; FeedbackInbox rename; 15 keys x 6 locales. |
| T069 | VERIFIED | 038 takedown marker; c46bd6b4f, 36e5cdf. |
| T070 | VERIFIED | 039 four RPCs, reinstate marker; 2e96c78dd, e4101b8. |
| T071 | VERIFIED | reportEdgeFailure in 3 wrappers; 941e7e13a, 3667e74. |
| T072 | MINOR | Code verified; Files touched omits _OPEN.md (30d7026b5); rollback omits report commit; "open the Overview after paste" has no row. |
| T073 | MINOR | Code verified; rollback reverts cf35a33b8+9b06ca0 but 042 and fix live in 185ce5c71 + app 3137893; typo "edge_errors (140)"; T073-d is a self-closed non-item. |
| T074 | VERIFIED | 62f020725, d8a0761; 043 column grant, 366-day cap. "nothing is merged" now stale. |
| T075 | DISCREPANCY | Claim "network failures silently skip detection" false: 6336bd6 flagged every override in a failed layer as orphan (vacuous empty set) and fetched without dataUrl; T270 fixed it without a register row. Harness "+7" figure belongs to T074; code is 71 lines not 39. |
| T076 | MINOR | 14 admin.diff keys not 13; one new ok() call contrary to report; root mirror hash left as placeholder. |
| T077 | VERIFIED | 37 admin_* functions = MIN_FUNCTIONS; 88b934315, 67b138ab9, app 9a25945. |
| T078 | VERIFIED | data_licenses.md generated (707 lines), ledger.py, 8 tests, data-licences.yml; 7839752e6. |

- Register: complete. T268/T254/T270/T266/T267 closers verified in code. Problems: T073-d not an open item (self-closed); T075 orphan bug unregistered (fixed by T270); T072 post-paste check has no row. Aside: PrivacyPolicy.jsx:127 contains an em dash.

### P4 later and P5


| Report | Verdict | Findings |
|---|---|---|
| T083 | VERIFIED | 862f0dcd2 + app 7811006; rls-policies.yml; ErrorBoundary calls reportClientCrash. |
| T253 | MINOR | 018 fixed ({5,} plus char_length > 608); says thirteen harnesses carried the fallback, 12 did. |
| T254 | VERIFIED | useMfa.js, MfaStepUp.jsx (d1993b4); one admin.colAction. |
| T255 | VERIFIED | Seven fare tasks cadence manual; weekly_tasks.txt 4 steps; HARVESTED_FAMILY = set(). |
| T256 | SUPERSEDED by T273 | Accurate when written (09a6307); T273 removed all flight figures. |
| T257 | VERIFIED | --remote on all 3 object puts (e1f50e4). |
| T258 | MINOR | 194 commits merged, no p* branch unmerged; "Before: 0 ahead" wrong (75ade49c5 was 78 ahead). |
| T266 | VERIFIED | Eleven app commits; verify_flight_est_ui.mjs exists; verify_reach_filter.mjs deleted. |
| T268 | VERIFIED | 045 1,161 lines with self-check, DOWN block; exactly 14 rows closed. Title uses a middot. |
| T270 | MINOR | 5652ca8, a5be7f7 cover all files; 15 rows closed; T270-c was already fixed by T266. |
| T274 | VERIFIED | 046 is_friend_me + self-check (694cad044); KNOWN_UNCALLABLE = []. |
| T279 | VERIFIED | 45ccc1f rewrites verify_fare_provenance.mjs. |
| T084 | VERIFIED | validate.py + trip-validator.yml; 606 errors / 624 warnings recounted. |
| T085 | VERIFIED | build_wire --out, formatRange; tracked wire still has 209 comma ranges (T085-a). |
| T087 | VERIFIED | MonthStrip.jsx, parse_avoid_months; 123 trips with avoid text; no avoidMonths in wire yet (T087-a). |
| T088 | VERIFIED | FactMeter.jsx, gateway.js; 232 / 223 / 124 recounted. |
| T092 | MINOR | 2180c92 matches; rows committed after the fact (0458fcf77); rollback command would wipe later master work. |
| T096 | VERIFIED | Every figure matches (88.2%, 79.4-93.2%, 2,673 rows); hotels.csv header only. |

- Register: T270-c should be closed by T266 (d47337f); T266-d already fixed by T267 (78c9563); T253-a only partly closed (test_rls_policies.mjs still has dead {5,255} branch, lines 75, 478-479); T092-a duplicates T088-a.

### P7, P8, P10, P11, P15


| Report | Verdict | Findings |
|---|---|---|
| T107 | VERIFIED | title_ladder names.py:351; 4ee7659ef merged; 17,619 trips / 1,925 long names recounted; 43 tests pass. |
| T108 | VERIFIED | uphill, display_name, display_bugs, trailhead present; 40cb80360 + app bc46534 merged. |
| T111 | VERIFIED | coverage.py 7 REASON_CODES, --strict; outputs deliberately not committed; Files touched omits _OPEN.md. |
| T113 | VERIFIED | waymarked.py merged; famous_registry 17,289 rows / 2,367 waymarked recounted exactly. |
| T121 | MINOR | Citations at a3edb0885 hold; third open item (redundant clause in is_node_network) has no register row. |
| T126 | VERIFIED | IMAGE_BRIEF.md rules 7-8; vision_prompt.py MAX_DISTANCE_M 2000; 45f3adfa7. |
| T130 | MINOR | Decision true to spec 2.2; notes misquote cost ("EUR 5 to 15 per view" is ~EUR 10 one-off for the whole job, spec line 282); glosses presented as spec wording. |
| T132 | VERIFIED | No s2maps/EOX/World_Imagery in src or pipeline; "Commands run: None" followed by a list. |
| T157 | MINOR | banned-terms.mjs exists; scans 6 not 7 catalogues; fr.js apostrophe parser bug drops strings: 12 real hits not 10; breakdown ODbL 10 / GLO-30 5, not 6/4. |
| T176 | VERIFIED | App 5991a00; no paywall left in TrailPage.jsx; pass.subExport updated. |
| T177 | VERIFIED | 17,670 trail files, 253 journeys, 30 gpxReady, 75 route trips recounted. |
| T187 | SUPERSEDED in part | docs/FIRST_RUN_RESULT.md receipt still built on priced flight lines (receipt.flightOut, "Ryanair ~ EUR 58.98 est."); T272 banned flight pricing yet approved the doc "as written"; never revised. T099 would build banned flight estimates. |
| T192 | VERIFIED | Exactly 76 exhaustive-deps disables; 4 app commits merged. |
| T195 | VERIFIED | 47/47 tokens, 0 mismatches; 378 hex literals recounted. |
| T197 | VERIFIED | COMPONENT_ROLES.md; 13 aria-modal / 8 trapped recounted; badge now pass.recommended. |
| T277 | VERIFIED | 2d4463eea; PRODUCT.md and ESTIMATION.md updated. |
| T246 | SUPERSEDED by T272 | Economics recompute correctly; owner overruled stay-PWA (store apps, Android TWA first). |

- Register: T121 third item unregistered; NO ROW to strip flight lines from FIRST_RUN_RESULT.md before T099 (T187-c conflicts with T272); T157-a scope understated (12 strings, parser bug); T246-b framing stale after T272. Note: app public data moved to continent-app/dist-data in the live session's uncommitted work.

### P12


| Report | Verdict | Findings |
|---|---|---|
| T201 | VERIFIED | 3,868 destinations, 43 countries, layer sums match coverage.json; en.js line refs drifted ~12 lines. |
| T202 | VERIFIED | Repo quotes match; vendor prices external, dated 2026-10-02. |
| T203 | VERIFIED | Every recount matches (trails 17,619, beaches 2,746, cycling 506/16,460). |
| T204 | VERIFIED | Every figure traced to CARTA_UNIT_ECONOMICS.md (additional docs/Carta/Plan/Finance/); invented figures gone. |
| T205 | MINOR | Counts add up; "57,000 pages" loose (components sum 59,166); Cloudflare 100k/day and Search Console 2,000/day uncited. |
| T206 | DISCREPANCY | "17 EuroVelo families, 16,973 sections on the wire" false: family files hold 665 sections (279 published); 16,973 is all cycling route files. Rest checks out. |
| T207 | VERIFIED | 43 attribution entries, 150 registry rows, sitemap 1 URL. "43 sources" generous (duplicates). |
| T208 | VERIFIED | 3,868, 17,619, 22,289, 43 credits check out; external figures cited. |
| T214 | VERIFIED | Six Google font families, four self-hosted files; Travelpayouts gone. |
| T215 | MINOR | RPCs exist; doc still says "Gap: no visitor source" though T275 closed T215-a. |
| T216 | VERIFIED | CONTACT constants, Terms wording, 024 match; SUPPORT.md line "until T272-a removes" stale. |
| T217 | VERIFIED | SQL columns exist; cascade and webhook-ignores-other-events confirmed. |
| T218 | VERIFIED | CARTA_HEARTBEAT_URL, exit 3 path, strings exist. |
| T219 | VERIFIED | 017 kind check, 018 layer check, openFromReview, 7 reason codes. |
| T220 | VERIFIED | 17 rows; break-even 9 Trip / 5 Year; no invented date. |
| T226 | MINOR | Says FAQ has 14 questions; 13 since T272. |
| T272 | DISCREPANCY | Decides "Carta does not price flights" and approves FIRST_RUN_RESULT.md "as written", which is a receipt built on Carta's flight estimates; no row flags the conflict; T187-b/c and T220 D-26 build to it. Config section missing. |
| T275 | MINOR | Register and _OPEN-MASTER match; PARALLEL-WAVES-PLAN Part D not updated (D6b asks already-decided questions; D2.3 lists closed T083-a; owner table still lists GPX/T176); no wave-log line; PARALLEL-WAVES-PLAN.md untracked. |

- Register: T215-a closed by T275 but the Overview/LAUNCH-METRICS action not done, no follow-up row. T272/FIRST_RUN_RESULT conflict has no row. T187-d overlaps T226-d. T201-b partly stale (PRODUCT.md fixed, 1.CARTA.md lines 3, 49 and README 5, 28 still 1,570).
- Side note: continent-app/public data moved to continent-app/dist-data by the live session.

