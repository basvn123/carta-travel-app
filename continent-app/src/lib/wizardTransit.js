/**
 * wizardTransit.js, the origin-first layer of the guided trip wizard.
 *
 * The wizard used to price everything from ONE departure airport (the app's
 * chosen origin). This module widens that to a real departure ADDRESS:
 *   - nearbyAirports()        every departure airport within reach of the
 *                             typed address, nearest first.
 *   - TRAVEL_STYLES           the three lifestyle tiers (budget / standard /
 *                             comfort) as one object each: the stay tier the
 *                             receipt prices beds at plus the eating-out
 *                             cadence the daily-spend line prices from.
 *
 * Everything here is estimates from the SAME models the planner prices with
 * afterwards (car_model, accommodation anchors, cost basket), so the badge a
 * traveller taps and the receipt they end on come from one source.
 */
import { haversineKm } from './runtime_pricing.js';

/** How far from the typed address we look for a departure airport, and how
 *  many we keep. Ryanair concentrates on secondary airports, so the six
 *  best-connected within 200 km beat the single nearest every time. */
export const AIRPORT_SEARCH_KM = 200;
const MAX_AIRPORTS = 6;

/**
 * The three travel styles, each one answer that sets BOTH what a bed costs
 * (stay tier, priced from the accommodation anchors) and what a day costs
 * (eating-out cadence, priced from the per-city cost basket). Children count
 * as travellers at full price; the models carry no child rates and a made-up
 * discount would be a lie.
 */
export const TRAVEL_STYLES = [
  {
    key: 'budget',
    labelKey: 'wizard.styleBudget',
    subKey: 'wizard.styleBudgetSub',
    stayTier: 'private',
    lifestyle: {
      cadence: 'week',
      dinners_per_week: 2, lunches_per_week: 3, fastfood_per_week: 4,
      drinks_per_week: 4, club_nights_per_week: 0, coffees_per_day: 1,
      self_catered_days_per_week: 4,
    },
  },
  {
    key: 'standard',
    labelKey: 'wizard.styleStandard',
    subKey: 'wizard.styleStandardSub',
    stayTier: 'home',
    lifestyle: null, // the app's own defaults (meta.defaults.lifestyle)
  },
  {
    key: 'luxury',
    labelKey: 'wizard.styleLuxury',
    subKey: 'wizard.styleLuxurySub',
    stayTier: 'hotel4',
    lifestyle: {
      cadence: 'week',
      dinners_per_week: 6, lunches_per_week: 5, fastfood_per_week: 0,
      drinks_per_week: 8, club_nights_per_week: 1, coffees_per_day: 2,
      self_catered_days_per_week: 0,
    },
  },
];
export const STYLE_BY_KEY = Object.fromEntries(TRAVEL_STYLES.map((s) => [s.key, s]));

/** The daily-spend lifestyle for a style key: the preset, or the app defaults
 *  for 'standard'. */
export function styleLifestyle(styleKey, metaDefaults) {
  const s = STYLE_BY_KEY[styleKey];
  if (!s) return metaDefaults || null;
  return s.lifestyle || metaDefaults || null;
}

/**
 * Every departure airport (meta.origins) within `maxKm` of a point, nearest
 * first. Until T511 this ranked by how many places each airport's fares
 * reached and dropped airports with none; with the fares gone, distance
 * alone orders them (T517 can bring a route count back).
 *
 * @returns [{ iata, name, city, km }]
 */
export function nearbyAirports(meta, lat, lon, { maxKm = AIRPORT_SEARCH_KM, limit = MAX_AIRPORTS } = {}) {
  if (lat == null || lon == null) return [];
  const origins = meta?.origins || {};
  const out = [];
  for (const [iata, o] of Object.entries(origins)) {
    if (o.lat == null || o.lon == null) continue;
    const km = haversineKm(lat, lon, o.lat, o.lon);
    if (km == null || km > maxKm) continue;
    out.push({ iata, name: o.name || o.city || iata, city: o.city || iata, km: Math.round(km) });
  }
  out.sort((a, b) => a.km - b.km);
  return out.slice(0, limit);
}
