import React from 'react';
import { Section } from './DestTiles.jsx';
import { BathingWater } from './BathingWater.jsx';
import { SwimSafety } from './SwimSafety.jsx';
import { swimRelevant } from '../components/WaterQualityBadge.jsx';
import NotYet from '../components/NotYet.jsx';
import { TrainIcon, BusIcon, FerryIcon, AlertIcon, SwimIcon } from '../components/Icons.jsx';

/**
 * The Practical tab's complete-coverage slots (T632, owner decision for the
 * explore-completeness batch: a field keeps its slot at 0% data and says
 * "Not available yet" instead of being left out).
 *
 *  - Between the towns: train, bus and ferry, each a list of legs or the
 *    placeholder. The dossier has no key for these yet (`practical.transit`,
 *    stub harvest_local_transit_* in pipeline/field_stubs/t632_practical.py).
 *  - Parking warning: `parking.web.restricted` and `restricted_note`, or a
 *    "nothing found" line when the check found no restriction, or the
 *    placeholder when the city was never checked.
 *  - Swimming: the existing bathing-water block, plus swimming bans.
 *  - Local rules: `practical.local_rules`, no source wired yet.
 */
const MODES = [['train', TrainIcon], ['bus', BusIcon], ['ferry', FerryIcon]];

const legText = (t, leg) => [
  t('dest.pr.leg', { from: leg.from, to: leg.to }),
  leg.name,
  Number.isFinite(leg.minutes) ? `${leg.minutes} min` : null,
  leg.operator,
].filter(Boolean).join(', ');

function Slot({ id, label, Icon, children }) {
  return (
    <li className="destp-get-row" data-testid={id}>
      {Icon && <Icon size={14} />}
      <span><b>{label}:</b> {children}</span>
    </li>
  );
}

export function PracticalSlots({ p }) {
  const { t, d, parking, water, destination } = p;
  const transit = d?.practical?.transit || {};
  const webPark = parking?.web || null;
  const rules = d?.practical?.local_rules || [];
  const bans = water?.bans || [];
  return (
    <>
      <Section id="transit" title={t('dest.pr.transitTitle')}>
        <ul className="destp-getting">
          {MODES.map(([mode, Icon]) => {
            const legs = (transit[mode] || []).filter((l) => l?.from && l?.to);
            return (
              <Slot key={mode} id={`pr-transit-${mode}`} label={t(`dest.pr.${mode}`)} Icon={Icon}>
                {legs.length > 0 ? legs.map((l) => legText(t, l)).join('; ') : <NotYet />}
              </Slot>
            );
          })}
        </ul>
      </Section>

      <Section id="pr-park" title={t('dest.pr.parkTitle')}>
        <div className="destp-parking" data-testid="pr-park-warning">
          {webPark?.restricted ? (
            <p className="dpark-web-line is-warn"><AlertIcon size={14} />
              {' '}{t('dest.parkRestricted')}{webPark.restricted_note ? ` ${webPark.restricted_note}` : ''}
            </p>
          ) : webPark ? (
            <p className="dpark-web-line">{t('dest.pr.parkClear')}</p>
          ) : <NotYet />}
        </div>
      </Section>

      <Section id="pr-swim" title={t('dest.pr.swimTitle')}>
        <div data-testid="pr-swim">
          {/* The EU bathing-water class first, then T631's swim-safety slots
              (rule, depth, currents, ban, lifeguards). A destination carries
              none of those today, so they show the placeholder. */}
          {water?.rating && swimRelevant(destination)
            ? <BathingWater water={water} destination={destination} t={t} />
            : <p className="destp-get-row"><SwimIcon size={14} /><NotYet /></p>}
          <SwimSafety rule={null} depthM={null} hazards={[]}
            lifeguard={null} />
          {bans.length > 0 && (
            <p className="destp-get-row" data-testid="pr-swim-bans">
              <span><b>{t('dest.pr.bans')}:</b>{' '}
                {bans.map((b) => [b.site, b.reason].filter(Boolean).join(', ')).join('; ')}
              </span>
            </p>
          )}
        </div>
      </Section>

      <Section id="pr-rules" title={t('dest.pr.rulesTitle')}>
        {rules.length > 0 ? (
          <ul className="destp-getting" data-testid="pr-rules">
            {rules.filter((r) => r?.text).map((r) => (
              <li className="destp-get-row" key={r.code || r.text}><span>{r.text}</span></li>
            ))}
          </ul>
        ) : <p data-testid="pr-rules"><NotYet line /></p>}
      </Section>
    </>
  );
}
