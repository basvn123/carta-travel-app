/**
 * firstRun.js (T099): the first priced total, as docs/FIRST_RUN_RESULT.md
 * designs it. Pure functions only; the receipt component is
 * components/FirstRunReceipt.jsx.
 *
 * What the receipt prices, and why only that:
 *
 *   stay    the bed for every night and every person, through
 *           accommodationPerPerson, the same function composeTrip and the
 *           planner price a stay with (season, length of stay, cleaning and
 *           the platform fee, the stay tier the traveller picked).
 *   ground  eating and drinking, through groundSpendPerPerson, the function
 *           the Explore cards and the planner use, so a card, a receipt and
 *           a plan cannot disagree about what dinner costs.
 *   flight  only when the traveller typed what they paid. Carta prices no
 *           flight (owner decision 2026-10-02, T272, T273), so no fare table
 *           is read here at all.
 *
 * Local transport, entry tickets and insurance are not priced by the engine,
 * so they are not lines; the receipt names them in its exclusions sentence.
 *
 * Every figure keeps its cents. A line whose figure stands in from a national
 * basket is an estimate and says so; a total that holds an estimate is one.
 */
import {
  accommodationPerPerson, groundSpendPerPerson, offeredStayTiers, tripDaysBetween,
} from './runtime_pricing.js';
import { round2 } from './math.js';
import { addDays } from './dates.js';

// The same sanity gate costIndex.js puts on a harvested nightly rate, applied
// before season: under the floor is a broken harvest, over the ceiling a data
// error, and neither may price a receipt.
const STAY_MIN_EUR = 6;
const STAY_MAX_EUR = 400;

/** How far out the default trip starts, and on which weekday. */
export const DEFAULT_LEAD_DAYS = 28;
const SATURDAY = 6;

/**
 * The dates Carta picks when the visitor has picked none: the first Saturday
 * at least four weeks after `todayIso`, for `nights` nights. Calendar only;
 * the frozen fare window no longer decides it (T211, approved by the owner on
 * 2026-10-07 in T362).
 */
export function calendarDefaultWindow(todayIso, nights = 7) {
  if (!todayIso) return null;
  const n = Math.max(1, Math.round(nights || 7));
  let start = addDays(todayIso, DEFAULT_LEAD_DAYS);
  const dow = new Date(`${start}T00:00:00Z`).getUTCDay();
  start = addDays(start, (SATURDAY - dow + 7) % 7);
  return { start, end: addDays(start, n) };
}

/** True when the window fits inside [min, max]; an open bound always fits. */
export function windowFits(win, bounds) {
  if (!win) return false;
  if (!bounds) return true;
  if (bounds.min && win.start < bounds.min) return false;
  if (bounds.max && win.end > bounds.max) return false;
  return true;
}

/** Where the bed figure came from: 'city' measured here, 'country' the
 *  national figure, 'region' the country median standing in for a broken
 *  harvest (costIndex.js names them the same way). */
function stayLevel(dest, accom) {
  if (accom?.tier && accom.tier !== 'home') return 'city';   // a measured city tier
  return dest?.accommodation?.level === 'city' ? 'city' : 'country';
}

/** The stay line for one tier, or null when nothing usable is on the wire. */
function stayLine(dest, nights, from, people, stayTier, model, costRow) {
  const accom = accommodationPerPerson(dest, nights, from, model, people, stayTier);
  const base = accom && accom.season > 0 ? accom.nightly_pp / accom.season : null;
  if (accom && base >= STAY_MIN_EUR && base <= STAY_MAX_EUR && accom.total > 0) {
    const a = dest.accommodation || {};
    const level = stayLevel(dest, accom);
    return {
      key: 'stay',
      eur: round2(accom.total * people),
      est: level !== 'city',
      level,
      tier: accom.tier,
      tierAsked: accom.tier_requested,
      tierFallback: !!accom.tier_fallback,
      listings: level === 'city' && accom.tier === 'home' ? (a.n_listings ?? null) : null,
      place: a.source_place || null,
      captured: a.captured || null,
    };
  }
  // A broken harvest: the country median of measured towns stands in, the
  // repair costIndex.js already makes for the Explore cards. It is a per
  // person, per night figure with no season, so it is an estimate.
  if (costRow?.stayLevel === 'region' && costRow.stayEur > 0) {
    return {
      key: 'stay',
      eur: round2(costRow.stayEur * nights * people),
      est: true,
      level: 'region',
      tier: 'home',
      tierAsked: stayTier || 'home',
      tierFallback: false,
      listings: null,
      place: null,
      captured: null,
    };
  }
  return null;
}

/** The ground line: eating and drinking, per day per person, times the days
 *  and the people. The per-day figure is the one printed in the line's second
 *  row, so the line is computed from it and the multiplication on screen is
 *  exact to the cent. */
function groundLine(dest, nights, people, lifestyle) {
  const g = groundSpendPerPerson(dest, nights, lifestyle);
  if (!g || !(g.total > 0)) return null;
  const perDay = round2(g.total / nights);
  const level = dest.costs?.level === 'city' ? 'city' : 'country';
  return {
    key: 'ground',
    eur: round2(perDay * nights * people),
    perDay,
    days: nights,
    est: level !== 'city',
    level,
  };
}

/**
 * The whole receipt for one destination, or null when the destination has no
 * bed or no food figure to price (the surface then shows what it showed
 * before, rather than a receipt with a hole in it).
 *
 *   opts.from, opts.to         ISO dates, to > from
 *   opts.people                the party size (choices.group_size)
 *   opts.stayTier              choices.stay_tier
 *   opts.lifestyle             choices.lifestyle
 *   opts.accommodationModel    choices.accommodation_model (meta)
 *   opts.costRow               this destination's computeCosts row, for the
 *                              broken-harvest repair
 *   opts.ownFare               { costTotal, airline, origin } the traveller typed
 */
export function priceReceipt(dest, opts = {}) {
  const { from, to } = opts;
  if (!dest || !from || !to || to <= from) return null;
  const nights = Math.max(1, tripDaysBetween(from, to));
  const people = Math.max(1, Math.round(opts.people || 1));
  const stay = stayLine(dest, nights, from, people, opts.stayTier, opts.accommodationModel, opts.costRow);
  const ground = groundLine(dest, nights, people, opts.lifestyle);
  if (!stay || !ground) return null;

  const lines = [];
  const fareEur = Number(opts.ownFare?.costTotal);
  if (Number.isFinite(fareEur) && fareEur > 0) {
    lines.push({
      key: 'flight',
      eur: round2(fareEur),
      est: false,
      airline: String(opts.ownFare.airline || '').trim(),
      origin: opts.ownFare.origin || null,
    });
  }
  // The order the trip happens in, the planner receipt's order: the flight
  // out, the bed, the days.
  lines.push(stay, ground);

  const total = round2(lines.reduce((s, l) => s + l.eur, 0));
  return {
    from,
    to,
    nights,
    people,
    lines,
    total,
    each: round2(total / people),
    est: lines.some((l) => l.est),
  };
}

/**
 * The footer: what one changed input would do to the total.
 *
 * While the dates are Carta's, the primary button is already asking for them,
 * so the footer names the stay instead: the measured tier here whose total is
 * furthest below this one (or, when none is cheaper, the nearest one above).
 * Once the dates are the visitor's own, or no other tier is measured here,
 * the footer names the week after (or four weeks after, see below).
 * Returns { kind: 'tier', tier, total, est }, { kind: 'later' | 'month',
 * total, est }, or null when no alternative moves the total.
 */
export function receiptFooter(dest, receipt, opts = {}, { datesOwn = false, meta = null } = {}) {
  if (!dest || !receipt) return null;
  // The week after; when the bed rate is flat across the month and that
  // changes nothing, four weeks after, which crosses into the next month's
  // rate. A footer that names an input which moves nothing says nothing.
  const later = () => {
    for (const [kind, days] of [['later', 7], ['month', 28]]) {
      const r = priceReceipt(dest, { ...opts, from: addDays(opts.from, days), to: addDays(opts.to, days) });
      if (r && Math.abs(r.total - receipt.total) >= 0.01) return { kind, total: r.total, est: r.est };
    }
    return null;
  };
  if (datesOwn) return later();

  const current = receipt.lines.find((l) => l.key === 'stay')?.tier || 'home';
  const options = [];
  for (const tier of offeredStayTiers(meta)) {
    if (tier === current) continue;
    const r = priceReceipt(dest, { ...opts, stayTier: tier });
    const stay = r?.lines.find((l) => l.key === 'stay');
    // A tier this town has no measurement for falls back to the entire place,
    // which is not an alternative at all.
    if (!r || !stay || stay.tierFallback || stay.tier !== tier) continue;
    if (Math.abs(r.total - receipt.total) < 0.01) continue;
    options.push({ kind: 'tier', tier, total: r.total, est: r.est });
  }
  if (options.length === 0) return later();
  const cheaper = options.filter((o) => o.total < receipt.total).sort((a, b) => a.total - b.total);
  if (cheaper.length) return cheaper[0];
  return options.sort((a, b) => a.total - b.total)[0];
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const p = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * p) / 2) ** 2
    + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lon2 - lon1) * p) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/**
 * The town a trip page prices its receipt at: the nearest catalogue
 * destination with a bed and a food figure, within `maxKm` of the trip's own
 * point (the same 30 km the price-by-month row of T103 borrows its curve
 * within). Null when none is that close; the trip page then keeps its own
 * written budget rather than pricing a week in a town the trip is not in.
 * Returns { id, dest, km }.
 */
export function nearestPricedDest(destinations, lat, lon, maxKm = 30) {
  if (!destinations || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best = null;
  for (const [id, d] of Object.entries(destinations)) {
    if (!d || d._lite || !d.costs || !d.accommodation) continue;
    const dl = d.city_lat ?? d.lat;
    const dn = d.city_lon ?? d.lon;
    if (!Number.isFinite(dl) || !Number.isFinite(dn)) continue;
    const km = haversineKm(lat, lon, dl, dn);
    if (km <= maxKm && (!best || km < best.km)) best = { id, dest: d, km };
  }
  return best;
}

/* ── Per-viewer conveniences in localStorage ──────────────────────────────
 * Nothing depends on these: a blocked or cleared store means the visitor
 * sees the first-run form again and types a fare again, which is the right
 * failure (docs/FIRST_RUN_RESULT.md, "Once, then never again"). */

export const FIRST_RESULT_SEEN_KEY = 'carta.firstResultSeen';
export const OWN_FARES_KEY = 'carta.ownFares';
const OWN_FARES_MAX = 40;

export function readFirstResultSeen() {
  try { return window.localStorage.getItem(FIRST_RESULT_SEEN_KEY) === '1'; } catch { return false; }
}

export function markFirstResultSeen() {
  try { window.localStorage.setItem(FIRST_RESULT_SEEN_KEY, '1'); } catch { /* blocked store: shown again next time */ }
}

function readFares() {
  try {
    const v = JSON.parse(window.localStorage.getItem(OWN_FARES_KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

/** The fare the traveller typed for this receipt (a destination or a trip),
 *  or null. Validated on the way out, since the store is the viewer's own. */
export function readOwnFare(key) {
  if (!key) return null;
  const f = readFares()[key];
  if (!f || typeof f !== 'object') return null;
  const costTotal = Number(f.costTotal);
  if (!Number.isFinite(costTotal) || costTotal <= 0) return null;
  return {
    costTotal: Math.min(99999, round2(costTotal)),
    airline: String(f.airline || '').slice(0, 60),
    origin: typeof f.origin === 'string' ? f.origin.slice(0, 8) : null,
    outDate: typeof f.outDate === 'string' ? f.outDate.slice(0, 10) : null,
    retDate: typeof f.retDate === 'string' ? f.retDate.slice(0, 10) : null,
    at: Number(f.at) || 0,
  };
}

/** Store (or, with null, forget) the fare for this receipt. Keeps the newest
 *  OWN_FARES_MAX so the store never grows without bound. */
export function writeOwnFare(key, fare) {
  if (!key) return;
  try {
    const all = readFares();
    if (fare) all[key] = { ...fare, at: Date.now() };
    else delete all[key];
    const kept = Object.entries(all)
      .sort((a, b) => (Number(b[1]?.at) || 0) - (Number(a[1]?.at) || 0))
      .slice(0, OWN_FARES_MAX);
    window.localStorage.setItem(OWN_FARES_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch { /* blocked store: the fare lives for this page only */ }
}
