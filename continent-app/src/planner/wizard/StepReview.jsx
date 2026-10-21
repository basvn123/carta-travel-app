import React, { useEffect, useMemo, useState } from 'react';
import { PhotoGallery } from '../../browse/PhotoGallery.jsx';
import { TravelLegsSummary } from '../TravelLegsSection.jsx';
import { PlanTotal, PaidField } from '../PlanTotal.jsx';
import { Button } from '../../components/Button.jsx';
import { Money } from '../../components/ui/index.js';
import { CarIcon } from '../../components/Icons.jsx';
import { partyText } from '../../lib/party.js';
import { paidEur } from '../../lib/tripTotal.js';
import { loadDossier } from '../../lib/dossier.js';
import { stayDatesLink, TRAVEL_MODE_LABEL } from '../../lib/transportLinks.js';
import { carAdvice } from '../../lib/transport.js';
import { cityLabel } from '../../lib/placeName.js';
import { fmtDate } from '../../lib/dates.js';
import { CityThumb } from '../GuidedTripWizardParts.jsx';
import { nightsText } from './wizardSteps.js';
import { useI18n } from '../../i18n/index.jsx';

/**
 * Review (T432, T458): the trip as one card, every answer on it. The
 * photographs of where it goes, captioned under the photo; the choices with
 * the way back to each; every stay with its bed price and a place to put
 * what was paid; the legs; and, on a phone, the price card the planned trip
 * will open on. From 1024 px the price lives in the right column's total bar
 * and the map of the stops stands beside the review instead (`railOn`).
 */
export function StepReview({
  titleTag, handOver, summaryTitle, summaryDates, party, setParty, steps, goStep, priced, bedEstimate,
  ownStays, setOwnStay, adults, kids, gettingLegs, travelValues, legEstimates, gotoGetting, ownCarChosen,
  selectedCountries, includedIds, destinations, groupSize, countryInsights, railOn,
}) {
  const { t } = useI18n();
  const StepTitle = titleTag;

  // Each stop's own gallery (the dossier the destination page shows), three
  // photographs a stop, nine at most.
  const [stopGalleries, setStopGalleries] = useState({});
  const reviewStops = handOver.stops;
  useEffect(() => {
    if (!reviewStops?.length) return undefined;
    let live = true;
    Promise.all(reviewStops.map((s) => loadDossier(s.destinationId)
      .then((d) => [s.destinationId, Array.isArray(d?.gallery) ? d.gallery : []])))
      .then((rows) => { if (live) setStopGalleries(Object.fromEntries(rows)); });
    return () => { live = false; };
  }, [reviewStops]);
  const reviewPhotos = useMemo(() => {
    const out = [];
    for (const s of handOver.stops) {
      const d = destinations[s.destinationId];
      if (!d) continue;
      const g = (stopGalleries[s.destinationId] || []).filter((p) => p && p.url);
      const list = g.length ? g : (d.image?.url ? [{ url: d.image.url }] : []);
      list.slice(0, 3).forEach((p) => out.push({ ...p, caption: p.caption || cityLabel(d.city) }));
    }
    return out.slice(0, 9);
  }, [handOver.stops, stopGalleries, destinations]);

  // The runway to the first bed and the last bed to the runway, as legs.
  const reviewTransfers = useMemo(() => {
    if (!priced) return null;
    const first = priced.stopDetails[0]?.dest;
    const last = priced.stopDetails[priced.stopDetails.length - 1]?.dest;
    const ft = priced.flightTransfer;
    const inEur = (ft?.in_total || 0) + (priced.anchorLegs?.in?.ground_total || 0);
    const outEur = (ft?.out_total || 0) + (priced.anchorLegs?.out?.ground_total || 0);
    return {
      in: inEur > 0 && first ? { label: t('plan.transferIn', { city: cityLabel(first.city) }), eur: inEur } : null,
      out: outEur > 0 && last ? { label: t('plan.transferOut', { city: cityLabel(last.city) }), eur: outEur } : null,
    };
  }, [priced, t]);

  // What THEY said about the way out: Carta picks nobody's flight.
  const summaryTransport = (() => {
    const out = travelValues.out || {};
    if (out.mode) {
      const how = t(TRAVEL_MODE_LABEL[out.mode]);
      return out.service?.trim() ? `${how}, ${out.service.trim()}` : how;
    }
    return t('wizard.transportNotSaid');
  })();

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

  return (
    <>
      <StepTitle className="guide-title">{t('plan.reviewTitle')}</StepTitle>

      <div className="wrev">
        <div className="wrev-main">
          {reviewPhotos.length > 0 && (
            <div className="wrev-hero">
              <PhotoGallery photos={reviewPhotos} label={handOver.label || summaryTitle} className="wrev-gallery" />
            </div>
          )}

          <div className="wrev-head">
            <h2 className="wrev-title">{handOver.label || summaryTitle}</h2>
            <p className="wrev-sub">{summaryDates}</p>
          </div>

          <dl className="wrev-facts">
            {[
              ['Booked', t('wizard.summaryTravellers'), partyText(t, party)],
              ['When', t('wizard.summaryDates'), summaryDates],
              ['Getting', t('wizard.summaryGettingThere'), summaryTransport],
            ].map(([to, label, value]) => (
              <div className="wrev-fact" key={to}>
                <dt>{label}</dt>
                <dd>
                  <span>{value}</span>
                  {steps.includes(to) && (
                    <Button variant="quiet" size="sm" className="wrev-change" onClick={() => goStep(steps.indexOf(to) + 1)}>
                      {t('wizard.change')}
                    </Button>
                  )}
                </dd>
              </div>
            ))}
          </dl>

          <section className="wrev-stays" aria-labelledby="wrev-stays-h">
            <h2 className="wrev-h" id="wrev-stays-h">{t('lifestyle.stay')}</h2>
            <ol className="wrev-stops">
              {(priced?.stopDetails || []).map((sd, i) => sd.dest && (
                <li className="wrev-stop" key={sd.destinationId}>
                  <span className="wrev-stop-i">{i + 1}</span>
                  <CityThumb dest={sd.dest} className="wrev-stop-thumb" />
                  <span className="wrev-stop-main">
                    <b>{cityLabel(sd.dest.city)}</b>
                    <small>
                      {sd.arriveDate
                        ? t('wizard.nightsFrom', { nights: nightsText(t, sd.nights), date: fmtDate(sd.arriveDate, true) })
                        : nightsText(t, sd.nights)}
                    </small>
                  </span>
                  <span className="wrev-stop-bed">
                    {priced.stayCosts[i]?.ownAccom
                      ? <span className="plan-line-yours"><Money value={priced.stayCosts[i].accomTotal} precision="cents" /><small>{t('plan.yours')}</small></span>
                      : <Money value={bedEstimate(sd.destinationId)} est precision="cents" />}
                  </span>
                  <span className="wrev-stop-acts">
                    <a
                      className="btn btn-quiet btn-sm wrev-find"
                      href={stayDatesLink({
                        city: cityLabel(sd.dest.city), country: sd.dest.country,
                        checkin: sd.arriveDate, checkout: sd.departDate, adults, children: kids,
                      })}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      <span className="btn-label">{t('plan.findStay')}</span>
                    </a>
                    <PaidField
                      id={`rev-bed-${sd.destinationId}`}
                      value={paidEur(ownStays[sd.destinationId])}
                      estimate={bedEstimate(sd.destinationId)}
                      label={t('plan.bookingPrice')}
                      addLabel={t('plan.addBookingPrice')}
                      onChange={(n) => setOwnStay(sd.destinationId, n)}
                      folded
                      hint={false}
                    />
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {gettingLegs.length > 0 && (
            <TravelLegsSummary
              legs={gettingLegs}
              values={travelValues}
              estimates={legEstimates}
              onEdit={gotoGetting}
              transfers={reviewTransfers}
            />
          )}

          {ownCarChosen ? (
            drivingNotes.length > 0 && (
              <div className="guide-car-advice no">
                <div className="guide-car-advice-head">
                  <CarIcon size={14} /> {t('wizard.ownCarNotesTitle')}
                </div>
                {drivingNotes.map((n, i) => <p key={`d${i}`} className="guide-car-note">{n}</p>)}
              </div>
            )
          ) : advice.verdict !== 'no' && (
            <div className={`guide-car-advice ${advice.verdict}`}>
              <div className="guide-car-advice-head">
                <CarIcon size={14} />
                {' '}
                {advice.verdict === 'yes' ? t('wizard.carAdviceYes') : t('wizard.carAdviceMaybe')}
              </div>
              {advice.reasons.slice(0, 2).map((r, i) => <p key={i}>{r}</p>)}
            </div>
          )}
        </div>

        {/* Under 1024 px there is no right column, so the review carries
            the price card in the page. */}
        {!railOn && (
          <PlanTotal
            priced={priced}
            dates={summaryDates}
            party={party}
            onParty={setParty}
            onAddFare={gotoGetting}
            variant="card"
            defaultOpen
          />
        )}
      </div>
    </>
  );
}
