# T294 _redirects says what Pages really does, and the Pages config files stay LF

## Task ID

T294

## Date

2026-10-02

## What changed

`continent-app/public/_redirects` no longer carries the domain-level apex rule (`https://carta-europetravel.com/* https://www.carta-europetravel.com/:splat 308`). Cloudflare Pages only matches paths in `_redirects`, so it ignored that line. The apex served the site with 200 until T293 added the zone Redirect Rule "apex to www", which is now the one place the apex redirect lives. The file now holds only comments, and those comments name the rule. They also correct a second claim. The old comment said that leaving out an SPA catch-all keeps missing paths at a clean 404. On Pages that is not so: with no top-level `404.html` in the deploy, Pages answers every unknown path with `index.html` and 200. A missing shard still 404s, because the shards are on R2. The files the app host still serves (`boot.json` and the three catalogue files) do not, and that is filed as T294-a rather than changed here, because it changes production behaviour. A new `continent-app/.gitattributes` pins `public/_headers` and `public/_redirects` to `text eol=lf`. The working copy of `_redirects` had CRLF endings under `core.autocrlf=true`, and that copy is what the T293 deploy uploaded. Pages read it without complaint, but the endings now no longer depend on each machine's git settings. Production is unchanged until the next deploy, and that deploy changes nothing visible, since the removed line was already ignored.

## Files touched

App (continent-app repo, branch p1-pages-config-hygiene, stacked on p3-csp-data-host):

**Modified:**
- continent-app/public/_redirects

**Created:**
- continent-app/.gitattributes

Root (branch p1-pages-config-hygiene, stacked on p1-pages-cutover):

**Modified:**
- continent-app/public/_redirects (tracked copy)
- Execution/_OPEN.md (T293-b and T293-c closed by T294; row T294-a added)

**Created:**
- continent-app/.gitattributes (tracked copy; a .gitattributes applies to the paths below it, so it pins the root's copies too)
- Execution/P1/T294-pages-config-hygiene.md

## Commands run

```bash
cd continent-app
git checkout -b p1-pages-config-hygiene
# edit public/_redirects, create .gitattributes
git add --renormalize public/_headers public/_redirects
git ls-files --eol public/_headers public/_redirects       # i/lf w/lf attr/text eol=lf, both
VITE_DATA_BASE=https://data.carta-europetravel.com/data npm run build
cmp public/_redirects dist/_redirects && cmp public/_headers dist/_headers   # identical
npm run check:pages                                         # PASS: 62 files
```

The only other readers of `_redirects` are `scripts/check-pages-limits.mjs`, which skips it by name, and a comment in `scripts/verify_data_host.mjs` that assumes no fallback (T294-a).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Rules in public/_redirects | 1 (ignored by Pages) | 0 | -1 |
| CRLF in the working copy of _redirects | yes | no | fixed |
| check:pages | PASS, 62 files | PASS, 62 files | 0 |
| Bundle | index-BF9CGvZZ.js | index-BF9CGvZZ.js | unchanged |

## What broke and how it was fixed

No issues.

## What is still open

T294-a, a real 404 on the app host. The app uses only `/`: routes live in the hash and the query, the sitemap lists one URL, and the auth redirects go to `window.location.origin`. A `404.html` in the deploy would therefore cost the app nothing and restore the behaviour the old comment promised. Copying `index.html` at build time would keep a mistyped deep link rendering the app, while returning status 404. That is a production behaviour change with a design side (whether a lost visitor sees the app or a page of its own), so it gets its own task.

## Rollback procedure

`git revert` the T294 commits in both repos. The apex redirect does not depend on this file, so reverting changes nothing in production. The Redirect Rule stays.
