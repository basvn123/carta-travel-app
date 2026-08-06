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
  row with a required user-facing credit has an entry there. A later pass
  wires that array into a footer or about screen.
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
| ExchangeRate-API open endpoint (open.er-api.com, used by `harvest_wizzair.py`) | Daily EUR conversion table (`cache/fx_rates_eur.json`) | Free open endpoint; terms require a credit link ("Rates by Exchange Rate API"), verify current wording | Yes | No | MISSING |

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
| GTFS.de / DELFI plus Mobilithek (collector: germany) | DE national GTFS (long distance, regional, local), Mobilithek subscription feeds | GTFS.de: CC BY-SA 4.0 per blueprint, free tier requires attribution (per `CREDENTIALS.md`). Mobilithek datasets mostly dl-de/by-2.0, verify per dataset | Yes | Yes (CC BY-SA) | MISSING |
| transport.data.gouv.fr / SNCF (collector: france_static) | SNCF static GTFS and NeTEx (TGV, OUIGO, Intercites, TER) | ODbL per blueprint; some datasets licence ouverte, verify per dataset | Yes | Yes (ODbL derived database) | MISSING |
| Mobility Data Austria (collector: austria) | NeTEx and GTFS for rail, bus, tram, cableway | Shared portal license, account-gated acceptance | Per license, verify | Verify | Raw ETL only |
| Belgian operators: SNCB, De Lijn, STIB, TEC (collector: belgium) | GTFS static and realtime, SNCB NeTEx EPIP | Per-operator open data terms (keys for De Lijn and STIB) | Typically yes, verify per operator | No | MISSING |
| Danish NAP plus Rejseplanen (collector: denmark) | Rail, metro, bus, ferry feeds | Account terms (Rejseplanen Labs) | Per terms, verify | No | Raw ETL only |
| Traficom FinAP plus Digitraffic (collector: finland) | FinAP catalogue, Digitraffic open rail JSON | Digitraffic: CC BY 4.0. FinAP per dataset | Yes (Digitraffic) | No | MISSING |
| NDOV Loket / OVapi (collector: netherlands) | NL national GTFS, NeTEx deliveries | CC0 per blueprint and collector header | No | No | None needed |
| Entur (collector: norway) | NO national GTFS, NeTEx, SIRI ET/SX/VM | NLOD (Norwegian licence for open government data) | Yes | No | MISSING |
| Trafiklab / Samtrafiken (collector: sweden) | GTFS Sweden 3, NeTEx Sweden, regional feeds | CC0 per collector header, verify per feed | No | No | None needed |
| opentransportdata.swiss (collector: switzerland) | GTFS, NeTEx, HRDF via the DCAT catalogue | Portal terms of use (free token) | Yes per portal terms, verify | No | MISSING |
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
| Nordic ferry feeds via Entur and Trafiklab (collector: nordic_ferries) | Per-operator ferry archives (Hurtigruten, archipelago) | Entur NLOD, Trafiklab CC0 | Yes (Entur part) | No | MISSING |
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
| Inside Airbnb (`pipeline/harvest_accommodation.py`) | Listing-level nightly medians, per-city seasonality, per-capacity and neighbourhood medians | CC BY 4.0 (per harvester header) | Yes | No | MISSING |
| EEA WISE bathing water (`pipeline/harvest_bathing_water.py`) | Official bathing site classifications near each destination | EEA standard re-use policy, effectively CC BY 4.0, verify | Yes | No | WaterQualityBadge shows the rating; source credit MISSING |
| WorldClim 2.1 (`pipeline/harvest_climate_worldclim.py`) | Monthly climate normals sampled per destination | Free for academic and other non-commercial use; commercial use needs permission, verify | Yes, citation (Fick and Hijmans 2017) | No | MISSING. RISK: Carta carries affiliate links, so the non-commercial scope needs resolving (permission, or a replacement like ERA5 / Open-Meteo climate API) |
| GeoNames cities500 (`pipeline/harvest_geonames.py`) | Population, settlement class, elevation, timezone | CC BY 4.0 (per harvester header) | Yes | No | MISSING |
| Wikipedia (`pipeline/harvest_images.py`, `harvest_pageviews.py`, live `cityResearch.js`) | Lead image pointers, article URLs, pageview counts, live summaries | Text CC BY-SA 4.0; pageview statistics CC0 | Yes for text | Yes for text | Image credit link on the destination hero (DetailPanel); live research names Wikipedia in the chat copy; summary text credit otherwise MISSING |
| Wikimedia Commons (destination hero images, POI thumbnails via `harvest_pois_wikidata_images.py`) | Photo files hotlinked as thumbnails | Per file: CC BY-SA, CC BY or public domain | Yes, per file | Some files | Hero image links to its Wikipedia page (DetailPanel credit); POI thumbnails MISSING per-file credit |
| Wikidata (`pipeline/harvest_pois_wikidata_images.py`, live `cityResearch.js`) | Entity coordinates, labels, P18 image pointers, descriptions | CC0 | No | No | None needed |
| Wikivoyage (`pipeline/harvest_wikivoyage.py`, activities tier 2) | Intro blurbs, See and Do listings | CC BY-SA 4.0 | Yes | Yes | "Open the travel guide" link on the destination panel; blurb credit otherwise MISSING |
| OpenTripMap (`pipeline/harvest_activities.py`, preferred tier) | POI lists with importance rate per destination | Free API tier; terms ask for a credit link, verify current wording | Yes | Underlying data derives from OSM and Wikidata | MISSING |
| Overture Maps Places (`pipeline/harvest_pois_overture.py`) | Bulk sightseeing POIs for the whole catalogue | CDLA-Permissive 2.0 | Not required, credit recommended | No | None needed; recommended credit noted for the footer pass |
| OpenStreetMap via Overpass (`pipeline/harvest_protected_areas_osm.py`, live `cityResearch.js`) | Protected areas layer, live town POIs | ODbL 1.0 | Yes: © OpenStreetMap contributors | Yes: derived databases carry ODbL obligations | Map tiles credit OSM via the attribution control; the nature and POI layers shipped inside app_data.json are MISSING a credit. Share-alike review needed for the OSM-derived slice of app_data.json |
| Eurostat tour_occ_nin3 plus GISCO NUTS 3 boundaries (`pipeline/harvest_tourism_density.py`) | Regional tourism density (crowding tiers) | Eurostat reuse: CC BY 4.0. GISCO boundaries carry the EuroGeographics notice | Yes, both | No | Crowding tooltip cites Eurostat with year; "© EuroGeographics for the administrative boundaries" MISSING |
| Numbeo point anchors (`pipeline/gen_mock_data.py` country tables, oneoff calibrations) | Hand-read meal, drink and grocery price anchors used to seed lifestyle costs | Proprietary site, no open license; small hand-typed factual excerpts, not a bulk harvest | n/a | No | In-data source tags only. RISK: verify acceptable use, plan replacement with an open source over time |

## 6. Runtime services called from the browser

| Source | What we take | License | Attribution required | Share-alike | Where attributed today |
|---|---|---|---|---|---|
| CARTO Voyager basemap (all `src/map/*` components) | Vector tiles and map style, no API key | CARTO free basemap terms: require © CARTO plus © OpenStreetMap contributors, verify tier limits | Yes | No | Map attribution control (the style declares its credits, MapLibre renders them) |
| OSRM on FOSSGIS (`src/lib/routing.js`) | Walking and driving routes, ferry-aware | Public service usage policy; underlying data ODbL | OSM credit where routes render; FOSSGIS credit is courtesy | No | Privacy policy names the service; routes draw on the OSM-credited map |
| Nominatim (`src/lib/geocode.js`, `cityResearch.js`) | Address and place search | Public service usage policy; data ODbL | Yes, OSM credit | No | Privacy policy names the service |
| Overpass API (live town research, `cityResearch.js`) | Live OSM POI queries for off-catalogue towns | Shared community endpoint; data ODbL | Yes, OSM credit | Yes | Chat flow copy names OpenStreetMap; formal credit MISSING |
| Supabase, Google sign-in, Gemini plan-day function | Services, not data sources | Service terms | n/a | n/a | Privacy policy covers them; out of scope for this ledger |

## MISSING attributions, follow-up list

User-facing credits the licenses require that the app does not show today.
The footer pass that consumes `continent-app/src/data/attribution.js` should
clear this list.

1. OpenStreetMap contributors (ODbL): required for the nature layer, the POI
   layers with OSM origins, live town research results, and routing and
   geocoding results, everywhere they render off the map canvas.
2. GeoNames (CC BY 4.0): population and settlement data shown in destination
   panels.
3. Inside Airbnb (CC BY 4.0): nightly rate anchors behind every stay price.
4. Eurostat GISCO boundary notice: "© EuroGeographics for the administrative
   boundaries" (the Eurostat data credit itself is present in the crowding
   tooltip).
5. EEA: bathing water classifications behind WaterQualityBadge.
6. WorldClim 2.1: citation, plus the open non-commercial licensing question
   (see the RISK note in section 5).
7. OpenTripMap: credit link per its API terms.
8. Wikipedia and Wikivoyage text (CC BY-SA 4.0): summaries and guide blurbs
   need a visible source and license notice; share-alike applies to the
   shipped text.
9. Wikimedia Commons POI thumbnails: per-file credit (the destination hero
   image already links to its source page).
10. ExchangeRate-API (open.er-api.com): credit link per its terms, for the FX
    table baked into Wizz Air EUR conversion.
11. GTFS.de / DELFI (CC BY-SA 4.0 plus free tier attribution), Entur (NLOD),
    opentransportdata.swiss (portal terms), transport.data.gouv.fr / SNCF
    (ODbL): credits due once ground transport surfaces render from this data;
    ODbL and CC BY-SA also put share-alike obligations on derived artifacts
    such as the ground fare calibration.

Open risk items, not attribution but licensing scope: WorldClim non-commercial
scope, Ferryhopper commercial terms, OpenSky commercial-use terms, Numbeo
anchor provenance. Each is flagged in its row above.
