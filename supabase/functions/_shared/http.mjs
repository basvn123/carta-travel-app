// Shared HTTP guards for the Edge Functions (T1079, roadmap C5): a CORS
// allow-list instead of `*`, a capped JSON body reader, a constant-time
// secret compare and a refusal that never echoes an upstream message.
// Plain ES module with no Deno API, so continent-app/tests/edgeHttp.test.mjs
// runs it under Node.

/** The origins the app is served from. ALLOWED_ORIGINS (comma separated) adds more. */
export const APP_ORIGINS = [
  'https://www.carta-europetravel.com',
  'https://carta-europetravel.com',
  'https://carta-app.pages.dev',
];
// Pages preview deploys (https://<hash>.carta-app.pages.dev, branch aliases)
// and a local dev or preview server on any port.
const PREVIEW = /^https:\/\/[a-z0-9-]+\.carta-app\.pages\.dev$/;
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

/** The origin to echo back for a request's Origin header, or '' when it is not an app origin. */
export function allowedOrigin(origin, extra = '') {
  if (typeof origin !== 'string' || !origin || origin === 'null') return '';
  if (APP_ORIGINS.includes(origin) || PREVIEW.test(origin) || LOCAL.test(origin)) return origin;
  const more = String(extra || '').split(',').map((x) => x.trim().replace(/\/+$/, '')).filter(Boolean);
  return more.includes(origin) ? origin : '';
}

const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type';

/**
 * Wraps a Deno.serve handler. The browser preflight is answered here (204 for
 * an app origin, 403 for any other), every response gets
 * Access-Control-Allow-Origin set to the caller's origin only when it is an
 * app origin (and Vary: Origin), and an exception that escapes the handler
 * becomes a bare 500 with a fixed code instead of a stack.
 * A request with no Origin header (a server, a mail client, Stripe) is passed
 * through untouched.
 */
export function withCors(handler, { methods = 'POST, OPTIONS', extraOrigins = () => '' } = {}) {
  return async (req) => {
    const origin = allowedOrigin(req.headers.get('origin'), extraOrigins());
    const cors = {
      'Access-Control-Allow-Headers': ALLOW_HEADERS,
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    };
    if (origin) cors['Access-Control-Allow-Origin'] = origin;
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: origin || !req.headers.get('origin') ? 204 : 403, headers: cors });
    }
    let res;
    try { res = await handler(req); } catch {
      res = new Response(JSON.stringify({ code: 'server' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    if (!origin) res.headers.delete('Access-Control-Allow-Origin');
    if (res.status === 401 || res.status === 403) securityEvent(req, res.status, origin);
    return res;
  };
}

/**
 * One JSON log line per refused request (T1211, row T1164-i, ASVS V16.3.1 and
 * V16.3.2): 401 and 403 answers of every function wrapped in withCors land in
 * the Supabase function logs with a fixed shape an alert can match on
 * ("carta_security":"auth_refused"). No token, address, e-mail or body is
 * written: only the function, the method, the status, whether a credential
 * was sent and whether the origin was an app origin.
 */
export function securityEvent(req, status, origin, log = console.warn) {
  let fn = '';
  try { fn = new URL(req.url).pathname.split('/').filter(Boolean).pop() || ''; } catch { /* keep blank */ }
  const auth = req.headers.get('authorization') || '';
  try {
    log(JSON.stringify({
      carta_security: 'auth_refused',
      fn: fn.slice(0, 40),
      method: req.method,
      status,
      credential: auth ? (/^Bearer\s+\S+/i.test(auth) ? 'bearer' : 'other') : 'none',
      app_origin: !!origin,
      at: new Date().toISOString(),
    }));
  } catch { /* logging never breaks an answer */ }
}

/** Thrown by readJson: code is 'too_large' or 'bad_json'. */
export class BodyError extends Error {
  constructor(code) { super(code); this.code = code; }
}

/**
 * The request body as a JSON object, read with a hard byte cap. A declared
 * Content-Length over the cap is refused before reading; a body with no or a
 * false length is cut off as soon as it passes the cap. An array, a string, a
 * number or null is not an object and is refused as bad_json.
 */
export async function readJson(req, maxBytes) {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new BodyError('too_large');
  const chunks = [];
  let total = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { try { await reader.cancel(); } catch { /* already closed */ } throw new BodyError('too_large'); }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
  let parsed;
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new BodyError('bad_json'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BodyError('bad_json');
  return parsed;
}

/** The status and code a readJson failure answers with. */
export function bodyProblem(e) {
  return e instanceof BodyError && e.code === 'too_large'
    ? { status: 413, code: 'too_large' }
    : { status: 400, code: 'bad_json' };
}

/** A shared secret in a header, compared in constant time over SHA-256 digests. */
export async function secretMatches(header, secret) {
  if (!secret || typeof header !== 'string' || header.length === 0) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([header, secret].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}
