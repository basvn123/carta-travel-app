# T297 Revert T292: the generated app data goes back into the root repository

## Task ID

T297

## Date

2026-10-02

## What changed

T292 untracked the 48,211 generated files under `continent-app/public` and said `npm run data` (sync-data.mjs) would regenerate them after the merge. That was wrong for most of them. sync-data.mjs writes `app_data.json`, `boot.json`, `dest/`, `poi/`, `fares/` and `country_insights.json`. The rest are the outputs of the pipeline's layer exports: `trails/` (17,716 files), `cycling/` (17,048), `region/` (4,849), `trips/` (3,994), `dossier/` (3,869), `journeys/`, `mountains/`, `lakes/`, `destinfo/`, `beaches/`, `reach/`, `search_index.json`, `poi_credits.json`, `coverage.json`, `country_shapes.json` and `joins.json`. They come from scripts such as `pipeline/trails/export_wire.py`, `pipeline/cycling/build_cycling.py` and `pipeline/regions/export_regions.py`. Several of those need the caches that were removed from the laptop the same afternoon (T293). For these files git was the only working copy on the laptop and the way a fresh clone, such as the stage 7 build box, gets them.

When the T296 chain was merged into main, git removed the untracked files from disk, as the T292 report predicted, and `npm run data` brought back only its own six. A build in that state would have produced a `dist-data/` without the layers, and the prune after the next deploy would then have deleted them from `r2:carta/data/`. Production was never affected: it reads R2, and R2 still holds all 52,310 objects.

This task reverts the untrack. The 48,211 paths are tracked again with their T291-era content. The 23 ignore rules leave the root `.gitignore`. The merge into main writes the files back to disk. Before the merge, the three entries `npm run data` had already recreated (`app_data.json`, `country_insights.json` and the 286 `fares/` files) were compared byte for byte with their tracked versions: all identical. The T292 report and its register edits stay as written. Reports are never edited, and the revert's own deletion of that report was undone before commit. T054-h, closed by T292, is not reopened in place. The live item is now T297-a, which says what has to exist before an untrack can be tried again.

## Files touched

Root repository (branch p1-retrack-public-data, from main):

**Modified:**
- .gitignore (the 23 continent-app/public rules from T292 removed)
- Execution/_OPEN.md (row T297-a added)

**Re-added to the index (the content of commit 18f36e066's parent):**
- 48,211 paths under continent-app/public

**Created:**
- Execution/P1/T297-retrack-public-data.md

## Commands run

```bash
# after the T289-T296 merge and npm run data, the missing entries were listed:
for e in dest poi fares reach region ... joins.json app_data.json; do [ -e continent-app/public/$e ] ...; done
# 15 entries gone, 6 present; the present ones compared with git show 087f25af7:<path>: identical
git worktree add --no-checkout -b p1-retrack-public-data ../wt/t297 main
git revert --no-edit --no-commit 18f36e066
git checkout HEAD -- Execution/_OPEN.md Execution/P1/T292-untrack-public-data.md   # keep the report and the register
```

The merge into main follows this commit (see "What is still open").

## Config and secrets set

None.

## Before/after measurements

| Metric | Before (after the T292 merge) | After | Delta |
|---|---|---|---|
| Tracked files under continent-app/public (root) | 15 | 48,226 | +48,211 |
| Generated data entries present on disk | 6 of 21 | 21 of 21 after the merge | +15 |
| Objects in r2:carta/data/ | 52,310 | 52,310 | 0 (never touched) |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| 15 of 21 generated data entries missing from disk after the merge | T292 untracked pipeline export outputs on the false premise that sync-data.mjs regenerates them | This revert |
| The revert deleted the T292 report and undid its register rows | Both were in the reverted commit | Restored from HEAD before committing; reports are never edited or removed |

## What is still open

T297-a: before `continent-app/public` can leave the root repository, the laptop and the box need another way to get the export layers. Either a pull of `r2:carta/data/` back into `public/` (R2 already holds every one of them), or the exports running on the box with their caches pulled from the archive. That decision belongs to stage 7.

After this branch is merged, `git status` in the root should show no changes under `continent-app/public`, and a split build should stage 17 entries again.

## Rollback procedure

`git revert` this commit, which redoes T292's untrack. Do that only after T297-a is resolved, and run its regeneration path right after the merge.
