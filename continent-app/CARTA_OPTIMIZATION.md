# Carta — optimization plan

**App:** carta-europetravel.com · React 18 + Vite 8 SPA on Vercel
**Repo:** `continent-app/` · ~123,650 LOC · 3,857 destinations + ~50,000 content items
**Audited:** 14 September 2026, against the live deployment and the working tree.

Every number below was measured (live resource timing, `gzip -c | wc -c` on the real build,
`node` over the real JSON), not estimated. Line numbers refer to the tree **before** the
changes in §0 — re-grep before editing.

---

## 0. Already applied and verified

These are committed on `main` (`6fd3eba`, baseline at `c46f783`). A clean `vite build`
was run against the patched tree; 0 eslint errors.

| Change | Files | Measured effect |
|---|---|---|
| Only English in the entry chunk; `nl/de/fr/es/it` become lazy chunks | `src/i18n/index.jsx` | −1.03 MB raw from main |
| `ExploreMap` lazy-loaded → maplibre-gl leaves the entry chunk | `src/browse/ExploreTab.jsx` | −786 KB JS, −65 KB CSS from main |
| `Cache-Control` headers (`/assets` immutable, SWR for data layers) | `vercel.json` | was `max-age=0, must-revalidate` on **everything** |
| CSP allows `travelpayouts.com` + `sentry.avs.io` | `vercel.json` | un-breaks the Travelpayouts Drive link switcher |
| `canonical` + Open Graph + Twitter card | `index.html` | every share link had a blank preview |
| `robots.txt` + placeholder `sitemap.xml` | `public/` | both were 404 |
| `?paymock` / `?provmock` / `?sharemock` / `?savedmock` / `?badgemock` / `?coplanmock` / `?guidesmock` compiled out of production | `src/lib/e2eSeams.js` + 7 call sites | closed a shareable paywall bypass |
| App no longer opens on a full-screen sign-in wall | `src/App.jsx` | gate now only raised by a deliberate sign-out |
| SW stops caching the 33 MB activities file; dup `clients.claim()` removed; cache bumped to v6 | `public/sw.js` | ~50 MB → ~16 MB of Cache Storage per origin |
| `git init` + a real `.gitignore` (`.env`, `dist/`, `node_modules/`, generated `public/` data) | repo root | the project had **no version control** |
| `npm test` / `npm run verify` / `npm run ci` | `package.json` | 75 verify scripts existed; 1 was wired up |

**Critical-path bundle, before → after:**

| | Before (live) | After | Δ |
|---|---:|---:|---:|
| Main JS chunk | 2,520,001 B / **743.6 KB gz** | 868,411 B / **259.6 KB gz** | −65 % |
| Main CSS | 694,484 B / 108.2 KB gz | 629,157 B / 99.4 KB gz | −8 % |
| `supabaseClient` (modulepreloaded) | 203,049 B / 51.4 KB gz | unchanged | — |
| **Critical JS + CSS** | **~903 KB gz** | **~411 KB gz** | **−54 %** |

`app_data.json` (1.9 MB brotli / 12.7 MB decoded) is untouched and still gates first paint —
that is §2, and it is the remaining order of magnitude.

### Two things to do before redeploying

1. **Set `VITE_E2E_SEAMS=1` in the local `.env` only.** It is already added locally.
   Do **not** set it in Vercel — that is what keeps `?paymock` out of production.
   `scripts/verify_*.mjs` against `npm run preview` still works locally.
2. **Replace the `og:image`.** `index.html` currently points at `/icon-512.png`.
   A 1200×630 card (a hero photo + the wordmark) is what actually renders in Slack/WhatsApp/X.

---

## 1. Measured baseline

**Live first load** (desktop, warm CDN, `www.carta-europetravel.com`):

```
TTFB              652 ms
DOMContentLoaded 1152 ms
load             2581 ms
requests           29
transferred      2.87 MB
decoded         16.44 MB
```

| Asset | Transfer | Decoded |
|---|---:|---:|
| `/app_data.json` | 1,901 KB | 12,688 KB |
| `/assets/index-*.js` | 722 KB | 2,461 KB |
| `/assets/index-*.css` | 120 KB | 678 KB |
| `/fares/CRL.json` | 67 KB | 366 KB |
| `/assets/supabaseClient-*.js` | 52 KB | 198 KB |

**On disk in `public/`:** `activities_full.json` 33.3 MB · `app_data.json` 13.0 MB ·
`poi_credits.json` 2.1 MB · `fares/` 26 MB over 286 files · ~230 MB total.

**JSON.parse cost on desktop Node** (mobile is 4–8× slower):
`app_data.json` 121 ms · `activities_full.json` **1,070 ms**.

**Source:** `src/styles.css` 31,933 lines / 1.02 MB · `DestinationsTab.jsx` 3,729 lines ·
`DayPlannerTab.jsx` 3,678 lines (one 3,536-line component) · `GuidedTripWizard.jsx` 3,047 lines.

---

## 2. Data payload — the remaining order of magnitude

### 2.1 `app_data.json` is 13 MB and gates first paint

`index.html` preloads it; `src/lib/appData.js:22` starts the fetch at module-eval;
`src/App.jsx:701` returns the loading screen until it lands. The whole parsed object then
lives in React state for the session — and in practice ~2.3× that, because three copies coexist:

1. `raw`, held forever in `useAppData` state.
2. `hydrated` — `src/lib/origins.js:107-116` clones all 3,868 records to attach `routes`.
3. `lastDataRef.current` (`src/hooks/useAppData.js:95-97`) deliberately retains the *previous*
   hydrated copy across an origin change.

Plus `src/planner/DayPlannerTab.jsx:165-171` spreads a fourth full copy.

**Where the 13 MB goes** (per-field totals across the catalogue):

```
accommodation 1.75MB   activities 1.54MB   image 0.98MB   climate 0.84MB
costs 0.81MB           rating 0.73MB       beauty 0.73MB  local_transport 0.60MB
members 0.35MB         bathing_water 0.32MB blurb 0.31MB  place 0.29MB
```

Inside those: `accommodation.neighbourhoods` 505 KB · `accommodation.longtail_base` 241 KB ·
`climate.m` 772 KB · `image.page`+`credit`+`source` 298 KB · `rating.components`+`source`+
`confidence` 308 KB · `beauty.components`+`source` 302 KB · `local_transport.reason` 234 KB.
**None of that is read at first paint.**

**Provably dead — zero references anywhere in `src/`** (~320 KB of raw payload shipped to
every visitor that nothing ever reads):
`accommodation.longtail_base`, `.premium_base`, `.pop_factor`, `.settlement_tier`,
`.calib_base`, `.adr_calibration`, `costs.premium_base`, `costs.tourist_premium`,
`rating.inputs_present`. `scripts/sync-data.mjs:154-220` already has a "wire diet" pass for
`guide`/`nature`/`geonames`/`climate` — these were simply never added to it.

**Measured split** (the boot core was actually built from the real file):

| Variant | Raw | gzip | brotli |
|---|---:|---:|---:|
| Current | 12.99 MB | 2.18 MB | 1.16 MB |
| **Boot core only** | **5.19 MB** | **0.52 MB** | **0.32 MB** |
| Columnar boot core | 2.69 MB | 0.27 MB | — |

**Do this** (all in `scripts/sync-data.mjs`, which already has the machinery — `sanitizeDeep`,
the fares inversion, the per-layer writers):

1. Emit `public/app_core.json` with only the boot field set:
   `id, tier, iata, city, country, iso2, lat, lon, city_lat, city_lon, categories, tags,
   anchor_airport, no_ryanair_route, transfer, rating.{score,tier,fame,hidden_gem,label},
   beauty.{score,gems,unesco,top_beach,unesco_count}, image.url, climate.best, costs.*,
   accommodation.{per_person_night_eur,cleaning_per_person_eur,entire_home_night_eur,
   typical_capacity,level,n_listings,captured,source_place,tiers,seasonality},
   local_transport.{car_needed,transit_quality,rental_eur_per_day,road_connected},
   place.{class,visit_h}, crowding.{tier,label}, bathing_water.{rating,excellent_pct},
   country_rank/n/badge/percentile, class_percentile, geonames, driving_toll`.
   This is what `index.html` preloads.
2. Shard the heavy remainder to `public/dest_detail/{iso2}.json` (~43 shards, ~250 KB each),
   fetched lazily by `DestinationPage` / `DetailPanel` / `Neighbourhoods` / `ClimateStrip` —
   exactly the pattern `fetchCountryInsights()` already uses at `src/lib/appData.js:52-57`.
3. Fold `activities.items` (1.46 MB) into the same detail shards.
4. Add the 9 dead fields to the diet pass.
5. Replace `hydrateForOrigin`'s 3,868 clones with a sidecar `Map` keyed on `destAnchor(d)` —
   that also removes the need for `lastDataRef` to hold a second full copy.

**Also: two synchronous full-catalogue sweeps run right after the parse.**
`src/hooks/useAppData.js:101-124` (`dateBounds`) and `:134-137` → `bestFareWindow`
(`src/lib/runtime_pricing.js:921-946`) each walk every destination × every route × every fare
date key — ~300 K string comparisons apiece. Precompute a `meta.fare_calendar`
(`{min_out, max_ret, best_start_by_nights: {3:…, 7:…}}`) per origin slice in `sync-data.mjs`
and delete both. **150–400 ms of TBT on mobile.**

### 2.2 `activities_full.json` is 33 MB — the single biggest win

`src/planner/DayPlannerTab.jsx:523-528` fetches it in an **unconditional mount effect**: the
moment the Day planner tab is ever opened, all 33 MB downloads and parses (**a 4–8 second
main-thread freeze on a mid-range phone**), whether or not a plan is open. Someone planning
one day in one city downloads POIs for 3,865 cities / 157,775 items.

Field breakdown: `img` ~11 MB (full Commons thumb URLs with the filename repeated twice in the
same string), `wiki` ~4 MB (`https://en.wikipedia.org/wiki/<Title>`, derivable from `name`),
`name` ~3.5 MB, `lat`/`lon` ~5.7 MB. Median 47 items per destination, max 52.

**Do this:**

1. Shard to `public/poi/{destId}.json` — 3,865 files averaging 8.6 KB. The day planner fetches
   1–35 of them. **33 MB → 10–300 KB.** Build-side this is a copy of the
   `public/fares/{IATA}.json` block at `scripts/sync-data.mjs:120-147`; client-side, an
   in-memory `Map` cache next to `faresPromises` in `appData.js`.
2. For `explorePois` (`DayPlannerTab.jsx:2052-2092`, up to 34 towns), either fetch shards in
   parallel (HTTP/2 multiplexes fine) or emit a thin `public/poi_index.json` with only
   `{destId: [[lat,lon,cat,rate,name]…]}`.
3. Store `img` as the bare Commons filename and rebuild the thumb URL client-side
   (`src/lib/imageCredit.js` already knows the shape); store `wiki` as a boolean.
   **~15 MB off before any sharding.**
4. Drop the blanket mount effect — fetch on first *use*. `itemsForStop` already has a
   `limited: true` fallback at `:560-565`.

---

## 3. SEO — from 1 indexable page to ~20,000

This is the largest growth lever in the product and it currently returns zero.

### 3.1 What was true before §0

No `robots.txt`, no `sitemap.xml`, no prerendering, no canonical, no OG/Twitter, no JSON-LD,
**zero `document.title` calls anywhere in `src/`**. §0 fixed the static shell. The structural
problem remains.

### 3.2 The router throws the URL away

Nine near-identical hash readers (`src/lib/dossier.js:83`, `beaches.js:144`, `lakes.js:144`,
`mountains.js:145`, `trails.js:146`, `cycling.js:219`, `trips.js:204`, `regions.js:228`,
`community/guides.js:185`) each end with:

```js
window.history.replaceState(null, '', window.location.pathname + window.location.search);
```

**The identifier is deleted from the address bar immediately after boot.** So:

- Google sees exactly one URL. Fragments are never sent to the server. 3,857 destinations,
  17,619 trails, 16,973 cycle routes, 4,849 regions are structurally unindexable.
- A visitor who copies the address bar after opening a destination shares the homepage.
- Vercel's SPA fallback serves 200 for every path, so `/anything` is a crawlable soft-404,
  and `useUrlSync` writes 24 filter params into the query string — an unbounded crawl surface.
  (The new `robots.txt` `Disallow: /*?` stops the bleeding.)

### 3.3 You are 80 % of the way there already

Every dossier carries a ready-made slug:

```
public/dossier/AGP.json → { "id":"AGP", "slug":"spain/malaga", "schema":"dossier_v2", … }
```

3,868 of 3,869 files have one; **3,857 unique slugs across 43 countries**. Each also holds
`place.name/country/lat/lon`, `verdict.score/label`, `intro.body` (a 700+ char Wikivoyage
lead), `gallery[].url`, `highlights`, `do`, `when`, `practical`, `credits`, `built_at`, and
`nearby`/`around`/`routes`/`trips` cross-links.

**Blocker:** 11 duplicate slugs must be disambiguated in the pipeline first —
`italy/lampedusa` (`LMP.json` + `gem-lampedusa.json`),
`france/aubeterre-sur-dronne` (`gem-aubeterre-sur-dronne-fr.json` + `gem-aubeterre-sur-dronne.json`),
and 9 more of the same `-{cc}` suffix collision. Fix in `pipeline/dossier/build_dossier.py`.

### 3.4 Migration

**Stage 2 — real paths, client-side (3–5 days).**

- One `src/lib/router.js` replacing the nine readers. Route shape:
  ```
  /d/{country}/{city}   3,857     /beach/{cc}/{slug}   3,001
  /lake/{cc}/{slug}     1,884     /mountain/{cc}/{slug}  955
  /trail/{cc}/{id}-{slug}        17,619
  /cycle/{cc}/{id}-{slug}        16,973
  /trip/{id}            5,866     /journey/{id}          253
  /region/{id}          4,849     /{country}              43
  ```
- **Stop calling `replaceState` to strip the identifier.** `pushState` the path on every
  navigation so back/forward and address-bar sharing work.
- Keep the `#dest=`/`#beach=` readers as a one-shot redirect to the new path, so old shared
  links survive.
- Add `useDocumentHead(title, description, canonical)` — ~30 lines — driven off the already-
  loaded record. This fixes browser tabs, bookmarks and history independently of SEO.
- Add `"rewrites": [{"source":"/(.*)","destination":"/index.html"}]` to `vercel.json` so the
  SPA fallback is a deliberate contract rather than a preset accident.

**Stage 3 — prerendered static HTML (1–2 weeks). This is the actual lever.**

No SSR, no framework migration. Vercel serves anything in `dist/` as a static file, and a
static file wins over a rewrite. Add `scripts/prerender.mjs`, run as
`"build": "vite build && node scripts/prerender.mjs"`. For each item:

1. Read the layer JSON already in `public/`.
2. Write `dist/d/spain/malaga/index.html` — the built shell with a rewritten head: real
   `<title>`, `<meta description>` from `intro.body` truncated to ~155 chars, canonical,
   full OG/Twitter using `gallery[0]` as `og:image`, and JSON-LD.
3. Inject a static content block: `<h1>`, the intro paragraph, the highlights list, and —
   critically — **internal links to `nearby`/`around`/`routes`/`trips`**. Without them, 20,000
   orphan pages index shallowly and slowly no matter how good the sitemap is.
4. The SPA boots on top and hydrates. No behaviour change for users.

JSON-LD per type: `TouristDestination` (+`geo`), `Beach`/`BodyOfWater`/`Mountain`,
`TouristTrip` with `itinerary`, `Trail`/`Route`, and `BreadcrumbList` on everything.

**Sizing:** 54,000 × ~6 KB ≈ 320 MB in `dist/` — Vercel's deployment limits will bite.
Either prerender the high-value tail only (destinations + regions + trips + beaches + lakes +
mountains + journeys ≈ **20,665 pages ≈ 120 MB**, leaving trails and cycling to a later stage),
or use a Vercel Edge Function that matches `/d/:country/:city`, fetches the dossier from the
same deployment, injects the head and streams the shell — one invocation per crawl, zero build
-size pressure.

**Sitemaps:** generate in the same script. An index at `/sitemap.xml` over per-layer files
(50,000 URL / 50 MB caps), using each item's `built_at` as `<lastmod>`.

---

## 4. Correctness bugs

Ranked by user-visible impact. All still present.

### 4.1 `rowCount` has no arm for cycling or composed itineraries
`src/browse/DestinationsTab.jsx:2227-2255`

```js
const rowCount = cat === 'general' ? destRows.length
  : isBeachCat ? (beachRows?.length ?? 0)
    : isLakeCat ? (lakeRows?.length ?? 0)
      : isMountainCat ? (mountainRows?.length ?? 0)
        : (tripRows?.length ?? 0);
```

Both fall through to `tripRows`, which is `null` when no country is picked ⇒ `rowCount === 0`.

- **Composed itineraries are permanently capped at 36 cards** and the sentinel scrolls forever
  loading nothing (the list renders from `itinRows`, gated at `:3548`, but the observer grows
  `visible` only while `visible < rowCount`).
- **The filter sheet on Cycling renders `t('filter.showNone')` — "show no results" — with
  hundreds of routes behind it** (`resultCount={rowCount}` at `:3720`).

Fix: add `isCycleCat` and `isItinCat` arms.

### 4.2 The cycling list has no pagination at all
`:3404, :3421, :3441` each `.slice(0, Math.max(visible, 60))` and there is **no sentinel
element** in the cycling block. 60 cards mount on first paint regardless of viewport, and a
country with 300 routes shows 60 with no way to reach the rest.

### 4.3 Five filter groups don't reset the scroll window
`:2232-2236` — the reset effect's deps omit `grades`, `climbs`, `shapes`, `hls`, `suits`
(the trail filters at `:1039-1043`), `itinDays`, `itinPace`, `itinScale`, `cycleFacets`,
`cycleSort`, `cycleShowLocal`. Tick a filter after scrolling to 300 trails and you keep 300
slots of a 4-row result, mid-page.

### 4.4 A failed fetch reads as "nothing published", and never retries
Every layer loader swallows errors (`src/lib/beaches.js:34`, `lakes.js:35`, `mountains.js:37`,
`trails.js:33`, `trips.js:46`, `cycling.js:56` — all `.catch(() => null)`) and every consumer
coerces to `[]`:

```js
// DestinationsTab.jsx:1806
Promise.all([loadBeachIndex(), loadTopBeaches()]).then(([idx, top]) => {
  setTopBeaches(top || []);   // a dropped connection becomes []
```

The guard is `if (!isBeachCat || topBeaches) return;` and `[]` is truthy, so **the tab never
retries for the life of the session** and renders "no beaches match" — a factually wrong claim
about the catalogue. Repeats at `:1890`, `:1996`, `:2107`, `:2119`, `:1216`, `:1690`.

Fix: distinguish `null` (nothing published) from a thrown network error, keep a per-layer
`error` state, render a retry. `:1424-1430` already does this correctly for geolocation.

### 4.5 Unguarded field access in `ItinCard`
`:946` `tr.score.toFixed(1)` and `:987` `tr.cost.per_day_eur` — every other card in the file
guards. One malformed trip row takes the tab down through the error boundary.

### 4.6 `RegionPage` renders a blank shell, and its clipboard `catch` is dead
`src/browse/RegionPage.jsx:141-147` — `navigator.clipboard.writeText()` rejects
*asynchronously*, so the synchronous `try` never fires: the button says "Copied" on a
permission denial and the rejection is unhandled. Make it `async`/`await`.
Separately, `data` starts `undefined` ⇒ the page renders a back button and nothing else during
the fetch. Only `data === null` gets a message.

### 4.7 `AnchorLegRow` is a component defined inside the render body
`src/planner/TripPlannerTab.jsx:515-521`. A new component *type* every render ⇒ React unmounts
and remounts that subtree, losing DOM state, on every render of the trip planner. Hoist it.

### 4.8 `supersededIds` drives a converging effect loop
`src/planner/DayPlannerTab.jsx:152-164` — the memo computes ids, an effect mutates the store,
which notifies → new `discovered` → new `supersededIds` → effect fires again. It converges
today only because `removeDiscovered` early-returns (`discoveredStore.js:82`), and each pass
re-runs a 3,868-record haversine scan. Compute the removal set once, guard with a ref.

### 4.9 Render-phase mutation in `DestinationPage`
`src/browse/DestinationPage.jsx:~700` — `doShown` is mutated inside a `.filter` predicate
during render, threaded across three buckets. Works today; bucket-order dependent. Flatten,
`slice(0, DO_LIMIT)`, regroup.

### 4.10 Smaller
- `src/planner/dayDraft.js:967` — `pickIdx.filter(i => !withCoords.includes(i))`, O(n²). Same
  mistake at `DayPlannerTab.jsx:168` where it matters (`.includes` inside a 3,868 loop). Use `Set`.
- `dayDraft.js:353-420` `poiDupeGroups` is all-pairs; safe at 52 items/dest but runs once per
  town for up to 34 towns. Add an `if (n > 300) skip` guard.
- `GuidedTripWizard.jsx:1067` `nightlyCache` is an unbounded `useRef(new Map())`.
  `src/lib/dates.js:24` already bounds its cache at 20,000 — copy that.
- `DayPlannerTab.jsx:2056` and `:2374-2400` shadow the i18n `t` with a loop variable
  (`const t2 = t; // the town loop below shadows t`); the memo at `:2400` still lists `t` in
  its deps while the body uses `t2`. Rename the loop variable.
- Stray `setTimeout`s with no cleanup: `DayPlannerTab.jsx:1796, 1828, 1839, 1857`,
  `TripPlannerTab.jsx:499`, `TripItinerary.jsx:404, 911`, `useTripPlanner.js:846`.

---

## 5. Runtime performance

### 5.1 The two planner tabs never unmount
`src/App.jsx:882-918` keeps both alive behind `display:none` (`styles.css:14156`). Neither is
`React.memo`'d and both receive fresh inline closures plus a `data` prop, so **every** `App`
re-render — a lifestyle slider, a search keystroke — re-renders both 3,000-line components.
Up to **four live MapLibre WebGL contexts** coexist (ExploreMap, TripMap ×2, DayExploreMap).

Fix: `React.memo` both tabs, `useCallback` every callback prop in `App`, pass
`data.destinations` (stable) rather than `data`.

### 5.2 Nothing in the browse surface is memoized
`DestinationsTab.jsx:415 DestCard`, `:527 TripCard`, `:630 CycleCard`, `:674 CycleTourCard`,
`:711 BeachCard`, `:756 LakeCard`, `:806 MountainCard`, `:861 CountryCard` — only `ItinCard`
(`:920`) is wrapped. The tab holds ~45 pieces of state; the search input is deliberately
un-debounced (`:1191`, correct), so **every keystroke re-renders all 36–80 mounted cards** and
their `HeroImage`/`RatingBadge`/`CountryFlag` subtrees.

Also `:1338` `askCover` is a fresh arrow every render, and `CountryCard:861` has
`useEffect(…, [img, onAskCover, cc])` — 40+ effect teardown/setup cycles per keystroke.
Wrap it in `useCallback([])`.

### 5.3 Full-catalogue scans on the hot path

| Location | What it does | Trigger |
|---|---|---|
| `DayPlannerTab.jsx:1865-1874` | maps 3,868 destinations then `.sort(localeCompare)` — `Intl` collation, 150 ms+ on mobile | any `discovered` change |
| `:152-163` | 3,868 × `discovered` haversine, plus `.includes()` inside the loop | any `data`/`discovered` change |
| `:1937-1961`, `:2014-2043`, `:1876-1895`, `:2478-2493` | four more full scans with haversine | various |
| `GuidedTripWizard.jsx:1282-1287` | `Object.entries(destinations)` + filter, **not memoized** | every keystroke while `staySearch` is set |
| `:1260-1279` | maps+filters+sorts every city of every selected country, **not memoized** | every render |
| `:1374-1381` | `cityCompanions()` = a full 3,868 haversine scan **per included city** (5 stops = 19,340) | every recompute |
| `useTripPlanner.js:698-706` | `cheapestStartDates` prices `combineTripLegs` once per stored fare date (~77–180) | every `stops`/`groupSize`/`tripStart` change |
| `:329-340`, `:708-714` | two more full scans | every nights edit |
| `App.jsx:633-636`, `useDestinationSearch.js:70-127` | `computeCosts` + `composeTrip` over 3,868 records, keyed on `choices` — **a new object on every lifestyle slider tick** | every slider frame |

None of these is debounced; several fire together on a single `+` on a nights stepper.
Debounce `choices`, and memoize the values marked "not memoized".

Note `DayPlannerTab.jsx:1742` (`addSuggestions`) is a `useMemo` depending on `gapIdeas`, which
is a fresh array every render — the memo **can never hold**. Same shape at `:1267`. These are
dead code pretending to be optimizations, which hides the real cost.

### 5.4 Synchronous `localStorage` writes on every keystroke
`useTripPlanner.js:131-142` — a single effect with **20 dependencies** calls
`JSON.stringify` + `localStorage.setItem` synchronously on every keystroke and every nights
tick, on the same turn as §5.3's recomputations. `useUrlSync.js:17` already has the 300 ms
debounce pattern — reuse it.
Also `dayPlanStore.js:139-161` stringifies each plan **twice** per write, and
`:101-113` iterates the entire `localStorage` keyspace twice per sync merge.

### 5.5 No virtualization anywhere
`PAGE = 36` (`DestinationsTab:114`), `48` (`ExploreTab:58`), `60` (`ResultsList:19`). The
infinite scroll only ever *grows* `visible`. Scroll Spain's beaches and 500+ photo cards stay
mounted, each reconciled on every unmemoized re-render.

Cheap win: `content-visibility: auto; contain-intrinsic-size: <card height>` on
`.places-dcard` / `.places-bcard` / `.places-icard`. Proper fix: `react-window`.

### 5.6 `packRows` reflows the mosaic on every page
`ExploreTab.jsx:110-143` + `:453` — `packed = packRows(taxRows.slice(0, visible))` re-runs over
all 96 items when `visible` goes 48→96, and the algorithm widens the row's last card to close a
ragged row (`out[out.length-1].span += remainder`). **Already-rendered cards change width as
you scroll.** Pack incrementally, memoize per page.

### 5.7 `ExploreMap` re-serializes the whole filtered set
`src/browse/ExploreMap.jsx:41-61`, fed the *unwindowed* `taxRows` — up to 3,868 fresh nested
features rebuilt on every filter change. Build the collection once from `all` and express the
filter as a maplibre `filter` expression on the layer.

### 5.8 Images: three of six layers never got the srcset fix
`src/components/HeroImage.jsx` does it right (`srcSet`, `sizes`, `loading`, `decoding`,
intrinsic `width`/`height`) and is used by `DestCard`, `CountryCard`, `ExploreCard`, `MiniCard`.

But `BeachCard:715`, `LakeCard:760`, `MountainCard:810`, `CycleCard:641`, `CycleTourCard:682`,
`TrailPicture:493` all do a bare `<img src={shot.u} alt="" loading="lazy" />` — no `srcSet`, no
`sizes`, no dimensions — despite `src/lib/heroImage.js` exporting `srcSetFor(url, max)` and its
own docblock describing this exact bug ("the grid was downloading three to five times the bytes
it drew"). The full-size gallery shots at `BeachPage.jsx:295`, `LakePage.jsx:262`,
`MountainPage.jsx:301` have no dimensions either — guaranteed CLS on open.

Route every card image through `HeroImage`.

---

## 6. Architecture

### 6.1 `DestinationsTab.jsx` — 3,729 lines, ~45 `useState`, 7 categories
Lines 1006-1206 are an uninterrupted wall of state. One component owns seven category models,
six data-loading lifecycles, six facet models, geocoding, geolocation, seven deep-link types,
the search popover, desktop/phone chrome, pagination and eight overlay pages.

The seams are already marked by the file's own `── Beaches ──` / `── Lakes ──` banners, and
each block is the *same* shape: index state, top state, country→rows map, listed map, loading
flag, `queryCountry` memo, `wantCountry` derivation, fetch effect, `rows` memo, `counts` memo,
deep-link effect. ~200 lines repeated four times with the nouns swapped.

Extract `usePublishedLayer({ active, loaders, facets, nearPlace, q, country, countryName })`
→ `{ rows, counts, index, loading, listed, wantCountry, absentCountry }`. Four call sites
replace ~800 lines. Then split the JSX into `BeachList`, `LakeList`, `MountainList`,
`CycleList`, `ItinList`, `TripList`.

### 6.2 `BeachPage` / `LakePage` / `MountainPage` are the same file three times
423 / 442 / 460 lines, of which roughly 300 each are identical: `fmtCoord`, `ImageCredit`, the
Escape effect, the `setShot(0)` reset, the 2,400 ms toast, the `titleGone` IntersectionObserver,
`onShare`, `.bpage-where`, `.bpage-gallery`, `.bpage-facts`, `.bpage-score`, `.bpage-base`,
`.bpage-sources`. `MountainPage` literally ships `className="tpage bpage lpage mpage"`.

Extract a `<FeaturePage>` shell. The genuinely different parts are small and already isolated:
`SeasonStrip` (Lake), `WayUp` (Mountain), the score disclosure (Beach).

### 6.3 ~3,900 lines of dead files
Imported by nothing: `browse/FilterBar.jsx` (733), `browse/FilterSheet.jsx` (533),
`browse/DetailPanel.jsx` (458), `browse/DetailBreakdown.jsx` (643), `browse/BestTimePanel.jsx`
(229), `browse/ResultsList.jsx` (319), `browse/ComparePanel.jsx` (124), `map/MapView.jsx` (872).

Tree-shaken, so no bundle cost — but `ResultsList.jsx:15` still documents "~24,800
destinations" against a shipped 3,868, and there are now three sheet implementations
(`PlacesFilterSheet`, `ExploreFilterSheet`, dead `FilterSheet`), two of them live and
duplicating each other "down to the class names" by `PlacesFilterSheet`'s own admission.
Delete, then unify the two live sheets.

### 6.4 Dead code inside live files (eslint already flags it)
`npx eslint src` reports 133 warnings. In `DestinationsTab.jsx`: `:341 hasTag`,
`:363 applyChips` + `:375 chipCounts` (a 25-line model superseded by the per-layer facet
appliers; `chipCounts` has zero callers), `:2367 fromDefs`, three unused imports from
`cycleStory.js` at `:35` (one of which, `paceLine`, is re-imported as `cyclePaceLine` at `:38`),
`:55 suitabilityIsDerived`.

---

## 7. Accessibility

### 7.1 Seven `aria-modal="true"` overlays with no focus management
`BeachPage:212`, `LakePage:213`, `MountainPage:252`, `DestinationPage:428`, `TripPage:204`,
`JourneyPage:269`, `TrailPage:531`, `RegionPage:127/141`. Each binds Escape and nothing else:
no initial focus, **no focus trap**, no focus restoration, no `inert`/`aria-hidden` behind.
Tab out of the back button and you walk into the still-tabbable results list — while
`aria-modal` tells the screen reader everything outside is unreachable.

The correct implementation is already in the codebase: `PlacesFilterSheet.jsx:50-71` does
initial focus, a Tab cycle and `activeElement` restoration. Extract `useFocusTrap(ref, onClose)`
and apply it to all seven. `TripPage:204` and `RegionPage:127/141` additionally have **no
accessible name at all**; `CountryPage:102` has `role="dialog"` with no `aria-modal`.

### 7.2 The photo strip has unnamed tabs
`BeachPage:297-310`, `LakePage:264-277`, `MountainPage:303-316` — each `role="tab"` contains
only an `alt=""` image, so it has **zero accessible name**; a screen reader announces "tab,
selected" five times. A `tablist` also owes arrow keys, roving `tabindex` and `aria-controls`,
none of which exist. Either name them and add the keyboard model, or drop the tab roles.

### 7.3 The search popover is a listbox with no options
`DestinationsTab:2765-2814` — `role="listbox"` whose children are `<button>`, with a `<p>`
heading inside as a non-option child. The input (`:2744`) has no `role="combobox"`, no
`aria-expanded`/`aria-controls`/`aria-activedescendant`, and `onKeyDown` (`:2749-2752`) handles
only Enter and Escape — **no arrow keys**. A keyboard user gets the first suggestion or nothing.

### 7.4 Loading states are invisible to screen readers
Nine places (`DestinationsTab:3054, 3151, 3248, 3361, 3520, 3575`, `JourneysSection:160, 199`)
render a bare `…` with no `role="status"`, no `aria-live`, no `aria-busy`. The empty states
that replace them in place lack `role="status"` too. The only live region in the whole file is
`:2942`.

### 7.5 Hardcoded English in a six-language app
`src/components/Icons.jsx` has **14 hardcoded `aria-label`s** (`"Dates"`, `"Day planner"`,
`"Destinations"`, `"Explore"`, `"Filters"`, `"Great stop"`, `"Guest"`, `"Home"`, `"Map"`,
`"More"`, `"Plan"`, `"Saved trips"`, `"Trip planner"`, `"Worth a look"`), 19 of them with
`role="img"`. A French reader hears English *inside* a button that already has a French label.
These are decorative next to text — give them `aria-hidden="true"`.
Also `DestinationPage:163,172,176` and `RegionPage:130,144` (`aria-label="close"`, lower-case).

### 7.6 The zero-count chip rule contradicts itself
`DestinationsTab:2456-2500` *drops* zero-count options for beaches and lakes, with a long
comment explaining why a disabled chip "still reads as something that ought to work".
`:2502-2521` (mountains) and `:2372` (place sizes) do the opposite. Same rail, two behaviours.

### 7.7 `CardPreview` is invisible to screen readers
`ExploreTab:159` is `role="tooltip"` but nothing references it. Its content — country rank,
sights, visit length, cost receipt — never reaches assistive tech. Add `aria-describedby` on
`xcard-hit`.

---

## 8. CSS

`src/styles.css`: 31,933 lines / 1,016,942 B · 6,836 rules · 7,213 selector entries ·
26,076 declarations · 3,775 unique classes · 189 `@media` · 40 `@keyframes` · 33 `!important` ·
212,489 B (21.2 %) comments (high-quality rationale — **do not strip them**, the minifier
already does).

**Tokens are in good shape:** 39 custom properties in one `:root`, **5,910 `var()` uses vs 389
hardcoded hex and 303 rgb/rgba literals — ~90 % tokenised.** Dark mode is a documented
deliberate omission (`styles.css:55-59`), and because the whole palette is one `:root` block,
adding it later is a ~60-line addition rather than a rewrite. 36 `prefers-reduced-motion`
blocks — keep those.

**Where the bytes go**, attributed by which `src/` directory references each class:

| Owner | Bytes | % |
|---|---:|---:|
| `browse/` | 210,435 | 21.0 |
| `planner/` | 194,286 | 19.4 |
| **unreferenced** | **115,330** | **11.5** |
| `auth/` | 82,119 | 8.2 |
| `components/` | 48,986 | 4.9 |
| `map/` | 24,116 | 2.4 |
| `admin/` | 21,993 | 2.2 |
| shared / element / keyframes | 298,905 | 29.8 |

**C1 — 686 dead classes, ~115 KB.** Largest: `.single-range` (1,445 B), `.guide-path`,
`.mini-toggle`, `.more-btn`, `.admin-search`, `.more-panel`, `.day-activity-row`,
`.xp-hero-card`, `.map-guide-toggle`, `.weather-control`, `.explore-filter-btn`.
Verify against template-literal class names (`` `day-tier-${n}` ``) before deleting; the
top-30 read like removed features. `tests/explore.spec.mjs` baselines are the safety net.

**C2 — 147 selectors declared more than once** in the same at-rule context (155 redundant
declarations). Worst: `.app-header` ×3, `.day-activity-row` ×3, `.day-tier` ×3,
`.explore-wrap` ×3, `.tierlegend-why` ×3. Each is a cascade landmine — editing the first has
no effect and the developer concludes the selector "doesn't work".

**C3 — split it.** 240,395 B (24 %) belongs exclusively to surfaces that are *already* lazy JS
chunks (`planner/` 194 KB, `map/` 24 KB, `admin/` 22 KB), yet Vite emitted 28 JS chunks and
one CSS file. Split into `src/styles/{base,browse,planner,auth,map,admin}.css`, each imported
from its owning component root so Vite code-splits the CSS alongside the JS.
**Projected: 629 KB → ~430 KB raw, ~99 KB → ~67 KB gzip on the critical path**, zero visual
change. (§0 already got the maplibre 65 KB out this way.)

**C4 — no spacing/type/radius scale.** 8,699 raw `px` literals vs 9 `rem`; 1,903 hand-written
`font-size`s and 1,319 hand-written `gap`s. "Tighten vertical rhythm by 2px" is a 1,300-site
find-and-replace. Add `--space-1…8`, `--text-xs…3xl`, `--radius-sm/md/lg`.

**C5 — 41 media queries, badly clustered.** The mobile split is `768/769`, but `720`, `700`,
`719`, `721`, `760` also exist — five near-identical values within 61 px. Same for
`880/881/899/900/910`. Consolidate to a documented five-step scale.

---

## 9. Monetisation and conversion

The entitlement architecture is genuinely good and needs no rework: `useEntitlement.js:43`
reads one `ai_status` RPC and documents itself as "a HINT, never a gate"; `checkout.js:23`
sends only a tier id with amounts resolved server-side; `paywallEvents.js:5` explicitly refuses
to let a client claim a purchase; `auth/admin.js` routes everything through `SECURITY DEFINER`
RPCs. The three affiliate builders (`affiliate.js`, `omio.js`, `activityAffiliates.js`) are
correct and locked by verify scripts.

The problems are all "built but not switched on".

### 9.1 The Travelpayouts Drive script is CSP-blocked in production
Live console:
```
Connecting to 'https://www.travelpayouts.com/check_auth' violates … connect-src
[tp] check_auth request failed  TypeError: Failed to fetch
```
The link switcher never initialises. **Fixed in §0**; verify after deploy that `[tp] bb init`
is followed by a successful `check_auth`.

### 9.2 The activity-booking revenue stream is wired, tested and earning nothing
`VITE_GYG_PARTNER_ID` and `VITE_VIATOR_PID` are **absent from `.env`** — only `VITE_TP_MARKER`
and `VITE_OMIO_TRACKING_LINK` are set. `src/lib/activityAffiliates.js` correctly host-scopes
and decorates GetYourGuide/Viator links across all 3,857 destination pages, on the
highest-intent click in the product. Two env vars in Vercel. **Cheapest revenue fix here.**

### 9.3 No accommodation affiliate exists
Nothing in `src/lib/` builds a stay link, though `dossier.sleep` and stay tiers are already
surfaced. For a travel-content site this is typically the largest line item.

### 9.4 The funnel has no top
`trackPaywall('shown', …)` fires only when the modal opens, with no surface dimension
(deliberately, per `paywallEvents.js:14`) and no session id. `admin_paywall_funnel` can answer
"which gate reason converts" but not "which gate is *reached*", "how many sessions see a gate",
or "does an exporter convert better than a sharer". Add a coarse non-identifying `surface`
string (`'trail_gpx'`, `'day_pdf'`, `'trip_share'`) to the existing RPC — one migration, one
argument, no PII.

### 9.5 `PassModal` loses the tier through sign-in
`src/components/PassModal.jsx:58` — `if (!signedIn) { onSignIn?.(); return; }`. A free user
hits a gate → picks a tier → the modal closes, an auth modal opens → after sign-in they are
back where they started with no memory of the choice. Three modals with a lossy hand-off at
the highest-intent moment. Carry the tier through and resume checkout.
Also `REASON_COPY` (`:19`) has no `browse` entry, so opening prices *deliberately* from the
header — the one path where the user is shopping — gets the coldest fallback copy.

### 9.6 The entry gate (changed in §0)
The app opened on a full-screen sign-in takeover before any content: a login wall in front of a
browse product, and the first thing a crawler saw. Now gone from cold starts. Watch bounce rate
and sign-up rate together after deploy — the expectation is bounce down, and sign-ups roughly
flat or up, because the ask now lands at the moment someone wants to save something.

---

## 10. Build, CI, ops

### 10.1 19,825 lines of verification that never runs
`scripts/` holds **75 `verify_*.mjs` scripts**, 71 Playwright-driven — `verify_paywall.mjs`
statically cross-checks reason codes across `usePaywall.jsx`, `PassModal.jsx`, every call site
and all six locale files. Exactly one was wired into `package.json`, and there is **no
`.github/`, no CI of any kind**. `tests/` has 2 files and there was no `test` script.

§0 added `test` / `verify` / `ci`. Still to do: a `.github/workflows/ci.yml` running
`npm run ci` on push/PR, with the Playwright suite nightly.

### 10.2 No bundle budget, no Lighthouse gate
Add `size-limit` in CI with budgets — `index.js ≤ 280 KB gz`, `index.css ≤ 70 KB gz` after the
CSS split — and `treosh/lighthouse-ci-action` against the Vercel preview URL asserting on LCP
and TBT. `tests/explore.spec.mjs` already documents the "run against the preview before
promoting" workflow; automate it.

### 10.3 Service worker
§0 fixed the duplicate `clients.claim()`, the stale strategy comment, and the 33 MB
`activities_full.json` cache entry. **Remaining:** `CACHE_VERSION` is bumped by hand, and
`activate` only deletes caches whose key ≠ the current one — so `cacheFirst` adds ~4 MB of new
hashed assets per deploy and evicts nothing. After 10 deploys that is ~40 MB of dead chunks.
Derive the version from the build (`define: { __BUILD_ID__ }` in `vite.config.js`).

### 10.4 Preload credentials mismatch — verify, don't assume
`index.html` declares `<link rel="preload" as="fetch" crossorigin="anonymous">` (credentials
*omit*) while `src/lib/appData.js:15-20` calls plain `fetch()` (credentials *same-origin*). In
theory Chrome refuses to reuse the preload and issues a second 13 MB request. **Live resource
timing shows only one network fetch of `app_data.json`**, so this is not currently firing — but
it is one refactor away from doing so. Adding `{ credentials: 'omit' }` to `fetchJson` costs
one word and removes the risk.

### 10.5 Hygiene
`du.exe.stackdump` (1,012 B) is in the project root. `.env` is now gitignored — **rotate
nothing** (all four values are public-by-design and ship in the bundle), but never add a
service-role or Stripe secret to it.

---

## 11. Sequenced roadmap

**Week 1 — ship what is already done, plus the free wins**

1. Deploy §0. Confirm in production: `Cache-Control: immutable` on `/assets/*`, `[tp] check_auth`
   succeeds, `?paymock` no longer unlocks anything, `/robots.txt` and `/sitemap.xml` return 200.
2. Set `VITE_GYG_PARTNER_ID` + `VITE_VIATOR_PID` in Vercel (§9.2).
3. Replace `og:image` with a real 1200×630 card.
4. Fix §4.1–4.3 — the pagination bugs. ~1 hour, unbreaks two whole categories.
5. `.github/workflows/ci.yml` running `npm run ci` (§10.1).

**Weeks 2–3 — the data payload**

6. Shard `activities_full.json` → `public/poi/{destId}.json` and compress `img`/`wiki` (§2.2).
   **33 MB → 10–300 KB**; removes a 4–8 s mobile freeze.
7. Split `app_data.json` into `app_core.json` + `dest_detail/{iso2}.json`; drop the 9 dead
   fields; precompute `meta.fare_calendar` (§2.1). **2.18 MB gz → 0.52 MB gz**, −60 % boot parse,
   −150–400 ms TBT.
8. `React.memo` the planner tabs and the 7 card components; `useCallback` the callback props;
   debounce `choices` and `persistTripDraft` (§5.1, 5.2, 5.4).

**Weeks 4–5 — routing and indexability**

9. Fix the 11 duplicate dossier slugs in `pipeline/dossier/build_dossier.py` (§3.3).
10. `src/lib/router.js`, real paths, `pushState`, `useDocumentHead`, hash→path redirects (§3.4 Stage 2).

**Weeks 6–8 — the growth lever**

11. `scripts/prerender.mjs`: static HTML + JSON-LD + internal link graph for ~20,665 pages,
    plus a real sitemap index (§3.4 Stage 3). **1 → 20,000 indexable pages.**

**Ongoing, in parallel**

12. Delete the 686 dead CSS classes and the 3,911 dead JS lines; split `styles.css` (§8, §6.3).
13. `useFocusTrap` across the seven overlays; combobox semantics on search; `aria-hidden` the
    14 English icon labels (§7).
14. Extract `usePublishedLayer` and `<FeaturePage>` (§6.1, §6.2) — ~1,700 lines of duplication.
15. `srcSetFor` + intrinsic dimensions on the beach/lake/mountain/cycle/trail cards (§5.8).

---

*Prepared from the live deployment and the working tree at `continent-app/`. Where a claim came
from reading code rather than measuring, it is phrased as such.*
