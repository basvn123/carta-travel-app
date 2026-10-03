/**
 * bootIndex.js, the split between the boot index and the per-country
 * destination records, and the merge that puts them back together.
 *
 * Pure functions, shared by scripts/sync-data.mjs (which splits the core
 * wire at build time) and src/lib/appData.js (which merges it in the
 * browser), so the two halves can never drift. See dataHost.js for where
 * each half is served from and Execution/P3/T054-wire-shards-to-r2.md for
 * why.
 *
 * The boot index, /boot.json:
 *
 *   { v: 1, meta, top, cols: [...], d: [[id, lat, lon, cc, f, r], ...],
 *     chunks: { "<shard key>": "<content hash>" }, tiles: { "<cc>": deg } }
 *
 *   id    destination id, the key in data.destinations
 *   lat   latitude, lon longitude, as the master has them
 *   cc    ISO 3166 alpha-2 (the record's iso2), or null
 *   f     static flags, a bitfield of FLAG below
 *   r     rating band: rating.tier (0 to 3), 0 when unrated
 *
 * Rows are arrays rather than objects because at 25,000 destinations every
 * repeated key costs ~100 KB. Row order is the master's order, which the
 * merge preserves, because several screens break ties on iteration order.
 *
 * Each shard, /dest/<key>.json, is { "<id>": record } where record is the
 * destination exactly as the core wire had it, minus the fields the boot row
 * already carries (id, lat, lon, iso2). A field is only moved into the row
 * when it has its canonical shape (a finite number, a two-letter code);
 * anything irregular stays in the record, so the merge is exact either way.
 *
 * A shard is a region (T059). A country whose records fit in SHARD_BYTES is
 * one shard, keyed by its code ("BE"). A bigger one is cut into square grid
 * tiles of `tiles[cc]` degrees, the largest of 8, 4, 2 or 1 that brings
 * every tile under the budget, keyed "<cc>_<deg>_<row>_<col>" with row and
 * col the floor of lat/deg and lon/deg ("IT_2_22_6"). A row with no position
 * stays in the country's own shard. So a map looking at Naples fetches the
 * tile around Naples, not all of Italy, and the shard size stays bounded as
 * the catalogue grows instead of growing with the country. shardKey() is
 * the one rule, used by the split, the merge and catalogue.js.
 *
 * The rank tier, /dest/_rank.json (T271). The default screens rank the whole
 * of Europe by price, rating and kind, so before T271 the first paint waited
 * for every shard. The rank tier is the part of each record those screens
 * read: the cost inputs (accommodation, costs, local transport, transfer,
 * tolls), the rating and beauty blocks, the kind and size fields, and what a
 * card shows on its face. RANK_FIELDS is the list. It is columnar and
 * pooled: one array of distinct values per field and one row of indexes per
 * destination, in boot row order, because most of these blocks repeat (90
 * distinct cost baskets and 257 distinct stay blocks across 3,868 places).
 *
 *   { v: 1, key, fields: [...], pools: [[value, ...], ...], rows: [[i, ...], ...] }
 *
 * An index of -1 means the record has no such field. `key` is the boot
 * index's `rank.key`, a hash of the boot rows, so a rank file can never be
 * paired with a boot index whose rows are in another order. The merge turns a
 * rank row into a lite record ({ _lite: true, ... }) for every destination
 * whose shard has not arrived yet; the shard's record replaces it whole.
 */

export const BOOT_VERSION = 1;
export const BOOT_COLS = Object.freeze(['id', 'lat', 'lon', 'cc', 'f', 'r']);

/** Bits of the `f` column. Static facts a pin can use before detail loads. */
export const FLAG = Object.freeze({
  AIRPORT: 1, // tier === 'airport': an anchor airport, not a gem town
  HIDDEN_GEM: 2, // rating.hidden_gem
  UNESCO: 4, // categories include 'unesco'
});

/** Country-file key for a record with no usable iso2. ZZ is user-assigned. */
export const NO_COUNTRY = 'ZZ';

/** A country above this many bytes of records is cut into grid tiles. */
export const SHARD_BYTES = 256 * 1024;
const TILE_DEGREES = [8, 4, 2, 1];

const CC_RE = /^[A-Z]{2}$/;
const isCoord = (v) => typeof v === 'number' && Number.isFinite(v);

function flagsOf(rec) {
  let f = 0;
  if (rec.tier === 'airport') f |= FLAG.AIRPORT;
  if (rec.rating?.hidden_gem === true) f |= FLAG.HIDDEN_GEM;
  if (Array.isArray(rec.categories) && rec.categories.includes('unesco')) f |= FLAG.UNESCO;
  return f;
}

function bandOf(rec) {
  const t = rec.rating?.tier;
  return Number.isInteger(t) && t >= 0 && t <= 3 ? t : 0;
}

/**
 * The shard a boot row's record lives in, given the index's `tiles` table.
 * An index without tiles (T054's) keys every shard by country.
 */
export function shardKey(row, tiles) {
  const [, lat, lon, cc] = row;
  const key = cc || NO_COUNTRY;
  const deg = tiles?.[key];
  if (!deg || !isCoord(lat) || !isCoord(lon)) return key;
  return `${key}_${deg}_${Math.floor(lat / deg)}_${Math.floor(lon / deg)}`;
}

/**
 * Split a core wire ({ meta, destinations, ...rest }) into the boot index
 * (without chunk hashes, which the caller adds once it has serialised each
 * shard) and the per-shard record maps. `shardBytes` is for tests.
 */
export function splitCatalogue(core, { shardBytes = SHARD_BYTES } = {}) {
  const { meta, destinations, ...top } = core || {};
  const d = [];
  const byCountry = {};
  const sizes = new Map();   // id -> serialised bytes of its record
  for (const [id, src] of Object.entries(destinations || {})) {
    const rec = { ...src };
    // The key is the id; drop the field only when it says the same thing.
    if (rec.id === id) delete rec.id;
    const lat = isCoord(rec.lat) ? rec.lat : null;
    const lon = isCoord(rec.lon) ? rec.lon : null;
    const cc = typeof rec.iso2 === 'string' && CC_RE.test(rec.iso2) ? rec.iso2 : null;
    if (lat != null) delete rec.lat;
    if (lon != null) delete rec.lon;
    if (cc != null) delete rec.iso2;
    const row = [id, lat, lon, cc, flagsOf(src), bandOf(src)];
    d.push(row);
    (byCountry[cc || NO_COUNTRY] ||= []).push([row, rec]);
    sizes.set(id, JSON.stringify(rec).length + id.length + 4);
  }

  // The coarsest grid that brings every tile of an oversized country under
  // the budget; 1 degree when none does (a dense city can outgrow any grid).
  const tiles = {};
  for (const [key, entries] of Object.entries(byCountry)) {
    const total = entries.reduce((a, [row]) => a + sizes.get(row[0]), 0);
    if (total <= shardBytes) continue;
    tiles[key] = TILE_DEGREES.find((deg) => {
      const per = new Map();
      for (const [row] of entries) {
        const k = shardKey(row, { [key]: deg });
        per.set(k, (per.get(k) || 0) + sizes.get(row[0]));
      }
      return Math.max(...per.values()) <= shardBytes;
    }) || TILE_DEGREES[TILE_DEGREES.length - 1];
  }

  const chunks = {};
  for (const entries of Object.values(byCountry)) {
    for (const [row, rec] of entries) (chunks[shardKey(row, tiles)] ||= {})[row[0]] = rec;
  }
  const boot = { v: BOOT_VERSION, meta: meta ?? null, top, cols: [...BOOT_COLS], d, chunks: {}, tiles };
  return { boot, chunks };
}

/** The shards a boot index needs, as [key, hash] pairs. */
export function chunkList(boot) {
  return Object.entries(boot?.chunks || {});
}

/** Published path of the rank tier, inside dest/ so it travels with the shards. */
export const RANK_PATH = '/dest/_rank.json';
export const RANK_VERSION = 1;

/**
 * The fields of a record that the default screens read before any shard has
 * arrived, and how much of each: `true` is the whole value, `{ pick }` keeps
 * only those keys of an object, `{ omit }` drops those keys. Anything not
 * listed (the climate table, the POI list, the guide, the members,
 * the rating components and the rest) arrives with the shard.
 *
 * What decides the list: every field useDestinationSearch, composeTrip,
 * hydrateForOrigin, computeCosts and useExploreCatalog read to filter, price
 * and order, plus what an Explore or Destinations card prints on its face.
 * tests/rankTier.test.mjs prices every destination from the lite record and
 * from the full one and requires the same answer, so a pricing input left
 * out of this list fails the test, not the traveller.
 */
export const RANK_FIELDS = Object.freeze({
  city: true,
  country: true,
  tier: true,
  iata: true,
  anchor_airport: true,
  anchor_estimated: true,
  no_ryanair_route: true,
  city_lat: true,
  city_lon: true,
  country_rank: true,
  country_n: true,
  country_badge: true,
  tags: true,
  categories: true,
  blurb: true,
  transfer: true,
  driving_toll: true,
  costs: true,
  local_transport: true,
  place: true,
  crowding: true,
  accommodation: true,
  rating: { omit: ['components'] },
  beauty: { omit: ['components'] },
  bathing_water: { omit: ['nearest'] },
  image: { pick: ['url', 'w', 'h'] },
  climate: { pick: ['best'] },
});

function projectField(value, how) {
  if (how === true || value == null || typeof value !== 'object' || Array.isArray(value)) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (how.pick && !how.pick.includes(k)) continue;
    if (how.omit && how.omit.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * The rank tier for a boot index and the records it was split from (the
 * shard records, keyed by id, without the fields the boot row carries).
 * `key` is the caller's hash of boot.d (sync-data.mjs uses sha256), stored
 * in both files.
 */
export function buildRankTier(boot, recordsById, key) {
  const fields = Object.keys(RANK_FIELDS);
  const pools = fields.map(() => []);
  const seen = fields.map(() => new Map());
  const rows = (boot?.d || []).map(([id]) => {
    const rec = recordsById[id] || {};
    return fields.map((f, i) => {
      if (!(f in rec)) return -1;
      const v = projectField(rec[f], RANK_FIELDS[f]);
      const s = JSON.stringify(v);
      let at = seen[i].get(s);
      if (at === undefined) {
        at = pools[i].length;
        pools[i].push(v);
        seen[i].set(s, at);
      }
      return at;
    });
  });
  return { v: RANK_VERSION, key, fields, pools, rows };
}

/**
 * The rank tier as one lite record per boot row ({ id: rest }, the same
 * shape a shard holds, plus `_lite: true`), or null when the file does not
 * belong to this boot index. Pooled values are shared between records, as
 * the shard's records are not; nothing in the app writes into a record.
 */
export function decodeRankTier(boot, rank) {
  if (!boot?.rank || !rank || rank.v !== RANK_VERSION || rank.key !== boot.rank.key) return null;
  if (!Array.isArray(rank.rows) || rank.rows.length !== (boot.d || []).length) return null;
  const { fields, pools } = rank;
  if (!Array.isArray(fields) || !Array.isArray(pools)) return null;
  const out = {};
  boot.d.forEach(([id], r) => {
    const row = rank.rows[r];
    const rec = { _lite: true };
    for (let i = 0; i < fields.length; i += 1) {
      const at = row[i];
      if (at >= 0) rec[fields[i]] = pools[i][at];
    }
    out[id] = rec;
  });
  return out;
}

/**
 * Rebuild the core wire from a boot index and its shards
 * ({ "<shard key>": { id: record } }, see shardKey). Returns { meta, destinations, ...top } in
 * the master's destination order. A row whose record is missing (a boot
 * index and a shard from two different builds, briefly, at the edge)
 * is skipped and counted in `missing`, not thrown: one absent town is a
 * smaller failure than no map.
 *
 * `lite` (decodeRankTier's output) fills in every row whose shard has not
 * arrived with its rank record, so the default screens can rank all of
 * Europe before the detail lands. Those rows are counted in `lite`, not in
 * `missing`.
 */
export function mergeCatalogue(boot, chunkMap, lite = null) {
  if (!boot || boot.v !== BOOT_VERSION || !Array.isArray(boot.d)) {
    throw new Error('boot index missing or of an unknown version');
  }
  const destinations = {};
  let missing = 0;
  let liteCount = 0;
  for (const row of boot.d) {
    const [id, lat, lon, cc] = row;
    let rest = chunkMap?.[shardKey(row, boot.tiles)]?.[id];
    if (!rest && lite?.[id]) { rest = lite[id]; liteCount += 1; }
    if (!rest) { missing += 1; continue; }
    const rec = { id, ...rest };
    if (lat != null) rec.lat = lat;
    if (lon != null) rec.lon = lon;
    if (cc != null) rec.iso2 = cc;
    destinations[id] = rec;
  }
  const core = { ...(boot.top || {}), meta: boot.meta, destinations };
  // A catalogue holding any lite record says so at the top, where it
  // survives hydrateForOrigin's copy, so a screen that needs the detail of
  // every place can wait for the rest (App.jsx).
  if (liteCount) core.partial = true;
  return { core, missing, lite: liteCount };
}

/**
 * The boot rows as objects, for code that wants a pin before the detail
 * files arrive (P15's pin tiles will read the same columns).
 */
export function decodeBootIndex(boot) {
  return (boot?.d || []).map(([id, lat, lon, cc, f, r]) => ({
    id,
    lat,
    lon,
    cc,
    airport: !!(f & FLAG.AIRPORT),
    hiddenGem: !!(f & FLAG.HIDDEN_GEM),
    unesco: !!(f & FLAG.UNESCO),
    band: r,
  }));
}
