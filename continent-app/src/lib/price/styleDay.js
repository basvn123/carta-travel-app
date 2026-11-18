/**
 * price/styleDay.js: what a travel style costs, so a style is chosen knowing
 * its price (decision 0011, ROADMAP G12). One figure per style: a person's
 * bed and food for one day at the middle place of the catalogue (the median
 * of every place the engine can price), from the engine's own day prices
 * (priceDays, the ones Explore's cards print), at the style's party, bed and
 * Lifestyle. No flight, no getting around, no guess: a style the engine
 * cannot price returns null and shows no figure.
 */
import { priceDays } from './priceDay.js';
import { priceRequest } from './request.js';
import { choicesFromStyle } from '../travelStyles.js';

/**
 * The figures already worked out, per catalogue (a WeakMap, so a new
 * catalogue drops them) and per priced part of a style. Pricing one style
 * walks every place (about 3,350), and every list of style figures asks
 * again after any save (G12 fixes r1 A4: Save froze the page for seconds),
 * so a style whose party, bed and table did not change costs nothing now.
 */
const KNOWN = new WeakMap();
const KNOWN_MAX = 64;

const pricedKey = (c) => JSON.stringify([c.group_size, c.children, c.babies, c.stay_tier, c.lifestyle, c.transport_mode]);

/** The median day (bed plus food, a person) at this style, or null. */
export function styleDayEur(style, destinations) {
  if (!style || !destinations || !Object.keys(destinations).length) return null;
  const choices = choicesFromStyle(style);
  const key = pricedKey(choices);
  let byKey = KNOWN.get(destinations);
  if (!byKey) { byKey = new Map(); KNOWN.set(destinations, byKey); }
  if (byKey.has(key)) return byKey.get(key);
  const v = medianDay(choices, destinations);
  if (byKey.size >= KNOWN_MAX) byKey.delete(byKey.keys().next().value);
  byKey.set(key, v);
  return v;
}

function medianDay(choices, destinations) {
  const req = priceRequest({ choices: { ...choices, price_view: 'pp', price_excluded: [] } });
  const days = [];
  for (const a of priceDays(destinations, req).values()) {
    // A place that cannot price this bed falls back to another tier
    // (tierFallback); counting it priced a dorm at a hotel's rate, so a
    // hostel read dearer than a 3-star (flow-1 M1). Left out, as
    // typicalNight in priceDay.js leaves it out.
    if (!a || a.tierFallback) continue;
    const v = a.stayEur != null && a.foodEur != null ? a.stayEur + a.foodEur : null;
    if (v != null && Number.isFinite(v)) days.push(v);
  }
  if (!days.length) return null;
  days.sort((a, b) => a - b);
  const mid = Math.floor(days.length / 2);
  return days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2;
}
