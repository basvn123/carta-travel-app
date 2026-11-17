import React, { useState } from 'react';
import { TermsOfService } from './TermsOfService.jsx';
import { PrivacyPolicy } from './PrivacyPolicy.jsx';
import { Imprint } from './Imprint.jsx';
import { CookiesPage } from './CookiesPage.jsx';
import { SupportPage } from './SupportPage.jsx';
import { PressKitPage } from './PressKitPage.jsx';
import { AiPage } from './AiPage.jsx';
import { PartnerPage } from './PartnerPage.jsx';
import { NotFoundPage } from './NotFoundPage.jsx';
import { isUnknownPath } from '../lib/notFound.js';

/**
 * Gives the three legal texts a URL without giving the app a router.
 *
 *   /?legal=terms     Terms of service
 *   /?legal=privacy   Privacy policy
 *   /?legal=imprint   Imprint
 *   /?legal=cookies   Cookies and storage (T945)
 *   /?legal=support   Help and contact: mail, status, questions (T1108)
 *   /?legal=press     Press kit: facts, images, contact (T1131)
 *   /?legal=ai        How Carta uses AI (T1156)
 *   /?legal=partner   Partner links and how they are disclosed (I15, T1172)
 *
 * Carta is a single page with query-string state, so a legal text that only
 * opens from a button inside the Account panel has no address. Stripe
 * Checkout's consent checkbox needs one (the Terms URL is set in the Stripe
 * Dashboard and printed on the checkout page), app store review forms ask for
 * one, and a lawyer or a customer wants to be sent a link rather than a
 * click path.
 *
 * Read once at mount, from the query string only, so a shared link opens the
 * text on top of whatever tab the URL otherwise decodes to (no tab means the
 * map). Closing drops the parameter with replaceState so a reload does not
 * bring it back, and leaves every other parameter alone.
 */
const PAGES = { terms: TermsOfService, privacy: PrivacyPolicy, imprint: Imprint, cookies: CookiesPage, support: SupportPage, press: PressKitPage, ai: AiPage, partner: PartnerPage };

function readLegalParam() {
  if (typeof window === 'undefined') return '';
  const v = new URLSearchParams(window.location.search).get('legal') || '';
  return PAGES[v] ? v : '';
}

export function LegalFromUrl() {
  const [page, setPage] = useState(readLegalParam);
  // The 404 (house style G1, 2026-11): an address the app cannot read shows
  // the not-found page over the app instead of the bare map. Read once at
  // mount, like the legal parameter; lib/notFound.js says which paths.
  const [lost, setLost] = useState(() => typeof window !== 'undefined' && isUnknownPath(window.location.pathname));
  if (lost) return <NotFoundPage onClose={() => setLost(false)} />;
  if (!page) return null;
  const Page = PAGES[page];
  const close = () => {
    setPage('');
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('legal');
      window.history.replaceState(window.history.state, '', url);
    } catch { /* leave the URL as it is */ }
  };
  return <Page onClose={close} />;
}
