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

/*
 * The review lifecycle (migration 043).
 *
 * Every override carries a status, a review date and the admin's reason. They
 * live in the table beside the patch but travellers never see them: 043
 * grants the public read on layer, item_id and patch only, which is exactly
 * what overridesReady() selects. A stale or overdue patch still applies to
 * travellers until someone reverts it; the lifecycle nags the admin, it never
 * silently changes what the site shows.
 *
 * The helpers below are the admin page's single reading of those fields, so
 * the grid, the review list and the editor cannot disagree about what counts
 * as overdue. They mirror the rules admin_set_override enforces; the server
 * stays the authority, these only let the page say no before a round trip.
 */

/** Order matters: the editor offers them in this order. */
export const OVERRIDE_STATUSES = ['temporary', 'verified', 'stale'];

/** A new override is due back in 30 days unless the admin picks otherwise. */
export const DEFAULT_REVIEW_DAYS = 30;

/** 043 refuses a review date more than 366 days out; the page offers 365. */
export const MAX_REVIEW_DAYS = 365;

/** 043 refuses a reason shorter than this. */
export const MIN_REASON_CHARS = 10;

/** The sentence 043 backfilled into rows that had no note. It is not a
 *  reason, so the editor does not prefill it and neither end accepts it. */
export const BACKFILL_REASON = 'Made before review dates existed; no reason was recorded. Write the real one.';

const DAY_MS = 86400000;

/** 'YYYY-MM-DD' for a date input, in the admin's own time zone. */
export function toDateInput(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A date input's value as the ISO instant sent to the server: the END of
 *  that local day, so picking today still lands after now(). */
export function fromDateInput(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return null;
  const d = new Date(`${ymd}T23:59:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** The earliest and latest review date the editor offers, as input values. */
export function reviewDateBounds(now = Date.now()) {
  return {
    min: toDateInput(new Date(now)),
    max: toDateInput(new Date(now + MAX_REVIEW_DAYS * DAY_MS)),
  };
}

/** Default review date for a new override, as an input value. */
export function defaultReviewDate(now = Date.now()) {
  return toDateInput(new Date(now + DEFAULT_REVIEW_DAYS * DAY_MS));
}

/** True when the row is past its review date. Derived from the clock, never
 *  stored, the same way admin_list_overrides derives it. */
export function isOverdue(row, now = Date.now()) {
  if (!row || !row.reviewBy) return false;
  const t = new Date(row.reviewBy).getTime();
  return Number.isFinite(t) && t < now;
}

/** Whole days since the review date passed (0 on the day itself). */
export function daysOverdue(row, now = Date.now()) {
  if (!isOverdue(row, now)) return 0;
  return Math.floor((now - new Date(row.reviewBy).getTime()) / DAY_MS);
}

/** 'overdue' | 'stale' | 'ok' | null (no row). Overdue wins over stale: a
 *  date that has passed is the more urgent fact. */
export function reviewState(row, now = Date.now()) {
  if (!row) return null;
  if (isOverdue(row, now)) return 'overdue';
  if (row.status === 'stale') return 'stale';
  return 'ok';
}

/** The rows that need a person: overdue or stale, most overdue first. */
export function rowsNeedingReview(rows, now = Date.now()) {
  return (rows || [])
    .filter((r) => reviewState(r, now) !== 'ok')
    .sort((a, b) => new Date(a.reviewBy).getTime() - new Date(b.reviewBy).getTime());
}

/**
 * The same checks admin_set_override makes on a save, in the same order
 * after the patch, answering the server's own error word or null. `stored`
 * is the reason already on the row, which the server keeps when none is
 * given.
 */
export function reviewProblem({ status, reviewBy, reason, stored }, now = Date.now()) {
  if (!OVERRIDE_STATUSES.includes(status)) return 'bad_status';
  const t = reviewBy ? new Date(reviewBy).getTime() : NaN;
  if (!Number.isFinite(t) || t <= now || t > now + 366 * DAY_MS) return 'bad_review_by';
  const kept = (stored || '').trim() === BACKFILL_REASON ? '' : (stored || '').trim();
  const text = (reason || '').trim() || kept;
  if (text.length < MIN_REASON_CHARS || text.length > 500) return 'note_required';
  return null;
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

/*
 * Orphan patch detection (T075).
 *
 * The pipeline can drop items (a beach closed, a lake drained, a mountain
 * removed from the catalogue). An override targeting a dropped ID is orphaned:
 * it targets nothing in the current catalogue and is dead weight. These
 * helpers detect and report orphans to the admin so the table stays honest.
 */

/** Build a Set of all valid item IDs across all layers and countries from
 *  the live catalogue files. Fetches index.json for each layer, which lists
 *  the countries; then fetches one file per country and layer, extracting
 *  all IDs from the array. Returns { layer -> Set(ids) }. On any fetch
 *  failure, returns empty for that layer. Does not block the page. */
export async function fetchValidItemIds() {
  const layers = ['beach', 'lake', 'mountain', 'trail'];
  const dirs = {
    beach: 'beaches',
    lake: 'lakes',
    mountain: 'mountains',
    trail: 'trails',
  };

  const result = {};
  for (const layer of layers) {
    result[layer] = new Set();
    const dir = dirs[layer];
    const arrayKey = layer === 'trail' ? 'trips' : `${layer}s`;
    try {
      // Fetch index to find all countries.
      const indexRes = await fetch(`/${dir}/index.json`);
      if (!indexRes.ok) continue;
      const index = await indexRes.json();
      const countries = (index.countries || [])
        .filter((c) => c && c.cc)
        .map((c) => c.cc);

      // Fetch each country file and extract IDs.
      for (const cc of countries) {
        try {
          const res = await fetch(`/${dir}/${cc}.json`);
          if (!res.ok) continue;
          const data = await res.json();
          const items = Array.isArray(data[arrayKey]) ? data[arrayKey] : [];
          for (const item of items) {
            if (item && item.id) {
              result[layer].add(String(item.id));
            }
          }
        } catch {
          // Skip this country file on error; continue with others.
        }
      }
    } catch {
      // Skip this layer on error; continue with others.
    }
  }
  return result;
}

/** Filter a list of overrides to keep only orphans: those whose item_id does
 *  not appear in the validIds map for their layer. validIds is the result of
 *  fetchValidItemIds(). Returns a filtered list. */
export function orphanOverrides(rows, validIds) {
  if (!rows || !validIds) return [];
  return rows.filter((row) => {
    const layerIds = validIds[row.layer];
    return !layerIds || !layerIds.has(String(row.itemId));
  });
}
