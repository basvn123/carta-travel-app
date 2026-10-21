import React from 'react';
import { Card, Tabs } from '../components/ui/index.js';
import { MapPinIcon } from '../components/Icons.jsx';
import { mapsSearchUrl } from '../lib/destInfo.js';
import { scrollBehavior } from '../lib/motion.js';
import { FeaturePhoto } from './AroundHere.jsx';
import RoutesFromHere from './RoutesFromHere.jsx';
import { MemberPlaces } from './MemberPlaces.jsx';
import { DestTrack } from './DestTrack.jsx';
import { Section, DoTile, DoList, OutdoorTile, TripTile } from './DestTiles.jsx';
import { EmptyKinds } from './DestOverview.jsx';
import { fmtKm, thumb500 } from './destParts.js';

const DestMap = React.lazy(() => import('./DestMap.jsx'));

/**
 * The destination page's Nearby tab (T499, roadmap 1.4): the full list
 * behind every "See all" on the Overview. The map with its layers and the
 * highlights under it, every thing to do, one track per kind of outdoor
 * place in reach, the waymarked routes from here, the day trips and the
 * villages inside an area. Moved from DestinationPage.jsx (T429, T446), not
 * rewritten; the outdoor track that mixed every kind became one track per
 * kind, the same categories as the Overview's chips.
 */
export function DestNearby({ p }) {
  const {
    t, lang, city, lat, lon, highlights, tripsForMap, nearbyForMap, aroundForMap,
    doRows, doTrack, doList, cats, routeRows, hasRoutes, members, memberFocus,
    monthList, onOpenFeature, onSelect, onOpenItin, scrollRef,
  } = p;
  const mapRef = React.useRef(null);
  const mapSlotRef = React.useRef(null);
  const [mapLayer, setMapLayer] = React.useState('highlights');
  // The map mounts when its slot comes near the view (T429): it would
  // otherwise hold a WebGL context for a view nobody has scrolled to. Until
  // then a still block of the same size holds its place.
  const [mapOn, setMapOn] = React.useState(false);
  // The committed highlight (a click or tap on a tile or its pin) and the one
  // under the pointer or in focus: carta-design "Map and list in sync" (T395).
  const [hlFocus, setHlFocus] = React.useState(null);
  const [hlHover, setHlHover] = React.useState(null);

  React.useEffect(() => {
    if (mapOn) return undefined;
    const el = mapSlotRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver !== 'function') { setMapOn(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setMapOn(true); io.disconnect(); }
    }, { root: scrollRef.current, rootMargin: '300px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [mapOn, scrollRef]);

  const layerChoices = [
    { id: 'highlights', label: t('dest.layer.highlights'), n: highlights.length },
    { id: 'around', label: t('dest.layer.around'), n: aroundForMap.length },
    { id: 'trips', label: t('dest.layer.trips'), n: tripsForMap.length },
  ].filter((c) => c.n > 0);
  const effectiveLayer = layerChoices.some((c) => c.id === mapLayer) ? mapLayer
    : mapLayer === 'nearby' && nearbyForMap.length ? 'nearby' : 'highlights';
  const hasMap = highlights.length > 0 || (lat != null && lon != null);
  const outdoorCats = cats.filter((c) => c.key !== 'trips' && c.count > 0);
  const trips = cats.find((c) => c.key === 'trips');

  return (
    <>
      {hasMap && (
        <Section id="highlights" className="dsec2-map">
          <div className="dsec2-head">
            <h2 className="dsec2-title" id="h-highlights">{t('dest.mapTitleV')}</h2>
            {layerChoices.length > 1 && (
              <Tabs
                label={t('dest.mapTitle')}
                tabs={layerChoices}
                value={effectiveLayer}
                onChange={setMapLayer}
                className="destp-layers"
              />
            )}
          </div>
          <div className="dmap-slot" ref={mapSlotRef}>
            {mapOn ? (
              <React.Suspense fallback={<div className="place-map place-map-wait dmap" />}>
                <DestMap
                  ref={mapRef}
                  place={{ lat, lon, name: city }}
                  highlights={highlights}
                  trips={tripsForMap}
                  nearby={nearbyForMap}
                  around={aroundForMap}
                  active={effectiveLayer}
                  focus={hlFocus}
                  hover={hlHover}
                  onHoverHighlight={setHlHover}
                  height={320}
                  onPickTrip={(row) => onSelect?.(row.id)}
                  onPickFeature={(layer, row) => onOpenFeature?.(layer, row)}
                  onPickHighlight={(i) => {
                    setHlFocus(i);
                    requestAnimationFrame(() => {
                      scrollRef.current?.querySelector?.(`#hl-${i}`)
                        ?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest', inline: 'center' });
                    });
                  }}
                />
              </React.Suspense>
            ) : <div className="place-map place-map-wait dmap" />}
          </div>
          {highlights.length > 0 && (
            <DestTrack
              id="h-hl"
              level={3}
              title={t('dest.layer.highlights')}
              items={highlights.slice(0, 16).map((h, i) => ({ ...h, key: h.id || String(i) }))}
              t={t}
              render={(h, i) => (
                <Card
                  layout="tile"
                  id={`hl-${i}`}
                  className={`dhl2${hlFocus === i ? ' is-focus' : ''}${hlHover === i ? ' is-hover' : ''}`}
                  selected={hlFocus === i}
                  onMouseEnter={() => setHlHover(i)}
                  onMouseLeave={() => setHlHover((cur) => (cur === i ? null : cur))}
                  onFocus={() => setHlHover(i)}
                  onBlur={() => setHlHover((cur) => (cur === i ? null : cur))}
                  media={<FeaturePhoto src={thumb500(h.image?.url)} lat={h.lat} lon={h.lon} />}
                  title={(
                    <>
                      <span className="dhl2-n" aria-hidden="true">{i + 1}</span>
                      {h.name}
                    </>
                  )}
                  onOpen={() => { setHlFocus(i); setMapLayer('highlights'); }}
                  meta={(
                    <span className="dtile-meta">
                      {h.kind && lang === 'en' && <span>{h.kind}</span>}
                      {h.dist_km != null && <span>{fmtKm(h.dist_km)}</span>}
                    </span>
                  )}
                />
              )}
            />
          )}
          {lat != null && lon != null && (
            <a className="destp-exit destp-maps-link" href={mapsSearchUrl(lat, lon)} target="_blank" rel="noreferrer">
              <MapPinIcon size={16} />
              <span>{t('explore.openMaps')}</span>
            </a>
          )}
        </Section>
      )}

      {doRows.length > 0 && (
        <Section id="do" title={doTrack.length ? null : t('dest.doTitle')}>
          {doTrack.length > 0 && (
            <DestTrack
              id="h-do"
              title={t('dest.doTitle')}
              items={doTrack}
              t={t}
              render={(item) => <DoTile item={item} t={t} monthList={monthList} onOpenFeature={onOpenFeature} />}
            />
          )}
          <DoList items={doList} t={t} monthList={monthList} onOpenFeature={onOpenFeature} />
        </Section>
      )}

      {/* One track per kind in reach, in the Overview's order (walks first,
          hikers first, PRODUCT.md). */}
      {outdoorCats.map((c) => (
        <section className="dsec2" id={`sec-around-${c.key}`} key={c.key} aria-labelledby={`h-around-${c.key}`}>
          <DestTrack
            id={`h-around-${c.key}`}
            title={t(`dest.aroundKind.${c.key}`)}
            items={c.rows}
            t={t}
            render={(f) => <OutdoorTile f={f} t={t} onOpenFeature={onOpenFeature} />}
          />
        </section>
      ))}
      {(hasRoutes || p.emptyKinds.length > 0) && (
        <Section id="routes" title={outdoorCats.length ? null : t('dest.walkRideTitle')}>
          {hasRoutes && <RoutesFromHere routes={routeRows} t={t} onOpen={onOpenFeature} limit={3} brief credits={false} />}
          <EmptyKinds p={p} />
        </Section>
      )}

      {(trips?.count > 0 || members?.length > 0) && (
        <Section id="trips" title={trips?.count ? null : t('dest.tripsTitle')}>
          {trips?.count > 0 && (
            <section id="sec-around-trips" aria-labelledby="h-trips">
              <DestTrack
                id="h-trips"
                title={t('dest.tripsTitle')}
                items={trips.rows}
                t={t}
                render={(tr) => <TripTile tr={tr} t={t} onSelect={onSelect} onOpenItin={onOpenItin} />}
              />
            </section>
          )}
          {/* D7: the villages inside this area, from B1's members. */}
          {members?.length > 0 && (
            <div className="destp-villages">
              <h3 className="destp-subhead">{t('dest.membersInside', { city })}</h3>
              <MemberPlaces members={members} focusName={memberFocus} t={t} />
            </div>
          )}
        </Section>
      )}
    </>
  );
}
