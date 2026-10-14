# T445: Deploy the Explore redesign (data, preview, production)

## Task ID

T445

## Date

2026-10-14

## What changed

The owner approved the Explore work (T437 to T444) and asked for the deploy. Production is Cloudflare Pages by direct upload (project `carta-app`), with the data shards on R2 (`data.carta-europetravel.com/data`). The documented order is the data first, then a preview, then production (scripts/build-pages.mjs).

**Two problems found and fixed before the deploy**
- **The search data was not on the data host.** `search/guided.json` (T439) is an R2 entry, but it had never been uploaded, so the data host answered 404. A production deploy without it would have shown the guided search stuck on "Loading the search" and the hiking and beach rails empty.
  - Fix: uploaded the one file with wrangler (`carta/data/search/guided.json`, application/json, the same Cache-Control as its neighbours).
  - Verified: 200, CORS for the preview origin, 371,115 bytes, identical to the source.
- **`public/_headers` had no rule for `/search/*`.** The data tooling (`push-data.mjs`, `verify-data.mjs`, `verify_data_host.mjs`) reads every R2 entry's Cache-Control from `_headers` through `cachePolicy.mjs`, and throws when one is missing.
  - Fix: added `/search/*` with the house data policy (`public, max-age=3600, stale-while-revalidate=86400`). All 18 R2 entries now have a policy.

**The deploy**
- `npm run build:pages`, with `VITE_E2E_SEAMS` empty and the production data base:
  - Pages tree: 93 files, 7.8 MiB, passes the 20,000-file gate;
  - R2 tree: 52,312 files staged in `dist-data/`.
- **Preview:** `wrangler pages deploy dist --branch preview` went to https://preview.carta-app.pages.dev (deployment 064f4dd1). A smoke test on desktop and an iPhone viewport passed 18 of 18:
  - Explore shows places;
  - the search opens with its examples, from the data host;
  - "hiking in the alps in july" completes and the results carry their why line;
  - the map shows prices;
  - a place opens with `#dest=` in the address, and Back returns;
  - no page errors and no failed Carta requests.
- **Production:** `wrangler pages deploy dist --branch main` was refused by the session's permission classifier, so it is the owner's step (T445-a).

## Files touched

**Modified (app, mirrored in root):** continent-app/public/_headers (`/search/*`)

**Modified (root):** Execution/_OPEN.md. **Created (root):** this report.

**Outside git:** R2 object `carta/data/search/guided.json` (new); Pages preview deployment 064f4dd1.

## Commands run

```
curl https://data.carta-europetravel.com/data/search/guided.json            (404 before)
node -e "dataCachePolicy()"                                                  (throws before, 18 entries after)
npm run build:pages                                                          (93 files, PASS)
npx wrangler r2 object put carta/data/search/guided.json --file dist-data/search/guided.json --content-type application/json --cache-control "public, max-age=3600, stale-while-revalidate=86400" --remote
curl -D - https://data.carta-europetravel.com/data/search/guided.json        (200, json, policy, CORS)
npx wrangler pages deploy dist --project-name carta-app --branch preview     (064f4dd1)
node <scratchpad>/smoke.mjs https://preview.carta-app.pages.dev              (18 of 18)
npx wrangler pages deploy dist --project-name carta-app --branch main        (refused by the classifier; owner step)
```

## Config and secrets set

None. Wrangler's existing OAuth login was used; no key was written anywhere.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| `search/guided.json` on the data host | 404 | 200 |
| R2 entries with a Cache-Control policy in `_headers` | 17 of 18 (tooling threw) | 18 of 18 |
| Preview smoke test (desktop and phone) | n/a | 18 of 18 |
| Production | the V6 build of 2026-10-13 | unchanged until the owner runs T445-a |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The guided search data was missing on the data host | T439 added the R2 entry, but the upload (an owner step with rclone keys) never ran | Uploaded the one new file with wrangler |
| `dataCachePolicy()` threw | T439 added `search` to R2_TIER without a `_headers` rule | Added the `/search/*` rule |
| The production deploy command was refused | The session's permission classifier blocks production deploys | Left to the owner (T445-a) |

## What is still open

- **T445-a, owner.** Run the production deploy from `continent-app/`:
  `npx wrangler pages deploy dist --project-name carta-app --branch main`
  - `dist/` already holds the checked build (93 files). Do not rebuild in between, or run `npm run build:pages` first.
  - Afterwards, the live index should name the same bundle as `dist/index.html`.
- **T445-b, owner.** Only `search/guided.json` was uploaded to R2. If a pipeline run has changed any other data since the last full push, run `node scripts/r2/push-data.mjs --live` with the rclone keys (T045).
  - Phase 2 (`--prune`) removes nothing this release needs, since no R2 entry was removed.

## Rollback procedure

- **Production:** promote the previous deployment in the Cloudflare Pages dashboard (the V6 build of 2026-10-13, d573ebf2).
- **The new R2 object:** harmless to the old build, which never requests it. Remove it with `npx wrangler r2 object delete carta/data/search/guided.json --remote` if wanted.
- **The `_headers` rule:** revert the T445 commit.
