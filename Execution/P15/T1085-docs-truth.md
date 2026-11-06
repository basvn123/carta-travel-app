# T1085: Docs truth (ROADMAP B2, row T1073-a)

## Date

2026-11-05

## What changed

`docs/REGIONS.md` and `docs/LAKES.md` were rewritten in place from the code (574 and 942 lines of build narrative became about 200 lines each of verified rules, constants and wire fields; paths kept, the `pointers` block and the symbols `check_doc.py` reads are intact). The stale core docs were rewritten as new files from the code instead of from `archive/docs-2026-11/`: `docs/data/pipeline.md`, `coverage.md`, `joins.md`, `trips-layer.md`, `trails.md`, `beaches.md`, `mountains.md`, `photos.md` and `docs/runbooks/backup.md`. The build box docs now say the Hetzner boxes run in production (owner decision 7). Things the code could not confirm are marked "not verified" in each doc. Mismatches found between code, comments and docs are register rows T1085-a to T1085-e.

## Files touched

Rewritten: `docs/REGIONS.md`, `docs/LAKES.md`. Created: the nine files above. Edited: `docs/data/README.md`, `docs/README.md`, `docs/runbooks/README.md`, `docs/runbooks/build-box.md`, `docs/areas/build-box.md`, `Execution/_OPEN.md` (appended), `ROADMAP.md` (B2 status line).

## Commands run

`python pipeline/lakes/check_doc.py` (50 pointers resolve, 0 fail); `python -I scripts/docs/check_entry_points.py` (OK); an ASCII scan of every touched doc (no non ASCII, so no em dashes).

## Config and secrets set

None.

## Before/after measurements

Not measured. (Line counts above are descriptive only.)

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `check_doc.py` failed on `cache/lakes/*_CC.json` and `data/raw/geofabrik/` | those paths are per machine and absent in a cloud checkout | named without backticks, marked "per machine" |

## Screens checked

None (docs only).

## What is still open

T1085-a to T1085-e in `Execution/_OPEN.md`. `verify_regions.mjs` and `verify_lakes.mjs` need a served app and were not run. No stage of the region or lake chain was re-run (no `cache/`, no network). T1073-a and T1073-e are done by this task; they are left in `_OPEN.md` because this session may only append (T1085-e asks the next task to move them).

## Rollback procedure

`git revert` the T1085 commits; docs only, nothing one-way.

## Owner steps (for the checklist)

- [T1085-c] Confirm backups on the live build box | the code cannot show that the box has the keys and that dumps reach R2 | run `rclone lsf r2:carta/archive/db/supabase/` on the box; check `CARTA_BACKUP_KEY` and pg_dump 17+ exist; check R2 lifecycle rules and Supabase's own backup setting | Execution/_OPEN.md
