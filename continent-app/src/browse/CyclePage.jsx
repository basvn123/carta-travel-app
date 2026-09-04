import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useI18n } from '../i18n/index.jsx';
import { count } from '../lib/format.js';
import { NearbyOutdoors } from './NearbyOutdoors.jsx';
import { loadCycling } from '../lib/cycling.js';
import { loadCycleFamily, loadCycleRoute, loadCycleTour, gpxCredit }
  from '../lib/cycling.js';
import {
  agreementLine, bailoutLine, bikeLine, countryPhrase, listedLine, overnightLine,
  paceLine, safetyLine, seasonLine, stageLine, surfaceLine, trafficFreeLine, whyLines,
} from '../lib/cycleStory.js';
import {
  cycleRating, netLabelKey, bikeLabelKey, cycleShareUrl, tourShareUrl,
} from '../lib/cycleCards.js';
import { shareTrailLink } from '../lib/trailExport.js';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { RatingBadge } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import {
  ArrowLeftIcon, CameraIcon, BikeIcon, TrainIcon, ClockIcon, ShareIcon,
  DownloadIcon, LinkIcon, LoopIcon, CompassIcon, ShieldIcon, RoadIcon,
  MountainIcon, BeachIcon, LeafIcon, EyeIcon, SwimIcon, BootIcon, BedIcon,
  CheckIcon, BulbIcon,
} from '../components/Icons.jsx';
import { isNum } from '../map/coords.js';

/**
 * The cycling page: one signed route, or one tour composed over routes, as a
 * page of its own in the trail page's shell. Same bar, same map at the top,
 * same facts grid, same "why", same primary action, so a reader who has
 * opened a walk has already opened a ride.
 *
 * A TOUR is the thing worth opening, and this page is built around the
 * question a tour has to answer that no incumbent answers: what is each day,
 * where does it end, and is there a bed there. Every figure on the stage list
 * was measured on that day's own slice of the route, not inherited from the
 * route as a whole, which is why "day three is 84 km with 620 m of climbing,
 * ending at Kinlochleven where fourteen places take a booking, and the
 * nearest station is 18 km away" is a sentence this app can write and a
 * generated itinerary cannot.
 *
 * A ROUTE is the catalogue entry underneath: the line, what it is surfaced
 * with, how much traffic is on it, and whether the official source draws the
 * same line we do.
 *
 * Three things this page is careful about.
 *
 *   A listed route has no score, so there is no score chip and no scenic
 *   figure, and the page says why in one line. The wire omits the key; this
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
 * Loaded lazily, so maplibre stays out of the main bundle.
 */

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// The month names the mountain layer already ships in all six languages.
const MONTHS = ['mtn.monthJan', 'mtn.monthFeb', 'mtn.monthMar', 'mtn.monthApr',
  'mtn.monthMay', 'mtn.monthJun', 'mtn.monthJul', 'mtn.monthAug',
  'mtn.monthSep', 'mtn.monthOct', 'mtn.monthNov', 'mtn.monthDec'];

const STORY_ICONS = {
  compass: CompassIcon, shield: ShieldIcon, road: RoadIcon, gravel: RoadIcon,
  mountain: MountainIcon, coast: BeachIcon, leaf: LeafIcon, eye: EyeIcon,
  water: SwimIcon, boot: BootIcon, loop: LoopIcon, clock: ClockIcon,
  bed: BedIcon, train: TrainIcon, dot: CheckIcon,
};

const km1 = (m) => (m / 1000).toFixed(1).replace(/\.0$/, '');
const pct = (share) => (isNum(share) ? `${Math.round(share * 100)}%` : null);

/** A design token as a concrete colour: MapLibre paint properties cannot read
 *  a CSS variable, and the route should not carry its own private palette. */
function token(name, fallback) {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** The parts of a LineString or MultiLineString, as [lon, lat] rings. */
function rings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

function Fact({ label, value, word = false, title }) {
  return (
    <div className="tpage-fact" title={title}>
      <span className={`tpage-fact-val ${word ? 'is-word' : ''}`}>{value}</span>
      <span className="tpage-fact-label">{label}</span>
    </div>
  );
}

/** The elevation profile as an instrument chart, the trail page's own. */
function ElevationChart({ elevation, t }) {
  const profile = elevation?.profile;
  if (!Array.isArray(profile) || profile.length < 2) return null;
  const W = 600; const H = 110; const PAD = 6;
  const total = profile[profile.length - 1][0] || 1;
  const eMin = elevation.ele_min_m ?? Math.min(...profile.map((p) => p[1]));
  const eMax = elevation.ele_max_m ?? Math.max(...profile.map((p) => p[1]));
  const span = Math.max(1, eMax - eMin);
  const pts = profile.map(([m, e]) => (
    `${PAD + (m / total) * (W - PAD * 2)},${H - PAD - ((e - eMin) / span) * (H - PAD * 2)}`
  ));
  return (
    <div className="tpage-elev">
      <svg viewBox={`0 0 ${W} ${H}`} className="tpage-elev-svg" role="img" aria-label={t('trails.elevTitle')} preserveAspectRatio="none">
        <polyline points={`${PAD},${H - PAD} ${pts.join(' ')} ${W - PAD},${H - PAD}`} className="tpage-elev-area" />
        <polyline points={pts.join(' ')} className="tpage-elev-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="tpage-elev-axis">
        <span>{Math.round(eMin)} m</span>
        <span>{Math.round(eMax)} m {t('trails.elevMax')}</span>
      </div>
    </div>
  );
}

/** Build a GPX with the credit inside the file, and hand it to the browser. */
function downloadGpx(name, geometry, credit) {
  const parts = rings(geometry);
  if (!parts.length) return false;
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
  return true;
}

/**
 * What the ride looks like: the photographs the photo pass found on the
 * route, ordered along it. Commons requires the licence and the author to
 * travel with the file, so both ride on the frame itself.
 */
function ViewStrip({ images, t }) {
  const [open, setOpen] = useState(null);
  if (!Array.isArray(images) || !images.length) return null;
  return (
    <section className="tpage-sec" data-testid="cycle-gallery">
      <h2 className="tpage-sec-title">{t('trails.viewsTitle')}</h2>
      <div className="tpage-views">
        {images.slice(0, 8).map((im, i) => (
          <button
            type="button"
            key={im.url || im.thumb}
            className="tpage-view"
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
          >
            <img src={im.thumb || im.url} alt={im.title || ''} loading="lazy" />
            {isNum(im.along_m) && (
              <span className="tpage-view-at">
                {t('trails.viewAt', { km: km1(im.along_m) })}
              </span>
            )}
            {open === i && (
              <span className="tpage-view-credit">
                <CameraIcon size={11} />
                {' '}
                {[im.author, im.license].filter(Boolean).join(', ')}
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="tpage-credit tpage-views-credit">{t('trails.viewsCredit')}</p>
    </section>
  );
}

function Stages({ stages, t }) {
  if (!stages || !stages.length) return null;
  return (
    <ol className="cycle-stages" data-testid="cycle-stages">
      {stages.map((s) => (
        <li key={s.d} className="cycle-stage" data-testid="cycle-stage">
          <p className="cycle-stage-day">{s.d}</p>
          <div className="cycle-stage-body">
            <p className="cycle-stage-line">{stageLine(s, t)}</p>
            <p className="cycle-stage-sleep">
              <BedIcon size={12} />
              {' '}
              {overnightLine(s.to, t)}
            </p>
            <p className="cycle-stage-meta">
              {[
                s.paved_share != null && t('cycle.stagePaved', { pct: Math.round(s.paved_share * 100) }),
                s.traffic_free_share != null
                  && trafficFreeLine({ traffic_free_share: s.traffic_free_share }, t),
                s.safety != null && safetyLine({ score: s.safety, known_share: 1 }, t),
              ].filter(Boolean).join('. ')}
            </p>
            {bailoutLine(s.bailout, t) && (
              <p className="cycle-stage-bail">
                <TrainIcon size={12} />
                {' '}
                {bailoutLine(s.bailout, t)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * The map at the top of the page: the route line on real tiles, fitted to
 * its bounding box. The trail page's map without the follow mode.
 */
function RouteMap({ geometry, bbox }) {
  const mapEl = useRef(null);
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
      map.addSource('ride', { type: 'geojson', data: empty });
      map.addLayer({
        id: 'ride-casing', type: 'line', source: 'ride',
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'ride-line', type: 'line', source: 'ride',
        paint: { 'line-color': token('--accent', '#e05a47'), 'line-width': 3.4 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.resize();
      map._rideReady = true;
      map._draw?.();
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const fit = useCallback(() => {
    const map = mapRef.current;
    const [w, s, e, n] = bbox || [];
    if (map && [w, s, e, n].every(isNum)) {
      map.fitBounds([[w, s], [e, n]], { padding: 40, duration: 0, maxZoom: 13 });
    }
  }, [bbox]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const draw = () => {
      const parts = rings(geometry).filter((r) => r.length > 1);
      map.getSource('ride')?.setData({
        type: 'Feature', properties: {},
        geometry: { type: 'MultiLineString', coordinates: parts },
      });
      const first = parts[0]?.[0];
      if (first) {
        if (!map._startMarker) {
          const el = document.createElement('span');
          el.className = 'tpage-start-pin';
          map._startMarker = new maplibregl.Marker({ element: el }).setLngLat(first).addTo(map);
        } else {
          map._startMarker.setLngLat(first);
        }
      }
      fit();
    };
    if (map._rideReady) draw();
    else map._draw = draw;
  }, [geometry, fit]);

  return <div className="tpage-map" ref={mapEl} />;
}

/**
 * A EUROVELO FAMILY is its own kind of page and therefore its own component.
 * In OSM a EuroVelo is one relation PER COUNTRY SECTION under a superroute,
 * so this is a manifest of the sections that make one continental route up,
 * not a route: there is no geometry to draw, no score, and none of the route
 * page's hooks apply.
 */
export function CycleFamilyPage({ familyRef, onClose }) {
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

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="tpage" role="dialog" aria-modal="true" aria-label={familyRef} data-testid="cycle-family-page">
      <div className="tpage-bar">
        <button type="button" className="tpage-back" onClick={onClose}>
          <ArrowLeftIcon size={15} />
          <span>{t('trails.back')}</span>
        </button>
        <span className="tpage-bar-title on">{familyRef}</span>
        <span className="tpage-bar-act" aria-hidden="true" />
      </div>
      <div className="tpage-scroll">
        <div className="tpage-col">
          {loading && <p className="places-empty">{'…'}</p>}
          {!loading && !family && <p className="places-empty">{t('cycle.familyGone')}</p>}
          {!loading && family && (
            <>
              <div className="tpage-head">
                <span className="places-card-kind">{t('cycle.familiesTitle')}</span>
                <h1 className="tpage-title">{family.ref}</h1>
                <div className="tpage-sub">
                  <span>
                    {t('cycle.familySummary', {
                      km: count(family.km),
                      sections: family.n_sections,
                      countries: countryPhrase(family.countries.length, t),
                    })}
                  </span>
                </div>
              </div>
              {family.ecf_agreement != null && (
                <p className="tpage-note">
                  {t('cycle.familyEcf', { pct: Math.round(family.ecf_agreement * 100) })}
                </p>
              )}
              <section className="tpage-sec">
                <h2 className="tpage-sec-title">{t('cycle.familySections')}</h2>
                <ul className="cycle-famlist">
                  {(family.sections || []).map((sec) => (
                    <li key={sec.id} className="cycle-famitem">
                      <CountryFlag country={sec.cc} size={13} />
                      <span className="cycle-famitem-name">
                        {sec.name || `${sec.cc} ${sec.km} km`}
                      </span>
                      <span className="cycle-famitem-km">{sec.km} km</span>
                      {!sec.published && (
                        <span className="cycle-famitem-un">
                          {t('cycle.familyUnpublished')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
              <p className="tpage-credit">{family.attribution}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function CyclePage({ routeId, tourSlug, country, countryName,
                            onClose, onOpenNeighbour }) {
  const { t } = useI18n();
  const paywall = usePaywall();
  const [route, setRoute] = useState(null);
  const [tour, setTour] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [titleGone, setTitleGone] = useState(false);
  const scrollEl = useRef(null);
  const titleEl = useRef(null);

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
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  // The bar repeats the name only once the heading itself has scrolled away.
  useEffect(() => {
    const el = titleEl.current;
    const root = scrollEl.current;
    if (!el || !root) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => setTitleGone(!entry.isIntersecting),
      { root, threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loading]);

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
  const osm = (route && route.osm) || {};
  const geometry = (tour && tour.geometry) || osm.geometry || null;
  const bbox = (tour && tour.bbox) || (route && route.bbox) || null;
  const why = useMemo(() => whyLines(carta.reasons, t, 6), [carta.reasons, t]);
  const rated = Boolean(route && route.t === 'r');
  const rating = rated ? cycleRating({ score: carta.score, t: route.t }) : null;
  const title = (tour && tour.title) || (route && route.name) || '';
  const isTour = Boolean(tour);
  const cc = (tour && tour.country) || (route && route.country) || country;
  const loop = isTour ? false : Boolean(route && route.loop);
  const netKey = route ? netLabelKey(route.net) : null;

  // The facts, six for a tour and six for a route, in the order a rider
  // reads them. Percentages are measured shares and stay in mono; the bike
  // and the network are words and leave the mono column.
  const facts = [];
  if (isTour) {
    facts.push({ key: 'days', label: t('cycle.factDays'), value: String(tour.days) });
    facts.push({ key: 'km', label: t('trails.factDistance'), value: `${Math.round(tour.km)} km` });
    if (isNum(tour.asc)) facts.push({ key: 'asc', label: t('trails.factAscent'), value: `${Math.round(tour.asc)} m` });
    if (tour.days > 0) facts.push({ key: 'perday', label: t('cycle.factPerDay'), value: `${Math.round(tour.km / tour.days)} km` });
    const pace = tour.pace === 'relaxed' ? 'cycle.paceShortRelaxed'
      : tour.pace === 'strong' ? 'cycle.paceShortStrong' : 'cycle.paceShortBalanced';
    facts.push({ key: 'pace', label: t('cycle.factPace'), value: t(pace), title: paceLine(tour.pace, t) || undefined, word: true });
    if (bikeLabelKey(tour.bike)) facts.push({ key: 'bike', label: t('cycle.factBike'), value: t(bikeLabelKey(tour.bike)), word: true });
  } else if (route) {
    const surface = carta.surface || {};
    if (isNum(route.km)) facts.push({ key: 'km', label: t('trails.factDistance'), value: `${route.km} km` });
    if (isNum(route.asc)) facts.push({ key: 'asc', label: t('trails.factAscent'), value: `${Math.round(route.asc)} m` });
    if (pct(surface.paved_share)) facts.push({ key: 'paved', label: t('cycle.factPaved'), value: pct(surface.paved_share) });
    if (pct(surface.traffic_free_share)) facts.push({ key: 'free', label: t('cycle.factCarFree'), value: pct(surface.traffic_free_share) });
    const bikeKey = bikeLabelKey(surface.bike);
    if (bikeKey) facts.push({ key: 'bike', label: t('cycle.factBike'), value: t(bikeKey), word: true });
    if (netKey) facts.push({ key: 'net', label: t('cycle.factNetwork'), value: t(netKey), word: true });
  }

  // What the riding is like, as a run of measured sentences.
  const riding = useMemo(() => {
    if (!route) return [];
    const lines = [
      { key: 'surface', icon: RoadIcon, text: surfaceLine(carta.surface, t), testid: 'cycle-surface' },
      { key: 'free', icon: ShieldIcon, text: trafficFreeLine(carta.surface, t) },
      { key: 'bike', icon: BikeIcon, text: bikeLine(carta.surface && carta.surface.bike, t) },
      { key: 'safety', icon: ShieldIcon, text: safetyLine(carta.safety, t), testid: 'cycle-safety' },
      { key: 'agree', icon: CheckIcon, text: agreementLine(carta.agreement, t), testid: 'cycle-agree' },
    ];
    return lines.filter((l) => l.text);
  }, [route, carta.surface, carta.safety, carta.agreement, t]);

  const shareUrl = isTour ? tourShareUrl(tour.slug) : cycleShareUrl(route, cc);
  const onShare = async () => {
    const how = await shareTrailLink(title, shareUrl);
    if (how === 'copied') setToast(t('trails.copied'));
  };
  const onGpx = () => {
    if (!paywall.require('export')) return;
    if (!geometry) return;
    if (downloadGpx(title, geometry, gpxCredit(route))) setToast(t('trails.savedGpx'));
  };

  return (
    <div className="tpage" role="dialog" aria-modal="true" aria-label={title || t('places.catCycling')} data-testid="cycle-page">
      <div className="tpage-bar">
        <button type="button" className="tpage-back" onClick={onClose}>
          <ArrowLeftIcon size={15} />
          <span>{t('trails.back')}</span>
        </button>
        <span className={`tpage-bar-title ${titleGone ? 'on' : ''}`}>{title}</span>
        <button type="button" className="tpage-bar-act" onClick={onShare} aria-label={t('trails.shareLink')}>
          <ShareIcon size={15} />
        </button>
      </div>

      <div className="tpage-scroll" ref={scrollEl}>
        <div className="tpage-hero">
          {geometry && <RouteMap geometry={geometry} bbox={bbox} />}
        </div>

        <div className="tpage-col">
          {loading && <p className="places-empty">{'…'}</p>}

          {!loading && !route && !tour && (
            <p className="places-empty">{t('cycle.emptyCountry')}</p>
          )}

          {!loading && (route || tour) && (
            <>
              <div className="tpage-head">
                <span className="places-card-kind">
                  {isTour ? t('cycle.kindTour') : t(netKey || 'cycle.kindRoute')}
                </span>
                <h1 className="tpage-title" ref={titleEl} data-testid="cycle-name">{title}</h1>
                <div className="tpage-sub">
                  <span>
                    <CountryFlag country={cc} size={12} className="places-card-flag" />
                    {countryName}
                    {route && route.ref ? `, ${route.ref}` : ''}
                  </span>
                  {rating && (
                    <span data-testid="cycle-score">
                      <RatingBadge rating={rating} size="xs" showGem={false} />
                    </span>
                  )}
                  {loop && (
                    <span className="tpage-loop">
                      <LoopIcon size={12} />
                      {t('trails.loop')}
                    </span>
                  )}
                </div>
              </div>

              <div className="tpage-facts" data-n={facts.length}>
                {facts.map(({ key, ...f }) => <Fact key={key} {...f} />)}
              </div>

              {/* Season and bike as chips, the way the trail page carries
                  what a walk passes. */}
              {isTour && seasonLine(tour.season, t, monthName) && (
                <div className="tpage-chips">
                  <span className="tpage-chip tpage-chip-hl" data-testid="cycle-season">
                    {seasonLine(tour.season, t, monthName)}
                  </span>
                </div>
              )}

              {/* A listed route says what it is, as provenance rather than
                  as a feature. */}
              {route && !isTour && !rated && (
                <div className="tpage-provenance">
                  <p>{listedLine(t)}</p>
                </div>
              )}

              {/* The argument for the ride: measured reasons, each checkable
                  against the map. */}
              {why.length > 0 && (
                <section className="tpage-sec tpage-why">
                  <h2 className="tpage-sec-title">{t('cycle.whyTitle')}</h2>
                  <ul className="tpage-story" data-testid="cycle-why">
                    {why.map((line) => {
                      const Icon = STORY_ICONS[line.icon] || CheckIcon;
                      return (
                        <li key={line.text}>
                          <span className="tpage-story-icon"><Icon size={14} /></span>
                          <span>{line.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {/* Taking it away: the GPX, with the credit inside the file,
                  is the primary action; the link is the secondary. */}
              {geometry && (
                <>
                  <button type="button" className="tpage-primary" data-testid="cycle-gpx" onClick={onGpx}>
                    <DownloadIcon size={16} />
                    <span>{t('cycle.gpx')}</span>
                  </button>
                  <div className="tpage-acts">
                    <button type="button" className="tpage-act" onClick={onShare}>
                      <LinkIcon size={15} />
                      <span>{t('trails.shareLink')}</span>
                    </button>
                  </div>
                </>
              )}

              {isTour && (
                <section className="tpage-sec" data-testid="cycle-tour">
                  <h2 className="tpage-sec-title">{t('cycle.stagesTitle')}</h2>
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
                </section>
              )}

              {route && riding.length > 0 && (
                <section className="tpage-sec" data-testid="cycle-route">
                  <h2 className="tpage-sec-title">{t('cycle.surfaceTitle')}</h2>
                  <ul className="tpage-story">
                    {riding.map((line) => {
                      const Icon = line.icon;
                      return (
                        <li key={line.key} data-testid={line.testid}>
                          <span className="tpage-story-icon"><Icon size={14} /></span>
                          <span>{line.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="tpage-note">
                    <BulbIcon size={11} />
                    {' '}
                    {t('cycle.safetyHouse')}
                  </p>
                </section>
              )}

              <ViewStrip images={carta.images} t={t} />

              {carta.elevation && (
                <section className="tpage-sec">
                  <h2 className="tpage-sec-title">{t('trails.elevTitle')}</h2>
                  <ElevationChart elevation={carta.elevation} t={t} />
                </section>
              )}

              {wireRow && (
                <NearbyOutdoors
                  row={wireRow}
                  cc={country}
                  headings={{ trail: 'nb.cycle.trail', peak: 'nb.cycle.peak', lake: 'nb.cycle.lake', beach: 'nb.cycle.beach' }}
                  onOpen={onOpenNeighbour}
                />
              )}

              <p className="tpage-credit" data-testid="cycle-credit">
                {osm.attribution || t('cycle.sourceNote')}
              </p>
              {osm.attribution && <p className="tpage-credit">{t('cycle.sourceNote')}</p>}
            </>
          )}
        </div>
      </div>

      {toast && <div className="tpage-toast" role="status">{toast}</div>}
    </div>
  );
}

export default CyclePage;
