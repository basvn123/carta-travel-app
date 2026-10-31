# T954: deploy main (home page v3) to Cloudflare Pages

## Task ID

T954

## Date

2026-10-31

## What changed

Production (carta-europetravel.com, Pages project `carta-app`) now serves root `main` at `df0215a093` (the T948 to T953 home v3 merge). The live entry file went from `index-CKuy4JqC.js` (deployment 632ec87f, T878) to `index-Bj8eZm6A.js` (deployment b1d3faeb). The deploy carries more than home v3. Main also held four merged batches nobody had deployed: T901 to T904 (plan home), T906 to T910 (Explore refined), T911 to T914 (place pages) and T918 to T922 (outdoor pages). All of them are live now. No data went to R2, on the owner's call made during this task (see "What is still open").

Step 5's `css-routes --check --hold` moved 554 route selectors into `src/styles/items-held.css` and `src/styles/planners-held.css` across 27 sheets. The bundle was then rebuilt, and a second `--hold` run held 0. That rebuilt bundle is the one deployed, and the 27 sheet changes are committed with this report.

## Files touched

**Modified:**
- `continent-app/src/styles/items-held.css`, `continent-app/src/styles/planners-held.css` (rules held by `css-routes --hold`)
- `continent-app/src/styles/items/{23,24,25,26,29,40,65,66,70}-*.css` (held rules removed)
- `continent-app/src/styles/planners/{11,12,13,17,18,19,20,21,23,24,26,67,68,86,89,90}-*.css` (held rules removed)
- `Execution/_OPEN.md`

**Created:**
- `Execution/P15/T954-deploy-home-v3.md`

**Deleted:** none.

## Commands run

The prompt said `git checkout main && git pull origin main` inside `continent-app/`. That folder is its own repo, with branch `master` and no remote. `carta-travel-app` is the root repo, so main was brought up to date at the root:

1. Root `main` was 135 commits behind `origin/main`. Five uncommitted app files were byte-identical to origin, so they were restored to HEAD. The untracked `continent-app/workers/late-sweep/gaps.mjs` was identical to origin's copy, so it was moved aside. The uncommitted cron change (drop `carta-late-fill.service` from `install.sh` and delete the unit) clashes with T915's committed version, so it was saved as a patch and restored (T954-c). Then `git merge --ff-only origin/main`.
2. `npm ci` failed with EPERM, because two dev servers left by earlier sessions (vite `--port 5199` and vite `--config ../../wt/vite.pf2-batch.mjs`) hold `lightningcss.win32-x64-msvc.node` open. Stopping them was not allowed in this session, so `npm install --no-audit --no-fund` was run against the same lockfile instead. `package-lock.json` is unchanged and `npm ls --depth=0` reports nothing missing or invalid.
3. `npm test`: 1204 pass, 0 fail. The prompt expected 1199. The five extra are the T915 to T917 tests that reached main after the prompt was written.
4. `VITE_E2E_SEAMS= npm run build:pages`: 317 files, PASS.
5. `node scripts/css-routes.mjs --check dist/assets --hold`: held 554. Rebuilt (step 4), then `--hold` again: held 0. A plain `--check` names three planner sheets with no global sheet in `src/styles.css`: `88-pf2-wizard`, `89-plan-days` and `90-plan-home`. That gap was already known as T833-a and was not caused by this deploy.
6. `node scripts/r2/push-data.mjs --rclone-dry-run`: not empty, see the measurements below.
7. `npx wrangler pages deploy dist --project-name carta-app --branch preview`: deployment a27905e8. The hashed URL cannot load travel data, because the data host's CORS allows only the production origin (632ec87f's own hashed URL fails the same way). The home check therefore ran on the alias `preview.carta-app.pages.dev`.
8. `npx wrangler pages deploy dist --project-name carta-app --branch main`: deployment b1d3faeb.
9. Home check on `https://carta-europetravel.com/?tab=home`, which redirects to www, at 390x844 and 1440x900.

## Config and secrets set

None. Wrangler used the machine's existing Cloudflare login.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Live entry file | `index-CKuy4JqC.js` (632ec87f) | `index-Bj8eZm6A.js` (b1d3faeb) | new deploy |
| Root commit live | `f9231bf` app (T878) | `df0215a093` root main (T953) | T879 to T953 |
| Unit tests | | 1204 pass, 0 fail | |
| Pages files | | 317 (19,683 under the ceiling) | |
| R2 dry run, files that would upload | 0 (last deploys) | 34,404: trails 17,619, cycling 12,803, dossier 3,869, lakes 39, mountains 37, beaches 36, journeys 1 | not pushed |

Home check, preview alias and live, at both widths: the film plays (the hero videos reach readyState 4), the slogan "A cheap flight is not a cheap trip" is present, and the umber "real cost" panel is rgb(90, 55, 22). The proof (EUR 169 flight against EUR 939 week), the tour, Try it and Plans all render. Page width equals the viewport, so there is no sideways scroll. The only console errors are 404s for four tour clips (`ask`, `explore`, `trips`, `together`.mp4). Those clips were never recorded (T952-a), and the tour shows their poster stills. `day.mp4` plays.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `npm ci` EPERM, `node_modules` half removed | Two stale vite dev servers hold the lightningcss native binary | `npm install` from the same lockfile; lockfile unchanged |
| Hashed preview URL shows "We couldn't load Carta's travel data" | Data host CORS allows only the production origin | Checked on the `preview.carta-app.pages.dev` alias, as T855 did |
| Fast-forward blocked by local changes | Uncommitted copies of T915 work and a conflicting cron edit | Identical files restored; cron edit kept as a patch (T954-c) |

## What is still open

T954-a: the data that T911 (dossiers) and T918 (outdoor page keys in the nature wires) committed is not on R2. The owner chose a code-only deploy. The new place and outdoor pages work, because each key is absent when there is no data, but they show placeholders where those tasks built content. Run `node scripts/r2/push-data.mjs` from `continent-app/` after `npm run build:pages`; the dry run lists 34,404 files.

T954-b: the inner `continent-app` repo (`master`, bbc5c2f) is behind the root's copy of `continent-app/`. After the fast-forward it shows 123 modified files, because T879 to T953 were committed to the root only. A sync task should commit the root's state into the app repo, or the two trees keep drifting (see nested-repo notes).

T954-c: an uncommitted change in the root removed `carta-late-fill.service` and its lines in `infra/hetzner/cron/install.sh`. T915 on main keeps that unit and restarts it on install, so the two disagree. The change was saved, not applied, to the scratchpad file `local-cron-drop-late-fill.patch` of this session. The owner should say whether the late fill unit is retired; if it is, a task applies the patch on top of T915.

Still open from before: T833-a (now three planner sheets without a global sheet), T952-a (four tour clips) and T953-a (`verify_home.mjs` checks retired sections, so it was not used here). The two stale dev servers on this machine still lock `node_modules`; stopping them makes the next `npm ci` work.

`data/derived/freshness_report.json` was already modified before this task and is left uncommitted.

## Rollback procedure

1. `npx wrangler pages deployment list --project-name carta-app`
2. In the Cloudflare dashboard (Pages, carta-app, Deployments), roll back production to 632ec87f-41fc-47aa-ae4f-eb68f5711b47 (T878, `index-CKuy4JqC.js`).
3. The held CSS commit can stay, because it only reorders rules into the first-paint sheet. To undo it, `git revert` the T954 commit.
4. Nothing was written to R2, so there is no data to roll back.
