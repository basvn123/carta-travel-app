import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../styles/items.css';
import { ReportProblem } from '../components/ReportProblem.jsx';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useI18n } from '../i18n/index.jsx';
import { tokenColour as token } from '../map/tokenColors.js';
import { MapSketch } from './DetailSkeleton.jsx';
import { routePoints, routeLength, nearestOnRoute } from '../lib/trailGeo.js';
import { pointAlong } from '../lib/signature.js';
import { usePlaceExits } from '../hooks/usePlaceExits.js';
import { keyFactCells, bboxCentre, cycleLevel, markMapLive, capFirst } from '../lib/detailSkeleton.js';
import {
  trailheadDirectionsUrl, shareTrailLink, cycleGpx, cycleFileBase, lineParts,
  splitTourByStages, shareOrDownloadFile,
} from '../lib/trailExport.js';
import { NearbyOutdoors } from './NearbyOutdoors.jsx';
import { loadCycling } from '../lib/cycling.js';
import { loadCycleFamily, loadCycleRoute, loadCycleTour, gpxCredit }
  from '../lib/cycling.js';
import {
  bailoutLine, bikeLine, cycleRating, listedLine,
  overnightLine, paceLine, routeTitle, safetyLine, seasonLine, stageLine,
  trafficFreeLine, whyLines,
} from '../lib/cycleStory.js';
import { notForLines } from '../lib/notFor.js';
import { natureRankLine } from '../lib/rating.js';
import { featureHref, linkOpener } from '../lib/featureHref.js';
import { formatMoney } from '../lib/money.js';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { ItemIcon } from './ItemParts.jsx';
import { Button } from '../components/ui/index.js';
import { toPhotos } from '../lib/itemPhotos.js';
import { beforeGoItems } from '../lib/beforeGo.js';
import { useItemPdf } from '../hooks/useItemPdf.js';
import { installMapGestures } from '../lib/mapGestures.js';
import { MapShell } from './MapShell.jsx';
import {
  ArrowLeftIcon, BikeIcon, TrainIcon, RouteIcon, DownloadIcon, BottleIcon, CoffeeIcon,
  BedIcon, MapPinIcon, ChevronRightIcon, LoopIcon, ArrowRightIcon, MountainIcon, ShieldIcon,
  ListDayIcon,
} from '../components/Icons.jsx';
import {
  OutdoorPage, PSection, StayLine, RouteBlock, HeightProfile, CheckRows, Facilities,
  OtherNearby, OxLinkButton, outdoorPdfModel,
} from './OutdoorParts.jsx';
import { scrollToSection } from './PageTemplate.jsx';

/**
 * The cycling page: one route, or one tour composed over routes.
 *
 * Since T919 it stands on the place page's template (OutdoorParts.jsx, the
 * owner's approved spec of 2026-10-30): the photographs, the head (the name,
 * the Score with the rank in the region, the ref as a badge), six facts
 * (length, time, climb, bike, traffic-free share, route type), a jump bar,
 * then Route (the map with 2D / 3D and full screen, the height profile, the
 * GPX and the PDF), Surface and traffic (two stacked bars, the paved share
 * and the traffic-free share, from OpenStreetMap, and the bike it asks for),
 * Stages (the section before and after, a tour's days, or the longer route
 * it belongs to), Getting there (stations at the ends, trains that take
 * bikes, rental at the start, the stations along the line), Along the way
 * (water, repair, cafes and beds, and the towns in riding order), and Other
 * routes nearby. The side card holds the one primary, "Add to a day plan".
 *
 * A TOUR is built around what each day is, where it ends, and whether there
 * is a bed there: its days are the Stages section.
 *
 * Three things this page is careful about.
 *
 *   A listed route has no score, so there is no score chip and no scenic
 *   figure, and the score fold says why in one line. The wire omits the key;
 *   this never invents one back (invariant 9).
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
 * The EuroVelo family page below is a manifest, not a detail page, and keeps
 * its own layout.
 */

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// The month names the mountain layer already ships in all six languages.
// A seventh copy of "January" would only be a seventh thing to translate.
const MONTHS = ['mtn.monthJan', 'mtn.monthFeb', 'mtn.monthMar', 'mtn.monthApr',
  'mtn.monthMay', 'mtn.monthJun', 'mtn.monthJul', 'mtn.monthAug',
  'mtn.monthSep', 'mtn.monthOct', 'mtn.monthNov', 'mtn.monthDec'];

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
function useRouteMap(mapEl, geometry, bbox, onPick = null) {
  const mapRef = useRef(null);
  // The page's tap handler, read at tap time so the map is built once.
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (mapRef.current || !mapEl.current) return undefined;
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: MAP_STYLE,
      center: [12, 48],
      zoom: 4,
      attributionControl: { compact: true },
      dragRotate: false,
      touchPitch: false,
    });
    // Two fingers pan, a pinch zooms, no Ctrl (T430, lib/mapGestures.js).
    map._gestures = installMapGestures(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    // The ink sketch under the canvas until the map has drawn, and a tap on
    // the line that moves the profile's marker (T396, rules N8 and N11).
    markMapLive(map);
    map.on('click', (e) => pickRef.current?.(e, map));
    map.on('load', () => {
      const empty = { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [] } };
      map.addSource('cycle', { type: 'geojson', data: empty });
      map.addLayer({
        id: 'cycle-casing', type: 'line', source: 'cycle',
        paint: { 'line-color': token('--bg-card'), 'line-width': 7, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'cycle-line', type: 'line', source: 'cycle',
        paint: { 'line-color': token('--accent'), 'line-width': 3.4 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.resize();
      map._cycleReady = true;
      if (map._draw) map._draw();
    });
    mapRef.current = map;
    return () => { map._gestures?.dispose(); map.remove(); mapRef.current = null; };
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

  return mapRef;
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
          (s.sleep || 0) > 0 && t(s.sleep === 1 ? 'cycle.townBed' : 'cycle.townBeds', { n: s.sleep }),
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

/**
 * The route as GPX, the credit inside the file (ODbL travels with a database
 * extract). One track, one segment per line part. Null when the route has
 * no line to write.
 */
function routeGpxText(route, name, link) {
  const parts = lineParts(route?.osm?.geometry);
  if (!parts.length) return null;
  return cycleGpx({ name, tracks: [{ name, lines: parts }], credit: gpxCredit(route), link });
}

/**
 * A tour as GPX with one track per day (T386), cut from the tour line at each
 * stage's start_m and end_m, so a hiking or cycling app shows Day 1, Day 2
 * and so on as separate tracks. The credit is the first route's, where the
 * licence lives, or the OpenStreetMap default.
 */
function tourGpxText(tour, route, t, link) {
  const days = splitTourByStages(tour?.geometry, tour?.stages);
  if (!days.length || days.some((d) => !d.points.length)) return null;
  return cycleGpx({
    name: tour.title,
    tracks: days.map(({ stage, points }) => ({
      name: t('detail.dayTrack', {
        n: stage.d,
        from: stage.from?.name || '',
        to: stage.to?.name || '',
      }),
      lines: [points],
    })),
    credit: gpxCredit(route),
    link,
  });
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
            aria-label={t('a11y.close')}>
            <ArrowLeftIcon size={16} />
          </button>
          <div className="cycle-title">
            <h1>{(family && family.ref) || familyRef}</h1>
            {/* The route's name, not the sum of the sections Carta holds (T455). */}
            {family?.name && <p className="cycle-sub">{family.name}</p>}
          </div>
        </header>
        {loading && <p className="places-empty" role="status">{t('state.loading')}</p>}
        {!loading && !family && (
          <div className="places-empty empty-act">
            <p>{t('cycle.familyGone')}</p>
            <button type="button" className="cov-empty-btn" onClick={onClose}>{t('empty.cycleRoutes')}</button>
          </div>
        )}
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

/** Rated and listed routes of one country, the pool the exits come from. */
const loadCycleRows = (cc) => loadCycling(cc)
  .then((d) => (d ? [...(d.routes || []), ...(d.listed || [])] : []));
const cycleCentre = (r) => bboxCentre(r?.bbox);
const cycleRowLevel = (r) => cycleLevel(r?.km, r?.asc);

/** The bike a route asks for, as the strip's one-word type. */
const BIKE_TYPE = {
  touring: 'detail.bikeTouring', gravel: 'detail.bikeGravel', mtb: 'detail.bikeMtb',
};

/** The route's shape, in the trail filter's words. */
const ROUTE_SHAPE = {
  loop: 'trails.shapeLoop', out_back: 'trails.shapeOutBack', point: 'trails.shapePoint', figure8: 'trails.shapeFigure8',
};

/** The section before and after (the detail file's `stages`), or none. */
function detailStages(route) {
  const s = route && route.stages && !Array.isArray(route.stages) && typeof route.stages === 'object' ? route.stages : null;
  const ok = (x) => (x && x.id != null && x.name ? x : null);
  return { prev: ok(s?.prev), next: ok(s?.next) };
}

/** The first point of the line, where the directions go. */
function lineStart(geometry) {
  const first = geometryParts(geometry).find((p) => Array.isArray(p) && p.length && finitePair(p[0]));
  return first ? { lon: first[0][0], lat: first[0][1] } : null;
}

export function CyclePage({ routeId, tourSlug, country, countryName,
                            onClose, onOpenNeighbour, onSelectDest = null, onAddToDay = null,
                            fav = false, onFav = null, backLabel = '' }) {
  const { t, lang } = useI18n();
  const [route, setRoute] = useState(null);
  const [tour, setTour] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

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

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

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
  // The profile and the map share one marker (T396, rule N11), as on the
  // trail page: the profile's metres are scaled onto the drawn line's own
  // length, which is a simplification of the line the profile was sampled on.
  const linePts = useMemo(() => routePoints(geometry), [geometry]);
  const lineM = useMemo(() => routeLength(linePts), [linePts]);
  const profEnd = route?.carta?.elevation?.profile?.length
    ? route.carta.elevation.profile[route.carta.elevation.profile.length - 1][0] : 0;
  const [markM, setMarkM] = useState(null);
  const scrubTo = useRef(null);
  const mapRef = useRouteMap(mapEl, geometry, bbox, (e, map) => {
    if (!linePts.length || !profEnd) return;
    const hit = nearestOnRoute(linePts, e.lngLat.lat, e.lngLat.lng);
    if (!hit) return;
    const px = map.project([hit.lon, hit.lat]);
    if (Math.hypot(px.x - e.point.x, px.y - e.point.y) > 24) return;
    const along = lineM > 0 ? hit.m * (profEnd / lineM) : hit.m;
    setMarkM({ m: along });
    scrubTo.current?.(along);
  });
  const getMap = React.useCallback(() => mapRef.current, [mapRef]);
  const highlightAt = React.useCallback((alongM) => {
    const map = mapRef.current;
    if (!map) return;
    const p = alongM == null || !linePts.length
      ? null
      : pointAlong(linePts, profEnd > 0 ? alongM * (lineM / profEnd) : alongM);
    if (!p) {
      map._scrubMarker?.remove();
      map._scrubMarker = null;
      return;
    }
    if (!map._scrubMarker) {
      const el = document.createElement('span');
      el.className = 'tpage-scrub-pin';
      map._scrubMarker = new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map);
    } else {
      map._scrubMarker.setLngLat([p.lon, p.lat]);
    }
  }, [mapRef, linePts, lineM, profEnd]);
  scrubTo.current = highlightAt;
  const sketchLines = useMemo(() => geometryParts(geometry), [geometry]);

  const why = useMemo(() => whyLines(carta.reasons, t), [carta.reasons, t]);
  const rated = Boolean(route && route.t === 'r');
  // Rating v5 (T763): the country-file row carries the v5 block (the
  // detail file does not); a tour has no score of its own.
  const rating = !tourSlug && wireRow ? cycleRating(wireRow, t) : null;
  const title = (tour && tour.title) || (route && routeTitle(route, t)) || '…';
  const { onPdf, pdfBusy } = useItemPdf(tour ? 'tour' : 'cycle', tour || route, { title, countryName, carta });
  const cc = (tour && tour.country) || (route && route.country) || country;
  // The ref is worth a chip beside the title unless the title IS the ref,
  // which is what a route with no name of its own gets.
  const refChip = route && route.ref && !String(title).includes(route.ref) ? route.ref : null;

  // Three ways out (T180): routes of the same country. A tour's exits are
  // routes too, the only cycling page the list can open by id.
  const me = tour ? { ...tour, id: tour.slug, name: tour.title }
    : (wireRow || (route ? { ...route, km: route.km, asc: route.asc } : null));
  const exits = usePlaceExits({
    me,
    cc: cc || country,
    load: loadCycleRows,
    centre: cycleCentre,
    level: cycleRowLevel,
    open: (row) => onOpenNeighbour?.('cycle', row),
  });

  const bike = tour ? tour.bike : carta.surface?.bike;
  const images = (tour && tour.images && tour.images.length ? tour.images : carta.images) || [];
  const start = lineStart(geometry);
  const dirUrl = start ? trailheadDirectionsUrl(start.lat, start.lon) : '';
  // Stations with their km along the line (T386): a route reads its service
  // towns, a tour its day ends, which is where a rider joins or leaves it.
  const stations = tour
    ? (tour.stages || []).flatMap((s) => [
      s.d === 1 && s.from?.station ? { name: s.from.station_name || s.from.name, km: (s.start_m || 0) / 1000 } : null,
      s.to?.station ? { name: s.to.station_name || s.to.name, km: (s.end_m || 0) / 1000 } : null,
    ]).filter((s) => s && s.name)
    : (carta.services || [])
      .filter((s) => s && s.name && s.station)
      .sort((a, b) => (a.at_m || 0) - (b.at_m || 0))
      .map((s) => ({ name: s.name, km: (s.at_m || 0) / 1000 }));
  // Where the line starts, as a place: a tour's first overnight town, or a
  // route's first service town within 3 km of its start.
  const firstTown = tour
    ? (tour.stages?.[0]?.from?.name || null)
    : ((carta.services || [])
      .filter((s) => s && s.name && Number.isFinite(s.at_m) && s.at_m <= 3000)
      .sort((a, b) => a.at_m - b.at_m)[0]?.name || null);

  const shareUrl = typeof window === 'undefined' ? '' : (() => {
    const { origin, pathname } = window.location;
    if (tour) return `${origin}${pathname}#tour=${encodeURIComponent(tour.slug)}`;
    return route ? `${origin}${pathname}#cycle=${route.id}&cc=${cc}` : '';
  })();
  const onShare = async () => {
    const how = await shareTrailLink(title, shareUrl);
    if (how === 'copied') setToast(t('trip.linkCopied'));
  };

  // The file is the page's one primary (T386): a route's line, or a tour
  // with one track per day. Through the share sheet on a phone that can take
  // files, so it lands in the rider's own app, a download elsewhere.
  const gpxText = tour ? tourGpxText(tour, route, t, shareUrl) : (route ? routeGpxText(route, title, shareUrl) : null);
  const onGpx = async () => {
    if (!gpxText) return;
    const how = await shareOrDownloadFile(cycleFileBase(title, tour ? tour.slug : route?.id), gpxText, 'gpx', title);
    if (how !== 'shared') setToast(t('trails.savedGpx'));
  };

  /* ── The page (T919) ──────────────────────────────────────────────── */

  const sf = carta.surface;
  const pavedKnown = sf && Number.isFinite(sf.paved_share) && (sf.surface_known_share ?? 1) >= 0.25;
  const freeKnown = sf && Number.isFinite(sf.traffic_free_share) && (sf.highway_known_share ?? 1) >= 0.33;
  const pavedShare = pavedKnown ? sf.paved_share : (Number.isFinite(wireRow?.paved) ? wireRow.paved : null);
  const freeShare = freeKnown ? sf.traffic_free_share : (Number.isFinite(wireRow?.free) ? wireRow.free : null);
  const pavedPct = pavedShare != null ? Math.round(pavedShare * 100) : null;
  const freePct = freeShare != null ? Math.round(freeShare * 100) : null;
  const totalKm = Number.isFinite(sf?.total_m) ? sf.total_m / 1000
    : (Number.isFinite(route?.km) ? route.km : (Number.isFinite(wireRow?.km) ? wireRow.km : null));
  const kmOfShare = (share) => (totalKm != null ? `${(share * totalKm).toLocaleString(lang, { maximumFractionDigits: 1 })} km` : '');
  const bikeWord = BIKE_TYPE[bike] ? capFirst(t(BIKE_TYPE[bike])) : '';
  const kmVal = tour ? tour.km : (route?.km ?? wireRow?.km);
  const ascVal = tour ? tour.asc : (route?.asc ?? wireRow?.asc);
  const durMin = Number(route?.dur?.min ?? wireRow?.dur?.min);
  const dur = (min) => {
    const r = Math.max(5, Math.round(min / 5) * 5);
    const h = Math.floor(r / 60);
    const m = r % 60;
    return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
  };
  const lengthText = Number.isFinite(kmVal) ? `${Number(kmVal).toLocaleString(lang, { maximumFractionDigits: 1 })} km` : '';
  const timeText = Number.isFinite(durMin) && durMin > 0 ? dur(durMin) : '';
  const climbText = Number.isFinite(ascVal) ? `${Math.round(ascVal).toLocaleString(lang)} m` : '';
  const rt = route?.rt || wireRow?.rt || null;
  const isLoop = rt === 'loop' || rt === 'figure8' || (!rt && route?.loop === true);
  const shapeKey = rt && ROUTE_SHAPE[rt] ? ROUTE_SHAPE[rt] : (route?.loop === true ? 'trails.shapeLoop' : route?.loop === false ? 'trails.shapePoint' : null);
  const shapeWord = shapeKey ? t(shapeKey) : '';

  const keyFacts = keyFactCells(tour ? [
    { key: 'days', label: t('detail.factDays'), value: tour.days != null ? String(tour.days) : '' },
    { key: 'km', label: t('ox.fact.length'), value: lengthText },
    { key: 'asc', label: t('ox.fact.climb'), value: climbText },
    { key: 'bike', label: t('detail.factBike'), value: bikeWord },
    freePct != null && { key: 'surface', label: t('ox.fact.free'), value: `${freePct}%` },
  ] : [
    { key: 'km', label: t('ox.fact.length'), value: lengthText },
    { key: 'time', label: t('ox.fact.time'), value: timeText },
    { key: 'asc', label: t('ox.fact.climb'), value: climbText },
    { key: 'bike', label: t('detail.factBike'), value: bikeWord },
    freePct != null && { key: 'surface', icon: 'surface', label: t('ox.fact.free'), value: `${freePct}%` },
    { key: 'route', icon: isLoop ? 'loop' : 'start', label: t('ox.fact.route'), value: shapeWord },
  ], t);

  const hook = tour ? paceLine(tour.pace, t) : (why[0]?.text || null);

  /* Surface and traffic: two stacked bars and the bike. */
  const mixRows = [
    pavedShare != null && {
      key: 'surf',
      head: t('ox.surface'),
      fig: t('ox.pavedPct', { pct: pavedPct }),
      a: pavedShare,
      keys: [[t('route.surfPaved'), kmOfShare(pavedShare)], [t('route.surfUnpaved'), kmOfShare(1 - pavedShare)]],
    },
    freeShare != null && {
      key: 'traffic',
      head: t('ox.traffic'),
      fig: t('ox.freePct', { pct: freePct }),
      a: freeShare,
      keys: [[t('ox.trafficFree'), kmOfShare(freeShare)], [t('ox.withTraffic'), kmOfShare(1 - freeShare)]],
    },
  ].filter(Boolean);
  const surfaceRows = [
    bike && { key: 'bike', icon: <BikeIcon size={16} />, title: bikeWord || bikeLine(bike, t), text: bikeLine(bike, t) },
    Number.isFinite(ascVal) && {
      key: 'climb', icon: <MountainIcon size={16} />, title: t('ox.climbM', { m: Math.round(ascVal).toLocaleString(lang) }), text: '',
    },
    carta.safety && safetyLine(carta.safety, t) && { key: 'safe', icon: <ShieldIcon size={16} />, title: t('cycle.safetyTitle'), text: safetyLine(carta.safety, t) },
  ];

  /* Stages: the section before and after, a tour's days, the family. */
  const stg = detailStages(route);
  const stageLink = (s, dir) => (s ? (
    <a key={dir} className={`ox-stage${dir === 'next' ? ' is-next' : ''}`}
      href={featureHref('cycle', { id: s.id, cc }) || undefined}
      onClick={onOpenNeighbour ? linkOpener(() => onOpenNeighbour('cycle', { id: s.id, cc })) : undefined}>
      <span>{t(dir === 'next' ? 'ox.stageNext' : 'ox.stagePrev')}</span>
      <b>{s.name}</b>
      {Number.isFinite(s.km) && <span>{`${Number(s.km).toLocaleString(lang, { maximumFractionDigits: 1 })} km`}</span>}
    </a>
  ) : null);
  const famName = wireRow?.fam || (route?.ref ? route.ref : null);
  const isStretch = Boolean(wireRow?.sec) || Boolean(stg.prev || stg.next);

  /* Getting there: stations, trains with bikes, rental, the start. */
  const det = route || {};
  const st = det.stations && typeof det.stations === 'object' ? det.stations : null;
  const mText = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString(lang, { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`);
  const rental = (Array.isArray(det.rental) ? det.rental : []).filter((r) => r && r.name).slice(0, 3);
  const gettingRows = [
    st?.start?.name && {
      key: 'st-start', icon: <TrainIcon size={16} />, title: t('ox.stationStart', { name: st.start.name }),
      text: Number.isFinite(st.start.m) ? t('ox.mFromStart', { d: mText(st.start.m) }) : '',
    },
    st?.end?.name && {
      key: 'st-end', icon: <TrainIcon size={16} />, title: t('ox.stationEnd', { name: st.end.name }),
      text: Number.isFinite(st.end.m) ? t('ox.mFromEnd', { d: mText(st.end.m) }) : '',
    },
    typeof det.bike_trains === 'string' && det.bike_trains && {
      key: 'bt', icon: <TrainIcon size={16} />, title: t('ox.bikeTrains'), text: det.bike_trains,
    },
    ...rental.map((r, i) => ({
      key: `rent-${i}`, icon: <BikeIcon size={16} />, title: t('ox.rentalAt', { name: r.name }),
      text: Number.isFinite(Number(r.eur_day)) ? t('ox.parkDay', { price: formatMoney(Number(r.eur_day)) }) : '',
    })),
    firstTown && { key: 'town', icon: <MapPinIcon size={16} />, title: t('detail.startAt', { place: firstTown }), text: '' },
    ...(!st ? stations.slice(0, 4).map((s) => ({
      key: `stn-${s.name}-${s.km}`, icon: <TrainIcon size={16} />, title: s.name, text: t('cycle.atKm', { km: Math.round(s.km) }),
    })) : []),
    start && dirUrl && {
      key: 'dir', icon: <RouteIcon size={16} />, title: t('ox.onMap'), text: `${start.lat.toFixed(5)}, ${start.lon.toFixed(5)}`,
      link: <a href={dirUrl} target="_blank" rel="noopener noreferrer">{t('ox.directions')}</a>,
    },
    shapeKey && !tour && {
      key: 'shape', icon: isLoop ? <LoopIcon size={16} /> : <ArrowRightIcon size={16} />, title: shapeWord,
      text: t(isLoop ? 'ox.shapeLoop' : rt === 'out_back' ? 'ox.shapeBack' : 'ox.shapeOneWay'),
    },
  ];

  /* Along the way: the contract's services, else the towns' counts. */
  const sv = det.services && !Array.isArray(det.services) && typeof det.services === 'object' ? det.services : null;
  const towns = Array.isArray(carta.services) ? carta.services.filter((s) => s && s.name) : [];
  const countTowns = (k) => towns.filter((s) => (Number(s[k]) || 0) > 0).length;
  const listOrN = (v, nKey) => (Array.isArray(v) ? v.filter(Boolean).slice(0, 3).join(', ')
    : Number.isFinite(Number(v)) && Number(v) > 0 ? t(nKey, { n: Number(v) }) : (typeof v === 'string' ? v : ''));
  const svcFacil = sv ? [
    sv.water != null && listOrN(sv.water, 'ox.inTowns') && { key: 'water', icon: <BottleIcon size={16} />, label: t('ox.water'), note: listOrN(sv.water, 'ox.inTowns') },
    sv.repair != null && listOrN(sv.repair, 'ox.inTowns') && { key: 'repair', icon: <BikeIcon size={16} />, label: t('ox.repair'), note: listOrN(sv.repair, 'ox.inTowns') },
    sv.cafes != null && listOrN(sv.cafes, 'ox.inTowns') && { key: 'cafes', icon: <CoffeeIcon size={16} />, label: t('ox.cafes'), note: listOrN(sv.cafes, 'ox.inTowns') },
  ] : [];
  const townFacil = [
    countTowns('water') > 0 && { key: 't-water', icon: <BottleIcon size={16} />, label: t('ox.water'), note: t('ox.inTowns', { n: countTowns('water') }) },
    countTowns('repair') > 0 && { key: 't-repair', icon: <BikeIcon size={16} />, label: t('ox.repair'), note: t('ox.inTowns', { n: countTowns('repair') }) },
    countTowns('sleep') > 0 && { key: 't-sleep', icon: <BedIcon size={16} />, label: t('ox.beds'), note: t('ox.inTowns', { n: countTowns('sleep') }) },
    countTowns('station') > 0 && { key: 't-stn', icon: <TrainIcon size={16} />, label: t('ox.stations'), note: t('ox.inTowns', { n: countTowns('station') }) },
  ];
  const facil = [...svcFacil.filter(Boolean),
    ...townFacil.filter((f) => f && !svcFacil.some((s) => s && s.key === f.key.slice(2)))];

  const notForLinesFor = tour
    ? notForLines('cycle', { km: tour.km, asc: tour.asc, bike: tour.bike })
    : notForLines('cycle', {
      km: route?.km,
      asc: route?.asc,
      bike: sf && sf.bike,
      paved: sf && (sf.surface_known_share == null || sf.surface_known_share >= 0.25) ? sf.paved_share : null,
      safety: carta.safety && (carta.safety.known_share == null
        || carta.safety.known_share >= 0.33) ? carta.safety.score : null,
    });
  const photos = toPhotos(images.map((im) => ({ ...im, url: im.thumb || im.url })), { fallbackCaption: title });
  const before = (route || tour) ? beforeGoItems({ lines: notForLinesFor }) : [];
  const beforeRows = before.map((it) => ({
    key: it.key,
    icon: <ItemIcon name={it.icon} size={16} />,
    title: t(it.titleKey, { ...it.params, word: it.params?.word ? capFirst(it.params.word) : it.params?.word }),
    text: t(it.subKey, it.params),
    warn: Boolean(it.safety),
  }));
  const sources = route ? [{ label: (route.osm && route.osm.attribution) || t('cycle.sourceNote') }] : [];
  const rankLine = rating && !rating.unscored ? natureRankLine({ rank: rating.rank }, t, { place: countryName }) : '';
  const baseRef = wireRow?.base || route?.base || null;
  const onAdd = onAddToDay && start ? () => onAddToDay({
    id: tour ? tour.slug : route?.id, cc, name: title, lat: start.lat, lon: start.lon,
  }) : null;
  const pdfModel = () => outdoorPdfModel({
    name: title, hook, facts: keyFacts, why: why.map((w) => ({ title: '', line: w.text })), before, sources, t,
    extra: {
      photos,
      where: countryName,
      route: (() => {
        const flat = geometryParts(geometry).flat().filter((pt) => Array.isArray(pt) && finitePair(pt));
        const step = Math.max(1, Math.ceil(flat.length / 400));
        return flat.filter((_, i) => i % step === 0);
      })(),
      url: shareUrl,
    },
  });

  const jumps = [
    { key: 'route', id: 'ox-route', label: t('ox.jump.route') },
    { key: 'surface', id: 'ox-surface', label: t('ox.surface') },
    { key: 'stages', id: 'ox-stages', label: t(tour ? 'cycle.stagesTitle' : 'ox.stages') },
    { key: 'getting', id: 'ox-getting', label: t('detail.gettingThere') },
    { key: 'along', id: 'ox-along', label: t('ox.jump.along') },
    { key: 'near', id: 'ox-near', label: t('ox.jump.nearby') },
  ];

  const mapNode = (
    <MapShell getMap={getMap} relief beneath={['cycle-casing']}>
      <div ref={mapEl} className="cycle-map" data-testid="cycle-map" role="img" aria-label={t('cycle.mapLabel')}>
        {/* The line in ink while maplibre loads (T396). */}
        <MapSketch lines={sketchLines} label={title} />
      </div>
    </MapShell>
  );
  const hasElev = Boolean(carta.elevation && Array.isArray(carta.elevation.profile) && carta.elevation.profile.length > 1);

  const whyRates = why.length > 0 || (route && !rated) ? (
    <>
      {why.length > 0 && (
        <ul className="cycle-why" data-testid="cycle-why">
          {why.map((line) => <li key={line.text}>{line.text}</li>)}
        </ul>
      )}
      {route && !rated && <p className="pt-muted">{listedLine(t)}</p>}
    </>
  ) : null;

  const gone = !loading && !route && !tour;

  return (
    <OutdoorPage
      name={title}
      className="cycle-dpage"
      backLabel={backLabel || t('detail.backCycle')}
      onClose={onClose}
      fav={fav}
      onFav={onFav}
      onShare={shareUrl ? onShare : null}
      resetKey={tourSlug || routeId}
      toast={toast}
      photos={photos}
      photoFallback={{ city: title, iso2: cc }}
      head={{
        title: <span data-testid="cycle-name">{title}</span>,
        iso2: cc,
        where: countryName,
        rating: rating && !rating.unscored ? rating : null,
        rank: rankLine,
        badges: [refChip],
        lead: hook,
      }}
      facts={keyFacts}
      jumps={jumps}
      whyRates={whyRates}
      card={gone ? null : {
        title: t(tour ? 'ox.card.tour' : 'ox.card.ride'),
        rows: [
          { key: 'l', label: t('ox.fact.length'), value: lengthText },
          { key: 't', label: t('ox.fact.time'), value: timeText },
          pavedPct != null && { key: 's', label: t('ox.surface'), value: t('ox.pavedPct', { pct: pavedPct }) },
          freePct != null && { key: 'f', label: t('ox.fact.free'), value: `${freePct}%` },
        ].filter(Boolean),
        onAdd,
        secondary: [
          gpxText ? (
            <Button key="gpx" variant="secondary" size="sm" data-testid="cycle-gpx" iconStart={<DownloadIcon size={16} />} onClick={onGpx}>
              {t('ox.gpx')}
            </Button>
          ) : null,
          det.bike_trains ? (
            <Button key="bt" variant="secondary" size="sm" iconStart={<TrainIcon size={16} />}
              onClick={() => scrollToSection(document.querySelector('.oxp .pt-scroll'), 'ox-getting')}>
              {t('ox.bikeTrains')}
            </Button>
          ) : (dirUrl ? <OxLinkButton key="dir" href={dirUrl} icon={<RouteIcon size={16} />}>{t('ox.directions')}</OxLinkButton> : null),
        ],
        stay: baseRef?.id && baseRef.city ? (
          <StayLine destId={baseRef.id} city={baseRef.city} km={baseRef.km} onOpen={onSelectDest} />
        ) : null,
      }}
      dock={gone ? null : {
        fig: [lengthText, timeText].filter(Boolean).join(', ') || title,
        note: bikeWord ? bikeWord.toLocaleLowerCase(lang) : '',
        sub: [freePct != null ? t('ox.freePct', { pct: freePct }) : '', shapeWord ? shapeWord.toLocaleLowerCase(lang) : '']
          .filter(Boolean).join(', '),
      }}
      sources={sources}
      sourcesExtra={route ? <ReportProblem item={{ layer: 'cycle', id: route.id, cc, name: title }} /> : null}
    >
      {loading && <p className="places-empty" role="status">{t('state.loading')}</p>}
      {/* A route or tour id that resolves to nothing: a gone page, said as
          one, with the way back to the list. Not a country claim. */}
      {gone && (
        <div className="places-empty empty-act">
          <p>{t('cycle.familyGone')}</p>
          <Button variant="secondary" className="cov-empty-btn" onClick={onClose}>{t('empty.cycleRoutes')}</Button>
        </div>
      )}

      <PSection id="ox-route" title={t('ox.jump.route')} note={shapeWord || null}>
          <RouteBlock
            map={mapNode}
            profile={hasElev ? (
              <HeightProfile elevation={carta.elevation} plain onScrub={highlightAt} markM={markM} testId="cycle-elev" />
            ) : null}
            actions={(gpxText || route || tour) ? (
              <>
                {gpxText && (
                  <Button variant="secondary" size="sm" iconStart={<DownloadIcon size={16} />} onClick={onGpx}>
                    {t('cycle.gpx')}
                  </Button>
                )}
                <Button variant="secondary" size="sm" loading={pdfBusy} iconStart={<DownloadIcon size={16} />}
                  onClick={() => onPdf(pdfModel())}>
                  {t('ox.pdf')}
                </Button>
              </>
            ) : null}
          />
      </PSection>

      {(mixRows.length > 0 || surfaceRows.some(Boolean)) && (
        <PSection id="ox-surface" title={t('ox.surfaceTraffic')}>
          {mixRows.length > 0 && (
            <div className="ox-mix">
              {mixRows.map((r) => (
                <div key={r.key} className="ox-mix-row">
                  <div className="ox-mix-h"><span>{r.head}</span><b>{r.fig}</b></div>
                  <div className="ox-bar" aria-hidden="true">
                    <i className="is-a" style={{ width: `${Math.round(r.a * 100)}%` }} />
                    <i className="is-b" style={{ width: `${100 - Math.round(r.a * 100)}%` }} />
                  </div>
                  <ul className="ox-mix-keys">
                    {r.keys.map(([label, km], i) => (
                      <li key={label}><i className={i ? 'is-b' : 'is-a'} aria-hidden="true" />{km ? `${label} ${km}` : label}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="pt-muted">{t('ox.fromOsm')}</p>
            </div>
          )}
          <CheckRows rows={surfaceRows} />
        </PSection>
      )}

      {(stg.prev || stg.next || tour?.stages?.length > 0 || (isStretch && famName)) && (
        <PSection id="ox-stages" title={t(tour ? 'cycle.stagesTitle' : 'ox.stages')}>
          {(stg.prev || stg.next) && (
            <div className="ox-stages">
              {stageLink(stg.prev, 'prev') || <span />}
              {stageLink(stg.next, 'next')}
            </div>
          )}
          {tour?.stages?.length > 0 && <Stages stages={tour.stages} t={t} />}
          {tour && seasonLine(tour.season, t, monthName) && (
            <p className="pt-muted" data-testid="cycle-season">{seasonLine(tour.season, t, monthName)}</p>
          )}
          {!tour && !stg.prev && !stg.next && famName && (
            <CheckRows single rows={[{ key: 'fam', icon: <ListDayIcon size={16} />, title: t('cycle.stretch'), text: t('ox.partOf', { name: famName }) }]} />
          )}
        </PSection>
      )}

      {gettingRows.some(Boolean) && (
        <PSection id="ox-getting" title={t('detail.gettingThere')}>
          <CheckRows rows={gettingRows} />
        </PSection>
      )}

      {(facil.length > 0 || towns.length > 0 || beforeRows.length > 0) && (
        <PSection id="ox-along" title={t('ox.jump.along')}>
          <Facilities items={facil} />
          {towns.length > 0 && (
            <div className="pt-block">
              <h3 className="pt-block-title">{t('cycle.townsTitle')}</h3>
              <Towns services={carta.services} t={t} />
            </div>
          )}
          <CheckRows rows={beforeRows} />
        </PSection>
      )}

      {(exits.length > 0 || wireRow) && (
        <PSection id="ox-near" title={t('ox.otherRoutes')}>
          <OtherNearby exits={exits} hrefOf={(r) => featureHref('cycle', { id: r.id, cc: r.cc || cc })} />
          {wireRow && (
            <NearbyOutdoors
              row={wireRow}
              cc={country}
              headings={{ trail: 'nb.cycle.trail', peak: 'nb.cycle.peak', lake: 'nb.cycle.lake', beach: 'nb.cycle.beach' }}
              onOpen={onOpenNeighbour}
            />
          )}
        </PSection>
      )}
    </OutdoorPage>
  );
}

export default CyclePage;
