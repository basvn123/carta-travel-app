/**
 * Keeping a trip's stops and its dates in step (T836, T837; owner board
 * panels 1 and 5, 2026-10-29). When the dates and the nights at the stops
 * stop adding up, the traveller picks where the difference goes; nothing
 * moves until they pick.
 *
 * Pure: stops are [{ destinationId, nights }], dates are ISO days.
 */
import { addDaysUTC, nightsBetween } from './tripDates.js';

const sum = (stops) => stops.reduce((n, s) => n + Math.max(0, s.nights || 0), 0);

/**
 * New dates (start, end) against the stops. Returns [] when they add up,
 * else the choices, the suggested one first:
 *   { kind: 'stop', index, nights }  the difference goes to (or comes from)
 *                                    one stop, which keeps at least a night
 *   { kind: 'keep', end }            the stops stay; the end follows them
 */
export function datesOptions(stops, start, end) {
  const planned = sum(stops);
  const window = nightsBetween(start, end);
  if (!start || !end || window <= 0 || !stops.length || window === planned) return [];
  const diff = window - planned;
  const perStop = stops
    .map((s, index) => ({ kind: 'stop', index, nights: (s.nights || 0) + diff }))
    .filter((o) => o.nights >= 1);
  // More nights go to the last stop; fewer come from the longest stay.
  const pick = diff > 0
    ? perStop.length - 1
    : perStop.reduce((best, o, i) => (stops[o.index].nights > stops[perStop[best].index].nights ? i : best), 0);
  const ordered = perStop.length ? [perStop[pick], ...perStop.filter((_, i) => i !== pick)] : [];
  return [...ordered, { kind: 'keep', end: addDaysUTC(start, planned) }];
}

/**
 * One stop's nights changed from what the trip holds, inside fixed dates.
 * Returns [] when the trip has no dates, else the choices, the suggested one
 * first:
 *   { kind: 'end', end }               the trip's end moves by the difference
 *   { kind: 'stop', index, nights }    another stop gives (or takes) it and
 *                                      keeps at least a night
 */
export function nightsOptions(stops, index, nights, start, end) {
  const before = stops[index]?.nights ?? 0;
  const delta = nights - before;
  if (!delta || !start || !end) return [];
  const others = stops
    .map((s, i) => ({ kind: 'stop', index: i, nights: (s.nights || 0) - delta }))
    .filter((o) => o.index !== index && o.nights >= 1);
  return [{ kind: 'end', end: addDaysUTC(end, delta) }, ...others];
}

/** The stops after a choice: `index` set to `nights` and the option applied. */
export function applyNights(stops, option, changed = null) {
  return stops.map((s, i) => {
    if (changed && i === changed.index) return { ...s, nights: changed.nights };
    if (option?.kind === 'stop' && i === option.index) return { ...s, nights: option.nights };
    return s;
  });
}
