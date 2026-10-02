# T290 The data host is in the CSP, the app data is on R2, and the cutover route is open

## Task ID

T290

## Date

2026-10-02

## What changed

`https://data.carta-europetravel.com` is now in `connect-src` in both `continent-app/vercel.json` and `continent-app/public/_headers`. That is the one-line change stage 5.3 step 3 of `_OPEN-MASTER.md` asks for (T053-b), and it is what lets `scripts/r2/stage-data.mjs` accept a split build without `CARTA_SKIP_CSP_CHECK=1`. The two CSP strings remain identical. Before the edit, the owner finished stage 5.3 steps 1 and 2 in the same session. The bucket's CORS rule lists the five origins with GET and HEAD (T054-a). A split build (17 entries, 52,310 files, 1,101.4 MiB) was uploaded to `r2:carta/data/` with `push-data.mjs --live` after the T289 fix. `verify-data.mjs --all` then fetched all 52,311 objects from `data.carta-europetravel.com`, as seen from `https://www.carta-europetravel.com`, and every one was served as staged (T054-b). Production is unchanged: it is still the Sep 19 Vercel build, which reads nothing from R2.

The part the next session needs most is in "What is still open". The documented cutover (T054-c), "set VITE_DATA_BASE in Vercel Production, rebuild from the same master", cannot work, for the same reason the site broke on 2026-10-01.

## Files touched

App (continent-app repo, branch p3-csp-data-host, stacked on p3-push-data-windows-args):

**Modified:**
- continent-app/vercel.json
- continent-app/public/_headers (the CSP line, and the comment above it)

Root (branch p3-csp-data-host, stacked on p3-push-data-windows-args):

**Modified:**
- continent-app/vercel.json and continent-app/public/_headers (tracked copies, mirrored)
- Execution/_OPEN.md (T053-b, T054-a and T054-b closed by T290; rows T290-a and T290-b added)

**Created:**
- Execution/P3/T290-csp-data-host.md

## Commands run

The owner, from `continent-app/` with `CLOUDFLARE_API_TOKEN` (carta-r2-admin), `CLOUDFLARE_ACCOUNT_ID` and the rclone variables exported:

```bash
node scripts/r2/push-data.mjs --cors
node scripts/r2/push-data.mjs --cors --live
VITE_DATA_BASE=https://data.carta-europetravel.com/data CARTA_SKIP_CSP_CHECK=1 npm run build
node.exe scripts/r2/push-data.mjs --rclone-dry-run     # failed before T289, ran after it
node.exe scripts/r2/push-data.mjs --live
node.exe scripts/r2/verify-data.mjs                    # 58 requests, PASS
```

The session:

```bash
node scripts/r2/verify-data.mjs --all                  # 52,311 requests, PASS, 7 m 40 s
sed -i "s#connect-src 'self' #connect-src 'self' https://data.carta-europetravel.com #" vercel.json public/_headers
VITE_DATA_BASE=https://data.carta-europetravel.com/data npm run build   # failed: C: full, see below
rm -rf dist dist-data
node -e "<stage-data.mjs connectSrc() and cspProblems() logic against both files>"   # both true, identical
```

## Config and secrets set

Bucket `carta` CORS rule, from `scripts/r2/data-cors.json`: origins `https://www.carta-europetravel.com`, `https://carta-europetravel.com`, `https://carta-app.pages.dev`, `http://localhost:5173`, `http://localhost:4173`; methods GET and HEAD; max age 86,400 seconds. No secrets were added; the tokens are those listed in the T288 report.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Objects under r2:carta/data/ (excluding the provision test object) | 0 | 52,310 | +52,310 |
| verify-data --all, files served as staged | not run | 52,311 of 52,311 | all |
| CORS origins on the bucket | 0 | 5 | +5 |
| CSP files whose connect-src admits the data host | 0 of 2 | 2 of 2 | +2 |
| Files in the app-host build (dist/ after stage-data) | 64 + 52,310 (same-origin, derived from the stage-data output) | 64 (6.4 MiB) | -52,310 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The owner's `verify-data.mjs --all` never ran | Two commands pasted together; only the first executed | Run by the session instead |
| The verification build after the CSP edit failed inside Vite | C: had 147 MB free at the start and 11 MB at the end; the earlier split build's dist/ and dist-data/ were still on disk | Deleted dist/ and dist-data/ (both rebuild from the pipeline output, and the data is verified in R2), and checked the CSP with stage-data's own parsing logic run against both files rather than a second full build |

The full split build without the skip flag was therefore not repeated. The check it runs is the 15 lines reproduced above, and those return true for both files. The next build with `VITE_DATA_BASE` set is the real confirmation, and it is part of the cutover.

## What is still open

The cutover route needs a decision from the owner (T290-a). `scripts/sync-data.mjs` builds `public/boot.json` from `app_data/app_data.json`. That master is gitignored, and so is `public/boot.json` in continent-app, and the root repo does not track `boot.json` either (it does track `public/app_data.json`, `country_insights.json`, `country_shapes.json`, `joins.json` and `sitemap.xml`). A Vercel build from git therefore has no master, so sync-data warns and leaves `public/` as it is, and the deploy ships without `boot.json`. That is exactly the 2026-10-01 failure ("We couldn't load Carta's travel data"), and setting `VITE_DATA_BASE` in Vercel does not change it. Three routes would work:

1. Deploy a prebuilt app shell from the laptop with the Vercel CLI (62.1.0 is reachable through npx). Run `vercel pull`, then `vercel build --prod` with `VITE_DATA_BASE` set, then `vercel deploy --prebuilt` as a Preview first, then promote. The boot index then comes from the same master as the 52,310 objects already in R2. This needs a `vercel login` and about 2.5 GB free on C:.
2. Skip the Vercel cutover and move straight to Cloudflare Pages (stage 6). The 64-file `dist/` is what Pages wants, and `npm run check:pages` should pass on it. Stage 6 also needs DNS work, so it is the longer route.
3. Track `boot.json` in the root repo, so that a git build has it. That makes every data refresh a commit, and it runs against the T262 design, in which the box publishes the data.

Recommendation: route 1, as a Preview first. Whichever route is taken also decides which code goes live. Production is the Sep 19 build, while local `main` is 150 commits ahead of `origin/main` with waves 1 to 5 merged and never deployed. Any cutover build from local `main` ships all of that at once. So the Preview needs a click-through of the main screens before it is promoted, and `git push` of main must wait until production reads from R2 (see the Vercel memory: main auto-deploys).

C: is too full to build (T290-b). After the build folders were deleted it had 3.6 GB free, with Docker's data at 29 GB and C: at 473 of 477 GB used. The free space dropped by about 4.8 GB between two builds while other work ran. A split build needs about 2.3 GB, and the prune in T054-c needs that build's `dist-data/` to still exist.

T054-c itself (cutover, network-panel check and `push-data.mjs --live --prune`) stays open with the owner. T054-c's prune needs the same `dist-data/` the deploy was built from, so the cutover build should be kept on disk until the prune has run.

## Rollback procedure

`git revert` the T290 commit in `continent-app/` and then the root commit. With the data host out of `connect-src`, a split build is refused again until the line returns. Production is unaffected either way until a split build is deployed. The CORS rule comes off with `npx wrangler r2 bucket cors delete carta`, and the data objects with `rclone purge r2:carta/data`. Neither is needed while production reads same-origin data.
