/**
 * Shared request guards for the Pages Functions (T1079, roadmap C5):
 * strict query validators, one error shape, a method fallback and a per-address
 * rate limit. Pure functions where possible, so tests/functionGuards.test.mjs
 * covers them without a Workers runtime.
 *
 * Error shape: every refusal is `{"error": "<code>"}` with a status, no-store
 * and nosniff. The code is a fixed word (bad_request, method, rate, upstream),
 * never an upstream message, a stack or a path.
 *
 * Rate limit: two layers. (1) If the account has a Workers Rate Limiting
 * binding named RATE_LIMIT, it is used: it is shared by every isolate at the
 * edge location. (2) Always, a per-isolate sliding window in memory, which
 * only slows a burst on one isolate (it resets with the isolate). Without the
 * binding the Function still works, with the weaker layer only; adding the
 * binding is an owner step (docs/owner/web-hardening.md).
 */

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

/** One refusal. `extra` adds headers (Retry-After, Allow). */
export function fail(status, code, extra = {}) {
  return new Response(JSON.stringify({ error: code }), { status, headers: { ...BASE_HEADERS, ...extra } });
}

/** The 405 for any method a route does not export (export it as onRequest). */
export function methodNotAllowed(allow) {
  return fail(405, 'method', { allow });
}

/** The caller's address as Cloudflare saw it; 'unknown' groups the rest. */
export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}

/**
 * A sliding-window limiter held in memory: at most `max` hits per `windowMs`
 * for one key. `maxKeys` bounds the memory a flood of addresses can take.
 */
export function createLimiter({ max, windowMs = 60000, maxKeys = 5000 }) {
  const seen = new Map();
  return {
    /** Counts one hit; true when this key is over its limit. */
    hit(key, now = Date.now()) {
      const list = (seen.get(key) || []).filter((t) => now - t < windowMs);
      list.push(now);
      seen.set(key, list);
      if (seen.size > maxKeys) {
        for (const [k, v] of seen) if (!v.some((t) => now - t < windowMs)) seen.delete(k);
        if (seen.size > maxKeys) seen.clear();
      }
      return list.length > max;
    },
  };
}

/**
 * The binding names, one per endpoint (T1157, ROADMAP H3). Each has its own
 * limit and period in wrangler.toml, so ask, flights and stays are counted
 * apart. The old shared RATE_LIMIT binding is still honoured as a second try.
 */
export const RATE_BINDINGS = {
  ask: 'RL_ASK',
  answer: 'RL_ASK',
  flights: 'RL_FLIGHTS',
  stays: 'RL_STAYS',
  forecast: 'RL_FORECAST',
};

/**
 * True when this request is over its limit. Asks the endpoint's Workers Rate
 * Limiting binding first (shared by every isolate in a location), then the
 * shared RATE_LIMIT binding, then the in-memory window. A missing or failing
 * binding never blocks a traveller: the in-memory answer stands, so local dev
 * and tests keep working without any binding.
 */
export async function overLimit(env, request, limiter, name) {
  const ip = clientIp(request);
  const key = `${name}:${ip}`;
  const named = RATE_BINDINGS[name];
  for (const binding of [named && env?.[named], env?.RATE_LIMIT]) {
    if (typeof binding?.limit !== 'function') continue;
    try {
      const { success } = await binding.limit({ key });
      if (!success) return true;
      break;
    } catch { /* try the next layer */ }
  }
  return limiter.hit(key);
}

export const rateRefusal = () => fail(429, 'rate', { 'retry-after': '60' });

const IATA = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^-?\d{1,3}(\.\d{1,8})?$/;
export const MAX_AHEAD_DAYS = 330;

/** A real calendar date, YYYY-MM-DD (2026-02-31 is refused). */
export function isRealDate(s) {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * /api/flights query: three letters each for o and d (upper case only), a
 * real date from today to MAX_AHEAD_DAYS ahead. Returns { o, d, date } or null.
 */
export function parseFlightQuery(params, nowMs = Date.now()) {
  const o = params.get('o') || '';
  const d = params.get('d') || '';
  const date = params.get('date') || '';
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const last = new Date(nowMs + MAX_AHEAD_DAYS * 86400000).toISOString().slice(0, 10);
  if (!IATA.test(o) || !IATA.test(d) || o === d) return null;
  if (!isRealDate(date) || date < today || date > last) return null;
  return { o, d, date };
}

/**
 * /api/forecast query: lat in [-90, 90] and lon in [-180, 180] as plain
 * decimals (no exponent, no hex, no spaces, at most 8 decimals). The old
 * check used Number(), which accepts "1e2", "0x10" and " 5 ". Returns
 * { lat, lon } or null. The altitude is checked by metForecast.altitudeStep.
 */
export function parseForecastQuery(params) {
  const a = params.get('lat');
  const b = params.get('lon');
  if (!DECIMAL.test(a || '') || !DECIMAL.test(b || '')) return null;
  const lat = Number(a);
  const lon = Number(b);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

const ASK_SOURCES = /^[a-z]{2,10}$/;
// Filters only ever test set membership, so the shape check is about length
// and charset, not about which id exists (that is not this layer's business).
const ASK_TOKEN = /^[\p{L}\p{N}._ '-]{1,60}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * /api/ask query: q 1 to 200 characters with no control characters; src,
 * cc, d lists of short plain tokens (unknown source names are dropped later
 * against the manifest; here only the shape is checked); u at most 5 words
 * of at most 40 characters. Returns the cleaned fields or null when any part
 * is malformed (a malformed filter is refused, not silently widened).
 */
export function parseAskQuery(params) {
  const q = (params.get('q') || '').trim();
  if (!q || q.length > 200 || CONTROL.test(q)) return null;
  const list = (name, max, re) => {
    const raw = params.get(name);
    if (raw == null || raw === '') return [];
    const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
    if (parts.length > max || !parts.every((x) => re.test(x))) return undefined;
    return parts;
  };
  const src = list('src', 9, ASK_SOURCES);
  const cc = list('cc', 12, ASK_TOKEN);
  const d = list('d', 12, ASK_TOKEN);
  if (src === undefined || cc === undefined || d === undefined) return null;
  const rawU = params.get('u') || '';
  const u = rawU.split('|').map((w) => w.trim()).filter((w) => w.length > 2);
  if (u.length > 5 || rawU.length > 300 || u.some((w) => w.length > 40 || CONTROL.test(w))) return null;
  return { q, src, cc, d, u };
}
