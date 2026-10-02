# Carta search visibility plan

This is the living version of the plan first written in Execution/P12/T205-programmatic-seo.md (closed, never edited). The URL scheme in the section below was ratified by T223 and is implemented in continent-app/src/lib/urlScheme.js. Later tasks (T221 prerender, T222 sitemaps, T224 page families, T225 editorial links, T239 monthly sheet) read this file and change it when a decision changes.

## Where the plan starts from

Three facts about the current build shape every decision below, so they are stated once here.

The identifier is thrown away. `src/lib/dossier.js`, `beaches.js`, `lakes.js`, `mountains.js`, `trails.js`, `cycling.js`, `trips.js`, `regions.js` and `community/guides.js` each read `#dest=`, `#beach=`, `#trail=`, `#itin=` and so on once at boot and then call `history.replaceState` to strip it. Fragments never reach a server, so a crawler sees the home page and nothing else. `robots.txt` adds `Disallow: /*?` because `useUrlSync` writes 24 filter parameters into the query string; that rule is correct and stays, which means every indexable page must live on a path with no query string, including pagination.

The hosting ceiling is real. T024 measured a production build at 52,132 files and Cloudflare Pages refuses anything over 20,000. Stage 6 clears that by moving the wire shards to R2 (61 files remain). A build-time prerender that writes 57,000 HTML files back into `dist/` would put the deployment straight back over the ceiling. So the plan does not prerender into the Pages bundle. It prerenders into R2 and serves the HTML through one Pages Function on the content path prefixes, which counts as one file. The trade is a request budget (the free tier allows 100,000 Function requests a day) and that is raised as T205-a for the owner, because it is the one hosting decision T221 cannot make alone.

The language is not in the URL. `src/i18n/index.jsx` picks the language from localStorage and defaults to English. The derived sentences on trail, beach, lake and mountain pages are built through `t()` (`src/lib/trailStory.js` composes every reason sentence from the structured fields), so the measured facts are already in six languages. The Wikivoyage intro on a destination page is English only. hreflang therefore has to be phased, and the language has to move into the path for the pages it covers.

## Page types and the query each one answers

The catalogue holds twelve page types. The table counts what the wire holds today (continent-app/public in the main checkout, read 2026-10-02) and names the query shape each page is built to rank for. The query shapes are written as a person types them, because the title and meta patterns later are derived from them.

| Page type | Rows today | Query shape it answers | Example query |
|---|---|---|---|
| Country guide | 43 | "{country} on a budget", "how much does a day in {country} cost", "where to go in {country}" | spain daily budget per person |
| Region | 372 NUTS2 (plus 2,666 coast and 1,810 range regions, see the page floor) | "{region} beaches", "{region} hikes", "best lakes in {region}" | burgenland lakes swimming |
| Destination | 3,868 (3,868 unique dossier slugs, the 11 collisions the optimisation report listed are gone) | "is {town} worth visiting", "{town} cost per day", "what to do in {town}" | malaga worth visiting |
| Destination cost page (T224) | 3,868 planned | "what does a week in {town} cost", "{town} budget {n} days" | week in lisbon cost |
| Country and trip-length page (T224) | up to 43 countries x 3 lengths x 3 bands, emitted only above the floor | "where can I go for 4 days on {budget}", "{country} 4 day trip budget" | portugal 4 days under 60 a day |
| Trail | 17,619 (15,041 standalone, 1,615 stage, 310 parent, 148 variant, 505 unclassified) | "{trail name}", "{trail} distance elevation", "{trail} stage {n}", "hikes near {town}" | tour des combins distance ascent |
| Trail parent (stage family) | 310 today, spec 6.3 wants parents for the 540 orphan families | "{long path} stages", "{long path} how long", "{long path} map" | senda pirenaica stages km |
| Cycling route | 16,973 route files, 17 EuroVelo families, 17 tours | "{route} cycling", "{route} surface paved", "eurovelo {n} {country} stages" | eurovelo 1 spain sections |
| Beach | 2,746 rated, 3,873 listed | "{beach} water quality", "{beach} bathing water", "beaches near {town} clean water" | playa es trenc water quality |
| Lake | 1,681 rated, 1,090 listed | "can you swim in {lake}", "{lake} water temperature {month}", "{lake} swimming season" | lake garda water temperature june |
| Mountain | 740 rated, 1,411 listed | "{peak} how to get up", "{peak} cable car", "{peak} snow line", "what can you see from {peak}" | dachstein cable car season |
| Trip and journey | 3,984 composed trips, 253 curated journeys, 10 journey types | "{town a} and {town b} 5 days", "{country} hiking week itinerary", "{type} trip {country}" | andorra barcelona 5 days itinerary |

The long tail the mind map names is in the right-hand column of the five layer rows. Nobody publishes a page that answers "can you swim in Lake Garda in June" with a measured season (the wire already carries `swim.season.from/to/n/peak` and a twelve-month temperature series), or "is the water at Playa Es Trenc clean" with the EEA class and the named monitoring site, or "when does the Dachstein lift season run" with the snow series and the lift name. Those facts are on the wire today. The ten-year bathing water history (spec 8.2), prevailing wind by month (7.8), walk-in time and descent (8.5) and the horizon peaks with distances (10.4) are specified and not yet on the wire (the beach `water` object holds a class and a site name; the mountain `view` object holds a count), so the pages ship with what is measured and grow a section as each spec item lands. A page type is never held back for a fact that is not there yet; the honest coverage line covers the gap in words, which is the point of spec 4.6.

## The page floor

The coverage contract (T111) says a country either publishes the floor or prints a reason. The same logic applies to a single row, and for the same commercial reason: a page with a name, a pin and a photograph is what Google files under "Crawled, currently not indexed", and enough of those drag the whole host down. So a row earns an indexable URL only when its page can carry all of the following: a title from the ladder, coordinates, one image with a licence, and at least three measured facts that render as sentences (distance and ascent and difficulty on a trail; class and site and protection on a beach; season and peak temperature and area on a lake; elevation and prominence and access on a mountain; day cost and rating and visit hours on a destination). A row below the floor is still reachable from its parent list, it still renders, but it carries `noindex` and is left out of the sitemap, and the parent list page says how many such rows it holds. The 27,310 listed-only rows (`t: 'l'` on beaches, lakes, mountains and cycling, plus the coast and range regions) all go through this gate at sitemap time; T222 counts them and the count is the first number in the monthly sheet.

The honest coverage line is content, not a footer. Spec 4.6's two sentences ("We publish 12 walks in Albania. We know of 31 more ...", "Nine of fourteen figures here are measured, three are calculated, two are estimates") go into the prerendered HTML on every list page and every detail page, from `coverage.json` (the `contract` block and the per-region `code`) and from the provenance split the page already computes. They are unique per page, they are true, and they read as authority. Nothing else on the page is written for the crawler.

## URL scheme (ratified by T223)

Paths only, lower case, no query string, no trailing slash. A query string is never indexable because robots.txt disallows it, so pagination is on the path too. The code is continent-app/src/lib/urlScheme.js and scripts/verify_url_scheme.mjs checks it, including against all 3,868 dossier slugs.

The rule behind every path: the part that identifies the row never changes, and the words that make it readable can. A trail path is its numeric id then the ladder title, so a retitled trail keeps one URL: the id decides the page, the slug is decoration, and the canonical always carries the current slug. A request for the right id with a stale slug is answered with the page and a canonical pointing at the current path.

| Page type | Path | Identifier and note |
|---|---|---|
| Country | `/spain` | country word, see below |
| Destination | `/spain/malaga` | the dossier slug verbatim, `{country}/{place}` |
| Destination cost (T224) | `/spain/malaga/cost` | |
| Section list | `/spain/trails`, `/beaches`, `/lakes`, `/mountains`, `/cycling`, `/regions`, `/trips` | page 2 onward is `/spain/trails/2`; page 1 has no number |
| Country and length (T224) | `/spain/4-days`, `/spain/4-days/under-60` | only above the floor |
| Trail, stage or parent | `/spain/trails/176172-estels-del-sud` | numeric id, then the ladder title; the country is where the row is filed |
| Cycling route | `/spain/cycling/56578-galisteo-caceres` | same shape as a trail |
| Cycling tour | `/spain/cycling/tours/de-ammer-amper-radweg-balanced` | the tour slug, which starts with its country code |
| Beach, lake, mountain | `/albania/beaches/al-beach-of-durres-q3302169` | the wire id lower cased; the Wikidata Q is the only capital in a wire id and is restored when the path is read |
| Region | `/austria/regions/at11--burgenland` | the region id lower cased, then `--`, then the name; ids never contain a double hyphen |
| Trip | `/trips/ad-andorra-la-vella-barcelona-chain-5d` | the wire id; trips cross borders so they have no country |
| Journey | `/journeys/ad-hiking-coma-pedrosa-madriu` | the wire id |
| Guide | `/guides/{id}` | community pages, noindex, never in a sitemap |
| Language | `/nl/spain/malaga` | English at the root, prefixes nl, de, fr, es, it |

The EuroVelo and E-path families that T205 proposed under `/routes/e1` are not in the scheme. The wire files each cycling route and trail under one country, and a parent page that crosses countries has no id of its own to hang a path on yet. They get a path when a cross-country parent row exists (register row T223-b). Until then a family is reached through its stages and the country list.

Country words are the first segment of every dossier slug: 43 of them, mapped from ISO codes in COUNTRY_SLUGS (the wire has 43 countries with a dossier, and each dossier slug starts with exactly one of them). `united-kingdom`, `czechia`, `north-macedonia` and `bosnia-and-herzegovina` are the spellings the dossier already uses and stay.

Reserved words. Inside a country namespace these may never be a place word: trails, beaches, lakes, mountains, cycling, regions, trips, cost, any `{n}-days` or `{n}-day`, the five language codes and `en`. At the root these may never be a country: trips, journeys, guides, routes, sitemap, assets, api, static. The check ran over the 3,868 dossier slugs: zero collide, every slug is exactly two segments of `a-z0-9-`, and the set is unique. Any pipeline step that mints a dossier slug must call `reservedCollisions` from urlScheme.js and fail on a hit; a future town called "Trails" would otherwise shadow its country's trail list.

Language in the path. The language code is the first segment when it is one of the five. Each language page is its own canonical and carries the full reciprocal set through `alternates()`, which returns the six languages and x-default. English is `x-default`. The sitemap declares the alternates; the page head does not. Which page types join the language wave is the two thirds rule further down.

### Old links and the hash readers

The nine boot readers (dossier, beaches, lakes, mountains, trails, cycling, trips, regions, guides) still read their hash and still strip it. src/lib/pathBoot.js runs before them. A content path is turned into the legacy hash they understand and the address goes back to `/`, so a path link opens the right entity today (Cloudflare Pages answers an unknown path with index.html) and will keep opening it when the prerender serves HTML on the same paths. The other direction, a legacy hash redirecting to its path, is built and tested but gated on `VITE_PATH_URLS=1`, because with no prerendered HTML behind the path it only adds a reload. The prerender task flips the flag when it ships. Auth hashes (`#access_token=...`) are never touched. Destination links are the one gap: a destination hash carries the airport or gem id and the path carries the slug, and no table maps one to the other in the client. T221 or T222 emits that table (register row T223-a); until it exists destination paths are served by the prerender only and destination hashes stay hashes.

## Titles and descriptions, from the ladder

The title ladder (T107, `pipeline/trails/names.py`) gives every trail a title of at most 42 characters on a word boundary, moves the original string into a mono ref chip and keeps the region out of the title. The on-page `h1` is exactly that string. The HTML `<title>` has a different job: it is the line in the search result, and the query carries the disambiguator ("lac blanc vosges"), so the region goes into the `<title>` as a qualifier after the ladder title, and never into the `h1`. The rule for every section is one pattern:

    <title>  {ladder title}, {headline number} {kind}, {region or country} | Carta
    h1       {ladder title}
    meta     {the hook}. {the headline measured sentence}. {the honest coverage or provenance line}.

The headline number is the figure the card already leads with (spec 5.1): distance for a trail, surface share for a cycling route, the water class for a beach, the swim season for a lake, the altitude for a mountain, the day cost for a destination. The hook is the one sentence with a verb or a number that spec 5.4 puts under the hero, which the card builders already produce. The description is capped at 155 characters on a word boundary and never repeats the title. The separator is a comma, with " | Carta" at the end; no middot and no dash, which means the shell's current title and `og:title`, which separate Carta from Europe Travel with a middot, go when T221 rewrites heads (T205-b).

| Section | Title example (real rows) | Description example |
|---|---|---|
| Trail | Tour des Combins, 65 km hard loop, Valais \| Carta | A seven-stage loop round the Combins with 4,167 m of ascent and six huts on the way. Rated 9.2 within 56 routes in Valais. Distance and ascent measured from OpenStreetMap and Copernicus elevation. |
| Trail parent | Senda Pirenaica, 37 stages, Pyrenees \| Carta | The GR 11 as 37 stages with per-stage distance, ascent and GPX. 31 stages mapped, 6 waiting on open route data. |
| Cycling | Galisteo to Cáceres, 82 km, EuroVelo 1 \| Carta | Section 40 of EuroVelo 1 in Extremadura, 91 percent paved, 248 m of climb, a quiet-road score of 8.4. Surface measured per kilometre from OpenStreetMap. |
| Beach | Playa Es Trenc, excellent water, Mallorca \| Carta | Bathing water classed Excellent at the Playa Es Trenc monitoring site, inside the Es Trenc Natura 2000 reserve, 0.9 km from Es Trenc. Measured by the European Environment Agency. |
| Lake | Lake Garda, swim June to September, Lombardy \| Carta | Four swimming months with the water peaking at 22.8 degrees, 145 km2 and 154 m deep, water classed Excellent at 33 sites. Temperatures are estimated from NASA POWER, the rest is measured. |
| Mountain | Dachstein, 2,995 m by cable car, Styria \| Carta | The Dachstein Südwandbahn runs to the top; the snow line clears in July and August only. Elevation and prominence measured, the season estimated from a 12-month series. |
| Destination | Malaga, 7.3 worth a visit, Andalucia \| Carta | A day in Malaga costs a measured bed plus a day of eating out; the receipt says which figure is measured and which is national. Rated 108th of 300 places in Spain. |
| Country | Spain on a budget, 300 places priced \| Carta | What a day costs in 300 Spanish towns, the median bed and meal, when to go, and where the catalogue is thin and why. |
| Trip | Andorra la Vella and Barcelona, 5 days \| Carta | Two nights in Andorra la Vella and two in Barcelona, priced per person with the transport between them, from a catalogue that labels every figure. |

The country guide and destination descriptions carry the day cost only when `costIndex.js` has a measured figure; a national stand-in is named as such in the sentence, as `CostSummary.jsx` already does. Every number in a title or description is read from the record at prerender time, never typed, so it changes when the data changes. Titles over 60 characters drop the region qualifier first and " | Carta" second.

## Structured data per page type

One JSON-LD graph per page, in the prerendered head, carrying a `WebPage` node (`inLanguage`, `dateModified` from the record's `generated_at` or `built_at`, `isPartOf` the `WebSite`), a `BreadcrumbList` node following the URL segments, and one subject node per the table. Everything is read from the same record the page renders, so the markup can never disagree with the text.

| Page type | Subject type | Properties worth carrying |
|---|---|---|
| Country | `Country` | `name`, `containsPlace` for the NUTS2 regions, `touristType` |
| Region | `AdministrativeArea` | `name`, `containedInPlace` the country, `geo` as a `GeoShape` box, `containsPlace` the listed rows |
| Destination | `TouristDestination` | `geo`, `image` with licence via `ImageObject.license` and `creditText`, `containedInPlace`, `touristType`, `includesAttraction` for the highlights, `additionalProperty` for day cost with the provenance word in `description` |
| Trail, cycling route | `TouristAttraction` with `additionalType` hiking or cycling route | `geo` as `GeoShape.line` (the simplified geometry), `touristType` Hiker or Cyclist, `additionalProperty` for distance, ascent, duration, difficulty and surface, `isPartOf` the parent, `hasPart` the stages, `sameAs` the OSM relation and Wikidata item |
| Trail parent, EuroVelo family | `TouristTrip` | `itinerary` as an `ItemList` of the stage pages in order, `touristType`, `distance` as the total |
| Beach | `Beach` | `geo`, `containedInPlace`, `additionalProperty` for the EEA class, the monitoring site and the protection network, `sameAs` Wikidata |
| Lake | `LakeBodyOfWater` | `geo`, `additionalProperty` for area, depth, elevation, swim season and peak temperature |
| Mountain | `Mountain` | `geo` with `elevation`, `additionalProperty` for prominence, access kind and lift name |
| Trip, journey | `TouristTrip` | `itinerary` as an `ItemList` of `TouristDestination` pages, `touristType`, `offers` is never used because Carta sells nothing on the page |

Three rules keep the markup honest. No `AggregateRating` anywhere: Carta's score is an editorial figure from open signals, not a set of user reviews, and Google treats self-serving rating markup as spam. No `Offer` or price markup on a destination: the day cost is a measured living cost, not a product, and it goes into `additionalProperty` with the provenance word. Every `PropertyValue` for an estimated figure carries the word "estimate" in its `description`, mirroring the tilde and "est." tag on the page. A later option, not in the first wave, is a `Dataset` node on the "Where this comes from" block of the beach and lake pages, because the ten-year EEA history per site is a dataset in the Google Dataset Search sense and nothing else publishes it per beach.

## Internal linking

Tens of thousands of pages with no links between them index slowly and shallowly whatever the sitemap says. The graph is designed so that every indexable page is at most four clicks from the home page and every detail page has at least six outbound links to other indexable pages, and the links come from data the records already hold.

Downward: home links the 43 countries. A country page links its NUTS2 regions, its top destinations, and its seven section lists. A section list is paginated on paths and links every row above the floor. A region page links its listed rows (`region/{id}.json` `listed`) and its neighbours. That is the spine, and it alone puts every page within four clicks.

Sideways, from the records: a destination page links `nearby` (beaches, mountains), `around` (trails, cycling, beaches within the radius), `routes` (the hiking and cycling parents the dossier attach step names) and `trips` (the eight day trips with a travel time), as `build_dossier.py` already writes them. A trail links its parent, its stages and variants (`h.of`, `stages`), the family rows (`fam`), its base town, and the lakes and summits in `highlights`. A cycling route links `near.trail` and its EuroVelo family. A beach and a lake link `base.city`. A mountain links its range and its lift. A trip links each stop's destination and each `around` row. Spec 5.4's "three ways out" (easier, cheaper, nearby) is computed per page from the same section and gives every detail page three more links that change with the data.

Upward: the breadcrumb on every page is a real link chain (country, section, region where there is one), not decoration, and it is the same chain the `BreadcrumbList` carries.

T225's editorial pieces are the cross-section links the records cannot produce: a receipt-based week links the country guide, the destinations and the trips it priced. T225 measures link depth before and after; the plan's target is the four-click bound above and a median of eight outbound internal links per detail page, measured on the prerendered output by a crawl of `dist` that T222 can run in the same script that writes the sitemap.

Lists cap what they show. A country section list links every row above the floor, paginated at 100; a detail page links at most 24 other pages, so the "around" radius lists are cut to the top rows by score and the rest stay reachable through the region.

## Canonicals: stage families, parents, variants and duplicates

The wire already carries the hierarchy R3a built: `h.cls` is `standalone` on 15,041 trail rows, `stage` on 1,615, `parent` on 310, `variant` on 148 and unset on 505, and `h.of` names the parent on 1,590 rows. The name-folded `fam` key groups 8,838 rows into 2,268 families, 725 of them with two or more rows. The rules:

A stage keeps its own URL and is its own canonical. A stage is a thing people search for by name ("GR 11 etapa 3") and its page carries facts the parent does not (its own distance, profile, GPX). Its title names the parent first, as the parent-page row in the title table shows, and its page links up.

A parent is its own canonical and is never a GPX. The parent page is an itinerary of stages (spec 6.3, ROUTES.md), exempt from the continuity gate, and it is the page the destination dossier names. The canonical for a family-level query is the parent, which it earns by being the only page with the whole stage list and the total.

A variant canonicalises to the line it varies. The 148 `variant` rows get a URL for the share links that already exist, a `rel=canonical` to the main line, and they stay out of the sitemap. Alternative, approach and excursion members are not pages.

The 540 orphan families (spec 6.3: 540 of 594 stage groups have no parent row) have no canonical target until the parent pages exist. Until then the stages stand alone and the `fam` list on each stage page links the siblings, which is enough for a crawler to see the group. Synthesising a parent from the name family is T-series work in `pipeline/trails`, not an SEO task, and the plan does not fake it.

Geometric duplicates are the open risk. ROUTES.md R0 found that one physical path is often carried by four or five overlapping relations and the dedup step has not run, so some paths will have several indexable pages. There is no honest canonical without the overlap test, and a guessed one would hide a real page. The monthly sheet watches Search Console's "Duplicate, Google chose different canonical than user" count for the trails and cycling sitemaps as the signal, and the overlap test, when it lands, adds a `dup_of` field the prerender reads as the canonical (T205-e).

Rows below the floor are `noindex` and never canonical targets. Language versions are each self-canonical. Every URL with a query string is uncrawlable by robots.txt and carries no canonical of its own because it is never served as HTML. The old hash links redirect client-side to the path; there is no server-side 301 for a fragment, so the sitemap and every internal link carry only the new paths.

The rules above are code: `canonicalFor()` in continent-app/src/lib/urlScheme.js takes the entity kind, its hierarchy class, the line it varies or duplicates, and whether it fails the page floor, and returns the canonical path, whether the page is indexable and whether it belongs in the sitemap. A stage, a parent and a standalone row return their own path. A variant returns the path of the line it varies and stays out of the sitemap. A row with a `dup_of` returns that row's path. A row below the floor returns its own path with `indexable: false`. The `title` argument must be the ladder title; the path carries its slug.

## hreflang across the six languages

The six languages are `en-GB`, `nl-NL`, `de-DE`, `fr-FR`, `es-ES` and `it-IT` (`LANGUAGES` in `src/i18n/index.jsx`). The scheme is a path prefix, English at the root as `x-default`, each language self-canonical, every page carrying the full reciprocal set including itself, and the alternates declared in the sitemap (`xhtml:link`) rather than in the head, which keeps six links off every one of 57,000 pages and keeps the declaration in the one file T222 generates anyway. The prerendered page sets the language from the path, which wins over localStorage; the client's language picker switches the path.

The phase rule is the important part. hreflang on six near-identical pages invites a "Duplicate" verdict rather than six rankings. A page type joins the language wave only when the share of its visible text that comes through `t()` is above two thirds, measured on the prerendered output. Trails, beaches, lakes and mountains pass today, because their sentences are composed from the structured fields through the catalogues (`trailStory.js` and its siblings). Destinations do not, because the Wikivoyage intro is English only and dominates the page; they stay English with an `x-default` until the intro is translated or displaced, which is an owner decision (T205-g). Trips and journeys carry English prose from the composer and sit with destinations. The first sitemap wave is English only for every type; the second adds the five languages for the four layer types; the third follows the translation decision.

Names follow the ladder's own rule. The Wikidata rung gives the local spelling with correct diacritics, and for a language page the title uses the Wikidata label in that language when one exists and the local name otherwise, so the German page of an Italian lake is "Gardasee" and the Dutch page of a French peak keeps its French name. The region qualifier in the `<title>` comes from the i18n catalogues, which already hold the NUTS names the app shows.

## Sitemaps

T222 generates them from the wire in the build, after the page floor has run. The layout is an index at `/sitemap.xml` over one file per page type and language, so Search Console reports indexation per type without any further filtering: `sitemap-destinations-en.xml`, `sitemap-trails-en.xml`, `sitemap-cycling-en.xml`, `sitemap-beaches-en.xml`, `sitemap-lakes-en.xml`, `sitemap-mountains-en.xml`, `sitemap-trips-en.xml`, `sitemap-countries-en.xml` (countries, regions and the T224 pages). No file approaches the 50,000 URL or 50 MB limits (trails, the largest, is 17,619 rows). `lastmod` is the record's own `generated_at` or `built_at`, never the build time, so a crawler re-fetches a page only when its data changed; a sitemap that stamps today on everything teaches Google to ignore `lastmod`. Only canonical, indexable URLs are listed: no variants, no rows below the floor, no language versions outside the wave. The hero image goes in as an image sitemap entry once the image ladder serves it from `cdn.carta-europetravel.com`; hotlinked Wikimedia thumbs are left out.

The files live beside the prerendered HTML on R2 and are served through the same Pages Function, with the `Cache-Control` rule `public/_headers` already carries for `/sitemap*.xml`. `robots.txt` keeps its `Sitemap:` line and its query-string disallow and gains nothing else; the section lists paginate on paths precisely so that nothing indexable is behind a `?`.

Submission is the owner's: a Search Console property for `https://www.carta-europetravel.com/`, Bing Webmaster Tools, and an IndexNow key (Bing, Yandex, Seznam honour it; Google does not) so the build can push changed URLs rather than wait for a crawl (T205-f).

## Indexation monitoring and the monthly metric

The metric is indexed share: the number of URLs Google reports as indexed, divided by the number of URLs the build submitted, per page type, read on the first working day of each month. It is one line per sitemap file in Search Console's Pages report filtered by sitemap, which is why the sitemaps are split by type. Beside it the sheet carries, per type, the three not-indexed reasons that matter (Discovered currently not indexed, Crawled currently not indexed, Duplicate Google chose different canonical), organic clicks and impressions from the Performance report filtered by path prefix, and the catalogue size at the build, so the share is read against growth and not in isolation.

The targets are set against how Google treats a new large host, which indexes a fresh site by sampling and widens as the pages prove themselves: 30 percent of submitted URLs indexed by the third month after the first full sitemap, 60 percent by the sixth, 80 percent by the twelfth, with destinations and countries ahead of that curve and trails and cycling behind it. A type whose "Crawled, currently not indexed" count exceeds a quarter of its submitted URLs for two consecutive months has its floor raised, not its sitemap resubmitted. A "Duplicate" count above five percent on trails or cycling brings the overlap test forward.

The monthly read belongs to T239 and lands in the review T240 already runs. The Search Console API (search analytics plus the URL inspection endpoint at 2,000 calls a day) makes the read a script rather than a copy from a screen; until the property exists the sheet is written by hand from the two reports named above. The before figure for every type is zero indexed of zero submitted.

## Order of work

The code waits for stage 6. When it starts, the order that keeps every step revertible is: T223 ratifies the paths and turns the hash readers into redirects, with the language in the path; T221 prerenders to R2 and serves through the Function, writing the head, the JSON-LD, the honest coverage line and the link blocks per this report; T222 runs the page floor and writes the sitemaps and the depth crawl; T212 supplies the per-type Open Graph image the head references; T224 adds the two page families; T225 adds the editorial cross-links and measures depth; T239 owns the monthly sheet from the first full sitemap onward. None of them needs a design decision that this report does not make, except the three raised for the owner below.
