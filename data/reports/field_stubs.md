# Field stubs

Fields the Explore sheets show as "Not available yet" because no source is wired.
Written by pipeline/field_stubs/report.py.

| Layer | Field | Wire key | Source to wire | Stub | Task |
|---|---|---|---|---|---|
| beaches | beach_audience_luxury | `audience.luxury` | none exact: would need hotel star and lido tier near the beach | `t631_water.py:harvest_beach_audience_luxury` | T631 |
| beaches | lido_price | `lido.price` | none known (open data): entry, sunbed and umbrella prices and reservation need per lido | `t631_water.py:harvest_lido_prices` | T631 |
| beaches | surface_at_water_entry | `entrySurface` | OSM surface on the beach is for the sand; the sea bed at the entry needs a survey or photo classification | `t631_water.py:harvest_beach_entry_surface` | T631 |
| beaches | walk_from_centre | `walkFrom.centre` | routing from the base town centre to the beach (pedestrian router) | `t631_water.py:harvest_beach_walk_from_centre` | T631 |
| beaches | walk_from_ferry_pier | `walkFrom.pier` | routing from the nearest ferry pier to the beach (pedestrian router); base.km is straight line to a town, not a walk | `t631_water.py:harvest_beach_walk_from_pier` | T631 |
| beaches | water_temperature_beach | `sst` | monthly sea surface temperature climatology per beach (Copernicus Marine); the export already forwards `sst` when a beach carries it | `t631_water.py:harvest_beach_water_temperature` | T631 |
| destinations | bus services between the towns | `practical.transit.bus` | open GTFS feeds (regional bus operators, Transitland) | `t632_practical.py:harvest_local_transit_bus` | T632 |
| destinations | emergency contacts in the destination PDF | `practical.emergency` | 112 and national numbers per country (open reference lists), nearest hospital from OSM | `t632_practical.py:harvest_emergency_contacts` | T632 |
| destinations | ferry services between the towns | `practical.transit.ferry` | ferry operator timetables, OSM route=ferry relations, GTFS where published | `t632_practical.py:harvest_local_transit_ferry` | T632 |
| destinations | local rules (traffic zones, alcohol, dress, drone, fire) | `practical.local_rules` | none known as open data; national tourism boards and Wikivoyage Respect sections | `t632_practical.py:harvest_local_rules` | T632 |
| destinations | offline map in the destination PDF | `pdf.offline_map` | static map tiles rendered per destination, or an OsmAnd/Organic Maps deep link | `t632_practical.py:build_pdf_offline_map` | T632 |
| destinations | sunshine_hours | `climate.sun_h` | none in NASA POWER (radiation only, no duration); ERA5 or E-OBS sunshine duration, or national met services | `t631_water.py:harvest_sunshine_hours` | T631 |
| destinations | swimming bans | `water.bans` | EEA bathing water prohibition flags, regional authority notices (T631 owns the field on beach and lake pages) | `t632_practical.py:harvest_swimming_bans` | T632 |
| destinations | thing to do: entry price | `do[].fee / do[].fee_eur` | OSM fee and charge tags (not in the POI shards today), Wikidata admission P2555 | `t632_practical.py:harvest_do_fee` | T632 |
| destinations | thing to do: visit duration | `do[].duration_min` | Wikivoyage listings, operator pages (not in the POI shards today) | `t632_practical.py:harvest_do_duration` | T632 |
| destinations | train services between the towns | `practical.transit.train` | open GTFS feeds (national rail operators, Transitland) | `t632_practical.py:harvest_local_transit_train` | T632 |
| destinations | water_temperature_destination | `climate.water_c` | none known: nearest coast or lake sea surface temperature climatology per destination | `t631_water.py:harvest_destination_water_temperature` | T631 |
| lakes | ferry_line_names | `ferry.lines` | OSM route=ferry relations touching the lake, or national operator timetables (GTFS) | `t631_water.py:harvest_lake_ferry_lines` | T631 |
| lakes | lake_currents | `currents` | none known: the `currents` hazard code exists on 38 lakes, no description or location | `t631_water.py:harvest_lake_currents` | T631 |
| lakes | lake_lifeguards | `lifeguards` | OSM lifeguard=* and supervised=* on swimming areas on the lake; no lake level source | `t631_water.py:harvest_lake_lifeguards` | T631 |
| lakes | lake_swimming_bans | `swim.ban` | municipal or national bathing ordinances; only the swim.rule verdict exists today | `t631_water.py:harvest_lake_swim_bans` | T631 |
| lakes | thermal_winds | `wind.profile` | none known (open data): per-lake wind profile for watersports, e.g. ERA5 hourly wind by month at the lake, or windsurf spot guides | `t631_water.py:harvest_lake_wind_profile` | T631 |
| lakes | watersport_zones | `sportZones` | OSM sport=windsurfing/sailing/water_ski polygons with geometry (the context sweep keeps counts only) | `t631_water.py:harvest_lake_sport_zones` | T631 |
| mountains | cable car and mountain railway opening hours | `lift.hours` | OSM opening_hours on the aerialway, where tagged | `t630_routes.py:harvest_lift_hours` | T630 |
| mountains | cable car and mountain railway price | `lift.price` | none known (operator websites, no open feed) | `t630_routes.py:harvest_lift_prices` | T630 |
| trails | gorge_wet_rock_flag | `gorge` | OSM natural=gorge or name words on the route; no flag in the trails wire today (T630 owns the trail schema) | `t631_water.py:harvest_route_gorge_flag` | T631 |
| trails | reachable by public transport or ferry | `transit {rail, bus, ferry}` | OSM ferry terminals and public_transport bus stops near the trailhead; pipeline/trails/transit_stops.py holds rail and bus stations only | `t630_routes.py:harvest_trail_ferry_and_bus_stops` | T630 |
