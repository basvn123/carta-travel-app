import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { loadTrail } from '../lib/trails.js';
import {
  haversineKm, stopNameFromRef, trailRating,
  tripGrade, gradeIsDerived, tripRouteType, tripHighlights,
  tripSuitability, suitabilityIsDerived, isListed, isDerivedRoute,
  portalVerified, HIGHLIGHTS, SUITABILITY, ROUTE_TYPES,
} from '../lib/trailCards.js';
import { trailStory, trailReasons } from '../lib/trailStory.js';
import {
  routePoints, routeLength, nearestOnRoute, sliceRoute, remainingRelief,
  hikeTimeMin, isLoopRoute,
} from '../lib/trailGeo.js';
import {
  trailGpx, trailKml, trailFileBase, trailShareUrl, trailheadDirectionsUrl,
  shareOrDownloadFile, shareTrailLink, stopNamesOf, downloadTextFile,
} from '../lib/trailExport.js';
import { eur } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';
import { NearbyOutdoors } from './NearbyOutdoors.jsx';
import { usePaywall } from '../hooks/usePaywall.jsx';
import {
  ArrowLeftIcon, ShareIcon, DownloadIcon, CompassIcon, RouteIcon, BootIcon,
  ClockIcon, MountainIcon, MapPinIcon, CheckIcon, ListDayIcon, CloseIcon,
  ChevronRightIcon, LinkIcon, EyeIcon, SwimIcon, BeachIcon, CastleIcon,
  BedIcon, BottleIcon, LoopIcon, StarIcon, CameraIcon,
} from '../components/Icons.jsx';
import { RatingBadge } from '../components/RatingBadge.jsx';
import { isNum } from '../map/coords.js';

/**
 * The trail page: a published hike or city day as a page of its own, opened
 * from a card in the Destinations tab or from a shared #trail= link.
 *
 * It answers the four things a walker asks, in this order:
 *   where does it go        the route on a real map, elevation under it
 *   what is it like         composed lines, not the pipeline's boilerplate
 *                           (lib/trailStory.js)
 *   can I follow it here    yes: live GPS against the line, progress, remaining
 *                           climb, an off-route warning, the screen kept awake
 *   can I take it with me   GPX for hiking apps, KML for Google My Maps, a
 *                           link for anyone (lib/trailExport.js)
 *
 * Loaded lazily so maplibre stays out of the main bundle. The card's
 * simplified line draws at once and the full-resolution geometry from
 * /trails/trip/{id}.json replaces it when it arrives, which is also what the
 * exports and the follow maths switch to.
 */

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

const hoursText = (min) => {
  const h = min / 60;
  return h >= 10 ? String(Math.round(h)) : h.toFixed(1);
};
const km1 = (m) => (m / 1000).toFixed(1).replace(/\.0$/, '');

/** A design token as a concrete colour: MapLibre paint properties cannot read
 *  a CSS variable, and the route should not carry its own private palette. */
function token(name, fallback) {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Code to label key, built from the shared filter model rather than written
// out again, so a value added to trailCards.js cannot go missing on the page.
const GRADE_LABEL = {
  easy: 'trails.gradeEasy', moderate: 'trails.gradeModerate',
  hard: 'trails.gradeHard', very_hard: 'trails.gradeVeryHard',
  alpine: 'trails.gradeAlpine',
};
const ROUTE_LABEL = Object.fromEntries(
  ROUTE_TYPES.map(({ key, labelKey }) => [key, labelKey]));
const HIGHLIGHT_LABEL = Object.fromEntries(
  HIGHLIGHTS.map(({ key, labelKey }) => [key, labelKey]));
const SUIT_LABEL = Object.fromEntries(
  SUITABILITY.map(({ key, labelKey }) => [key, labelKey]));

const STORY_ICONS = {
  route: RouteIcon, boot: BootIcon, clock: ClockIcon, mountain: MountainIcon,
  compass: CompassIcon, pin: MapPinIcon, check: CheckIcon, list: ListDayIcon,
  // Added for the reason codes (lib/trailStory.js trailReasons).
  eye: EyeIcon, water: SwimIcon, coast: BeachIcon, castle: CastleIcon,
  hut: BedIcon, spring: BottleIcon, loop: LoopIcon, star: StarIcon,
  camera: CameraIcon,
};

/**
 * What the walk looks like: the photographs the photo pass found ON the route.
 *
 * Every frame was shot within 400 m of the line (pipeline/trails/
 * trail_images.py), and they are ordered along the walk rather than by score,
 * so scrolling the strip is roughly walking it. The distance marker under each
 * one is the honest version of a caption: it says where you would be standing.
 *
 * Commons requires the licence and the author to travel with the file, so both
 * ride on the frame itself and the whole strip carries the source line.
 */
function ViewStrip({ images, t }) {
  const [open, setOpen] = useState(null);
  if (!Array.isArray(images) || !images.length) return null;
  return (
    <section className="tpage-sec">
      <h2 className="tpage-sec-title">{t('trails.viewsTitle')}</h2>
      <div className="tpage-views">
        {images.map((im, i) => (
          <button
            type="button"
            key={im.u}
            className="tpage-view"
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
          >
            <img src={im.u} alt={im.caption || im.title || ''} loading="lazy" />
            {isNum(im.along_m) && (
              <span className="tpage-view-at">
                {t('trails.viewAt', { km: km1(im.along_m) })}
              </span>
            )}
            {open === i && (
              <span className="tpage-view-credit">
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

/** The elevation profile as an instrument chart, with the walker's position on
 *  it while following. */
function ElevationChart({ elevation, atM, t }) {
  const profile = elevation?.profile;
  if (!Array.isArray(profile) || profile.length < 2) return null;
  const W = 320, H = 84, PAD = 2;
  const dMax = profile[profile.length - 1][0] || 1;
  const eMin = elevation.ele_min_m ?? Math.min(...profile.map((p) => p[1]));
  const eMax = elevation.ele_max_m ?? Math.max(...profile.map((p) => p[1]));
  const span = Math.max(1, eMax - eMin);
  const x = (d) => PAD + (Math.min(1, d / dMax)) * (W - 2 * PAD);
  const y = (e) => H - PAD - ((e - eMin) / span) * (H - 2 * PAD);
  const pts = profile.map(([d, e]) => `${x(d).toFixed(1)},${y(e).toFixed(1)}`);
  const here = isNum(atM) ? x(atM) : null;
  return (
    <div className="tpage-elev">
      {/* Stretched to the column's width, so every stroke opts out of the
          non-uniform scale or the vertical marker ends up fatter than the
          profile line. */}
      <svg viewBox={`0 0 ${W} ${H}`} className="tpage-elev-svg" role="img" aria-label={t('trails.elevTitle')} preserveAspectRatio="none">
        <polyline points={`${PAD},${H - PAD} ${pts.join(' ')} ${W - PAD},${H - PAD}`} className="tpage-elev-area" />
        <polyline points={pts.join(' ')} className="tpage-elev-line" vectorEffect="non-scaling-stroke" />
        {here != null && (
          <line x1={here} y1={PAD} x2={here} y2={H - PAD} className="tpage-elev-here" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div className="tpage-elev-axis">
        <span>{Math.round(eMin)} m</span>
        <span>{Math.round(eMax)} m {t('trails.elevMax')}</span>
      </div>
    </div>
  );
}

/**
 * Live position against the route: a geolocation watch plus a screen wake
 * lock, because a walker who checks progress every few minutes should not have
 * to unlock the phone each time. Returns the last fix and, if it failed, why.
 */
function useLiveFix(active) {
  const [fix, setFix] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!active) { setFix(null); setErr(null); return undefined; }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErr('unsupported');
      return undefined;
    }
    let live = true;
    let lock = null;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        if (!live) return;
        setErr(null);
        setFix({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accM: pos.coords.accuracy ?? null,
          at: pos.timestamp,
        });
      },
      (e) => { if (live) setErr(e?.code === 1 ? 'denied' : 'unavailable'); },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
    const takeLock = () => {
      if (!navigator.wakeLock?.request || lock) return;
      navigator.wakeLock.request('screen').then((l) => {
        if (!live) { l.release().catch(() => {}); return; }
        lock = l;
        l.addEventListener?.('release', () => { lock = null; });
      }).catch(() => { /* not granted, the watch still works */ });
    };
    takeLock();
    // A lock is dropped when the tab is hidden, so it has to be retaken.
    const onVis = () => { if (document.visibilityState === 'visible') takeLock(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      live = false;
      navigator.geolocation.clearWatch(watch);
      document.removeEventListener('visibilitychange', onVis);
      try { lock?.release(); } catch { /* already gone */ }
    };
  }, [active]);

  return { fix, err };
}

/** One fact in the strip: the value over a small label. Measured numbers are
 *  mono; a word (the difficulty) is not a measurement and stays in the sans. */
function Fact({ label, value, word = false, title }) {
  return (
    <div className="tpage-fact" title={title}>
      <span className={`tpage-fact-val ${word ? 'is-word' : ''}`}>{value}</span>
      <span className="tpage-fact-label">{label}</span>
    </div>
  );
}

export function TrailPage({ card, onClose, onSelectDest, onOpenNeighbour }) {
  const { t } = useI18n();
  const paywall = usePaywall();
  const { tr, assoc, kindKey, price } = card;
  const isCityDay = tr.category === 'citytrip';
  const [detail, setDetail] = useState(null);
  const [follow, setFollow] = useState(false);
  const [centred, setCentred] = useState(true);
  const [toast, setToast] = useState(null);
  // The bar repeats the name only once the heading itself has scrolled away
  // (or while following, when the map covers the heading).
  const [titleGone, setTitleGone] = useState(false);
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const scrollEl = useRef(null);
  const titleEl = useRef(null);

  useEffect(() => {
    let live = true;
    loadTrail(tr.id).then((d) => { if (live) setDetail(d); });
    return () => { live = false; };
  }, [tr.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (follow) setFollow(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, follow]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

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
  }, []);

  const src = detail || tr;
  const pts = useMemo(() => routePoints(src.geometry), [src]);
  const lineM = useMemo(() => routeLength(pts), [pts]);
  const totalM = isNum(src.distance_m) ? src.distance_m : lineM;
  // The wire's own answer wins. curate.py decides it from the full-resolution
  // geometry (or from the mapper's roundtrip tag, which knows about figures of
  // eight that endpoints alone would miss), while isLoopRoute here can only
  // read the card's line, simplified to 90 m for the placeholder sketch.
  // Measuring it again from that is a worse answer to a question already
  // answered. The fallback stays for a wire published before is_loop existed.
  const loop = typeof src.is_loop === 'boolean'
    ? src.is_loop
    : (pts.length ? isLoopRoute(pts) : null);
  const start = pts.length ? pts[0] : null;

  const nearby = assoc.dest
    ? { city: assoc.dest.city, km: isCityDay ? 0 : assoc.km }
    : null;
  // How far the TRAILHEAD is from the nearest town. assoc.km is measured from
  // the middle of the route, which on a long walk is a different place.
  const startKm = start && assoc.dest
    ? haversineKm(start.lat, start.lon,
      assoc.dest.city_lat ?? assoc.dest.lat, assoc.dest.city_lon ?? assoc.dest.lon)
    : null;
  const story = useMemo(
    () => trailStory(tr, detail, { t, loop, nearby }),
    [tr, detail, t, loop, nearby?.city, nearby?.km], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Why this one. The card already carries the first three codes, so the
  // section is populated on the first frame and simply lengthens when the
  // detail file lands with the rest.
  const why = useMemo(
    () => trailReasons(detail?.reasons || tr.reasons, t),
    [detail?.reasons, tr.reasons, t],
  );
  const rating = trailRating(detail || tr);

  const { fix, err: fixErr } = useLiveFix(follow);
  const onRoute = useMemo(
    () => (fix && pts.length ? nearestOnRoute(pts, fix.lat, fix.lon) : null),
    [fix, pts],
  );
  // The line is a simplification of the route, so progress is reported on the
  // wire's own total: 12.3 of 19.3 km, never 12.3 of a number nothing shows.
  const doneM = onRoute && lineM > 0 ? onRoute.m * (totalM / lineM) : 0;
  const offRoute = onRoute && onRoute.offM > Math.max(60, (fix?.accM || 0) + 25);
  const leftM = Math.max(0, totalM - doneM);
  const relief = onRoute ? remainingRelief(detail?.elevation?.profile, onRoute.m) : null;
  const timeLeft = hikeTimeMin(leftM, relief?.up ?? 0, relief?.down ?? 0);

  /* ── Map ─────────────────────────────────────────────────────────────── */

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
      map.addSource('trail', { type: 'geojson', data: empty });
      map.addSource('trail-done', { type: 'geojson', data: empty });
      map.addLayer({
        id: 'trail-casing', type: 'line', source: 'trail',
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'trail-line', type: 'line', source: 'trail',
        paint: { 'line-color': token('--accent', '#e05a47'), 'line-width': 3.4 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      // What has been walked drops back to the muted ink, so the route ahead
      // is the only thing still wearing the action colour.
      map.addLayer({
        id: 'trail-done-line', type: 'line', source: 'trail-done',
        paint: { 'line-color': token('--ink-mute', '#7d8393'), 'line-width': 3.4, 'line-opacity': 0.85 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.resize();
      map._trailReady = true;
      map._draw?.();
    });
    // Dragging the map means the walker wants to look somewhere else.
    map.on('dragstart', () => setCentred(false));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const fitRoute = useCallback(() => {
    const map = mapRef.current;
    const [w, s, e, n] = src.bbox || tr.bbox || [];
    if (map && [w, s, e, n].every(isNum)) {
      map.fitBounds([[w, s], [e, n]], { padding: 40, duration: 0, maxZoom: 14 });
    }
  }, [src.bbox, tr.bbox]);

  // The route itself, plus the walked part in grey once following.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const draw = () => {
      const split = follow && onRoute ? sliceRoute(pts, onRoute.m) : null;
      const rest = split ? [split.rest] : [pts.map((p) => [p.lon, p.lat])];
      map.getSource('trail')?.setData({
        type: 'Feature', properties: {},
        geometry: { type: 'MultiLineString', coordinates: rest.filter((l) => l.length > 1) },
      });
      map.getSource('trail-done')?.setData({
        type: 'Feature', properties: {},
        geometry: { type: 'MultiLineString', coordinates: split && split.done.length > 1 ? [split.done] : [] },
      });
      if (start) {
        if (!map._startMarker) {
          const el = document.createElement('span');
          el.className = 'tpage-start-pin';
          map._startMarker = new maplibregl.Marker({ element: el }).setLngLat([start.lon, start.lat]).addTo(map);
        } else {
          map._startMarker.setLngLat([start.lon, start.lat]);
        }
      }
    };
    if (map._trailReady) draw();
    else map._draw = draw;
  }, [pts, start, follow, onRoute]);

  // First fit, and a refit whenever the geometry is replaced or follow ends.
  // Never while following: there the map belongs to the walker's position.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || follow) return;
    if (map._trailReady) fitRoute();
    else map.once('load', fitRoute);
  }, [fitRoute, follow]);

  // The walker's own position, and the map following it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!fix) {
      map._meMarker?.remove();
      map._meMarker = null;
      return;
    }
    if (!map._meMarker) {
      const el = document.createElement('span');
      el.className = 'tpage-me';
      el.innerHTML = '<span class="tpage-me-dot"></span>';
      map._meMarker = new maplibregl.Marker({ element: el }).setLngLat([fix.lon, fix.lat]).addTo(map);
    } else {
      map._meMarker.setLngLat([fix.lon, fix.lat]);
    }
    if (centred) {
      map.easeTo({ center: [fix.lon, fix.lat], zoom: Math.max(map.getZoom(), 14.5), duration: 700 });
    }
  }, [fix, centred]);

  // Full screen while following: the map is the instrument, the page is not.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const timer = setTimeout(() => map.resize(), 60);
    return () => clearTimeout(timer);
  }, [follow]);

  const startFollow = () => { setCentred(true); setFollow(true); };

  /* ── Taking it away ──────────────────────────────────────────────────── */

  // Can this device hand a FILE to another app? On a phone that is the whole
  // handoff: Komoot, AllTrails, OsmAnd, Gaia GPS and Organic Maps all register
  // for .gpx, so the share sheet is the import flow. None of them has a public
  // import-by-link endpoint, so a button naming one app would be a promise we
  // cannot keep. On a desktop the answer is a download.
  const canShareFiles = useMemo(() => {
    try {
      if (typeof File === 'undefined' || typeof navigator === 'undefined' || !navigator.canShare) return false;
      return navigator.canShare({ files: [new File(['x'], 't.gpx', { type: 'application/gpx+xml' })] });
    } catch { return false; }
  }, []);

  const shareUrl = useMemo(() => trailShareUrl(tr), [tr]);
  const stopNames = useMemo(() => stopNamesOf(detail), [detail]);
  const factLine = [
    isNum(totalM) ? `${km1(totalM)} km` : '',
    isNum(src.duration_min) ? `${hoursText(src.duration_min)} h` : '',
    isNum(src.ascent_m) ? `+${Math.round(src.ascent_m)} m` : '',
  ].filter(Boolean).join(', ');

  const onGpx = async () => {
    if (!paywall.require('export')) return;
    const gpx = trailGpx(tr, detail, { link: shareUrl, stopNames });
    const how = await shareOrDownloadFile(trailFileBase(tr), gpx, 'gpx', tr.name);
    setToast(how === 'shared' ? null : t('trails.savedGpx'));
  };

  const onKml = () => {
    if (!paywall.require('export')) return;
    const kml = trailKml(tr, detail, { link: shareUrl, stopNames, factLine });
    downloadTextFile(trailFileBase(tr), kml, 'kml');
    setToast(t('trails.savedKml'));
  };

  const onShare = async () => {
    const how = await shareTrailLink(tr.name, shareUrl);
    if (how === 'copied') setToast(t('trails.copied'));
  };

  /* ── Render ──────────────────────────────────────────────────────────── */

  // The published five-value grade when attributes.py has reached this route,
  // validate.py's three-value effort class otherwise. Never both: a page that
  // said "Moderate" beside a chip that found it under "Hard" is the drift the
  // grade exists to end.
  const grade = tripGrade(src) || tripGrade(tr);
  const diffKey = grade ? GRADE_LABEL[grade]
    : tr.difficulty === 'easy' ? 'places.diffEasy'
      : tr.difficulty === 'moderate' ? 'places.diffModerate'
        : tr.difficulty === 'hard' ? 'places.diffHard' : null;
  const derivedGrade = gradeIsDerived(src) || gradeIsDerived(tr);
  const shapeKey = ROUTE_LABEL[tripRouteType(src) || tripRouteType(tr)];
  const highlightCodes = tripHighlights(src).length
    ? tripHighlights(src) : tripHighlights(tr);
  const suits = tripSuitability(src).length
    ? tripSuitability(src) : tripSuitability(tr);
  const listed = isListed(src) || isListed(tr);
  const portal = portalVerified(src) || portalVerified(tr);
  const family = detail?.family || tr.fam || null;
  const stops = detail?.stops;
  const ascent = detail?.ascent_m ?? tr.ascent_m;
  const dirUrl = start ? trailheadDirectionsUrl(start.lat, start.lon) : '';

  // The facts, in the order a walker reads them.
  //
  // A loop climbs exactly what it descends, so on a loop the descent cell
  // would only restate the ascent, and the elevation model's own noise made
  // it restate it wrongly (339 m up, 321 m down, on a route that ends where
  // it started). The low point takes that slot on a loop; on a one-way route
  // the descent IS the number and stays.
  const facts = [];
  if (isNum(totalM)) {
    facts.push({ key: 'distance', label: t('trails.factDistance'), value: `${km1(totalM)} km` });
  }
  if (isNum(src.duration_min)) {
    facts.push({
      key: 'time',
      label: t(isCityDay ? 'trails.factDay' : 'trails.factTime'),
      value: `${hoursText(src.duration_min)} h`,
    });
  }
  if (isCityDay) {
    if (isNum(tr.n_stops)) {
      facts.push({ key: 'stops', label: t('trails.factStops'), value: String(tr.n_stops) });
    }
  } else {
    if (isNum(ascent)) {
      facts.push({ key: 'ascent', label: t('trails.factAscent'), value: `${Math.round(ascent)} m` });
    }
    if (loop && isNum(detail?.elevation?.ele_min_m)) {
      facts.push({ key: 'low', label: t('trails.factLow'), value: `${Math.round(detail.elevation.ele_min_m)} m` });
    } else if (!loop && isNum(detail?.descent_m)) {
      facts.push({ key: 'descent', label: t('trails.factDescent'), value: `${Math.round(detail.descent_m)} m` });
    }
    if (isNum(detail?.elevation?.ele_max_m)) {
      facts.push({ key: 'high', label: t('trails.factHigh'), value: `${Math.round(detail.elevation.ele_max_m)} m` });
    }
    if (diffKey) {
      facts.push({
        key: 'grade',
        label: t('trails.factDifficulty'),
        value: t(diffKey) + (derivedGrade ? ' ~' : ''),
        title: derivedGrade ? t('trails.gradeDerived') : t('trails.gradeFrom'),
        word: true,
      });
    }
  }

  return (
    <div className={`tpage ${follow ? 'following' : ''}`} role="dialog" aria-modal="true" aria-label={tr.name}>
      <div className="tpage-bar">
        <button type="button" className="tpage-back" onClick={onClose}>
          <ArrowLeftIcon size={15} />
          <span>{t('trails.back')}</span>
        </button>
        <span className={`tpage-bar-title ${titleGone || follow ? 'on' : ''}`}>{tr.name}</span>
        <button type="button" className="tpage-bar-act" onClick={onShare} aria-label={t('trails.shareLink')}>
          <ShareIcon size={15} />
        </button>
      </div>

      <div className="tpage-scroll" ref={scrollEl}>
        <div className="tpage-hero">
          <div className="tpage-map" ref={mapEl} />
          {follow && (
            <div className="tpage-hud">
              <button type="button" className="tpage-hud-close" onClick={() => setFollow(false)} aria-label={t('trails.stopFollow')}>
                <CloseIcon size={15} />
              </button>
              {!centred && (
                <button type="button" className="tpage-recentre" onClick={() => setCentred(true)}>
                  <CompassIcon size={14} />
                  <span>{t('trails.recentre')}</span>
                </button>
              )}
              <div className="tpage-hud-card">
                {fixErr && (
                  <p className="tpage-hud-err">
                    {t(fixErr === 'denied' ? 'trails.geoDenied'
                      : fixErr === 'unsupported' ? 'trails.geoUnsupported' : 'trails.geoUnavailable')}
                  </p>
                )}
                {!fixErr && !fix && <p className="tpage-hud-wait">{t('trails.findingYou')}</p>}
                {fix && (
                  <>
                    {offRoute && (
                      <p className="tpage-hud-off">{t('trails.offRoute', { m: Math.round(onRoute.offM) })}</p>
                    )}
                    <div className="tpage-hud-top">
                      <span className="tpage-hud-done">{km1(doneM)}</span>
                      <span className="tpage-hud-of">{t('trails.hudOf', { total: km1(totalM) })}</span>
                    </div>
                    <div className="tpage-hud-track" aria-hidden="true">
                      <span className="tpage-hud-fill" style={{ width: `${Math.min(100, (doneM / Math.max(1, totalM)) * 100).toFixed(1)}%` }} />
                    </div>
                    <div className="tpage-hud-row">
                      <span>{t('trails.hudLeft', { km: km1(leftM) })}</span>
                      {relief?.up ? <span>{t('trails.hudClimbLeft', { m: relief.up })}</span> : null}
                      {timeLeft != null && <span>{t('trails.hudTimeLeft', { h: hoursText(timeLeft) })}</span>}
                      {fix.accM != null && <span className="tpage-hud-acc">{t('trails.hudAccuracy', { m: Math.round(fix.accM) })}</span>}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="tpage-col">
          <div className="tpage-head">
            <span className={`places-card-kind ${isCityDay ? 'city' : ''}`}>{t(kindKey)}</span>
            <h1 className="tpage-title" ref={titleEl}>{tr.name}</h1>
            <div className="tpage-sub">
              {assoc.dest && <span>{assoc.dest.city}, {assoc.dest.country}</span>}
              {isCityDay && assoc.dest?.rating && (
                <RatingBadge rating={assoc.dest.rating} size="xs" showGem={false} />
              )}
              {!isCityDay && rating && (
                <RatingBadge rating={rating} size="xs" showGem={false} />
              )}
              {/* The shape rides beside the title, in the loop chip's slot:
                  "Figure of eight" or "There and back" says more than "Loop"
                  did, and it is no longer a seventh cell in the facts grid
                  below, where it left the grid two cells short of a row. */}
              {!isCityDay && (shapeKey || loop) && (
                <span className="tpage-loop">
                  {(loop || shapeKey === 'trails.shapeFigure8') && <LoopIcon size={12} />}
                  {t(shapeKey || 'trails.loop')}
                </span>
              )}
            </div>
          </div>

          {/* The measured facts. A hike fills two rows of three once its
              detail file has landed (distance, time, ascent, the second
              elevation figure, high point, difficulty); a city day fills one
              row. The count rides on the grid so the stylesheet can pick a
              column count that closes the last row rather than leaving a
              blank cell. */}
          <div className="tpage-facts" data-n={facts.length}>
            {facts.map(({ key, ...f }) => <Fact key={key} {...f} />)}
          </div>

          {/* What the walk goes past and who it suits, as chips rather than
              as prose. Two rows, and the second one says which claims came
              off the map and which are ours: "a mapper recorded that dogs are
              allowed here" and "this looked gentle to us" are not the same
              promise, and a chip that blurs them is worse than no chip. */}
          {(highlightCodes.length > 0 || suits.length > 0) && (
            <div className="tpage-chips">
              {highlightCodes.map((code) => (
                <span key={code} className="tpage-chip tpage-chip-hl">
                  {t(HIGHLIGHT_LABEL[code] || 'trails.hlSummit')}
                </span>
              ))}
              {suits.map((code) => {
                const est = suitabilityIsDerived(src.f ? src : tr, code);
                return (
                  <span
                    key={code}
                    className={`tpage-chip tpage-chip-suit${est ? ' est' : ''}`}
                    title={t(est ? 'trails.suitEstimated' : 'trails.suitTagged')}
                  >
                    {t(SUIT_LABEL[code] || code)}
                    {est ? <i aria-hidden="true">~</i> : null}
                  </span>
                );
              })}
            </div>
          )}

          {/* The path this walk is one stage of.
              Route families collapse to one slot, which is what stops
              Bulgaria's list reading as ST701 through ST710, and it also
              means the PATH itself would otherwise be nameless: the E paths
              (E1 to E12) are mapped as dozens of national stage relations
              named after the towns they run between, so a reader would see
              "Bad Meinberg to Horn" and never learn they were looking at a
              route that crosses a continent. This is the family's page: the
              row that took the slot names what it stands for, and links the
              siblings that are published too. */}
          {family && family.size > 1 && (
            <section className="tpage-sec tpage-family">
              <h2 className="tpage-sec-title">
                {t('trails.familyPart', { name: family.n || family.k })}
              </h2>
              <p className="tpage-family-n">
                {t('trails.familyStages', { n: family.size })}
              </p>
            </section>
          )}

          {/* Three notes that are claims about the data rather than about the
              walk, so they read as provenance and not as features. */}
          {(listed || portal || isDerivedRoute(src) || isDerivedRoute(tr)) && (
            <div className="tpage-provenance">
              {listed && <p>{t('trails.listedNote')}</p>}
              {portal && (
                <p>
                  {t('trails.portalVerified', {
                    source: typeof portal === 'string' ? portal : '',
                  })}
                </p>
              )}
              {(isDerivedRoute(src) || isDerivedRoute(tr)) && (
                <p>{t('trails.derivedRouteNote')}</p>
              )}
            </div>
          )}

          {/* The argument for the walk, before the machinery of taking it
              away. Short on purpose: three to six measured claims, each one
              checkable against the map, and every word composed through t()
              from codes rather than shipped as English prose. */}
          {why.length > 0 && (
            <section className="tpage-sec tpage-why">
              <h2 className="tpage-sec-title">{t('trails.whyTitle')}</h2>
              <ul className="tpage-story">
                {why.map((p) => {
                  const Icon = STORY_ICONS[p.icon] || CheckIcon;
                  return (
                    <li key={p.key}>
                      <span className="tpage-story-icon"><Icon size={14} /></span>
                      <span>{p.text}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Everything you can do with the route, in one block under the
              facts. Taking it into the app you already walk with is the
              primary action, because that is what this page is for; following
              it here is a secondary that promises only what a browser tab can
              deliver. */}
          {!follow && (
            <>
              <button type="button" className="tpage-primary" onClick={onGpx}>
                <DownloadIcon size={16} />
                <span>{t(canShareFiles ? 'trails.sendToApp' : 'trails.gpx')}</span>
              </button>
              <div className="tpage-acts">
                <button type="button" className="tpage-act" onClick={onKml}>
                  <MapPinIcon size={15} />
                  <span>{t('trails.kml')}</span>
                </button>
                <button type="button" className="tpage-act" onClick={onShare}>
                  <LinkIcon size={15} />
                  <span>{t('trails.shareLink')}</span>
                </button>
                <button type="button" className="tpage-act tpage-follow" onClick={startFollow}>
                  <CompassIcon size={15} />
                  <span>{t('trails.follow')}</span>
                </button>
              </div>
            </>
          )}

          {!follow && <ViewStrip images={detail?.images} t={t} />}

          {!isCityDay && detail?.elevation && (
            <section className="tpage-sec">
              <h2 className="tpage-sec-title">{t('trails.elevTitle')}</h2>
              <ElevationChart elevation={detail.elevation} atM={follow && onRoute ? onRoute.m : null} t={t} />
            </section>
          )}

          {/* What you actually walk past, in the order you meet it. From the
              OSM landmarks scenic.py measured against the line, so a name here
              means the route passes within 250 m of it. */}
          {!follow && Array.isArray(detail?.highlights) && detail.highlights.length > 0 && (
            <section className="tpage-sec">
              <h2 className="tpage-sec-title">{t('trails.seeTitle')}</h2>
              <ol className="tpage-highlights">
                {detail.highlights.map((h, i) => (
                  <li key={`${h.name}-${i}`}>
                    <span className="tpage-hl-name">{h.name}</span>
                    <span className="tpage-hl-facts">
                      <span>{t(`trails.kind_${h.kind}`)}</span>
                      {isNum(h.ele_m) && <span>{Math.round(h.ele_m)} m</span>}
                      {isNum(h.along_m) && <span>{t('trails.atKm', { km: km1(h.along_m) })}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {story.points.length > 0 && (
            <section className="tpage-sec tpage-expect">
              <h2 className="tpage-sec-title">{t('trails.expectTitle')}</h2>
              {/* Same list styling as the why section above, its own class:
                  one is the argument for the walk and one is the description
                  of it, and a reader of the DOM (or a harness) has to be able
                  to tell which is which. */}
              <ul className="tpage-story">
                {story.points.map((p) => {
                  const Icon = STORY_ICONS[p.icon] || RouteIcon;
                  return (
                    <li key={p.key}>
                      <span className="tpage-story-icon"><Icon size={14} /></span>
                      <span>{p.text}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {story.prose && story.prose.length > 0 && (
            <section className="tpage-sec">
              <h2 className="tpage-sec-title">{t('trails.aboutTitle')}</h2>
              <div className="tpage-prose">
                {story.prose.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </section>
          )}

          {Array.isArray(stops) && stops.length > 0 && (
            <section className="tpage-sec">
              <h2 className="tpage-sec-title">{t('trails.stopsTitle')}</h2>
              <ol className="tpage-stops">
                {stops.map((s) => (
                  <li key={s.seq}>
                    <span className="tpage-stop-name">{stopNameFromRef(s.poi_ref)}</span>
                    <span className="tpage-stop-facts">
                      {s.dwell_min != null && <span>{t('trails.dwell', { min: s.dwell_min })}</span>}
                      {s.leg_duration_min != null && s.seq > 1 && (
                        <span>{t(s.leg_mode === 'transit' ? 'trails.legTransit' : 'trails.legWalk', { min: s.leg_duration_min })}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {start && (
            <section className="tpage-sec">
              <h2 className="tpage-sec-title">{t('trails.startTitle')}</h2>
              <div className="tpage-start">
                <span className="tpage-start-coords">
                  {start.lat.toFixed(5)}, {start.lon.toFixed(5)}
                </span>
                {assoc.dest && startKm != null && (
                  <span className="tpage-start-near">
                    {startKm >= 2
                      ? t('trails.startNear', { km: Math.round(startKm), city: assoc.dest.city })
                      : t('trails.startIn', { city: assoc.dest.city })}
                  </span>
                )}
              </div>
              {dirUrl && (
                <a className="tpage-act tpage-act-wide" href={dirUrl} target="_blank" rel="noopener noreferrer">
                  <RouteIcon size={15} />
                  <span>{t('trails.startDirections')}</span>
                </a>
              )}
            </section>
          )}

          {isCityDay && assoc.destId && (
            <button type="button" className="tpage-cta" onClick={() => onSelectDest(assoc.destId)}>
              <span>{t('trails.openDest', { city: assoc.dest?.city || '' })}</span>
              <span className="tpage-cta-right">
                {price?.pp != null && (
                  <span className="tpage-cta-price">{t('places.fromPrice', { price: eur(price.pp) })}/pp</span>
                )}
                <ChevronRightIcon size={15} />
              </span>
            </button>
          )}

          <NearbyOutdoors
            row={tr}
            cc={tr.country}
            headings={{ peak: 'nb.trail.peak', lake: 'nb.trail.lake', beach: 'nb.trail.beach' }}
            onOpen={onOpenNeighbour}
          />

          <p className="tpage-credit">{detail?.attribution_text || tr.attribution_text}</p>
        </div>
      </div>

      {toast && <div className="tpage-toast" role="status">{toast}</div>}
    </div>
  );
}
