# Sources research: trips (best day trips and city days per country)

Compiled 2026-08-17. Scope: how to pick and rank the BEST composed one day
trips (city days and daytrips) per country, at roughly 700 items across 43
countries, using only sources whose terms allow harvesting.

Conventions follow `docs/tos/data_licenses.md`: every source proposed for use
must get a row there before its harvester ships. Anything below that could not
be confirmed against current terms text is marked UNVERIFIED with the exact
open question.

---

## 1. What already exists in this repo

Read before proposing anything new.

| Piece | Path | What it does |
|---|---|---|
| City day composer | `pipeline/trails/compose_citytrips.py` | Demand ranked city pick, POI pool with civic and commercial filters, Wikimedia licence resolution per stop image, plan-day walkable cluster port, shared daytrip time solver, stores `trips` rows with `category='citytrip'` |
| Daytrip composer | `pipeline/trails/compose_daytrips.py` | Shared ranking, dedupe, dwell times, Valhalla legs |
| Demand harvester | `pipeline/trails/market_demand.py` | Eurostat `urb_ctour` CR2001V per city, `tour_occ_ninat` per country, SSB table 12898 for NO, Statistik Austria `OGD_touextsai_Tour_UA_1` for AT (Wien only) |
| Validation | `pipeline/trails/validate.py` `CITYTRIP_CONFIG` | Stops 35, walking 25, day length 20, popularity 20; `min_stops` 4, `city_radius_km` 10, `walk_budget_km` 12, day 300 to 540 min, popularity floor score 6.0 or fame 400 |
| POI significance | `pipeline/score_significance.py` | Composite rate from pageviews 0.30, sitelinks 0.30, heritage 0.15, Wikivoyage listing 0.15, prior 0.10, blended 0.6 local and 0.4 catalogue wide |
| Trail curation rank | `pipeline/trails/popularity.py` | Precedent for a weighted 0 to 100 curation rank with neutral scores for missing signals |
| Guide blurbs | `pipeline/harvest_wikivoyage.py` + `pipeline/apply_wikivoyage.py` | `dest.guide` intro text per destination |
| Wikivoyage listings | `pipeline/harvest_wikivoyage_listings.py` | See and Do listing names, coords, QIDs, order, plus article status class |
| Export | `pipeline/trails/export_wire.py` | Publishes approved trips to `continent-app/public/trails/{CC}.json` plus per trip detail under `trails/trip/{id}.json` |

State of the published wire, measured 2026-08-17 from
`continent-app/public/trails/*.json`:

- 760 published trips: 545 hikes, 215 city days across 40 countries.
- Basis split from the stored attribution string: 114 city days picked by
  official tourism statistics, 101 by the `rating_v2` fallback. Nearly half
  the shelf was chosen without any demand evidence.
- Walking distance per day: median 4.9 km, p90 12.3 km, max 15.0 km. 66 of
  215 days walk more than 8 km.
- Stops: median 8, minimum 4, 11 days with fewer than 5 stops. Day length 311
  to 480 minutes.
- Worked failure case, `continent-app/public/trails/trip/310674.json`:
  "Madriu-Perafita-Claror Valley in a day" (AD). The anchor is a UNESCO valley,
  not a city; the first leg is a 57 minute walk; the stop list includes
  Estadi Nacional (a football stadium) and Caldea (a spa). Same pattern in
  "Grossglockner High Alpine Road in a day" (AT), "Theth & Albanian Alps in a
  day" (AL), "Sutjeska in a day" (BA), "Valbona Valley in a day" (AL).

So the gap is not composition, it is selection and ranking. The composer
produces a valid day for whatever anchor it is handed. Nothing currently
answers "is this one of the best days in this country".

---

## 2. What makes a composed city day a top pick

Five independent claims, each of which has to be evidenced separately. A day
is only a top pick when all five hold; the score then ranks within that set.

1. **The place is a place people actually go to.** Official visitor nights,
   not internal fame. Already the composer's intent, but it silently degrades
   to `rating_v2` for 101 of 215 days.
2. **The place is a city.** A settlement gate, not a vibe check. Andorra's
   Madriu valley and the Grossglockner road pass every current check.
3. **The day contains the city's canon.** If three independent sources agree
   the city's headline sights are A, B and C, a day that skips all three is a
   day in that city, not the day. This is a recall measure, and it is the
   single most useful thing missing today.
4. **The day is physically and temporally honest.** Routed legs rather than
   straight line estimates, real opening hours rather than assumed ones,
   walking within a budget measured on streets, no 57 minute opening leg.
5. **The day is complete and reusable.** Every stop carries coordinates, a
   description, an open licence image with resolved per file credit, and a
   kind that is a sight rather than a stadium, a spa or a station.

"Best" is a per country claim, not a continental one. A global top 700 ranked
on raw demand would be roughly 60 percent France, Spain and Italy. The honest
unit is a per country shelf with a published basis line per pick.

---

## 3. How to rank 700 of them honestly

### 3.1 Structure

    trip_rank = hard gates (pass or reject)
              -> CityScore   (does this city deserve a day at all)
              -> DayScore    (is this the best day we can compose there)
              -> penalties   (what the day is hiding)
              -> per country normalisation, then a 0.6 local / 0.4 continental
                 blend, matching score_significance.py's convention

Hard gates first, because a weighted mean lets a strong signal buy off a
disqualifying one. Gates: settlement class present, at least 5 stops, every
stop inside the city radius, every stop image licence resolved and open, day
length inside 300 to 540 minutes, straight line walk under the plan-day
budget, and at least one stop corroborated by two independent sources.

### 3.2 CityScore, the "does this city deserve a day" half

| Component | Weight | Source | Note |
|---|---|---|---|
| Demand percentile | 0.40 | Eurostat `urb_ctour` CR2001V, Eurostat `tour_ce_omn12` city and LAU platform nights, national statistics offices | log nights, percentile inside the country |
| Guide completeness | 0.20 | Wikivoyage article status (star, guide, usable, outline) | Star and Guide are peer reviewed; 27 star cities and 720 guide cities exist worldwide |
| Canon depth | 0.20 | Count of stops in the city with at least two independent corroborations | A city with one famous church is not a day |
| Prestige designation | 0.10 | Wikidata: UNESCO World Heritage (P1435 = Q9259), European Capital of Culture, UNESCO Creative City, European Heritage Label | Binary bonuses, capped |
| Attention | 0.10 | Wikipedia pageviews, all language editions summed | Deliberately small; attention is not merit |

Demand and attention must both be log scaled and percentile ranked inside the
country before blending, otherwise Paris crushes the ranking and every French
entry after Paris looks worthless.

### 3.3 DayScore, the "is this the best day here" half

| Component | Weight | How to compute |
|---|---|---|
| Canon recall | 0.30 | Build a canon set per city: top 8 by the blend of Wikivoyage See order weight, Wikidata sitelinks, heritage designation and P1174 visitor counts. Score = weighted share of the canon set present in the day. |
| Stop significance | 0.20 | Mean of the top 5 stops' `score_significance` blend, plus a hard requirement that the day's best stop is above the country's 80th percentile |
| Schedule realism | 0.20 | Share of stops with real OSM `opening_hours` rather than the assumed `KIND_HOURS` table, and a closure day flag (the classic Monday museum problem) |
| Walk economy | 0.15 | Routed km per stop and the routed-to-straight-line ratio; penalise days over 8 km routed and any leg over 25 minutes |
| Content completeness | 0.10 | Description length and provenance, image licence family, per file author resolved |
| Kind diversity | 0.05 | Shannon diversity over stop kinds; six churches in a row scores low |

### 3.4 Penalties, subtracted after the blend

- Estimated legs (Valhalla tiles missing) as a share of legs.
- Assumed opening hours share (today this is 100 percent, so it is currently a
  constant and becomes discriminating only once OSM hours land).
- Crowding tier extreme, from the existing `dest.crowding` Eurostat NUTS3 layer.
- Climate discomfort in the month the day is surfaced, from `dest.climate`.
- Civic or commercial noise that slipped `CIVIC_RE` and `COMMERCIAL_RE`.
- Anchor mismatch: anchor dest name not equal to a settlement in GeoNames or
  Wikidata (this alone would have caught all five bad AD, AT, AL and BA days).

### 3.5 Making it honest rather than merely numerical

1. **Publish the basis, per pick.** `market_demand.py` already prints the basis
   and `compose_citytrips.py` already stores it in `raw_tags.demand.basis`. Do
   the same for the rank: store every component with its source and year, and
   surface a one line "why this is a top pick" in the app.
2. **Never let one signal decide.** Require two independent source families
   per claim. Wikipedia pageviews and Wikidata sitelinks are not independent
   (both derive from Wikimedia editorial attention); Eurostat nights and
   Wikivoyage status are.
3. **Per country quotas, not a global leaderboard.** 700 items over 43
   countries is roughly 16 per country. Allocate a floor of 5 per country plus
   a share proportional to the log of national tourism nights, so Malta gets
   its 5 and France does not get 90.
4. **Hold out a gold set.** Hand grade 60 days across 12 countries in the
   existing review UI, then report precision at 5 per country and the Spearman
   correlation between the composite and the human ranking. `validate.py`
   already writes `validation_runs` rows, so the gold set can live there as a
   check name.
5. **Publish the misses.** `raw_tags.skipped` and `dropped_no_licence` already
   record what was left out. A top pick that skipped the cathedral because its
   photo is NC licensed should say so rather than pretend the cathedral is not
   in town.
6. **Rank stability.** Re run the rank on a fixed cadence and record movement.
   A rank that reshuffles every month is measuring noise, not quality.

---

## 4. Source assessment

### 4.1 Use, confirmed

**Wikivoyage (en, plus other language editions)**
- URL: https://en.wikivoyage.org/wiki/Wikivoyage:Copyleft
- Gives: See and Do listings with names, coordinates, QIDs and editorial order
  (already harvested), article status class per city and district, itinerary
  articles, and the "Go next" sections that name a city's day trips.
- Measured 2026-08-17 via the MediaWiki API `prop=categoryinfo`: Star cities
  27, Guide cities 720, Usable cities 8,420, Star districts 28, Guide districts
  208, Itineraries 580 of which Guide itineraries 67 and Star itineraries 5.
- Licence: CC BY-SA 4.0. Note the repo currently records CC BY-SA 3.0 in
  `pipeline/apply_wikivoyage.py` `DATA_SOURCE`; the ledger already says 4.0.
  Fix the harvester constant.
- Access: MediaWiki API (`action=query`, `list=categorymembers`,
  `prop=revisions|categoryinfo`) plus bulk dumps at dumps.wikimedia.org.
- Per feature coordinates: yes, on See and Do listings.
- Harvesting allowed: yes, with a descriptive User-Agent.
- Share-alike caution: names, coordinates, order and status class are facts and
  carry no share-alike obligation. Any sentence of Wikivoyage prose in a
  description does, and `describe.py` already guards against that with the six
  word shingle drop.

**Wikidata (Query Service and entity API)**
- URL: https://query.wikidata.org/
- Gives: UNESCO World Heritage designation (P1435 = Q9259), visitor counts
  (P1174), sitelink counts, coordinates, instance-of for the settlement gate,
  award received for European Capital of Culture and Creative Cities.
- Measured 2026-08-17 by SPARQL: 936 items with P1435 = Q9259 and coordinates
  in countries on the European continent; 19,557 items worldwide with P1174
  and coordinates.
- Licence: CC0 1.0 (https://www.wikidata.org/wiki/Wikidata:Licensing).
- Access: SPARQL endpoint plus the REST entity API. Already in the ledger.
- Per feature coordinates: yes. Harvesting allowed: yes.
- This is the correct carrier for UNESCO status, since UNESCO's own syndication
  is closed (see rejects).

**Wikimedia pageviews (Analytics API)**
- URL: https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/access-policy.html
- Gives: per article daily views, all language editions.
- Licence: CC0 1.0 for the data.
- Access: REST API (User-Agent required) and bulk dumps at
  https://dumps.wikimedia.org/other/pageviews/.
- Per feature coordinates: no (join through Wikidata QIDs).
- Harvesting allowed: yes. Already in the ledger and in `harvest_pageviews.py`.
- Upgrade to make: sum across language editions rather than English only, to
  remove the anglophone bias that inflates Bath over Bamberg.

**Eurostat urban audit `urb_ctour` (already in use)**
- URL: https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/urb_ctour
- Licence: CC BY 4.0, "Source: Eurostat" attribution
  (https://ec.europa.eu/eurostat/help/copyright-notice).
- Access: dissemination API, JSON-stat 2.0. Per feature coordinates: no, city
  codes only. Harvesting allowed: yes.
- Known weakness the repo has already probed: NO stops at 2011 and AT at 2014.
  Add to that what the published wire shows: Belgium's largest draws (Brussels,
  Bruges, Antwerp, Ghent) fell to the rating fallback while Leuven, Mons and
  Namur were picked on statistics, which is a coverage artefact, not a
  statement about Belgian tourism.

**Eurostat collaborative economy platform nights, `tour_ce_omn12` (new, recommended)**
- URL: https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Short-stay_accommodation_offered_via_online_collaborative_economy_platforms
- Gives: guest nights and stays from Airbnb, Booking and Expedia, supplied to
  Eurostat under a 2020 Commission agreement, at NUTS2 and at city and LAU
  level, 2019 to 2025. Tripadvisor left the arrangement at the end of 2024.
  69 EU and EFTA cities passed one million platform guest nights in 2024;
  the leaders are Paris 23.5M, Rome 15.7M, Barcelona 12.5M, Madrid 11.8M,
  Lisbon 11.3M.
- Licence: CC BY 4.0, same Eurostat copyright notice.
- Access: same dissemination API as `urb_ctour`, so `market_demand.py` needs
  only a second query and a source constant.
- Per feature coordinates: no, LAU and city codes; join through the existing
  `city_key` folding.
- Harvesting allowed: yes.
- Why it matters here: it is fresh to 2025 and it covers cities `urb_ctour`
  misses, which directly attacks the 101 rating fallback picks. Caveat: it
  measures one booking channel, so it over-weights cities where platform
  letting is large relative to hotels. Use it to fill coverage gaps and as a
  cross-check, not to replace `urb_ctour`.

**OpenStreetMap opening hours, via the Geofabrik extracts already cached**
- URL: https://wiki.openstreetmap.org/wiki/Key:opening_hours
- Measured 2026-08-17 via taginfo: `opening_hours` is set on 4,748,323 objects
  (3,698,659 nodes, 969,926 ways, 79,738 relations) worldwide.
- Licence: ODbL 1.0. Access: the per country `.osm.pbf` extracts already under
  `data/raw/geofabrik/` for the trails ingest, parsed with pyosmium exactly the
  way `pipeline/trails/ingest_osm_routes.py` does. Do not bulk query Overpass.
- Per feature coordinates: yes. Harvesting allowed: yes.
- This is the highest value single addition. Every published day currently
  carries `raw_tags.assumptions.hours_assumed = true`. Real hours turn the
  Monday closure problem from an unknown into a scored, disclosed fact.

**National tourism office open data, where it exists**

- **France, DATAtourisme**: https://www.datatourisme.fr/ . More than 530,000
  geolocated tourist points of interest, national ontology, Licence Ouverte 2.0
  (commercial reuse allowed with source and last update date). Access via a
  free API key, via configurable feeds, or without registration through
  data.gouv.fr. Formats JSON, XML, CSV, RDF, Turtle. Coordinates WGS84 per POI.
  Harvestable: yes.
- **Germany, German Tourism Knowledge Graph (DZT/GNTB)**:
  https://www.germany.travel/en/trade/open-data.html . Aggregates the 16
  federal state tourism databases, and by design only ingests records carrying
  CC0, CC BY or CC BY-SA. SPARQL API with a free authentication key from GNTB.
  Coordinates per record. Harvestable: yes, but the licence is per record, so
  each harvested item must keep its own licence string, the same discipline
  `compose_citytrips.py` already applies to images.
- **Italy, South Tyrol Open Data Hub**: https://opendatahub.com/ . Tourism
  domain datasets (`ODHActivityPoi`, `Poi`, `Activity`, `Municipality`) with
  GPS coordinates, CC0 for the open subset. Regional only (Bolzano province),
  so it is a depth source for one Italian area rather than national coverage.
  Harvestable: yes.
- **Belgium, Toerisme Vlaanderen open data portal**:
  https://data.toerismevlaanderen.be/ . Attractions, accommodation and
  geographic datasets, JSON, XML, CSV, plus a linked data endpoint. Default
  licence is the Flemish government "Modellicentie Gratis Hergebruik" (free
  reuse model licence), a small number of datasets are restricted. No
  registration for the open sets. Harvestable: yes for the model licence sets.
  UNVERIFIED: I could not load the portal's licence page from here
  (connection refused), so the exact model licence text and its attribution
  wording still need reading before a ledger row is written.
- Honest summary for the other 39 countries: there is no comparable national
  open itinerary dataset. Most national boards publish HTML pages plus a media
  library whose photo terms are limited to promoting that destination. Do not
  plan the ranking around national boards; plan it around the pan European
  sources and treat national open data as a bonus corroboration where it is
  present.

**France, museum attendance (worked example of a national attendance source)**
- URL: https://www.data.gouv.fr/datasets/frequentation-des-musees-de-france-1
- Gives: total, paid and free annual attendance per museum, 2001 to 2022, with
  the MUSEOFILE identifier from 2019 on, which joins to "Liste et localisation
  des musées de France" for coordinates.
- Licence: Licence Ouverte / Open Licence. Access: CSV and XLSX download plus
  the data.culture.gouv.fr Opendatasoft API. Harvestable: yes.
- Why it is worth one country's effort: it is real attendance, the strongest
  available answer to "is this stop actually a top sight", and it calibrates
  the Wikidata P1174 layer, which is sparse and often carries stale years.
  Equivalent registers exist in several other countries and are worth adding
  one at a time rather than as a sweep.

**European Commission prestige lists (Capitals of Culture, EDEN)**
- URLs: https://culture.ec.europa.eu/policies/culture-in-cities-and-regions/designated-capitals-of-culture
  and https://single-market-economy.ec.europa.eu/ (EDEN, 176 destinations
  awarded across 27 countries since 2007).
- Licence: CC BY 4.0 under the Commission reuse policy implementing Commission
  Decision 2011/833/EU (https://commission.europa.eu/legal-notice_en), with
  logos and third party content excluded.
- Access: HTML only, no dataset download. Both lists are small enough to
  transcribe once, and both are also modelled in Wikidata (CC0) with
  coordinates, which is the cleaner route.
- Per feature coordinates: no on the Commission pages, yes through Wikidata.
- Use: a capped prestige bonus in CityScore, and a useful tiebreak for the
  small country shelves where demand data is thin. Capital of Culture is a
  particularly good signal because designation years are known in advance, so
  it can drive a "worth going this year" surface.

### 4.2 Maybe, needs a decision or a check

**Council of Europe Cultural Routes**
- URL: https://www.coe.int/en/web/cultural-routes/ . 49 certified routes as of
  May 2025.
- UNVERIFIED: no reuse or licence statement was found for the certified list.
  Council of Europe web content is generally under its own copyright notice.
- Route membership per city is also modelled in Wikidata for many routes, which
  is the safe path. Do not harvest coe.int until the terms are read.

**Panoramax (open street level imagery)**
- URL: https://www.panoramax.xyz/ . Images under CC BY-SA 4.0, federated
  instances, open API, more than 85 million photos.
- Coverage is heavily France weighted with a handful of other instances, so as
  a photo density popularity proxy across 43 countries it is not fit for
  purpose today. Harvestable: yes, but rejected on fitness rather than terms.

**OpenTripMap**
- Already in the ledger and in `harvest_activities.py`. Free tier asks for a
  credit link, wording flagged as "verify" in the ledger. Keep it as a prior
  in `score_significance.py`, do not promote it to a ranking authority: its
  rate is generous and its provenance is a mix of OSM and Wikidata that the
  repo already models directly.

### 4.3 Reject

**UNESCO World Heritage Centre syndication (whc.unesco.org)**
- URL: https://whc.unesco.org/en/syndication/ and the conditions of use FAQ at
  https://whc.unesco.org/en/faq/125/ .
- The terms require prior written authorisation for any republication of
  UNESCO/WHC data. Personal, non commercial syndication can be requested free;
  any other use requires a specific XML subscription and licence, which implies
  a fee. No modification of syndicated content is allowed, and a specific
  copyright notice plus backlink is mandatory.
- Verdict: reject direct harvesting. Carta is commercially monetised through
  affiliate links, so the free personal use path does not apply. Take World
  Heritage status from Wikidata (P1435 = Q9259, CC0), which the repo already
  harvests through `harvest_poi_wikidata.py`, and which returned 936 European
  sites with coordinates on a live check.

**Google Maps Platform (Places, Popular Times, ratings)**
- URL: https://cloud.google.com/maps-platform/terms and
  https://developers.google.com/maps/documentation/places/web-service/policies
- The terms prohibit scraping or extracting Maps content for use outside the
  services, prohibit caching beyond narrow exceptions (place IDs indefinitely,
  coordinates up to 30 days), and require Places results shown on a map to be
  shown on a Google map with Google attribution. Carta renders MapLibre with
  CARTO tiles.
- Verdict: reject. This is also the whole point of the "Google free" framing:
  every popularity signal in this document is reproducible without it.

**Tripadvisor, GetYourGuide, Viator and similar commercial rankings**
- Verdict: reject, consistent with the stance already written into
  `pipeline/trails/market_demand.py` and the AllTrails stance in the trails
  vertical. Their content APIs carry display and ranking restrictions that are
  incompatible with folding their scores into our own ranking.

**AllTrails and Komoot**
- AllTrails terms prohibit unauthorised scraping and the site is behind bot
  protection. Komoot's terms of service prohibit exporting, distributing or
  publishing tours by any means other than the provided export function
  (https://www.komoot.com/terms-of-service).
- Verdict: reject. Already the repo's stance.

**Flickr API as a photo density popularity proxy**
- URL: https://www.flickr.com/help/terms/api and
  https://www.flickrhelp.com/hc/en-us/articles/4404057965332-Flickr-Commercial-Use-Policy
- The API is free for non commercial use; commercial use requires a reviewed
  and approved commercial key. Carta carries affiliate revenue.
- Verdict: reject unless a commercial key is granted. The classic academic
  "geotagged photo density equals tourist attention" trick is not available to
  us on these terms.

**National tourism board photo libraries**
- Verdict: reject as a class for image harvesting. Typical terms license images
  only for editorial use promoting travel to that destination, which is not a
  licence we can pass on to app users.
- UNVERIFIED as a blanket statement: this is the common pattern rather than a
  read of all 43 boards. Any specific board would need its own reading, and the
  existing Wikimedia Commons path with per file licence resolution is already
  better because it produces a creditable per image licence.

---

## 5. Pitfalls

1. **The rating fallback picks non cities.** 101 of 215 published days used it,
   and it produced valley, mountain road and national park "city days". Gate
   the fallback on a settlement test using data already in the repo:
   `dest.geonames` feature class, or Wikidata instance-of city or town.
2. **Eurostat city coverage is uneven and stale in places.** Belgium's biggest
   draws fell through while smaller cities were picked on statistics. Adding
   `tour_ce_omn12` (2019 to 2025, city and LAU level) is the cheapest fix.
3. **Greater city versus city codes double count.** `market_demand.clean_city`
   already strips the qualifier and `demand_ranking` prefers the newest year
   with larger nights as a tiebreak; that tiebreak silently prefers the greater
   city figure, which inflates cities whose urban audit has a metro row.
4. **English pageviews are not European attention.** Sum all language editions
   before percentile ranking.
5. **Pageviews and sitelinks are the same source family.** Treating them as two
   corroborations double counts Wikimedia editorial attention. Independence
   means Eurostat nights, official attendance figures, Wikivoyage editor
   curation and Wikimedia attention are four families, not one.
6. **Sitelinks measure historical importance, not day quality.** A Roman ruin
   with 90 sitelinks can be a locked field.
7. **Assumed opening hours are a silent lie.** Every published day carries
   `hours_assumed = true`. Until OSM hours land, the day length figure is a
   plan, not a schedule, and Monday closures are invisible.
8. **The walking budget is charged on straight lines.** 66 of 215 days already
   exceed 8 km of routed walking, and the maximum is 15 km. Score the routed
   distance, not only the straight line sum the cluster was built against.
9. **Image licence filtering biases the day.** A stop dropped because its only
   photo is NC licensed disappears without trace from the itinerary while
   remaining the city's best sight. `dropped_no_licence` is already recorded;
   surface it in the rank rather than only in `raw_tags`.
10. **P1174 visitor counts are sparse and stale.** 19,557 items worldwide carry
    one with coordinates. Use as corroboration, never as the sole signal, and
    always store the year.
11. **Share-alike creep.** Wikivoyage facts are safe; Wikivoyage prose brings
    CC BY-SA obligations onto the generated description. Keep `describe.py`'s
    shingle guard in force for city days too.
12. **Popularity feedback loops.** Ranking by attention and then surfacing the
    winners increases their attention. The demand and attendance components are
    the antidote because they are measured outside our app.
13. **A global leaderboard is not honest at 43 countries.** Use per country
    quotas with a floor, and say in the UI that the ranking is per country.
14. **Every new source needs a ledger row first.** `docs/tos/data_licenses.md`
    rule, and the trails vertical has honoured it so far.
15. **The Wikivoyage licence constant in the repo is wrong.**
    `pipeline/apply_wikivoyage.py` says CC BY-SA 3.0; the current licence is
    CC BY-SA 4.0, which is what the ledger already records.

---

## 6. Ledger rows to add to docs/tos/data_licenses.md

Proposed rows, following section 7's conventions (trails and daytrips content
lab), one per new source, to be written before the harvester ships:

| Source | What we take | License | Attribution required | Share-alike | Where attributed |
|---|---|---|---|---|---|
| Eurostat `tour_ce_omn12` short stay platform nights | City and LAU guest nights 2019 to 2025 as the demand basis where `urb_ctour` is thin | CC BY 4.0 (Eurostat copyright notice) | Yes, source Eurostat plus dataset and year | No | Stored per market_demand row, printed with every ranking |
| OpenStreetMap `opening_hours` via Geofabrik extracts | Real opening hours per stop, from extracts already cached for the trails ingest | ODbL 1.0 | Yes, OpenStreetMap contributors | Yes, derived database obligations stay in the lab | Existing OSM credit in the home footer |
| DATAtourisme (France) | Official POI records with coordinates, as a corroboration source for French city days | Licence Ouverte 2.0 (Etalab) | Yes, source plus date of last update | No | Trails and daytrips credits block |
| German Tourism Knowledge Graph (GNTB/DZT) | Official POI records for German city days, per record licence preserved | Per record: CC0, CC BY or CC BY-SA | Per record | Per record | Per item credit, same discipline as stop images |
| Open Data Hub South Tyrol | POI and activity records for the Bolzano area | CC0 1.0 for the open subset | No | No | None needed |
| Toerisme Vlaanderen open data | Attraction records for Flemish city days | Modellicentie Gratis Hergebruik (Flemish government), UNVERIFIED wording | Verify | Verify | Pending the licence read |
| Ministere de la Culture, Frequentation des Musees de France | Annual per museum attendance to calibrate the significance layer | Licence Ouverte | Yes | No | Ranking basis line |
| European Commission prestige lists (Capitals of Culture, EDEN) | City level designation flags | CC BY 4.0 under Decision 2011/833/EU | Yes | No | Ranking basis line, or taken through Wikidata (CC0) instead |

---

## 7. Recommended build order

1. **Fix selection before ranking.** Add a settlement gate to
   `compose_citytrips.pick_cities` (GeoNames feature class or Wikidata
   instance-of), and refuse to compose a "city day" for a valley, a mountain
   road or a national park. Recompose the 101 fallback days.
2. **Widen the demand base.** Add `tour_ce_omn12` to `market_demand.py` as a
   second Eurostat source with its own source constant and licence string. Keep
   `urb_ctour` primary and record which one picked each city, exactly as the
   current basis string does.
3. **Build the canon set per city** from signals already harvested: Wikivoyage
   See order weight, Wikidata sitelinks, heritage designation, P1174 where it
   exists. Store it, then score every composed day on recall against it. This
   is the component that turns "a day" into "the day".
4. **Add real opening hours** from the Geofabrik extracts with pyosmium, fill
   them into the composer's hours table, and flip
   `raw_tags.assumptions.hours_assumed` to a measured share.
5. **Write `pipeline/trails/rank_trips.py`** following `popularity.py`'s shape:
   a CONFIG dict of weights, neutral scores for missing signals, one
   `validation_runs` row per ranked trip with `check_name='trip_rank'`, and a
   per country CSV under `data/reports/trip_rank/`.
6. **Export the rank and its basis** through `export_wire.py` so the app can
   shelve "the best day in each country" with a one line, sourced justification.
7. **Grade a gold set** of 60 days in the review UI and report precision at 5
   per country before any "top pick" badge ships.
