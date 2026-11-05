# T1062 to T1066: copy and focus fixes, jspdf 4, maplibre 6

## Date

2026-11-05

## Shared header

Batch branch `p15-copy-focus-upgrades`, cut from main at `a67c09d7d1`. It closes the five next-task rows that T1053 and T1061 opened: three design-rule findings from the CI design lint (T1061-a to T1061-c) and the two major upgrades that clear the last critical advisories (T1053-a, T1053-b, ROADMAP N4 follow-up under C6). Each task is its own commit, so any one can be reverted alone.

Checks for the whole batch:
- `npm test`: 1,236 of 1,236 pass.
- Lint: 0 errors, 163 warnings, unchanged.
- Design lint: 0 new violations, and the baseline shrank from 7,727 to 7,722.
- Fast build: passes.
- `npm audit --omit=dev`: 0 vulnerabilities.
- End check, in the browser on the dev server at desktop (1280) and phone (375) width, and headless on the fast build.

| Metric | Before | After |
|---|---|---|
| Critical advisories in production dependencies | 2 (jspdf, maplibre-gl) | 0 (`npm audit --omit=dev`: 0 vulnerabilities) |
| Design-lint violations | 7,727 | 7,722 |
| maplibre chunk in the fast build | not measured on 4.7.1 | 1,104 KB, plus a 519 KB worker file loaded only when a map starts (4.x inlined its worker in the main chunk) |

---

## T1062: trip card highlights joined with commas (T1061-a)

### What changed
`TripPlaceCard.jsx` joined a trip's highlights with " · ", and PRODUCT.md bans middots as separators. They are now joined with ", ". The doc comment's example uses commas too.

### Files touched
Modified: `continent-app/src/browse/TripPlaceCard.jsx`.

### Before/after measurements
Middot violations in design lint: 2 before, 0 after.

### What broke and how it was fixed
Nothing.

### Screens checked
Explore, Trips, at 375 px: no middot anywhere in the page text. The Hiking style showed no `.ctc` cards in this data, so the card itself was not seen with highlights. The change is a one-line join.

### What is still open
Nothing.

### Rollback procedure
`git revert` the T1062 commit.

---

## T1063: the word "Easy" reworded (T1061-b)

### What changed
PRODUCT.md bans "easy".
- `dest.around.good`: "Easy without a car" is now "Good without a car". It sits beside "Possible" and "Hard without a car". All six languages now say "good" instead of "easy": Goed, Bien, Gut, Bien, Bene.
- `pf.dh.pace.slow`: "Easy" is now "Relaxed", in English only. The other five languages already said calm or relaxed (Rustig, Tranquille, Ruhig, Tranquilo, Tranquillo).

Trail and journey difficulty grades ("Easy, Moderate, Hard") are a technical scale and the lint does not flag them. They are unchanged.

### Files touched
Modified: the six `continent-app/src/i18n/*.js` files and `continent-app/tests/keyStats.test.mjs` (three expected strings).

### Before/after measurements
Banned-word violations for these keys: 2 before, 0 after.

### What broke and how it was fixed
`keyStats.test.mjs` expected the old string. It was updated with the copy.

### Screens checked
The Explore page text at 375 px no longer contains "Easy" outside "Easygoing".

### What is still open
Nothing.

### Rollback procedure
`git revert` the T1063 commit.

---

## T1064: the seven focus rules checked (T1061-c)

### What changed
Each `outline: none` added since the baseline was checked for a visible replacement:

| Rule | Replacement |
|---|---|
| Home Ask, phone (`.hv-hero .hv-ask:focus-within`) | `.hv-ask-box:focus-within` draws a 2px ring |
| Home ruler (`.hm-ruler input[type=range]`) | The thumb draws a 2px `--focus` ring |
| Ask title (`.ac-title`) | None needed: `tabindex=-1`, focused only by code so a screen reader names the dialog; Tab never reaches it |
| Spot hit (`.spot-hit`) | `.spot:has(.spot-hit:focus-visible)` draws a 2px box shadow |
| Search dock kind (`.sdock-kind`) | The tile draws a 2px `--focus` ring |
| Search dock input (`.sdock-input`) | **Too weak**: a 1px border colour change and an 18% halo. Now the field draws a solid 2px `--focus` ring with a 2px offset |
| Trip top card name (`.trip-topcard-name:focus`) | `:focus-visible` draws a 2px ink underline |

The design-lint baseline was rewritten. It only shrank: middot 2, banned word 2 and the halo rule 1. The self-test still catches 19 of 19.

### Files touched
Modified: `continent-app/src/styles/96-search-dock.css` and `continent-app/scripts/ci/design-lint.baseline.json`.

### Before/after measurements
Design lint: 7,727 violations before, 7,722 after, 0 new.

### What broke and how it was fixed
Nothing.

### Screens checked
Search dock at 375 px, input focused. The computed style is `outline: solid 2px rgb(140, 90, 43)` with a 2px offset, and the ring is visible in the screenshot.

### What is still open
Nothing.

### Rollback procedure
`git revert` the T1064 commit.

---

## T1065: jspdf 3.0.4 to 4.2.1 (T1053-a)

### What changed
jspdf 4 fixes ten advisories, two of them critical (path traversal and PDF injection). The breaking change in 4 restricts file system access in the Node build. The app uses only `addFileToVFS`, `addFont`, `text` and `addImage` in the browser (`src/lib/pdfKit.js`), so no code changed.

### Files touched
Modified: `continent-app/package.json` and `continent-app/package-lock.json`.

### Commands run
A Node smoke script (in the session scratchpad, not committed) built an A4 PDF with jspdf 4.2.1, using the app's exact font calls: the three Figtree weights through `addFileToVFS` and `addFont`, text in each weight, and two pages. The result was 2 pages and 22,474 bytes, and Figtree was registered.

### Before/after measurements
jspdf advisories: 10 (2 critical) before, 0 after.

### What broke and how it was fixed
Nothing.

### Screens checked
No PDF was downloaded in the browser. The guide PDF sits behind the pass for a guest, and `verify_destination_page.mjs` is stale (T1053). See T1065-a.

### What is still open
- T1065-a: download one destination guide PDF and one trip PDF in the browser, with a pass, and open them: Figtree text, photos, footer. That proves jspdf 4 end to end.

### Rollback procedure
`git revert` the T1065 commit, then `npm ci`.

---

## T1066: maplibre-gl 4.7.1 to 6.16.0 (T1053-b)

### What changed
maplibre-gl 6 fixes a critical XSS sanitiser bypass. It has two breaking changes that touch this app:
- **It ships as ESM only, with no default export.** All 11 map components used `import maplibregl from 'maplibre-gl'`.
- **It loads its worker from a file beside its own module** (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`). Vite bundles the library into a hashed chunk, so that sibling file is not there.

One new module, `src/map/maplibre.js`, now does both:
- It imports the library as a namespace.
- It emits the worker through Vite's `?url` import and passes that URL to `setWorkerUrl` before any map is made.

Every map component imports `maplibregl` from it. Its comment says never to import `maplibre-gl` directly. No map call needed a change: none of the removed APIs are used (`map.transform`, the `setData` second argument, `styleimagemissing` image supply, `MapDataEvent`). The CSP already allows `worker-src 'self'`.

### Files touched
- Created: `continent-app/src/map/maplibre.js`.
- Modified: `package.json`, `package-lock.json` and the 11 map components: `CyclePage`, `DestMap`, `ExploreMap`, `PointMap`, `TrailPage` and `TripDayMap` in `browse/`; `CityPickerMap`, `CountryPickerMap`, `DayExploreMap` and `TripMap` in `map/`; `TripsMap` in `planner/finder/`.

### Commands run
```
npm install maplibre-gl@^6.16.0
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
node <scratchpad>/prod_map_check.mjs continent-app .fastbuild <shot>   # serves the fast build, public/ as fallback, headless Chromium
```

### Before/after measurements
maplibre advisories: 1 critical before, 0 after. Chunk sizes are in the shared header.

### What broke and how it was fixed
Nothing broke in the tests or the build. The worker path was the risk, so it was proven on the built bundle, not only on the dev server.

### Screens checked
- **Explore map on the dev server, 1280 px:** tiles, country labels, place dots and price labels render, with no console errors.
- **Trip page `#itin=at-salzburg-vienna-chain-6d` on the dev server, 1280 px:** the route map draws the line and the two numbered stops.
- **Explore map on the fast build, headless:** the worker loads as `maplibre-gl-worker-CMkqA50c.mjs`, and the map renders with its dots and price labels. The only console error is the R2 flights index refusing the test origin `localhost:5181` (CORS), which has nothing to do with maplibre.

Screenshots are in `Execution/P15/T1062-shots/` (gitignored).

### What is still open
- T1066-a: the other map screens (trail page, cycling page, day map, city and country pickers, trip finder map, destination locator) were not opened. They share the module and the calls already proven, but look at each once after the next deploy to preview.

### Rollback procedure
`git revert` the T1066 commit, then `npm ci`.

---

## T1067: Vercel removed from the live code (owner request, during PR #8)

### What changed
The app is on Cloudflare Pages (since T293), with R2 for data and the Hetzner box for pipeline runs. Vercel was kept as a rollback host, and the owner asked for it to be gone.
- `continent-app/vercel.json` is deleted. It was the rollback host's headers, and nothing in the build or CI read it.
- `scripts/r2/stage-data.mjs` no longer requires the data host in `vercel.json`'s connect-src. It checks only `public/_headers`, the policy Pages actually sends.
- Comments that named Vercel or `vercel.json` now name Cloudflare Pages or `public/_headers`. The files are `_headers`, `verify_csp.mjs`, `csp-hash.mjs`, `numbers.mjs`, `WebcamEmbed.jsx`, `affiliate.js`, `cityResearch.js`, `e2eSeams.js` (its em dash removed too), `pictureFlag.js`, `explore.spec.mjs`, `vite.config.js`, `.env.example` and `docs/REGIONS.md`.
- The `.vercel/` line is gone from `.gitignore`, and the ROADMAP review row is marked done.

Left on purpose:
- `archive/`, the phase digests, the closed register and old reports, which record history.
- `docs/legal/ARTICLE30.md`'s Vercel row: it stays a true processing record while the old Vercel deployment still answers on its own URL. Remove it once T293-a is done.
- The comment in migration 031, because migrations are not edited.

### Why the Vercel bot still comments
Vercel's GitHub App is still connected to the repository, and the project `carta-travel-app` still exists in Vercel. No repository change stops that. The owner step is the existing row T293-a (runbook B14):
- delete the Vercel project;
- uninstall the Vercel app under GitHub, Settings, Applications.

### Files touched
- Deleted: `continent-app/vercel.json`.
- Modified: the files listed above, plus `ROADMAP.md`.

### Before/after measurements
Vercel mentions in live code and the bound docs went from 26 to 0. History, legal and migrations are excluded, as listed above. `npm test`: 1,236 of 1,236. Design lint: 0 new.

### What broke and how it was fixed
Nothing.

### Screens checked
None. Only comments and an unused config file changed in the app.

### What is still open
- T293-a (owner, existing): delete the Vercel project and uninstall its GitHub app, then drop the Vercel row from `docs/legal/ARTICLE30.md`.

### Rollback procedure
`git revert` the T1067 commit.
