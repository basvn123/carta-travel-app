# Cycling validation references (T1193, ROADMAP D23)

Owner-supplied files, all optional except `eurovelo.csv` (a seed written from memory: every row `verified=no`, so the layer's checks are soft until the owner confirms it).

| File | Columns | Source (terms to confirm) |
|---|---|---|
| `eurovelo.csv` | `ev,name,total_km,countries (;),verified` | eurovelo.com route pages (ECF) |
| `eurovelo_countries.csv` | `ev,cc,km` official length of the route in one country | eurovelo.com route pages or the national coordinator |
| `national.csv` | `id,name,cc,ref,net,km` a national or regional network route | the national portal, if its terms allow comparison |
| `geom/EV6-AT.geojson` | (Multi)LineString of the official track in one country | official GPX converted to GeoJSON, never committed unless the terms allow |

Nothing here is fetched by the layer; no network at run time.
