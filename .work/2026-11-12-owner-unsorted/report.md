# Run report: owner sweep, unsorted lane

- **Status:** done
- **Date:** 2026-11-12
- **Level and playbook:** L2 · deep-task (one lane of the owner sweep run by the orchestrator session)
- **Run folder:** `.work/2026-11-12-owner-unsorted/` (working files local; this report is committed). `ledger.json` there has one entry per row.
- **Branch:** `p15-owner-unsorted`
- **ROADMAP items:** C3, C5, C9, C10, D4, D10, D19, D24, E7, F4, F7, H5, H10, I13, I-g

## Summary
We went through all 302 rows of `docs/owner/unsorted.md`:
- 271 rows also sit in another lane's walkthrough slice, and that lane acts on them. Each is recorded as a `handoff` with its target procedure file (`move_to`).
- 31 rows were this lane's own. Almost all were owner-ticked decisions, and we applied each one: four as code (T689-a, T1164-f, T1163-b, T1179-a), one in the truth eval (T1144-e), and the rest in their ROADMAP rows and docs.
- The ledger counts are 9 already-done, 21 decided and 272 handoff (271 to lanes, T1084-b to the orchestrator).
- `unsorted.md` drops from 302 to 274 rows. T1118-b and T1190-h stay with only their human part.
- No live system was changed.

## What was asked
Go through every unsorted owner step. Close what is done or obsolete, do what Claude can, decide what is a decision, and hand steps on exclusive systems to their lanes (`lanes.md`, `## unsorted`; common rules in `lane-brief-common.md` of the sweep).

## What we did
1. Intake and plan (`brief.md`, `plan.md`). We matched every row ID against the six other lanes' walkthrough slices (`lane-overlap.json`) and the owner ticks (`ticks-unsorted.json`, 35 ticks).
2. Read-only checks of live state:
   - `r2:carta/status/last_run.json`: the weekly box run on 2026-11-10 was ok and pushed `freshness_wires.json` (T1099-b).
   - `backup.json`: the nightly backup ran on 2026-11-12.
   - `supabase migration list`: the CLI history is empty because the migrations were pasted by hand, so live migration state belongs to the supabase lane.
3. Two explorers mapped the code for the ticked decisions (`explore-app.md`, `explore-admin.md`).
4. Built (one writer), committed per decision, and recorded decisions in docs (`decision.md`, `progress.md`).
5. Verified with `checks.md` and two fresh judges:
   - Round 1 (`judgement-1.md`) failed on code and docs: stale numbers could reach the wire through T1179-a, `asvs.md` overclaimed V6.2.11, a paywall gate lost its last caller, and some docs were stale.
   - Those were fixed in `3f53b7eadf`. Round 2 (`judgement-2.md`) passed with all six criteria at 4.

Skipped: the diverge, propose and critique stages. Every decision was already made by the owner, so there was nothing to diverge on. The approval checkpoint was pre-approved for the sweep.

## Owner ticks applied
| Row | Owner choice | Where it landed |
|---|---|---|
| T689-a | Remove source lines everywhere | `continent-app/scripts/og/specs.mjs`, `continent-app/scripts/prerender/pages.mjs`. Credits stay (licence notices), and the tilde still marks estimates. |
| T1164-f | Drop composition rules, add context words, optional TOTP | `src/lib/passwordStrength.js`, `AccountPanel.jsx`, `AuthModal.jsx`, `ResetPasswordScreen.jsx` and six i18n files, with `tests/passwordRules.test.mjs`. Context words are "carta" plus name and e-mail parts of 4 letters or more. In `asvs.md`, V6.1.2 and V6.2.5 are Met. V6.2.11 is Partial because the check runs in the app only; the server-side hook is a C3 follow-up. Traveller TOTP is recorded in C3 and not built. |
| T1163-b | Mount SLO and AI calls panels, delete the rest | Both panels were already mounted. We deleted `AiDayPlanModal.jsx`, `AiPlanRoute.jsx`, the proposal harness and `lib/accuracy.js`; the food accuracy figure now lives in `scripts/explainer/numbers.mjs`. The paywall gate `ground` has had no caller since the bot replaced the modal; this is recorded in H14. The funnel check now reads default reasons, which covers `plansLow`. |
| T1179-a | Ship the English summary | `pipeline/trails/export_wire.py` `wire_summary` reads `data/trails/summaries.json`. It ships the summary only while its km, climb and walking time still match the row (`summary_still_true`); otherwise the lead ships. Tested; HANDBOOK and D24 updated. It reaches travellers with the next trails export (box lane). |
| T1144-e | Drop the citation | `evals/truth/fields.json`, `GUIDE.md`, `scripts/validation/texts_sample.py`, HANDBOOK and D4 updated. `guide.url` stays as the CC BY-SA credit for the guide text. |
| T1135-d, T1135-g, T1138-h | Any DPA host; open model at the trigger; keep models | `config/ai_models.json` rules, `docs/ai/model-strategy.md`, the E-R3 note, decision 0005 "Later", Article 30 row 5, E7 and C9 |
| T1118-b | Belgian VAT period the accountant confirms | Article 30 (draft 10 years). The accountant step stays human and moves to `legal.md`. |
| T1153-e, T1157-c, T1159-e, T1173-i, T1199-e, T1211-a | Decided, not built | Follow-ups in F4, C5, H5, I13, D19 and C10 |
| T1155-a, T1155-b, T1182-d, T1190-h, T1213-h | Recorded | `services/mcp/README.md`, `infra/hetzner/README.md`, `docs/tos/data_licenses.md`, `docs/data/access-ladder.md`, ROADMAP F7, H10, I-g. The Numbeo licence itself stays human (`legal.md`). |
| T714-c | Change it now | **Not applied literally.** No place has a local transport fare (T714-b "Not now"), and CLAUDE.md says honest numbers always bind. When the first fares ship, a manual follow-up adds `'transport'` to `DAY_PARTS` and changes `home.ch2`. Recorded in D10. |
| T063-b, T1088-d, T1099-b, T1133-a, T1142-f, T1155-d, T1164-j, T1164-n | Ticked done | Removed. T1073-e was already true in `docs/runbooks/build-box.md`. |

## Live-system changes
None.

## Handoffs (for the orchestrator)
- 271 rows go to the box (90), review (85), decisions (55), deploy (21), supabase (16) and security (4) lanes. Each has a `move_to` file in `ledger.json`; the orchestrator moves the rows after the merge, which empties `unsorted.md`.
- T1084-b goes to the orchestrator. It is closed by the live ship carrying the T1071 MFA step-up, followed by one admin check (`owner-checks.md`).

## Files changed
| File | Change |
|---|---|
| `continent-app/scripts/og/specs.mjs`, `continent-app/scripts/prerender/pages.mjs` | T689-a |
| `continent-app/src/lib/passwordStrength.js`, `continent-app/src/auth/{AccountPanel,AuthModal,ResetPasswordScreen}.jsx`, `continent-app/src/i18n/*.js`, `continent-app/tests/passwordRules.test.mjs`, `docs/security/asvs.md` | T1164-f |
| `continent-app/src/planner/AiDayPlanModal.jsx`, `AiPlanRoute.jsx`, `continent-app/src/lib/accuracy.js`, `continent-app/scripts/ai/proposal_preview.{html,jsx}`, `verify_ai_proposal.mjs` (deleted); `verify_ai_ui.mjs`, `verify_day_dates.mjs`, `scripts/explainer/numbers.mjs`, `scripts/ci/design-lint.baseline.json`, `tests/aiPage.test.mjs`, `scripts/verify_paywall_funnel.mjs`, `docs/logic/*.md`, `docs/reference/app-lib.md` | T1163-b |
| `pipeline/trails/export_wire.py`, `pipeline/trails/summaries.py` (docstring), `tests/test_trail_loop_flag.py` | T1179-a |
| `evals/truth/fields.json`, `evals/truth/GUIDE.md`, `scripts/validation/texts_sample.py` | T1144-e |
| `ROADMAP.md`, `docs/HANDBOOK.md`, `docs/legal/ARTICLE30.md`, `docs/ai/model-strategy.md`, `continent-app/config/ai_models.json`, `docs/research/E-R3-models-and-hosting.md`, `docs/decisions/0005-runtime-ai-on-gemini.md`, `docs/runbooks/backup-restore.md`, `services/mcp/README.md`, `infra/hetzner/README.md`, `docs/data/access-ladder.md`, `docs/tos/data_licenses.md` | Decisions recorded |
| `docs/owner/unsorted.md`, `docs/owner/README.md` | 28 rows removed, three rewritten, count 274 |

## Checks
See `checks.md`:
- `npm test`: 1,884 pass. All 35 failures were traced to the sparse worktree (no `public/`), the CRLF checkout or Windows paths; `design-lint` fails the same way on the HEAD baseline.
- New password test: 4 of 4 pass.
- `npm run lint`: 0 errors.
- ruff: clean.
- pytest on the touched areas: 94 passed.
- Docs checks: only the 4 missing `public/` entry paths.

## Risks for the merge
- ROADMAP rows C3, C5, C9, C10, D4, D10, D19, D24, E7, F4, F7, H5, H10, I13 and I-g, and `docs/legal/ARTICLE30.md`, may also be edited by the decisions lane, which can cause single-line conflicts. Keep both notes.
- T714-c declines the literal owner choice on honest-numbers grounds. The owner may overrule it.
- The `ground` paywall gate has no caller (H14). This is a product call: give the bot a grounded-search offer or drop the gate.
- The deleted `AiDayPlanModal` had no importer. Any branch that remounts it would need it back (`git revert 853520cbdd`).

## How to undo
Use `git revert` on the commits of `p15-owner-unsorted` (`git log b6a5237190..p15-owner-unsorted`). There are no data migrations and no schema changes; everything is code and docs.
