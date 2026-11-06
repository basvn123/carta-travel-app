# T1105: First paint prefers the self-hosted image copies

Roadmap item: H12 (Fast first load and self-hosted images), images half. Session S21 of `_NEXT-50-SESSIONS.md`. Branch `p15-s21-first-load`.

## Date

2026-11-06

## What changed

The photographs on Explore (rail cards, tiles, list rows, map panel) and on a destination page (gallery mosaic, similar places) now prefer Carta's own ladder_v1 copies (AVIF 320/640/1280, WebP 320/640) over Wikimedia, as `<picture>` with a correct `srcset`, and drop back to the Wikimedia URL for any photograph without a copy or whose copy fails to load. The app works out each copy's address in the browser from the Wikimedia URL already on the wire (the same title folding and SHA-1 as `derive.py`), and the rung sizes from the wire's own `w` and `h` (the same `rung_dims`). Whether a copy really exists comes from a small manifest, `continent-app/src/lib/heroLadder.json`, written by the new `pipeline/photos/hero_ladder.py` from derive.py's R2 manifests. It ships **not live** because no derive run of these layers has reached R2 yet, so production keeps loading Wikimedia until the owner's run (T1105-a). Two first-load fixes also ship now: the phone's Explore rail cards asked for 133vw (a 3x phone fetched a 1280 for a 166 px card) and now ask for 64vw, and the first two cards of the first two rails load eagerly, but only while Explore is the visible tab. On the measured stand-in, Explore's image bytes went from 3,034 KB to 1,942 KB with the shipped build and to 1,164 KB with the ladder live, and LCP from 13.2 s to 10.8 s and 9.6 s (same-condition runs). The destination page's image bytes fell from 3,431 to 1,451 KB, but its LCP did not improve (T1105-c).

## Files touched

- `continent-app/src/lib/heroImage.js`: `commonsTitle`, `sha1Hex`, `ladderDims`, `readLadderManifest`, `heroLadder`, `heroLadderLive` (new); the Wikimedia helpers are unchanged.
- `continent-app/src/lib/heroLadder.json` (new, generated): the first-paint manifest, `live: false`.
- `continent-app/src/components/HeroImage.jsx`: new `LadderImg` (`<picture>` or the plain `<img>`, fallback on error); `HeroImage` takes `image`.
- Callers' image props: `src/browse/ExploreRails.jsx` (image, eager rule), `ExploreTab.jsx` (eager only while active and no page over it), `StoryRail.jsx` (`STORY_SIZES`), `ExploreCards.jsx`, `PlaceOverview.jsx`, `MapPlacePanel.jsx`, `DestinationPage.jsx`, `PhotoGallery.jsx` (mosaic `GalleryImg`), `src/hooks/usePlaceRows.js` and `useExploreCatalog.js` (rows carry `photo`, the whole record).
- `continent-app/src/styles/24-destination-workspace.css`: `.ladder-pic { display: contents; }` so the `<picture>` wrapper never becomes a box.
- `pipeline/photos/hero_ladder.py` (new): the derivative manifest builder.
- Tests: `continent-app/tests/heroLadder.test.mjs` (new), `tests/test_hero_ladder.py` (new).
- `docs/HANDBOOK.md` (Image ladder section, step 6), `ROADMAP.md` (H12 status), `Execution/_OPEN.md` (T1105-a to f).

The wire writers and their build stamps were not touched.

## Commands run

```
cd continent-app && npm ci
node scripts/sync-data.mjs --split-only          # boot.json + dest/ shards (gitignored) from public/app_data.json
python3 -I pipeline/photos/hero_ladder.py        # no manifest: live false, 13,976 published titles
FAST_OUT=<dir> node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs   # base worktree, this branch, and a simulated-live copy
node --test tests/heroLadder.test.mjs ; npm test
python -m pytest tests/test_hero_ladder.py -q ; ruff check pipeline/photos/hero_ladder.py tests/test_hero_ladder.py
npx eslint <touched files>
```

The measurement harness (a static server, an https stand-in for both image hosts, a Playwright script) lives in the session scratchpad, not the repo.

## Config and secrets set

None. The switch is the generated `heroLadder.json` (`live`). `?pic=off` in the page URL forces Wikimedia for an A/B on one build.

## Before/after measurements

Method: the fast build served locally, Chromium (Playwright), cold cache, 390x844 at DPR 3, Slow 4G as Lighthouse mobile (150 ms RTT, 1.6 Mbit/s down) and 4x CPU. LCP is the browser's own last `largest-contentful-paint` entry; bytes are the CDP `encodedDataLength` until 3 s of network quiet. Wikimedia and the CDN are not reachable from the container, so one local https stand-in answers both hosts through the same throttled stack: a Wikimedia thumb URL gets a JPEG (q80) of the requested width, a ladder URL gets an AVIF (q50) or WebP (q75) of that rung, cut from the same five 1280x720 photos (`public/home/film/*.webp`). Those sources are smoother than typical Commons photos, so every byte figure is lower than production for both sides; the ratios are the point, not the totals. "Before" is the base commit `662a94c31`, "shipped" is this branch as committed (`live: false`), "live" is this branch built with `live: true` (what production gets after T1105-a).

Explore (`?tab=explore`), 5 runs each:

| Metric | Before | Shipped | Live | Delta, before to live |
|---|---|---|---|---|
| LCP median, all runs | 13,792 ms | 11,016 ms | 11,992 ms | -1,800 ms |
| LCP median, runs with 760 KB non-image bytes | 13,184 ms (3 runs) | 10,768 ms (3) | 9,620 ms (2) | -3,564 ms |
| LCP, runs with 1,326 KB non-image bytes | 16,044 to 16,048 ms | 13,168 to 13,208 ms | 11,992 to 12,168 ms | about -4,000 ms |
| Image bytes | 3,034 KB, 25 requests | 1,942 KB, 25 | 1,164 KB, 17 | -62% |

Destination page (`?tab=explore#dest=OPO`), 5 runs each:

| Metric | Before | Shipped | Live | Delta, before to live |
|---|---|---|---|---|
| LCP median of runs that loaded the photo | 15,980 ms (3 runs) | 16,988 ms (4) | 20,104 ms (5) | +4,124 ms (not improved, see T1105-c) |
| Image bytes | 3,431 KB, 29 requests | 2,205 KB, 28 | 1,451 KB, 20 (133 KB Wikimedia + 1,318 KB CDN) | -58% |

Home (`?tab=home`), 3 runs each:

| Metric | Before | Shipped | Live |
|---|---|---|---|
| LCP median | 6,784 ms | 6,584 ms | 9,312 ms |
| Image bytes from Wikimedia or CDN | 0 KB | 0 KB | 0 KB |

Reading the numbers:
- The non-image bytes of one build swing between 760 and 1,326 KB from run to run (T1105-e), which is worth about 3 s at 1.6 Mbit/s, so medians mix two populations. The same-condition rows are the fair comparison.
- Home's LCP is the self-hosted film poster and it loads no Wikimedia photo on first paint, so this task cannot move it. The live Home runs all fell in the 1,326 KB population; a first build of this branch fetched 428 KB of Explore rail photos under Home (the tab stays mounted, hidden). That was fixed before the numbers above (see What broke).
- The destination page deep link paints Explore first. A trace of one live run shows two Explore rail photos as LCP candidates at 13.9 and 14.9 s, then the gallery slide at 17.3 s (the base build: 18.0 s in the same trace). The gallery request queues behind Explore's photos, so fewer bytes did not buy an earlier paint. Two base runs and one shipped run reported LCP at 4.6 s with no photo loaded at all; they are left out of the medians above.

Bundle: `heroImage` chunk 1 KB to 3 KB gzip (the SHA-1, title folding and the empty manifest).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Home fetched 428 KB of photos it never showed (first after-run) | `ExploreTab` stays mounted under Home; an eager `<img>` inside a hidden tab still downloads, while a lazy one does not | Rails are eager only when `isActive && !pageOver` (`ExploreTab.jsx`) |
| One after-run measured nothing (LCP 0, 5 errors) | The harness server cached the gzipped `index.html` of the previous build, which named asset hashes no longer on disk | Restarted the servers per build; numbers re-taken |
| Chromium in Playwright failed every image with `ERR_TUNNEL_CONNECTION_FAILED` | It picked up the container's HTTPS proxy, which does not see the locally mapped hosts | The harness runs without the proxy variables (local traffic only) and maps the three hosts with `--host-resolver-rules` |
| Python `round()` and JS `Math.round` differ on halves | `rung_dims` heights | `pyRound` (halves to even) in `heroImage.js` |

## Screens checked

- Explore at 390 px (DPR 3), simulated-live build: rail cards render as `<picture>` with `1280.avif` from the CDN address, the first two cards `eager`, the rest `lazy`; layout unchanged (the `.ladder-pic` wrapper is `display: contents`).
- Destination page (Porto) at 390 px, simulated-live build: the mosaic slide is `<picture>`, the photo credit line ("Photo: Diego Delso, CC BY-SA 3.0") is still under it, no 404s from either host.
- Rendered card sizes at 390 and 1440 px: phone rail card 166x166 (hence 64vw), desktop 320x400 (570px kept).
- Not checked: a real phone, and the dev server with the real master dataset (not in the container). See T1105-b.

Screenshots: `Execution/P15/T1105-shots/` (gitignored).

## What is still open

- T1105-a (user): the derive run and upload, then regenerate the manifest. The ladder stays off until then.
- T1105-b (user): a look on a real phone once live.
- T1105-c: the destination deep link paints Explore's rails first, so its gallery photo starts late; the destination LCP did not improve.
- T1105-d: about 60 other `HeroImage` callers and the Home film stills still pass only a URL.
- T1105-e: the run-to-run swing in non-image bytes.
- T1105-f: join `ih` and `d` into the wire (T052-d) so the bundle needs no `missing` list.
- The rest of H12 (entry chunk, lazy screens, CSS split) is other sessions' work.

## Rollback procedure

`git revert` the T1105 commits. Nothing is one-way: no data, schema or R2 change. To turn the ladder off after it goes live without a revert, set `"live": false` in `continent-app/src/lib/heroLadder.json` (or re-run `hero_ladder.py` with no `--manifests`) and rebuild; `?pic=off` does it for one page load.

## Owner steps (for the checklist)

- [T1105-a] Put the self-hosted destination photos live | the app now prefers Carta's own AVIF and WebP copies on Explore and destination pages, but only once they are on R2 and the manifest says so | on the build box run `python pipeline/photos/derive.py sources dest dossier --out <dir> --upload r2`; run the CAX41 `image_transcode` job for the `dest` and `dossier` layers (`derive.py run dest ...` and `run dossier ...` with `--upload r2`); `rclone copy r2:carta/img/manifest <dir>/manifest`; `python pipeline/photos/hero_ladder.py --manifests <dir>/manifest` and check it prints `live=True` with a small `missing`; commit `continent-app/src/lib/heroLadder.json`; build and deploy as usual | `pipeline/photos/hero_ladder.py`, `continent-app/src/lib/heroLadder.json`
- [T1105-b] Look at photos on a real phone after going live | the numbers come from a local stand-in, and sharpness at the new rail size needs a real screen | open Explore and a destination page on a phone on mobile data; check the rail photos are sharp, the photos come from cdn.carta-europetravel.com (`?pic=off` shows the old Wikimedia load for comparison) and the credit still shows under the gallery | `continent-app/src/browse/StoryRail.jsx`
