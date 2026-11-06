# T1116: register rule, four dry runs (ROADMAP A3, row T1083-a)

## Date

2026-11-06

## What changed

Owner decision 8 (how to get the register under 250 open rows) is still open, so only the ungated half was done: the register was measured and each of the four options now has a dry run. `scripts/register/dry_run.py` prints the register as it would look under option a, b, c or d and writes no file (a test checks `Execution/_OPEN.md` is byte-identical afterwards). No row was rewritten or closed. The finding: **no option reaches under 250.** The best is option c at 877 rows. The register is at 1,717 rows, up from 1,409 at the end of T1083.

## Files touched

- Created: `scripts/register/dry_run.py`, `tests/test_register_dry_run.py`, this report.
- Modified: `Execution/_OPEN.md` (rows T1116-a and T1116-b appended at the end).

## Commands run

```
python -I scripts/register/dry_run.py --measure --baseline 1c6967d91   # section 1
python -I scripts/register/dry_run.py --option all --first 8           # section 2
python -I -m pytest tests/test_register_dry_run.py -q                   # 5 passed
ruff check scripts/register/dry_run.py tests/test_register_dry_run.py   # clean
```

## Config and secrets set

None.

## Before/after measurements

### 1. The register as it is (1,717 open rows)

| By owner | Rows |
|---|---|
| user | 582 |
| next task | 1,135 |

Owner rows with a procedure pointer: 451 of 582 (22 distinct files; the 11 big ones hold 436: product-decisions 147, owner-checks 78, cloudflare 46, translation-review 46, data-and-pipeline-runs 40, legal 26, hetzner-box 20, supabase-migrations 12, stripe 11, accounts-and-signups 6, secrets-rotation 4). The other 131 owner rows have no pointer.

Added tonight (rows not in the register at the handover commit `1c6967d91`): **323** (92 owner, 231 next task). One task is 129 of them: T1132 (logic catalogue) added one next-task row per rule ("RATING-001 has no test that pins it"), all item B3. Without T1132, tonight added 194, about 6 per session.

| By raising task (top) | Rows |
|---|---|
| T1132 | 129 |
| T433, T632 | 13 each |
| T183, T431 | 11 each |
| T630, T641 | 10 each |

| By age (task number band) | Rows |
|---|---|
| T0000 to T0099 | 80 |
| T0100 to T0199 | 181 |
| T0200 to T0299 | 103 |
| T0300 to T0399 | 154 |
| T0400 to T0499 | 235 |
| T0500 to T0599 | 153 |
| T0600 to T0699 | 131 |
| T0700 to T0799 | 41 |
| T0800 to T0899 | 134 |
| T0900 to T0999 | 55 |
| T1000 to T1099 | 187 |
| T1100 to T1199 | 263 |

By roadmap item (item named in the row text, else the first item the raising task's report names): 1,316 rows name no item. Named: B3 129, B2 12, D9 12, D7 11, C6 9, A3 9, D1 8, C9 8, K2 8, G12 8. The register is mostly not tied to the roadmap, which is why folding by item is weak and folding by area (option b) is a guess.

### 2. One-page comparison

| Option | What changes | Open rows | Owner rows | Next-task rows | Reaches under 250? |
|---|---|---|---|---|---|
| d | Nothing; keep "one row per open item" | 1,717 | 582 | 1,135 | No |
| a | One row per owner procedure file; the 131 unpointed owner rows go to the owner-checks file | 1,157 | 22 | 1,135 | No (-560) |
| b | New ROADMAP text takes 280 UI follow-ups (G4 220, G8 21, G12 19, G5 7, G6 3, G3 3, G7 3, G1 2, G10 1, G11 1) | 1,437 | 582 | 855 | No (-280) |
| c | a and b | 877 | 22 | 855 | No (-840) |

Option a lands at 22 owner rows, not the "about 15" the checklist says: 22 files are referenced today, 6 of them with one row. Merging the one-row files into the big ones would give about 15.

Assumptions in the b count, both constants in the script (`UI_BANDS`, `UI_RE`, `FOLD_TARGETS`): a next-task row is a "UI follow-up" if its task number is in T372 to T466, T574 to T600 or T807 to T874, or its text matches UI words and it names a G item. T1083 estimated about 330; this rule finds 280. The fold targets are a proposal; the owner writes the real ROADMAP text.

What would be needed for under 250 after option c (877 rows): about 630 more next-task rows must leave. Candidates, none of them a rule change: the 129 T1132 rows (one B3 task or one row, option e below), about 150 data-lane rows that close when the box runs happen, the stale `verify_*.mjs` family (about 45 rows, one code task), and the Trips/carta-unified and Ask Carta follow-ups (about 170 rows, each needs a code check or a roadmap fold). Even all of these leave about 400 rows. Under 250 needs a fourth change: a rule that a next-task row below a priority line lives in ROADMAP item text, not in the register.

Option e (not on the checklist, offered because it is the cheapest big step): keep T1132's 129 per-rule rows as one row "Pin every RATING/other rule in the logic catalogue with a test (B3)", with the rule list in the T1132 report. That alone is -128 on any option.

Recommendation: c now (877) plus option e (749), and decide separately whether to move the lowest-value next-task rows into ROADMAP item text; do not expect 250 from a, b or c alone.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `scripts/register/triage.py` printed 0 rows | It splits on CRLF; `Execution/_OPEN.md` now has LF line endings | `dry_run.py` accepts both. `triage.py`, `owner_procedures.py` and `apply_decisions.py` still assume CRLF and would write CRLF back; fix before any of them is run (row T1116-b) |
| pytest was not installed in the container | fresh image | `pip install pytest` for the check |

## Screens checked

None. No traveller-facing file changed.

## What is still open

- T1116-a: the owner picks an option (a, b, c, d, or c plus e) and says whether "under 250" stays the A3 target. Until then A3 stays in progress and no row is rewritten.
- T1116-b: `triage.py`, `owner_procedures.py` and `apply_decisions.py` need to read LF as well as CRLF (and keep the file's own style on write) before the chosen option is applied.

## Owner steps (for the checklist)

- [T1116-a] Pick the register option | the register is at 1,717 rows and no option gets under 250 (a 1,157, b 1,437, c 877, d 1,717), so the target or the rule must change | read the comparison in Execution/P15/T1116-register-rule.md section 2; run `python -I scripts/register/dry_run.py --option all` to see the first rows; answer a, b, c, d or c plus e in chat, and say whether the 250 target stays or moves | Execution/P15/T1116-register-rule.md

## Rollback procedure

`git revert` the T1116 commit. It adds a script, a test, a report and two register rows; nothing else is touched.
