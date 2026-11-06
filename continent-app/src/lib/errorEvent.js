// Error tracking core (T1120, ROADMAP H2). Pure functions, no browser or
// Workers globals, so the app, the Pages Functions and the tests all share
// one scrubber. Nothing here sends anything; see errorReporter.js (browser)
// and functions/_lib/track.js (Functions).
//
// Tracker: Sentry EU (de.sentry.io) or a self-hosted GlitchTip. Both accept
// the same envelope, so the DSN decides, not the code. We do not ship the
// Sentry SDK: its defaults (IP capture, breadcrumbs, request headers, replay)
// are the opposite of what Carta wants, and it costs about 25 KB gzipped.
// What an event may carry: error type, a scrubbed message, a stack of
// scrubbed frames, release, environment, the boundary name. What it never
// carries: user, IP, cookies, headers, query strings, breadcrumbs, request
// bodies, device ids.

export const MAX_MESSAGE = 300;
export const MAX_FRAMES = 30;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6 = /\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi;
const JWT = /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}\b/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;
const URLISH = /\bhttps?:\/\/[^\s"'<>)]+/gi;

/** A URL with the query string and fragment dropped (the hash holds routes and trip state). */
export function stripUrl(u) {
  const s = String(u ?? '');
  return s.replace(/[?#].*$/, '');
}

/** Free text with anything personal or secret-shaped removed, then truncated. */
export function scrubText(text, max = MAX_MESSAGE) {
  let s = String(text ?? '');
  s = s.replace(URLISH, (m) => stripUrl(m));
  s = s.replace(EMAIL, '[email]').replace(JWT, '[token]').replace(UUID, '[id]')
    .replace(IPV6, '[ip]').replace(IPV4, '[ip]').replace(LONG_TOKEN, '[token]');
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

/** Parse "https://KEY@o123.ingest.de.sentry.io/456". Null for anything else. */
export function parseDsn(dsn) {
  if (typeof dsn !== 'string' || !dsn) return null;
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+|\/+$/g, '');
    if (u.protocol !== 'https:' || !u.username || !/^\d+$/.test(project)) return null;
    return {
      key: u.username,
      host: u.host,
      project,
      endpoint: `https://${u.host}/api/${project}/envelope/?sentry_key=${encodeURIComponent(u.username)}&sentry_version=7`,
    };
  } catch { return null; }
}

/** Frames from a V8 / Firefox / Safari stack string, oldest call last (Sentry order). */
export function parseStack(stack) {
  if (typeof stack !== 'string') return [];
  const frames = [];
  for (const raw of stack.split('\n')) {
    const line = raw.trim();
    let m = /^at (?:(.*?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (!m) m = /^(.*?)@(.+?):(\d+):(\d+)$/.exec(line);
    if (!m) continue;
    const [, fn, file, l, c] = m;
    frames.push({
      function: scrubText(fn || '?', 80),
      filename: stripUrl(file).replace(/^https?:\/\/[^/]+/, ''),
      lineno: Number(l),
      colno: Number(c),
    });
    if (frames.length >= MAX_FRAMES) break;
  }
  return frames.reverse();
}

/** Deterministic id for a dedupe window; not secret, not personal. */
export function fingerprint(name, message, frames) {
  const top = frames.length ? frames[frames.length - 1] : null;
  return [name, scrubText(message, 120), top ? `${top.filename}:${top.lineno}` : ''].join('|');
}

/**
 * The event for one error. `extra` carries only fixed words (source, boundary
 * name, function name); it is scrubbed anyway.
 */
export function buildEvent(error, { release, environment, platform = 'javascript', source, name, path, method, eventId } = {}) {
  const e = error && typeof error === 'object' ? error : { message: String(error ?? 'unknown') };
  const type = scrubText(e.name || 'Error', 60);
  const value = scrubText(e.message || String(error ?? ''));
  const frames = parseStack(e.stack);
  const tags = {};
  if (source) tags.source = scrubText(source, 40);
  if (name) tags.name = scrubText(name, 60);
  if (method) tags.method = scrubText(method, 10);
  if (path) tags.path = scrubText(stripUrl(path), 120);
  return {
    event_id: eventId || '0'.repeat(32),
    timestamp: Date.now() / 1000,
    platform,
    level: 'error',
    release: release || undefined,
    environment: environment || 'production',
    exception: { values: [{ type, value, stacktrace: frames.length ? { frames } : undefined }] },
    tags,
    fingerprint: [fingerprint(type, value, frames)],
    // Explicit, so a tracker never fills them from the request.
    user: undefined,
    request: undefined,
    breadcrumbs: undefined,
    sdk: { name: 'carta.minimal', version: '1' },
  };
}

/** Sentry envelope text: header, item header, payload. */
export function buildEnvelope(event, dsn) {
  return [
    JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString(), dsn }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n');
}

/** Random 32-hex id (needs crypto; falls back to Math.random for old runtimes). */
export function newEventId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

/** True for a sampling rate that lets this event through. */
export function sampled(rate, rnd = Math.random) {
  const r = Number(rate);
  if (!Number.isFinite(r)) return false;
  return r >= 1 || (r > 0 && rnd() < r);
}
