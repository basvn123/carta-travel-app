/**
 * parse-booking/logic.mjs, the pure half of the booking-import Edge Function.
 *
 * Everything here runs in BOTH Deno (the function) and Node (the tests in
 * continent-app/scripts/ai/test_import_logic.mjs), so no Deno globals, no
 * fetch, no crypto: just validation and shaping. The rule is the same one
 * plan-day lives by: nothing the model returns is trusted until it has been
 * through this file, and nothing the client sends reaches the prompt without
 * being whitelisted here first.
 */
import { cleanText } from '../plan-day/logic.mjs';

/* ---- the traveller's uploaded documents ---- */

// What Gemini can genuinely read inline. Everything else (docx, eml, heic)
// is refused client-side with a clear message rather than half-parsed here.
export const FILE_MIMES = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain',
]);
export const MAX_FILES = 4;
// Base64 budgets: ~4 MB binary per file, ~6 MB binary per request. Well under
// both the Edge Function request ceiling and Gemini's 20 MB inline limit,
// and a booking confirmation is a few hundred KB, so the caps only ever bite
// on someone uploading a photo album.
export const MAX_FILE_B64 = 5_600_000;
export const MAX_TOTAL_B64 = 8_400_000;
const B64_RE = /^[A-Za-z0-9+/=\-_]+$/;

/** Whitelist + clamp the uploaded files; null when the batch is unusable. */
export function sanitizeFiles(raw) {
  if (!Array.isArray(raw)) return [];
  const files = [];
  let total = 0;
  for (const f of raw.slice(0, MAX_FILES)) {
    if (!f || typeof f !== 'object') continue;
    const mime = String(f.mime || '');
    const data = typeof f.data === 'string' ? f.data : '';
    if (!FILE_MIMES.has(mime)) continue;
    if (!data || data.length > MAX_FILE_B64 || !B64_RE.test(data)) continue;
    total += data.length;
    if (total > MAX_TOTAL_B64) break;
    files.push({ mime, data, name: cleanText(String(f.name || ''), 80) });
  }
  return files;
}

/* ---- the trip context the model matches against ---- */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The trip's stops, as day-numbered lines the prompt can print. */
export function sanitizeTripContext(raw) {
  const stops = [];
  let dayNum = 1;
  for (const s of (Array.isArray(raw?.stops) ? raw.stops : []).slice(0, 12)) {
    const city = cleanText(String(s?.city ?? ''), 60);
    if (!city) continue;
    const nights = Math.max(1, Math.min(30, Math.round(Number(s?.nights)) || 1));
    stops.push({
      city,
      country: cleanText(String(s?.country ?? ''), 60),
      arrive: ISO_DATE.test(String(s?.arrive)) ? String(s.arrive) : '',
      nights,
      firstDay: dayNum,
      lastDay: dayNum + nights - 1,
    });
    dayNum += nights;
  }
  return {
    stops,
    totalDays: dayNum - 1,
    groupSize: Math.max(1, Math.min(20, Math.round(Number(raw?.groupSize)) || 2)),
  };
}

/* ---- the model's answer ---- */

export const BOOKING_KINDS = new Set([
  'flight_out', 'flight_home', 'flight', 'stay', 'car', 'transfer', 'activity', 'other',
]);

const round2 = (n) => Math.round(n * 100) / 100;
const money = (v, max = 99999) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? round2(Math.min(max, n)) : null;
};

/** Only a printed http(s) URL survives; anything else becomes ''. */
export function safeLink(v) {
  const s = String(v || '').trim();
  if (!s || s.length > 300) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

/**
 * The model's parse, reduced to exactly what the client may see. Bookings
 * without a title are noise; activities without a name are noise. Codes keep
 * their inner spaces (airlines print "ABC 123") but lose everything weird.
 */
export function sanitizeParsed(parsed, { totalDays = 60 } = {}) {
  const bookings = [];
  for (const b of (Array.isArray(parsed?.bookings) ? parsed.bookings : []).slice(0, 12)) {
    if (!b || typeof b !== 'object') continue;
    const title = cleanText(String(b.title ?? ''), 90);
    if (!title) continue;
    bookings.push({
      kind: BOOKING_KINDS.has(String(b.kind)) ? String(b.kind) : 'other',
      title,
      city: cleanText(String(b.city ?? ''), 60),
      code: cleanText(String(b.code ?? ''), 40),
      eur: money(b.eur),
      amount: money(b.amount, 9_999_999),
      currency: /^[A-Z]{3}$/.test(String(b.currency)) ? String(b.currency) : '',
      link: safeLink(b.link),
      date: ISO_DATE.test(String(b.date)) ? String(b.date) : '',
    });
  }
  const activities = [];
  for (const a of (Array.isArray(parsed?.activities) ? parsed.activities : []).slice(0, 20)) {
    if (!a || typeof a !== 'object') continue;
    const name = cleanText(String(a.name ?? ''), 90);
    if (!name) continue;
    const day = Math.round(Number(a.day));
    activities.push({
      name,
      city: cleanText(String(a.city ?? ''), 60),
      eur: money(a.eur, 9999),
      durationMin: Number.isFinite(Number(a.durationMin))
        ? Math.max(10, Math.min(600, Math.round(Number(a.durationMin)))) : null,
      note: cleanText(String(a.note ?? ''), 140),
      day: Number.isInteger(day) && day >= 1 && day <= totalDays ? day : null,
    });
  }
  return {
    bookings,
    activities,
    summary: cleanText(String(parsed?.summary ?? ''), 300),
  };
}

/* ---- URL ingestion (a travel blog, a shared itinerary page) ---- */

// Hosts a server-side fetch must never be pointed at: the function fetches
// whatever the traveller pastes, so the classic SSRF set is refused before
// any request leaves the process.
const PRIVATE_HOST_RE = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd])/i;

/** A URL the server may fetch: http(s), sane length, public host. '' = no. */
export function safeFetchUrl(v) {
  const s = String(v || '').trim();
  if (!s || s.length > 300) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    const host = u.hostname.toLowerCase();
    if (PRIVATE_HOST_RE.test(host) || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')) return '';
    return u.href;
  } catch {
    return '';
  }
}

/**
 * A fetched page reduced to readable text for the prompt. Deliberately crude:
 * scripts, styles and tags go, block boundaries become newlines, a handful of
 * entities decode. Gemini reads prose fine through the remaining noise, and a
 * real HTML parser is a dependency this function does not need.
 */
export function htmlToText(html, max = 20000) {
  return String(html || '')
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .slice(0, max);
}

/**
 * The cache identity of one import. Files ride as their hashes (computed by
 * the caller, which has crypto): hashing 8 MB of base64 into the key string
 * itself would work, but keys should stay loggable.
 */
export function cacheKeyInput({ model, fileHashes, text, context, lang }) {
  return JSON.stringify({
    v: 1,
    kind: 'import',
    model,
    files: fileHashes,
    text: cleanText(text, 20000).toLowerCase(),
    trip: (context?.stops || []).map((s) => [s.city, s.arrive, s.nights].join('|')),
    group: context?.groupSize || 2,
    lang,
  });
}
