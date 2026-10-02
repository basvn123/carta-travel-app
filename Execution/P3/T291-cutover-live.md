# T291 Production reads its data from R2

## Task ID

T291

## Date

2026-10-02

## What changed

`www.carta-europetravel.com` now serves a split build. The app host carries the 64-file app shell, and every data shard (dest, poi, dossier, trails and the rest) comes from `https://data.carta-europetravel.com/data`. That is stage 5.3 step 4 of `_OPEN-MASTER.md` (T054-c), and with it stage 5 is complete. The build was made on the laptop with the Vercel CLI and uploaded prebuilt, not built by Vercel from git. A git build cannot produce `boot.json` (T290-a), and that missing file is what broke the site on 2026-10-01. The owner checked the deployment at its own URL first, with the test origin temporarily in the bucket's CORS rule: the map, `#dest=BRU`, a trail, every main tab, and the network panel all worked. The owner then promoted it, put CORS back to the five standard origins, and ran the phase 2 prune. The prune synced all 14 directories and deleted nothing, since the build matched the upload. The live site serves `assets/index-BF9CGvZZ.js` and `boot.json` with 200, and `verify-data.mjs` passes after the prune. The code that went live is local `main` from waves 1 to 5 plus T289 and T290, which had never run in production before.

## Files touched

Execution:

**Created:**
- Execution/P3/T291-cutover-live.md

**Modified:**
- Execution/_OPEN.md (T054-c and T290-a closed by T291; rows T291-a to T291-c added)

No tracked code changed. Local, untracked files: the root is linked to Vercel project `carta-travel-app` through `.vercel/project.json`. `.vercel/` and `/.env.local` are listed in `.git/info/exclude`, and in the local project settings the install command is set to `echo skip-install`. `vercel link` also added `.vercel` and `.env*` to the tracked root `.gitignore`; that edit was reverted. `.env.local` (a Vercel OIDC token), `.vercel/cors-preview.json`, `.vercel/output`, `continent-app/dist` and `continent-app/dist-data` were deleted afterwards.

## Commands run

The session, from the repo root:

```bash
echo ".vercel/" >> .git/info/exclude ; echo "/.env.local" >> .git/info/exclude
npx vercel link --yes --project carta-travel-app --scope basportfolio
npx vercel pull --yes --environment=production
sed -i '/"\[SENSITIVE\]"/d' .vercel/.env.production.local      # the pulled Supabase values are placeholders
# .vercel/project.json: settings.installCommand = "echo skip-install"
VITE_DATA_BASE=https://data.carta-europetravel.com/data npx vercel build --prod --yes
node continent-app/scripts/r2/verify-data.mjs                   # PASS against this build's dist-data
```

The owner, because the session's deploy was refused as a production deploy:

```bash
npx vercel deploy --prebuilt --prod --skip-domain               # run twice; carta-travel-jns78pp80 used
# temporary CORS: data-cors.json plus https://carta-travel-jns78pp80-basportfolio.vercel.app
npx wrangler r2 bucket cors set carta --file ../.vercel/cors-preview.json --force
npx vercel promote https://carta-travel-jns78pp80-basportfolio.vercel.app
node.exe scripts/r2/push-data.mjs --cors --live
node.exe scripts/r2/push-data.mjs --live --prune
```

## Config and secrets set

Vercel production is deployment `carta-travel-jns78pp80-basportfolio.vercel.app`. Its build used the Supabase URL and anon key from `continent-app/.env`, the same project `ntssxktaduxzpsmejwyv` that production used before. Vercel marks those variables sensitive, so `vercel pull` returns only the text `[SENSITIVE]`, and a build that used them would point at no server. `VITE_DATA_BASE` was set in the shell for the build. It is not stored in the Vercel project. The bucket's CORS rule is back to `scripts/r2/data-cors.json`.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Production bundle | index-Cxs7clJc.js (Sep 19 build) | index-BF9CGvZZ.js | new build |
| Production /boot.json | 404 (the Sep 19 build does not use it) | 200 | fixed |
| Files the app host serves | same-origin catalogue (about 52,000 in the T054 count) | 64 | about -52,000 |
| Objects deleted by the prune | n/a | 0 | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `vercel pull` gave `VITE_SUPABASE_URL="[SENSITIVE]"` | Sensitive Vercel variables cannot be downloaded | Removed those lines locally; the build read `continent-app/.env` |
| `vercel link` edited the tracked root `.gitignore` | CLI default | Reverted; local excludes used instead |
| The session's `vercel deploy` was refused | The auto-mode classifier treats it as a production deploy | The owner ran deploy and promote |
| The first CORS attempt named the wrong URL with a trailing slash | An old git-branch preview URL was copied | Read the deployment list, used the new deployment's URL without a slash |
| A CORS command failed with "Cannot find module" | Run from the repo root instead of `continent-app/` | Ran again from `continent-app/` |
| The first prune attempt did nothing | The rclone variables were not set in that window | Exported them; the prune then ran clean |

## What is still open

The most important open item is T291-a. Vercel still auto-deploys every push of `main` from git, and that build ships without `boot.json`, so the next `git push` of main would take the site down exactly as on 2026-10-01. Before anyone pushes, either set an Ignored Build Step in the Vercel project's Git settings so git builds never reach production, or move to Cloudflare Pages (stage 6). With Pages, deploys are uploads of a prebuilt `dist/`. Every production deploy until then is the prebuilt route in "Commands run".

T291-c follows from that. Production now runs local `main`, which is 150 commits ahead of `origin/main`. Push main once T291-a is settled, so that GitHub matches what is live.

T291-b: the `carta-r2-admin` token was pasted into the session, so it should be rolled, and the dead `Carta` user token deleted.

T290-b (disk) stays open. C: had 828 MB free when this report was written, and other work on the laptop was using about 5 GB between checks.

T054-h, untracking the root repo's copies of `continent-app/public` data, is now unblocked; no task claims it yet.

The task branches for T288 to T291 are unmerged: `p3-archive-live`, then the chain `p3-push-data-windows-args`, `p3-csp-data-host` and `p3-cutover-live`. T289 and T290 exist in both repos. Merge the app repo first. The app checkout is on `p3-csp-data-host`.

## Rollback procedure

In the Vercel dashboard, open Deployments, select the Sep 19 production deployment ("Production rebuild of 2F7UDdELX"), and promote it, or run `npx vercel rollback`. The old build reads same-origin data and has no CSP entry for the data host, so it works without R2. Leave the R2 data and the CORS rule in place: they cost nothing, and they let a later promote go forward again. This report reverts with `git revert`.
