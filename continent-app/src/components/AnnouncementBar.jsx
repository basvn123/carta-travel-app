import React, { useEffect, useState } from 'react';
import { useSiteConfig } from '../hooks/useSiteConfig.js';
import { loadStatus, parseStatus, pickNotice, siteNotice } from '../lib/statusFile.js';
import { Button } from './Button.jsx';
import { AlertIcon, CloseIcon, InfoIcon, TicketIcon } from './Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { TIERS, daysLeft } from '../lib/pricing.js';

// The one consumer of site_config the app ships with: a notice the admin
// panel can switch on for every visitor without a deploy ("fares refresh
// tonight", "payments are down"). Dismissal remembers the exact text it waved
// away, so a NEW announcement shows again while the same one stays gone.
//
// It has a second source that does not depend on Supabase: status.json on the
// data host (lib/statusFile.js, T316), read once at boot, for the outage the
// site notice cannot announce because it is stored in the thing that is down.
// When both are live the status file wins; the bar never stacks two lines.
const SEEN_KEY = 'carta.banner.dismissed.v1';

export function AnnouncementBar() {
  const { config } = useSiteConfig();
  const { t, lang } = useI18n();
  const [statusRaw, setStatusRaw] = useState(null);
  const [dismissedText, setDismissedText] = useState(() => {
    try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; }
  });

  useEffect(() => {
    let live = true;
    loadStatus().then((raw) => { if (live) setStatusRaw(raw); });
    return () => { live = false; };
  }, []);

  const notice = pickNotice(parseStatus(statusRaw, { lang }), siteNotice(config.announcement));
  const text = notice ? notice.text : '';
  if (!text || dismissedText === text) return null;

  const warn = notice.tone === 'warn';
  const dismiss = () => {
    setDismissedText(text);
    try { localStorage.setItem(SEEN_KEY, text); } catch { /* private mode */ }
  };

  return (
    <div className={`site-banner${warn ? ' warn' : ''}`} role="status" data-source={notice.source}>
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
      {/* Opens the modal under the 'expiring' reason rather than 'browse', so
          the heading names the moment and the funnel can tell an extension
          from a price browse. The banner is still the only prompt. */}
      <Button variant="ghost" size="sm" className="site-banner-action" onClick={() => openPrices('expiring')}>
        {t('pass.extend')}
      </Button>
      <button type="button" className="site-banner-close" onClick={dismiss} aria-label={t('a11y.dismiss')}>
        <CloseIcon size={13} />
      </button>
    </div>
  );
}
