# T025 Untrack generated build artifacts from git

## Task ID

T025

## Date

2026-09-23

## What changed

Nothing. The verification failed at the dependency check, and the honest outcome is that the untrack cannot proceed safely until another task removes the blocker. The work left the repository clean, with no accidental commits.

The decision to stop was made before running any git operations that would change the tree. The verification followed the sequence in the task specification: first check what sync-data.mjs does when sources are absent, then determine whether a Vercel build would still pass, then decide whether to proceed or block.

## Files touched

**Modified:**
- None. The root .gitignore was not edited, and nothing was untracked.

**Created:**
- `Execution/P1/T025-untrack-build-artifacts.md` — this report

**Deleted:**
- None.

## How the verification works

The Vercel build runs two steps. The prebuild hook runs `npm run build` in `continent-app/`, which includes the `prebuild` npm script. That script is `node scripts/sync-data.mjs`. The sync-data script reads the master dataset from `app_data/app_data.json` (at the repository root) and transforms it into public-facing JSON shards (poi/, fares/, etc.) under `continent-app/public/`.

The master dataset is gitignored in the root .gitignore (line 56: `app_data/app_data.json`). This is intentional: it is roughly 50 MB and rewritten whole on every pipeline run, and committing it would spend the Git LFS quota faster than the project's utility.

The sync-data script has a fallback for when the master is missing (lines 76-78):

```javascript
if (!existsSync(src)) {
  console.warn(`[sync-data] real dataset not found at ${src} - keeping existing public/app_data.json`);
  process.exit(0);
}
```

When the master is absent, sync-data exits early without creating any output. It does not regenerate the JSON shards. It does not fail the build; it exits cleanly and leaves whatever is already in `public/` in place. The comment above the function says so explicitly: "if a fresh clone without the pipeline output builds" — a fresh clone has no generated files, yet the build succeeds because sync-data skips.

This fallback is correct for a developer clone and for a deployment that has already cached the output. But it has a precondition: the output must already exist. Either the master is present, or the output is already on disk.

Vercel does not have the master (it is gitignored) and does not have a cache (it builds from a fresh checkout). If the generated JSON shards are also not in git, then sync-data will skip, and the prebuild will complete with an empty or partial wire under `continent-app/public/`. The build artifacts will then reference JSON that does not exist, and the application will fail at runtime or serve a broken catalogue.

The root .gitignore currently tracks the generated shards (48,224 files under `continent-app/public/`), which is why Vercel's builds pass today. The inner repository's .gitignore (continent-app/.gitignore) already excludes these same files (lines 9-31), so the inner repo stays at 15 tracked files (the static assets: favicons, fonts, manifest, robots.txt, etc.). The asymmetry between the two repos is the thing this task exists to fix.

## Verification result: BLOCKED

The untrack cannot proceed because it would break Vercel deployments. The dependency is documented in the task prompt:

"VERIFY FIRST that Vercel builds and sync-data.mjs do not rely on tracked copies. If it would, the verification FAILS and you must NOT run git rm --cached. In that case the honest outcome is: the untrack is blocked until T054 (wire shards to R2) or another change makes the deploy independent of tracked copies."

Vercel does rely on tracked copies. Therefore, the untrack is blocked.

## The precondition to succeed

The untrack will become safe when one of these conditions holds:

1. The deployment moves the data shards to R2 (or another CDN) and the prebuild fetches them from there instead of relying on disk copies. This is T054: "Wire shards to R2". See the architecture document (CARTA_CLOUD_ARCHITECTURE.md, §8 migration steps 4-6) for the sequence.

2. The deployment embeds the shards as build-time constants in the JavaScript bundle, so they are part of the source rather than sidecar files. This would require changes to the Vite configuration and the sync-data logic to hydrate the bundle at build time rather than writing files to disk.

3. The master dataset is committed to git. This is intentionally not done because it is large, rewritten frequently, and would exhaust the LFS quota. Reverting to this would undo the rationale for the cleanup.

Of the three, option 1 (T054) is the current plan and the one documented in the architecture.

## Before/after measurements

The task did not make any changes, so there are no after measurements. The before measurements establish what would be gained by the untrack and guide the decision about when it becomes safe.

| Metric | Before | After | Delta |
|---|---|---|---|
| Tracked files in continent-app/public (root repo) | 48,224 | — | — |
| Git blob size for public/ | 2.1 MB | — | — |
| .git directory size | 3.2 GB | — | — |
| git status --short time (median of 3 runs) | 0.509 s | — | — |
| Lines in git status output | 9 | — | — |

Untracking the 48,224 generated files would eliminate a sizable class of checked-in artifacts and marginally reduce git overhead. The speed gain from `git status` would only be realized after T054 removes the dependency on tracked copies for deployments. The measured time (0.5 seconds) is reasonable for a repo with 48,000+ tracked files under `continent-app/public/`; the real pain is not in the measurement but in the principle that build artifacts should not be in version control.

## What broke and how it was fixed

No issues. The verification was theoretical: it traced the code paths that would execute on a Vercel build without the master dataset, read the sync-data fallback logic, and concluded that the build would fail if the shards were untracked.

## What is still open

1. **Blocked on T054** (`Execution/P3/T054-wire-shards-to-r2.md`). The untrack is safe only after T054 moves the wire shards to R2 and makes the deployment independent of tracked copies. T054 has not run yet, and `Execution/P3/` is empty.

   When T054 completes, return to this task with the report. Run `git rm -r --cached continent-app/public` (the exact command is in the commands section below), add the gitignore rule, rebuild to verify the build still passes, and write a new report documenting the after-state. Then the cleanup is complete.

2. **Commands to run when T054 is done**: From the root repository, in order:

   ```bash
   git checkout p1-untrack-build-artifacts
   git rm -r --cached continent-app/public -q
   ```

   Then edit `.gitignore` to add this rule near the existing `continent-app/dist/` block:

   ```
   # Generated public/ subdirectories are written by pipeline export scripts and
   # sync-data.mjs, and are not source. The app fetches them from R2, so they do
   # not belong in git. The few static assets (favicons, fonts, robots.txt, _headers,
   # _redirects, service worker) are still source; they are tracked by the inner repo
   # and live in continent-app/.gitignore as negations.
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

   Then verify:

   ```bash
   cd continent-app
   npm run build
   ```

   Watch the build output. It should succeed and print build timing. If sync-data.mjs runs (because R2 has been wired), you will see its output lines about wire diet, origins, per-destination shards, and country insights. If it skips (because the master is still missing), you will see one warning line. Either is correct; the gate is that the build succeeds.

   Then commit and write a follow-up report documenting the new measurements.

## Rollback procedure

Nothing was committed or changed, so there is no rollback necessary. The repository is in the same state it was when the task started. The p1-untrack-build-artifacts branch can be deleted:

```bash
git checkout main   # or whichever branch was current before this task
git branch -D p1-untrack-build-artifacts
```

If the branch has been merged and the commits need to be reverted (which should not happen, given the verification failure), reverting is safe: the only file that could have been committed is the report itself, and deleting the report file has no side effects on the deployed system.

