import React from 'react';
import { CarIcon, TrainIcon, BusIcon, FerryIcon } from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';

/**
 * Getting there and around (PLAN.md D3), above the fold: the anchor airport
 * with the transfer leg ("Fly to FCO, 32 min by train"), the transit
 * verdict in words - 1,344 places are rated poor and the reader must be
 * told - and whether a car is needed, with the pipeline's own reason.
 * Renders from the dossier's practical.getting_there; absent when empty.
 */
const MODE_ICON = { train: TrainIcon, bus: BusIcon, ferry: FerryIcon, car: CarIcon };

/**
 * The reason line is APPENDED to the transit verdict above it, so it must not
 * restate it. Three of the pipeline's five reason strings did, and read as a
 * hyphenated run-on once joined:
 *
 *   "Poor public transport. Sights are spread out with limited public
 *    transport - rent a car."
 *
 * pipeline/car_layer.py now writes the shorter forms, but 3,370 of the 3,868
 * destinations in the CURRENT export still carry the old text, and a re-export
 * is a pipeline run. This rewrites the three legacy strings on the way to the
 * screen; it no-ops the moment the data catches up, and can be deleted then.
 */
const LEGACY_REASON = {
  'Compact and well served by public transport - skip the car.':
    'Compact enough to cross on foot. Skip the car.',
  'Walkable centre with rail links - a car is not needed.':
    'Walkable centre with rail links. A car is not needed.',
  'Sights are spread out with limited public transport - rent a car.':
    'Sights are spread out. A car saves a lot of time.',
};
const reasonLine = (why) => (why ? (LEGACY_REASON[why.trim()] || why) : '');

export function GettingThere({ getting, t }) {
  if (!getting || (!getting.airport && getting.transit == null
      && getting.car_needed == null)) return null;
  const ModeIcon = MODE_ICON[getting.transfer_mode] || TrainIcon;
  return (
    <div className="destp-getting">
      {getting.airport && (
        <p className="destp-get-row">
          <PlaneIcon size={14} />
          <span>
            {getting.transfer_min != null
              ? t('dest.flyToWithTransfer', {
                iata: getting.airport,
                n: getting.transfer_min,
                mode: t(`mode.${getting.transfer_mode || 'train'}`),
              })
              : t('dest.flyTo', { iata: getting.airport })}
          </span>
          {getting.transfer_min != null && <ModeIcon size={13} />}
        </p>
      )}
      {getting.transit && (
        <p className={`destp-get-row destp-get-transit is-${getting.transit}`}>
          <span className="destp-get-dot" aria-hidden="true" />
          <span>
            {t(`dest.transit.${getting.transit}`)}
            {getting.why ? ` ${reasonLine(getting.why)}` : ''}
          </span>
        </p>
      )}
      {getting.car_needed != null && (
        <p className="destp-get-row">
          <CarIcon size={14} />
          <span>
            {getting.car_needed ? t('dest.carYes') : t('dest.carNo')}
            {getting.car_needed && getting.rental_eur_day != null
              ? ` ${t('dest.carRental', { eur: getting.rental_eur_day })}` : ''}
          </span>
        </p>
      )}
    </div>
  );
}
