/**
 * stubs.js, the honest stub of a famous walk Carta cannot build (T124,
 * destinations spec 6.5).
 *
 * pipeline/trails/export_stubs.py writes /trails/stubs/{CC}.json: registry
 * walks above the fame bar that no published trail matches and that open data
 * cannot build today. A country with none has no file; publishedJson answers
 * null for it, which here means an empty list.
 */
import { makeCache } from './publishedJson.js';

const cached = makeCache();
const COUNTRY_RE = /^[A-Z]{2}$/;

/** Every stub of one country, most famous first. [] when there are none. */
export function loadStubs(country) {
  const cc = String(country || '').toUpperCase();
  if (!COUNTRY_RE.test(cc)) return Promise.resolve([]);
  return cached(`/trails/stubs/${cc}.json`).then((raw) => (
    raw && Array.isArray(raw.stubs) ? raw.stubs.filter((s) => s && s.id && s.name) : []
  ));
}

/** The outbound link, only when it is an https URL we wrote ourselves. */
export function stubLink(stub) {
  const l = stub?.link;
  if (!l || typeof l.url !== 'string' || !/^https:\/\//.test(l.url)) return null;
  return l;
}
