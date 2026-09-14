# Ranking sources: how to decide "the most beautiful" defensibly

Research pass, 2026-08-17. Category: **ranking**. Scope: open signals usable
*per feature* (per beach, per mountain, per trail, per trip) across the 43
covered countries, plus a concrete scoring formula, a normalisation strategy
that survives Greece having 45 beach towns and Moldova having none, an
allocation rule for how many picks a country gets, and the honesty contract
the UI has to hold up.

Every licence claim below carries a URL. Rows marked `verified: false` were
read from search summaries rather than fetched from the authoritative page, or
carry a contradiction I could not resolve. They say so in their note.

## 0. What Carta already has, and what it is missing

Read first: [docs/2.SIGNIFICANCE.md](../../../docs/2.SIGNIFICANCE.md),
[pipeline/score_significance.py](../../../pipeline/score_significance.py),
[pipeline/beauty_layer.py](../../../pipeline/beauty_layer.py),
[pipeline/rating_layer.py](../../../pipeline/rating_layer.py),
[pipeline/apply_rating_layer.py](../../../pipeline/apply_rating_layer.py),
[pipeline/trails/popularity.py](../../../pipeline/trails/popularity.py).

The machinery is already good, and three of its ideas should be treated as
settled and reused rather than reinvented:

1. **The truth hierarchy.** Independent open evidence first, editorial
   judgement weighted in, harvest opinion demoted to a prior, and no top tier
   without corroboration (2.SIGNIFICANCE.md). This is the rule that makes any
   "most beautiful" claim survivable.
2. **The local-plus-global percentile blend.** `score_significance.py` mixes
   60 percent within-destination percentile with 40 percent catalogue-wide.
   That is exactly the shape the Greece-versus-Moldova problem needs, it just
   needs one more level (section 4).
3. **The validation gate.** `apply_rating_layer.validate()` and
   `score_significance`'s anchor-recall gate refuse to write the master when
   a famous anchor falls out of the top tiers. Any new ranking must ship with
   its own gate or it will drift silently.

What is genuinely missing, and what this research is for:

| Gap | Today | What is available |
|---|---|---|
| No per-feature photogenic signal | `beauty_layer` has no image signal at all | Commons assessed-image counts by coordinate (section 1.3), a real and free per-feature signal |
| Heritage is proximity, not identity | `_heritage_component` counts UNESCO sites within 60 km, so a whole region inherits one site's credit | Wikidata P1435 gives the designation *on the feature itself*, with coordinates, CC0 |
| Beach quality is a national constant | `BLUE_FLAG_BEACHES` is a hand-typed country count; every Greek beach gets the same 623 | EEA WISE bathing water is already harvested per site with coordinates. Blue Flag has no open per-beach dataset (section 2.4) |
| "Iconic" is a hand-typed dictionary | `ICONIC_CURATED` is 90 lowercase city names with hand-picked weights | The named federations behind that intuition are in Wikidata as memberships, CC0 (section 1.5) |
| Nothing computes physical form | `NATURE_TAG_WEIGHTS` scores the word "fjord", not the fjord | Copernicus GLO-30 is already in the repo for trails; relief and prominence are computable |
| No per-country allocation rule | Rankings are global sorts | Section 5 |

## 1. Recommended sources (use)

### 1.1 Wikidata via WDQS, the spine of the whole thing

* URL: https://query.wikidata.org/ , https://www.wikidata.org/wiki/Property:P1435
* Licence: **CC0 1.0**, https://www.wikidata.org/wiki/Wikidata:Licensing
* Access: SPARQL (`query.wikidata.org/sparql?format=json`) and the Action API.
* Per-feature coordinates: **yes**, P625.
* Harvesting: allowed. Already in the licence ledger (section 5 of
  `docs/tos/data_licenses.md`) for POI QIDs, sitelinks, P1435 and P1174.

**Verified live.** A query for UNESCO World Heritage designation in Greece
returned per-feature coordinates directly:

```
SELECT ?item ?itemLabel ?coord WHERE {
  ?item wdt:P1435 wd:Q9259 . ?item wdt:P17 wd:Q41 . ?item wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 5
```
returned Mystras `Point(22.3673 37.074)`, Olympia `Point(21.63 37.638333333)`,
Mount Olympus, the Acropolis of Athens and Delos.

This single endpoint is how nearly every "beautiful place" designation should
be harvested, because the designations are modelled *on the feature*, with
coordinates, under CC0, with no attribution or share-alike obligation. It
replaces going to each awarding body's website one at a time and inheriting
each body's terms of use.

Designations worth pulling: UNESCO World Heritage (Q9259), UNESCO Global
Geopark (Q53444003, https://www.wikidata.org/wiki/Q53444003), Ramsar site,
Natura 2000 site, national park, and the beautiful-village federations
(section 1.5). Properties: P1435 (heritage designation), P166 (award
received), P463 (member of).

### 1.2 Wikimedia pageviews, attention

* URL: https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/
* Licence: **CC0 1.0** for the analytics data,
  https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/access-policy.html
* Access: REST, 12-month daily average, already implemented in
  `harvest_pageviews.py` and `enrich_activities.pageviews_avg`.
* Per-feature coordinates: no, this joins to a feature through its article.
* Harvesting: allowed, with a descriptive User-Agent carrying contact details.
  Wikimedia's policy is explicit that scripts without one "may be blocked
  without notice",
  https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy

Already in the ledger. Weakness: seasonal and event-driven. A wildfire, a film
release or a football match spikes a village for a month. Use a median of the
twelve monthly means rather than the mean of daily values if spikes prove to
be moving ranks.

### 1.3 Wikimedia Commons assessed images, the new photogenic signal

This is the most valuable thing this research found, because it is the only
free, Europe-wide, per-coordinate proxy for "is this place actually worth
looking at" that is not a popularity count.

Commons carries three peer-reviewed quality assessments: Featured picture,
Quality image and Valued image. Since Structured Data on Commons they are
machine-readable as property **P6731 (Commons quality assessment)**,
https://www.wikidata.org/wiki/Property:P6731 , whose values include
Wikimedia Commons quality image (Q63348069, confirmed via
`wbsearchentities`).

**Verified live, and it works without OAuth.** CirrusSearch on Commons
supports the GeoData `nearcoord:` keyword and the `haswbstatement:` keyword
in the same query:

```
https://commons.wikimedia.org/w/api.php?action=query&format=json
  &list=search&srnamespace=6&srinfo=totalhits&srlimit=3
  &srsearch=nearcoord:2km,37.971666,23.726111 haswbstatement:P6731
```
returned `totalhits` 542 near the Acropolis, with
`File:Parthenon from south.jpg` and
`File:Erechtheum Acropolis Athens evening moon.jpg` at the top.

The plain `generator=geosearch` module also works and is already the mechanism
`enrich_images_web.py` uses: max radius 10,000 m, max 500 results, coordinates
returned per file
(https://commons.wikimedia.org/w/api.php?action=help&modules=query%2Bgeosearch).

* Licence: the *counts* are facts and carry no obligation. Individual files
  are per-file CC0, CC BY, CC BY-SA or public domain, so any file that is
  actually displayed owes its own credit. That per-file credit gap is already
  open item 1 in the ledger's follow-up list.
* Access: MediaWiki Action API, no key, no OAuth.
* Per-feature coordinates: yes.
* Harvesting: allowed under the User-Agent policy.

Note on the alternative: the **Wikimedia Commons Query Service** (WCQS,
https://commons.wikimedia.org/wiki/Commons:SPARQL_query_service ) would be the
cleaner SPARQL route and can federate with WDQS, but it is "restricted behind
OAuth authentication, backed by Commons" and is beta with weekly reload
downtime. Prefer the Action API route above for an unattended pipeline.

### 1.4 Wikivoyage prominence, human curation

* URL: https://en.wikivoyage.org/
* Licence: **CC BY-SA 4.0**, https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use
* Access: MediaWiki API, wikitext parsing, already built in
  `harvest_wikivoyage_listings.py` (13,248 listings, 1,010 articles).
* Per-feature coordinates: yes, listing templates carry lat/long.
* Harvesting: allowed. Already in the ledger.

The repo's existing discipline is right and must be kept: take facts (names,
coordinates, listing order, article status) and never prose, so the share-alike
obligation does not reach the derived score. The listing-order weighting
(first listing 1.0, tail approaching 0.5) is a genuine expert-curation signal
and is the main counterweight to popularity bias.

### 1.5 The beautiful-village federations, via Wikidata

`beauty_layer.ICONIC_CURATED` is a hand-typed dictionary standing in for
exactly this. The real lists are in Wikidata as memberships.

**Verified live.** Querying which properties point at Q1010307 (The Most
Beautiful Villages of France, confirmed via `wbsearchentities`):

```
SELECT ?p (COUNT(*) AS ?c) WHERE { ?v ?p wd:Q1010307 . } GROUP BY ?p
```
returned `wdt:P463` (member of) with **155** members. The association's own
site lists 184 as of late 2025
(https://en.wikipedia.org/wiki/Les_Plus_Beaux_Villages_de_France), so Wikidata
coverage is about 84 percent. Partial, but CC0, coordinate-bearing and
improvable, which the hand-typed dictionary is not.

The same pattern covers the sister federations (Wallonia, Italy, Spain, and
the international federation), each of which has its own Wikidata item.

* Licence: CC0 (Wikidata). The federations' own websites are not being
  harvested, only the Wikidata modelling of a membership fact.
* Access: WDQS. Per-feature coordinates: yes. Harvesting: allowed.

### 1.6 UNESCO World Heritage, and a licence warning

There are two routes and they do not carry the same terms.

**Route A, the UNESCO DataHub copy (what the repo already caches).**
* URL: https://data.unesco.org/explore/dataset/whc001/
* Licence: **CC BY-SA 4.0**, read directly from the Opendatasoft catalogue
  API at `https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001`,
  which returns `license: "CC BY-SA 4.0"`, attribution UNESCO, 1,273 records,
  and a `coordinates` field of type `geo_point_2d`.
* Verdict: usable, with attribution, but the share-alike term reaches into any
  derived database that is redistributed.

**Route B, the whc.unesco.org syndication feed.** https://whc.unesco.org/en/syndication/
carries restrictive terms: republication requires prior written authorisation,
permission is framed as "personal, non-commercial use", no modification of the
syndicated content is permitted, and every use must carry the UNESCO copyright
notice. **Do not build on this route.** (Marked `verified: false`: whc.unesco.org
returned HTTP 403 to a direct fetch, so this is read from the search index's
rendering of the syndication page rather than from the page itself. Confirm
before relying on the exact wording, but treat it as restrictive until then.)

**Recommended: neither, for scoring.** Use Wikidata P1435 = Q9259 (section
1.1) for the identity and coordinates, which is CC0 with no attribution or
share-alike, and keep the DataHub copy only if a UNESCO-branded display field
is wanted, credited per CC BY-SA.

### 1.7 Natura 2000 and CDDA, the protected-nature layer

* Natura 2000: https://www.eea.europa.eu/en/datahub/datahubitem-view/6fc8ad2d-195d-40f4-bdec-576e7d1268e4
* CDDA (nationally designated areas): https://www.eea.europa.eu/data-and-maps/data/nationally-designated-areas-national-cdda-17/cdda
* Licence: **CC BY 4.0** per the EEA data hub. `verified: false`, taken from
  search summaries of the EEA datahub pages rather than from a fetched
  licence field. The EEA's standard reuse policy is already carried in the
  ledger for WISE bathing water, so the direction is right, but confirm the
  exact licence string on the datahub item page before adding the row.
* Access: bulk download (shapefile, CSV, Access DB) plus the EEA SDI catalogue.
* Per-feature coordinates: yes, polygon boundaries with site codes.
* Harvesting: allowed with attribution.

Use for the designation component of beach and mountain scores. EU-only, so
GB, CH, NO, RS, BA, ME, AL, MD and UA need the CDDA or national equivalents.

### 1.8 Copernicus, the objective landscape measures

* Copernicus GLO-30 DEM: already in the repo and the ledger for trail
  elevation (`pipeline/trails/elevation.py`).
* CORINE Land Cover: https://land.copernicus.eu/en/products/corine-land-cover
* Licence: Copernicus data and information policy, Regulation (EU) No
  1159/2013, free for commercial and non-commercial reuse provided the source
  is acknowledged. `verified: false` for CORINE specifically, read from search
  summaries of the Copernicus land portal rather than from a fetched terms
  page. GLO-30's equivalent claim is already carried in the ledger.
* Per-feature coordinates: raster, sampled at any coordinate.
* Harvesting: allowed with credit.

This is what turns `NATURE_TAG_WEIGHTS` from word-matching into measurement:
topographic prominence and local relief for mountains, coastline sinuosity for
beaches, land-cover diversity and naturalness within a radius for everything.
Unlike every other signal here, it cannot be biased by fame, because nobody
votes on a DEM.

### 1.9 Already-in-repo sources that the ranking should reuse

| Source | Licence | Role in ranking |
|---|---|---|
| EEA WISE bathing water | EEA reuse, effectively CC BY 4.0 (ledger) | Per-site water quality, the honest per-beach quality signal |
| OpenStreetMap via Overpass | ODbL 1.0 | Tag richness, `tourism=viewpoint` density, `natural=beach` geometry |
| Overture Maps Places | CDLA-Permissive 2.0 | POI depth |
| GeoNames | CC BY 4.0 | Settlement class, elevation |
| Eurostat `tour_occ_nin3` | CC BY 4.0 | Crowding, used as a *dampener*, not a booster |

## 2. Rejected sources, and why

### 2.1 Protected Planet / WDPA, rejected on licence

* URL: https://www.protectedplanet.net/en/legal
* **Verified by direct fetch.** The terms state that neither the materials
  "nor any work derived from or based upon" them "may be put to Commercial Use
  without the prior written permission of UNEP-WCMC", and commercial use
  explicitly includes revenue generation. They further bar redistribution
  "by any means including ... web downloads, through web services, through
  interactive web maps ... KML Files or through file transfer protocols".
* Carta carries affiliate links, so it is a commercial use. **Reject.** Use
  Natura 2000, CDDA and Wikidata instead, which cover Europe adequately.

This is the single biggest licensing trap in this category, because WDPA is
the obvious first hit for "protected areas dataset" and its restriction is
buried in a legal page rather than on the download button.

### 2.2 AllTrails, Tripadvisor, Google Places, rejected on terms

| Source | Why rejected |
|---|---|
| AllTrails | Terms prohibit scraping; enforcement is documented (scraping tools disabled at AllTrails' request) and the surface sits behind a WAF. https://www.alltrails.com/terms |
| Tripadvisor | Terms prohibit use of "any robot, spider, AI system, or automated means" to access or collect content; the official Content API returns only about 5 reviews and 5 photos per location. https://www.tripadvisor.com/pages/terms.html |
| Google Places | Section 3.2.3(a) "No Scraping" bars exporting or extracting Google Maps Content for use outside the services; place coordinates may be cached at most 30 days and names, ratings, reviews and photos may not be warehoused at all. https://developers.google.com/maps/documentation/places/web-service/policies |

All three are `verified: false` in the sense that these readings come from
search summaries quoting the terms rather than from fetched terms pages
(each is bot-hostile). The direction is not in doubt for any of them, and a
reject needs less evidence than a use.

### 2.3 Komoot, rejected on absence of a grant

* URL: https://www.komoot.com/terms-of-service
* **Verified by direct fetch.** The terms contain no explicit anti-scraping
  clause, but equally no licence grant of any kind over route content, and
  section 12 obliges users to "refrain from any actions which are likely to
  affect the functionality of the platform". No open data licence means no
  right to build a derived ranking on it. **Reject**, on the absence of a
  grant rather than on the presence of a prohibition.

### 2.4 Blue Flag, rejected as a per-beach source

* URL: https://www.blueflag.global/
* **Verified by direct fetch.** The site carries only "(C) 2023 Foundation for
  Environmental Education" with no Creative Commons or open data licence, no
  API, no download, and the map is currently offline: "Our map system is
  currently not available. We are working on alternative solutions."
* The OSM fallback is empty. **Verified live via taginfo:** key `blue_flag`
  has 19 objects total (19 ways) and `award:blue_flag` has 11 (10 ways, 1
  relation), against a programme covering thousands of European beaches.
  https://taginfo.openstreetmap.org/api/4/key/stats?key=blue_flag

**Consequence for the product.** The existing `BLUE_FLAG_BEACHES` country
counts are a national density proxy and nothing more. The UI must never say or
imply "this beach has a Blue Flag", because Carta cannot know that per beach.
Use EEA WISE bathing water for the per-beach quality claim, which is
per-site, coordinate-bearing, already harvested, and actually says what it
means.

### 2.5 ScenicOrNot, rejected on a licence contradiction and coverage

* URLs: http://scenicornot.datasciencelab.co.uk/faq ,
  https://www.mysociety.org/2009/06/26/scenicornot-raw-data-now-available-for-re-use/
* This is the closest thing that exists to a real crowdsourced beauty ground
  truth: 217,000 photos, one per 1 km square covering about 95 percent of
  Great Britain, each rated 1 to 10 by at least three people, with latitude
  and longitude per photo.
* Two problems. First, the licence is contradictory: mySociety's release post
  states Creative Commons Attribution Noncommercial 3, while the project FAQ
  states the Open Database Licence. `verified: false`, unresolved. A
  noncommercial clause would bar Carta outright.
* Second, Great Britain only, so it can never be a Europe-wide signal.
* **Verdict: reject for shipping.** It remains the best available *validation*
  set if the licence is ever clarified: scoring GB features with Carta's
  formula and correlating against ScenicOrNot's human ratings would be a real
  benchmark for whether the composite tracks perceived beauty at all. Worth an
  email to mySociety before assuming.

### 2.6 Flickr, rejected as gated

* URL: https://www.flickr.com/help/terms/api
* Geotagged photo density is a classic scenicness proxy, but a free API key
  covers "personal/non-commercial apps" only and a commercial key is
  "permission-only" and individually reviewed. `verified: false`, read from
  search summaries of the API terms.
* Commons assessed-image counts (section 1.3) give the same shape of signal
  with no gate. **Reject** unless a commercial key is actually granted.

### 2.7 Geograph and Mapillary, parked

* Geograph Britain and Ireland: CC BY-SA 2.0, daily dumps, but GB and IE only.
  https://data.geograph.org.uk/dumps/ . `verified: false`. Not Europe-wide.
* Mapillary: imagery under CC BY-SA 4.0 with an API attribution requirement
  (visible logo plus link). https://www.mapillary.com/terms . `verified:
  false`. Street-level coverage is a proxy for road access, not for beauty.
  Parked as a maybe.

### 2.8 Award lists with no machine-readable licence

Council of Europe Cultural Routes (49 certified,
https://www.coe.int/en/web/cultural-routes/ ), UN Tourism Best Tourism
Villages (319 in the network across five editions,
https://tourism-villages.unwto.org/ ), ERA Leading Quality Trails
(https://www.era-ewv-ferp.org/lqt/ ), EDEN (about 140 destinations,
https://en.wikipedia.org/wiki/European_Destinations_of_Excellence ) and
DarkSky International Places (250 certified,
https://darksky.org/what-we-do/international-dark-sky-places/all-places/ ).

Each is a genuine expert designation and each would strengthen the
designation component. None publishes an open licence or a bulk download.
All are `verified: false` on licence.

**Route: take them through Wikidata where they are modelled** (P166 award
received, P463 member of), which converts them to CC0 facts with coordinates,
exactly as section 1.5 does for the villages. Where Wikidata does not model
them, leave them out rather than scraping the awarding body. The list of
awardees is a fact, but the awarding body's site is not licensed for bulk
reuse, and a designation nobody can verify is worth less than one signal
fewer.

## 3. The scoring formula, per category

### 3.1 Shared building blocks

All signals normalise to 0..1 before weighting. Reuse
`score_significance.zlog` and `percentile_ranks` rather than writing new ones.

```
fame        = 0.5 * zlog(sitelinks) + 0.5 * zlog(pageviews_12mo)
photo       = zlog(assessed_commons_images_within_r)
              gated by assessed_ratio = assessed / total_geotagged_files
designation = min(1.0, sum(DESIGNATION_WEIGHTS[d] for d in designations))
curation    = wikivoyage listing weight (1.0 first listing .. 0.5 tail)
              + 0.2 if article status in (star, guide)
form        = category-specific physical measure, section 3.2 to 3.5
crowd_pen   = 0.10 if Eurostat crowding tier is extreme, else 0
```

`DESIGNATION_WEIGHTS` (capped at 1.0 in sum, so a stack of five does not
outrank on paperwork alone):

```
unesco_whs 0.55, unesco_geopark 0.35, national_park 0.30,
beautiful_villages_member 0.30, ramsar 0.20, natura2000 0.15,
cdda_national 0.15, cultural_route 0.15, lqt_trail 0.25
```

**Corroboration rule, inherited from the significance engine and
non-negotiable:** no feature reaches the top tier of any category without at
least one independent witness, meaning its own Wikipedia or Wikidata identity,
a formal designation, a Wikivoyage listing, or at least one Commons-assessed
photograph. A high composite with zero witnesses is a data artefact, not a
beautiful place.

### 3.2 Beach

```
score_beach = 0.25 * photo
            + 0.20 * water        (EEA WISE: excellent 1.0, good 0.7,
                                   sufficient 0.35, poor 0.0)
            + 0.20 * designation  (Natura 2000 / CDDA coastal, UNESCO, Ramsar)
            + 0.20 * fame
            + 0.10 * curation
            + 0.05 * form         (OSM natural=beach length, sand share,
                                   coastline sinuosity from Copernicus)
            - crowd_pen
```

Why photo leads: for a beach, "does it photograph well" is close to the thing
being asked, and Commons assessment is a human quality judgement rather than a
click count. Why water is 0.20 and not higher: it is a health measure, not a
beauty measure, but a beach with poor water is not a pick whatever it looks
like, so it earns a real weight and a hard floor (poor water caps the score at
tier 1 regardless).

### 3.3 Mountain

```
score_mountain = 0.30 * form         (topographic prominence + local relief
                                      within 5 km, both from Copernicus GLO-30,
                                      log-scaled)
               + 0.25 * photo
               + 0.20 * fame
               + 0.15 * designation  (national park, geopark, Natura 2000)
               + 0.10 * curation
               - crowd_pen
```

Form leads here because prominence is the one place in this whole document
where an objective physical measure genuinely correlates with the perceived
thing. It is also the only signal immune to the English-Wikipedia bias.

### 3.4 Trail

Extend `pipeline/trails/popularity.py` rather than replacing it. Its existing
components (network level, portal agreement, quality score, popularity with
the anchor discount and the family bonus) are sound. Add photo and
designation, and rebalance:

```
score_trail = 0.25 * quality      (validate.py quality_score / 100)
            + 0.25 * popularity   (existing: own fame, else discounted anchor
                                   fame, plus the family prominence bonus)
            + 0.20 * photo        (assessed Commons images sampled at points
                                   along the line, 500 m radius, deduped)
            + 0.15 * designation  (LQT label, network level iwn/nwn/rwn,
                                   Cultural Route membership)
            + 0.15 * form         (ascent per km, viewpoint density along the
                                   line from OSM, CORINE naturalness)
            * length_factor       (existing ramp below 5 km, keep it)
```

Keep the existing "missing checks score neutral, not zero" convention
(`CONFIG["portal"]["missing"] = 0.6`), and keep the anchor discount at 0.6.
Standing near the Matterhorn is still not being the Matterhorn.

### 3.5 Trip (destination)

Do not touch the 0.70 curated appeal weight. `rating_layer` v2 exists
precisely because v1 let fame move the score and Charleroi outranked Theth.
The recommendation is to keep fame out of the score entirely and to spend the
remaining 0.30 better:

```
score_trip = 0.70 * appeal            (curated_appeal.json, unchanged)
           + 0.10 * photo             (city-centre assessed image count,
                                       replaces nothing, this is new)
           + 0.08 * designation       (P1435 on the settlement or on its own
                                       POIs, replacing the 60 km proximity
                                       component that credits a whole region)
           + 0.07 * things_to_do      (existing saturating rate-weighted count)
           + 0.05 * curation          (Wikivoyage article status ladder)
```

Fame keeps its current job and only its current job: deciding `hidden_gem`.

## 4. Normalisation: Greece has 45, Moldova has 0

This is the part that decides whether the feature is honest or embarrassing.

### 4.1 Three-level percentile blend

The existing two-level blend (60 percent local, 40 percent global) is right in
shape but wrong in grain for geography-bound categories. A Baltic beach losing
to a Cycladic beach is not information, it is climate.

```
final = 0.40 * pct_peer + 0.35 * pct_country + 0.25 * pct_global
```

* **`pct_peer`**: percentile within the feature's **peer group**, which is
  (category x physical band), not country. Beaches split into Mediterranean,
  Atlantic, Baltic and North Sea, Black Sea. Mountains split into Alpine,
  Nordic, Mediterranean, Carpathian, Balkan, and lowland. This is what lets a
  Latvian beach be a genuinely good Baltic beach without pretending it is
  Santorini.
* **`pct_country`**: the local ranking, which is what a user browsing Estonia
  actually wants.
* **`pct_global`**: keeps the continental ordering meaningful so a top-tier
  badge means something across the app.

### 4.2 The small-n rule, which is where naive percentiles break

A percentile over a distribution of size 1 puts that one item at the top. A
country with a single mediocre beach would therefore rank it above real
beaches. Rule:

```
if n_country < 5:  drop pct_country, renormalise onto peer and global at
                   0.60 / 0.40
if n_peer    < 5:  drop pct_peer, renormalise onto country and global
```

### 4.3 The empty-cell rule, which is the honest part

**Moldova has no beaches. Moldova gets zero beach picks.** Never synthesise,
never substitute a reservoir to fill the grid, never widen the radius until
something qualifies.

The UI shows an explicit empty state naming the absence and offering the
nearest real alternative with its travel cost, which is a thing Carta is
uniquely good at answering. "No sea beaches in Moldova. The nearest coast is
the Ukrainian Black Sea, about 4 hours from Chisinau." That is more useful
than a padded list and it is the only version a user cannot catch out.

The same applies inside categories: if a country has three qualifying beaches,
it shows three, and the header says three.

## 5. How many picks a country gets

Two obvious rules are both wrong. Equal per country gives Moldova as many
beach picks as Greece. Pure global top-N gives Greece, Spain, Italy and
Croatia the entire list and leaves 30 countries invisible.

Use a **saturating, absolutely-floored allocation**:

```
n_qualified(c, cat) = count of features in country c, category cat whose
                      final score clears an ABSOLUTE floor (>= the 55th
                      global percentile of that category) AND which satisfy
                      the corroboration rule

picks(c, cat) = min( n_qualified,
                     CAP,
                     round(K * n_qualified ** ALPHA) )

ALPHA = 0.5   K = 1.6   CAP = 12
```

Worked, using the brief's own example:

| Country | Qualified beaches | Picks |
|---|---|---|
| Greece | 45 | 11 |
| Croatia | 20 | 7 |
| Estonia | 4 | 3 |
| Moldova | 0 | 0 |

The square root preserves the ordering (Greece beats Croatia beats Estonia)
while stopping Greece from consuming the shelf. The **absolute** floor is the
load-bearing piece: it is a global percentile, not a national one, so a
country cannot inflate its allocation by having many weak features. And
`picks <= n_qualified` means the list is never padded.

**Geographic spacer.** Within a country, no two picks within a minimum
separation (25 km beaches, 40 km mountains, 60 km trails) unless the second
clears a materially higher score. Without this, Greece's 11 beach picks are
all in Halkidiki because that is where the Commons photographers went.

**Review queue, not auto-publish.** Following the trails lab convention
(`trip_reviews`, approve is the only path to approved), the allocation
produces a *shortlist for a human*, and the human's approval is what ships.
The formula's job is to turn 25,000 candidates into 11 defensible ones, not to
have the final word.

## 6. Keeping it honest: what the UI must say the ranking IS

The single most important recommendation in this document: **do not call it
"the most beautiful".** Carta cannot measure beauty and any claim that it can
is falsifiable by the first user who disagrees, which will be the first user.

### 6.1 The label

Use a label that names the evidence, not the aesthetic verdict. Candidates, in
order of preference:

1. "Most celebrated"
2. "Best documented"
3. "Highest signal"

Never "most beautiful", "prettiest", "top rated" or "best". The first two are
unfalsifiable claims Carta has not earned; "rated" implies user ratings that do
not exist.

### 6.2 The method line, shown wherever the ranking appears

> Ranked by open evidence, not opinion: how many Wikipedia languages describe
> it, how many people look it up, how many award-quality photographs of it
> exist on Wikimedia Commons, and what heritage or nature protection it
> carries. Nothing here is paid placement.

### 6.3 The receipt, which is the strongest honesty device available

Every pick shows the numbers that made it rank, so the user can check the
claim rather than trust it:

> 14 Wikipedia languages, 320 views a day, 22 quality-assessed photographs,
> UNESCO listed since 1988.

A ranking that shows its inputs stops being an opinion and starts being a
citation. This also makes the failure modes visible: if a place is ranked
high on 2 languages and 1 photo, the user can see that and discount it, which
is exactly what should happen.

### 6.4 Naming the bias, in the method page and the footer

> Open signals favour places that are famous, heavily photographed and well
> covered by English Wikipedia. We push against that by ranking each place
> within its own country and its own coastal or mountain region as well as
> across Europe, by weighting what human travel-guide editors chose to list,
> and by never inventing a score for a place with no evidence behind it. We
> do not fully eliminate it. A beautiful place nobody has written about will
> rank below a famous one.

The existing `docs/2.SIGNIFICANCE.md` "Honest limits" section is already
written in this voice. This is the user-facing version of it.

### 6.5 Things the UI must never do

* Never imply a Blue Flag on a specific beach (section 2.4).
* Never pad a country's list to a round number.
* Never show a rank without the count it is out of ("3rd of 4 in Estonia" is
  honest, "3rd best beach in Estonia" is not).
* Never present the crowding dampener as a quality judgement about the place.

## 7. Pitfalls

1. **Misattribution, already learned the hard way.** A feature whose wiki link
   resolves to its town or station article inherits that article's sitelinks
   and pageviews. The significance engine found 6,568 such POIs and produced a
   Brussels list led by a knockoff statue. Any new signal must pass through
   the same entity-type guard before it is trusted.
2. **`nearcoord` counts proximity, not depiction.** The verified Acropolis
   query returned 542 hits including
   `File:20081206 Alexandros Grigoropoulos december 2008 riots Sina Street
   Athens Greece.jpg`. Tighten the radius hard for point features (250 to
   500 m), and prefer combining with `depicts` (P180) where the feature has a
   QID. For a whole town, use a low weight and accept that the count measures
   the town.
3. **Freedom of panorama distorts the photo signal by country.** France,
   Italy, Belgium and Greece among others have no freedom of panorama, so
   photographs of modern buildings and public art there cannot be freely
   licensed. The Commons photo signal is therefore structurally depressed for
   modern architecture in exactly the countries where the catalogue is
   densest. The repo already flags 8,542 such images into a review queue; the
   ranking needs the same awareness, most simply by not letting `photo` be the
   top weight for any category dominated by modern works.
4. **Percentiles over tiny distributions are meaningless.** n=1 is
   simultaneously the minimum and the maximum. Section 4.2 exists for this.
5. **The square-root allocation still clusters without a spacer.** Section 5.
6. **Pageview spikes.** Wildfires, films and football move a village's
   pageviews by an order of magnitude for a month. Prefer a median of monthly
   means over a mean of daily values.
7. **Big-city Wikivoyage articles delegate to district sub-articles**, which
   the harvester does not follow, so the curation signal is weakest exactly
   where the catalogue is densest. Already documented; do not let a
   city-category weight lean on it.
8. **Share-alike creep.** Wikivoyage is CC BY-SA and the UNESCO DataHub copy
   is CC BY-SA. Keeping to facts and counts (as the repo already does) keeps
   the derived score clean. Redistributing the derived database itself is a
   different question, and it is the same unresolved question as ledger
   follow-up item 2 about the OSM-derived slice of `app_data.json`.
9. **Wikimedia will block an undescriptive User-Agent** with a 403 and no
   warning. Every new harvester needs the contact-carrying UA the repo already
   uses.
10. **WCQS needs OAuth**, so it cannot sit in an unattended pipeline. Use the
    Action API route.
11. **A popularity ranking wearing a beauty label is the real failure mode.**
    Every weight above that is not `fame` exists to prevent it. If a
    validation run shows the composite correlating above about 0.85 with raw
    pageviews, the composite has collapsed into fame and the weights are
    wrong.
12. **Do not let the absolute floor drift into a percentile floor.** The
    moment `n_qualified` is defined nationally, every country gets picks and
    the allocation stops meaning anything.

## 8. Proposed licence ledger rows

Per the ledger's own rule, a new source must add a row before it ships. These
belong in section 5, Destination content layers.

| Source | What we take | License | Attribution required | Share-alike | Where attributed today |
|---|---|---|---|---|---|
| Wikimedia Commons assessed-image counts (new ranking harvester, CirrusSearch `nearcoord` + `haswbstatement:P6731`) | Per-feature counts of Featured picture / Quality image / Valued image files near a coordinate. Counts only, no files fetched | Counts are facts and carry no obligation; any file actually displayed is per-file CC0 / CC BY / CC BY-SA / public domain | Only for displayed files, per file | Some files | Home footer credits Commons; per-file credit for displayed thumbnails is still open item 1 |
| Wikidata designation memberships (P463, P166) for beautiful-village federations, geoparks, cultural routes | Membership and award facts plus P625 coordinates | CC0 | No | No | None needed |
| EEA Natura 2000 | Protected-site polygons and site codes near destinations and features | CC BY 4.0 (confirm on the datahub item page before shipping) | Yes | No | To add to `attribution.js` |
| EEA CDDA nationally designated areas | National protected-area designations, non-EU coverage | CC BY 4.0 (confirm) | Yes | No | To add to `attribution.js` |
| Copernicus CORINE Land Cover | Land-cover diversity and naturalness sampled per feature | Copernicus policy, Regulation (EU) No 1159/2013, free including commercial with source acknowledgement (confirm) | Yes | No | To add to `attribution.js` alongside the existing Copernicus GLO-30 credit |

And an explicit **do-not-use** note worth recording in the ledger's risk list,
because it is the kind of thing a future harvester will otherwise rediscover
the hard way:

> Protected Planet / WDPA (UNEP-WCMC) is rejected: commercial use of the data
> or of any derived work requires prior written permission, and redistribution
> by web download, web service, interactive map or KML is barred.
> https://www.protectedplanet.net/en/legal . Use Natura 2000, CDDA and
> Wikidata instead.

## 9. Recommended build order

1. **Commons assessed-image harvester.** Highest new information per unit of
   work, no key, no gate, verified working. One request per feature.
2. **Wikidata designation sweep**, replacing `beauty_layer`'s 60 km UNESCO
   proximity with on-feature P1435, and `ICONIC_CURATED` with P463
   memberships. Same endpoint the repo already calls.
3. **Three-level normaliser plus the allocation rule**, as a scoring module
   with no writes, reporting per-country pick counts so the distribution can
   be eyeballed before anything ships.
4. **Category formulas**, beach first (it is the one with a real per-feature
   quality signal already harvested in WISE).
5. **The validation gate**, mirroring `apply_rating_layer.validate()`: famous
   anchors must appear, no uncorroborated feature reaches the top tier, no
   country receives more picks than it has qualified features, and the
   composite must not correlate above about 0.85 with raw pageviews.
6. **Copernicus form measures**, last, because they are the most work and the
   ranking is defensible without them.
