/**
 * countryCompare.js (T670): two or three countries side by side, the figures
 * that decide between them, each from the source the rest of the app prints
 * it from, so the comparison never disagrees with a card:
 *
 *   day         what a day costs one person at the traveller's Lifestyle, the
 *               median and the cheapest town (costIndex.computeCosts rows)
 *   night       a bed a night at the traveller's tier, median (same rows)
 *   food        food and drink a person a day, median (same rows)
 *   flight      the cheapest return from home in the trip's month, a seat,
 *               over every airport in the country (the swept flights file);
 *               any month when the trip has none
 *   weather     the median daytime high and rain in the trip's month
 *               (dest.climate.m)
 *   crowds      the share of its places marked crowded (crowding.tier 3+)
 *   best        the months the country is best in (country insights)
 *
 * A figure with too little behind it is null, never a guess. Plain JS, node
 * testable.
 */
import { cheapestReturn, cheapestReturnAnyMonth } from './flights/flights.js';
import { destAnchor } from './origins.js';

export const MAX_COMPARE = 3;

const median = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/** Crowds as a word the table can print: the share of places crowded. */
export function crowdBand(share) {
  if (share == null) return null;
  if (share < 0.25) return 'quiet';
  if (share < 0.5) return 'mixed';
  return 'busy';
}

/**
 * The comparison rows for up to three countries, in the order given.
 *
 * @param names       country names as the catalogue keys them
 * @param dayCosts    Map destId -> { dayEur, stayEur, foodEur } (computeCosts)
 * @param flightFile  the swept flights file from the traveller's home, or null
 * @param month       the trip's month as 1..12, or null
 * @param yearMonth   the same month as 'YYYY-MM' for the flights, or null
 * @param insights    { [country]: { best_months } }, or null
 */
export function compareCountries({
  names = [], destinations = {}, dayCosts = new Map(), flightFile = null, month = null, yearMonth = null, insights = null, now = Date.now(),
} = {}) {
  const picked = names.slice(0, MAX_COMPARE);
  const rows = picked.map((country) => {
    const ids = Object.keys(destinations).filter((id) => destinations[id]?.country === country);
    const costs = ids.map((id) => dayCosts.get(id)).filter(Boolean);
    const days = costs.map((c) => c.dayEur);
    const day = median(days);
    const dayMin = days.filter(Number.isFinite).length ? Math.min(...days.filter(Number.isFinite)) : null;
    const weather = month
      ? {
        high: median(ids.map((id) => destinations[id]?.climate?.m?.[month - 1]?.[0])),
        rain: median(ids.map((id) => destinations[id]?.climate?.m?.[month - 1]?.[2])),
      }
      : null;
    const tiers = ids.map((id) => destinations[id]?.crowding?.tier).filter(Number.isFinite);
    const crowdShare = tiers.length >= 3 ? tiers.filter((x) => x >= 3).length / tiers.length : null;
    let flight = null;
    if (flightFile) {
      const airports = [...new Set(ids.map((id) => destAnchor(destinations[id]) || id))];
      for (const ap of airports) {
        const r = yearMonth ? cheapestReturn(flightFile, ap, yearMonth, now) : cheapestReturnAnyMonth(flightFile, ap, now);
        const seat = r?.perSeat;
        if (Number.isFinite(seat) && (!flight || seat < flight.perSeat)) flight = { perSeat: seat, airport: ap, out: r.out, back: r.back };
      }
    }
    const best = Array.isArray(insights?.[country]?.best_months) ? insights[country].best_months : [];
    return {
      country,
      iso2: destinations[ids[0]]?.iso2 || '',
      places: ids.length,
      day: costs.length >= 2 ? day : null,
      dayMin: costs.length >= 2 ? dayMin : null,
      night: costs.length >= 2 ? median(costs.map((c) => c.stayEur)) : null,
      food: costs.length >= 2 ? median(costs.map((c) => c.foodEur)) : null,
      flight,
      weather: weather && (weather.high != null || weather.rain != null) ? weather : null,
      crowds: crowdBand(crowdShare),
      best,
    };
  });
  // The cheapest day is marked once, as best value (carta-design: once per
  // view, a marker, not a selection).
  const withDay = rows.filter((r) => r.day != null);
  const cheapest = withDay.length >= 2 ? withDay.reduce((a, b) => (b.day < a.day ? b : a)) : null;
  return rows.map((r) => ({ ...r, bestValue: cheapest ? r === cheapest : false }));
}
