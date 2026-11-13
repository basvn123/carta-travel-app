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

/** The median day (bed plus food, a person) at this style, or null. */
export function styleDayEur(style, destinations) {
  if (!style || !destinations || !Object.keys(destinations).length) return null;
  const req = priceRequest({ choices: { ...choicesFromStyle(style), price_view: 'pp', price_excluded: [] } });
  const days = [];
  for (const a of priceDays(destinations, req).values()) {
    const v = a && a.stayEur != null && a.foodEur != null ? a.stayEur + a.foodEur : null;
    if (v != null && Number.isFinite(v)) days.push(v);
  }
  if (!days.length) return null;
  days.sort((a, b) => a - b);
  const mid = Math.floor(days.length / 2);
  return days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2;
}
