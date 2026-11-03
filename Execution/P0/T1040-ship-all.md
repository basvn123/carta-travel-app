# T1040: commit, merge, push and deploy everything

## Date

2026-11-03

## What changed

Everything left in the working tree is committed, the two finished branches are merged, `main` and the archive tag are pushed, and production runs the T1019 to T1039 work. Committed: the owner's carta-design skill rewrite (with `references/app-rules.md`), the pipeline's freshness report and small cache inputs, the P15 walk JSON, the plan flow v3 brief and plan, and the R4 queue files. `.gitignore` now keeps out `cache/gtfs/`, `cache/nature/` (one 64 MB file), `cache/open_prices/` and the vendored `impeccable/` folder (14.7 MB exe); all of them stay on disk. Merged: `p15-lint-plan-home` (T998; `main` already had its content in the newer T999 to T1002 form, so the conflicts kept `main`) and `p11-flights-to-august` (T804 and T805: late tier to week 45; the conflicts were the register and one test import list, union of both). Before the build, `css-routes --hold` held 174 route selectors in the first paint (115 problems down to 3). Data phase 1 went to R2 (34,699 objects added or replaced; a second dry run found 0 left), then Pages preview, then production. `CLAUDE.md` and `MAP.md` were wrong about the app repo: `continent-app/` is tracked by this repo, and its nested `.git` is a stale copy (`master` at T915, no remote) that shows about 350 false changes. They now say so and give the deploy in one line.

## Files touched

- `.gitignore`, `CLAUDE.md`, `MAP.md`
- `.claude/skills/carta-design/SKILL.md`, `.claude/skills/carta-design/references/app-rules.md`
- `data/derived/freshness_report.json`; `cache/` (eurostat nights, food price inputs and the pre-v2 backups, POI fees, `sea_temp/`); `supabase/diagnostics/.044_pass_functions.sql`
- `Execution/P15/T857-...T874-walk/` (JSON only), `Execution/P15/_BRIEF-plan-flow-v3.md`, `_PLAN-plan-flow-v3.md`, `Execution/_queue/R4-*`, `chain_rating_r4*.ps1`
- Merges: T998 (no file left to bring in), T804-T805 (`continent-app/src/lib/flights/flights.js`, `workers/flight-sweep/src/plan.mjs`, `workers/late-sweep/run.mjs`, `infra/hetzner/cron/carta-late-sweep.service`, two tests, report)
- `continent-app/src/styles/items-held.css`, `planners-held.css` and the 12 route sheets the hold took rules from
- `Execution/_OPEN.md`, this report

## Commands run

From `continent-app/`:

```
npm test                                             # 1225 pass
VITE_E2E_SEAMS= npm run build:pages
node scripts/css-routes.mjs --check dist/assets --hold
node scripts/r2/push-data.mjs --rclone-dry-run       # 34,699 to copy
node scripts/r2/push-data.mjs --live                 # phase 1
node scripts/r2/push-data.mjs --rclone-dry-run       # 0 to copy
VITE_E2E_SEAMS= npm run build:pages                  # with the hold
npx wrangler pages deploy dist --project-name carta-app --branch preview   # cb972914
npx wrangler pages deploy dist --project-name carta-app --branch main      # b1531000
```

Then from the root: `git push origin main archive/execution-full-2026-11-03`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Live entry file | index-Bf02jOKN.js (T1018) | index-B-zCraUz.js | T1019 to T1039, T804-T805, T998 live |
| css-routes problems | 115 | 3 | -112 |
| R2 objects out of date | 34,699 | 0 | |
| Pages deploy | 364 files, 96.8 MiB | same | within the 20k file ceiling |
| `main` ahead of origin | 30 commits | 0 | pushed |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Merge conflicts in PlanHome.jsx and 90-plan-home.css | T998's white New trip tile was later redone by T999 to T1002 (owner) | kept `main`'s version |
| Merge conflict in flights.test.mjs | both sides added an import (`sweptNear`, `roundTripNear`) | import both; 38 flight tests pass |
| css-routes check failed with 115 problems | route sheets edited since T875 without a re-check | `--hold`, rebuilt, 3 left (see open) |
| First preview smoke failed at 1280 (nothing rendered) | a cold load; did not repeat in two reruns | rerun |
| Smoke flagged `data/status.json` 404 | the data host has no status.json; production had the same 404 before this deploy | ignored in the smoke; row T1040-b |

## Screens checked

Headless smoke (Playwright, English) on preview and then production, at 390 and 1280: Home, Explore, the Rome place page (h1 "Roma"), the Valbona place page, Plan. No page errors, no failed fetches apart from status.json, no crash text. Not a visual review: the T1019 to T1039 screens were checked in their own tasks.

## What is still open

- T1040-a: the three remaining css-routes problems are the plan flow's route-only sheets 88 to 90, which have no global twin in `src/styles.css`. The tool assumes every route sheet was split from a global one. Teach it route-only sheets, or give them global twins.
- T1040-b: the app asks for `data/status.json` on every page and the data host answers 404 (before and after this deploy). Publish it or stop asking.
- T1040-c: data phase 2 (`push-data.mjs --live --prune`) was not run. It would delete 29 old `dest` shards (3 MB) from before PL, GB, GR, SE and CZ were re-tiled. Run it once no tab can still hold the T1018 build.
- T1040-d: `continent-app/.git` is a stale nested repo. Delete it (owner), so no session commits there by mistake.
- T1040-e: `p0-next-steps-docs` (2026-10-13) and `explore-v4` (2026-09-13) are not merged because merging them would revert newer docs and app code. Delete them (owner). T1034-f is left open for this.
- T805-a: the box side is still to do (token check and pull), as that row says.

## Rollback procedure

App: promote Pages deployment of the T1018 build (entry index-Bf02jOKN.js) in the carta-app project's dashboard. Phase 1 data only added and replaced objects, so the T1018 build reads them as before. Git: `git revert -m 1 <merge>` for each of the two merges, and `git revert` for the T1040 commits; nothing in the database changed.
