# Carta MCP server (ROADMAP F7, T1155)

Four read-only tools over the shipped wire data, for any MCP client.
Owner decisions (2026-11-12): public data only, no saved traveller trips
(T1155-a); it ships from a repo checkout with `continent-app` installed, with
no package and no remote HTTP mode (T1155-b).
Handbook: `docs/HANDBOOK.md`, "Carta MCP server". Threat model: section 13.

| Tool | Does |
|---|---|
| `search_places` | text, country, category, tier filters; best rated first; at most 25 |
| `place_facts` | one place: ratings, day price, bed prices, best months, crowding, activities |
| `price_trip` | a trip of up to 10 stops priced with the app's trip price (`lib/price/trip.js` `quoteTrip`): beds and days at each stop, the legs between stops, and with `flights` the way there and home (see below) |
| `list_trips` | the ready-made library trips with days, best months and budget range |

Run (stdio): `cd services/mcp && npm ci && node src/stdio.js`. It needs the app installed too
(`cd continent-app && npm ci`), because the price engine is imported from there.
Data comes from `continent-app/public`; set `CARTA_DATA_DIR` to point elsewhere.

Client config: `{"mcpServers":{"carta":{"command":"node","args":["/path/to/services/mcp/src/stdio.js"]}}}`

## price_trip (T1215)

One price source: the tool builds the planner's state and calls `quoteTrip`, so
every figure is the trip planner's figure for the same question (`parts` are
quoteTrip's parts, unchanged). Input:

- `stops` (ids and nights), `adults`, `children`, `stay`: the party and the bed.
- `start` (YYYY-MM-DD): prices each stop at its own dates; without it, the year average.
- `legs_by`: `auto` (the engine's pick), `public` or `car` (a hire car: adds `parts.car`).
  `leg_modes`: a mode per hop (`train`, `bus`, `car`, `ferry`, `fly`), overriding `legs_by`.
- `flights`: `out_eur` and `back_eur` are fares the caller already has (whole party, each
  way, added as given); `from` is a home airport (IATA) whose swept fare prices a direction
  with no fare. The sweep's file is read from `<data dir>/flights/<IATA>.json`; the shipped
  `public/` has none, so copy the sweep's files there or point `CARTA_DATA_DIR` at them.
  A direction nothing could price is listed in `unpriced_flights`.

Without `flights` the way there and home (flights, transfers) is left out of `total_eur`
and `excludes` says so. Activities and tickets are never included.

Test: `npm test` (fixtures in `tests/fixtures`). `tests/price_trip.test.mjs` holds the
parity test against `quoteTrip` and the eval of expected figures
(`tests/eval/price_trip.eval.json`, six trips, tolerance 0.01).
