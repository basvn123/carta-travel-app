# Incident drill log

Written by `ops/drill/drill.py` (ROADMAP H8, T1160). Local stack only: the live drill is an owner step in `incident.md`.

## Run of 2026-11-07 00:35 UTC

Seeded incident: the trails wire index loses most of its rows after a data push.

| Step | Result | At (s) | What happened |
|---|---|---|---|
| baseline | pass | 0.05 | wire:trails 17619 rows (floor 14000); wire:beaches 2746 rows (floor 2200) |
| break | pass | 0.05 | trails index now reports 900 rows (floor 14000), the shape of a truncated data push |
| detect | pass | 0.05 | wire:trails: trails has 900 rows, below the floor of 14000 |
| page | pass | 0.05 | pager answered 200, received: Carta monitor: 1 check(s) failing. wire:trails: trails has 900 rows, below the floor of 14000 |
| roll back | pass | 0.05 | previous good trails index restored from the last good build |
| verify | pass | 0.05 | wire:trails 17619 rows (floor 14000); wire:beaches 2746 rows (floor 2200) |

Detect to recovered: 0.05 s on the local stack. On the live stack the detector runs every 15 minutes, so the real time to detect is up to 15 minutes plus the owner's reaction time; time it on the live drill.
