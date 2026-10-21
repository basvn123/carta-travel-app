/**
 * How much of the day's structure the traveller wants to see (T501, owner
 * T492-c: morning, afternoon and evening are a gentle suggestion, never
 * forced). Three levels, chosen with the quiet "Detail" control above the
 * day and remembered per traveller on this device:
 *
 *   'list'   an ordered list of stops with the walks between (the default)
 *   'parts'  the same stops under Morning, Afternoon and Evening, with Lunch
 *            and Dinner as rows without amounts
 *   'hour'   the clock: every stop with its time, lunch, dinner, day done
 *
 * Browser storage is a convenience: every read and write is in try/catch and
 * the day reads correctly without it.
 */
export const DETAIL_LEVELS = ['list', 'parts', 'hour'];
export const DETAIL_STORE_KEY = 'carta.dayDetail.v1';

/** The store to use; reading window.localStorage can itself throw, so this
 *  is only ever called inside a try. */
function storeOf(store) {
  if (store !== undefined) return store;
  return typeof window !== 'undefined' ? window.localStorage : null;
}

export function normalizeDetail(v) {
  return DETAIL_LEVELS.includes(v) ? v : 'list';
}

export function loadDayDetail(store = undefined) {
  try {
    return normalizeDetail(storeOf(store)?.getItem(DETAIL_STORE_KEY));
  } catch {
    return 'list';
  }
}

export function saveDayDetail(level, store = undefined) {
  try {
    storeOf(store)?.setItem(DETAIL_STORE_KEY, normalizeDetail(level));
  } catch { /* private mode or blocked storage: the choice lasts this visit */ }
}
