import React, { useState } from 'react';
import { useSiteConfig } from '../hooks/useSiteConfig.js';
import { AlertIcon, CloseIcon, InfoIcon } from './Icons.jsx';
import { useI18n } from '../i18n/index.jsx';

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
