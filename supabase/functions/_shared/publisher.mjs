/**
 * What counts as a publisher, for the Edge Functions.
 *
 * The JavaScript twin of registrable(), is_blocked() and publisher() in
 * pipeline/dossier/common.py. Both read the one list in blocked_domains.json
 * beside this file (T327, register row T041-f), so a domain blocked for the
 * dossier sweep is blocked for the facts refresh job too. Change the rule in
 * both files at once; tests/test_blocked_domains.py runs the same hosts
 * through both and fails on any disagreement.
 *
 * Nothing imports this yet. The facts refresh function T147 builds is the
 * first caller: a grounded answer is kept only when one of its citations is a
 * publisher by this definition.
 */
import BLOCKED from './blocked_domains.json' with { type: 'json' };

export const BLOCKED_DOMAINS = new Set(BLOCKED.domains);
const BLOCKED_BRANDS = new Set([...BLOCKED_DOMAINS].map((d) => d.split('.')[0]));
const TLD2 = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);

/**
 * example.co.uk -> example.co.uk ; a.b.example.com -> example.com.
 * The www. prefix is sliced, never stripped character by character, so
 * wien.info stays wien.info.
 */
export function registrable(host) {
  let h = String(host || '').toLowerCase().split(':')[0];
  if (h.startsWith('www.')) h = h.slice(4);
  const parts = h.split('.').filter(Boolean);
  if (parts.length < 2) return parts.join('.');
  if (parts.length >= 3 && TLD2.has(parts[parts.length - 2]) && parts[parts.length - 1].length === 2) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

/**
 * A blocked aggregator stays blocked in its country editions
 * (tripadvisor.co.za is tripadvisor.com), matched on the brand label only
 * when the brand is five letters or more, so x.com and trip.com do not
 * blacklist every domain that starts the same way.
 */
export function isBlocked(domain) {
  const d = String(domain || '');
  if (BLOCKED_DOMAINS.has(d)) return true;
  const brand = d.split('.')[0];
  return brand.length >= 5 && BLOCKED_BRANDS.has(brand);
}

/** The registrable domain of a URL, or '' when it is one we do not count. */
export function publisher(url) {
  let netloc = '';
  try {
    const u = new URL(String(url || ''));
    netloc = u.host;
  } catch {
    return '';
  }
  const dom = registrable(netloc);
  return isBlocked(dom) ? '' : dom;
}
