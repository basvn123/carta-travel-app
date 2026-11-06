/**
 * Error tracking for the Pages Functions (T1120, ROADMAP H2). Same scrubber as
 * the app (src/lib/errorEvent.js). A no-op without the SENTRY_DSN secret.
 *
 *   SENTRY_DSN     the tracker DSN (Pages secret; owner step).
 *   SENTRY_OFF     any non-empty value is the kill switch.
 *   SENTRY_SAMPLE  share of errors sent, 0 to 1 (default 1: server errors are rare).
 *
 * What is sent: error type, scrubbed message and stack, the route's name, the
 * method and the path with no query string. Never headers, cookies, the body,
 * the address, or the query.
 */
import {
  parseDsn, buildEvent, buildEnvelope, newEventId, sampled,
} from '../../src/lib/errorEvent.js';
import { fail } from './guard.js';

/** Send one error. `transport(url, body)` is for tests. Never throws. */
export function captureFunctionError(error, { env = {}, request, name, transport, rnd } = {}) {
  try {
    if (env.SENTRY_OFF) return null;
    const dsn = parseDsn(env.SENTRY_DSN);
    if (!dsn) return null;
    const rate = env.SENTRY_SAMPLE === undefined || env.SENTRY_SAMPLE === '' ? 1 : Number(env.SENTRY_SAMPLE);
    if (!sampled(rate, rnd)) return null;
    let path;
    try { path = new URL(request.url).pathname; } catch { /* no request */ }
    const event = buildEvent(error, {
      release: env.CF_PAGES_COMMIT_SHA, environment: env.CF_PAGES_BRANCH === 'main' ? 'production' : 'preview',
      platform: 'node', source: 'pages-function', name, path, method: request?.method, eventId: newEventId(),
    });
    const body = buildEnvelope(event, env.SENTRY_DSN);
    const send = transport || ((url, b) => fetch(url, {
      method: 'POST', body: b, headers: { 'content-type': 'text/plain;charset=UTF-8' },
    }));
    return Promise.resolve(send(dsn.endpoint, body)).catch(() => {});
  } catch { return null; }
}

/**
 * Wrap a Pages handler: an unexpected throw is reported (after the response,
 * via waitUntil) and answered with the shared 500 shape. Returns and handled
 * refusals pass through untouched. `fallback(context)` replaces the 500 for a
 * route that must never turn a crash into an error page (the prerender one).
 */
export function withTracking(name, handler, { fallback } = {}) {
  return async (context) => {
    try {
      return await handler(context);
    } catch (error) {
      const p = captureFunctionError(error, { env: context.env, request: context.request, name });
      if (p && typeof context.waitUntil === 'function') context.waitUntil(p);
      return fallback ? fallback(context) : fail(500, 'server');
    }
  };
}
