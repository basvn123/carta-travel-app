/**
 * checkoutUrls: where Stripe sends the traveller after paying or cancelling
 * (E10, J-5). Pure, so a node test covers it without Deno.
 *
 * The old code built both URLs from the request's own origin, which on a
 * preview or a proxied call is the wrong host. Now the origin comes only from
 * the server's allow-listed APP_ORIGIN secret (or the owner's full
 * CHECKOUT_SUCCESS_URL / CHECKOUT_CANCEL_URL), and with neither set the
 * function refuses (fail closed) instead of guessing. `returnTo` is a path on
 * that origin and nothing else.
 */

/** A same-origin path ("/trip?id=3#day"), or "/" for anything else. */
export function safeReturnTo(raw) {
  if (typeof raw !== 'string') return '/';
  const s = raw.trim();
  if (!s || s.length > 500) return '/';
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\')) return '/';
  // eslint-disable-next-line no-control-regex -- a control character in an address is never a real path
  if (/[\u0000-\u001f\u007f]/.test(s)) return '/';
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(s)) return '/';
  return s;
}

/** The path with `pass` set (and any older `pass` dropped), the hash kept last. */
export function withPass(path, value) {
  const hashAt = path.indexOf('#');
  const hash = hashAt >= 0 ? path.slice(hashAt) : '';
  const rest = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const qAt = rest.indexOf('?');
  const pathname = qAt >= 0 ? rest.slice(0, qAt) : rest;
  const params = new URLSearchParams(qAt >= 0 ? rest.slice(qAt + 1) : '');
  params.set('pass', value);
  return `${pathname}?${params.toString()}${hash}`;
}

/**
 * { success, cancel } or null when the server has no allow-listed origin.
 * env: { APP_ORIGIN, CHECKOUT_SUCCESS_URL, CHECKOUT_CANCEL_URL } strings.
 */
export function checkoutUrls(env, returnTo) {
  const origin = String(env.APP_ORIGIN || '').trim().replace(/\/+$/, '');
  const okOrigin = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin) || /^http:\/\/localhost(:\d+)?$/i.test(origin);
  const path = safeReturnTo(returnTo);
  const success = env.CHECKOUT_SUCCESS_URL || (okOrigin ? `${origin}${withPass(path, 'ok')}` : '');
  const cancel = env.CHECKOUT_CANCEL_URL || (okOrigin ? `${origin}${withPass(path, 'cancel')}` : '');
  return success && cancel ? { success, cancel } : null;
}
