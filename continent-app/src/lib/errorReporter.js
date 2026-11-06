// Browser error reporter (T1120, ROADMAP H2). Reports render crashes (from the
// boundaries), window.onerror and unhandled rejections to one tracker, with
// the scrubbing in errorEvent.js. It is a no-op until a DSN is set.
//
// Switches (all build-time, in the Pages project's variables):
//   VITE_ERROR_DSN      the tracker DSN. Empty or invalid: nothing is sent, no
//                       listener is installed.
//   VITE_ERROR_TRACKING 'off' is the kill switch: same as no DSN. Flip it and
//                       redeploy, or delete the DSN.
//   VITE_ERROR_SAMPLE   share of errors sent, 0 to 1 (default 0.5).
//   VITE_RELEASE        release tag (the commit); optional.
// A traveller's own signals also win: Global Privacy Control or Do Not Track
// on, or localStorage 'carta.errorTracking' = 'off', and nothing is sent.
//
// Limits: at most 5 events per page load, and the same error once per load.
import {
  parseDsn, buildEvent, buildEnvelope, newEventId, sampled,
} from './errorEvent.js';

const MAX_PER_LOAD = 5;
const OFF_KEY = 'carta.errorTracking';

const state = { cfg: null, sent: 0, seen: new Set(), installed: false };

function env() {
  try { return import.meta.env || {}; } catch { return {}; }
}

function travellerOptedOut() {
  try {
    if (typeof navigator !== 'undefined' && (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1')) return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem(OFF_KEY) === 'off') return true;
  } catch { /* storage blocked: carry on */ }
  return false;
}

/** The active config, or null when tracking is off. `over` is for tests. */
export function trackingConfig(over = {}) {
  const e = { ...env(), ...over };
  if (String(e.VITE_ERROR_TRACKING || '').toLowerCase() === 'off') return null;
  const dsn = parseDsn(e.VITE_ERROR_DSN);
  if (!dsn) return null;
  const rate = e.VITE_ERROR_SAMPLE === undefined || e.VITE_ERROR_SAMPLE === '' ? 0.5 : Number(e.VITE_ERROR_SAMPLE);
  return {
    dsn, dsnText: e.VITE_ERROR_DSN, rate, release: e.VITE_RELEASE || undefined,
    environment: e.MODE === 'production' ? 'production' : (e.MODE || 'development'),
    dev: Boolean(e.DEV),
  };
}

/** Test hook: forget the page-load counters and the cached config. */
export function resetReporter() { state.cfg = null; state.sent = 0; state.seen = new Set(); }

/**
 * Report one error. Never throws, never blocks. `transport(url, body)` and
 * `over` exist for tests; the default transport is fetch with keepalive.
 */
export function captureError(error, { source = 'app', name, over, transport, rnd } = {}) {
  try {
    const cfg = over ? trackingConfig(over) : (state.cfg ||= trackingConfig());
    if (!cfg || (cfg.dev && !over)) return false;
    if (travellerOptedOut()) return false;
    if (state.sent >= MAX_PER_LOAD) return false;
    if (!sampled(cfg.rate, rnd)) return false;
    const event = buildEvent(error, {
      release: cfg.release, environment: cfg.environment, source, name, eventId: newEventId(),
    });
    const fp = event.fingerprint[0];
    if (state.seen.has(fp)) return false;
    state.seen.add(fp);
    state.sent += 1;
    const body = buildEnvelope(event, cfg.dsnText);
    const send = transport || ((url, b) => fetch(url, {
      method: 'POST', body: b, keepalive: true, mode: 'cors', credentials: 'omit',
      referrerPolicy: 'no-referrer', headers: { 'content-type': 'text/plain;charset=UTF-8' },
    }).then(() => {}, () => {}));
    Promise.resolve(send(cfg.dsn.endpoint, body)).catch(() => {});
    return true;
  } catch { return false; }
}

/** Install the global listeners once. Does nothing without a DSN. */
export function installErrorReporting() {
  if (state.installed || typeof window === 'undefined') return false;
  if (!trackingConfig()) return false;
  state.installed = true;
  window.addEventListener('error', (ev) => {
    // Resource load errors (img, script) bubble here without an Error.
    if (!ev.error && !ev.message) return;
    captureError(ev.error || new Error(ev.message), { source: 'window.onerror' });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    captureError(ev.reason instanceof Error ? ev.reason : new Error(String(ev.reason ?? 'rejection')), { source: 'unhandledrejection' });
  });
  return true;
}
