# Source research: mountains

Category: individual mountains worth visiting. Summits, massifs, scenic
passes, cable car viewpoints. Scope is Carta's 43 countries.

Compiled 2026-08-17. Every licence claim below carries the URL it was read
from. Claims that could not be confirmed against a primary page are marked
UNVERIFIED in place, and the same flag rides in the structured summary.

Conventions follow `docs/tos/data_licenses.md`: a source only ships once it
has a row there, and "attribution required" records what the licence demands,
not what the app currently renders.

---

## 1. What was actually measured

Numbers below are live counts pulled during this research, not estimates.
They matter because they decide which fields can be looked up and which have
to be computed.

### Wikidata, Switzerland (`wd:Q39`), items that are `wdt:P31/wdt:P279*` of
mountain (`wd:Q8502`)

Endpoint: `https://query.wikidata.org/sparql`

| Field | Property | Count | Share |
|---|---|---|---|
| All mountains | (base set) | 7,940 | 100% |
| Coordinates | P625 | 7,932 | 99.9% |
| Elevation | P2044 | 7,859 | 99.0% |
| Image | P18 | 1,727 | 21.7% |
| Prominence | P2660 | 1,452 | 18.3% |
| Isolation | P2659 | 506 | 6.4% |

Mountain passes in Switzerland (`wd:Q133056`): 348.

Mountains with prominence at or above 300 m, and how many of those also carry
an image:

| Country | prominence >= 300 m | of which with P18 |
|---|---|---|
| Austria (Q40) | 238 | 233 |
| Italy (Q38) | 485 | 422 |
| Norway (Q20) | 506 | 198 |
| France (Q142) | query timed out | 236 |
| Spain (Q29) | query timed out | 172 |

Read that Austrian row carefully: 233 of 238 prominent Austrian peaks have a
photo. That is not a data quality miracle, it is selection bias. Somebody
only bothers to type a prominence figure into Wikidata for peaks that already
have an article and a picture. **Prominence presence in Wikidata is a fame
signal, not a coverage signal.** Absence proves nothing.

### OpenStreetMap via Overpass, bounding box `45.8, 5.9, 47.8, 10.5`
(Switzerland plus fringes of its neighbours)

| Query | Count | Share of peaks |
|---|---|---|
| `node[natural=peak]` | 17,578 | 100% |
| `node[natural=peak][ele]` | 16,612 | 94.5% |
| `node[natural=peak][name]` | 14,690 | 83.6% |
| `node[natural=peak][wikidata]` | 8,224 | 46.8% |
| `node[natural=peak][prominence]` | 2,078 | 11.8% |
| `node[natural=saddle]` | 7,068 | |
| `node[mountain_pass=yes]` | 2,174 | |
| `node[tourism=viewpoint]` | 8,528 | |
| `node[tourism=alpine_hut]` | 397 | |

Smaller box `45.9, 7.5, 46.2, 8.0` (Zermatt and Saas valleys), to confirm the
lift layer exists at density: `node[aerialway=station]` returns 197 against
498 peaks in the same box.

Two conclusions from this table. First, OSM carries roughly 2.2 times as many
peaks as Wikidata and is the better inventory spine. Second, neither source
knows prominence for the overwhelming majority of peaks (11.8% in OSM, 18.3%
in Wikidata), so prominence has to be computed, which is the single most
important design decision in this category.

Operational note: the public Overpass instance timed out repeatedly on
country sized queries during this research, and a country sized `area[]`
filter failed outright. This is exactly the case the OSM API policy points
elsewhere for, so the harvest path is Geofabrik extracts read with pyosmium,
the pattern `pipeline/trails/ingest_osm_routes.py` already uses. Overpass is
for spot checks only.

---

## 2. Sources assessed

### 2.1 USE

#### Wikidata

- URL: https://www.wikidata.org , SPARQL at https://query.wikidata.org/sparql
- Gives: QID identity, `P625` coordinates, `P2044` elevation, `P2660`
  prominence, `P2659` isolation, `P3137` parent peak, `P7479` key col,
  `P18` image, sitelink counts, labels in every language, `P31` class
  (mountain `Q8502`, mountain pass `Q133056`, mountain range `Q46831`).
- Licence: CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/
- Access: SPARQL, plus the truthy RDF dumps for bulk.
- Per feature coordinates: yes, 99.9% in the Swiss sample.
- Harvestable: yes.
- Verdict: **use.** Already a ledger row (section 5).
- Property definitions confirmed at
  https://www.wikidata.org/wiki/Property:P2659 and
  https://www.wikidata.org/wiki/Wikidata:WikiProject_Mountains

#### OpenStreetMap (Geofabrik extracts primary, Overpass for spot checks)

- URL: https://www.openstreetmap.org , extracts at https://download.geofabrik.de
- Gives: the whole feature inventory. `natural=peak`, `natural=saddle`,
  `mountain_pass=yes`, `tourism=viewpoint`, `aerialway=*` (including
  `aerialway=station` for top stations), `railway=funicular` and
  `railway=rack`, `tourism=alpine_hut` and `wilderness_hut`, plus the
  `route=hiking` relations the trails lab already ingests.
- Licence: ODbL 1.0, https://opendatacommons.org/licenses/odbl/1-0/
- Access: bulk extracts (pyosmium), Overpass for small queries.
- Per feature coordinates: yes.
- Harvestable: yes. The API policy is explicit that large users must use
  planet or extracts, https://operations.osmfoundation.org/policies/api/ :
  "Large or frequent data users must use the download service 'planet.osm' or
  other alternatives described below."
- Overpass fair use, https://wiki.openstreetmap.org/wiki/Overpass_API : under
  10,000 queries and 1 GB per day on the main instance, pause 30 s on HTTP
  429, send an identifying User-Agent, and "when you want to extract country
  sized regions with all (or nearly all) data in it, it's better to use
  planet.osm mirrors for that".
- Verdict: **use.** Already a ledger row. Note the open share-alike review on
  the OSM derived slice of `app_data.json` (ledger follow-up item 2) applies
  to this layer too.
- `prominence=*` tag semantics confirmed at
  https://wiki.openstreetmap.org/wiki/Key:prominence , which also warns
  against copying prominence from Peaklist.org or Wikipedia for licence
  reasons. Same warning applies to us.

#### Copernicus DEM GLO-30

- URL: https://registry.opendata.aws/copernicus-dem/ , bucket
  `copernicus-dem-30m` in `eu-central-1`.
- Gives: 30 m global elevation. Already wired into
  `pipeline/trails/elevation.py`, tiles cached under `data/raw/dem/`.
- Licence: free of charge, worldwide, without limitation in time, commercial
  use permitted, attribution required. Licence document:
  https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM/resources/license/License-COPDEM-30.pdf
  Required notice, per that licence: "© DLR e.V. 2010-2014 and © Airbus
  Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European
  Union and ESA; all rights reserved."
- Per feature coordinates: n/a, it is a raster.
- Harvestable: yes.
- Verdict: **use.** Already a ledger row (section 7).
- **Ledger correction needed.** `elevation.py` sets
  `ATTRIBUTION = "Elevation data: Copernicus GLO-30 (c) ESA and Airbus"`,
  which is shorter than the notice the licence text demands. Worth aligning
  the string before the mountains layer doubles its exposure.

#### akirmse/mountains (prominence and isolation engine)

- URL: https://github.com/akirmse/mountains
- Gives: C++ programs that compute topographic prominence and isolation from
  a DEM. This is the reference implementation behind Kirmse and de Ferranti,
  "Calculating the prominence and isolation of every mountain in the world",
  Progress in Physical Geography 2017,
  https://journals.sagepub.com/doi/10.1177/0309133317738163
- Licence: MIT (the software). Confirmed on the repository page.
- Access: source, build and run locally.
- Per feature coordinates: the output is one row per summit with lat, lon,
  elevation, key saddle lat, key saddle lon, prominence.
- Harvestable: yes, it is software we run ourselves.
- Verdict: **use.** This is the fix for the 11.8% / 18.3% prominence gap.
  Running MIT code over Copernicus GLO-30 produces our own derived layer
  whose only upstream obligation is the Copernicus credit we already carry.
  New ledger row.

Related but different: Kirmse also publishes precomputed results.
https://www.andrewkirmse.com/prominence offers a zip of roughly 7.8 million
peaks with at least 100 ft of prominence, sorted by decreasing prominence,
one CSV row per peak (lat, lon, elevation in feet, key saddle lat, key saddle
lon, prominence in feet). **The page states no licence.** See section 2.2.

#### GeoNames, `allCountries` dump, feature class T

- URL: https://www.geonames.org/export/ , dump at
  https://download.geonames.org/export/dump
- Gives: named summits and passes with coordinates and elevation. Feature
  codes in class T include `PK` (peak), `MT` (mountain), `PASS` (pass), plus
  ridges and spurs. Code list at http://www.geonames.org/export/codes.html
- Licence: CC BY 4.0. From https://www.geonames.org/export/ : "You should
  give credit to GeoNames when using data or web services with a link or
  another reference to GeoNames." Commercial use permitted.
- Access: bulk dump (preferred) or web services at 10,000 credits per day and
  1,000 per hour per username.
- Per feature coordinates: yes.
- Harvestable: yes.
- Verdict: **use.** The ledger already has a GeoNames row but it is scoped to
  `cities500` in `pipeline/harvest_geonames.py`. Extend that row, or add a
  sibling, to cover the T class.

#### GMBA Mountain Inventory v2

- URL: https://www.earthenv.org/mountains , code and licence at
  https://github.com/GMBA-biodiversity/Inventory , DOI
  https://doi.org/10.48601/earthenv-t9k2-1407
- Gives: 8,619 named mountain ranges worldwide as polygons, in a hierarchy
  (basic units up through major systems), with a growing attribute table.
  Paper: https://www.nature.com/articles/s41597-022-01256-y
- Licence: CC BY 4.0, confirmed in the repository LICENSE file.
- Access: shapefile download from EarthEnv, or the `gmbaR` R package.
- Per feature coordinates: polygons, so yes (a peak point-in-polygon join
  gives every summit a named range).
- Harvestable: yes.
- Verdict: **use.** This is what turns a list of summits into "the
  Dolomites", "the Julian Alps", "the Picos de Europa", and it is what makes
  a per-range relative prominence gate possible instead of one Alpine
  threshold that deletes Britain. New ledger row.

#### EEA CDDA, Nationally designated areas

- URL: https://www.eea.europa.eu/data-and-maps/data/nationally-designated-areas-national-cdda-17
  , catalogue record
  https://sdi.eea.europa.eu/catalogue/srv/api/records/b07cd829-47da-416c-83f5-9dc952191bfc
- Gives: national parks, nature parks and other nationally designated areas
  across 39 European countries, as polygons plus tabular designation types.
  This is the European feed that supplies WDPA, so it is the same underlying
  information without WDPA's terms.
- Licence: CC BY 4.0. UNVERIFIED against the record page itself: the licence
  was reported by search over the EEA catalogue but the record page was not
  read directly in this pass. The EEA's standard reuse policy is CC BY 4.0
  and the sibling Natura 2000 record states it explicitly (below), so this is
  very likely correct, but confirm before shipping.
- Access: direct download, GDB and GPKG, plus CSV attribute tables.
- Per feature coordinates: polygons, yes.
- Harvestable: yes.
- Verdict: **use**, after confirming the licence line. New ledger row.

#### Natura 2000, EEA vector, version end 2024

- URL: catalogue record
  https://sdi.eea.europa.eu/catalogue/srv/api/records/91357f39-7866-41ce-b447-43905c364ec8
  , download https://sdi.eea.europa.eu/data/91357f39-7866-41ce-b447-43905c364ec8
- Gives: SPA and SAC/SCI site polygons for the whole EU.
- Licence: CC-BY 4.0, https://creativecommons.org/licenses/by/4.0/ ,
  copyright holder Directorate-General for Environment (DG ENV). Read
  directly from the catalogue record. The record adds: "This data is provided
  for general information purposes only. Only the data possessed by the
  competent authorities of the Member States is authentic."
- Access: direct download, SHP and GeoPackage, plus OGC WMS.
- Per feature coordinates: polygons, yes.
- Harvestable: yes.
- Verdict: **use.** New ledger row.

#### Kartverket, Sentralt stedsnavnregister (SSR)

- URL: https://www.kartverket.no/en/api-and-data/stedsnavndata , terms at
  https://www.kartverket.no/en/api-and-data/terms-of-use
- Gives: the authoritative Norwegian place name register including the
  "høyder" group (all peak types), with coordinates. Over 1 M entries,
  offered as a single national GeoJSON as well as GML and SOSI, plus WMS,
  WFS and an unauthenticated REST search API.
- Licence: CC BY 4.0, http://creativecommons.org/licenses/by/4.0/ . Read from
  the terms page: Kartverket's free products are "released for free use for
  both commercial and non-commercial purposes", credit "©Kartverket". For
  database protected products such as SSR the terms add a specific line:
  systematic use of individual place names requires stating "all place names
  are obtained from SSR ©Kartverket" with a link.
- Access: bulk download and REST API, no registration.
- Per feature coordinates: yes.
- Harvestable: yes.
- Verdict: **use** for Norway, where the local spelling matters and OSM
  imports from SSR are partial. Kartverket already has a ledger row for
  Turrutebasen (section 7); SSR is a different dataset and needs its own row,
  with the systematic-use credit line recorded.

#### refuges.info API

- URL: https://www.refuges.info/api/doc/
- Gives: mountain huts, refuges, shelters, cabins and bivouacs for the French
  Alps and Pyrenees and neighbouring ranges, with massif and park polygons.
  Endpoints `/api/bbox`, `/api/massif`, `/api/point`, `/api/polygones`, in
  GeoJSON, KML, GPX, CSV, XML.
- Licence: CC BY-SA 2.0 for refuges.info's own content. Read from the API doc
  page: "Les données du site Refuges.info sous sont licence CC By-Sa 2.0,
  cependant l'API permet aussi de retourner des données provenant
  d'OpenStreetMap via sa fonction de recherche, ces données sont sous licence
  ODbL." So the API can return two differently licensed streams and the
  harvester must record which.
- Access: read only, no key, no stated rate limit. The docs warn against the
  `all` parameter for server load reasons.
- Per feature coordinates: yes.
- Harvestable: yes, politely.
- Verdict: **use** as an enrichment for FR huts, but keep it to factual
  fields (name, coordinates, altitude, capacity, staffed or not). Any prose
  taken from it carries CC BY-SA share-alike, which is the same trap
  `describe.py` already sidesteps with Wikivoyage. New ledger row.

#### Wikipedia pageviews and Wikimedia Commons

- Already ledger rows (section 5). Pageview statistics are CC0 and are the
  cleanest fame signal available; `pipeline/trails/popularity.py` already
  implements the family fame split and can be reused unchanged.
- Commons images reached through Wikidata `P18` inherit the open per-file
  credit gap that is follow-up item 1 in the ledger. A mountains grid full of
  CC BY-SA summit photos makes that gap more visible, not less.
- Verdict: **use**, with the per-file credit work treated as a blocker for
  any photo grid.

### 2.2 MAYBE

#### Kirmse precomputed prominence dataset

- URL: https://www.andrewkirmse.com/prominence
- Gives: roughly 7.8 million summits worldwide with at least 100 ft of
  prominence, CSV, one row per summit: lat, lon, elevation (feet), key saddle
  lat, key saddle lon, prominence (feet). Sorted by decreasing prominence.
  Delivered by Google Drive link. An isolation set is published alongside.
- Licence: **not stated on the page.** No CC mark, no terms, no explicit
  grant. The code is MIT, the data is silent.
- Access: manual download.
- Per feature coordinates: yes.
- Harvestable: unclear.
- Verdict: **maybe.** Useful as a cross-check on our own computation, and it
  would save a large compute job. But shipping a layer whose licence is
  "the author did not say" is exactly the kind of row the ledger exists to
  prevent. Recommended: run the MIT code ourselves over GLO-30 and use this
  file only as an offline sanity check that never enters `app_data.json`. If
  it ever does ship, ask the author first.

#### swisstopo swissNAMES3D

- URL: https://www.swisstopo.admin.ch , STAC collection
  `https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swissnames3d`
- Gives: over 400,000 georeferenced Swiss and Liechtenstein names including
  peaks (Gipfel) and saddles/passes, as 3D points.
- Licence: **conflicting signals.** The STAC collection's `license` field
  returns the literal string `proprietary`, which in STAC is the placeholder
  used when no SPDX identifier applies, not a legal statement. swisstopo has
  published its data under free open government data terms since 2021, which
  is what the existing ledger row for swissTLM3D-Wanderwege records
  ("swisstopo open government data terms, free use since 2021, source
  attribution asked, verify per dataset"). The opendata.swiss record page
  returned HTTP 403 to this research pass, so the licence line could not be
  read from a primary page. UNVERIFIED.
- Access: STAC API, same mechanism `crosscheck_portals.py` already uses for
  swissTLM3D.
- Per feature coordinates: yes.
- Harvestable: presumed yes under the swisstopo OGD terms.
- Verdict: **maybe**, pending a direct read of the dataset's terms. Low
  urgency: OSM plus Wikidata already cover Swiss summits densely, and this is
  a name-authority nicety rather than a coverage fix.

#### CAI Rifugi REST API (Italy)

- URL: https://rifugi.cai.it/api-info (the page is a JavaScript application
  and served no readable text to either WebFetch or a plain HTTP fetch).
- Gives: the CAI "Unico rifugi" database, reported as 722 structures
  including 310 staffed refuges, 65 unstaffed, 247 bivouacs.
- Licence: reported as ODbL with attribution to Club Alpino Italiano and
  OpenStreetMap. **UNVERIFIED**: this could not be read from a CAI page. The
  Wikimedia Italia announcement,
  https://www.wikimedia.it/news/wikimedia-italia-cai-club-alpino-italiano-insieme-migliorare-la-cartografia-libera/
  , confirms CAI committed to inserting its refuges, bivouacs and trails into
  OpenStreetMap, but names no licence for a CAI-side API.
- Access: REST, details unread.
- Per feature coordinates: presumed yes, unverified.
- Harvestable: unclear.
- Verdict: **maybe.** Since CAI feeds OSM directly, the safe path is to take
  Italian huts from OSM under ODbL and skip the API entirely, unless a
  licence line can be read off a CAI page.

### 2.3 REJECT

#### WDPA / Protected Planet

- URL: https://www.protectedplanet.net/en/legal
- Rejected. The terms of use forbid both the redistribution and the
  commercial use this app would require, verbatim: "Neither (a) the WDPCA
  Materials and the GD-PAME Materials nor (b) any work derived from or based
  upon the WDPCA Materials and the GD-PAME Materials ("Derivative Works") may
  be put to Commercial Use without the prior written permission of
  UNEP-WCMC." And: "You may not redistribute the WDPCA and GD-PAME Data
  contained in the WDPCA and GD-PAME in whole or in part by any means
  including (but not limited to) electronic formats such as web downloads,
  through web services, through interactive web maps (including mobile
  applications) that grant users download access, KML Files or through file
  transfer protocols."
- Carta carries affiliate links, so it is commercial, and a protected-area
  flag baked into `app_data.json` is redistribution. Both prohibitions bite.
- **Use CDDA plus Natura 2000 instead.** For Europe they are the upstream
  feed WDPA is built from, and both are CC BY 4.0.

#### alpenvereinaktiv.com (DAV, OeAV and AVS tour portal, operated by
Outdooractive AG)

- URL: https://www.alpenvereinaktiv.com/de/agb.html
- Rejected. § 8 (Lizenz für die Nutzung von Inhalten): "Alle weiteren
  Nutzungen (Beispiel: Vervielfältigung zu gewerblichen Zwecken,
  Archivierung, Überlassung an Dritte, Verarbeitung durch Dritte für eigene
  oder fremde Zwecke, öffentliche Wiedergabe, Übersetzung, Bearbeitung etc.)
  vor allem redaktionelle oder kommerzielle Nutzungen, sind nur mit
  schriftlicher Zustimmung der Anbieterin erlaubt." § 11 additionally forbids
  redistributing platform content.
- This answers the brief's "alpine club hut networks (DAV/OeAV/CAS/CAI)"
  question directly: the clubs' own portal is closed. The harvestable
  substitutes are OSM `tourism=alpine_hut` and `wilderness_hut` (ODbL) and
  refuges.info for France (CC BY-SA 2.0).

#### peakbagger.com

- URL: https://www.peakbagger.com/help/TermsOfService.aspx
- Rejected. The service is for personal, non-commercial use only, and the
  terms bar use that is "a source of or substitute for the service or
  content", affects the site's ability to earn money, or "competes with the
  service". A prominence-ranked mountain browser is squarely a competing use.

#### komoot

- URL: https://www.komoot.com/terms-of-service
- Rejected. The terms restrict exporting, distributing or publishing tours by
  any means other than komoot's own export function. UNVERIFIED on the exact
  clause wording: the terms page was reached only through search result
  extracts in this pass, not read whole. The restriction itself is not in
  doubt; the quotation is.

#### AllTrails

- URL: https://www.alltrails.com/terms
- Rejected, and read directly. The terms forbid users to "use software or
  automated agents or scripts to produce multiple Member Accounts, or to
  generate automated searches, requests, or queries to (or to strip, scrape,
  or mine data from) the Products", forbid use "for any commercial purpose
  without the express written consent of AllTrails", and state that
  "Materials from the Products may not be copied or distributed, or
  republished, or transmitted in any way, without our prior written consent."

---

## 3. The crucial question: what makes a mountain worth visiting

A high point is a fact about terrain. A destination is a place where a
traveller can stand, see something, and get back down. The gap between those
two is entirely about **access** and **reward**, and both are computable from
the sources above.

The Swiss bounding box has 17,578 `natural=peak` nodes. The entire Carta
catalogue has 1,570 destinations across 43 countries. Publishing peaks
without a gate does not enrich the map, it destroys it. This is the same
failure mode as the POI saturation work already in the repo.

Proposed definition, in three stages.

### Stage 1: the relief gate (is it a mountain at all)

Computed prominence `P`, from our own GLO-30 run, never from a tag.

A feature passes if any of:

1. `P >= 300 m`. Three hundred metres is the classic Alpine independence
   threshold and the OSM prominence page notes cutoffs between 100 and 300 m
   are the popular range for calling something a mountain.
2. `P >= 100 m` **and** it is the highest point of its GMBA basic-level range
   unit. This is the clause that saves Britain, Ireland, the Ardennes, the
   Harz and the Baltics from a gate tuned on the Alps.
3. `P >= 30 m` **and** a lift station or a `tourism=viewpoint` sits within
   250 m. A cable car top station on a shoulder is a destination even when
   the shoulder is not a summit. Rigi Kulm, Schilthorn and every Seilbahn
   terrace live here.

Anything failing all three is a bump. It stays in the lab and never reaches
the wire.

### Stage 2: the access gate (can an ordinary traveller stand there)

At least one of, computed by spatial join:

- **lift**: an `aerialway=station`, `railway=funicular` terminus or
  `railway=rack` terminus within 500 m horizontal and 150 m vertical.
- **road**: a drivable OSM way, or a `mountain_pass=yes` node, within 300 m.
- **path**: an OSM `route=hiking` relation whose geometry passes within 250 m
  and whose maximum `sac_scale` along the approach is at most `T3`
  (demanding mountain hiking, still no rope). The trails lab already holds
  43.4k such relations for CH, AT, NO, FR and DE, so this join is nearly free.
- **hut**: an `alpine_hut` or `wilderness_hut` within 2 km and 400 m vertical,
  which turns a two day objective into a plannable one.

A prominent peak with no lift, no road, no marked path at or below T3 and no
hut is a mountaineering objective. It is a real mountain and it is not a
travel product. Keep it, flag it, do not publish it.

Store the winning mode. It is not just a gate, it is the most useful single
fact on the card, and it feeds straight into the existing `transportPref` and
day-planner logic.

### Stage 3: the reward score (ranking, 0 to 100)

Weighted sum over normalised components. Suggested opening weights, to be
calibrated the way `curated_appeal.json` calibrated `rating_v2`:

| Component | Weight | Computation |
|---|---|---|
| fame | 0.30 | `log1p(median 12-month Wikipedia pageviews)` plus Wikidata sitelink count, via the existing `popularity.py` family fame split |
| view | 0.20 | count of `tourism=viewpoint` within 1 km, plus the isolation-to-prominence ratio as a cheap viewshed proxy |
| access | 0.20 | lift beats road beats path beats hut; then the existing reach minutes (contract D) from the nearest catalogue city |
| relief | 0.15 | normalised computed prominence, capped so Mont Blanc does not flatten everything else |
| photo | 0.10 | has a Wikidata `P18` or a Commons category (a proxy for "it photographs as something") |
| context | 0.05 | inside a CDDA or Natura 2000 designated area |

Two modifiers rather than components:

- **Crowding penalty** from the existing JRC/Eurostat NUTS3 crowding layer,
  applied only at the extremes, matching how `CrowdingBadge` already behaves.
- **Season mask** from the existing WorldClim climate layer plus, for passes,
  OSM `seasonal` and winter closure tags. A 3,000 m summit has no January
  score. This should suppress, not deduct.

In one sentence: **a mountain is worth visiting when it is independent enough
to be its own place (prominence, absolute or relative to its range), reachable
without technical equipment (lift, road, T3 path or hut), and rewarding
enough that people photograph it and write about it (viewpoints, pageviews,
sitelinks).**

---

## 4. Pitfalls

1. **Wikidata prominence is a fame proxy, not coverage.** 18.3% of Swiss
   mountains have `P2660`, and 233 of Austria's 238 peaks above 300 m of
   prominence also have a photo. Treating a missing `P2660` as "not
   prominent" would delete most of the mountains in Europe.

2. **Prominence must not be computed per country.** The key saddle of a
   border peak is routinely on the other side of the border. Clipping the DEM
   to one country's tiles silently inflates prominence at every frontier.
   This is the same class of bug as the Valhalla far-snap already recorded in
   the repo (one country of tiles, wrong answers just outside it). Build a
   seamless European GLO-30 mosaic with a wide margin before running the
   prominence pass.

3. **GLO-30 is a DSM, not a DTM.** Canopy and buildings inflate it. Fine on
   rock summits, wrong on forested hills, which is precisely where the
   marginal `P >= 100 m` candidates live in Germany, Belgium and the Nordics.

4. **`elevation.py`'s calibration does not transfer to summit points.** Its
   3-sample moving average and 5 m hysteresis gate were tuned against OSM
   ascent tags on Swiss line geometries, and they are deliberately
   conservative. A summit wants the maximum over a 3x3 window, not a smoothed
   sample, or every peak reads a metre or two low.

5. **Vertical datums differ.** GLO-30 ships EGM2008 geoid metres. Swiss
   figures are LN02/LHN95, Norwegian are NN2000, and national summit
   elevations on signposts follow the national datum. Discrepancies of one to
   three metres are normal and are not errors. Do not "correct" an OSM `ele`
   tag or a national register figure from the DEM, and do not show two
   different elevations for the same peak on two different surfaces.

6. **Coastal and island peaks.** A key saddle at sea level makes prominence
   equal elevation, which is correct (Teide, Etna, the Norwegian island
   summits) but only if the DEM's water pixels are cleaned first.
   `elevation.py` already has coastal zero-run handling; the prominence pass
   needs the same treatment, not a fresh implementation.

7. **Multilingual duplicate summits are worse than duplicate POIs.** The same
   peak is Matterhorn, Cervino and Cervin; Mont Blanc and Monte Bianco;
   Grossglockner and Veliki Klek. Wikidata, OSM, GeoNames and the national
   registers each carry a different subset of the names. The existing
   union-find name and geo dedupe (POI dedupe v2) is the right tool, but its
   name folding needs the alpine cases added, and the l-with-stroke folding
   gotcha already recorded applies to Polish and Slovak summits.

8. **A prominence gate tuned on the Alps erases 20 of the 43 countries.**
   Netherlands, Denmark and the Baltics have no 300 m prominence at all;
   Britain and Ireland have very few. Without the per-GMBA-range relative
   clause, Snowdon, Ben Nevis, Carrauntoohil, the Brocken and Vaalserberg all
   vanish, and the map looks broken to a user in Amsterdam.

9. **Passes are seasonal and the tags are sparse.** `mountain_pass=yes`
   returns 2,174 nodes in the Swiss box, but winter closure lives in
   `seasonal`, `opening_hours` or `snowplowing` tags that are far patchier.
   Recommending the Stelvio in February is a concrete, visible failure.

10. **Lift operating seasons and fares are not in OSM.** `aerialway=*`
    carries geometry and occupancy, not a timetable or a price. Never state
    that a cable car is running, and never quote a fare from this layer.

11. **Overpass will not survive a continental harvest.** Country sized
    `area[]` queries failed outright during this research and several tag
    counts timed out even on a bounding box. Go to Geofabrik extracts and
    pyosmium, as `ingest_osm_routes.py` already does.

12. **WDPA is the obvious protected-area source and is the wrong one.** It is
    the first result for every search and its terms forbid exactly what this
    app does. CDDA plus Natura 2000 give the same European coverage under CC
    BY 4.0, because CDDA is what European countries send to WDPA.

13. **The alpine clubs' own portal is closed.** alpenvereinaktiv is the
    natural place to look for DAV/OeAV/AVS huts and its § 8 forbids
    commercial reproduction. Any hut layer has to come from OSM or
    refuges.info, which means hut opening periods and reservation state are
    simply not available as open data. Do not imply they are.

14. **refuges.info returns two licences from one API.** Its own records are
    CC BY-SA 2.0; the same endpoint can hand back OSM records under ODbL. The
    harvester must record which per row, or the share-alike question becomes
    unanswerable later.

15. **The Copernicus attribution string in the repo is short.** The licence
    demands a specific notice naming DLR, Airbus, the European Union and ESA;
    `elevation.py` carries an abbreviated version. Fix before scaling.

---

## 5. Ledger rows this category needs

New rows in `docs/tos/data_licenses.md`:

| Source | Licence | Attribution | Share-alike |
|---|---|---|---|
| GMBA Mountain Inventory v2 | CC BY 4.0 | Yes | No |
| EEA CDDA nationally designated areas | CC BY 4.0 (verify) | Yes | No |
| Natura 2000 (EEA, DG ENV) | CC BY 4.0 | Yes | No |
| Kartverket SSR place names | CC BY 4.0 | Yes, plus the systematic-use line | No |
| refuges.info API | CC BY-SA 2.0 (own data), ODbL (OSM passthrough) | Yes | Yes for its own prose |
| akirmse/mountains engine | MIT (software); output inherits Copernicus terms | Copernicus notice | No |
| swisstopo swissNAMES3D | swisstopo OGD terms (verify) | Yes | No |

Existing rows to amend:

- GeoNames: widen from `cities500` to the T feature class.
- Copernicus GLO-30: correct the attribution string to the licence's wording.
- OpenStreetMap: the mountains layer joins the open share-alike review of the
  OSM derived slice of `app_data.json` (follow-up item 2).

Rejected sources worth recording so nobody re-researches them: WDPA,
alpenvereinaktiv, peakbagger, komoot, AllTrails.

---

## 6. Recommended stack

Build it in the trails lab, not a new pipeline. `tools/trailslab` already has
PostGIS on 5433, the GLO-30 tile cache, 43.4k OSM hiking route relations for
CH/AT/NO/FR/DE, a `data_sources` attribution table, an `images` table that
rejects NC and ND at insert, and a local review UI with an approve-only
publish gate. A `summits` table beside `trips` reuses all of it.

1. **Inventory**: pyosmium over Geofabrik extracts, per country, pulling
   `natural=peak`, `natural=saddle`, `mountain_pass=yes`, `tourism=viewpoint`,
   `aerialway=*`, `railway=funicular|rack`, `tourism=alpine_hut|wilderness_hut`.
   ODbL.
2. **Relief**: build a seamless European GLO-30 mosaic with a wide margin,
   run akirmse/mountains (MIT) over it, write prominence, isolation and key
   saddle back per summit. This is the step that replaces an 11.8% tag with
   100% coverage, and its output is our own derived layer.
3. **Identity and fame**: join Wikidata (CC0) through the OSM `wikidata` tag
   where present (46.8% in the Swiss sample) and through the existing
   union-find name and geo dedupe for the rest. Pull pageviews and sitelinks
   through `popularity.py`.
4. **Local names**: GeoNames T class (CC BY 4.0) everywhere, Kartverket SSR
   for Norway, swissNAMES3D for Switzerland once its terms are confirmed.
5. **Grouping**: point-in-polygon against GMBA v2 (CC BY 4.0) to give every
   summit a named range, which powers both the relative prominence gate and a
   "browse by massif" axis.
6. **Context**: CDDA plus Natura 2000 (CC BY 4.0) for the protected flag.
   Never WDPA.
7. **Huts**: OSM first. refuges.info (CC BY-SA 2.0) as an FR enrichment,
   facts only, provenance recorded per row.
8. **Images**: Wikidata `P18` into Commons via the existing
   `harvest_pois_wikidata_images.py` path. Treat the per-file credit gap
   (ledger follow-up item 1) as a blocker for any photo grid.
9. **Gate and rank**: stages 1 to 3 of section 3, then the same approve-only
   review path the trails vertical uses, then `export_wire.py` style publish
   of produced works only, which is what keeps the ODbL derived-database
   obligations inside the lab.

Rough scale check: 17,578 raw peaks in a Switzerland-sized box. A 300 m
prominence gate plus an access gate should land somewhere in the low
hundreds per Alpine country and a few dozen per lowland country, which is the
right order of magnitude to sit beside 1,570 destinations without swamping
the map.
