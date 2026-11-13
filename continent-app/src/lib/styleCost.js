/**
 * styleCost.js: what a travel style costs, so a style is chosen knowing its
 * price (decision 0011 follow-up, ROADMAP G12). One figure per style: a
 * person's bed and food for one day at the middle place of the catalogue
 * (the median of every place the cost index can price), from the same
 * costIndex rows Explore's cards print, at the style's party, bed and
 * Lifestyle. No flight, no getting there, no guess: a style the index cannot
 * price returns null and shows no figure.
 */
import { costContext, costRow } from './costIndex.js';
import { choicesFromStyle } from './travelStyles.js';

/** The median day (bed plus food, a person) at this style, or null. */
export function styleDayEur(style, destinations) {
  if (!style || !destinations) return null;
  const list = Object.values(destinations);
  if (!list.length) return null;
  const ctx = costContext(destinations, choicesFromStyle(style));
  const days = [];
  for (const d of list) {
    const v = costRow(d, ctx).dayEur;
    if (v != null && Number.isFinite(v)) days.push(v);
  }
  if (!days.length) return null;
  days.sort((a, b) => a - b);
  const mid = Math.floor(days.length / 2);
  return days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2;
}
