# T025 Untrack generated build artifacts from git

## Task ID

T025

## Date

2026-09-23

## What changed

Nothing in the tree. The task's own precondition, that Vercel builds and sync-data.mjs must not rely on the tracked copies of `continent-app/public`, does not hold, so the untrack was not run. This report records the evidence, the measurements the untrack would move, the exact commands to run when the precondition is met, and one production defect the verification uncovered on the way.

The short version of why it is blocked. The app's boot payload is `continent-app/public/app_data.json`, written by `scripts/sync-data.mjs` from the pipeline master `app_data/app_data.json` at the repository root. The master is gitignored, deliberately, because it is about 50 MB and rewritten whole on every pipeline run. Vercel builds from a fresh checkout of the GitHub repository, so it has no master. When the master is absent, sync-data prints one warning and exits zero, leaving whatever is already in `public/` in place. Today that is the tracked copy, and that is the only reason production has a catalogue at all. Untrack `public/` and the next Vercel build ships a shell with no data behind it.

Production proves the same thing from the outside. The tracked `app_data.json` is served from carta-europetravel.com at 12.5 MB. The per-destination POI shards under `public/poi/`, which are written by the same script but are not tracked at the root, return 404 from the same host. The tracked files are the deploy.

## Files touched

**Modified:**
- None.

**Created:**
- `Execution/P1/T025-untrack-build-artifacts.md`, this report.

**Deleted:**
- None.

## How the two repositories relate

There are two nested git repositories, and the untrack only concerns one of them. The root repository (remote github.com/basvn123/carta-travel-app, 3.2 GB of `.git`) tracks the whole of `continent-app/` as ordinary files, including 48,222 files under `continent-app/public`. The inner repository at `continent-app/.git` (39 MB, no remote) tracks 458 files and only 15 under `public/`: favicons, fonts, the web manifest, robots.txt, the service worker, and the two Cloudflare files from T024. The inner `.gitignore` already lists every generated subdirectory.

The root repository honours that inner `.gitignore` too, because git reads ignore files in every directory of the tree. That is why `public/poi/` and `public/activities_full.json` are not tracked at the root: they were created after the ignore rules were written. The 48,222 files that are tracked predate those rules, and an ignore rule never removes a file that is already in the index. So the root index is a snapshot of which layers existed on the day each rule was added, not a decision about what belongs in git.

The tracked set, by top-level entry under `continent-app/public`:

| Entry | Tracked files |
|---|---|
| trails/ | 17,716 |
| cycling/ | 17,048 |
| region/ | 4,849 |
| trips/ | 3,994 |
| dossier/ | 3,867 |
| fares/ | 286 |
| journeys/ | 264 |
| mountains/ | 46 |
| lakes/ | 45 |
| destinfo/ | 44 |
| beaches/ | 41 |
| fonts/ | 4 |
| root files (app_data.json, coverage.json, search_index.json, joins.json and the rest) | 18 |

Not tracked at the root, because the inner ignore rules predate them: `poi/` (3,865 files locally), `activities_full.json`, `reach/`.

## How the build depends on the tracked copies

`continent-app/package.json` runs `scripts/sync-data.mjs` as the `prebuild` hook, so `npm run build` on Vercel runs it before Vite. The script resolves the master at `../app_data/app_data.json`, and its first real statement is a guard:

```javascript
if (!existsSync(src)) {
  console.warn(`[sync-data] real dataset not found at ${src} - keeping existing public/app_data.json`);
  process.exit(0);
}
```

The guard exists so a fresh clone without pipeline output still builds. It is correct for a developer machine. On Vercel it means the build never regenerates anything: every byte of data the deploy serves is a byte that was committed. The root `.gitignore` says this in its own words, in the comment above the `app_data/app_data.json` rule: the app runs from the committed `continent-app/public/*.json` payload, and sync-data falls back to that when the master is absent. The T024 report reached the same conclusion for the future Cloudflare Pages build, which has the same shape.

The layer directories (trails, cycling, region, trips, dossier, beaches, lakes, mountains, journeys, fares, destinfo) are not written by sync-data at all. Each has its own export script under `pipeline/` that writes straight into `continent-app/public/`. None of those scripts run on the host either, so those directories depend on tracked copies in exactly the same way.

The verification therefore fails on both counts named in the task. Vercel builds do rely on tracked copies, and sync-data.mjs does not regenerate them where the deploy happens.

## Commands run

Measurement only. Nothing that changed the tree.

```bash
git ls-files continent-app/public | wc -l
git ls-files -s continent-app/public | awk '{print $2}' | git cat-file --batch-check='%(objectsize)' | awk '{s+=$1} END {print s/1048576 " MB"}'
git ls-files continent-app/public | sed 's#continent-app/public/##' | cut -d/ -f1 | sort | uniq -c | sort -rn
du -sh .git continent-app/.git
time git status --short          # three runs, median reported
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" https://www.carta-europetravel.com/app_data.json
curl -s -o /dev/null -w "%{http_code}\n" https://www.carta-europetravel.com/poi/AMS.json
```

## Config and secrets set

None.

## Before/after measurements

No change was made, so the after column is empty by design. The before column is the baseline the eventual untrack will be measured against.

| Metric | Before | After | Delta |
|---|---|---|---|
| Tracked files under continent-app/public (root repo) | 48,222 | not changed | 0 |
| Uncompressed size of those tracked blobs | 1,073 MB | not changed | 0 |
| Root .git size | 3.2 GB | not changed | 0 |
| git status --short wall time, median of 3 | 0.5 s | not changed | 0 |
| Lines printed by git status --short | 9 | not changed | 0 |

One thing the baseline says that the task did not expect: git status is already fast, at half a second, because the index is warm and Windows' file cache holds the tree. The cost of the tracked artifacts is not status latency. It is the 1 GB of blobs, the noise in every diff and log, and the fact that the tracked set is an accident of ignore-rule timing rather than a decision.

## What broke and how it was fixed

No issues in this task. One pre-existing production defect was found and is recorded below rather than fixed, because it belongs to another task.

| What | Cause | Fix |
|---|---|---|
| Production returns 404 for every `/poi/<id>.json` shard | `public/poi/` is ignored by the inner `.gitignore`, so it was never tracked at the root and Vercel never has it | Not fixed here. See What is still open. |

## What is still open

The untrack itself. It becomes safe when the deploy no longer reads data from the checkout, which is what T054 (`Execution/P3/T054-wire-shards-to-r2.md`) does by moving the shards to R2 and having the app fetch them from `data.carta-europetravel.com`. Until then, untracking `public/` would take production down on the next deploy. When T054 has landed, run this from the root repository on the branch `p1-untrack-build-artifacts`:

```bash
git rm -r --cached continent-app/public -q
```

Then add the generated paths to the root `.gitignore` next to the `continent-app/dist/` rule. The list is the same one the inner `.gitignore` already carries, prefixed with `continent-app/`:

```
continent-app/public/app_data.json
continent-app/public/activities_full.json
continent-app/public/poi/
continent-app/public/poi_credits.json
continent-app/public/coverage.json
continent-app/public/country_insights.json
continent-app/public/country_shapes.json
continent-app/public/search_index.json
continent-app/public/joins.json
continent-app/public/fares/
continent-app/public/dossier/
continent-app/public/destinfo/
continent-app/public/beaches/
continent-app/public/lakes/
continent-app/public/mountains/
continent-app/public/trails/
continent-app/public/cycling/
continent-app/public/trips/
continent-app/public/journeys/
continent-app/public/region/
continent-app/public/reach/
```

Re-add the static assets the inner repository keeps (fonts, favicons, manifest, robots.txt, sw.js, sitemap.xml, `_headers`, `_redirects`) with `git add -f`, run `npm run build` in `continent-app/` and confirm it succeeds, then take the same five measurements again and write a follow-up report that references this one.

The production POI shards. Every `/poi/<id>.json` fetch on carta-europetravel.com returns 404 today. The app does not crash, because `fetchDestPois` in `src/lib/appData.js` resolves to an empty list on failure, but it means the day planner and the destination page in production have no per-town POI list to draw from. The fix is not to track the shards, which would add 3,865 more generated files to the root. The fix is T054, or as a stopgap a build step on the host that produces them. Someone should confirm what production users actually see in the day planner before deciding how urgent the stopgap is. This was found on 2026-09-23 and is not fixed by this task.

T026, the history rewrite, is planned after this task. Its payoff depends on this untrack having happened first, because a purge of history that leaves the same files in the index will regrow the same blobs on the next commit.

## Rollback procedure

Nothing to roll back. The tree, the index and the ignore rules are as they were. If the branch should not exist:

```bash
git checkout p1-cloudflare-pages
git branch -D p1-untrack-build-artifacts
```

If the untrack is later run by the commands above and has to be undone, `git checkout HEAD~1 -- .gitignore` restores the rules and `git add continent-app/public` restores the index. Nothing on disk changes in either direction, which is the property the task was chosen for.
