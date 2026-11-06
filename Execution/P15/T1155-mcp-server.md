# T1155: Carta MCP server (ROADMAP F7)

## Date

2026-11-06 (round 2, session S71, batch 4).

## What changed

`services/mcp/` is a new read-only MCP server (stdio) with four tools: `search_places`, `place_facts`, `price_trip` and `list_trips`. It reads the shipped wire data from `continent-app/public`, prices with the app's own `priceDay`, runs every free-text field through the aiGuard scrubber, and has no write tool, no secret, no network call and no Claude API. 11 tests pass: every tool on fixtures, a parity test against the engine, and a smoke test where the official MCP client lists and calls the tools in memory and over a real stdio subprocess. The threat model has a new section 13 and CI has `mcp.yml`. Before: no MCP surface. After: 4 tools, 11 tests, 0 npm audit findings.

## Research

Subagent comparison on 2026-11-06 (npm and PyPI registries; advisories other than `npm audit` not checked).

| Option | Version | Verdict |
|---|---|---|
| `@modelcontextprotocol/sdk` 1.x | 1.32.2 (2026-10-23), MIT, MCP org | Chosen: stdio, `readOnlyHint` annotations, `InMemoryTransport` and a `Client` for the smoke test, zod schemas |
| MCP SDK v2 (`@modelcontextprotocol/server`) | 2.4.0 | Stable, but 1.x is what most clients document; a later move is cheap (small server) |
| `fastmcp` | 4.24.3 | Wraps the 1.x SDK, one maintainer, very fast release churn |
| Python `mcp` | 2.3.0 | Adds a second runtime next to the app's Node |
| Hand-rolled JSON-RPC | n/a | Would own protocol revisions |

Pinned exactly with a committed lockfile; `npm audit` reports 0 vulnerabilities. Links: https://www.npmjs.com/package/@modelcontextprotocol/sdk, https://github.com/modelcontextprotocol/typescript-sdk, https://modelcontextprotocol.io/specification. Other choices: stdio only (no HTTP surface); reuse of the app engine instead of a second price model (invariant V1: one price source); "list trips" means the public library trips, because saved trips are user data behind auth.

## Files touched

Created: `services/mcp/` (`package.json`, `package-lock.json`, `README.md`, `src/{data,text,tools,server,stdio}.js`, `tests/{tools,smoke}.test.mjs`, `tests/fixtures/` with 7 places and 4 trips), `.github/workflows/mcp.yml`, this report.
Modified: `docs/security/threat-model.md` (section 13), `docs/HANDBOOK.md` (section "Carta MCP server"), `ROADMAP.md` (F7 status), `Execution/_OPEN.md` (appended rows).

## Commands run

```
cd continent-app && npm ci --ignore-scripts
cd services/mcp && npm install --save-exact @modelcontextprotocol/sdk@1.32.2 zod@^4 && npm audit && npm test
```

## Config and secrets set

None. The only environment variable is the optional `CARTA_DATA_DIR`.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| MCP tools | 0 | 4 | +4 |
| Tests for the server | 0 | 11 passing | +11 |
| npm audit (services/mcp) | n/a | 0 vulnerabilities | none |
| Real data, first call (loads 14 MB `app_data.json`) | n/a | 239 ms | n/a |
| Real data, later calls | n/a | 20 to 30 ms | n/a |

Measured on the real checkout data (Lisbon search, facts, a 4-night price of EUR 1,131.92 for two, 8 Portuguese library trips). Not a calibration of any price.

## What broke and how it was fixed

No issues. Gotcha: the engine imports modules that need `react`, so the server needs `continent-app` installed (`npm ci` there) and CI does that.

## Screens checked

None; no screen changed.

## What is still open

See the register rows T1155-a to T1155-e.

## Owner steps (for the checklist)

- [T1155-d] Try the MCP server in a real client | the tests use the library client; a real client proves the setup text works | in `continent-app` run `npm ci`; in `services/mcp` run `npm ci`; add the `mcpServers` entry from the README to your client and ask it to price a trip | services/mcp/README.md

## Rollback procedure

`git revert` of the `T1155:` commits. Nothing is deployed and no data changed.
