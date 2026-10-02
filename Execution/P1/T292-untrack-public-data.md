# T292 The root repository stops tracking the generated app data

## Task ID

T292

## Date

2026-10-02

## What changed

The root repository no longer tracks the 48,211 generated files under `continent-app/public` (1,070 MB of blobs). Those files are `sync-data.mjs` output: the catalogue, its shards and the layer directories. They are served from R2 since T291, no deploy reads them from git any more, and the inner continent-app repository never tracked them. The 15 static files the inner repository does track stay tracked in the root as well: `_headers`, `_redirects`, the icons, the four fonts, `manifest.webmanifest`, `robots.txt`, `sitemap.xml` and `sw.js`. The root `.gitignore` gains 23 `continent-app/public/...` rules, copied from the inner `.gitignore`, so nothing reappears as untracked. That is the T025 runbook's 21 paths plus `boot.json` and `dest/`, which T054 added to the inner list after T025 was written. Every one of the 48,211 paths matches one of the new rules, as `git check-ignore` confirmed before the untrack. Tracked files in the root go from 50,457 to 2,246. History is unchanged. The blobs stay in `.git` until the optional T026 rewrite.

## Files touched

Root repository (branch p1-untrack-public-data, stacked on p3-cutover-live):

**Modified:**
- .gitignore (23 rules after `continent-app/dist/`)

**Deleted from the index only (files stay on disk):**
- 48,211 paths under continent-app/public; the list is the root's tracked set minus `git -C continent-app ls-files public`

**Created:**
- Execution/P1/T292-untrack-public-data.md

The T025 runbook named the branch `p1-untrack-build-artifacts`. That branch still exists but is a September branch, so this work went on a new branch from the current chain.

## Commands run

```bash
git -C continent-app ls-files public | sed 's#^#continent-app/#' | sort > app_pub.txt
git ls-tree -r --name-only p3-cutover-live continent-app/public | sort > root_pub.txt
comm -23 root_pub.txt app_pub.txt > untrack.txt                      # 48,211 paths
# .gitignore: 23 continent-app/public/... rules inserted after continent-app/dist/
git check-ignore --no-index --stdin < untrack.txt | wc -l            # 48,211 of 48,211
git rm -r -q --cached --sparse --pathspec-from-file=untrack.txt
```

The work ran in a sparse worktree (`../wt/t292`, only `Execution/` and `.gitignore` checked out). `--cached` touches only the index, so no file was read or written under `public/`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Tracked files under continent-app/public (root repo) | 48,226 | 15 | -48,211 |
| Uncompressed size of those tracked blobs | 1,071 MB | about 1 MB | -1,070 MB |
| Tracked files in the root repo | 50,457 | 2,246 | -48,211 |
| Root .git size | unchanged by this task (history keeps the blobs; T252 measured 1,151 MB) | unchanged | 0 |

T025's baseline of 48,222 files on 2026-09-23 has since grown by four.

## What broke and how it was fixed

No issues.

## What is still open

Merging this branch into the main checkout deletes the generated files from disk. Git removes a path from the working tree when a merged commit stops tracking it, even when the path is ignored afterwards. Nothing is lost, because `sync-data.mjs` regenerates all of it from `app_data/app_data.json`, but run this after the merge, before any dev server or build:

```bash
cd continent-app && npm run data
```

A build (`npm run build`) runs it as `prebuild` anyway. This step is part of the merge, not a register row.

T026 (the history rewrite) is now possible. It stays optional, as `_OPEN-MASTER.md` says.

## Rollback procedure

`git revert` this commit. It re-adds the 48,211 paths from history and removes the 23 ignore rules. Do not revert while production depends on the R2 data route being the only one; nothing deploys from git today, so the revert is harmless but pointless.
