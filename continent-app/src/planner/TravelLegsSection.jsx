import React, { useMemo, useState } from 'react';
import { legLinks, TRAVEL_MODES, TRAVEL_MODE_LABEL } from '../lib/transportLinks.js';
import { fmtDate, addDays } from '../lib/dates.js';
import { useI18n } from '../i18n/index.jsx';
import { Button, Money, CostRow } from '../components/ui/index.js';
import {
  TrainIcon, BusIcon, CarIcon, FerryIcon, CheckIcon, ChevronDownIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { cityLabel } from '../lib/placeName.js';
import { paidEur } from '../lib/tripTotal.js';
import { PaidField } from './PlanTotal.jsx';
import { FlightRow, HoursFilter, AirlineMark } from '../components/flights/Flights.jsx';

/**
 * How you get there, how you get between the stops, and how you get home
 * (T432).
 *
 * Carta prices none of the way there: it knows the route and the day, hands
 * both to the people who sell the ticket, and asks for one thing back, what it
 * cost. So that question is on every row, not folded behind a button: the
 * figure the traveller types is the one the trip total counts (lib/tripTotal.js
 * paidEur), and a row between two stops shows Carta's own estimate beside it
 * until they do.
 *
 *   each row      where to where, the day, how, and what it cost
 *   unfolded      how you travel this leg, and the operators to check it on
 *   move the trip every stay and link moves with the start date
 */

const MODE_ICON = {
  fly: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon, ferry: FerryIcon,
};

/** One hop, with its money always in view and its how folded under it. */
function LegRow({ leg, value, onChange, adults, estimate, t, lang, partyText, flightProps = null }) {
  const mode = value?.mode || '';
  const Icon = MODE_ICON[mode];
  const paid = paidEur(value?.eur);
  // Carta's flight for the way there or home (T518): Google Flights' fare,
  // shown until the traveller types their own, which stays the override in
  // the field beside it. Only for a way flown (or not answered yet).
  const dir = leg.kind === 'out' || leg.kind === 'back' ? leg.kind : null;
  const cf = flightProps?.cartaFlight;
  const showFlight = Boolean(dir && cf && !paid && !leg.booked && (!mode || mode === 'fly'));
  const fLeg = showFlight ? cf[dir] : null;
  const fState = fLeg ? null : (fLeg === undefined && flightProps?.waiting?.[dir] ? 'loading' : 'none');
  const [open, setOpen] = useState(false);
  // The places to book this hop, always in view (T458): a traveller deciding
  // how to get from one stop to the next wants the trains and buses one tap
  // away, not behind a fold.
  const links = useMemo(() => (leg.booked ? [] : legLinks({
    from: leg.from,
    to: leg.to,
    mode,
    date: leg.date,
    returnDate: leg.returnDate || '',
    adults,
    subId: `wiz_${leg.kind}`,
    lang,
  })), [leg, mode, adults, lang]);
  const bodyId = `legbody-${leg.key}`;

  return (
    <div className={`tleg ${mode ? 'answered' : ''} ${open ? 'open' : ''} ${paid ? 'is-paid' : ''}`} id={`leg-${leg.key}`}>
      <div className="tleg-row">
        <button
          type="button"
          className="tleg-head"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
        >
          <span className="tleg-route">
            <b>{cityLabel(leg.from.city) || leg.from.name}</b>
            <span className="tleg-arrow" aria-hidden="true">&rarr;</span>
            <b>{cityLabel(leg.to.city) || leg.to.name}</b>
          </span>
          <span className="tleg-head-meta">
            {leg.date && <span className="tleg-date">{fmtDate(leg.date)}</span>}
            {leg.booked ? (
              <span className="tleg-tag is-booked"><CheckIcon size={12} /> {t('travel.booked')}</span>
            ) : Icon ? (
              <span className="tleg-tag"><Icon size={12} /> {t(TRAVEL_MODE_LABEL[mode])}</span>
            ) : (
              <span className="tleg-tag is-open">{t('plan.pickHow')}</span>
            )}
            <ChevronDownIcon size={16} className="tleg-chev" />
          </span>
        </button>
        <div className="tleg-money">
          {estimate > 0 && !paid && (
            <span className="tleg-est"><Money value={estimate} est precision="cents" /></span>
          )}
          {/* A price needs a way of travelling to belong to: the planner
              keeps a leg's own figure per mode. */}
          <PaidField
            id={`paid-${leg.key}`}
            value={paid}
            estimate={estimate || null}
            hint={false}
            label={leg.kind === 'inter' ? t('plan.ticketFor', { people: partyText }) : t('plan.yourFareFor', { people: partyText })}
            onChange={(n) => onChange(leg.key, { eur: n ? String(n) : '', ...(mode ? {} : { mode: leg.kind === 'inter' ? 'train' : 'fly' }) })}
          />
        </div>
      </div>
      {showFlight && (
        <div className="tleg-flight">
          <FlightRow
            leg={fLeg || null}
            cost={fLeg?.cost}
            dir={dir}
            bagKey={flightProps.baggage}
            state={fState}
            wantedDate={cf.queries?.[dir === 'out' ? 0 : 1]?.date || leg.date || null}
          />
          {flightProps.onFlightHours && (
            <HoursFilter
              value={flightProps.flightHours?.[dir] || 'any'}
              onChange={(band) => flightProps.onFlightHours(dir, band)}
              label={`${t('flight.hours')}, ${dir === 'back' ? t('flight.back') : t('flight.out')}`}
            />
          )}
        </div>
      )}
      {leg.published && !open && (
        <p className="tleg-measured">{publishedLine(leg.published, t)}</p>
      )}
      {links.length > 0 && (
        <div className="tleg-find">
          <span className="tleg-find-lbl">{t('plan.findTickets')}</span>
          {links.slice(0, 4).map((l) => (
            <a key={l.key} className="tleg-find-link" href={l.url} target="_blank" rel="noreferrer noopener">
              {l.label}<span className="sr-only"> {t('plan.opensNewTab')}</span>
            </a>
          ))}
        </div>
      )}
      <div id={bodyId} hidden={!open} className="tleg-body">
        {open && (
          <>
            {leg.booked ? (
              <p className="tleg-booked"><CheckIcon size={14} /> {t('plan.bookedLegShort')}</p>
            ) : (
              <div className="tleg-modes" role="group" aria-label={t('travel.howLabel')}>
                {TRAVEL_MODES.map((m) => {
                  const MIcon = MODE_ICON[m];
                  return (
                    <button
                      key={m}
                      type="button"
                      className={`tleg-mode ${mode === m ? 'on' : ''}`}
                      onClick={() => onChange(leg.key, { mode: m })}
                      aria-pressed={mode === m}
                    >
                      <MIcon size={16} />
                      <span>{t(TRAVEL_MODE_LABEL[m])}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {leg.published && <p className="tleg-measured">{publishedLine(leg.published, t)}</p>}
            {mode === 'fly' && leg.airports?.length > 0 && (
              <div className="tleg-airports">
                <span className="tleg-airports-label">{t('travel.flyInto')}</span>
                {leg.airports.map((a) => (
                  <span key={a.iata} className="tleg-airport">
                    <b>{a.iata}</b>
                    <small>
                      {a.transferMin != null
                        ? t('travel.airportTransfer', { km: a.km, n: a.transferMin, mode: t(`mode.${a.transferMode || 'train'}`) })
                        : t('travel.airportKm', { km: a.km })}
                    </small>
                  </span>
                ))}
              </div>
            )}
            <label className="tleg-field">
              <span className="tleg-field-label">{t('travel.whoWith')}</span>
              <input
                className="tleg-text"
                type="text"
                maxLength={40}
                value={value?.service ?? ''}
                onChange={(e) => onChange(leg.key, { service: e.target.value })}
                placeholder={t('travel.whoWithPlaceholder')}
              />
            </label>
          </>
        )}
      </div>
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

export function TravelLegsSection({
  legs, values, onChange, adults = 1, startDate, onSetStart, dateMin, dateMax,
  openJawHint = '', estimates = {}, party = 1,
  // Carta's flight there and home (T518), all optional: priced.cartaFlight,
  // the hours wanted each way and their setter, the trip's bag, and which
  // ways still wait on a live answer ({ out, back }).
  cartaFlight = null, flightHours = null, onFlightHours = null, baggage = 'cabin', flightWaiting = null,
}) {
  const { t, lang } = useI18n();
  const partyText = party === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: party });
  const flightProps = cartaFlight
    ? { cartaFlight, flightHours, onFlightHours, baggage, waiting: flightWaiting }
    : null;
  const shift = (days) => {
    if (!startDate || !onSetStart) return;
    const next = addDays(startDate, days);
    if (dateMin && next < dateMin) return;
    if (dateMax && next > dateMax) return;
    onSetStart(next);
  };

  const groups = [
    ['out', t('travel.secOut'), PlaneIcon],
    ['inter', t('travel.secBetween'), TrainIcon],
    ['back', t('travel.secBack'), PlaneIcon],
  ].map(([kind, title, Icon]) => ({ kind, title, Icon, rows: legs.filter((l) => l.kind === kind) }))
    .filter((g) => g.rows.length);

  return (
    <div className="tlegs">
      {startDate && onSetStart && (
        <div className="tlegs-shift">
          <span className="tlegs-shift-label">{t('travel.moveTrip')}</span>
          <div className="tlegs-shift-ctl">
            <Button variant="secondary" className="tlegs-shift-btn" onClick={() => shift(-1)} aria-label={t('travel.dayEarlier')}>-1</Button>
            <b className="tlegs-shift-date">{fmtDate(startDate)}</b>
            <Button variant="secondary" className="tlegs-shift-btn" onClick={() => shift(1)} aria-label={t('travel.dayLater')}>+1</Button>
          </div>
        </div>
      )}

      {groups.map((g) => (
        <section className="tlegs-sec" key={g.kind} aria-label={g.title}>
          <h2 className="tlegs-sec-h"><g.Icon size={16} /> {g.title}</h2>
          {g.kind === 'out' && openJawHint && <p className="tlegs-jaw">{openJawHint}</p>}
          <div className="tlegs-list">
            {g.rows.map((leg) => (
              <LegRow
                key={leg.key}
                leg={leg}
                value={values[leg.key]}
                onChange={onChange}
                adults={adults}
                estimate={estimates[leg.key] || 0}
                t={t}
                lang={lang}
                partyText={partyText}
                flightProps={flightProps}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The same legs, read-only, for the review: route, how, and the figure. */
export function TravelLegsSummary({ legs, values, estimates = {}, onEdit, transfers = null, cartaFlight = null }) {
  const { t } = useI18n();
  if (!legs.length) return null;
  // The airport transfers sit in the journey where they happen (T458): after
  // the way there, before the way home.
  const rows = [];
  legs.forEach((leg) => {
    if (leg.kind === 'back' && transfers?.out) rows.push({ transfer: transfers.out, key: 'tr-out' });
    rows.push({ leg, key: leg.key });
    if (leg.kind === 'out' && transfers?.in) rows.push({ transfer: transfers.in, key: 'tr-in' });
  });
  return (
    <div className="tsum">
      <div className="tsum-head">
        <h2 className="tsum-h">{t('travel.title')}</h2>
        {onEdit && <Button variant="quiet" size="sm" onClick={onEdit}>{t('travel.edit')}</Button>}
      </div>
      <dl className="tsum-list costrows">
        {rows.map(({ leg, transfer, key }) => {
          if (transfer) {
            return (
              <CostRow key={key} kind="transfers" className="is-transfer" label={transfer.label}
                sub={t('plan.transfer')} value={<Money value={transfer.eur} est precision="cents" />} />
            );
          }
          const v = values[leg.key] || {};
          const Icon = MODE_ICON[v.mode];
          const paid = paidEur(v.eur);
          const est = estimates[leg.key] || 0;
          // Carta's flight for the way there or home (T518), Google's fare.
          const fLeg = (leg.kind === 'out' || leg.kind === 'back') && !leg.booked && (!v.mode || v.mode === 'fly') ? cartaFlight?.[leg.kind] : null;
          return (
            <CostRow
              key={leg.key}
              kind={leg.booked ? null : v.mode || null}
              label={(
                <span className="tsum-route">
                  {cityLabel(leg.from.city) || leg.from.name}
                  <span className="tleg-arrow" aria-hidden="true">&rarr;</span>
                  {cityLabel(leg.to.city) || leg.to.name}
                </span>
              )}
              sub={leg.booked
                ? <span className="tsum-mode"><CheckIcon size={12} /> {t('travel.booked')}</span>
                : (Icon ? t(TRAVEL_MODE_LABEL[v.mode]) : null)}
              tone={paid > 0 ? 'yours' : (!fLeg?.cost && !(est > 0) ? 'missing' : null)}
              mark={!(paid > 0) && fLeg?.cost ? <AirlineMark code={fLeg.airline} size="sm" /> : null}
              value={paid > 0 ? (
                <span className="plan-line-yours"><Money value={paid} precision="cents" /><small>{t('plan.yours')}</small></span>
              ) : fLeg?.cost ? (
                <Money value={fLeg.cost.total} precision="cents" />
              ) : est > 0 ? (
                <Money value={est} est precision="cents" />
              ) : (
                t('plan.notIn')
              )}
            />
          );
        })}
      </dl>
    </div>
  );
}
