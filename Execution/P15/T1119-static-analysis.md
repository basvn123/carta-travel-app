# T1119: Static analysis in CI (C7)

## Date

2026-11-06

## What changed

Semgrep now gates every PR and push to main. Tool choice: Semgrep over CodeQL (C-R4 was never written; reasoning in `docs/security/static-analysis.md`). 21 local rules in `.semgrep/carta.yml` cover JS/TS, Python and SQL plus the Carta rules (no `service_role` in `src`, no Claude API, SECURITY DEFINER needs `search_path`, no write grants to anon). The first scan found 29 findings (0 high): 11 innerHTML of constant SVG or escaped markup, 8 f-string SQL in local build-box pipeline code, 9 md5/sha1 for cache keys, 1 fixed esbuild command. All were read and triaged as noise with a note per rule in `.semgrep/baseline.json`; the SQL ones get a cleanup row. `scripts/ci/semgrep_gate.py` fingerprints findings by rule, path and source-text hash and fails on anything not in the baseline or above its count.

## Files touched

Created: `.github/workflows/static-analysis.yml` (SHA-pinned actions, semgrep 1.184.0 pinned), `.semgrep/carta.yml`, `.semgrep/baseline.json`, `.semgrepignore`, `scripts/ci/semgrep_gate.py`, `tests/test_semgrep_gate.py`, `docs/security/static-analysis.md`, this report. Modified: `ROADMAP.md` (C7 status), `Execution/_OPEN.md` (3 rows).

## Commands run

`pip install semgrep` (in a venv); `python scripts/ci/semgrep_gate.py --update-baseline`; `python scripts/ci/semgrep_gate.py`; `python -m pytest tests/test_semgrep_gate.py`.

## Config and secrets set

None. The workflow needs no token. Semgrep registry access is blocked here, so no registry config is used.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Static analysis in CI | none | gate on PR and main | new |
| Scan time | n/a | about 25 s locally | n/a |

Proof: on this branch the gate exits 0 (29 findings, all baselined). With seeded files (`eval` plus `service_role` in `continent-app/src`, `import anthropic` and `shell=True` in `pipeline/`, a SECURITY DEFINER function without search_path and `grant all ... to anon` in a migration) it exits 1 and names six new findings; seeds were removed afterwards. `tests/test_semgrep_gate.py` (3 tests) automates this and passed.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Rules would not load | YAML colon in a JSX pattern; `import ... from` patterns do not parse | Quoted the pattern, used regex rules for imports |
| 102 false exec hits | `$CP.exec` matches RegExp.exec | Limited to bare, `child_process.` and `cp.` calls |
| `semgrep --validate` fails | It fetches rules from semgrep.dev (403 here) | Not used; the scan itself proves the rules load |
| Findings showed "requires login" | Matched lines are hidden when logged out | Gate reads the source line from disk itself |

## Screens checked

None (no traveller-facing change).

## What is still open

T1119-a SQL f-strings cleanup; T1119-b required status check (owner); T1119-c parse-booking `logic.mjs` is unscanned and C-R4 not written up. All are register rows.

## Rollback procedure

`git revert` the T1119 commit. Nothing else depends on it.

## Owner steps (for the checklist)

- [T1119-b] Require the static-analysis check | so a red Semgrep gate blocks merging into main | GitHub repo Settings; Branches; edit the rule for main; add `semgrep` (workflow static-analysis) to required status checks; save | .github/workflows/static-analysis.yml
