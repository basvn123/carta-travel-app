import React, { useMemo, useState } from 'react';
import { legLinks, TRAVEL_MODES, TRAVEL_MODE_LABEL } from '../lib/transportLinks.js';
import { fmtDate, addDays } from '../lib/dates.js';
import { useI18n } from '../i18n/index.jsx';
import { Button, Money } from '../components/ui/index.js';
import {
  TrainIcon, BusIcon, CarIcon, FerryIcon, CheckIcon, ChevronDownIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { cityLabel } from '../lib/placeName.js';
import { paidEur } from '../lib/tripTotal.js';
import { PaidField } from './PlanTotal.jsx';

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
function LegRow({ leg, value, onChange, adults, estimate, t, lang, partyText }) {
  const mode = value?.mode || '';
  const Icon = MODE_ICON[mode];
  const paid = paidEur(value?.eur);
  const [open, setOpen] = useState(false);
  const links = useMemo(() => (open ? legLinks({
    from: leg.from,
    to: leg.to,
    mode,
    date: leg.date,
    returnDate: leg.returnDate || '',
    adults,
    subId: `wiz_${leg.kind}`,
    lang,
  }) : []), [open, leg, mode, adults, lang]);
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
            label={leg.kind === 'inter' ? t('plan.youPaidFor', { people: partyText }) : t('plan.yourFareFor', { people: partyText })}
            onChange={(n) => onChange(leg.key, { eur: n ? String(n) : '', ...(mode ? {} : { mode: leg.kind === 'inter' ? 'train' : 'fly' }) })}
          />
        </div>
      </div>
      {leg.published && !open && (
        <p className="tleg-measured">{publishedLine(leg.published, t)}</p>
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
            {links.length > 0 && (
              <div className="tleg-links">
                <span className="tleg-links-label">{t('travel.checkOn')}</span>
                {links.map((l) => (
                  <a key={l.key} className="tleg-link" href={l.url} target="_blank" rel="noreferrer noopener">
                    {l.label} <span aria-hidden="true">&#8599;</span>
                  </a>
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
}) {
  const { t, lang } = useI18n();
  const partyText = party === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: party });
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
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The same legs, read-only, for the review: route, how, and the figure. */
export function TravelLegsSummary({ legs, values, estimates = {}, onEdit }) {
  const { t } = useI18n();
  if (!legs.length) return null;
  return (
    <div className="tsum">
      <div className="tsum-head">
        <h2 className="tsum-h">{t('travel.title')}</h2>
        {onEdit && <Button variant="quiet" size="sm" onClick={onEdit}>{t('travel.edit')}</Button>}
      </div>
      <div className="tsum-list">
        {legs.map((leg) => {
          const v = values[leg.key] || {};
          const Icon = MODE_ICON[v.mode];
          const paid = paidEur(v.eur);
          const est = estimates[leg.key] || 0;
          return (
            <div className="tsum-row" key={leg.key}>
              <span className="tsum-route">
                {cityLabel(leg.from.city) || leg.from.name}
                <span className="tleg-arrow" aria-hidden="true">&rarr;</span>
                {cityLabel(leg.to.city) || leg.to.name}
              </span>
              {leg.booked
                ? <span className="tsum-mode"><CheckIcon size={12} /> {t('travel.booked')}</span>
                : Icon && <span className="tsum-mode"><Icon size={12} /> {t(TRAVEL_MODE_LABEL[v.mode])}</span>}
              <span className="tsum-eur">
                {paid > 0 ? (
                  <span className="plan-line-yours"><Money value={paid} precision="cents" /><small>{t('plan.yours')}</small></span>
                ) : est > 0 ? (
                  <Money value={est} est precision="cents" />
                ) : (
                  <span className="plan-line-out">{t('plan.notIn')}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
