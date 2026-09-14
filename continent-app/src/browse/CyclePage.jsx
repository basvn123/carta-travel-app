import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useI18n } from '../i18n/index.jsx';
import { count } from '../lib/format.js';
import { NearbyOutdoors } from './NearbyOutdoors.jsx';
import { loadCycling } from '../lib/cycling.js';
import { loadCycleFamily, loadCycleRoute, loadCycleTour, gpxCredit }
  from '../lib/cycling.js';
import {
  agreementLine, bailoutLine, bikeLine, countryPhrase, cycleRating, listedLine,
  overnightLine, paceLine, routeTitle, safetyLine, seasonLine, stageLine,
  surfaceLine, trafficFreeLine, whyLines,
} from '../lib/cycleStory.js';
import { RatingBadge } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import {
  ArrowLeftIcon, CameraIcon, BikeIcon, TrainIcon, ClockIcon,
} from '../components/Icons.jsx';

/**
 * The cycling page: one route, or one tour composed over routes.
 *
 * A TOUR is the thing worth opening, and this page is built around the
 * question a tour has to answer that no incumbent answers: what is each day,
 * where does it end, and is there a bed there. So the stage list is not a
 * summary underneath the photograph, it is the page. Every figure on it was
 * measured on that day's own slice of the route, not inherited from the route
 * as a whole, which is why "day three is 84 km with 620 m of climbing, ending
 * at Kinlochleven where fourteen places take a booking, and the nearest
 * station is 18 km away" is a sentence this app can write and a generated
 * itinerary cannot.
 *
 * A ROUTE is the catalogue entry underneath: the line, what it is surfaced
 * with, how much traffic is on it, where it climbs, which towns it passes
 * with a bed or a tap, and whether the official source draws the same line
 * we do.
 *
 * Three things this page is careful about.
 *
 *   A listed route has no score, so there is no score chip and no scenic
 *   figure, and the card says why in one line. The wire omits the key; this
 *   never invents one back (invariant 9).
 *
 *   The GPX carries its own credit. A rendered map is a produced work and may
 *   be licensed freely; a GPX export is a database extract and ODbL travels
 *   with it, so the download writes the attribution into the file's own
 *   <copyright> and <desc> rather than relying on a footer somewhere else.
 *
 *   The safety figure is named as a house measure out loud. The ECF's own
 *   OSM-based methodology computes infrastructure ratios and deliberately
 *   declines to define a safety score, so there is no standard being claimed.
 *
 * The route is drawn on a real map, the same lazy maplibre the trail page
 * uses. This whole file is a lazy chunk, so the library loads only when a
 * route is actually opened and never on the list. A cycle route is a line on
 * terrain, and the inline sketch of its shape that used to sit here said
 * nothing about where it went.
 */

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// The month names the mountain layer already ships in all six languages.
// A seventh copy of "January" would only be a seventh thing to translate.
const MONTHS = ['mtn.monthJan', 'mtn.monthFeb', 'mtn.monthMar', 'mtn.monthApr',
  'mtn.monthMay', 'mtn.monthJun', 'mtn.monthJul', 'mtn.monthAug',
  'mtn.monthSep', 'mtn.monthOct', 'mtn.monthNov', 'mtn.monthDec'];

/** A design token as a concrete colour: MapLibre paint properties cannot read
 *  a CSS variable, and the route should not carry its own private palette. */
function token(name, fallback) {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** The line parts of a GeoJSON geometry, each a list of [lon, lat]. */
function geometryParts(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'MultiLineString') return geometry.coordinates || [];
  if (geometry.type === 'LineString') return [geometry.coordinates || []];
  return [];
}

const finitePair = ([x, y]) => Number.isFinite(x) && Number.isFinite(y);

/**
 * The map. Created once per mount and left alone; the line, the two end
 * pins and the framing are redrawn whenever the geometry arrives or changes.
 * A NaN anywhere in a coordinate crashes maplibre outright, so every part is
 * filtered before it reaches the source.
 */
function useRouteMap(mapEl, geometry, bbox) {
  const mapRef = useRef(null);

  useEffect(() => {
    if (mapRef.current || !mapEl.current) return undefined;
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: MAP_STYLE,
      center: [12, 48],
      zoom: 4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      const empty = { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [] } };
      map.addSource('cycle', { type: 'geojson', data: empty });
      map.addLayer({
        id: 'cycle-casing', type: 'line', source: 'cycle',
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'cycle-line', type: 'line', source: 'cycle',
        paint: { 'line-color': token('--accent', '#e05a47'), 'line-width': 3.4 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.resize();
      map._cycleReady = true;
      if (map._draw) map._draw();
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [mapEl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const parts = geometryParts(geometry)
      .filter((p) => Array.isArray(p) && p.length > 1 && p.every(finitePair));
    const draw = () => {
      const src = map.getSource('cycle');
      if (src) {
        src.setData({
          type: 'Feature', properties: {},
          geometry: { type: 'MultiLineString', coordinates: parts },
        });
      }
      for (const m of map._cycleMarkers || []) m.remove();
      map._cycleMarkers = [];
      if (parts.length) {
        const first = parts[0][0];
        const lastPart = parts[parts.length - 1];
        const last = lastPart[lastPart.length - 1];
        // The pin is styled on an INNER child: maplibre owns the marker
        // element's transform and clobbers anything set on it directly.
        for (const [lngLat, cls] of [[first, 'cycle-map-pin'], [last, 'cycle-map-pin end']]) {
          const el = document.createElement('div');
          const dot = document.createElement('span');
          dot.className = cls;
          el.appendChild(dot);
          map._cycleMarkers.push(
            new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map),
          );
        }
      }
      let [w, s, e, n] = Array.isArray(bbox) ? bbox : [];
      if (![w, s, e, n].every(Number.isFinite) && parts.length) {
        w = Infinity; s = Infinity; e = -Infinity; n = -Infinity;
        for (const part of parts) {
          for (const [x, y] of part) {
            if (x < w) w = x;
            if (x > e) e = x;
            if (y < s) s = y;
            if (y > n) n = y;
          }
        }
      }
      if ([w, s, e, n].every(Number.isFinite)) {
        map.fitBounds([[w, s], [e, n]], { padding: 36, duration: 0, maxZoom: 13 });
      }
    };
    map._draw = draw;
    if (map._cycleReady) draw();
  }, [geometry, bbox]);
}

/** The elevation profile, the same instrument chart the trail page draws. */
function ElevationChart({ elevation, t }) {
  const profile = elevation && elevation.profile;
  if (!Array.isArray(profile) || profile.length < 2) return null;
  const W = 320; const H = 84; const PAD = 2;
  const dMax = profile[profile.length - 1][0] || 1;
  let eMin = elevation.ele_min_m;
  let eMax = elevation.ele_max_m;
  if (!Number.isFinite(eMin) || !Number.isFinite(eMax)) {
    eMin = Infinity; eMax = -Infinity;
    for (const p of profile) {
      if (p[1] < eMin) eMin = p[1];
      if (p[1] > eMax) eMax = p[1];
    }
  }
  const span = Math.max(1, eMax - eMin);
  const x = (d) => PAD + Math.min(1, d / dMax) * (W - 2 * PAD);
  const y = (e) => H - PAD - ((e - eMin) / span) * (H - 2 * PAD);
  const pts = profile.map(([d, e]) => `${x(d).toFixed(1)},${y(e).toFixed(1)}`);
  return (
    <div className="tpage-elev cycle-elev" data-testid="cycle-elev">
      <svg viewBox={`0 0 ${W} ${H}`} className="tpage-elev-svg" role="img"
        aria-label={t('cycle.elevTitle')} preserveAspectRatio="none">
        <polyline points={`${PAD},${H - PAD} ${pts.join(' ')} ${W - PAD},${H - PAD}`} className="tpage-elev-area" />
        <polyline points={pts.join(' ')} className="tpage-elev-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="tpage-elev-axis">
        <span>{Math.round(eMin)} m</span>
        <span>{Math.round(eMax)} m {t('cycle.elevMax')}</span>
      </div>
    </div>
  );
}

/**
 * The towns the line passes, with what each one has. The pipeline positions
 * every service town along the route (`at_m`), so this reads in riding
 * order. A long route can pass sixty towns; a dozen spread along it is what
 * fits on a phone, always keeping the last one so the end is named.
 */
function Towns({ services, t }) {
  const rows = (services || [])
    .filter((s) => s && s.name && (
      (s.sleep || 0) > 0 || s.station || (s.shop || 0) > 0
      || (s.water || 0) > 0 || s.camp))
    .sort((a, b) => (a.at_m || 0) - (b.at_m || 0));
  if (!rows.length) return null;
  const MAX = 12;
  const step = Math.ceil(rows.length / MAX);
  const shown = rows.length > MAX
    ? rows.filter((_, i) => i % step === 0 || i === rows.length - 1)
    : rows;
  return (
    <ul className="cycle-towns" data-testid="cycle-towns">
      {shown.map((s) => {
        const has = [
          (s.sleep || 0) > 0 && t('cycle.townBeds', { n: s.sleep }),
          s.camp && t('cycle.townCamp'),
          (s.shop || 0) > 0 && t('cycle.townShop'),
          (s.water || 0) > 0 && t('cycle.townWater'),
          s.station && t('cycle.townStation'),
        ].filter(Boolean);
        return (
          <li key={`${s.name}-${s.at_m}`} className="cycle-town">
            <span className="cycle-town-km">
              {t('cycle.atKm', { km: Math.round((s.at_m || 0) / 1000) })}
            </span>
            <span className="cycle-town-name">{s.name}</span>
            <span className="cycle-town-has">{has.join(', ')}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Build a GPX with the credit inside the file, and hand it to the browser. */
function downloadGpx(route, name) {
  const credit = gpxCredit(route);
  const parts = geometryParts(route.osm && route.osm.geometry);
  if (!parts.length) return;
  const esc = (s) => String(s || '').replace(/[<>&]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const segs = parts.map((part) => (
    `  <trkseg>\n${part
      .map(([lon, lat]) => `   <trkpt lat="${lat}" lon="${lon}"/>`)
      .join('\n')}\n  </trkseg>`
  )).join('\n');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Carta" xmlns="http://www.topografix.com/GPX/1/1">
 <metadata>
  <name>${esc(name)}</name>
  <desc>${esc(credit.author)}</desc>
  <copyright author="${esc(credit.author)}">
   ${credit.licenseUrl ? `<license>${esc(credit.licenseUrl)}</license>` : ''}
  </copyright>
 </metadata>
 <trk>
  <name>${esc(name)}</name>
  <desc>${esc(credit.author)}</desc>
${segs}
 </trk>
</gpx>`;
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(name || 'route').replace(/[^\w-]+/g, '_')}.gpx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function Photos({ images }) {
  if (!images || !images.length) return null;
  return (
    <div className="cycle-gallery" data-testid="cycle-gallery">
      {images.slice(0, 6).map((img) => (
        <figure key={img.url} className="cycle-shot">
          <img src={img.thumb || img.url} alt={img.title || ''} loading="lazy" />
          <figcaption>
            <CameraIcon size={12} />
            {' '}
            {[img.author, img.license].filter(Boolean).join(', ')}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function Stages({ stages, t }) {
  if (!stages || !stages.length) return null;
  return (
    <ol className="cycle-stages" data-testid="cycle-stages">
      {stages.map((s) => (
        <li key={s.d} className="cycle-stage" data-testid="cycle-stage">
          <p className="cycle-stage-day">{t('cycle.dayN', { n: s.d })}</p>
          <p className="cycle-stage-line">{stageLine(s, t)}</p>
          <p className="cycle-stage-sleep">{overnightLine(s.to, t)}</p>
          <p className="cycle-stage-meta">
            {[
              s.paved_share != null
                && `${Math.round(s.paved_share * 100)}% ${t('cycle.surfaceAllPaved').toLowerCase()}`,
              s.traffic_free_share != null
                && trafficFreeLine({ traffic_free_share: s.traffic_free_share }, t),
              s.safety != null && safetyLine({ score: s.safety, known_share: 1 }, t),
            ].filter(Boolean).join(', ')}
          </p>
          <p className="cycle-stage-bail">
            <TrainIcon size={12} />
            {' '}
            {bailoutLine(s.bailout, t)}
          </p>
        </li>
      ))}
    </ol>
  );
}

/**
 * A EUROVELO FAMILY is its own kind of page and therefore its own component.
 * In OSM a EuroVelo is one relation PER COUNTRY SECTION under a superroute,
 * so this is a manifest of the sections that make one continental route up,
 * not a route: there is no geometry to draw, no score, and none of the route
 * page's hooks apply. Folding it into CyclePage as an early return broke the
 * rules of hooks, which was the design telling us it is a different thing.
 *
 * A published section is a door: it opens the route page underneath, which
 * is the only way the manifest earns its place on a list.
 */
export function CycleFamilyPage({ familyRef, onClose, onOpenRoute }) {
  const { t } = useI18n();
  const [family, setFamily] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    loadCycleFamily(familyRef).then((got) => {
      if (!live) return;
      setFamily(got);
      setLoading(false);
    });
    return () => { live = false; };
  }, [familyRef]);

  return (
    <div className="cycle-page" data-testid="cycle-family-page">
      <div className="cycle-inner">
        <header className="cycle-head">
          <button type="button" className="cycle-back" onClick={onClose}
            aria-label={t('common.close')}>
            <ArrowLeftIcon size={16} />
          </button>
          <div className="cycle-title">
            <h1>{(family && family.ref) || familyRef}</h1>
            {family && (
              <p className="cycle-sub">
                {t('cycle.familySummary', {
                  km: count(family.km),
                  sections: family.n_sections,
                  countries: countryPhrase((family.countries || []).length, t),
                })}
              </p>
            )}
          </div>
        </header>
        {loading && <p className="places-empty">{'…'}</p>}
        {!loading && !family && <p className="places-empty">{t('cycle.familyGone')}</p>}
        {!loading && family && (
          <>
            {family.ecf_agreement != null && (
              <p className="cycle-note">
                {t('cycle.familyEcf',
                   { pct: Math.round(family.ecf_agreement * 100) })}
              </p>
            )}
            <p className="places-bandhead">{t('cycle.familySections')}</p>
            <ul className="cycle-famlist">
              {(family.sections || []).map((sec) => {
                const inner = (
                  <>
                    <CountryFlag country={sec.cc} size={14} />
                    <span className="cycle-famitem-name">
                      {sec.name || `${sec.cc} ${sec.km} km`}
                    </span>
                    <span className="cycle-famitem-km">{sec.km} km</span>
                    {!sec.published && (
                      <span className="cycle-famitem-un">
                        {t('cycle.familyUnpublished')}
                      </span>
                    )}
                  </>
                );
                return sec.published && onOpenRoute ? (
                  <li key={sec.id} className="cycle-famitem cycle-famitem-open">
                    <button type="button" className="cycle-famitem-btn"
                      data-testid="cycle-famitem-open"
                      onClick={() => onOpenRoute(sec)}>
                      {inner}
                    </button>
                  </li>
                ) : (
                  <li key={sec.id} className="cycle-famitem">{inner}</li>
                );
              })}
            </ul>
            <p className="cycle-credit">{family.attribution}</p>
          </>
        )}
      </div>
    </div>
  );
}


export function CyclePage({ routeId, tourSlug, country, countryName,
                            onClose, onOpenNeighbour }) {
  const { t } = useI18n();
  const [route, setRoute] = useState(null);
  const [tour, setTour] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const jobs = [
      tourSlug ? loadCycleTour(tourSlug) : Promise.resolve(null),
      routeId ? loadCycleRoute(routeId) : Promise.resolve(null),
    ];
    Promise.all(jobs).then(([gotTour, gotRoute]) => {
      if (!live) return;
      setTour(gotTour);
      // A tour opened on its own still wants its first route's surface and
      // credit, which is where the geometry and the licence actually live.
      if (!gotRoute && gotTour && (gotTour.routes || []).length) {
        loadCycleRoute(gotTour.routes[0]).then((r) => { if (live) setRoute(r); });
      } else {
        setRoute(gotRoute);
      }
      setLoading(false);
    });
    return () => { live = false; };
  }, [routeId, tourSlug]);

  // The country-file row carries the cross-layer nb ids; the detail file
  // does not. Cached fetch, usually already warm from the list the reader
  // came from.
  const [wireRow, setWireRow] = useState(null);
  useEffect(() => {
    let live = true;
    if (!country) { setWireRow(null); return undefined; }
    loadCycling(country).then((d) => {
      if (!live || !d) return;
      const want = tourSlug || routeId;
      const hit = tourSlug
        ? (d.tours || []).find((x) => x.slug === tourSlug)
        : [...d.routes, ...d.listed].find((x) => String(x.id) === String(routeId));
      if (hit && want) setWireRow(hit);
    });
    return () => { live = false; };
  }, [country, routeId, tourSlug]);

  const monthName = useMemo(() => (m) => t(MONTHS[(m - 1) % 12]), [t]);

  const carta = (route && route.carta) || {};
  const geometry = (tour && tour.geometry)
    || (route && route.osm && route.osm.geometry) || null;
  const bbox = (tour && tour.bbox) || (route && route.bbox) || null;
  const mapEl = useRef(null);
  useRouteMap(mapEl, geometry, bbox);

  const why = useMemo(() => whyLines(carta.reasons, t), [carta.reasons, t]);
  const rated = Boolean(route && route.t === 'r');
  const rating = rated && carta.score != null
    ? cycleRating({ score: carta.score }, t) : null;
  const title = (tour && tour.title) || (route && routeTitle(route, t)) || '…';
  const cc = (tour && tour.country) || (route && route.country) || country;
  // The ref is worth a word under the title unless the title IS the ref,
  // which is what a route with no name of its own gets.
  const refLine = route && route.ref && !String(title).includes(route.ref)
    ? `, ${route.ref}` : '';

  return (
    <div className="cycle-page" data-testid="cycle-page">
      <div className="cycle-inner">
        <header className="cycle-head">
          <button type="button" className="cycle-back" onClick={onClose}
            aria-label={t('common.close')}>
            <ArrowLeftIcon size={16} />
          </button>
          <div className="cycle-title">
            <h1 data-testid="cycle-name">{title}</h1>
            <p className="cycle-sub">
              <CountryFlag country={cc} size={15} />
              {' '}
              {countryName}
              {refLine}
            </p>
          </div>
          {rating && (
            <span data-testid="cycle-score">
              <RatingBadge rating={rating} size="lg" showGem={false} />
            </span>
          )}
        </header>

        {loading && <p className="places-empty">{'…'}</p>}

        {!loading && !route && !tour && (
          <p className="places-empty">{t('cycle.emptyCountry')}</p>
        )}

        <div ref={mapEl} className="cycle-map" data-testid="cycle-map"
          role="img" aria-label={t('cycle.mapLabel')} />

        {tour && (
          <section className="cycle-tour" data-testid="cycle-tour">
            <p className="cycle-facts">
              <ClockIcon size={13} />
              {' '}
              {t('cycle.days', { n: tour.days })}
              {', '}
              {`${Math.round(tour.km)} km`}
              {tour.asc != null ? `, ${tour.asc} m` : ''}
            </p>
            <p className="cycle-pace">{paceLine(tour.pace, t)}</p>
            <p className="cycle-bike">
              <BikeIcon size={13} />
              {' '}
              {bikeLine(tour.bike, t)}
            </p>
            {seasonLine(tour.season, t, monthName) && (
              <p className="cycle-season" data-testid="cycle-season">
                {seasonLine(tour.season, t, monthName)}
              </p>
            )}
            <h2>{t('cycle.stagesTitle')}</h2>
            <Stages stages={tour.stages} t={t} />
            {tour.checks && (
              <details className="cycle-checks" data-testid="cycle-checks">
                <summary>{t('cycle.checksTitle')}</summary>
                <p>{t('cycle.checksNote')}</p>
                <ul>
                  {(tour.checks.passed || []).map((c) => <li key={c}>{c}</li>)}
                </ul>
              </details>
            )}

            {/* A tour has to be able to show the ride: four photographs are
                one of the ten checks it passed to get here, drawn from the
                routes it rides and ordered along them. */}
            <Photos images={tour.images} />
          </section>
        )}

        {route && (
          <section className="cycle-route" data-testid="cycle-route">
            <p className="cycle-facts" data-testid="cycle-route-facts">
              {route.km != null && <span>{`${route.km} km`}</span>}
              {route.asc != null && <span>{`${route.asc} m`}</span>}
              {carta.surface && carta.surface.bike && (
                <span>{bikeLine(carta.surface.bike, t)}</span>
              )}
            </p>
            {!rated && <p className="cycle-unrated">{listedLine(t)}</p>}

            {carta.elevation && Array.isArray(carta.elevation.profile)
              && carta.elevation.profile.length > 1 && (
              <>
                <h2>{t('cycle.elevTitle')}</h2>
                <ElevationChart elevation={carta.elevation} t={t} />
              </>
            )}

            {why.length > 0 && (
              <>
                <h2>{t('cycle.whyTitle')}</h2>
                <ul className="cycle-why" data-testid="cycle-why">
                  {why.map((line) => <li key={line.text}>{line.text}</li>)}
                </ul>
              </>
            )}

            <h2>{t('cycle.safetyTitle')}</h2>
            <p className="cycle-surface" data-testid="cycle-surface">
              {surfaceLine(carta.surface, t)}
            </p>
            {trafficFreeLine(carta.surface, t) && (
              <p className="cycle-free">{trafficFreeLine(carta.surface, t)}</p>
            )}
            <p className="cycle-safety" data-testid="cycle-safety">
              {safetyLine(carta.safety, t)}
            </p>
            <p className="cycle-safety-note">{t('cycle.safetyHouse')}</p>
            {agreementLine(carta.agreement, t) && (
              <p className="cycle-agree" data-testid="cycle-agree">
                {agreementLine(carta.agreement, t)}
              </p>
            )}

            {Array.isArray(carta.services) && carta.services.length > 0 && (
              <>
                <h2>{t('cycle.townsTitle')}</h2>
                <Towns services={carta.services} t={t} />
              </>
            )}

            <Photos images={carta.images} />

            <button type="button" className="cycle-gpx" data-testid="cycle-gpx"
              onClick={() => downloadGpx(route, title)}>
              {t('cycle.gpx')}
            </button>
            {wireRow && (
              <NearbyOutdoors
                row={wireRow}
                cc={country}
                headings={{ trail: 'nb.cycle.trail', peak: 'nb.cycle.peak', lake: 'nb.cycle.lake', beach: 'nb.cycle.beach' }}
                onOpen={onOpenNeighbour}
              />
            )}

            {/* One credit line. The wire's own attribution is the specific
                one (it names the source that supplied this route);
                cycle.sourceNote is the generic fallback. */}
            <p className="places-credit" data-testid="cycle-credit">
              {(route.osm && route.osm.attribution) || t('cycle.sourceNote')}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

export default CyclePage;
