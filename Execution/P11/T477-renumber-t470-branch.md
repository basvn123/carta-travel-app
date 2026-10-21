# T477: the parallel T470 and T471 renumbered to T475 and T476 and merged

## Task ID

T477

## Date

2026-10-21

## What changed

Two sessions both wrote a T470 and a T471 on 20 October. Main carries the season owner calls (T470) and the cost and logistics audit (T471). Branch `p11-owner-calls-t470` (worktree `wt/t470`, cut from T469 at `fc1ea0a68`) carries a different T470, the total budget, transit, day planner and group vote audit, and a T471 that records the owner calls on it. That branch was never merged, because it would have doubled two report numbers and ten register IDs. It also reused roadmap numbers that main had already taken: its plan file was `Roadmap/2.14-...` next to main's `2.14-kosten-en-logistiek.md`, and its twelve new roadmap rows sat on numbers main had filled with different content. This task gives the branch's work free numbers and lands it on main. T470 becomes T475 and T471 becomes T476, register rows T470-a to j become T475-a to j (b, c and d closed by T476), and the plan file is now `Roadmap/2.22-budget-vervoer-dag-delen.md`. The roadmap rows moved 1.12 and 1.13 to 1.19 and 1.20, 2.14 to 2.16 to 2.22 to 2.24, 3.10 to 3.11, 4.13 to 4.15 to 4.22 to 4.24, and 5.9 to 5.11 to 5.13 to 5.15. They are inserted after main's last row in each phase, and the branch's extension of 5.1 is applied to main's 5.1, keeping main's weeks. Each new row number is added to main's week plan in the week the branch gave it, and the intros for phases 2 and 4 got the branch's sentence, with phase 4 now counting 24 rows. The two reports keep their content and carry a one-line renumber note at the top. The script was a single regex pass (each old number maps once, so 1.12 cannot chain on to 1.19 and further), and every match in the three files was checked to be a row reference before it ran.

## Files touched

**Modified:**
- Execution/_OPEN.md
- Roadmap/Carta roadmap.md

**Created:**
- Execution/P11/T475-budget-transit-share-roadmap.md
- Execution/P11/T476-owner-calls-t475.md
- Execution/P11/T477-renumber-t470-branch.md
- Roadmap/2.22-budget-vervoer-dag-delen.md

## Commands run

```
git worktree add -b p11-renumber-t475 ../wt/t475 main
git show 4b2f6bfb7:<path> > scratchpad/src/...   (the three branch files, its roadmap, its T470/T471 register rows)
python -I scratchpad/renumber.py .
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Task numbers used twice across branches | 2 (T470, T471) | 0 | -2 |
| Roadmap row numbers used twice | 12 | 0 | -12 |
| Unmerged audit branches | 1 | 0 | -1 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A week plan item landed inside "(delen zonder account; besluit T472-d vooraf)" in W13 | The focus cell was split on the first "; ", which sat inside parentheses | Split only on a "; " at parenthesis depth zero |

## What is still open

The two audits were written in parallel, so six pairs of rows now cover the same ground from two sides. Main's 1.12 (cost and logistics design) and the new 1.19 (budget search design) overlap. So do main's 2.16 (the graph with MOTIS on the box) and 3.11 (MOTIS for Italy), main's 4.15 (every ride with time and cost) and 4.23 (legs in the trip planner), main's 4.19 (tickets in the day total) and 2.23 (POI facts with ticket prices), main's 4.16 and 4.18 (day planner and one workspace) and 4.24 (the new day flow), and main's 5.12 (sharing without an account) and 5.13 (group vote). One pair conflicts outright. T476 decided the budget search runs with a 10% buffer by default (T475-d), while T472-e proposes the buffer as the traveller's own line, off by default. The register's two MOTIS owner calls, T471-d and T475-e, ask the same Hetzner question. Merging or ordering these rows is a roadmap call for the owner (T477-a). The old branch `p11-owner-calls-t470` and worktree `wt/t470` are left in place, since nothing points at them now; remove them with `git worktree remove ../wt/t470` and `git branch -D p11-owner-calls-t470` once this is merged (T477-b).

## Rollback procedure

`git revert <T477 commit>` on main removes the four new files and the inserted rows. The original work stays untouched on branch `p11-owner-calls-t470` at `4b2f6bfb7` until T477-b deletes it.
