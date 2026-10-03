# T222 Generate the sitemap from app data

## Task ID

T222 (mind-map M22)

## Date

2026-10-03

## What changed

The catalogue now writes its own sitemaps. As the last step of the prerender build, `scripts/prerender/sitemap.mjs` turns `dist-prerender/_manifest.json` into nine sitemap files and an index, written to `dist-prerender/sitemaps/`, and into `dist-prerender/_sitemap.json`, which holds the counts and the page-floor line. The Pages Function serves `/sitemap.xml` and `/sitemap-*.xml` from the `carta-prerender` bucket, where `push.mjs` already uploads every folder of the build. Nothing generated is committed: the first attempt at this task committed 13 generated files under `public/` (about 128,000 lines), which session rule 5 forbids, and those are removed again. `public/sitemap.xml` is master's one-URL placeholder once more; I kept it on purpose, because it is the fallback that answers while the bucket holds no index, so deploying the Function before the upload changes nothing a crawler sees.

The page floor is now real code, in `scripts/prerender/floor.mjs`. A catalogue page (destination, trail, cycling route, beach, lake, mountain) must carry a title, coordinates, an image with a licence on record and at least three facts. The build judges each page model as it writes it. A page that fails is still written, but with `noindex`, and the sitemap leaves it out, which is what docs/SEO.md says a row below the floor does. Countries, section lists, NUTS2 regions, tours, trips and journeys are containers or composed pages, not catalogue rows, and are not floored.

The count is the headline of this report. Of 27,150 floored pages, 8,949 meet the floor. All 17,619 trails and all 501 cycling routes fail on one criterion only: the image. The wire's `img` on a trail is a photo address with no licence field (3,554 of the 17,619 rated trails have one, none has a licence) and cycling routes have no image at all (0 of 506 rated). So the sitemap today holds no trail and no cycling route, and those 18,120 pages are noindex in this build. That follows the floor as written, but it removes the launch audience's pages from the index, so it is a decision for the owner before anything is uploaded (register T222-d). Reversing it is a rebuild, nothing more.

The sitemaps hold 14,021 URLs: the 8,949 floored pages that pass, the 5,070 unfloored pages, and two site pages, the home page and `/about/numbers`. The second of those closes T318-c, which the first attempt marked closed without including the page.

## How it works

`build.mjs` computes `pageFloor(page, row)` inside `write()`, so the card path and the plain path both get it. Each manifest entry carries its four booleans. Trails and cycling routes need the wire row for the image test, because their page models do not render a photograph; `build.mjs` looks the row up by the parsed path. Pass one also tallies the listed-only rows (`t: 'l'`) with `listedFloor()`, which reads the same wire fields the page builders turn into facts, and counts the coast and range regions by file name (`COAST_*`, `GMBA_*`). Those rows have no page, so they cannot be in the sitemap; the tally says how many would clear the floor if they had one.

`sitemap.mjs` then lists a manifest page only when it is indexable, is its own canonical (a variant or duplicate points at another page and stays out) and, for the six floored kinds, passed. The canonical in the manifest is the one `canonicalFor()` in `urlScheme.js` produced when the page was built, and every `loc` is `https://www.carta-europetravel.com` plus that path. The files follow docs/SEO.md, one per type so Search Console reports indexation per type: site, countries (countries, their section lists, regions), destinations, trails, cycling (routes and tours), beaches, lakes, mountains, trips, journeys. A file is split into `-2`, `-3` at 50,000 URLs or 45 MB, with headroom under the 50 MB limit; none is near it. `lastmod` is the record's own `generated_at`, truncated to the day, and is left out where a record has none (the 253 journeys), never filled with the build date. `/about/numbers` takes the date of `coverage.json`, the vintage that page is built from.

The Function change is small. `sitemapKey()` in `src/lib/prerenderShell.js` maps `/sitemap.xml` and `/sitemap-{type}-en[-n].xml` to `sitemaps/<name>`; the Function serves it as `application/xml` with `Cache-Control: public, max-age=3600`, set in the Function itself because Pages does not apply `public/_headers` to a Function's response. Any miss goes to `next()`, so the placeholder answers. Two rules were added to `public/_routes.json`, which now has 91 of the 100 rules Pages allows (it had 89).

The first line of the monthly sheet is `floor_line` in `_sitemap.json`. This build's reads: "Page floor 2026-10-03: 8,949 of 27,150 catalogue pages meet it and are in the sitemap; 27,225 listed-only rows and coast or range regions have no page, of which 894 would clear it; 14,021 URLs in all." T226-c builds the sheet and reads it from there.

## Files touched

Root repo (`wt/T222`, branch p12-sitemap):

**Modified:**
- docs/SEO.md (the Sitemaps section: the real file names, how the Function serves them, the floor and the T222-d finding)
- Execution/_OPEN.md (T205-d and T221-d closed; T207-g, T222-a and T222-c reworded or closed; T222-d, T222-e, T222-f added)

**Created:**
- Execution/P12/T222-sitemap.md (moved with git mv from Execution/M22-sitemap-generation.md and rewritten)

**Deleted:**
- Execution/M22-sitemap-generation.md (the old name, by the move)

App repo (`wt/T222-app`, branch p12-sitemap), compared with master:

**Modified:**
- continent-app/scripts/prerender/build.mjs (floor per page, noindex below it, listed-row tally, manifest fields, calls the sitemap writer)
- continent-app/scripts/prerender/sitemap.mjs (rewritten as a module with a command line)
- continent-app/scripts/verify_prerender.mjs (sitemap checks, wildcard routes)
- continent-app/src/lib/prerenderShell.js (`sitemapKey`, two routes)
- continent-app/functions/[[path]].js (serves the sitemaps)
- continent-app/public/_routes.json (two rules)
- continent-app/tests/prerenderShell.test.mjs (a sitemapKey test, routes)

**Created:**
- continent-app/scripts/prerender/floor.mjs

**Deleted:**
- none against master. The first attempt's 12 `public/sitemap-*.xml` files and its rewrite of `public/sitemap.xml` are reverted; `git diff master -- public/sitemap.xml` is empty.

None of these is on session rule 4's list. `functions/`, `_routes.json` and `prerenderShell.js` are T221's files; I changed them because the hook that fits how T221 builds and uploads is the prerender build plus the bucket, and serving from the bucket needs the Function to know the names. The orchestrator should look at that before merging.

I did not use the other hook, a Vite plugin like T318's `about/numbers.html`. That plugin runs in `npm run build`, which does not have the manifest, and the manifest takes minutes to produce; a plugin would have had to walk the wire a second time and risk disagreeing with the pages. Adding a step to the `ci` or `build:pages` script, or to `build-pages.mjs`, is forbidden by rule 4 and would not have helped for the same reason. Putting generated files in `public/` was the mistake being corrected.

## Commands run

From `wt/T222-app`, with the wire read from the main checkout (read only) and the output in the session scratchpad, outside both repositories:

    git rm public/sitemap-*.xml
    git checkout master -- public/sitemap.xml
    node scripts/prerender/build.mjs --data "<main>/continent-app/public" --out <scratchpad>/pr222
    node scripts/prerender/sitemap.mjs --manifest <scratchpad>/pr222/_manifest.json
    node scripts/verify_prerender.mjs <scratchpad>/pr222
    node --test tests/prerenderShell.test.mjs ; npm test ; npm run lint

A Python `xml.etree` pass over the ten output files confirmed they parse, that every `loc` starts with `https://www.carta-europetravel.com/`, and that no file reaches 50,000 URLs or 50 MB. The scratch folder is deleted after use. No server was started, so no port was used.

## Config and secrets set

None. No upload and no deploy were made. `VITE_PATH_URLS`, the bucket and the Cloudflare steps are unchanged and stay with T221-a.

## Before/after measurements

The before is master's `public/sitemap.xml`, one URL (the home page, from T221's table "Indexable URLs on production 1"). The after is one full build over the main checkout's wire of 2026-10-03, read from the build log and `_sitemap.json`.

| Metric | Before | After | Delta |
|---|---|---|---|
| URLs in the sitemap | 1 | 14,021 | +14,020 |
| Sitemap files | 1 | 10 (nine types and the index) | +9 |
| Largest file | not applicable | 512,845 bytes (trips), 3,949 URLs | far under 50 MB and 50,000 |
| Prerendered pages | 32,220 | 32,220 | 0 |
| Pages with noindex | 0 | 18,201 (17,619 trails, 501 cycling, 77 beaches, 4 destinations) | +18,201 |
| Floored pages that meet the floor | not counted | 8,949 of 27,150 | |
| Generated files committed under public/ | 0 | 0 (the first attempt had 13) | 0 |
| Function routes of the 100 allowed | 89 | 91 | +2 |
| verify_prerender checks | 354,497 | 396,602, all passing | +42,105 |
| npm test | 134 tests, 131 pass, 3 skipped (T221) | 139 tests, 136 pass, 3 skipped | +5 (one is mine) |
| npm run lint | 0 errors, 72 warnings | 0 errors, 72 warnings | 0 |
| Full prerender build time | 72 to 117 s (T221, four runs) | 165.5 s (one run) | about +50 to +90 s |

The build time is one run on a busy laptop and includes pass one reading the listed rows, so I cannot say how much of the increase is the floor and the sitemaps; they are a few seconds of work over an in-memory manifest.

The floor per kind, from `_sitemap.json` (pages, then how many meet each criterion):

| Kind | Pages | Title | Coordinates | Licensed image | Three facts | Meet the floor |
|---|---|---|---|---|---|---|
| dest | 3,868 | 3,868 | 3,868 | 3,864 | 3,868 | 3,864 |
| beach | 2,746 | 2,746 | 2,746 | 2,746 | 2,669 | 2,669 |
| lake | 1,681 | 1,681 | 1,681 | 1,681 | 1,681 | 1,681 |
| mountain | 735 | 735 | 735 | 735 | 735 | 735 |
| trail | 17,619 | 17,505 | 17,619 | 0 | 17,619 | 0 |
| cycle | 501 | 501 | 501 | 0 | 501 | 0 |

Of the 5,070 unfloored pages all are in the sitemap: 43 countries, 489 section lists and 319 regions in `sitemap-countries-en.xml` (851), 17 tours in cycling, 3,949 trips and 253 journeys. The other 114 trails also fail the title test. The 77 beaches fail on facts, the 4 destinations on the image.

The listed-only rows, which have no page: 22,749 rows (51 trails, 16,380 cycling, 3,873 beaches, 1,090 lakes, 1,355 mountains) and 4,476 coast and range regions, 27,225 in all. 894 of the rows would clear the floor from their wire fields (235 beaches, 659 mountains). The count is 85 below the 27,310 in T205 because pass one reads the 43 country files only, and because I count trails and T205 did not. The fact test for a listed row is an estimate from the wire fields; the real test needs a page, so treat 894 as a ceiling.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first attempt committed about 128,000 lines of generated XML under public/ | The script wrote to public/ by default and the Haiku session committed the output, against session rule 5 | Removed with git rm; the generator writes under the build folder, which is never committed |
| The first attempt claimed every page met the floor | The floor was never counted; the script filtered on the manifest's `indexable` flag, which was true for every page | The floor is computed per page from the page model, and the count is reported per kind |
| T318-c was marked closed with /about/numbers in none of the files | The script only read the manifest | The generator adds `/` and `/about/numbers` itself, in `sitemap-site-en.xml` |
| The routes test failed after adding `/sitemap-*` | The test and verify script only understood a `/*` suffix | Both now treat a trailing `*` as the Pages wildcard |
| A quick check of the file names against docs/SEO.md | The first attempt named files by internal kind (`sitemap-trail-en.xml`) | Names follow SEO.md (`sitemap-trails-en.xml`), with journeys and site added there |

## What is still open

The trail and cycling pages are noindex and out of the sitemap because the wire carries no photo licence for them. The owner decides before the upload whether to resolve licences into the wire or to waive the image criterion for route kinds, then the pages are rebuilt. T222-d.

894 listed-only rows would clear the floor and have no page. Building their pages is a separate prerender task. T222-e.

The sitemaps exist only in the build output. They reach production when the owner follows the T221-a procedure (build, `push.mjs --live`, deploy); the steps there are enough, because `build.mjs` now writes the sitemaps and `push.mjs` uploads the folder. After that, `curl -sI https://www.carta-europetravel.com/sitemap.xml` should show 200 and `application/xml`, and the index is submitted in Search Console. T222-c, T207-g (its sitemap half stays open until then).

Once the Search Console property exists (T205-f), the date of the first submission and of the first indexed pages must be written down so T220-e can set a launch lead from evidence. That is an owner step. T222-f.

Sitemaps are English only; hreflang wave two adds the five languages (T222-b, T205-g). The home page still links no country, so a crawler at the root depends on the sitemap (T221-c, untouched). `dist-prerender/` is still not in `.gitignore` (T221-g).

T205-d and T221-d are closed by this task. T318-c stays closed, now truthfully; whether `/about/numbers` gets language siblings is carried by T222-b.

## Rollback procedure

In the app repo, `git revert` the T222 commit on branch p12-sitemap (or reset the branch to master 4547b00); in the root repo, revert the T222 commit and the register changes. Before anything is deployed this changes nothing in production. If it has been deployed, remove the objects under `sitemaps/` in the `carta-prerender` bucket (`rclone purge r2:carta-prerender/sitemaps`); the Function then falls through to the static placeholder. To undo only the noindex effect without reverting, change `wireImageLicensed` in `floor.mjs` and rebuild.
