import React, { useId, useMemo, useState } from 'react';
import { legLinks, TRAVEL_MODES, TRAVEL_MODE_LABEL } from '../lib/transportLinks.js';
import { fmtDate, addDays } from '../lib/dates.js';
import { useI18n } from '../i18n/index.jsx';
import { notYet } from '../components/NotYet.jsx';
import { Button, IconButton, Money, Segmented } from '../components/ui/index.js';
import {
  TrainIcon, BusIcon, CarIcon, FerryIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, CalendarIcon,
  ArrowRightIcon, ExternalIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { cityLabel } from '../lib/placeName.js';
import { paidEur } from '../lib/tripTotal.js';
import { liveKey } from '../lib/flights/useLiveFlights.js';
import { airlineName, useAirlines } from '../lib/flights/useAirlines.js';
import { flightChoices, sameFlight } from './wizard/flightChoices.js';
import { PaidField } from './PlanTotal.jsx';
import { AirlineMark, FlightLink } from '../components/flights/Flights.jsx';

/**
 * Getting there (T432, redrawn T812): the trip's dates on one line that moves
 * the whole trip a day, then one card a leg: Out, the hops between the stops,
 * Home.
 *
 * A card names the route and the day and asks how with a row of mode icons.
 * Flown out or home, it offers that day's flights as up to three rows, the
 * one the trip is priced on picked; picking another prices the trip on it
 * (onPickFlight). "I'll book my own" opens the fare field, whose figure wins
 * everywhere (lib/tripTotal.js paidEur). The booking links wait behind
 * "Find tickets". Any other mode shows Carta's figure for the party and the
 * same field.
 */

const MODE_ICON = {
  fly: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon, ferry: FerryIcon,
};

/** "6 h 45" from minutes, or ''. */
const durationText = (t, min) => (Number.isFinite(min) && min > 0
  ? t('flight.duration', { h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0') })
  : '');

const stopsText = (t, n) => (n === 0 ? t('flight.direct') : n === 1 ? t('flight.stop1') : t('flight.stops', { n }));

/** "Google Flights, checked 18:00" today, else with the day. */
function checkedText(t, checked) {
  if (!checked) return '';
  const at = new Date(checked);
  if (Number.isNaN(at.getTime())) return '';
  return new Date().toDateString() === at.toDateString()
    ? t('flight.checked', { time: at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
    : t('flight.checkedDay', { date: fmtDate(at.toISOString().slice(0, 10), true) });
}

/** One flight a row: the airline's mark, the times, the stops and the length, the price for the party. */
function FlightChoice({ row, selected, onPick, t, airlines, day = '' }) {
  const { leg } = row;
  // T855: a flight on another day than the leg's (the swept day nearest it,
  // which the trip finder priced) names its own day.
  const own = leg.date && day && leg.date !== day ? fmtDate(leg.date, true) : '';
  const sub = [own, leg.airlineName || airlineName(airlines, leg.airline), stopsText(t, leg.stops ?? 0), durationText(t, leg.min)]
    .filter(Boolean).join(', ');
  return (
    <Button
      variant="quiet"
      role="radio"
      aria-checked={selected}
      className={`wz-fl${selected ? ' is-selected' : ''}`}
      onClick={onPick}
    >
      <AirlineMark code={leg.airline} />
      <span className="wz-fl-what">
        <span className="wz-fl-times">
          {t('flight.times', { dep: leg.dep, arr: leg.arr })}
          {leg.dep && leg.arr && leg.arr < leg.dep && <sup className="wz-fl-plus">+1</sup>}
        </span>
        <span className="wz-fl-sub">{sub}</span>
      </span>
      <span className="wz-fl-fig">{row.total != null ? <Money value={row.total} precision="cents" /> : notYet(t)}</span>
      <span className="wz-fl-tick" aria-hidden="true">{selected && <CheckIcon size={12} />}</span>
    </Button>
  );
}

/** A small fold: one quiet button and what it hides. */
function Fold({ label, children, className = '' }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`wz-fold ${open ? 'is-open' : ''} ${className}`.trim()}>
      <Button
        variant="quiet"
        size="sm"
        className="wz-fold-btn"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <ChevronDownIcon size={14} className="wz-fold-chev" />
      </Button>
      <div id={id} hidden={!open} className="wz-fold-body">{open && children}</div>
    </div>
  );
}

/** "2 h 10 by train, 210 km", from the trip's own published leg. */
function publishedLine(pub, t) {
  if (!pub || pub.minutes == null) return '';
  const h = Math.floor(pub.minutes / 60);
  const m = pub.minutes % 60;
  const time = h ? t('trip.legHm', { h, m: String(m).padStart(2, '0') }) : t('trip.legM', { m });
  return t('travel.publishedLeg', { time, mode: t(TRAVEL_MODE_LABEL[pub.mode] || 'trip.modeTrain').toLowerCase(), km: pub.km });
}

/** One leg as one card: the route and the day, how, and what it costs. */
function LegCard({ leg, value, onChange, adults, estimate, pricedMode, t, lang, partyText, flight, jawHint }) {
  const airlines = useAirlines();
  const paid = paidEur(value?.eur);
  const dir = leg.kind === 'out' || leg.kind === 'back' ? leg.kind : null;
  const cf = flight?.cartaFlight;
  // A way out or home nobody has answered flies when Carta found the trip a
  // flight (the total is priced on it); a hop between stops shows the mode
  // the trip is priced with.
  const mode = value?.mode || (dir ? (cf ? 'fly' : '') : (pricedMode || ''));
  const flying = Boolean(dir && cf && !leg.booked && mode === 'fly');
  const q = flying ? cf.queries?.[dir === 'out' ? 0 : 1] : null;
  const current = flying ? cf[dir] : null;
  const answer = q ? flight.answers?.get?.(liveKey(q.o, q.d, q.date)) || null : null;
  const rows = useMemo(
    () => (flying && !paid ? flightChoices(current, answer, flight.party) : []),
    [flying, paid, current, answer, flight?.party],
  );
  const offered = rows.length > 0;
  // A day with no flight to offer asks for the fare at once; anywhere else
  // the field waits behind one quiet button.
  const askNow = flying && !offered;
  const [own, setOwn] = useState(false);
  const ownOpen = own || paid > 0 || askNow;
  const links = useMemo(() => (leg.booked ? [] : legLinks({
    from: leg.from,
    to: leg.to,
    mode: mode || '',
    date: leg.date,
    returnDate: leg.returnDate || '',
    adults,
    subId: `wiz_${leg.kind}`,
    lang,
  })), [leg, mode, adults, lang]);
  const headId = `leg-${leg.key}-h`;
  const fromName = cityLabel(leg.from.city) || leg.from.name;
  const toName = cityLabel(leg.to.city) || leg.to.name;
  const dirLabel = dir === 'out' ? t('wizard.gtOut') : dir === 'back' ? t('wizard.gtHome') : null;
  const fareLabel = leg.kind === 'inter' ? t('plan.ticketFor', { people: partyText }) : t('plan.yourFareFor', { people: partyText });
  const setPaid = (n) => onChange(leg.key, {
    eur: n ? String(n) : '',
    ...(value?.mode ? {} : { mode: mode || (leg.kind === 'inter' ? 'train' : 'fly') }),
  });
  const pick = (r) => flight?.onPick?.(dir, r.current ? null : {
    ...r.leg,
    date: q?.date || leg.date,
    from: q?.o,
    to: q?.d,
    checked: answer?.checked || null,
    link: answer?.link || null,
  });

  return (
    <section className={`wz-leg ${leg.kind === 'inter' ? 'is-inter' : ''}`} id={`leg-${leg.key}`} aria-labelledby={headId}>
      <div className="wz-leg-head">
        <div className="wz-leg-id">
          {(dirLabel || leg.date) && (
            <span className="wz-leg-when">
              {dirLabel && <b>{dirLabel}</b>}
              {leg.date && <span className="wz-leg-date">{fmtDate(leg.date, true)}</span>}
            </span>
          )}
          <h3 className="wz-leg-route" id={headId}>
            <span>{fromName}</span>
            <ArrowRightIcon size={16} className="wz-leg-arrow" />
            <span>{toName}</span>
          </h3>
          {leg.published && <span className="wz-leg-pub">{publishedLine(leg.published, t)}</span>}
        </div>
        {leg.booked ? (
          <span className="wz-leg-booked"><CheckIcon size={14} /> {t('travel.booked')}</span>
        ) : (
          <Segmented
            size="sm"
            className="wz-modes"
            label={`${t('travel.howLabel')}: ${fromName}, ${toName}`}
            value={mode || TRAVEL_MODES[leg.kind === 'inter' ? 1 : 0]}
            onChange={(m) => onChange(leg.key, { mode: m })}
            options={TRAVEL_MODES.map((m) => {
              const MIcon = MODE_ICON[m];
              return { value: m, icon: <MIcon size={18} />, label: <span className="sr-only">{t(TRAVEL_MODE_LABEL[m])}</span> };
            })}
          />
        )}
      </div>

      {dir === 'out' && jawHint && <p className="wz-leg-note">{jawHint}</p>}

      {leg.booked ? null : offered ? (
        <div className="wz-fls">
          <div className="wz-fls-list" role="radiogroup" aria-label={t('wizard.gtFlightsFor', { people: partyText })}>
            {rows.map((r) => (
              <FlightChoice
                key={`${r.leg.airline}-${r.leg.dep}-${r.leg.arr}`}
                row={r}
                t={t}
                airlines={airlines}
                selected={sameFlight(r.leg, current)}
                onPick={() => pick(r)}
                day={q?.date || leg.date}
              />
            ))}
          </div>
          <p className="wz-fls-src">
            {t('wizard.gtFlightsFor', { people: partyText })}
            {current?.checked ? `. ${checkedText(t, current.checked)}` : ''}
          </p>
          <FlightLink from={q?.o} to={q?.d} date={current?.date || q?.date} className="wz-fls-link" />
        </div>
      ) : flying && !paid ? (
        <p className="wz-leg-none">
          {current === undefined && flight.waiting?.[dir] ? t('flight.loading') : t('flight.unknown')}
        </p>
      ) : !flying && !paid && estimate > 0 ? (
        <p className="wz-leg-est">
          <span>{t('wizard.gtFor', { people: partyText })}</span>
          <Money value={estimate} est precision="cents" />
        </p>
      ) : null}

      {!leg.booked && (
        <div className="wz-leg-acts">
          {!askNow && !(paid > 0) && (
            <Button variant="quiet" size="sm" className="wz-own-btn" aria-expanded={ownOpen} onClick={() => setOwn((v) => !v)}>
              {flying ? t('wizard.gtOwn') : t('travel.addWhatYouPaid')}
            </Button>
          )}
          {paid > 0 && dir && cf && mode === 'fly' && (
            <Button variant="quiet" size="sm" className="wz-own-btn" onClick={() => { setOwn(false); setPaid(0); }}>
              {t('wizard.gtUseFlight')}
            </Button>
          )}
          {links.length > 0 && (
            <Fold label={t('plan.findTickets')} className="wz-tickets">
              <ul className="wz-links">
                {links.slice(0, 4).map((l) => (
                  <li key={l.key}>
                    <a className="wz-link" href={l.url} target="_blank" rel="noreferrer noopener">
                      {l.label}
                      <ExternalIcon size={14} />
                      <span className="sr-only"> {t('plan.opensNewTab')}</span>
                    </a>
                  </li>
                ))}
              </ul>
              {mode === 'fly' && leg.airports?.length > 0 && (
                <p className="wz-leg-pub">
                  {t('travel.flyInto')}{' '}
                  {leg.airports.map((a) => `${a.iata} (${a.transferMin != null
                    ? t('travel.airportTransfer', { km: a.km, n: a.transferMin, mode: a.transferMode ? t(`mode.${a.transferMode}`) : notYet(t) })
                    : t('travel.airportKm', { km: a.km })})`).join(', ')}
                </p>
              )}
            </Fold>
          )}
        </div>
      )}

      {!leg.booked && ownOpen && (
        <div className={`wz-own ${dir && cf && mode === 'fly' ? 'is-fly' : ''}`}>
          <PaidField
            id={`paid-${leg.key}`}
            value={paid}
            estimate={flying ? null : (estimate || null)}
            hint={false}
            label={fareLabel}
            onChange={setPaid}
          />
          <label className="wz-own-who">
            <span className="wz-own-lbl">{t('travel.whoWith')}</span>
            <input
              className="wz-own-input"
              type="text"
              maxLength={40}
              value={value?.service ?? ''}
              onChange={(e) => onChange(leg.key, { service: e.target.value })}
              placeholder={t('travel.whoWithPlaceholder')}
            />
          </label>
        </div>
      )}
    </section>
  );
}

export function TravelLegsSection({
  legs, values, onChange, adults = 1, startDate, endDate = '', onSetStart, dateMin, dateMax,
  openJawHint = '', estimates = {}, pricedModes = {}, party = 1,
  // Carta's flight there and home (T518) and, since T812, the day's live
  // answers (a Map keyed like useLiveFlights), the party a flight is priced
  // for ({ paying, babies, bagKey }), which ways still wait, and the pick.
  cartaFlight = null, liveAnswers = null, flightParty = null, flightWaiting = null, onPickFlight = null,
}) {
  const { t, lang } = useI18n();
  const partyText = party === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: party });
  const flight = cartaFlight
    ? { cartaFlight, answers: liveAnswers, party: flightParty || {}, waiting: flightWaiting, onPick: onPickFlight }
    : null;
  const canShift = (days) => {
    if (!startDate || !onSetStart) return false;
    const next = addDays(startDate, days);
    return !(dateMin && next < dateMin) && !(dateMax && next > dateMax);
  };
  const shift = (days) => { if (canShift(days)) onSetStart(addDays(startDate, days)); };
  const ordered = [
    ...legs.filter((l) => l.kind === 'out'),
    ...legs.filter((l) => l.kind === 'inter'),
    ...legs.filter((l) => l.kind === 'back'),
  ];

  return (
    <div className="wz-legs">
      {startDate && (
        <div className="wz-dates" role="group" aria-label={t('travel.moveTrip')}>
          <CalendarIcon size={20} className="wz-dates-icon" />
          <span className="wz-dates-txt" aria-live="polite">
            {endDate
              ? t('plan.dateRange', { a: fmtDate(startDate, true), b: fmtDate(endDate, true) })
              : fmtDate(startDate, true)}
          </span>
          {onSetStart && (
            <span className="wz-dates-ctl">
              <IconButton label={t('travel.dayEarlier')} onClick={() => shift(-1)} disabled={!canShift(-1)} className="wz-dates-btn">
                <ChevronRightIcon size={18} className="wz-flip" />
              </IconButton>
              <IconButton label={t('travel.dayLater')} onClick={() => shift(1)} disabled={!canShift(1)} className="wz-dates-btn">
                <ChevronRightIcon size={18} />
              </IconButton>
            </span>
          )}
        </div>
      )}

      {ordered.map((leg, i) => (
        <React.Fragment key={leg.key}>
          {leg.kind === 'inter' && ordered[i - 1]?.kind !== 'inter' && (
            <h3 className="wz-legs-h">{t('travel.secBetween')}</h3>
          )}
          <LegCard
            leg={leg}
            value={values[leg.key]}
            onChange={onChange}
            adults={adults}
            estimate={estimates[leg.key] || 0}
            pricedMode={pricedModes[leg.key] || ''}
            t={t}
            lang={lang}
            partyText={partyText}
            flight={leg.kind === 'inter' ? null : flight}
            jawHint={openJawHint}
          />
        </React.Fragment>
      ))}
    </div>
  );
}
