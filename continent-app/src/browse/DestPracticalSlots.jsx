import React from 'react';
import { TrainIcon, BusIcon, FerryIcon, AlertIcon, InfoIcon } from '../components/Icons.jsx';

/**
 * The Practical section's rows that come from the T632 slots: the train, bus
 * and ferry legs between the towns, a parking restriction, swimming bans and
 * local rules. Since T912 (the owner's approved place page, 2026-10-30) a
 * row without data is not drawn: no "Not available yet" placeholder, no
 * "nothing found" line. With none of them, nothing renders.
 *
 * Data: d.practical.transit.{train,bus,ferry}[] ({ from, to, name, minutes,
 * operator }), parking.web.restricted (+ restricted_note), water.bans[],
 * d.practical.local_rules[] ({ code, text }).
 */
const MODES = [['train', TrainIcon], ['bus', BusIcon], ['ferry', FerryIcon]];

const legText = (t, leg) => [
  t('dest.pr.leg', { from: leg.from, to: leg.to }),
  leg.name,
  Number.isFinite(leg.minutes) ? `${leg.minutes} min` : null,
  leg.operator,
].filter(Boolean).join(', ');

export function practicalSlotRows(p) {
  const { t, d, parking, water } = p;
  const transit = d?.practical?.transit || {};
  const webPark = parking?.web || null;
  const rows = [];
  for (const [mode, Icon] of MODES) {
    const legs = (transit[mode] || []).filter((l) => l?.from && l?.to);
    if (legs.length) rows.push({ key: `transit-${mode}`, Icon, title: t(`dest.pr.${mode}`), text: legs.map((l) => legText(t, l)).join('; ') });
  }
  if (webPark?.restricted) {
    rows.push({
      key: 'park', Icon: AlertIcon, title: t('dest.pr.parkTitle'),
      text: [t('dest.parkRestricted'), webPark.restricted_note].filter(Boolean).join(' '),
    });
  }
  const bans = (water?.bans || []).filter((b) => b?.site || b?.reason);
  if (bans.length) {
    rows.push({ key: 'bans', Icon: AlertIcon, title: t('dest.pr.bans'), text: bans.map((b) => [b.site, b.reason].filter(Boolean).join(', ')).join('; ') });
  }
  const rules = (d?.practical?.local_rules || []).filter((r) => r?.text);
  if (rules.length) {
    rows.push({ key: 'rules', Icon: InfoIcon, title: t('dest.pr.rulesTitle'), text: rules.map((r) => r.text).join(' ') });
  }
  return rows;
}

/** The rows as Practical's cells (the same cell as airport and rhythm). */
export function PracticalSlots({ p }) {
  const rows = practicalSlotRows(p);
  if (!rows.length) return null;
  return rows.map(({ key, Icon, title, text }) => (
    <div className="pt-cell" key={key} data-testid={`pr-${key}`}>
      <span className="pt-cell-icon" aria-hidden="true"><Icon size={16} /></span>
      <b className="pt-cell-title">{title}</b>
      <p className="pt-cell-text">{text}</p>
    </div>
  ));
}
