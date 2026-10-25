# T738: every open branch looked at; the planner rebuild merged, pushed and deployed

## Task ID

T738

## Date

2026-10-25

## What changed

The owner asked, 2026-10-25: look at all branches (open price work included), merge everything cleanly, push, deploy, and list what has to be done before Monday.

**The branches.**

- **App repo** (`continent-app/`, no remote): three local branches were ahead of master, all from the planner rebuild and nested inside one another (`p15-trip-planner-flow` and `p15-day-planner` inside `p15-planner-final`). Every price branch (PB1 to PB5 worktrees, `p11-*`) was already in master.
- **Root repo**, branches ahead of main:

| Branch | What it is | Done |
|---|---|---|
| `p15-planner-final` (and the two it holds) | planner batches 1 and 2, T731 to T737; main already merged in | merged (fast-forward) |
| `origin/claude/carta-competitor-analysis-homepage-hndrx8` (2026-10-23) | two new HTML documents in `docs/strategy/` | merged |
| `p0-next-steps-docs` (2026-10-13) | a docs reorganisation that deletes `_OPEN-MASTER.md`, `_OWNER-RUNBOOK.md` and the P2, P3, P9 procedure files that CLAUDE.md and later reports still point to | not merged: it would delete live documents; owner decision (T738-a) |
| `explore-v4` (2026-09-12 to 13, also on origin) | old cycling fixes, 17,074 files apart from main | not merged: superseded by the later cycling and Explore work (T738-a) |
| `origin/claude/explore-page-redesign-pdf-7ly6hy`, `origin/claude/trails-destinations-cycling-ui-czpunu`, `origin/claude/trip-planner-ux-refinement-i78m8t` (all 2026-09-04) | cloud-session redesigns of Explore v5, the destinations tab and the trip planner, against the old single `styles.css` | not merged: superseded by Explore v6 to v8, the destinations work and the planner rebuild (T738-a) |

**The merge.**

- **Root:** main fast-forwarded to `p15-planner-final` (a02466f5b), then the competitor analysis branch was merged (03f8793fc).
- **App:** master moved to `p15-planner-final` (3db06b0). The root's fast-forward had already written the identical files into the shared `continent-app/` folder, so the app moved by `git update-ref` plus an index-only `git reset`, and its working tree is clean against the new master.
- **Checks:** `npm test` in the main checkout passes 832 of 832; with `public/boot.json` present, the 3 worktree-only failures pass here.

**Push.** Root main pushed: `fea0b2f80..03f8793fc`. The app repo has no remote; it ships through the root mirror.

**Deploy.**

1. **Build:** `VITE_E2E_SEAMS= npm run build:pages` (data base `https://data.carta-europetravel.com/data`; Pages limit check PASS, 252 files), `css-routes --check` 4 (as before), no verify seam in the bundle.
2. **R2:** `push-data.mjs --rclone-dry-run`: nothing to transfer, so no data push; this deploy is the app alone.
3. **Preview:** `wrangler pages deploy dist --branch preview` (52e3f5b8), then a smoke round on https://preview.carta-app.pages.dev at 390 and 1280:
   - compare with real fares;
   - the live flight search on the real host: €124 Brussels to Lisbon on TAP, and €166 after changing From to Amsterdam, which also proves T731 live;
   - I'll plan them myself, a day, and the insider tip;
   - compare three countries, and the journeys door.

   All pass.
4. **Production:** `wrangler pages deploy dist --branch main` (Pages b11423aa). https://www.carta-europetravel.com serves the same `index-BvB8Vhko.js` as the build. The same smoke round on production passes. One run of the day-planner path timed out once at 390 on a cold load and passed on the rerun.

**Not deployed.** The flight-sweep Worker's price gate (T645, wired to `config/pricing.json` by T693): its tests pass (10 of 10) and `wrangler deploy --dry-run` binds the same D1 and R2. The real deploy was refused by this session's permission check, so it stays with the owner (row T645-e, one command).

## Files touched

Merges only, plus this report and the register. Root: 03f8793fc (merge), the T738 commit. App: master ref moved to 3db06b0.

## Commands run

As above, in order: `git merge --ff-only p15-planner-final` (root), `git merge --no-ff origin/claude/carta-competitor-analysis-homepage-hndrx8` (root), `git update-ref refs/heads/master <p15-planner-final>` and `git reset -q` (app), `npm test`, `git push origin main`, `npm run build:pages`, `node scripts/css-routes.mjs --check dist/assets`, `node scripts/r2/push-data.mjs --rclone-dry-run`, `npx wrangler pages deploy dist --project-name carta-app --branch preview`, the smoke scripts, `npx wrangler pages deploy dist --project-name carta-app --branch main`.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Production build | Pages c9ecb462 (PB1 to PB5) | Pages b11423aa (plus the planner rebuild) |
| Unmerged branches with live work | 4 (planner nest, competitor docs) | 0; 5 stale branches left for a decision |
| Live flight search on the real host checked | never (localhost cannot) | 2 widths, preview and production |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A plain app merge after the root fast-forward would refuse | both repos track `continent-app/`; the root had already written the files | `update-ref` plus an index-only reset; status clean |
| One production smoke run timed out at 390 | a cold load on the live network | passed on the rerun |

## What is still open

- The owner decides what happens to the five stale branches (T738-a).
- The flight-sweep gate deploy is still the owner's (T645-e).
- Monday's box run: the owner steps of T640-a are still open (see the checklist artifact). The "merge and push" step is done by this task, and the box should move to main 03f8793fc or later.

## Rollback procedure

- **Production:** promote Pages deployment c9ecb462 in the Cloudflare dashboard (carta-app, Deployments).
- **Code:** root `git revert -m 1 03f8793fc` for the documents. The planner was a fast-forward, so roll it back with `git reset --hard fea0b2f80` on a branch, then deploy that build. App: `git update-ref refs/heads/master 4ffe6b6`.
- **Data:** none changed.
