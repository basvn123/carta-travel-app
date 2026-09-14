# Category UI plan: wiring the natural-features wire into the Destinations tab

Status: ready to apply. Written 2026-08-17 against `continent-app/public/features/`
generated at `2026-08-17T16:34:06Z` (5,472 features, tiers 1 and 2).

This document is the whole change. An engineer should be able to apply it without
re-deriving anything: every predicate, every diff site, every string and every rule
is stated. Nothing in `continent-app/src` is edited by this document.

---

## 0. Why, in numbers

The Beaches tab and the Mountains tab do not contain beaches or mountains. They
contain trips whose *nearest catalogue town* happens to be tagged a certain way.
`continent-app/src/lib/trailCards.js:76-83`:

```js
export function tripThemes(tr, assocDest) {
  const cats = assocDest?.categories || [];
  const themes = new Set();
  if (matchesAnyKind(cats, ['beach']) || cats.includes('coast')
    || assocDest?.beauty?.top_beach) themes.add('beach');
  if (matchesAnyKind(cats, ['mountains']) || (tr.ascent_m ?? 0) >= 600) themes.add('mountains');
  return themes;
}
```

Re-measured against the shipped wires today, replicating the function exactly:

| Claim | Measured |
|---|---|
| Beaches tab items | 148 |
| admitted by the `coast` tag alone, with no beach evidence | **72 of 148** |
| Mountains tab items | 311 |
| admitted by `ascent_m >= 600` alone, with no mountain tag | **167 of 311** |
| countries whose Beaches card opens an empty list | **18 of 43** |
| countries whose Mountains card opens an empty list | 2 of 43 |

The 18: AD, AT, BA, BE, CH, CZ, HU, IS, LI, LU, LV, MD, NL, RO, RS, SK, UA, XK.
Five of those (AT 17, BE 13, CH 15, HU 23, NL 39) have real beaches in the new
wire and get a working tab out of this change.

The new wire, measured:

| | |
|---|---|
| features shipped | 5,472 (2,177 beaches, 3,295 mountains) |
| countries with a file | 43, one file each plus `index.json` |
| total bytes | 2.18 MB, largest file `IT.json` at 338 KB |
| rows with a photo | 2,766 of 5,472 (**49.5 % have none**) |
| rows whose `near.dest_id` resolves in `app_data.json` | **5,472 of 5,472** |
| distance to that destination | median 4.0 km, p90 7.8 km, max 19.4 km |
| beaches with a bathing water class | 2,089 of 2,177 (Excellent 2,005, Good 75, Sufficient 9) |
| mountains with an elevation | **0 of 3,295** (see section 8) |
| countries with zero beaches | 12: AD, BA, CZ, FO, IS, LI, MD, MK, RS, SK, SM, XK |
| countries with zero mountains | 0 |

Two shape facts that drive the code below:

- The features index and the country files cannot disagree. `export_features.py`
  derives `index.json` counts from the same payload it writes to disk
  (`export_features.py:277-283`), unlike the trails index, which is where the
  counting bugs in section 3 come from.
- The features wire covers FO and SM, which the trails wire does not; the trails
  wire covers TR and UA, which the features wire does not. The Beaches and
  Mountains country index must therefore come from the **features** index, not
  from `trailsIndex`.

---

## 1. `continent-app/src/lib/features.js`, in full

New file. Paste as is.

```js
/**
 * features.js, the natural-features layer: Europe's beaches and summits as
 * entities of their own rather than a guess about the nearest town.
 *
 * Two artifacts, written by pipeline/features/export_features.py:
 *   /features/index.json   which countries have how many of each kind, and the
 *                          top-ranked name of each, so a country card can be
 *                          drawn without fetching the country
 *   /features/{CC}.json    that country's ranked beaches and summits: position,
 *                          nearest priced destination, bathing water class,
 *                          designations, and a licensed photo when one exists
 *
 * Why this file exists: the Beaches and Mountains tabs used to infer membership
 * from the nearest catalogue town's tags, which filed Hamburg in a day under
 * Beaches (the town carries the coast tag) and the sea-level South West Coast
 * Path under Mountains (600 m of cumulative ascent spread over 1,014 km). A
 * beach is now a beach because the row says kind: "beach".
 *
 * Repo gotcha this file exists to contain, the same one trails.js carries and
 * the same one export_features.py's docstring warns about: under public/ a
 * missing JSON is served as the SPA's index.html with status 200, so r.ok is
 * true and r.json() throws on "<!doctype". Every fetch here checks the content
 * type first and resolves null instead. A missing file is a missing file.
 *
 * Nothing here invents a value. A row without a photo has no photo, a summit
 * without an elevation has no elevation, and the UI states that rather than
 * borrowing something that looks like it.
 */
import { useEffect, useState } from 'react';

const COUNTRY_RE = /^[A-Z]{2}$/;

/** The only two kinds the wire ships. A third kind added upstream must not
 *  silently land in one of these tabs, so unknown kinds are dropped here and
 *  the tabs ask for a kind by name (never "everything that is not a beach"). */
export const FEATURE_KINDS = ['beach', 'mountain'];
const KIND_SET = new Set(FEATURE_KINDS);

/** Bathing water class -> the app's existing i18n keys and badge slugs. */
export const WATER_KEY = {
  Excellent: 'water.excellent',
  Good: 'water.good',
  Sufficient: 'water.sufficient',
  Poor: 'water.poor',
};

/** Formal designations the wire ships. natura2000 is deliberately absent: the
 *  exporter withholds it because it is inferred from OSM's protect_class, and a
 *  designation is a legal fact or it is nothing. */
export const DESIGNATION_KEY = {
  unesco: 'places.desigUnesco',
  national_park: 'places.desigNationalPark',
  natural_monument: 'places.desigNaturalMonument',
  wilderness: 'places.desigWilderness',
};

/** True when the response is really JSON and not the SPA fallback page. */
function isJson(res) {
  return res.ok && (res.headers.get('content-type') || '').includes('json');
}

function loadJson(url) {
  return fetch(url)
    .then((r) => (isJson(r) ? r.json() : null))
    .catch(() => null);
}

// Cached per URL: these files never change inside a session, and the Beaches
// and Mountains tabs read the same country file.
const cache = new Map();

function cached(url) {
  if (!cache.has(url)) cache.set(url, loadJson(url));
  return cache.get(url);
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * One wire row in the app's own shape. Returns null for a row that cannot be
 * drawn, which is a dropped row rather than a rendered blank: an unknown kind
 * would land in the wrong tab, and a NaN coordinate blanks the whole map the
 * moment the row reaches setLngLat (see src/map/coords.js).
 */
function normaliseFeature(raw, bathingYear) {
  if (!raw || !raw.id || !KIND_SET.has(raw.kind)) return null;
  const lat = num(raw.lat);
  const lon = num(raw.lon);
  if (lat === null || lon === null) return null;
  const near = raw.near && raw.near.dest_id
    ? { destId: raw.near.dest_id, city: raw.near.city || null, km: num(raw.near.km) }
    : null;
  // thumb is the smaller Commons rendering when the exporter shipped one; the
  // card is 320 px wide and never needs the 960 px original.
  const image = raw.image && raw.image.url
    ? {
      url: raw.image.thumb || raw.image.url,
      author: raw.image.author || null,
      licence: raw.image.licence || null,
      licenceUrl: raw.image.licence_url || null,
      source: raw.image.source || null,
    }
    : null;
  return {
    id: raw.id,
    kind: raw.kind,
    name: raw.name || '',
    nameLocal: raw.name_local || null,
    lat,
    lon,
    tier: num(raw.tier),
    rank: num(raw.rank),
    score: num(raw.score),
    water: raw.water || null,
    // The bathing season is stated once per file, so a class on a card can
    // never be read as a claim about this summer.
    waterYear: raw.water ? (bathingYear ?? null) : null,
    elevation: num(raw.elevation),
    prominence: num(raw.prominence),
    designations: Array.isArray(raw.designations) ? raw.designations : [],
    wikipedia: raw.wikipedia || null,
    near,
    image,
  };
}

/**
 * Which countries have beaches and summits, with the counts the country cards
 * print. Resolves null when the layer has never been exported, so the tabs can
 * tell "no data" from "no beaches in Hungary".
 *
 * countries is a Map(ISO2 -> { beaches, mountains, topBeach, topMountain }).
 */
export function loadFeaturesIndex() {
  return cached('/features/index.json').then((raw) => {
    if (!raw || !raw.countries || typeof raw.countries !== 'object') return null;
    const countries = new Map();
    for (const [cc, v] of Object.entries(raw.countries)) {
      if (!COUNTRY_RE.test(cc) || !v) continue;
      countries.set(cc, {
        beaches: num(v.beaches) ?? 0,
        mountains: num(v.mountains) ?? 0,
        topBeach: v.top_beach || null,
        topMountain: v.top_mountain || null,
      });
    }
    if (!countries.size) return null;
    return {
      generatedAt: raw.generated_at || null,
      tiers: Array.isArray(raw.tiers) ? raw.tiers : [],
      nFeatures: num(raw.n_features) ?? 0,
      countries,
    };
  });
}

/**
 * One country's features. Resolves null when there is no file to read, and a
 * document with an empty features array for a country that has a file and
 * nothing above tier 3. Those are different states and the UI says different
 * things about them.
 */
export function loadFeatures(country) {
  const cc = String(country || '').toUpperCase();
  if (!COUNTRY_RE.test(cc)) return Promise.resolve(null);
  return cached(`/features/${cc}.json`).then((raw) => {
    if (!raw || !Array.isArray(raw.features)) return null;
    const bathingYear = num(raw.bathing_year);
    const features = raw.features
      .map((f) => normaliseFeature(f, bathingYear))
      .filter(Boolean);
    return {
      country: raw.country || cc,
      countryName: raw.country_name || null,
      generatedAt: raw.generated_at || null,
      bathingYear,
      // { key: { name, url } }, resolved once per file by the exporter so the
      // credit line can name its sources without repeating them 6,000 times.
      sources: raw.sources && typeof raw.sources === 'object' ? raw.sources : {},
      counts: {
        beach: features.filter((f) => f.kind === 'beach').length,
        mountain: features.filter((f) => f.kind === 'mountain').length,
      },
      features,
    };
  });
}

/** The rows of one kind, in the ranker's own order, best first. Never "all the
 *  rows that are not the other kind": an unknown kind belongs nowhere. */
export function featuresOfKind(doc, kind) {
  if (!doc || !KIND_SET.has(kind)) return [];
  return doc.features.filter((f) => f.kind === kind);
}

/** How many of one kind a country holds, straight from the index. 0 for a
 *  country the index does not carry, which is the honest answer for TR and UA:
 *  the features layer has not run for them. */
export function countryCount(index, cc, kind) {
  const row = index && index.countries.get(String(cc || '').toUpperCase());
  if (!row) return 0;
  return kind === 'beach' ? row.beaches : row.mountains;
}

/** "Kent Wang, CC BY-SA 4.0", or null when the row ships no photo. The licence
 *  travels with the picture: shipping a CC BY-SA image with no visible credit
 *  is a licensing incident, not a design choice. */
export function photoCredit(f) {
  if (!f || !f.image) return null;
  const parts = [f.image.author, f.image.licence].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** One country's features, or null while loading / when nothing is published.
 *  Nulls out immediately on a country switch so a stale list never shows under
 *  a new country's name. */
export function useFeatures(country) {
  const [doc, setDoc] = useState(null);
  useEffect(() => {
    let live = true;
    setDoc(null);
    if (country) loadFeatures(country).then((d) => { if (live) setDoc(d); });
    return () => { live = false; };
  }, [country]);
  return doc;
}

/** The index, fetched once. */
export function useFeaturesIndex() {
  const [index, setIndex] = useState(null);
  useEffect(() => {
    let live = true;
    loadFeaturesIndex().then((i) => { if (live) setIndex(i); });
    return () => { live = false; };
  }, []);
  return index;
}
```

---

## 2. `DestinationsTab.jsx`: the exact diff sites

Line numbers are from the file as it stands at commit `41485c8`. The audit quoted
`:394-396` for the country index; the block has since moved to `484-495`. Quote
blocks below are the current text, verbatim.

### 2.1 Imports, line 6-7

```js
import { loadTrails, loadTrailsIndex } from '../lib/trails.js';
import { associateTrip, haversineKm, tripCentre, tripKindKey, tripThemes } from '../lib/trailCards.js';
```

becomes

```js
import { loadTrails, loadTrailsIndex } from '../lib/trails.js';
import { loadFeatures, loadFeaturesIndex, DESIGNATION_KEY, WATER_KEY, photoCredit } from '../lib/features.js';
import { associateTrip, haversineKm, tripCentre, tripKindKey } from '../lib/trailCards.js';
import { RouteThumb } from '../components/RouteThumb.jsx';
```

`tripThemes` is deleted from `trailCards.js` in section 4. It has no other caller.

### 2.2 The component docstring, line 22-27

```
 * Five categories share one search, one country filter and one sort row:
 *   General    every priced place as a photo card, and a country index of
 *              flag cards when nothing is filtered yet
 *   Trips      composed city days from the content lab
 *   Trails     drawn hikes from the content lab
 *   Beaches    the beach-flavoured slice of both
 *   Mountains  the mountain-flavoured slice of both
```

becomes

```
 * Five categories share one search, one country filter and one sort row:
 *   General    every priced place as a photo card, and a country index of
 *              flag cards when nothing is filtered yet
 *   Trips      composed city days from the content lab
 *   Trails     drawn hikes from the content lab
 *   Beaches    the beaches of /features, ranked, one file per country
 *   Mountains  the summits of /features, same file, same ranking
 *
 * Beaches and Mountains used to be a flavour of the trip wire, decided by the
 * nearest town's tags: the coast tag alone put 72 of 148 Beaches items on
 * screen, and 600 m of cumulative ascent put the sea-level South West Coast
 * Path under Mountains. They now read a wire that knows what a beach is, and
 * they list features, not trips. The two lists cannot overlap.
```

### 2.3 State, line 242-244

```js
  const [trailsIndex, setTrailsIndex] = useState(null);
  const [countryTrips, setCountryTrips] = useState(null);
  const [trailsLoading, setTrailsLoading] = useState(false);
```

becomes

```js
  const [trailsIndex, setTrailsIndex] = useState(null);
  const [countryTrips, setCountryTrips] = useState(null);
  const [trailsLoading, setTrailsLoading] = useState(false);

  // Features data: the country index (how many beaches and summits each country
  // has), and the one country file the current selection needs. Kept apart from
  // the trails state so a tab fetches one wire, not two.
  const [featIndex, setFeatIndex] = useState(null);
  const [countryFeatures, setCountryFeatures] = useState(null);
  const [featLoading, setFeatLoading] = useState(false);
```

### 2.4 The index fetch, line 246-250

```js
  useEffect(() => {
    let live = true;
    loadTrailsIndex().then((idx) => { if (live) setTrailsIndex(idx); });
    return () => { live = false; };
  }, []);
```

becomes

```js
  useEffect(() => {
    let live = true;
    loadTrailsIndex().then((idx) => { if (live) setTrailsIndex(idx); });
    loadFeaturesIndex().then((idx) => { if (live) setFeatIndex(idx); });
    return () => { live = false; };
  }, []);
```

Both are one small file and both decide whether a country card is drawn, so both
are fetched at mount. `/features/index.json` is 5.1 KB; the country files are
fetched only when a country is picked, which is why `IT.json` at 338 KB never
loads for somebody browsing Norway.

### 2.5 Category predicates and the country fetch, line 270-282

```js
  const isTripCat = cat !== 'general';
  const trailsCountry = nearDest ? nearDest.iso2 : country;
  useEffect(() => {
    if (!isTripCat || !trailsCountry) { setCountryTrips(null); return undefined; }
    let live = true;
    setTrailsLoading(true);
    loadTrails(trailsCountry).then((trips) => {
      if (!live) return;
      setCountryTrips(trips || []);
      setTrailsLoading(false);
    });
    return () => { live = false; };
  }, [isTripCat, trailsCountry]);
```

becomes

```js
  // Three families, not two: General browses the catalogue, Trips and Trails
  // browse the trips wire, Beaches and Mountains browse the features wire. The
  // last two used to be a filter over the trips wire, which is the whole bug.
  const isTripCat = cat === 'trips' || cat === 'trails';
  const isFeatCat = cat === 'beaches' || cat === 'mountains';
  const isWireCat = isTripCat || isFeatCat;
  const wireCountry = nearDest ? nearDest.iso2 : country;

  useEffect(() => {
    if (!isTripCat || !wireCountry) { setCountryTrips(null); return undefined; }
    let live = true;
    setTrailsLoading(true);
    loadTrails(wireCountry).then((trips) => {
      if (!live) return;
      setCountryTrips(trips || []);
      setTrailsLoading(false);
    });
    return () => { live = false; };
  }, [isTripCat, wireCountry]);

  useEffect(() => {
    if (!isFeatCat || !wireCountry) { setCountryFeatures(null); return undefined; }
    let live = true;
    setFeatLoading(true);
    loadFeatures(wireCountry).then((doc) => {
      if (!live) return;
      setCountryFeatures(doc);      // null means no file, not an empty country
      setFeatLoading(false);
    });
    return () => { live = false; };
  }, [isFeatCat, wireCountry]);
```

`trailsCountry` is renamed `wireCountry`; its other reference is at line 737 and is
covered in 2.10.

### 2.6 Drop the theme join, line 419-431

```js
  const tripCards = useMemo(() => {
    if (!isTripCat || !countryTrips) return null;
    return countryTrips.map((tr) => {
      const assoc = associateTrip(tr, data.destinations, destIndex);
      return {
        tr,
        assoc,
        kindKey: tripKindKey(tr, assoc.dest),
        themes: tripThemes(tr, assoc.dest),
        price: assoc.destId ? priceById.get(assoc.destId) || null : null,
      };
    });
  }, [isTripCat, countryTrips, data, destIndex, priceById]);
```

becomes the same block with the `themes:` line removed. Nothing else reads it.

### 2.7 Row filters, line 447-454

```js
  const tripRows = useMemo(() => {
    if (!tripCards) return null;
    let rows = tripCards.filter((c) => (
      cat === 'trips' ? c.tr.category === 'citytrip'
        : cat === 'trails' ? c.tr.category !== 'citytrip'
          : cat === 'beaches' ? c.themes.has('beach')
            : c.themes.has('mountains')
    ));
```

becomes

```js
  const tripRows = useMemo(() => {
    if (!isTripCat || !tripCards) return null;
    // Trips and Trails partition the wire on one boolean and nothing else can
    // reach this list: a city day is a citytrip, everything else is a route
    // somebody walks. No else-branch, so a new category cannot fall into the
    // last bucket the way beaches did.
    let rows = tripCards.filter((c) => (cat === 'trips'
      ? c.tr.category === 'citytrip'
      : c.tr.category !== 'citytrip'));
```

and the dependency array at line 481 gains `isTripCat`:

```js
  }, [isTripCat, tripCards, cat, q, nearDest, sort]);
```

New block, inserted directly after `tripRows` (after line 481):

```js
  // Beaches and Mountains: the features wire, one kind each, asked for by name.
  const featRows = useMemo(() => {
    if (!isFeatCat || !countryFeatures) return null;
    const kind = cat === 'beaches' ? 'beach' : 'mountain';
    let rows = countryFeatures.features.filter((f) => f.kind === kind);
    if (q) {
      rows = rows.filter((f) => norm(f.name).includes(q)
        || (f.nameLocal && norm(f.nameLocal).includes(q))
        || (f.near?.city && norm(f.near.city).includes(q)));
    }
    if (nearDest) {
      return rows
        .map((f) => ({ f, km: haversineKm(nearDest.lat, nearDest.lon, f.lat, f.lon) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, NEAR_MAX_ROWS);
    }
    // Wire order is the ranker's order, best first, the same contract Trails
    // keeps. A feature carries no price and no rating, so the sort chips have
    // nothing to act on and are not shown (see showPriceChrome below).
    return rows.map((f) => ({ f, km: null }));
  }, [isFeatCat, countryFeatures, cat, q, nearDest]);
```

### 2.8 The country index, line 484-495

```js
  const tripCountries = useMemo(() => {
    if (!isTripCat || !trailsIndex) return [];
    return trailsIndex.countries
      .map((c) => {
        const n = cat === 'trips' ? (c.counts?.citytrip || 0)
          : cat === 'trails' ? (c.counts?.hike || 0)
            : c.n_trips;
        return { cc: c.country, name: countryName(c.country), n };
      })
      .filter((c) => c.n > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [isTripCat, trailsIndex, cat, countryName]);
```

becomes

```js
  const tripCountries = useMemo(() => {
    if (!isTripCat || !trailsIndex) return [];
    return trailsIndex.countries
      .map((c) => {
        // Trails count what the row filter shows: everything that is not a city
        // day. counts.hike is only one of the lab's route families, so counting
        // it hid whole countries whose published routes are daytrips.
        const n = cat === 'trips'
          ? (c.counts?.citytrip || 0)
          : Math.max(0, (c.n_trips || 0) - (c.counts?.citytrip || 0));
        return { cc: c.country, name: countryName(c.country), n };
      })
      .filter((c) => c.n > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [isTripCat, trailsIndex, cat, countryName]);

  // The country index for Beaches and Mountains, from the features index. Its
  // counts are the counts of the file the card opens, because the exporter
  // writes both from one payload, so a card that says 17 opens onto 17 rows.
  const featCountries = useMemo(() => {
    if (!isFeatCat || !featIndex) return [];
    const beaches = cat === 'beaches';
    return [...featIndex.countries.entries()]
      .map(([cc, v]) => ({
        cc,
        name: countryName(cc),
        n: beaches ? v.beaches : v.mountains,
        top: beaches ? v.topBeach : v.topMountain,
      }))
      .filter((c) => c.n > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [isFeatCat, featIndex, cat, countryName]);

  // What the other tab holds for this country, so an empty Beaches list can
  // offer the mountains instead of apologising.
  const otherKindCount = useMemo(() => {
    if (!isFeatCat || !featIndex || !wireCountry) return 0;
    const row = featIndex.countries.get(wireCountry);
    if (!row) return 0;
    return cat === 'beaches' ? row.mountains : row.beaches;
  }, [isFeatCat, featIndex, wireCountry, cat]);
```

### 2.9 Paging and chrome flags, line 498 and 536-541

```js
  const rowCount = cat === 'general' ? destRows.length : (tripRows?.length ?? 0);
```

becomes

```js
  const rowCount = cat === 'general' ? destRows.length
    : isFeatCat ? (featRows?.length ?? 0)
      : (tripRows?.length ?? 0);
```

```js
  const showCountryIndex = !q && !country && !nearDest;
  const showTripRows = isTripCat && !trailsLoading && tripRows && tripRows.length > 0;
  // Trails carry no price and no rating: a hike is free and is not scored, so
  // the origin, the stay tier and the rating/price/A-Z sorts have nothing to
  // act on here. Distance from a searched city still orders them.
  const showPriceChrome = cat !== 'trails';
```

becomes

```js
  const showCountryIndex = !q && !country && !nearDest;
  const showTripRows = isTripCat && !trailsLoading && tripRows && tripRows.length > 0;
  const showFeatRows = isFeatCat && !featLoading && featRows && featRows.length > 0;
  // Trails and features carry no price and no rating: a hike is free, a summit
  // is not scored for money, so the origin, the stay tier and the
  // rating/price/A-Z sorts have nothing to act on. Distance from a searched
  // city still orders them.
  const showPriceChrome = cat === 'general' || cat === 'trips';
```

Search placeholder, line 568-569, gains a per-category string:

```js
              placeholder={t('places.searchDest')}
              aria-label={t('places.searchDest')}
```

becomes

```js
              placeholder={t(searchKey)}
              aria-label={t(searchKey)}
```

with, next to the other flags:

```js
  const searchKey = cat === 'beaches' ? 'places.searchBeach'
    : cat === 'mountains' ? 'places.searchMountain'
      : 'places.searchDest';
```

### 2.10 The list, line 706-748

The existing `{isTripCat && ( ... )}` block stays as it is except for line 737,
where `trailsCountry` becomes `wireCountry`. A third block goes directly after it,
before the closing `</div>` of `.places-wrap`:

```jsx
        {isFeatCat && (
          <div className="places-list">
            {showCountryIndex && (
              <>
                {featCountries.map((c) => (
                  <CountryCard
                    key={c.cc}
                    cc={c.cc}
                    name={c.name}
                    sub={`${t(cat === 'beaches' ? 'places.beachesCount' : 'places.mountainsCount', { n: fmt(c.n) })}${c.top ? `, ${c.top}` : ''}`}
                    img={countryCover.get(c.cc)?.img || null}
                    onPick={(cc) => setCountry(cc)}
                  />
                ))}
                {featIndex && featCountries.length === 0 && (
                  <p className="places-empty">{t('places.catEmpty')}</p>
                )}
                {!featIndex && (
                  <p className="places-empty">{t('places.featWireMissing')}</p>
                )}
              </>
            )}

            {!showCountryIndex && featLoading && <p className="places-empty">{'…'}</p>}

            {!showCountryIndex && !featLoading && !countryFeatures && (
              <p className="places-empty">{t('places.featWireMissing')}</p>
            )}

            {!showCountryIndex && !featLoading && countryFeatures && (
              featRows && featRows.length > 0
                ? featRows.slice(0, visible).map(({ f, km }) => (
                  <FeatureCard
                    key={f.id}
                    f={f}
                    km={km}
                    bathingYear={countryFeatures.bathingYear}
                    openable={!!(f.near && data.destinations[f.near.destId])}
                    onSelect={onSelectDest}
                    t={t}
                  />
                ))
                : (
                  <p className="places-empty">
                    {/* Three different nothings, and they are not the same
                        sentence: nothing near the searched city, nothing
                        matching what was typed, and a country that genuinely
                        holds none of this kind. */}
                    {nearDest
                      ? t(cat === 'beaches' ? 'places.noBeachNear' : 'places.noMountainNear', { city: nearDest.city })
                      : q
                        ? t(cat === 'beaches' ? 'places.noBeachMatch' : 'places.noMountainMatch')
                        : t(cat === 'beaches' ? 'places.beachesEmptyCountry' : 'places.mountainsEmptyCountry', { country: countryName(wireCountry || country) })}
                    {!nearDest && !q && otherKindCount > 0 && (
                      <button
                        type="button"
                        className="places-empty-action"
                        onClick={() => switchCat(cat === 'beaches' ? 'mountains' : 'beaches')}
                      >
                        {t(cat === 'beaches' ? 'places.seeMountainsIn' : 'places.seeBeachesIn', {
                          n: fmt(otherKindCount), country: countryName(wireCountry || country),
                        })}
                      </button>
                    )}
                  </p>
                )
            )}

            {!showCountryIndex && visible < (featRows?.length ?? 0) && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}

            {showFeatRows && <p className="places-credit">{t('places.featureCredit')}</p>}
          </div>
        )}
```

### 2.11 `FeatureCard`, new component after `TripCard` (after line 190)

```jsx
/**
 * One natural feature as a photo card: what it is, where it is, and only the
 * facts the wire actually carries for it.
 *
 * Half the layer ships with no photo (2,706 of 5,472 rows), so the empty tile
 * is the normal case rather than the exception, and it never borrows the
 * nearest town's picture: a photo of Split is not a photo of a beach 4 km
 * outside Split. The tile states the position instead, in mono, which is the
 * one fact every single row has.
 *
 * The card opens the priced destination the feature sits nearest to, which is
 * where a person can actually do something about it: dates, a flight, a bed.
 * Every one of the 5,472 rows resolves to a destination in the catalogue, but
 * a row that ever stops resolving renders as a plain card and not a dead
 * button.
 */
function FeatureCard({ f, km, bathingYear, openable, onSelect, t }) {
  const Glyph = f.kind === 'beach' ? BeachIcon : MountainIcon;
  const credit = photoCredit(f);
  const waterLabel = f.water ? t(WATER_KEY[f.water] || 'water.excellent') : null;
  const inner = (
    <>
      {f.image
        ? <img className="places-card-img" src={f.image.url} alt="" loading="lazy" />
        : (
          <span className="places-card-img places-card-noimg places-feat-noimg">
            <Glyph size={24} />
            <span className="places-feat-coords">{`${f.lat.toFixed(2)}, ${f.lon.toFixed(2)}`}</span>
            <span className="places-feat-nophoto">{t('places.featNoPhoto')}</span>
          </span>
        )}
      <span className="places-card-scrim" aria-hidden="true" />
      {credit && <span className="places-card-credit">{credit}</span>}
      {km != null && (
        <span className="places-card-km">{t('places.kmAway', { km: Math.round(km) })}</span>
      )}
      <span className="places-card-overlay">
        <span className="places-card-main">
          <span className="places-card-name">{f.name}</span>
          {f.near?.city && (
            <span className="places-card-sub">
              <span>{t('places.featNear', { city: f.near.city })}</span>
              {f.near.km != null && (
                <span className="places-feat-km">{`${f.near.km.toFixed(1)} km`}</span>
              )}
            </span>
          )}
          <span className="places-card-tags">
            {waterLabel && (
              <span
                className="places-card-tag"
                title={t('places.featWaterTip', { cls: waterLabel, year: bathingYear ?? '' })}
              >
                {waterLabel}
              </span>
            )}
            {/* Elevation is a measured fact and stays mono. The wire ships it
                on 0 of 3,295 summits today, so this renders on none of them
                and lights up by itself once the enricher lands P2044. */}
            {f.elevation != null && (
              <span className="places-card-tag mono" title={t('places.featElevTip', { m: f.elevation })}>
                {`${f.elevation} m`}
              </span>
            )}
            {f.designations.slice(0, 1).map((d) => (
              DESIGNATION_KEY[d]
                ? <span key={d} className="places-card-tag">{t(DESIGNATION_KEY[d])}</span>
                : null
            ))}
          </span>
        </span>
        <span className="places-card-right">
          {openable && <ChevronRightIcon size={15} className="places-card-chev" />}
        </span>
      </span>
    </>
  );
  // data-kind is what the headless harness asserts on: a Beaches list whose
  // cards are all data-kind="beach" is the whole fix, checkable in one line.
  return openable
    ? (
      <button
        className="places-fcard"
        data-kind={f.kind}
        onClick={() => onSelect(f.near.destId)}
        title={t('places.featOpen', { city: f.near.city })}
      >
        {inner}
      </button>
    )
    : <div className="places-fcard" data-kind={f.kind}>{inner}</div>;
}
```

---

## 3. Membership: five tabs, five sources, no overlap

State it as one table and one rule, so nothing can land in the wrong tab.

| Tab | Entity | Source | Predicate |
|---|---|---|---|
| General | priced destination | `data.destinations` via `pricedAll` | every priced place, filtered by country, query and size class |
| Trips | published trip | `/trails/{CC}.json` | `tr.category === 'citytrip'` |
| Trails | published trip | `/trails/{CC}.json` | `tr.category !== 'citytrip'` |
| Beaches | natural feature | `/features/{CC}.json` | `f.kind === 'beach'` |
| Mountains | natural feature | `/features/{CC}.json` | `f.kind === 'mountain'` |

The three rules that make it airtight:

1. **Different entity types cannot cross.** A trip has an `id`, a `category` and a
   geometry; a feature has an `id`, a `kind` and a point. Beaches and Mountains
   never read `countryTrips`, and Trips and Trails never read `countryFeatures`.
   There is no expression anywhere that turns one into the other.
2. **Every predicate names its member, never its non-members.** `f.kind === 'beach'`
   and `f.kind === 'mountain'` are both positive tests, and `normaliseFeature`
   drops any row whose kind is outside `FEATURE_KINDS`. The old code's final
   `: c.themes.has('mountains')` was an else-branch, which is why everything the
   earlier tests missed landed in Mountains. Trips and Trails are the one
   permitted complement pair, and they are exhaustive over a single field with
   two known values, checked by the invariant in 3.3.
3. **No inference from a neighbour.** Nothing about the nearest town decides
   anything. `near` supplies context on the card (a name, a distance, a place to
   open) and never membership.

### 3.1 Counting bug one: the trails index counts a family, the rows count a complement

Rows: `c.tr.category !== 'citytrip'`. Index: `c.counts?.hike || 0`. The published
wire today is 545 `hike` and 215 `citytrip`, so the two agree by luck. The lab
already composes `daytrip` rows (`tools/trailslab` compose_daytrips.py) and a
`dayhikes` family; the first country published with one gets a Trails card reading
0 and disappears from the index while its rows exist. Fix, as in 2.8:

```js
Math.max(0, (c.n_trips || 0) - (c.counts?.citytrip || 0))
```

The index now computes the same complement the rows do, from the same two numbers.

### 3.2 Counting bug two: the themed tabs read `n_trips`

`: c.n_trips` gave Beaches and Mountains a card for every country with any
published trip, which is how 18 of 43 countries opened a Beaches card onto an
empty list. The themed tabs no longer read the trails index at all; `featCountries`
reads `featIndex`, whose counts are the counts of the file the card opens. The 12
countries with no beaches (AD, BA, CZ, FO, IS, LI, MD, MK, RS, SK, SM, XK) simply
do not get a Beaches card, and no country gets a card that opens empty.

### 3.3 Invariants to assert in `scripts/verify_places_tab.mjs`

Cheap, and they encode exactly the failure that shipped:

```js
// Beaches lists beaches. Every card's id must start with the kind it claims.
const ids = await page.$$eval('.places-fcard', (els) => els.map((e) => e.dataset.kind));
check('every Beaches card is a beach', ids.length > 0 && ids.every((k) => k === 'beach'));
// A features tab draws no trip cards, and a trips tab draws no feature cards.
check('no trip cards under Beaches', await page.locator('.places-tcard').count() === 0);
// Every country card opens onto a non-empty list.
```

(Add `data-kind={f.kind}` to the `.places-fcard` element for the first assertion.)
Also assert the country-card promise: pick the first Beaches country card, read the
number out of its subline, open it, and check the row count matches.

---

## 4. Photo honesty for trails

`trailCards.js:36-38` today:

```js
// A hike further than this from any catalogue place shows its route, not a
// borrowed photo: a town's hero image 50 km away says nothing about the trail.
const PHOTO_MAX_KM = 35;
```

The comment already has the right instinct and the constant is three times too
generous. Measured over the 545 published hikes:

| nearest priced destination | hikes | today | after |
|---|---|---|---|
| within 8 km | 251 | town photo, unlabelled | town photo, **labelled** |
| 8 to 35 km | 203 | town photo, unlabelled | **route thumbnail** |
| over 35 km | 91 | generic route icon | route thumbnail |

So 203 cards stop making a claim they cannot support, 251 keep a photo and start
saying whose it is, and 91 gain a real drawing instead of a grey icon. City days
are untouched: their photo is the anchor destination's own, at 0 km.

### 4.1 `continent-app/src/lib/routeThumb.js`, new file

```js
/**
 * routeThumb.js, a published route drawn as an SVG path for cards with no
 * honest photograph to show.
 *
 * A hike is a shape, and the wire already ships that shape. What it does not
 * ship is a picture, and the card used to fill the hole with the nearest
 * town's hero image from up to 35 km away, which is a claim about scenery the
 * data never made. Drawing the geometry says exactly as much as we know.
 *
 * Equirectangular with one cos(lat) correction on x, taken at the route's mid
 * latitude. Half the published routes span 0.04 degrees of latitude and 99 %
 * span under 2.4, where this is indistinguishable from a proper projection at
 * one cosine per route instead of a log-tangent per point. The one route that
 * strains it, the Finnish E6 at 8.6 degrees, comes out about 16 % too narrow
 * at its northern end. That is stated here rather than fixed because the
 * thumbnail's job is to say loop or line, not to be navigated: anything that
 * needs to be measured opens the map.
 */

// A budget for the whole route, not for each of its segments. The thumbnail is
// 320 px wide, the longest published route carries 13,160 points (40 per
// pixel), and one route is 320 separate segments, so a per-segment budget would
// have quietly allowed 30,000 points into the box. Worst case here is
// MAX_POINTS plus two per segment, because each segment keeps its own ends.
const MAX_POINTS = 120;

/** [[lon, lat], ...] segments from a LineString or a MultiLineString. The
 *  published wire is MultiLineString throughout; both are accepted because the
 *  detail files are not. */
function segmentsOf(geometry) {
  const coords = geometry && geometry.coordinates;
  if (!Array.isArray(coords) || !coords.length) return [];
  const lines = geometry.type === 'LineString' ? [coords] : coords;
  return lines.filter((l) => Array.isArray(l) && l.length > 1);
}

/** Every nth point of one segment, its first and last always kept, so the ends
 *  of each piece are where the piece ends. */
function thin(line, step) {
  if (step <= 1 || line.length <= 2) return line;
  const out = [];
  for (let i = 0; i < line.length; i += step) out.push(line[i]);
  const last = line[line.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

const finite = (n) => (typeof n === 'number' && Number.isFinite(n));

/**
 * { d, start, width, height } for one geometry, or null when there is nothing
 * to draw. `d` is an SVG path fitted inside the box with `pad` to spare;
 * `start` is the first point, which is what tells a loop from a there-and-back
 * at thumbnail size.
 */
export function routeThumb(geometry, { width = 320, height = 158, pad = 20 } = {}) {
  const raw = segmentsOf(geometry);
  const total = raw.reduce((n, l) => n + l.length, 0);
  const segs = raw.map((l) => thin(l, Math.max(1, Math.ceil(total / MAX_POINTS))));
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;
  let n = 0;
  for (const line of segs) {
    for (const p of line) {
      if (!Array.isArray(p) || !finite(p[0]) || !finite(p[1])) continue;
      if (p[1] < minLat) minLat = p[1];
      if (p[1] > maxLat) maxLat = p[1];
      if (p[0] < minLon) minLon = p[0];
      if (p[0] > maxLon) maxLon = p[0];
      n += 1;
    }
  }
  if (n < 2) return null;

  const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180) || 1e-6;
  // A dead straight north-south route has zero width; the epsilon keeps the
  // scale finite and the fit falls out of the other axis.
  const w = Math.max((maxLon - minLon) * kx, 1e-9);
  const h = Math.max(maxLat - minLat, 1e-9);
  const scale = Math.min((width - pad * 2) / w, (height - pad * 2) / h);
  const ox = (width - w * scale) / 2;
  const oy = (height - h * scale) / 2;
  const px = (lon) => Number((ox + (lon - minLon) * kx * scale).toFixed(1));
  // y grows downward on screen and northward on the ground.
  const py = (lat) => Number((oy + (maxLat - lat) * scale).toFixed(1));

  let d = '';
  let start = null;
  for (const line of segs) {
    let first = true;
    for (const p of line) {
      if (!Array.isArray(p) || !finite(p[0]) || !finite(p[1])) continue;
      const x = px(p[0]);
      const y = py(p[1]);
      d += `${first ? 'M' : 'L'}${x} ${y}`;
      if (first && !start) start = [x, y];
      first = false;
    }
  }
  return d ? { d, start, width, height } : null;
}
```

Run against all 760 published routes before wiring it up: 760 drawn, 0 rejected,
0 paths containing NaN, mean path 710 characters (about 60 points), worst case
7,526 characters on the 320-segment Finnish E6. A page of 36 cards therefore
carries about 25 KB of path data, which is a third of one of the photos it
replaces.

### 4.2 `continent-app/src/components/RouteThumb.jsx`, new file

```jsx
import React, { useMemo } from 'react';
import { routeThumb } from '../lib/routeThumb.js';
import { RouteIcon } from './Icons.jsx';

/**
 * The route itself as the card art, for a trip with no photograph it is
 * entitled to. Drawn on the card's own paper rather than over an image,
 * because it is a diagram and not a picture: a survey line, not a postcard.
 */
export function RouteThumb({ geometry, label }) {
  const shape = useMemo(() => routeThumb(geometry), [geometry]);
  if (!shape) {
    // Geometry we cannot draw, which loadTrails already filters out. The old
    // icon tile remains the last resort rather than a blank card.
    return (
      <span className="places-card-img places-card-noimg" aria-hidden="true">
        <RouteIcon size={26} />
      </span>
    );
  }
  return (
    <svg
      className="places-card-img places-route"
      viewBox={`0 0 ${shape.width} ${shape.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
    >
      <path className="places-route-line" d={shape.d} fill="none" />
      {shape.start && (
        <circle className="places-route-start" cx={shape.start[0]} cy={shape.start[1]} r="3.5" />
      )}
    </svg>
  );
}
```

### 4.3 `trailCards.js`: borrow closer, and say so

Replace lines 36-38 and the return of `associateTrip` (lines 57-73), and delete
`tripThemes` (lines 75-83) entirely.

```js
// A borrowed photo is a claim about a place. Within 8 km the nearest town's
// hero image is the same valley, the same coast, the same light, and the card
// labels it as borrowed anyway. Beyond that the card draws the route instead:
// a picture of Hallstatt is not a picture of a trail 30 km away, and 203 of
// the 545 published hikes used to carry exactly that.
const PHOTO_BORROW_KM = 8;
// Association radius for rating/price/theme context.
const ASSOC_MAX_KM = 80;
```

`associateTrip` returns `photoKm` alongside `photoUrl`:

```js
export function associateTrip(tr, destinations, destIndex) {
  if (tr.category === 'citytrip' && tr.anchor?.dest && destinations[tr.anchor.dest]) {
    const dest = destinations[tr.anchor.dest];
    // A city day's photo is its own anchor's, at zero distance: nothing is
    // borrowed and there is nothing to label.
    return { dest, destId: tr.anchor.dest, km: 0, photoUrl: dest.image?.url || null, photoKm: 0 };
  }
  const c = tripCentre(tr);
  if (!c) return { dest: null, destId: null, km: null, photoUrl: null, photoKm: null };
  const near = nearestDest(destIndex, c.lat, c.lon);
  if (!near) return { dest: null, destId: null, km: null, photoUrl: null, photoKm: null };
  const full = destinations[near.dest.id] || near.dest;
  const borrowed = near.km <= PHOTO_BORROW_KM ? (full.image?.url || null) : null;
  return {
    dest: full,
    destId: near.dest.id,
    km: near.km,
    photoUrl: borrowed,
    photoKm: borrowed ? near.km : null,
  };
}
```

### 4.4 `TripCard`: the drawing and the label

Lines 147-153:

```jsx
      {assoc.photoUrl
        ? <img className="places-card-img" src={assoc.photoUrl} alt="" loading="lazy" />
        : (
          <span className="places-card-img places-card-noimg" aria-hidden="true">
            <RouteIcon size={26} />
          </span>
        )}
```

becomes

```jsx
      {assoc.photoUrl
        ? <img className="places-card-img" src={assoc.photoUrl} alt="" loading="lazy" />
        : <RouteThumb geometry={tr.geometry} label={t('places.routeShape')} />}
      {assoc.photoUrl && assoc.photoKm > 0 && (
        <span className="places-card-credit">
          {t('places.photoFrom', { city: assoc.dest?.city })}
          <b>{`${Math.round(assoc.photoKm)} km`}</b>
        </span>
      )}
```

`RouteIcon` stays imported for `RouteThumb`'s own fallback; the import at line 11
of `DestinationsTab.jsx` can drop it once nothing else uses it.

---

## 5. i18n: every new key, six languages

Paste into the `places.*` block of each catalog (`en.js:1904` and the matching
block in each translation). The block uses double-quoted keys and values; keep it.

**en.js**

```js
  "places.beachesCount": "{n} beaches",
  "places.mountainsCount": "{n} mountains",
  "places.searchBeach": "Search a beach or a city",
  "places.searchMountain": "Search a summit or a city",
  "places.featNear": "Near {city}",
  "places.featNoPhoto": "No photo yet",
  "places.featOpen": "Open {city}",
  "places.featWaterTip": "Official bathing water class {cls} (EEA {year}).",
  "places.featElevTip": "Summit height, {m} m above sea level.",
  "places.featureCredit": "Beaches and summits from OpenStreetMap and the EEA bathing water register, photos from Wikimedia Commons.",
  "places.featWireMissing": "The beach and summit layer did not load. Reload the page, or browse Trails meanwhile.",
  "places.beachesEmptyCountry": "No beaches in {country}. The layer lists coast and officially rated bathing sites, so a country with neither stays empty.",
  "places.mountainsEmptyCountry": "No summits in {country}. The layer lists peaks that carry an article or a designation, and none here cleared the bar.",
  "places.noBeachNear": "No beaches near {city} yet.",
  "places.noMountainNear": "No summits near {city} yet.",
  "places.noBeachMatch": "No beach matches that. Clear the search or pick another country.",
  "places.noMountainMatch": "No summit matches that. Clear the search or pick another country.",
  "places.seeBeachesIn": "See {n} beaches in {country}",
  "places.seeMountainsIn": "See {n} mountains in {country}",
  "places.desigUnesco": "UNESCO",
  "places.desigNationalPark": "National park",
  "places.desigNaturalMonument": "Natural monument",
  "places.desigWilderness": "Wilderness",
  "places.photoFrom": "Photo from {city}",
  "places.routeShape": "The route, drawn from its own track",
```

**nl.js**

```js
  "places.beachesCount": "{n} stranden",
  "places.mountainsCount": "{n} bergen",
  "places.searchBeach": "Zoek een strand of een stad",
  "places.searchMountain": "Zoek een berg of een stad",
  "places.featNear": "Bij {city}",
  "places.featNoPhoto": "Nog geen foto",
  "places.featOpen": "Open {city}",
  "places.featWaterTip": "Officiële zwemwaterklasse {cls} (EEA {year}).",
  "places.featElevTip": "Hoogte van de top, {m} m boven zeeniveau.",
  "places.featureCredit": "Stranden en bergtoppen van OpenStreetMap en het EEA-zwemwaterregister, foto's van Wikimedia Commons.",
  "places.featWireMissing": "De laag met stranden en bergtoppen is niet geladen. Herlaad de pagina, of bekijk intussen Routes.",
  "places.beachesEmptyCountry": "Geen stranden in {country}. De laag toont kust en officieel beoordeelde zwemlocaties, dus een land zonder beide blijft leeg.",
  "places.mountainsEmptyCountry": "Geen bergtoppen in {country}. De laag toont toppen met een artikel of een beschermde status, en geen enkele haalde de drempel.",
  "places.noBeachNear": "Nog geen stranden bij {city}.",
  "places.noMountainNear": "Nog geen bergtoppen bij {city}.",
  "places.noBeachMatch": "Geen strand komt hiermee overeen. Wis de zoekopdracht of kies een ander land.",
  "places.noMountainMatch": "Geen bergtop komt hiermee overeen. Wis de zoekopdracht of kies een ander land.",
  "places.seeBeachesIn": "Bekijk {n} stranden in {country}",
  "places.seeMountainsIn": "Bekijk {n} bergen in {country}",
  "places.desigUnesco": "UNESCO",
  "places.desigNationalPark": "Nationaal park",
  "places.desigNaturalMonument": "Natuurmonument",
  "places.desigWilderness": "Wildernis",
  "places.photoFrom": "Foto uit {city}",
  "places.routeShape": "De route, getekend van het eigen spoor",
```

**de.js**

```js
  "places.beachesCount": "{n} Strände",
  "places.mountainsCount": "{n} Berge",
  "places.searchBeach": "Strand oder Stadt suchen",
  "places.searchMountain": "Gipfel oder Stadt suchen",
  "places.featNear": "Bei {city}",
  "places.featNoPhoto": "Noch kein Foto",
  "places.featOpen": "{city} öffnen",
  "places.featWaterTip": "Offizielle Badegewässerklasse {cls} (EEA {year}).",
  "places.featElevTip": "Gipfelhöhe, {m} m über dem Meer.",
  "places.featureCredit": "Strände und Gipfel von OpenStreetMap und dem EEA-Badegewässerregister, Fotos von Wikimedia Commons.",
  "places.featWireMissing": "Die Ebene mit Stränden und Gipfeln wurde nicht geladen. Seite neu laden, oder solange Touren ansehen.",
  "places.beachesEmptyCountry": "Keine Strände in {country}. Die Ebene führt Küste und offiziell bewertete Badestellen, ein Land ohne beides bleibt leer.",
  "places.mountainsEmptyCountry": "Keine Gipfel in {country}. Die Ebene führt Gipfel mit Artikel oder Schutzstatus, und hier hat keiner die Schwelle erreicht.",
  "places.noBeachNear": "Noch keine Strände bei {city}.",
  "places.noMountainNear": "Noch keine Gipfel bei {city}.",
  "places.noBeachMatch": "Kein Strand passt dazu. Suche löschen oder ein anderes Land wählen.",
  "places.noMountainMatch": "Kein Gipfel passt dazu. Suche löschen oder ein anderes Land wählen.",
  "places.seeBeachesIn": "{n} Strände in {country} ansehen",
  "places.seeMountainsIn": "{n} Berge in {country} ansehen",
  "places.desigUnesco": "UNESCO",
  "places.desigNationalPark": "Nationalpark",
  "places.desigNaturalMonument": "Naturdenkmal",
  "places.desigWilderness": "Wildnis",
  "places.photoFrom": "Foto aus {city}",
  "places.routeShape": "Die Route, aus ihrer eigenen Spur gezeichnet",
```

**fr.js**

```js
  "places.beachesCount": "{n} plages",
  "places.mountainsCount": "{n} montagnes",
  "places.searchBeach": "Chercher une plage ou une ville",
  "places.searchMountain": "Chercher un sommet ou une ville",
  "places.featNear": "Près de {city}",
  "places.featNoPhoto": "Pas encore de photo",
  "places.featOpen": "Ouvrir {city}",
  "places.featWaterTip": "Classe officielle des eaux de baignade {cls} (EEA {year}).",
  "places.featElevTip": "Altitude du sommet, {m} m au-dessus de la mer.",
  "places.featureCredit": "Plages et sommets d'OpenStreetMap et du registre des eaux de baignade de l'EEA, photos de Wikimedia Commons.",
  "places.featWireMissing": "La couche plages et sommets n'a pas chargé. Rechargez la page, ou parcourez les Sentiers en attendant.",
  "places.beachesEmptyCountry": "Aucune plage en {country}. La couche recense le littoral et les sites de baignade officiellement classés, un pays sans les deux reste vide.",
  "places.mountainsEmptyCountry": "Aucun sommet en {country}. La couche recense les sommets qui ont un article ou un statut de protection, et aucun n'a passé le seuil.",
  "places.noBeachNear": "Pas encore de plages près de {city}.",
  "places.noMountainNear": "Pas encore de sommets près de {city}.",
  "places.noBeachMatch": "Aucune plage ne correspond. Effacez la recherche ou choisissez un autre pays.",
  "places.noMountainMatch": "Aucun sommet ne correspond. Effacez la recherche ou choisissez un autre pays.",
  "places.seeBeachesIn": "Voir {n} plages en {country}",
  "places.seeMountainsIn": "Voir {n} montagnes en {country}",
  "places.desigUnesco": "UNESCO",
  "places.desigNationalPark": "Parc national",
  "places.desigNaturalMonument": "Monument naturel",
  "places.desigWilderness": "Zone sauvage",
  "places.photoFrom": "Photo de {city}",
  "places.routeShape": "L'itinéraire, tracé d'après sa propre trace",
```

**it.js**

```js
  "places.beachesCount": "{n} spiagge",
  "places.mountainsCount": "{n} montagne",
  "places.searchBeach": "Cerca una spiaggia o una città",
  "places.searchMountain": "Cerca una cima o una città",
  "places.featNear": "Vicino a {city}",
  "places.featNoPhoto": "Ancora nessuna foto",
  "places.featOpen": "Apri {city}",
  "places.featWaterTip": "Classe ufficiale delle acque di balneazione {cls} (EEA {year}).",
  "places.featElevTip": "Quota della cima, {m} m sul livello del mare.",
  "places.featureCredit": "Spiagge e cime da OpenStreetMap e dal registro delle acque di balneazione EEA, foto da Wikimedia Commons.",
  "places.featWireMissing": "Il livello di spiagge e cime non si è caricato. Ricarica la pagina, o intanto sfoglia i Sentieri.",
  "places.beachesEmptyCountry": "Nessuna spiaggia in {country}. Il livello elenca costa e siti di balneazione classificati ufficialmente, un paese senza entrambi resta vuoto.",
  "places.mountainsEmptyCountry": "Nessuna cima in {country}. Il livello elenca cime con una voce enciclopedica o una tutela, e qui nessuna ha superato la soglia.",
  "places.noBeachNear": "Ancora nessuna spiaggia vicino a {city}.",
  "places.noMountainNear": "Ancora nessuna cima vicino a {city}.",
  "places.noBeachMatch": "Nessuna spiaggia corrisponde. Cancella la ricerca o scegli un altro paese.",
  "places.noMountainMatch": "Nessuna cima corrisponde. Cancella la ricerca o scegli un altro paese.",
  "places.seeBeachesIn": "Vedi {n} spiagge in {country}",
  "places.seeMountainsIn": "Vedi {n} montagne in {country}",
  "places.desigUnesco": "UNESCO",
  "places.desigNationalPark": "Parco nazionale",
  "places.desigNaturalMonument": "Monumento naturale",
  "places.desigWilderness": "Area selvaggia",
  "places.photoFrom": "Foto da {city}",
  "places.routeShape": "Il percorso, disegnato dalla sua traccia",
```

**es.js**

```js
  "places.beachesCount": "{n} playas",
  "places.mountainsCount": "{n} montañas",
  "places.searchBeach": "Busca una playa o una ciudad",
  "places.searchMountain": "Busca una cumbre o una ciudad",
  "places.featNear": "Cerca de {city}",
  "places.featNoPhoto": "Aún sin foto",
  "places.featOpen": "Abrir {city}",
  "places.featWaterTip": "Clase oficial de agua de baño {cls} (EEA {year}).",
  "places.featElevTip": "Altura de la cumbre, {m} m sobre el mar.",
  "places.featureCredit": "Playas y cumbres de OpenStreetMap y del registro de aguas de baño de la EEA, fotos de Wikimedia Commons.",
  "places.featWireMissing": "La capa de playas y cumbres no se cargó. Recarga la página, o mira las Rutas mientras tanto.",
  "places.beachesEmptyCountry": "Ninguna playa en {country}. La capa recoge costa y zonas de baño con calificación oficial, y un país sin ambas queda vacío.",
  "places.mountainsEmptyCountry": "Ninguna cumbre en {country}. La capa recoge cumbres con artículo o figura de protección, y aquí ninguna pasó el listón.",
  "places.noBeachNear": "Aún no hay playas cerca de {city}.",
  "places.noMountainNear": "Aún no hay cumbres cerca de {city}.",
  "places.noBeachMatch": "Ninguna playa coincide. Borra la búsqueda o elige otro país.",
  "places.noMountainMatch": "Ninguna cumbre coincide. Borra la búsqueda o elige otro país.",
  "places.seeBeachesIn": "Ver {n} playas en {country}",
  "places.seeMountainsIn": "Ver {n} montañas en {country}",
  "places.desigUnesco": "UNESCO",
  "places.desigNationalPark": "Parque nacional",
  "places.desigNaturalMonument": "Monumento natural",
  "places.desigWilderness": "Zona salvaje",
  "places.photoFrom": "Foto de {city}",
  "places.routeShape": "La ruta, dibujada de su propia traza",
```

Already present and reused as is: `places.catBeaches`, `places.catMountains`,
`places.kmAway`, `places.nearHead`, `places.clearNear`, `places.catEmpty`,
`water.excellent`, `water.good`, `water.sufficient`, `water.poor`.

---

## 6. CSS

Four small edits to the shared card rules, then one new block. All of it sits in
`continent-app/src/styles.css`, inside the `.places-*` section (16108-16577).

### 6.1 Four edits, so a feature card is a card

| Line | Now | Add |
|---|---|---|
| 16385 | `.places-dcard, .places-ccard, .places-tcard {` | `, .places-fcard` |
| 16394 | `.places-dcard { height: 150px; }` | new line: `.places-fcard { height: 150px; }` |
| 16397 | `.places-dcard:focus-visible, .places-ccard:focus-visible, .places-tcard:focus-visible {` | `, .places-fcard:focus-visible` |
| 16411-16413 | the three hover rules | add `.places-fcard:hover .places-card-img,` |
| 16574-16576 | the reduced-motion block | add `.places-fcard:hover .places-card-img { transform: none; }` |

### 6.2 New block, appended after line 16577 (before the trail page section)

```css
/* ---------- Feature cards (.places-fcard) and route thumbnails ----------
   Beaches and summits from public/features, drawn in exactly the grammar the
   other three cards use: image, scrim, facts over the scrim. Two things are
   new, and both exist to stop the card claiming more than the wire knows.

   1. Half the layer ships with no photograph. That card shows where the thing
      is, in mono, rather than a stand-in picture of a town nearby.
   2. A photo carries its credit on the card. A CC BY-SA image with no visible
      attribution is a licensing problem, and a title attribute is not a
      visible attribution. */

.places-feat-noimg {
  flex-direction: column;
  gap: 4px;
  background: var(--paper-dim);
  color: var(--ink-mute);
}
.places-feat-coords {
  font-family: var(--mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--ink-mute);
}
.places-feat-nophoto {
  font-size: 11px;
  color: var(--ink-mute);
}

/* The distance from the feature to the town named beside it. A measured fact
   sitting in a sans line, so it takes the mono itself. */
.places-feat-km {
  font-family: var(--mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.92);
}

/* Water class, designation and elevation, in the chip language the trip cards
   already use for their kind. A class name is a word, so it stays sans; only
   the elevation takes mono, because only the elevation is a number. */
.places-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.places-card-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.18);
  font-size: 10.5px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}
.places-card-tag.mono {
  font-family: var(--mono);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

/* Top left, opposite the km badge: the photo's credit on a feature card, and
   on a trail card the town the photo was borrowed from with how far away that
   town is. Same slot, same pill, because both answer "whose picture is this". */
.places-card-credit {
  position: absolute;
  top: 10px; left: 12px;
  max-width: 62%;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(26, 26, 26, 0.55);
  font-size: 10px;
  color: rgba(255, 255, 255, 0.92);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.places-card-credit b {
  margin-left: 6px;
  font-family: var(--mono);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

/* The route as the card art. A drawn line on paper, not a photograph: it is a
   diagram and it should read as one, so it does not zoom on hover the way an
   image does. The accent marks the start, which is the one thing a thumbnail
   can say that a photo cannot: where the walk begins, and whether it comes
   back. */
.places-route {
  background: var(--paper-dim);
  object-fit: contain;
}
.places-route-line {
  stroke: var(--ink-soft);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.places-route-start {
  fill: var(--accent);
}
.places-tcard:hover .places-route { transform: none; }

/* The way out of an empty list: the other kind, in this same country. */
.places-empty-action {
  display: block;
  margin-top: 8px;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
}
.places-empty-action:hover { text-decoration: underline; }
.places-empty-action:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  border-radius: 4px;
}
```

Design checks against `.claude/skills/carta-design/SKILL.md`: no new hex outside
the token set, no gradient or shadow added, one accent per card (the start dot on
a route, and a route card has no other accent on it), mono only on the coordinates,
the distances and the elevation, sentence case with no terminal punctuation on
labels, and the reduced-motion block extended rather than bypassed.

---

## 7. Empty states, in the product's voice

Every one of these names the space and offers the next move, and none of them
claims a fact the wire does not hold. The important correction: **do not write
"Hungary has no beaches"**. Hungary ships 23 beaches, all on Balaton, and the top
one is Annabella Strand. The countries that really have none are AD, BA, CZ, FO,
IS, LI, MD, MK, RS, SK, SM and XK, and even for those the honest sentence is about
what the layer lists, not about the country's geography.

| Where | State | Copy (en) |
|---|---|---|
| Beaches, country index | index loaded | never empty: 31 countries have beaches, the other 12 get no card |
| Beaches, country index | index missing (`featIndex === null`) | `places.featWireMissing`: "The beach and summit layer did not load. Reload the page, or browse Trails meanwhile." |
| Beaches, a country | file missing (`countryFeatures === null`) | same `places.featWireMissing` |
| Beaches, a country | file loaded, no beaches | `places.beachesEmptyCountry`: "No beaches in Czechia. The layer lists coast and officially rated bathing sites, so a country with neither stays empty." plus the action "See 79 mountains in Czechia" |
| Mountains, a country | file loaded, no summits | `places.mountainsEmptyCountry`, with "See 32 beaches in Latvia" as the action |
| Beaches, a country | a typed query matched nothing | `places.noBeachMatch`: "No beach matches that. Clear the search or pick another country." Never the country sentence: Spain has 315 beaches and "No beaches in Spain" would be a lie caused by a typo |
| Mountains, a country | a typed query matched nothing | `places.noMountainMatch` |
| Beaches, near a city | nothing within the search | `places.noBeachNear`: "No beaches near Vienna yet." |
| Mountains, near a city | nothing within the search | `places.noMountainNear`: "No summits near Amsterdam yet." |
| Trips, a country | nothing published | existing `places.trailsEmpty`, unchanged |
| Trails, a country | nothing published | existing `places.trailsEmpty`, unchanged |
| Trips / Trails, country index | nothing published anywhere | existing `places.catEmpty`, unchanged |
| General | filter matched nothing | existing `places.emptyDest`, unchanged |

The cross-link is what turns the two feature empties from an apology into a door,
and it is always truthful: `otherKindCount` comes from the same index the country
cards count from, so "See 79 mountains in Czechia" opens onto 79 mountains.

A note on the country `<select>`: it lists every catalogue country, so a user can
select Czechia while standing on Beaches even though no Czech Beaches card exists.
That is the path these two strings exist for. Do not disable the option; a country
you cannot select reads as a bug, a country that explains itself reads as data.

---

## 8. Two open data gaps to state, not to paper over

**Elevation is missing on every summit.** `data/derived/features.json` carries
`elevation_m: null` on all 9,675 mountains, so `export_features.py:126-129` ships
no `elevation` key and 0 of 3,295 mountain cards can print a height. The UI above
renders the chip only when the value exists, so the layer lights up by itself the
day the Wikidata enricher fills P2044. Until then a mountain card shows its
nearest town, the distance, and any designation. `validate_features.py` already
counts this under its soft checks ("summits with no elevation"); it is worth
promoting to a named line in the report summary so it is visible rather than
counted.

**Prominence and local names ship on nothing.** `prominence_m` and `name_local`
are null on every row today. Both are already handled the same way: rendered when
present, absent otherwise.

Neither is a blocker for this UI change. The Beaches and Mountains tabs stop being
wrong on the day it lands; they get richer later without another front-end pass.

---

## 9. Files an engineer touches

| File | Change |
|---|---|
| `continent-app/src/lib/features.js` | new, section 1, paste in full |
| `continent-app/src/lib/routeThumb.js` | new, section 4.1, paste in full |
| `continent-app/src/components/RouteThumb.jsx` | new, section 4.2, paste in full |
| `continent-app/src/browse/DestinationsTab.jsx` | section 2, eleven diff sites plus the new `FeatureCard` |
| `continent-app/src/lib/trailCards.js` | section 4.3: `PHOTO_BORROW_KM = 8`, `photoKm` in the return, delete `tripThemes` |
| `continent-app/src/styles.css` | section 6: four one-line edits plus one new block |
| `continent-app/src/i18n/en.js` and `nl/de/fr/it/es.js` | section 5: 25 keys each |
| `continent-app/scripts/verify_places_tab.mjs` | section 3.3 invariants, plus a Beaches and a Mountains pass |

Order that keeps the app running at every step: `features.js` and `routeThumb.js`
first (nothing imports them yet), then the i18n keys, then the CSS, then
`trailCards.js` and `RouteThumb.jsx`, then `DestinationsTab.jsx` last, which is
the only commit where behaviour changes. Run
`node scripts/verify_places_tab.mjs` from `continent-app/` against the preview
build afterwards, remembering the harness gates: click "Continue without an
account", dismiss "Got it" and "START HERE" before any screenshot.
