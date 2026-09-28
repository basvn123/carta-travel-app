# T054 Split the wire by access pattern and move shards to R2

## Task ID

T054

## Date

2026-09-28

## What changed

The app can now be built in two shapes from the same code, and one environment variable picks which.

Without `VITE_DATA_BASE` (the default, and what production builds today), every data file stays in `dist/` and is fetched same-origin, as before. With `VITE_DATA_BASE=https://data.carta-europetravel.com/data`, the build leaves the app host holding the app shell and a small boot index, and every shard is fetched from the R2 data host instead. In that shape the Pages deploy is 61 files and 6.3 MiB, against 52,132 files and 1,109.7 MiB before, and `npm run check:pages` passes for the first time.

Nothing is uploaded and nothing in production changed. There are still no Cloudflare or R2 credentials on this machine, the bucket does not exist (T044-a), and data.carta-europetravel.com does not resolve. So the R2 half is written as scripts that were exercised as far as they can go without an account: plan output, argument checks against the installed wrangler, and a full end-to-end run against a local two-origin stand-in. The live steps are an owner procedure (steps 30 to 34 in `Execution/P3/_OPEN-hetzner.md`).

The task's done condition is met in the build and not yet in production. The Pages deploy is a few dozen artifacts (61), and the boot payload is measured under 2 MB (217 KB, 82 KB gzipped). Every shard serving from R2 is proven against the stand-in only; against the real host it waits on the owner steps.

## How it works

### The four tiers

The boot index is `/boot.json`, on the app host. It holds the dataset `meta` (50 KB: defaults, origins, model descriptions) and one row per destination: id, latitude, longitude, country code, a flags bitfield (airport, hidden gem, UNESCO) and the rating band (`rating.tier`, 0 to 3). Rows are arrays, not objects, because at 25,000 destinations a repeated key name costs about 100 KB. The row costs 44 bytes per destination, so the file is 217 KB today and extrapolates to about 1.15 MB at 25,000. That is inside the architecture document's 1 to 2 MB.

The detail shards are everything else, on the data host. Each destination's record, minus the four fields its boot row carries, sits in one file per country: `/dest/<cc>.json`, 43 files, the largest (Italy) 1.9 MB. POI lists, dossiers, destinfo, region pages, the seven layer directories and the three root files that grow with the catalogue (`coverage.json`, `poi_credits.json`, `search_index.json`) move unchanged. The per-origin fare slices and reach files move too; they were already lazy. Pin tiles are P15's.

What stays on the app host is the shell, the fonts, the boot index and three fixed-size reference files (`country_insights.json`, `country_shapes.json`, `joins.json`) that do not grow with the catalogue.

### One list decides what moves

`src/lib/dataHost.js` holds `R2_TIER`, the top-level entries of `public/` that live on the data host, and `dataUrl(path)`, which every shard fetch now goes through. When `VITE_DATA_BASE` is unset, or the path is not in the list, `dataUrl` returns the path unchanged. Otherwise it returns the same path on the data host. The same list is imported by the build step that moves the files, the upload script and the verifier, so the app and the deploy can never disagree about where a file lives. A typo in the variable is rejected rather than half-applied: only https, or loopback http for the stand-in, with no query string.

Most layer loaders did not need touching, because they all fetch through `publishedJson.js`, which now applies `dataUrl` once. The direct fetches were changed one by one: `appData.js` (boot, country files, POI shards, fares), `reach.js`, `dossier.js`, `destInfo.js`, `journeys.js`, `imageCredit.js`, `searchIndex.js` and the admin `ContentSection.jsx`.

### The split and the merge

`src/lib/bootIndex.js` holds `splitCatalogue` and `mergeCatalogue`, pure functions used by both `scripts/sync-data.mjs` (at build time) and `appData.js` (in the browser), so the two halves cannot drift. A field is moved into the boot row only when it has its canonical shape (a finite number, a two-letter code, an id equal to its key). Anything irregular stays in the record, so the merge is exact either way. The merge keeps the master's destination order, because several screens break ties on iteration order.

`sync-data.mjs` proves the split on every build. It merges the files it has just written, the way the browser will, and compares each record with the core. If a single record differs, the build fails. `tests/wireSplit.test.mjs` pins the rules with fixtures and checks the real published split against `public/app_data.json`.

Each country file is named in the boot index with a 12-character content hash. The app requests it as `/dest/<cc>.json?v=<hash>`, so a cached old country file can never be paired with a new index. In the browser, `appDataPromise` fetches the boot index (preloaded from `index.html`), then all 43 country files in parallel (each retried once), and resolves to the same `{ meta, destinations }` that `app_data.json` used to deliver. No consumer changed. When the data host is set, a preconnect to it is injected at module load, so the TLS handshake overlaps the boot index download.

`public/app_data.json` is still written, because the contract check, the fixtures and about a dozen harnesses read it. The app no longer requests it, and the split build deletes it from `dist/`.

### The build step

`scripts/r2/stage-data.mjs` runs as `postbuild`. It reads `VITE_DATA_BASE` from the environment, or from the same `.env` files Vite reads for production. When the variable is unset, it does nothing. When it is set, it moves every `R2_TIER` entry from `dist/` to `dist-data/`, which is the upload tree, and deletes `dist/app_data.json`. It then writes `dist-data/_stage.json` with counts and bytes.

It refuses in two cases, both so that a half-wired build can never ship. The first is a bundle that does not contain the data base: Vite built with a different mode or a missing `.env`, so the app would ask Pages for files that were just removed. The second is a data host missing from connect-src in `vercel.json` or `public/_headers`, because the browser would then block every shard. Register row T053-b keeps that host out of the CSP until the domain resolves, and this refusal is what makes that order machine-checked. `CARTA_SKIP_CSP_CHECK=1` bypasses it for the stand-in and for the upload build, and the warning it prints says "Not deployable".

### Upload, caching and CORS

`scripts/r2/push-data.mjs` uploads `dist-data/` to `r2:carta/data/` with rclone, using T045's `RCLONE_CONFIG_R2_*` variables. It uses rclone rather than wrangler for T045's reason: wrangler uploads one object per call, and this tree is about 52,000 files. By default it prints the plan. `--rclone-dry-run` asks rclone what it would do, `--live` uploads, and `--cors` sets the bucket's CORS rule from `scripts/r2/data-cors.json`.

The upload has two phases, because two hosts cannot switch in the same instant. Phase 1 is `rclone copy`: it adds and replaces objects and deletes nothing, so the live site, still on its old boot index, finds every file it names. Then Pages deploys. Phase 2 (`--prune`, `rclone sync`) removes stale objects only after that.

R2 has no `_headers` file. Each object carries the Cache-Control it was uploaded with, and `scripts/r2/cachePolicy.mjs` reads that policy from `public/_headers` rather than keeping a second table. A shard therefore gets the same caching on either host. An `R2_TIER` entry with no stanza is an error, not a default. Two stanzas were added for this: `/boot.json`, which replaces `/app_data.json`, and `/dest/*`. `vercel.json` got the same two changes.

CORS is needed because the app now reads the data host cross-origin. The rule allows GET and HEAD from the www and apex production origins, `carta-app.pages.dev` and the two local Vite ports. Content-Type matters as much as CORS: the layer loaders treat a non-JSON response as "not published". rclone sets `application/json` from the extension, and the verifier checks it.

### The service worker

`public/sw.js` gives `/boot.json` the stale-while-revalidate that `app_data.json` had. The country files get a variant that keeps one cached copy per country, dropping the old `?v=` entry when a new one lands, so a weekly refresh does not pile 12 MB a week into Cache Storage. The worker also now handles `https://data.carta-europetravel.com`, stripping its `/data` prefix before the path rules, so offline repeat opens keep working after the cut-over. That origin is written into the file, because `sw.js` is served as is and cannot read the build variable. `CACHE_VERSION` went to `carta-v7`, which evicts the 13 MB `app_data.json` cached under v6.

### Proof

`scripts/r2/verify-data.mjs` checks the served tree against the staged one. For each file it checks status 200, a JSON Content-Type, the expected Cache-Control, an Access-Control-Allow-Origin for the app's origin, and a byte-identical body (sha256). It also checks that a missing key answers 404 without JSON. It samples by default; `--all` checks every file.

`scripts/verify_data_host.mjs` serves `dist/` and `dist-data/` from two loopback origins that behave like Pages and R2: no SPA fallback, CORS for the app origin only, and a plain 404. It runs verify-data against them and checks the Pages limits. It then loads seven routes in Chromium (Destinations, Explore, Trip planner, Day planner, a trail link, a destination page, a region page). For each route it asserts that the app renders, never asks the app host for a shard, gets all 43 country files from the data host, and hits no data-host CORS error. It passes.

## Files touched

App repo (`continent-app/`), branch `p3-wire-shards-to-r2`, commit `ee23f77`.

**Created:**
- continent-app/src/lib/dataHost.js
- continent-app/src/lib/bootIndex.js
- continent-app/scripts/r2/stage-data.mjs
- continent-app/scripts/r2/push-data.mjs
- continent-app/scripts/r2/verify-data.mjs
- continent-app/scripts/r2/cachePolicy.mjs
- continent-app/scripts/r2/data-cors.json
- continent-app/scripts/verify_data_host.mjs
- continent-app/tests/wireSplit.test.mjs

**Modified:**
- continent-app/scripts/sync-data.mjs (writes boot.json and dest/, proves the round trip)
- continent-app/src/lib/appData.js, publishedJson.js, reach.js, dossier.js, destInfo.js, journeys.js, imageCredit.js, searchIndex.js
- continent-app/src/admin/ContentSection.jsx
- continent-app/index.html (preload /boot.json instead of /app_data.json)
- continent-app/public/sw.js, continent-app/public/_headers, continent-app/vercel.json
- continent-app/package.json (postbuild, data:push, data:verify)
- continent-app/.gitignore (public/boot.json, public/dest/, dist-data/)

Root repo, branch `p3-wire-shards-to-r2`:

**Created:**
- Execution/P3/T054-wire-shards-to-r2.md

**Modified:**
- Execution/_OPEN.md (rows T054-a to T054-i)
- Execution/P3/_OPEN-hetzner.md (steps 30 to 34, orders 58 to 62)

**Deleted:**
- None.

The CSP is unchanged. `src/components/PrivacyPolicy.jsx` and `src/data/attribution.js` were already modified by another session when this task started and were left unstaged. The app repo's HEAD was 9699a48, not the 203b334 the prompt named, because the T053 commit had been amended between the prompt and the start of this task. The branch starts from 9699a48.

## Commands run

From `continent-app/` unless noted.

```bash
git checkout -b p3-wire-shards-to-r2            # both repos
npm run build                                   # before: unchanged HEAD
node scripts/check-pages-limits.mjs dist        # 52,132 files, FAIL
ls -l dist/app_data.json; gzip -9c dist/app_data.json | wc -c

node scripts/sync-data.mjs                      # boot.json, dest/, round trip exact
node --test tests/wireSplit.test.mjs            # 8/8
npx eslint <the touched src files>              # clean
npm test                                        # 83/83

npm run build                                   # A: same-origin build
node scripts/ci/smoke.mjs                       # 9/9 routes
node scripts/verify_fares_url.mjs ... (screen harnesses, see below)

VITE_DATA_BASE=http://127.0.0.1:4391/data CARTA_SKIP_CSP_CHECK=1 npm run build   # B: stand-in
node scripts/verify_data_host.mjs               # OK

VITE_DATA_BASE=https://data.carta-europetravel.com/data CARTA_SKIP_CSP_CHECK=1 npm run build   # C: production shape
node scripts/check-pages-limits.mjs dist        # 61 files, PASS
VITE_DATA_BASE=https://data.carta-europetravel.com/data node scripts/r2/stage-data.mjs   # refuses: CSP
VITE_DATA_BASE=http://127.0.0.1:4391/data CARTA_SKIP_CSP_CHECK=1 node scripts/r2/stage-data.mjs   # refuses: bundle
node scripts/r2/push-data.mjs; node scripts/r2/push-data.mjs --prune; node scripts/r2/push-data.mjs --cors
node scripts/r2/push-data.mjs --live            # exits 1, names the four missing RCLONE_CONFIG_R2_* variables
CI=1 npx wrangler r2 bucket cors set carta --file scripts/r2/data-cors.json --force   # arguments accepted, stops at auth
node scripts/r2/verify-data.mjs                 # live host: 58 requests, 58 failures, ENOTFOUND

rm -rf dist-data && npm run build               # leave dist/ as a same-origin build for other sessions
```

## Config and secrets set

None set. There is one new build variable, `VITE_DATA_BASE`, which is unset everywhere. It should be set in the Production environment only at step 33 of the owner procedure. `CARTA_SKIP_CSP_CHECK=1` is for the upload build and the local stand-in, never for a deploy. The live steps need `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (the CORS rule) and T045's five `RCLONE_CONFIG_R2_*` variables (the upload). None of them exist on this machine.

## Before/after measurements

Before is a full `npm run build` on the unchanged HEAD. After is the production-shaped split build (`VITE_DATA_BASE` set to the real host), 3,868 destinations in both.

| Metric | Before | After | Delta |
|---|---|---|---|
| Files in the Pages deploy (`check:pages` count) | 52,132 | 61 | -52,071 |
| Pages deploy size | 1,109.7 MiB | 6.3 MiB | -1,103.4 MiB |
| `npm run check:pages` | FAIL, 2.6x the ceiling | PASS, 19,939 under | passes |
| Boot payload on the app host | app_data.json, 12,516,357 B (2,139,840 B gzip -9) | boot.json, 221,859 B (81,797 B gzip -9) | -98.2% |
| Boot payload extrapolated to 25,000 destinations | about 80 MB | about 1.15 MB | under the 2 MB target |
| Files moved to the data tree | 0 | 52,115 (1,103.3 MiB) in 17 entries | new |
| Country files (detail of the old core) | 1 file inside app_data.json | 43 files, 12,225,831 B (1,869,036 B gzip) | new |
| Largest single country file | n/a | IT, 1,953,471 B | |
| Same-origin build (`VITE_DATA_BASE` unset) | 52,132 files | 52,177 files | +45 (dest/ and boot.json; app_data.json kept for the harnesses) |
| Shards served from R2 in production | 0 | 0 | unmoved, no credentials |

The honest caveat on "boot payload": the app still waits for all 43 country files before its first render, because every screen reads the full destination record. What reaches the browser before first paint went from one 12.5 MB file (2.1 MB gzip) to 217 KB plus 12.2 MB in 43 parallel, individually cacheable files (1.9 MB gzip). That fixes the Pages file ceiling, the 25 MiB per-file limit, and the cost of a weekly refresh (one changed country re-downloads one file). It does not yet make the first paint cheaper, and the detail tier still grows linearly with the catalogue. Rendering from the boot index before the detail arrives is row T054-d, and it pairs with P15's pin tiles.

Harnesses on the same-origin build. These are the screens this task touches, because every screen loads through `appData.js`. `ci/smoke.mjs` 9/9. `verify_fares_url` OK. `verify_layer_errors` 24/24. `verify_journeys` all passed. `verify_regions`: every data check passed, one failure ("every wire pointer REGIONS.md makes resolves", 0 pointers found), which parses `docs/REGIONS.md` and does not touch a fetch. `verify_destination_page` 57 pass, 1 fail (52 px horizontal overflow on phone, a layout check). `verify_trips` 30/31 (a `selectOption` on an element that is no longer a select, the same markup drift T052-g records for `verify_places_tab`). `verify_country_brief` 34/35 (a phone click timeout). `verify_explore` 28/30, identical to T052-g's pre-existing count. `verify_reach_filter` fails on its own premise ("unexpected real reach artifact for CRL"). None of these failures involves a data request. They were not re-run on the pre-task HEAD, so "pre-existing" is shown for `verify_explore` and inferred for the rest from what each assertion reads. Five of these harnesses expect a server already on port 4173 and fail with ERR_CONNECTION_REFUSED when none is running; the figures above are from a second run with `vite preview` held on 4173.

On the stand-in split build, `verify_data_host.mjs` passes. Verify-data made 84 requests covering all 17 entries, every body byte-identical with the right headers. The Pages limits pass at 61 files. All seven routes render with zero shard requests to the app host, all 43 country files from the data host, and no data-host CORS error. Across the run the data host served dest, dossier, fares, journeys, poi, reach, region and trails.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| sync-data would not parse after the first edit | A `'\n'` in the Python edit script became a literal newline inside a JS string | Joined the id lists with a comma instead |
| sync-data showed as 817 lines changed | The edit wrote LF into a file whose index copy is CRLF | Restored CRLF; the diff is the 60 added lines. Every later edit preserved each file's own line endings |
| verify_data_host failed every route on CORS | The affiliate script (emrldtp.com) refuses a loopback origin and logs a CORS error of its own | The CORS check counts only errors naming the data host |
| Five harnesses failed with ERR_CONNECTION_REFUSED | They expect a server on 4173 and do not start one | Re-ran them with `vite preview --port 4173 --strictPort`, after confirming it served this dist byte for byte |

## What is still open

The live half is the owner's, in order, as steps 30 to 34 of `Execution/P3/_OPEN-hetzner.md`. It needs the bucket and the domains first (T044-a to T044-c, with T045-f fixed before them) and the rclone credentials (T045-a). The steps are: set the CORS rule (T054-a); stage, upload phase 1, and run verify-data and `--all` (T054-b); add the data host to connect-src once it resolves, which is still T053-b and is left open because the domain does not resolve; set `VITE_DATA_BASE` in Production, deploy and prune (T054-c); then T024's Pages runbook. The rollback at every step is to unset the variable and redeploy.

The first paint still waits for all 43 country files (T054-d). The fix is to render pins and the map from the boot index and load detail per country as it is needed. That touches most screens and belongs with P15's pin tiles, which will read the same columns (`decodeBootIndex` is there for them).

Nothing uploads automatically yet (T054-e). The weekly run on the build box (T048's `weekly.sh`) should, after the pipeline, build with the data base, run phase 1, deploy the app, then prune. This gives T048-j its answer for data, but the app deploy from the box still needs its own credential and remains T048-j's decision.

`npm run check:pages` is still not in `npm run ci` (T054-f), because `ci` builds without the data base. It belongs there on the day production builds split.

The same-origin build still ships the unread 12.5 MB `dist/app_data.json` (T054-g). `verify_places_tab.mjs` and several other harnesses fetch it from the preview server. Pointing them at `public/app_data.json` on disk would let every build drop it.

Once production reads from R2, the root repo no longer needs its tracked copies of `continent-app/public/trails`, `cycling`, `region`, `trips`, `dossier`, `fares` and the rest, about 48,000 files. That unblocks T025's untrack (T054-h). The files must still be produced locally or on the box for the upload, and `.gitignore` in the app repo already ignores them.

CORS covers production, the Pages root domain and local Vite only. A Vercel or Pages branch preview built with `VITE_DATA_BASE` fails CORS, and the harness failures listed above belong to other tasks (T054-i). Also, the prune phase syncs each entry that still exists; an entry removed from `R2_TIER` entirely would leave its objects in the bucket until deleted by hand.

## Rollback procedure

In production nothing changed, so there is nothing live to roll back. After the cut-over, rollback is to remove `VITE_DATA_BASE` from the host environment and redeploy. The build then keeps every file in `dist/` and fetches it same-origin. The R2 objects can stay, since nothing reads them.

To undo the code:

```bash
cd continent-app
git checkout p3-csp-tighten
git branch -D p3-wire-shards-to-r2        # or: git revert ee23f77 once merged
cd ..
git checkout p3-csp-tighten
git branch -D p3-wire-shards-to-r2        # or revert the report commit
```

After a revert, run `npm run data` once so `public/app_data.json` is fresh again. The generated `public/boot.json` and `public/dest/` are gitignored and harmless, and can be deleted. The service worker version goes back to v6 with the revert, so a browser that loaded v7 evicts its cache again on the next visit, which is correct.
