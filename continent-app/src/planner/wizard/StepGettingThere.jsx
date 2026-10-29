import React from 'react';
import { TravelLegsSection } from '../TravelLegsSection.jsx';
import { LoadingBlock, ErrorBlock } from '../../components/StateBlocks.jsx';
import { Button } from '../../components/Button.jsx';
import { tripHeadline } from '../../lib/tripStory.js';
import { useI18n } from '../../i18n/index.jsx';

/**
 * Getting there: the stops and the nights are settled, so what is left is the
 * way in, the way home and the moving about in between: one card per leg,
 * priced by the traveller or on the flight Carta found. It works on every
 * path (T388): its legs come from the stops and the dates.
 *
 * T812: where the trip leaves from is one line, the dates one line that
 * moves the whole trip, then the legs; the list of stops left (the legs and
 * the review name them).
 */
export function StepGettingThere({
  titleTag, booked, originCard, tripPick, onPickAnother, stopDates, tripLoading, tripFailed,
  onRetryTrip, tripDetail, tripMissing, gettingLegs, travelValues, setTravelLeg, adults, tripStartDate, tripEndDate = '',
  onSetStart, dateMin, dateMax, jawHint, legEstimates, pricedModes, groupSize, cartaFlight = null,
  liveAnswers = null, flightParty = null, flightWaiting = null, onPickFlight = null,
}) {
  const { t } = useI18n();
  const StepTitle = titleTag;
  const ready = tripPick ? tripDetail : stopDates.length > 0;
  return (
    <div className="wz-gt">
      <StepTitle className="guide-title">{t('wizard.gettingTitle')}</StepTitle>

      {!booked.travel && originCard}

      {!tripPick && !stopDates.length && <p className="guide-empty">{t('ready.noTripYet')}</p>}

      {tripPick && (
        <div className="wz-gt-pick">
          <b>{tripHeadline(tripPick, t)}</b>
          <Button variant="quiet" size="sm" onClick={onPickAnother}>{t('ready.pickAnother')}</Button>
        </div>
      )}
      {tripPick && tripLoading && <LoadingBlock label={t('ready.loadingTrip')} rows={3} />}
      {tripPick && tripFailed && (
        <ErrorBlock message={t('state.tripLoadFailed')} onRetry={onRetryTrip} retryLabel={t('layer.retry')} />
      )}
      {tripPick && ready && tripMissing > 0 && <p className="guide-empty">{t('ready.stopsMissing', { n: tripMissing })}</p>}

      {ready && (
        <TravelLegsSection
          legs={gettingLegs}
          values={travelValues}
          onChange={setTravelLeg}
          adults={adults}
          startDate={tripStartDate}
          endDate={tripEndDate}
          onSetStart={onSetStart}
          dateMin={dateMin}
          dateMax={dateMax}
          openJawHint={jawHint}
          estimates={legEstimates}
          pricedModes={pricedModes}
          party={groupSize}
          cartaFlight={cartaFlight}
          liveAnswers={liveAnswers}
          flightParty={flightParty}
          flightWaiting={flightWaiting}
          onPickFlight={onPickFlight}
        />
      )}
    </div>
  );
}
