# T1083: register triage, second pass (ROADMAP A3, row T1072-a)

## Date

2026-11-05

## What changed

`Execution/_OPEN.md` went from 1,450 open rows to 1,408, and then 1,409 with the new row T1083-a. The A3 done condition (under 250) is not met and A3 stays in progress. 42 rows were moved to `Execution/_OPEN-CLOSED.md` with Status `closed by T1083 (<reason>)`: 23 done already (each with a checked proof) and 19 won't do (retired code, archived docs, a retired workflow, a retired two-repo layout). No row was folded into a ROADMAP item and none was deleted. Every decision and its evidence is in `Execution/P15/T1083-triage.csv`. `scripts/register/apply_decisions.py` now takes `--task` and `--family`, so the same tool applies any task's CSV one family at a time (the default stays T1072).

The result is small because the families T1072 named as still open are mostly still true when checked against the code: the stale `verify_*.mjs` selectors, the Ryanair-era code, the Trips follow-ups and the "call made without the owner" rows are all still open. See "What is still open".

## Files touched

- Created: `Execution/P15/T1083-triage.csv`, `Execution/P15/T1083-register-triage.md`.
- Modified: `Execution/_OPEN.md` (42 rows out, 1 row in), `Execution/_OPEN-CLOSED.md` (42 rows in), `scripts/register/apply_decisions.py` (`--task`, `--family`).

## Commands run

```
python -I scripts/register/triage.py                                        # counts
python -I scripts/register/apply_decisions.py --task T1083 --family <name>  # one commit per family
node node_modules/eslint/bin/eslint.js src                                  # 0 errors, 163 warnings
gh run list --workflow rls-policies.yml                                     # runs 42070487368, 42063066238 success
git grep, git log -S, git ls-files                                          # the proofs in the CSV
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Open rows (after includes the new T1083-a) | 1,450 | 1,409 | -41 |
| Owner rows (Owner `user`) | 490 | 485 | -5 |
| Next-task rows | 960 | 924 | -36 |

Rows per area (keyword grouping by `triage.py`, counted before the new row):

| Area | Before | After |
|---|---|---|
| other | 328 | 321 |
| explore | 197 | 191 |
| cloudflare | 138 | 136 |
| trails | 117 | 117 |
| stays | 89 | 83 |
| plan | 88 | 88 |
| legal | 78 | 76 |
| flights | 64 | 63 |
| pipeline | 63 | 62 |
| supabase | 57 | 56 |
| design | 59 | 49 |
| hetzner | 44 | 44 |
| stripe | 39 | 36 |
| images | 31 | 30 |
| google | 29 | 29 |
| ci | 29 | 27 |

Decisions per family (one commit each):

| Family | Done | Won't do | Rows |
|---|---|---|---|
| lint-baseline (design-lint baseline housekeeping) | 5 | 0 | T196-a, T388-f, T400-f, T462-g, T518-h |
| tests-and-lint (fixed since) | 11 | 0 | T429-i, T463-d, T474-g, T382-h, T089-d, T327-e, T511-b, T911-b, T1032-a, T083-c, T200-f |
| retired-code | 4 | 8 | done: T1021-b, T395-a, T472-j, T283-c; won't do: T392-a, T531-a, T531-d, T562-b, T645-c, T540-c, T576-a, T617-a |
| archived-docs | 0 | 5 | T462-f, T380-d, T505-c, T484-h, T620-d |
| two-repo | 1 | 3 | done: T970-a; won't do: T954-b, T515-b, T372-g |
| register | 0 | 1 | T1034-d (superseded by A3 and T1072-a) |
| pass2 | 2 | 2 | done: T623-a, T508-b; won't do: T509-a, T446-f |

Families checked and left open on purpose:

| Family | Why they stay open |
|---|---|
| stale `verify_*.mjs` harnesses (about 45 rows, T312-a to T1030-b) | 103 scripts exist. The removed selectors the rows name (`.bottom-nav-plus`, `.plan-chooser`, `.shell-pass-btn`, `#sec-rating`, `.xcard`) are still in the scripts and gone from `src/`, so each row is still true. `verify_booked_route.mjs` kills its process tree now (T398-e is half done), `verify_handoffs.mjs` and `verify_trip_page.mjs` do not. No ROADMAP item covers a harness refresh, so none could be folded. The one script that is gone (`verify_no_runtime_fares.mjs`) closed T200-f. |
| Ryanair-era leftovers (T508-a, d, e, f, T511-c, T519-b, T632-j) | `no_ryanair_route`, `.fare-badge`, `tipCatFlights`, `baggage_options`, `ryanair_archive` and the Ryanair fixtures are all still in code or the contract. |
| Trips and carta-unified follow-ups (T143 to T175, about 110 rows) | `generate_trip.py`, `generation_gate.py`, `parseGateway` and the generator tests exist; `trip-validator.yml` runs no generator self-test; `.gitignore` has no `Trips/carta-unified/.../data/generated` line. T1068 fixed the tests, not these rows. |
| Ask Carta follow-ups (T550 to T592, about 60 rows) | The feature is live (`AskSearchFull.jsx` and `browse/ask/` exist); every row is a real unbuilt or unmeasured item. |
| "Call made without the owner" (T856 to T874, 17 rows) | Owner decisions; no later answer is recorded anywhere I could cite. |
| design-v6 surface briefs (T372 to T410, about 80 rows) | They cite briefs now in `archive/`, but they are real unbuilt UI items and ROADMAP G1 rewrites the direction doc, not those builds, so I did not close them as won't do. |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `apply_decisions.py` was hard-wired to the T1072 CSV and status text | written for one pass | added `--task` and `--family`; default behaviour unchanged |
| A path and identifier scan flagged rows whose named files were gone | basename matching can over-match | every candidate was re-checked with `git ls-files`, `git grep` or `git log` before it entered the CSV; the scan found 19 rows and 7 of them closed |
| The run stopped on a network error before the report was written | ENOTFOUND, not a work problem | resumed from the 7 committed families |

## Screens checked

None. No traveller-facing file changed.

## What is still open

- A3 and T1072-a: 1,408 rows against under 250. T1072-a cannot close. Row T1083-a points here.
- Under 250 is not reachable on evidence alone: about 1,160 more rows would have to leave and the pass shows the rest are still true. It would take one of these, each an owner or ROADMAP decision rather than a triage edit:
  1. About 485 owner rows: the 11 procedure files `Execution/P15/_OPEN-*.md` already group them. Keeping one register row per procedure file (11 rows) changes the register rule "one row per open item", so it needs the owner's word.
  2. About 330 next-task rows are cross-surface UI follow-ups from the V3 to V6 design waves (T372 to T466, T574 to T600) and the plan-flow waves (T807 to T874). ROADMAP items per area (Explore, place page, Plan, My trips) that say these follow-ups are re-planned in the D items would make folding honest. The owner writes that text.
  3. About 150 data-lane rows (trails, lakes, mountains, beaches, cycling, stubs) close when the box runs in `_OPEN-explore-data-runs.md` and `_OPEN-data-and-pipeline-runs.md` happen.
  4. One code task that refreshes or retires the stale `verify_*.mjs` scripts would close about 45 harness rows at once.
- Rows I was unsure about and left open: T511-e (`driftGate` is only in a doc comment in `src/auth/admin.js`, not mapped in code, but the RPC may still return it), T805-b (PRODUCT.md has the 5 and 16 day ages, not the 32 day late tier), T536-d (register ids T513-a, T514-a, T514-b exist twice), T227-b (the 2026-11-03 deploy covers the first half, the live privacy page was not shown), T833-a (needs a `css-routes --check` on a fresh dist), T532-a (owner; its R2 bucket step overlaps `_OPEN-stays-box.md`), and the T1072 unsure rows T565-b, T640-a, T805-a, T412-b, T785-a, T069-b, T070-b, T041-b, T200-g, T083-c's sibling checks (none became provable).
- T083-c (owner) closed on rls-policies being green on GitHub in two PR runs. The last pushes to `main` before the P1 batch failed, so confirm `main` goes green after the merge; reopen if not.
- T540-c and T576-a (owner) closed as won't do because T1021 (9a8669edba) and T1074 (6b8b76f9f6) removed live Xotelo beds. If the owner wants a live bed source back, revert the `retired-code` commit.

## Rollback procedure

`git revert` the T1083 commits in reverse order: the final report commit, then `pass2`, `register`, `two-repo`, `archived-docs`, `retired-code`, `tests-and-lint`, `lint-baseline`. Each family is its own commit, so one family can be reverted alone; delete its rows from the CSV with it, or `apply_decisions.py --task T1083` would move them again. Nothing here touches code, data or live systems.
