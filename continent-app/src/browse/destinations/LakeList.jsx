import { LayerError } from './DestTabParts.jsx';
import { PlaceCardSkeletons } from '../PlaceCard.jsx';
import React from 'react';
import { bandBreak } from '../../lib/regions.js';
import { LakeCard } from '../DestCards.jsx';

export function LakeList({
  absentLakeCountry, bedFood, countryEmpty, countryName, facetEmpty, lakeFacets, lakeIndex,
  lakeRows, lakesLoading, lang, layerError, listedLakes, nearPlace, queryEmpty, radiusEmpty,
  retryLayer, sentinelRef, setLakeFacets, setPageLake, t, travelMonth, typedCc, visible,
  wantLakeCountry,
}) {
  return (
    <div className="places-list pcard-grid">
      {layerError.lakes && (
        <LayerError onRetry={() => retryLayer('lakes')} t={t} msg="lake.loadFailed" />
      )}

      {lakesLoading && <PlaceCardSkeletons label={t('card.loading')} />}

      {!lakesLoading && lakeRows && (
        lakeRows.length > 0
          ? (
            <>
              {lakeRows.slice(0, visible).map(({ b, km }, i) => (
                <React.Fragment key={b.id}>
                  {bandBreak(lakeRows, i) && (
                    <p className="places-bandhead">{t(bandBreak(lakeRows, i))}</p>
                  )}
                  <LakeCard
                    lake={b}
                    km={km}
                    countryName={countryName(b.cc)}
                    onOpen={setPageLake}
                    t={t}
                    base={bedFood('lakes', b)}
                    month={travelMonth}
                    warmC={lakeIndex?.model?.warm_c ?? 18}
                    lang={lang}
                  />
                </React.Fragment>
              ))}
              {/* The listed tier, under its own heading and never
                  interleaved: these rows carry no score key at all, so
                  they cannot be ranked and must not look as if they
                  were. Shown once the ranked list has run out, which is
                  where "what else is here" is the actual question. */}
              {wantLakeCountry && !nearPlace
                && (listedLakes[wantLakeCountry] || []).length > 0
                && lakeRows.length <= visible && (
                <div className="places-alsohere">
                  <p className="places-beachhead">
                    {t('lake.alsoHead', {
                      country: countryName(wantLakeCountry),
                    })}
                  </p>
                  <ul className="places-listedrows">
                    {(listedLakes[wantLakeCountry] || []).map((l) => (
                      <li key={l.id} className="places-listedrow">
                        <span className="places-listedrow-name">
                          {l.name}
                        </span>
                        {l.region && (
                          <span className="places-listedrow-ele">
                            {l.region}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )
          : Object.values(lakeFacets).some((l) => l?.length)
            ? facetEmpty('lake', () => setLakeFacets({}))
            : nearPlace
              ? radiusEmpty('lake')
              : (absentLakeCountry || typedCc)
                ? countryEmpty('lake', absentLakeCountry || typedCc)
                : queryEmpty('lake.noneMatch')
      )}

      {!lakesLoading && !lakeRows && !layerError.lakes && (
        <PlaceCardSkeletons label={t('card.loading')} />
      )}

      {visible < (lakeRows?.length ?? 0) && (
        <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
      )}

    </div>
  );
}
