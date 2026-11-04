# T1049: Fast track and lean Claude context

## Date

2026-11-04

## What changed

`ROADMAP.md` section 4 now has a **fast track** for weeks where the owner uses the full Claude allowance, about 30 to 40 sessions a week. Under it the build work before launch (102 items, about 190 to 380 sessions plus about 30% rework) fits in 8 to 12 weeks:
- the marketing surface looks finished by Christmas;
- the closed beta runs in January;
- registration as a sole trader moves to about 22 February;
- a quiet public opening follows on about 8 March, in time for summer planning;
- the big campaign stays on 4 May.

The section also states the conditions: the weekly allowance is checked after week 1, the owner needs 2 to 4 hours a day for reviews, research is cut to the essentials (about 10 to 12 days), and the gates stay unchanged. Decision J-b chooses between the normal plan and the fast track.

A new item, **A4 (Claude context, lean and exact)**, runs first in P0. It brings the memory index from 15 KB (303 memory files, many stale) to under 5 KB, corrects CLAUDE.md and MAP.md, trims project skills, removes the stale nested repo, and adds a CI check that fails when CLAUDE.md or MAP.md names a missing path. A1 still removes the redundant files and folders, now explicitly in P0. P3 and P4 goals were aligned with the T1048 late registration.

## Files touched

- Modified: `ROADMAP.md`, `Execution/_OPEN.md` (row T1049-a)
- Created: `Execution/P15/T1049-fast-track-and-claude-context.md`

## Commands run

Read only: sizes of CLAUDE.md, MAP.md and the Claude memory index, the memory and skills file counts, and the remaining roadmap work in sessions (script over `ROADMAP.md`).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Public opening | 4 May | 4 May (normal) or about 8 March (fast track) |
| Memory index loaded per session | 15 KB | target under 5 KB (A4, not yet done) |

## What broke and how it was fixed

No issues.

## Screens checked

None: documentation only.

## What is still open

- T1049-a: decide J-b (normal plan or fast track) after the first full week of work, using the measured Claude allowance and review time.

## Rollback procedure

`git revert` of the T1049 commit. Documentation only.
