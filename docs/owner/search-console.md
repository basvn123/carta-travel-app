# Owner procedure: Google Search Console (K2, T1076)

Only the owner can do these steps: they need the Google account that will own the property. The register rows `T1076-a`, `T205-f` and `T200-g` point here (merged by the owner sweep of 2026-11-12).

**Wait for the prerender.** On 2026-11-12 the prerender bucket was still empty: `/sitemap.xml` answered the one-URL placeholder and content paths such as `/belgium/ghent` answered 404. Start only when `curl -s https://www.carta-europetravel.com/sitemap.xml | head -5` shows a `<sitemapindex>` (after part 1 of `docs/owner/cloudflare.md`).

## One-time setup

1. Open Search Console and add a **Domain property** for `carta-europetravel.com`. Verify it with the DNS TXT record Google shows (add it in the Cloudflare DNS panel for the zone). A domain property covers `www` and any subdomain in one view.
2. Open Sitemaps and submit **one** URL: `https://www.carta-europetravel.com/sitemap.xml`. It is the sitemap index. Google reads the per-type files from it:
   - `sitemap-site-en.xml`, `sitemap-countries-en.xml` (countries, section lists, regions, trip-length hubs)
   - `sitemap-destinations-en.xml`, `sitemap-costs-en.xml`
   - `sitemap-trails-en.xml`, `sitemap-cycling-en.xml`, `sitemap-beaches-en.xml`, `sitemap-lakes-en.xml`, `sitemap-mountains-en.xml`
   - `sitemap-trips-en.xml`, `sitemap-journeys-en.xml`
   A type file with no indexable pages is not written (trails, until the photo licence lands, see the T1076 report), so Search Console shows fewer children than this list.
3. In Sitemaps, open each child file once so Search Console reports indexation per page type. In Pages, filter by sitemap to read one type at a time.
4. Spot check with URL Inspection on three live pages: one place (`/<country>/<town>`), one country hub, one thin page. Expect: the place and the hub are "URL is on Google" or "Discovered"; the thin page shows "Excluded by noindex tag" and is not in the sitemap.
5. **Bing (T205-f):** sign in to Bing Webmaster Tools with a Microsoft account, choose "Import from Google Search Console" (it copies the verified property and the sitemap). IndexNow needs a key file at the site root, which lives in the protected `continent-app/public/`: ask a session to add it (`public/<key>.txt` holding the key) and ship, then nothing more is needed from you.
6. **Field Core Web Vitals (T200-g):** a month after launch traffic starts, open Experience, Core Web Vitals; write the mobile and desktop Poor/Needs improvement/Good URL counts into the weekly log.

## Weekly review (every Monday, 15 minutes)

Write one line per week in `docs/owner/search-console-log.md` (create it on the first week): date, then the six numbers below.

1. **Pages report**, total **Indexed** and total **Not indexed**.
2. In Not indexed, the count under **Discovered, currently not indexed** and under **Crawled, currently not indexed**.
3. Under **Excluded by noindex tag**: it should equal the number of prerendered pages below the bar (the `excluded` block in `_sitemap.json` from the last build). A big gap means the head tag or the `x-robots-tag` header is not reaching Google.
4. **Sitemaps**: discovered URLs per file against the `urls` count in `_sitemap.json`. A file that stalls at zero is a fetch problem, not a quality problem.
5. **Performance**, last 28 days: clicks, impressions, and the top ten pages by impressions. Note any thin page that gets impressions: it may deserve a promotion.
6. **Core Web Vitals** and **Page experience**: any "Poor" group.

## The pause rule

Compute `discovered_not_indexed_share = Discovered, currently not indexed / (Indexed + Discovered, currently not indexed + Crawled, currently not indexed)`.

- Under 30 percent: carry on. New batches of pages may ship.
- **30 percent or more, for two weeks running: pause new batches.** Ship no new prerender kinds and no data run that adds indexable pages until the share is back under 30 percent. Raise the bar instead (`continent-app/scripts/prerender/quality.mjs`, a stricter threshold), which noindexes the weakest pages on the next prerender. Write the pause in `docs/owner/README.md` as an owner row and lift it the same way.
- A single bad week is noise; Search Console data lags by two to four days.

## What the owner needs to hand back

Nothing is stored in the repo from Search Console except the weekly log line. No credentials, tokens or exports go into git.
