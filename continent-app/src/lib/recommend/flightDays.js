/**
 * T855: a finder trip moved onto the days its flight flies, so check-in is
 * the day the flight lands and check-out the day the flight home leaves.
 * The same shift both ways keeps the nights; otherwise the last place gains
 * or loses the difference, at most MAX_NIGHTS_CHANGE nights, so a week
 * never turns into a weekend to fit a fare. Pure; used by the flight
 * adapter (which legs to take) and priceCandidate (the move itself).
 */
export const MAX_NIGHTS_CHANGE = 2;

const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/**
 * The candidate (or trip) on the flight days `to` ({ out, back }), marked
 * movedOntoFlight with shiftedBy the days check-in moved, or null when it
 * cannot move there.
 */
export function movedOnto(c, to) {
  if (!to?.out || !to?.back || !c?.dates?.out || !c?.dates?.back || !Array.isArray(c.places)) return null;
  const nights = dayDiff(to.out, to.back);
  const delta = nights - c.nights;
  const last = c.places[c.places.length - 1];
  if (nights < 1 || !last || last.nights + delta < 1 || Math.abs(delta) > MAX_NIGHTS_CHANGE) return null;
  const places = delta ? [...c.places.slice(0, -1), { ...last, nights: last.nights + delta }] : c.places;
  return { ...c, dates: { out: to.out, back: to.back }, nights, places, shiftedBy: dayDiff(c.dates.out, to.out), movedOntoFlight: true };
}
