# T052 Switch the layer pages to picture and srcset, behind a flag

## Task ID

T052

## Date

2026-09-28

## What changed

The beach, lake and mountain pages can now serve their photographs from the image ladder as `<picture>` with an AVIF source (320, 640 and 1280 rungs), a WebP source (320 and 640) and today's Wikimedia JPEG as the `<img>` fallback. It is behind a per-layer flag that is off in every build, so production renders exactly what it rendered before. The export stage of the three layers joins what the app needs from the derive manifest into the wire, and a hero also carries a 24 character placeholder. Measured against a local stand-in for the CDN, on a paced image link, the hero's largest contentful paint fell by 1.9 to 2.2 seconds on a phone and by 0.3 to 1.2 seconds on desktop on all three layers, and the hero's bytes fell by 54 to 69 per cent on a phone. On T011's own loopback condition, where the network costs nothing, the change is within noise. The production number is an owner step (row T052-a, step 29 of `Execution/P3/_OPEN-hetzner.md`), because cdn.carta-europetravel.com does not resolve yet and there is no R2 credential on this laptop.

The task also found and fixed a live bug on the same element. Since 2026-09-14 (commit be4541c in the app repo) the hero `<img>` on all three pages has carried `width=16 height=10`, and the `.bpage-shot` rule never said `height: auto`. HTML width and height attributes map to CSS width and height, so the height attribute won over `aspect-ratio: 3 / 2` and every beach, lake and mountain hero has been drawn 10 pixels tall for two weeks: a coloured sliver above the thumbnail strip. The headless screenshots show it plainly. One line of CSS fixes it for every layer, flag or no flag, and it has to be there anyway, because emitting the photograph's real width and height (part of this task) would otherwise draw the hero 853 pixels tall. This fix is the one part of the task that is not behind the flag.

How it works, for whoever maintains it.

The wire. derive.py (T049) writes a manifest per layer, `img/manifest/<layer>.json`, keyed by canonical source title. The browser never fetches it: at about 180 bytes per source it would cost 3 MB gzipped for full beaches. Instead `pipeline/photos/wire_ladder.py` runs inside each layer export, just before the files are written. For every image record whose canonical title (derive's own `canonical_title`) is in the manifest it adds `ih`, the sha1 that is the whole address, and `d`, the real pixel size of the 320, 640 and 1280 rungs. The manifest calls the sha1 `h`, but every wire image record already has an `h`, the height of the 1280 thumbnail, so it travels as `ih`; the first run of this task overwrote 13,062 heights with hashes before that was caught. On `images[0]` of a row it also adds `ph`, the placeholder. Nothing else in the record changes: `u`, `big`, `w`, `h`, `by`, `lic`, `licUrl` and `page` are untouched, so the pages still print the credit from the wire record (T051-b) and the fallback is still the JPEG. The exports take two new flags, `--img-manifest` (the manifest file, or a directory holding it) and `--img-root` (a local img/ tree, for placeholders). Without `--img-manifest` an export writes the same bytes as before: all 132 wire files of the three layers came out identical apart from `generated_at`. A manifest path that was given and cannot be read stops the export rather than quietly writing an unjoined wire.

The placeholder. Six colours: the 320 WebP rung box-filtered to a 3 by 2 grid, 18 bytes of RGB, base64url, exactly 24 characters. The app paints them as six flat blocks behind the hero until the photograph covers them. Blurhash was the other candidate and lost on three counts. It needs a decoder in the bundle and a canvas or data URL built on the main thread before the hero paints, which is the path LCP measures. What it draws is a smooth gradient, and carta-design forbids gradients. And if it is painted as a data URL image it becomes an LCP candidate of the same size as the hero, so the page would report the placeholder's paint as its largest paint and hide a slow photograph behind a fast number. The six blocks are six CSS images of one colour each (`linear-gradient(c, c)` is the only CSS way to size a block of flat colour; nothing blends), set as the img's background, so they are never an LCP candidate. They are dropped once the photograph has loaded. There is no fade and no motion.

The flag. `src/lib/pictureFlag.js` is the one door. `VITE_PICTURE_LAYERS` at build time takes `beaches`, a comma list, `all`, or nothing (off). `?pic=` in the page URL takes the same words plus `off`, and replaces the build's setting for that page load. The query seam is not compiled out of production like the `?xxxmock` seams, because it changes only where a photograph comes from, never what anyone may see, and the owner needs it to measure a Preview (step 29). With the flag on, a record without `ih` still renders the old `<img>`, now with its real width and height when the wire knows them, so a layer can be switched on before its derive run has finished.

The component. `src/components/LayerPhoto.jsx` renders one photograph. Flag off, or no copy: the `<img>` the page rendered before, attribute for attribute. Flag on with a copy: the `<picture>` above, width and height from `d[2]` (the photograph's real shape), `loading=lazy` on everything except the hero, and on the hero `loading=eager`, `fetchpriority=high` and the placeholder. If the copy fails to load, `onError` flips that one photograph back to the plain JPEG, so a manifest that ran ahead of the bucket costs a flash, not a broken image. The srcset descriptor is the real width from `d`, never the rung's name: a 1024 px Geograph photo's "1280.avif" is 1024 wide, and two rungs with the same real width are collapsed to one, because duplicate descriptors are a srcset error.

The preload. `HeroPreload` in the same file adds `<link rel="preload" as="image" type="image/avif" imagesrcset imagesizes fetchpriority="high">` for the single hero of the page that is opening, and nothing else. It is mounted by `DestinationsTab.jsx` beside the `Suspense` that loads the page's lazy chunk, which is the only moment a preload is worth anything in this single page app: the hero's download starts while the page's JavaScript is still in flight. `imagesizes` and the `<source>`'s `sizes` are the same constant (`HERO_SIZES`), so the browser picks the same candidate and reuses the preloaded response. `type=image/avif` makes a browser without AVIF skip the preload instead of fetching bytes it will not use. Measured effect, one sampled run per cell: on a phone the hero request started 120 to 940 ms earlier than the JPEG's.

The CDN base. `src/lib/imageLadder.js` holds `IMG_BASE` (default `https://cdn.carta-europetravel.com/img`, overridable with `VITE_IMG_BASE`) and derives `CDN_HOST` from it. `src/lib/imageCredit.js` now imports `CDN_HOST` from there instead of spelling it, so a build pointed at a stand-in credits the same URLs it serves. T051's harness (`pipeline/photos/verify_attribution_cdn.py --run`) still passes with the import in place: 42 of 42 CC BY-SA entries credited from the CDN URL.

## Files touched

App repo (continent-app/), code commit:

**Created:**
- continent-app/src/lib/imageLadder.js (IMG_BASE, CDN_HOST, ladder URLs and srcsets, the placeholder)
- continent-app/src/lib/pictureFlag.js (the per-layer flag and the ?pic= seam)
- continent-app/src/components/LayerPhoto.jsx (LayerPhoto, HeroPreload, HERO_SIZES, THUMB_SIZES)

**Modified:**
- continent-app/src/browse/BeachPage.jsx, LakePage.jsx, MountainPage.jsx (hero and strip thumbnails through LayerPhoto)
- continent-app/src/browse/DestinationsTab.jsx (HeroPreload beside each of the three lazy pages)
- continent-app/src/lib/imageCredit.js (CDN_HOST imported from imageLadder.js)
- continent-app/src/styles.css (`height: auto` on `.bpage-shot`)

Root repo, code commit:

**Created:**
- pipeline/photos/wire_ladder.py

**Modified:**
- pipeline/beaches/export_beaches.py, pipeline/lakes/export_lakes.py, pipeline/mountains/export_peaks.py (the two flags and one join call each)

Root repo, report commit:

**Created:**
- Execution/P3/T052-picture-srcset-rollout.md

**Modified:**
- Execution/_OPEN.md (rows T052-a to T052-g; T049-h and T051-b closed)
- Execution/P3/_OPEN-hetzner.md (step 29 and its summary rows)

**Deleted:**
- None.

No `public/` data was committed. The joined wire lives in the session scratchpad and was copied into `dist/` only for the measurement, because the production wire must not carry `ih` until the objects exist in R2 (T052-d). `apply_image_dims.py` was not touched: it serves the master's destination heroes, and the layer wires already carry `w` and `h` from their caches on every lake and mountain record and on all beach records except about 295 Geograph ones, whose shape the join supplies once they are derived. `scripts/perf/baseline_vitals.mjs` and `reports/perf_baseline_T011.json` are untracked T011 files; the first was copied, not edited, and the second was never written to. `vercel.json` (the CSP) was outside scope (T052-b).

## Commands run

From the repo root in Git Bash, `$S` the session scratchpad, `PYTHONIOENCODING=utf-8`. `Get-Process python` showed nothing running before the derive runs. libvips is T008's install, via `CARTA_VIPS_BIN`.

```
git checkout -b p3-picture-srcset-rollout                      # root, from p3-attribution-follows-pixels
git -C continent-app checkout -b p3-picture-srcset-rollout     # app, from p3-attribution-follows-pixels
# the unchanged exports reproduce the committed wire (0 of 132 files differ)
python pipeline/beaches/export_beaches.py --out $S/t052/before/beaches      # and lakes, mountains
# derive a sample of lakes and mountains locally (no upload)
python pipeline/photos/derive.py run lakes --countries SI --published-only --limit 20 --upload none --out $S/t052/lakes --run-id 20260927t120000z-t052l
python pipeline/photos/derive.py run mountains --countries CH --published-only --limit 20 --upload none --out $S/t052/mountains --run-id 20260927t121000z-t052m
# T049's three beach manifests (run1, run3, run4) merged into one: 81 sources
python pipeline/beaches/export_beaches.py --out $S/t052/after/beaches --img-manifest $S/t052/beaches_manifest/beaches.json \
  --img-root $S/t049/run1/img --img-root $S/t049/run3/img --img-root $S/t049/run4/img
python pipeline/lakes/export_lakes.py --out $S/t052/after/lakes --img-manifest $S/t052/lakes --img-root $S/t052/lakes/img
python pipeline/mountains/export_peaks.py --out $S/t052/after/mountains --img-manifest $S/t052/mountains --img-root $S/t052/mountains/img
# no manifest: byte-identical apart from generated_at, no ih anywhere
python pipeline/beaches/export_beaches.py --out $S/t052/nomanifest/beaches        # and lakes, mountains
python pipeline/photos/verify_attribution_cdn.py --run $S/t049/run3                # T051's harness, still passes
cd continent-app
npx eslint <the touched files>                                                     # 0 errors
VITE_IMG_BASE=http://127.0.0.1:4232/img npm run build
cp $S/t052/after/<layer>/*.json dist/<layer>/     # then image hosts in those files rewritten to the 127.0.0.1:4233 mirror
node $S/t052/vitals_layers.mjs                    # RUNS=5, FLAGS=off,all, PACE=0 and PACE=150,200, MIRROR_OFFLINE=1
node $S/t052/shots.mjs                            # screenshots, SLOW=4000 for the placeholder frame
node scripts/verify_beaches.mjs "http://127.0.0.1:4231/?pic=off"   # and ?pic=all; lakes, mountains, places_tab, explore
```

The derive runs: lakes 19 derived and 1 failed in 151 s, mountains 20 derived in 78 s. The joins: beaches 83 of 13,062 image records (29 heroes, 29 placeholders), lakes 19 of 8,306 (17 heroes), mountains 22 of 6,380 (13 heroes).

The measurement harness is T011's, copied to the scratchpad (`vitals_layers.mjs`) because its file could not be edited. Everything that defines a T011 number is unchanged: the static server over `dist/` on 4231, the buffered LCP and CLS observers installed before app code, the storage seeds, desktop 1440 by 900 at CPU 1 and phone 390 by 844 at DPR 3 and CPU 4x, a fresh browser context per run, the median. What it adds, and why:

A second loopback server on 4232 stands in for cdn.carta-europetravel.com and serves the derive runs' img/ trees with the real CDN's `Cache-Control: public, max-age=31536000, immutable`. A third on 4233 serves a disk mirror of every Wikimedia and Geograph file the pages asked for, filled once from the real hosts at the harvest's pacing; the three layer wires in `dist/` were rewritten to point at it. So flag off and flag on differ only in bytes and markup, never in whose CDN answered or how far away it was.

Every other third-party request is answered locally or refused, identically in both states: Supabase with an empty list, the Google Fonts stylesheet with an empty sheet, the rest (the affiliate script, open-meteo, the destination photographs `app_data.json` still hotlinks) refused. The first passes ran against the live network and were unusable: a single run ranged from 0.6 to 23 s, from a Supabase call that supabase-js retries for about 7 s before the layer page opens, and from Wikimedia fetches that took 0.4 to 30 s.

`PACE=150,200` delays every image response from 4232 and 4233 by 150 ms and streams it at 200 KB/s, roughly Lighthouse's slow 4G, on the image origins only. `PACE=0` is T011's condition.

Pages: `#beach=es-cala-rovira-Q24021830&bc=ES`, `#lake=si-lake-bled-Q648902&lc=SI` and `#mtn=ch-jungfrau-Q15312&mc=CH`, each with `?pic=off` or `?pic=all` in front. Their heroes are derived; most of their strip thumbnails are not, and stay on the mirror in both states.

Screen harnesses, run against the joined build (layer wires from the scratchpad, real Wikimedia hosts, the CDN stand-in on 4232), each with `?pic=off` and `?pic=all`. `verify_beaches.mjs`: 0 checks failed both ways (one page error, a 404 for a photograph the stand-in does not hold). `verify_lakes.mjs`: all checks passed both ways. `verify_mountains.mjs`: 1 failed both ways, a click timeout on the list's filter chips after the lift filter. `verify_places_tab.mjs`: throws both ways (`selectOption` on an element that is no longer a select). `verify_explore.mjs`: 28 of 30 both ways (the desktop and phone passes time out). The last three fail identically against a build of the app's HEAD (97d88f1) made in a scratch worktree and served with the same data, so they predate this task and are harness drift in the list and Explore surfaces, which T052 does not touch. Screenshots of all three pages on phone and desktop, flag off and on, plus a mid-load frame holding the hero's AVIF for 4 s, were looked at by eye: the hero sits in its 3:2 box in every state, the credit line reads the same author off and on (Isidro Jabato, Ajznponar, Earth explorer), the placeholder is six flat blocks in the photograph's colours, and nothing overflows at 390 px. The same screenshots of the build before the CSS line show the 10 px sliver.

## Config and secrets set

No secret. Two new build variables, both unset everywhere: `VITE_PICTURE_LAYERS` (unset means off for every layer) and `VITE_IMG_BASE` (unset means `https://cdn.carta-europetravel.com/img`; the measurement build used `http://127.0.0.1:4232/img`). Two new export flags, `--img-manifest` and `--img-root`, default off. Pillow (10.4, already installed) is what reads the 320 WebP rung for the placeholder; without it a hero simply gets none.

## Before/after measurements

This is a local stand-in for the CDN. It says what the switch does to bytes and to the order of events on one machine. It does not say what users on cdn.carta-europetravel.com will see; that is T052-a. T011 did not measure the layer pages, so the "before" is this task's own flag-off state, taken with T011's method on the same build and the same machine: `?pic=off` against `?pic=all`, five cold runs per cell, medians.

Largest contentful paint of the hero, milliseconds:

| Layer | Device | Paced off | Paced on | Delta | Loopback off | Loopback on | Delta |
|---|---|---:|---:|---:|---:|---:|---:|
| Beach | phone | 5,092 | 3,012 | -2,080 (-41%) | 2,480 | 2,596 | +116 |
| Lake | phone | 4,908 | 2,996 | -1,912 (-39%) | 2,456 | 2,452 | -4 |
| Mountain | phone | 4,700 | 2,484 | -2,216 (-47%) | 2,572 | 2,532 | -40 |
| Beach | desktop | 2,796 | 1,568 | -1,228 (-44%) | 696 | 628 | -68 |
| Lake | desktop | 1,920 | 1,632 | -288 (-15%) | 580 | 572 | -8 |
| Mountain | desktop | 2,036 | 1,100 | -936 (-46%) | 564 | 564 | 0 |

The paced five-run ranges do not overlap on any of the six rows (phone beach off 5,028 to 5,124, on 2,924 to 3,164, for example), so the improvement on all three layers is measured, not noise. On loopback the LCP element is the hero in every run, and the phone number is set by the app's own boot (the 12 MB `app_data.json` parse at 4x CPU, about 2.4 s), not by the image, which is why the switch cannot move it there. AVIF decoding costs no visible extra time on loopback.

Hero bytes transferred (the LCP resource's body):

| Layer | Device | Off (JPEG) | On (AVIF) | Delta |
|---|---|---:|---:|---:|
| Beach | phone (1280 px both) | 383,939 | 158,069 | -59% |
| Lake | phone | 380,031 | 174,246 | -54% |
| Mountain | phone | 281,621 | 88,560 | -69% |
| Beach | desktop (960 JPEG, 1280 AVIF) | 219,761 | 158,069 | -28% |
| Lake | desktop | 214,097 | 174,246 | -19% |
| Mountain | desktop | 167,930 | 88,560 | -47% |

On desktop the AVIF is a third wider than the JPEG it replaces (the 860 px column picks the 1280 rung, where Wikimedia's list offered 960) and still smaller.

CLS is unchanged by the flag: 0.0538, 0.0622 and 0.0653 on the phone beach, lake and mountain pages, 0.0001 on desktop, identical off and on. The hero's box is set by the CSS aspect ratio, so the real width and height do not move it; the phone shifts come from elsewhere on the page.

The pages as shipped before this task (the 10 px hero), same method: phone LCP 2,776, 3,148 and 2,492 ms on loopback and 2,420, 2,680 and 2,580 paced; desktop 604, 580 and 580 on loopback. Those numbers look better than the fixed page's, and they are not: the LCP element in every one of those runs is a paragraph of text or a card under the overlay, never the photograph, because a 10 px sliver is too small to be the largest paint. They are recorded so nobody compares against them.

Wire cost of the join: 96 to 114 bytes raw per joined image record (65 to 74 gzipped), measured on the three layers' joined files. For full beaches (14,022 records once all are derived) that is about 1.35 MB raw across 41 country files and top.json.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Every beach, lake and mountain hero drawn 10 px tall in production since 2026-09-14 | `width={16} height={10}` on the img map to CSS width and height, and `.bpage-shot` set no `height: auto`, so the attribute beat `aspect-ratio` | `height: auto` on `.bpage-shot`; applies with the flag off too |
| The first join overwrote every image record's height with a sha1 | The manifest's field is `h`, and the wire's image records already use `h` for the pixel height | The sha1 travels as `ih`; the diff check that hid it (it ignored `h`) now ignores only the new keys |
| The merged beaches manifest had 69 sources, not 81 | The merge script cleared the first manifest's `files` while iterating it | Deep copy first; 81 sources, 29 heroes joined, matching an independent count |
| The preloaded hero was downloaded twice | The stand-in server sent `no-store`, which Chrome will not reuse a preload from | The stand-in sends the real CDN's immutable header, as T049's upload does |
| Flag-off hero JPEGs never became an LCP candidate in the first harness | They were served by Playwright route interception; also 74 mirror files had lost their content-type sidecar and answered 500 | The mirror is a real loopback origin the wire points at; sidecars repaired |
| Runs ranged from 0.6 to 23 s | Live third parties: supabase-js retrying for about 7 s before the page opens, Wikimedia fetches of up to 30 s | Supabase and fonts answered locally, the rest refused, identically in both states |
| A thin light seam between two placeholder blocks | 33.34 per cent blocks rounding apart | Blocks are 34 by 51 per cent and overlap by a fraction of a pixel |

## What is still open

The production measurement is the owner's (T052-a, order 56, step 29). It needs real beaches objects in R2 (T049-c, order 51) and the CDN host in the CSP img-src, which `vercel.json` does not have (T052-b, order 55, the T053 CSP task). Until T052-b lands, turning any layer's flag on in production blocks every CDN photograph, so the flag stays off.

Nothing yet joins the ladder into the production wire. run_pipeline.py and the CAX11 cron do not fetch `img/manifest/<layer>.json` from R2 before the three exports or pass `--img-manifest` (T052-d). The placeholder is encoded at export from a local 320 WebP, which the export box will not have; derive.py should write it into the manifest as `p` while it holds the pixels, in the same change as T051-c's nothing-owed marker (T052-c). Heroes without one show the plain panel ground, as today.

The layer-page harness lives only in the scratchpad, because `scripts/perf/baseline_vitals.mjs` is an untracked T011 file this task could not edit. A layer-page mode for it should be committed so the production re-measure uses the same method (T052-e).

Only the three pages switched. The layer cards on the Destinations tab, Explore, the country covers, top.json cards, trips, POI thumbnails and every other surface still hotlink Wikimedia and Geograph at fixed widths (T052-f). T049-f and T051-c are not covered by this task and stay open. Three screen harnesses fail on HEAD as well as on this branch, identically off and on: verify_mountains, verify_places_tab and verify_explore have drifted from the list and Explore markup (T052-g).

For T053 (CSP tightening). With the flag on for all three layers, the three pages request photographs from `cdn.carta-europetravel.com` (every derived hero and derived strip thumbnail) and still from `upload.wikimedia.org`, `thumb.wikimedia.org` and `s0` to `s3.geograph.org.uk` for every image record without `ih`: today that is all but 124 of the three layers' 27,748 image records, and after full derive runs it is none on these pages. The `<img>` fallback inside each `<picture>` still names the Wikimedia or Geograph JPEG, which a browser without AVIF and WebP, or the `onError` fallback, will fetch. Call sites that still hotlink regardless of the flag: `BeachCard`, `LakeCard` and `MountainCard` in `browse/DestinationsTab.jsx` (through `CardPhoto` with `images[0].u`), `browse/RegionPage.jsx`, `planner/CountryBrief.jsx` (`images[0].u` and the cover), `planner/CountryMatchCards.jsx`, `components/HeroImage.jsx` and every user of `lib/heroImage.js` (`JourneysSection`, `JourneyPage`, `TripPage`, `TripDayPhotos`, `SavedTripsPanel`, `ReadyTripsStep`, `DestinationsTab`), POI thumbnails credited through `lib/imageCredit.js`, `map/CityPickerMap.jsx`, `lib/tripGuide.js`, `lib/localIntel.js`, `planner/dayDraft.js` and the admin `ContentSection`. The CSP can add the CDN host now; it cannot drop the Wikimedia or Geograph hosts until those move too.

Carta-design, the seven questions. One: no hex value was added to any stylesheet; the placeholder's six colours are the photograph's own, read from the wire, not design colours. Two: no warm neutral, serif, shadow or visible gradient was added; the placeholder uses `linear-gradient(c, c)` only as CSS's syntax for a flat block of one colour, and nothing blends. Three: `--flag` is not used. Four: no text was added, so no mono or sans choice arises. Five: no button was added. Six: no copy was added; no em dash, none of the banned words. Seven, remove one thing: a fade from placeholder to photograph was considered and left out, so the loading state has no motion at all and nothing to switch off under reduced motion. The fixed hero keeps its existing 3:2 box, radius and panel ground; nothing overflows at 390 px.

Nothing here needs the Claude API, and nothing calls it.

## Rollback procedure

In production nothing is switched on, so there is nothing live to undo except the CSS line, which restores the hero. To turn one layer off after it has been switched on, remove it from `VITE_PICTURE_LAYERS` in Vercel and redeploy; the wire fields can stay.

To revert the code, newest first:

```
git revert <T052 report commit> 2292849a6
git -C continent-app revert 645f59a
# or, unmerged:
git checkout p3-attribution-follows-pixels && git branch -D p3-picture-srcset-rollout
git -C continent-app checkout p3-attribution-follows-pixels && git -C continent-app branch -D p3-picture-srcset-rollout
```

Reverting the app commit also removes `height: auto`, which brings the 10 px hero back; if the rest must go, keep that one line. Reverting the root commit leaves any wire already exported with `ih`, `d` and `ph` in place; the reverted app ignores those keys, and the next export without the flags drops them.
