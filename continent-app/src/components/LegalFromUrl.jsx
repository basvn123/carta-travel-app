import React, { useState } from 'react';
import { TermsOfService } from './TermsOfService.jsx';
import { PrivacyPolicy } from './PrivacyPolicy.jsx';
import { Imprint } from './Imprint.jsx';

/**
 * Gives the three legal texts a URL without giving the app a router.
 *
 *   /?legal=terms     Terms of service
 *   /?legal=privacy   Privacy policy
 *   /?legal=imprint   Imprint
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
const PAGES = { terms: TermsOfService, privacy: PrivacyPolicy, imprint: Imprint };

function readLegalParam() {
  if (typeof window === 'undefined') return '';
  const v = new URLSearchParams(window.location.search).get('legal') || '';
  return PAGES[v] ? v : '';
}

export function LegalFromUrl() {
  const [page, setPage] = useState(readLegalParam);
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
