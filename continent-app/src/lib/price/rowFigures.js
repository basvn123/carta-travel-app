// The figures an Explore list row shows (G12, D10; explore-polish decision
// change 3, owner 2026-11-17). The row says its unit on the figure: "/day" a
// person, or "/day for {n}" for the whole group, never "total", because the
// figure is bed and food for one day and leaves the flight and local
// transport out. So the group figure is a day for everyone (seats), not the
// stay (seats x nights) that useDayView's total view multiplies to.
//
// Pure on purpose: no i18n, no request import, so a node test can pin the
// arithmetic the row puts on screen.

const cents = (v) => Math.round(v * 100) / 100;
const fin = (v) => (Number.isFinite(v) ? v : null);

/**
 * @param {object|null} cost the Explore cost row (dayEur, stayEur, foodEur)
 * @param {{group?: boolean, seats?: number}} view group view and its seats
 * @returns {{group:boolean, seats:number, day:number|null, bed:number|null,
 *   food:number|null, plus:boolean}} the shown amounts; `plus` is true only
 *   when the whole euros on screen add up (round(bed) + round(food) ===
 *   round(day)), so the "+" between the wagons never shows a wrong sum.
 */
export function rowFigures(cost, { group = false, seats = 1 } = {}) {
  const n = group ? Math.max(1, Math.round(seats) || 1) : 1;
  const times = (eur) => (fin(eur) == null ? null : cents(eur * n));
  const day = times(cost?.dayEur);
  const bed = times(cost?.stayEur);
  const food = times(cost?.foodEur);
  const plus = day != null && bed != null && food != null
    && Math.round(bed) + Math.round(food) === Math.round(day);
  return { group: !!group, seats: n, day, bed, food, plus };
}

/** The i18n key and params for the visible unit after the figure. */
export function rowUnit({ group, seats }) {
  return group ? ['card.perDayGroup', { n: seats }] : ['card.perDay', {}];
}
