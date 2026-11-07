import { LayerError } from './DestTabParts.jsx';
import { PlaceCardSkeletons } from '../PlaceCard.jsx';
import { CycleTourCard, CycleCard } from '../DestCards.jsx';
import { Button } from '../../components/ui/index.js';

export function CycleList({
  bedFood, countryEmpty, countryName, cycleFacets, cycleIndex, cycleRows, cycleShowLocal,
  cycleTotal, cycleWindow, cyclingLoading, facetEmpty, layerError, nearPlace, openCycleRoute,
  openCycleTour, queryEmpty, radiusEmpty, retryLayer, sentinelRef, setCycleFacets,
  setCycleShowLocal, setPageCycle, t, typedCc, visible, wantCycleCountry,
}) {
  return (
    <div className="places-list pcard-grid" data-testid="cycle-list">
      {layerError.cycling && (
        <LayerError onRetry={() => retryLayer('cycling')} t={t} msg="cycle.loadFailed" />
      )}

      {cyclingLoading && <PlaceCardSkeletons label={t('card.loading')} />}

      {/* EuroVelo families. In OSM a EuroVelo is one relation PER
          COUNTRY SECTION under a superroute, so without this band the
          catalogue shows "EuroVelo 6 part Germany 3" and never the
          6,308 km thing it belongs to. The manifest is the same
          membership the harvest stamps; the geometry stays in the
          per-route files. */}
      {!cyclingLoading && (cycleIndex?.families || []).length > 0 && (
        <>
          <p className="places-bandhead">{t('cycle.familiesTitle')}</p>
          <div className="cycle-famrow">
            {(cycleIndex.families || []).map((f) => (
              <button
                type="button"
                key={f.ref}
                className="cycle-famchip"
                data-testid="cycle-famchip"
                onClick={() => setPageCycle({ familyRef: f.ref })}
              >
                <span className="cycle-famchip-ref">{f.ref}</span>
                {/* The route's own name (T455). Its length and country
                    count were the sum of the sections Carta holds,
                    not the route, so they are not shown. */}
                {f.name && <span className="cycle-famchip-meta">{f.name}</span>}
              </button>
            ))}
          </div>
        </>
      )}

      {!cyclingLoading && cycleRows && (
        <>
          {cycleWindow.tours > 0 && (
            <>
              <p className="places-bandhead">{t('cycle.toursTitle')}</p>
              {cycleRows.tours.slice(0, cycleWindow.tours).map((tr) => (
                <CycleTourCard
                  key={tr.slug}
                  tr={tr}
                  t={t}
                  countryName={countryName(tr.cc || wantCycleCountry)}
                  onOpen={openCycleTour}
                />
              ))}
            </>
          )}

          {cycleWindow.routes > 0 && (
            <>
              <p className="places-bandhead">{t('cycle.routesTitle')}</p>
              {cycleRows.routes.slice(0, cycleWindow.routes).map((r) => (
                <CycleCard
                  key={r.id}
                  r={r}
                  t={t}
                  countryName={countryName(r.cc || wantCycleCountry)}
                  onOpen={openCycleRoute}
                  base={bedFood('cycling', r)}
                />
              ))}
            </>
          )}

          {cycleWindow.listed > 0 && (
            <>
              <p className="places-bandhead"
                data-testid="cycle-listed-head">
                {t('cycle.listedHeading')}
              </p>
              {cycleRows.listed.slice(0, cycleWindow.listed).map((r) => (
                <CycleCard
                  key={r.id}
                  r={r}
                  t={t}
                  countryName={countryName(r.cc || wantCycleCountry)}
                  onOpen={openCycleRoute}
                  base={bedFood('cycling', r)}
                />
              ))}
            </>
          )}

          {wantCycleCountry && (cycleRows.localHidden > 0 || cycleShowLocal) && (
            <Button
              variant="quiet"
              size="sm"
              className="cycle-localtoggle"
              data-testid="cycle-local-toggle"
              onClick={() => setCycleShowLocal((v) => !v)}
            >
              {cycleShowLocal
                ? t('cycle.hideLocal')
                : t('cycle.showLocal')}
            </Button>
          )}

          {!cycleRows.tours.length && !cycleRows.routes.length
            && !cycleRows.listed.length && !cycleRows.localHidden && (
            Object.values(cycleFacets).some((l) => l?.length)
              ? facetEmpty('cycle', () => setCycleFacets({}))
              : nearPlace
                ? radiusEmpty('cycling')
                : typedCc
                  ? countryEmpty('cycling', typedCc)
                  : queryEmpty('cycle.noneMatch')
          )}

          {visible < cycleTotal && (
            <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
          )}
        </>
      )}

      {!cyclingLoading && !cycleRows && !layerError.cycling && (
        <PlaceCardSkeletons label={t('card.loading')} />
      )}

    </div>
  );
}
