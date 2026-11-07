# T1079: Web and API hardening (ROADMAP C5)

## Date

2026-11-05

## What changed

Response headers, the four Pages Functions and the six browser-facing Edge Functions were reviewed against the code and tightened with the smallest safe changes. Headers: `wss://*.supabase.co` left connect-src (nothing opens a socket), the Permissions-Policy now denies every unused powerful feature, `Cross-Origin-Opener-Policy: same-origin-allow-popups` was added, and a header test pins the lot. Pages Functions: one shared guard (`functions/_lib/guard.js`) gives strict query validators, a 405 fallback, one error body and a per-address limit that uses a `RATE_LIMIT` binding when the account has one. Edge Functions: a CORS allow-list replaces `*`, request bodies are read with a byte cap, the notify secret is compared in constant time, and no Stripe or database message reaches a response. The Stripe webhook already verified its signature on the raw body and granted on the session or invoice id; that is now pinned by a test, and its failure bodies are generic. Threat-model gaps rows 7, 9 and 12 are marked with this task.

## Files touched

- `continent-app/public/_headers`
- `continent-app/functions/_lib/guard.js` (new)
- `continent-app/functions/api/flights.js`, `forecast.js`, `ask.js`, `ask/answer.js`
- `supabase/functions/_shared/http.mjs` (new)
- `supabase/functions/billing`, `checkout`, `notify`, `parse-booking`, `plan-day`, `suggest-city`, `stripe-webhook` (`index.ts`)
- `continent-app/tests/securityHeaders.test.mjs`, `functionGuards.test.mjs`, `edgeHttp.test.mjs` (new)
- `docs/HANDBOOK.md` (Deploy section, flights live line), `docs/security/threat-model.md`
- `Execution/P15/_OPEN-web-hardening.md` (new), this report

Not touched: `upload-scan` (its secret compare already was constant time and it takes no browser traffic), the migrations, `_routes.json` (`/api/*` was already routed), `wrangler.toml`.

## Commands run

- `node --test` on the three new test files and `askGenerate`, `askRetrieve`
- `npx eslint functions tests/...` (0 errors)
- `npm test` in `continent-app/`
- `FAST_OUT=../.fastbuild CARTA_APP=<worktree>/continent-app node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs`

## Config and secrets set

None. New optional names, set by the owner: Pages binding `RATE_LIMIT`, Supabase secret `ALLOWED_ORIGINS` (`_OPEN-web-hardening.md`).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Security headers on `/*` | 6 | 7 (COOP added) | +1 |
| Permissions-Policy features denied | 5 | 13 | +8 |
| connect-src entries | 11 | 10 (wss host removed) | -1 |
| CSP longest line (limit 2,000) | 1,025 | 1,005 | -20 |
| Wildcard CSP hosts | 3 | 3, now pinned by a test | 0 |
| Pages Functions with strict validation and 405 fallback | 0 of 4 | 4 of 4 | +4 |
| Pages Functions with a per-address limit | 1 of 4 (answer) | 4 of 4 | +3 |
| Edge Functions answering `*` CORS | 6 of 6 | 0 of 6 | -6 |
| Edge Functions with a body byte cap | 0 of 6 | 6 of 6 (webhook: 1 MB) | +6 |
| Responses that echoed a Stripe or database message | 5 sites in 3 functions plus 4 in the webhook | 0 | removed |
| `npm test` | 1,266 pass | 1,281 pass, 12 skipped, 0 fail (1,293 tests) | +27 tests |

Hosts in the CSP, checked one by one against the code before keeping: cartocdn (basemaps in 5 map files), tile.openstreetmap.org (`mapTile.js`), tiles.mapterhorn.com (`terrainSource.js`), flagcdn.com (`tripGuide.js`), foto-webcam.eu (`WebcamEmbed.jsx`), routing.openstreetmap.de (`routing.js`), nominatim (`geocode.js`, `cityResearch.js`), both Overpass hosts and `*.wikipedia.org` (`cityResearch.js`), `*.supabase.co` (`supabase` client). The Wikimedia and Geograph image hosts are used by shipped data and stay (row T052-f). The one host with no caller was the websocket one.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A scripted edit left `if (error) console.error(...)` followed by an unconditional `return` in the webhook | The replacement split a one-line `if` | Caught on reading the diff; braces added before commit |
| COOP `same-origin` would sever `window.open` in the print view (`tripExport.js`) | It needs the opener | Used `same-origin-allow-popups`; the owner check in step 1.3 of the procedure covers it |

## Screens checked

None (no dev server per brief). The end check must look at, at phone and desktop width: Explore map (basemap tiles, flags), a place page with a map and elevation toggle (Mapterhorn), a trip page print view (popup opens), sign-in and the Plan day suggestion (Edge CORS), the Ask Carta field (`/api/ask` and `/api/ask/answer`; the ask index is not built in this worktree so the end-to-end route tests were skipped here), a flight date search on the trip page (`/api/flights`), a peak page forecast (`/api/forecast`). The console must show no `securitypolicyviolation`, and the network panel no failed `functions/v1/*` preflight.

## What is still open

Register rows to add:

| ID | Raised by | Item | Owner | Status | Order |
|---|---|---|---|---|---|
| T1079-a | T1079 | Add the `RATE_LIMIT` binding or a WAF rate rule on `/api/*` so the limit holds across the edge (`_OPEN-web-hardening.md` step 3) | user | open | 3 |
| T1079-b | T1079 | Deploy the headers, the Pages Functions and the six Edge Functions and run the smoke tests (`_OPEN-web-hardening.md` steps 1 and 2); confirm the print popup under COOP | user | open | 1 |
| T1079-c | T1079 | Remove `style-src 'unsafe-inline'`: needs hashes or a nonce for React style attributes and MapLibre, a design-sized job | next task |  open |  |
| T1079-d | T1079 | Edge Functions have no per-address limit, only the per-user `ai_consume` caps; a durable limiter belongs with H3 | next task | open |  |
| T1079-e | T1079 | Run `scripts/verify_csp.mjs` in CI (it needs Playwright and a build); the header test covers the text only | next task | open |  |
| T1079-f | T1079 | Send a wrongly signed body to a preview `stripe-webhook` and expect 400, in the C10 pass (the static order test cannot run Deno) | next task | open |  |
| T1079-g | T1079 | `/api/ask` was not exercised end to end here (ask index not built); run `askRetrieve` with the index present | next task | open |  |

## Rollback procedure

`git revert` the four `T1079:` commits on `p15-c-web` (headers, Pages Functions, Edge Functions, docs). Edge Functions and Pages need a redeploy after a revert to take effect; nothing here changes data or schema.
