import { Strip } from '../SectionOpening.jsx';
import { CountryGalleryCard } from '../CountryGallery.jsx';
import { CoverageEmpty } from '../CoverageEmpty.jsx';
import { LayerError } from './DestTabParts.jsx';
import { PlaceCardSkeletons } from '../PlaceCard.jsx';
import React from 'react';
import { bandBreak } from '../../lib/regions.js';
import { TripCard } from '../DestCards.jsx';
import { Button } from '../../components/ui/index.js';
import { stripDashes } from '../../lib/format.js';

export function TrailTripList({
  bedFood, cat, chipsEmpty, clearTrailFilters, country, countryEmpty, countryName, facetEmpty,
  fmt, layerError, nearNoCountry, nearPlace, openNeighbour, pickCountry, radiusEmpty,
  retryLayer, sentinelRef, setCountry, setNearPlace, setPageCard, setPageStub, setQuery,
  setStubsAll, showCountryIndex, showTripRows, stubs, stubsAll, t, trailFiltersOn,
  trailsCountry, trailsIndex, trailsLoading, tripCountries, tripRows, visible,
}) {
  return (
    <div className={`places-list${showCountryIndex ? ' dtab-trail-index' : ' pcard-grid'}`}>
      {showCountryIndex && (
        <>
          {/* The near-me door moved up into the section head (T430). */}
          {/* T451: a track like every other section's "By country", not a
              grid of forty galleries that ran fourteen thousand pixels. */}
          {tripCountries.length > 0 && (
            <Strip id="dtab-trail-countries" title={t('dtab.chooseCountry')} t={t} className="dtab-bycountry">
              {tripCountries.map((c) => (
                <li key={c.cc} className="dtab-item dtab-item-country">
                  <CountryGalleryCard
                    cc={c.cc}
                    name={c.name}
                    onPick={pickCountry}
                    t={t}
                    href={`?tab=places&dc=${cat}&dn=${c.cc}`}
                    sizes="(max-width: 768px) 80vw, 320px"
                  />
                </li>
              ))}
            </Strip>
          )}
          {trailsIndex && tripCountries.length === 0 && (
            <CoverageEmpty layer="trail" cc="" countryName={countryName} onOpen={openNeighbour} />
          )}
        </>
      )}

      {!showCountryIndex && layerError.trails && (
        <LayerError onRetry={() => retryLayer('trails')} t={t} msg="trails.loadFailed" />
      )}

      {!showCountryIndex && trailsLoading && !layerError.trails && <PlaceCardSkeletons label={t('card.loading')} />}

      {!showCountryIndex && !trailsLoading && tripRows && (
        tripRows.length > 0
          ? tripRows.slice(0, visible).map(({ c, km }, i) => (
            <React.Fragment key={c.tr.id}>
              {bandBreak(tripRows, i) && (
                <p className="places-bandhead">{t(bandBreak(tripRows, i))}</p>
              )}
              <TripCard card={c} km={km} onOpen={setPageCard} t={t} countryName={countryName}
                base={cat === 'trails' ? bedFood('trails', c) : null} />
            </React.Fragment>
          ))
          : trailFiltersOn
            ? facetEmpty('trail', clearTrailFilters)
            : cat !== 'trails'
              ? (nearPlace
                ? chipsEmpty('places.noneNear', () => setNearPlace(null), 'cov.showAll', { city: nearPlace.name })
                : (
                  <div className="places-empty empty-act">
                    <p>{t('places.cityWalksEmpty', { country: countryName(trailsCountry || country) })}</p>
                    <Button variant="secondary" size="sm" className="cov-empty-btn" onClick={() => { setQuery(''); setCountry(''); }}>
                      {t('cov.showAll')}
                    </Button>
                  </div>
                ))
              : nearPlace
                ? radiusEmpty('trail')
                : countryEmpty('trail', trailsCountry || country)
      )}

      {!showCountryIndex && !trailsLoading && !tripRows && nearNoCountry
        && !layerError.trails && (
        cat === 'trails'
          ? radiusEmpty('trail')
          : chipsEmpty('places.noneNear', () => setNearPlace(null), 'cov.showAll', { city: nearPlace.name })
      )}

      {!showCountryIndex && visible < (tripRows?.length ?? 0) && (
        <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
      )}

      {showTripRows && (
        <>
          {stubs.length > 0 && (
            <div className="stub-list" data-testid="stub-list">
              <h2 className="stub-list-head">{t('stub.listHead')}</h2>
              <ul>
                {(stubsAll ? stubs : stubs.slice(0, 6)).map((st) => (
                  <li key={st.id}>
                    <button type="button" className="stub-row" onClick={() => setPageStub(st)}>
                      <span className="stub-row-name">{stripDashes(st.name)}</span>
                      <span className="stub-row-meta">
                        {st.region ? `${st.region}` : ''}
                        {Number.isFinite(st.km) && (
                          <span className="mono">{st.region ? ' ' : ''}{fmt(Math.round(st.km))} km</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {!stubsAll && stubs.length > 6 && (
                <Button variant="quiet" size="sm" className="stub-more" onClick={() => setStubsAll(true)}>
                  {t('stub.showAll')}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
