/**
 * metForecast.js, MET Norway Locationforecast turned into Carta's daily rows
 * (T483, roadmap 1.10). Shared by the Pages Function that proxies MET
 * (functions/api/forecast.js), the Vite dev server and the unit test, so the
 * row shape is defined once.
 *
 * MET gives a time series in UTC: hourly for about 2.5 days, then 6-hourly,
 * up to 10 days. Each step at 00, 06, 12 and 18 UTC carries a next_6_hours
 * block with a symbol, the block's max and min (the complete endpoint only;
 * compact has none) and the precipitation in mm, so four blocks make one UTC
 * day. Days are UTC days: Europe sits at UTC+0 to UTC+3, which moves a block
 * edge by at most three hours, at night, not the afternoon high. MET gives no rain probability outside the Nordic model, so the row
 * carries the day's millimetres, never an invented percentage.
 */

export const MET_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/complete';

// MET's terms: identify the site and a contact in the User-Agent.
export const MET_USER_AGENT = 'carta-europetravel.com hello@carta-europetravel.com';

/** Round to about 1 km, so nearby destinations share one MET request
 *  (MET asks for at most 4 decimals and for caching). */
export function cell(lat, lon) {
  return [Math.round(lat * 100) / 100, Math.round(lon * 100) / 100];
}

/**
 * The `altitude` query parameter, made safe (T630, summit forecast). MET
 * corrects the temperature for the height of the point and takes whole
 * metres. Returns null when none was asked for, undefined when the value is
 * not a number (the caller answers 400), else metres clamped to 0 to 5000
 * and rounded to 50 m, so the edge cache key stays coarse: a request with an
 * altitude is a different upstream URL from one without, and two summits 20 m
 * apart share an answer.
 */
export function altitudeStep(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(Math.min(5000, Math.max(0, n)) / 50) * 50;
}

/** A MET symbol_code ("lightrainshowers_day") as the kind the UI draws. */
export function metKind(symbol) {
  const s = String(symbol || '').replace(/_(day|night|polartwilight)$/, '');
  if (!s) return null;
  if (s.includes('thunder')) return 'storm';
  if (s.includes('snow') || s.includes('sleet')) return 'snow';
  if (s.startsWith('light') && s.includes('rain')) return 'drizzle';
  if (s.includes('rain')) return 'rain';
  if (s === 'fog') return 'fog';
  if (s === 'cloudy') return 'cloud';
  if (s === 'clearsky') return 'sun';
  if (s === 'fair' || s === 'partlycloudy') return 'partsun';
  return 'cloud';
}

// The worst sky of a day wins, as Open-Meteo's daily weather_code did.
const SEVERITY = ['sun', 'partsun', 'cloud', 'fog', 'drizzle', 'rain', 'snow', 'storm'];

/** MET's JSON as at most `days` daily rows from today (UTC), plus when MET
 *  last ran the model. Null when the payload has no usable time series. */
export function metDaily(json, days = 7, todayIso = new Date().toISOString().slice(0, 10)) {
  const series = json?.properties?.timeseries;
  if (!Array.isArray(series)) return null;
  const byDay = new Map();
  for (const step of series) {
    const time = String(step?.time || '');
    const hour = Number(time.slice(11, 13));
    const block = step?.data?.next_6_hours;
    if (!block || hour % 6 !== 0) continue;
    const date = time.slice(0, 10);
    if (date < todayIso) continue;
    const d = byDay.get(date) || { hi: null, lo: null, mm: 0, kind: null };
    const max = block.details?.air_temperature_max;
    const min = block.details?.air_temperature_min;
    if (max != null) d.hi = d.hi == null ? max : Math.max(d.hi, max);
    if (min != null) d.lo = d.lo == null ? min : Math.min(d.lo, min);
    d.mm += block.details?.precipitation_amount ?? 0;
    const kind = metKind(block.summary?.symbol_code);
    if (kind && SEVERITY.indexOf(kind) > SEVERITY.indexOf(d.kind)) d.kind = kind;
    byDay.set(date, d);
  }
  const rows = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(0, days)
    .map(([date, d]) => ({
      date,
      kind: d.kind || 'cloud',
      hi: d.hi,
      lo: d.lo,
      rainMm: Math.round(d.mm * 10) / 10,
    }));
  return { updated: json?.properties?.meta?.updated_at || null, days: rows };
}
