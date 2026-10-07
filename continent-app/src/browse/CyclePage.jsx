import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ReportProblem } from '../components/ReportProblem.jsx';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useI18n } from '../i18n/index.jsx';
import { count } from '../lib/format.js';
import { tokenColour as token } from '../map/tokenColors.js';
import { DetailPage } from './DetailSkeleton.jsx';
import { usePlaceExits } from '../hooks/usePlaceExits.js';
import {
  stripCells, previewWords, bboxCentre, cycleLevel, LEVEL_WORD_KEY,
} from '../lib/detailSkeleton.js';
import { trailheadDirectionsUrl, shareTrailLink } from '../lib/trailExport.js';
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
import { NotFor } from '../components/NotFor.jsx';
import { notForLines } from '../lib/notFor.js';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { FigureFooter } from './HonestFooters.jsx';
import {
  ElevationChart, MixBar, MixKeys, TrafficBar,
} from './RouteFigures.jsx';
import { Instrument, Row, EmptyTrack, SpanAxis } from './Signature.jsx';
import { kmOf, trafficMix } from '../lib/signature.js';
import { numberSentence } from '../lib/numberSentences.js';
import {
  ArrowLeftIcon, CameraIcon, BikeIcon, TrainIcon, ClockIcon,
  ListDayIcon, CheckIcon, InfoIcon, MountainIcon, BulbIcon, BedIcon,
  LinkIcon, RouteIcon,
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
 *
 * Since T180 a route or tour page draws through the shared detail skeleton
 * (DetailSkeleton.jsx), the same dialog shell as the trail, beach, lake and
 * mountain pages: the line map is its sticky map slot, the surface and
 * traffic block its signature slot (since T181 one instrument: the two
 * 100%-wide bars on one kilometre axis), the rest its collapsed rows. The EuroVelo family page below
 * is a manifest, not a detail page, and keeps its own layout.
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

/**
 * The wire's surface block as MixBar parts. paved_share is measured over the
 * tagged length only, so it is scaled by surface_known_share and the rest of
 * the line is the unknown share, never stretched paved or unpaved. Below a
 * quarter known, surfaceLine already says the surface is not recorded, and
 * the bar stays away for the same reason.
 */
function surfaceParts(surface, t) {
  const known = surface?.surface_known_share;
  const paved = surface?.paved_share;
  if (!Number.isFinite(known) || !Number.isFinite(paved) || known < 0.25) return null;
  return [
    { key: 'paved', tone: 'paved', label: t('route.surfPaved'), share: paved * known },
    { key: 'unpaved', tone: 'gravel', label: t('route.surfUnpaved'), share: (1 - paved) * known },
    { key: 'unknown', tone: 'unknown', label: t('route.surfUnknown'), share: 1 - known },
  ];
}

/** traffic_free_share is measured over the length with a highway tag, the
 *  same scaling as the surface. */
function trafficParts(surface) {
  const free = surface?.traffic_free_share;
  const known = surface?.highway_known_share;
  if (!Number.isFinite(free) || !Number.isFinite(known) || known < 0.33) return null;
  return { free: free * known, shared: (1 - free) * known, unknown: 1 - known };
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

/** The first point of the line, where the directions go. */
function lineStart(geometry) {
  const first = geometryParts(geometry).find((p) => Array.isArray(p) && p.length && finitePair(p[0]));
  return first ? { lon: first[0][0], lat: first[0][1] } : null;
}

export function CyclePage({ routeId, tourSlug, country, countryName,
                            onClose, onOpenNeighbour, fav = false, onFav = null }) {
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
  useRouteMap(mapEl, geometry, bbox);

  const why = useMemo(() => whyLines(carta.reasons, t), [carta.reasons, t]);
  const rated = Boolean(route && route.t === 'r');
  const rating = rated && carta.score != null
    ? cycleRating({ score: carta.score }, t) : null;
  const title = (tour && tour.title) || (route && routeTitle(route, t)) || '…';
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

  const km = tour ? tour.km : route?.km;
  const asc = tour ? tour.asc : route?.asc;
  const level = cycleLevel(km, asc);
  const bike = tour ? tour.bike : carta.surface?.bike;
  const cells = stripCells({
    level,
    word: level ? `${t(LEVEL_WORD_KEY[level])} ~` : '',
    type: tour ? t('detail.typeTour') : (BIKE_TYPE[bike] ? t(BIKE_TYPE[bike]) : t('detail.typeRide')),
    number: Number.isFinite(km) ? `${Math.round(km).toLocaleString(lang)} km` : '',
  }, t);

  const images = (tour && tour.images && tour.images.length ? tour.images : carta.images) || [];
  const heroShot = images[0] || null;
  const start = lineStart(geometry);
  const dirUrl = start ? trailheadDirectionsUrl(start.lat, start.lon) : '';
  const stations = (carta.services || [])
    .filter((s) => s && s.name && s.station)
    .sort((a, b) => (a.at_m || 0) - (b.at_m || 0))
    .map((s) => s.name);

  const shareUrl = typeof window === 'undefined' ? '' : (() => {
    const { origin, pathname } = window.location;
    if (tour) return `${origin}${pathname}#tour=${encodeURIComponent(tour.slug)}`;
    return route ? `${origin}${pathname}#cycle=${route.id}&cc=${cc}` : '';
  })();
  const onShare = async () => {
    const how = await shareTrailLink(title, shareUrl);
    if (how === 'copied') setToast(t('trip.linkCopied'));
  };

  // The signature (T181, destinations spec C6 and 5.5): the surface bar and
  // the traffic bar on one 0-to-length axis, each class in kilometres, the
  // keys under the axis so the two bars sit directly over the ruler they
  // share. From the same block the sentences below read.
  const routeM = carta.surface?.total_m;
  // What the two shares mean for the rider (T158). Only where the share was
  // measured on enough of the line, the same floors the bars use.
  const sf = carta.surface;
  const pavedSentence = sf && Number.isFinite(sf.paved_share) && sf.surface_known_share >= 0.25
    ? numberSentence('pavedShare', sf.paved_share * 100, { t, lang }) : '';
  const freeSentence = sf && Number.isFinite(sf.traffic_free_share) && sf.highway_known_share >= 0.33
    ? numberSentence('trafficFree', sf.traffic_free_share * 100, { t, lang }) : '';
  const surfaceMix = surfaceParts(carta.surface, t)
    ?.map((p) => ({ ...p, value: kmOf(p.share, routeM) })) || null;
  const trafficSplit = trafficParts(carta.surface);
  const trafficKm = trafficMix(trafficSplit, t, routeM);
  const surfaceBlock = route && (
    <Instrument
      kind="cycle"
      className="cycle-route"
      title={t('sig.cycleHead')}
      note={(
        <>
          <p className="cycle-surface" data-testid="cycle-surface">
            {surfaceLine(carta.surface, t)}
          </p>
          {pavedSentence && <p className="numsent" data-testid="cycle-paved-sentence">{pavedSentence}</p>}
          {trafficFreeLine(carta.surface, t) && (
            <p className="cycle-free">{trafficFreeLine(carta.surface, t)}</p>
          )}
          {freeSentence && <p className="numsent" data-testid="cycle-free-sentence">{freeSentence}</p>}
          <p className="cycle-safety" data-testid="cycle-safety">
            {safetyLine(carta.safety, t)}
          </p>
          <p className="cycle-safety-note">{t('cycle.safetyHouse')}</p>
          {agreementLine(carta.agreement, t) && (
            <p className="cycle-agree" data-testid="cycle-agree">
              {agreementLine(carta.agreement, t)}
            </p>
          )}
        </>
      )}
    >
      <div className="cycle-bars">
        <Row label={t('route.surfaceTitle')}>
          {surfaceMix
            ? <MixBar parts={surfaceMix} keys={false} testId="cycle-surface-bar" />
            : <EmptyTrack text={t('sig.notMeasured')} />}
        </Row>
        <Row label={t('cycle.safetyTitle')}>
          {trafficSplit
            ? <TrafficBar split={trafficSplit} t={t} totalM={routeM} keys={false} testId="cycle-traffic-bar" />
            : <EmptyTrack text={t('sig.notMeasured')} />}
        </Row>
        {Number.isFinite(routeM) && routeM > 0 && (
          <SpanAxis marks={['0 km', (routeM / 2000).toFixed(1), `${(routeM / 1000).toFixed(1)} km`]} />
        )}
        {surfaceMix && <MixKeys parts={surfaceMix} className="sig-keys" />}
        {trafficKm && <MixKeys parts={trafficKm} className="sig-keys" />}
      </div>
    </Instrument>
  );

  // Slot 6: the collapsed rows (T180). A tour's own rows first, then the
  // route's: a tour opened on its own still shows its first route's profile
  // and towns, as it did before the skeleton.
  const rows = [
    tour && {
      key: 'tour-facts',
      icon: ClockIcon,
      label: t('detail.factsHead'),
      summary: [t('cycle.days', { n: tour.days }), `${Math.round(tour.km)} km`,
        tour.asc != null ? `${tour.asc} m` : null].filter(Boolean).join(', '),
      body: (
        <div className="cycle-tour" data-testid="cycle-tour">
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
        </div>
      ),
    },
    tour && tour.stages?.length > 0 && {
      key: 'stages',
      icon: ListDayIcon,
      label: t('cycle.stagesTitle'),
      summary: previewWords(stageLine(tour.stages[0], t) || ''),
      body: <Stages stages={tour.stages} t={t} />,
    },
    tour && tour.checks && {
      key: 'checks',
      icon: CheckIcon,
      label: t('cycle.checksTitle'),
      summary: previewWords(t('cycle.checksNote')),
      body: (
        <div className="cycle-checks" data-testid="cycle-checks">
          <p>{t('cycle.checksNote')}</p>
          <ul>
            {(tour.checks.passed || []).map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      ),
    },
    route && !tour && {
      key: 'route-facts',
      icon: InfoIcon,
      label: t('detail.factsHead'),
      summary: [route.km != null && `${route.km} km`, route.asc != null && `${route.asc} m`]
        .filter(Boolean).join(', '),
      body: (
        <>
          <p className="cycle-facts" data-testid="cycle-route-facts">
            {route.km != null && <span>{`${route.km} km`}</span>}
            {route.asc != null && <span>{`${route.asc} m`}</span>}
            {carta.surface && carta.surface.bike && (
              <span className="cycle-facts-bike">{bikeLine(carta.surface.bike, t)}</span>
            )}
          </p>
          {!rated && <p className="cycle-unrated">{listedLine(t)}</p>}
        </>
      ),
    },
    carta.elevation && Array.isArray(carta.elevation.profile)
      && carta.elevation.profile.length > 1 && {
      key: 'elev',
      icon: MountainIcon,
      label: t('cycle.elevTitle'),
      summary: route?.asc != null ? t('detail.climbSummary', { m: route.asc }) : '',
      body: (
        <ElevationChart elevation={carta.elevation} label={t('cycle.elevTitle')} maxLabel={t('cycle.elevMax')}
          className="cycle-elev" testId="cycle-elev" />
      ),
    },
    why.length > 0 && {
      key: 'why',
      icon: BulbIcon,
      label: t('cycle.whyTitle'),
      summary: previewWords(why[0].text),
      body: (
        <ul className="cycle-why" data-testid="cycle-why">
          {why.map((line) => <li key={line.text}>{line.text}</li>)}
        </ul>
      ),
    },
    Array.isArray(carta.services) && carta.services.length > 0 && {
      key: 'towns',
      icon: BedIcon,
      label: t('cycle.townsTitle'),
      summary: previewWords(carta.services.filter((s) => s && s.name).slice(0, 3).map((s) => s.name).join(', ')),
      body: <Towns services={carta.services} t={t} />,
    },
    images.length > 1 && {
      key: 'photos',
      icon: CameraIcon,
      label: t('beach.photos'),
      summary: t('detail.photoCount', { n: images.length }),
      body: <Photos images={images} />,
    },
  ].filter(Boolean);

  const notForLinesFor = tour
    ? notForLines('cycle', { km: tour.km, asc: tour.asc, bike: tour.bike })
    : notForLines('cycle', {
      km: route?.km,
      asc: route?.asc,
      bike: carta.surface && carta.surface.bike,
      paved: carta.surface && (carta.surface.surface_known_share == null
        || carta.surface.surface_known_share >= 0.25) ? carta.surface.paved_share : null,
      safety: carta.safety && (carta.safety.known_share == null
        || carta.safety.known_share >= 0.33) ? carta.safety.score : null,
    });

  return (
    <DetailPage
      name={title}
      className="cycle-dpage"
      testId="cycle-page"
      backLabel={t('trails.back')}
      onClose={onClose}
      fav={fav}
      onFav={onFav}
      onShare={shareUrl ? onShare : null}
      resetKey={tourSlug || routeId}
      toast={toast}
      hero={{
        sharedKey: tourSlug || routeId,
        cells,
        media: heroShot ? (
          <img className="dsk-hero-img" src={heroShot.url || heroShot.thumb} alt={heroShot.title || title} loading="eager" decoding="async" />
        ) : null,
        credit: heroShot && (heroShot.author || heroShot.license) ? (
          <p className="bpage-credit">
            <CameraIcon size={12} />
            <span className="lpage-credit-line">
              {[heroShot.author, heroShot.license].filter(Boolean).join(', ')}
            </span>
          </p>
        ) : null,
      }}
      head={(
        <div className="cycle-title">
          <h1 data-testid="cycle-name">
            {title}
            {refChip && <span className="dsk-ref">{refChip}</span>}
          </h1>
          <p className="cycle-sub">
            <CountryFlag country={cc} size={15} />
            {' '}
            {countryName}
          </p>
          {rating && (
            <span data-testid="cycle-score">
              <RatingBadge rating={rating} size="lg" showGem={false} />
            </span>
          )}
          {loading && <p className="places-empty">{'…'}</p>}
          {/* A route or tour id that resolves to nothing: a gone page, said
              as one, with the way back to the list. Not a country claim. */}
          {!loading && !route && !tour && (
            <div className="places-empty empty-act">
              <p>{t('cycle.familyGone')}</p>
              <button type="button" className="cov-empty-btn" onClick={onClose}>{t('empty.cycleRoutes')}</button>
            </div>
          )}
        </div>
      )}
      hook={tour ? paceLine(tour.pace, t) : (why[0]?.text || null)}
      notFor={(route || tour) ? <NotFor lines={notForLinesFor} /> : null}
      map={(
        <div ref={mapEl} className="cycle-map" data-testid="cycle-map"
          role="img" aria-label={t('cycle.mapLabel')} />
      )}
      signature={surfaceBlock || null}
      rows={rows}
      gettingThere={(start || stations.length > 0) ? (
        <>
          {dirUrl && (
            <a className="tpage-act tpage-act-wide" href={dirUrl} target="_blank" rel="noopener noreferrer">
              <RouteIcon size={15} />
              <span>{t('trails.startDirections')}</span>
            </a>
          )}
          {stations.length > 0 && (
            <p className="dsk-note">
              <TrainIcon size={13} />
              {' '}
              {t('detail.stationsOnRoute', { list: stations.slice(0, 4).join(', ') })}
            </p>
          )}
        </>
      ) : null}
      takeAway={(
        <>
          {route && !tour && (
            <button type="button" className="cycle-gpx" data-testid="cycle-gpx"
              onClick={() => downloadGpx(route, title)}>
              {t('cycle.gpx')}
            </button>
          )}
          {shareUrl && (
            <button type="button" className="tpage-act" onClick={onShare}>
              <LinkIcon size={15} />
              <span>{t('detail.sendLink')}</span>
            </button>
          )}
          {route && <ReportProblem item={{ layer: 'cycle', id: route.id, cc, name: title }} />}
        </>
      )}
      exits={exits}
      nearby={wireRow ? (
        <NearbyOutdoors
          row={wireRow}
          cc={country}
          headings={{ trail: 'nb.cycle.trail', peak: 'nb.cycle.peak', lake: 'nb.cycle.lake', beach: 'nb.cycle.beach' }}
          onOpen={onOpenNeighbour}
        />
      ) : null}
      licenceKeys={route ? ['credit.licence.cycle'] : []}
      sources={(
        <>
          {/* A tour is summed from its stages, so its totals are calculated.
              A route's length and climb are read off the geometry; the
              surface mix, the traffic-free share and the safety figure are
              our arithmetic on it, and the safety one is a house measure. */}
          {tour ? (
            <FigureFooter kinds={[
              tour.days != null && 'c', tour.km != null && 'c', tour.asc != null && 'c',
            ]} />
          ) : route && (
            <FigureFooter kinds={[
              route.km != null && 'm', route.asc != null && 'm',
              carta.surface?.bike && 'c',
              trafficFreeLine(carta.surface, t) && 'c',
              carta.safety && 'c',
            ]} />
          )}
          {/* One credit line. The wire's own attribution is the specific
              one (it names the source that supplied this route);
              cycle.sourceNote is the generic fallback. */}
          {route && (
            <p className="places-credit" data-testid="cycle-credit">
              {(route.osm && route.osm.attribution) || t('cycle.sourceNote')}
            </p>
          )}
        </>
      )}
    />
  );
}

export default CyclePage;
