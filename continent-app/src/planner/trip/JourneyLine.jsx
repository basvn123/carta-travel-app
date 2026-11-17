import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { cityLabel } from '../../lib/placeName.js';

const MODE_ICON = { fly: HouseIcon.flight, flight: HouseIcon.flight, train: HouseIcon.train, bus: HouseIcon.bus, car: HouseIcon.car, drive: HouseIcon.car, ferry: HouseIcon.ferry };

/**
 * The journey line (G1, house style 2026-11, DESIGN.md "Journey line"; the
 * trip lane's own part): the whole trip on one line under its name. Stops
 * are umber pills as long as their nights, legs a short ink line with the
 * mode's icon (dashed for a flight), home ends ink discs, the nights at the
 * end. Static: it shows the route, it does nothing (the footpath under it
 * holds every control). It always fits its width: a pill shrinks to its
 * number, the name comes back where the pill has room (a container query).
 *
 *   stops   stopDetails ({ nights, dest })
 *   legs    the mode of each leg between two stops ('train', 'bus', ...)
 *   way     the mode there and back ('fly', 'car', ...), or '' without one
 *   home    whether the trip starts and ends at home (an origin is known)
 */
export function JourneyLine({ stops = [], legs = [], way = '', home = false }) {
  const { t } = useI18n();
  if (!stops.length) return null;
  const nights = stops.reduce((n, s) => n + (s.nights || 0), 0);
  const nightsText = (n) => t(n === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n });
  const Leg = ({ mode, k }) => {
    const Glyph = MODE_ICON[mode] || null;
    return (
      <li className={`tpg-line-leg${mode === 'fly' || mode === 'flight' ? ' is-flight' : ''}`} aria-hidden="true" key={k}>
        {Glyph && <span className="tpg-line-mode"><Glyph size={12} /></span>}
      </li>
    );
  };
  const items = [];
  if (home) items.push(<li key="h0" className="tpg-line-home" aria-hidden="true" />);
  if (way) items.push(<Leg key="w0" k="w0" mode={way} />);
  stops.forEach((s, i) => {
    if (i > 0) items.push(<Leg key={`l${i}`} k={`l${i}`} mode={legs[i - 1] || ''} />);
    const city = cityLabel(s.dest?.city || '') || t('itin.unknown');
    items.push(
      <li key={`s${i}`} className="tpg-line-stop" style={{ '--n': Math.max(1, s.nights || 1) }}>
        <span className="tpg-line-pill">
          <span className="tpg-line-no" aria-hidden="true">{i + 1}</span>
          <span className="tpg-line-name">{city}</span>
          <span className="sr-only">, {nightsText(s.nights || 0)}</span>
        </span>
      </li>,
    );
  });
  if (way) items.push(<Leg key="w1" k="w1" mode={way} />);
  if (home) items.push(<li key="h1" className="tpg-line-home" aria-hidden="true" />);
  return (
    <div className="tpg-line">
      <ol className="tpg-line-row" aria-label={t('tp.line.label')}>{items}</ol>
      {nights > 0 && <p className="tpg-line-sum">{nightsText(nights)}</p>}
    </div>
  );
}
