/** `rows` in the order `snap` (id to index) remembers; rows it does not know
 *  keep their own order after the known ones. Pure, for the test. */
export function reorder(rows, snap) {
  if (!snap || !Array.isArray(rows)) return rows;
  const at = (r) => (snap.has(r?.id) ? snap.get(r.id) : Infinity);
  return rows.slice().sort((a, b) => at(a) - at(b));
}
