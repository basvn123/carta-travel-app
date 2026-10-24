# Field stubs

Fields the Explore sheets show as "Not available yet" because no source is wired.
Written by pipeline/field_stubs/report.py.

| Layer | Field | Wire key | Source to wire | Stub | Task |
|---|---|---|---|---|---|
| beaches | beach_audience_luxury | `audience.luxury` | no exact open source: needs hotel star and lido tier near the beach; never derived from the word luxury or the town. Best candidate: OSM tourism=hotel stars within 300 m, not claimed as the audience | `t631_water.py:harvest_beach_audience_luxury` | T631 |
| beaches | lido_price | `lido.price` | no open source: entry, sunbed and umbrella prices and reservation are per lido and appear only on operator sites. Best candidate: OSM `charge` and `fee` on leisure=beach_resort (rarely tagged); price rule: not shown in this batch | `t631_water.py:harvest_lido_prices` | T631 |
| beaches | surface_at_water_entry | `entrySurface` | no open source: OSM surface describes the sand, not the sea bed at the entry. Best candidate: OSM natural=beach + `surface` on the water edge way, or photo classification | `t631_water.py:harvest_beach_entry_surface` | T631 |
| destinations | bus services between the towns | `practical.transit.bus` | code reads bus route types from any GTFS feed in pipeline/transit/feeds.json, but no regional bus feed with a verified commercial licence is registered. Best candidates: Mobility Database feeds with CC BY terms (Trentino Trasporti, TPL FVG, Regione Sardegna), licence to verify per feed | `t632_practical.py:harvest_local_transit_bus` | T632 |
| destinations | local rules (traffic zones, alcohol, dress, drone, fire) | `practical.local_rules` | no structured open source; Wikivoyage Respect sections are free text (CC BY-SA, would need extraction we do not trust). Best candidate: national tourism board pages, not open data | `t632_practical.py:harvest_local_rules` | T632 |
| destinations | offline map in the destination PDF | `pdf.offline_map` | not a data source: needs rendered map tiles or an OsmAnd/Organic Maps link per destination; T632-g offline map is outside this batch (data part only) | `t632_practical.py:build_pdf_offline_map` | T632 |
| destinations | thing to do: visit duration | `do[].duration_min` | no structured open source: OSM has no visit duration and Wikivoyage listings carry none (the place layer visit_h is used where present). Best candidate: operator pages, not open | `t632_practical.py:harvest_do_duration` | T632 |
| lakes | lake_currents | `currents` | no open source: the `currents` hazard code exists on 38 lakes, no description or location. Best candidate: national lifeguard or boating authority notices, not structured | `t631_water.py:harvest_lake_currents` | T631 |
| lakes | thermal_winds | `wind.thermal` | no open source names a lake's thermal winds (Ora, Breva, Vento). Best candidate: windsurf and sailing spot guides, which are not open data. The monthly mean wind is wired as wind.profile. | `t631_water.py:harvest_lake_thermal_winds` | T631 |
| mountains | cable car and mountain railway price | `lift.price` | no open price feed. OSM `charge` on lifts is harvested into lift.fare (a price record for plan phase F9, with value, unit, currency, source, date, quality) but no price is shown in this batch, so the slot stays. Best candidate: operator tariff pages | `t630_routes.py:harvest_lift_prices` | T630 |
