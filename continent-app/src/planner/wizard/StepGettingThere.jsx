import React from 'react';
import { TravelLegsSection } from '../TravelLegsSection.jsx';
import { LoadingBlock, ErrorBlock } from '../../components/StateBlocks.jsx';
import { Button } from '../../components/Button.jsx';
import { CheckIcon } from '../../components/Icons.jsx';
import { tripHeadline } from '../../lib/tripStory.js';
import { cityLabel } from '../../lib/placeName.js';
import { fmtDate } from '../../lib/dates.js';
import { Flag } from '../GuidedTripWizardParts.jsx';
import { nightsText } from './wizardSteps.js';
import { useI18n } from '../../i18n/index.jsx';

/**
 * Getting there: the stops and the nights are settled, so what is left is the
 * way in, the way home and the moving about in between: one question per leg,
 * priced by the traveller, because Carta does not sell any of it. It works on
 * every path (T388): its legs come from the stops and the dates.
 */
export function StepGettingThere({
  titleTag, booked, originCard, tripPick, onPickAnother, stopDates, destinations, tripLoading, tripFailed,
  onRetryTrip, tripDetail, tripMissing, gettingLegs, travelValues, setTravelLeg, adults, tripStartDate,
  onSetStart, dateMin, dateMax, jawHint, legEstimates, groupSize, cartaFlight = null,
}) {
  const { t } = useI18n();
  const StepTitle = titleTag;
  return (
    <>
      <StepTitle className="guide-title">{t('wizard.gettingTitle')}</StepTitle>

      {!booked.travel && originCard}

      {!tripPick && !stopDates.length && <p className="guide-empty">{t('ready.noTripYet')}</p>}

      {(tripPick || stopDates.length > 0) && (
        <div className="wpicked">
          {tripPick && (
            <div className="wpicked-head">
              <span className="wpicked-label"><CheckIcon size={12} /> {t('ready.yourTrip')}</span>
              <b className="wpicked-name">{tripHeadline(tripPick, t)}</b>
              <Button variant="quiet" size="sm" onClick={onPickAnother}>
                {t('ready.pickAnother')}
              </Button>
            </div>
          )}

          {tripPick && tripLoading && <LoadingBlock label={t('ready.loadingTrip')} rows={3} />}
          {tripPick && tripFailed && (
            <ErrorBlock message={t('state.tripLoadFailed')} onRetry={onRetryTrip} retryLabel={t('layer.retry')} />
          )}

          {(tripPick ? tripDetail : stopDates.length > 0) && (
            <>
              <div className="wpicked-stops">
                {stopDates.map((s, i) => destinations[s.id] && (
                  <div className="guide-final-stop" key={s.id}>
                    <span className="wpicked-i">{i + 1}</span>
                    <b>{cityLabel(destinations[s.id].city)}</b>
                    <Flag iso2={destinations[s.id].iso2} className="guide-flag-img-sm" />
                    <span>{nightsText(t, s.nights)}</span>
                    {s.arrive && <small className="wpicked-date">{fmtDate(s.arrive)}</small>}
                  </div>
                ))}
              </div>
              {tripPick && tripMissing > 0 && (
                <p className="guide-empty">{t('ready.stopsMissing', { n: tripMissing })}</p>
              )}
              <TravelLegsSection
                legs={gettingLegs}
                values={travelValues}
                onChange={setTravelLeg}
                adults={adults}
                startDate={tripStartDate}
                onSetStart={onSetStart}
                dateMin={dateMin}
                dateMax={dateMax}
                openJawHint={jawHint}
                estimates={legEstimates}
                party={groupSize}
                cartaFlight={cartaFlight}
              />
            </>
          )}
        </div>
      )}
    </>
  );
}
