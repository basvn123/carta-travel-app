/**
 * Activity booking affiliates: GetYourGuide and Viator.
 *
 * The dossier pipeline stores BARE search and product URLs (a build artefact
 * should not bake a partner id into 3,038 files); this module decorates them
 * at render time, in the destination page and in the PDF alike, so one env
 * change monetises every surface at once. Same contract as affiliate.js and
 * omio.js: ids come from the environment, and with nothing configured every
 * function returns the URL unchanged, so local builds, forks and previews
 * work untouched and earn nobody anything.
 *
 * Configure in .env / host env vars:
 *   VITE_GYG_PARTNER_ID   GetYourGuide partner id  -> appends partner_id=
 *   VITE_VIATOR_PID       Viator partner id (P...) -> appends pid= (+ medium)
 *
 * Both programs attribute on the decorated click alone: no token, no network
 * request, no backend. Decoration only touches getyourguide.* and viator.*
 * hosts; any other URL (an official site, a park ticket page) passes through
 * untouched, because sending a municipal ticket office a partner id is noise.
 */

const GYG_ID = (import.meta.env?.VITE_GYG_PARTNER_ID || '').trim();
const VIATOR_PID = (import.meta.env?.VITE_VIATOR_PID || '').trim();

const GYG_HOST = /(^|\.)getyourguide\.[a-z.]+$/i;
const VIATOR_HOST = /(^|\.)viator\.com$/i;

/** True when at least one activity partner id is configured. */
export function hasActivityAffiliate() {
  return GYG_ID.length > 0 || VIATOR_PID.length > 0;
}

function withParams(url, params) {
  try {
    const u = new URL(url);
    for (const [k, v] of Object.entries(params)) {
      if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    }
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Decorate one outbound activity URL with the matching partner id.
 * Unknown hosts and unconfigured programs pass through unchanged.
 */
export function activityLink(url, subId = 'dest') {
  if (typeof url !== 'string' || !url) return url;
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return url;
  }
  if (GYG_ID && GYG_HOST.test(host)) {
    return withParams(url, { partner_id: GYG_ID, cmp: subId });
  }
  if (VIATOR_PID && VIATOR_HOST.test(host)) {
    return withParams(url, { pid: VIATOR_PID, medium: 'link', campaign: subId });
  }
  return url;
}
