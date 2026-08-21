/**
 * Catalogue corrections, merged over the wire data as it loads.
 *
 * The pipeline writes beaches, lakes, mountains and trails into static
 * per-country JSON. That stays the source of truth. This module holds the
 * deliberate corrections a human made in the admin panel on top of it: a
 * better photograph, a fixed name, a one-line blurb, and two flags.
 *
 * Three properties worth keeping if this is edited again:
 *
 *   1. It NEVER blocks. The overrides are one small fetch, and every loader
 *      waits on it, so a slow or failed read must not hold the catalogue
 *      hostage. Failure resolves to an empty map and the wire data renders
 *      untouched.
 *   2. It is read once per session, like the wire files themselves. An edit
 *      in the admin panel reaches travellers on their next page load, which
 *      is the same promise site_config makes.
 *   3. Applying an override is a pure function on one item, so the merge
 *      point in each loader is a single .map() and nothing downstream has to
 *      know this layer exists.
 */
import { supabase } from './supabaseClient.js';

// layer -> Map(itemId -> patch)
let readyPromise = null;
let table = new Map();

function emptyTable() {
  return new Map([
    ['beach', new Map()], ['lake', new Map()], ['mountain', new Map()],
    ['trail', new Map()], ['dest', new Map()],
  ]);
}

/** Resolves once the overrides are loaded (or known to be unavailable). */
export function overridesReady() {
  if (readyPromise) return readyPromise;
  table = emptyTable();
  if (!supabase) {
    readyPromise = Promise.resolve(table);
    return readyPromise;
  }
  readyPromise = supabase
    .from('content_overrides')
    .select('layer,item_id,patch')
    .then(({ data, error }) => {
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const bucket = table.get(row.layer);
          if (bucket && row.item_id && row.patch && typeof row.patch === 'object') {
            bucket.set(String(row.item_id), row.patch);
          }
        }
      }
      return table;
    })
    .catch(() => table);
  return readyPromise;
}

/** The patch for one item, or null. Safe to call before the fetch resolves;
 *  it simply reports nothing, which is the correct answer for wire data. */
export function overrideFor(layer, id) {
  const bucket = table.get(layer);
  if (!bucket) return null;
  return bucket.get(String(id)) || null;
}

/**
 * One item with its correction applied, or null when it has been hidden.
 *
 * `imageKey` differs by layer: trails carry a single `img` string, everything
 * else carries an `images` array of {u, big}. Both are handled so callers can
 * stay uniform.
 */
export function applyOverride(layer, item, { imageKey = 'images' } = {}) {
  if (!item || !item.id) return item;
  const patch = overrideFor(layer, item.id);
  if (!patch) return item;
  if (patch.hidden === true) return null;

  const out = { ...item };
  if (typeof patch.name === 'string' && patch.name.trim()) out.name = patch.name.trim();
  if (typeof patch.blurb === 'string' && patch.blurb.trim()) out.blurb = patch.blurb.trim();
  if (patch.featured === true) out.featured = true;

  if (typeof patch.image === 'string' && patch.image.startsWith('https://')) {
    if (imageKey === 'img') {
      out.img = patch.image;
    } else {
      // Replace the lead photograph only. The rest of the gallery is still
      // the pipeline's, so a correction fixes the card without throwing away
      // everything else that was harvested.
      const rest = Array.isArray(item.images) ? item.images.slice(1) : [];
      out.images = [{ u: patch.image, big: patch.image, edited: true }, ...rest];
    }
  }
  return out;
}

/** Map a whole wire list through the overrides, dropping hidden entries and
 *  floating featured ones to the front without disturbing the rest. */
export function applyOverrides(layer, list, opts) {
  if (!Array.isArray(list)) return list;
  const kept = list.map((it) => applyOverride(layer, it, opts)).filter(Boolean);
  const featured = kept.filter((it) => it.featured);
  if (!featured.length) return kept;
  return [...featured, ...kept.filter((it) => !it.featured)];
}

/** Test seam: lets the harness install a table without a network round trip. */
export function __setOverridesForTest(rows) {
  table = emptyTable();
  for (const row of rows || []) {
    const bucket = table.get(row.layer);
    if (bucket) bucket.set(String(row.item_id), row.patch);
  }
  readyPromise = Promise.resolve(table);
}
