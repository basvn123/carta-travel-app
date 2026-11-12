# Run report: remove the stale branches and retire the old session plans

- **Status:** done (one branch left for the owner, see Open issues)
- **Date:** 2026-11-12
- **Level and playbook:** L1 · deep-task follow-up to `.work/2026-11-11-crew-alignment/report.md`
- **Run folder:** `.work/2026-11-12-branch-cleanup/`
- **ROADMAP items:** D15, F2, G5, D24

## Summary
Local `main` was two commits behind GitHub: T1223 (derived routes fit the 4 GB box) had landed on `origin/main`. It is merged in, converted to the crew layout. Five merged branches and two worktrees are removed. The old session plans had three tasks that never ran; each is now a status in its `ROADMAP.md` item. Every `S<n>` session number in live files is replaced by its task ID.

## What was asked
Remove `p15-hello-date`, `p15-auth-settings-close` and `p15-round2`, and fix the old session plans that still used task numbers and `Execution/` paths.

## What we did
1. Checked each branch against `main`. Only `p15-hello-date` had commits `main` lacked: T1223, which was also on `origin/main`.
2. Merged `origin/main` into `main`. Moved the T1223 report to `.work/2026-11-11-derive-routes-memory/report.md` and added an INDEX line. Its two open rows (both engineering follow-ups) went into the D24 status. Regenerated `docs/reference/`.
3. Removed the worktrees `wt/p15-auth-settings-close` and `wt/r2-integration` with `node scripts/worktree.mjs remove` (junctions unlinked, `continent-app/node_modules` kept). Deleted `p15-auth-settings-close`, `p15-round2`, `p15-derive-routes-memory` and `p15-crew-alignment` with `git branch -d`, which refuses unmerged branches.
4. Session plans: 143 tasks were planned in `_NEXT-50-SESSIONS.md`, `_SESSIONS-ROUND-2.md` and `_SESSIONS-ROUND-3.md` (all in git history). 140 have a report. The three that never ran wait on owner steps, and their `ROADMAP.md` items now say so:
   - T1147 (D15 part 2) waits on T1146-a.
   - T1151 (F2) waits on T1149-a and T1149-b.
   - T1177 (G5 part 2) waits on T1111-a.
5. Replaced retired session numbers (S37 to S133) with their task IDs in 20 live files (`sessions_to_tasks.py`, map in `s2t.txt`). The three slots that never ran became the item name. Rewrote the remaining `Execution/` report paths in `docs/owner/` to `report T<n>`.

## Files changed

| File | Change | Why |
|---|---|---|
| `pipeline/trails/derive_routes.py`, `pipeline/trails/way_store.py`, `pipeline/tasks/trails.py`, `tests/test_trail_derive_memory.py`, `tests/fixtures/pipeline_tasks.json`, `infra/hetzner/cron/carta-monthly.service`, `infra/hetzner/cron/carta-quarterly.service`, `infra/hetzner/cron/carta-weekly.service`, `docs/HANDBOOK.md` | From `origin/main` (T1223), unchanged | Merge |
| `.work/2026-11-11-derive-routes-memory/report.md` | T1223 report in the crew layout | Merge |
| `.work/INDEX.md` | T1223 line | History |
| `ROADMAP.md` | D24 follow-ups from T1223; D15, F2 and G5 status name their owner gates | Plan of record |
| `docs/reference/tasks.md`, `docs/reference/python.md`, `docs/reference/app-lib.md`, `docs/reference/openapi.md`, `docs/reference/supabase.md` | Regenerated | `--check` gate |
| `docs/owner/unsorted.md`, `docs/owner/product-decisions.md`, `docs/owner/paid-runs.md`, `docs/owner/pass-subscription.md`, `docs/owner/search-console.md`, `docs/owner/cloudflare.md`, `docs/owner/data-and-pipeline-runs.md`, `docs/owner/hetzner-box.md`, `docs/owner/owner-checks.md`, `docs/owner/supabase-migrations.md`, `docs/owner/translation-review.md` | Session numbers and `Execution/` report paths replaced by task IDs | Retired plans |
| `continent-app/config/ai_models.json`, `continent-app/scripts/eval/adapters/ask.mjs`, `continent-app/scripts/eval/adapters/taxonomy.mjs`, `continent-app/scripts/eval/run.mjs`, `docs/ai/model-card-tagger.md`, `docs/ai/model-strategy.md`, `docs/ai/taxonomy.md`, `docs/data/catalogue-gaps/README.md`, `docs/design/direction.md`, `docs/research/E-R3-models-and-hosting.md`, `infra/hetzner/cax41/trailslab_dump.sh`, `pipeline/catalogue_gaps.py`, `pipeline/taxonomy/carta_taxonomy.yaml`, `pipeline/taxonomy/mapping.yaml`, `pipeline/taxonomy/taxonomy.py`, `scripts/validation/texts_sample.py`, `scripts/validation/trails_external.py` | Session numbers replaced by task IDs (comments and docs only) | Retired plans |

## How it was checked
- `python -I scripts/docs/check_entry_points.py` → OK, 292 paths
- `python -m pytest tests/test_trail_derive_memory.py tests/test_docs_drift.py` → T1223 tests pass; the 3 drift failures are the ones `main` already had
- `python -m pytest tests/test_catalogue_gaps.py tests/test_taxonomy*.py` → 47 passed
- `node --test tests/*taxonomy*.test.mjs` → 12 passed, 1 failed (`yaml` missing in the isolated Python; also failing before)
- ruff → clean; `build_reference.py --check` → ok
- `git merge-base --is-ancestor <branch> main` → all removed branches merged

## Open issues and risks
- `p15-hello-date` and its worktree `C:/Users/Gebruiker/Documents/Portfolio/wt/hello-date` are still there. The branch is fully merged, but the worktree has two untracked practice files (`hello.py`, `tests/test_hello.py`), and the permission check blocked the forced removal. Owner: `node scripts/worktree.mjs remove hello-date --force`, then `git branch -d p15-hello-date`.
- 92 other local `p15-*` branches are all merged into `main` and can be deleted with `git branch -d`. Two non-`p15` branches, `explore-v4` and `p0-next-steps-docs`, hold unmerged work: not touched.
- Local `main` is ahead of `origin/main`: nothing is pushed (owner).

## Next steps
- Owner: push `main` and the tag `archive/execution-2026-11-11`.
