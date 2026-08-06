import React from 'react';
import { useI18n } from '../i18n/index.jsx';

// The stepped hour cutoffs offered. Chips, not a slider: four honest steps
// cover the real decisions ("a morning", "half a day", "a day of travel")
// and stay compact inside the filter tray.
const REACH_STEPS = [3, 5, 8, 12];

/**
 * "Reachable within N hours" filter control: one Any chip plus a chip per
 * cutoff. `available` is whether the current origin has a reach artifact at
 * all; without one the control quietly explains itself instead of erroring
 * (the filter upstream is inert in that state, it never empties the map).
 */
export function ReachFilter({ value, onChange, available }) {
  const { t } = useI18n();
  return (
    <div className="filter filter-reach">
      <label className="filter-label">{t('filter.reach')}</label>
      <div className="filter-control">
        {available ? (
          <div className="pill-row" role="group" aria-label={t('filter.reach')}>
            <button
              type="button"
              className={`pill-toggle ${value == null ? 'on' : ''}`}
              onClick={() => onChange(null)}
              aria-pressed={value == null}
              title={t('filter.reachAnyTitle')}
            >
              {t('filter.reachAny')}
            </button>
            {REACH_STEPS.map((h) => (
              <button
                key={h}
                type="button"
                className={`pill-toggle ${value === h ? 'on' : ''}`}
                onClick={() => onChange(value === h ? null : h)}
                aria-pressed={value === h}
                title={t('filter.reachHoursTitle', { n: h })}
              >
                {t('filter.reachHours', { n: h })}
              </button>
            ))}
          </div>
        ) : (
          <span className="reach-note">{t('filter.reachNoData')}</span>
        )}
      </div>
    </div>
  );
}
