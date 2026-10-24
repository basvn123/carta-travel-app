/**
 * waterFacts.js, the pure rules behind the climate, lake and beach slots of
 * the explore-completeness batch (T631). No React, no fetch: each function
 * takes wire values and answers with a value or null, so the sheet shows the
 * placeholder exactly where null comes back.
 *
 *   climateExtras     rain days, wind and ground elevation from a dest climate
 *   highPointOf       the highest mapped peak around a destination
 *   altitudeSeries    a temperature at altitude, derived with a lapse rate
 *   waterShoesHint    a hint derived from the beach surface
 *   audienceOf        who a beach suits, only where the wire says so
 *   routeRainWarning  the wet-rock rule for T2 and harder paths and gorges
 *   baseClimateUse    whether a nearby town's climate may stand in for a lake
 */

/** Standard environmental lapse rate, the one apply_climate.py corrects with. */
export const LAPSE_C_PER_KM = 6.5;

/** A height difference under this is not an altitude story: the valley figures apply. */
export const MIN_ALTITUDE_GAIN_M = 150;

/** Past this a town is not "the climate of the lake": the sheet says why it shows none. */
export const BASE_CLIMATE_MAX_KM = 30;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isSeries = (a) => Array.isArray(a) && a.length === 12;

/**
 * The T631 parallel arrays of a destination's climate block. The wire is
 * compact (sync-data.mjs: rd, wind, elev); the master file keeps the long
 * names (rain_days, wind_ms, elev_m). Either is read, neither is required.
 */
export function climateExtras(climate) {
  const rain = climate?.rd ?? climate?.rain_days;
  const wind = climate?.wind ?? climate?.wind_ms;
  const elev = climate?.elev ?? climate?.elev_m;
  return {
    sunH: isSeries(climate?.sun_h) ? climate.sun_h : null,
    waterC: isSeries(climate?.water_c) ? climate.water_c : null,
    rainDays: isSeries(rain) ? rain : null,
    windMs: isSeries(wind) ? wind : null,
    elevM: isNum(elev) ? elev : null,
  };
}

/** Metres per second to km/h, one decimal off. */
export const windKmh = (ms) => (isNum(ms) ? Math.round(ms * 3.6) : null);

/** The wind series in km/h, or null. */
export function windSeriesKmh(climate) {
  const { windMs } = climateExtras(climate);
  return windMs ? windMs.map(windKmh) : null;
}

/**
 * The highest mapped peak in the dossier's `around.mountains`, the one
 * altitude the wire carries for a destination's surroundings. `elev_m` is the
 * peak's height; null when there is none.
 */
export function highPointOf(around) {
  let best = null;
  for (const m of around?.mountains || []) {
    if (isNum(m?.elev_m) && (!best || m.elev_m > best.m)) {
      best = { m: Math.round(m.elev_m), name: m.name || '' };
    }
  }
  return best;
}

/**
 * Daytime highs and night lows at another height, derived from the valley
 * series with the lapse rate. `high` is { m, name }. Returns null when the
 * climate does not carry the destination's own elevation (the baseline of the
 * derivation), when the height is unknown, or when the gain is too small to
 * matter (see MIN_ALTITUDE_GAIN_M). Always a derived value: callers label it.
 */
export function altitudeSeries(climate, high) {
  const { elevM } = climateExtras(climate);
  const months = climate?.m;
  if (elevM == null || !high || !isNum(high.m) || !isSeries(months)) return null;
  const gainM = high.m - elevM;
  if (Math.abs(gainM) < MIN_ALTITUDE_GAIN_M) return null;
  const drop = (gainM / 1000) * LAPSE_C_PER_KM;
  const shift = (v) => (isNum(v) ? Math.round((v - drop) * 10) / 10 : null);
  return {
    m: Math.round(high.m),
    name: high.name || '',
    gainM: Math.round(gainM),
    hi: months.map((row) => shift(row?.[0])),
    lo: months.map((row) => shift(row?.[1])),
  };
}

/**
 * Whether the nearest town's climate may be shown on a lake or a beach, and
 * how far it is. `base` is the wire's { id, city, km } (straight line).
 */
export function baseClimateUse(base) {
  if (!base || !base.id || !isNum(base.km)) return { use: false, reason: 'none' };
  if (base.km > BASE_CLIMATE_MAX_KM) return { use: false, reason: 'far', km: Math.round(base.km) };
  return { use: true, km: Math.max(0.1, Math.round(base.km * 10) / 10) };
}

const STONY = new Set(['pebble', 'shingle', 'rock', 'gravel', 'stones', 'cobble']);
const SOFT = new Set(['sand', 'fineGravel', 'fine_gravel']);

/**
 * Water shoes, from the surface the beach is mapped with: 'yes' on pebble,
 * shingle, rock and gravel, 'no' on sand, null for everything else (grass,
 * concrete and the unmapped say nothing about the sea bed).
 */
export function waterShoesHint(surface) {
  if (!surface) return null;
  if (STONY.has(surface)) return 'yes';
  if (SOFT.has(surface)) return 'no';
  return null;
}

/**
 * Who a beach suits, from fields that say it exactly. A value is true only
 * when the wire has it; null means "not known", never "no".
 *   family  bestFor has "families"
 *   quiet   bestFor has "seclusion"
 *   dog     the OSM dog rule allows dogs (yes or on a lead)
 *   luxury  nothing in the wire says it, always null
 */
export function audienceOf(beach) {
  const best = beach?.bestFor || [];
  return {
    family: best.includes('families') ? true : null,
    quiet: best.includes('seclusion') ? true : null,
    dog: beach?.dog === 'yes' || beach?.dog === 'leash' ? true : null,
    luxury: null,
  };
}

/** The SAC grades from T2 up, where wet rock matters. T1 is a plain path. */
export const SAC_WET_ROCK = new Set([
  'mountain_hiking', 'demanding_mountain_hiking', 'alpine_hiking',
  'demanding_alpine_hiking', 'difficult_alpine_hiking',
]);

/** Rain of this much in a day counts for the warning (the forecast block's own bar). */
export const WET_DAY_MM = 1;

/** The forecast days the warning looks at: today and the two after. */
export const WARN_DAYS = 3;

/**
 * Should a route show the slippery-rock warning? Rule, from fields that exist:
 *   the route is T2 or harder on the SAC scale (`sac_scale`), or the trails
 *   wire marks it a gorge (`f.hl` has "gorge"),
 *   AND one of the next three forecast days has at least 1 mm of rain.
 * Returns null (no warning) or { reason: 'sac'|'gorge'|'both', date, mm }.
 * An unavailable forecast (null or undefined) is no warning: the caller says
 * so in its report, the sheet shows nothing for it.
 */
export function routeRainWarning({ sac, highlights, forecast }) {
  const reason = wetRockRoute(sac, highlights);
  if (!reason || !Array.isArray(forecast) || !forecast.length) return null;
  const wet = forecast.slice(0, WARN_DAYS).find((d) => isNum(d?.rainMm) && d.rainMm >= WET_DAY_MM);
  if (!wet) return null;
  return { reason, date: wet.date, mm: Math.round(wet.rainMm) };
}

/**
 * Whether the route itself is one where wet rock matters: 'sac' (T2 or
 * harder), 'gorge' (the wire's gorge highlight), 'both', or null. The sheet
 * asks this first so it fetches a forecast only for such a route.
 */
export function wetRockRoute(sac, highlights) {
  const bySac = SAC_WET_ROCK.has(sac);
  const byGorge = (highlights || []).includes('gorge');
  if (bySac && byGorge) return 'both';
  if (bySac) return 'sac';
  if (byGorge) return 'gorge';
  return null;
}

/**
 * The rows of the swim-safety block, one object per slot, each with a `value`
 * (a translation key plus optional params, or a raw string) or null when the
 * wire has nothing. null renders the shared placeholder. Absence is never
 * "safe": a missing lifeguard is unknown, not a no.
 *
 *   rule        'yes' | 'limited' | 'no' | 'unknown' | null   the swim verdict
 *   depthM      number | null
 *   hazards     codes, e.g. ['cold_shock', 'currents']
 *   lifeguard   true | null
 */
export function swimSafetyRows({ rule, depthM, hazards, lifeguard, banN = 0 }) {
  const have = new Set(hazards || []);
  const ruleKnown = rule && rule !== 'unknown';
  return [
    { key: 'rule', label: 'wx.ssRule', value: ruleKnown ? { key: `lake.swim${cap(rule)}` } : null },
    { key: 'depth', label: 'wx.ssDepth', value: isNum(depthM) && depthM > 0 ? { key: 'wx.ssDepthValue', params: { m: Math.round(depthM) } } : null },
    { key: 'currents', label: 'wx.ssCurrents', value: have.has('currents') ? { key: 'lake.hazCurrents' } : null },
    { key: 'ban', label: 'wx.ssBan', value: banN > 0 ? { key: 'wx.ssBanMapped', params: { n: banN } } : banValue(rule) },
    { key: 'guard', label: 'wx.ssGuard', value: lifeguard === true ? { key: 'wx.ssGuardYes' } : null },
  ];
}

function banValue(rule) {
  if (rule === 'no') return { key: 'wx.ssBanYes' };
  if (rule === 'limited') return { key: 'wx.ssBanLimited' };
  if (rule === 'yes') return { key: 'wx.ssBanNo' };
  return null;
}

function cap(s) {
  const str = String(s || '');
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

/**
 * The lake wind profile (T641): the twelve monthly mean 10 m wind speeds in
 * m/s from NASA POWER, as { lo, hi, peak } in km/h and the 0 based month of
 * the strongest mean. null when the wire has no profile. Thermal winds are not
 * in any open source and are not derived here.
 */
export function windProfileOf(profile) {
  const ms = profile?.ms;
  if (!isSeries(ms)) return null;
  const kmh = ms.map((v) => (isNum(v) ? v * 3.6 : null));
  const ok = kmh.filter(isNum);
  if (ok.length !== 12) return null;
  const hi = Math.max(...ok);
  return { lo: Math.round(Math.min(...ok)), hi: Math.round(hi), peak: kmh.indexOf(hi) };
}
