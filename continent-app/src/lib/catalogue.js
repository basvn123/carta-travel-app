/**
 * catalogue.js, the destination records loaded by region instead of all at
 * once (T059).
 *
 * The boot index (bootIndex.js) knows where every destination is and which
 * shard holds its record: a small country whole, a big one as grid tiles
 * (shardKey). This store sits on top of it: it fetches a shard only when
 * something asks for a place inside it, never twice,
 * and hands out the records loaded so far as the same { meta, destinations }
 * shape the app has always read.
 *
 * Callers ask in the terms they have:
 *
 *   ensureViewport(bbox)   the shards with at least one destination on
 *                          screen, from a 1-degree cell index over the boot
 *                          rows (a country's bounding box would drag France
 *                          in for a view of Andorra)
 *   ensureNear(lat, lon)   the shards with a destination within a radius,
 *                          for the first paint around the traveller's origin
 *   ensureIds(ids)         the shards holding these destinations, for a
 *                          place opened from a link
 *   ensureAll()            every shard, for the screens that rank the
 *                          whole of Europe
 *
 * Each returns a promise for the moment its shards are in. A shard that
 * fails (after one retry, see appData.js) is forgotten, so the
 * next ask tries again; the promise rejects so the caller can say so.
 *
 * Arrivals are announced to subscribers coalesced over a short window,
 * because forty-odd files landing within a second would otherwise re-price
 * the whole app forty times.
 *
 * Pure apart from the two loaders it is given, so tests/catalogue.test.mjs
 * can drive it with fake fetches and count what a pan costs.
 */

import { chunkList, mergeCatalogue, shardKey } from './bootIndex.js';

/** Cell size of the spatial index, in degrees. */
const CELL = 1;
const cellKey = (lat, lon) => `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function haversineKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/**
 * The spatial side of a boot index: which shard each id lives in, and which
 * shards have a destination in each 1-degree cell. Built once per boot
 * index; at 25,000 rows it is a few thousand cells.
 */
export function indexBoot(boot) {
  const keyOf = new Map();   // id -> shard key
  const cells = new Map();   // cell -> Set(shard key)
  const rows = boot?.d || [];
  const keys = rows.map((row) => shardKey(row, boot?.tiles));
  for (let i = 0; i < rows.length; i += 1) {
    const [id, lat, lon] = rows[i];
    const key = keys[i];
    keyOf.set(id, key);
    if (!isNum(lat) || !isNum(lon)) continue;
    const c = cellKey(lat, lon);
    let set = cells.get(c);
    if (!set) cells.set(c, (set = new Set()));
    set.add(key);
  }
  return { keyOf, cells, rows, keys };
}

/**
 * Shard keys with at least one destination inside [west, south, east,
 * north]. A box that wraps the antimeridian (west > east) is split in two.
 */
export function shardsInBounds(index, bbox) {
  const out = new Set();
  if (!index || !Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(isNum)) return out;
  const [w, s, e, n] = bbox;
  if (w > e) {
    for (const k of shardsInBounds(index, [w, s, 180, n])) out.add(k);
    for (const k of shardsInBounds(index, [-180, s, e, n])) out.add(k);
    return out;
  }
  const lat0 = Math.floor(Math.max(-90, s) / CELL);
  const lat1 = Math.floor(Math.min(90, n) / CELL);
  const lon0 = Math.floor(Math.max(-180, w) / CELL);
  const lon1 = Math.floor(Math.min(180, e) / CELL);
  // Walk whichever is smaller: the cells under the box, or the cells that
  // exist. A continental view covers thousands of empty sea cells.
  const span = (lat1 - lat0 + 1) * (lon1 - lon0 + 1);
  if (span > index.cells.size) {
    for (const [c, set] of index.cells) {
      const [la, lo] = c.split(':').map(Number);
      if (la >= lat0 && la <= lat1 && lo >= lon0 && lo <= lon1) set.forEach((k) => out.add(k));
    }
    return out;
  }
  for (let la = lat0; la <= lat1; la += 1) {
    for (let lo = lon0; lo <= lon1; lo += 1) {
      index.cells.get(`${la}:${lo}`)?.forEach((k) => out.add(k));
    }
  }
  return out;
}

/** Shard keys with a destination within `km` of a point. */
export function shardsNear(index, lat, lon, km) {
  const out = new Set();
  if (!index || !isNum(lat) || !isNum(lon)) return out;
  index.rows.forEach(([, dLat, dLon], i) => {
    if (!isNum(dLat) || !isNum(dLon)) return;
    if (haversineKm(lat, lon, dLat, dLon) <= km) out.add(index.keys[i]);
  });
  return out;
}

/**
 * A catalogue store.
 *
 *   loadBoot()               -> Promise<boot index>
 *   loadCountry(key, hash)   -> Promise<{ id: record }>
 *   coalesceMs               how long arrivals are gathered before
 *                            subscribers hear of them (0 in tests)
 */
export function createCatalogue({ loadBoot, loadCountry, coalesceMs = 60 }) {
  let boot = null;
  let index = null;
  let hashes = {};
  const chunks = {};            // key -> records, once loaded
  const inflight = new Map();   // key -> promise
  const requested = [];         // every key fetched, in order (measurement)
  const listeners = new Set();
  let version = 0;
  let cached = null;            // { version, value } for snapshot()
  let timer = null;

  const bootPromise = Promise.resolve().then(loadBoot).then((b) => {
    boot = b;
    index = indexBoot(b);
    hashes = Object.fromEntries(chunkList(b));
    return b;
  });
  bootPromise.catch(() => {});

  function announce() {
    version += 1;
    if (!listeners.size) return;
    if (coalesceMs <= 0) { listeners.forEach((fn) => fn()); return; }
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      listeners.forEach((fn) => fn());
    }, coalesceMs);
  }

  function fetchKey(key) {
    if (chunks[key]) return Promise.resolve(chunks[key]);
    if (inflight.has(key)) return inflight.get(key);
    requested.push(key);
    const p = Promise.resolve(loadCountry(key, hashes[key])).then((recs) => {
      chunks[key] = recs && typeof recs === 'object' ? recs : {};
      inflight.delete(key);
      announce();
      return chunks[key];
    }, (err) => {
      // Forget the failure so the next ask retries it.
      inflight.delete(key);
      throw err;
    });
    inflight.set(key, p);
    return p;
  }

  /** Load these shard keys (unknown keys are ignored). */
  function ensure(keys) {
    return bootPromise.then(() => {
      const want = [...new Set(keys || [])].filter((k) => k in hashes);
      return Promise.all(want.map(fetchKey)).then(() => want);
    });
  }

  const api = {
    /** The boot index itself, once it has arrived. */
    boot: () => bootPromise,
    ensure,
    ensureAll: () => bootPromise.then(() => ensure(Object.keys(hashes))),
    ensureViewport: (bbox) => bootPromise.then(() => ensure([...shardsInBounds(index, bbox)])),
    ensureNear: (lat, lon, km = 300) => bootPromise.then(() => ensure([...shardsNear(index, lat, lon, km)])),
    ensureIds: (ids) => bootPromise.then(() => ensure(
      (ids || []).map((id) => index.keyOf.get(id)).filter(Boolean),
    )),

    /** True once every shard is in. */
    isComplete: () => !!boot && Object.keys(hashes).every((k) => chunks[k]),

    /**
     * Everything loaded so far as { meta, destinations, ...top }, in the
     * master's order, or null before the boot index. The same object is
     * returned until another shard arrives, so it is safe as a React
     * dependency.
     */
    snapshot() {
      if (!boot) return null;
      if (cached && cached.version === version) return cached.value;
      const { core } = mergeCatalogue(boot, chunks);
      cached = { version, value: core };
      return core;
    },

    /** Loaded and total shards, and the keys fetched so far in order. */
    stats: () => ({
      loaded: Object.keys(chunks).length,
      total: Object.keys(hashes).length,
      requested: [...requested],
    }),

    /** Called (coalesced) after new records arrive. Returns an unsubscribe. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return api;
}
