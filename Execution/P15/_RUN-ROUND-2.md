# Run log: round 2 (started 2026-11-06)

Orchestrator: the desktop session "Sessions Round 2 execution". Integration branch `p15-round2`: round 1's `claude/relaxed-dirac-l8enoy` (all 50 sessions, S44 included) plus the round 2 plan and ROADMAP additions from `p15-p2-security` (PR #10, still not merged to `main`).

How it runs:
- Each row of `_SESSIONS-ROUND-2.md` is one cloud session on its own branch `p15-sNN-<slug>`, cut from `origin/p15-round2`.
- About five run at once. A finished branch is merged into `p15-round2`, checked (npm test, design-lint, css-routes, fast build, pytest for touched code, entry points, drift), and the next row starts.
- Same-file sessions never run together: the trail pack (S95 to S102) runs one at a time; migration sessions (S59 and any other) run alone and take the next free number at their start; S53 (E3) follows S52 (E1).
- Owner steps from each report go onto the owner checklist, phase "8. From round 2".
- Local checks on Windows show four failures that pass in Linux CI (path joins in two tests, CRLF in the byte-identical Edge Function check, a slow sharedParts run). CI on Linux is the gate.

| S | Task | Item | Branch | State | Merged | Owner steps |
|---|---|---|---|---|---|---|
| 51 | T1135 | E-R3 | p15-s51-model-research | done | yes | 1 |
| 52 | T1136 | E1 | claude/festive-faraday-xx71l2 (not its own branch) | done | yes | |
| 58 | T1142 | D2 | p15-s58-quality-engine-2 | done | yes | |
| 61 | T1145 | D6 | p15-s61-coverage-fairness | done | yes | |
| 95 | T1179 | D24 | p15-s95-trail-summaries | done | yes | |
| 53 | T1137 | E3 | p15-s53-ai-gateway | done | yes | 1 |
| 81 | T1165 | B4 | p15-s81-config-reference | done | yes | |
| 82 | T1166 | B5 | p15-s82-data-lineage | done | yes | |
| 56 | T1140 | E5 | p15-s56-prompt-registry | started | | |
| 57 | T1141 | E2 | p15-s57-retrieval | started | | |
| 65 | T1149 | F1 | p15-s65-taxonomy-1 | started | | |
| 97 | T1181 | D24, D23 | p15-s97-trails-external | started | | |
| 89 | T1173 | I13 | p15-s89-content-ops | started | | |
| 64 | T1148 | F6 | p15-s64-eval-platform | done | yes | 3 |
| 96 | T1180 | D24 | p15-s96-downhill-relief | done | yes | 1 |

The batch schedule for the rest of round 2 is in "Batch schedule" below.

## Batch schedule (from batch 4 on)

Written 2026-11-06 at the owner's request: batches run one after another without waiting for the owner, and each finished batch is merged into `p15-round2` before the next starts. A cloud orchestrator session runs this from batch 3's merge on.

Rules for the orchestrator:
- A batch starts when every session of the previous batch has pushed its report (or has been stopped as failed, noted here) and that batch is merged, checked and pushed.
- Gate check at each batch start: a row whose gate is an owner decision that blocks the work itself is skipped and listed under "Held" with the owner row it waits on; a row whose gate is only a box run, a deploy or a live paste does the code half and leaves the run as an owner step. Never stall the chain on the owner.
- Merge: `Execution/_OPEN.md` and `ROADMAP.md` conflicts by row union (`Execution/P15/_run50/union.py` on the round 1 branch, or the same logic); then compare every ROADMAP row a branch changed against the merged file and restore the branch's row where the union kept the old one (batch 2 lost B5 that way). Other conflicts are resolved by reading both sides.
- Checks after each merge: `npm test`, `node scripts/ci/design-lint.mjs` (0 new), eslint 0 errors, the fast build and `node scripts/css-routes.mjs --check`, `node scripts/eval/run.mjs`, pytest for touched Python, `python -I scripts/docs/check_entry_points.py`, `scripts/docs/drift.py`, `scripts/docs/config_reference.py --check`, `scripts/docs/build_lineage.py --check`; then push and confirm GitHub CI on the pushed commit. A red check is fixed on `p15-round2` and noted here as a merge fix.
- Owner steps: run `python -I Execution/P15/_run_r2/p8.py <checklist.html> <reports>` on the merged reports (it keeps `owner_steps.json`), add any step a report wrote in another format by hand to `owner_steps.json`, and publish the result to the owner checklist https://claude.ai/artifact/UZ1QJRDYdowJZEi6y5JCvF (phase 8).
- Migrations: only S59 writes one in this schedule; it takes the next free number at its start (065 to 070 are used).
- The trail pack runs one at a time: S97, S99, S100, S101, S102, S98.

| Batch | Sessions | Why together |
|---|---|---|
| 4 | S59 (D3, migration), S103 (D23 method), S71 (F7), S72 (F8), S83 (B6) | S59 changes every layer writer, so the others stay out of writers |
| 5 | S54 (E7), S55 (E4), S60 (D4), S62 (D15 part 1), S99 (trail continuity) | E7 and E4 need E1, E3 and F6 (merged) |
| 6 | S66 (F1 part 2), S68 (F3), S69 (F4), S100 (multi-stage treks), S105 (beaches) | F after F6 and F1 part 1; S105 after S103 |
| 7 | S70 (F5), S73 (H3), S74 (H4), S75 (H5), S101 (way back) | |
| 8 | S76 (H8), S77 (H10), S78 (H11), S80 (C10), S102 (mountains and lakes) | |
| 9 | S79 (H14 code health, the only code writer), S84 (B8), S104 (LLM judge), S106 (prices validation) | S79 splits large files, so no other app writer runs beside it |
| 10 | S85 (I7), S86 (I8), S87 (I14), S88 (I15), S98 (trails lab on the box) | |
| 11 | S94 slot: K14 blog part 1 (T1178), S91 (K7), S92 (K8), S107 (ratings validation), S108 (lakes and mountains) | round 1's S47 built the press kit (K10), so K10 is done and blog part 1 takes S94's number |
| 12 | S90 (K14 part 2, after the S94 slot), S109, S110, S111 (validations), S112 (texts, after S104) | |

Held (skipped until the owner unblocks them; the orchestrator adds a held row to the next batch once its owner row closes):
- S63 (D15 part 2): needs the owner's review of S62's add, merge and remove list.
- S67 (F2 distilled tagger): needs F1 labels from S66's box run and the owner's 400 hand labels (T1149).
- S93 (G5 motion system): needs the design direction approved (T1111-a).

Merge notes:
- Start: integration branch built from round 1's final commit 3ec160f027 plus PR #10's T1084 commits; ROADMAP conflict resolved by keeping round 1's statuses and adding D15 to D24, E7 and G14 (no doubled rows). Entry points OK, drift 0, reading guide index regenerated (922 links, 0 broken).
- 15:50 Batch 1 merged: S51 (cost table, 5 of 5 features priced, switch points; GPU pays off near 165,000 MAU against open APIs), S52 (Ask eval gate, 200 questions, rules recall@10 0.568, grounding 0.996, seeded drop fails), S58 (75 quality rules, run fails on a must-see drop over 2 points, admin Data health tab), S61 (parity table, 43 countries, 310 regions, 100 ranked gaps), S95 (2,089 of 2,089 top-band trail summaries; the top band is 2,089 under v5, not the 2,348 in the plan). Only `_OPEN.md` conflicted (rows appended by each, union kept). npm test 1581: 1565 pass, 4 Windows-only failures as at the start; design-lint 0 new; eslint 0 errors; fast build and css-routes OK; ask eval gate pass; quality and trail-summary pytest 30 pass; quality gate PASS on the shipped data; entry points OK; drift 0. Batch 2 started: S53, S64, S96, S81, S82. S56 (E5) waits for S53, because both edit the AI call sites.
- 17:20 Batch 2 merged: S96 (relief reads the climb uphill; 503 downhill walks, about 265 move up a band and 37 enter the top band once re-rated on the box, T1180-a), S81 (298 config keys, 17 dead), S82 (76 of 76 wire fields with lineage, 7 request path diagrams), S64 (one eval runner, plan-day eval with 20 cases and a judge; kappa against hand labels is owner step T1148-a), S53 (every model call through `aiModels` or `ai_gateway.py`, 75 injection attacks held). Fixes at merge: the ROADMAP row union kept the old B5 row next to T1165's B4 (restored T1166's); S64's plan-day judge called the Gemini endpoint, which S53's new test forbids, so it now goes through the gateway as feature `eval-judge` (both module copies). Linux CI on 1af600912e: ci, ai-guard and ask-eval green. Locally on Windows the vite SSR tests time out (about 40 s per module) and the four known path and line-ending failures remain; CI is the gate. Batch 3 started: S56, S57, S65, S97, S89. S59 (D3 schema) runs alone after it.
