import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { loadTrail, loadTrails } from '../lib/trails.js';
import {
  haversineKm, stopNameFromRef, trailRating,
  tripGrade, gradeIsDerived, tripRouteType, tripHighlights,
  tripSuitability, suitabilityIsDerived, isListed, isDerivedRoute,
  portalVerified, HIGHLIGHTS, SUITABILITY, ROUTE_TYPES,
} from '../lib/trailCards.js';
import { trailStory, trailReasons, trailPlace } from '../lib/trailStory.js';
import {
  routePoints, routeLength, nearestOnRoute, sliceRoute, remainingRelief,
  hikeTimeMin, isLoopRoute, basesAlong,
} from '../lib/trailGeo.js';
import { SurfaceBar, Stages, Bases } from './RouteParts.jsx';
import { ElevationChart } from './RouteFigures.jsx';
import {
  trailGpx, trailKml, trailFileBase, trailShareUrl, trailheadDirectionsUrl,
  shareOrDownloadFile, shareTrailLink, stopNamesOf, downloadTextFile,
} from '../lib/trailExport.js';
import { eur } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';
import { NearbyOutdoors } from './NearbyOutdoors.jsx';
import { DetailPage } from './DetailSkeleton.jsx';
import { usePlaceExits } from '../hooks/usePlaceExits.js';
import {
  stripCells, previewWords, bboxCentre, TRAIL_LEVEL, TRAIL_EFFORT_LEVEL,
} from '../lib/detailSkeleton.js';
import { haversineKm as kmBetween } from '../lib/nearby.js';
import { NotFor } from '../components/NotFor.jsx';
import { notForLines } from '../lib/notFor.js';
import {
  DownloadIcon, CompassIcon, RouteIcon, BootIcon, InfoIcon, BulbIcon,
  ClockIcon, MountainIcon, MapPinIcon, CheckIcon, ListDayIcon, CloseIcon,
  ChevronRightIcon, LinkIcon, EyeIcon, SwimIcon, BeachIcon, CastleIcon,
  BedIcon, BottleIcon, LoopIcon, StarIcon, CameraIcon,
  SunIcon,
} from '../components/Icons.jsx';
import { RatingBadge } from '../components/RatingBadge.jsx';
import { isNum } from '../map/coords.js';
import { FigureFooter } from './HonestFooters.jsx';

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
 * Since T180 the page draws through the shared detail skeleton
 * (DetailSkeleton.jsx): the route map is its sticky map slot, the elevation
 * profile its signature slot (T181 makes it the slope-coloured scrubbable
 * one), the descriptive blocks its collapsed rows. Following still takes the
 * whole page: the map leaves the column and covers everything under the bar.
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
    <>
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
    </>
  );
}

/** The trail grade as a level on the strip's five squares. */
const trailLevel = (r) => TRAIL_LEVEL[tripGrade(r)] || TRAIL_EFFORT_LEVEL[r?.difficulty] || 0;
const trailCentre = (r) => bboxCentre(r?.bbox);

/** The nearest catalogue town within 30 km of a trail, for the "cheaper"
 *  exit: the town you would sleep in. Cached per row, because the exits ask
 *  for the same forty rows on every render. */
const NEAR_TOWN_KM = 30;
const townCache = new WeakMap();
function nearestTown(row, dests) {
  if (!row || !dests) return null;
  if (townCache.has(row)) return townCache.get(row);
  const c = trailCentre(row);
  let best = null;
  let bestKm = NEAR_TOWN_KM;
  if (c) {
    for (const [id, d] of Object.entries(dests)) {
      const lat = d?.city_lat ?? d?.lat;
      const lon = d?.city_lon ?? d?.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const km = kmBetween(c.lat, c.lon, lat, lon);
      if (km != null && km < bestKm) { best = id; bestKm = km; }
    }
  }
  townCache.set(row, best);
  return best;
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

export function TrailPage({ card, onClose, onSelectDest, onOpenNeighbour, dests, fav = false, onFav = null, onAddToDay = null }) {
  const { t, lang } = useI18n();
  const { tr, assoc, kindKey, price } = card;
  const isCityDay = tr.category === 'citytrip';
  const [detail, setDetail] = useState(null);
  const [follow, setFollow] = useState(false);
  const [centred, setCentred] = useState(true);
  const [toast, setToast] = useState(null);
  const mapEl = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let live = true;
    loadTrail(tr.id).then((d) => { if (live) setDetail(d); });
    return () => { live = false; };
  }, [tr.id]);

  // This page's own Escape rule, which the skeleton's focus trap calls:
  // following the walk on GPS is a mode inside the page, so the first
  // Escape leaves the mode and only the second closes the page.
  const escapeClose = React.useCallback(() => {
    if (follow) setFollow(false);
    else onClose();
  }, [follow, onClose]);

  // Three ways out, from the same country's trails (T180). A city day is a
  // different kind of page and gets none.
  const exits = usePlaceExits({
    me: isCityDay ? null : tr,
    cc: tr.country || tr.cc,
    load: loadTrails,
    centre: trailCentre,
    level: trailLevel,
    baseOf: (r) => nearestTown(r, dests),
    open: (row) => onOpenNeighbour?.('trail', row),
  });

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const src = detail || tr;
  const pts = useMemo(() => routePoints(src.geometry), [src]);
  // Bases along the route (ROUTES.md R7). Computed from the full-resolution
  // geometry once the detail file lands, because the card's 90 m placeholder
  // line would put a town on the wrong side of a valley.
  const bases = useMemo(
    () => (detail && dests ? basesAlong(routePoints(detail.geometry), dests) : []),
    [detail, dests],
  );
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

  // The nearest town, by value: the story memo below builds the object
  // itself, so a re-render that hands back the same town does not re-run it.
  const hasNearby = !!assoc.dest;
  const nearbyCity = assoc.dest?.city;
  const nearbyKm = assoc.dest ? (isCityDay ? 0 : assoc.km) : null;
  // How far the TRAILHEAD is from the nearest town. assoc.km is measured from
  // the middle of the route, which on a long walk is a different place.
  const startKm = start && assoc.dest
    ? haversineKm(start.lat, start.lon,
      assoc.dest.city_lat ?? assoc.dest.lat, assoc.dest.city_lon ?? assoc.dest.lon)
    : null;
  const story = useMemo(
    () => trailStory(tr, detail, {
      t, loop, nearby: hasNearby ? { city: nearbyCity, km: nearbyKm } : null,
    }),
    [tr, detail, t, loop, hasNearby, nearbyCity, nearbyKm],
  );
  // Why this one. The card already carries the first three codes, so the
  // section is populated on the first frame and simply lengthens when the
  // detail file lands with the rest.
  const why = useMemo(
    () => trailReasons(detail?.reasons || tr.reasons, t, 6, detail || tr),
    [detail, tr, t],
  );
  // The place under the title: the nearest town only when it is in the
  // trailhead's country (T108-a), the country alone across a border.
  const place = useMemo(() => {
    let dn = null;
    try { dn = new Intl.DisplayNames([lang], { type: 'region' }); } catch { /* older engines */ }
    return trailPlace(tr, detail, assoc.dest, (cc) => (dn ? dn.of(cc) : cc) || cc);
  }, [tr, detail, assoc.dest, lang]);
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
    const gpx = trailGpx(tr, detail, { link: shareUrl, stopNames });
    const how = await shareOrDownloadFile(trailFileBase(tr), gpx, 'gpx', tr.name);
    setToast(how === 'shared' ? null : t('trails.savedGpx'));
  };

  const onKml = () => {
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

  // The strip under the hero: the grade, the kind of walk, the length.
  const cells = stripCells({
    level: TRAIL_LEVEL[grade] || TRAIL_EFFORT_LEVEL[tr.difficulty] || 0,
    word: diffKey ? t(diffKey) + (derivedGrade ? ' ~' : '') : '',
    type: t(kindKey),
    number: isNum(totalM) ? `${km1(totalM)} km` : '',
  }, t);

  // The view image: the first photograph shot on the route, the card's own
  // picture next, and the nearest town's hero last, captioned as that town
  // so nobody reads it as a picture of the path.
  const heroShot = detail?.images?.[0] || (tr.img?.u ? { u: tr.img.u } : null);
  const heroUrl = heroShot?.u || assoc.photoUrl || null;
  const heroCredit = heroShot?.author ? (
    <p className="bpage-credit">
      <CameraIcon size={12} />
      <span className="lpage-credit-line">
        {heroShot.page
          ? <a href={heroShot.page} target="_blank" rel="noopener noreferrer">{heroShot.author}</a>
          : <span>{heroShot.author}</span>}
        {heroShot.license ? `, ${heroShot.license}` : ''}
      </span>
    </p>
  ) : (!heroShot && assoc.photoOf ? (
    <p className="bpage-credit">
      <CameraIcon size={12} />
      <span className="lpage-credit-line">{t('detail.photoNear', { place: assoc.photoOf })}</span>
    </p>
  ) : null);

  const why1 = why[0]?.text || '';
  const hook = why1 || story.points[0]?.text || '';
  const ref = tr.f?.ref || null;
  const sfTop = detail?.sf
    ? Object.entries(detail.sf)
      .filter(([k, v]) => k !== 'unknown' && Number(v) > 0.05)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k, v]) => `${Math.round(v * 100)}% ${t(`route.surf${k.charAt(0).toUpperCase()}${k.slice(1)}`).toLowerCase()}`)
    : [];

  // Slot 6: the collapsed rows (T180). Each is a block that used to sit open
  // under the facts.
  const rows = [
    {
      key: 'facts',
      icon: InfoIcon,
      label: t('detail.factsHead'),
      summary: factLine,
      body: (
        <>
          <div className="tpage-facts">
            {isNum(totalM) && <Fact label={t('trails.factDistance')} value={`${km1(totalM)} km`} />}
            {isNum(src.duration_min) && <Fact label={t(isCityDay ? 'trails.factDay' : 'trails.factTime')} value={`${hoursText(src.duration_min)} h`} />}
            {isNum(ascent) && <Fact label={t('trails.factAscent')} value={`${Math.round(ascent)} m`} />}
            {isNum(detail?.descent_m) && <Fact label={t('trails.factDescent')} value={`${Math.round(detail.descent_m)} m`} />}
            {isNum(detail?.elevation?.ele_max_m) && <Fact label={t('trails.factHigh')} value={`${Math.round(detail.elevation.ele_max_m)} m`} />}
            {isCityDay && isNum(tr.n_stops) && <Fact label={t('trails.factStops')} value={String(tr.n_stops)} />}
            {diffKey && (
              <Fact
                label={t('trails.factDifficulty')}
                value={t(diffKey) + (derivedGrade ? ' ~' : '')}
                title={derivedGrade ? t('trails.gradeDerived') : t('trails.gradeFrom')}
                word
              />
            )}
            {shapeKey && <Fact label={t('trails.shapeLabel')} value={t(shapeKey)} word />}
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
        </>
      ),
    },
    why.length > 0 && {
      key: 'why',
      icon: BulbIcon,
      label: t('trails.whyTitle'),
      summary: previewWords(why1),
      body: (
        <div className="tpage-why">
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
        </div>
      ),
    },
    Array.isArray(detail?.images) && detail.images.length > 0 && {
      key: 'views',
      icon: CameraIcon,
      label: t('trails.viewsTitle'),
      summary: t('detail.photoCount', { n: detail.images.length }),
      body: <ViewStrip images={detail.images} t={t} />,
    },
    detail?.sf && {
      key: 'underfoot',
      icon: BootIcon,
      label: t('route.surfaceTitle'),
      summary: sfTop.join(', '),
      body: <SurfaceBar sf={detail.sf} t={t} />,
    },
    Array.isArray(detail?.highlights) && detail.highlights.length > 0 && {
      key: 'see',
      icon: EyeIcon,
      label: t('trails.seeTitle'),
      summary: previewWords(detail.highlights.slice(0, 3).map((h) => h.name).join(', ')),
      body: (
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
      ),
    },
    (story.points.length > 0 || story.prose?.length > 0) && {
      key: 'expect',
      icon: RouteIcon,
      label: t('trails.expectTitle'),
      summary: previewWords(story.points[0]?.text || story.prose?.[0] || ''),
      body: (
        <div className="tpage-expect">
          {/* Same list styling as the why row, its own class: one is the
              argument for the walk and one is the description of it, and a
              reader of the DOM (or a harness) has to be able to tell which
              is which. */}
          {story.points.length > 0 && (
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
          )}
          {story.prose?.length > 0 && (
            <div className="tpage-prose">
              {story.prose.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          )}
        </div>
      ),
    },
    detail?.stages?.length > 0 && {
      key: 'stages',
      icon: ListDayIcon,
      label: t('route.stagesTitle'),
      summary: previewWords(detail.stages.map((st) => st.name).filter(Boolean).slice(0, 3).join(', ')),
      body: <Stages stages={detail.stages} t={t} onOpenRoute={null} />,
    },
    bases.length > 0 && {
      key: 'bases',
      icon: BedIcon,
      label: t('route.basesTitle'),
      summary: previewWords(bases.map((b) => b.city || b.name).filter(Boolean).join(', ')),
      body: <Bases bases={bases} t={t} onSelectDest={onSelectDest} />,
    },
    Array.isArray(stops) && stops.length > 0 && {
      key: 'stops',
      icon: MapPinIcon,
      label: t('trails.stopsTitle'),
      summary: previewWords(stops.slice(0, 3).map((st) => stopNameFromRef(st.poi_ref)).join(', ')),
      body: (
        <ol className="tpage-stops">
          {stops.map((st) => (
            <li key={st.seq}>
              <span className="tpage-stop-name">{stopNameFromRef(st.poi_ref)}</span>
              <span className="tpage-stop-facts">
                {st.dwell_min != null && <span>{t('trails.dwell', { min: st.dwell_min })}</span>}
                {st.leg_duration_min != null && st.seq > 1 && (
                  <span>{t(st.leg_mode === 'transit' ? 'trails.legTransit' : 'trails.legWalk', { min: st.leg_duration_min })}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      ),
    },
    family && family.size > 1 && {
      key: 'family',
      icon: LoopIcon,
      label: t('trails.familyPart', { name: family.n || family.k }),
      summary: t('trails.familyStages', { n: family.size }),
      body: <p className="tpage-family-n">{t('trails.familyStages', { n: family.size })}</p>,
    },
  ].filter(Boolean);

  return (
    <DetailPage
      name={tr.name}
      className={follow ? 'following' : ''}
      backLabel={t('trails.back')}
      onClose={onClose}
      onEscape={escapeClose}
      fav={fav}
      onFav={onFav}
      onShare={onShare}
      barTitleOn={follow}
      resetKey={tr.id}
      toast={toast}
      hero={{
        sharedKey: tr.id,
        cells,
        media: heroUrl ? (
          <img
            className="dsk-hero-img"
            src={heroUrl}
            alt={heroShot?.caption || tr.name}
            loading="eager"
            decoding="async"
          />
        ) : null,
        credit: heroCredit,
      }}
      head={(
        <div className="tpage-head">
          <h1 className="tpage-title">
            {tr.name}
            {ref && <span className="dsk-ref">{ref}</span>}
          </h1>
          <div className="tpage-sub">
            {place && <span>{[place.city, place.country].filter(Boolean).join(', ')}</span>}
            {isCityDay && assoc.dest?.rating && (
              <RatingBadge rating={assoc.dest.rating} size="xs" showGem={false} />
            )}
            {!isCityDay && rating && (
              <RatingBadge rating={rating} size="xs" showGem={false} />
            )}
            {!isCityDay && loop && (
              <span className="tpage-loop">
                <LoopIcon size={12} />
                {t('trails.loop')}
              </span>
            )}
          </div>
          {/* The trailhead is where the day's idea sits; the bbox centre
              stands in until the geometry has loaded. */}
          {onAddToDay && (
            <button type="button" className="feat-dayplan" onClick={() => onAddToDay({ id: tr.id, cc: tr.country || tr.cc, name: tr.name, lat: start ? start.lat : (tr.bbox ? (tr.bbox[1] + tr.bbox[3]) / 2 : tr.lat), lon: start ? start.lon : (tr.bbox ? (tr.bbox[0] + tr.bbox[2]) / 2 : tr.lon) })}>
              <SunIcon size={14} />
              <span>{t('feat.addToDay')}</span>
            </button>
          )}
        </div>
      )}
      hook={hook}
      notFor={(
        <NotFor lines={notForLines('trail', tr, {
          reasons: detail?.reasons || tr.reasons,
          grade,
          ascent,
          totalM,
        })} />
      )}
      map={(
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
      )}
      signature={!isCityDay && detail?.elevation ? (
        <section className="tpage-sec">
          <h2 className="tpage-sec-title">{t('trails.elevTitle')}</h2>
          <ElevationChart elevation={detail.elevation} atM={follow && onRoute ? onRoute.m : null} label={t('trails.elevTitle')} maxLabel={t('trails.elevMax')} />
        </section>
      ) : null}
      rows={rows}
      gettingThere={(
        <>
          {start && (
            <>
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
            </>
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
        </>
      )}
      takeAway={!follow ? (
        <>
          {/* Taking it into the app you already walk with is the primary
              action, because that is what this page is for; following it
              here is a secondary that promises only what a browser tab can
              deliver. */}
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
              <span>{t('detail.sendLink')}</span>
            </button>
            <button type="button" className="tpage-act tpage-follow" onClick={startFollow}>
              <CompassIcon size={15} />
              <span>{t('trails.follow')}</span>
            </button>
          </div>
        </>
      ) : null}
      exits={exits}
      nearby={(
        <NearbyOutdoors
          row={tr}
          cc={tr.country}
          headings={{ peak: 'nb.trail.peak', lake: 'nb.trail.lake', beach: 'nb.trail.beach' }}
          onOpen={onOpenNeighbour}
        />
      )}
      licenceKeys={['credit.licence.routes']}
      sources={(
        <>
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
          {/* Length, climb and height are read off the geometry and the
              elevation model. The time is our arithmetic on them, and a
              grade that is not the mapper's own is ours too. */}
          <FigureFooter kinds={[
            isNum(totalM) && 'm',
            isNum(src.duration_min) && 'c',
            isNum(ascent) && 'm',
            isNum(detail?.descent_m) && 'm',
            isNum(detail?.elevation?.ele_max_m) && 'm',
            isCityDay && isNum(tr.n_stops) && 'm',
            diffKey && (derivedGrade ? 'c' : 'm'),
          ]} />
          <p className="tpage-credit">{detail?.attribution_text || tr.attribution_text}</p>
        </>
      )}
    />
  );
}
