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
| WorldClim 2.1 (`pipeline/harvest_climate_worldclim.py`) | Monthly climate normals sampled per destination | Free for academic and other non-commercial use; commercial use needs permission, verify | Yes, citation (Fick and Hijmans 2017) | No | Home footer, Data sources block (citation). RISK: Carta carries affiliate links, so the non-commercial scope needs resolving (permission, or a replacement like ERA5 / Open-Meteo climate API) |
| GeoNames cities500 (`pipeline/harvest_geonames.py`) | Population, settlement class, elevation, timezone | CC BY 4.0 (per harvester header) | Yes | No | Home footer, Data sources block |
| Wikipedia (`pipeline/harvest_images.py`, `harvest_pageviews.py`, `pipeline/trails/popularity.py`, live `cityResearch.js`) | Lead image pointers, article URLs, pageview counts, live summaries | Text CC BY-SA 4.0; pageview statistics CC0 | Yes for text | Yes for text | Image credit link on the destination hero (DetailPanel); live research names Wikipedia in the chat copy; Account panel's Data sources screen carries the text credit and licence |
| Wikimedia Commons (destination hero images, POI thumbnails via `harvest_pois_wikidata_images.py`) | Photo files hotlinked as thumbnails | Per file: CC BY-SA, CC BY or public domain | Yes, per file | Some files | Hero image links to its Wikipedia page (DetailPanel credit); Home footer, Data sources block credits Commons as a whole; per-file credit on POI thumbnails still MISSING |
| Bayerische Vermessungsverwaltung Wanderwege (`pipeline/trails/crosscheck_portals.py` DE loader) | Named signposted hiking-route GPX geometries, Bavaria, for the portal cross-check | CC BY 4.0 | Yes ("Bayerische Vermessungsverwaltung") | No | Trails credits block (validation source; no BVV geometry is published in the wire) |
| Wikidata (`pipeline/harvest_pois_wikidata_images.py`, `pipeline/harvest_poi_wikidata.py` QID/sitelink/P1435/P1174 per POI, `pipeline/trails/popularity.py` sitelink counts, live `cityResearch.js`) | Entity coordinates, labels, P18 image pointers, descriptions, sitelink counts, heritage designations, visitor counts | CC0 | No | No | None needed |
| Wikivoyage (`pipeline/harvest_wikivoyage.py`, `pipeline/harvest_wikivoyage_listings.py` See/Do listing names, coords, order and article status as a POI significance signal, activities tier 2) | Intro blurbs, See and Do listings | CC BY-SA 4.0 | Yes | Yes (blurb text; the listing-derived numeric rate signal is facts, not prose) | "Open the travel guide" link on the destination panel; Account panel's Data sources screen carries the blurb credit and licence |
| OpenTripMap (`pipeline/harvest_activities.py`, preferred tier) | POI lists with importance rate per destination | Free API tier; terms ask for a credit link, verify current wording | Yes | Underlying data derives from OSM and Wikidata | Home footer, Data sources block |
| Overture Maps Places (`pipeline/harvest_pois_overture.py`) | Bulk sightseeing POIs for the whole catalogue | CDLA-Permissive 2.0 | Not required, credit recommended | No | Home footer, Data sources block (the recommended credit) |
| OpenStreetMap via Overpass (`pipeline/harvest_protected_areas_osm.py`, live `cityResearch.js`) | Protected areas layer, live town POIs | ODbL 1.0 | Yes: © OpenStreetMap contributors | Yes: derived databases carry ODbL obligations | Map tiles credit OSM via the attribution control; the nature and POI layers shipped inside app_data.json are credited in the Account panel's Data sources screen. Share-alike review still needed for the OSM-derived slice of app_data.json |
| OpenStreetMap via Overpass (`pipeline/harvest_parking.py`) | amenity=parking spots near each destination centre: name, position, fee, capacity, park_ride; shipped as `public/destinfo/{CC}.json` | ODbL 1.0 | Yes: © OpenStreetMap contributors | Yes: the destinfo parking slice is an OSM-derived database | Explore panel's parking section prints the OSM credit; Account panel's Data sources screen (OSM entry covers it) |
| OpenStreetMap via Overpass (`pipeline/beaches/harvest_beaches.py`, `enrich_beaches.py`) | Named `natural=beach` elements per country (name, centre, surface, lifeguard, nudism, access) and what stands within 400 m of the shortlisted ones; shipped as `public/beaches/{CC}.json` | ODbL 1.0 | Yes: (c) OpenStreetMap contributors | Yes: the published rows are selected, scored and rewritten items (a produced work), and each carries its own ODbL credit | LIVE: per-beach `credit` array in the wire, the Beaches list prints the credit line, Account panel's Data sources screen |
| Wikidata beaches (`pipeline/beaches/harvest_beaches.py`) | Beach entities: label, local label, coordinates, admin region, P18 image, Commons category, sitelink count, length, protected-area and part-of links | CC0 | No | No | None needed; the beach page links the Wikidata item |
| Wikimedia Commons beach photographs (`pipeline/beaches/enrich_beaches.py`) | Three or four files per beach, found by name plus `nearcoord`, with LicenseShortName, LicenseUrl and Artist kept per file | Per file: CC BY-SA, CC BY, CC0 or public domain | Yes, per file | Some files | LIVE: author and licence printed under every photograph on the beach page, linking the Commons file page |
| Wikipedia beach articles (`pipeline/beaches/enrich_beaches.py`) | FACTS ONLY: a fixed vocabulary matched against the intro extract (substrate, water colour, cliffs, dunes, access, protection), plus the 60-day pageview count. No prose is stored or shipped | CC BY-SA 4.0 | Facts are not protected; no credit obligation for the extracted attributes | No, because no text is reused | The beach page links the article it read |
| EEA WISE bathing water, beach layer (`pipeline/beaches/enrich_beaches.py`, reads `cache/eea_bathing_water.json`) | The nearest official bathing site's class and previous class, per beach | EEA standard re-use policy, effectively CC BY 4.0, verify | Yes | No | LIVE: the class is a sentence on every beach page and a row in its facts, EEA credited in the list credit line and the Data sources screen |
| Wikidata water bodies (`pipeline/lakes/harvest_lakes.py`) | Lake, reservoir and lagoon entities per country: label, local label, coordinates, admin region, P31 types, surface area, maximum depth, elevation, P18 image, Commons category, sitelink count, protected-area, part-of and basin-country links; shipped as `public/lakes/{CC}.json` | CC0 | No | No | None needed; the lake page links the Wikidata item |
| OpenStreetMap via Overpass (`pipeline/lakes/enrich_lakes.py`) | What stands within the shore radius of each shortlisted water body: swimming areas, beaches, marinas, slipways, dive and boat rental, ferry terminals, parking, toilets, food, campsites, peaks, cliffs, glaciers, waterfalls, castles and how much is built; plus any `swimming` and `access` tags on the water itself. No country sweep for geometry, unlike the beach layer | ODbL 1.0 | Yes: (c) OpenStreetMap contributors | Yes: the published rows are selected, scored and rewritten items (a produced work), and each carries its own ODbL credit | LIVE: per-lake `credit` array in the wire, the Lakes list prints the credit line, Account panel's Data sources screen |
| Wikimedia Commons lake photographs (`pipeline/lakes/enrich_lakes.py`) | Up to five files per water body, found by Commons category, by name plus `nearcoord` and by geosearch at a radius scaled to the lake, with LicenseShortName, LicenseUrl and Artist kept per file | Per file: CC BY-SA, CC BY, CC0 or public domain | Yes, per file | Some files | LIVE: author and licence printed under every photograph on the lake page, linking the Commons file page |
| Wikipedia lake articles (`pipeline/lakes/enrich_lakes.py`) | FACTS ONLY: a fixed vocabulary matched against the intro extract (origin, surroundings, colour, activities, protection) plus the sentences that mention swimming, which are held in the CACHE ONLY so a prohibition can be detected, and the 60-day pageview count. No prose is stored in the wire or shipped | CC BY-SA 4.0 | Facts are not protected; no credit obligation for the extracted attributes | No, because no text is reused | The lake page links the article it read |
| EEA WISE bathing water, lake layer (`pipeline/lakes/enrich_lakes.py`, reads `cache/eea_bathing_water.json`) | Every Lake and River type bathing site within the water body's own shore radius: the best class, the previous class, and the COUNT of designated sites, which is the layer's strongest evidence that swimming somewhere is lawful and monitored | EEA standard re-use policy, effectively CC BY 4.0, verify | Yes, EEA and the Member State authorities that report the coordinates | No | LIVE: the class and the site count are rows in the lake page's facts, the count drives the swimming verdict, EEA credited in the list credit line and the Data sources screen |
| WorldClim 2.1, lake layer (`pipeline/lakes/enrich_lakes.py`, reads `cache/worldclim`) | Monthly air temperature normals sampled at each lake's own coordinate, turned into a MODELLED surface temperature and swimming season. Published as an estimate, never as a measurement, with the model named in `public/lakes/index.json` | Free for academic and other non-commercial use; commercial use needs permission, verify | Yes, citation (Fick and Hijmans 2017) | No | LIVE: the month strip on the lake page carries an estimate note; Data sources block carries the citation. RISK: same non-commercial scope question as the destination climate layer |
| Wikidata mountains (`pipeline/mountains/harvest_peaks.py`, reads the already harvested `cache/features_wikidata.json` spine) | Mountain, summit, hill and volcano entities per country: label, local label, coordinates, elevation, prominence, isolation, P18 image, Commons category, mountain range, protected area, P31 classes, sitelink count, and the P610 highest points of each country and its regions; shipped as `public/mountains/{CC}.json` | CC0 | No | No | None needed; the mountain page links the Wikidata item |
| OpenStreetMap via Overpass (`pipeline/mountains/enrich_peaks.py`) | What stands within 1.5 to 4 km of each shortlisted summit: aerialways and their stations, funicular and rack railways, alpine and wilderness huts, viewpoints, summit restaurants and cafes, parking, towers, observatories and summit crosses, glaciers, cliffs and aretes, national park boundaries, and the paths that carry a `sac_scale` or `via_ferrata_scale` grade. No country sweep for geometry | ODbL 1.0 | Yes: (c) OpenStreetMap contributors | Yes: the published rows are selected, scored and rewritten items (a produced work), and each carries its own ODbL credit | LIVE: per-mountain `credit` array in the wire, the Mountains list prints the credit line, Account panel's Data sources screen. The lift claim names OSM as its source on the page |
| Wikimedia Commons mountain photographs (`pipeline/mountains/enrich_peaks.py`) | Up to six files per mountain, found by Wikidata P18, by Commons category, by name plus `nearcoord`, and by geosearch at a radius scaled to the landform, with LicenseShortName, LicenseUrl and Artist kept per file, capped at two files per photographer | Per file: CC BY-SA, CC BY, CC0 or public domain | Yes, per file | Some files | LIVE: author and licence printed under every photograph on the mountain page, linking the Commons file page |
| Wikipedia mountain articles (`pipeline/mountains/enrich_peaks.py`) | FACTS ONLY: a fixed vocabulary matched against the intro extract (glacier, volcano, lifts, huts, via ferrata, protection, observatory, wildlife) plus the 60-day pageview count. No prose is stored in the wire or shipped, and an article mention of a cable car may only ever produce the weakest lift claim, "lifts on the mountain" | CC BY-SA 4.0 | Facts are not protected; no credit obligation for the extracted attributes | No, because no text is reused | The mountain page links the article it read, and names Wikipedia as the source of a lift claim that came from it |
| Wikidata recurring events (`pipeline/harvest_events.py`) | Festival/event entities with coordinates, labels, descriptions, sitelink counts, month of year; shipped as `public/destinfo/{CC}.json` | CC0 | No | No | None needed; the panel links each event's Wikipedia article |
| Open-Meteo forecast API (live, `continent-app/src/lib/weather.js`) | 7-day daily forecast fetched client-side when a destination panel is open | Free tier for non-commercial use, data CC BY 4.0; commercial use needs the paid API, verify Carta's affiliate status against their definition | Yes, link to Open-Meteo | No | Explore panel's weather section prints "Live forecast by Open-Meteo.com"; add to Data sources screen. RISK: same commercial-scope question as WorldClim, resolve with an API subscription if Carta monetises |
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
| OpenStreetMap route relations via Geofabrik per-country extracts (`pipeline/trails/ingest_osm_routes.py`) | Hiking route relations (geometry, sac_scale, network, names) as trip candidates; extracts cached under `data/raw/geofabrik/` | ODbL 1.0 | Yes: © OpenStreetMap contributors | Yes: the trips table is a derived database, ODbL obligations apply to any published extract | LIVE: per-trip `attribution_text` in every exported file, plus the Account panel's Data sources screen |
| Copernicus GLO-30 DEM | 30 m elevation samples to give trail geometries their Z and recompute ascent and descent | Copernicus DEM instance terms: free use including commercial, credit required, verify current wording | Yes, source credit (Copernicus programme, ESA and Airbus) | No | LIVE: ascent, descent and the elevation profile ship with published trips. Home footer, Data sources block |
| swisstopo swissTLM3D-Wanderwege (`pipeline/trails/crosscheck_portals.py`) | Official Swiss hiking trail geometries: the GeoPackage resolved via the data.geo.admin.ch STAC API into `data/raw/swisstopo/`, staged to `portal_trails` to cross-validate OSM trips | swisstopo open government data terms (free use since 2021, source attribution asked), verify per dataset | Yes: source swisstopo | No | LIVE as a validation signal: no portal geometry is exported, the agreement check is. Home footer, Data sources block |
| IGN BD TOPO layer itineraire_autre (`pipeline/trails/crosscheck_portals.py`) | Official French route itineraries (geometry plus toponyme) via the Geoplateforme WFS, raw pages in `data/raw/ign_bdtopo/`, staged to `portal_trails` to cross-validate OSM trips | Etalab Licence Ouverte 2.0 | Yes: IGN, BD TOPO, Etalab 2.0 | No | LIVE as a validation signal: no portal geometry is exported, the agreement check is. Home footer, Data sources block |
| Kartverket Turrutebasen (`pipeline/trails/crosscheck_portals.py`) | Official Norwegian marked trail network: nationwide Fotrute GML ordered through the Geonorge download API into `data/raw/turrutebasen/`, staged to `portal_trails` to cross-validate OSM trips | CC BY 4.0 | Yes: Kartverket, Turrutebasen | No | LIVE as a validation signal: no portal geometry is exported, the agreement check is. Home footer, Data sources block |
| Self-hosted Valhalla over the Geofabrik extracts (`tools/trailslab/valhalla`, used by `pipeline/trails/repair.py` and `compose_daytrips.py`) | Pedestrian and driving route geometries: spliced into repaired hike geometry and stored as daytrip `trip_stops.leg_geom` | Engine is MIT licensed software; the routes it returns are derived from the same ODbL extracts | Yes: © OpenStreetMap contributors, wherever a routed line renders | Yes: routed geometry inherits the extracts' ODbL obligations | LIVE inside published trips (repaired hike lines, daytrip legs); the OpenStreetMap credit covers it |
| Transitous public plan API, api.transitous.org (`tools/reachability/build_reach.py`, `pipeline/trails/compose_daytrips.py`) | Door to door public transport durations and itinerary geometry: reach minutes per destination (contract D) and daytrip transit legs | Volunteer-run MOTIS instance aggregating national and regional feeds; the underlying feed licenses apply per country (several are CC BY, ODbL or NLOD, see section 3). Usage is by community goodwill: one request per second, contact address in the User-Agent | Per feed, verify before any surface quotes a timetable | Per feed | Reach artifacts ship durations only, not timetables, and the reach filter renders them today, so Transitous is credited in the Account panel's Data sources screen. Daytrip legs stay staging until a daytrip is published |
| Wikivoyage as description signal (`pipeline/trails/describe.py`) | Guide intro for the route name, sent to the model as CONTEXT to judge which supplied facts matter. Never quoted or paraphrased: it is not a mappable source field in the verification pass, and any generated sentence sharing a six word run with the snippet is dropped in code | CC BY-SA 4.0 | Yes if any of its prose is ever used | Yes if any of its prose is ever used | Not attributed and deliberately not used as text. Each `description_grounding` row records which guide, if any, was in context. If a future change quotes it, this becomes a CC BY-SA credit plus share-alike obligation on the description |
| Eurostat urban audit `urb_ctour` (CR2001V nights spent per city) plus `tour_occ_ninat` country totals (`pipeline/trails/market_demand.py`) | Annual visitor nights per city and per country, the demand basis for citytrip city selection; raw responses under `data/raw/market_demand/` | Eurostat reuse policy: CC BY 4.0 | Yes: source Eurostat, dataset and year (stored per market_demand row and printed with every citytrip ranking) | No | Staging only; the demand basis (source plus year) is stored in each citytrip's raw_tags for any later surface |
| Statistics Norway StatBank table 12898, guest nights per municipality (`pipeline/trails/market_demand.py`, NO fallback) | Latest annual guest nights per Norwegian municipality (hotel plus camping, holiday dwelling and hostel categories summed) | NLOD 2.0 | Yes: source Statistics Norway | No | Staging only, as above |
| Statistik Austria OGD `OGD_touextsai_Tour_UA_1` (`pipeline/trails/market_demand.py`, AT fallback) | Monthly nights per Bundesland summed to calendar years; only Wien is stored as a city figure (the one Bundesland that is a city) | CC BY 4.0 (data.statistik.gv.at open data terms) | Yes: source Statistik Austria | No | Staging only, as above |
| Wikimedia Commons stop images for citytrips (`pipeline/trails/compose_citytrips.py`) | Per-file licence, author and description URL resolved via the Wikimedia API for every citytrip stop image; NC/ND and unresolvable files are dropped before staging | Per file: CC0, CC BY, CC BY-SA, public domain and kin; the lab `images` table rejects NC/ND at insert | Yes, per file (author, licence and source URL stored per images row) | Some files (CC BY-SA) | Staging only; per-file credit ships with any published citytrip surface |
| OpenStreetMap scenic features via Overpass (`pipeline/trails/scenic.py`) | Named summits, viewpoints, waterfalls, glaciers, gorges, caves, lakes, castles, ruins, monasteries, lighthouses, huts and springs within 600 m of a curated route: name, kind, elevation, position. Swept per 1.5 degree grid cell into the lab's `scenic_pois`, cached under `cache/beaches/scenic_cell_*.json` | ODbL 1.0 | Yes: (c) OpenStreetMap contributors | Yes: `scenic_pois` is a derived database. What ships is the per-route highlight list and a density score, both selected produced works, and each carries the OSM credit | LIVE: the highlight list and the rating's scenery term ship in `public/trails/`; every trip's `attribution_text` names OSM, and the Account panel's Data sources screen covers it |
| Wikimedia Commons trail photographs (`pipeline/trails/trail_images.py`) | Up to six files per curated route, found by geosearch at points along the line plus a name-and-nearcoord pass, kept only when the camera stood within 400 m of the route. LicenseShortName, LicenseUrl, Artist, description and the shot coordinate are stored per file | Per file: CC0, CC BY, CC BY-SA, public domain and kin; the lab `images` table's CHECK rejects NC and ND at insert and the harvester refuses them again before writing | Yes, per file (author, licence and Commons file page stored and shipped per image) | Some files (CC BY-SA), on the photograph only, never on the route data | LIVE: hero image on every trail card, the views strip on the trail page prints author and licence per photograph on tap, the strip carries a Commons source line, and each country file lists the Commons credit in `attribution` |
| Claude API (`--provider claude`) or Gemini API (`--provider gemini`) in `pipeline/trails/describe.py` | Not a data source: the model only rewrites the facts block we assemble from staged rows. The stored `description_md` is our own text and inherits the licenses of the facts behind it (ODbL for OSM tags and geometry, portal terms for the confirmation line) | Anthropic commercial terms: customer owns the outputs. Google Gemini terms: same for outputs, but on the **free** tier Google may use prompts and responses to improve their products, so only open-data facts go in the prompt | No credit obligation to either vendor | No | n/a. Trail credits still owe OSM and the national portals as above. NOTE: the EEA paid-services rule that put `plan-day` on a billed Gemini key covers API clients offered to users; describe.py is a local batch script and is not one, so the free tier is in scope for it only while it stays local |

## 8. Natural features layer (beaches and mountains)

The `pipeline/features/*` chain lifts beaches and summits out of the POI layer
into standalone entities, scores them, and publishes tiers 1 and 2 as one file
per priced country: `continent-app/public/features/<ISO2>.json` plus
`index.json`. Today that is 5,472 features across 43 country files.

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

The share-alike question this layer raises is the same one follow-up item 2
already tracks, and it is not answered by the fact that the export is
selective. The ranker keeps 5,472 of 17,858 candidates, scores them, corroborates
them and tiers them, which is a produced work in the sense the trails export
uses, but the names and coordinates inside it are still OpenStreetMap's. Treat
the wire as an ODbL extract until that review happens.

## MISSING attributions, follow-up list

Cleared on 2026-08-11 by the footer pass. The app renders a Data sources
block from `continent-app/src/data/attribution.js`, which covers what the
previous eleven
entries asked for: OpenStreetMap contributors, GeoNames, Inside Airbnb, the
EuroGeographics boundary notice, EEA bathing water, the WorldClim citation,
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
3. Belgian operators (SNCB, De Lijn, STIB, TEC): "typically yes, verify per
   operator" is not a settled obligation, so no credit was invented. Verify
   the per-operator terms, then add a row to `attribution.js`.
4. Hostelworld and LiteAPI: display terms come with the partner agreements,
   which are still pending. The stay tiers ship on fixtures until then.
5. Feeds still marked "Raw ETL only": nothing renders from them yet. Each row
   says what its credit becomes when something does.
6. UNESCO World Heritage Centre: the natural-features wire cites it in 13
   country files and tags 276 features with the `unesco` designation, and
   `attribution.js` has no entry for it. The ready-to-paste entry is at the
   bottom of this file. Confirm the terms wording first, and confirm where
   `cache/unesco_whc.json` came from: no script in the tree writes it.
7. The natural-features citation surface: every country file already carries
   the `sources` block and every photo its TASL row, and none of it renders,
   because the features UI is still being built. The obligation lands the
   moment a beach or a summit is shown, not when the file is written. Two
   credits are needed there: the file's `sources` block (OpenStreetMap always,
   the EEA where a water class is shown, UNESCO where a designation is) and
   the per-image author, licence and licence_url beside each photo.
8. 35 shipped photos carry an attribution-required licence with no author name
   (`cache/poi_image_licenses.json` resolved the licence but not the author).
   A per-image credit that reads "CC BY-SA 3.0" with nobody credited is not a
   credit. Either the cache fills the author, or those files stop shipping.

Open risk items, not attribution but licensing scope: WorldClim non-commercial
scope, Ferryhopper commercial terms, OpenSky commercial-use terms, Numbeo
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
