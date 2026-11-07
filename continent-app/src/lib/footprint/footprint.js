/**
 * footprint.js, the trip footprint (T1204, ROADMAP D22): an honest CO2e
 * estimate for a journey, per person, from published emission factors.
 *
 * The factors, their source, year and licence live in config/pricing.json
 * rule `footprint.factors`; nothing is invented here. An estimate is never a
 * measurement: a flight is the straight line plus a routing uplift times a
 * per passenger-km factor of its distance band, a train or coach the road or
 * rail distance times its factor, a car the distance times a per car-km
 * factor shared between the seats of the party. The figure is shown beside
 * the price, labelled as an estimate with a link to the method, and nothing
 * is ranked or hidden because of it (the traveller asks for the comparison).
 *
 * Pure: no fetching, no React.
 */
import { rule } from '../price/config.js';

const CFG = () => rule('footprint.factors');

/** The leg modes the planner uses ('fly') and the card's ways ('plane') both land on the config's keys. */
const MODE_KEY = { fly: 'flight', plane: 'flight', train: 'train', bus: 'coach', coach: 'coach', car: 'car', ferry: 'ferry' };

/** The config key for a mode, or null for a mode with no factor. */
export function footprintMode(mode) {
  return MODE_KEY[mode] || null;
}

/**
 * kg CO2e one person causes on one leg of `km` kilometres, or null when the
 * mode has no factor or the distance is unknown.
 *   km     the distance of the way: the straight line for a flight (the
 *          routing uplift is added here), the road or rail distance for the rest
 *   seats  people sharing the car, at most 5 (a car's figure is per car, shared)
 */
export function legKg(mode, km, { seats = 1 } = {}) {
  const key = footprintMode(mode);
  const cfg = CFG();
  if (!key || !(km > 0) || !Number.isFinite(km)) return null;
  let g;
  if (key === 'flight') {
    const band = km <= cfg.short_haul_max_km ? cfg.flight_short_g_pkm : cfg.flight_long_g_pkm;
    g = km * cfg.flight_uplift * band;
  } else if (key === 'car') {
    g = km * cfg.car_g_km / Math.min(5, Math.max(1, Math.round(seats) || 1));
  } else {
    g = km * cfg[`${key}_g_pkm`];
  }
  return Number.isFinite(g) ? g / 1000 : null;
}

/**
 * The footprint of a trip: an array of { mode, km } legs (a return trip is
 * two legs) -> { kg, byMode: { flight: kg, ... }, counted, skipped }.
 * A leg with no factor or no distance is skipped and counted, never guessed,
 * so the label can say "not counting 1 leg".
 */
export function tripKg(legs, { seats = 1 } = {}) {
  const byMode = {};
  let kg = 0;
  let counted = 0;
  let skipped = 0;
  for (const l of legs || []) {
    const k = legKg(l?.mode, l?.km, { seats });
    if (k == null) { skipped += 1; continue; }
    const key = footprintMode(l.mode);
    byMode[key] = (byMode[key] || 0) + k;
    kg += k;
    counted += 1;
  }
  return { kg, byMode, counted, skipped };
}

/** The whole kilograms to show: "38 kg", never a false decimal; under 1 kg "under 1". */
export function kgText(kg) {
  if (kg == null || !Number.isFinite(kg)) return '';
  return kg < 1 ? '<1' : String(Math.round(kg));
}

/** Where the method and the factors are published, for the "how we estimate" link. */
export function methodUrl() {
  return CFG().method_url;
}

/**
 * kg CO2e one person causes on a return journey between two places a
 * straight-line `km` apart, by `mode`. A flight uses the line itself (plus
 * its routing uplift); a ground way uses the line times `ground_detour`.
 */
export function returnKg(mode, straightKm, { seats = 1 } = {}) {
  if (!(straightKm > 0)) return null;
  const km = footprintMode(mode) === 'flight' ? straightKm : straightKm * CFG().ground_detour;
  const one = legKg(mode, km, { seats });
  return one == null ? null : one * 2;
}

/**
 * kg CO2e one person causes on one leg, from the leg's straight line or, for
 * a ground way, the published route km when the trip carries one.
 */
export function oneWayKg(mode, straightKm, { routeKm = null, seats = 1 } = {}) {
  if (footprintMode(mode) === 'flight') return legKg(mode, straightKm, { seats });
  const km = routeKm > 0 ? routeKm : straightKm > 0 ? straightKm * CFG().ground_detour : null;
  return legKg(mode, km, { seats });
}
