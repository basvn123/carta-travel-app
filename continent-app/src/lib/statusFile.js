/**
 * statusFile.js, the outage line that does not need Supabase.
 *
 * The site notice (AnnouncementBar, site_config) is stored in Supabase, so it
 * goes silent exactly when Supabase is the thing that is down. This file is
 * the second channel docs/INCIDENT_RUNBOOK.md asks for (T218-a, built by
 * T316): one small JSON file on the data host, next to the shards, that the
 * owner uploads by hand during an incident and the app reads once at boot.
 *
 *   https://data.carta-europetravel.com/data/status.json   (R2: carta/data/status.json)
 *
 *   {
 *     "enabled": true,
 *     "tone": "warn",
 *     "text": "Signing in and saving trips are down. Your trips are safe.",
 *     "until": "2026-10-04T18:00:00Z"
 *   }
 *
 * text may also be a map by language ({"en": "...", "nl": "..."}); the
 * traveller's language is used when present, English otherwise. until is
 * optional: past it the line stops showing by itself, so a file forgotten
 * after an incident cannot keep announcing an outage that ended. tone is
 * "warn" or anything else for the quiet info look.
 *
 * Only a build with a data host (VITE_DATA_BASE, which build-pages.mjs always
 * sets for production) asks for the file. Without one (dev, npm run build, a
 * rollback build) there is no request at all: the same-origin path would be a
 * 404 or the SPA fallback page, which is console noise and a red ci:smoke
 * for a file that is not meant to live on the app host.
 *
 * Every failure is silent and means "no line": a 404, an HTML error page, bad
 * JSON, a network error, a slow host. A status line is never worth delaying
 * or breaking the app for, and a broken file must never show half a message.
 * The normal state on the data host is a file with "enabled": false, so a
 * quiet day is a 200 and not a 404 in every visitor's console.
 *
 * Pure apart from loadStatus(), so tests/statusFile.test.mjs runs it under
 * node with a fake fetch.
 */
import { DATA_BASE } from './dataHost.js';
import { stripDashes } from './format.js';

export const STATUS_FILE = 'status.json';
// Long enough for a cold TLS handshake on a phone, short enough that a hung
// data host is given up on long before anyone would read a banner.
export const STATUS_TIMEOUT_MS = 3000;

/** Where the status file lives on the data host, or '' without one. */
export function statusUrl(base = DATA_BASE) {
  return base ? `${base}/${STATUS_FILE}` : '';
}

function pickText(text, lang) {
  if (typeof text === 'string') return text;
  if (!text || typeof text !== 'object' || Array.isArray(text)) return '';
  const own = typeof text[lang] === 'string' ? text[lang].trim() : '';
  if (own) return own;
  return typeof text.en === 'string' ? text.en : '';
}

/**
 * The notice a parsed status file asks for, or null. Returns the same shape
 * AnnouncementBar draws from site_config: { text, tone, source }.
 */
export function parseStatus(raw, { lang = 'en', now = Date.now() } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.enabled !== true) return null;
  const text = stripDashes(pickText(raw.text, lang).replace(/\s+/g, ' ').trim());
  if (!text) return null;
  if (raw.until != null) {
    // An until that does not parse is ignored rather than obeyed: in an
    // incident a typo in the date should not swallow the whole line.
    const end = Date.parse(String(raw.until));
    if (Number.isFinite(end) && end <= now) return null;
  }
  return { text, tone: raw.tone === 'warn' ? 'warn' : 'info', source: 'status' };
}

/** The site_config announcement in the same shape, or null. */
export function siteNotice(a) {
  const text = a && a.enabled && typeof a.text === 'string' ? a.text.trim() : '';
  if (!text) return null;
  return { text, tone: a.tone === 'warn' ? 'warn' : 'info', source: 'site' };
}

/**
 * One line, never two. The status file wins: it is the incident channel,
 * written on purpose during an outage, while the site notice may be an older
 * routine message ("fares refresh tonight") that the outage makes irrelevant.
 */
export function pickNotice(status, site) {
  return status || site || null;
}

/**
 * Fetch and decode the file. Resolves to the raw object or null, never
 * rejects. fetchImpl and base are for the tests.
 */
export async function fetchStatus({
  base = DATA_BASE, fetchImpl = globalThis.fetch, timeoutMs = STATUS_TIMEOUT_MS,
} = {}) {
  const url = statusUrl(base);
  if (!url || typeof fetchImpl !== 'function') return null;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => { if (ctrl) ctrl.abort(); resolve(null); }, timeoutMs);
  });
  const read = (async () => {
    try {
      const res = await fetchImpl(url, {
        credentials: 'omit',
        ...(ctrl ? { signal: ctrl.signal } : {}),
      });
      if (!res || !res.ok) return null;
      // text() then parse, not json(): a dev server or an SPA fallback answers
      // a missing file with index.html and 200, and a file saved by Windows
      // PowerShell starts with a byte order mark.
      const body = (await res.text()).replace(/^[\s\u{FEFF}]+/u, '');
      return JSON.parse(body);
    } catch {
      return null;
    }
  })();
  try {
    return await Promise.race([read, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

let once = null;

/** Read once per page load: every caller shares the first request. */
export function loadStatus() {
  if (!once) once = fetchStatus();
  return once;
}
