# Carta data license ledger

Every external data source currently in use, its license, and where (or
whether) it is attributed today. Compiled 2026-08-06 from the ingestion
roster (`python -m src.ingestion.run_all --list`, 29 collectors), the
`pipeline/harvest_*.py` headers, the runtime services the app calls from the
browser, and the price-map blueprint's license notes.

Rules of the ledger:

- A new collector or harvester must add a row here before it ships.
- "Attribution required" is what the license or terms demand, not what we
  currently do. Gaps are marked MISSING in the last column and collected in
  the follow-up list at the bottom.
- `continent-app/src/data/attribution.js` is derived from this table: every
  row with a required user-facing credit has an entry there, and the Data
  sources screen renders it (Account panel, `auth/AccountPanel.jsx`).
- Entries marked "verify" carry a license claim taken from the portal or from
  general knowledge that has not been confirmed against the current terms
  text; confirm before relying on it.

## 1. Flight fares, direct carrier harvest (primary source)

| Source | What we take | License | Attribution required | Share-alike | Where attributed today |
|---|---|---|---|---|---|
| Ryanair farefinder API (`pipeline/harvest_all_origins.py`, `harvest_flight_times.py`) | Cheapest fare per day per route, departure and arrival times | None: public unauthenticated endpoint, direct harvest. Prices are facts; ToS risk accepted and kept polite (rate limits, resumable runs) | No | No | Carrier shown on fare surfaces (provenance code FR) |
| Wizz Air timetable API (`pipeline/harvest_wizzair.py`) | Per-day fares both directions, converted to EUR | Same as Ryanair: public endpoint, direct harvest | No | No | Carrier shown (provenance code W6) |
| Vueling apiw endpoints (`pipeline/harvest_vueling.py`) | Route discovery plus full per-day fare calendar | Same: public endpoint, direct harvest | No | No | Carrier shown (provenance code VY) |
| Volotea getminprice API (`pipeline/harvest_volotea.py`) | Cheapest fare per window per route | Same: public endpoint with a static site key, direct harvest | No | No | Carrier shown (provenance code V7) |
| ExchangeRate-API open endpoint (open.er-api.com, used by `harvest_wizzair.py`) | Daily EUR conversion table (`cache/fx_rates_eur.json`) | Free open endpoint; terms require a credit link ("Rates by Exchange Rate API"), verify current wording | Yes | No | Home footer, Data sources block |

## 2. Fare caches and partner APIs

| Source | What we take | License | Attribution required | Share-alike | Where attributed today |
|---|---|---|---|---|---|
| Travelpayouts / Aviasales (collector: travelpayouts) | Cached fares for carriers Carta cannot scrape, staged to `data/derived/tp_fares.json` | Affiliate programme API terms; data shown with affiliate deeplinks | Deeplink with partner marker per programme terms; verify display wording rules | No | Deeplinks carry the marker; fare provenance label (TP) in the UI |
| Hostelworld Partner API (`pipeline/harvest_hostelworld.py`) | Per-city dorm and private-room price medians | Partner / affiliate agreement (credentials pending per stay-tier notes) | Per agreement, verify | No | MISSING, verify agreement display terms |
| LiteAPI, Nuitee (`pipeline/harvest_hotels_liteapi.py`) | Per-city 3-star and 4/5-star entry-price medians | LiteAPI terms of service (self-service key) | Per terms, verify | No | MISSING, verify |
| Ferryhopper trips widget (collector: ferryhopper) | Port pairs, schedules, base fares (sampling) | Commercial aggregator, no open license. Ingestion README: keep sampling gentle and confirm terms before scaling | n/a | No | Not user-facing yet. RISK: confirm terms before any display |
| Omio | Nothing today: outbound deeplinks only (Impact affiliate, `continent-app/src/lib/omio.js`) | Impact programme terms | n/a | No | n/a. Price display is the subject of `omio_outreach.md` |
| Flix prices | Nothing today (the GTFS schedule feed has its own row in section 4, prices are not taken) | n/a | n/a | No | n/a. Price display is the subject of `flix_outreach.md` |

## 3. National timetable feeds (ingestion, naps group)

Raw ETL into `data/raw/`, not shipped to users directly; they feed the ground
transport calibration and reach layers, so required credits still belong in
the app once those surfaces render from this data.

| Source | What we take | License | Attribution required | Share-alike | Where attributed today |
|---|---|---|---|---|---|
| public-transport.earth index (collector: pan_europe) | Aggregated GTFS and NeTEx archives it links | Per linked feed, varies | Per feed | Some feeds | Raw ETL only |
| GTFS.de / DELFI plus Mobilithek (collector: germany) | DE national GTFS (long distance, regional, local), Mobilithek subscription feeds | GTFS.de: CC BY-SA 4.0 per blueprint, free tier requires attribution (per `CREDENTIALS.md`). Mobilithek datasets mostly dl-de/by-2.0, verify per dataset | Yes | Yes (CC BY-SA) | Home footer, Data sources block |
| transport.data.gouv.fr / SNCF (collector: france_static) | SNCF static GTFS and NeTEx (TGV, OUIGO, Intercites, TER) | ODbL per blueprint; some datasets licence ouverte, verify per dataset | Yes | Yes (ODbL derived database) | Home footer, Data sources block |
| Mobility Data Austria (collector: austria) | NeTEx and GTFS for rail, bus, tram, cableway | Shared portal license, account-gated acceptance | Per license, verify | Verify | Raw ETL only |
| Belgian operators: SNCB, De Lijn, STIB, TEC (collector: belgium) | GTFS static and realtime, SNCB NeTEx EPIP | Per-operator open data terms (keys for De Lijn and STIB) | Typically yes, verify per operator | No | MISSING |
| Danish NAP plus Rejseplanen (collector: denmark) | Rail, metro, bus, ferry feeds | Account terms (Rejseplanen Labs) | Per terms, verify | No | Raw ETL only |
| Traficom FinAP plus Digitraffic (collector: finland) | FinAP catalogue, Digitraffic open rail JSON | Digitraffic: CC BY 4.0. FinAP per dataset | Yes (Digitraffic) | No | Home footer, Data sources block |
| NDOV Loket / OVapi (collector: netherlands) | NL national GTFS, NeTEx deliveries | CC0 per blueprint and collector header | No | No | None needed |
| Entur (collector: norway) | NO national GTFS, NeTEx, SIRI ET/SX/VM | NLOD (Norwegian licence for open government data) | Yes | No | Home footer, Data sources block |
| Trafiklab / Samtrafiken (collector: sweden) | GTFS Sweden 3, NeTEx Sweden, regional feeds | CC0 per collector header, verify per feed | No | No | None needed |
| opentransportdata.swiss (collector: switzerland) | GTFS, NeTEx, HRDF via the DCAT catalogue | Portal terms of use (free token) | Yes per portal terms, verify | No | Home footer, Data sources block |
| Renfe open data (collector: spain) | Renfe GTFS (AVE, LD, Cercanias), CKAN datasets, NAP snapshot | Renfe portal terms, verify per dataset | Per terms, verify | No | Raw ETL only |

## 4. Rail, aviation, maritime, pricing history and events collectors

| Source | What we take | License | Attribution required | Share-alike | Where attributed today |
|---|---|---|---|---|---|
| SNCF GTFS-RT plus SIRI SX Lite (collector: sncf_realtime) | Trip updates, disruption messages | ODbL via the French NAP | Yes | Yes | Raw ETL only, MISSING once surfaced |
| French NAP cross-border feeds (collector: france_crossborder) | Eurostar, Trenitalia France, Renfe international | ODbL or licence ouverte per dataset, verify | Yes | Varies | Raw ETL only |
| ERA registers (collector: era) | ERADIS, ERSAD accessibility, RINF exports | EU open data reuse (Commission Decision 2011/833/EU), verify | Yes, source acknowledgement | No | Raw ETL only |
| OpenSky Network (collectors: opensky, opensky_scientific) | ADS-B state snapshots, per-airport arrivals and departures, bulk Trino flights table | OpenSky terms of use: research orientation, citation requested; commercial use needs a separate OpenSky agreement, verify | Yes, citation | No | Raw ETL only. RISK: resolve the commercial-use question before any user-facing feature builds on it |
| EUROCONTROL STATFOR (collector: eurocontrol_statfor) | Public statistics downloads | © EUROCONTROL, reuse with source acknowledgement, verify conditions | Yes | No | Raw ETL only |
| EUROCONTROL DDR / ADRR (collector: eurocontrol_ddr) | Manually staged restricted research files | Restricted research access, no redistribution | n/a | No | Never user-facing, keep internal only |
| Nordic ferry feeds via Entur and Trafiklab (collector: nordic_ferries) | Per-operator ferry archives (Hurtigruten, archipelago) | Entur NLOD, Trafiklab CC0 | Yes (Entur part) | No | Home footer, Data sources block (the Entur credit) |
| Flix EU GTFS feed (collector: flixbus_gtfs) | Coach network schedules and stops, folded into `data/derived/flix_network.json` (contract E) | Primary endpoint (gtfs.gis.flix.tech) publishes no explicit license; the NDOV loket mirror is CC0 1.0. The collector records which source served the zip in the contract's meta.license | Per served source: none required for the CC0 mirror; unclear for the primary, which is one reason `flix_outreach.md` exists | No | Contract meta records the license; UI credit not required today (schedules feed estimates, no Flix prices shown) |
| Greek NAP (collector: greece_nap) | Maritime catalogue (Aegean, Ionian) | Per dataset (EU PSI reuse), verify | Per dataset | No | Raw ETL only |
| Kaggle Renfe archives (collector: renfe_kaggle) | AVE dynamic pricing history | Per Kaggle dataset page, verify | Per dataset, verify | Verify | Model training only |
| GitHub LCC price archives (collector: ryanair_archive) | Historical Ryanair, Wizz Air, easyJet scrape repos | Per repository license, verify each repo | Per repo, verify | Verify | Model training only |
| SNCF TGV MAX availability (collector: sncf_availability) | 30-day seat availability (occupancy proxy) | Unofficial public endpoint, no license | n/a | No | Model feature only |
| Nager.Date (collector: holidays) | Public holidays, current and next year | MIT | License notice in distribution, not user-facing; this ledger entry serves as the record | No | None needed in UI |
| OpenHolidays API (collector: school_holidays) | School holiday spans | Open data aggregated from per-country public sources, verify | Verify | No | Raw ETL only |

## 5. Destination content layers (pipeline harvesters)

| Source | What we take | License | Attribution required | Share-alike | Where attributed today |
|---|---|---|---|---|---|
| Inside Airbnb (`pipeline/harvest_accommodation.py`) | Listing-level nightly medians, per-city seasonality, per-capacity and neighbourhood medians | CC BY 4.0 (per harvester header) | Yes | No | Home footer, Data sources block |
| EEA WISE bathing water (`pipeline/harvest_bathing_water.py`) | Official bathing site classifications near each destination | EEA standard re-use policy, effectively CC BY 4.0, verify | Yes | No | WaterQualityBadge shows the rating; source credited in the Account panel's Data sources screen |
| WorldClim 2.1 (`pipeline/harvest_climate_worldclim.py`, RETIRED) | Monthly climate normals sampled per destination | Free for academic and other non-commercial use; commercial use needs permission | Yes, citation (Fick and Hijmans 2017) | No | RETIRED. The destination climate strip moved to NASA POWER and the lake season model moved to CHELSA V2.1 on 2026-08-30. No shipped wire is derived from WorldClim; the harvester and its cache are kept only so an old build can be reproduced |
| GeoNames cities500 (`pipeline/harvest_geonames.py`) | Population, settlement class, elevation, timezone | CC BY 4.0 (per harvester header) | Yes | No | Home footer, Data sources block |
| Wikipedia (`pipeline/harvest_images.py`, `harvest_pageviews.py`, `pipeline/trails/popularity.py`, live `cityResearch.js`) | Lead image pointers, article URLs, pageview counts, live summaries | Text CC BY-SA 4.0; pageview statistics CC0 | Yes for text | Yes for text | Image credit link on the destination hero (DetailPanel); live research names Wikipedia in the chat copy; Account panel's Data sources screen carries the text credit and licence |
| Wikimedia Commons (destination hero images, POI thumbnails via `harvest_pois_wikidata_images.py`) | Photo files hotlinked as thumbnails | Per file: CC BY-SA, CC BY or public domain | Yes, per file | Some files | Hero image links to its Wikipedia page (DetailPanel credit); Home footer, Data sources block credits Commons as a whole; per-file credit on POI thumbnails still MISSING |
| Bayerische Vermessungsverwaltung Wanderwege (`pipeline/trails/crosscheck_portals.py` DE loader) | Named signposted hiking-route GPX geometries, Bavaria, for the portal cross-check | CC BY 4.0 | Yes ("Bayerische Vermessungsverwaltung") | No | Trails credits block (validation source; no BVV geometry is published in the wire) |
| Wikidata (`pipeline/harvest_pois_wikidata_images.py`, `pipeline/harvest_poi_wikidata.py` QID/sitelink/P1435/P1174 per POI, `pipeline/backfill_landmarks.py` box harvest reused by `pipeline/score_significance.py` as per-POI sitelink evidence for the absolute significance (`it.sig`, 2026-09), `pipeline/trails/popularity.py` sitelink counts, live `cityResearch.js`) | Entity coordinates, labels, P18 image pointers, descriptions, sitelink counts, heritage designations, visitor counts | CC0 | No | No | None needed |
| Wikivoyage (`pipeline/harvest_wikivoyage.py`, `pipeline/harvest_wikivoyage_listings.py` See/Do listing names, coords, order and article status as a POI significance signal, activities tier 2) | Intro blurbs, See and Do listings | CC BY-SA 4.0 | Yes | Yes (blurb text; the listing-derived numeric rate signal is facts, not prose) | "Open the travel guide" link on the destination panel; Account panel's Data sources screen carries the blurb credit and licence |
| OpenTripMap (`pipeline/harvest_activities.py`, preferred tier) | POI lists with importance rate per destination | Free API tier; terms ask for a credit link, verify current wording | Yes | Underlying data derives from OSM and Wikidata | Home footer, Data sources block |
| Overture Maps Places (`pipeline/harvest_pois_overture.py`) | Bulk sightseeing POIs for the whole catalogue | CDLA-Permissive 2.0 | Not required, credit recommended | No | Home footer, Data sources block (the recommended credit) |
| OpenStreetMap via Overpass (`pipeline/harvest_protected_areas_osm.py`, live `cityResearch.js`) | Protected areas layer, live town POIs | ODbL 1.0 | Yes: © OpenStreetMap contributors | Yes: derived databases carry ODbL obligations | Map tiles credit OSM via the attribution control; the nature and POI layers shipped inside app_data.json are credited in the Account panel's Data sources screen. Share-alike review still needed for the OSM-derived slice of app_data.json |
| OpenStreetMap via Overpass (`pipeline/harvest_parking.py`) | amenity=parking spots near each destination centre: name, position, fee, capacity, park_ride; shipped as `public/destinfo/{CC}.json` | ODbL 1.0 | Yes: © OpenStreetMap contributors | Yes: the destinfo parking slice is an OSM-derived database | Explore panel's parking section prints the OSM credit; Account panel's Data sources screen (OSM entry covers it) |
| OpenStreetMap via Geofabrik country extracts (`pipeline/beaches/osm_extract.py`, read with pyosmium from `data/raw/geofabrik/`) and via Overpass for the 400 m context sweep (`pipeline/beaches/enrich_beaches.py`) | The bulk pass moved off Overpass onto the extracts in 03-BEACHES.md and widened with it: named and UNNAMED `natural=beach`, plus `natural=shingle`, `natural=sand`, `leisure=beach_resort` and `leisure=swimming_area`; the surface, lifeguard, nudism and access tags; the beach LENGTH read off the way or polygon geometry, which is the `space` component of beach_beauty_v2; and, for an unnamed beach, a name borrowed from the nearest named bay, cape or settlement within 300 m. Overpass still answers what stands within 400 m of a shortlisted beach. Shipped as `public/beaches/{CC}.json` | ODbL 1.0 | Yes: (c) OpenStreetMap contributors | Yes: the published rows are selected, scored and rewritten items (a produced work), and each carries its own ODbL credit. A name DERIVED from a neighbouring OSM feature is itself ODbL and ships marked as such (`nameSrc: "osm_near"`) | LIVE: per-beach `credit` array in the wire, the Beaches list prints the credit line, Account panel's Data sources screen |
| Wikidata beaches (`pipeline/beaches/harvest_beaches.py`) | Beach entities: label, local label, coordinates, admin region, P18 image, Commons category, sitelink count, length, protected-area and part-of links | CC0 | No | No | None needed; the beach page links the Wikidata item |
| Wikimedia Commons beach photographs (`pipeline/beaches/enrich_beaches.py`) | Three or four files per beach, found by name plus `nearcoord`, with LicenseShortName, LicenseUrl and Artist kept per file | Per file: CC BY-SA, CC BY, CC0 or public domain | Yes, per file | Some files | LIVE: author and licence printed under every photograph on the beach page, linking the Commons file page |
| Wikipedia beach articles (`pipeline/beaches/enrich_beaches.py`) | FACTS ONLY: a fixed vocabulary matched against the intro extract (substrate, water colour, cliffs, dunes, access, protection), plus the 60-day pageview count. No prose is stored or shipped | CC BY-SA 4.0 | Facts are not protected; no credit obligation for the extracted attributes | No, because no text is reused | The beach page links the article it read |
| EEA WISE bathing water, beach layer (`pipeline/beaches/enrich_beaches.py`, reads `cache/eea_bathing_water.json`) | The nearest official bathing site's class and previous class, per beach | EEA standard re-use policy, effectively CC BY 4.0, verify | Yes | No | LIVE: the class is a sentence on every beach page and a row in its facts, EEA credited in the list credit line and the Data sources screen |
| EEA WISE bathing water as a SPINE, beach layer (`pipeline/beaches/eea_spine.py`, merged by `harvest_beaches.merge_spine`, cache written by `pipeline/harvest_bathing_water.py --sites-only`) | The whole register rather than only the class: 22,289 designated bathing sites (14,861 coastal or transitional, 7,428 lake or river) with name, registry identifier, coordinate and up to ten seasons of classification. Sites that match a beach already found contribute their reading; sites nothing else knew about become catalogue rows in their own right, marked `nameSrc: "eea"` because the name is the member state's registry name and not necessarily the beach's | EEA standard re-use policy, effectively CC BY 4.0, verify | Yes | No | LIVE: the class is a sentence on every beach page and a row in its facts; every row that carries a class carries the EEA credit; Account panel's Data sources screen |
| Natura 2000 and the Emerald Network (`pipeline/beaches/protection.py`, EEA biodiversity ArcGIS `ProtectedSites/Natura2000Sites` layer 2 and `ProtectedSites/EmeraldSites` layers 0, 1 and 2) | 29,749 protected site POLYGONS (27,173 Natura 2000, 2,576 Emerald), each with its site code, name and member state, generalised to 50 m. Used to answer whether a beach is INSIDE a protected site, which the centroid cache it replaces could never prove. Emerald is the Bern Convention's non-EU twin, so the claim now works in the United Kingdom, Norway, Switzerland, the Western Balkans, Ukraine and Turkey instead of stopping at the EU border | CC BY 4.0 | Yes: European Environment Agency | No | LIVE: the `prot` block on the row, a fact row on the beach page, a filter chip, and the Natura credit line in every affected row's `credit` array |
| EEA coastline for analysis v3 (`pipeline/beaches/coastline.py`, already cached for the region spine) | Which way a beach faces. The land polygons answer "is this probe point sea or shore", which turns the local run of the coastline into an ASPECT, a true bearing from the sand out to the water; combined with the sunset azimuth for the latitude and the bathing season it answers "does the sun set over this beach". No new download: the file was already on disk for `pipeline/regions` | EEA standard re-use policy, effectively CC BY, verify | Yes: (c) European Environment Agency | No | LIVE: the `aspect` and `sunset` fields on the row, the Sunset filter chip and a fact row on the beach page; EEA row in Account > Data sources |
| Environment Agency and Natural Resources Wales bathing waters (`pipeline/beaches/uk_bathing.py`, `environment.data.gov.uk/bwq/`) | NOT YET INGESTED. The client is written to the documented linked-data API and the licence is clear; every path under `/bwq/` currently answers HTTP 403 from an Azure Application Gateway while the same host's root answers 200, so this is a network-level block rather than a retired service. Until it lifts, Great Britain publishes with the water component DROPPED and the remaining weights renormalised, never defaulted to a class nobody measured | Open Government Licence v3.0 | Yes, when ingested | No | n/a while nothing ships. SEPA (Scotland) and DAERA (Northern Ireland) are not wired at all and are recorded as open items in `docs/BEACHES.md` |
| Wikidata water bodies (`pipeline/lakes/harvest_lakes.py`) | Lake, reservoir and lagoon entities per country: label, local label, coordinates, admin region, P31 types, surface area, maximum depth, elevation, P18 image, Commons category, sitelink count, protected-area, part-of and basin-country links; shipped as `public/lakes/{CC}.json` | CC0 | No | No | None needed; the lake page links the Wikidata item |
| OpenStreetMap named water bodies via Geofabrik per-country extracts (`pipeline/lakes/osm_water.py`, extracts cached under `data/raw/geofabrik/`, filtered copies under `cache/lakes/osm_extract/`) | Every NAMED water area in a country (`natural=water`, `water=lake|reservoir|lagoon|pond`, `leisure=swimming_area`): name, centroid, ellipsoidal surface area, the `access`, `swimming`, `usage` and `wikidata` tags, and a shore block counted from the same extract (metres of walkable way within 50 m of the waterline, beaches, slipways, swimming places, marinas, piers, car parks, and the ways that say access=private). This is the layer's SECOND SPINE and is why Great Britain, Ireland, Norway and Iceland can publish a national list at all | ODbL 1.0 | Yes: (c) OpenStreetMap contributors | Yes: the published rows are selected, scored and rewritten items (a produced work), and each carries its own ODbL credit | LIVE: per-lake `credit` array in the wire, the Lakes list prints the credit line, Account panel's Data sources screen |
| OpenStreetMap via Overpass (`pipeline/lakes/enrich_lakes.py`) | What stands within the shore radius of each shortlisted water body: swimming areas, beaches, marinas, slipways, dive and boat rental, ferry terminals, parking, toilets, food, campsites, peaks, cliffs, glaciers, waterfalls, castles and how much is built; plus any `swimming` and `access` tags on the water itself. No country sweep for geometry, unlike the beach layer | ODbL 1.0 | Yes: (c) OpenStreetMap contributors | Yes: the published rows are selected, scored and rewritten items (a produced work), and each carries its own ODbL credit | LIVE: per-lake `credit` array in the wire, the Lakes list prints the credit line, Account panel's Data sources screen |
| Wikimedia Commons lake photographs (`pipeline/lakes/enrich_lakes.py`) | Up to five files per water body, found by Commons category, by name plus `nearcoord` and by geosearch at a radius scaled to the lake, with LicenseShortName, LicenseUrl and Artist kept per file | Per file: CC BY-SA, CC BY, CC0 or public domain | Yes, per file | Some files | LIVE: author and licence printed under every photograph on the lake page, linking the Commons file page |
| Wikipedia lake articles (`pipeline/lakes/enrich_lakes.py`) | FACTS ONLY: a fixed vocabulary matched against the intro extract (origin, surroundings, colour, activities, protection) plus the sentences that mention swimming, which are held in the CACHE ONLY so a prohibition can be detected, and the 60-day pageview count. No prose is stored in the wire or shipped | CC BY-SA 4.0 | Facts are not protected; no credit obligation for the extracted attributes | No, because no text is reused | The lake page links the article it read |
| EEA WISE bathing water, lake layer (`pipeline/lakes/enrich_lakes.py`, reads `cache/eea_bathing_water.json`) | Every Lake and River type bathing site within the water body's own shore radius: the best class, the previous class, and the COUNT of designated sites, which is the layer's strongest evidence that swimming somewhere is lawful and monitored | EEA standard re-use policy, effectively CC BY 4.0, verify | Yes, EEA and the Member State authorities that report the coordinates | No | LIVE: the class and the site count are rows in the lake page's facts, the count drives the swimming verdict, EEA credited in the list credit line and the Data sources screen |
| CHELSA V2.1, lake layer (`pipeline/lakes/lake_climate.py`, cropped once into `cache/lakes/chelsa`) | Monthly mean 2 m air temperature normals (1981-2010, 30 arc seconds) sampled at each lake's own coordinate, turned into a MODELLED surface temperature and swimming season. Published as an estimate, never as a measurement, with the model named in `public/lakes/index.json` | CC BY 4.0 | Yes, citation (Karger et al. 2017) | No | LIVE: the month strip on the lake page carries an estimate note; the per-lake `credit` array names CHELSA whenever a temperature series ships; Data sources block carries the citation. REPLACED WorldClim 2.1 on 2026-08-30 and closed its non-commercial risk item |
| Geograph Britain and Ireland (`pipeline/photos/geograph.py`; bulk dumps from data.geograph.org.uk for discovery, keyed syndicator API for the shortlisted thumbnails) | Photographs of GB and IE grid squares for the beach, lake, mountain and trail galleries where Commons is thin: title, photographer real name, capture date, WGS84 coordinate, thumbnail URL | CC BY-SA 2.0, per image | Yes, per image: photographer named, licence linked, image linked back to its geograph.org.uk page | Yes | Per-image author and licence in the wire and under every photograph, same fields as Commons; Geograph row in Account > Data sources |
| Mapillary (`pipeline/photos/mapillary.py`) | Street-level existence proof ONLY, for rows that would otherwise ship with zero images: image id, thumbnail, coordinate, capture date. Evidence tier `street`, which the selection rules bar from ever leading a card | CC BY-SA 4.0, per image | Yes, per image | Yes | Per-image credit in the wire; Mapillary row in Account > Data sources. Not yet live: no wire ships a `street` image until a layer harvest adopts it |
| Wikidata mountains (`pipeline/mountains/harvest_peaks.py`, reads the already harvested `cache/features_wikidata.json` spine) | Mountain, summit, hill and volcano entities per country: label, local label, coordinates, elevation, prominence, isolation, P18 image, Commons category, mountain range, protected area, P31 classes, sitelink count, and the P610 highest points of each country and its regions; shipped as `public/mountains/{CC}.json` | CC0 | No | No | None needed; the mountain page links the Wikidata item |
| OpenStreetMap via Overpass (`pipeline/mountains/enrich_peaks.py`) | What stands within 1.5 to 4 km of each shortlisted summit: aerialways and their stations, funicular and rack railways, alpine and wilderness huts, viewpoints, summit restaurants and cafes, parking, towers, observatories and summit crosses, glaciers, cliffs and aretes, national park boundaries, and the paths that carry a `sac_scale` or `via_ferrata_scale` grade. No country sweep for geometry | ODbL 1.0 | Yes: (c) OpenStreetMap contributors | Yes: the published rows are selected, scored and rewritten items (a produced work), and each carries its own ODbL credit | LIVE: per-mountain `credit` array in the wire, the Mountains list prints the credit line, Account panel's Data sources screen. The lift claim names OSM as its source on the page |
| Wikimedia Commons mountain photographs (`pipeline/mountains/enrich_peaks.py`) | Up to six files per mountain, found by Wikidata P18, by Commons category, by name plus `nearcoord`, and by geosearch at a radius scaled to the landform, with LicenseShortName, LicenseUrl and Artist kept per file, capped at two files per photographer | Per file: CC BY-SA, CC BY, CC0 or public domain | Yes, per file | Some files | LIVE: author and licence printed under every photograph on the mountain page, linking the Commons file page |
| Wikipedia mountain articles (`pipeline/mountains/enrich_peaks.py`) | FACTS ONLY: a fixed vocabulary matched against the intro extract (glacier, volcano, lifts, huts, via ferrata, protection, observatory, wildlife) plus the 60-day pageview count. No prose is stored in the wire or shipped, and an article mention of a cable car may only ever produce the weakest lift claim, "lifts on the mountain" | CC BY-SA 4.0 | Facts are not protected; no credit obligation for the extracted attributes | No, because no text is reused | The mountain page links the article it read, and names Wikipedia as the source of a lift claim that came from it |
| Wikidata recurring events (`pipeline/harvest_events.py`) | Festival/event entities with coordinates, labels, descriptions, sitelink counts, month of year; shipped as `public/destinfo/{CC}.json` | CC0 | No | No | None needed; the panel links each event's Wikipedia article |
| Open-Meteo forecast API (live, `continent-app/src/lib/weather.js`) | 7-day daily forecast fetched client-side when a destination panel is open | Free tier for non-commercial use, data CC BY 4.0; commercial use needs the paid API, verify Carta's affiliate status against their definition | Yes, link to Open-Meteo | No | Explore panel's weather section prints "Live forecast by Open-Meteo.com"; add to Data sources screen. RISK: commercial scope. This is now the LAST non-commercial source on a shipped surface, the WorldClim pair having been replaced on 2026-08-30; resolve with an API subscription if Carta monetises |
| Eurostat tour_occ_nin3 plus GISCO NUTS 3 boundaries (`pipeline/harvest_tourism_density.py`) | Regional tourism density (crowding tiers) | Eurostat reuse: CC BY 4.0. GISCO boundaries carry the EuroGeographics notice | Yes, both | No | Crowding tooltip cites Eurostat with year; the EuroGeographics boundary notice is in the Account panel's Data sources screen |
| Numbeo point anchors (`pipeline/gen_mock_data.py` country tables, oneoff calibrations) | Hand-read meal, drink and grocery price anchors used to seed lifestyle costs | Proprietary site, no open license; small hand-typed factual excerpts, not a bulk harvest | n/a | No | In-data source tags only. RISK: verify acceptable use, plan replacement with an open source over time |

## 6. Runtime services called from the browser

| Source | What we take | License | Attribution required | Share-alike | Where attributed today |
|---|---|---|---|---|---|
| CARTO Voyager basemap (all `src/map/*` components) | Vector tiles and map style, no API key | CARTO free basemap terms: require © CARTO plus © OpenStreetMap contributors, verify tier limits | Yes | No | Map attribution control (the style declares its credits, MapLibre renders them) |
| OSRM on FOSSGIS (`src/lib/routing.js`) | Walking and driving routes, ferry-aware | Public service usage policy; underlying data ODbL | OSM credit where routes render; FOSSGIS credit is courtesy | No | Privacy policy names the service; routes draw on the OSM-credited map |
| Nominatim (`src/lib/geocode.js`, `cityResearch.js`) | Address and place search | Public service usage policy; data ODbL | Yes, OSM credit | No | Privacy policy names the service |
| Overpass API (live town research, `cityResearch.js`) | Live OSM POI queries for off-catalogue towns | Shared community endpoint; data ODbL | Yes, OSM credit | Yes | Chat flow copy names OpenStreetMap; formal credit in the Account panel's Data sources screen |
| Supabase, Google sign-in, Gemini plan-day function | Services, not data sources | Service terms | n/a | n/a | Privacy policy covers them; out of scope for this ledger |

## 7. Trails and daytrips content lab

Sources the trails vertical ingests into the local PostGIS lab
(`tools/trailslab`, port 5433). Approved content became user-facing on
2026-08-11: `pipeline/trails/export_wire.py` promotes approved trips to
published and writes them to `continent-app/public/trails/{CC}.json` as
produced works, each carrying its own `attribution_text`. Nothing ships in
bulk, so the ODbL derived-database obligations stay with the lab. The lab's
`images` table rejects NC and ND licensed material at insert, and its
`data_sources` table carries the attribution template per source. The three
national portal rows were updated 2026-08-07 when the first
`pipeline/trails/crosscheck_portals.py` harvest ran.

| Source | What we take | License | Attribution required | Share-alike | Where attributed today |
|---|---|---|---|---|---|
| OpenStreetMap named landforms via Overpass (`pipeline/mountains/osm_spine.py`) | Named peaks, volcanoes, saddles and passes, plus ridges, aretes and cliffs over 500 m and named plateaus, per country, as the mountain layer's second spine | ODbL 1.0 | Yes: (c) OpenStreetMap contributors | Yes: the published rows are a derived database and the obligation travels with them | LIVE: the OSM line in every affected mountain row's `credit[]`, plus Account > Data sources |
| OpenStreetMap route relations via Geofabrik per-country extracts (`pipeline/trails/ingest_osm_routes.py`) | Hiking route relations (geometry, sac_scale, network, names) as trip candidates; extracts cached under `data/raw/geofabrik/` | ODbL 1.0 | Yes: © OpenStreetMap contributors | Yes: the trips table is a derived database, ODbL obligations apply to any published extract | LIVE: per-trip `attribution_text` in every exported file, plus the Account panel's Data sources screen |
| Copernicus GLO-30 DEM | 30 m elevation samples to give trail geometries their Z and recompute ascent and descent | Copernicus DEM instance terms: free use including commercial, credit required, verify current wording | Yes, source credit (Copernicus programme, ESA and Airbus) | No | LIVE: ascent, descent and the elevation profile ship with published trips. Home footer, Data sources block |
| Copernicus GLO-30 DEM, windowed COG reads (`pipeline/mountains/terrain.py`) | Per-summit elevation check, prominence by flooding to the key col, isolation, a 30 km viewshed and the gentlest ascent line's steepest stretch. Read as HTTP range requests over the public S3 COGs; no tile is redistributed and none is kept on disk, only the derived numbers in `cache/mountains/terrain.json` | Copernicus DEM instance terms: free use including commercial, credit required | Yes, and the wording is prescribed: "(c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA" | No | LIVE: `credit[]` on every mountain row that carries a computed figure, the mountain page's sources block, and Account > Data sources. NOTE: akirmse/mountains' precomputed prominence CSVs are deliberately NOT used; the code is MIT but those data files carry no stated licence, so the numbers are recomputed here |
| swisstopo swissTLM3D-Wanderwege (`pipeline/trails/crosscheck_portals.py`) | Official Swiss hiking trail geometries: the GeoPackage resolved via the data.geo.admin.ch STAC API into `data/raw/swisstopo/`, staged to `portal_trails` to cross-validate OSM trips | swisstopo open government data terms (free use since 2021, source attribution asked), verify per dataset | Yes: source swisstopo | No | LIVE as a validation signal: no portal geometry is exported, the agreement check is. Home footer, Data sources block |
| IGN BD TOPO layer itineraire_autre (`pipeline/trails/crosscheck_portals.py`) | Official French route itineraries (geometry plus toponyme) via the Geoplateforme WFS, raw pages in `data/raw/ign_bdtopo/`, staged to `portal_trails` to cross-validate OSM trips | Etalab Licence Ouverte 2.0 | Yes: IGN, BD TOPO, Etalab 2.0 | No | LIVE as a validation signal: no portal geometry is exported, the agreement check is. Home footer, Data sources block |
| Kartverket Turrutebasen (`pipeline/trails/crosscheck_portals.py`) | Official Norwegian marked trail network: nationwide Fotrute GML ordered through the Geonorge download API into `data/raw/turrutebasen/`, staged to `portal_trails` to cross-validate OSM trips | CC BY 4.0 | Yes: Kartverket, Turrutebasen | No | LIVE as a validation signal: no portal geometry is exported, the agreement check is. Home footer, Data sources block |
| Natural England National Trails (England) (`pipeline/trails/crosscheck_portals.py`) | The sixteen waymarked National Trails of England as paged GeoJSON off their ArcGIS Feature Server, raw pages in `data/raw/natural_england_national_trails/`, staged to `portal_trails` to cross-validate OSM trips inside an England bbox | Open Government Licence v3.0 (confirmed on the data.gov.uk dataset page 2026-08-30; commercial reuse permitted) | Yes, wording taken from the dataset page: "(c) Natural England copyright. Contains Ordnance Survey data (c) Crown copyright and database right" | No | LIVE as a validation signal: no portal geometry is exported, the agreement check is. Account > Data sources. NOTE: England only. The Wales Coast Path (Natural Resources Wales) and Scotland's Great Trails (NatureScot) are separate datasets under separate licences and are NOT covered by this row |
| Self-hosted Valhalla over the Geofabrik extracts (`tools/trailslab/valhalla`, used by `pipeline/trails/repair.py` and `compose_daytrips.py`) | Pedestrian and driving route geometries: spliced into repaired hike geometry and stored as daytrip `trip_stops.leg_geom` | Engine is MIT licensed software; the routes it returns are derived from the same ODbL extracts | Yes: © OpenStreetMap contributors, wherever a routed line renders | Yes: routed geometry inherits the extracts' ODbL obligations | LIVE inside published trips (repaired hike lines, daytrip legs); the OpenStreetMap credit covers it |
| Transitous public plan API, api.transitous.org (`tools/reachability/build_reach.py`, `pipeline/trails/compose_daytrips.py`) | Door to door public transport durations and itinerary geometry: reach minutes per destination (contract D) and daytrip transit legs | Volunteer-run MOTIS instance aggregating national and regional feeds; the underlying feed licenses apply per country (several are CC BY, ODbL or NLOD, see section 3). Usage is by community goodwill: one request per second, contact address in the User-Agent | Per feed, verify before any surface quotes a timetable | Per feed | Reach artifacts ship durations only, not timetables, and the reach filter renders them today, so Transitous is credited in the Account panel's Data sources screen. Daytrip legs stay staging until a daytrip is published |
| Wikivoyage as description signal (`pipeline/trails/describe.py`, RETIRED 2026-08-30) | Guide intro for the route name, sent to the model as CONTEXT to judge which supplied facts matter. Never quoted or paraphrased: it is not a mappable source field in the verification pass, and any generated sentence sharing a six word run with the snippet is dropped in code | CC BY-SA 4.0 | Yes if any of its prose is ever used | Yes if any of its prose is ever used | Not attributed and deliberately not used as text. Each `description_grounding` row records which guide, if any, was in context. If a future change quotes it, this becomes a CC BY-SA credit plus share-alike obligation on the description. RETIRED: describe.py no longer runs (the three facts its prose knew are wire fields now, see docs/TRAILS.md), so nothing in the app reaches Wikivoyage through this path any more |
| Eurostat urban audit `urb_ctour` (CR2001V nights spent per city) plus `tour_occ_ninat` country totals (`pipeline/trails/market_demand.py`) | Annual visitor nights per city and per country, the demand basis for citytrip city selection; raw responses under `data/raw/market_demand/` | Eurostat reuse policy: CC BY 4.0 | Yes: source Eurostat, dataset and year (stored per market_demand row and printed with every citytrip ranking) | No | Staging only; the demand basis (source plus year) is stored in each citytrip's raw_tags for any later surface |
| Statistics Norway StatBank table 12898, guest nights per municipality (`pipeline/trails/market_demand.py`, NO fallback) | Latest annual guest nights per Norwegian municipality (hotel plus camping, holiday dwelling and hostel categories summed) | NLOD 2.0 | Yes: source Statistics Norway | No | Staging only, as above |
| Statistik Austria OGD `OGD_touextsai_Tour_UA_1` (`pipeline/trails/market_demand.py`, AT fallback) | Monthly nights per Bundesland summed to calendar years; only Wien is stored as a city figure (the one Bundesland that is a city) | CC BY 4.0 (data.statistik.gv.at open data terms) | Yes: source Statistik Austria | No | Staging only, as above |
| Wikimedia Commons stop images for citytrips (`pipeline/trails/compose_citytrips.py`) | Per-file licence, author and description URL resolved via the Wikimedia API for every citytrip stop image; NC/ND and unresolvable files are dropped before staging | Per file: CC0, CC BY, CC BY-SA, public domain and kin; the lab `images` table rejects NC/ND at insert | Yes, per file (author, licence and source URL stored per images row) | Some files (CC BY-SA) | Staging only; per-file credit ships with any published citytrip surface |
| OpenStreetMap scenic features via Overpass (`pipeline/trails/scenic.py`) | Named summits, viewpoints, waterfalls, glaciers, gorges, caves, lakes, castles, ruins, monasteries, lighthouses, huts and springs within 600 m of a curated route: name, kind, elevation, position. Swept per 1.5 degree grid cell into the lab's `scenic_pois`, cached under `cache/beaches/scenic_cell_*.json` | ODbL 1.0 | Yes: (c) OpenStreetMap contributors | Yes: `scenic_pois` is a derived database. What ships is the per-route highlight list and a density score, both selected produced works, and each carries the OSM credit | LIVE: the highlight list and the rating's scenery term ship in `public/trails/`; every trip's `attribution_text` names OSM, and the Account panel's Data sources screen covers it |
| Wikimedia Commons trail photographs (`pipeline/trails/trail_images.py`) | Up to six files per curated route, found by geosearch at points along the line plus a name-and-nearcoord pass, kept only when the camera stood within 400 m of the route. LicenseShortName, LicenseUrl, Artist, description and the shot coordinate are stored per file | Per file: CC0, CC BY, CC BY-SA, public domain and kin; the lab `images` table's CHECK rejects NC and ND at insert and the harvester refuses them again before writing | Yes, per file (author, licence and Commons file page stored and shipped per image) | Some files (CC BY-SA), on the photograph only, never on the route data | LIVE: hero image on every trail card, the views strip on the trail page prints author and licence per photograph on tap, the strip carries a Commons source line, and each country file lists the Commons credit in `attribution` |
| Claude API (`--provider claude`) or Gemini API (`--provider gemini`) in `pipeline/trails/describe.py` | Not a data source: the model only rewrites the facts block we assemble from staged rows. The stored `description_md` is our own text and inherits the licenses of the facts behind it (ODbL for OSM tags and geometry, portal terms for the confirmation line) | Anthropic commercial terms: customer owns the outputs. Google Gemini terms: same for outputs, but on the **free** tier Google may use prompts and responses to improve their products, so only open-data facts go in the prompt | No credit obligation to either vendor | No | n/a. Trail credits still owe OSM and the national portals as above. NOTE: the EEA paid-services rule that put `plan-day` on a billed Gemini key covers API clients offered to users; describe.py is a local batch script and is not one, so the free tier is in scope for it only while it stays local |

## 8. Natural features layer (beaches and mountains) - RETIRED 2026-09-02

**This layer was retired per brief 08.** The wire predated the beaches and
mountains layers (sections above) that replaced it, and nothing under
`continent-app/src` ever read `public/features/`, so the repo was carrying
this section's obligations for a surface that never rendered. The code moved
to `archive/pipeline_features`, the `features` task left `run_pipeline.py`,
and `public/features/` is deleted from the tree. The table below is kept as
the record of what the wire carried while it existed; every obligation in it
ended with the publication. Two of its rows have since been overtaken and are
corrected here rather than left to mislead:

- The UNESCO cache DOES have a harvester now: `pipeline/harvest_unesco_whc.py`
  writes `cache/unesco_whc.json` from the WHC's official XML, so the
  provenance of its rows is real. `attribution.js` also carries a UNESCO row.
  Both facts postdate the table text.
- The "35 attribution-required files with no author" count belonged to this
  wire. The live layers were re-audited 2026-09-02: beaches and lakes ship
  zero author-less licensed images, and the mountains wire was repaired the
  same day (17 authors recovered from Commons Attribution/Credit fields, 35
  waived as not attribution-required, 94 uncreditable files dropped; the wire
  re-exported clean).

The `pipeline/features/*` chain lifted beaches and summits out of the POI layer
into standalone entities, scored them, and published tiers 1 and 2 as one file
per priced country: `continent-app/public/features/<ISO2>.json` plus
`index.json`. At retirement that was 5,472 features across 43 country files.

Nothing in this layer downloads anything new. Every input is a cache that
already has a row above; what changed is that the derived rows are now
PUBLISHED, and publishing is what turns a scoring signal into an attribution
obligation. That is why each source gets its own row here rather than a
footnote on the section 5 row it reuses.

What a shipped row actually contains: a name, a coordinate, a tier and a rank,
plus a bathing-water class, a designation list, an elevation, a Wikipedia
reference and a photo with its full TASL block where they exist. It contains no
prose from any source. Each country file carries a `sources` block resolving
the short keys its features cite (`osm` in all 43, `eea` in 28, `whc` in 13),
which is the citation surface the UI has to render.

| Source | What we take | License | Attribution required | Share-alike | Where attributed today |
|---|---|---|---|---|---|
| OpenStreetMap via the existing POI layer (`pipeline/features/build_features.py` over `continent-app/public/activities_full.json`, harvested by OpenTripMap, Overture and Overpass: see section 5) | The spine: names, coordinates, kinds and the POI rate for every beach and summit, deduped and re-identified | ODbL 1.0 | Yes: © OpenStreetMap contributors | Yes: the wire is an extract of a derived database | Every feature lists `osm` in its `sources` and every country file resolves the citation; the Data sources screen's OpenStreetMap credit covers the app. MISSING: no features surface renders the citation block yet |
| OSM protected areas (`pipeline/harvest_protected_areas_osm.py` -> `cache/osm_protected_areas.json`, joined at 5 km) | The protected area around a feature and the designations read off it: national_park (808 shipped), natural_monument (162), wilderness (52), plus geopark and ramsar by site name | ODbL 1.0 | Yes: © OpenStreetMap contributors | Yes, as above | Same `osm` citation. The inferred natura2000 label is scored but deliberately never shipped: it is protect_class read as a habitat site, not a site-code join |
| EEA WISE bathing water (`cache/eea_bathing_water.json` via `pipeline/harvest_bathing_water.py`, joined at 2 km) | The official class (Excellent, Good, Sufficient, Poor) and the season year, on 2,089 of the 5,472 shipped features. A Poor class caps a beach at tier 3 | EEA standard re-use policy, effectively CC BY 4.0, verify | Yes | No | 28 country files carry the `eea` citation and the `bathing_year`; the Data sources screen credits the EEA. MISSING at the feature surface until the UI renders the file's `sources` block |
| UNESCO World Heritage List (`cache/unesco_whc.json`, natural and mixed properties only, joined at 10 km by `pipeline/features/rank_features.py`) | The `unesco` designation on 276 shipped features, and the "UNESCO World Heritage Centre, World Heritage List" citation in 13 country files | UNESCO World Heritage Centre terms of use: reuse with source attribution; parts of the WHC site are CC BY-SA 3.0 IGO, verify. Also verify the cache itself: no harvester for its 1,247 rows exists anywhere in the current tree, so its provenance is asserted by its field shape, not by a script | Yes, verify | Verify | MISSING. This is the first user-facing use of the cache (`beauty_layer.py` and `rating_layer.py` only ever used it as a hidden scoring signal), and `attribution.js` has no UNESCO entry |
| Wikimedia Commons, per file (`cache/poi_image_licenses.json`, gated in `build_features.py` and `rank_features.py`, resolved by `pipeline/features/enrich_images.py`) | 2,766 photos, each shipped with url, author, licence and licence_url. NC, ND, permission-only and unresolved-licence files are refused rather than shipped uncredited | Per file: CC BY-SA (1,996), CC BY (306), public domain or CC0 (368), plus a handful of GFDL and GPL | Yes, per file | Yes for the CC BY-SA, GFDL and GPL files | The TASL row ships with every image, which is the data the credit needs. MISSING: nothing renders it yet, and 35 attribution-required files ship with a licence but no author name (a gap in the licence cache, not in the wire) |
| Wikipedia (`pipeline/harvest_pageviews.py` counts carried on the POI, article references resolved by `pipeline/features/enrich_wikidata.py`) | Pageview counts as half of the fame term, and the article reference ("en:Es Trenc") on 2,193 shipped features. No sentence of article text is taken | Pageview statistics CC0; article text CC BY-SA 4.0 | No for the statistics; a reference is a link, not text | No, while no prose ships | Home footer credits Wikipedia for the text it does use elsewhere. The day a feature card prints a sentence from an article, this becomes a CC BY-SA credit plus a share-alike obligation on that text |
| Wikidata (`pipeline/features/enrich_wikidata.py`, plus `cache/wikidata_sitelinks.json` and `cache/poi_wikidata.json` from the significance pass) | QIDs, elevation and prominence for summits, sitelink counts as the other half of the fame term | CC0 | No | No | None needed |
| Wikivoyage listings (`cache/wikivoyage_listings.json` via `pipeline/harvest_wikivoyage_listings.py`, curation term in `rank_features.py`) | Whether an editor listed this feature and how early they listed it: a weight, never the prose | CC BY-SA 4.0 | Yes if any of its prose is ever used | Yes if any of its prose is ever used | Section 5's row carries the blurb credit in the footer. Nothing further is owed while only the numeric signal is used |

The share-alike question this layer raised is settled for the live wires by
the per-file review table in the "Share-alike review" section below; this
layer itself no longer publishes anything, which closes its half of follow-up
item 2 by deletion.

## 9. Composed trips (pipeline/trips)

The trip layer publishes multi day itineraries to `continent-app/public/trips`.
It introduces no new external source: everything it reads is already in the
sections above. What is new is the USE, which is what this section records.

| Source and use | What is used | Licence | Attribution required | Share-alike | Where it is credited |
|---|---|---|---|---|---|
| Wikivoyage Go next graph (`pipeline/trips/harvest_routes.py` -> `cache/trips/routes.json`) | Which places an editor lists as the onward journey from here: the LINK STRUCTURE and the wikilink targets, resolved onto catalogue ids. No prose is stored or shown. Drives which bases a chain may join, and the `editorialRoute` reason code | CC BY-SA 4.0 | Yes | Only if prose is ever used; link structure and article class are facts | `attribution` block in `/trips/index.json`, rendered in Account > Data sources |
| Wikivoyage itinerary articles (same harvest) | Article title, URL, article status class and the ordered list of places the article links. Shown as "It follows the Brenner Pass" with a link to the article. The TITLE is quoted; nothing else is | CC BY-SA 4.0 | Yes | No: a title plus a link is a reference, not a derivative of the text | Named in the trip page's `follows` line, which links straight to the article; plus the index `attribution` block |
| Wikivoyage Get in sections (same harvest) | A boolean per mode (does the arrivals section mention a rail station, a ferry, an airport), never the text | CC BY-SA 4.0 | Yes | No, the booleans are facts | Index `attribution` block |
| Wikivoyage article status (`{{guidecity}}`, `{{starcity}}`) | A quality weight on a base, and the `no_written_guide` warning | CC BY-SA 4.0 | Yes | No, the class is a fact | Index `attribution` block |
| Eurostat tourist nights per NUTS3 (`cache/eurostat_nights_nuts3.json`, already harvested for the crowding layer) | A demand CHECK on a base: does anyone actually go to this region. Never ranked on alone | CC BY 4.0 | Yes | No | Existing Eurostat credit, widened to name the use |
| Catalogue master (`app_data/app_data.json`) | Ratings, coordinates, categories, climate normals, accommodation anchors, designations, hero photographs and the POI shortlists. Each of those carries its own row in sections 5 and 8 | Mixed, per row above | Per row above | Per row above | Per row above |
| Wikimedia Commons photographs | The hero on every stop and the photograph beside every named sight, spliced to a 500 px thumbnail. The export gate rejects any image URL whose host is not a Wikimedia one, so a file whose licence was never resolved cannot reach the wire | Per file | Yes | Per file | Existing Commons credit; the per-file obligation is follow-up item 1, unchanged |

What the layer deliberately does NOT do, and why it matters here:

- It writes no prose. Every sentence on a trip card or a trip page is composed
  in the app from reason codes through `t()` (`continent-app/src/lib/tripStory.js`),
  so there is no generated text with an unclear provenance, and the six
  translations stay honest.
- It stores no third-party itinerary text. A Wikivoyage itinerary contributes
  its title, its URL and which of its stops resolve onto the catalogue. The
  route Carta ships is composed independently and merely CORROBORATED against
  it, which is why `namedRoute` is worth only 0.4 of a point.
- It calls no paid API and warehouses nothing from one.

## 9b. Curated trip library (pipeline/journeys), 2026-09-02

The journeys layer publishes the 253 hand-written week itineraries
(`Trips/carta-unified`, schema v2.0) to `continent-app/public/journeys`. The
itinerary text, budgets, logistics and tips are Carta's own editorial
content: written in-house (Cowork batches), unified by the
`Trips/carta-unified` pipeline, no third-party prose. The only external
source is the photography.

| Source and use | What is used | Licence | Attribution required | Share-alike | Where it is credited |
|---|---|---|---|---|---|
| Wikipedia lead images via the pageimages API (`pipeline/journeys/build_wire.py` -> `cache/journey_images.json`) | One lead-image thumbnail per trip and per trip style, found by the place names the record itself carries (basecamps, sub-region, resolved coordinate place) plus a full-text search fallback; the article title and URL are stored as the credit | Images per file (Commons: CC BY-SA, CC BY, CC0, public domain); pageimages metadata CC0 | Yes, per file | Some files | LIVE: "Photo: {place}, Wikipedia" printed under the hero on the journey page and in its sources block, linking the article; the library list credits Commons in its footer line. Per-file author and licence resolution is the same follow-up obligation as the destination heroes (follow-up item 1) |

## 10. Region spine (pipeline/regions)

The unit between "beach" and "country": NUTS/ITL/geoBoundaries admin
regions, named coastal stretches cut from the EEA coastline, GMBA mountain
ranges, WISE river basin districts and the EEA biogeographical regions,
built once a year into `cache/regions/regions.gpkg` and shipped as region
ids on every layer row plus `public/region/*.json` and `public/coverage.json`.

| Source | What we take | License | Attribution required | Share-alike | Where attributed today |
|---|---|---|---|---|---|
| Eurostat GISCO NUTS 2024 (`pipeline/regions/region_sources.py`, fetch_nuts) | NUTS 0..3 boundaries at 1:1M with ids and Latin names, the admin spine for 39 countries; region ids shipped on every layer row (`rg.n3`, `rg.n2`) and as `public/region/{N2}.json` pages | EC reuse decision 2011/833/EU; Eurostat states compatibility with CC BY 4.0. The boundary geometry additionally requires the EuroGeographics notice, verify the current wording on the Eurostat copyright page before a public launch | Yes: (c) European Union, 1995-2026, and (c) EuroGeographics for the administrative boundaries | No | LIVE: Eurostat and EuroGeographics rows in Account > Data sources, extended to name the region spine |
| Eurostat GISCO LAU 2024 (`region_sources.py`, fetch_lau) | Local Administrative Units (municipal) boundaries, held in the GeoPackage for future municipality-level assignment; nothing municipal ships in the wire yet | Same as NUTS above | Yes, same notice | No | Covered by the Eurostat and EuroGeographics rows |
| ONS Open Geography ITL 1..3, January 2025 (`region_sources.py`, fetch_itl) | International Territorial Level boundaries for the UK (the UK is not in NUTS 2024), 20 m generalised, queried from the ONS ArcGIS services | Open Government Licence v3.0; boundaries also carry OS crown copyright | Yes: OGL source statement plus "Contains OS data (c) Crown copyright and database right 2025" | No | LIVE: ONS row in Account > Data sources |
| geoBoundaries gbOpen (`region_sources.py` + `build_regions.py`, UKR ADM1/ADM2, MDA ADM1, AND ADM1, SMR ADM1, FRO ADM0, MCO ADM0) | Admin regions for the countries GISCO leaves at country level. Per-release licences differ: UKR ADM1 is ODbL (OpenStreetMap derived), UKR ADM2 public domain, the rest per the API's licence field; the fetch pins release commits so the licence recorded matches the bytes | Mixed per file: ODbL / CC BY / public domain, as the geoBoundaries API reports | Yes: geoBoundaries (Runfola et al. 2020) plus (c) OpenStreetMap contributors for the ODbL files | ODbL files yes | LIVE: geoBoundaries row in Account > Data sources; OSM row already covers the ODbL obligation |
| GMBA Mountain Inventory v2.0 standard basic (`region_sources.py`, fetch_gmba) | Named mountain range polygons touching Europe with hierarchy (the Dolomites inside the Alps), shipped as `rg.ra` ids and `public/region/GMBA_*.json` pages | CC BY 4.0 | Yes: citation Snethlage et al. 2022, GMBA Mountain Inventory v2, EarthEnv | No | LIVE: GMBA row in Account > Data sources |
| EEA coastline for analysis v3.0 2017 (`region_sources.py`, fetch_eea_coastline; cut by `coasts.py`) | The polygon shoreline, cut into ~2,600 coastal stretches (the "Costa de la Luz" unit), shipped as `rg.co` ids, stretch pages and per-region coast_km in the quota model | EEA standard re-use policy, effectively CC BY, verify | Yes: (c) European Environment Agency | No | LIVE: EEA row in Account > Data sources, extended to name the coastline |
| EEA biogeographical regions (`region_sources.py`, fetch_biogeo) | The eleven regions (Alpine, Atlantic, Boreal, ...) as a recommendation axis, shipped as `rg.bg` codes | EEA standard re-use policy, verify | Yes | No | LIVE: EEA row in Account > Data sources |
| EEA/WISE WFD river basin districts 2022 (`region_sources.py`, fetch_rbd) | River basin district polygons for the lake layer's basin ids (`rg.ba`) | EEA standard re-use policy, verify | Yes | No | LIVE: EEA row in Account > Data sources |

Rejected for this layer, so a later search does not relitigate them: GADM
(explicitly non-commercial) and WDPA/Protected Planet (non-commercial); the
spine uses NUTS/ITL/geoBoundaries and will use Natura 2000 + Emerald for
protection instead.

## MISSING attributions, follow-up list

Cleared on 2026-08-11 by the footer pass. The app renders a Data sources
block from `continent-app/src/data/attribution.js`, which covers what the
previous eleven
entries asked for: OpenStreetMap contributors, GeoNames, Inside Airbnb, the
EuroGeographics boundary notice, EEA bathing water, the CHELSA citation,
OpenTripMap, Wikipedia and Wikivoyage text, Wikimedia Commons, Overture Maps,
ExchangeRate-API, and the four national timetable feeds whose credit
obligation is unambiguous (GTFS.de / DELFI, transport.data.gouv.fr / SNCF,
Entur, opentransportdata.swiss) plus Digitraffic and Transitous. The trails
sources joined it the same day: Copernicus GLO-30, swisstopo, IGN and
Kartverket.

What is still open, and what each needs:

1. Wikimedia Commons POI thumbnails: per-file credit. The footer credits
   Commons as a whole and the destination hero links to its source page, but a
   CC BY-SA photo in a POI grid still owes its own author and licence. Needs a
   per-image credit surface, and the per-file data is already harvested for
   citytrip stops (`compose_citytrips.py`) so the shape exists.
2. Share-alike review of the OSM-derived slice of `app_data.json`: crediting
   OpenStreetMap answers attribution, not the ODbL obligations on a derived
   database. The trails export solved the same question by shipping produced
   works only; the nature and POI layers have not had that review.
   RESOLVED 2026-09-02: the review exists as section 12 below, a per-file
   produced-work / database-extract table covering every wire the app ships.
3. Belgian operators (SNCB, De Lijn, STIB, TEC): "typically yes, verify per
   operator" is not a settled obligation, so no credit was invented. Verify
   the per-operator terms, then add a row to `attribution.js`.
4. Hostelworld and LiteAPI: display terms come with the partner agreements,
   which are still pending. The stay tiers ship on fixtures until then.
5. Feeds still marked "Raw ETL only": nothing renders from them yet. Each row
   says what its credit becomes when something does.
6. UNESCO World Heritage Centre: RESOLVED. `pipeline/harvest_unesco_whc.py`
   now writes `cache/unesco_whc.json` from the WHC's official XML, and
   `attribution.js` carries the UNESCO row. The natural-features wire that
   first raised this is retired (section 8).
7. The natural-features citation surface: CLOSED by retirement of the wire
   (section 8). The live layer pages (beaches, lakes, mountains, trails,
   cycling) render per-image credits from the TASL rows they ship.
8. 35 shipped photos with an attribution-required licence and no author name:
   CLOSED 2026-09-02. The count belonged to the retired features wire; the
   live wires were re-audited the same day (beaches 0, lakes 0, mountains
   repaired via `pipeline/photos/fill_authors.py` and re-exported clean).

Open risk items, not attribution but licensing scope: Ferryhopper commercial
terms, OpenSky commercial-use terms, Numbeo
anchor provenance, and the handful of GFDL and GPL photos in the features wire
(both are copyleft licences written for documentation and software, and a
thumbnail credit line may not discharge them). Each is flagged in its row
above.

## Ready to paste into `continent-app/src/data/attribution.js`

Written here rather than applied: the front end is being edited in a parallel
session, so this file's derived credits are handed over instead of merged.
Entry order in that file follows this ledger, roughly by how much of the
product each source carries.

ONE NEW ENTRY. Place it after the European Environment Agency entry, which is
the other designation-and-quality source in the same block:

```js
  {
    source: 'UNESCO World Heritage Centre',
    license: 'UNESCO WHC terms of use (verify)',
    credit: 'World Heritage designations from the UNESCO World Heritage List',
  },
```

ONE AMENDED ENTRY. The existing OpenStreetMap credit names what the app showed
before this layer existed; beaches and summits are now their own published
entities, so the line should say so:

```js
  {
    source: 'OpenStreetMap',
    license: 'ODbL 1.0',
    credit: 'Map data, points of interest, nature areas, beaches, summits and '
      + 'trail routes © OpenStreetMap contributors',
  },
```

NOTHING ELSE CHANGES IN THAT FILE. The EEA, Wikipedia, Wikivoyage, Wikimedia
Commons, OpenTripMap and Overture entries already cover their part of this
layer, and Wikidata is CC0 and correctly absent. The two credits the footer
cannot carry are per-feature, and belong in the features UI itself:

- the country file's `sources` block, rendered wherever its features are shown
  (`osm` in all 43 files, `eea` in 28, `whc` in 13; each entry is already a
  `{name, url}` pair ready to render as a link),
- the per-photo credit from the feature's own `image` object:
  `image.author`, `image.licence` and `image.licence_url`, which is exactly
  the per-file obligation follow-up item 1 has been open on since 2026-08-11.

## Destination dossiers and the PDF export (2026-08-25)

The dossier layer (`pipeline/dossier/`, wire at `continent-app/public/dossier/`)
recombines sources already in this ledger: OpenStreetMap (parking, trails,
nearby features), Wikidata (highlight reconciliation, events), Wikivoyage
(intro body, quoted with source link, CC BY-SA), OpenTripMap (highlight
spine), Wikimedia Commons (all photographs), EEA (bathing class), JRC and
Eurostat (crowding), CARTO and OpenStreetMap (the printed map image). No new
source, but a new obligation:

- **A PDF is redistribution.** The on-screen footer credit does not discharge
  attribution once the file is on a stranger's laptop, so every exported
  guide ends with a credits page listing each photograph's author, licence
  and Commons file page, plus the data credit block. This is rendered from
  the dossier's own `credits[]` and per-image TASL, never from a lookup.
- **The image gate** (`build_dossier.py` + `fill_licences.py`): an image
  ships in the PDF only with a resolved redistribution-safe licence AND a
  named author where the licence requires one (`ok_print`). NC, ND and
  permission-only files are refused. Unresolved TASL means the panel may
  still show the photo with its Commons link, but the PDF will not carry it.
- Booking and search deeplinks in the dossier (Google Flights, Skyscanner,
  Booking.com, Airbnb, GetYourGuide, Viator, Google Maps, Waze, Apple Maps)
  are outbound links, not ingested data; no licence obligation attaches.

## Resolutions, 2026-08-26 (dossier spec section 11)

Three of the open items above are now closed in code:

| Source | What we take | License | Attribution required | Share-alike | Where attributed today |
|---|---|---|---|---|---|
| NASA POWER climatology API (`pipeline/harvest_climate_power.py`) | 12-month climate normals (T2M, T2M_RANGE, precipitation, solar) per destination, 2001-2020, lapse-corrected to destination elevation | US Government work: no use restriction; NASA asks for an acknowledgement | No (given anyway) | No | Account > Data sources; dossier `credits[]` and the PDF credits page wherever normals print |
| NASA POWER climatology API (`pipeline/mountains/season.py`) | 12-month normals (T2M, PRECTOTCORR) per 0.5 degree cell, lapse-corrected to each summit's own elevation, turned into a snow probability and a best-months array | US Government work: no use restriction; NASA asks for an acknowledgement | No (given anyway) | LIVE: `credit[]` on every mountain row carrying a season, and Account > Data sources. ERA5-Land (Copernicus CDS) is the source brief 05 names and `--source era5` is written for it; it needs a CDS key, which this repo does not have, so POWER is the shipped default and `season.src` records which one answered |
| Open-Meteo elevation API (Copernicus DEM GLO-90, same harvester) | One ground elevation per destination for the lapse correction | CC BY 4.0 (Copernicus DEM) | Covered by the existing Copernicus credit | No | Copernicus GLO row above |
| UNESCO World Heritage Centre list XML (`pipeline/harvest_unesco_whc.py` -> `cache/unesco_whc.json`) | Site name, category, region, per-country coordinates for inscribed properties | UNESCO WHC terms of use (verify wording on the syndication page) | Yes | No | `attribution.js` entry added; dossier `credits[]` where a designation is shown |

- **WorldClim scope (open risk item): CLOSED, 2026-08-30.** `dest.climate`
  moved to NASA POWER (see `apply_climate.py` header) and the lakes
  swim-season model, the last remaining consumer, moved to CHELSA V2.1
  (CC BY 4.0, commercial use permitted with attribution) in
  `pipeline/lakes/lake_climate.py`. Nothing shipped is derived from
  WorldClim any more. `pipeline/harvest_climate_worldclim.py` and
  `cache/worldclim` are retained only so a pre-2026-08-30 build can be
  reproduced, and neither is on any current build path.
- **Item 6 (UNESCO provenance): resolved.** `harvest_unesco_whc.py` is the
  harvester the tree was missing; the fresh official harvest reproduces 95
  percent of the old file's keys (the rest are renamed sites and 2025-26
  inscriptions), previous file kept at `cache/unesco_whc_prev.json`, and the
  ready-to-paste `attribution.js` entry below is now actually pasted.
- **Viator / GetYourGuide affiliate ids:** the dossier stores bare URLs;
  `src/lib/activityAffiliates.js` decorates them at render time from
  `VITE_GYG_PARTNER_ID` / `VITE_VIATOR_PID` (same env pattern as omio.js and
  affiliate.js). Until those are set every link stays a plain search: no
  obligation, no tracking. Outbound affiliate links carry no data-licence
  obligation either way.

### S4 research sweep: complete for tier 2+ (2026-08-26)

The "best things to do" evidence pass now covers **237 destination files
across all 230 tier 2+ places** (every one validated by `research_do.py`: each
shipped item names at least three distinct registrable domains, no source
prose is stored, and every detail sentence is composed from facts). That is
1,566 web-evidenced items; the other 13,229 come from the keyless open-data
tier in `derive_do.py`, which is labelled separately in the UI and never
conflated with this one.

Thirty five files were originally built from a pool too small for the sweep's
own standard, because they were researched by fetching known guide pages
rather than searching. All of them have been re-searched and deepened: the
smallest pool in the set is now eight publishers and the median is twenty two,
`thin_sources` in `data/reports/dossier_research.json` is empty, and no item
claims more corroboration than its file can show.

**What counts as one publisher** is now a single definition,
`pipeline/dossier/common.publisher`, imported by the harvester and by the
validator that judges its output. It folds country editions together
(`tripadvisor.co.za` and `.de` are `tripadvisor.com`) and drops the
aggregators the automated sweep already refused, because a site republishing
what its users typed is not a second opinion. Before this the two halves of
the sweep disagreed: a hand-written file counted domains `web_sweep.py` would
have thrown away, so "named by 8 of 14 guides" meant different things
depending on which path produced the file. `research_do.py` now enforces it,
along with two gaps nothing was checking: an item citing a URL absent from its
own `sources`, and `n_usable_sources` exceeding what the file actually lists.

The copyright position is unchanged and is the reason the format looks the
way it does: the web decides WHICH things matter and in what order, and never
supplies the words. What we store per item is a name, our own sentence, a
count of corroborating domains and up to three source URLs. A fact
corroborated by three independent publishers is a fact about the world, not
anyone's expression, and "named by 23 of 40 guides" is a citation rather than
a quotation.

Booking and official links inside a research file are URLs that were actually
seen in results; nothing is synthesised. They are outbound links, so no data
licence attaches, and `src/lib/activityAffiliates.js` is what decorates the
GetYourGuide and Viator ones once partner ids exist.

The sweep is now part of the monthly `dossier` task rather than something run
by hand: `web_sweep.py --all --if-configured` runs before the build, does
nothing at all when no search key is set, and picks up any destination with no
research file the day one is. `plan_research.py --copy-siblings` fills
multi-airport places, `research_do.py` refuses anything that misses the gate,
and `audit.py --strict` closes the task.

---

## 11. The cycling layer (pipeline/cycling), 2026-08-30

ODbL is this layer's backbone, and it has one consequence the other layers do
not face. A rendered map tile and a static image are **produced works** and may
be licensed however we like; a route-details response and a GPX export are
**database extracts**, and the OSMF's own produced-work guideline names GPX as
the paradigm case. So `public/cycling/route/{id}.json` is split in two: an
`osm` block holding the geometry, the source tags, the licence and the
attribution string, and a `carta` block holding our scenic score, safety score,
service towns, stage plans and reasons. The credit lives inside the `osm`
object so it cannot be separated from the data it describes, and
`lib/cycling.js`'s `gpxCredit()` is the single place a GPX exporter reads it
from. Tours reference route ids rather than restating geometry.

| Source | What we take | License | Attribution required | Share-alike | Where attributed today |
|---|---|---|---|---|---|
| OpenStreetMap `route=bicycle` relations, via Geofabrik extracts (`pipeline/cycling/harvest_cycling.py`) | Route geometry, `network`/`ref`/`operator`, and the per-way `highway`/`surface`/`smoothness`/`tracktype`/`maxspeed`/`cycleway` tags behind every surface and safety figure (`way_spans`) | ODbL 1.0 | Yes | Yes, on the extract | LIVE: OSM row in Account > Data sources; `osm.attribution` inside every route file; inside the `<copyright>` and `<desc>` of every GPX the app writes |
| OpenStreetMap node network (same harvester) | `rcn_ref` junctions and the connection relations between them, for the NL and BE planning graph (`cycle_nodes`, `cycle_node_edges`) | ODbL 1.0 | Yes | Yes | Covered by the OSM row |
| OpenStreetMap services (`enrich_cycling.py`, same extracts) | Sleeping, campsite, drinking water, bicycle shop, bicycle repair, grocery and railway station objects within 2 km of a route, clustered onto named places into service towns | ODbL 1.0 | Yes | Yes | Covered by the OSM row; service town names print on every stage |
| **OpenStreetMap land cover** (`pipeline/cycling/landcover.py`, same extracts) | `landuse` / `natural` / `waterway` polygons within 500 m of a cycle route, classified wild / water / farm / built, for the scenic score's forest-and-water component. Stored simplified to 50 m in EPSG:3035 | ODbL 1.0 | Yes | Yes | Covered by the OSM row. **This replaces the ESA WorldCover the brief names**, which is cleared (CC BY 4.0) but is roughly 100 GB at 10 m for Europe; OSM is already on disk, is vector rather than raster, and distinguishes `landuse=forest` from `natural=wood` and managed meadow from wild grassland, which is the distinction the score needs |
| **EuroVelo GPX tracks** (`cycle_sources.eurovelo_gpx`, `en.eurovelo.com/route/get-gpx/{id}?developed=1`) | The 17 routes' developed sections, used as ground truth to validate the OSM geometry and to produce an agreement percentage per route. Never published as geometry in their own right | **ODbL 1.0 since 2024-10-09** | Yes, and the wording is **prescribed**: "Contains information from EuroVelo GPX tracks downloaded from www.EuroVelo.com on [DATE], which is made available here under the Open Database License (ODbL)." A paraphrase is not compliance | Yes | LIVE: `attribution.js` EuroVelo row; the sentence with the real download date is written into `public/cycling/index.json` by `export_cycling.eurovelo_credit_line()` |
| **Sustrans / Walk Wheel Cycle Trust National Cycle Network (Public)** (`services5.arcgis.com/.../National_Cycle_Network_Public/FeatureServer/0`) | NCN alignments for GB and Northern Ireland, used only to measure agreement with the OSM line. Confirmed on the Hub's own dataset description, which links the OGL text | Open Government Licence v3.0. Also contains Ordnance Survey data, (c) Crown copyright and database right | Yes: OGL source statement plus the OS notice | No | LIVE: Sustrans row in `attribution.js` and in the cycling wire's attribution block |
| Spatial Hub Scotland "Cycling Network" (`geo.spatialhub.scot/geoserver/sh_cycnt/wfs`) | **Nothing today.** Published under OGL v3 but the WFS answers an anonymous `GetFeature` with 403 Forbidden | Open Government Licence v3.0 | Yes, if ever used | No | n/a. Recorded as `status: gated` in `cycle_sources.PORTALS` with the reason and the contact (spatialhub@improvementservice.org.uk). Scotland's ground truth comes from the Sustrans dataset, which now carries the Scottish NCN |
| Base Nationale des Amenagements Cyclables (`data.gouv.fr`, newest GeoJSON resolved from the dataset API) | The French cycling network, as a SCHEMA REFERENCE ONLY | Licence Ouverte 2.0 (Etalab) | Yes | No | **Deliberately excluded from the agreement measurement.** The dataset describes itself as "all digitized bicycle facilities in metropolitan France processed through OpenStreetMap", so it is an OSM export in a national schema. Measuring our OSM lines against it would report a high number meaning only that both sides read the same database. The resource id is never pinned: data.gouv.fr mints a new one on every monthly republish |
| Toerisme Vlaanderen cycling node network v2 | Flemish node network, cross-check only | Flemish open data licence, verify current wording | Yes | No | As above |
| **opendata.swiss / SchweizMobil Veloland** (`ch.astra.veloland`, resolved through the geo.admin STAC API) | 309 official Swiss national and regional cycle routes (the `Route.shp` member of `veloland_2056.shp.zip`), used only to measure agreement with the OSM line | opendata.swiss terms: free reuse with the source named | Yes | No | LIVE: cycling wire attribution block. **opendata.swiss answers an automated GET with 403**, so discovery goes through the federal STAC collection, which is the published machine-readable index and is what the trails layer already uses for swisstopo |
| GIP.at (Austria) | **Nothing.** Registration gated | Unconfirmed | n/a | n/a | Recorded as `status: gated`; Austria uses OSM alone |
| **EEA Natura 2000** (`bio.discomap.eea.europa.eu/.../N2KBackbone/MapServer/1`) | Protected site polygons, simplified server-side to about 100 m, for the scenic score's protection component | EEA standard re-use policy (effectively CC BY 4.0), verify | Yes: (c) European Environment Agency | No | LIVE: EEA row in Account > Data sources, extended to name the protected sites |
| **EEA Emerald Network** (`.../ProtectedSites/EmeraldSites/MapServer/3`) | The Bern Convention twin of Natura 2000, which is what gives the Cairngorms, the Norwegian fjords and the Swiss passes a protection reading at all | EEA standard re-use policy, verify | Yes | No | Covered by the EEA row |
| Copernicus GLO-30 DEM (via `pipeline/trails/elevation.py`) | Elevation profile, smoothed ascent and descent per route and per stage | Copernicus DEM terms, free use with credit | Yes | No | LIVE: Copernicus row in Account > Data sources |
| EEA coastline for analysis v3.0 (mirrored from `cache/regions/regions.gpkg`) | Distance to the sea, for the scenic score's coast component | EEA standard re-use policy | Yes | No | Covered by the existing EEA coastline row in section 10 |
| NASA POWER 2001-2020 normals (`cache/climate.json`, harvested by `pipeline/harvest_climate_power.py`) | The months a tour can be ridden, and the best of them | US Government work, no use restriction; NASA asks for an acknowledgement | No (given anyway) | No | LIVE: NASA POWER row in Account > Data sources. **The brief names ERA5-Land**; brief 04 retired WorldClim over its non-commercial licence and landed on POWER, which is already cached and already cleared, so a third climate source is not added for one array of months |
| Wikimedia Commons and Geograph photographs (`pipeline/cycling/cycle_images.py`) | Up to six photographs per route, camera measured within 400 m of the real line | Per file (Commons); CC BY-SA 2.0 (Geograph) | Yes, per file | Per file | LIVE: Commons and Geograph rows in Account > Data sources; author and licence stored on every image row and printed under every photograph. The `images` table's NC/ND CHECK constraint rejects a non-commercial file at insert time, so one cannot reach the wire |
| Operator bike-on-train policies (`pipeline/cycling/seed_bike_rail.py`) | 69 hand-curated rows: reservation rule, seasonal restriction, folded-bike rule, a fee code and the operator's own policy URL | Facts about a published policy, not a dataset. No licence attaches to "reservation required" | No | No | The operator's policy URL ships on the row and the page links it. `--verify` re-fetches every URL; the output states plainly that a live link is not a current policy |

Notes carried forward:

- **WDPA / Protected Planet is refused**, as the master spec requires: the
  UNEP-WCMC licence is non-commercial. Natura 2000 plus Emerald plus CDDA is
  the cleared route to the same question, and Emerald is the half that covers
  the non-EU countries this layer most needs it for.
- **ESA WorldCover is cleared (CC BY 4.0) and still not used**, but the
  component it was for is no longer absent: `landcover.py` measures the same
  fraction from the OSM polygons already on disk. WorldCover remains the
  fallback if OSM land-cover coverage ever proves too uneven, and the
  `known_share` shipped beside every reading is what would show that.
- A tour is our own composition and carries no upstream licence of its own.
  What it carries is the ids of the routes it rides, and those routes carry
  ODbL.

## 12. Share-alike review: produced work or database extract, per wire file (2026-09-02)

The review follow-up item 2 asked for, applied to every file family the app
ships. The test is the OSMF produced-work guideline: a selection that is
scored, rewritten and composed is a produced work; anything shipping a
geometry a user could reconstruct the source database from (a line, a GPX) is
a database extract, and ODbL terms must travel with the file itself, not just
with the app around it.

| Wire | Ships | Verdict | How the obligation travels |
|---|---|---|---|
| `public/beaches/*.json` | Named points (lat/lon), scores, facets, photos | Produced work. Selected, scored, tiered and rewritten rows; a point plus our own measurements is not a reconstructable slice of OSM | OSM credited in each file's credit block and the Data sources screen; per-photo TASL rows in-band |
| `public/lakes/*.json` | Named points, swim verdicts, season models, photos | Produced work, same reasoning | Same |
| `public/mountains/*.json` | Named points, prominence/viewshed measurements, photos | Produced work, same reasoning | Same; Copernicus DEM attribution in the ledger and `attribution.js` |
| `public/trails/*.json` + `public/trails/trip/*.json` + GPX/KML exports | Full route geometry (simplified MultiLineString), per-row `license` and `attribution_text` | **Database extract.** GPX is the OSMF guideline's paradigm case | ODbL terms travel in-band: every row carries `license` and `attribution_text`, and the GPX/KML writers put the credit inside the exported file |
| `public/cycling/*.json` + `route/*.json` + GPX | Route geometry in the `osm` block; scores, stage plans, tours in the `carta` block | **Extract for the `osm` block, produced work for the `carta` block**, kept in separate structures for exactly this reason (brief 07 section 7) | `osm.attribution` per route, GPX `<copyright>` + credit line; tours carry route ids, and the routes carry the ODbL terms |
| `public/trips/*` | Composed itineraries over catalogue cities (points) | Produced work. Our own composition; city coordinates are not a reconstructable database | Sources credited per file `attribution` block |
| `public/region/*.json`, `coverage.json` | Region names/ids, counts, quotas | Produced work over GISCO/ITL/GMBA/geoBoundaries inputs, each with its own attribution row | Data sources screen |
| `public/app_data.json` (POI slice) | POI names, coordinates and kinds harvested from OSM/Overture/OpenTripMap, selected and re-scored | **Treated as an extract.** Selection and scoring are ours, but names + coordinates at this density could substitute for the source query, which is the honest test | OSM and Overture credited on the Data sources screen; the slice ships under the same ODbL terms it arrived under, and this row is the standing record of that |
| `public/features/*` | retired 2026-09-02 | n/a | obligations ended with publication (section 8) |

## 13. Scope: Turkey and Ukraine, decided (2026-09-02)

Brief 08 flagged that one layer answered for a continent the rest of the app
does not sell. The decision, recorded here so the asymmetry is documented
rather than accidental:

- **Turkey is out of the content catalogue this cycle**, all layers. The
  region spine carries its statistical regions, the cycling lab has 12,539
  land-cover cells and its routes harvested, so inclusion is a harvest and
  curation decision for a later cycle, not a data gap.
- **Ukraine is published where a layer's data clears its own gate, behind the
  wartime advisory**: mountains ship UA rows, trails and cycling hold UA
  staged in the lab with an empty wire file, beaches and lakes do not
  publish it. An empty `UA.json` shell is the deliberate state for a layer
  with staged-but-unpublished data: the file exists so nothing 404s into SPA
  HTML, and its zero counts say "nothing published" honestly.
