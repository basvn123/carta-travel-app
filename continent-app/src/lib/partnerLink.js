/**
 * partnerLink.js, the one door every partner link goes through (ROADMAP I15,
 * T1172).
 *
 * The builders (affiliate.js, omio.js, activityAffiliates.js) decorate a URL
 * with the owner's partner id. This module decides what the anchor around that
 * URL looks like, so no component writes `rel` or the "partner link" mark by
 * hand:
 *
 *   - a link that carries a partner id of this build is a PARTNER link: it
 *     gets rel="sponsored noopener", target _blank, data-partner (the partner
 *     name, for the click counter's tests and for CSS) and the small mark;
 *   - any other link (no id configured, an official site, an operator page) is
 *     a PLAIN link: rel="noopener noreferrer", no mark. This is the fallback
 *     when the owner has not registered yet: the plain link works, nothing
 *     claims to earn.
 *
 * Counting stays where it was: launchEvents.js installs one cookieless
 * document listener that recognises the same decorated links
 * (affiliateClickOf), so a link built here is counted without a script of its
 * own. No partner widget, no partner script, no cookie.
 *
 * Rules the call sites keep (PRODUCT.md, I15): Carta's own figure is shown
 * before the link; one door per cost line; links are never sorted by what they
 * pay. The helper cannot enforce order, so partnerLinkProps never reorders
 * and partnerLinks() keeps the caller's order.
 */
import { aviasalesClickOf } from './affiliate.js';
import { activityClickOf } from './activityAffiliates.js';
import { omioClickOf } from './omio.js';

export const PARTNER_REL = 'sponsored noopener';
export const PLAIN_REL = 'noopener noreferrer';
/** The disclosure page (LegalFromUrl.jsx). */
export const PARTNER_PAGE_HREF = '/?legal=partner';

/** { partner, surface } for a link that carries a partner id of this build, else null. */
export function partnerOf(href) {
  if (typeof href !== 'string' || !href) return null;
  return aviasalesClickOf(href) || omioClickOf(href) || activityClickOf(href) || null;
}

export function isPartnerLink(href) {
  return partnerOf(href) !== null;
}

/** The rel value for any outbound href. */
export function partnerRel(href) {
  return isPartnerLink(href) ? PARTNER_REL : PLAIN_REL;
}

/**
 * Anchor props for an outbound link. Spread onto <a>:
 *   <a {...partnerLinkProps(url)}>label</a>
 * `extra` is merged last for className and the like, except rel/target/href.
 */
export function partnerLinkProps(href, extra = {}) {
  const hit = partnerOf(href);
  return {
    ...extra,
    href,
    target: '_blank',
    rel: hit ? PARTNER_REL : PLAIN_REL,
    ...(hit ? { 'data-partner': hit.partner } : {}),
  };
}

/** Props for the shared Button's `external` mode: href plus the right rel. */
export function partnerButtonProps(href) {
  const hit = partnerOf(href);
  return { href, external: true, rel: hit ? PARTNER_REL : PLAIN_REL, ...(hit ? { 'data-partner': hit.partner } : {}) };
}

/** True when any link in a list (strings, or objects with href/url) is a partner link. */
export function anyPartner(list) {
  return (list || []).some((l) => isPartnerLink(typeof l === 'string' ? l : l && (l.href || l.url)));
}
