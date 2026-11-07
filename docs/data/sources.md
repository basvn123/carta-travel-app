<!-- GENERATED FILE. Do not edit: the source is pipeline/config/sources.yaml.
     Regenerate with  python -I pipeline/provenance_sources.py
     CI runs           python -I pipeline/provenance_sources.py --check  (tests/test_provenance.py) -->

# Data sources and field provenance

Every key block on the wire (an object-valued destination key of
`docs/wire.schema.json`, schema 20 and later) carries two keys:

- `_src`: the id of one source below, where the block's values come from;
- `_asof`: the date (`YYYY-MM-DD`) the block's pipeline layer last built it.

`pipeline/provenance.py` stamps them on every write of the master and the
served wire; the app lifts them off the blocks as the country files load
(`continent-app/src/lib/provenance.js`, `provenanceOf(record, block)`).
Licence ids are SPDX; `LicenseRef-carta-derived` means Carta computes the
block from the listed inputs, whose licences bind. The full licence text and
attribution rules are in the licence ledger, `docs/tos/data_licenses.md`
(rows named in the Ledger column). Cadence codes are the EU Publications
Office frequency table (`IRREG`: backfill or by hand). Owner `box` runs on
the build box schedule, `owner` by hand.

## Sources

| Id | Source | Kind | Licence | Cadence | Owner | Tasks | Inputs | Ledger |
|---|---|---|---|---|---|---|---|---|
| `carta_beauty` | Carta beauty score from designations, protected areas, coast and relief | derived | LicenseRef-carta-derived | MONTHLY | box | `fame` | `unesco`, `wikidata`, `osm_protected`, `eea_bathing` |  |
| `carta_food` | Carta food and drink prices (Open Prices, Eurostat price levels and HICP, Numbeo anchors, tourist premium) | derived | LicenseRef-carta-derived | MONTHLY | box | `food`, `tourist_premium` | `open_prices`, `eurostat_prices`, `numbeo`, `eurostat_nights` | `open_food_facts_open_prices`, `eurostat_food_price_tables`, `numbeo_point_anchors` |
| `carta_place` | Carta place class and visit hours from GeoNames population and the POI mix | derived | LicenseRef-carta-derived | MONTHLY | box | `fame` | `geonames`, `poi_mix` |  |
| `carta_rating` | Carta traveller rating from fame (pageviews), designations, beauty, place class and POI rates | derived | LicenseRef-carta-derived | MONTHLY | box | `fame`, `poi_significance` | `wikipedia`, `wikidata`, `carta_beauty`, `carta_place`, `poi_mix` | `wikidata_place_registers_pageviews`, `wikipedia` |
| `carta_taste` | Carta place taste profile from the rating, nature tiers and guided-search areas | derived | LicenseRef-carta-derived | WEEKLY | box | `rating_v5_profile` | `carta_rating`, `climate`, `eurostat_nights` |  |
| `carta_transfer` | Carta transfer from the anchor airport, road distance at about 0.15 EUR per km | derived | LicenseRef-carta-derived | QUARTERLY | box | `airports` | `osm`, `ourairports` | `ourairports` |
| `climate` | Monthly climate normals (NASA POWER), daily detail (Open-Meteo) and sea temperature (NASA JPL MUR SST) | primary | LicenseRef-us-gov-public-domain | QUARTERLY | box | `climate`, `climate_daily` |  | `nasa_power_climatology_api`, `open_meteo_forecast_api`, `nasa_jpl_mur_sst` |
| `commons` | Wikipedia and Wikimedia Commons lead images | primary | LicenseRef-per-file | MONTHLY | box | `images`, `hero_audit` |  | `wikipedia`, `wikimedia_commons` |
| `eea_bathing` | EEA WISE bathing water quality (Bathing Water Directive results) | primary | CC-BY-4.0 | QUARTERLY | box | `bathing_water` |  | `eea_wise_bathing_water` |
| `eurostat_nights` | Eurostat nights spent per NUTS 2 and NUTS 3, ONS and VisitBritain for the UK | primary | CC-BY-4.0 | QUARTERLY | box | `crowding`, `crowding_uk` |  | `eurostat_tour_occ_nin3`, `uk_crowds_ons` |
| `eurostat_prices` | Eurostat price levels, HICP and exchange rates | primary | CC-BY-4.0 | MONTHLY | box | `food` |  | `eurostat_food_price_tables` |
| `geonames` | GeoNames cities500 dump (population, settlement class) | primary | CC-BY-4.0 | IRREG | box | `geonames` |  | `geonames_cities500` |
| `numbeo` | Numbeo point anchors, a small hand-typed sample | primary | LicenseRef-numbeo-terms | IRREG | owner |  |  | `numbeo_point_anchors` |
| `open_prices` | Open Food Facts Open Prices daily dump | primary | ODbL-1.0 | MONTHLY | box | `food` |  | `open_food_facts_open_prices` |
| `osm` | OpenStreetMap via Overpass and Geofabrik (roads, transit lines, ferries, parking) | primary | ODbL-1.0 | MONTHLY | box | `transit_lines` |  | `openstreetmap_via_overpass`, `openstreetmap_via_overpass_harvest_parking`, `openstreetmap_via_geofabrik_country` |
| `osm_protected` | OpenStreetMap protected areas, national parks and nature reserves (Overpass) | primary | ODbL-1.0 | IRREG | box | `nature` |  | `openstreetmap_via_overpass` |
| `osm_seasons` | OpenStreetMap opening_hours and seasonal tags of places, huts, lifts and ferries (Geofabrik extracts) | primary | ODbL-1.0 | QUARTERLY | box | `seasons` |  | `openstreetmap_via_geofabrik_country` |
| `ourairports` | OurAirports airport list | primary | LicenseRef-public-domain | QUARTERLY | box | `airports` |  | `ourairports` |
| `poi_mix` | Things to do from OpenTripMap, OpenStreetMap, Overture Places, Wikidata and Wikivoyage listings | derived | LicenseRef-carta-derived | MONTHLY | box | `activities`, `overture`, `poi_significance` | `osm`, `wikidata`, `wikivoyage` | `opentripmap`, `overture_maps_places`, `wikidata_sitelink_counts_live`, `wikivoyage` |
| `stays_scrape` | Booking.com and Hostelworld search lists, owner-run sample (stays journal, T1021) | primary | LicenseRef-site-terms | MONTHLY | owner |  |  | `booking_com_search_lists`, `hostelworld_city_lists` |
| `toll_tables` | Per-country toll and vignette tables kept in pipeline/toll_layer.py | derived | LicenseRef-carta-derived | IRREG | owner |  |  |  |
| `unesco` | UNESCO World Heritage List | primary | LicenseRef-unesco-whc-terms | ANNUAL | owner |  |  | `unesco_world_heritage_centre` |
| `wikidata` | Wikidata (Special:EntityData and the query service) | primary | CC0-1.0 | IRREG | owner |  |  | `wikidata_sitelink_counts_live` |
| `wikipedia` | Wikipedia pageviews and lead text | primary | CC-BY-SA-4.0 | MONTHLY | box | `fame` |  | `wikipedia` |
| `wikivoyage` | Wikivoyage lead and link | primary | CC-BY-SA-4.0 | IRREG | box | `guide` |  | `wikivoyage` |

## Key blocks

| Block | `_src` | Licence | Cadence | Layer writers |
|---|---|---|---|---|
| `costs` | `carta_food` | LicenseRef-carta-derived | MONTHLY | `pipeline/apply_food_prices.py`, `pipeline/apply_tourist_premium.py` |
| `accommodation` | `stays_scrape` | LicenseRef-site-terms | MONTHLY | `pipeline/stays/apply_stays.py` |
| `local_transport` | `osm` | ODbL-1.0 | MONTHLY | `pipeline/apply_car_layer.py` |
| `beauty` | `carta_beauty` | LicenseRef-carta-derived | MONTHLY | `pipeline/apply_beauty_layer.py` |
| `image` | `commons` | LicenseRef-per-file | MONTHLY | `pipeline/harvest_images.py`, `pipeline/audit/audit_hero_images.py` |
| `activities` | `poi_mix` | LicenseRef-carta-derived | MONTHLY | `pipeline/harvest_activities.py`, `pipeline/pois/harvest_pois_overture.py`, `pipeline/score_significance.py`, `pipeline/poi_labels.py`, `pipeline/backfill_landmarks.py` |
| `rating` | `carta_rating` | LicenseRef-carta-derived | MONTHLY | `pipeline/apply_rating_layer.py` |
| `taste` | `carta_taste` | LicenseRef-carta-derived | WEEKLY | `pipeline/place_taste_profile.py` |
| `transfer` | `carta_transfer` | LicenseRef-carta-derived | QUARTERLY | `pipeline/apply_airport_anchors.py` |
| `climate` | `climate` | LicenseRef-us-gov-public-domain | QUARTERLY | `pipeline/apply_climate.py` |
| `place` | `carta_place` | LicenseRef-carta-derived | MONTHLY | `pipeline/apply_place_layer.py` |
| `driving_toll` | `toll_tables` | LicenseRef-carta-derived | IRREG | `pipeline/apply_toll_layer.py` |
| `bathing_water` | `eea_bathing` | CC-BY-4.0 | QUARTERLY | `pipeline/harvest_bathing_water.py` |
| `crowding` | `eurostat_nights` | CC-BY-4.0 | QUARTERLY | `pipeline/harvest_tourism_density.py`, `pipeline/harvest_uk_crowds.py` |
| `geonames` | `geonames` | CC-BY-4.0 | IRREG | `pipeline/harvest_geonames.py` |
| `nature` | `osm_protected` | ODbL-1.0 | IRREG | `pipeline/harvest_protected_areas_osm.py` |
| `guide` | `wikivoyage` | CC-BY-SA-4.0 | IRREG | `pipeline/apply_wikivoyage.py` |
| `wikidata` | `wikidata` | CC0-1.0 | IRREG |  |
| `season` | `osm_seasons` | ODbL-1.0 | QUARTERLY | `pipeline/harvest_seasons.py` |

25 sources, 19 key blocks.
