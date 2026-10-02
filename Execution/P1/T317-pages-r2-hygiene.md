# T317 Pages and R2 hygiene: a real 404, a prune that sees removed prefixes, a safe restore note

## Task ID

T317

## Date

2026-10-03

## What changed

Three register rows are closed. T294-a: `scripts/build-pages.mjs` now copies `dist/index.html` to `dist/404.html` after the build and before the Pages limit gate. With a top-level 404.html Pages answers an unknown path with that page and status 404, instead of index.html with 200. The app is one client-rendered URL and its asset links are absolute (`/assets/...`), so a mistyped deep path still renders the app, now with a true 404 status. The copy is made in the build script, not in `public/`, so `npm run build` and the dev server are unchanged. T296-b: `scripts/r2/push-data.mjs --prune` now also lists the top level of `r2:carta/data/` and deletes each name that is not in `R2_TIER` (`rclone purge` for a directory, `rclone deletefile` for a file). It refuses to delete from an empty listing. With `--rclone-dry-run` the listing is a real read and the deletes carry `--dry-run`. A new exported `staleEntries()` holds the comparison. T288-d: `docs/BACKUP.md` has a new section on restoring the R2 archive dumps. It forbids `pg_restore --clean` against the live trailslab database, gives the streamed read check from the T288 report, and gives a scratch-database restore with no `--clean`. No existing runbook or script held the unsafe command: it lives only in the T045 report, which is closed and is never edited, so the new section names it and says not to copy it. Nothing was deployed and nothing was written to R2.

## Files touched

App (continent-app repo, branch p1-pages-r2-hygiene), both files are on the EXCEPTION list in the session notes:

**Modified:**
- scripts/build-pages.mjs (the 404.html copy, one comment paragraph)
- scripts/r2/push-data.mjs (stale-prefix prune, `staleEntries`, run-only-as-main guard)

Root (branch p1-pages-r2-hygiene):

**Modified:**
- docs/BACKUP.md
- Execution/_OPEN.md (T294-a, T296-b, T288-d closed by T317; rows T317-a to T317-c added)

**Created:**
- Execution/P1/T317-pages-r2-hygiene.md

## Commands run

```bash
# 404.html: split build against the loopback stand-in, then the harness
cd continent-app
VITE_DATA_BASE=http://127.0.0.1:4391/data CARTA_SKIP_CSP_CHECK=1 node scripts/build-pages.mjs
cmp dist/index.html dist/404.html
node scripts/verify_data_host.mjs
rm -rf dist dist-data

# prune, against a local-directory stand-in for R2 (rclone type=local), dry-run only
export RCLONE_CONFIG_R2_TYPE=local RCLONE_CONFIG_R2_ENDPOINT=x RCLONE_CONFIG_R2_ACCESS_KEY_ID=x RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=x
node scripts/r2/push-data.mjs --prune --from <stage> --bucket <scratch dir>
node scripts/r2/push-data.mjs --prune --rclone-dry-run --from <stage> --bucket <scratch dir>
node scripts/r2/push-data.mjs --prune --rclone-dry-run --from <stage> --bucket <empty dir>
```

The scratch bucket held `dest`, `lakes`, `coverage.json`, an `old_layer/` directory and a `stale.json` file. The dry run printed `rclone purge .../old_layer` and `rclone deletefile .../stale.json` with `--dry-run`, and listed nothing else; the directory was unchanged afterwards. The empty bucket stopped with the refusal message. No `--live` run was made, against anything. The first build attempt was killed by the OS and the second failed while emptying a half-cleared `dist/`; a clean `dist/` fixed it (see below).

## Config and secrets set

None. The rclone variables above were set in the shell for the test only and point at a local directory.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Files in the Pages deploy, `check-pages-limits` (build log) | 62 (T294 report) | 63 | +1 (404.html) |
| 404.html identical to index.html | no such file | yes (`cmp`) | new |
| `verify_data_host.mjs` | not re-run | OK, 84 data-host requests and 7 routes booted | pass |
| Stale top-level names the prune found in the scratch bucket (2 planted) | 0 (not looked for) | 2 | new |

The 62 is quoted from the T294 report. The 63 and the build-log lines come from this task's own build.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First `build-pages` run was killed, the second failed in vite's `prepare-out-dir` after 3 minutes | The first run died halfway and left a partly cleared `dist/` of 52,000 files | Removed `dist/` and `dist-data/` with PowerShell, third run passed |
| My first edit of `push-data.mjs` wrote a literal CR and LF into a regex | A heredoc ate the backslashes in `\r?\n` | Replaced the bytes with the real escape sequence and re-ran the tests |

## What is still open

T317-a: the next Pages deploy ships the 404.html, and after it someone should confirm that an unknown path answers 404 and the root still 200. Deploying is the owner's. T317-b: the first live prune after this change deletes whole top-level R2 prefixes that are not in `R2_TIER`, so the owner should run it with `--rclone-dry-run` and the real credentials first and read the purge lines. T317-c: `scripts/verify_data_host.mjs` still describes a Pages with no 404 page; its stand-in could serve 404.html with status 404, and it was out of this task's scope. T294-a, T296-b and T288-d are closed.

## Rollback procedure

`git revert` the T317 commit in both repos. The 404.html is only ever created at build time, so reverting the script and rebuilding removes it, and until the next deploy production is unchanged. The prune change touches R2 only when `--live --prune` is run; if a prefix was wrongly purged by it, re-run `push-data.mjs --live` (phase 1) from a fresh staged build to restore any entry that is in `R2_TIER`, since a name outside the list is by definition not served. The BACKUP.md section can simply be reverted.
