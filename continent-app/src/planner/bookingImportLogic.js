/**
 * bookingImportLogic.js, the pure half of the magic-import client: how a
 * parsed answer folds into the trip's booking rows and Activity Inbox.
 *
 * No imports on purpose: bookingImport.js (which pulls in the Supabase
 * client, and through it import.meta.env) re-exports everything here, while
 * the Node tests (scripts/ai/test_import_logic.mjs) import THIS file
 * directly, the same split plan-day/logic.mjs lives by.
 */

// Client-side mirror of the server's whitelist, so a wrong file type is a
// friendly message before upload rather than a silent server-side drop.
export const IMPORT_MIMES = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'text/plain': ['.txt'],
};
export const IMPORT_ACCEPT = Object.values(IMPORT_MIMES).flat().join(',');
export const MAX_IMPORT_FILES = 4;
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;        // per file
export const MAX_IMPORT_TOTAL_BYTES = 6 * 1024 * 1024;  // per request

/** The mime we will claim for a file, from type or (Windows loves this) the
 *  bare extension when the OS supplies no type at all. Null = not accepted. */
export function importMime(file) {
  if (IMPORT_MIMES[file.type]) return file.type;
  const ext = `.${(file.name || '').split('.').pop().toLowerCase()}`;
  for (const [mime, exts] of Object.entries(IMPORT_MIMES)) {
    if (exts.includes(ext)) return mime;
  }
  return null;
}

const norm = (s) => String(s || '').toLowerCase();

/** The booking-row key a parsed booking belongs to, or null for a custom row.
 *  rowKeys: the keys TripItinerary built; cities: stop cities in trip order. */
export function matchBookingRow(b, rowKeys, cities) {
  const has = (k) => rowKeys.includes(k);
  if (b.kind === 'flight_out') return has('flight-out') ? 'flight-out' : has('flight') ? 'flight' : null;
  if (b.kind === 'flight_home') return has('flight-home') ? 'flight-home' : has('flight') ? 'flight' : null;
  if (b.kind === 'flight') {
    return has('flight') ? 'flight' : has('flight-out') ? 'flight-out' : null;
  }
  if (b.kind === 'stay') {
    // By named city first; a one-stop trip needs no name to match.
    const i = cities.findIndex((c) => b.city && (norm(c).includes(norm(b.city)) || norm(b.city).includes(norm(c))));
    if (i >= 0 && has(`stay-${i}`)) return `stay-${i}`;
    if (cities.length === 1 && has('stay-0')) return 'stay-0';
    return null;
  }
  if (b.kind === 'car') return has('car') ? 'car' : null;
  return null; // transfer / activity / other become custom rows
}

/**
 * Fold parsed bookings into the extras' bookings map. Fills EMPTY fields
 * only, marks everything it touched with ai: true (the "Auto-filled" badge),
 * and turns unmatched bookings into labelled custom rows. Returns
 * { bookings, filled } where filled counts rows that actually changed.
 */
export function applyParsedBookings(parsed, { bookings, rowKeys, cities, stamp = Date.now() }) {
  const next = { ...bookings };
  let filled = 0;
  let customSeq = 0;
  for (const b of parsed || []) {
    const rowKey = matchBookingRow(b, rowKeys, cities)
      || `custom:${stamp}-${customSeq++}`;
    const cur = next[rowKey] || {};
    const isCustom = rowKey.startsWith('custom:');
    const patch = {};
    if (!cur.ref && b.code) patch.ref = b.code;
    if ((cur.price == null || cur.price === '') && b.eur != null) patch.price = String(b.eur);
    if (!cur.url && b.link) patch.url = b.link;
    if (isCustom && !cur.label) {
      patch.label = b.title + (b.city && !norm(b.title).includes(norm(b.city)) ? `, ${b.city}` : '');
    }
    if (!Object.keys(patch).length) continue;
    next[rowKey] = { ...cur, ...patch, ai: true };
    filled += 1;
  }
  return { bookings: next, filled };
}

/** Parsed activities -> Activity Inbox items (deduped against what is already
 *  staged or placed, by folded name). */
export function toInboxItems(parsed, { existingNames = [], stamp = Date.now() } = {}) {
  const seen = new Set(existingNames.map(norm));
  const items = [];
  for (const a of parsed || []) {
    if (seen.has(norm(a.name))) continue;
    seen.add(norm(a.name));
    items.push({
      id: `imp-${stamp}-${items.length}`,
      name: a.name,
      city: a.city || '',
      eur: a.eur ?? null,
      durationMin: a.durationMin ?? null,
      note: a.note || '',
      day: a.day ?? null,
    });
  }
  return items;
}
