> 2026-10-02 (T300): waves 6 onward, with every prompt, now live in `Execution/_WAVES.md`, and
> Part D (your to-do list) is folded into Part E of `Execution/_OPEN-MASTER.md`. Part A below
> stays the detailed orchestration reference; the wave 1 to 5 log stays here.

# Parallel waves beside _OPEN-MASTER

To use: open Claude Code (Fable) in this folder and say **"do wave 1 from
PARALLEL-WAVES-PLAN.md"** (then wave 2, wave 3, ...). Claude reads Part A and
runs it end to end. It stops in two places: at preflight if something is
unsafe, and at the end before any push.

The full prompt for every session is in Part C, ready to use. You can also
paste a single Part C prompt into its own Fable session by hand; every prompt
creates its own worktrees if they don't exist yet.

Written 2026-10-01. Basis: `_OPEN-MASTER.md` stages 0, 1 and 4 done and merged
(root `main` at `fee4e76c6`, continent-app `master` at `35179e5`); every task
T078-T251 checked against its mind-map note and the repo; the 106 `next task`
rows in `Execution/_OPEN.md`.

Tooling (in `Execution/_queue/`):
- `wave_worktree.ps1`: creates or removes one session's worktree pair. Tested 2026-10-01.
- `xmind_prompt.py`: prints a task's mind-map prompt under its `_ORDER.md` number.
- `task_model.py`: the model per task, from the mind map's MODEL line via xmindparser (`pip install xmindparser`).
- `wave_prompts.py`: regenerates Part C from the Part B tables. Run it after editing a table or adding wave 4+.

---

# Part A. How Claude runs a wave ("do wave N")

You are the orchestrator. You do no task work yourself. One subagent per row of
the wave's table does it, each in its own worktree. Read CLAUDE.md first.

## A1. Preflight. Stop and tell the user if any check fails

1. `git status --porcelain` in the root and `git -C continent-app status --porcelain`
   show no modified tracked files. Untracked files are fine.
2. No pipeline is running: `Get-Process python` shows no `run_pipeline.py`, and
   `run_queue.ps1` is not running.
3. The previous wave says "merged" in the Wave log at the end of this file.
   Wave 1 has no predecessor.
4. Part C has prompts for this wave. If it doesn't, run
   `python Execution/_queue/wave_prompts.py` and stop if it reports an error.
5. Record the bases: `git rev-parse main` (root) and
   `git -C continent-app rev-parse master` (app). The app's branch is
   **master**; the root's is **main**.

## A2. Create the worktrees, one after another (never in parallel)

For each row k of the wave, from the repo root:

```
powershell -File Execution/_queue/wave_worktree.ps1 -Task <TASK> -Branch <first branch> [-App]
```

Pass `-App` when the row's app column says yes. Worktrees land in
`C:\Users\Gebruiker\Documents\Portfolio\wt\<TASK>` (root, sparse) and
`...\wt\<TASK>-app` (continent-app, with `node_modules` and the generated
`public/` data joined from the main checkout). Run the commands one after
another, because git locks the repository during `worktree add`.

## A3. Run the sessions

Launch every session of the wave **in one message** as background subagents
(subagent_type general-purpose). Give each one its Part C prompt, copied
verbatim, and **the model named in its Part C heading** (haiku, sonnet, opus or
fable). Each model comes from the task's MODEL line in the mind map, read with
xmindparser by `python Execution/_queue/task_model.py <TASK>`. The D-sessions
use the fixed choices in that script. Not every task needs the heaviest
model.

If a heading says the models differ, run that row as two sessions, one after
the other: the first task alone, then the second task on its own model, in the
same worktrees.

If a model hits its usage limit, leave that session's worktree as it is and
relaunch it after the reset. Tell the relaunched session to review the
uncommitted work it finds before continuing; don't let it start from
scratch. Wait until every session has finished.

## A4. Check, merge, verify

1. For each session, in both repos: `git log --stat <base>..<branch>`. Every
   changed path must fit the row's scope and avoid the never-touch list (rule 4
   of the prompts), and a report must exist under `Execution/P{n}/<TASK>-*.md`.
   If either check fails, hold the branch: don't merge it, and write the reason
   in the Wave log.
2. Merge in table order, in the main checkout, with
   `bash Execution/_queue/merge_branch.sh <repo dir> <branch> "<message>"`
   for the root (`.`, into `main`) and then the app (`continent-app`, into
   `master`).
   - The script union-merges `Execution/_OPEN.md` and aborts on any other
     conflict.
   - For rows with two tasks, merge the second branch after the first.
   - Lessons from waves 1 to 3:
     - **Mirrored app files block the app merge.** A root merge that carries
       mirrored app files (as T083 did) writes them into the app tree. Check
       they are identical to the app branch, clear them, then merge the app.
     - **Real conflicts:** resolve them in a merge worktree on a branch from
       master, run the affected tests there, then fast-forward master.
     - **Register duplicates:** after the merges, run
       `python Execution/_queue/dedupe_open.py`. Union merges duplicate a row
       when a branch predates another branch's closure of it; the script keeps
       the "closed by" line.
     - **Root mirror commit:** after the app merges, make it. The root tracks
       copies of continent-app files. Run `git add -u continent-app` (use `-A`
       on `continent-app/src` and `continent-app/scripts` when files were
       added or moved), and check every mirrored path exists in app `master`.
3. In continent-app, `npm run build` and `npm run lint` must pass. Delete
   `dist/` right after the build: ten sessions filled C: to 0 bytes once.
4. Safety check. Both commands must print nothing:
   ```
   git diff --stat <root base>..main -- run_pipeline.py infra pipeline/archive .gitignore "supabase/migrations/00*" "supabase/migrations/01*" "supabase/migrations/02*" "supabase/migrations/03*" "supabase/migrations/040*" "supabase/migrations/041*" "supabase/migrations/042*" "supabase/migrations/043*" "supabase/migrations/044*" "supabase/migrations/045*" "supabase/migrations/046*"
   git -C continent-app diff --stat <app base>..master -- vercel.json public/_headers scripts/r2
   ```
   The migrations live in the ROOT repo (`supabase/migrations/`), not in
   continent-app. If either command prints anything, reset both repos to the
   bases and report.
   Also check that any figures in docs written by a haiku session appear in
   the source they cite. T204 invented figures.
5. Remove the worktrees: `wave_worktree.ps1 -Task <TASK> -Remove [-App]` per
   session. The branches stay.
6. Fill in the wave's line in the Wave log.
7. Report to the user:
   - one line per session: merged or held, and the report path
   - any new migrations, and where they go in the paste order
   - decisions the user is now asked for
   - then ask whether to push. **Never push without a yes.** Pushing `main`
     deploys to production on Vercel.

---

# Part B. The waves

Column "app" says whether the session needs a continent-app worktree.

## Wave 1

| k | Task | Branch | app | Report folder | Notes for this session |
|---|---|---|---|---|---|
| 1 | T265 D1: payments and quota, SQL and functions | p2-d1-payments-quota | yes | P2 | Migration **044**. Rows: T031-b, T031-c, T030-d, T037-c, T043-e, T030-c, T034-b, T034-c, T037-a, T037-d, T035-c, T043-d, T033-f. Not T032-d or T033-e (admin tiles, wave 3). Test on throwaway Postgres; 044 belongs after 043 and before the stage 10 Stripe pastes; say so in the report. |
| 2 | T266 D3: harness repairs | p4-d3-harness-repairs | yes | P4 | Rows: T052-g, T054-i (harness part only), T062-g, T067-f, T068-f, T069-f, T070-f, T076-a, T052-e, T253-a, T256-a, T256-b, T042-d; the verify_account_panel 380px item from T020; the dead verify_reach_filter.mjs from T027. Harnesses take their port from an env var, not a fixed 4173. |
| 3 | T078 Registry and licence unification | p4-registry-licence | no | P4 | Generate `docs/tos/data_licenses.md` from the registry; it also has to cover the `pipeline/harvest_*.py` sources that are not collectors. New workflow file only; no edits to existing workflows. |
| 4 | T083 RLS policy tests and ErrorBoundary telemetry | p4-rls-errorboundary | yes | P4 | T071 chose Supabase `edge_errors`, not Sentry: wire ErrorBoundary to `reportEdgeFailure` in `src/planner/edgeFailure.js`. No new migration. New workflow modelled on `admin-rpc-security.yml`. |
| 5 | T084 Trip validator in CI | p5-trip-validator | no | P5 | Extend `Trips/carta-unified/carta-unified/pipeline/validate.py` (last run: 0 errors, 482 warnings). The trips are the 253 journeys. New workflow file. |
| 6 | T096 Ground-cost benchmark | p5-ground-cost-benchmark | no | P5 | New `tools/benchmark/`. Read the master and `continent-app/src/lib/costIndex.js` read-only from the main checkout's paths; write nothing outside the worktree. Check every new source's licence before using it. |
| 7 | T107 then T108: title ladder, then trail bugs | p7-title-ladder, then p7-trail-data-bugs | yes | P7 | Two tasks in sequence, two reports. `pipeline/trails/names.py`, `attributes.py`, `regionize.py`, `regression.py`, `src/lib/trailStory.js`. Code and tests only; **no rebuild**, no trailslab. |
| 8 | T111 Country floors and reason codes | p7-coverage-reason-codes | no | P7 | Floors and `na` status exist in `pipeline/regions/coverage.py`; the per-miss reason codes do not. Do not commit `continent-app/public/coverage.json`. |
| 9 | T192 Hook dependencies | p10-hook-deps | yes | P10 | Start at `src/planner/TripPlannerTab.jsx:307`. Check the planner screens in the browser. Do not touch styles.css or i18n. |
| 10 | T195 PRODUCT.md and DESIGN.md | p11-product-design-docs | no | P11 | Read tokens from the shipped `:root` in `continent-app/src/styles.css` (read-only). The carta-design SKILL.md banner of 2026-07-28 (Fraunces, Plus Jakarta, JetBrains Mono, alabaster, terracotta) is the decided state; record it as such and note that the skill's older body contradicts it. |

## Wave 2

| k | Task | Branch | app | Report folder | Notes for this session |
|---|---|---|---|---|---|
| 1 | T268 D2a: admin follow-ups, database side | p4-d2a-admin-db | yes | P4 | Migration **045**. Rows: T063-d, T064-c, T065-c, T066-b (RPC only), T067-a, T067-b, T071-d (redefine export_user_data in 045, never edit 024), T074-d, T074-e, T076-b (country code on the override row), T077-c, T069-g, T077-a, T065-e. The paste goes after 043 in stage 2. Mind the re-paste table in _OPEN-MASTER 2.5. Migration 044 (T265, wave 1) is pasted LATER, in stage 10 after 031: 045 must not depend on anything 044 creates (ai_usage_days, pass_can_buy, the pass_grants reason/fee columns, oss_alerts) and must not redefine any function 044 replaces (grant_pass, ai_refund, admin_margin, the funnel and OSS functions), or the stage 10 paste of 044 would undo 045. The test harnesses apply migrations in filename order, so also run your 045 tests with 044 present. |
| 2 | T085 A1 ranges (journey lane) | p5-a1-ranges | yes | P5 | `JourneyPage.jsx`, `pipeline/journeys/build_wire.py`, `lib/format.js`, trip JSON prose (209/253 files still hold "€x, €y"). **No en dash**: write "€x to €y"; stripDashes wins over the note. |
| 3 | T267 D6: frozen fares and housekeeping | p3-d6-fares-housekeeping | yes | P3 | Rows: T058-a, T058-c, T058-d, T056-c, T255-c, T062-b, LIVE-b; the T029 items (SCHEMA.md says v15, it is v17; contract gate on split wires; smoke-test waits); T027 stale comments and unused CSS; the `practical_layer.py` decision; retired carrier harvesters to the archive tier. NOT T072-c/d or T255-b (they wait for stage 7). NOT T062-e. |
| 4 | T269 D5a: photo pipeline before stage 8 | p3-d5a-photo-pipeline | no | P3 | Rows: T052-c, T051-c, T049-f, T049-i, T049-j, T050-c, T049-k, T051-d, T047-g (as a written check procedure), and the T007/T008 items (3,983 wire images without a cache, non-image files kept out, 404 probe). `pipeline/photos/`. No CSP and no app work. Must merge before the user starts _OPEN-MASTER 8.4. |
| 5 | T113 Famous-trail registry top-up | p7-famous-registry-topup | no | P7 | The registry is done in substance. Only the Waymarked diff and the per-GMBA coverage gap are left. Network reads are fine; no trailslab. |
| 6 | T157 Banned-surface-terms lint | p10-banned-terms-lint | yes | P10 | New `scripts/ci/banned-terms.mjs`, report-only; it scans i18n read-only. Do not wire it into `npm run ci`. |
| 7 | T201 Positioning | p12-positioning | no | P12 | Doc. T202 and T205-T208 build on it. |
| 8 | T126 Image brief and vision-scoring prompt | p8-image-brief | no | P8 | Brief doc. Put the prompt change to `pipeline/photos/relevance.py` behind a new prompt file so it does not collide with session 4; if it can't be separated, doc only and note it. |
| 9 | T177 DECIDE komoot embed or own GPX | p10-routing-decision | no | P10 | Decision doc with a recommendation. The app uses MapLibre and Carto, not Mapbox. The owner confirms. |
| 10 | T187 First-run trip result design | p10-first-run-design | no | P10 | Design doc only, under carta-design. The owner approves before any code. |

## Wave 3

| k | Task | Branch | app | Report folder | Notes for this session |
|---|---|---|---|---|---|
| 1 | T270 D2b: admin UI follow-ups | p4-d2b-admin-ui | yes | P4 | Rows: T064-b, T065-d, T066-c, T067-e, T070-h, T068-b, T068-h, T073-c, T074-b, T075-a, T075-b, T075-c, T076-c, T062-e, T032-d, T033-e, T071-b, plus the Gemini sentence from T018 in PrivacyPolicy (6 locales). Uses the 045 RPCs from wave 2. |
| 2 | T087 A2 month strip (journey lane) | p5-a2-month-strip | yes | P5 | Avoid-months are free text in `bestPeriod.avoid`; parse them in build_wire.py. |
| 3 | T202 Competitive positioning | p12-competitive | no | P12 | Reads T201. |
| 4 | T204 The acquisition constraint | p12-acquisition-constraint | no | P12 | €0.17 per visitor, from the mind map's Economics sheet. |
| 5 | T205 Programmatic SEO plan | p12-seo-plan | no | P12 | Plan doc only; the code waits for stage 6. |
| 6 | T130 then T132: Street View exclusion, then the s2maps check | p8-exclude-streetview, then p8-sentinel-licence | no | P8 | Two tiny decision docs, two reports. |
| 7 | T121 Node networks are not routes | p7-node-networks-decision | no | P7 | Already in code (`pipeline/trails/node_networks.py`). Decision record only; the loop product is the owner's call. |
| 8 | T197 Curate components by role | p11-component-curation | no | P11 | Doc. React 18, no Tailwind. |
| 9 | T217 then T218: refund SOP, then incident runbook | p12-refund-sop, then p12-incident-runbook | no | P12 | Docs. The status surface is code and waits for stages 6/7. |
| 10 | T246 DECIDE mobile strategy | p15-mobile-decision | no | P15 | Recommendation; the owner decides. |

## Wave 4

Planned 2026-10-02 after the owner decisions (T272). Three guards keep it clear of `_OPEN-MASTER`:

- **Fares data stays byte-identical.** Stage 5 pushes `fares/` and stage 7.8 compares it exactly, so T273 changes screens only.
- **Migration 046 stays off the stage 2 and stage 10 paste lists.** It goes right after 020, whenever 019 and 020 are pasted.
- **Docs only.** Nothing touches the box or the R2 scripts.

| k | Task | Branch | app | Report folder | Notes for this session |
|---|---|---|---|---|---|
| 1 | T273 (row T272-a): remove the frozen flight estimates from every screen | p3-no-flight-estimates | yes | P3 | Owner decision 2026-10-02: Carta does not price flights. A flight is in a total only when the traveller typed in their own fare; keep that path working. Display and cost engine only: `runtime_pricing.js`, `trip_planner_pricing.js`, `tripCostOptimizer.js`, `useTripPlanner.js`, `TripPlannerTab.jsx`, `TripItinerary.jsx`, the city-day card in `DestinationsTab.jsx`, `FareProvenance.jsx`, the receipt, i18n (six locales). GUARD: do not touch the pipeline, the `fares/` wire files, `dataHost.js` or `appData.js` loading, or `scripts/r2/` (stage 5 pushes `fares/`, stage 7.8 compares them exactly); stop reading or showing them, do not delete them. Update the flight-cost section of `docs/SCHEMA.md` (T058-c) and PRODUCT.md is already updated. Rewrite `verify_flight_est_ui.mjs` (T266) to assert no estimated flight is shown and a typed fare still counts. carta-design wins; check Explore, the planner and the city-day card at 380px and desktop. |
| 2 | T274 (row T083-a): migration 046 fixes the co-planner invite in 020 | p4-coplanner-invite-fix | yes | P4 | Migrations live in the ROOT repo: `supabase/migrations/046_*.sql`, with a self-check raise notice. Migration 020's invite rule calls `are_friends`, which 011 revoked from signed-in users, so every invite is refused once 020 is live; fix it with a security definer wrapper or a guarded grant, the least privilege that works. GUARD: 046 must not redefine anything 044 or 045 replaces, and its header must say "paste right after 020" (019 and 020 are not on any `_OPEN-MASTER` paste list yet; raise an owner row to add 019, 020 and 046 there). Update `continent-app/scripts/admin/test_rls_policies.mjs` so its known T083-a failure becomes a pass, and run it and `test_admin_rpc_security.mjs` on a throwaway PostgreSQL 18 with every migration applied. |
| 3 | T088 A3: difficulty as a five-segment meter, the note behind the dot | p5-a3-difficulty-meter | yes | P5 | Journey lane. `src/browse/JourneyPage.jsx` (it has no flight code, so no overlap with session 1) and its CSS and i18n; follow the `MonthStrip.jsx` pattern from T087 and DESIGN.md tokens; if carta-design has no rule for a meter, say so in the report. Any wire build goes to a scratch folder with `build_wire.py --out`; never write `continent-app/public/journeys`. |
| 4 | T203: decide the audience order | p12-audience-order | no | P12 | Decision doc with a recommendation pending the owner (owner register row). Read `Execution/P12/T201-positioning.md`, `T202-competitive-positioning.md` and PRODUCT.md first. |
| 5 | T206: community credibility, the outdoor route | p12-community-credibility | no | P12 | Doc. Read T201, T202 and `Execution/P12/T205-programmatic-seo.md`. No invented figures. |
| 6 | T207: launch channels and the launch day plan | p12-launch-channels | no | P12 | Doc. Test every channel against the €0.17 per visitor constraint in `docs/GTM-ACQUISITION-CONSTRAINT.md` (row T204-b); cite every figure. |
| 7 | T208: press, partnerships and the open-data angle | p12-press-partnerships | no | P12 | Doc. Every number must be cited to a named file next to it; do not invent figures (a haiku doc task did in wave 3 and had to be redone). Partnerships in the mind map's L1 to L6 long-lead tracks are the starting list. |
| 8 | T214: decide the analytics stack | p12-analytics-decision | no | P12 | Decision doc, recommendation pending the owner (owner register row). Today: no cookie banner, RPC-based telemetry (T071 to T073), paywall funnel events (T034, T265). Weigh what each option costs legally under GDPR and ePrivacy. |
| 9 | T215: define the launch metrics and where each is read | p12-launch-metrics | no | P12 | Doc. Map every metric to an existing admin card or RPC (T042 AI usage, T043 margin, T072 pipeline health, T270 cards) or name the gap as a register row. |
| 10 | T216: a support inbox and a response commitment | p12-support-inbox | no | P12 | Doc. Setting up the mailbox itself is an owner register row. Read `docs/REFUND_SOP.md` and `docs/INCIDENT_RUNBOOK.md` (T217, T218). |

## Wave 5

Planned 2026-10-02 after the second round of owner decisions (T275). Nothing in it pastes, deploys, pushes or runs data.

Exception: T276 removes Travelpayouts from `vercel.json` and `public/_headers`, two files the rollout also edits (stage 5.3 adds the data host to connect-src; stage 6 serves `_headers` on Pages). It only deletes the Travelpayouts lines, and it is the only session in this wave that may touch those two files.

T177-b is not here. It routes through the local Valhalla and BRouter servers, so it belongs to the data lane.

| k | Task | Branch | app | Report folder | Notes for this session |
|---|---|---|---|---|---|
| 1 | T276 (row T214-b): remove the Travelpayouts Drive script and its CSP hosts | p1-remove-travelpayouts | yes | P1 | Owner decision 2026-10-02 (T275); T214-b and T056-a are already closed as decisions, so record the execution in your report. Files: `continent-app/index.html` (the emrldtp.com snippet), `continent-app/vercel.json` and `continent-app/public/_headers` (only the CSP hosts and any script hash that exist for Travelpayouts/emrldtp/sentry.avs.io). EXCEPTION to rule 4: you may edit exactly those two rollout files, and only to delete Travelpayouts entries; change nothing else in them, keep every other host, and do not add the data host (that is the owner's stage 5.3 step). Check with grep that no emrldtp, travelpayouts or avs.io reference is left anywhere in src, index.html or the two config files, run `npm run build` (its CSP check must pass), delete dist/ after, and load the app at 380px and desktop with no console CSP error. |
| 2 | T176: free GPX on every route, never paywalled | p10-free-trail-gpx | yes | P10 | Owner decision 2026-10-02 (T275): remove the pass gate on the trail GPX and KML (`TrailPage.jsx` calls `paywall.require('export')`); the cycling GPX is already free; the PDF export keeps its gate. Update the pass copy that promises "map files come with a pass" (PassModal or i18n, six locales). Same page, so also fold in T108-a (TrailPage subtitle through `trailPlace`) and T108-b (pass the trip record to `trailReasons`). Closes T203-b, T108-a, T108-b. Journeys GPX waits for the T177-b track wire (data lane). Parse all six i18n files after editing. |
| 3 | T092 J3: give the week-at-a-glance table a fixed row set | p5-j3-glance-table | yes | P5 | Journey lane. `src/browse/JourneyPage.jsx` glance list only (T088 just added the gateway rows and FactMeter there; read `Execution/P5/T088-a3-difficulty-meter.md` first and keep its work). Any wire build goes to a scratch folder with `build_wire.py --out`. Parse all six i18n files after editing. |
| 4 | T277 (row T273-a): PRODUCT.md and ESTIMATION.md catch up with the owner decisions | p11-product-md-decisions | no | P11 | Docs only. PRODUCT.md: drop "are being removed" (T273 removed them), add the audience order (T203-c: hikers lead) and lift the positioning sentence from `Execution/P12/T201-positioning.md` (T201-d). `docs/ESTIMATION.md` near line 188: point at the rewritten flight-cost section of `docs/SCHEMA.md`. Closes T273-a, T203-c, T201-d. |
| 5 | T278 (row T273-d): typed fares price the airport transfer; drop the frozen carrier text | p3-typed-fare-transfers | yes | P3 | Two rows, one area: T273-d (a typed fare prices no airport transfer because `anchorLegs`/`flightTransfer` only run for a routed flight; and "Add your fare" has no way back) and T273-c (the planner flight lines, the ICS export and the share text still give carrier and times from the frozen snapshots, one names "Aviasales"). Files: `trip_planner_pricing.js`, `useTripPlanner.js`, `TripItinerary.jsx`, `tripExport.js`, the planner flight rows. GUARD: no change to `fares/`, `dataHost.js`, `appData.js`, the pipeline or `scripts/r2`. Read `Execution/P3/T273-no-flight-estimates.md` first. Parse all six i18n files after editing. |
| 6 | T279 (row T266-b): rewrite verify_fare_provenance for no flight prices | p4-fare-provenance-harness | yes | P4 | Scripts only: `continent-app/scripts/verify_fare_provenance.mjs` predates T256 and T273; rewrite it to assert that no Carta flight price, tilde or est. tag appears and a typed fare shows as the traveller's own. Closes T266-b and T267-c. Do not touch src/. |
| 7 | T280 (row T269-f): the trails export applies the credit gate | p3-trails-credit-gate | no | P3 | Code only, no export run: the trails wire publishes photos that owe a credit and have no author because the trails export skips the credit gate that beaches, lakes and mountains apply (`pipeline/photos/credit.py`, `owes_credit`). Wire it into the trails export in `pipeline/trails/`, with a test, and count the effect read-only against the published trails wire in the main checkout. Do not run the export or write data/ or continent-app/public. |
| 8 | T219: decide the feedback loop from users into the backlog | p12-feedback-loop | no | P12 | Decision doc, recommendation pending the owner (owner register row). Read `docs/SUPPORT.md` (T216) and the existing feedback inbox in the admin page (T270 report). |
| 9 | T220: write the launch runway calendar | p12-launch-runway | no | P12 | Doc. Build on `Execution/P12/T207-launch-channels.md` (its day offsets), T208 and T216. The launch date is not set (T207-a), so write it as offsets from D. Cite every figure. |
| 10 | T226: decide content type and platforms | p12-content-platforms | no | P12 | Decision doc, pending the owner. Read T201, T203 (hikers lead), T205 and T206. No invented figures. |

## Wave 6

Planned 2026-10-02 after wave 5 merged (root `57874b72e`, app `3c1b00d`). Task numbers T281 to T287 and migration **047** are reserved for it; the next free task number after the wave is T288 and the next migration 048. Nothing in it pastes, deploys, pushes or runs data.

Three guards:

- **Lint goes strict in the same wave as the disable audit.** Session 3 promotes `react-hooks/exhaustive-deps` to error and session 4 removes disable comments, so session 4 must leave zero exhaustive-deps warnings in the files it touches, or the merged tree fails lint.
- **File ownership, so no two sessions edit one file:** session 3 owns `PassModal.jsx`, `planner/AiDayPlanModal.jsx`, `i18n/index.jsx`, `CategoryRail.jsx`, `admin/ContentSection.jsx`, `lib/urlState.js`, `BagCheck.jsx`, and `eslint.config.js`; session 4 owns the rest of `src/planner/` and `useTripPlanner`; session 7 owns `DestinationsTab.jsx`, `AroundHere.jsx`, `destinationPdf.js`, `trailStory.js` and the KML writer; session 8 owns the beach, lake and mountain pages; session 1 owns `JourneyPage.jsx`.
- **Four sessions edit i18n** (1, 3, 7, 8). Each parses all six files before committing, and the merge session parses them again after every app merge.

| k | Task | Branch | app | Report folder | Notes for this session |
|---|---|---|---|---|---|
| 1 | T086 then T094: empty sections verified, then bold, coverage honesty and the age of the numbers | p5-a4-empty-sections, then p5-j6-j8-presentation-honesty | yes | P5 | Journey lane. T086 is already guarded in code (`JourneyPage.jsx` renders the pack and what-could-go-wrong blocks only when the array has items): verify across all 253 trips that no section heading renders empty, by a read-only count over the journeys wire in the main checkout, change code only if you find one, and close it with the count. Work only in your worktrees; never write into the main checkout (a haiku session wrote register rows there in wave 5). T094 after it: J6 emphasis normalised in the trip source prose (the files T085 edited), J7 one honest coverage line on the journeys index, J8 a "last checked" month from dataVintage on every trip. Read the T085, T087, T088 and T092 reports first and keep their work. Any wire build goes to a scratch folder with `build_wire.py --out`; never write `continent-app/public/journeys`. carta-design wins; check 380px and desktop. Parse all six i18n files after editing. |
| 2 | T281 (rows W5-a, T276-a, T265-d, T279-a, T266-c, T270-c, T268-g, T267-d, T176-c): harness repairs, round two | p4-harness-repairs-2 | yes | P4 | Scripts only: `continent-app/scripts/**`. Start with W5-a: find why `verify_trail_page.mjs` fails "trips still show the sort chips" and "city day cards render [0 cards]" on the merged tree (T273 reworked the city-day cards and `verify_places_tab.mjs` passes); if the cause is in src, do not fix it, write a register row with the evidence. T276-a: replace the three stale CSP copies in `verify_csp.mjs` by reading the real header from `vercel.json` (read-only) and drop emrldtp from the noise regexes. T265-d: `verify_paywall.mjs` honours `CARTA_REPO_ROOT`. T266-c: two clean back-to-back `verify_admin_panel.mjs` runs compared, with the result in the report. T267-d: `npm run ci:smoke` after one build; delete `dist/` right after. T176-c: the signed-out GPX and KML check in the browser, no code. Do not touch src/. |
| 3 | T282 (rows T192-a, T192-b, T192-c, T197-b, T266-d, T268-e, T278-a): app hygiene | p10-app-hygiene | yes | P10 | Files: `src/i18n/index.jsx` (the disable comment with its reason), `eslint.config.js` (exhaustive-deps to error, after T192-a), `browse/CategoryRail.jsx`, `components/PassModal.jsx` and `planner/AiDayPlanModal.jsx` (useFocusTrap plus an Escape handler on the shared escape stack, which listens in the capture phase), the comment in `lib/urlState.js`, `components/admin/ContentSection.jsx` (trails index names the field country, the grid filters on cc), and T278-a: delete `components/BagCheck.jsx` (nothing imports it any more) and the itin.bag* keys in six locales once grep shows nothing else reads them (Carta names no carrier now; git keeps it if the owner wants it back keyed on a typed airline; say so in the report). `npm run lint` must end with 0 errors. Parse all six i18n files after editing. Check the pass modal and the AI day-plan modal by keyboard at 380px and desktop. |
| 4 | T283 (row T192-d): audit the exhaustive-deps disable comments in the planner | p10-hook-disable-audit | yes | P10 | Scope: `src/planner/**` except `AiDayPlanModal.jsx` (session 3 owns it), plus `useTripPlanner`. GuidedTripWizard (10 disables) and DayPlannerTab (10) first, then TripPlannerTab, ReadyTripsStep, DayIdeasStep, ExpenseLedger, AiPlanRoute; include useTripPlanner's per-bump suggestNextStops and cheapestStartDate calls. Each disable either goes, with a correct dependency list, or stays with a one-line reason. Session 3 makes exhaustive-deps an error in the same wave, so leave zero exhaustive-deps warnings in the files you touch. App.jsx, map/, browse/ and the rest are not in scope: leave one register row with the remaining count per file. Count disables before and after. Check the planner screens in the browser (wizard, trip planner, day planner) at 380px and desktop. |
| 5 | T284 (rows T083-b, T219-c, T217-c): migration 047, the three small schema fixes | p4-migration-047 | yes | P4 | Migration **047** in the ROOT repo `supabase/migrations/047_*.sql`, with a self-check raise notice and a down block. T083-b: widen the fn and code checks on edge_errors and the two lists in log_edge_error so the ErrorBoundary's ('app', 'client_crash', 'client') call stores a row; decide and record whether client errors share the AI failures card. T219-c: 'data' in the feedback kind check, 'cycle' in the content_overrides layer check. T217-c: an audited `admin_adjust_expiry` RPC that moves entitlements.expires_at without resetting period_start, admin-only, written to the audit log; update the step in `docs/REFUND_SOP.md` that uses the SQL editor. GUARD: 047 must not depend on anything 044 creates and must not redefine any function 044 replaces (044 pastes later, in stage 10); find which migration each table and function you touch comes from and state the paste position (after 045, and after the migrations defining feedback, content_overrides and edge_errors) in the report and in an owner register row for `_OPEN-MASTER`. Extend `continent-app/scripts/admin/test_admin_rpc_security.mjs` and `test_rls_policies.mjs` for the new RPC and run both on a throwaway PostgreSQL 18 with every migration applied in filename order. |
| 6 | T285 (rows T201-b, T277-a, T111-d, T084-d, T207-g, T078-a): the docs catch up | p11-docs-catchup | no | P11 | Docs only, root repo. T201-b: replace the literal 1,570 destinations in `docs/1.CARTA.md`, `README.md` and PRODUCT.md "Brand voice" with a pointer to app_data meta (read `app_data` meta.n_destinations in the main checkout; do not type a new literal that will rot). T277-a: reword PRODUCT.md "The one rule the numbers follow" for ground costs. T111-d: `docs/REGIONS.md` gets the per-region code field and the contract block of coverage.json. T084-d: `Trips/carta-unified/carta-unified/README.md` carries the T084 validator figures. T207-g: only the doc-claim half (credited sources 24 versus 43 measured); the sitemap half waits for T221/T222, leave it open. T078-a: replace the hand-typed roster in `src/ingestion/README.md` with a pointer to the generated ledger. Every figure you write cites the file it came from; grep it there before committing. |
| 7 | T286 (rows T108-d, T108-e, T108-f): one climb and one difficulty, from source to screen | p7-trail-climb-consistency | yes | P7 | Read the T107 and T108 reports first. App: the card in `DestinationsTab.jsx`, the KML fact line, `AroundHere.jsx` and `destinationPdf.js` use `trailStory.trailClimb().up` (or both numbers) instead of the single stored ascent (+7 m on Korab 9). Pipeline code: `rate.py` picks bigClimb and dayOut from the uphill climb and applies the comfort gate at the source; `export_wire.py` stops shipping validate.py's difficulty beside f.g, or sets it to the grade where a grade exists. The app must read both the current wire and the new one, because the rebuild is a data-lane run the owner starts. Code and tests only; no rebuild, no export run, no trailslab. Count the rows affected read-only against the published trails wire in the main checkout. Parse all six i18n files if you edit one. |
| 8 | T287 (row T087-b): the shared MonthStrip on the beach, lake and mountain pages | p7-layer-month-strip | yes | P7 | Read `Execution/P5/T087-a2-month-strip.md` and `src/components/MonthStrip.jsx`. Adopt the component on the beach, lake and mountain pages where each layer's wire already carries month data (climate, bathing season, snow); if a layer has none, say so and leave that page as it is with a register row. No pipeline or wire change. carta-design wins; check each page at 380px and desktop. Parse all six i18n files after editing. |
| 9 | T196 Generic-pattern detector in CI | p11-design-lint | yes | P11 | New `continent-app/scripts/ci/design-lint.mjs` beside T157's `banned-terms.mjs`, checking the carta-design never-do list and the DESIGN.md token rules. styles.css has 378 hex literals outside :root today (row T195-b), so the detector needs a committed baseline and fails only on new violations. Prove the done condition with a seeded violation in a fixture, not in src. Wire it as a NEW workflow file in the root `.github/workflows/` modelled on `trip-validator.yml`; no edits to existing workflows and not into `npm run ci` (rule 4). Closes nothing in the register; T197-a waits for the first component lift after this. |
| 10 | T211 First-run onboarding and the empty states | p12-onboarding-empty-states | no | P12 | Design doc only, under carta-design; the owner approves before any code. Override of the map text: Carta prices no flights (T272), so the departure airport is no longer the hinge; design the first ninety seconds around what the app prices today (ground costs, the traveller's own typed fare) and the audience order (hikers lead, T203). Read PRODUCT.md, `docs/FIRST_RUN_RESULT.md` (T187, which T099 builds), the reason codes in `continent-app/public/coverage.json` (T111, read-only) and destinations spec 1.6 and 0.4. Inventory every empty state in src today (the before count) and write each one's copy in English. Write `docs/ONBOARDING_AND_EMPTY_STATES.md` and an owner register row for the approval. |

## Wave 7 and on, not yet tabled

Before running these, add a table like the ones above.

- **Journey lane, one per wave, in this order:** T089 (owner: surface or strip)
  → T093 (owner OKs the confidence model) → T143 → T090 (61 geolocations; needs
  `cache/journey_images.json`, so before stage 7.11 or after pulling it from R2)
  → T091. Then T146, T150 and T151 in parallel. If T089 and T093 are still
  waiting on the owner, T143 can go first.
- **Docs:** T213 (doc), T198 (typography: records the decided state from the
  carta-design banner and DESIGN.md).
- **Register groups ready for a session:** registry follow-ups (T078-b, T078-c,
  T078-d, T113-c); pipeline code fixes without runs (T096-c, T121-b, T113-g,
  T108-c); the rest of the disable audit (App.jsx, map/, browse/, after T283);
  T157-a (credit strings into "Where this comes from"); T265-b (paywall
  pagehide); T215-c and T215-d (affiliate clicks, error rate).
- **T156 and T158** go only after the owner has written a carta-design rule for the InfoDot.

## Data lane: never inside a wave, one session at a time

These need data/raw and the trailslab, and the laptop's Monday run must not be
active. They must finish before the user's stage 5.2 archive push, or be
re-pushed after it (the stage 7.11 `rclone check` catches a miss). After 7.11
they move to the box or a CAX41. Order: T104+T105 → T120 → T123 → T106 (verify)
→ T110 → T114 → T115 → T116 → T117 → T118 → T119 → T122 → T133. The user
decides each rebuild.

## Waits for a rollout stage, do not start

| Unblocked by | Tasks |
|---|---|
| Stage 2/3 pasted | T147 fact store (then T148, once T041-a is decided), T081 live proof, T144 measured runs, T149 |
| Stage 5 cutover | T271 D4 speed (boot-index first paint, DestinationPage phone CLS 0.309, INP, T059-d EPERM, T059-e), then T099 → T100 → T101 → T102 → T103 (also need T090 and T087) |
| Stage 6 | D5b CSP hosts and Wikimedia hotlinks (T052-f, T053-a), T112 CI gate, T082, T199 fonts, T212 brand assets, T223 → T221 → T222, T135 = T233 terrain (one task), T142 webcams |
| Stage 7.9 | T079 cadence, T080 rollbacks, T081 alerts, T072-c/d, T255-b |
| Stage 8 | T127 full harvest, T128, T131 full run, T134, T136, T137, T139 srcset, T140, T138 output |
| Stage 10 | T210, T228, T229, T234 |
| P5-P9 done | the P10 UI wave (T159-T186, T188-T191, T193), with T191 first in a freeze window; the P13 gates; P14 |
| Gated | T247-T251 |

## Decisions only the owner can make

| Decision | Blocks |
|---|---|
| T041-a: the grounding allowance printed on the passes, before Stripe | T148 |
| Surface or strip the orphan fields | T089 |
| The confidence model | T093 |
| Price two lengths, or state the assumption | T101 |
| The German cap | T125 |
| The peak target | T122 |
| Stacked bar vs carta-design's receipt rule | T172 |
| Take GPX out from behind the paywall | T176 |
| Is the home page the landing page? | T194 / T209 |
| Upload terms | T141 |
| A Flickr key | T127 |
| The alert channel | T081 |
| carta-design rules for InfoDot, carousel, slider, sticky rail and bento | P10 |

---

# Part C. The prompts

<!-- PROMPTS:BEGIN -->

## Wave 1 prompts

### Wave 1 · session 1 · T265 (opus)

~~~~text
Carta. Wave 1, session 1 of 10: T265 D1: payments and quota, SQL and functions.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T265    branch p2-d1-payments-quota
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T265-app    branch p2-d1-payments-quota
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T265 -Branch p2-d1-payments-quota -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T265. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P2/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: 044. It needs a self-check raise notice like 032-043, and the report says where it goes in the owner's paste order.
7. Ports: Vite dev/preview on 5201. A throwaway Postgres, if you need one, on 55441.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Migration 044. Rows: T031-b, T031-c, T030-d, T037-c, T043-e, T030-c, T034-b, T034-c, T037-a, T037-d, T035-c, T043-d, T033-f. Not T032-d or T033-e (admin tiles, wave 3). Test on throwaway Postgres; 044 belongs after 043 and before the stage 10 Stripe pastes; say so in the report.

THE TASK

# T265 · payments and quota, SQL and functions
(stage 9 group D1 of Execution/_OPEN-MASTER.md; no mind-map prompt exists for it)

WHAT  Read the D1 paragraph of Execution/_OPEN-MASTER.md stage 9, then every _OPEN.md row
listed in the notes above, then each row's source report under Execution/P*/. Fix each row.
If a row needs the owner or a later rollout stage, leave it open and say why in the report.
Mark each fixed row in Execution/_OPEN.md as Status "closed by T265" (never delete rows).

DONE WHEN  Every listed row is closed or explicitly left open with a reason; the tests the
source reports name pass; every screen you touched was checked in the browser at 380px and
desktop width.

REPORT  Execution/P2/T265-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 1 · session 2 · T266 (sonnet)

~~~~text
Carta. Wave 1, session 2 of 10: T266 D3: harness repairs.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T266    branch p4-d3-harness-repairs
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T266-app    branch p4-d3-harness-repairs
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T266 -Branch p4-d3-harness-repairs -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T266. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P4/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5202. A throwaway Postgres, if you need one, on 55442.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Rows: T052-g, T054-i (harness part only), T062-g, T067-f, T068-f, T069-f, T070-f, T076-a, T052-e, T253-a, T256-a, T256-b, T042-d; the verify_account_panel 380px item from T020; the dead verify_reach_filter.mjs from T027. Harnesses take their port from an env var, not a fixed 4173.

THE TASK

# T266 · harness repairs
(stage 9 group D3 of Execution/_OPEN-MASTER.md; no mind-map prompt exists for it)

WHAT  Read the D3 paragraph of Execution/_OPEN-MASTER.md stage 9, then every _OPEN.md row
listed in the notes above, then each row's source report under Execution/P*/. Fix each row.
If a row needs the owner or a later rollout stage, leave it open and say why in the report.
Mark each fixed row in Execution/_OPEN.md as Status "closed by T266" (never delete rows).

DONE WHEN  Every listed row is closed or explicitly left open with a reason; the tests the
source reports name pass; every screen you touched was checked in the browser at 380px and
desktop width.

REPORT  Execution/P4/T266-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 1 · session 3 · T078 (opus)

~~~~text
Carta. Wave 1, session 3 of 10: T078 Registry and licence unification.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T078    branch p4-registry-licence
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T078 -Branch p4-registry-licence
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T078. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P4/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5203. A throwaway Postgres, if you need one, on 55443.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Generate `docs/tos/data_licenses.md` from the registry; it also has to cover the `pipeline/harvest_*.py` sources that are not collectors. New workflow file only; no edits to existing workflows.

THE TASK

# T078 · Unify the ingestion registry with licence compliance
(mind-map number T320; use T078 everywhere: branch, report, register)

Carta. Task T078: Unify the ingestion registry with licence compliance
Work only on this task. Do not start the next one.

Read first, before writing anything: Original mind map item 19; Legal.md licensing; docs/tos/data_licenses.md.
Then read the files in this repository that it refers to.

Do this:
From your original mind map. Expand src/ingestion/core/registry.py into the single source of truth for BOTH collector execution metadata (cadence, failure mode) and legal governance (licence type, attribution required). Auto-generate docs/tos/data_licenses.md from the registry in CI.

Why it matters, so you do not lose it in the implementation:
It eliminates manual documentation drift, closes attribution gaps, and enforces copyleft obligations such as ODbL whenever a new collector is added. The ledger already has a documented rule that new collectors must add a row; this makes the rule impossible to forget rather than merely written down. With forty sources and growing, that is the difference between compliance and hope.

Done when: data_licenses.md is generated, and adding a collector without a licence row fails CI.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P4/T078-registry-licence-unification.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 1 · session 4 · T083 (opus)

~~~~text
Carta. Wave 1, session 4 of 10: T083 RLS policy tests and ErrorBoundary telemetry.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T083    branch p4-rls-errorboundary
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T083-app    branch p4-rls-errorboundary
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T083 -Branch p4-rls-errorboundary -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T083. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P4/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5204. A throwaway Postgres, if you need one, on 55444.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
T071 chose Supabase `edge_errors`, not Sentry: wire ErrorBoundary to `reportEdgeFailure` in `src/planner/edgeFailure.js`. No new migration. New workflow modelled on `admin-rpc-security.yml`.

THE TASK

# T083 · RLS policy tests and Sentry on the ErrorBoundary
(mind-map number T325; use T083 everywhere: branch, report, register)

Carta. Task T083: RLS policy tests and Sentry on the ErrorBoundary
Work only on this task. Do not start the next one.

Read first, before writing anything: Original mind map, Reliability branch; Carta BackEnd.md Phase 3 and Phase 5.
Then read the files in this repository that it refers to.

Do this:
From your original mind map. Write tests that assert every Row-Level Security policy actually denies what it should: not only the admin RPCs but the table policies themselves. Connect the frontend ErrorBoundary to the error telemetry chosen in T069 so a crash is recorded rather than just rendered.

Why it matters, so you do not lose it in the implementation:
The pgTap work covers admin_* functions; RLS policies are the other half, and they are what stands between one user's saved trips and another's. The ErrorBoundary connection is the client-side twin of the edge error telemetry: today a crash is visible only to the person it happened to.

Done when: RLS tests pass in CI and a thrown client error appears in telemetry.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P4/T083-rls-tests-and-errorboundary.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 1 · session 5 · T084 (opus)

~~~~text
Carta. Wave 1, session 5 of 10: T084 Trip validator in CI.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T084    branch p5-trip-validator
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T084 -Branch p5-trip-validator
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T084. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P5/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5205. A throwaway Postgres, if you need one, on 55445.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Extend `Trips/carta-unified/carta-unified/pipeline/validate.py` (last run: 0 errors, 482 warnings). The trips are the 253 journeys. New workflow file.

THE TASK

# T084 · Write the mechanical trip validator and put it in CI
(mind-map number T080; use T084 everywhere: branch, report, register)

Carta. Task T084: Write the mechanical trip validator and put it in CI
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-trips-enhancement-spec.md K5.
Then read the files in this repository that it refers to.

Do this:
A script that confirms: budget.breakdown sums to budget.totalEur; perDayEur equals total divided by days; every place named in the itinerary geocodes inside the stated country; every hero URL resolves and is over 1600px; accommodation named in accommodationStrategy also appears in at least one day's sleep; surface percentages add to 100; and no '€x, €y' comma range survives anywhere. Run it on every build.

Why it matters, so you do not lose it in the implementation:
Not everything needs a model. Roughly half the defects in this review would have been caught by twenty lines of validation, and a check that runs on every build is the only thing that stops a defect class coming back.

Done when: The validator runs in CI, currently fails, and every failure it reports maps to a task below.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P5/T084-trip-validator.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 1 · session 6 · T096 (fable)

~~~~text
Carta. Wave 1, session 6 of 10: T096 Ground-cost benchmark.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T096    branch p5-ground-cost-benchmark
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T096 -Branch p5-ground-cost-benchmark
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T096. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P5/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5206. A throwaway Postgres, if you need one, on 55446.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
New `tools/benchmark/`. Read the master and `continent-app/src/lib/costIndex.js` read-only from the main checkout's paths; write nothing outside the worktree. Check every new source's licence before using it.

THE TASK

# T096 · Benchmark ground costs against real listings
(mind-map number T331; use T096 everywhere: branch, report, register)

Carta. Task T096: Benchmark ground costs against real listings
Work only on this task. Do not start the next one.

Read first, before writing anything: Original mind map item 22.
Then read the files in this repository that it refers to.

Do this:
From your original mind map. Build an empirical validation suite testing cost-engine predictions against real-world hold-out data rather than against non-existent flight bookings. Benchmark estimated accommodation and daily spend against sampled hotel listings and Eurostat or Numbeo baskets. Target a defensible statement of the form: typical mid-range weekly trip cost predicted within €40 for 80% of destinations.

Why it matters, so you do not lose it in the implementation:
Benchmarking against bookings you never made is circular. Sampled listings and public baskets are independent, repeatable and cheap, and they produce a number you can put on the landing page.

Done when: A repeatable suite producing an accuracy figure with a stated confidence interval.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P5/T096-ground-cost-benchmark.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 1 · session 7 · T107 (sonnet) + T108 (opus)

Models differ, so run this row as two sessions: T107 on sonnet first (do only T107), then T108 on opus in the same worktrees, branching p7-trail-data-bugs from p7-title-ladder.

~~~~text
Carta. Wave 1, session 7 of 10: T107 then T108: title ladder, then trail bugs.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T107    branch p7-title-ladder
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T107-app    branch p7-title-ladder
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T107 -Branch p7-title-ladder -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).
Two tasks, in order: finish T107 on p7-title-ladder with its report and commits. Then, in each
worktree you used, run `git checkout -b p7-trail-data-bugs` (it branches from p7-title-ladder) and do T108 with its
own report.

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T107, T108. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P7/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5207. A throwaway Postgres, if you need one, on 55447.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Two tasks in sequence, two reports. `pipeline/trails/names.py`, `attributes.py`, `regionize.py`, `regression.py`, `src/lib/trailStory.js`. Code and tests only; no rebuild, no trailslab.

THE TASK

# T107 · 6.6 · Apply the title ladder across all five sections
(mind-map number T103; use T107 everywhere: branch, report, register)

Carta. Task T107: 6.6 · Apply the title ladder across all five sections
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-destinations-enhancement-spec.md 6.6, 11.1.
Then read the files in this repository that it refers to.

Do this:
Wikidata label -> a real source name -> 'from' -> 'to' -> landmark formula -> shape plus place. Cap at 42 characters on a word boundary. The original string becomes a mono ref chip. Region goes in the subtitle, never the title.

Why it matters, so you do not lose it in the implementation:
It fixes every ugly title in the product in one pass, with no new data.

Done when: No title exceeds 42 characters and no raw OSM string is a title.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P7/T107-title-ladder.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.

---- next task ----

# T108 · 6.8 · Fix the five user-visible trail data bugs
(mind-map number T104; use T108 everywhere: branch, report, register)

Carta. Task T108: 6.8 · Fix the five user-visible trail data bugs
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-destinations-enhancement-spec.md 6.8, 11.1.
Then read the files in this repository that it refers to.

Do this:
Mount Korab is stored summit-to-village and shows +7 m on a line dropping 1,400 m: orient one-way routes uphill or show both climb and descent. difficulty:moderate and f.g:very_hard disagree on the same row and the UI prints the second. The Korab trailhead is in Radomire, Albania and the page says North Macedonia: derive the region from the start point. Highlights render in Macedonian Cyrillic when name:en and name:sq both exist: prefer name:en, then local Latin, then other scripts. And '12.1 km, a comfortable day out' sits next to 1,568 m of climb: the copy generator must read the numbers it is describing.

Why it matters, so you do not lose it in the implementation:
Each of these is visible to any user who opens that page, and the last one is a generation bug that will reproduce on every new row until it is fixed.

Done when: All five fixed with a regression test each.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P7/T108-trail-data-bugs.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 1 · session 8 · T111 (fable)

~~~~text
Carta. Wave 1, session 8 of 10: T111 Country floors and reason codes.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T111    branch p7-coverage-reason-codes
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T111 -Branch p7-coverage-reason-codes
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T111. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P7/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5208. A throwaway Postgres, if you need one, on 55448.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Floors and `na` status exist in `pipeline/regions/coverage.py`; the per-miss reason codes do not. Do not commit `continent-app/public/coverage.json`.

THE TASK

# T111 · 0.4 · Implement country floors and reason codes
(mind-map number T107; use T111 everywhere: branch, report, register)

Carta. Task T111: 0.4 · Implement country floors and reason codes
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-destinations-enhancement-spec.md 0.4, 4.6.
Then read the files in this repository that it refers to.

Do this:
The promise: for every one of the 47 countries and every one of the five sections, Carta either publishes at least the country floor, or prints a reason code saying why it cannot. Floors - Trails: every registry entry above the fame threshold, minimum 12, and every NUTS3 region publishes its top 3 or gives each miss a reason. Cycling: every national and international route, minimum 8. Beaches: every EEA coastal bathing water, minimum 10 where a coast exists, every coastal NUTS3 at least 5. Lakes: every lake clearing the hard anchors, minimum 15 where lakes exist, max 3 per 50 km cell. Mountains: every ultra, every national and regional highpoint, every lift-served summit, minimum 10 where relief exists, every GMBA range over 1,000 m publishes its 3 highest. Reason codes: no_open_data, way_only_not_derived, failed_continuity, below_quota, not_applicable, licence_blocked, pending_partnership.

Why it matters, so you do not lose it in the implementation:
The point of the reason code is that a gap stops being a bug and becomes a stated fact. 'Turkey, 0 hiking routes published, reason: pending_partnership with Culture Routes Society' is a product that knows itself. A blank grid is not. It is the same argument as the confidence model in the trips spec.

Done when: Every country-section cell has either a published count above floor or a reason code.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P7/T111-coverage-contract.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 1 · session 9 · T192 (opus)

~~~~text
Carta. Wave 1, session 9 of 10: T192 Hook dependencies.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T192    branch p10-hook-deps
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T192-app    branch p10-hook-deps
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T192 -Branch p10-hook-deps -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T192. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P10/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5209. A throwaway Postgres, if you need one, on 55449.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Start at `src/planner/TripPlannerTab.jsx:307`. Check the planner screens in the browser. Do not touch styles.css or i18n.

THE TASK

# T192 · Fix hook dependencies and memoisation thrashing
(mind-map number T345; use T192 everywhere: branch, report, register)

Carta. Task T192: Fix hook dependencies and memoisation thrashing
Work only on this task. Do not start the next one.

Read first, before writing anything: Original mind map, Code Cleanup.
Then read the files in this repository that it refers to.

Do this:
From your original mind map. Remediate the react-hooks/exhaustive-deps warnings, prioritising TripPlannerTab.jsx:307 where unstable inline expressions re-create destination arrays on every render, invalidating downstream useMemo hooks.

Why it matters, so you do not lose it in the implementation:
This is the cause of severe re-render lag when computing itineraries across an expanded destination catalogue: and the catalogue is about to expand a great deal. Fixing reference stability now is much cheaper than diagnosing it at 25,000 destinations.

Done when: Lint clean on exhaustive-deps and measured re-render improvement on the planner.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P10/T192-hook-dependencies.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 1 · session 10 · T195 (sonnet)

~~~~text
Carta. Wave 1, session 10 of 10: T195 PRODUCT.md and DESIGN.md.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T195    branch p11-product-design-docs
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T195 -Branch p11-product-design-docs
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T195. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P11/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5210. A throwaway Postgres, if you need one, on 55450.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Read tokens from the shipped `:root` in `continent-app/src/styles.css` (read-only). The carta-design SKILL.md banner of 2026-07-28 (Fraunces, Plus Jakarta, JetBrains Mono, alabaster, terracotta) is the decided state; record it as such and note that the skill's older body contradicts it.

THE TASK

# T195 · Write PRODUCT.md and DESIGN.md as the durable context
(mind-map number T191; use T195 everywhere: branch, report, register)

Carta. Task T195: Write PRODUCT.md and DESIGN.md as the durable context
Work only on this task. Do not start the next one.

Read first, before writing anything: Frontend Design Tools Research.md, context binding and deterministic design systems; carta-design skill.
Then read the files in this repository that it refers to.

Do this:
PRODUCT.md: the core audience of budget-conscious European travellers, the operational context of comparing dense pricing matrices, the brand voice, and the specific accessibility constraints. DESIGN.md: the locked tokens from src/styles.css - --paper #f8f6f0, --paper-dim, --bg-card #ffffff, --ink #0f172a, --ink-soft, --ink-mute, --rule, --rule-soft, --accent #e05a47 terracotta for actions and the live route, --rate #8f5a0c ochre for ratings as a measure, --gem-ink #2c6e63 teal for hidden gems and nothing else, --green for good news in data, --danger for destructive only; --display Fraunces, --ui Plus Jakarta Sans, --mono JetBrains Mono for measured facts only; the --space-1..8 scale and --tap 44px.

Why it matters, so you do not lose it in the implementation:
The point of the pattern is deterministic execution instead of probabilistic guesswork. Carta already has the design system; this is about making it the thing the agent reads first, every session.

Done when: Both files exist, are referenced from CLAUDE.md, and match the shipped tokens exactly.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P11/T195-product-and-design-context.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

## Wave 2 prompts

### Wave 2 · session 1 · T268 (opus)

~~~~text
Carta. Wave 2, session 1 of 10: T268 D2a: admin follow-ups, database side.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T268    branch p4-d2a-admin-db
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T268-app    branch p4-d2a-admin-db
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T268 -Branch p4-d2a-admin-db -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T268. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P4/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: 045. It needs a self-check raise notice like 032-043, and the report says where it goes in the owner's paste order.
7. Ports: Vite dev/preview on 5201. A throwaway Postgres, if you need one, on 55441.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Migration 045. Rows: T063-d, T064-c, T065-c, T066-b (RPC only), T067-a, T067-b, T071-d (redefine export_user_data in 045, never edit 024), T074-d, T074-e, T076-b (country code on the override row), T077-c, T069-g, T077-a, T065-e. The paste goes after 043 in stage 2. Mind the re-paste table in _OPEN-MASTER 2.5. Migration 044 (T265, wave 1) is pasted LATER, in stage 10 after 031: 045 must not depend on anything 044 creates (ai_usage_days, pass_can_buy, the pass_grants reason/fee columns, oss_alerts) and must not redefine any function 044 replaces (grant_pass, ai_refund, admin_margin, the funnel and OSS functions), or the stage 10 paste of 044 would undo 045. The test harnesses apply migrations in filename order, so also run your 045 tests with 044 present.

THE TASK

# T268 · admin follow-ups, database side
(stage 9 group D2 of Execution/_OPEN-MASTER.md; no mind-map prompt exists for it)

WHAT  Read the D2 paragraph of Execution/_OPEN-MASTER.md stage 9, then every _OPEN.md row
listed in the notes above, then each row's source report under Execution/P*/. Fix each row.
If a row needs the owner or a later rollout stage, leave it open and say why in the report.
Mark each fixed row in Execution/_OPEN.md as Status "closed by T268" (never delete rows).

DONE WHEN  Every listed row is closed or explicitly left open with a reason; the tests the
source reports name pass; every screen you touched was checked in the browser at 380px and
desktop width.

REPORT  Execution/P4/T268-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 2 · session 2 · T085 (sonnet)

~~~~text
Carta. Wave 2, session 2 of 10: T085 A1 ranges (journey lane).
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T085    branch p5-a1-ranges
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T085-app    branch p5-a1-ranges
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T085 -Branch p5-a1-ranges -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T085. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P5/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5202. A throwaway Postgres, if you need one, on 55442.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
`JourneyPage.jsx`, `pipeline/journeys/build_wire.py`, `lib/format.js`, trip JSON prose (209/253 files still hold "€x, €y"). No en dash: write "€x to €y"; stripDashes wins over the note.

THE TASK

# T085 · A1 · Store ranges as {low, high}, render once
(mind-map number T081; use T085 everywhere: branch, report, register)

Carta. Task T085: A1 · Store ranges as {low, high}, render once
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-trips-enhancement-spec.md A1, H1.
Then read the files in this repository that it refers to.

Do this:
209 of 253 trip files contain the pattern '€1,200, €1,850'. On the page it reads as two separate prices, or as a thousands separator, instead of 'from €1,200 to €1,850'. The same pattern is in food lines ('Konoba mains €14, €22'), hotel lines ('€120, €180 double') and airport lines. The dataset has zero em dashes, so the range character was stripped at some point and never replaced. Store ranges as {low, high} objects in the JSON and render them with a single en dash or the word 'to' in ONE place in the component.

Why it matters, so you do not lose it in the implementation:
This is the single highest-value fix on the page. The product's whole claim is that its numbers are trustworthy, and right now the headline number is ambiguous. Rendering in one place is what stops it ever drifting again.

Done when: Zero comma-ranges remain (validator green) and every range renders from one component.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P5/T085-a1-number-ranges.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 2 · session 3 · T267 (sonnet)

~~~~text
Carta. Wave 2, session 3 of 10: T267 D6: frozen fares and housekeeping.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T267    branch p3-d6-fares-housekeeping
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T267-app    branch p3-d6-fares-housekeeping
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T267 -Branch p3-d6-fares-housekeeping -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T267. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P3/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5203. A throwaway Postgres, if you need one, on 55443.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Rows: T058-a, T058-c, T058-d, T056-c, T255-c, T062-b, LIVE-b; the T029 items (SCHEMA.md says v15, it is v17; contract gate on split wires; smoke-test waits); T027 stale comments and unused CSS; the `practical_layer.py` decision; retired carrier harvesters to the archive tier. NOT T072-c/d or T255-b (they wait for stage 7). NOT T062-e.

THE TASK

# T267 · frozen fares and housekeeping
(stage 9 group D6 of Execution/_OPEN-MASTER.md; no mind-map prompt exists for it)

WHAT  Read the D6 paragraph of Execution/_OPEN-MASTER.md stage 9, then every _OPEN.md row
listed in the notes above, then each row's source report under Execution/P*/. Fix each row.
If a row needs the owner or a later rollout stage, leave it open and say why in the report.
Mark each fixed row in Execution/_OPEN.md as Status "closed by T267" (never delete rows).

DONE WHEN  Every listed row is closed or explicitly left open with a reason; the tests the
source reports name pass; every screen you touched was checked in the browser at 380px and
desktop width.

REPORT  Execution/P3/T267-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 2 · session 4 · T269 (opus)

~~~~text
Carta. Wave 2, session 4 of 10: T269 D5a: photo pipeline before stage 8.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T269    branch p3-d5a-photo-pipeline
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T269 -Branch p3-d5a-photo-pipeline
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T269. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P3/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5204. A throwaway Postgres, if you need one, on 55444.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Rows: T052-c, T051-c, T049-f, T049-i, T049-j, T050-c, T049-k, T051-d, T047-g (as a written check procedure), and the T007/T008 items (3,983 wire images without a cache, non-image files kept out, 404 probe). `pipeline/photos/`. No CSP and no app work. Must merge before the user starts _OPEN-MASTER 8.4.

THE TASK

# T269 · photo pipeline before stage 8
(stage 9 group D5 of Execution/_OPEN-MASTER.md; no mind-map prompt exists for it)

WHAT  Read the D5 paragraph of Execution/_OPEN-MASTER.md stage 9, then every _OPEN.md row
listed in the notes above, then each row's source report under Execution/P*/. Fix each row.
If a row needs the owner or a later rollout stage, leave it open and say why in the report.
Mark each fixed row in Execution/_OPEN.md as Status "closed by T269" (never delete rows).

DONE WHEN  Every listed row is closed or explicitly left open with a reason; the tests the
source reports name pass; every screen you touched was checked in the browser at 380px and
desktop width.

REPORT  Execution/P3/T269-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 2 · session 5 · T113 (opus)

~~~~text
Carta. Wave 2, session 5 of 10: T113 Famous-trail registry top-up.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T113    branch p7-famous-registry-topup
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T113 -Branch p7-famous-registry-topup
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T113. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P7/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5205. A throwaway Postgres, if you need one, on 55445.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
The registry is done in substance. Only the Waymarked diff and the per-GMBA coverage gap are left. Network reads are fine; no trailslab.

THE TASK

# T113 · 6.1 · Build the famous-trail registry from evidence, not memory
(mind-map number T109; use T113 everywhere: branch, report, register)

Carta. Task T113: 6.1 · Build the famous-trail registry from evidence, not memory
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-destinations-enhancement-spec.md 6.1, 0.3, 11.4.
Then read the files in this repository that it refers to.

Do this:
Assemble candidates for every NUTS3 region and every GMBA range from four independent sources and store data/trails/famous_registry.json with name, region, source and evidence score. Wikidata SPARQL (P31/P279* Q2143825 with P625, pulling P402 OSM relation id, P2043 length and P18 image; CC0, no key), Wikipedia pageviews as the fame ranking, Waymarked Trails as the pan-European diff of what should exist per country, and the national datasets from Tier B.

Why it matters, so you do not lose it in the implementation:
Trails suffer a recall failure: 17,619 rows and the walk the user searched for is not one of them. A registry built from evidence is what turns 'is this trail missing' from a guess into a query, and it is what the coverage gate checks against.

Done when: The registry exists with evidence scores and the gate reads from it.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P7/T113-famous-trail-registry.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 2 · session 6 · T157 (haiku)

~~~~text
Carta. Wave 2, session 6 of 10: T157 Banned-surface-terms lint.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T157    branch p10-banned-terms-lint
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T157-app    branch p10-banned-terms-lint
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T157 -Branch p10-banned-terms-lint -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T157. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P10/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5206. A throwaway Postgres, if you need one, on 55446.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
New `scripts/ci/banned-terms.mjs`, report-only; it scans i18n read-only. Do not wire it into `npm run ci`.

THE TASK

# T157 · 4.3 · Enforce the banned-from-the-surface list
(mind-map number T161; use T157 everywhere: branch, report, register)

Carta. Task T157: 4.3 · Enforce the banned-from-the-surface list
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-destinations-enhancement-spec.md 4.3; carta-trips-enhancement-spec.md C8.
Then read the files in this repository that it refers to.

Do this:
No raw tag names, no field names, no bare f.g, no sac_scale printed bare, no NUTS3, no OSM relation, no GLO-30, no ODbL outside the attribution footer. No unexpanded abbreviations in body copy except airport codes, which are legitimately mono data. Provenance and licences live in a collapsed 'Where this comes from' row at the foot of the page. Add a lint rule.

Why it matters, so you do not lose it in the implementation:
Honest without being in the way. A lint rule is what keeps it true as new modules land.

Done when: A lint rule fails the build on any banned term appearing in surface copy.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P10/T157-banned-surface-terms.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 2 · session 7 · T201 (fable)

~~~~text
Carta. Wave 2, session 7 of 10: T201 Positioning.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T201    branch p12-positioning
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T201 -Branch p12-positioning
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T201. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P12/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5207. A throwaway Postgres, if you need one, on 55447.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Doc. T202 and T205-T208 build on it.

THE TASK

# T201 · Write the positioning, in one sentence and one paragraph
(mind-map number M01; use T201 everywhere: branch, report, register)

Carta. Task T201: Write the positioning, in one sentence and one paragraph
Work only on this task. Do not start the next one.

Read first, before writing anything: 1.CARTA.md 'The one rule everything follows'; CARTA_UNIT_ECONOMICS.md §5.
Then read the files in this repository that it refers to.

Do this:
TO DO: NOT YET RESEARCHED. Produce: one sentence that says what Carta is and who it is for, one paragraph that says what it does that nothing else does, and three proof points drawn from the product rather than from adjectives. Test it against the four competitor categories in M02.

Why it matters, so you do not lose it in the implementation:
The product already has an unusually sharp claim and nobody has written it down: one honest all-in number from your own departure airport, for 1,570 destinations, with every figure labelled as harvested, cached or estimated. Most travel products cannot say the second half of that sentence at all. The positioning work is mostly excavation, not invention.

Done when: One sentence, one paragraph and three proof points, all checked against what the product actually does today.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P12/T201-positioning.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 2 · session 8 · T126 (sonnet)

~~~~text
Carta. Wave 2, session 8 of 10: T126 Image brief and vision-scoring prompt.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T126    branch p8-image-brief
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T126 -Branch p8-image-brief
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T126. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P8/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5208. A throwaway Postgres, if you need one, on 55448.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Brief doc. Put the prompt change to `pipeline/photos/relevance.py` behind a new prompt file so it does not collide with session 4; if it can't be separated, doc only and note it.

THE TASK

# T126 · 2.1 · Write the image brief and the vision-scoring prompt
(mind-map number T125; use T126 everywhere: branch, report, register)

Carta. Task T126: 2.1 · Write the image brief and the vision-scoring prompt
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-destinations-enhancement-spec.md 2.1.
Then read the files in this repository that it refers to.

Do this:
Per section, the hero answers: Mountains - what you see FROM the summit. Trails - the best viewpoint on the route, looking outward. Cycling - the surface under the tyre with the landscape beyond. Beaches - the beach along its length from water level, so you can read the entry and the sand. Lakes - the shore looking across the water, so the colour and the far side are visible. Galleries answer the complementary question. Keep the existing hard rejects (animals and plants in close-up, vehicles, interiors, maps and diagrams, satellite images, identifiable people as the main subject) and add two: no image whose subject is a signpost or trail marker, and no image taken more than 2 km from the feature unless explicitly framed as 'seen from'.

Why it matters, so you do not lose it in the implementation:
Every downstream selection and scoring step reads this brief. Writing it once, precisely, is what makes the automated scoring in T126 produce the right answer instead of a plausible one.

Done when: The brief exists as a document and as the scoring prompt.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P8/T126-image-brief.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 2 · session 9 · T177 (fable)

~~~~text
Carta. Wave 2, session 9 of 10: T177 DECIDE komoot embed or own GPX.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T177    branch p10-routing-decision
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T177 -Branch p10-routing-decision
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T177. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P10/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5209. A throwaway Postgres, if you need one, on 55449.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Decision doc with a recommendation. The app uses MapLibre and Carto, not Mapbox. The owner confirms.

THE TASK

# T177 · F1-F3 · DECIDE: komoot embed or own GPX on Mapbox Outdoors
(mind-map number T181; use T177 everywhere: branch, report, register)

Carta. Task T177: F1-F3 · DECIDE: komoot embed or own GPX on Mapbox Outdoors
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-trips-enhancement-spec.md F1, F2, F3, L7.
Then read the files in this repository that it refers to.

Do this:
Building activity-specific routing, offline tiles and the backend behind them is tens of thousands of euros and an ongoing maintenance load, so integrate rather than build - that part is settled. The open decision is which. Komoot's publisher embed renders an interactive map, elevation profile and route statistics inside your own page with no third-party account required from the user, which keeps the user on Carta while borrowing world-class topographical data. THE CATCH: komoot's embed works by embedding a komoot TOUR, which means somebody has to author 253 tours in a komoot account before there is anything to embed, and komoot's commercial and copyright terms for publisher use need reading before you build a dependency on them. The alternative: hold your own GPX files and render them on Mapbox Outdoors, keeping the map looking like Carta and removing a platform dependency, at the cost of building the elevation profile yourself - a small job when you already have the track.

Why it matters, so you do not lose it in the implementation:
Sending users to another site at the exact moment they are most engaged is the worst possible trade, so linking out is off the table. Decide based on whether the map is a feature or THE feature. Budget the komoot authoring work and check the terms first.

Done when: The decision is recorded with the terms check done, and the chosen path is implemented.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P10/T177-routing-integration-decision.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 2 · session 10 · T187 (fable)

~~~~text
Carta. Wave 2, session 10 of 10: T187 First-run trip result design.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T187    branch p10-first-run-design
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T187 -Branch p10-first-run-design
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T187. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P10/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5210. A throwaway Postgres, if you need one, on 55450.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Design doc only, under carta-design. The owner approves before any code.

THE TASK

# T187 · Design the first-run trip result
(mind-map number T340; use T187 everywhere: branch, report, register)

Carta. Task T187: Design the first-run trip result
Work only on this task. Do not start the next one.

Read first, before writing anything: Original mind map, User Interface; carta-trips-enhancement-spec.md I1.
Then read the files in this repository that it refers to.

Do this:
From your original mind map. Design what a first-time user sees the moment their first result appears: what is explained, what is not, and what the single next action is.

Why it matters, so you do not lose it in the implementation:
This is the moment the product either makes sense or does not. After P6 the first result is a real priced total from their own airport, which is a far stronger first impression than the current handoff: but only if the screen explains the receipt rather than assuming it is obvious.

Done when: A designed first-run result tested on someone who has never seen the product.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P10/T187-first-run-result.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

## Wave 3 prompts

### Wave 3 · session 1 · T270 (sonnet)

~~~~text
Carta. Wave 3, session 1 of 10: T270 D2b: admin UI follow-ups.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T270    branch p4-d2b-admin-ui
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T270-app    branch p4-d2b-admin-ui
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T270 -Branch p4-d2b-admin-ui -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T270. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P4/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5201. A throwaway Postgres, if you need one, on 55441.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Rows: T064-b, T065-d, T066-c, T067-e, T070-h, T068-b, T068-h, T073-c, T074-b, T075-a, T075-b, T075-c, T076-c, T062-e, T032-d, T033-e, T071-b, plus the Gemini sentence from T018 in PrivacyPolicy (6 locales). Uses the 045 RPCs from wave 2.

THE TASK

# T270 · admin UI follow-ups
(stage 9 group D2 of Execution/_OPEN-MASTER.md; no mind-map prompt exists for it)

WHAT  Read the D2 paragraph of Execution/_OPEN-MASTER.md stage 9, then every _OPEN.md row
listed in the notes above, then each row's source report under Execution/P*/. Fix each row.
If a row needs the owner or a later rollout stage, leave it open and say why in the report.
Mark each fixed row in Execution/_OPEN.md as Status "closed by T270" (never delete rows).

DONE WHEN  Every listed row is closed or explicitly left open with a reason; the tests the
source reports name pass; every screen you touched was checked in the browser at 380px and
desktop width.

REPORT  Execution/P4/T270-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 3 · session 2 · T087 (sonnet)

~~~~text
Carta. Wave 3, session 2 of 10: T087 A2 month strip (journey lane).
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T087    branch p5-a2-month-strip
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T087-app    branch p5-a2-month-strip
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T087 -Branch p5-a2-month-strip -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T087. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P5/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5202. A throwaway Postgres, if you need one, on 55442.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Avoid-months are free text in `bestPeriod.avoid`; parse them in build_wire.py.

THE TASK

# T087 · A2 · Replace the best-months sentence with a 12-cell month strip
(mind-map number T083; use T087 everywhere: branch, report, register)

Carta. Task T087: A2 · Replace the best-months sentence with a 12-cell month strip
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-trips-enhancement-spec.md A2, H1; carta-destinations-enhancement-spec.md 8.7, 10.8.
Then read the files in this repository that it refers to.

Do this:
Twelve mono month initials: good months filled --signal-wash with --signal text, avoid months in --ink-45 with a hairline strike, neutral months plain. The 30-word prose explanation moves behind an info icon on the strip.

Why it matters, so you do not lose it in the implementation:
A traveller reads the strip in half a second; nobody reads the sentence. This is also the pattern reused by beaches, lakes and mountains in P7, so build it as a shared component.

Done when: The strip renders on every trip and the prose is behind the dot.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P5/T087-a2-month-strip.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 3 · session 3 · T202 (fable)

~~~~text
Carta. Wave 3, session 3 of 10: T202 Competitive positioning.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T202    branch p12-competitive
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T202 -Branch p12-competitive
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T202. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P12/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5203. A throwaway Postgres, if you need one, on 55443.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Reads T201.

THE TASK

# T202 · Competitive positioning against the four categories
(mind-map number M02; use T202 everywhere: branch, report, register)

Carta. Task T202: Competitive positioning against the four categories
Work only on this task. Do not start the next one.

Read first, before writing anything: pricing.js header; carta-destinations-enhancement-spec.md Part 13 closing note.
Then read the files in this repository that it refers to.

Do this:
TO DO: NOT YET RESEARCHED. Research and write where Carta sits against: route and trail products (Komoot, AllTrails, Outdooractive), journey planners (Rome2Rio, Omio), flight-price discovery (Skyscanner Everywhere, Kiwi Explore, Google Flights map), and itinerary planners (Wanderlog, TripIt). For each: what they do better, what they cannot do, and the one sentence that distinguishes Carta from them.

Why it matters, so you do not lose it in the implementation:
Two competitive facts are already known and should anchor the work: TripIt gives away a free 30-day trial and Wanderlog's month is about EUR 5.20, which is why the Trip Pass has to clear a competitive floor rather than undercut it. And the thing none of them can copy is the priced leg from the user's own airport to a specific trail, beach or summit.

Done when: A one-page comparison with an honest 'they are better at this' column, and the distinguishing sentence per competitor.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P12/T202-competitive-positioning.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 3 · session 4 · T204 (haiku)

~~~~text
Carta. Wave 3, session 4 of 10: T204 The acquisition constraint.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T204    branch p12-acquisition-constraint
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T204 -Branch p12-acquisition-constraint
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T204. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P12/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5204. A throwaway Postgres, if you need one, on 55444.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
€0.17 per visitor, from the mind map's Economics sheet.

THE TASK

# T204 · The acquisition constraint, written down once
(mind-map number M04; use T204 everywhere: branch, report, register)

Carta. Task T204: The acquisition constraint, written down once
Work only on this task. Do not start the next one.

Read first, before writing anything: CARTA_UNIT_ECONOMICS.md §5.
Then read the files in this repository that it refers to.

Do this:
Write the constraint at the top of every marketing document: €6.85 contribution per purchase, ~2.5% assumed purchase rate, therefore about €0.17 of allowable spend per visitor and about €3.04 of allowable CAC per payer at a 3:1 ratio. Therefore: no paid search, no paid social, no influencer fees, no sponsorships, until contribution per user is several times higher.

Why it matters, so you do not lose it in the implementation:
This is not a marketing opinion, it is arithmetic, and it saves you from the default startup instinct of buying traffic. It also reframes the whole plan: coverage work in P7 is the marketing budget, spent in engineering hours rather than in ad spend.

Done when: The constraint is the first line of the go-to-market document and every channel proposal is tested against it.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P12/T204-acquisition-constraint.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 3 · session 5 · T205 (fable)

~~~~text
Carta. Wave 3, session 5 of 10: T205 Programmatic SEO plan.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T205    branch p12-seo-plan
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T205 -Branch p12-seo-plan
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T205. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P12/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5205. A throwaway Postgres, if you need one, on 55445.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Plan doc only; the code waits for stage 6.

THE TASK

# T205 · The programmatic SEO plan
(mind-map number M05; use T205 everywhere: branch, report, register)

Carta. Task T205: The programmatic SEO plan
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-destinations-enhancement-spec.md 4.6, 6.6; CARTA_UNIT_ECONOMICS.md §5.
Then read the files in this repository that it refers to.

Do this:
TO DO: NOT YET RESEARCHED. Research and write the plan for turning the catalogue into an organic acquisition surface: which page types target which query shapes, the title and meta pattern per section derived from the title ladder, structured data (schema.org) per page type, internal linking between trips, destinations and country guides, sitemap generation and indexation monitoring, canonical handling for stage families and parent pages, and hreflang across the six languages.

Why it matters, so you do not lose it in the implementation:
This is the only channel the economics permits, and the raw material already exists: tens of thousands of pages carrying measured facts nobody else publishes: ten-year bathing water history, swim season in days, prevailing wind by month, walk-in time and descent, horizon peaks with distances. Those are the answers to long-tail questions that currently have no good page anywhere. Note the honest coverage lines help rather than hurt: a page that admits what it cannot map reads as authoritative.

Done when: A written SEO plan with page types, query shapes, structured data and a monthly indexation metric.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P12/T205-programmatic-seo.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 3 · session 6 · T130 (haiku) + T132 (haiku)

~~~~text
Carta. Wave 3, session 6 of 10: T130 then T132: Street View exclusion, then the s2maps check.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T130    branch p8-exclude-streetview
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T130 -Branch p8-exclude-streetview
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).
Two tasks, in order: finish T130 on p8-exclude-streetview with its report and commits. Then, in each
worktree you used, run `git checkout -b p8-sentinel-licence` (it branches from p8-exclude-streetview) and do T132 with its
own report.

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T130, T132. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P8/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5206. A throwaway Postgres, if you need one, on 55446.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Two tiny decision docs, two reports.

THE TASK

# T130 · Explicitly exclude Google Street View
(mind-map number T129; use T130 everywhere: branch, report, register)

Carta. Task T130: Explicitly exclude Google Street View
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-destinations-enhancement-spec.md 2.2.
Then read the files in this repository that it refers to.

Do this:
The Static API does take heading, pitch and fov, and the metadata endpoint is free, but the policy prohibits pre-fetching, indexing, storing or caching anything except place and panorama IDs. You cannot pre-render 17,600 trail images into your CDN. At $7 per 1,000 live requests with essentially no hiking coverage, it is out.

Why it matters, so you do not lose it in the implementation:
Recorded so nobody re-proposes it. Same category as the Google Photorealistic 3D Tiles exclusion.

Done when: Decision recorded.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P8/T130-excluded-imagery-sources.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.

---- next task ----

# T132 · One licence trap: never ship s2maps.eu cloudless tiles
(mind-map number T131; use T132 everywhere: branch, report, register)

Carta. Task T132: One licence trap: never ship s2maps.eu cloudless tiles
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-destinations-enhancement-spec.md 2.3, 12.
Then read the files in this repository that it refers to.

Do this:
The free Sentinel-2 cloudless tiles at s2maps.eu are CC BY-NC-SA, NON-COMMERCIAL. Do not ship those. Use raw Sentinel-2 or pay EOX. Esri World Imagery is likewise only licensed inside Esri-approved apps.

Why it matters, so you do not lose it in the implementation:
It is the kind of mistake that is invisible until it is a letter, and the free tiles are the obvious thing to reach for.

Done when: Source verified as raw Sentinel-2 or a licensed alternative.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P8/T132-sentinel-licence-check.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 3 · session 7 · T121 (sonnet)

~~~~text
Carta. Wave 3, session 7 of 10: T121 Node networks are not routes.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T121    branch p7-node-networks-decision
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T121 -Branch p7-node-networks-decision
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T121. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P7/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5207. A throwaway Postgres, if you need one, on 55447.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Already in code (`pipeline/trails/node_networks.py`). Decision record only; the loop product is the owner's call.

THE TASK

# T121 · 7.5 · Do NOT ingest node networks as routes
(mind-map number T117; use T121 everywhere: branch, report, register)

Carta. Task T121: 7.5 · Do NOT ingest node networks as routes
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-destinations-enhancement-spec.md 7.5, 14 (open decisions).
Then read the files in this repository that it refers to.

Do this:
Knooppunten and Knotenpunkte in NL, BE, north-west DE and northern FR are not routes: each node pair is a tiny relation with a ref like '04-35'. Ingesting them raw adds tens of thousands of 3 km fragments and destroys the catalogue. Either build a routable node graph and offer 'make me a 40 km loop from node 42' as a separate scoped product, or leave them out.

Why it matters, so you do not lose it in the implementation:
This is a trap that looks like free coverage and is actually catalogue destruction. Recorded as a deliberate exclusion.

Done when: Decision recorded; node networks excluded from route ingestion.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P7/T121-node-networks-decision.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 3 · session 8 · T197 (opus)

~~~~text
Carta. Wave 3, session 8 of 10: T197 Curate components by role.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T197    branch p11-component-curation
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T197 -Branch p11-component-curation
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T197. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P11/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5208. A throwaway Postgres, if you need one, on 55448.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Doc. React 18, no Tailwind.

THE TASK

# T197 · Curate components by role, not by library
(mind-map number T193; use T197 everywhere: branch, report, register)

Carta. Task T197: Curate components by role, not by library
Work only on this task. Do not start the next one.

Read first, before writing anything: Frontend Design Tools Research.md, curated UI ecosystems; carta-design skill.
Then read the files in this repository that it refers to.

Do this:
The copy-paste ownership model means components land as source files you own, with no peer-dependency tree. Map libraries to roles rather than adopting one: shadcn/ui for foundational primitives (buttons, inputs, dialogs, forms); Origin UI for dense operational surfaces - complex filters, budget sliders, admin tables; Magic UI for bento grids and pricing tier cards; Motion Primitives for restrained feedback and transitions. Aceternity's cinematic hero treatment is the one to use with caution, because bold high-contrast immersion is close to the aesthetic carta-design exists to avoid.

Why it matters, so you do not lose it in the implementation:
Relying exclusively on one library produces a monolithic aesthetic; mixing by role produces an interface that is both inspiring and usable. But every component must be re-skinned to the Carta tokens before it ships - adopting a library's look is how the generated aesthetic gets back in.

Done when: Any adopted component is re-skinned to Carta tokens and passes the T192 detector.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P11/T197-component-curation.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 3 · session 9 · T217 (opus) + T218 (opus)

~~~~text
Carta. Wave 3, session 9 of 10: T217 then T218: refund SOP, then incident runbook.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T217    branch p12-refund-sop
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T217 -Branch p12-refund-sop
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).
Two tasks, in order: finish T217 on p12-refund-sop with its report and commits. Then, in each
worktree you used, run `git checkout -b p12-incident-runbook` (it branches from p12-refund-sop) and do T218 with its
own report.

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T217, T218. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P12/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5209. A throwaway Postgres, if you need one, on 55449.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Docs. The status surface is code and waits for stages 6/7.

THE TASK

# T217 · The refund standard operating procedure
(mind-map number M17; use T217 everywhere: branch, report, register)

Carta. Task T217: The refund standard operating procedure
Work only on this task. Do not start the next one.

Read first, before writing anything: Legal.md ToS; 007_passes.sql pass_grants rationale.
Then read the files in this repository that it refers to.

Do this:
TO DO: NOT YET RESEARCHED. Write the procedure: who decides, in what circumstances a refund is given beyond the statutory minimum, how it is issued in Stripe, how the entitlement is revoked or left in place, and how it is recorded in the ledger.

Why it matters, so you do not lose it in the implementation:
The 14-day withdrawal right and its waiver are already handled at checkout, but a waived right does not mean no refunds: it means refunds are your choice, and a choice with no policy becomes an argument. pass_grants doubles as the purchase history that any refund question will need.

Done when: A one-page procedure, tested once against a real refund in P13.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P12/T217-refund-sop.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.

---- next task ----

# T218 · Incident runbook and a status surface
(mind-map number M18; use T218 everywhere: branch, report, register)

Carta. Task T218: Incident runbook and a status surface
Work only on this task. Do not start the next one.

Read first, before writing anything: Carta BackEnd.md Phase 3; 1.CARTA.md 'Failure honesty'.
Then read the files in this repository that it refers to.

Do this:
TO DO: NOT YET RESEARCHED. Write what to do when: the pipeline fails silently, Gemini quota is exhausted, Stripe webhooks stop arriving, R2 or Cloudflare has an incident, or the Supabase project has a problem. Decide whether there is a public status page or just an in-app message.

Why it matters, so you do not lose it in the implementation:
After P3 the pipeline runs on a Hetzner box rather than your laptop, so you no longer notice failures by accident: which is why the alerting in P13 exists and why the runbook has to say what to do when it fires. The app already has honest degradation built in: when the AI is off, it says it is off. Extend that instinct to the other failure modes.

Done when: A runbook covering the five named failures, with the alert that triggers each one.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P12/T218-incident-runbook.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 3 · session 10 · T246 (fable)

~~~~text
Carta. Wave 3, session 10 of 10: T246 DECIDE mobile strategy.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T246    branch p15-mobile-decision
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T246 -Branch p15-mobile-decision
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T246. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P15/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5210. A throwaway Postgres, if you need one, on 55450.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Recommendation; the owner decides.

THE TASK

# T246 · DECIDE the mobile strategy: this is the gate
(mind-map number T220; use T246 everywhere: branch, report, register)

Carta. Task T246: DECIDE the mobile strategy: this is the gate
Work only on this task. Do not start the next one.

Read first, before writing anything: Legal.md app store and play store sections; CARTA_UNIT_ECONOMICS.md §3.4.
Then read the files in this repository that it refers to.

Do this:
There is no Capacitor, no React Native and no Expo in package.json. Carta is a PWA. Everything in the store branches is theory until you decide to wrap it. Decide the mobile strategy FIRST; do not do store work before that decision.

Why it matters, so you do not lose it in the implementation:
The economics matter to the decision: an Apple cut of 15% under the Small Business Program costs €0.48 per Trip Pass, MORE than the entire typical AI cost of that pass, and 30% costs €1.35. If you wrap, keep purchase on the web wherever the DMA permits and treat IAP as a conversion tax rather than a default.

Done when: A written decision with the reasoning and the economics attached.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P15/T246-mobile-strategy-decision.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

## Wave 4 prompts

### Wave 4 · session 1 · T273 (opus)

~~~~text
Carta. Wave 4, session 1 of 10: T273 (row T272-a): remove the frozen flight estimates from every screen.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T273    branch p3-no-flight-estimates
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T273-app    branch p3-no-flight-estimates
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T273 -Branch p3-no-flight-estimates -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T273. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P3/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5201. A throwaway Postgres, if you need one, on 55441.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Owner decision 2026-10-02: Carta does not price flights. A flight is in a total only when the traveller typed in their own fare; keep that path working. Display and cost engine only: `runtime_pricing.js`, `trip_planner_pricing.js`, `tripCostOptimizer.js`, `useTripPlanner.js`, `TripPlannerTab.jsx`, `TripItinerary.jsx`, the city-day card in `DestinationsTab.jsx`, `FareProvenance.jsx`, the receipt, i18n (six locales). GUARD: do not touch the pipeline, the `fares/` wire files, `dataHost.js` or `appData.js` loading, or `scripts/r2/` (stage 5 pushes `fares/`, stage 7.8 compares them exactly); stop reading or showing them, do not delete them. Update the flight-cost section of `docs/SCHEMA.md` (T058-c) and PRODUCT.md is already updated. Rewrite `verify_flight_est_ui.mjs` (T266) to assert no estimated flight is shown and a typed fare still counts. carta-design wins; check Explore, the planner and the city-day card at 380px and desktop.

THE TASK

# T273 · remove the frozen flight estimates from every screen
(register row T272-a, raised by T272; no mind-map prompt exists for it)

WHAT  Read row T272-a in Execution/_OPEN.md and the report of the task that raised it
(Execution/P*/T272-*.md) in full, then do what the row asks, within the scope in the notes
above. Mark T272-a in Execution/_OPEN.md as Status "closed by T273" (never delete rows).

DONE WHEN  Row T272-a is closed, or left open with a written reason; the tests the source
report names pass; every screen you touched was checked in the browser at 380px and
desktop width.

REPORT  Execution/P3/T273-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 4 · session 2 · T274 (opus)

~~~~text
Carta. Wave 4, session 2 of 10: T274 (row T083-a): migration 046 fixes the co-planner invite in 020.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T274    branch p4-coplanner-invite-fix
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T274-app    branch p4-coplanner-invite-fix
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T274 -Branch p4-coplanner-invite-fix -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T274. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P4/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: 046. It needs a self-check raise notice like 032-043, and the report says where it goes in the owner's paste order.
7. Ports: Vite dev/preview on 5202. A throwaway Postgres, if you need one, on 55442.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Migrations live in the ROOT repo: `supabase/migrations/046_*.sql`, with a self-check raise notice. Migration 020's invite rule calls `are_friends`, which 011 revoked from signed-in users, so every invite is refused once 020 is live; fix it with a security definer wrapper or a guarded grant, the least privilege that works. GUARD: 046 must not redefine anything 044 or 045 replaces, and its header must say "paste right after 020" (019 and 020 are not on any `_OPEN-MASTER` paste list yet; raise an owner row to add 019, 020 and 046 there). Update `continent-app/scripts/admin/test_rls_policies.mjs` so its known T083-a failure becomes a pass, and run it and `test_admin_rpc_security.mjs` on a throwaway PostgreSQL 18 with every migration applied.

THE TASK

# T274 · migration 046 fixes the co-planner invite in 020
(register row T083-a, raised by T083; no mind-map prompt exists for it)

WHAT  Read row T083-a in Execution/_OPEN.md and the report of the task that raised it
(Execution/P*/T083-*.md) in full, then do what the row asks, within the scope in the notes
above. Mark T083-a in Execution/_OPEN.md as Status "closed by T274" (never delete rows).

DONE WHEN  Row T083-a is closed, or left open with a written reason; the tests the source
report names pass; every screen you touched was checked in the browser at 380px and
desktop width.

REPORT  Execution/P4/T274-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 4 · session 3 · T088 (sonnet)

~~~~text
Carta. Wave 4, session 3 of 10: T088 A3: difficulty as a five-segment meter, the note behind the dot.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T088    branch p5-a3-difficulty-meter
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T088-app    branch p5-a3-difficulty-meter
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T088 -Branch p5-a3-difficulty-meter -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T088. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P5/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5203. A throwaway Postgres, if you need one, on 55443.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Journey lane. `src/browse/JourneyPage.jsx` (it has no flight code, so no overlap with session 1) and its CSS and i18n; follow the `MonthStrip.jsx` pattern from T087 and DESIGN.md tokens; if carta-design has no rule for a meter, say so in the report. Any wire build goes to a scratch folder with `build_wire.py --out`; never write `continent-app/public/journeys`.

THE TASK

# T088 · A3 · Difficulty as a five-segment meter, note behind the dot
(mind-map number T084; use T088 everywhere: branch, report, register)

Carta. Task T088: A3 · Difficulty as a five-segment meter, note behind the dot
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-trips-enhancement-spec.md A3, H1.
Then read the files in this repository that it refers to.

Do this:
Show 'Active 3/5' as a five-segment mono meter and put difficultyNote behind the info icon. Same treatment for fGateway, which currently prints four airports and four transfer times in one unbroken line.

Why it matters, so you do not lose it in the implementation:
A 40-word justification printed inline is a paragraph pretending to be a data point.

Done when: Meter renders, note is behind the dot, fGateway is structured.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P5/T088-a3-difficulty-meter.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 4 · session 4 · T203 (fable)

~~~~text
Carta. Wave 4, session 4 of 10: T203: decide the audience order.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T203    branch p12-audience-order
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T203 -Branch p12-audience-order
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T203. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P12/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5204. A throwaway Postgres, if you need one, on 55444.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Decision doc with a recommendation pending the owner (owner register row). Read `Execution/P12/T201-positioning.md`, `T202-competitive-positioning.md` and PRODUCT.md first.

THE TASK

# T203 · Decide the audience order
(mind-map number M03; use T203 everywhere: branch, report, register)

Carta. Task T203: Decide the audience order
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-destinations-enhancement-spec.md Part 0; carta-trips-enhancement-spec.md F4.
Then read the files in this repository that it refers to.

Do this:
TO DO: NOT YET RESEARCHED. Rank the audiences the catalogue actually serves and pick the first one: budget city-break travellers, hikers and hut-to-hut walkers, cyclists and bikepackers, trail runners, families looking for beaches, or car-free travellers. Decide which one the launch speaks to, and say why the others wait.

Why it matters, so you do not lose it in the implementation:
The catalogue is strongest where the open data is strongest: 17,619 trails, 43,400 ingested routes, EuroVelo, the EEA bathing waters: so the outdoor audiences are where the product is already deepest. The outdoor communities are also the ones where a free GPX buys credibility that no advertising can. A launch aimed at everyone lands nowhere.

Done when: One primary audience chosen in writing, with the reasoning and the sequence for the others.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P12/T203-audience-order.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 4 · session 5 · T206 (fable)

~~~~text
Carta. Wave 4, session 5 of 10: T206: community credibility, the outdoor route.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T206    branch p12-community-credibility
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T206 -Branch p12-community-credibility
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T206. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P12/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5205. A throwaway Postgres, if you need one, on 55445.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Doc. Read T201, T202 and `Execution/P12/T205-programmatic-seo.md`. No invented figures.

THE TASK

# T206 · Community credibility: the outdoor route
(mind-map number M06; use T206 everywhere: branch, report, register)

Carta. Task T206: Community credibility: the outdoor route
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-trips-enhancement-spec.md F4; carta-destinations-enhancement-spec.md 2.8.
Then read the files in this repository that it refers to.

Do this:
TO DO: NOT YET RESEARCHED. Research where the hiking, bikepacking and trail running communities actually gather in Europe: forums, subreddits, Facebook groups, Discord servers, national club sites: and what the norms are for a product appearing there. Write the plan for showing up usefully rather than promotionally, and identify which communities would consider the free GPX and the open licence choice genuinely notable.

Why it matters, so you do not lose it in the implementation:
The loudest complaint in the Garmin and Wahoo community is platforms that paywall GPX exports, and Carta gives it away free on every route. Offering uploaders a CC BY or CC BY-SA licence choice on top of the platform licence is something neither AllTrails nor Komoot does. Those are the two things this audience would actually repeat to each other, and they cost nothing.

Done when: A list of communities with norms, and two or three genuinely useful things to bring to each.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P12/T206-community-credibility.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 4 · session 6 · T207 (sonnet)

~~~~text
Carta. Wave 4, session 6 of 10: T207: launch channels and the launch day plan.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T207    branch p12-launch-channels
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T207 -Branch p12-launch-channels
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T207. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P12/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5206. A throwaway Postgres, if you need one, on 55446.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Doc. Test every channel against the €0.17 per visitor constraint in `docs/GTM-ACQUISITION-CONSTRAINT.md` (row T204-b); cite every figure.

THE TASK

# T207 · Launch channels and the launch day plan
(mind-map number M07; use T207 everywhere: branch, report, register)

Carta. Task T207: Launch channels and the launch day plan
Work only on this task. Do not start the next one.

Read first, before writing anything: docs/tos/data_licenses.md; 1.CARTA.md.
Then read the files in this repository that it refers to.

Do this:
TO DO: NOT YET RESEARCHED. Research and decide the launch surfaces: Product Hunt, Hacker News Show HN, relevant subreddits, European travel and outdoor newsletters, maps and open-data communities: what each one rewards, what it punishes, and what the submission actually needs to look like. Write the launch-day runbook: order of posts, who is watching which thread, what gets answered, and what the rollback is if the site falls over.

Why it matters, so you do not lose it in the implementation:
Open-data and maps communities are a natural fit that most travel products cannot use: the pipeline ingests forty open sources and credits all of them, which is a story those audiences care about. Product Hunt and HN reward a specific artefact rather than a pitch, so decide what the artefact is before the date.

Done when: A launch runbook with channels, artefacts, dates and named owners for each thread.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P12/T207-launch-channels.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 4 · session 7 · T208 (haiku)

~~~~text
Carta. Wave 4, session 7 of 10: T208: press, partnerships and the open-data angle.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T208    branch p12-press-partnerships
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T208 -Branch p12-press-partnerships
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T208. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P12/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5207. A throwaway Postgres, if you need one, on 55447.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Doc. Every number must be cited to a named file next to it; do not invent figures (a haiku doc task did in wave 3 and had to be redone). Partnerships in the mind map's L1 to L6 long-lead tracks are the starting list.

THE TASK

# T208 · Press, partnerships and the open-data angle
(mind-map number M08; use T208 everywhere: branch, report, register)

Carta. Task T208: Press, partnerships and the open-data angle
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-destinations-enhancement-spec.md 11.8.
Then read the files in this repository that it refers to.

Do this:
TO DO: NOT YET RESEARCHED. Research which European travel, outdoor and open-data publications cover products like this, and whether the partnership conversations already running (Culture Routes Society, Tasuleasa Social, Via Dinarica, EuroVelo) can carry a mutual announcement.

Why it matters, so you do not lose it in the implementation:
The NGO partnerships from the long-lead track are an announcement surface as well as a data source: an NGO that gets a credited page for its trail has a reason to share it, and that audience is exactly the one M03 is likely to pick.

Done when: A short list of outlets and a decision on whether to pursue press at all before there is traction.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P12/T208-press-and-partnerships.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 4 · session 8 · T214 (fable)

~~~~text
Carta. Wave 4, session 8 of 10: T214: decide the analytics stack.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T214    branch p12-analytics-decision
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T214 -Branch p12-analytics-decision
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T214. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P12/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5208. A throwaway Postgres, if you need one, on 55448.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Decision doc, recommendation pending the owner (owner register row). Today: no cookie banner, RPC-based telemetry (T071 to T073), paywall funnel events (T034, T265). Weigh what each option costs legally under GDPR and ePrivacy.

THE TASK

# T214 · Decide the analytics stack, knowing what it costs you legally
(mind-map number M14; use T214 everywhere: branch, report, register)

Carta. Task T214: Decide the analytics stack, knowing what it costs you legally
Work only on this task. Do not start the next one.

Read first, before writing anything: Legal.md cookie policy section; Carta BackEnd.md Phase 3.
Then read the files in this repository that it refers to.

Do this:
TO DO: NOT YET RESEARCHED. Decide whether to add analytics, and which. Then implement consent if the answer is yes.

Why it matters, so you do not lose it in the implementation:
This decision has a direct legal consequence that is easy to miss: there are currently NO analytics libraries in the codebase, and Supabase auth and Stripe set only strictly-necessary cookies, which are exempt from consent under ePrivacy Art 5(3). So Carta genuinely does not need a cookie banner today. The moment you add Plausible, Sentry or anything similar, you do. Decide knowing that the banner is the price, and prefer a cookieless option if one does the job.

Done when: A decision in writing, and a consent banner shipped if and only if the decision requires one.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P12/T214-analytics-decision.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 4 · session 9 · T215 (sonnet)

~~~~text
Carta. Wave 4, session 9 of 10: T215: define the launch metrics and where each is read.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T215    branch p12-launch-metrics
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T215 -Branch p12-launch-metrics
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T215. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P12/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5209. A throwaway Postgres, if you need one, on 55449.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Doc. Map every metric to an existing admin card or RPC (T042 AI usage, T043 margin, T072 pipeline health, T270 cards) or name the gap as a register row.

THE TASK

# T215 · Define the launch metrics and where each one is read
(mind-map number M15; use T215 everywhere: branch, report, register)

Carta. Task T215: Define the launch metrics and where each one is read
Work only on this task. Do not start the next one.

Read first, before writing anything: CARTA_UNIT_ECONOMICS.md §5; admin_paywall_funnel; admin_ai_usage.
Then read the files in this repository that it refers to.

Do this:
TO DO: NOT YET RESEARCHED. Name the numbers that matter in week one and say where each is read from: visitors, priced-trip completions, account creations, paywall shown / dismissed / converted per reason code, purchases by tier, AI units consumed, cache hit rate, affiliate clicks, and the error rate.

Why it matters, so you do not lose it in the implementation:
Most of the instruments already exist after P2 and P4: the paywall funnel RPC, the AI usage rollup, the margin dashboard. What is missing is the decision about which numbers you will actually look at, and a single place to look at them. Everything in the financial model scales off the purchase rate, so that is the one number that cannot be missing.

Done when: One dashboard or one page listing every launch metric and its source.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P12/T215-launch-metrics.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 4 · session 10 · T216 (sonnet)

~~~~text
Carta. Wave 4, session 10 of 10: T216: a support inbox and a response commitment.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T216    branch p12-support-inbox
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T216 -Branch p12-support-inbox
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T216. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P12/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5210. A throwaway Postgres, if you need one, on 55450.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Doc. Setting up the mailbox itself is an owner register row. Read `docs/REFUND_SOP.md` and `docs/INCIDENT_RUNBOOK.md` (T217, T218).

THE TASK

# T216 · A support inbox and a response commitment
(mind-map number M16; use T216 everywhere: branch, report, register)

Carta. Task T216: A support inbox and a response commitment
Work only on this task. Do not start the next one.

Read first, before writing anything: Legal.md Imprint and ToS requirements; 1.CARTA.md provenance chain.
Then read the files in this repository that it refers to.

Do this:
TO DO: NOT YET RESEARCHED. Set up the support address that the Imprint and the Terms both have to name, decide the response time you are willing to commit to, and write the three or four canned answers you will need most: refund requests, a price that turned out wrong, account deletion, and a data export request.

Why it matters, so you do not lose it in the implementation:
The Imprint legally requires a direct contact email and the ToS has to say how refunds work, so this is not optional infrastructure: it is named in two mandatory documents. And the first support email about a wrong price is the one that tests whether the provenance chain actually helps: with the source and the observed date on every figure, you can answer it honestly in a sentence.

Done when: An inbox that is monitored, a stated response time, and canned answers written.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P12/T216-support-inbox.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

## Wave 5 prompts

### Wave 5 · session 1 · T276 (sonnet)

~~~~text
Carta. Wave 5, session 1 of 10: T276 (row T214-b): remove the Travelpayouts Drive script and its CSP hosts.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T276    branch p1-remove-travelpayouts
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T276-app    branch p1-remove-travelpayouts
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T276 -Branch p1-remove-travelpayouts -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T276. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P1/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5201. A throwaway Postgres, if you need one, on 55441.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Owner decision 2026-10-02 (T275); T214-b and T056-a are already closed as decisions, so record the execution in your report. Files: `continent-app/index.html` (the emrldtp.com snippet), `continent-app/vercel.json` and `continent-app/public/_headers` (only the CSP hosts and any script hash that exist for Travelpayouts/emrldtp/sentry.avs.io). EXCEPTION to rule 4: you may edit exactly those two rollout files, and only to delete Travelpayouts entries; change nothing else in them, keep every other host, and do not add the data host (that is the owner's stage 5.3 step). Check with grep that no emrldtp, travelpayouts or avs.io reference is left anywhere in src, index.html or the two config files, run `npm run build` (its CSP check must pass), delete dist/ after, and load the app at 380px and desktop with no console CSP error.

THE TASK

# T276 · remove the Travelpayouts Drive script and its CSP hosts
(register row T214-b, raised by T214; no mind-map prompt exists for it)

WHAT  Read row T214-b in Execution/_OPEN.md and the report of the task that raised it
(Execution/P*/T214-*.md) in full, then do what the row asks, within the scope in the notes
above. Mark T214-b in Execution/_OPEN.md as Status "closed by T276" (never delete rows).

DONE WHEN  Row T214-b is closed, or left open with a written reason; the tests the source
report names pass; every screen you touched was checked in the browser at 380px and
desktop width.

REPORT  Execution/P1/T276-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 5 · session 2 · T176 (sonnet)

~~~~text
Carta. Wave 5, session 2 of 10: T176: free GPX on every route, never paywalled.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T176    branch p10-free-trail-gpx
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T176-app    branch p10-free-trail-gpx
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T176 -Branch p10-free-trail-gpx -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T176. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P10/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5202. A throwaway Postgres, if you need one, on 55442.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Owner decision 2026-10-02 (T275): remove the pass gate on the trail GPX and KML (`TrailPage.jsx` calls `paywall.require('export')`); the cycling GPX is already free; the PDF export keeps its gate. Update the pass copy that promises "map files come with a pass" (PassModal or i18n, six locales). Same page, so also fold in T108-a (TrailPage subtitle through `trailPlace`) and T108-b (pass the trip record to `trailReasons`). Closes T203-b, T108-a, T108-b. Journeys GPX waits for the T177-b track wire (data lane). Parse all six i18n files after editing.

THE TASK

# T176 · F4 · Free, frictionless GPX on every route: never paywalled
(mind-map number T180; use T176 everywhere: branch, report, register)

Carta. Task T176: F4 · Free, frictionless GPX on every route: never paywalled
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-trips-enhancement-spec.md F4, L7; Legal.md ODbL note; CARTA_UNIT_ECONOMICS.md §4.
Then read the files in this repository that it refers to.

Do this:
Runners, hikers and bikepackers navigate on Garmin and Wahoo hardware, not on a phone screen, and the loudest complaint in that community is platforms that paywall GPX exports. typeSpecific.gpxReady already exists as a field: populate it and wire the button.

Why it matters, so you do not lose it in the implementation:
A free GPX buys more credibility with serious outdoor users than any amount of design polish, and it costs almost nothing to ship. The unit economics agrees: this is on the 'where not to economise' list. Note the ODbL section 12 produced-work analysis already applied in CyclePage.jsx:47 is the right reasoning and is worth one focused re-read before launch.

Done when: Every route with geometry offers a GPX download, outside the paywall.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P10/T176-free-gpx.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 5 · session 3 · T092 (haiku)

~~~~text
Carta. Wave 5, session 3 of 10: T092 J3: give the week-at-a-glance table a fixed row set.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T092    branch p5-j3-glance-table
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T092-app    branch p5-j3-glance-table
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T092 -Branch p5-j3-glance-table -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T092. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P5/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5203. A throwaway Postgres, if you need one, on 55443.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Journey lane. `src/browse/JourneyPage.jsx` glance list only (T088 just added the gateway rows and FactMeter there; read `Execution/P5/T088-a3-difficulty-meter.md` first and keep its work). Any wire build goes to a scratch folder with `build_wire.py --out`. Parse all six i18n files after editing.

THE TASK

# T092 · J3 · Give the week-at-a-glance table a fixed row set
(mind-map number T088; use T092 everywhere: branch, report, register)

Carta. Task T092: J3 · Give the week-at-a-glance table a fixed row set
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-trips-enhancement-spec.md J3.
Then read the files in this repository that it refers to.

Do this:
The glance table has a different number of rows on almost every trip. Fix the row set and show an honest empty state per row rather than omitting the row.

Why it matters, so you do not lose it in the implementation:
A table whose shape changes per page cannot be scanned or compared, which is the only reason to have a table.

Done when: Every trip's glance table has the same rows.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P5/T092-j3-glance-table.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 5 · session 4 · T277 (sonnet)

~~~~text
Carta. Wave 5, session 4 of 10: T277 (row T273-a): PRODUCT.md and ESTIMATION.md catch up with the owner decisions.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T277    branch p11-product-md-decisions
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T277 -Branch p11-product-md-decisions
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T277. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P11/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5204. A throwaway Postgres, if you need one, on 55444.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Docs only. PRODUCT.md: drop "are being removed" (T273 removed them), add the audience order (T203-c: hikers lead) and lift the positioning sentence from `Execution/P12/T201-positioning.md` (T201-d). `docs/ESTIMATION.md` near line 188: point at the rewritten flight-cost section of `docs/SCHEMA.md`. Closes T273-a, T203-c, T201-d.

THE TASK

# T277 · PRODUCT.md and ESTIMATION.md catch up with the owner decisions
(register row T273-a, raised by T273; no mind-map prompt exists for it)

WHAT  Read row T273-a in Execution/_OPEN.md and the report of the task that raised it
(Execution/P*/T273-*.md) in full, then do what the row asks, within the scope in the notes
above. Mark T273-a in Execution/_OPEN.md as Status "closed by T277" (never delete rows).

DONE WHEN  Row T273-a is closed, or left open with a written reason; the tests the source
report names pass; every screen you touched was checked in the browser at 380px and
desktop width.

REPORT  Execution/P11/T277-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 5 · session 5 · T278 (opus)

~~~~text
Carta. Wave 5, session 5 of 10: T278 (row T273-d): typed fares price the airport transfer; drop the frozen carrier text.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T278    branch p3-typed-fare-transfers
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T278-app    branch p3-typed-fare-transfers
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T278 -Branch p3-typed-fare-transfers -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T278. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P3/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5205. A throwaway Postgres, if you need one, on 55445.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Two rows, one area: T273-d (a typed fare prices no airport transfer because `anchorLegs`/`flightTransfer` only run for a routed flight; and "Add your fare" has no way back) and T273-c (the planner flight lines, the ICS export and the share text still give carrier and times from the frozen snapshots, one names "Aviasales"). Files: `trip_planner_pricing.js`, `useTripPlanner.js`, `TripItinerary.jsx`, `tripExport.js`, the planner flight rows. GUARD: no change to `fares/`, `dataHost.js`, `appData.js`, the pipeline or `scripts/r2`. Read `Execution/P3/T273-no-flight-estimates.md` first. Parse all six i18n files after editing.

THE TASK

# T278 · typed fares price the airport transfer; drop the frozen carrier text
(register row T273-d, raised by T273; no mind-map prompt exists for it)

WHAT  Read row T273-d in Execution/_OPEN.md and the report of the task that raised it
(Execution/P*/T273-*.md) in full, then do what the row asks, within the scope in the notes
above. Mark T273-d in Execution/_OPEN.md as Status "closed by T278" (never delete rows).

DONE WHEN  Row T273-d is closed, or left open with a written reason; the tests the source
report names pass; every screen you touched was checked in the browser at 380px and
desktop width.

REPORT  Execution/P3/T278-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 5 · session 6 · T279 (sonnet)

~~~~text
Carta. Wave 5, session 6 of 10: T279 (row T266-b): rewrite verify_fare_provenance for no flight prices.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T279    branch p4-fare-provenance-harness
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T279-app    branch p4-fare-provenance-harness
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T279 -Branch p4-fare-provenance-harness -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T279. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P4/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5206. A throwaway Postgres, if you need one, on 55446.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Scripts only: `continent-app/scripts/verify_fare_provenance.mjs` predates T256 and T273; rewrite it to assert that no Carta flight price, tilde or est. tag appears and a typed fare shows as the traveller's own. Closes T266-b and T267-c. Do not touch src/.

THE TASK

# T279 · rewrite verify_fare_provenance for no flight prices
(register row T266-b, raised by T266; no mind-map prompt exists for it)

WHAT  Read row T266-b in Execution/_OPEN.md and the report of the task that raised it
(Execution/P*/T266-*.md) in full, then do what the row asks, within the scope in the notes
above. Mark T266-b in Execution/_OPEN.md as Status "closed by T279" (never delete rows).

DONE WHEN  Row T266-b is closed, or left open with a written reason; the tests the source
report names pass; every screen you touched was checked in the browser at 380px and
desktop width.

REPORT  Execution/P4/T279-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 5 · session 7 · T280 (opus)

~~~~text
Carta. Wave 5, session 7 of 10: T280 (row T269-f): the trails export applies the credit gate.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T280    branch p3-trails-credit-gate
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T280 -Branch p3-trails-credit-gate
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T280. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P3/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5207. A throwaway Postgres, if you need one, on 55447.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Code only, no export run: the trails wire publishes photos that owe a credit and have no author because the trails export skips the credit gate that beaches, lakes and mountains apply (`pipeline/photos/credit.py`, `owes_credit`). Wire it into the trails export in `pipeline/trails/`, with a test, and count the effect read-only against the published trails wire in the main checkout. Do not run the export or write data/ or continent-app/public.

THE TASK

# T280 · the trails export applies the credit gate
(register row T269-f, raised by T269; no mind-map prompt exists for it)

WHAT  Read row T269-f in Execution/_OPEN.md and the report of the task that raised it
(Execution/P*/T269-*.md) in full, then do what the row asks, within the scope in the notes
above. Mark T269-f in Execution/_OPEN.md as Status "closed by T280" (never delete rows).

DONE WHEN  Row T269-f is closed, or left open with a written reason; the tests the source
report names pass; every screen you touched was checked in the browser at 380px and
desktop width.

REPORT  Execution/P3/T280-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 5 · session 8 · T219 (fable)

~~~~text
Carta. Wave 5, session 8 of 10: T219: decide the feedback loop from users into the backlog.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T219    branch p12-feedback-loop
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T219 -Branch p12-feedback-loop
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T219. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P12/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5208. A throwaway Postgres, if you need one, on 55448.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Decision doc, recommendation pending the owner (owner register row). Read `docs/SUPPORT.md` (T216) and the existing feedback inbox in the admin page (T270 report).

THE TASK

# T219 · Decide the feedback loop from users into the backlog
(mind-map number M19; use T219 everywhere: branch, report, register)

Carta. Task T219: Decide the feedback loop from users into the backlog
Work only on this task. Do not start the next one.

Read first, before writing anything: Carta BackEnd.md Phase 4; admin_set_feedback_status.
Then read the files in this repository that it refers to.

Do this:
TO DO: NOT YET RESEARCHED. Decide how a user reports a wrong price, a bad photo or a missing trail, and where that lands. The admin panel already has a feedback status field and a content-override console.

Why it matters, so you do not lose it in the implementation:
A product whose asset is trust in its numbers needs the cheapest possible path from 'this is wrong' to 'this is fixed', and the override console with its review lifecycle is already that path: it just needs a front door. The reason codes from the coverage contract also invite exactly this kind of report.

Done when: A front door exists and lands in a queue somebody reads.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P12/T219-user-feedback-loop.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 5 · session 9 · T220 (sonnet)

~~~~text
Carta. Wave 5, session 9 of 10: T220: write the launch runway calendar.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T220    branch p12-launch-runway
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T220 -Branch p12-launch-runway
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T220. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P12/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5209. A throwaway Postgres, if you need one, on 55449.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Doc. Build on `Execution/P12/T207-launch-channels.md` (its day offsets), T208 and T216. The launch date is not set (T207-a), so write it as offsets from D. Cite every figure.

THE TASK

# T220 · Write the launch runway calendar
(mind-map number M20; use T220 everywhere: branch, report, register)

Carta. Task T220: Write the launch runway calendar
Work only on this task. Do not start the next one.

Read first, before writing anything: CARTA_UNIT_ECONOMICS.md §5.
Then read the files in this repository that it refers to.

Do this:
TO DO: NOT YET RESEARCHED. Put dates on the last six weeks: when the landing page goes live, when pricing copy is final, when the analytics decision is made, when the support inbox opens, when the soft launch happens and to whom, and the launch date itself. Work backwards from the launch date, not forwards from today.

Why it matters, so you do not lose it in the implementation:
A soft launch to a small, friendly group before the public one is what surfaces the things no gate catches: the confusing sentence, the flow that makes no sense to someone who did not build it. It is also the only way to see a real purchase funnel before the numbers matter.

Done when: A dated calendar with a soft-launch group named and a launch date committed.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P12/T220-launch-runway.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 5 · session 10 · T226 (fable)

~~~~text
Carta. Wave 5, session 10 of 10: T226: decide content type and platforms.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T226    branch p12-content-platforms
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T226 -Branch p12-content-platforms
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T226. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P12/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5210. A throwaway Postgres, if you need one, on 55450.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Decision doc, pending the owner. Read T201, T203 (hikers lead), T205 and T206. No invented figures.

THE TASK

# T226 · Decide content type and platforms
(mind-map number M26; use T226 everywhere: branch, report, register)

Carta. Task T226: Decide content type and platforms
Work only on this task. Do not start the next one.

Read first, before writing anything: Original mind map, Marketing; CARTA_UNIT_ECONOMICS.md §5.
Then read the files in this repository that it refers to.

Do this:
TO DO: NOT YET RESEARCHED. From your original mind map. Decide what content Carta produces beyond the catalogue, and on which platforms, if any.

Why it matters, so you do not lose it in the implementation:
Your original map has Content Type and Content Platforms as open nodes. Test any answer against M04: if a platform needs paid distribution to work, the economics rules it out. If it compounds organically or builds community credibility, it is worth considering.

Done when: A decision on content type and platforms, or an explicit decision to do none.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P12/T226-content-strategy.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

## Wave 6 prompts

### Wave 6 · session 1 · T086 (haiku) + T094 (sonnet)

Models differ, so run this row as two sessions: T086 on haiku first (do only T086), then T094 on sonnet in the same worktrees, branching p5-j6-j8-presentation-honesty from p5-a4-empty-sections.

~~~~text
Carta. Wave 6, session 1 of 10: T086 then T094: empty sections verified, then bold, coverage honesty and the age of the numbers.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T086    branch p5-a4-empty-sections
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T086-app    branch p5-a4-empty-sections
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T086 -Branch p5-a4-empty-sections -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).
Two tasks, in order: finish T086 on p5-a4-empty-sections with its report and commits. Then, in each
worktree you used, run `git checkout -b p5-j6-j8-presentation-honesty` (it branches from p5-a4-empty-sections) and do T094 with its
own report.

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T086, T094. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P5/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5201. A throwaway Postgres, if you need one, on 55441.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Journey lane. T086 is already guarded in code (`JourneyPage.jsx` renders the pack and what-could-go-wrong blocks only when the array has items): verify across all 253 trips that no section heading renders empty, by a read-only count over the journeys wire in the main checkout, change code only if you find one, and close it with the count. Work only in your worktrees; never write into the main checkout (a haiku session wrote register rows there in wave 5). T094 after it: J6 emphasis normalised in the trip source prose (the files T085 edited), J7 one honest coverage line on the journeys index, J8 a "last checked" month from dataVintage on every trip. Read the T085, T087, T088 and T092 reports first and keep their work. Any wire build goes to a scratch folder with `build_wire.py --out`; never write `continent-app/public/journeys`. carta-design wins; check 380px and desktop. Parse all six i18n files after editing.

THE TASK

# T086 · A4 · Stop rendering two empty sections on 60% of trips
(mind-map number T082; use T086 everywhere: branch, report, register)

Carta. Task T086: A4 · Stop rendering two empty sections on 60% of trips
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-trips-enhancement-spec.md A4, H1.
Then read the files in this repository that it refers to.

Do this:
packingNotes and whatCouldGoWrong are empty arrays in 153 of 253 files, yet packHead and wrongHead are built unconditionally. Either backfill them (T152 in P9) or hide the heading when the array is empty. Do the hide now; the backfill comes later.

Why it matters, so you do not lose it in the implementation:
The page silently drops two of its most useful modules on most trips, and a user who saw them on one trip and not the next reads it as broken. Hiding is ten minutes and stops the damage today.

Done when: No empty section heading renders anywhere.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P5/T086-a4-empty-sections.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.

---- next task ----

# T094 · J6+J7+J8 · Bold, coverage honesty, and the age of the numbers
(mind-map number T090; use T094 everywhere: branch, report, register)

Carta. Task T094: J6+J7+J8 · Bold, coverage honesty, and the age of the numbers
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-trips-enhancement-spec.md J6, J7, J8; carta-destinations-enhancement-spec.md 4.6.
Then read the files in this repository that it refers to.

Do this:
J6: bold emphasis appears in half the catalogue and not the other half - normalise. J7: coverage is lopsided and the index does not admit it - add an honest line. J8: nothing tells the user how old the numbers are - add a 'last checked <month>' from dataVintage.

Why it matters, so you do not lose it in the implementation:
All three are the same move: stop the catalogue looking accidentally inconsistent, and say plainly what it is. Honest coverage is also what the destinations spec makes a hard rule in Part 0.4.

Done when: Consistent emphasis, an honest coverage line on the index, and a last-checked date on every trip.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P5/T094-j6-j7-j8-presentation-honesty.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 6 · session 2 · T281 (sonnet)

~~~~text
Carta. Wave 6, session 2 of 10: T281 (rows W5-a, T276-a, T265-d, T279-a, T266-c, T270-c, T268-g, T267-d, T176-c): harness repairs, round two.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T281    branch p4-harness-repairs-2
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T281-app    branch p4-harness-repairs-2
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T281 -Branch p4-harness-repairs-2 -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T281. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P4/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5202. A throwaway Postgres, if you need one, on 55442.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Scripts only: `continent-app/scripts/`. Start with W5-a: find why `verify_trail_page.mjs` fails "trips still show the sort chips" and "city day cards render [0 cards]" on the merged tree (T273 reworked the city-day cards and `verify_places_tab.mjs` passes); if the cause is in src, do not fix it, write a register row with the evidence. T276-a: replace the three stale CSP copies in `verify_csp.mjs` by reading the real header from `vercel.json` (read-only) and drop emrldtp from the noise regexes. T265-d: `verify_paywall.mjs` honours `CARTA_REPO_ROOT`. T266-c: two clean back-to-back `verify_admin_panel.mjs` runs compared, with the result in the report. T267-d: `npm run ci:smoke` after one build; delete `dist/` right after. T176-c: the signed-out GPX and KML check in the browser, no code. Do not touch src/.

THE TASK

# T281 · harness repairs, round two
(register rows W5-a, T276-a, T265-d, T279-a, T266-c, T270-c, T268-g, T267-d, T176-c; no mind-map prompt exists for it)

WHAT  Read each of these rows in Execution/_OPEN.md: W5-a, T276-a, T265-d, T279-a, T266-c, T270-c, T268-g, T267-d, T176-c. For each, read the report of
the task that raised it (Execution/P*/<raiser>-*.md; W5-a was raised by the wave 5 merge, see
the Wave log in PARALLEL-WAVES-PLAN.md) in full, then do what the row asks, within the scope in
the notes above. Mark each row you resolve in Execution/_OPEN.md as Status "closed by T281"
(never delete rows). If a row needs the owner or a later rollout stage, leave it open and say why.

DONE WHEN  Every listed row is closed, or left open with a written reason; the tests the source
reports name pass; every screen you touched was checked in the browser at 380px and desktop width.

REPORT  Execution/P4/T281-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 6 · session 3 · T282 (sonnet)

~~~~text
Carta. Wave 6, session 3 of 10: T282 (rows T192-a, T192-b, T192-c, T197-b, T266-d, T268-e, T278-a): app hygiene.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T282    branch p10-app-hygiene
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T282-app    branch p10-app-hygiene
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T282 -Branch p10-app-hygiene -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T282. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P10/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5203. A throwaway Postgres, if you need one, on 55443.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Files: `src/i18n/index.jsx` (the disable comment with its reason), `eslint.config.js` (exhaustive-deps to error, after T192-a), `browse/CategoryRail.jsx`, `components/PassModal.jsx` and `planner/AiDayPlanModal.jsx` (useFocusTrap plus an Escape handler on the shared escape stack, which listens in the capture phase), the comment in `lib/urlState.js`, `components/admin/ContentSection.jsx` (trails index names the field country, the grid filters on cc), and T278-a: delete `components/BagCheck.jsx` (nothing imports it any more) and the itin.bag* keys in six locales once grep shows nothing else reads them (Carta names no carrier now; git keeps it if the owner wants it back keyed on a typed airline; say so in the report). `npm run lint` must end with 0 errors. Parse all six i18n files after editing. Check the pass modal and the AI day-plan modal by keyboard at 380px and desktop.

THE TASK

# T282 · app hygiene
(register rows T192-a, T192-b, T192-c, T197-b, T266-d, T268-e, T278-a; no mind-map prompt exists for it)

WHAT  Read each of these rows in Execution/_OPEN.md: T192-a, T192-b, T192-c, T197-b, T266-d, T268-e, T278-a. For each, read the report of
the task that raised it (Execution/P*/<raiser>-*.md; W5-a was raised by the wave 5 merge, see
the Wave log in PARALLEL-WAVES-PLAN.md) in full, then do what the row asks, within the scope in
the notes above. Mark each row you resolve in Execution/_OPEN.md as Status "closed by T282"
(never delete rows). If a row needs the owner or a later rollout stage, leave it open and say why.

DONE WHEN  Every listed row is closed, or left open with a written reason; the tests the source
reports name pass; every screen you touched was checked in the browser at 380px and desktop width.

REPORT  Execution/P10/T282-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 6 · session 4 · T283 (opus)

~~~~text
Carta. Wave 6, session 4 of 10: T283 (row T192-d): audit the exhaustive-deps disable comments in the planner.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T283    branch p10-hook-disable-audit
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T283-app    branch p10-hook-disable-audit
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T283 -Branch p10-hook-disable-audit -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T283. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P10/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5204. A throwaway Postgres, if you need one, on 55444.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Scope: `src/planner/` except `AiDayPlanModal.jsx` (session 3 owns it), plus `useTripPlanner`. GuidedTripWizard (10 disables) and DayPlannerTab (10) first, then TripPlannerTab, ReadyTripsStep, DayIdeasStep, ExpenseLedger, AiPlanRoute; include useTripPlanner's per-bump suggestNextStops and cheapestStartDate calls. Each disable either goes, with a correct dependency list, or stays with a one-line reason. Session 3 makes exhaustive-deps an error in the same wave, so leave zero exhaustive-deps warnings in the files you touch. App.jsx, map/, browse/ and the rest are not in scope: leave one register row with the remaining count per file. Count disables before and after. Check the planner screens in the browser (wizard, trip planner, day planner) at 380px and desktop.

THE TASK

# T283 · audit the exhaustive-deps disable comments in the planner
(register row T192-d, raised by T192; no mind-map prompt exists for it)

WHAT  Read row T192-d in Execution/_OPEN.md and the report of the task that raised it
(Execution/P*/T192-*.md) in full, then do what the row asks, within the scope in the notes
above. Mark T192-d in Execution/_OPEN.md as Status "closed by T283" (never delete rows).

DONE WHEN  Row T192-d is closed, or left open with a written reason; the tests the source
report names pass; every screen you touched was checked in the browser at 380px and
desktop width.

REPORT  Execution/P10/T283-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 6 · session 5 · T284 (opus)

~~~~text
Carta. Wave 6, session 5 of 10: T284 (rows T083-b, T219-c, T217-c): migration 047, the three small schema fixes.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T284    branch p4-migration-047
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T284-app    branch p4-migration-047
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T284 -Branch p4-migration-047 -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T284. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P4/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: 047. It needs a self-check raise notice like 032-043, and the report says where it goes in the owner's paste order.
7. Ports: Vite dev/preview on 5205. A throwaway Postgres, if you need one, on 55445.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Migration 047 in the ROOT repo `supabase/migrations/047_*.sql`, with a self-check raise notice and a down block. T083-b: widen the fn and code checks on edge_errors and the two lists in log_edge_error so the ErrorBoundary's ('app', 'client_crash', 'client') call stores a row; decide and record whether client errors share the AI failures card. T219-c: 'data' in the feedback kind check, 'cycle' in the content_overrides layer check. T217-c: an audited `admin_adjust_expiry` RPC that moves entitlements.expires_at without resetting period_start, admin-only, written to the audit log; update the step in `docs/REFUND_SOP.md` that uses the SQL editor. GUARD: 047 must not depend on anything 044 creates and must not redefine any function 044 replaces (044 pastes later, in stage 10); find which migration each table and function you touch comes from and state the paste position (after 045, and after the migrations defining feedback, content_overrides and edge_errors) in the report and in an owner register row for `_OPEN-MASTER`. Extend `continent-app/scripts/admin/test_admin_rpc_security.mjs` and `test_rls_policies.mjs` for the new RPC and run both on a throwaway PostgreSQL 18 with every migration applied in filename order.

THE TASK

# T284 · migration 047, the three small schema fixes
(register rows T083-b, T219-c, T217-c; no mind-map prompt exists for it)

WHAT  Read each of these rows in Execution/_OPEN.md: T083-b, T219-c, T217-c. For each, read the report of
the task that raised it (Execution/P*/<raiser>-*.md; W5-a was raised by the wave 5 merge, see
the Wave log in PARALLEL-WAVES-PLAN.md) in full, then do what the row asks, within the scope in
the notes above. Mark each row you resolve in Execution/_OPEN.md as Status "closed by T284"
(never delete rows). If a row needs the owner or a later rollout stage, leave it open and say why.

DONE WHEN  Every listed row is closed, or left open with a written reason; the tests the source
reports name pass; every screen you touched was checked in the browser at 380px and desktop width.

REPORT  Execution/P4/T284-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 6 · session 6 · T285 (sonnet)

~~~~text
Carta. Wave 6, session 6 of 10: T285 (rows T201-b, T277-a, T111-d, T084-d, T207-g, T078-a): the docs catch up.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T285    branch p11-docs-catchup
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T285 -Branch p11-docs-catchup
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T285. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P11/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5206. A throwaway Postgres, if you need one, on 55446.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Docs only, root repo. T201-b: replace the literal 1,570 destinations in `docs/1.CARTA.md`, `README.md` and PRODUCT.md "Brand voice" with a pointer to app_data meta (read `app_data` meta.n_destinations in the main checkout; do not type a new literal that will rot). T277-a: reword PRODUCT.md "The one rule the numbers follow" for ground costs. T111-d: `docs/REGIONS.md` gets the per-region code field and the contract block of coverage.json. T084-d: `Trips/carta-unified/carta-unified/README.md` carries the T084 validator figures. T207-g: only the doc-claim half (credited sources 24 versus 43 measured); the sitemap half waits for T221/T222, leave it open. T078-a: replace the hand-typed roster in `src/ingestion/README.md` with a pointer to the generated ledger. Every figure you write cites the file it came from; grep it there before committing.

THE TASK

# T285 · the docs catch up
(register rows T201-b, T277-a, T111-d, T084-d, T207-g, T078-a; no mind-map prompt exists for it)

WHAT  Read each of these rows in Execution/_OPEN.md: T201-b, T277-a, T111-d, T084-d, T207-g, T078-a. For each, read the report of
the task that raised it (Execution/P*/<raiser>-*.md; W5-a was raised by the wave 5 merge, see
the Wave log in PARALLEL-WAVES-PLAN.md) in full, then do what the row asks, within the scope in
the notes above. Mark each row you resolve in Execution/_OPEN.md as Status "closed by T285"
(never delete rows). If a row needs the owner or a later rollout stage, leave it open and say why.

DONE WHEN  Every listed row is closed, or left open with a written reason; the tests the source
reports name pass; every screen you touched was checked in the browser at 380px and desktop width.

REPORT  Execution/P11/T285-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 6 · session 7 · T286 (opus)

~~~~text
Carta. Wave 6, session 7 of 10: T286 (rows T108-d, T108-e, T108-f): one climb and one difficulty, from source to screen.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T286    branch p7-trail-climb-consistency
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T286-app    branch p7-trail-climb-consistency
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T286 -Branch p7-trail-climb-consistency -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T286. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P7/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5207. A throwaway Postgres, if you need one, on 55447.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Read the T107 and T108 reports first. App: the card in `DestinationsTab.jsx`, the KML fact line, `AroundHere.jsx` and `destinationPdf.js` use `trailStory.trailClimb().up` (or both numbers) instead of the single stored ascent (+7 m on Korab 9). Pipeline code: `rate.py` picks bigClimb and dayOut from the uphill climb and applies the comfort gate at the source; `export_wire.py` stops shipping validate.py's difficulty beside f.g, or sets it to the grade where a grade exists. The app must read both the current wire and the new one, because the rebuild is a data-lane run the owner starts. Code and tests only; no rebuild, no export run, no trailslab. Count the rows affected read-only against the published trails wire in the main checkout. Parse all six i18n files if you edit one.

THE TASK

# T286 · one climb and one difficulty, from source to screen
(register rows T108-d, T108-e, T108-f; no mind-map prompt exists for it)

WHAT  Read each of these rows in Execution/_OPEN.md: T108-d, T108-e, T108-f. For each, read the report of
the task that raised it (Execution/P*/<raiser>-*.md; W5-a was raised by the wave 5 merge, see
the Wave log in PARALLEL-WAVES-PLAN.md) in full, then do what the row asks, within the scope in
the notes above. Mark each row you resolve in Execution/_OPEN.md as Status "closed by T286"
(never delete rows). If a row needs the owner or a later rollout stage, leave it open and say why.

DONE WHEN  Every listed row is closed, or left open with a written reason; the tests the source
reports name pass; every screen you touched was checked in the browser at 380px and desktop width.

REPORT  Execution/P7/T286-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 6 · session 8 · T287 (sonnet)

~~~~text
Carta. Wave 6, session 8 of 10: T287 (row T087-b): the shared MonthStrip on the beach, lake and mountain pages.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T287    branch p7-layer-month-strip
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T287-app    branch p7-layer-month-strip
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T287 -Branch p7-layer-month-strip -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T287. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P7/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5208. A throwaway Postgres, if you need one, on 55448.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Read `Execution/P5/T087-a2-month-strip.md` and `src/components/MonthStrip.jsx`. Adopt the component on the beach, lake and mountain pages where each layer's wire already carries month data (climate, bathing season, snow); if a layer has none, say so and leave that page as it is with a register row. No pipeline or wire change. carta-design wins; check each page at 380px and desktop. Parse all six i18n files after editing.

THE TASK

# T287 · the shared MonthStrip on the beach, lake and mountain pages
(register row T087-b, raised by T087; no mind-map prompt exists for it)

WHAT  Read row T087-b in Execution/_OPEN.md and the report of the task that raised it
(Execution/P*/T087-*.md) in full, then do what the row asks, within the scope in the notes
above. Mark T087-b in Execution/_OPEN.md as Status "closed by T287" (never delete rows).

DONE WHEN  Row T087-b is closed, or left open with a written reason; the tests the source
report names pass; every screen you touched was checked in the browser at 380px and
desktop width.

REPORT  Execution/P7/T287-<short-slug>.md, following Execution/_TEMPLATE.md.
Write it plainly: short sentences, minimal markdown, before/after measurements where a number
moved, a rollback procedure, and what is still open.
~~~~

### Wave 6 · session 9 · T196 (sonnet)

~~~~text
Carta. Wave 6, session 9 of 10: T196 Generic-pattern detector in CI.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T196    branch p11-design-lint
App worktree (continent-app): C:\Users\Gebruiker\Documents\Portfolio\wt\T196-app    branch p11-design-lint
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T196 -Branch p11-design-lint -App
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T196. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P11/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5209. A throwaway Postgres, if you need one, on 55449.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
New `continent-app/scripts/ci/design-lint.mjs` beside T157's `banned-terms.mjs`, checking the carta-design never-do list and the DESIGN.md token rules. styles.css has 378 hex literals outside :root today (row T195-b), so the detector needs a committed baseline and fails only on new violations. Prove the done condition with a seeded violation in a fixture, not in src. Wire it as a NEW workflow file in the root `.github/workflows/` modelled on `trip-validator.yml`; no edits to existing workflows and not into `npm run ci` (rule 4). Closes nothing in the register; T197-a waits for the first component lift after this.

THE TASK

# T196 · Put a generic-pattern detector in CI
(mind-map number T192; use T196 everywhere: branch, report, register)

Carta. Task T196: Put a generic-pattern detector in CI
Work only on this task. Do not start the next one.

Read first, before writing anything: Frontend Design Tools Research.md, deterministic detection and the refinement loop.
Then read the files in this repository that it refers to.

Do this:
Run a detector in the CI pipeline that flags generic anti-patterns - the specific combinations carta-design bans - so a regression is caught at build time rather than in review.

Why it matters, so you do not lose it in the implementation:
The distinction between a generic AI template and a premium product now relies on the strict, systemic constraints placed on the agent, not on remembering to look.

Done when: The detector runs in CI and fails on a seeded violation.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P11/T196-design-lint-in-ci.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

### Wave 6 · session 10 · T211 (fable)

~~~~text
Carta. Wave 6, session 10 of 10: T211 First-run onboarding and the empty states.
You are one of up to ten Claude sessions running in parallel on this machine.
Read CLAUDE.md (in your root worktree) first, and the carta-design skill before any visual change.

WHERE TO WORK
Root worktree (sparse): C:\Users\Gebruiker\Documents\Portfolio\wt\T211    branch p12-onboarding-empty-states
If the worktree does not exist yet, create it first, from the main checkout:
  cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"; powershell -File Execution/_queue/wave_worktree.ps1 -Task T211 -Branch p12-onboarding-empty-states
Read-only reference: the main checkout "C:\Users\Gebruiker\Documents\Portfolio\Travel App" (additional docs\, Claude outputs\, data\,
cache\, app_data\ and anything the sparse worktree leaves out). Read there; never write, commit
or switch branches there. The app repo's branch is master; the root repo's is main.
Source documents the task names (Legal.md, Architecture, Unit Economics, the 'original mind map'
and so on) are in the main checkout under additional docs\Carta\Plan\ and in
additional docs\Carta\Carta-Master-Plan.xmind (read it with Execution/_queue/xmind_prompt.py).

RULES
1. Commit in your worktree(s), in BOTH repos if you changed both. Run `git show --stat` after
   every commit and check that only in-scope files changed.
2. Your task number is T211. Branch, report and register rows use it.
   Never pick another number.
3. Report in Execution/P12/<TASK>-<slug>.md per Execution/_TEMPLATE.md. Append one
   register row per open item at the bottom of Execution/_OPEN.md (CLAUDE.md has the columns).
4. Never touch: supabase/migrations/001-046 (root repo), continent-app/vercel.json,
   continent-app/public/_headers, the "ci" script in continent-app/package.json, .gitignore,
   continent-app/scripts/r2/, infra/hetzner/, pipeline/archive/, run_pipeline.py,
   Execution/_OPEN-MASTER.md, Execution/_ORDER.md, PARALLEL-WAVES-PLAN.md, or any package
   dependency (node_modules is shared with the main checkout). The only exception is one your
   notes below grant by name ("EXCEPTION to rule 4"), and then only as narrowly as they say.
5. No data writes: do not run run_pipeline.py; do not write app_data/, cache/, data/raw/ or the
   trailslab database (port 5433). Never commit generated continent-app/public/** output; the
   public data folders in your app worktree are links to the main checkout, so treat them as
   read-only.
6. New migration allowed: none. Do not add one.
7. Ports: Vite dev/preview on 5210. A throwaway Postgres, if you need one, on 55450.
   Never use 5432, 5433 or 55434.
8. Never push. Never call the Claude/Anthropic API (runtime and pipeline AI is Gemini only).
   carta-design wins every visual call. No em dashes anywhere. A step that needs the owner
   (a Dashboard, a secret, a SQL paste, a decision) becomes an open register row; carry on.
   If you edit any src/i18n file, parse all six before committing (an unescaped apostrophe in a
   single-quoted French string broke the wave 4 build): for l in en de es fr it nl; do node
   --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done, run in the app worktree.
9. Finish with: branch names, commit hashes in both repos, report path(s), register row ids,
   and anything the orchestrator must know before merging.

NOTES FOR THIS SESSION (these override the task text below where they disagree)
Design doc only, under carta-design; the owner approves before any code. Override of the map text: Carta prices no flights (T272), so the departure airport is no longer the hinge; design the first ninety seconds around what the app prices today (ground costs, the traveller's own typed fare) and the audience order (hikers lead, T203). Read PRODUCT.md, `docs/FIRST_RUN_RESULT.md` (T187, which T099 builds), the reason codes in `continent-app/public/coverage.json` (T111, read-only) and destinations spec 1.6 and 0.4. Inventory every empty state in src today (the before count) and write each one's copy in English. Write `docs/ONBOARDING_AND_EMPTY_STATES.md` and an owner register row for the approval.

THE TASK

# T211 · First-run onboarding and the empty states
(mind-map number M11; use T211 everywhere: branch, report, register)

Carta. Task T211: First-run onboarding and the empty states
Work only on this task. Do not start the next one.

Read first, before writing anything: carta-trips-enhancement-spec.md I1; carta-destinations-enhancement-spec.md 1.6, 0.4.
Then read the files in this repository that it refers to.

Do this:
TO DO: NOT YET RESEARCHED. Design the first ninety seconds: what a first-time visitor sees, how the departure airport gets asked for once, what happens before any dates are chosen, and what every empty state says. Includes the country empty states for microstates and the reason-code states from the coverage contract.

Why it matters, so you do not lose it in the implementation:
The departure airport is the hinge of the whole product after P6: ask it well and every number on every page becomes personal. And the empty states are not filler: 'name the space, give the action, offer the three nearest alternatives across the border' is the spec's own instruction and it is what turns a gap into a product that knows itself.

Done when: A first-run flow that reaches a priced result without a dead end, and no empty state that just says nothing found.

Rules: stay inside this task's scope and do not touch files it does not name. Anything visual follows the carta-design skill, which wins over every other design source. Never re-type a file's contents from tool output; edit in place. Measure before and after where the task implies a number.

Then write the report to Execution/P12/T211-onboarding-and-empty-states.md, following Execution/_TEMPLATE.md.
  Write it clean and plain. Ordinary prose, short sentences, minimal markdown: a
  heading only where a reader needs to jump, a table only where the data is really
  tabular. No bullet-point walls, no bold scattered mid-sentence, no emoji, no
  restating the task back to me. Explain how the thing works and why it was built
  that way, as if briefing the person who has to maintain it in six months. Include
  the before and after measurements, and say plainly what is still open.
~~~~

<!-- PROMPTS:END -->

---

# Part D. What you still need to do

Written 2026-10-02 after waves 1 to 3 and your decisions (T272). Row ids in
brackets point into `Execution/_OPEN.md`, where the details are. Your rollout
stages in `_OPEN-MASTER.md` still apply. The items below are what the waves
added to them or changed in them.

## D1. Now, before anything else

1. **Push, when you are ready.** Root `main` is about 100 commits ahead of
   GitHub and continent-app `master` is ahead too. Pushing `main` deploys to
   Vercel production, so push when you can watch the deploy. On that first
   push, check two CI jobs:
   - `rls-policies` and `admin-rpc-security` must go green (T083-c).
   - `trip-validator` is red by design until the journeys wire is rebuilt
     (see D3). Keep it informational, not a required check, until then
     (T084-c).
2. **Free disk space on C:.** It hit 0 bytes during the waves (T268-f,
   T269-h, T252-d). The 4.7 GB Visual Studio installer cache in
   `%TEMP%\objaq3r4` is the easy win. Aim for 20 GB free before any next wave.
3. **Approve or edit the two privacy-policy paragraphs** T270 added: Gemini
   processing outside the EEA, and the AI and parse failure records (T270-a).

## D2. Changes to your `_OPEN-MASTER.md` paste list

1. **Stage 2.2:** paste `045_admin_followups.sql` as row 15, after 042, and
   look for "admin followups self-check passed" (T268-a).
2. **Stage 2.5, the re-paste table:** re-pasting 014, 015, 016, 017, 018,
   019, 024, 032, 033, 034 or 036 means pasting 045 again. Re-pasting 043
   after 045 fails (T268-b).
3. **Migration 020 (co-planners):** once it is live, every invite is refused,
   because it calls `are_friends`, which 011 took away from signed-in users.
   A fix migration is needed before or with 020 (T083-a, a next task).
4. **Stage 10.2:** paste `044_payments_quota.sql` right after 031, before
   deploying checkout and stripe-webhook. If its notice says pg_cron is off,
   enable pg_cron (T265-a).
5. The new admin cards stay hidden until 026, 042 and 045 are pasted
   (T270-b).

## D3. Data runs only you start

1. **Rebuild the journeys wire** on the main checkout with
   `pipeline/journeys/build_wire.py`, keeping the image cache, and commit it.
   This makes the "€x to €y" ranges and the month strip live, and turns the
   trip-validator check green on comma ranges (T085-a, T087-a).
2. **Trail titles and bug fixes** go live on the next trailslab run of
   `attributes.py`, then the export (T107-a; the wiring rows are T108-a to
   T108-g).
3. **Famous-trail registry:** a full `--all --refresh` rebuild on the main
   checkout (T113-a).
4. **Coverage files:** run `python pipeline/regions/coverage.py` on the main
   checkout to write the new reason codes into `coverage.json` and
   `reports/coverage.html` (T111).

## D4. Accounts and setup

1. **Search Console, Bing Webmaster Tools and an IndexNow key** for the live
   domain (T205-f).
2. **A Healthchecks.io check**, with its URL set as `CARTA_HEARTBEAT_URL` on
   the box at stage 7.3 (T218-b).
3. **Status-page subscriptions** for Supabase, Cloudflare and Stripe. Also
   check that the webhook and usage emails reach an inbox you read (T218-d).
4. **Mobile store accounts:**
   - Apple Developer Program, EUR 99 a year.
   - Google Play developer account, business type, after the entity (T014).
   - A Mac or a hosted macOS builder for iOS.

   Then T247 and T248 can start, Android first (T272-b).
5. **Google Cloud:** rename the Gemini key's project, and remove or rename
   the empty second "Carta" project (T259-a).

## D5. Tests only a person can run

1. **Hand-price 40 to 50 destinations** into
   `tools/benchmark/samples/hotels.csv` and re-run the benchmark. The stay
   accuracy figure can't be quoted until then (T095, T096-a).
2. **The five-person first-run test** from `docs/FIRST_RUN_RESULT.md`
   (T187-b).
3. **Test the refund procedure once against a real test refund**, after
   the Stripe test purchase (T217-a, after T031-a).

## D6. Decisions still open

These are smaller; each row has the options.

| Row | Decision |
|---|---|
| T111-a | Spec says 47 countries, everything holds 45: name the two or amend the spec |
| T111-c | Confirm three coverage proxies |
| T113-f | Should a mountain-range miss count against a country's trails cell? |
| T121-a | Build a node-network loop product, or not |
| T126-b | May the new image rejects veto an image? |
| T177-c | Hillshade on the route map, and from which host |
| T187-d | Locate the "Original Carta.xmind" the UI tasks cite, or confirm the master plan supersedes it |
| T202-a | Build the priced airport-to-trail leg (now as user-entered fares)? |
| T204-a | The figure at which paid acquisition is reconsidered |
| T205-g | Translate destination intros, or not |
| T217-d | Purchase-record retention when a user deletes their account |
| T246-d | Show an add-to-home-screen hint at all? |
| T255-a | Move the monthly flight_times task to manual |
| T262-a | Box deploy token versus a hand step after each weekly run |
| T265-c | May migration 006 get a comment-only edit? |
| T259-b | Read how prepaid Gemini spend shows in the budget |

## D6b. Added by wave 4 (2026-10-02)

1. **Paste list:** add 019, 020 and then 046 to `_OPEN-MASTER`. 046 goes right
   after 020; without it every co-planner invite fails (T274-a).
2. **Remove the Travelpayouts script from `index.html`?** Recommended: yes.
   It stores a tracking session ID on visitors' devices, which legally needs
   a consent banner that Carta does not have. Removal touches `vercel.json`
   and `_headers`, so it is a separate task after your yes (T214-b, T056-a).
3. **Free trail GPX?** Recommended: yes, remove the pass gate on the trail
   GPX and KML. The cycling GPX is already free; the hiker launch and the
   community plan both depend on it (T203-b, T206-a, T176).
4. **Audience order:** hikers first, then families and beaches, cyclists,
   city-breaks, car-free travellers, trail runners. Confirm or change it
   (T203-a).
5. **Analytics:** no third-party analytics script; first-party events only,
   so no cookie banner is needed (T214-a). Pick a cookie-free visitor
   source for the purchase rate (T215-a).
6. **Launch and press:**
   - pick a launch date (T207-a);
   - no cold press before launch (T208-a).
7. **Support:** create the support@carta-europetravel.com mailbox; an app
   task then swaps your personal Gmail out of the Imprint, Terms and Privacy
   Policy (T216-a).
8. **Legal wording:**
   - the Terms of Service still call flight fares Carta's estimates (T273-b);
   - the "OpenStreetMap may use this track" tick for future uploads
     (T206-c).

## D7. Next code work (Claude, when you say so)

Waves 1 to 3 are done. The next code tasks that need nothing from you:

- **T272-a:** remove the frozen fare estimates from every surface; your
  no-flight-pricing decision.
- **T177-b:** the route track wire and the journey page map; your own-map
  decision.
- **The journey lane:** T088, T092, T094, T089, T093, T143, T090, T091.
- **The P12 docs:** T203, T206, T207, T208, T214, T215, T216, T219, T220
  and T226.
- **T083-a:** the fix migration for 020.

Say "plan wave 4" to have these tabled like Part B, and "do wave 4" to run
them. Everything in "Waits for a rollout stage" still waits for your stages.

---

# Wave log

The orchestrator fills this in. Each line: date, merged sessions, held sessions with the reason, new migrations, push yes or no.

- Wave 1: RUNNING (started 2026-10-01 21:55; bases root fc9a5e4d6, app 35179e5; user asked at 23:05 to run waves 1-3 unattended overnight, merge locally after each wave, never push). Done: T195 (e7c31a3ab), T078 (7839752e6, f92b12990), T107 (4ee7659ef, cb2ea30df), T084 (b909972e3), T083 (root 862f0dcd2, app 7811006), T108 (root 40cb80360, app bc46534; stacked on T107, merge T107 first; 3 of 5 bugs live, 2 need wiring rows T108-a..g). T096 (16d6dc4c4, 532a5a729; food 88.2% within 5.71 EUR/day; stay hold-out too small to quote; nested tools/benchmark/.gitignore). T111 (9e4e8d977, c47c1143b, 8daa879d7; 225 country cells, 164 fail with a code, 0 blank), T265 (root 5fb86db1b, 9ce3ddb9a; app d0d1832; 11/13 rows closed; 044 goes in STAGE 10 after 031, before the checkout/webhook deploys, not stage 2). T192 (app 11c4b9e..b47955b, root 57a911357; exhaustive-deps 42 -> 1; trip editor map redraws 15 -> 0). Running: T266 sonnet (relaunched 23:35 after the Claude process exited; second resume). Notes for merge: T083 mirrors 4 app files into root; T084 workflow red by design (T084-c); T078 ledger check must pass after merge; T195 de-dashed CLAUDE.md (keep both on conflict).
- Wave 1 MERGED 2026-10-02 ~00:45 (10 of 11): root main c6c501241..a323ca3d2 + mirror commit, app master 29632cd..1542352. Ledger ok, 51 pytest + 96 unit tests pass, lint 0 errors, build ok, safety checks empty. T266 still running at merge time; merge it into main/master when it returns.
- Wave 1 T266 merged ~03:45 (root merge + app 2588824; app conflict in test_admin_rpc_security.mjs resolved by hand, 137/137 pass; register de-duplicated in 06b49e2fa; mirror commit). Wave 1 COMPLETE, 11/11.
- Wave 2 MERGED ~02:50, 10/10 (root d026edba5.., app 1542352..; mirror commit 27 files). Ledger ok, pytest 52 pass + 1 known pre-existing failure (test_rating_distribution, row T252-b), 100 unit tests, lint 0 errors, build ok, safety empty. Disk hit 0 bytes during wave 2 (rows T268-f, T269-h): dist/ is deleted after every verification build; ~5 GB free.
- Wave 3 MERGED ~04:45, 10/10 rows (12 tasks). First launch ~02:55 died on the account session limit (all models, reset 03:20); relaunched ~03:40. T204 (haiku) carried invented paid-channel figures: a sonnet fix session removed them (fbb82597f) before merge. T270's app merge conflicted with T266 in verify_admin_panel.mjs: resolved in a merge worktree (541a75f, harness 57/57). Register de-duplicated twice (06b49e2fa, 990d15582). Final state: ledger ok, pytest 52 pass + known T252-b failure, 100/100 unit tests, lint 0 errors, build ok, safety checks empty, no em dashes added. NOT PUSHED: main and master are ahead of origin; pushing main deploys to Vercel production, so that is the owner's call.
- T272 (owner decisions 2026-10-02) merged in both repos: no flight pricing (FAQ entry removed, PRODUCT.md updated), own map, web app plus store apps, R2 prerender, badge reads Recommended, both designs approved. Part D added: the owner's to-do list.
- Wave 4 MERGED 2026-10-02 (bases root f19ed3c0b, app 0a790b7), 10/10. T208 (haiku) had uncited audience figures: sonnet fix 2b958f85d before merge. T273 guard held (no fares/, loaders, r2 or pipeline change). Merge build broke on an unescaped apostrophe in T088 fr.js: fixed in app 4399cea, mirrored 2146aa304. Final: ledger ok, pytest 52 + known T252-b failure, 101/101 unit tests, lint 0 errors, build ok, safety empty, no em dashes, register no duplicates. Migration 046 added (paste right after 020, row T274-a). NOT PUSHED.
- Wave 5 MERGED 2026-10-02 (bases root d6e2833bf, app 4399cea), 10/10. T276 removed only the Travelpayouts CSP entries (verified token by token). T092 (haiku) wrote its 2 register rows into the MAIN checkout, which blocked the root merges until restored; rows recorded in 0458fcf77. Final: ledger ok, pytest 61 + known T252-b failure, 102/102 unit tests, lint 0 errors, all six i18n parse, build ok, safety: only T276 CSP lines. verify_trail_page: all trail, GPX and KML checks pass (free GPX confirmed), 2 Destinations checks fail, cause unconfirmed (row W5-a). NOT PUSHED.
