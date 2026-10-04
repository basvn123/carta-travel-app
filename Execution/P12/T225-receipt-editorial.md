# T225 Receipt-based editorial and internal linking

## Task ID

T225 (mind-map M25)

## Date

2026-10-03

## What changed

The prerender now writes one editorial format, the week receipt: a seven-day composed trip priced stop by stop, at `/trips/{id}/receipt`. A full build writes 316 of them, 202 indexable and in the sitemap, 114 `noindex`. Beside the format, the destination pages gained an "other places near" block, and every family that touches a receipt links to it. Measured on the same wire, the pages no click path from a country page could reach fell from 1,188 to 10, and the share of pages within three clicks went from 94.3 to 96.0 percent. Nothing is live; the pages go out with the T221-a procedure unchanged.

The format is generated from the records, which is why it is cheap and why it cannot be copied: every figure is read from the wire at build time and each stop prints the T098 provenance sentence for its bed and its food. Nothing is typed. Carta does not price flights (T272), so a receipt has no flight line, and each page says so.

I did not build row T226-c, the monthly data notes page and Atom feed, because T226-a (the owner's content decision) is still open.

## How it works

`receiptPlan()` in `scripts/prerender/pages.mjs` turns one composed trip into a priced plan, or null. It accepts a trip only if it is seven days, has two or more stops, every stop resolves to a priced destination with a bed and a food figure, no stop repeats, and the nights add up to the trip's own nights. Beds are the stop's nightly figure times its nights. Food is `groundSpendPerPerson` at the default Lifestyle for the days at the stop, which is the function the cost page and the day planner price from; the departure day is eaten at the last stop. If the trip carries a ground-transport estimate (`cost.legs_eur`) it is the last line, with a tilde, because it is the catalogue's own estimate and not a measured figure. The total is the sum of the printed lines, so the receipt adds up to the cent, and `verify_prerender.mjs` checks that on all 316.

`receiptPage()` renders the plan with the receipt component T224 already styled, so no CSS changed. The foot says what staying put would cost: the whole week in the cheapest stop, read from that stop's own cost page figure. The page is indexable only when at least one stop has a bed or food measured in or near the town, the same rule as the cost page, so a week built wholly from national figures does not become a near-duplicate in the index. It sits in `sitemap-trips-en.xml`.

`build.mjs` picks the trips once, best score first, one plan per trip id, and builds three lookups: by trip, by country and by destination. A trip filed under two countries is listed under both and written once.

The links are the editorial part. A receipt links every stop's destination page and cost page, its trip, its countries, the country's seven-day page and up to six other receipts in the country. Coming back: the trip page links its receipt, each destination and cost page links up to four weeks that pass through it, the country page links eight, and the seven-day country page links six. The route key is `trips/{id}/receipt.html` and the existing `/trips/*` Function rule already covers it, so `_routes.json` is unchanged at 91 of 100. `urlScheme.js` gained `paths.receipt` and the reader for it, and a receipt path opens its trip in the app through the existing legacy hash.

The destination "other places near" block (`ctx.nearPlaces`) did most of the depth work. Destinations that no country list or trip-length page shows were reachable from nowhere; a nearest-four link within 100 km in the same country gives them an inbound link from a neighbour.

## Link depth, and how it is measured

`scripts/measure_link_depth.mjs` reads a prerender build. It takes `_manifest.json`, reads every page's HTML and keeps each `href` that is the path of another page in the manifest. The roots are the 43 country pages, because the home page is the app shell and links no country yet (T221-c). Depth is the fewest clicks from any root. It reports pages, indexable pages, outbound links, pages under six outbound links, orphans, pages no root reaches, mean depth, the share within three clicks and the histogram. The same script ran on the branch base (T224's build) and on this branch, both over the main checkout's wire of 2026-10-03.

## Design calls

The receipt page uses the carta-design receipt exactly as T224 did: `--paper-dim` head, a hairline per line with the figure right aligned in `--mono`, a `2px solid var(--ink)` rule above the sum, an `--accent-bg` foot. No CSS was added. Checked with JavaScript off against the built app stylesheet at 380 and 1280 px on the Andorra la Vella and Barcelona week: scroll width equals the viewport at both and there is one h1. Screenshots are in `C:\Users\Gebruiker\Documents\Portfolio\wt\T225-shots\`.

The seven questions, one line each.

1. No hex value outside `:root`: none added, no CSS touched.
2. No gradient, no colour outside DESIGN.md, no second saturated hue.
3. Ochre, teal and danger unused.
4. Mono carries only the receipt figures and counts; sentences are in the UI face.
5. No button on the page, so no second primary.
6. Every heading has a verb or a number; `verify_prerender.mjs` found no em dash, en dash, middot or bullet in 36,572 pages.
7. The thing removed: a hero image for the receipt, which would have needed a second dossier read for no information.

No i18n key was added: the prerender is English and reads the existing `cost.*` and `lifestyle.*` keys, so the six catalogues are untouched.

## Files touched

Root repo (`wt/T225`, branch p12-editorial-linking):

**Modified:**
- docs/SEO.md (a section on the format and the measure)
- Execution/_OPEN.md (T225-a to T225-d appended)

**Created:**
- Execution/P12/T225-receipt-editorial.md

App repo (`wt/T225-app`, branch p12-editorial-linking):

**Modified:**
- continent-app/scripts/prerender/pages.mjs (receiptPlan, receiptPage, receiptLink; links on the trip, destination, cost, country and seven-day pages)
- continent-app/scripts/prerender/build.mjs (plan selection, the receipt lookups, nearPlaces, emits the receipt)
- continent-app/scripts/prerender/sitemap.mjs (receipt goes to the trips file)
- continent-app/scripts/verify_prerender.mjs (receipt sums, no flights, a trip above, at least two stops)
- continent-app/src/lib/urlScheme.js (paths.receipt, parsePath, the legacy hash, selfPath)
- continent-app/src/lib/prerenderShell.js (the kind and its key)
- continent-app/tests/prerenderShell.test.mjs (key, parse, boot)

**Created:**
- continent-app/scripts/measure_link_depth.mjs

## Commands run

From `wt/T225-app`, wire read from the main checkout, output in the session scratchpad:

    node scripts/prerender/build.mjs --data "<main>/continent-app/public" --out <scratchpad>/pr-before   (branch base)
    node scripts/measure_link_depth.mjs <scratchpad>/pr-before --json before.json
    node scripts/prerender/build.mjs --data "<main>/continent-app/public" --out <scratchpad>/pr-a2
    node scripts/measure_link_depth.mjs <scratchpad>/pr-a2 --json a2.json
    node scripts/verify_prerender.mjs <scratchpad>/pr-a2
    npm run lint ; npm test ; npm run build   (dist deleted afterwards)
    a throwaway Node server on port 5210 serving the built shell with the prerendered page spliced in, and Playwright with JavaScript off at 380 and 1280 px

The server stopped when its script ended. Every build folder is outside the repo; no dist/ or dist-data/ remains.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Prerendered pages | 36,256 | 36,572 | +316 receipts |
| Indexable pages / URLs in the sitemaps | 15,404 / 15,406 | 15,606 / 15,608 | +202 |
| Pages no country page reaches by links | 1,188 (594 destinations, 594 cost pages) | 10 (5 and 5) | -1,178 |
| Share of pages within three clicks | 94.3% | 96.0% | +1.7 pp |
| Mean click depth of reached pages | 2.352 | 2.371 | +0.019 |
| Deepest page | 10 clicks | 7 clicks | -3 |
| Median outbound links per page | 10 | 10 | 0 |
| Mean outbound links per page | 11.66 | 11.98 | +0.32 |
| Pages with under six outbound links | 1,630 | 1,542 | -88 |
| Orphans (no inbound link at all) | 0 | 0 | 0 |
| verify_prerender checks | 461,145 (T224) | 466,812 | all passing |
| npm test | 3 skipped at T224 | 167 pass, 0 fail | |
| npm run lint | 0 errors | 0 errors, 73 warnings (the extra one is in src/planner/dayDraft.js, not touched here) | |
| Full build time, one run, busy laptop | 140 s | 208 s | +68 s |

The mean depth rose slightly because 1,178 pages that no path reached are now reached, at depth four to seven, and an average over reached pages counts them. The honest figure is the first: pages reachable at all. Orphans were zero before because every page has some inbound link, even if only from a page that is itself unreachable.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Edits failed to match | Every source file is CRLF | A substitution helper that writes CRLF |
| The receipts alone moved the unreached count by zero | The unreached destinations are stops of nothing that is itself reached | Added the nearest-places block on destination pages |

## What is still open

Five destinations and their cost pages are still unreachable by links from a country page: no nearest-four list holds them (T225-a). 1,542 pages still carry under six outbound links, mostly lakes, mountains and trips, which is the rest of T221-e; the spec's three ways out (easier, cheaper, nearby) is the planned fix (T225-b). Receipts exist only for seven-day trips; 3 and 4 day receipts would link the trip-length pages the same way (T225-c). The 114 noindex receipts follow the cost-page floor, so the owner's answer to T224-b covers them. The measure takes country pages as roots because the home page links none (T221-c); once it does the roots move to the home page (T225-d). T226-c waits on T226-a.

## Rollback procedure

Revert the app commit on p12-editorial-linking and the root commit. Before anything is uploaded this changes nothing in production. If uploaded, delete `en/trips/*/receipt.html` from the `carta-prerender` bucket (`rclone delete r2:carta-prerender/en/trips --include "*/receipt.html"`), then rebuild and push the sitemaps from the reverted build; the Function then answers those paths with the static 404.
