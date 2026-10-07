# Execution Report: T362

## Task ID

T362: apply the owner's block A answers of 2026-10-07 (step A6 of `Execution/_OWNER-RUNBOOK.md`)

## Date

2026-10-07

## What changed

On 2026-10-07 the owner answered every decision in block A of the owner runbook, in one sitting guided by this session: 81 answered table rows over the design rules, the product gates, the admin and moderation questions and four permissions. All but four accepted the written recommendation. The differences: no trail cap in any country ("broaden the coverage, we have space", T125), a mountain target of about 5,000 (T122), every one of the 3,868 cost pages indexed with no floor (T224-b), and the pack icon review left for later (T168-b). The owner also chose to skip the token roll and the rclone key swap (B1, B2). This task turned those answers into the state the waves read. Six new rules are in the carta-design skill under Components (InfoDot, day track, flashcards, sticky section rail, the one Lifestyle control, the cost bar above a receipt), with no bento grid, a scrim behind every modal dialog, an install hint, and a fine-pointer exception that lets a compact control be 32 px on a mouse. `DESIGN.md` records the same decisions, the policy for colours in JavaScript, and the contrast token change as pending with computed values (`--ink-mute` `#646978` at 5.07:1 on paper, `--accent` `#ce3823` at 4.61:1 as text and 4.98:1 under white), because the owner asked to see them on screen before they ship. In the register, 76 rows are closed by the decisions and six work rows (T362-a to T362-f) are raised for what the decisions create. Two catch-up waves, 16b and 16c, are tabled in `_WAVES.md` through its generator: the 19 sessions that were skipped on owner gates (T178 still waits on the route track wire) plus six new tasks, T363 to T368, each claiming a work row. The four permissions are applied: the wave tools and `PARALLEL-WAVES-PLAN.md` are committed, step 4 of the wave procedure runs `wave_gate.ps1`, `secret-scan.yml` no longer fails on placeholders, and `jsonschema` is in `requirements.txt`. Both the waves file and `_OPEN-MASTER.md` now point the reader to the runbook for the owner's steps.

## Files touched

Root repository only; the app repository is untouched.

**Created:**
- Execution/_OWNER-RUNBOOK.md (written 2026-10-04, first committed here with the answers)
- Execution/P11/T362-owner-decisions-applied.md
- Execution/_queue/ (the wave and queue tools: waves_md.py, wave_prompts.py, task_model.py, xmind_prompt.py, wave_worktree.ps1, merge_branch.sh, dedupe_open.py, gate_t073.sh, the T074 to T076 prompts and the wave1 to wave5 prompt folders; previously untracked)
- PARALLEL-WAVES-PLAN.md (previously untracked)

**Modified:**
- .claude/skills/carta-design/SKILL.md (Components: nine new rules; Layout and Quality floor: the fine-pointer exception)
- DESIGN.md (Components: the decided rules, compact controls, colours in JavaScript, the pending contrast change)
- Execution/_queue/waves_md.py (waves 16b and 16c, register tasks T363 to T368, decided notes for T148 and T081, data-lane rows T122 and T125, the wave gate in step 4, the runbook pointer)
- Execution/_WAVES.md (regenerated from waves_md.py, with the existing wave log for waves 1 to 16 kept byte for byte)
- Execution/_OPEN-MASTER.md (a banner pointing to the runbook)
- Execution/_OPEN.md (76 rows closed by T362, rows T362-a to T362-f added)
- .github/workflows/secret-scan.yml (tightened key patterns; service_role exclusions for reports, app test scripts and the restore script)
- requirements.txt (jsonschema>=4.23)

**Deleted:**
- None

## Commands run

All from the repo root on branch `p11-owner-decisions-a6`, after checking that no wave or pipeline run was active (`git worktree list` showed only the main checkout).

```
git checkout -b p11-owner-decisions-a6
git add Execution/_OWNER-RUNBOOK.md; git commit   # the answers first, so they exist in git
python <scratchpad>/patch_waves.py                # the WAVES table and notes in waves_md.py
python -c "import waves_md; waves_md.OUT=<temp>; waves_md.main()"   # from Execution/_queue
# then the generated head joined to the existing '# Wave log' section of _WAVES.md
python <scratchpad>/close_rows.py                 # 76 rows closed, 6 added
git grep -nE "<new PATTERNS>" -- ':!.github/workflows/secret-scan.yml' ':!continent-app/package-lock.json'   # no hits
git grep -nE 'service_role' -- <the new exclusion list>   # no hits
```

`waves_md.py` writes only a placeholder wave log, so a plain regeneration would have dropped the log of waves 6 to 16. Each regeneration here went to a temporary file, and the file written back is the generated text up to `# Wave log` plus the existing log section unchanged (12 log entries before and after). The contrast values were computed with the WCAG relative-luminance formula, darkening each colour in HLS at a fixed hue until it reached 4.6:1 against every ground it is used on.

## Config and secrets set

None. No Dashboard, secret, deploy or database change.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Open register rows owned by the owner | 315 | 242 | -73 |
| Register rows closed by this task | 0 | 76 | +76 |
| Sessions skipped on an owner gate | 20 | 1 (T178, needs data step F6) | -19 |
| secret-scan key-pattern hits on the tree | 15 placeholders | 0 | -15 |
| secret-scan service_role hits outside SQL | 37 files | 0 | -37 |

The before count is 315, not the 282 the runbook was written against on 2026-10-04, because waves 15 and 16 raised owner rows since. Of the 76 closed rows, 73 were owned by the owner and 3 by the next task. The key-pattern hits are counted with the old pattern on HEAD (`git grep -nE 'sk-ant-|sk_live_|whsec_'`), one more than the T320 report found. The service_role figure counts files from `git grep -l`.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A plain regeneration of `_WAVES.md` would drop the wave log | `waves_md.py` writes a placeholder log; the real log is appended by hand after each wave | Regenerate to a temporary file and keep the existing log section |
| The first patch of `waves_md.py` did not apply | A heredoc in the shell broke on the apostrophes in the notes | Wrote the patch as a Python file in the scratchpad and ran it |
| One later note fix did not match | The note is stored with single quotes through `repr()` | Matched the stored form |

## What is still open

The work the decisions create is in six register rows, each claimed by a catch-up session: T362-a (the contrast tokens, T363, wave 16b, held for the owner's look at the screenshots), T362-b (the interface calls, T364), T362-c and T362-f (the receipt, copy and non-English intro calls, T368), T362-d (migration 051 with the moderation and admin decisions, T365), and T362-e (housekeeping, T366), all in wave 16c. The empty states (T211-b) are now T367 in wave 16c. T178 stays skipped until the route track wire is built in the data lane (runbook F6). Still the owner's: the pack icon review (T168-b), the OSM tick wording check by a lawyer (T206-c, runbook J4), the source licence questions before the first sale (T310-a, T300-e, runbook J5), the email provider setup (T213-e, runbook J6), and the Geneva and lodging data run (T311-a, runbook F5). The two wave gates that still need the owner's stages are unchanged: wave 17 waits for the database pastes (D, E) and the rest for the box, images and Stripe. Nothing in this task was pushed or deployed.

## Rollback procedure

Everything is on one branch in the root repository. Before the merge: `git branch -D p11-owner-decisions-a6`. After the merge: `git revert -m 1 <merge commit>` on `main`, which restores the skill, `DESIGN.md`, the register, the waves file and the workflow together; the runbook with the owner's answers comes back out of git too, so keep a copy first (`git show p11-owner-decisions-a6:Execution/_OWNER-RUNBOOK.md`). A single decision is undone more narrowly: re-open its row in `_OPEN.md` (a new task changes the status back to open with a reason) and remove its rule paragraph from the skill and `DESIGN.md` in one commit. No migration, data or production state was touched.
