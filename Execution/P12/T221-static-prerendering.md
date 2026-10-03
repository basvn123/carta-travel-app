# T221 Static prerendering

## Task ID

T221 (mind-map M21)

## Date

2026-10-03

## What changed

Every indexable page type now has static HTML that a crawler can read without running JavaScript, and a way to serve it from Cloudflare without touching the 20,000-file ceiling of the Pages deploy. Before this task, a request for any content path (`/austria/lakes/at-attersee-q698516`, `/spain/malaga`, `/trips/...`) got the app shell with status 404, the site-wide title and an empty `<div id="root">`: zero words for a crawler, on all twelve page types. After it, the same requests, served through the new Function in a local Pages runtime, return status 200 with the page's own title, description, canonical, JSON-LD and between 150 and 600 words of measured facts and links, inside the normal shell with its CSP and security headers intact. The build writes 32,220 pages in about 75 seconds.

Nothing is live yet. Creating the bucket, uploading the pages and deploying are owner steps, written out as exact commands under "Owner procedure" below (register row T221-a).

## How it works

There are three parts, and one shared module that keeps them from disagreeing.

The build is `continent-app/scripts/prerender/build.mjs`. It reads the same wire files the app reads (public/ after sync-data) in two passes. The first pass loads every layer file once and keeps the light rows without geometry, which takes about two seconds and lets any page link any other page while only ever linking a page that exists. The second pass writes the pages. The page models come from `pages.mjs`, one builder per page type, and every sentence in them goes through the story builders the app itself renders with (beachStory.js, lakeStory.js, mountainStory.js, trailStory.js, cycleStory.js) with the English catalogue as `t()`, so the page a crawler reads says what the app says. Destination costs come from `costIndex.js` computeCosts over the whole catalogue, the same function the app and the T212 share card use. `html.mjs` turns a model into the stored document and applies the house style on the way (stripDashes, no markdown bold, no spaced middot, the "(talk, contribs)" tail of Commons credits removed).

What a page carries follows docs/SEO.md: the title pattern "{name}, {headline number}, {qualifier} | Carta" cut to 60 characters by dropping the qualifier first and " | Carta" second; a description of whole sentences up to 155 characters; a canonical from urlScheme.js canonicalFor() (a variant points at the line it varies when that line can be found by name); one JSON-LD graph with WebSite, WebPage, BreadcrumbList and the subject node of the SEO.md table, with no AggregateRating and no Offer and the word "estimate" on every estimated PropertyValue; the breadcrumb as a real link chain; link sections built from the records (a trail's family and the best walks in its NUTS2 region, a destination's walks, rides, water, peaks and day trips, a region's rated rows and neighbours); the honest coverage line ("Carta publishes 570 rated walks in Austria and lists 2 more that do not have enough measured facts to be rated yet"); and the sources.

A page is stored as two marked fragments, `<!--carta:head-->` and `<!--carta:body-->`, inside a document that also opens on its own for checking by eye. It is never stored as a finished page, because the shell names the hashed JS and CSS of one deploy: a finished page on R2 would break the app for a person the first time a deploy changed those names, and the bucket would have to be rewritten on every deploy. Splitting it this way lets the data and the deploy move on their own cadences.

The Function is `continent-app/functions/[[path]].js`. For a GET or HEAD on a content path it reads the page from the `PRERENDER` R2 binding and the shell from the static deploy (`env.ASSETS.fetch('/')`) in parallel, removes the shell's own title, description, canonical, og and twitter tags, puts the page's head in their place and the page's body inside the root div, and answers 200. Pages does not apply public/_headers to a Function's own response, so the response starts from the headers of the shell, which the static server did apply them to; the local Pages runtime confirmed the CSP, X-Frame-Options, HSTS and the rest come through. If the shell ever arrives without a CSP the Function refuses to serve rather than serve unprotected. Every miss (no binding, no object, a malformed page, a dotted file path, a POST) is handed to `next()`, the static deploy, which answers with 404.html, so a person still gets the app and a crawler gets an honest 404. Deploying the Function before the bucket is filled therefore changes nothing a person sees. It also serves the optional share cards at `/og/p/{key}.png`.

The routes are `continent-app/public/_routes.json`: the 43 country prefixes (each twice, because `/spain/*` does not match `/spain`), `/trips/*`, `/journeys/*` and `/og/p/*`, 89 rules of the 100 Pages allows. Without this file Pages would generate an include of `/*` from the functions folder and every asset request would count against the 100,000 Function requests a day of the free plan; with it, a person's visit costs one Function request for the landing page and nothing for the shell, the assets or the boot index.

The shared module is `continent-app/src/lib/prerenderShell.js`: the bucket key for a path, the card key, the routes, the splice and the noindex test, as pure functions next to urlScheme.js. The key carries the identifier and never the title slug (`en/spain/trails/176172.html`), so a request with a stale slug finds the page and the page's canonical names the current slug, as SEO.md asks. Page n of a list is `p{n}` in the key, because a bare number is the key of trail or cycling id n (the first full build found such collisions, see below). The language is the first key segment; only English is built, per hreflang wave one.

Two small changes outside the new files make the pages work for a person. `src/lib/pathBoot.js` now opens a destination from its path: the prerendered destination page carries `<meta name="carta:boot" content="#dest=AGP">`, and pathBoot reads it (only a `#dest=` value of the dossier id shape is accepted) when the path is a destination. That closes the path half of T223-a without shipping a 3,868-row table to every client. `src/lib/urlScheme.js` legacyHashToPath now gives a trail or cycling id of four digits or fewer a placeholder word (`/switzerland/trails/5134-trail`), because the bare id reads back as page 5134 of the trail list; 468 trail ids and 152 cycling ids on the wire are that short, and every one of their old hash links would have landed on a list page once VITE_PATH_URLS is on.

The bucket is its own, `carta-prerender`, bound in wrangler.toml, and not a prefix in the `carta` bucket. Every object in `carta` is public through the cdn and data custom domains, so a prefix there would put a duplicate of every page on a second host; a separate bucket with no custom domain is only reachable through the binding, and the data bucket's lifecycle and CORS rules never touch it.

Share cards (register T212-b) are optional at build time: `--cards` renders each destination, trail, beach, lake and mountain page's card with scripts/og (spec, draw, rasterise in one shared Chromium), writes it to `og/{key}.png` and points og:image at `/og/p/{key}.png`; a record whose spec comes back null keeps the site card, and a page is written only after its card exists. A sample of 20 cards took 5.6 seconds, 0.28 s a card, so the 26,649 card-bearing pages project to about two hours.

`scripts/prerender/push.mjs` uploads with rclone in two phases like the data push (copy, then sync with `--prune`), prints the plan and touches nothing without `--live`, and refuses to prune from a build of fewer than 1,000 pages so a check run can never empty the bucket.

## What is prerendered, and what is not

The first wave is the rated tier in English. Pages by kind from the full build: 43 countries, 489 section list pages (trails, beaches, lakes, mountains, cycling, regions, trips, paginated at 100), 3,868 destinations, 17,619 trails, 501 cycling routes, 17 cycling tours, 2,746 beaches, 1,681 lakes, 735 mountains, 319 NUTS2 regions, 3,949 trips (a cross-border trip filed under two countries is one page) and 253 journeys. Listed rows, coast and range regions wait for the page floor that T222 runs (T205-d); the language prefixes wait for hreflang wave two (T205-g); T224's cost and trip-length pages do not exist yet; guides are noindex community pages. All of those get the shell with a 404, as today. The home page `/` is still the plain shell and links no country (T221-c).

## Design calls

The readable body follows DESIGN.md and the carta-design rules: a 760 px reading column on `--paper`, the name in `--display`, prose in `--ui`, every measured number in `--mono` with tabular numerals (words like "estimated" moved into the label so a mono value is only the figure), lists divided by `--rule-soft` hairlines, one licensed photograph with its credit, focus ring `2px solid var(--accent)`. Every colour, face and space is a token from the shell's own stylesheet; no hex is typed. There is no button: a person sees this column only until the app takes over, and a crawler needs links, not actions. Checked with JavaScript off at 380 px and 1280 px on the Austria country page, the Austria walks list, Attersee, Achensee and a trip: no horizontal scroll, one h1, headings in order. With JavaScript on and same-origin data, the trail and the destination paths opened the trail page and the destination page in the app.

The seven questions: no hex outside `:root`; no gradient, shadow or second hue; ochre, teal and danger unused; mono only on figures; no primary button at all; every list heading carries a number ("570 walks in Austria") and the diff is free of em dashes and the banned words; the one thing removed was a mono value that carried a word.

## Files touched

Root repo (`wt/T221`, branch p12-prerender):

**Modified:**
- docs/SEO.md (a section on how the pages are built and served; the destination gap sentence updated)
- Execution/_OPEN.md (T223-a and T212-b closed; T221-a to T221-i appended)

**Created:**
- Execution/P12/T221-static-prerendering.md

App repo (`wt/T221-app`, branch p12-prerender, commit 9dfc4ce):

**Modified:**
- continent-app/wrangler.toml (the PRERENDER R2 binding, under the session's exception to rule 4)
- continent-app/src/lib/pathBoot.js (the carta:boot destination tag)
- continent-app/src/lib/urlScheme.js (short ids in legacyHashToPath)

**Created:**
- continent-app/functions/[[path]].js
- continent-app/public/_routes.json
- continent-app/src/lib/prerenderShell.js
- continent-app/scripts/prerender/build.mjs, pages.mjs, html.mjs, cards.mjs, push.mjs
- continent-app/scripts/verify_prerender.mjs
- continent-app/tests/prerenderShell.test.mjs

`public/_routes.json` is not in the session's named exception, which covers wrangler.toml and the functions folder. It is a new file, not one of rule 4's listed files, and it is the Function's own routing: without it the deploy would route every request through the Function. The orchestrator should confirm it is acceptable before merging.

## Commands run

From `wt/T221-app`, with the wire read from the main checkout (read only):

    node scripts/prerender/build.mjs --data "<main>/continent-app/public" --out <scratchpad>/pr-final
    node scripts/verify_prerender.mjs <scratchpad>/pr-final
    node scripts/prerender/build.mjs --data "<main>/continent-app/public" --country AT --sample 4 --cards --out <scratchpad>/pr-cards
    node --test tests/prerenderShell.test.mjs ; npm test ; npm run lint
    node scripts/verify_url_scheme.mjs "<main>/continent-app/public/dossier"
    node scripts/build-pages.mjs                 (split build, 66 files, PASS)
    wrangler pages dev dist --port 5201          (before: no functions folder; after: functions and the binding)
    npm run build                                (same-origin build, for the in-browser check)

dist/, dist-data/ and every prerender output were deleted after use; the pages were written to the session scratchpad, never into the repo. wrangler 4.147.0 came from the npx cache; no package was added.

Local R2 simulation does not work in this wrangler on Windows (every `r2 object put --local`, and every `put` from inside the dev server, fails with "Network connection lost"). The end-to-end check therefore stood the bucket in with a scratch-only middleware that read the same page files through the real asset server; the routes, the Function, the shell and the headers were the real ones. `verify_prerender.mjs` also drives the Function directly against the whole build with a fake bucket.

## Config and secrets set

One binding in wrangler.toml: `[[r2_buckets]] binding = "PRERENDER", bucket_name = "carta-prerender"`. The bucket does not exist yet (owner step). No secret. VITE_PATH_URLS stays unset in the repo; the owner sets it for the build that ships with the pages (T223-c).

## Before/after measurements

The before column is the static deploy as it is today, served by `wrangler pages dev` without the Function; the after column is the same split build with the Function and the pages, over one page of each kind.

| Metric | Before | After | Delta |
|---|---|---|---|
| Page types that answer a crawler with rendered HTML | 0 of 12 | 12 of 12 | +12 |
| Status on a content path | 404 (the shell) | 200 | |
| Words in the body without JavaScript, the twelve sample pages | 0 on each | 150 (tour) to 599 (walks list) | |
| Title on those twelve pages | the one site title | each page's own | |
| CSP and security headers on a content path | present | present (carried from the shell) | none lost |
| Prerendered pages | 0 | 32,220 | +32,220 |
| Build time, full wire | none | 72 to 117 s over four runs | |
| Output size | none | 287.2 MiB, median page 8,080 to 25,372 bytes by kind | |
| Pages deploy files (check-pages-limits) | 66 | 66 (_routes.json is in its ignore list) | 0 |
| Function routes of the 100 allowed | 0 | 89 | +89 |
| Indexable URLs on production | 1 | 1 | 0, until the owner uploads and deploys |
| npm test | 123 tests, 120 pass, 3 skipped | 134 tests, 131 pass, 3 skipped | +11 |
| npm run lint | 0 errors, 72 warnings | 0 errors, 72 warnings | 0 |

Per kind, from `verify_prerender.mjs` over the full build (median words a crawler reads in the body, median links to other prerendered pages):

| Kind | Pages | Median words | Median internal links |
|---|---|---|---|
| country | 43 | 384 | 48 |
| section | 489 | 331 | 73 |
| dest | 3,868 | 294 | 14 |
| trail | 17,619 | 173 | 10 |
| cycle | 501 | 196 | 12 |
| tour | 17 | 133 | 11 |
| beach | 2,746 | 181 | 11 |
| lake | 1,681 | 215 | 11 |
| mountain | 735 | 255 | 8 |
| region | 319 | 235 | 41 |
| trip | 3,949 | 148 | 10 |
| journey | 253 | 286 | 10 |

The verify run passed 354,497 checks: markers, one h1, title and description limits, an absolute canonical on www that has a page, JSON-LD that parses with a BreadcrumbList and no rating or offer markup, no em dash, en dash, bullet or spaced middot, no internal content link to a page the build lacks, every page path covered by _routes.json and no static path caught by it, and the Function's answers for one page of every kind, a stale slug, HEAD, a missing binding, a shell without a CSP and seven paths that must fall through. 195 titles are over 60 characters because the name alone is; 4,296 trail titles and 441 trip titles drop " | Carta" to fit. 1,043 detail pages have fewer than six internal links (180 trails, 167 beaches, 276 lakes, 249 mountains, 165 destinations, 6 cycling routes), against SEO.md's target of a median of eight, which every kind meets (mountains at exactly eight).

Counts come from the build's own log and `_manifest.json`, the verify table, the stats pass over the build, and check-pages-limits. The wire read is the main checkout's continent-app/public of 2026-10-03 (layer files generated 2026-09-13 to 09-16).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Duplicate keys on the first full build, such as /switzerland/trails/4 and trail 4 | A list page's key was its page number, the same as the key of the trail or cycling route with that id | List pages are `p{n}` in the key |
| Cross-border trips reported as duplicates | A trip is filed under each of its countries | The second copy of the same path is skipped, not counted |
| Descriptions ending "come first among the." | The cap cut mid-sentence and added a full stop | Descriptions are built from whole sentences; only an overlong first sentence is cut, with an ellipsis |
| "Bogdan (talk, middot, contribs)" in credits, and a Catalan l-middot-l flagged | Commons author strings; the middot check did not tell a separator from a letter | The Commons tail is removed and a spaced middot becomes a comma; the check allows a middot between two letters |
| "a 11.8 km", "Best from July to July", "moving by mixed", "0.0 km2 lake" | Copy built from raw fields | An article helper for figures, a single-month phrase, the app's own transport labels, and lake area shown only from 0.05 km2 and in the title only from 1 km2 |
| Legacy hash links for 620 short trail and cycling ids would land on list pages | legacyHashToPath built id-only paths, and /x/trails/5134 reads as page 5134 | A placeholder word after a short id |
| Local R2 puts fail | wrangler 4.147 local R2 on Windows | The end-to-end check stood the bucket in with static files; see Commands run |

## What is still open

The pages are built but not live. The owner creates the bucket, builds, uploads and deploys in the order under "Owner procedure", with VITE_PATH_URLS=1 on that build (T223-c) so old hash links move to the paths. T221-a.

Pages Functions on the free plan allow 100,000 requests a day, and only the landing request on a content path counts. A full crawl of 32,220 pages is about a third of one day's allowance; when the allowance is spent, the content paths fail until it resets while the rest of the site keeps working. The owner accepted the cap in T272; the Functions request graph should be watched for the first month after launch. T221-b.

The home page `/` is the plain shell and links no country, so a crawler that arrives at the root finds no way in except the sitemap. The spine SEO.md describes (home links the 43 countries) needs either a prerendered home through the Function, which would put every visit through it, or the 43 country links in index.html. T221-c, for T222 or T225.

T222 builds the sitemaps from `dist-prerender/_manifest.json`, which lists every page with its path, canonical, key and lastmod, and runs the page floor; until then every prerendered page is indexable and no listed row has a page. T221-d.

1,043 detail pages have fewer than six links to other prerendered pages; spec 5.4's "three ways out" (easier, cheaper, nearby) is the planned fix and belongs to T225. T221-e.

The destination day cost on the prerendered page is computeCosts with no choices, the same figure as the T212 share card (Achensee: 83 euros), while the app's destination page showed 87 euros for the same place with its default Lifestyle panel. Which figure a page leads with should be one decision for the page, the card and the app. T221-f.

`dist-prerender/` is not in continent-app/.gitignore, which rule 4 keeps out of this task; until it is, delete the folder after every upload. T221-g.

The app calls api.open-meteo.com for the destination weather, and the CSP's connect-src does not list it, so the browser blocks it (seen in the console during the in-browser check; not caused by this task, and public/_headers is a rule 4 file). T221-h.

Titles of long names: 195 titles stay over 60 characters, and 4,296 trail titles lose " | Carta". The local wire's trail `name` is the original OSM string, not the T107 ladder title SEO.md assumes, so the pages should be rebuilt from the production wire before launch and the count read again. T221-i.

Also carried, not new: hreflang wave two (T205-g), the page floor (T205-d), dup_of canonicals (T205-e), share links moving to paths (T223-d, which also closes the destination hash half of T223-a, since a dossier record knows its own slug), and the Search Console property (T205-f).

T223-a is closed by this task for the path half (see How it works). T212-b is closed: the cards are generated at prerender time, written beside the pages and named in og:image, with the site card as the fallback; running `--cards` for the full set is part of T221-a.

## Owner procedure

From continent-app/ in the main checkout after the merge, in this order. Steps 1 and 7 need Cloudflare access; the rclone variables are the five from T045, read from the environment.

1. Create the bucket once, with no custom domain and no public access:
   `npx wrangler r2 bucket create carta-prerender`
2. Build the deploy with the hash-to-path redirect on (T223-c). Git Bash: `VITE_PATH_URLS=1 npm run build:pages`. PowerShell: `$env:VITE_PATH_URLS='1'; npm run build:pages; Remove-Item Env:VITE_PATH_URLS`
3. Build the pages from the same wire, with cards (about two hours) or without (about 90 seconds):
   `node scripts/prerender/build.mjs --data public --cards`
4. Check them against the shell that will ship:
   `node scripts/verify_prerender.mjs dist-prerender --shell dist/index.html`
5. Upload the data as usual, then the pages:
   `node scripts/r2/push-data.mjs --live`
   `node scripts/prerender/push.mjs --live`
6. Deploy a preview and check one page:
   `npx wrangler pages deploy dist --project-name carta-app --branch preview`
   `curl -sI https://preview.carta-app.pages.dev/austria/lakes/at-attersee-q698516` should show 200, x-carta-prerender and the content-security-policy header.
7. Deploy production and check the same path on https://www.carta-europetravel.com, then a trail with a stale slug (`/austria/trails/20050-x`, 200 with the real canonical) and a missing one (`/austria/trails/999999-x`, 404):
   `npx wrangler pages deploy dist --project-name carta-app --branch main`
8. Once production is live: `node scripts/r2/push-data.mjs --live --prune`, `node scripts/prerender/push.mjs --live --prune`, then delete dist/, dist-data/ and dist-prerender/.

After a later data refresh, steps 3 to 5 and 8 are enough; the pages do not depend on the deploy.

## Rollback procedure

Live, fastest: roll the Pages project back to the previous deployment in the Cloudflare dashboard (Workers and Pages, carta-app, Deployments). The previous deployment has no Function and no _routes.json, so every path is static again.

In code: `git revert 9dfc4ce` in continent-app and the T221 commit in the root repo, then build and deploy. Removing `functions/` and `public/_routes.json` alone also returns the site to pure static serving; the binding in wrangler.toml is then unused. The bucket can stay or be emptied with `rclone purge r2:carta-prerender`; nothing else reads it. The two shared-file edits are independent: without the carta:boot tag a destination path simply stays on the app's first view, as before, and the legacyHashToPath change only affects the redirect that VITE_PATH_URLS turns on. No data, migration or production state was touched.
