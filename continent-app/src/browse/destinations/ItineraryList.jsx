import { LayerError } from './DestTabParts.jsx';
import { PlaceCardSkeletons } from '../PlaceCard.jsx';
import React from 'react';
import { bandBreak } from '../../lib/regions.js';
import { ItinCard } from '../DestCards.jsx';
import { rankTrips } from '../../lib/trips.js';
import { Button } from '../../components/ui/index.js';

export function ItineraryList({
  chipsEmpty, countryEmpty, itinCountry, itinCountryRows, itinDays, itinPace, itinRows,
  itinScale, itinTop, layerError, nearPlace, q, radiusEmpty, retryLayer, sentinelRef,
  setItinDays, setItinPace, setItinScale, setPageItin, setQuery, t, visible,
}) {
  return (
    <div className="places-list">
      {layerError.trips && (
        <LayerError onRetry={() => retryLayer('trips')} t={t} msg="trip.loadFailed" />
      )}

      {/* itinRows === null is this list's loading state, which is also
          exactly where a failed fetch leaves it: without the guard the
          dots spun forever on a dropped connection. Still blocks of a
          card's size, not an ellipsis (T394, carta-design "Loading"). */}
      {itinRows === null && !layerError.trips && <PlaceCardSkeletons n={3} label={t('card.loading')} />}

      {itinRows && itinRows.length > 0 && (
        <>
          {/* No count line here: the slider already carries the number,
              and saying it twice was one sentence too many. */}
          {itinRows.slice(0, visible).map(({ tr, km }, i) => (
            <React.Fragment key={tr.id}>
              {bandBreak(itinRows, i) && (
                <p className="places-bandhead">{t(bandBreak(itinRows, i))}</p>
              )}
              <ItinCard tr={tr} km={km} onOpen={setPageItin} t={t} />
            </React.Fragment>
          ))}
        </>
      )}

      {itinRows && itinRows.length === 0 && (
        nearPlace
          ? radiusEmpty('itin', (layer, row) => setPageItin(row))
          // A country with no composed trip at all, nothing else set:
          // the coverage module, not "nothing matches those filters".
          : (itinCountry && !itinDays && !itinPace && !itinScale && !q)
            ? countryEmpty('itin', itinCountry, (layer, row) => setPageItin(row))
            : itinDays
            ? (
              <div className="places-empty empty-act">
                <p>{t('trip.emptyDays', { n: itinDays })}</p>
                {/* The two lengths either side, where anything was
                    composed at them; a button that led to another
                    empty list would only move the dead end. */}
                {[itinDays - 1, itinDays + 1]
                  .filter((n) => n >= 2 && rankTrips(itinCountry ? itinCountryRows : itinTop,
                    { days: n, pace: itinPace, scale: itinScale }).some((tr) => tr.days === n))
                  .map((n) => (
                    <Button key={n} variant="secondary" size="sm" className="cov-empty-btn" onClick={() => setItinDays(n)}>
                      {t('journey.nDays', { n })}
                    </Button>
                  ))}
              </div>
            )
            : chipsEmpty('trip.emptyAll', () => {
              setItinDays(null); setItinPace(null); setItinScale(null); setQuery('');
            }, 'empty.clearFilters')
      )}

      {itinRows && visible < itinRows.length && (
        <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
      )}

    </div>
  );
}
