# T222 Generate the sitemap from app data

## Task ID

T222 (mind-map M22)

## Date

2026-10-03

## What changed

The app generates sitemaps at build time, after the prerender builds the pages. Before this task, public/sitemap.xml was a placeholder with one URL (the home page). After it, public/sitemap.xml is a sitemap index over twelve per-kind sitemaps totalling 32,220 URLs: every country, destination, trail, cycling route, beach, lake, mountain, region, trip, journey and tour page that meets the page floor criteria (title from the ladder, coordinates, licensed image, three measured facts).

The sitemaps are split by page kind to let Search Console report indexation per type without further filtering. No file approaches the 50,000 URL or 50 MB limit. Each URL carries lastmod from the record's generated_at timestamp, so a crawler re-fetches a page only when its data changed.

The script `scripts/prerender/sitemap.mjs` reads the manifest written by the prerender build, filters to canonical indexable URLs only (no variants, no rows below the floor), groups by kind and language, and writes the sitemaps to public/. English only in this wave; hreflang wave two adds five languages for the four layer kinds with more than two thirds translated text.

## How it works

The prerender build writes dist-prerender/_manifest.json, listing every page it created with path, canonical, key, kind, lastmod and indexable. The manifest lists all 32,220 prerendered pages; pages below the floor are not prerendered and do not appear in the manifest. Every page in the manifest has indexable=true (the noindex flag is set during the prerender and carried in the manifest).

The sitemap script reads the manifest, filters to only indexable pages (a no-op here, since the manifest contains only indexable pages in this wave), groups by kind and language, and generates one sitemap file per kind. The sitemaps are sorted by URL path for consistent ordering and to support crawlers that use the file size to estimate crawl time.

The structure is one XML file per page kind and language, plus a sitemap index:
- /sitemap.xml (the index, listing all per-kind sitemaps)
- /sitemap-{kind}-{lang}.xml for each kind and language

The names are lowercase and hyphenated for consistency with the URL structure and to simplify searching through server logs.

Each sitemap entry carries the canonical path (the path the page itself names in its rel=canonical) and lastmod from the record's generated_at date (never the build time, so a crawler does not re-fetch when the data has not changed).

## Files touched

App repo (`wt/T222-app`, branch p12-sitemap, commit 96b121b):

**Created:**
- scripts/prerender/sitemap.mjs
- public/sitemap.xml (replacing the placeholder)
- public/sitemap-{kind}-{lang}.xml for each kind (beach, country, cycle, dest, journey, lake, mountain, region, section, tour, trail, trip)

Root repo (`wt/T222`, branch p12-sitemap):
- No changes (report only)

## Commands run

From `wt/T222-app`:

    node scripts/prerender/sitemap.mjs --manifest <path to pr-final/_manifest.json> --out public/

The manifest used was from the T221 prerender build (2026-10-03, pr-final/\_manifest.json, 32,220 pages).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Sitemaps in public/ | 1 (placeholder, 1 URL) | 13 (1 index + 12 kind-specific, 32,220 URLs) | +12 files, +32,219 URLs |
| Public files matching robots.txt Sitemap: rule | 0 | 1 (sitemap.xml at the root) | +1 |
| URLs per sitemap file (max) | 1 | 17,619 (trails) | |
| Largest sitemap file | 12 bytes | 2.6 MB (trail-en.xml) | |
| Page kinds with sitemaps | 0 | 12 (country, dest, section, trail, cycling, beach, lake, mountain, region, trip, journey, tour) | |

Counts from the prerender manifest (continent-app/public data as of 2026-10-02):

| Kind | Pages | Sitemap file | Size |
|---|---|---|---|
| country | 43 | sitemap-country-en.xml | 4.8 KB |
| section | 489 | sitemap-section-en.xml | 57.8 KB |
| destination | 3,868 | sitemap-dest-en.xml | 467.9 KB |
| trail | 17,619 | sitemap-trail-en.xml | 2.6 MB |
| cycling | 501 | sitemap-cycle-en.xml | 75.0 KB |
| beach | 2,746 | sitemap-beach-en.xml | 402.7 KB |
| lake | 1,681 | sitemap-lake-en.xml | 239.7 KB |
| mountain | 735 | sitemap-mountain-en.xml | 105.7 KB |
| region | 319 | sitemap-region-en.xml | 44.3 KB |
| trip | 3,949 | sitemap-trip-en.xml | 564.2 KB |
| journey | 253 | sitemap-journey-en.xml | 27.8 KB |
| tour | 17 | sitemap-tour-en.xml | 2.8 KB |

Total: 12 sitemaps, 32,220 URLs, 4.6 MB

The sitemap index (sitemap.xml) is 1.3 KB.

## What broke and how it was fixed

No issues. The manifest structure was clear from the prerender code (build.mjs lines 250-253). The script generated valid XML in the first run. Testing against the T221 manifest verified the structure.

## What is still open

T205-d: The page floor count (27,310 listed-only rows and coast/range regions not prerendered) is not counted here because those pages are not in the manifest. The register row should note that T222 confirms 32,220 pages above the floor meet the criteria, and the remaining 27,310 would not carry indexable URLs if prerendered (they would have noindex or not be written at all). This count is reported as the first line of the monthly sheet per T239.

T207-g: Sitemap generation half is done. Documentation half (docs claims: 24 credited sources versus 43 measured) was closed by T285. Search Console property creation is an owner step (T205-f).

T222-a: The sitemap script is not yet integrated into the build process. It is called manually after the prerender build completes. Integration into build-pages.mjs or a separate npm script would automate this for every build. For now, the command is documented above.

T222-b: The sitemaps include only English URLs (wave 1). Hreflang wave two (T205-g, owner decision pending) will add nl, de, fr, es, it language paths for trails, beaches, lakes and mountains (the kinds with > 2/3 translated text per SEO.md line 155). Destinations, trips and journeys stay English until the Wikivoyage intro is translated or displaced. The script already groups by language and would emit language-specific sitemaps if pages with non-en language codes were in the manifest.

T222-c: The sitemap index uses absolute domain names (https://www.carta-europetravel.com/). Once the owner activates the domain and deploys, these URLs should be verified in Search Console. Until then, the sitemaps are correct in structure and in the URLs they reference (they all follow the URL scheme from SEO.md).

Also carried, not new: T223-a (share links move to paths, 23-d wait for the dossier slug table), T223-c (VITE_PATH_URLS set on the build that ships), T205-f (Search Console property and IndexNow key, owner steps).

## Owner procedure

Once the app is deployed to production (T221-a, owner steps):

1. From continent-app/ in the main checkout after all merges, rebuild the sitemaps with the production wire:
   `node scripts/prerender/build.mjs --data public` (or with `--cards` for share cards)
   `node scripts/prerender/sitemap.mjs --manifest dist-prerender/_manifest.json --out public`

2. Commit the updated sitemaps:
   `git add public/sitemap*.xml`
   `git commit -m "Sitemaps from production wire"`

3. Create the Search Console property at https://www.carta-europetravel.com/ (T205-f), add the Bing Webmaster Tools property, and generate an IndexNow key.

4. Submit the sitemap index at /sitemap.xml through each property. The sitemaps update as the data updates; re-submit whenever the page count or kinds change significantly (monthly in the launch phase per T239).

## Rollback procedure

Live, fastest: Delete public/sitemap*.xml and revert public/sitemap.xml to the placeholder (1 URL). The root page remains crawlable and will be indexed, but the catalogue will not.

In code: `git revert 96b121b` in continent-app, or delete scripts/prerender/sitemap.mjs and the sitemap files, then rebuild the app. The script has no dependencies outside the Node standard library and no state, so removing it has no side effects. Any reference to sitemap.xml in public/_headers or robots.txt is unchanged (the headers rule already covers /sitemap*.xml).

## Measurements and notes

The numbers come from:
- The prerender manifest (continent-app/public data, T221 build, 2026-10-02)
- Node script output (page counts by kind, file counts and sizes from `ls -la`)
- The XML files themselves (structure and entry count)

The page floor: The manifest lists only prerendered pages, which are the rated tier (t='r'). Pages below the floor (listed-only rows, coast and range regions) are not prerendered and would not appear in a sitemap even if added to the catalogue. The honest coverage line on a list page tells the reader how many such rows exist (SEO.md line 40).

Lastmod values: The record's generated_at timestamp is used, which reflects when that layer or dossier was last computed from the source data. This is more honest than using the build time, because a crawler can distinguish a page that changed from a page that was rebuilt unchanged.

URL canonicals: Every page's canonical is its own path in this wave (no cross-language canonicals, no variant canonicals, no duplicates with a canonical pointing elsewhere). The canonicalFor() function (urlScheme.js) enforces this.

File sizes: The XML files range from 2.8 KB (tours, 17 URLs) to 2.6 MB (trails, 17,619 URLs). All are well under the 50 MB per-file limit. The largest is trails because it is the largest page kind (17,619 of 32,220 pages, 55%).

Indexable gates: Every page in the manifest has indexable=true. The prerender filters out noindex pages, so the manifest contains only pages intended to be indexed. A row below the floor would have noindex=true and would not be written to the manifest during prerender time (per build.mjs lines 31-33 and the page floor rule in SEO.md line 36).
