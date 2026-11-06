# Carta MCP server (ROADMAP F7, T1155)

Four read-only tools over the shipped wire data, for any MCP client.
Handbook: `docs/HANDBOOK.md`, "Carta MCP server". Threat model: section 13.

| Tool | Does |
|---|---|
| `search_places` | text, country, category, tier filters; best rated first; at most 25 |
| `place_facts` | one place: ratings, day price, bed prices, best months, crowding, activities |
| `price_trip` | stays of up to 10 stops priced with the app engine (`lib/price/priceDay`); flights and legs excluded |
| `list_trips` | the ready-made library trips with days, best months and budget range |

Run (stdio): `cd services/mcp && npm ci && node src/stdio.js`. It needs the app installed too
(`cd continent-app && npm ci`), because the price engine is imported from there.
Data comes from `continent-app/public`; set `CARTA_DATA_DIR` to point elsewhere.

Client config: `{"mcpServers":{"carta":{"command":"node","args":["/path/to/services/mcp/src/stdio.js"]}}}`

Test: `npm test` (fixtures in `tests/fixtures`).
