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
            {getting.why ? ` ${getting.why}` : ''}
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
