import React from 'react';
import { legLinks, TRAVEL_MODES, TRAVEL_MODE_LABEL } from '../lib/transportLinks.js';
import { fmtDate, addDays } from '../lib/dates.js';
import { eur } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';
import {
  TrainIcon, BusIcon, CarIcon, FerryIcon, CalendarIcon, RouteIcon, InfoIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';

/**
 * How you get there, how you get between the stops, and how you get home.
 *
 * Carta does not price any of it any more. It knows the route and the day, so
 * it hands both to the people who sell the ticket and asks for one thing back:
 * what it cost. That number is the traveller's own, it beats every estimate in
 * the app, and it is what turns the trip total from a guess into a receipt.
 *
 * The date control at the top is the reason the whole itinerary is stored as
 * nights from a single start date rather than as a wall of fixed dates: find a
 * flight two days later that is forty euros cheaper, move the trip, and every
 * leg below moves with it, links included. Nothing else needs editing.
 */

const MODE_ICON = {
  fly: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon, ferry: FerryIcon,
};

/** The party total entered for one leg, as a number, or 0. */
function legEur(v) {
  const n = Number(String(v?.eur ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** What the traveller has told Carta the moving about costs, all legs. */
export function travelTotal(values) {
  return Object.values(values || {}).reduce((sum, v) => sum + legEur(v), 0);
}

function LegRow({ leg, value, onChange, adults, t }) {
  const mode = value?.mode || '';
  const links = legLinks({
    from: leg.from,
    to: leg.to,
    mode,
    date: leg.date,
    returnDate: leg.returnDate || '',
    adults,
    subId: `wiz_${leg.kind}`,
  });
  return (
    <div className={`tleg ${mode ? 'answered' : ''}`}>
      <div className="tleg-head">
        <span className="tleg-route">
          <b>{leg.from.city || leg.from.name}</b>
          <span className="tleg-arrow" aria-hidden="true">&rarr;</span>
          <b>{leg.to.city || leg.to.name}</b>
        </span>
        {leg.date && (
          <span className="tleg-date"><CalendarIcon size={10} /> {fmtDate(leg.date)}</span>
        )}
      </div>

      <div className="tleg-modes" role="group" aria-label={t('travel.howLabel')}>
        {TRAVEL_MODES.map((m) => {
          const Icon = MODE_ICON[m];
          return (
            <button
              key={m}
              className={`tleg-mode ${mode === m ? 'on' : ''}`}
              onClick={() => onChange(leg.key, { mode: mode === m ? '' : m })}
              aria-pressed={mode === m}
            >
              <Icon size={14} />
              <span>{t(TRAVEL_MODE_LABEL[m])}</span>
            </button>
          );
        })}
      </div>

      {links.length > 0 && (
        <div className="tleg-links">
          <span className="tleg-links-label">{t('travel.checkOn')}</span>
          {links.map((l) => (
            <a key={l.key} className="tleg-link" href={l.url} target="_blank" rel="noreferrer noopener">
              {l.label} &#8599;
            </a>
          ))}
        </div>
      )}

      <div className="tleg-paid">
        <label className="tleg-field">
          <span className="tleg-field-label">{t('travel.whatYouPaid')}</span>
          <span className="tleg-input-wrap">
            <span className="tleg-cur" aria-hidden="true">&euro;</span>
            <input
              className="tleg-input"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={value?.eur ?? ''}
              onChange={(e) => onChange(leg.key, { eur: e.target.value })}
              placeholder="0"
              aria-label={t('travel.whatYouPaid')}
            />
          </span>
        </label>
        <label className="tleg-field tleg-field-wide">
          <span className="tleg-field-label">{t('travel.whoWith')}</span>
          <input
            className="tleg-text"
            type="text"
            maxLength={40}
            value={value?.service ?? ''}
            onChange={(e) => onChange(leg.key, { service: e.target.value })}
            placeholder={t('travel.whoWithPlaceholder')}
            aria-label={t('travel.whoWith')}
          />
        </label>
      </div>
    </div>
  );
}

export function TravelLegsSection({
  legs, values, onChange, adults = 1, startDate, onSetStart, dateMin, dateMax,
}) {
  const { t } = useI18n();
  const total = travelTotal(values);
  const shift = (days) => {
    if (!startDate || !onSetStart) return;
    const next = addDays(startDate, days);
    if (dateMin && next < dateMin) return;
    if (dateMax && next > dateMax) return;
    onSetStart(next);
  };

  return (
    <div className="tlegs">
      <div className="tlegs-head">
        <h3 className="tlegs-title"><RouteIcon size={14} /> {t('travel.title')}</h3>
        <p className="tlegs-sub">{t('travel.sub')}</p>
      </div>

      {startDate && onSetStart && (
        <div className="tlegs-shift">
          <span className="tlegs-shift-label">{t('travel.moveTrip')}</span>
          <div className="tlegs-shift-ctl">
            <button className="tlegs-shift-btn" onClick={() => shift(-1)} aria-label={t('travel.dayEarlier')}>-1</button>
            <b className="tlegs-shift-date">{fmtDate(startDate)}</b>
            <button className="tlegs-shift-btn" onClick={() => shift(1)} aria-label={t('travel.dayLater')}>+1</button>
          </div>
          <span className="tlegs-shift-note">{t('travel.moveTripNote')}</span>
        </div>
      )}

      <div className="tlegs-list">
        {legs.map((leg) => (
          <LegRow
            key={leg.key}
            leg={leg}
            value={values[leg.key]}
            onChange={onChange}
            adults={adults}
            t={t}
          />
        ))}
      </div>

      <div className="tlegs-foot">
        <span className="tlegs-total-label"><InfoIcon size={11} /> {t('travel.totalLabel')}</span>
        <b className="tlegs-total">{total > 0 ? eur(total) : t('travel.nothingYet')}</b>
      </div>
    </div>
  );
}
