import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Stepper } from '../components/FilterControls.jsx';
import { MAX_PARTY } from '../lib/tripTotal.js';

/**
 * Who is going, in the three groups the trip is priced for (T458): adults
 * (12 and over), children 3 to 11 (half on beds, meals and public fares) and
 * babies 0 to 2 (free). The Who step shows it open; the price card opens it
 * from its People row. lib/tripTotal.js is where the rule is priced.
 */
export function PartyEditor({ value, onChange, compact = false }) {
  const { t } = useI18n();
  const { adults = 1, children = 0, babies = 0 } = value || {};
  const room = MAX_PARTY - adults - children - babies;
  const rows = [
    { key: 'adults', label: t('plan.adults'), sub: t('plan.adultsSub'), v: adults, min: 1 },
    { key: 'children', label: t('plan.children'), sub: t('plan.childrenSub'), v: children, min: 0 },
    { key: 'babies', label: t('plan.babies'), sub: t('plan.babiesSub'), v: babies, min: 0 },
  ];
  return (
    <div className={`party ${compact ? 'is-compact' : ''}`}>
      {rows.map((r) => (
        <div className="party-row" key={r.key}>
          <span className="party-label">
            <b>{r.label}</b>
            <small>{r.sub}</small>
          </span>
          <Stepper
            value={r.v}
            min={r.min}
            max={r.v + Math.max(0, room)}
            onChange={(n) => onChange({ adults, children, babies, [r.key]: n })}
            ariaLabel={r.label}
            decLabel={t('trip.fewer')}
            incLabel={t('trip.more')}
          />
        </div>
      ))}
      {(children > 0 || babies > 0) && <p className="party-rule">{t('plan.childRule')}</p>}
    </div>
  );
}
