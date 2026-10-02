# T296 Pages previews have one fixed origin the data host admits

## Task ID

T296

## Date

2026-10-02

## What changed

The data host's CORS rule (`continent-app/scripts/r2/data-cors.json`) now lists `https://preview.carta-app.pages.dev` beside the production origins, `carta-app.pages.dev` and the two local Vite ports. Six origins in all. Cloudflare Pages gives every deploy its own `<hash>.carta-app.pages.dev` origin, and the rule matches exact origins only, so a preview could never read R2. A deploy with `--branch preview` also gets the stable alias `preview.carta-app.pages.dev`, and that alias is now the preview origin. The deploy sequence (data, preview, production, prune) is written once, in the header of `scripts/build-pages.mjs`, where the production build already lives. The rule takes effect only when it is applied with a Cloudflare token (T296-a). Until then the bucket still has the five origins T291 restored. A request with `Origin: https://preview.carta-app.pages.dev` gets 200 but no `access-control-allow-origin`, as checked after the commit.

T054-i bundled three unrelated items. This task closes the row for the CORS item it fixes and re-files the other two as their own rows (T296-b, T296-c), so neither is lost inside a closed row.

## Files touched

App (continent-app repo, branch p1-pages-preview-cors, stacked on p1-ci-pages-gate):

**Modified:**
- continent-app/scripts/r2/data-cors.json (one origin added)
- continent-app/scripts/build-pages.mjs (header: the deploy sequence)

Root (branch p1-pages-preview-cors, stacked on p1-ci-pages-gate):

**Modified:**
- the two files above (tracked copies)
- Execution/_OPEN.md (T054-i closed by T296; rows T296-a to T296-c added)

**Created:**
- Execution/P1/T296-pages-preview-cors.md

## Commands run

```bash
cd continent-app
git checkout -b p1-pages-preview-cors
# data-cors.json: one line after https://carta-app.pages.dev
node scripts/r2/push-data.mjs --cors                 # plan only: cors set from the file, then cors list
node --check scripts/build-pages.mjs
curl -s -D - -H "Origin: https://preview.carta-app.pages.dev" https://data.carta-europetravel.com/data/coverage.json   # 200, no ACAO yet
```

## Config and secrets set

None applied. The owner applies the rule (T296-a):

```bash
cd continent-app
node scripts/r2/push-data.mjs --cors --live    # CLOUDFLARE_API_TOKEN (R2 edit) and CLOUDFLARE_ACCOUNT_ID exported
```

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Origins in data-cors.json | 5 | 6 | +1 |
| Pages preview origins that can read R2 | 0 | 1 once T296-a is applied | +1 |

## What broke and how it was fixed

No issues.

## What is still open

T296-a, applying the rule, is the owner's: it needs a Cloudflare token with R2 edit rights, and the `carta-r2-admin` token is due to be rolled first (T291-b).

T296-b and T296-c are the two halves of T054-i that this task does not fix. The first is about the prune: it syncs each current R2_TIER entry, so the objects of an entry removed from R2_TIER would stay in the bucket. The second is the list of screen-harness failures found in T054 that still have no owner.

## Rollback procedure

`git revert` the T296 commits in both repos. If the rule was applied, run `push-data.mjs --cors --live` again from the reverted file to drop the preview origin.
