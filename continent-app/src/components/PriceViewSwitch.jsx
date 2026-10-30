import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Segmented } from './ui/index.js';
import { useSettings } from './SettingsLine.jsx';

/**
 * Per person or the whole group (T694; T907, the owner's Explore board
 * 2026-10-30): how every price reads, a display choice by the results
 * rather than a question in the People picker (no booking site puts the
 * price basis among the travellers; Airbnb's total-price switch sat by its
 * results). Shown only when more than one person travels.
 */
export function PriceViewSwitch({ className = '' }) {
  const s = useSettings();
  const { t } = useI18n();
  if (!s?.setPriceView) return null;
  const party = Number.isFinite(s.party) ? s.party : 2;
  if (party < 2) return null;
  return (
    <Segmented
      label={t('party.view')}
      size="sm"
      className={`price-view ${className}`.trim()}
      value={s.priceView === 'total' ? 'total' : 'pp'}
      onChange={s.setPriceView}
      options={[
        { value: 'pp', label: t('party.viewPp') },
        { value: 'total', label: t('party.viewTotal') },
      ]}
    />
  );
}
