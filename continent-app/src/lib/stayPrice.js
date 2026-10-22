/**
 * One bed price for every screen (schema v18, T534).
 *
 * Before this, a bed was priced three ways (the Explore day figure without
 * season or party, the planner's full model, the ready-made trips' written
 * ranges), so one stay showed different prices on different screens
 * (T374-d, T392-c). Every bed price in the app now comes from bedPrice().
 *
 * The data, per destination (pipeline/stays/build_stays.py):
 *   dest.accommodation   {beds, q, captured, supply}: annual medians, baked
 *                        into the first paint
 *   stays wire record    month[bed][12] measured prices, weekend factor, peak
 *                        factors, single-room ratio, sources (staysData.js,
 *                        fetched per country from the monthly refresh)
 *
 * Tiers, cheapest to priciest. 'home' (an entire Airbnb place) and 'room' (an
 * Airbnb private room) keep the short ids the URL state and accounts store;
 * the wire calls them bnb_home and bnb_room.
 *   dorm     one hostel bed, per person
 *   private  a private room in a hostel or guesthouse (double)
 *   room     an Airbnb private room (double)
 *   home     an entire place, sized to the group (2, 4, 6 or 8 sleepers)
 *   hotel2..hotel5   a hotel room by star class (double)
 *
 * Night by night: each night takes its own month's price, the weekend factor
 * on Friday and Saturday, and a peak factor in the Christmas, Easter and
 * mid-August weeks. A stay of 28 July to 4 August pays July and August prices.
 *
 * Live (T540): for a dated stay whose prices /api/stays has fetched
 * (liveStays.js), the hotel tiers and the private room follow tonight's
 * factor (the town's hotels against their own typical night), marked q:
 * 'live'. The stay moves by (live factor / the model's season for those
 * nights) ^ LIVE_DAMP: six hotels are a small sample, so a real x2 festival
 * week shows as about x1.5 and an ordinary week stays near the model. A ratio
 * outside 0.4 to 3 is a broken answer, not a festival, and is ignored.
 */

import { stayRecord } from './staysData.js';
import { liveStay } from './liveStays.js';

export const STAY_TIERS = ['dorm', 'private', 'room', 'home', 'hotel2', 'hotel3', 'hotel4', 'hotel5'];

// Stored values from before v18 still arrive from URLs and accounts.
const ALIAS = { hotel: 'hotel3', bnb_home: 'home', bnb_room: 'room' };

const WIRE = { dorm: 'dorm', private: 'private', room: 'bnb_room', home: 'bnb_home',
  hotel2: 'hotel2', hotel3: 'hotel3', hotel4: 'hotel4', hotel5: 'hotel5' };

// Airbnb's own charges on top of the nightly price; the pipeline ships the
// same numbers as meta.stays.fees, which win when present.
export const DEFAULT_FEES = {
  service_fee_pct: 14,
  cleaning_fee_frac_of_night: 0.5,
  weekly_discount_pct: 8,
  min_nights_for_weekly: 7,
};

const HOME_CAPS = [2, 4, 6, 8];
const LIVE_DAMP = 0.6;

export function normaliseTier(t) {
  const k = ALIAS[t] || t;
  return STAY_TIERS.includes(k) ? k : 'home';
}

/** The annual nightly of a tier at a destination (EUR, per bed for a dorm,
 *  per room for rooms, per place for 'home' at `cap` sleepers), or null. */
export function annualRate(dest, tier, cap = 4) {
  const beds = dest?.accommodation?.beds;
  if (!beds) return null;
  const v = beds[WIRE[normaliseTier(tier)]];
  if (v && typeof v === 'object') return homeBucket(v, cap).night;
  return v > 0 ? v : null;
}

/** Tiers this destination can price, in STAY_TIERS order. A tier the town has
 *  no supply of (no hostels, no 5-star hotels) is left out rather than priced
 *  from a neighbour. */
export function tiersAt(dest) {
  const a = dest?.accommodation;
  if (!a?.beds) return [];
  const sup = a.supply || {};
  return STAY_TIERS.filter((t) => {
    if (annualRate(dest, t) == null) return false;
    if (t === 'dorm' && sup.hostel === false) return false;
    if (t.startsWith('hotel') && sup.hotel === false) return false;
    if (t === 'hotel5' && sup.hotel5 === false) return false;
    if ((t === 'home' || t === 'room') && sup.bnb === false) return false;
    return true;
  });
}

/** Smallest measured home that sleeps the group, or the biggest one. */
function homeBucket(homes, people) {
  const caps = HOME_CAPS.filter((c) => homes[String(c)] > 0);
  if (!caps.length) return { night: null, cap: null };
  const cap = caps.find((c) => c >= people) || caps[caps.length - 1];
  return { night: homes[String(cap)], cap };
}

function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, day);
}

const DAY = 86400000;

/** Which peak week a night falls in, if any: 'xmas' | 'easter' | 'aug15'. */
export function peakOf(ms) {
  const d = new Date(ms);
  const m = d.getUTCMonth() + 1, day = d.getUTCDate();
  if ((m === 12 && day >= 23) || (m === 1 && day <= 1)) return 'xmas';
  if (m === 8 && day >= 12 && day <= 17) return 'aug15';
  if (m === 3 || m === 4) {
    const e = easterSunday(d.getUTCFullYear());
    if (ms >= e - 3 * DAY && ms <= e + DAY) return 'easter';
  }
  return null;
}

function parseDay(s) {
  if (!s || typeof s !== 'string' || s.length < 10) return null;
  const ms = Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The price of one night for the whole party, at one tier.
 *   ms       a night's date (UTC ms), or null for "a month" / "any time"
 *   month    1..12 when there is no date; null for the annual figure
 * Returns { rate, unit, units, night, season } where rate is the listed price
 * of one unit (bed, room or place) and night is what the party pays.
 */
function nightFor(dest, rec, tier, people, ms, month) {
  const key = WIRE[tier];
  const m = ms != null ? new Date(ms).getUTCMonth() + 1 : month;
  let base, annual, units, unit;
  if (tier === 'home') {
    const homes = dest.accommodation.beds.bnb_home || {};
    const b = homeBucket(homes, people);
    annual = b.night;
    const curve = rec?.month?.bnb_home;
    const four = homes['4'] || annual;
    base = m && curve?.[m - 1] && four ? (curve[m - 1] / four) * annual : annual;
    units = 1;
    unit = 'place';
  } else {
    annual = dest.accommodation.beds[key];
    const curve = rec?.month?.[key];
    base = m && curve?.[m - 1] ? curve[m - 1] : annual;
    if (tier === 'dorm') { units = people; unit = 'bed'; } else {
      units = Math.ceil(people / 2);
      unit = 'room';
      // One traveller in a hotel books a single room where it was measured.
      if (people === 1 && tier.startsWith('hotel') && rec?.single?.hotel) {
        base *= Math.min(1, rec.single.hotel);
      }
    }
  }
  if (!(annual > 0) || !(base > 0)) return null;
  let rate = base;
  if (ms != null) {
    const wd = new Date(ms).getUTCDay();
    if ((wd === 5 || wd === 6) && rec?.weekend > 1) rate *= rec.weekend;
    const pk = peakOf(ms);
    if (pk && rec?.peak?.[pk] > 1) rate *= rec.peak[pk];
  }
  return { rate, unit, units, night: rate * units, season: rate / annual };
}

/**
 * Everything a screen needs about the beds of one stay.
 *
 *   dest      the destination record (with .accommodation)
 *   tier      a STAY_TIERS id (aliases accepted); falls back to 'home' when
 *             the town cannot price it, and says so (fallback: true)
 *   adults, children   children count as half a person on a dorm bed and
 *             share rooms; babies are free and not passed in
 *   nights    0 prices nothing
 *   start     'YYYY-MM-DD' of the first night, or null
 *   month     1..12 when there is no start date (the Explore month filter)
 *   fees      meta.stays.fees
 *
 * Returns null when the destination has no bed price at all, else
 *   { total, perPerson, perNight, nightlyPp, rate, unit, units, tier,
 *     tierRequested, fallback, season, cleaning, service, weeklyDiscount,
 *     q, from, km, captured, basis }
 * total is what the party pays for every night including Airbnb fees;
 * basis is 'dated' | 'month' | 'annual'.
 */
export function bedPrice({ dest, tier, adults = 2, children = 0, nights = 1, start = null,
  month = null, fees = null, live: allowLive = true } = {}) {
  if (!dest?.accommodation?.beds) return null;
  const want = normaliseTier(tier);
  const offered = tiersAt(dest);
  const t = offered.includes(want) ? want
    : offered.includes('home') ? 'home' : offered[0];
  if (!t) return null;
  const rec = stayRecord(dest.id);
  const heads = Math.max(1, (adults || 0) + (children || 0));
  // Rooms are shared by whoever is travelling; a dorm bed is per sleeper.
  const people = t === 'dorm' ? Math.max(1, (adults || 0) + Math.ceil((children || 0) / 2)) : heads;
  const n = Math.max(0, Math.round(nights || 0));
  const f = { ...DEFAULT_FEES, ...(fees || {}) };
  const startMs = parseDay(start);
  const basis = startMs != null ? 'dated' : month ? 'month' : 'annual';

  let lodging = 0, seasonSum = 0, first = null;
  const count = Math.max(1, n);
  for (let i = 0; i < count; i += 1) {
    const ms = startMs != null ? startMs + i * DAY : null;
    const one = nightFor(dest, rec, t, people, ms, month);
    if (!one) return null;
    if (!first) first = one;
    if (i < n) lodging += one.night;
    seasonSum += one.season;
  }
  let avgNight = n > 0 ? lodging / n : first.night;

  const live = allowLive && startMs != null && n > 0
    ? liveStay(dest.id, t, new Date(startMs).toISOString().slice(0, 10), n, people) : null;
  const seasonAvg = seasonSum / count;
  const ratio = live && seasonAvg > 0 ? live.factor / seasonAvg : null;
  const useLive = ratio != null && ratio >= 0.4 && ratio <= 3;
  if (useLive) {
    lodging *= ratio ** LIVE_DAMP;
    avgNight = lodging / n;
  }

  let cleaning = 0, service = 0, weekly = 1;
  if (t === 'home' && n > 0) {
    if (n >= (f.min_nights_for_weekly || 7)) weekly = 1 - (f.weekly_discount_pct || 0) / 100;
    lodging *= weekly;
    cleaning = (f.cleaning_fee_frac_of_night || 0) * annualRate(dest, 'home', people);
    service = (lodging + cleaning) * ((f.service_fee_pct || 0) / 100);
  }
  const total = lodging + cleaning + service;
  const src = rec?.src?.[WIRE[t]] || {};
  return {
    total: round2(total),
    perPerson: round2(total / heads),
    perNight: round2(n > 0 ? total / n : avgNight),
    nightlyPp: round2(avgNight / heads),
    rate: round2(first.rate),
    unit: first.unit,
    units: first.units,
    tier: t,
    tierRequested: want,
    fallback: t !== want,
    season: round2(seasonSum / count),
    cleaning: round2(cleaning),
    service: round2(service),
    weeklyDiscount: weekly < 1,
    q: useLive ? 'live' : src.q || dest.accommodation.q || null,
    from: useLive ? null : src.from || null,
    km: useLive ? null : src.km ?? null,
    scaled: !useLive && !!src.scaled,
    captured: useLive ? live.checked : dest.accommodation.captured || null,
    basis: useLive ? 'live' : basis,
  };
}

/** How far tonight's prices move a dated stay from the model (T559): the
 *  live total over the modelled total, or null when the stay is not live. For
 *  screens that price beds from something other than bedPrice() (a journey's
 *  written budget), so they can scale their bed line by the same amount. */
export function liveStayRatio({ dest, tier, adults = 2, children = 0, nights = 1, start = null } = {}) {
  const live = bedPrice({ dest, tier, adults, children, nights, start });
  if (live?.q !== 'live') return null;
  const model = bedPrice({ dest, tier, adults, children, nights, start, live: false });
  if (!(model?.total > 0)) return null;
  return { ratio: live.total / model.total, checked: live.captured };
}

/** The cheapest bed for one person of two, per night (annual), across the
 *  tiers in a beds block: a dorm bed, or half a room or a place for two.
 *  For the "a bed from" facts (the PDF, the trip page). */
export function bedFromPerPerson(beds) {
  if (!beds) return null;
  const halves = [beds.private, beds.bnb_room, beds.hotel2, beds.hotel3, beds.bnb_home?.['2']]
    .filter((v) => v > 0).map((v) => v / 2);
  const all = [beds.dorm, ...halves].filter((v) => v > 0);
  return all.length ? Math.round(Math.min(...all) * 100) / 100 : null;
}

/** The 12 monthly nightly prices of a tier (EUR per unit), measured where the
 *  wire has them, else the annual figure repeated. For the month bars. */
export function monthRates(dest, tier, people = 2) {
  const t = normaliseTier(tier);
  const rec = stayRecord(dest?.id);
  const out = [];
  for (let m = 1; m <= 12; m += 1) {
    const one = dest?.accommodation?.beds ? nightFor(dest, rec, t, people, null, m) : null;
    out.push(one ? round2(one.rate) : null);
  }
  return out;
}

/** The two cheapest months to stay (1-based), from the measured curve of the
 *  tier, or null without a measured curve. */
export function cheapestMonths(dest, tier = 'home') {
  const rec = stayRecord(dest?.id);
  const curve = rec?.month?.[WIRE[normaliseTier(tier)]] || rec?.month?.hotel3 || rec?.month?.bnb_home;
  if (!Array.isArray(curve) || curve.length !== 12 || !curve.every((v) => v > 0)) return null;
  return curve.map((v, i) => [v, i + 1]).sort((a, b) => a[0] - b[0])
    .slice(0, 2).map(([, m]) => m).sort((a, b) => a - b);
}

/** The destination's 12-month price shape (a ratio to the year's mean) for
 *  the month price row, or null unless at least half the months were
 *  measured rather than filled. Reads the entire place first, then a 3-star
 *  room, then whatever bed was measured. */
export function seasonCurve(dest) {
  const rec = stayRecord(typeof dest === 'string' ? dest : dest?.id);
  if (!rec?.month) return null;
  const measured = (rec.season_q || '').split('').filter((c) => c === 'm').length;
  if (measured < 6) return null;
  const curve = rec.month.bnb_home || rec.month.hotel3 || Object.values(rec.month)[0];
  if (!Array.isArray(curve) || curve.length !== 12 || !curve.every((v) => v > 0)) return null;
  const mean = curve.reduce((a, b) => a + b, 0) / 12;
  return curve.map((v) => Math.round((v / mean) * 1000) / 1000);
}

function round2(v) {
  return Math.round(v * 100) / 100;
}
