import { LayerError } from './DestTabParts.jsx';
import { PlaceCardSkeletons } from '../PlaceCard.jsx';
import React from 'react';
import { bandBreak } from '../../lib/regions.js';
import { BeachCard } from '../DestCards.jsx';

export function BeachList({
  beachFacets, beachRows, beachesLoading, bedFood, countryEmpty, countryName, facetEmpty,
  layerError, listedBeaches, nearPlace, queryEmpty, radiusEmpty, retryLayer, sentinelRef,
  setBeachFacets, setPageBeach, t, typedCc, visible, wantBeachCountry,
}) {
  return (
    <div className="places-list pcard-grid">
      {layerError.beaches && (
        <LayerError onRetry={() => retryLayer('beaches')} t={t} msg="beach.loadFailed" />
      )}

      {beachesLoading && <PlaceCardSkeletons label={t('card.loading')} />}

      {!beachesLoading && beachRows && (
        beachRows.length > 0
          ? (
            <>
              {beachRows.slice(0, visible).map(({ b, km }, i) => (
                <React.Fragment key={b.id}>
                  {bandBreak(beachRows, i) && (
                    <p className="places-bandhead">{t(bandBreak(beachRows, i))}</p>
                  )}
                  <BeachCard
                    beach={b}
                    km={km}
                    countryName={countryName(b.cc)}
                    onOpen={setPageBeach}
                    t={t}
                    base={bedFood('beaches', b)}
                  />
                </React.Fragment>
              ))}
              {/* The listed tier, under its own heading and never
                  interleaved: these rows carry no score key at all, so
                  they cannot be ranked and must not look as if they
                  were. Shown once the ranked list has run out, which is
                  where "what else is here" is the actual question, and
                  it is what keeps a stretch of coast from looking empty
                  because nobody has photographed it yet. */}
              {wantBeachCountry && !nearPlace
                && (listedBeaches[wantBeachCountry] || []).length > 0
                && beachRows.length <= visible && (
                <div className="places-alsohere">
                  <p className="places-beachhead">
                    {t('beach.alsoHead', {
                      country: countryName(wantBeachCountry),
                    })}
                  </p>
                  <ul className="places-listedrows">
                    {(listedBeaches[wantBeachCountry] || []).map((b) => (
                      <li key={b.id} className="places-listedrow">
                        <span className="places-listedrow-name">
                          {b.name}
                        </span>
                        {b.region && (
                          <span className="places-listedrow-ele">
                            {b.region}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )
          : Object.values(beachFacets).some((l) => l?.length)
            ? facetEmpty('beach', () => setBeachFacets({}))
            : nearPlace
              ? radiusEmpty('beach')
              : typedCc
                ? countryEmpty('beach', typedCc)
                : queryEmpty('beach.noneMatch')
      )}

      {/* Not loaded yet (the first frame, before the fetch starts): the
          same skeleton the fetch shows. A failed fetch is LayerError
          above, never a claim that the layer has not shipped. */}
      {!beachesLoading && !beachRows && !layerError.beaches && (
        <PlaceCardSkeletons label={t('card.loading')} />
      )}

      {visible < (beachRows?.length ?? 0) && (
        <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
      )}

    </div>
  );
}
