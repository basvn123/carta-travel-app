# T026 Reclaim .git via history rewrite, gated

## Task ID

T026

## Date

2026-09-23

## What changed

Nothing in git history, and nothing on disk except this report. The task was gated on manual approval and a verified backup, neither of which existed in this session, so the work was a read-only measurement of what a purge would actually buy, followed by a written execution runbook and an explicit deferral.

The measurement changed the shape of the task. The premise was that about 3.1 GB of `.git` is legacy generated JSON blobs that a `git filter-repo` purge would erase. That is not what the 3.2 GB is made of. Broken down: 1.83 GB of blobs live in the pack files, 833 MB is the Git LFS object cache which filter-repo does not touch at all, and the rest is index, refs and logs. Of the 1.83 GB of packed blobs, only 1.18 GB is reachable from any ref. The other 653 MB is sixty unreachable blobs that no commit points at any more, and those need no history rewrite whatsoever, only a prune.

So the single largest win available here, 653 MB, is not a history rewrite. It is garbage collection. The second largest, 248 MB, is `git lfs prune`. Together they are 901 MB of the 3.2 GB, recoverable with two non-destructive commands that leave every commit hash intact. The actual history rewrite, the destructive part that mutates 516 commit hashes and forces a force-push, is worth 117 MB on its own today, and about 1.13 GB if it is run after T025 untracks `continent-app/public`. Neither figure reaches 3.1 GB. The honest ceiling for the whole operation, prune plus LFS prune plus the maximal post-T025 purge, is about 2.03 GB.

The recommendation is to defer the rewrite and to run the two prunes instead, as a separate task, because they get 44 percent of the theoretical maximum at zero risk.

## Files touched

**Modified:**
- None.

**Created:**
- `Execution/P1/T026-git-history-rewrite.md`, this report.

**Deleted:**
- None.

## What the 3.2 GB is actually made of

This is the part worth keeping, because the number is cited in the plan and it is wrong in a way that matters.

| Component | Size | Reclaimed by |
|---|---|---|
| Packed blobs, reachable from a ref | 1,179 MB | history rewrite only |
| Packed blobs, unreachable | 653 MB | `git gc --prune` |
| Git LFS object cache (`.git/lfs`) | 833 MB | `git lfs prune` |
| Loose objects | 507 MB, 1,056 objects | `git gc` |
| Trees and commits | 6 MB | nothing, and no reason to |
| Index, refs, logs | 6 MB | nothing |

The loose-object figure overlaps the others; `git count-objects -vH` counts loose objects separately from the packs, and most of them will be folded into a pack or dropped by the next `gc`. The thirteen separate pack files are the reason there is so much loose and unconsolidated data: the repository has never had a full `gc`, so each fetch and repack left its own pack behind. Object counts per pack sum exactly to the deduplicated in-pack total, so there is no cross-pack duplication, which is worth knowing because it rules out the most tempting explanation for the gap.

The 653 MB of unreachable blobs are WorldClim climate rasters, `wc2.1_5m_tmin_01.tif` and its siblings, plus a run of 10 MB GeoTIFFs. That layer was retired in favour of NASA POWER. The files were committed raw, later removed, and the commits that held them are no longer reachable, but the blobs are still sitting in the packs because nothing has ever pruned them. Two of the largest are 122 MB and 120 MB single objects.

## Top path prefixes by packed size

Sizes are true packed bytes from `git verify-pack -v`, not `%(objectsize:disk)` from `cat-file --batch-check`. That distinction matters and cost time to find. The `objectsize:disk` field under-reports for objects that other objects delta against, and aggregating it gave 1,206 MB against verify-pack's true 1,831 MB. Use verify-pack if you redo this.

Each unique blob is attributed to the first path it was seen at, so a blob is never counted twice. "At HEAD" means the blob is still in the current tree, and a purge keeps it unless the path is untracked first. "History only" means it exists solely in older commits and a purge removes it outright.

| Prefix | Blobs | Packed MB | At HEAD MB | History only MB |
|---|---|---|---|---|
| continent-app/public/cycling/ | 52,519 | 428.7 | 139.8 | 288.9 |
| continent-app/public/trails/ | 54,594 | 359.8 | 123.3 | 236.6 |
| continent-app/public/dossier/ | 32,536 | 109.3 | 13.2 | 96.1 |
| cache/ | 203 | 43.3 | 1.3 | 42.0 |
| continent-app/public/trips/ | 14,157 | 40.2 | 11.2 | 29.0 |
| continent-app/public/activities_full.json | 26 | 36.2 | 0.0 | 36.2 |
| app_data/ | 76 | 30.7 | 0.2 | 30.5 |
| continent-app/public/region/ | 24,245 | 26.5 | 5.7 | 20.8 |
| continent-app/public/app_data.json | 50 | 22.9 | 0.0 | 22.9 |
| data/derived/ | 19 | 12.2 | 7.7 | 4.5 |
| continent-app/public/fares/ | 1,926 | 11.9 | 4.1 | 7.8 |
| continent-app/src/ | 2,275 | 9.0 | 0.6 | 8.4 |
| continent-app/public/beaches/ | 534 | 7.0 | 1.1 | 5.9 |
| continent-app/tests/ | 14 | 6.4 | 0.0 | 6.4 |
| Trips/carta-unified/ | 274 | 4.9 | 4.9 | 0.0 |

Reachable totals across every prefix: 1,178.7 MB packed, of which 327.0 MB is live at HEAD and 851.7 MB exists only in history.

One reading of that table is the whole argument for doing T025 first. Cycling and trails together are 788 MB, but 263 MB of that is the copy currently in the tree. A purge run today would have to keep those bytes, because filter-repo removing a path removes it from the working tree too, and `public/` is what production serves.

## The two scenarios, and why neither reaches 3.1 GB

Scenario A purges only paths that are already untracked or gitignored at HEAD, so nothing live is touched: `continent-app/public/activities_full.json`, `continent-app/public/features/`, `cache/lakes/`, `cache/beaches/`, plus the `cache/` and `app_data/` blobs that exist only in history from before those paths were migrated to LFS. Those pre-migration blobs are raw JSON, not pointers, so they are real bytes.

Scenario B is scenario A plus every generated directory under `continent-app/public`: cycling, trails, dossier, trips, region, fares, beaches, lakes, mountains, journeys, destinfo and `app_data.json`. It is only valid after T025 has actually untracked `public/`, because until then those files are the deploy.

| Scenario | Reclaim |
|---|---|
| `git gc --prune` alone, no rewrite | 653 MB |
| `git lfs prune` alone, no rewrite | 248 MB |
| A, the rewrite part only | 117 MB |
| A total, including both prunes | 1,018 MB |
| B, the rewrite part only | 1,131 MB |
| B total, including both prunes | 2,032 MB |

Scenario B's rewrite figure assumes the purge removes all 1,014 MB under those prefixes including the 301 MB live at HEAD, which is only true once T025 has untracked them. If T025 never runs, B collapses to roughly B-minus-301 MB.

Neither scenario reaches 3.1 GB, and the full theoretical maximum of 2.03 GB requires doing all four things. The 3.1 GB in the task title appears to have been the size of `.git` minus something, rather than a measured purge yield. Plan on 2 GB as the best case and 1 GB as the realistic case.

## What depends on this repository's hashes

The remote is `https://github.com/basvn123/carta-travel-app.git`, one remote, origin. There are 22 local branches, 33 refs in total, and 8 remote-tracking branches. A rewrite touches all 516 commits, because the oldest commit dated 2026-06-08 is within the range that touches the purge paths, and filter-repo rewrites everything downstream of the earliest change regardless.

The production tag is the sharpest dependency. `prod-2026-09` is an annotated tag, object `d32a0763`, pointing at commit `8b53babed`. CLAUDE.md names that commit twice as the rollback point, once in the body and once in the footer, and `Execution/P0/T003-git-baseline.md` cites it four more times. A rewrite changes `8b53babed` to a new hash. The tag must be recreated against the rewritten commit, and CLAUDE.md and T003 then carry a hash that no longer resolves. CLAUDE.md can be corrected, but T003 is a closed report and the working rules say a report is never updated after the task is closed, so the correct move is to leave T003 alone and note the mapping in the new report.

Other hashes cited in Execution reports that would go stale: `4b8c7d996` in T002, `5e6767ab`, `a8ea1a9b`, `f9f12c3f`, `bd25c617` and `00188a52` in T006, and `d5210ce` in T020. Seven references across four closed reports. None of them are load-bearing for any running system; they are provenance notes in prose. They go stale and that is an accepted cost, recorded here so nobody spends an afternoon in six months wondering why `git show 5e6767ab` fails.

Vercel deploys from the GitHub repository, and production there is a manually promoted deployment, not an automatic one. A force-push produces Preview deployments only, so production does not move and nothing breaks at the moment of the push. Old deployments in the Vercel dashboard reference commit hashes that no longer exist in the repository, which makes their "view source" links dead but does not affect the built artifacts, which are already stored. This is harmless. The one thing to avoid is promoting an old deployment after the rewrite without checking what it actually contains, because its hash is no longer verifiable against the repo.

Three remote branches under `claude/` were created by Claude Code web sessions: `claude/explore-page-redesign-pdf-7ly6hy`, `claude/trails-destinations-cycling-ui-czpunu` and `claude/trip-planner-ux-refinement-i78m8t`. They have no local counterparts. A rewrite in a fresh clone will rewrite them too if they are fetched, but if they are not fetched they are simply orphaned on the remote, pointing at commits that the rewritten history no longer contains. Decide before the rewrite whether they hold anything wanted. If they do, fetch them into the clone before running filter-repo so they are rewritten with everything else. If they do not, delete them on GitHub first, which is cleaner than leaving dangling refs that keep the old objects alive server-side.

The nested repository at `continent-app/.git` is a separate repository with no remote, 15 commits and 39 MB. A rewrite of the root repository does not touch it, because the root tracks `continent-app/` as ordinary files and has no submodule relationship to it. It must be preserved by hand across the re-clone, which the runbook covers.

## Backup procedure

Do not skip this and do not compress it into one command. The mirror is the only thing standing between a mistyped path filter and eight months of work.

```bash
cd /c/Users/Gebruiker/Documents/Portfolio
git clone --mirror "Travel App/.git" carta-backup-2026-09-23.git
cp -r "Travel App/.git/lfs" carta-backup-2026-09-23.git/lfs
```

The LFS copy is separate because `clone --mirror` does not bring the LFS object cache, and 833 MB of it is not recoverable from GitHub if the remote copies are ever pruned. Then take a plain byte copy of the whole `.git` as a second line of defence, because a mirror is a logical copy and will not preserve a corrupt-but-working state:

```bash
cp -r "Travel App/.git" carta-gitdir-copy-2026-09-23
```

Verification, all three of these, before touching anything:

```bash
git -C carta-backup-2026-09-23.git fsck --full
git -C "Travel App" rev-list --all --count
git -C carta-backup-2026-09-23.git rev-list --all --count
git -C "Travel App" for-each-ref --format='%(objectname) %(refname)' | sort > /tmp/src-refs.txt
git -C carta-backup-2026-09-23.git for-each-ref --format='%(objectname) %(refname)' | sort > /tmp/bak-refs.txt
diff /tmp/src-refs.txt /tmp/bak-refs.txt && echo "refs identical"
```

The commit counts must both read 516 and the ref diff must be empty. `fsck --full` must report no missing or dangling errors beyond the known unreachable blobs, which it will list as dangling and which are expected.

Space needed: about 3.2 GB for the mirror plus LFS, and another 3.2 GB for the plain copy, so 6.5 GB. C: has 29 GB free, not the 35 GB the task assumed, at 95 percent full. That is enough but not comfortable. If it is tight, take the mirror to an external drive instead, which is better practice anyway since a backup on the same disk does not survive the failure mode that actually loses repositories.

No backup was created in this session. Creating a mirror clone is not itself destructive, but it is 3 GB written to a disk at 95 percent, and the task asked for a gate, so it belongs to execution.

## Execution runbook

Run this in one sitting with the user at the keyboard. It is not resumable halfway.

Step 0, preconditions. T054 has landed and the shards are served from R2. T025 has actually run, so `continent-app/public` is untracked and gitignored. The backup above exists and all three verifications passed. Every local branch is either merged or intentionally being carried through the rewrite, and nothing is uncommitted that matters.

Step 1, install filter-repo. It is not installed.

```bash
pip install --user git-filter-repo
python -m git_filter_repo --version
```

Remove it afterwards with `pip uninstall git-filter-repo` if you would rather not keep it.

Step 2, work in a fresh clone. filter-repo refuses to run in a repository with unstaged changes or extra remotes, and running it in the working tree is how people lose things.

```bash
cd /c/Users/Gebruiker/Documents/Portfolio
git clone "Travel App/.git" carta-rewrite
cd carta-rewrite
git fetch origin 'refs/heads/*:refs/remotes/origin/*'
```

If the three `claude/*` branches are being kept, create local branches for them now, because filter-repo only rewrites local refs.

Step 3, the purge. Write the path list to a file rather than passing thirty `--path` flags, which is easier to review and easier to get right.

```bash
cat > /tmp/purge-paths.txt <<'EOF'
continent-app/public/cycling/
continent-app/public/trails/
continent-app/public/dossier/
continent-app/public/trips/
continent-app/public/region/
continent-app/public/fares/
continent-app/public/beaches/
continent-app/public/lakes/
continent-app/public/mountains/
continent-app/public/journeys/
continent-app/public/destinfo/
continent-app/public/features/
continent-app/public/app_data.json
continent-app/public/activities_full.json
cache/lakes/
cache/beaches/
EOF

python -m git_filter_repo --invert-paths --paths-from-file /tmp/purge-paths.txt --force
```

`--invert-paths` means "remove these", the opposite of the default which keeps only what is listed. Get that backwards and you delete the entire repository except the data. Read the path file twice.

This is scenario B. For scenario A, cut the list to the last four entries plus `continent-app/public/features/`.

Note what this does not do. `cache/*.json` and `app_data/*.json` at the top level are LFS-tracked at HEAD and must not be purged, because they are live pipeline inputs. Their pre-LFS raw blobs in history are worth 76 MB, and removing those specifically would need a `--blob-callback` keyed on size rather than a path filter, which is more machinery than 76 MB justifies. Leave them.

Step 4, re-tag production. filter-repo rewrites annotated tags automatically and writes `.git/filter-repo/commit-map`, which maps every old hash to its new one. Find the new hash for `8b53babed` there and confirm the tag followed:

```bash
grep '^8b53babed' .git/filter-repo/commit-map
git rev-list -n1 prod-2026-09
```

If the tag did not survive, recreate it against the mapped hash with `git tag -a prod-2026-09 <newhash> -m 'Production baseline, re-tagged after T026 history rewrite'`.

Step 5, prune. Now, and only now, because this is the step that actually frees the bytes. filter-repo runs `gc` itself, but not the LFS side.

```bash
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git lfs prune
du -sh .git
```

Step 6, push. filter-repo deliberately removes `origin` so you cannot force-push by accident. Add it back and push everything.

```bash
git remote add origin https://github.com/basvn123/carta-travel-app.git
git push --force --all origin
git push --force --tags origin
```

GitHub keeps the old objects server-side for a while and will not shrink its copy immediately. That is normal and it does not undo anything.

Step 7, rebuild the working directory. The old working tree cannot be reused; its objects no longer exist.

```bash
cd /c/Users/Gebruiker/Documents/Portfolio
mv "Travel App" "Travel App.old"
git clone https://github.com/basvn123/carta-travel-app.git "Travel App"
```

Then carry across, from `Travel App.old`, the things that are not in git. The nested repository first, because a fresh clone of the root does not contain it and it is a separate repository with 15 commits and no remote:

```bash
cp -r "Travel App.old/continent-app/.git" "Travel App/continent-app/.git"
```

Then the gitignored working data, which is large and not in the remote: `app_data/`, `cache/`, `data/`, `continent-app/public/` and anything else the root `.gitignore` excludes. Then `node_modules` or reinstall it.

Then the uncommitted work that sits in the tree today and belongs to other tasks. As of this report that is one modified file, `continent-app/package.json`, and eight untracked paths: `additional docs/`, `continent-app/public/_headers`, `continent-app/public/_redirects`, `continent-app/reports/perf_baseline_T011.json`, `continent-app/scripts/check-pages-limits.mjs`, `continent-app/scripts/perf/baseline_vitals.mjs`, `continent-app/scripts/verify_data_export.mjs` and `continent-app/wrangler.toml`. Re-check `git status` immediately before the rewrite, because that list will have changed.

Step 8, post-checks. Commit count must still be 516. Every branch must still exist. The app must still build.

```bash
git rev-list --all --count
git branch -a
git lfs ls-files | wc -l
cd continent-app && npm ci && npm run build
```

Confirm the tag resolves, confirm `git log` reads sanely back to the oldest commit, and confirm no purged path reappears with `git log --all --oneline -- continent-app/public/trails | head`, which should print nothing under scenario B.

Keep `Travel App.old` and the mirror for at least two weeks.

## Commands run

Read-only measurement only. Nothing wrote to history, no object was pruned, no ref was moved, nothing was pushed.

```bash
du -sh .git
git count-objects -vH
git rev-list --all --count
git branch -a
git remote -v
git tag
cat .gitattributes
git lfs version
git lfs ls-files -s
du -sh .git/* .git/lfs/*

git rev-list --objects --all > objs.txt
cut -d' ' -f1 objs.txt | git cat-file --batch-check='%(objectname) %(objecttype) %(objectsize) %(objectsize:disk)' > sizes.txt
git ls-tree -r HEAD --format='%(objectname)' > head_blobs.txt
for p in .git/objects/pack/*.idx; do git verify-pack -v "$p"; done > vpblobs.txt
python agg.py

git check-ignore -v cache/lakes cache/beaches continent-app/public/activities_full.json
grep -rnoE '\b[0-9a-f]{7,40}\b' Execution/ CLAUDE.md
git rev-parse prod-2026-09
df -h /c

git checkout -b p1-git-history-rewrite
```

`agg.py` is the aggregation script that joins object names to packed sizes and groups by path prefix. It lives in the session scratchpad, not in the repository, because this task names no code files. It is twenty lines and is easier to rewrite than to find; the method is in the paragraph above the prefix table.

## Config and secrets set

None. `git-filter-repo` was not installed, because plain plumbing answered every question the task asked. Nothing needs uninstalling.

## Before/after measurements

No change was made, so every after value equals its before value. The before column is the baseline any future execution measures against.

| Metric | Before | After | Delta |
|---|---|---|---|
| .git total size | 3.2 GB | not changed | 0 |
| Packed blobs, true size | 1,831 MB | not changed | 0 |
| Packed blobs reachable from a ref | 1,179 MB | not changed | 0 |
| Packed blobs unreachable | 653 MB | not changed | 0 |
| .git/lfs object cache | 833 MB | not changed | 0 |
| LFS objects not referenced at HEAD | 248 MB | not changed | 0 |
| Pack files | 13 | not changed | 0 |
| Commits across all refs | 516 | not changed | 0 |
| Refs total | 33 | not changed | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Aggregated blob sizes came to 1,206 MB against 1,831 MB of packed blobs | `%(objectsize:disk)` from `cat-file --batch-check` under-reports for objects that serve as delta bases | Re-ran the aggregation against `git verify-pack -v`, whose size column is the true packed byte count |
| The 3.1 GB target did not match any measurable component | The figure counted `.git` as if it were all purgeable generated JSON, but 833 MB is the LFS cache and 653 MB is unreachable garbage, neither of which a path purge touches | Reported the measured ceiling of 2.03 GB instead, and split the win into the parts that need a rewrite and the parts that do not |

## What is still open

The rewrite itself, deferred. The reasoning, in order.

The task is optional by its own text, and it says so: T025 gets most of the benefit with none of the risk. T025 is blocked on T054, which moves the data shards to R2, so `continent-app/public` is still tracked and still the thing production serves. A purge run before that untrack recovers scenario A, 117 MB of rewrite value, and then regrows the same blobs on the next commit because the files are still in the index. That is the worst combination available: all of the disruption, almost none of the payoff.

The user was not present in this session and the gate required an explicit approval that could not be given. That alone settles it.

Schedule it after T054 has landed and after T025 has actually untracked `public/`, in one sitting, with the user at the keyboard, following the runbook above. Before that day, decide what to do with the three `claude/*` remote branches, because they are the only refs whose fate the runbook cannot decide on its own.

What would change the recommendation. If GitHub starts warning on repository size or refusing pushes, the rewrite stops being optional. GitHub warns above 1 GB and treats 5 GB as a hard problem; the remote's own packed size is under that today but the trend is upward while `public/` stays tracked. If the repository has to be cloned onto a new machine or a CI runner regularly, the clone time becomes the argument rather than the disk.

The separate, better-value task that this measurement uncovered, and which is not part of T026. Running `git reflog expire --expire=now --all`, `git gc --prune=now --aggressive` and `git lfs prune` reclaims roughly 901 MB, does not mutate a single commit hash, needs no force-push, no re-clone and no re-tagging, and consolidates the thirteen pack files into one. It should be its own task with its own report. It still deserves a backup first, because `reflog expire` discards the safety net that would otherwise let a mistake be undone, and it should be run when nothing else is touching the repository. That is the thing to do next, not this.

The 76 MB of pre-LFS raw `cache/` and `app_data/` blobs in history. A path filter cannot remove them without also removing the live LFS-tracked files at those paths. Removing them specifically needs a size-keyed `--blob-callback`. Noted and not pursued; 76 MB does not justify the extra machinery or the extra way to get it wrong.

## Rollback procedure

Nothing was changed, so there is nothing to undo. If the branch should not exist:

```bash
git checkout p1-untrack-build-artifacts
git branch -D p1-git-history-rewrite
```

If the rewrite is later executed and has to be reversed, the mirror backup is the whole rollback and it is complete, provided it was verified before the rewrite. From the mirror, push everything back over the top:

```bash
cd /c/Users/Gebruiker/Documents/Portfolio/carta-backup-2026-09-23.git
git push --mirror https://github.com/basvn123/carta-travel-app.git
```

`--mirror` makes the remote match the backup exactly, including deleting any ref the backup does not have, which is what restores the original hashes and removes the rewritten ones. Then replace the working directory:

```bash
cd /c/Users/Gebruiker/Documents/Portfolio
rm -rf "Travel App"
git clone https://github.com/basvn123/carta-travel-app.git "Travel App"
cp -r carta-backup-2026-09-23.git/lfs "Travel App/.git/lfs"
```

Then restore the gitignored working data and the nested `continent-app/.git` from `Travel App.old` exactly as in step 7 of the runbook, which is why that directory is kept for two weeks.

The one thing that is not recoverable is anything committed to the rewritten history after the force-push and before the rollback. The mirror is a snapshot; work done after it was taken is not in it. Do not commit against rewritten history until the rewrite is confirmed good.
