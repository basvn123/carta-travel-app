import React from 'react';
import { CarIcon, TrainIcon, BusIcon, FerryIcon } from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { formatEst } from '../lib/money.js';
import { notYet } from '../components/NotYet.jsx';
import { pickAirport, flyLine, airportOptionLabel } from '../lib/airportPick.js';

/**
 * Getting there and around (PLAN.md D3): the transit verdict in words
 * first (1,344 places are rated poor and the reader must be told), then the
 * anchor airport with the transfer leg ("Fly to FCO, 32 min by train"), then
 * whether a car is needed, with the pipeline's own reason.
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
  // T651: the lead row names the best airport by the shared pick (shortest
  // public transport, else the shortest road estimate); the list keeps all.
  const pick = pickAirport(getting);
  const ModeIcon = (pick?.road ? CarIcon : MODE_ICON[pick?.mode]) || null;
  return (
    <div className="destp-getting">
      {/* Car-free first (T385, brief V3-5): the transit verdict answers "can
          I do this without a car" before the airport and the car. */}
      {getting.transit && (
        <p className={`destp-get-row destp-get-transit is-${getting.transit}`}>
          <span className="destp-get-dot" aria-hidden="true" />
          <span>
            {t(`dest.transit.${getting.transit}`)}
            {getting.why ? ` ${reasonLine(getting.why)}` : ''}
          </span>
        </p>
      )}
      {getting.airport && (
        <p className="destp-get-row">
          <PlaneIcon size={14} />
          <span>
            {/* T632: a mode the data does not have is the placeholder, the
                minutes stay. T651: a road estimate says "by road". */}
            {flyLine(pick || { iata: getting.airport, minutes: null }, t, notYet(t))}
          </span>
          {pick?.minutes != null && ModeIcon && <ModeIcon size={13} />}
        </p>
      )}
      {/* T642: every airport within reach, each mode with its own time. A
          road estimate says so; public transport comes from a timetable feed. */}
      {getting.airports?.length > 1 && (
        <ul className="destp-get-airports" aria-label={t('dest.airportsMore')}>
          {getting.airports.map((a) => (
            <li key={a.iata} className="destp-get-airport">
              <b>{a.iata}</b>
              {' '}
              {(a.options || []).map((o) => airportOptionLabel(o, t)).join(', ')}
            </li>
          ))}
        </ul>
      )}
      {getting.car_needed != null && (
        <p className="destp-get-row">
          <CarIcon size={14} />
          <span>
            {getting.car_needed ? t('dest.carYes') : t('dest.carNo')}
            {getting.car_needed && getting.rental_eur_day != null
              ? ` ${t('dest.carRental', { eur: formatEst(getting.rental_eur_day, t('money.est')) })}` : ''}
          </span>
        </p>
      )}
    </div>
  );
}
