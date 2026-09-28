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
 *     chunks: { "<cc>": "<content hash>" } }
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
 * Each country file, /dest/<cc>.json, is { "<id>": record } where record is
 * the destination exactly as the core wire had it, minus the fields the boot
 * row already carries (id, lat, lon, iso2). A field is only moved into the
 * row when it has its canonical shape (a finite number, a two-letter code);
 * anything irregular stays in the record, so the merge is exact either way.
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
 * Split a core wire ({ meta, destinations, ...rest }) into the boot index
 * (without chunk hashes, which the caller adds once it has serialised each
 * country file) and the per-country record maps.
 */
export function splitCatalogue(core) {
  const { meta, destinations, ...top } = core || {};
  const d = [];
  const chunks = {};
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
    d.push([id, lat, lon, cc, flagsOf(src), bandOf(src)]);
    (chunks[cc || NO_COUNTRY] ||= {})[id] = rec;
  }
  const boot = { v: BOOT_VERSION, meta: meta ?? null, top, cols: [...BOOT_COLS], d, chunks: {} };
  return { boot, chunks };
}

/** The country files a boot index needs, as [key, hash] pairs. */
export function chunkList(boot) {
  return Object.entries(boot?.chunks || {});
}

/**
 * Rebuild the core wire from a boot index and its country files
 * ({ "<cc>": { id: record } }). Returns { meta, destinations, ...top } in
 * the master's destination order. A row whose record is missing (a boot
 * index and a country file from two different builds, briefly, at the edge)
 * is skipped and counted in `missing`, not thrown: one absent town is a
 * smaller failure than no map.
 */
export function mergeCatalogue(boot, chunkMap) {
  if (!boot || boot.v !== BOOT_VERSION || !Array.isArray(boot.d)) {
    throw new Error('boot index missing or of an unknown version');
  }
  const destinations = {};
  let missing = 0;
  for (const [id, lat, lon, cc] of boot.d) {
    const rest = chunkMap?.[cc || NO_COUNTRY]?.[id];
    if (!rest) { missing += 1; continue; }
    const rec = { id, ...rest };
    if (lat != null) rec.lat = lat;
    if (lon != null) rec.lon = lon;
    if (cc != null) rec.iso2 = cc;
    destinations[id] = rec;
  }
  return { core: { ...(boot.top || {}), meta: boot.meta, destinations }, missing };
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
