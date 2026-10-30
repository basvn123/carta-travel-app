import React, { useEffect, useMemo, useState } from 'react';
import { PaidField } from '../PlanTotal.jsx';
import { Button, CostRow, CostSum, Money } from '../../components/ui/index.js';
import {
  ArrowRightIcon, BedIcon, CalendarIcon, CarIcon, ChevronDownIcon, PersonIcon, TrainIcon, BusIcon, FerryIcon,
} from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';
import { AirlineMark } from '../../components/flights/Flights.jsx';
import { airlineName, useAirlines } from '../../lib/flights/useAirlines.js';
import { partyText } from '../../lib/party.js';
import { paidEur, tripLines } from '../../lib/tripTotal.js';
import { loadDossier } from '../../lib/dossier.js';
import { stayDatesLink, TRAVEL_MODE_LABEL } from '../../lib/transportLinks.js';
import { carAdvice } from '../../lib/transport.js';
import { cityLabel } from '../../lib/placeName.js';
import { fmtDate } from '../../lib/dates.js';
import { formatMoney } from '../../lib/money.js';
import { nightsText } from './wizardSteps.js';
import { useI18n } from '../../i18n/index.jsx';

/**
 * Review (T432, T458; redrawn T813): the trip as one calm summary. A strip
 * of photographs, one a stop, captioned under the photo; the trip's name,
 * dates and party; the route as a timeline (the way out, each stop with its
 * nights and its bed, the hops, the way home), each line with its icon; and
 * what it costs as the planner's own receipt lines (lib/tripTotal.js
 * tripLines), the total for the group and a person. Each section has an
 * Edit that goes to its step. The figures are the planner's: nothing here
 * adds a price of its own.
 */

const MODE_ICON = { fly: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon, ferry: FerryIcon };

// The receipt line names, the same keys the price card reads (PlanTotal.jsx).
const LINE_KEY = {
  out: 'itin.secGetThere',
  back: 'itin.secGetHome',
  travel: 'plan.lineTravel',
  drive: 'plan.lineDrive',
  transfers: 'plan.lineTransfers',
  between: 'plan.lineBetween',
  car: 'plan.lineCar',
  beds: 'plan.lineBeds',
  days: 'plan.lineDays',
};

/** A section head with its one small Edit. */
function SectionHead({ id, title, onEdit, editLabel, t }) {
  return (
    <div className="wz-rev-sechead">
      <h2 className="wz-rev-h" id={id}>{title}</h2>
      {onEdit && (
        <Button variant="quiet" size="sm" className="wz-rev-edit" onClick={onEdit} aria-label={t('wizard.revEditAria', { what: editLabel || title })}>
          {t('travel.edit')}
        </Button>
      )}
    </div>
  );
}

/** One stop's stay, behind a small fold: where to find a bed and what it cost. */
function StayFold({ sd, adults, kids, ownStays, setOwnStay, bedEstimate, t }) {
  const [open, setOpen] = useState(false);
  const city = cityLabel(sd.dest.city);
  const bodyId = `wz-stay-${sd.destinationId}`;
  return (
    <>
      <Button
        variant="quiet"
        size="sm"
        className="wz-tl-more"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        aria-label={t('wizard.revStayAria', { city })}
      >
        {t('wizard.revStay')}
        <ChevronDownIcon size={14} className="wz-fold-chev" />
      </Button>
      <div id={bodyId} hidden={!open} className="wz-tl-stay">
        {open && (
          <>
            <a
              className="wz-link"
              href={stayDatesLink({
                city, country: sd.dest.country, checkin: sd.arriveDate, checkout: sd.departDate, adults, children: kids,
              })}
              target="_blank"
              rel="noreferrer noopener"
            >
              {t('plan.findStay')}
              <span className="sr-only"> {t('plan.opensNewTab')}</span>
            </a>
            <PaidField
              id={`rev-bed-${sd.destinationId}`}
              value={paidEur(ownStays[sd.destinationId])}
              estimate={bedEstimate(sd.destinationId)}
              label={t('plan.bookingPrice')}
              onChange={(n) => setOwnStay(sd.destinationId, n)}
              hint={false}
            />
          </>
        )}
      </div>
    </>
  );
}

export function StepReview({
  titleTag, handOver, summaryTitle, summaryDates, party, steps, goStep, priced, bedEstimate,
  ownStays, setOwnStay, adults, kids, gettingLegs, travelValues, gotoGetting, ownCarChosen,
  selectedCountries, includedIds, destinations, groupSize, countryInsights, onOpenTotal = null,
}) {
  const { t, lang } = useI18n();
  const airlines = useAirlines();
  const StepTitle = titleTag;

  // Each stop's own gallery (the dossier the destination page shows): the
  // first photograph a stop leads the strip, with its credit under it.
  const [stopGalleries, setStopGalleries] = useState({});
  const reviewStops = handOver.stops;
  useEffect(() => {
    if (!reviewStops?.length) return undefined;
    let live = true;
    Promise.all(reviewStops.map((s) => loadDossier(s.destinationId)
      .then((d) => [s.destinationId, Array.isArray(d?.gallery) ? d.gallery : []], () => [s.destinationId, []])))
      .then((rows) => { if (live) setStopGalleries(Object.fromEntries(rows)); });
    return () => { live = false; };
  }, [reviewStops]);
  const stopPhotos = useMemo(() => (priced?.stopDetails || []).map((sd) => {
    const g = (stopGalleries[sd.destinationId] || []).find((p) => p && p.url);
    const url = g?.url || sd.dest?.image?.url || null;
    return { sd, url, credit: g ? [g.author, g.licence].filter(Boolean).join(', ') : '' };
  }), [priced, stopGalleries]);

  // Should this trip have a car? From the chosen cities' own transit data
  // and each country's driving intel.
  const advice = useMemo(
    () => carAdvice(includedIds.map((id) => destinations[id]).filter(Boolean), groupSize, countryInsights),
    [includedIds, destinations, groupSize, countryInsights],
  );
  const drivingNotes = useMemo(() => {
    const notes = [];
    for (const c of selectedCountries) {
      const d = countryInsights?.[c.country]?.driving;
      if (!d) continue;
      if (d.side === 'left') notes.push(t('wizard.drivesLeft', { country: c.country }));
      if (d.vignette) notes.push(`${c.country}: ${d.vignette}`);
    }
    return notes;
  }, [selectedCountries, countryInsights, t]);

  const stopsStep = ['Stay', 'Stays', 'Trips', 'Where'].find((s) => steps.includes(s));
  const editStops = stopsStep ? () => goStep(steps.indexOf(stopsStep) + 1) : null;
  const people = groupSize === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: groupSize });

  // A leg on the timeline: its icon, the route, and how (the flight the
  // trip is priced on, the traveller's own fare, or the way they chose).
  const legLine = (leg) => {
    const v = travelValues[leg.key] || {};
    const dir = leg.kind === 'out' || leg.kind === 'back' ? leg.kind : null;
    const i = leg.kind === 'inter' ? leg.index : -1;
    const pricedMode = i >= 0 ? priced?.legs?.[i]?.mode : null;
    const cf = dir && !leg.booked && (!v.mode || v.mode === 'fly') ? priced?.cartaFlight?.[dir] : null;
    const mode = v.mode || (cf ? 'fly' : pricedMode) || (dir ? 'fly' : 'train');
    const Icon = MODE_ICON[mode] || PlaneIcon;
    const paid = paidEur(v.eur);
    let how;
    if (leg.booked) how = t('travel.booked');
    else if (paid > 0) how = [t(TRAVEL_MODE_LABEL[mode]), v.service?.trim(), t('wizard.revYourFare')].filter(Boolean).join(', ');
    else if (cf) how = `${airlineName(airlines, cf.airline) || cf.airline}, ${t('flight.times', { dep: cf.dep, arr: cf.arr })}`;
    else how = t(TRAVEL_MODE_LABEL[mode]);
    return (
      <li className="wz-tl-item is-leg" key={leg.key}>
        <span className="wz-tl-icon" aria-hidden="true">{cf ? <AirlineMark code={cf.airline} size="sm" /> : <Icon size={18} />}</span>
        <span className="wz-tl-main">
          <span className="wz-tl-title">
            {cityLabel(leg.from.city) || leg.from.name}
            <ArrowRightIcon size={14} className="wz-leg-arrow" />
            {cityLabel(leg.to.city) || leg.to.name}
          </span>
          {/* T855: a flight on the swept day nearest the leg's names its own day. */}
          <span className="wz-tl-sub">{[(cf?.date || leg.date) && fmtDate(cf?.date || leg.date, true), how].filter(Boolean).join(', ')}</span>
        </span>
      </li>
    );
  };

  const outLegs = gettingLegs.filter((l) => l.kind === 'out');
  const backLegs = gettingLegs.filter((l) => l.kind === 'back');
  const interAt = (i) => gettingLegs.filter((l) => l.kind === 'inter' && l.index === i);
  const lines = tripLines(priced);
  const hasTrip = Boolean(priced?.stopDetails?.length);

  return (
    <div className="wz-rev">
      <StepTitle className="guide-title">{t('plan.reviewTitle')}</StepTitle>

      {stopPhotos.some((p) => p.url) && (
        <ul className="wz-rev-photos" aria-label={t('wizard.revPhotos')}>
          {stopPhotos.map(({ sd, url, credit }) => sd.dest && (
            <li className="wz-rev-photo" key={sd.destinationId}>
              {url
                ? <img src={url} alt="" loading="lazy" decoding="async" />
                : <span className="wz-rev-photo-blank" aria-hidden="true">{cityLabel(sd.dest.city).slice(0, 1)}</span>}
              <span className="wz-rev-cap">
                <b>{cityLabel(sd.dest.city)}</b>
                <span>{nightsText(t, sd.nights)}</span>
              </span>
              {credit && <small className="wz-rev-credit">{credit}</small>}
            </li>
          ))}
        </ul>
      )}

      <section className="wz-rev-sec wz-rev-trip" aria-labelledby="wz-rev-name">
        <SectionHead id="wz-rev-name" title={handOver.label || summaryTitle} onEdit={editStops} editLabel={t('wizard.revStops')} t={t} />
        <p className="wz-rev-facts">
          <span><CalendarIcon size={16} />{summaryDates}</span>
          <span><PersonIcon size={16} />{partyText(t, party)}</span>
        </p>
      </section>

      <section className="wz-rev-sec" aria-labelledby="wz-rev-route">
        <SectionHead id="wz-rev-route" title={t('wizard.revRoute')} onEdit={gotoGetting} editLabel={t('wizard.stepGetting')} t={t} />
        <ol className="wz-tl">
          {outLegs.map(legLine)}
          {(priced?.stopDetails || []).map((sd, i) => sd.dest && (
            <React.Fragment key={sd.destinationId}>
              <li className="wz-tl-item is-stop">
                <span className="wz-tl-icon is-stop" aria-hidden="true"><BedIcon size={18} /></span>
                <span className="wz-tl-main">
                  <span className="wz-tl-title">{cityLabel(sd.dest.city)}</span>
                  <span className="wz-tl-sub">
                    {sd.arriveDate
                      ? t('wizard.nightsFrom', { nights: nightsText(t, sd.nights), date: fmtDate(sd.arriveDate, true) })
                      : nightsText(t, sd.nights)}
                  </span>
                  <StayFold {...{ sd, adults, kids, ownStays, setOwnStay, bedEstimate, t }} />
                </span>
                <span className="wz-tl-fig">
                  {priced.stayCosts[i]?.ownAccom ? (
                    <span className="plan-line-yours">
                      <Money value={priced.stayCosts[i].accomTotal} precision="cents" />
                      <small>{t('plan.yours')}</small>
                    </span>
                  ) : <Money value={bedEstimate(sd.destinationId)} est precision="cents" />}
                </span>
              </li>
              {interAt(i).map(legLine)}
            </React.Fragment>
          ))}
          {backLegs.map(legLine)}
        </ol>
      </section>

      {hasTrip && (
        <section className="wz-rev-sec" aria-labelledby="wz-rev-costs">
          <SectionHead id="wz-rev-costs" title={t('wizard.revCosts')} t={t} />
          <dl className="costrows wz-rev-lines">
            {lines.map((l) => {
              const v = (l.key === 'out' || l.key === 'back') ? travelValues[l.key] : null;
              const kind = v?.mode && v.mode !== 'fly' ? v.mode : l.key;
              return (
                <CostRow
                  key={l.key}
                  kind={kind}
                  label={t(LINE_KEY[l.key])}
                  tone={l.kind === 'missing' ? 'missing' : l.kind === 'yours' ? 'yours' : null}
                  mark={l.kind === 'flight' && l.leg?.airline ? <AirlineMark code={l.leg.airline} size="sm" /> : null}
                  value={l.kind === 'missing' ? (
                    gotoGetting
                      ? <Button variant="quiet" size="sm" className="plan-line-add" onClick={gotoGetting}>{t('plan.addYourFare')}</Button>
                      : <span className="plan-line-out">{t('plan.notIn')}</span>
                  ) : l.kind === 'yours' ? (
                    <span className="plan-line-yours">
                      {formatMoney(l.eur, { precision: 'cents', locale: lang })}
                      <small>{t('plan.yours')}</small>
                    </span>
                  ) : <Money value={l.eur} est={l.kind !== 'flight'} precision="cents" />}
                />
              );
            })}
            <CostSum
              label={t('receipt.total', { people })}
              value={<Money value={priced.grandTotal} est precision="cents" />}
              each={groupSize > 1 ? t('plan.aPerson', { price: formatMoney(priced.perPerson, { precision: 'cents', locale: lang }) }) : null}
            />
          </dl>
          {onOpenTotal && (
            <Button variant="quiet" size="sm" className="wz-rev-more" onClick={onOpenTotal}>{t('plan.whatsIn')}</Button>
          )}
        </section>
      )}

      {ownCarChosen ? (
        drivingNotes.length > 0 && (
          <div className="wz-rev-car">
            <CarIcon size={18} />
            <span><b>{t('wizard.ownCarNotesTitle')}</b>{drivingNotes.map((n, i) => <span key={`d${i}`}>{n}</span>)}</span>
          </div>
        )
      ) : advice.verdict !== 'no' && (
        <div className="wz-rev-car">
          <CarIcon size={18} />
          <span>
            <b>{advice.verdict === 'yes' ? t('wizard.carAdviceYes') : t('wizard.carAdviceMaybe')}</b>
            {advice.reasons.slice(0, 2).map((r, i) => <span key={i}>{r}</span>)}
          </span>
        </div>
      )}
    </div>
  );
}
