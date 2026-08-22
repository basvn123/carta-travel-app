/**
 * shareLink.js, a trip plan as a URL anyone can open.
 *
 * The whole draft (stops, nights, dates, party, transport choices) is small,
 * so it travels inside the link itself: JSON, deflate-compressed where the
 * browser supports CompressionStream, then base64url in the URL hash. No
 * backend, no expiry, and nothing is uploaded anywhere: the link IS the trip.
 *
 * The hash is used (not the query string) so the payload never reaches the
 * server logs and never collides with useUrlSync's browse-state params. It is
 * read once at startup, before useUrlSync's first replaceState would drop it,
 * and stripped from the address bar right away. Supabase auth links also land
 * in the hash (#access_token...&type=...), so the reader only touches hashes
 * that carry our own `trip=` param.
 *
 * Payloads are versioned ("1." = deflate, "0." = plain) and every field is
 * whitelisted and clamped on decode: a tampered link can at worst open a
 * harmless trip, never inject markup or oversized state.
 */

const PARAM = 'trip';

/* ---- base64url over raw bytes ---- */

function toB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? b64 + '='.repeat(4 - (b64.length % 4)) : b64;
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---- compression (best-effort; older browsers ship uncompressed) ---- */

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ---- encode ---- */

/** The draft as a hash payload ("1.<b64>" compressed, "0.<b64>" plain). */
export async function encodeTripShare(draft) {
  if (!draft || !Array.isArray(draft.stops) || !draft.stops.length) return null;
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(draft));
    if (typeof CompressionStream !== 'undefined') {
      return `1.${toB64url(await deflate(bytes))}`;
    }
    return `0.${toB64url(bytes)}`;
  } catch {
    return null;
  }
}

/** The full shareable URL for a trip draft, or null when it cannot be built. */
export async function buildTripShareUrl(draft) {
  const payload = await encodeTripShare(draft);
  if (!payload || typeof window === 'undefined') return null;
  return `${window.location.origin}${window.location.pathname}#${PARAM}=${payload}`;
}

/* ---- decode ---- */

const clampInt = (v, min, max, dflt) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : dflt;
};
const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const strOrNull = (v) => (typeof v === 'string' && v ? v.slice(0, 40) : null);
const oneOf = (v, opts, dflt) => (opts.includes(v) ? v : dflt);

const LEG_MODES = new Set(['train', 'bus', 'car']);
// Hops the sender booked themselves; they travel with a price because Carta
// cannot re-derive one at the other end.
const OWN_LEG_MODES = new Set(['fly', 'ferry', 'train', 'bus', 'car']);

/** Whitelist + clamp a decoded payload into a safe draft; null when unusable. */
function sanitizeShared(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.stops)) return null;
  const stops = d.stops.slice(0, 20).map((s) => ({
    destinationId: typeof s?.destinationId === 'string' ? s.destinationId.slice(0, 40) : '',
    nights: clampInt(s?.nights, 1, 30, 2),
    activities: Array.isArray(s?.activities)
      ? s.activities.slice(0, 20).map((a) => String(a).slice(0, 80))
      : [],
  })).filter((s) => s.destinationId);
  if (!stops.length) return null;

  const legModes = {};
  if (d.legModes && typeof d.legModes === 'object') {
    for (const [k, v] of Object.entries(d.legModes)) {
      const i = Number(k);
      if (Number.isInteger(i) && i >= 0 && i < stops.length && LEG_MODES.has(v)) legModes[i] = v;
    }
  }

  const ownLegs = {};
  if (d.ownLegs && typeof d.ownLegs === 'object') {
    for (const [k, v] of Object.entries(d.ownLegs)) {
      const i = Number(k);
      if (!Number.isInteger(i) || i < 0 || i >= stops.length) continue;
      if (!v || typeof v !== 'object' || !OWN_LEG_MODES.has(v.mode)) continue;
      ownLegs[i] = { mode: v.mode, eur: clampInt(v.eur, 0, 99999, 0) };
    }
  }

  const ownFlight = d.ownFlight && typeof d.ownFlight === 'object'
    ? {
      airline: String(d.ownFlight.airline || '').slice(0, 60),
      // How they get there. Absent on links shared before the wizard could
      // ask, which is what 'fly' meant back then.
      mode: oneOf(d.ownFlight.mode, ['fly', 'train', 'bus', 'car', 'ferry'], 'fly'),
      costTotal: Number.isFinite(Number(d.ownFlight.costTotal))
        ? Math.max(0, Math.min(99999, Number(d.ownFlight.costTotal)))
        : null,
    }
    : null;

  return {
    tripStart: isIsoDate(d.tripStart) ? d.tripStart : '',
    stops,
    legModes,
    ownLegs,
    ownFlight,
    groupSize: clampInt(d.groupSize, 1, 20, 2),
    transportPref: oneOf(d.transportPref, ['auto', 'car', 'owncar', 'public'], 'auto'),
    pace: oneOf(d.pace, ['relaxed', 'balanced', 'packed'], 'balanced'),
    baggage: oneOf(d.baggage, ['cabin', 'priority', 'checked'], 'cabin'),
    anchorId: strOrNull(d.anchorId),
    anchorOrigin: strOrNull(d.anchorOrigin),
    returnAnchorId: strOrNull(d.returnAnchorId),
    label: String(d.label || '').slice(0, 80),
  };
}

/** Decode a raw hash payload back into a safe draft; null on any failure. */
export async function decodeTripShare(raw) {
  if (typeof raw !== 'string' || raw.length < 3 || raw.length > 20000) return null;
  const dot = raw.indexOf('.');
  if (dot !== 1) return null;
  const marker = raw[0];
  try {
    let bytes = fromB64url(raw.slice(2));
    if (marker === '1') {
      if (typeof DecompressionStream === 'undefined') return null;
      bytes = await inflate(bytes);
    } else if (marker !== '0') {
      return null;
    }
    return sanitizeShared(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

/**
 * Read our share payload out of the URL hash, stripping it from the address
 * bar in the same breath (a reload should not re-prompt). Auth hashes and
 * anything else that is not ours are left untouched. Synchronous, so it can
 * run in a useState initializer before useUrlSync's first URL write.
 *
 * Idempotent: the first read is cached, because stripping the hash is a side
 * effect and React StrictMode double-invokes state initializers in dev - the
 * second call used to find an already-stripped hash and return null, silently
 * discarding every share link in development.
 */
let readResult;
export function readTripShareFromUrl() {
  if (readResult !== undefined) return readResult;
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (!hash.startsWith('#') || !hash.includes(`${PARAM}=`)) return (readResult = null);
  const raw = new URLSearchParams(hash.slice(1)).get(PARAM);
  if (!raw) return (readResult = null);
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch { /* the decode still works; only the address bar stays busy */ }
  return (readResult = raw);
}
