# T233 Mirror the Mapterhorn terrain tiles to your own R2

## Task ID

T233 (mind-map T206 and T135, one task).

## Date

2026-10-06

## What changed

The app now has one place that decides where 3D terrain tiles come from, `src/lib/terrainSource.js`, and one config value that flips it. With `VITE_TERRAIN_PMTILES_URL` unset it returns Mapterhorn's public XYZ tiles (`https://tiles.mapterhorn.com/{z}/{x}/{y}.webp`, terrarium, 512 px, maxzoom 13). With it set to an https `.pmtiles` URL it returns a `pmtiles://` source on that URL. The Mapterhorn credit is attached in both modes. Bad values (plain http, a query string, a non-pmtiles path) are ignored and fall back to Mapterhorn, the same rule `dataHost.js` uses.

Two facts changed the shape of the task. First, the app does not read Mapterhorn anywhere today. There is no `raster-dem` source, no `setTerrain` and no `pmtiles` code in `src`; `PointMap.jsx` says the 3D toggle belongs to the terrain work and is not drawn. So there was no existing read to repoint, and the module is written for the terrain task to call. Second, the mirror is not live after this task: the upload is an owner step (no R2 writes in a wave session), so "terrain serves from your own bucket" is not true yet. What is true is that the app can switch with one value once the owner has uploaded.

The size estimate in the spec is wrong for the full file. A HEAD request on `https://download.mapterhorn.com/planet.pmtiles` returns content-length 355,579,263,191 bytes (331 GiB, 355.6 GB) and accept-ranges bytes. At the spec's $0.015 per GB-month that is about $5.33 a month for the whole planet. The "about 100 GB, $1.50" figure can only hold for a Europe cut, whose size cannot be known without running the extract (see the owner steps). Nothing was downloaded.

## Files touched

Created, app repo (branch p13-terrain-mirror): `src/lib/terrainSource.js`, `tests/terrainSource.test.mjs`.

Created, root repo (branch p13-terrain-mirror): this report.

Modified, root repo: `Execution/_OPEN.md` (rows T233-a to T233-e).

## Commands run

```
node --test tests/terrainSource.test.mjs        # 3 pass
npm run lint                                    # 0 errors, 72 warnings, all pre-existing
npm test                                        # 204 pass, 0 fail
npm run build                                   # then dist/ and dist-data/ deleted
curl -sI https://download.mapterhorn.com/planet.pmtiles   # size, ranges
curl -s https://tiles.mapterhorn.com/tilejson.json        # attribution, encoding
```

A throwaway Playwright script (kept out of the repo) served a bare page on port 5207 with maplibre-gl from node_modules, added the source built by `terrainSourceSpec({})`, called `setTerrain` with exaggeration 1.3 at pitch 70 over the Bernese Alps, and counted terrain tile events. Screenshots are in `C:\Users\Gebruiker\Documents\Portfolio\wt\T233-shots\` (terrain-380.png, terrain-1280.png). Both widths loaded terrain tiles with no map errors (7 and 14 tile events). The page is not the Carta app, because the app has no terrain view yet; it proves the default source spec works in the installed maplibre-gl 4.7.1.

## Config and secrets set

None. The new optional build variable is `VITE_TERRAIN_PMTILES_URL`. Suggested value once the mirror exists: `https://data.carta-europetravel.com/tiles/terrain-europe.pmtiles`. The bucket `carta` is served at its root by both custom domains (T044), so the `tiles/` prefix is reachable on the data host without a new domain.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Terrain tile host in the app | none wired | configurable, default Mapterhorn | one config value to switch |
| Planet archive size (HEAD, 2026-10-06) | unknown | 355,579,263,191 bytes | the spec's 100 GB applies to a Europe cut only |
| Full planet at $0.015 per GB-month | spec said $1.50 | about $5.33 | owner chooses planet or Europe |
| Europe cut size | unknown | not measured | needs `pmtiles extract --dry-run` |
| App tests | 201 | 204 | +3 |

## What broke and how it was fixed

No issues in the code. Three blockers were found that this task cannot fix because the files are off limits to it. The CSP in `public/_headers` allows `tiles.mapterhorn.com` in neither connect-src nor img-src, so terrain from Mapterhorn would be blocked in production. The R2 CORS rule in `scripts/r2/data-cors.json` has no allowed headers, and a PMTiles read sends a `Range` header, which forces a preflight the rule would fail. Serving the mirror from the data host needs no CSP change, because `https://data.carta-europetravel.com` is already in connect-src.

## What is still open

Mirror mode cannot load in a browser yet: the app has no `pmtiles` package and waves may not add dependencies, so the terrain task must add it and register `pmtiles://` with `maplibregl.addProtocol`. Mirror mode was tested only as a built URL (unit test); default mode was loaded in a browser. The same archive could also serve a hillshade layer, but the host and credit for hillshade is row T177-c, the owner's choice, and is not decided here.

Owner steps, in order (rows T233-a to T233-e).

1. Install go-pmtiles and read the Europe size before committing: `pmtiles extract https://download.mapterhorn.com/planet.pmtiles terrain-europe.pmtiles --bbox=-25,34,45,72 --dry-run`. The bbox is west,south,east,north and covers mainland Europe, the Atlantic islands and Iceland; adjust as wanted. A dry run reads only the directory by range requests.
2. Run it without `--dry-run` on a machine with disk for the result. It downloads only the tiles inside the bbox.
3. Upload to the existing bucket. The file is over 5 GB, so use rclone multipart, not `wrangler r2 object put`: `rclone copyto terrain-europe.pmtiles r2:carta/tiles/terrain-europe.pmtiles --s3-upload-cutoff 200M --s3-chunk-size 100M --header-upload "Cache-Control: public, max-age=31536000, immutable" --header-upload "Content-Type: application/vnd.pmtiles"`. Use the rclone remote T288 used.
4. Allow Range on the data host. In `continent-app/scripts/r2/data-cors.json` add `"headers": ["Range", "If-Match"]` inside the rule's `allowed` object and `"exposeHeaders": ["Content-Range", "ETag", "Content-Length"]` beside `allowed`, then apply it the way T296 did. The file is off limits to wave sessions, so this edit is the owner's.
5. Verify a byte range from outside: `curl -s -D - -o /dev/null -H "Range: bytes=0-16383" -H "Origin: https://www.carta-europetravel.com" https://data.carta-europetravel.com/tiles/terrain-europe.pmtiles`. Expect 206, a `content-range: bytes 0-16383/<size>` header, `access-control-allow-origin` and `accept-ranges: bytes`. Also send an OPTIONS preflight with `Access-Control-Request-Headers: range` and expect the header to be allowed.
6. Set `VITE_TERRAIN_PMTILES_URL` to the URL above in the production build, after the terrain task has added the pmtiles protocol.
7. If the terrain task ships on Mapterhorn's host before the mirror exists, add `https://tiles.mapterhorn.com` to connect-src and img-src in `public/_headers`. Skip this if the mirror lands first.

Before launch, confirm Mapterhorn's terms allow hosting a mirrored extract (mapterhorn.com/attribution), and add its credit to `docs/tos/data_licenses.md` and `src/data/attribution.js`. Neither file was in this task's scope.

## Rollback procedure

In the app repo, revert the single T233 commit (removes the module and its test; nothing imports them). In the root repo, revert the report commit. No data, bucket or production state was changed. If the owner has uploaded the mirror, delete it with `rclone deletefile r2:carta/tiles/terrain-europe.pmtiles` and leave the variable unset.
