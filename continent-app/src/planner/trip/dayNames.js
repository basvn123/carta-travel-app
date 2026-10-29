/**
 * What a planned day holds, by name (T849): the day planner keeps a day's
 * places as indices into its town's list (DayPlannerTab itemsForStop): the
 * full coordinate list when the town has one (on the wire as items_full, or
 * fetched from the town's shard), else the short list, with the plan's own
 * places (prefs.customPois[destId]) after either. This builds the same list
 * so an index reads back as the same place. Pure.
 *
 *   dest      the stop's destination
 *   picks     the day's indices (assignments[stopIndex][dayIndex])
 *   fetched   { [destId]: items } from fetchDestPoiMap, or {}
 *   customs   prefs.customPois[destId] or []
 *
 * Returns the names in the day's order; an index with no place yet (a shard
 * still loading) is left out, never shown as a blank.
 */
export function townItems(dest, fetched = {}, customs = []) {
  const a = dest?.activities;
  if (!a) return customs;
  const full = a.items_full?.length ? a.items_full : fetched?.[dest.id];
  if (full?.length) return customs.length ? [...full, ...customs] : full;
  return [...(a.items || []), ...customs];
}

export function dayPlaceNames({ dest, picks = [], fetched = {}, customs = [] }) {
  if (!Array.isArray(picks) || !picks.length) return [];
  const items = townItems(dest, fetched, customs);
  return picks.map((i) => items[i]?.name).filter(Boolean);
}

/** Whether a town's names need its shard: it has a full list it does not carry. */
export function needsShard(dest) {
  const a = dest?.activities;
  return Boolean(a && !a.items_full?.length);
}
