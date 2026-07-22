/**
 * countryTransport.js, per-country ground-transport profiles.
 *
 * The old leg estimator priced every European train at one speed and one fare
 * per km, which is how a Ghent -> Antwerp hop (a 10-minutes-frequency, 50-min
 * intercity line) got recommended as a bus ride. Reality differs per network:
 * Belgian rail is dense, cheap and frequent; Croatian rail barely connects the
 * coast; Albania has no passenger rail worth planning around; Luxembourg's
 * public transport is free. These profiles carry that per-country truth:
 *
 *   rail      'excellent' | 'good' | 'fair' | 'poor' | 'none'
 *             How strongly the network deserves to be the default intercity
 *             mode. 'none' removes the train option entirely.
 *   railKmh   effective door-to-door intercity speed (incl. typical stops)
 *   railEur   typical walk-up/advance fare per road km, EUR
 *   railOverheadH  station access + typical wait, hours (frequency proxy)
 *   busKmh / busEur / busOverheadH  same for intercity coaches. Coach
 *             frequency runs OPPOSITE to rail quality: sparse schedules where
 *             rail rules (a few FlixBuses a day), dense ones in the Balkans
 *             where the bus IS the network.
 *
 * Values are honest curated estimates per national network (2026), not live
 * fares; every consumer already labels these legs as estimates.
 */

const P = (rail, railKmh, railEur, railOverheadH, busKmh, busEur, busOverheadH) => (
  { rail, railKmh, railEur, railOverheadH, busKmh, busEur, busOverheadH }
);

export const COUNTRY_TRANSPORT = {
  // Dense western networks: the train is the default way between cities.
  BE: P('excellent', 90, 0.16, 0.25, 70, 0.07, 0.7),
  NL: P('excellent', 95, 0.17, 0.25, 70, 0.07, 0.7),
  DE: P('excellent', 110, 0.13, 0.3, 80, 0.06, 0.7),
  AT: P('excellent', 100, 0.13, 0.25, 75, 0.06, 0.7),
  CH: P('excellent', 95, 0.28, 0.2, 65, 0.1, 0.7),
  DK: P('excellent', 100, 0.18, 0.25, 75, 0.07, 0.7),
  CZ: P('excellent', 85, 0.08, 0.3, 75, 0.045, 0.6),
  LU: P('excellent', 80, 0, 0.25, 65, 0, 0.5), // nationwide public transport is free
  // Solid networks: train-first on the main corridors.
  FR: P('good', 120, 0.11, 0.35, 80, 0.055, 0.75),
  ES: P('good', 115, 0.1, 0.35, 80, 0.05, 0.7),
  IT: P('good', 110, 0.1, 0.35, 75, 0.05, 0.7),
  PT: P('good', 90, 0.08, 0.35, 75, 0.05, 0.6),
  UK: P('good', 100, 0.22, 0.3, 70, 0.07, 0.7),
  GB: P('good', 100, 0.22, 0.3, 70, 0.07, 0.7),
  SE: P('good', 105, 0.13, 0.35, 80, 0.06, 0.75),
  FI: P('good', 100, 0.12, 0.35, 75, 0.06, 0.75),
  PL: P('good', 90, 0.07, 0.35, 75, 0.04, 0.6),
  HU: P('good', 80, 0.06, 0.35, 70, 0.04, 0.6),
  SK: P('good', 75, 0.06, 0.35, 70, 0.04, 0.6),
  // Usable but sparse or slow: judged leg by leg.
  NO: P('fair', 85, 0.16, 0.5, 70, 0.08, 0.75),
  IE: P('fair', 85, 0.13, 0.5, 70, 0.06, 0.6),
  SI: P('fair', 65, 0.07, 0.55, 70, 0.05, 0.5),
  HR: P('fair', 60, 0.06, 0.6, 75, 0.05, 0.4), // the coach network is the real backbone
  RO: P('fair', 55, 0.05, 0.6, 65, 0.04, 0.45),
  BG: P('fair', 55, 0.04, 0.6, 65, 0.035, 0.45),
  GR: P('fair', 70, 0.07, 0.55, 70, 0.05, 0.45),
  LT: P('fair', 80, 0.06, 0.5, 75, 0.04, 0.5),
  LV: P('fair', 65, 0.06, 0.5, 70, 0.04, 0.5),
  EE: P('fair', 75, 0.06, 0.5, 75, 0.04, 0.5),
  TR: P('fair', 80, 0.04, 0.5, 75, 0.03, 0.4),
  MA: P('fair', 75, 0.05, 0.5, 65, 0.03, 0.45),
  // Skeletal rail: the bus is how locals actually travel.
  RS: P('poor', 50, 0.04, 0.8, 65, 0.035, 0.4),
  BA: P('poor', 45, 0.04, 0.8, 60, 0.035, 0.4),
  ME: P('poor', 50, 0.04, 0.8, 60, 0.035, 0.4),
  MK: P('poor', 45, 0.04, 0.8, 60, 0.03, 0.4),
  XK: P('poor', 40, 0.03, 0.8, 60, 0.03, 0.4),
  // No passenger rail to plan around.
  AL: P('none', 0, 0, 0, 60, 0.03, 0.4),
  MT: P('none', 0, 0, 0, 40, 0.02, 0.4),
  CY: P('none', 0, 0, 0, 60, 0.03, 0.45),
  IS: P('none', 0, 0, 0, 65, 0.1, 0.6),
};

const DEFAULT_PROFILE = P('fair', 75, 0.1, 0.5, 70, 0.06, 0.6);

/** The ground-transport profile for a country (ISO2), with a sane fallback. */
export function transportProfile(iso2) {
  return COUNTRY_TRANSPORT[iso2] || DEFAULT_PROFILE;
}

const RAIL_RANK = { excellent: 4, good: 3, fair: 2, poor: 1, none: 0 };

/** A leg is only as good as its weaker rail network: 'excellent' Vienna ->
 *  'poor' Belgrade rides the Serbian half too. Returns the lower tier. */
export function legRailQuality(iso2A, iso2B) {
  const a = transportProfile(iso2A).rail;
  const b = transportProfile(iso2B).rail;
  return RAIL_RANK[a] <= RAIL_RANK[b] ? a : b;
}

/** How much the value-of-time score should favour (or distrust) the train on
 *  this leg, EUR-equivalent. Frequency, comfort and centre-to-centre arrival
 *  are real value that a bare price + hours score misses; a skeletal network
 *  (delays, transfers, no evening service) is a real cost it misses too. */
export const RAIL_SCORE_BONUS = { excellent: -3.5, good: -1.5, fair: 0, poor: 2.5, none: 0 };
