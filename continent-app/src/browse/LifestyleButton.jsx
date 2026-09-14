import React from 'react';
import { PiggyIcon } from '../components/Icons.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from './LifestylePanel.jsx';
import { useI18n } from '../i18n/index.jsx';

/**
 * The one door into the lifestyle panel, drawn the same way everywhere it
 * appears: the Explore toolbar and side panel, the Destinations toolbar and
 * side panel, the account hub.
 *
 * Destinations and Explore used to draw their own, one saying "Lifestyle,
 * Entire place" and the other "Easygoing, Entire place", both in a neutral
 * pill a shade off the page. Neither read as a control worth opening, and
 * every euro figure on both tabs comes out of it. One component, one accent
 * tint, one label: what it sets, then the bed and the habits it is set to.
 *
 * The vibe hides itself (CSS) where the row is tight, so the bed, which is
 * the larger half of the bill, is the part that always survives.
 */
export function LifestyleButton({ stayTier, lifestyle, onClick, className = '', showLabel = true }) {
  const { t } = useI18n();
  const profileKey = matchProfile(lifestyle || {});
  const vibe = profileKey ? t(PROFILE_LABEL_KEYS[profileKey]) : t('lifestyle.custom');
  const bed = t(`stay.${stayTier || 'home'}`);
  return (
    <button
      type="button"
      className={`lifestyle-btn ${className}`.trim()}
      onClick={onClick}
      aria-haspopup="dialog"
      title={t('lifestyle.exploreHint')}
      aria-label={`${t('filter.lifestyle')}: ${bed}, ${vibe}`}
    >
      <PiggyIcon size={15} className="lifestyle-btn-icon" />
      {showLabel && <span className="lifestyle-btn-label">{t('filter.lifestyle')}</span>}
      <b className="lifestyle-btn-bed">{bed}</b>
      <span className="lifestyle-btn-vibe">{vibe}</span>
    </button>
  );
}
