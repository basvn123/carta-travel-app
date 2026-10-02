# T295 The production build has one command, and ci ends with it

## Task ID

T295

## Date

2026-10-02

## What changed

`npm run build:pages` is the production build. It runs `npm run build` with `VITE_DATA_BASE` set to `https://data.carta-europetravel.com/data`, so `stage-data.mjs` moves the R2 shards out of `dist/`. It then runs `check-pages-limits.mjs` on `dist/`. The variable is set by `scripts/build-pages.mjs` for its child process, so the command is the same in Git Bash, PowerShell and cmd, and nobody has to type the data base by hand before a deploy. A `VITE_DATA_BASE` already in the environment wins, for a staging host. `npm run ci` keeps its offline same-origin build and smoke test, which need the shards locally, and now ends with `build:pages`. The Cloudflare Pages limits (20,000 files, 25 MiB per file) are therefore part of ci, and the `dist/` that ci leaves behind is the one Pages ships. The comment at the top of `check-pages-limits.mjs`, which still said the gate was expected to fail until T054 landed, now says which build passes it and which never will.

T054-g is closed by this task without code. The row asked that the unread 12.5 MB `app_data.json` be dropped from every build. Every build that ships already drops it: `stage-data.mjs` deletes `dist/app_data.json` and `dist/activities_full.json` whenever `VITE_DATA_BASE` is set, and that is now the only build that reaches Pages. The same-origin build still carries it, on purpose, because the smoke test and about fifteen harnesses read it from the preview server. Pointing them at `public/app_data.json` on disk would move no byte of production.

## Files touched

App (continent-app repo, branch p1-ci-pages-gate, stacked on p1-pages-config-hygiene):

**Created:**
- continent-app/scripts/build-pages.mjs

**Modified:**
- continent-app/package.json (`build:pages` script; `ci` ends with it)
- continent-app/scripts/check-pages-limits.mjs (header comment only)

Root (branch p1-ci-pages-gate, stacked on p1-pages-config-hygiene):

**Modified:**
- the three files above (tracked copies)
- Execution/_OPEN.md (T054-f and T054-g closed by T295)

**Created:**
- Execution/P1/T295-ci-pages-gate.md

## Commands run

```bash
cd continent-app
git checkout -b p1-ci-pages-gate
rm -rf dist dist-data && npm run build:pages     # exit 0, PASS: 62 files
npm run ci                                       # exit 0, about 9 minutes
```

## Config and secrets set

None. The production data base is a constant in `scripts/build-pages.mjs`, the same value T291 deployed with.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Steps in npm run ci | 7 | 8 | +1 (build:pages) |
| ci result | not run this session | exit 0: 102 of 102 tests, smoke 8 of 8 routes, Pages gate PASS at 62 files (19,938 under the ceiling) | |
| Commands to make the production build | 2 (export VITE_DATA_BASE, then npm run build) plus a manual check:pages | 1 (npm run build:pages) | -1 |

The gate's failing side was not re-run. T024 recorded it at 52,132 files on the same-origin build, and that build has not shrunk since.

## What broke and how it was fixed

No issues.

## What is still open

None from this task. `npm run ci` is a local command: none of the six GitHub workflows run it, so the gate binds whoever runs ci before a deploy, as CLAUDE.md asks. The deploy steps in the T293 report can use `npm run build:pages` in place of the manual variable.

## Rollback procedure

`git revert` the T295 commits in both repos. `ci` then ends at the smoke test again, and the production build goes back to `VITE_DATA_BASE=... npm run build`, which still works.
