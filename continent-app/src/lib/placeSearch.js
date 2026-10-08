/**
 * placeSearch.js, how the Destinations search field ranks the catalogue
 * towns it suggests (T384, brief V3-7).
 *
 * The field used to keep the first six names that started with the term and
 * pad with names that merely contained it, in catalogue order, so "gent"
 * offered Agrigento before anything else and a place whose name IS the term
 * could sit under five longer ones. A traveller types a place's name, so the
 * order is the order a name matches in:
 *
 *   0  the whole name is the term          "Bled" for bled
 *   1  the name starts with the term       "Bledsoe" for bled
 *   2  a word inside the name starts with  "Monte Argentario" for arg
 *   3  the term sits inside a word         "Agrigento" for gent
 *
 * Inside one rank the shorter name comes first (the term is more of it),
 * then the alphabet. Matching is accent and case blind through the same
 * fold the tab uses, so "zurich" finds Zurich and "lodz" finds Lodz.
 *
 * What it cannot do: find Ghent from "Gent". The catalogue carries one name
 * per town (checked on public/dest/BE.json, 2026-10-08) and no local or
 * exonym names, so a local name reaches nothing until the wire carries them.
 */

/** Lower case, accents stripped, the l with stroke folded (NFD leaves it). */
export function foldName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l');
}

/** The rank of one name for a folded term, or -1 when it does not match. */
export function nameRank(name, q) {
  if (!q) return -1;
  const n = foldName(name);
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  const at = n.indexOf(q);
  if (at < 0) return -1;
  // A word starts after a space, a hyphen, an apostrophe or a stop:
  // "Saint-Malo", "L'Aquila", "St. Ives".
  for (let i = at; i >= 0; i = n.indexOf(q, i + 1)) {
    if (i > 0 && /[\s\-'’.]/.test(n[i - 1])) return 2;
  }
  return 3;
}

/**
 * The best `limit` towns for a folded term, from rows shaped like the tab's
 * destIndex ({ city, ... }). Rows that do not match are left out.
 */
export function rankPlaces(rows, q, limit = 6) {
  if (!q) return [];
  const hits = [];
  for (const row of rows || []) {
    const r = nameRank(row.city, q);
    if (r >= 0) hits.push({ row, r, len: String(row.city || '').length });
  }
  hits.sort((a, b) => (a.r - b.r) || (a.len - b.len)
    || String(a.row.city).localeCompare(String(b.row.city)));
  return hits.slice(0, limit).map((h) => h.row);
}
