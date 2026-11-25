/**
 * searchMore.js, "Search more" on the list a trip at a time (G12 plan
 * rethink, owner decision 2026-11-25, "Show results early"). It took 6.4 to
 * 11.0 s on an emulated phone (4x CPU) with nothing on screen but a busy
 * button. Now each priced trip is handed out as soon as it is ready, with
 * how many tries are left, and the browser paints between tries.
 *
 *   searchMoreInSteps({ trips, input, ref, journeys, onSome, ... }) -> { month, library }
 *
 * Two parts, in the order they show on screen, so a later part only ever
 * appears below an earlier one:
 *   1. Another month: a cheaper week (alternatives.js weekLever) for the
 *      list's first `tries` complete trips, in the list's order, at most
 *      `monthMax`. They append in the order found and never re-sort: a
 *      cheaper week found later goes below the ones shown (G12: a shown card
 *      never moves). Before, the six were priced first and sorted by saving.
 *   2. Van Carta: the shortlisted journeys (moreSearch.js libraryTrip), each
 *      ranked alone, so its match and figures are final when it shows (a
 *      ranking over the row would move with each new trip; priorityPull is
 *      relative). The row shows from ROW_MIN trips (never a row of one),
 *      in the order priced, at most `libMax`. Over a ceiling: left out.
 *
 * `journeys` may be a promise (the files load while the months are priced).
 * onSome({ month, library, left }) after every try; `left` is the tries
 * still to run, null while the journeys are still loading.
 */
import { leavesOut, weekLever } from './alternatives.js';
import { LIBRARY_MAX, ROW_MIN, libraryTrip, seenRoutes } from './moreSearch.js';
import { rankTrips } from './rank.js';

const nextFrame = () => new Promise((r) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(r, 0));
  else setTimeout(r, 0);
});

export async function searchMoreInSteps({
  trips, input, ref = null, journeys = [], onSome = null, alive = () => true, yieldFrame = nextFrame,
  tries = 6, monthMax = 4, libMax = LIBRARY_MAX, lever = weekLever, price = undefined, rank = null,
} = {}) {
  const month = [];
  const pool = [];
  const library = () => (pool.length >= ROW_MIN ? pool.slice(0, libMax) : []);
  const bases = (trips || []).filter((x) => x && !leavesOut(x)).slice(0, tries);
  let list = Array.isArray(journeys) ? journeys.filter(Boolean) : null;
  const report = (left) => onSome?.({ month: month.slice(), library: library(), left });
  for (let i = 0; i < bases.length && month.length < monthMax; i++) {
    report(list ? bases.length - i + list.length : null);
    await yieldFrame();
    if (!alive()) return null;
    const w = lever(bases[i], input);
    if (w) month.push({ trip: w.trip, base: bases[i], diff: w.diff, month: w.month });
  }
  if (!list) list = ((await Promise.resolve(journeys).catch(() => [])) || []).filter(Boolean);
  if (!alive()) return null;
  const seen = seenRoutes(trips);
  const capped = input?.settings?.guide?.budget?.mode === 'cap';
  const rankOne = rank || ((x) => rankTrips([x], { settings: input.settings, taste: input.taste || null, data: input.data })[0]);
  for (let i = 0; i < list.length && pool.length < libMax && input?.settings; i++) {
    report(list.length - i);
    await yieldFrame();
    if (!alive()) return null;
    const raw = libraryTrip(list[i], input, ref, { seen, ...(price ? { price } : {}) });
    const trip = raw ? rankOne(raw) : null;
    if (!trip || (capped && Number.isFinite(trip.budget?.delta) && trip.budget.delta > 0)) continue;
    pool.push(trip);
  }
  const out = { month: month.slice(), library: library() };
  onSome?.({ ...out, left: 0 });
  return out;
}
