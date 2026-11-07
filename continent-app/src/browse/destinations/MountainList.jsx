import { LayerError } from './DestTabParts.jsx';
import { PlaceCardSkeletons } from '../PlaceCard.jsx';
import React from 'react';
import { bandBreak } from '../../lib/regions.js';
import { MountainCard } from '../DestCards.jsx';

export function MountainList({
  absentMountainCountry, bedFood, countryEmpty, countryName, facetEmpty, lang, layerError,
  listedMountains, mountainRows, mountainsLoading, mtnFacets, nearPlace, queryEmpty,
  radiusEmpty, retryLayer, sentinelRef, setMtnFacets, setPageMountain, t, typedCc, visible,
  wantMountainCountry,
}) {
  return (
    <div className="places-list pcard-grid">
      {layerError.mountains && (
        <LayerError onRetry={() => retryLayer('mountains')} t={t} msg="mtn.loadFailed" />
      )}

      {mountainsLoading && <PlaceCardSkeletons label={t('card.loading')} />}

      {!mountainsLoading && mountainRows && (
        mountainRows.length > 0
          ? (
            <>
              {/* The listed tier, under its own heading and never
                  inside the ranked list. These rows carry no score
                  key at all, so there is nothing to sort them by and
                  nothing to render as a rating: they say the mountain
                  exists, is named correctly and is in this region,
                  which is the honest answer where the gates could not
                  say more. */}
              {mountainRows.slice(0, visible).map(({ b, km }, i) => (
                <React.Fragment key={b.id}>
                  {bandBreak(mountainRows, i) && (
                    <p className="places-bandhead">{t(bandBreak(mountainRows, i))}</p>
                  )}
                  <MountainCard
                    mountain={b}
                    km={km}
                    countryName={countryName(b.cc)}
                    onOpen={setPageMountain}
                    t={t}
                    base={bedFood('mountains', b)}
                    lang={lang}
                  />
                </React.Fragment>
              ))}
              {wantMountainCountry && !nearPlace
                && (listedMountains[wantMountainCountry] || []).length > 0
                && mountainRows.length <= visible && (
                <div className="places-alsohere">
                  <p className="places-beachhead">
                    {t('mtn.alsoHead', {
                      country: countryName(wantMountainCountry),
                    })}
                  </p>
                  <ul className="places-listedrows">
                    {(listedMountains[wantMountainCountry] || [])
                      .map((m) => (
                        <li key={m.id} className="places-listedrow">
                          <span className="places-listedrow-name">
                            {m.name}
                          </span>
                          {m.ele != null && (
                            <span className="places-listedrow-ele">
                              {Math.round(m.ele).toLocaleString(lang)} m
                            </span>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </>
          )
          : Object.values(mtnFacets).some((l) => l?.length)
            ? facetEmpty('mountain', () => setMtnFacets({}))
            : nearPlace
              ? radiusEmpty('mountain')
              : (absentMountainCountry || typedCc)
                ? countryEmpty('mountain', absentMountainCountry || typedCc)
                : queryEmpty('mtn.noneMatch')
      )}

      {!mountainsLoading && !mountainRows && !layerError.mountains && (
        <PlaceCardSkeletons label={t('card.loading')} />
      )}

      {visible < (mountainRows?.length ?? 0) && (
        <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
      )}

    </div>
  );
}
