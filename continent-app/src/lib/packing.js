/**
 * packing.js, "what to bring" for a destination, derived instead of asserted.
 *
 * Every line traces to a fact the wire already carries: the month's climate
 * normals (WorldClim), the destination's categories, the swim relevance rule
 * and the plug standard of the country. No climate for a place means fewer,
 * more general lines, never invented weather.
 *
 * The list is packed FOR A MONTH: by default the next month from the
 * destination's best-weather set (or the current month when the wire has no
 * climate), and the panel says which month it packed for.
 */
import { swimRelevant } from '../components/WaterQualityBadge.jsx';

const T_HIGH = 0;
const T_LOW = 1;
const PRECIP = 2;

// Countries on the UK plug (type G): the one intra-Europe adapter surprise.
const TYPE_G = new Set(['GB', 'IE', 'MT', 'CY']);

/** The month (1-12) the list packs for: the upcoming best-weather month,
 *  or the current month when the destination carries no climate normals. */
export function packMonth(dest, now = new Date()) {
  const best = dest?.climate?.best;
  const cur = now.getUTCMonth() + 1;
  if (!Array.isArray(best) || best.length === 0) return cur;
  // The first best month at or after today, wrapping the year.
  const sorted = [...best].sort((a, b) => a - b);
  return sorted.find((m) => m >= cur) ?? sorted[0];
}

/**
 * Ordered list of packing item keys (i18n: explore.pack.<key>) for one
 * destination and month. Kept short on purpose: eight lines somebody reads
 * beat twenty they scroll past.
 */
export function packingList(dest, month) {
  const items = [];
  const cats = dest?.categories || [];
  const m = dest?.climate?.m?.[month - 1] || null;
  const hi = m ? m[T_HIGH] : null;
  const lo = m ? m[T_LOW] : null;
  const rain = m ? m[PRECIP] : null;

  items.push('shoes');                                    // every trip here walks
  items.push('daypack');                                  // and carries something
  if (hi != null && hi >= 22) items.push('sun');
  if (hi != null && hi >= 26) items.push('bottle');
  if (swimRelevant(dest) && (hi == null || hi >= 20)) items.push('swim');
  if (rain != null && rain >= 60) items.push('rain');
  if (hi != null && hi < 8) items.push('winter');
  else if (lo != null && lo < 8) items.push('layers');
  else if (hi != null && hi >= 20 && lo != null && lo <= 14) items.push('evening');
  if (cats.some((c) => c === 'mountains' || c === 'alps' || c === 'nature') || dest?.nature?.park) {
    items.push('boots');
  }
  // Heritage cities: the working churches on the sightseeing list enforce
  // covered shoulders, and being turned away at the door is a packing fact.
  if (dest?.beauty?.unesco || cats.includes('historic') || cats.includes('cultural')) {
    items.push('modest');
  }
  if (TYPE_G.has(dest?.iso2)) items.push('plug');
  if (m == null && !items.includes('layers')) items.push('layers'); // no normals: hedge
  return items;
}
