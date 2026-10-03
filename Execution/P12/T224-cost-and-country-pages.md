# T224 Destination cost pages and country/trip-length pages

## Task ID

T224 (mind-map M24)

## Date

2026-10-03

## What changed

The prerender now writes the two page families the original map's Marketing branch names. Every priced destination has a week page at `/spain/malaga/cost` that answers "what does a week in Malaga actually cost" with a receipt, and 40 of the 43 countries have trip-length pages at `/spain/4-days` and `/spain/4-days/under-80` that answer "where can I go for four days on this budget". Before this task those paths had no page and were served the shell with a 404. After it, one full build writes 3,868 cost pages and 168 trip-length pages, and the sitemaps grow from 14,021 URLs to 15,406: 1,217 cost pages in a new `sitemap-costs-en.xml` and the 168 trip-length pages in `sitemap-countries-en.xml`. Every figure is a ground cost for one person. Carta does not price flights (T272), and every page says that in its lead.

Nothing is live. The pages reach production through the T221-a owner procedure unchanged: the same build, the same upload, the same deploy.

## How it works

Both families are built in `scripts/prerender/pages.mjs` (costPage and daysPage) from the row `costIndex.js` computeCosts gives each destination with no choices, which is the row the prerendered destination page already leads with. That was the point of the design: a town's day, its week and its four days come from one set of figures, so the cost page, the destination page and the trip-length page cannot disagree. I checked it over the full build: on all 3,868 cost pages the day figure equals the one on the destination page.

The week is a receipt in the carta-design sense. The first line is the bed for seven nights at the destination's nightly figure. The food lines are the week of eating and drinking out item by item, priced through `groundSpendPerPerson` at the default Lifestyle, the same function the trip receipt and the day planner use: five dinners out, four casual meals, two fast meals, seven drinks, one club night and two days cooking at home. Lines are printed to the cent and the total is the sum of the printed lines, so the receipt always adds up; `verify_prerender.mjs` checks that sum on every cost page. The `--accent-bg` foot says what one changed input does to the total: the cheapest month, where the bed has a measured Inside Airbnb calendar (617 destinations), or four days instead of seven everywhere else.

Under the receipt come the facts (week, day, bed, food, the cheapest months for a bed, how many places in the country cost more), the same week month by month where the calendar exists, what 3, 4, 10 and 14 days cost, up to six places in the same country within 150 km where a week costs less, links back to the destination, the country and its trip-length pages, and the provenance. The provenance sentences are T098's words from `en.js` (`cost.bedCityN`, `cost.bedCountry`, `cost.bedScaled`, `cost.foodCity` and the rest), chosen the way `CostSummary.jsx` chooses them. One difference: a city-level bed whose wire row names no source place gets "Bed: from 8,281 Inside Airbnb listings captured June 2026." rather than "measured in , from", because 383 such rows borrow a city's listings (every Austrian gem carries Vienna's 8,281) and cannot honestly say "measured in" the town. The lead also says the bed is one person's share of a whole place that sleeps four, which is what `stayPerNight` computes, so the page does not assume a shared room silently (spec I3).

A trip-length page lists where one person can go in a country for 3, 4 or 7 days. Each figure is n times the receipt's day cost, so "4 days" means four nights and four days of eating out, and the page says so. A figure whose bed is a country-level estimate carries a tilde, as the app does, and the coverage line counts how many beds are measured. The plain length page lists the best rated places first; a budget page lists the cheapest first. They answer different questions, and with the list capped at 100 a cheapest-first plain page would have shown the same hundred places as its budget page (Spain did, in the first full run). Below the list come the composed trips of exactly that length in the country, one per set of stops, and for seven days the curated journeys of that country. That is where the trip-length work lands today: the composed trips already run from 2 to 14 days, while the 253 curated journeys are all seven days until T101 builds their short versions.

Which trip-length pages exist is `daysPlan()` in `scripts/prerender/floor.mjs`. The lengths are 3, 4 and 7 days and the budgets are 60, 80 and 100 euros a day, fixed like the CUTS in costIndex.js so a URL keeps its meaning as the catalogue grows. I chose them from the catalogue's own spread of day costs: about a tenth of the 3,868 priced places are under 60, a third under 80, four fifths under 100. A length page needs five priced places in the country, which leaves out Liechtenstein, Monaco and San Marino (one each). A budget page must list at least five places, leave out at least a fifth of the length page and list at least five more than the budget page below it. Without those two rules Austria under 100 a day would have been 52 of its 53 places, a copy of the plain page. The result is 120 length pages and 48 budget pages (9 under 60, 21 under 80, 18 under 100).

The cost page has a floor of its own. It is floored like the six catalogue kinds (title, coordinates, licensed image, three facts) plus one test: the bed or the food must be measured in or near the town. A week built only from national figures reads the same as every other town in its country, and 2,651 near-identical pages are what the floor exists to keep out of the index. Those pages are still written, linked and served, with `noindex`, and stay out of the sitemap. The floor line in `_sitemap.json` reports them in their own clause, so the catalogue figure T226-c reads keeps the meaning T222 gave it.

Smaller pieces. `prerenderShell.js` gives the two kinds their bucket keys (`en/spain/malaga/cost.html` beside `en/spain/malaga.html`, `en/spain/4-days/under-60.html`). No route was added: the country prefixes already in `public/_routes.json` cover both families, so it stays at 91 of 100 rules. The cost page carries the destination's `carta:boot` tag and `src/lib/pathBoot.js` now accepts it on a cost path, so a person who lands on the week opens the destination in the app. The destination page links its week and the country page links its trip-length pages, so both families are reachable from the spine. The receipt's styles are added to the prerender stylesheet in `html.mjs`, from the shell's tokens only; `src/styles.css` was not touched.

## Design calls

The receipt follows the carta-design receipt: `--paper-dim` head, one `--rule-soft` hairline per line with the figure right aligned in `--mono`, a `2px solid var(--ink)` rule above the sum, the sum in mono, an `--accent-bg` foot. Line items keep their cents (`€34.96`), while facts and sentences use whole euros, as the destination page does. Mono carries figures only: the two counts that first read "29 of 300" and "0 of 31" were moved so the label holds the words and the value is the number. Headings carry a verb or a number ("What a week in Malaga costs", "Where a week costs less near Malaga", "What 3, 4, 10 or 14 days in Malaga cost"). Checked with JavaScript off against the app's stylesheet at 380 px and 1280 px on the Malaga cost page, Czechia 4 days under 60 and the Portugal country page: no horizontal scroll, one h1 each.

The seven questions: no hex outside `:root` (only token references in the new CSS); no gradient, no shadow, no second hue; ochre, teal and danger unused; mono only on figures; no button at all; every new heading has a verb or a number and the diff is free of em dashes and the banned words; the thing removed was the words inside the two mono counts.

## Files touched

Root repo (`wt/T224`, branch p12-cost-pages):

**Modified:**
- docs/SEO.md (the two table rows, the sitemap file list, a section on the two families)
- Execution/_OPEN.md (T224-a to T224-f appended)

**Created:**
- Execution/P12/T224-cost-and-country-pages.md

App repo (`wt/T224-app`, branch p12-cost-pages):

**Modified:**
- continent-app/scripts/prerender/pages.mjs (costPage, daysPage, weekReceipt, bedSource, foodSource; the destination and country pages link the new pages)
- continent-app/scripts/prerender/build.mjs (priced places per country, the trip-length plan, the new ctx helpers, emits both kinds)
- continent-app/scripts/prerender/floor.mjs (the cost floor, daysPlan)
- continent-app/scripts/prerender/html.mjs (the receipt and its styles)
- continent-app/scripts/prerender/sitemap.mjs (the costs file, days in countries, the floor line clause)
- continent-app/scripts/verify_prerender.mjs (receipt sums, the no-flights sentence, the trip-length floor and copy checks)
- continent-app/src/lib/prerenderShell.js (two kinds and their keys)
- continent-app/src/lib/pathBoot.js (a cost path opens its destination)
- continent-app/tests/prerenderShell.test.mjs (keys, daysPlan, the cost floor, the boot)

`pathBoot.js` is not among the files the session notes name. It is a one-condition change on the same `carta:boot` mechanism T221 added for destinations; without it a person landing on a cost page from a search result gets the app's first view instead of the destination. The orchestrator should confirm it before merging. `urlScheme.js` needed no change: `paths.cost`, `paths.days` and the reserved words were already there from T223.

## Commands run

From `wt/T224-app`, with the wire read from the main checkout (read only) and every output in the session scratchpad:

    node scripts/prerender/build.mjs --data "<main>/continent-app/public" --out <scratchpad>/pr-before     (on the branch base, before any edit)
    node scripts/verify_prerender.mjs <scratchpad>/pr-before
    node scripts/prerender/build.mjs --data "<main>/continent-app/public" --country PT,AT,ES,CZ --out <scratchpad>/pr-pt   (iterations)
    node scripts/prerender/build.mjs --data "<main>/continent-app/public" --out <scratchpad>/pr-after
    node scripts/verify_prerender.mjs <scratchpad>/pr-after
    node <scratchpad>/shoot.mjs pr-after en/spain/malaga/cost.html en/czechia/4-days/under-60.html en/portugal.html   (Playwright, JavaScript off, 380 and 1280 px)
    node --test tests/prerenderShell.test.mjs ; npm test ; npm run lint

The day-cost spread behind the budgets came from a scratch script over computeCosts and the dossier countries. Every build folder was deleted after use. No dev server was started, so no port was used; no dist/ or dist-data/ was made.

## Config and secrets set

None.

## Before/after measurements

Before is the branch base (T222's p12-sitemap, app 653d14d) built over the main checkout's wire of 2026-10-03; after is the same wire with this branch. Both from the build log, `_sitemap.json` and `verify_prerender.mjs`.

| Metric | Before | After | Delta |
|---|---|---|---|
| Cost pages built | 0 | 3,868 | +3,868 |
| Cost pages indexable and in the sitemap | 0 | 1,217 | +1,217 |
| Trip-length pages built (all indexable) | 0 | 168 (120 length, 48 budget) | +168 |
| Countries with trip-length pages | 0 | 40 of 43 | +40 |
| URLs in the sitemaps | 14,021 | 15,406 | +1,385 |
| Sitemap files | 10 (nine types and the index) | 11 | +1 (`sitemap-costs-en.xml`) |
| Prerendered pages | 32,220 | 36,256 | +4,036 |
| Output size | 287.8 MiB | 356.8 MiB | +69.0 MiB |
| Full build time, one run | 153.9 s | 164.6 s | +10.7 s |
| verify_prerender checks, all passing | 396,602 | 461,145 | +64,543 |
| Function routes of the 100 allowed | 91 | 91 | 0 |
| npm test | 139 tests, 136 pass, 3 skipped | 141 tests, 138 pass, 3 skipped | +2 |
| npm run lint | 0 errors, 72 warnings | 0 errors, 72 warnings | 0 |
| Cost pages whose day figure differs from the destination page | not applicable | 0 of 3,868 | |

Per kind from the after verify run (median words a crawler reads in the body, median links to other prerendered pages): cost pages 330 words and 13 links, trip-length pages 339 words and 55 links. The destination page went from 294 to 312 median words and from 14 to 15 links, the country page from 384 to 416 words and 48 to 51 links, from the new link sections.

The cost floor in numbers: 1,218 of 3,868 destinations have the bed or the food measured in or near the town (1,000 beds, 381 food, matching T098's count), and 1,217 of those also clear the image test; the 2,651 others are noindex. The build time is one run on a busy laptop each side.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A budget page that was a copy of its length page (Austria under 100 a day, 52 of 53 places) | The first rule only asked for fewer places than the length page | A budget page must leave out a fifth of the length page and add five places over the budget below it |
| Spain's plain 4 days and 4 days under 80 showed the same 100 places | Both lists were cheapest first and capped at 100 | The plain page lists best rated first, the budget page cheapest first; verify fails on two pages of one length with the same set |
| "Barcelona, 3 nights" three times in the planned trips | The catalogue holds several paces of the same stops | One trip per set of stops, the best scored |
| "Bed: measured in , from 8,281" would have printed for 383 towns | Those city-level rows carry no source place | A sentence that names the listings and not a place |
| Cheaper weeks up to 154 km away | No distance cap | Capped at 150 km |
| A background scratch command hung | A stray `cat >` in the shell line waited on input | Killed; the script rewritten as a file |

## What is still open

The pages go live with the T221-a owner procedure and nothing else: the build already writes them and their sitemap lines, and `push.mjs` uploads them. After the deploy, `curl -sI https://www.carta-europetravel.com/spain/malaga/cost` and `/spain/4-days` should show 200 and `x-carta-prerender`. T224-a.

The cost floor keeps 2,651 week pages out of the index because neither their bed nor their food is measured in or near the town. That is my call from the SEO.md floor logic, not a written rule; the owner confirms it or waives it, and either way it is a rebuild. It sits with T221-f, which asks which day figure a page leads with, because the receipt inherits that decision. T224-b.

The T221 destination page says "a bed measured from 8,281 stays in the town" for the 383 city-level rows that borrow a city's listings, which is not true for a village outside Vienna, and the app's receipt (`CostSummary.jsx`, `cost.bedCityN`) prints "measured in , from" for the same rows. The cost page avoids both; the other two surfaces should use the same wording. T224-c.

A person who lands on a trip-length page with JavaScript gets the app's first view, because no app view filters by length and day budget yet. When T188 builds those filters, `pathBoot.js` can open the matching Explore view for a days path. T224-d.

The curated journeys are all seven days; when T101 gives them short versions, the 3 and 4 day pages should list them beside the composed trips. T224-e.

The prerender reads destination rows from `dest/*.json`, which carry no `iso2`, so computeCosts' country-median repair of a broken bed price never runs at prerender time, while the app (which gets `iso2` from the boot index) does run it. No destination on today's wire needs the repair, so no page differs yet. T224-f.

Also carried, not new: T221-f (which day figure leads), T222-d (trail and cycling images), T221-c (the home page links no country), T205-g (languages).

## Rollback procedure

In the app repo, `git revert` the T224 commit on p12-cost-pages, or reset the branch to 653d14d; in the root repo, revert the T224 commit. Before anything is deployed this changes nothing in production. If it has been uploaded, remove the cost and trip-length objects from the `carta-prerender` bucket (`rclone delete r2:carta-prerender/en --include "*/cost.html" --include "*-days.html" --include "*-days/**"`) and rebuild and push the sitemaps from the reverted build; the Function then answers those paths with the static 404 as before. Reverting the pathBoot change alone only means a cost path opens the app's first view.
