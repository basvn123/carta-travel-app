import React from 'react';
import { LegalDoc } from './LegalDoc.jsx';
import { useI18n } from '../i18n/index.jsx';

/**
 * Cookies and storage (T945): what Carta keeps in the browser and why, in
 * six languages. No banner, because nothing here needs consent: verified in
 * the code on 2026-10-31.
 *
 *   Cookies       none. No document.cookie anywhere in src/, no Set-Cookie
 *                 from functions/ or workers/, no analytics, advertising or
 *                 tracking script (index.html loads only /src/main.jsx; the
 *                 CSP in public/_headers allows scripts from 'self' only).
 *   Local and session storage, by purpose (carta.* and continent.* keys):
 *     settings    continent.state.v1, continent.lang.v1, carta.tripLength,
 *                 carta.ownFares, carta.exploreStart.v1, carta.destFolds.v2,
 *                 carta.cartaTrips.filters.v1, carta.dayDetail.v1,
 *                 carta.dayOpen.v1, carta.savedTripsTab, carta.ask.onDevice.v1
 *     your things carta.savedLists.v1, carta.visitedCountries.v1,
 *                 carta.trips.v1, carta.keptTrips.v1, carta.savedJourneys.v1,
 *                 carta.deviceTrip.v1, carta.tripDraft.v1, carta.plannerDraft.v1,
 *                 carta.dayplans.v1, carta.dayplan.*, carta.dayprefs.*,
 *                 carta.tripextras.*, carta.booked.*, carta.places.v1,
 *                 carta.discovered.v1, carta.ask.chats.v1, carta.mytrips.*,
 *                 carta.tripSkips.v1, carta.together.*, carta.friends.lastSeen
 *     one-off notes  dismissed hints and banners, the paywall snooze, a
 *                 pending pass or co-planner invite across a sign-in, the
 *                 chunk reload guard, a route cache (carta.route.*), the
 *                 price drop ask stamp (carta.priceDropAsk.v1, T944)
 *   Sign-in       supabase-js's default: the session under sb-<ref>-auth-token
 *                 in local storage (plus its PKCE code verifier during a
 *                 Google sign-in). No cookie.
 *   IndexedDB     carta-files (files added to a day plan).
 *   Cache Storage the service worker's app shell (carta-v7); webllm/* when
 *                 the on-device Ask Carta model is turned on.
 *   Stripe        a redirect to Stripe Checkout (lib/checkout.js); Stripe's
 *                 cookies live on Stripe's domain, not Carta's.
 */
const SECTIONS = [
  ['ac2.ckDeviceH', 'ac2.ckDeviceP'],
  ['ac2.ckFilesH', 'ac2.ckFilesP'],
  ['ac2.ckSignInH', 'ac2.ckSignInP'],
  ['ac2.ckPayH', 'ac2.ckPayP'],
  ['ac2.ckOtherH', 'ac2.ckOtherP'],
  ['ac2.ckClearH', 'ac2.ckClearP'],
];

export function CookiesPage({ onClose }) {
  const { t } = useI18n();
  return (
    <LegalDoc id="legal-cookies" title={t('ac2.cookies')} onClose={onClose} contentsLabel={t('ac2.contents')}>
      <p>{t('ac2.ckIntro')}</p>
      {SECTIONS.map(([h, p]) => (
        <React.Fragment key={h}>
          <h3>{t(h)}</h3>
          <p>{t(p)}</p>
        </React.Fragment>
      ))}
    </LegalDoc>
  );
}

export default CookiesPage;
