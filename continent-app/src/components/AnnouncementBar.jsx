import React, { useState } from 'react';
import { useSiteConfig } from '../hooks/useSiteConfig.js';
import { AlertIcon, CloseIcon, InfoIcon, TicketIcon } from './Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { TIERS, daysLeft } from '../lib/pricing.js';

// The one consumer of site_config the app ships with: a notice the admin
// panel can switch on for every visitor without a deploy ("fares refresh
// tonight", "payments are down"). Dismissal remembers the exact text it waved
// away, so a NEW announcement shows again while the same one stays gone.
const SEEN_KEY = 'carta.banner.dismissed.v1';

export function AnnouncementBar() {
  const { config } = useSiteConfig();
  const { t } = useI18n();
  const [dismissedText, setDismissedText] = useState(() => {
    try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; }
  });

  const a = config.announcement;
  const text = a && a.enabled && typeof a.text === 'string' ? a.text.trim() : '';
  if (!text || dismissedText === text) return null;

  const warn = a.tone === 'warn';
  const dismiss = () => {
    setDismissedText(text);
    try { localStorage.setItem(SEEN_KEY, text); } catch { /* private mode */ }
  };

  return (
    <div className={`site-banner${warn ? ' warn' : ''}`} role="status">
      {warn ? <AlertIcon size={15} /> : <InfoIcon size={15} />}
      <span className="site-banner-text">{text}</span>
      <button type="button" className="site-banner-close" onClick={dismiss} aria-label={t('a11y.dismiss')}>
        <CloseIcon size={13} />
      </button>
    </div>
  );
}


// A pass runs out on its own, which is the whole promise, and that is exactly
// why it needs saying out loud: nobody is charged a renewal, so nobody gets a
// receipt to remind them. Seven days is enough notice to extend before a trip
// rather than during it.
//
// A banner, deliberately not a modal. This reaches somebody who already paid
// once; interrupting them to ask for more is how you turn a customer into an
// ex-customer. It sits in the chrome and waits.
const EXPIRY_DAYS = 7;
const EXPIRY_SEEN_KEY = 'carta.passExpiry.dismissed.v1';

export function PassExpiryBanner() {
  const { t } = useI18n();
  const { entitlement, openPrices } = usePaywall();
  // Keyed on the expiry itself, so waving this away does not also silence the
  // warning for the NEXT pass the traveller buys.
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(EXPIRY_SEEN_KEY) || ''; } catch { return ''; }
  });

  if (!entitlement?.known) return null;
  if (entitlement.tier === 'free' || !entitlement.expiresAt) return null;
  if (dismissed === entitlement.expiresAt) return null;

  const left = daysLeft(entitlement.expiresAt);
  if (left == null || left > EXPIRY_DAYS) return null;

  const dismiss = () => {
    setDismissed(entitlement.expiresAt);
    try { localStorage.setItem(EXPIRY_SEEN_KEY, entitlement.expiresAt); } catch { /* private mode */ }
  };

  return (
    <div className="site-banner" role="status">
      <TicketIcon size={15} />
      <span className="site-banner-text">
        {t('pass.current', {
          name: t(TIERS[entitlement.tier]?.labelKey || 'pass.tripName'),
          days: left,
        })}
      </span>
      <button type="button" className="site-banner-action" onClick={openPrices}>
        {t('pass.extend')}
      </button>
      <button type="button" className="site-banner-close" onClick={dismiss} aria-label={t('a11y.dismiss')}>
        <CloseIcon size={13} />
      </button>
    </div>
  );
}
