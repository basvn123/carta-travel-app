---
status: accepted
date: 2026-11-11
decided-by: Bas, with Claude
run: .work/2026-11-11-crew-alignment/
---

# 0003 · Open items: owner steps in `docs/owner/`, follow-ups in `ROADMAP.md`

## Context
`Execution/_OPEN.md` had grown to 2,106 open rows (523 KB) plus 1,490 closed ones, because every "what is still open" bullet of every report became a row. 766 rows were owner-only actions (dashboards, secrets, migration pastes, product decisions); 465 of those were already grouped into procedure files per system. The other 1,340 rows were engineering findings, many years of tasks old and never picked up; earlier triage passes (T1072, T1083, T1116) did not stop the growth.

## Options considered
1. **Keep the register.** It keeps growing and costs every session that greps it.
2. **Convert all 2,106 rows to a new file.** Same bloat under a new name.
3. **Keep only what someone will act on:** owner steps where the owner works, engineering follow-ups inside the plan.

## Decision
We chose **option 3**:
- Owner-only steps live in `docs/owner/`, one file per system (the old `_OPEN-<system>.md` procedures, moved), plus `docs/owner/unsorted.md` for the 302 owner rows no procedure covered. `docs/owner/README.md` is the index. A done step is deleted from its file.
- Engineering follow-ups go into the matching `ROADMAP.md` item (a new line or a new item). A run's "Open issues" section in `report.md` names where each follow-up went.
- The 1,340 old engineering rows stay in git: `git show archive/execution-2026-11-11:Execution/_OPEN.md | grep "next task"`. Three superseded procedures (Stripe launch, Gemini billing, old Hetzner) were removed; their live steps were already in `docs/owner/stripe.md`, `docs/owner/google-and-search.md` and `docs/owner/hetzner-box.md`.

## Consequences
- Good: the owner's to-do list is one folder; no session greps half a megabyte of stale rows.
- Bad: an old engineering finding that was real is out of view until someone greps the tag or meets the bug again. Accepted: rows that sat unclaimed for hundreds of tasks were not being worked anyway.

## How we'll know it works
`docs/owner/` shrinks over time, and no new backlog file appears outside `ROADMAP.md`.
