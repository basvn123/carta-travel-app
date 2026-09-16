import React from 'react';
import { useI18n } from '../i18n/index.jsx';

/**
 * FavStar, the one mark that keeps a thing.
 *
 * The star on an Explore card (browse/ResultsList.jsx) was the only way to
 * shortlist anything, and it only existed on priced destinations. Every other
 * page this app opens - a trail, a beach, a lake, a mountain, a cycle route,
 * a ready-made trip - had no way to say "keep this".
 *
 * This is that control, drawn once and worn in the top bar of every feature
 * page, beside the share button it already sits next to. It is deliberately
 * the SAME polygon as the Explore card's star: one shape means one thing
 * across the app, and a bookmark next to a star would read as two different
 * kinds of keeping.
 *
 * Renders nothing at all when the host has no `onToggle`, which is how a page
 * mounted somewhere without a shortlist (a share view, a test harness) stays
 * free of an inert control.
 */
export function FavStar({ on, onToggle, className = 'tpage-bar-act' }) {
  const { t } = useI18n();
  if (!onToggle) return null;
  const label = on ? t('results.removeShortlist') : t('results.addShortlist');
  return (
    <button
      type="button"
      className={`${className} fav-star${on ? ' on' : ''}`}
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      title={label}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"
        fill={on ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <polygon points="12 2 15.1 8.6 22 9.3 16.8 14 18.3 21 12 17.3 5.7 21 7.2 14 2 9.3 8.9 8.6" />
      </svg>
    </button>
  );
}
