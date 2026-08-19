# Sources research: trails (walk, hike, trail run)

Compiled 2026-08-17. Scope: what would raise the quality of Carta's trails
vertical beyond the current OSM-relation spine, and whether "best trails to
run" deserves its own category.

Every row below states a licence with a URL where one was found, the access
method, whether the source gives per-feature coordinates, and whether
harvesting is permitted. Anything not confirmed against a primary page is
marked UNVERIFIED in the row and repeated in the gaps list at the end.
Nothing here has been added to `docs/tos/data_licenses.md` yet: per that
ledger's rules, a source must earn its row before it ships, and only the
sources marked "use" below are candidates.

---

## 1. What the repo already has

Read before researching: `docs/TRAILS_EXPANSION_PLAN.md`,
`pipeline/trails/{ingest_osm_routes,elevation,validate,popularity,crosscheck_portals,describe,export_wire}.py`,
`continent-app/public/trails/*.json`.

State on disk:

- Spine: OSM route relations (`type=route|superroute`, `route=hiking|foot|walking`)
  pulled from per-country Geofabrik extracts into the local PostGIS lab.
  43.4k routes for CH/AT/NO/FR at the time the plan was written, DE ingested
  later. `KEEP_TAGS` in `ingest_osm_routes.py` keeps 21 relation-level tags.
- Elevation: Copernicus GLO-30 sampled per vertex (`elevation.py`), ascent and
  descent recomputed.
- Portal cross-check (`crosscheck_portals.py`): swisstopo swissTLM3D
  Wanderwege (CH), IGN BD TOPO `itineraire_autre` (FR), Kartverket
  Turrutebasen (NO), Bayerische Vermessungsverwaltung Wanderwege (DE,
  Bavaria only). AT was surveyed and found to have no open trail geometry.
- Fame ranking (`popularity.py`): own wikipedia/wikidata tags, WDQS sitelink
  counts, Wikipedia pageviews, plus borrowed fame from catalogue
  destinations and POIs within 2 km, blended with network level, portal
  agreement and quality score.
- Validation (`validate.py`): five checks, weighted quality score, drafts
  only, human approval gate, then `export_wire.py` publishes produced works
  to `continent-app/public/trails/{CC}.json` plus `trip/{id}.json`.
- Shipped today: 43 country files, 760 published trips (index.json),
  hikes plus dayhikes plus citytrips, each carrying its own
  `attribution_text`.

Known holes the plan itself lists: the day-hike fame blind spot (a famous
route with no wikipedia/wikidata tag and no nearby catalogue anchor is
invisible), per-image TASL metadata, and the next ingest wave (IT, ES, DE,
GB, SI, SE).

The gap this research targets: **the spine is one source deep.** Every
published hike is an OSM relation that survived five geometry checks. Nothing
in the stack yet says "this trail is officially designated", "this trail is
graded E/EE by the people who maintain it", or "this surface is runnable".
Those three facts live in national registries, and most of the good ones are
open.

---

## 2. Sources assessed

### 2.1 Use: national and federal registries with open licences

#### Sport Ireland, National Trails Register (GetIrelandActive_TrailRoutes)

- URL: https://data.gov.ie/dataset/getirelandactive_trailroutes
- What it gives: line features for every waymarked recreational trail in
  Ireland that meets the national quality standard, plus a companion
  trailheads point layer
  (https://data.gov.ie/dataset/getirelandactive_trailheads).
- Licence: Creative Commons Attribution 4.0,
  https://creativecommons.org/licenses/by/4.0/ (stated on the dataset page).
- Access: ArcGIS GeoServices REST FeatureServer,
  https://services-eu1.arcgis.com/CltcWyRoZmdwaB7T/ArcGIS/rest/services/GetIrelandActiveTrailRoutes/FeatureServer/0
  , WGS84 (EPSG:4326) supported.
- Per-feature coordinates: yes, line geometry.
- Harvesting allowed: yes, CC BY 4.0 with attribution to Sport Ireland.
- Verdict: **use**. This is the cleanest "official designation" layer in
  Europe and IE is not yet ingested. It fixes the designation gap for a whole
  country in one fetch.

#### Natural England, National Trails (England)

- URL: https://www.data.gov.uk/dataset/ac8c851c-99a0-4488-8973-6c8863529c45/national-trails
- What it gives: the linear extent of England's National Trails (the
  statutory long distance routes).
- Licence: Open Government Licence (v3 linked from the portal footer,
  https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
- Access: Shapefile, GeoPackage, GeoJSON, file geodatabase, plus WFS, WMS,
  OGC API Features and an ArcGIS REST feature service. Hub page:
  https://naturalengland-defra.opendata.arcgis.com/datasets/national-trails-england/about
- Per-feature coordinates: yes, line geometry.
- Harvesting allowed: yes, OGL v3 with the standard attribution statement.
- Verdict: **use**, for GB designation. Small dataset (15 National Trails),
  high authority.

#### NatureScot, Scotland's Great Trails

- URL: https://opendata.nature.scot/ (portal),
  https://www.nature.scot/doc/scotlands-great-trails-map (programme page)
- What it gives: the 29-plus designated Scottish long distance routes, each
  at least 25 miles, largely off road.
- Licence: Open Government Licence v3, with the acknowledgement
  "Contains NatureScot information licensed under the Open Government
  Licence v3.0" (portal guidance,
  https://opendata.nature.scot/pages/guidance-and-faqs).
- Access: NatureScot Spatial Data Hub (ArcGIS Hub, GeoJSON/KML/CSV/Shapefile
  downloads) and https://gis-downloads.nature.scot/ .
- Per-feature coordinates: yes.
- Harvesting allowed: yes, OGL v3.
- Verdict: **use**. UNVERIFIED detail: the exact dataset slug for Scotland's
  Great Trails on the hub was not opened, only the portal licence statement.
  Confirm the layer name before wiring a loader.

#### Club Alpino Italiano, INFOMONT (Catasto del Sentiero Italiano)

- URL: https://www.cai.it/sentieri-e-rifugi/infomont/ , data at
  https://infomont.cai.it
- What it gives: the national digital cadastre of Italian hiking itineraries
  plus refuges and bivouacs, maintained and ground-verified by CAI sections.
- Licence: Open Data Commons Open Database License (ODbL) 1.0,
  https://opendatacommons.org/licenses/odbl/1-0/ . Required credit: cite
  OpenStreetMap contributors with a link to
  https://www.openstreetmap.org/copyright, state the data is available under
  ODbL, and cite "INFOMONT (@ Club Alpino Italiano)" linking
  https://infomont.cai.it .
- Per-feature coordinates: yes.
- Harvesting allowed: yes, ODbL, share-alike applies to any published
  derived database.
- Verdict: **use**, but with a caveat that matters: **INFOMONT derives from
  OpenStreetMap with subsequent CAI rework.** It is therefore NOT an
  independent geometry check for Italy the way swisstopo is for Switzerland.
  Its value is the CAI attributes (official sentiero numbers, the T/E/EE/EEA
  difficulty grades, refuge links), not confirmation that the line is real.
  Wiring it into `crosscheck_portals.py` as a geometry oracle would validate
  OSM against OSM.

#### Trentino, SAT sentieri

- URL: https://www.sat.tn.it/sns/12/home/download_sentieri.html , OSM wiki
  summary at https://wiki.openstreetmap.org/wiki/Trentino/Sentieri
- What it gives: the SAT trail network of Trentino as Shapefile, GPX and KML,
  with descriptive sheets at https://sentieri.sat.tn.it/schede-sentieri .
- Licence: ODbL (stated on the OSM wiki page as the SAT release licence).
- Access: direct file download.
- Per-feature coordinates: yes.
- Harvesting allowed: yes.
- Verdict: **maybe**. Regional. Take it only if IT gets a deep pass, and note
  that SAT digitised against Provincia Autonoma di Trento cartography.

#### Lombardia, Rete Escursionistica Lombarda (REL)

- Referenced from https://wiki.openstreetmap.org/wiki/Lombardia/Sentieri
- Licence: CC BY 4.0 per that page.
- Verdict: **maybe**, UNVERIFIED. The Geoportale Lombardia dataset page was
  not opened. Same role as SAT: regional attribute enrichment.

#### Naturvårdsverket, Leder och friluftsanordningar (Sweden)

- URL: https://geodata.naturvardsverket.se/nedladdning/friluftsliv ,
  spec PDF
  https://geodata.naturvardsverket.se/nedladdning/friluftsliv/Leder_och_friluftsanordningar_beskrivning_av_oppna_data.pdf
- What it gives: the Leder layer (hiking, cycling, ski, riding, canoe trails
  in and around protected areas) with trail type, length and **surface
  material** attributes, plus a facilities layer (shelters, fireplaces).
- Licence: CC0 1.0 Universal (stated in the spec PDF). Attribution to
  Naturvårdsverket is recommended, not required.
- Access: WFS https://geodata.naturvardsverket.se/leder_friluftsliv/wfs? ,
  WMS, and direct GeoJSON/Shapefile download.
- Per-feature coordinates: yes.
- Harvesting allowed: yes, CC0, no restrictions.
- Verdict: **use**. SE is on the next-ingest list anyway, this is CC0, and it
  is the only source found that ships a surface attribute natively, which is
  exactly what the running question needs.

#### LIPAS (Finland), sport and recreation facility GIS

- URL: https://www.jyu.fi/fi/avoimet-rajapinnat-ja-ladattavat-lipas-aineistot ,
  API https://api.lipas.fi/v2/sports-sites , dataset record
  https://avoindata.suomi.fi/data/fi/dataset/lipas-liikuntapaikat-wfs
- What it gives: the nationwide Finnish register of sports and outdoor
  recreation places as points, routes and areas, maintained by the University
  of Jyvaskyla. Routes exportable as GPX, GeoJSON, CSV.
- Licence: CC BY 4.0 (stated on the JYU open interfaces page), explicitly
  allowing commercial use.
- Access: open REST API (no registration), WFS, bulk download.
- Per-feature coordinates: yes.
- Harvesting allowed: yes, CC BY 4.0.
- Verdict: **use** for FI. Bonus: LIPAS type codes distinguish hiking routes
  from ski and nature trails, which is a cleaner category signal than OSM
  `route=hiking` alone.

#### Ministerio de Agricultura, Pesca y Alimentacion, Red de Caminos Naturales (Spain)

- URL: https://www.mapa.gob.es/es/cartografia-y-sig/ide/descargas/desarrollo-rural/red-caminos-naturales
- What it gives: over 10,300 km of national Caminos Naturales as stage line
  features, plus a points-of-interest layer.
- Licence: free reuse with attribution. Exact wording: "Esta informacion se
  puede usar de modo libre y gratuito siempre que se mencione al Ministerio
  de Agricultura, Pesca y Alimentacion como autor y propietario de la
  informacion de la siguiente manera: «© Ministerio de Agricultura, Pesca y
  Alimentacion»." Not a named standard licence, so treat it as a bespoke
  attribution licence, not as CC BY.
- Access: Shapefile download in ETRS89 with XML/PDF documentation.
- Per-feature coordinates: yes.
- Harvesting allowed: yes, with the exact credit string.
- Verdict: **use** for ES designation. Note this is the national network
  only, it is not the FEDME GR network.

#### French departements, PDIPR datasets on data.gouv.fr

- Example: https://www.data.gouv.fr/datasets/plan-departemental-des-itineraires-de-promenades-et-de-randonnees-pdipr-chemin-de-grande-randonnee
  (Departement du Gard, about 1,100 km of GR footpaths, GeoJSON plus CSV,
  last updated 2025-12-31). Another:
  https://data.le64.fr/explore/dataset/itineraires_randonnee_64/map/
- Licence: Licence Ouverte / Open Licence version 2.0 (Etalab),
  https://www.etalab.gouv.fr/licence-ouverte-open-licence/ for the Gard
  dataset. Per-departement, so it must be checked dataset by dataset.
- Access: data.gouv.fr resource downloads, some via OpenDataSoft APIs.
- Per-feature coordinates: yes.
- Harvesting allowed: yes for the Licence Ouverte ones.
- Verdict: **use**, selectively. This is the legally safest route to French
  GR geometry and names (see the FFRandonnee problem in section 3), because
  the departement is the PDIPR authority and publishes under an open licence
  in its own right.

#### refuges.info (France, Alps and Pyrenees)

- URL: https://www.refuges.info/api/doc/ , licence page
  https://www.refuges.info/wiki/licence
- What it gives: refuges, gites, cabanes, bivouac spots and water points as
  points, with descriptions. The API's OSM passthrough (springs, fountains,
  drinking water) is ODbL and separate.
- Licence: Creative Commons BY-SA 2.0 FR,
  https://creativecommons.org/licenses/by-sa/2.0/fr/legalcode.fr .
  Attribution "©Les contributeurs de Refuges.info", per-author credit for
  photos and comments, share-alike on modified content.
- Access: documented public API with bulk export.
- Per-feature coordinates: yes.
- Harvesting allowed: yes, commercial use permitted under CC BY-SA.
- Verdict: **use** as a support-point layer (huts, water) for FR multi-day
  hikes and for the running water question. Take the point facts, do not
  reproduce the prose (share-alike), exactly the posture `describe.py`
  already takes with Wikivoyage.

#### OSM member-way tags from the extracts already downloaded

- URL: https://wiki.openstreetmap.org/wiki/Key:trail_visibility ,
  https://wiki.openstreetmap.org/wiki/Key:surface
- What it gives: per-way `surface`, `sac_scale`, `trail_visibility`,
  `tracktype`, `incline`, `width`, `highway` class. Usage counts from
  taginfo, retrieved 2026-08-17:
  surface 80,327,925 objects (79,810,517 ways);
  sac_scale 913,977 objects (911,257 ways);
  trail_visibility 917,011 objects (916,241 ways).
- Licence: ODbL 1.0, already in the ledger.
- Access: the Geofabrik extracts are already cached under
  `data/raw/geofabrik/`. `ingest_osm_routes.py` already loads member way node
  refs in pass 2, so the tags are in hand and are simply being discarded.
- Per-feature coordinates: yes (they are the geometry).
- Harvesting allowed: yes, already harvested.
- Verdict: **use**. This is the highest value change per unit of work in the
  whole list: no new source, no new licence row, and it unlocks the entire
  running facet plus a real difficulty signal for hiking.

#### OSM support infrastructure from the same extracts

- `amenity=drinking_water`, `natural=spring`, `tourism=alpine_hut`,
  `tourism=wilderness_hut`, `amenity=shelter`, `tourism=viewpoint`,
  `natural=peak`.
- Licence: ODbL 1.0, already in the ledger.
- Verdict: **use**. Feeds both the scenery ranking signal and the running
  water-availability signal.

#### Wikidata hiking trail class

- URL: https://query.wikidata.org/ , class Q2143825 (hiking trail).
- Measured 2026-08-17 via WDQS: 3,172 items that are instances or subclasses
  of Q2143825 and carry coordinates (P625), worldwide.
- Licence: CC0, already in the ledger.
- Verdict: **use**, as a *name to article resolution* set rather than as
  geometry. This is the honest fix for the Besseggen blind spot in
  `TRAILS_EXPANSION_PLAN.md` Wave C: instead of hoping the OSM relation
  carries a `wikidata` tag, resolve the route name against this bounded set
  of 3,172 coordinate-bearing trail items, with a distance gate (the item's
  coordinate must fall near the line) plus a folded-name gate. That is a
  verification-gated resolution pass, not a guess.

### 2.2 Maybe: open in principle, patchy or unconfirmed in practice

#### German Land geoportals

- NRW open geodata licence is Datenlizenz Deutschland 2.0 Namensnennung
  (dl-de/by-2-0), see https://www.im.nrw/themen/vermessung/open-data and
  https://www.gdi.nrw/komponenten/open-data-downloadclient-eine-komponente-der-gdi-nrw
  . Hiking-trail WFS coverage found so far is district level (Kleve and
  Wesel) rather than statewide, via https://open.nrw/ .
  Thueringen publishes under the same dl-de/by-2-0 family
  (https://geomis.geoportal-th.de/).
  The federal catalogue lists Wanderwege datasets across several Laender:
  https://gdk.gdi-de.org/geonetwork/srv/search?keyword=Wanderwege
- Verdict: **maybe**, UNVERIFIED per dataset. Germany's trail geometry is
  held at Land and Kreis level and nothing found is nationwide. The confirmed
  Bavaria BVV loader already in the ledger remains the pattern: one clean
  Land at a time, each needing its own ledger row.

#### Toerisme Vlaanderen, wandelnetwerk (Flanders)

- URL: https://data.toerismevlaanderen.be/tourist/routes/hiking_node_network_v2 ,
  metadata https://metadata.vlaanderen.be/srv/api/records/621a818c-273b-4d33-86fa-0fc9d549b786
- What it gives: the numbered walking node network of Flanders (nodes plus
  connecting segments), aggregated from the five provincial tourism bodies,
  updated weekly, WMS/WFS/ArcGIS plus a Shapefile at
  http://media.toerismevlaanderen.be/OpenData/routebeheer/data/shp/wandelnetwerk.shp.zip
- Licence: UNVERIFIED. The portal states the data can be viewed without
  registration, but also that using the download service in an application
  requires requesting a licence from Toerisme Vlaanderen.
- Per-feature coordinates: yes.
- Harvesting allowed: unclear until that licence question is answered.
- Verdict: **maybe**. Also a poor fit conceptually: a node network is not a
  named trail, and Carta ranks named routes. Low priority.

#### Den Faelles Friluftsdatabase / GeoFA (Denmark)

- URL: https://www.opendata.dk/andres-data/udinaturen-dk ,
  spec https://www.geodanmark.dk/wp-content/uploads/2019/10/SPEC-GeoFA-specifikation-2.5.1.pdf
  , consumer portal https://udinaturen.dk/om-udinaturendk/
- What it gives: about 2,000 hiking routes plus shelters and fire pits,
  municipality-maintained, served as WFS 2.0 and GeoJSON.
- Licence: UNVERIFIED. The programme describes the data as open and free for
  third parties to retrieve and use, but the opendata.dk dataset page
  returned HTTP 403 to an automated fetch, so no licence string was read from
  a primary page.
- Per-feature coordinates: yes.
- Verdict: **maybe**. Confirm the licence string on opendata.dk in a browser
  before writing a loader.

#### Nasjonal Turbase (Norway, DNT)

- URL: https://github.com/Turbasen/Turbasen ,
  https://developer.nasjonalturbase.no/
- What it gives: the Norwegian national trekking database (trips, cabins,
  areas) behind ut.no.
- Licence: UNVERIFIED, no licence statement found. Access needs an API key.
- Verdict: **maybe**, low priority. Norway's geometry need is already met by
  Kartverket Turrutebasen (CC BY 4.0, already in the ledger and already
  loaded). Turbase's marginal value would be DNT cabin data and curated trip
  descriptions, and the descriptions would be the licence-risky part.

#### SchweizMobil / Wanderland Schweiz

- URL: https://opendata.swiss/de/dataset/langsamverkehr-wanderland-schweiz ,
  https://opendata.swiss/en/dataset/schweizmobil-routen
- What it gives: the national, regional and local **named and numbered**
  hiking routes of Switzerland and Liechtenstein, published under the
  Geoinformation Ordinance with ASTRA, Schweizer Wanderwege, SchweizMobil and
  the cantons.
- Licence: UNVERIFIED. opendata.swiss returned HTTP 403 to automated fetches
  of both the dataset page and its CKAN API, so the terms-of-use class was
  not read.
- Per-feature coordinates: yes.
- Verdict: **maybe, and worth the manual check.** This is materially better
  than what CH uses today: swisstopo swissTLM3D Wanderwege is the *network*
  (every waymarked path), whereas Wanderland is the *route product* (Via
  Alpina is route 1, ViaGottardo is 7, and so on). Named national routes with
  official numbering is exactly the designation layer the ranking lacks.

#### Waymarked Trails

- URL: https://hiking.waymarkedtrails.org
- Already assessed by the repo and rejected as superseded by direct OSM
  relation ingest (`TRAILS_EXPANSION_PLAN.md`, "Explicitly not doing").
  Nothing found changes that: it is the same ODbL OSM data with a rendering
  layer on top.
- Verdict: **reject** (superseded, not forbidden).

### 2.3 Reject: terms forbid it, or the data is not open

#### FFRandonnee GR, GR de Pays and PR itineraries (France)

- URL: https://www.ffrandonnee.fr/la-federation/qui-sommes-nous/la-propriete-intellectuelle-federale
  , OSM community analysis at
  https://wiki.openstreetmap.org/wiki/France/Itin%C3%A9raires_p%C3%A9destres_GR%E2%84%A2_et_GRP%E2%84%A2
- Position: FFRandonnee asserts copyright over the itineraries themselves
  (French courts have treated routes as "oeuvres de l'esprit" since a 1998
  Cour de cassation decision) **and** holds INPI-registered trademarks on
  GR®, GR® de Pays, PR and the white-red, yellow-red and yellow blaze marks.
  The federation's own pages state GR® routes may be used for personal,
  non-commercial purposes only. In 2022 the federation asked a site rendering
  Waymarked Trails to stop displaying the blaze marks. In 2025 the French OSM
  community began an inventory of GRP relations in OSM to decide between
  deletion and warning tags.
- Verdict: **reject** as a source. There is no open licence and the rights
  holder actively enforces. See section 3 for what this means for data Carta
  already ships.

#### Wandelnet, LAW and streekpaden (Netherlands)

- URL: dataset record https://data.overheid.nl/en/dataset/10610-lange-afstandswandelroutes--law--s- ,
  OSM discussion https://forum.openstreetmap.org/viewtopic.php?id=70749
- Position: Stichting Wandelnet holds the rights and the LAW trademark. The
  data carries a Geo Gedeeld licence with named attribution, purpose
  limitation and an explicit prohibition on redistribution, and the
  foundation does not permit publishing these routes in OpenStreetMap or on
  other websites.
- Verdict: **reject**. Redistribution prohibited, which is precisely what
  Carta's wire export does.

#### Klub ceskych turistu marked trails (Czechia)

- URL: https://kct.cz/turisticke-znaceni/ , community note
  https://openstreetmap.cz/turistika
- Position: KCT publishes only a list of trails as open data; the route
  geometry is sold commercially (for example to mapy.cz).
- Verdict: **reject** the KCT geometry. Czech OSM coverage is community
  surveyed and is the route in; treat CZ as an OSM-only country.

#### alpenvereinaktiv (DAV, OeAV, AVS) and Outdooractive

- URL: https://www.alpenverein.de/verband/sponsoren-partner/tourenpartner/outdooractive
  , platform https://www.alpenvereinaktiv.com/
- Position: since 2019 alpenvereinaktiv is a white-label of the commercial
  Outdooractive platform; the alpine clubs supply editorial content,
  Outdooractive owns the technology, the accounts and the subscriptions.
  No open data licence is offered.
- Verdict: **reject**. UNVERIFIED on the exact prohibiting clause: the ToS
  text itself was not read, but no open licence exists, which is sufficient
  to reject.

#### Komoot, AllTrails, Wikiloc

- Komoot terms: https://www.komoot.com/terms-of-service (users are
  prohibited from exporting, distributing or publishing tours other than
  through the offered export function). AllTrails deploys bot-management
  (DataDome) against automated extraction of its listings.
- Verdict: **reject**, and already permanently out per the repo's own plan.

#### Strava (API, Segments, Heatmap, Metro)

- URL: https://www.strava.com/legal/api , https://www.strava.com/legal/api_policy ,
  https://press.strava.com/articles/updates-to-stravas-api-agreement
- Position: the API agreement forbids using Strava Data (or anything derived,
  aggregated or anonymised from it) in AI applications, forbids storing
  Strava Data or derivatives in any "Persistent Index" (which explicitly
  includes archives and any store configured for later retrieval), and
  restricts display of a user's activity data to that user. Segment Explore
  is being moved to an extended tier.
- Verdict: **reject**, unambiguously. This hurts: Strava usage density is the
  single best "which trails do runners actually run" signal in existence, and
  it is closed. Say so in the product rather than faking it.

#### ITRA (International Trail Running Association) race database

- URL: https://itra.run/info/generalconditions , https://itra.run/Info/PrivacyPolicy
- Position: race and result records are entered by organisers; the site
  offers no open data licence, and the API surface carries personal data
  under GDPR-relevant terms. Third-party scrapers exist on Apify, which is
  not permission.
- Verdict: **reject** as a harvest source. A race calendar could still be
  linked out to.

#### parkrun

- URL: https://www.parkrun.com/api/
- Position: the parkrun API programme is on hold pending a review of their
  API strategy; no open data licence is published for the events feed. The
  ecosystem runs on reverse-engineered clients.
- Verdict: **reject** for harvesting. It would have been a tidy running
  layer (fixed, weekly, free 5 km courses across Europe) but there is no
  permission to take it.

#### European Ramblers Association E-paths

- URL: https://www.era-ewv-ferp.org/e-paths/
- Position: ERA describes the E1 to E12 network editorially; no licensed data
  download was found, and ERA's own pages point at Waymarked Trails (that is,
  at OSM) for GPX.
- Verdict: **reject** as a data source. **Use the concept, not the data**:
  the E-path designation already exists in OSM as `network=iwn` relations
  with `ref=E1` and kin, and `popularity.py` already scores iwn highest. No
  new source needed to surface "this is a European long distance path".

---

## 3. Pitfalls, including one that touches data already shipped

1. **France, GR names and geometry are already in the wire.**
   `popularity.py` SPOT_CHECKS names "gr 20", "tour du mont blanc", "gr 5"
   for FR, and `ingest_osm_routes.py` spot-checks `GR%`. FR.json is 692 KB of
   published trips. FFRandonnee claims copyright on the itineraries and
   trademarks on the GR marks, and the French OSM community is actively
   deciding whether to delete GRP relations. Three consequences:
   (a) never reproduce the white-red or yellow-red blaze symbols in the UI,
   which is the trademark claim at its strongest;
   (b) prefer departement PDIPR datasets under Licence Ouverte 2.0 and IGN
   BD TOPO `itineraire_autre` (already loaded, Etalab 2.0) as the naming
   authority for French routes, since those publishers hold their own rights;
   (c) expect a future re-ingest to silently lose French routes if OSM
   deletes the relations, so `regression.py` should treat "published trip
   whose source relation vanished" as an alert, not as noise.
2. **INFOMONT is OSM-derived, so it cannot cross-check OSM.** Wiring it into
   `crosscheck_portals.py` alongside swisstopo and Kartverket would produce a
   high agreement rate that means nothing. Load it as an attribute source
   (CAI numbering, E/EE/EEA grade, refuge links) on a separate table.
3. **Redistribution-prohibited sources are the exact shape of the wire.**
   Wandelnet forbids republication. The trails export publishes produced
   works with geometry. A "we only publish selected items" posture does not
   rescue a source whose licence bans redistribution, unlike ODbL where it
   does help.
4. **ArcGIS FeatureServer paging.** Sport Ireland and Natural England both
   serve through ArcGIS REST, which caps a response at the service's
   `maxRecordCount` (commonly 1000 or 2000) and requires
   `resultOffset`/`resultRecordCount` paging. This is the same offset-paging
   trap the OpenTripMap harvest hit; write the loader with paging from the
   start and assert the returned count against
   `returnCountOnly=true`.
5. **Licence mixing across one map layer.** A single published trip could end
   up carrying ODbL geometry (OSM), CC0 attributes (Naturvardsverket), CC BY
   attributes (Sport Ireland, LIPAS, Kartverket), OGL v3 (Natural England,
   NatureScot), Etalab 2.0 (IGN, PDIPR) and a bespoke ministry credit (Spain).
   The per-trip `attribution_text` field already exists and is the right
   place, but it must become a list, and `export_wire.py` must compose it
   from the sources that actually contributed to that trip, not from a
   per-country constant.
6. **Share-alike still travels with attributes, not just geometry.** An
   ODbL-derived surface rollup stitched onto a published trip is
   ODbL-derived. The produced-work posture keeps the *database* obligations
   in the lab, but the per-item credit must name OSM wherever an OSM-derived
   attribute is displayed.
7. **Country coverage does not match Geofabrik cuts.** Sport Ireland covers
   the Republic only, Natural England covers England only, NatureScot covers
   Scotland only, and Geofabrik's `great-britain` excludes Northern Ireland
   while `ireland-and-northern-ireland` includes it (already a known bbox
   issue in the ingest). A designation join keyed on the stored country code
   will mis-flag NI trails unless it is keyed on geometry.
8. **Wire weight.** NO.json is 677 KB and FR.json 692 KB at 760 trips total.
   Per-way surface rollups and per-100 m grade arrays must live in
   `trip/{id}.json`, not in the country file. Only the scalars (a surface
   mix summary, a runnable-share percentage, a run score) belong in the list
   payload.
9. **Trademarks on names, not just data.** GR®, GR® de Pays and PR
   (FFRandonnee) and LAW (Wandelnet) are registered marks. Naming a route in
   a descriptive list is a different act from reproducing its waymark; keep
   the UI on the first side of that line.
10. **The fame layer's blind spot is not fixed by any of these sources.**
    National registries say a trail is designated, not that anyone loves it.
    The Besseggen case (famous, untagged, no nearby catalogue anchor) needs
    the Wikidata name-resolution pass, not another portal.

---

## 4. Is "best trails to RUN" a separate category?

**Verdict: a separate view over the same trips, not a separate catalogue and
not a separate ingest.**

Why not separate data: there is no open corpus of trail-running routes in
Europe. OSM's `route=running` has 1,441 objects worldwide (1,352 relations),
measured on taginfo 2026-08-17, against 43.4k hiking relations already
ingested for four countries alone. Every credible running source is closed:
Strava's API agreement forbids storing derived data at all, ITRA publishes no
licence, parkrun's API programme is suspended. Building a running catalogue
from open data means re-scoring hiking geometry, because that is what runners
actually run.

Why it still deserves its own facet: the *ranking* is genuinely different.
A trail that is a great hike can be a bad run and the reverse. The four
discriminating variables the user named all exist in data Carta already
holds or can get for free.

### 4.1 What separates a run from a hike, and where each fact comes from

| Facet | Signal | Source | Status |
|---|---|---|---|
| Surface | length-weighted share of member ways by `surface` (`ground`, `dirt`, `gravel`, `compacted` runnable; `asphalt`, `paved` less so; `rock`, `scree` not) and `tracktype` | OSM member ways in the Geofabrik extracts already cached | **Not collected.** `KEEP_TAGS` keeps relation tags only |
| Gradient | max sustained grade over a rolling 100 m window, share of length above 15 percent, longest continuously runnable segment, net vs gross climb | Copernicus GLO-30 Z already sampled per vertex by `elevation.py` | Data present, metrics not derived |
| Loop | `roundtrip=yes`, or endpoints within a tolerance, already implemented for the dayhikes family in `popularity.py` | OSM relation tags plus PostGIS | Present, needs promoting into a first-class field |
| Waymarking | `osmc:symbol`, `osmc:status`, `network` already kept | OSM relation tags | Present, unused in ranking beyond network level |
| Technicality | `sac_scale` (913,977 objects) and `trail_visibility` (917,011 objects) rolled up per way, not just the relation-level tag | OSM member ways | **Not collected** at way level |
| Return logistics | distance from each endpoint to a transit stop, so a point-to-point run is runnable without a car shuttle | Transitous reach artifacts already built (contract D) plus GTFS stops | Present for BRU/CRL only, needs extending |
| Water | `amenity=drinking_water`, `natural=spring`, plus refuges.info points in the French mountains | OSM extracts (ODbL, in ledger), refuges.info (CC BY-SA 2.0 FR) | Not collected |
| Official grade | CAI T/E/EE/EEA, Sport Ireland trail grade, Swedish surface material | INFOMONT, Sport Ireland, Naturvardsverket | Not collected |

### 4.2 Concretely, the running score

A `run_score` computed in `validate.py` or a new `runnability.py`, stored on
the trip, exported as a scalar plus a small breakdown:

- runnable distance band: 8 to 30 km scores best, under 5 km and over 45 km
  ramp down (mirrors the existing `full_length_km` ramp idea)
- gradient: penalise share of length above 15 percent grade; reward a long
  continuous sub-8 percent stretch
- surface: reward unpaved-but-firm share, penalise both asphalt share and
  rock/scree share
- technicality: `sac_scale` above T2 or `trail_visibility` worse than `good`
  on more than a small share of length caps the score
- loop bonus, or transit-return bonus for point-to-point
- waymarking bonus (`osmc:symbol` present)
- water bonus (a drinking water point every N km)

Then ship it as a `run` facet: the same trails tab, a Run chip beside Hike
and Day hike, sorted by `run_score` and filtered to `runnable=true`. The wire
gains three scalars per trip, not a second file set.

### 4.3 The honesty constraint

Without Strava-class usage data there is no evidence about which trails
runners *choose*. What this stack can honestly compute is **suitability**,
not popularity-among-runners. The copy should say "runnable" or "good
underfoot for running", never "most popular with runners". That distinction
is the same discipline `describe.py` already enforces with its fact-mapping
verification pass.

---

## 5. Recommended build order

1. **Way-tag rollup in `ingest_osm_routes.py`** (no new licence, no new
   source): during pass 2, accumulate per-member-way `surface`, `sac_scale`,
   `trail_visibility`, `tracktype`, `highway`, `incline`, weighted by way
   length, into a `way_profile` JSONB column. This single change unlocks the
   running facet, a real difficulty signal for hiking, and a better
   `difficulty` check in `validate.py`.
2. **`runnability.py`**: derive the gradient metrics from the Z already
   stored, combine with the way profile, write `run_score` plus `runnable`.
   Extend `popularity.py` with a `--family trailrun` shortlist, exactly the
   way the dayhikes family was added.
3. **Designation joins, one country per PR**: Sport Ireland (CC BY 4.0),
   Natural England (OGL v3), NatureScot (OGL v3), Naturvardsverket (CC0),
   LIPAS (CC BY 4.0), Caminos Naturales (ministry credit). Each is a
   `portal_trails`-style staging table plus a new `official_designation`
   check, and each needs its ledger row before merge. These six cover
   IE, GB-England, GB-Scotland, SE, FI and ES, which is most of the
   next-ingest wave.
4. **Manual licence checks** that automation could not read: opendata.swiss
   (Wanderland Schweiz, the biggest single quality win for CH), opendata.dk
   (GeoFA friluftsliv), the exact NatureScot layer slug, Geoportale Lombardia
   REL.
5. **Wikidata name resolution pass** against the 3,172 coordinate-bearing
   hiking-trail items, distance-gated and name-folded, to close the day-hike
   fame blind spot without inventing a signal.
6. **INFOMONT as an attribute source for Italy**, explicitly not as a
   geometry cross-check, when IT gets its deep pass.
7. **refuges.info support points** for FR, facts only, no prose.

---

## 6. Gaps, stated plainly

Marked UNVERIFIED above and repeated here so nothing is quietly assumed:

- opendata.swiss returned 403 to automated fetches of both the dataset page
  and the CKAN API, so the licence class of Wanderland Schweiz and
  SchweizMobil-Routen is unknown. Check in a browser before building.
- opendata.dk returned 403, so the Danish GeoFA friluftsliv licence string is
  unread. The programme's own words are "open" and "free for third parties",
  which is a description, not a licence.
- Nasjonal Turbase publishes no licence statement that was findable.
- Toerisme Vlaanderen requires a requested licence for the download service;
  the terms of that licence are unknown.
- The exact NatureScot dataset slug for Scotland's Great Trails was not
  opened; only the portal-wide OGL v3 statement was confirmed.
- Geoportale Lombardia REL CC BY 4.0 is taken from the OSM wiki, not from the
  Lombardia dataset page.
- alpenvereinaktiv and AllTrails were rejected on the absence of an open
  licence and on secondary reporting of their anti-extraction posture; their
  full ToS texts were not read line by line. Komoot's export prohibition and
  Strava's API agreement clauses were read from their own pages.
- German Land hiking datasets: the dl-de/by-2-0 licence family is confirmed
  for NRW and Thueringen geodata generally, but no specific statewide hiking
  route dataset was opened and confirmed.
- Portugal (FCMP homologated Grandes Rotas), Poland (PTTK), Slovenia (PZS),
  Slovakia (KST), Greece and the Balkans were not researched. The pattern
  from CZ, FR and NL suggests federation-held registries are usually closed
  and OSM is the practical route in, but that is an inference, not a finding.
