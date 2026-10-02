# T289 push-data.mjs passes its rclone arguments intact on Windows

## Task ID

T289

## Date

2026-10-02

## What changed

`continent-app/scripts/r2/push-data.mjs` could not upload anything from this laptop. Its `run()` helper called `spawnSync` with `shell: true` on Windows for every command. With a shell Node joins the arguments with spaces and quotes none of them, so a path under `Travel App` and the `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` header reached rclone as six loose words, and rclone refused with "Command copy needs 2 arguments maximum". The owner hit it on the first `--rclone-dry-run` of stage 5.3 step 2 (T054-b). The CORS step had worked only because its wrangler arguments contain no spaces. The shell is now used for `npx` alone, which needs it because it is `npx.cmd` on Windows. rclone is started directly, so Node quotes each argument itself. That also clears the DEP0190 deprecation warning for the rclone calls. Nothing was uploaded before the fix, and the bucket was not touched by this task.

## Files touched

App (continent-app repo, branch p3-push-data-windows-args):

**Modified:**
- continent-app/scripts/r2/push-data.mjs

Root (branch p3-push-data-windows-args):

**Modified:**
- continent-app/scripts/r2/push-data.mjs (the root's tracked copy, mirrored from the app commit)

**Created:**
- Execution/P3/T289-push-data-windows-args.md

## Commands run

```bash
cd continent-app
git checkout -b p3-push-data-windows-args
# edit run(): shell only when cmd[0] === 'npx'
RCLONE_CONFIG_R2_TYPE=x RCLONE_CONFIG_R2_ENDPOINT=x RCLONE_CONFIG_R2_ACCESS_KEY_ID=x \
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=x RCLONE_CONFIG_LT_TYPE=local \
  node.exe scripts/r2/push-data.mjs --rclone-dry-run --remote lt --bucket <scratch dir>
```

The test points the script at a local rclone remote (`lt`, type local) so that the full argument path runs without credentials and without writing. The `R2` variables are dummies that satisfy the script's presence check. The `dist-data/` tree came from the owner's split build of the same day: 17 entries, 52,310 files, 1,101.4 MiB.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| rclone commands that ran in a dry run from this repo path | 0 of 17 (first failed, script exits) | 17 of 17 | +17 |
| Files rclone planned to transfer | 0 | 52,310 | +52,310 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `push-data.mjs --rclone-dry-run` failed with "Command copy needs 2 arguments maximum: you provided 6" | `shell: true` on Windows joins arguments unquoted; the repo path and the Cache-Control value contain spaces | Shell only for `npx` |
| `node ... \| tail` printed "stdout is not a tty" in Git Bash | Git Bash's `node` is a winpty wrapper that refuses a pipe | Run `node.exe` when piping; not a code change |

## What is still open

None from this task. `stage-data.mjs` and the other `scripts/r2` files do not spawn through a shell, so they were not changed. The `npx` calls still pass through the shell, and are safe only while their arguments contain no spaces, which holds today: the bucket name, the rule names and `scripts/r2/data-cors.json`.

## Rollback procedure

`git revert` the T289 commit in `continent-app/`, then the root commit. The script then fails on any Windows path with a space again. It never deletes anything without `--prune`.
