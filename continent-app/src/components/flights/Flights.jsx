/*
 * Flights (T518): the airline mark, a flight row, a card's flight chip and
 * the hours filter. Every flight Carta shows is Google Flights' price, so it
 * always carries its airline, its times and when it was checked, and links
 * out to Google Flights with the "prices may have changed" note. Bags are
 * Carta's estimate (flights/bagFees.js) and carry the tilde and "est.".
 *
 *   <FlightRow leg={leg} cost={leg.cost} dir="out" people={2} />
 *   <FlightChip perSeat={134} airline="FR" />
 *   <HoursFilter value="any" onChange={(band) => ...} />
 *   <AirlineMark code="VY" />
 */
import React, { useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Money } from '../ui/Money.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { fmtDate } from '../../lib/dates.js';
import { airlineLogoUrl } from '../../lib/flights/flightData.js';
import { useAirlines, airlineName } from '../../lib/flights/useAirlines.js';
import { googleFlightsLink } from '../../lib/flights/flights.js';
import { bagTier } from '../../lib/flights/bagFees.js';
import { formatMoney } from '../../lib/money.js';
import { ExternalIcon } from '../Icons.jsx';
import '../../styles/74-flights.css';

/** The airline's logo in a small white square, or its code when there is none. */
export function AirlineMark({ code, size = 'md' }) {
  const airlines = useAirlines();
  const [broken, setBroken] = useState(false);
  const known = airlines[code];
  const showLogo = code && known?.logo && !broken;
  return (
    <span className={`flt-mark flt-mark-${size}`} aria-hidden="true">
      {showLogo
        ? <img src={airlineLogoUrl(code)} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
        : <span className="flt-mark-code">{code || ''}</span>}
    </span>
  );
}

/** '21:55' + '01:10' -> true: the flight lands the next day. */
const nextDay = (dep, arr) => Boolean(dep && arr && arr < dep);

function checkedLabel(t, checked) {
  if (!checked) return null;
  const at = new Date(checked);
  const today = new Date().toDateString() === at.toDateString();
  return today
    ? t('flight.checked', { time: at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
    : t('flight.checkedDay', { date: fmtDate(at.toISOString().slice(0, 10)) });
}

/**
 * The way out to the flight itself on Google Flights: a link with the icon
 * that says it leaves Carta, and the note that the price may have moved
 * since it was checked (carta-design: every external booking link says so,
 * in words, not only in a tooltip). `back` makes it the return search, so a
 * pair of flights gets one link, not two one-way ones.
 */
export function FlightLink({ from, to, date, back = null, className = '' }) {
  const { t, lang } = useI18n();
  if (!from || !to || !date) return null;
  const href = googleFlightsLink(from, to, date, { back, lang });
  return (
    <div className={`flt-linkbar ${className}`.trim()}>
      <a className="flt-link" href={href} target="_blank" rel="noopener noreferrer">
        <span>{back ? t('flight.bookReturn') : t('flight.book')}</span>
        <ExternalIcon size={14} />
      </a>
      <span className="flt-linknote">{t('flight.bookNote')}</span>
    </div>
  );
}

/**
 * One flight, one way. `leg` is a flights.js leg (date, price, airline, dep,
 * arr, stops, checked, source, from, to); `cost` its legCost() for the
 * party, `bagKey` the trip's bag. The figure is the fare a person, as Google
 * shows it; the party's total is in the trip's total. `state` 'loading',
 * 'unknown' (no answer for that day yet, T733) or 'none' (a known empty day)
 * renders the row without a flight.
 */
export function FlightRow({ leg, cost, dir = 'out', bagKey = 'small', state = null, wantedDate = null, linkOut = true, children = null }) {
  const { t } = useI18n();
  const airlines = useAirlines();
  const label = dir === 'back' ? t('flight.back') : t('flight.out');
  if (!leg) {
    return (
      <div className={`flt-row is-${state || 'none'}`}>
        <span className="flt-mark flt-mark-md flt-mark-empty" aria-hidden="true" />
        <div className="flt-main">
          <div className="flt-dir">{label}</div>
          <div className="flt-meta">{state === 'loading' ? t('flight.loading') : state === 'unknown' ? t('flight.unknown') : t('flight.none')}</div>
        </div>
        {children}
      </div>
    );
  }
  const name = airlineName(airlines, leg.airline);
  const stops = leg.stops === 0 ? t('flight.direct') : leg.stops === 1 ? t('flight.stop1') : t('flight.stops', { n: leg.stops });
  // The header always shows the flight's own day, so a flight near (not on)
  // the wanted day is never read as that day's.
  const moved = Boolean(wantedDate && leg.date && wantedDate !== leg.date);
  return (
    <div className="flt-row">
      <AirlineMark code={leg.airline} />
      <div className="flt-main">
        <div className="flt-dir">{label}<span className={`flt-date${moved ? ' is-moved' : ''}`}>{fmtDate(leg.date, true)}</span></div>
        <div className="flt-times">
          {t('flight.times', { dep: leg.dep, arr: leg.arr })}
          {nextDay(leg.dep, leg.arr) && <span className="flt-plus">+1</span>}
        </div>
        <div className="flt-meta">{[name, stops].filter(Boolean).join(', ')}</div>
      </div>
      <div className="flt-figs">
        <Money value={leg.price} precision="cents" />
        <span className="flt-unit">{t('money.perPerson')}</span>
      </div>
      {cost?.bags > 0 && (
        <div className="flt-bags">
          <span>{bagTier(bagKey) === 'checked' ? t('flight.bagChecked') : t('flight.bagCabin')}</span>
          <Money value={cost.perSeat - leg.price} precision="cents" est />
        </div>
      )}
      <div className="flt-foot">
        <span>{checkedLabel(t, leg.checked)}</span>
      </div>
      {linkOut && <FlightLink from={leg.from} to={leg.to} date={leg.date} className="flt-row-link" />}
      {cost && !cost.bagsKnown && <div className="flt-note">{t('flight.bagsExtra')}</div>}
      {children}
    </div>
  );
}

/** A card's flight: the airline's mark and the cheapest return a person. */
export function FlightChip({ perSeat, airline }) {
  const { t } = useI18n();
  if (!(perSeat > 0)) return null;
  return (
    <span className="flt-chip">
      <AirlineMark code={airline} size="sm" />
      <span className="flt-chip-text money">{t('flight.fromCard', { price: formatMoney(perSeat) })}</span>
    </span>
  );
}

/** When to fly, one way: any time, morning, afternoon, evening. */
export function HoursFilter({ value = 'any', onChange, label }) {
  const { t } = useI18n();
  return (
    <Segmented
      size="sm"
      label={label || t('flight.hours')}
      value={value}
      onChange={onChange}
      options={[
        { value: 'any', label: t('flight.hoursAny') },
        { value: 'morning', label: t('flight.hoursMorning') },
        { value: 'midday', label: t('flight.hoursMidday') },
        { value: 'evening', label: t('flight.hoursEvening') },
      ]}
    />
  );
}
