# T476: owner calls on T475 recorded

> Renumbered on 2026-10-21 by T477: this task first ran as T471 on branch `p11-owner-calls-t470`, in parallel with the T471 on main. Task, register and roadmap numbers below are the new ones (T470 to T475, T471 to T476, plan file 2.14 to 2.22, roadmap rows per T477). Content is otherwise unchanged.

## Task ID

T476

## Date

2026-10-20

## What changed

The owner answered three of T475's five calls on 20 October, and this task wrote them into the plan file, the roadmap and the register.

- **T475-b, guests may create a vote.** The owner wrote "guests can vote". Voting without an account was already in the plan, so this is read as guests may also create a vote. The plan now gives a guest creator a separate manage link with its own secret code, kept on the device, to close or revoke the vote. It also adds abuse limits: a cap per device and per IP (for example five votes a day), 30 days validity by default, and no extension for guest votes.
- **T475-c, the headline price is the total.** Cards and lists show the total for your group and dates, with the per-person day price underneath. Without a budget or dates, they show the total for the default trip (2 people, 7 nights). This also answers part of roadmap 1.8.
- **T475-d, a default buffer.** The total budget search adds a 10% buffer by default, visible and editable.

No code changed.

## Files touched

**Modified:**
- Roadmap/2.22-budget-vervoer-dag-delen.md
- Roadmap/Carta roadmap.md
- Execution/_OPEN.md

**Created:**
- Execution/P11/T476-owner-calls-t470.md

**Deleted:**
- None

## Commands run

Edits in the sparse worktree ../wt/t470 on branch p11-renumber-t475, branched from T475 (02b7ca841). The register rows were flipped with a short Python script that keeps the CRLF line endings.

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

No issues.

## What is still open

T475-a (the Flix and Trainline affiliate sign-ups) and T475-e (Hetzner capacity for MOTIS) remain open with the owner. If "guests can vote" was meant only as confirming that voting needs no account, revert the T475-b part. The plan then goes back to creating a vote with an account only.

## Rollback procedure

`git revert` the T476 commit. It touches only the two roadmap files, this report and three register rows.
