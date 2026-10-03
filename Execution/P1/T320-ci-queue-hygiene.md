# T320: CI and queue hygiene

## Task ID

T320

## Date

2026-10-03

## What changed

One of the two rows is done. T267-e is closed: `Execution/_queue/wave_gate.ps1` ports the queue runner's gate (a committed report, and no app-repo changes left behind) to the wave runners. It reads the worktree pair that `wave_worktree.ps1` makes, prints one `ok`, `FAIL` or `WARN` line per check, and exits 0 (pass), 1 (hold) or 2 (bad input). It only reads; it never commits, merges or deletes. It checks that exactly one report `Execution/P*/<Task>-*.md` is committed between `main` and the branch tip, that the root worktree has no uncommitted tracked changes, that when the report names `continent-app/` the app branch has a commit past `master` and the app worktree is clean, that the report was added in a single commit, and that `Execution/_OPEN.md` changed (a warning only).

T252-c is not done. I tried to tighten the patterns in `.github/workflows/secret-scan.yml` and the auto-mode permission classifier refused the edit three times (labelled security test removal, then CI bypass). I did not look for another way round it. The change is written below for the owner to apply.

I could not edit `wave_worktree.ps1` or `merge_branch.sh`: both are untracked in the main checkout, so they do not exist in this worktree. A new file was the only way to add the gate, and it is meant to be run by the orchestrator beside them.

## Files touched

**Created:**
- Execution/_queue/wave_gate.ps1
- Execution/P1/T320-ci-queue-hygiene.md

**Modified:**
- Execution/_OPEN.md (T267-e closed, T252-c owner set to user, rows T320-a and T320-b added)

## The secret-scan change for the owner to apply

In `.github/workflows/secret-scan.yml`, in the `PATTERNS` line, replace `sk-ant-|sk_live_|whsec_|` with `sk-ant-[A-Za-z0-9_-]{20}|sk_live_[0-9A-Za-z]{20}|whsec_[0-9A-Za-z]{32}|`. I ran the old pattern against `HEAD` with `git grep`: the 14 hits outside the scanner itself are all placeholders (`whsec_...`, `sk-ant-...`, and the dummy `whsec_testsecretfortestingonly123456`, which has 30 characters after the prefix, under the 32 a Stripe signing secret has). None would match the new pattern. I did not get to run the new pattern, so run `git grep -nE` with it once before relying on it.

The second check in the same job, the bare word `service_role` outside `supabase/migrations` and `config.toml`, also fails on `HEAD`. It matches 15 files under `Execution/` and 20 more (the Node test harnesses in `continent-app/scripts/admin`, `continent-app/scripts/ai`, `continent-app/scripts/ci/check-contract.mjs`, and `ops/restore_supabase.sh`). The T252 row named only the placeholders, so that check is raised as T320-b for a decision, not changed.

## Commands run

`git grep -nE` of the old pattern and of `service_role` against `HEAD` (root repo, sparse worktree, so I used `HEAD`). Then a throwaway repo pair under `%TEMP%` with two worktrees to test the gate.

## Config and secrets set

None.

## Before/after measurements

Not measured. The gate was tested on the throwaway pair for four cases: nothing committed gives exit 2 (before the first commit the branch has no diff), an uncommitted file in the app worktree gives HOLD, an app branch with no commit gives HOLD, and a clean finished session gives PASS.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First test hung and failed to diff | A helper function named `Git` called itself, because PowerShell function names are case-insensitive | Renamed it `GitOut` |
| "0 commits" passed the app check | A one-item array unrolled to a string, and `[int]` of a character is its code | The helper returns the array with a leading comma and drops empty lines |
| Test run 1 left a hung PowerShell process | The recursion above | Stopped the task; my attempt to kill by process name was also refused, so check for a stray `powershell` running `wave_gate.ps1` from a `gate_t320` temp folder |

## What is still open

T252-c, the secret-scan patterns: needs the owner to apply the diff above (row T252-c, owner changed to user; T320-b). T320-a: add a line to step 4 of "How the orchestrator runs a wave" in `Execution/_WAVES.md` (a rule 4 file) calling `powershell -File Execution/_queue/wave_gate.ps1 -Task <T> -Branch <b> [-App]` before `merge_branch.sh`. Optionally track `wave_worktree.ps1` and `merge_branch.sh` in git, since they are untracked.

## Rollback procedure

Delete `Execution/_queue/wave_gate.ps1` and revert the `_OPEN.md` rows. Nothing else depends on them.
