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
  row with a required user-facing credit has an entry there, and the home
  footer's Data sources block renders it (`HomePage.jsx`).
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
| EEA WISE bathing water (`pipeline/harvest_bathing_water.py`) | Official bathing site classifications near each destination | EEA standard re-use policy, effectively CC BY 4.0, verify | Yes | No | WaterQualityBadge shows the rating; source credited in the home footer, data sources block |
| WorldClim 2.1 (`pipeline/harvest_climate_worldclim.py`) | Monthly climate normals sampled per destination | Free for academic and other non-commercial use; commercial use needs permission, verify | Yes, citation (Fick and Hijmans 2017) | No | Home footer, Data sources block (citation). RISK: Carta carries affiliate links, so the non-commercial scope needs resolving (permission, or a replacement like ERA5 / Open-Meteo climate API) |
| GeoNames cities500 (`pipeline/harvest_geonames.py`) | Population, settlement class, elevation, timezone | CC BY 4.0 (per harvester header) | Yes | No | Home footer, Data sources block |
| Wikipedia (`pipeline/harvest_images.py`, `harvest_pageviews.py`, `pipeline/trails/popularity.py`, live `cityResearch.js`) | Lead image pointers, article URLs, pageview counts, live summaries | Text CC BY-SA 4.0; pageview statistics CC0 | Yes for text | Yes for text | Image credit link on the destination hero (DetailPanel); live research names Wikipedia in the chat copy; home footer, data sources block carries the text credit and licence |
| Wikimedia Commons (destination hero images, POI thumbnails via `harvest_pois_wikidata_images.py`) | Photo files hotlinked as thumbnails | Per file: CC BY-SA, CC BY or public domain | Yes, per file | Some files | Hero image links to its Wikipedia page (DetailPanel credit); Home footer, Data sources block credits Commons as a whole; per-file credit on POI thumbnails still MISSING |
| Wikidata (`pipeline/harvest_pois_wikidata_images.py`, `pipeline/trails/popularity.py` sitelink counts, live `cityResearch.js`) | Entity coordinates, labels, P18 image pointers, descriptions, sitelink counts | CC0 | No | No | None needed |
| Wikivoyage (`pipeline/harvest_wikivoyage.py`, activities tier 2) | Intro blurbs, See and Do listings | CC BY-SA 4.0 | Yes | Yes | "Open the travel guide" link on the destination panel; home footer, data sources block carries the blurb credit and licence |
| OpenTripMap (`pipeline/harvest_activities.py`, preferred tier) | POI lists with importance rate per destination | Free API tier; terms ask for a credit link, verify current wording | Yes | Underlying data derives from OSM and Wikidata | Home footer, Data sources block |
| Overture Maps Places (`pipeline/harvest_pois_overture.py`) | Bulk sightseeing POIs for the whole catalogue | CDLA-Permissive 2.0 | Not required, credit recommended | No | Home footer, Data sources block (the recommended credit) |
| OpenStreetMap via Overpass (`pipeline/harvest_protected_areas_osm.py`, live `cityResearch.js`) | Protected areas layer, live town POIs | ODbL 1.0 | Yes: © OpenStreetMap contributors | Yes: derived databases carry ODbL obligations | Map tiles credit OSM via the attribution control; the nature and POI layers shipped inside app_data.json are credited in the home footer, data sources block. Share-alike review still needed for the OSM-derived slice of app_data.json |
| Eurostat tour_occ_nin3 plus GISCO NUTS 3 boundaries (`pipeline/harvest_tourism_density.py`) | Regional tourism density (crowding tiers) | Eurostat reuse: CC BY 4.0. GISCO boundaries carry the EuroGeographics notice | Yes, both | No | Crowding tooltip cites Eurostat with year; the EuroGeographics boundary notice is in the home footer, data sources block |
| Numbeo point anchors (`pipeline/gen_mock_data.py` country tables, oneoff calibrations) | Hand-read meal, drink and grocery price anchors used to seed lifestyle costs | Proprietary site, no open license; small hand-typed factual excerpts, not a bulk harvest | n/a | No | In-data source tags only. RISK: verify acceptable use, plan replacement with an open source over time |

## 6. Runtime services called from the browser

| Source | What we take | License | Attribution required | Share-alike | Where attributed today |
|---|---|---|---|---|---|
| CARTO Voyager basemap (all `src/map/*` components) | Vector tiles and map style, no API key | CARTO free basemap terms: require © CARTO plus © OpenStreetMap contributors, verify tier limits | Yes | No | Map attribution control (the style declares its credits, MapLibre renders them) |
| OSRM on FOSSGIS (`src/lib/routing.js`) | Walking and driving routes, ferry-aware | Public service usage policy; underlying data ODbL | OSM credit where routes render; FOSSGIS credit is courtesy | No | Privacy policy names the service; routes draw on the OSM-credited map |
| Nominatim (`src/lib/geocode.js`, `cityResearch.js`) | Address and place search | Public service usage policy; data ODbL | Yes, OSM credit | No | Privacy policy names the service |
| Overpass API (live town research, `cityResearch.js`) | Live OSM POI queries for off-catalogue towns | Shared community endpoint; data ODbL | Yes, OSM credit | Yes | Chat flow copy names OpenStreetMap; formal credit in the home footer, data sources block |
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
| OpenStreetMap route relations via Geofabrik per-country extracts (`pipeline/trails/ingest_osm_routes.py`) | Hiking route relations (geometry, sac_scale, network, names) as trip candidates; extracts cached under `data/raw/geofabrik/` | ODbL 1.0 | Yes: © OpenStreetMap contributors | Yes: the trips table is a derived database, ODbL obligations apply to any published extract | LIVE: per-trip `attribution_text` in every exported file, plus the home footer, data sources block |
| Copernicus GLO-30 DEM | 30 m elevation samples to give trail geometries their Z and recompute ascent and descent | Copernicus DEM instance terms: free use including commercial, credit required, verify current wording | Yes, source credit (Copernicus programme, ESA and Airbus) | No | LIVE: ascent, descent and the elevation profile ship with published trips. Home footer, Data sources block |
| swisstopo swissTLM3D-Wanderwege (`pipeline/trails/crosscheck_portals.py`) | Official Swiss hiking trail geometries: the GeoPackage resolved via the data.geo.admin.ch STAC API into `data/raw/swisstopo/`, staged to `portal_trails` to cross-validate OSM trips | swisstopo open government data terms (free use since 2021, source attribution asked), verify per dataset | Yes: source swisstopo | No | LIVE as a validation signal: no portal geometry is exported, the agreement check is. Home footer, Data sources block |
| IGN BD TOPO layer itineraire_autre (`pipeline/trails/crosscheck_portals.py`) | Official French route itineraries (geometry plus toponyme) via the Geoplateforme WFS, raw pages in `data/raw/ign_bdtopo/`, staged to `portal_trails` to cross-validate OSM trips | Etalab Licence Ouverte 2.0 | Yes: IGN, BD TOPO, Etalab 2.0 | No | LIVE as a validation signal: no portal geometry is exported, the agreement check is. Home footer, Data sources block |
| Kartverket Turrutebasen (`pipeline/trails/crosscheck_portals.py`) | Official Norwegian marked trail network: nationwide Fotrute GML ordered through the Geonorge download API into `data/raw/turrutebasen/`, staged to `portal_trails` to cross-validate OSM trips | CC BY 4.0 | Yes: Kartverket, Turrutebasen | No | LIVE as a validation signal: no portal geometry is exported, the agreement check is. Home footer, Data sources block |
| Self-hosted Valhalla over the Geofabrik extracts (`tools/trailslab/valhalla`, used by `pipeline/trails/repair.py` and `compose_daytrips.py`) | Pedestrian and driving route geometries: spliced into repaired hike geometry and stored as daytrip `trip_stops.leg_geom` | Engine is MIT licensed software; the routes it returns are derived from the same ODbL extracts | Yes: © OpenStreetMap contributors, wherever a routed line renders | Yes: routed geometry inherits the extracts' ODbL obligations | LIVE inside published trips (repaired hike lines, daytrip legs); the OpenStreetMap credit covers it |
| Transitous public plan API, api.transitous.org (`tools/reachability/build_reach.py`, `pipeline/trails/compose_daytrips.py`) | Door to door public transport durations and itinerary geometry: reach minutes per destination (contract D) and daytrip transit legs | Volunteer-run MOTIS instance aggregating national and regional feeds; the underlying feed licenses apply per country (several are CC BY, ODbL or NLOD, see section 3). Usage is by community goodwill: one request per second, contact address in the User-Agent | Per feed, verify before any surface quotes a timetable | Per feed | Reach artifacts ship durations only, not timetables, and the reach filter renders them today, so Transitous is credited in the home footer, data sources block. Daytrip legs stay staging until a daytrip is published |
| Wikivoyage as description signal (`pipeline/trails/describe.py`) | Guide intro for the route name, sent to the model as CONTEXT to judge which supplied facts matter. Never quoted or paraphrased: it is not a mappable source field in the verification pass, and any generated sentence sharing a six word run with the snippet is dropped in code | CC BY-SA 4.0 | Yes if any of its prose is ever used | Yes if any of its prose is ever used | Not attributed and deliberately not used as text. Each `description_grounding` row records which guide, if any, was in context. If a future change quotes it, this becomes a CC BY-SA credit plus share-alike obligation on the description |
| Eurostat urban audit `urb_ctour` (CR2001V nights spent per city) plus `tour_occ_ninat` country totals (`pipeline/trails/market_demand.py`) | Annual visitor nights per city and per country, the demand basis for citytrip city selection; raw responses under `data/raw/market_demand/` | Eurostat reuse policy: CC BY 4.0 | Yes: source Eurostat, dataset and year (stored per market_demand row and printed with every citytrip ranking) | No | Staging only; the demand basis (source plus year) is stored in each citytrip's raw_tags for any later surface |
| Statistics Norway StatBank table 12898, guest nights per municipality (`pipeline/trails/market_demand.py`, NO fallback) | Latest annual guest nights per Norwegian municipality (hotel plus camping, holiday dwelling and hostel categories summed) | NLOD 2.0 | Yes: source Statistics Norway | No | Staging only, as above |
| Statistik Austria OGD `OGD_touextsai_Tour_UA_1` (`pipeline/trails/market_demand.py`, AT fallback) | Monthly nights per Bundesland summed to calendar years; only Wien is stored as a city figure (the one Bundesland that is a city) | CC BY 4.0 (data.statistik.gv.at open data terms) | Yes: source Statistik Austria | No | Staging only, as above |
| Wikimedia Commons stop images for citytrips (`pipeline/trails/compose_citytrips.py`) | Per-file licence, author and description URL resolved via the Wikimedia API for every citytrip stop image; NC/ND and unresolvable files are dropped before staging | Per file: CC0, CC BY, CC BY-SA, public domain and kin; the lab `images` table rejects NC/ND at insert | Yes, per file (author, licence and source URL stored per images row) | Some files (CC BY-SA) | Staging only; per-file credit ships with any published citytrip surface |
| Claude API (`--provider claude`) or Gemini API (`--provider gemini`) in `pipeline/trails/describe.py` | Not a data source: the model only rewrites the facts block we assemble from staged rows. The stored `description_md` is our own text and inherits the licenses of the facts behind it (ODbL for OSM tags and geometry, portal terms for the confirmation line) | Anthropic commercial terms: customer owns the outputs. Google Gemini terms: same for outputs, but on the **free** tier Google may use prompts and responses to improve their products, so only open-data facts go in the prompt | No credit obligation to either vendor | No | n/a. Trail credits still owe OSM and the national portals as above. NOTE: the EEA paid-services rule that put `plan-day` on a billed Gemini key covers API clients offered to users; describe.py is a local batch script and is not one, so the free tier is in scope for it only while it stays local |

## MISSING attributions, follow-up list

Cleared on 2026-08-11 by the footer pass. The home footer now renders a Data
sources block from `continent-app/src/data/attribution.js`
(`HomePage.jsx`, `.home-credits`), which covers what the previous eleven
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

Open risk items, not attribution but licensing scope: WorldClim non-commercial
scope, Ferryhopper commercial terms, OpenSky commercial-use terms, Numbeo
anchor provenance. Each is flagged in its row above.
