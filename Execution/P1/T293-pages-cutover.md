# T293 carta-europetravel.com is served by Cloudflare Pages

## Task ID

T293

## Date

2026-10-02

## What changed

Production is no longer on Vercel. `www.carta-europetravel.com` is served by the Cloudflare Pages project `carta-app`. The bare domain answers 308 to `www`, with the path and query kept. The data comes from R2, as it has since T291. This is stage 6 of `_OPEN-MASTER.md` and the cut-over runbook in the T024 report, with one deliberate change: Pages takes direct uploads of the prebuilt `dist/` and is not connected to git. A git build cannot make `boot.json` (T290-a), so a git-connected Pages project would repeat the 2026-10-01 outage, exactly as a Vercel git build would. A side effect closes T291-a: a `git push` of main now only builds on Vercel's own URL, never on the domain. The deploy that went live is the same bundle production ran on Vercel since T291 (`index-BF9CGvZZ.js`), so travellers saw no change of code.

## Files touched

Execution:

**Created:**
- Execution/P1/T293-pages-cutover.md

**Modified:**
- Execution/_OPEN.md (T291-a closed by T293; rows T293-a to T293-c added)

No code changed. `public/_headers` and `public/_redirects` were already in the app tree since T024. Their CSP gained the data host in T290.

## Commands run

The session, from `continent-app/` after the owner freed 69 GB on C: with the T045-e clean-out of `data/raw` and the archived caches (the session's own delete was refused as irreversible):

```bash
VITE_DATA_BASE=https://data.carta-europetravel.com/data npm run build
npm run check:pages                                     # PASS: 62 files, 19,938 under the ceiling
cmp public/_headers dist/_headers                        # identical
```

The owner:

```bash
unset CLOUDFLARE_API_TOKEN          # the R2-only token would shadow the login
npx wrangler login
npx wrangler pages project create carta-app --production-branch main
npx wrangler pages deploy dist --project-name carta-app --branch main --commit-dirty=true
```

Then, in the dashboard: add the custom domain `www.carta-europetravel.com` to `carta-app`, which replaced the DNS-only CNAME to Vercel with a proxied CNAME to `carta-app.pages.dev`. Next, delete the apex CNAME to Vercel and add the custom domain `carta-europetravel.com`. Last, add the zone Redirect Rule "apex to www": `http.host eq "carta-europetravel.com"`, a dynamic target `concat("https://www.carta-europetravel.com", http.request.uri.path)`, 308, query string preserved.

The session's checks used `curl --resolve` to Cloudflare's addresses, because the laptop's resolver still held the Vercel answer for a few minutes:

```bash
curl -sI https://carta-app.pages.dev/                    # 200, six security headers, CSP with data host
curl -sI https://carta-app.pages.dev/assets/<bundle>     # max-age=31536000, immutable
curl -sI https://carta-app.pages.dev/boot.json           # 200, max-age=600
curl -sI https://carta-app.pages.dev/sw.js               # max-age=0, must-revalidate
curl -s -H "Origin: https://carta-app.pages.dev" -D - https://data.carta-europetravel.com/data/coverage.json   # ACAO matches
curl -sI https://data.carta-europetravel.com/data/poi/does-not-exist.json   # 404
curl -sI https://www.carta-europetravel.com/             # 200, server: cloudflare
curl -sI "https://carta-europetravel.com/some/path?x=1"  # 308 to https://www.carta-europetravel.com/some/path?x=1
curl -sI "http://carta-europetravel.com/x?y=2"           # 308 to https://www.carta-europetravel.com/x?y=2
```

The owner checked `https://carta-app.pages.dev` in a browser before the domain moved: the map, `#dest=BRU`, a trail, every tab and a destination photo all worked, with no CSP or CORS errors.

## Config and secrets set

- Cloudflare Pages project `carta-app`: production branch `main`, direct upload, no git connection, no environment variables (the build is local).
- DNS, zone `carta-europetravel.com`: `www` is a proxied CNAME to `carta-app.pages.dev`, and the apex is a proxied CNAME to `carta-app.pages.dev`, both created by Pages. The previous values were `www` CNAME `69c75661ba7daa14.vercel-dns-017.com` (DNS only) and an apex CNAME to the same Vercel host (DNS only). The owner keeps them for rollback.
- Zone Redirect Rule "apex to www", placed first.
- wrangler on the laptop is logged in through OAuth (`wrangler login`), not through a stored token.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Host serving www.carta-europetravel.com | Vercel (Hobby) | Cloudflare Pages | moved |
| Files in the production app deploy | 64 (Vercel prebuilt, T291) | 62 in the Pages count (plus `_headers` and `_redirects`) | same build |
| Apex behaviour | Vercel | 308 to www, path and query kept | |
| Root C: free space | 490 MB | 69 GB | +68.5 GB (T045-e clean-out) |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The apex served the site with 200 instead of redirecting | Pages ignores the domain-level line in `_redirects` | Zone Redirect Rule; T293-b for the dead line |
| The apex had no record for a few minutes | The Vercel CNAME was deleted before the Pages custom domain was added | Added the custom domain; delete-then-add is the order the dashboard forces, so keep the gap short |
| The first check of www still reached Vercel | The local DNS cache held the old answer | Checked with `--resolve` against Cloudflare's addresses |
| The session could not delete the archived inputs | The classifier refuses irreversible local deletes | The owner ran it, after the session confirmed no file had changed since the 2026-10-02 rclone checks and no pipeline was running |

## What is still open

T293-a: the Vercel project stays untouched for a week as the rollback, then goes. Rollback until then is two DNS edits back to the Vercel values above (DNS only), plus disabling the Redirect Rule.

From now on, a production deploy is: a split build on the laptop (or the box), then `npx wrangler pages deploy dist --project-name carta-app --branch main`. Push the data first with `push-data.mjs --live`, and prune after the deploy. T262-a, about how the box deploys the app, can now pick this route with a Pages-scoped API token.

T291-c can go ahead: pushing main to GitHub no longer affects production.

The rest of stage 6's Claude part is still open under its existing rows: T054-f (check:pages in ci), T054-g (drop the unread app_data.json from the same-origin build) and T054-i (CORS for Pages preview origins, which are per-deployment subdomains of `carta-app.pages.dev` that the exact-origin CORS list does not cover). T293-b and T293-c are small and could ride with them.

The T045-e clean-out was partial on purpose. `data/raw`, the eleven archived cache layers, `data/history` and `data/models` are gone from the laptop. `app_data/` (master and snapshots), `logs/`, the trailslab Docker volume and the tool caches stay, because local builds and deploys still need the master. T045-e stays open for the rest. `python pipeline/archive/push.py --pull` restores everything that was removed.

## Rollback procedure

In DNS, set `www` back to CNAME `69c75661ba7daa14.vercel-dns-017.com` and set the apex the same way, both DNS only, after removing the two Pages custom domains. Disable the "apex to www" rule. Vercel's production deployment (`carta-travel-jns78pp80`, the same build) is still promoted there and serves at once. The R2 data route is the same for both hosts.
