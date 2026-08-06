/**
 * groundFares.js, the single resolver every ground fare flows through.
 *
 * The fallback guarantee: a train / bus / ferry leg that exists always gets a
 * price, and every price says where it came from. Resolution order:
 *
 *   (a) `quote`: a real per-person fare already attached to the leg or the
 *       destination data (today: the stored airport-transfer fare,
 *       routes[origin].ground_transport_one_way_eur). Wins outright.
 *       -> { est: false, src: 'quote' }
 *   (b) the ground fare calibration artifact (contract C,
 *       data/derived/ground_fare_calibration.json), when one has been loaded
 *       via setGroundFareCalibration() and covers BOTH endpoint countries for
 *       the mode. Partial coverage falls through, per the contract.
 *       -> { est: true, src: 'cal' }
 *   (c) built-in priors: the curated per-country network profiles in
 *       countryTransport.js (fare per km with a per-country floor) and the
 *       sea-crossing fare bands that transport.js has always used. These ARE
 *       the blueprint's per-km priors, held in their existing values so that
 *       shipping this resolver changes structure, not prices.
 *       -> { est: true, src: 'prior' }
 *
 * Distance: callers pass the routed or mode-adjusted km they already computed
 * (transport.js applies its road / rail detour factors); with only a straight
 * line available the resolver applies the standard 1.3 detour factor itself.
 * All numeric inputs are Number.isFinite-guarded (the src/map/coords.js
 * convention): a NaN never becomes a price.
 *
 * The resolver returns null only when there is neither a usable quote nor a
 * usable distance, which callers treat as "this leg cannot be priced at all"
 * (the same early-null contract legTransportOptions already had for missing
 * coordinates). It never returns NaN, undefined, or an accidental zero: the
 * only zero it can produce is a country profile that genuinely prices at
 * zero (Luxembourg's free national network).
 */
import { transportProfile } from './countryTransport.js';
import { isNum } from '../map/coords.js';

// Straight-line km to road km when the caller has no better distance
// (matches transport.js DETOUR and the pipeline's car_layer.py).
const FALLBACK_DETOUR = 1.3;

// Overland fare floors: a minimum fare worth ~40 km at the country's own
// per-km rate, never under EUR 4 (train) / EUR 3 (bus). Same numbers the
// leg estimator has always applied.
const TRAIN_FLOOR_EUR = 4;
const TRAIN_FLOOR_KM = 40;
const BUS_FLOOR_EUR = 3;

// Airport-transfer public fare band (bus / shuttle / airport train), formerly
// transport.js TRANSFER: per km with a floor and a short-hop cap.
const PUBLIC_TRANSFER = { perKm: 0.15, floor: 10, cap: 60 };

// The two sea gaps people cross "overland-style". Train and bus are through
// fares that include the crossing; ferry is the per-car deck price used by
// the car mode. Same bands seaCrossingOptions has always priced.
const SEA_BANDS = {
  channel: {
    train: { perKm: 0.26, floor: 59, cap: 220 },  // Eurostar advance-fare band
    bus: { perKm: 0.085, floor: 29 },
    ferryPerCar: 95,                              // LeShuttle / Dover-Calais deck
  },
  irishsea: {
    train: { perKm: 0.12, floor: 45, cap: 120 },  // Rail & Sail through-ticket
    bus: { perKm: 0.08, floor: 35 },
    ferryPerCar: 130,
  },
};

// --- Calibration artifact (contract C) -------------------------------------
// { meta: {...}, countries: { ISO2: { train|bus|ferry: { base_eur, per_km_eur, n } } } }
// Loaded by whoever ships the artifact into the app (a later pass); absent,
// every lookup falls through to the priors, which is contract C's own rule
// for missing countries or modes.

let CALIBRATION = null;

/** Install (or clear, with null) the contract C calibration artifact. */
export function setGroundFareCalibration(artifact) {
  CALIBRATION = artifact && artifact.countries ? artifact : null;
}

/** The currently loaded calibration artifact, for tests and diagnostics. */
export function getGroundFareCalibration() {
  return CALIBRATION;
}

function calCell(iso2, mode) {
  const cell = CALIBRATION?.countries?.[iso2]?.[mode];
  if (!cell || !isNum(cell.base_eur) || !isNum(cell.per_km_eur)) return null;
  return cell;
}

// Calibrated per-person fare for an overland leg, or null when the artifact
// is absent or does not cover both endpoint countries for this mode.
function calibratedFare(mode, isoA, isoB, km) {
  if (!CALIBRATION) return null;
  const a = calCell(isoA, mode);
  const b = isoA === isoB ? a : calCell(isoB, mode);
  if (!a || !b) return null;
  const eur = (a.base_eur + b.base_eur) / 2 + ((a.per_km_eur + b.per_km_eur) / 2) * km;
  return isNum(eur) && eur > 0 ? eur : null;
}

// --- Priors -----------------------------------------------------------------

// Per-person overland prior from the curated country profiles. The rate is
// the average of the two endpoint networks, exactly as the leg estimator has
// always blended them. A zero rate (both networks free) prices zero on
// purpose; everything else carries the mode's fare floor.
function overlandPrior(mode, isoA, isoB, km) {
  const profA = transportProfile(isoA);
  const profB = transportProfile(isoB);
  if (mode === 'train') {
    const rate = (profA.railEur + profB.railEur) / 2;
    return rate === 0 ? 0 : Math.max(TRAIN_FLOOR_EUR, rate * TRAIN_FLOOR_KM, rate * km);
  }
  const rate = (profA.busEur + profB.busEur) / 2;
  return rate === 0 ? 0 : Math.max(BUS_FLOOR_EUR, rate * km);
}

function seaPrior(mode, sea, km) {
  const bands = SEA_BANDS[sea];
  if (!bands) return null;
  if (mode === 'ferry') return bands.ferryPerCar;
  const band = bands[mode];
  if (!band) return null;
  const eur = Math.max(band.floor, band.perKm * km);
  return band.cap != null ? Math.min(band.cap, eur) : eur;
}

// --- The resolver -----------------------------------------------------------

/**
 * Resolve one ground fare.
 *
 * @param ctx.mode       'train' | 'bus' | 'ferry' | 'public'
 *                       ('public' is the airport-transfer bus/shuttle fare;
 *                       'ferry' prices per CAR and only on a known crossing)
 * @param ctx.quote      a real fare already attached to the leg or dest data
 * @param ctx.isoA/isoB  endpoint countries (overland train / bus)
 * @param ctx.sea        'channel' | 'irishsea' for a priced sea crossing
 * @param ctx.km         the routed or mode-adjusted distance the caller uses
 * @param ctx.straightKm great-circle km, the x1.3 fallback when km is absent
 * @returns { eur, est, src } (src: 'quote' | 'cal' | 'prior'), or null when
 *          neither a quote nor any distance is usable.
 */
export function resolveGroundFare(ctx = {}) {
  const { mode, quote = null, isoA = null, isoB = null, sea = null } = ctx;

  if (isNum(quote) && quote > 0) {
    return { eur: quote, est: false, src: 'quote' };
  }

  const km = isNum(ctx.km) && ctx.km > 0
    ? ctx.km
    : (isNum(ctx.straightKm) && ctx.straightKm > 0 ? ctx.straightKm * FALLBACK_DETOUR : null);
  if (km == null) return null;

  if (sea) {
    const eur = seaPrior(mode, sea, km);
    return eur == null ? null : { eur, est: true, src: 'prior' };
  }

  if (mode === 'train' || mode === 'bus') {
    const cal = calibratedFare(mode, isoA, isoB, km);
    if (cal != null) return { eur: cal, est: true, src: 'cal' };
    return { eur: overlandPrior(mode, isoA, isoB, km), est: true, src: 'prior' };
  }

  if (mode === 'public') {
    const eur = Math.min(PUBLIC_TRANSFER.cap, Math.max(PUBLIC_TRANSFER.floor, PUBLIC_TRANSFER.perKm * km));
    return { eur, est: true, src: 'prior' };
  }

  // 'ferry' without a known crossing: other island gaps stay deliberately
  // unpriced (their networks are too varied to estimate honestly).
  return null;
}
