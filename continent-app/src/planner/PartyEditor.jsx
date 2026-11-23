import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Stepper } from '../components/FilterControls.jsx';
import { MAX_PARTY } from '../lib/tripTotal.js';
import { partsAfter } from '../lib/partyParts.js';

/**
 * Who is going, in the three groups the trip is priced for (T458): adults
 * (12 and over), children 3 to 11 (half on beds, meals and public fares) and
 * babies 0 to 2 (free). The Who step shows it open; the price card opens it
 * from its People row. lib/tripTotal.js is where the rule is priced.
 * size="main" gives the plus and minus the 48 px of a main action (the
 * planner's first step, T500); the price card keeps the 44 px floor.
 */
export function PartyEditor({ value, onChange, compact = false, size = '', withTeens = false }) {
  const { t } = useI18n();
  const { adults: seatsAdult = 1, children = 0, babies = 0 } = value || {};
  // W3-L1 (E2): with a Teens row (12 to 17) the adults row is the others (18 and
  // over); `value.adults` and `onChange` keep counting every adult seat, teens in.
  const teens = withTeens ? Math.min(value?.teens || 0, seatsAdult - 1) : 0;
  const adults = seatsAdult - teens;
  const room = MAX_PARTY - seatsAdult - children - babies;
  const rows = [
    { key: 'adults', label: t('plan.adults'), sub: t(withTeens ? 'plan.adultsOverSub' : 'plan.adultsSub'), v: adults, min: 1 },
    ...(withTeens ? [{ key: 'teens', label: t('party.teens'), sub: t('party.teensSub'), v: teens, min: 0 }] : []),
    { key: 'children', label: t('plan.children'), sub: t('plan.childrenSub'), v: children, min: 0 },
    { key: 'babies', label: t('plan.babies'), sub: t('plan.babiesSub'), v: babies, min: 0 },
  ];
  return (
    <div className={`party ${compact ? 'is-compact' : ''} ${size === 'main' ? 'is-main' : ''}`}>
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
            onChange={(n) => onChange(partsAfter({ adults, teens, children, babies }, r.key, n, withTeens))}
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
