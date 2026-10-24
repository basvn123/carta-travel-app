import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../styles/items.css';
import { ReportProblem } from '../components/ReportProblem.jsx';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { RouteRainWarning } from './RouteRainWarning.jsx';
import { loadTrail, loadTrails } from '../lib/trails.js';
import {
  haversineKm, stopNameFromRef, trailRating,
  tripGrade, gradeIsDerived, tripHighlights,
  tripSuitability, suitabilityIsDerived, HIGHLIGHTS, SUITABILITY, ROUTE_TYPES,
  trailWaymarked, trailSeason,
} from '../lib/trailCards.js';
import { trailStory, trailReasons, trailPlace } from '../lib/trailStory.js';
import {
  routePoints, routeLength, nearestOnRoute, sliceRoute, remainingRelief,
  hikeTimeMin, isLoopRoute, basesAlong,
} from '../lib/trailGeo.js';
import { SurfaceBar, Stages, Bases } from './RouteParts.jsx';
import { SlopeProfile } from './RouteFigures.jsx';
import { TrailRouteFacts } from './RouteFacts.jsx';
import NotYet from '../components/NotYet.jsx';
import { pointAlong } from '../lib/signature.js';
import { Instrument, Row as SigRow } from './Signature.jsx';
import {
  trailGpx, trailKml, trailFileBase, trailShareUrl, trailheadDirectionsUrl,
  shareOrDownloadFile, shareTrailLink, stopNamesOf, downloadTextFile,
} from '../lib/trailExport.js';
import { tokenColour as token } from '../map/tokenColors.js';
import { useI18n } from '../i18n/index.jsx';
import { NearbyOutdoors } from './NearbyOutdoors.jsx';
import { DetailPage, MapSketch } from './DetailSkeleton.jsx';
import { usePlaceExits } from '../hooks/usePlaceExits.js';
import {
  previewWords, previewNotHook, keyFactCells, bboxCentre, markMapLive,
  TRAIL_LEVEL, TRAIL_EFFORT_LEVEL,
} from '../lib/detailSkeleton.js';
import { haversineKm as kmBetween } from '../lib/nearby.js';
import { notForLines } from '../lib/notFor.js';
import {
  DownloadIcon, CompassIcon, RouteIcon, BootIcon, InfoIcon, BulbIcon,
  ClockIcon, MountainIcon, MapPinIcon, CheckIcon, ListDayIcon, CloseIcon,
  ChevronRightIcon, EyeIcon, SwimIcon, BeachIcon, CastleIcon,
  BedIcon, BottleIcon, LoopIcon, StarIcon, CameraIcon,
  SunIcon,
} from '../components/Icons.jsx';
import { isNum } from '../map/coords.js';
import { UploadForm } from '../community/UploadForm.jsx';
import { PhotoGallery } from './PhotoGallery.jsx';
import { ItemHead, ItemIcon } from './ItemParts.jsx';
import { Button, Chip, Money } from '../components/ui/index.js';
import { toPhotos } from '../lib/itemPhotos.js';
import { beforeGoItems } from '../lib/beforeGo.js';
import { useBaseDay } from '../hooks/useBaseDay.js';
import { useItemPdf } from '../hooks/useItemPdf.js';
import { installMapGestures } from '../lib/mapGestures.js';
import { MapShell } from './MapShell.jsx';
import { useDayView } from '../hooks/useDayView.js';

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
 * profile its signature slot, the descriptive blocks its collapsed rows.
 * The profile is shaded by steepness and scrubbable (T181): dragging along
 * it puts a marker at the same point on the map, through highlightAt.
 * Following still takes the whole page: the map leaves the column and
 * covers everything under the bar.
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

/** A route thinned to about 400 points for the PDF's vector line. */
const pdfLine = (pts) => {
  const step = Math.max(1, Math.ceil((pts?.length || 0) / 400));
  return (pts || []).filter((_, i) => i % step === 0 || i === pts.length - 1);
};

export function TrailPage({ card, onClose, onSelectDest, onOpenNeighbour, dests, fav = false, onFav = null, onAddToDay = null, backLabel = '' }) {
  const { t, lang } = useI18n();
  const { tr, assoc } = card;
  const isCityDay = tr.category === 'citytrip';
  const [detail, setDetail] = useState(null);
  const [follow, setFollow] = useState(false);
  const [centred, setCentred] = useState(true);
  const [toast, setToast] = useState(null);
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const getMap = useCallback(() => mapRef.current, []);

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

  // The stages of a path open their own page when the country file publishes
  // them (T386: a stage is a link or a plain line, never a disabled button).
  // loadTrails is cached, and the exits above have usually fetched it already.
  const [stageRows, setStageRows] = useState(null);
  const hasStages = Boolean(detail?.stages?.length);
  const tripCc = tr.country || tr.cc;
  useEffect(() => {
    let live = true;
    if (!hasStages) return undefined;
    loadTrails(tripCc).then((rows) => { if (live) setStageRows(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (live) setStageRows([]); });
    return () => { live = false; };
  }, [hasStages, tripCc]);
  const stageRowById = useMemo(
    () => new Map((stageRows || []).map((r) => [String(r.id), r])),
    [stageRows],
  );

  const src = detail || tr;
  const pts = useMemo(() => routePoints(src.geometry), [src]);
  // The map's ink sketch reads the card's own simplified line, so it is on
  // the first frame, before the detail file or the tiles (T396).
  const sketchLines = useMemo(() => {
    const g = tr.geometry || detail?.geometry;
    if (!g || !Array.isArray(g.coordinates)) return null;
    return g.type === 'LineString' ? [g.coordinates] : g.coordinates;
  }, [tr.geometry, detail?.geometry]);
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
  const start = pts.length ? pts[0] : null;
  const end = pts.length ? pts[pts.length - 1] : null;
  // T430 (critique): a route flagged a loop whose two ends lie more than a
  // kilometre apart is not one ("Loop, so you finish where you parked" on
  // Gosau to Hallstatt would strand a walker), so the ends get the last word.
  const endsApartKm = start && end && pts.length > 1
    ? haversineKm(start.lat, start.lon, end.lat, end.lon) : null;
  const loop = (typeof src.is_loop === 'boolean'
    ? src.is_loop
    : (pts.length ? isLoopRoute(pts) : null)) && !(endsApartKm != null && endsApartKm > 1);

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
  const baseDay = useBaseDay(assoc.destId || null);
  const view = useDayView();   // T694: per person or the group's total
  const { onPdf, pdfBusy } = useItemPdf('trail', tr, { detail, place, assoc });

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
      dragRotate: false,
      touchPitch: false,
    });
    // Two fingers pan, a pinch zooms, no Ctrl (T430, lib/mapGestures.js).
    map._gestures = installMapGestures(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    // The ink sketch under the canvas until the map has drawn (T396).
    markMapLive(map);
    // A tap on the line moves the profile's marker there (T396, rule N11):
    // the nearest point of the line, if the tap was within 24 px of it.
    map.on('click', (e) => mapPickRef.current?.(e, map));
    map.on('load', () => {
      const empty = { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [] } };
      map.addSource('trail', { type: 'geojson', data: empty });
      map.addSource('trail-done', { type: 'geojson', data: empty });
      map.addLayer({
        id: 'trail-casing', type: 'line', source: 'trail',
        paint: { 'line-color': token('--bg-card'), 'line-width': 7, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'trail-line', type: 'line', source: 'trail',
        paint: { 'line-color': token('--accent'), 'line-width': 3.4 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      // What has been walked drops back to the muted ink, so the route ahead
      // is the only thing still wearing the action colour.
      map.addLayer({
        id: 'trail-done-line', type: 'line', source: 'trail-done',
        paint: { 'line-color': token('--ink-mute'), 'line-width': 3.4, 'line-opacity': 0.85 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.resize();
      map._trailReady = true;
      map._draw?.();
    });
    // Dragging the map means the walker wants to look somewhere else.
    map.on('dragstart', () => setCentred(false));
    mapRef.current = map;
    return () => { map._gestures?.dispose(); map.remove(); mapRef.current = null; };
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

  // The point the reader is pointing at on the profile, on the map (T181).
  // The profile's distances are measured along the full-resolution line the
  // pipeline sampled; the drawn line is its simplification, so the distance
  // is scaled onto the drawn line's own length before it is placed. Null
  // takes the marker away.
  const profileEnd = detail?.elevation?.profile?.length
    ? detail.elevation.profile[detail.elevation.profile.length - 1][0] : 0;
  const highlightAt = useCallback((alongM) => {
    const map = mapRef.current;
    if (!map) return;
    const p = alongM == null || !pts.length
      ? null
      : pointAlong(pts, profileEnd > 0 ? alongM * (lineM / profileEnd) : alongM);
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
  }, [pts, lineM, profileEnd]);

  // Full screen while following: the map is the instrument, the page is not.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const timer = setTimeout(() => map.resize(), 60);
    return () => clearTimeout(timer);
  }, [follow]);

  // The other direction (T396): a tap on the line, in the line's metres,
  // scaled onto the profile's own length, moves the profile's marker and
  // puts the scrub pin on the map where the profile will say it is.
  const [markM, setMarkM] = useState(null);
  const mapPickRef = useRef(null);
  mapPickRef.current = (e, map) => {
    if (!pts.length || !profileEnd || follow) return;
    const hit = nearestOnRoute(pts, e.lngLat.lat, e.lngLat.lng);
    if (!hit) return;
    const px = map.project([hit.lon, hit.lat]);
    if (Math.hypot(px.x - e.point.x, px.y - e.point.y) > 24) return;
    const along = lineM > 0 ? hit.m * (profileEnd / lineM) : hit.m;
    setMarkM({ m: along });
    highlightAt(along);
  };

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

  // The months of the walking season, short and in the reader's language.
  const monthShort = useMemo(() => {
    try {
      const fmt = new Intl.DateTimeFormat(lang, { month: 'short' });
      return (m) => fmt.format(new Date(Date.UTC(2026, m - 1, 15)));
    } catch { return (m) => String(m); }
  }, [lang]);

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
  const highlightCodes = tripHighlights(src).length
    ? tripHighlights(src) : tripHighlights(tr);
  const suits = tripSuitability(src).length
    ? tripSuitability(src) : tripSuitability(tr);
  const family = detail?.family || tr.fam || null;
  const stops = detail?.stops;
  const ascent = detail?.ascent_m ?? tr.ascent_m;
  const dirUrl = start ? trailheadDirectionsUrl(start.lat, start.lon) : '';

  const why1 = why[0]?.text || '';
  const hook = why1 || story.points[0]?.text || '';
  const ref = tr.f?.ref || null;

  // The key facts band (T386): what a walker decides on, open under the
  // head: distance first (T430: the strip that carried it is retired), then
  // time, climb, descent, high point, waymarks and season. A city day has
  // its own three. Waymarked appears only where a mapper tagged it, never as
  // a "no"; a season the climatology modelled says "est.".
  const waymarked = trailWaymarked(src) || trailWaymarked(tr);
  const season = trailSeason(src) || trailSeason(tr);
  const descentM = detail?.descent_m ?? tr.descent_m;
  const keyFacts = keyFactCells(isCityDay ? [
    { key: 'time', label: t('trails.factDay'), value: isNum(src.duration_min) ? `${hoursText(src.duration_min)} h` : '', mono: true },
    { key: 'stops', label: t('trails.factStops'), value: isNum(tr.n_stops) ? String(tr.n_stops) : '', mono: true },
    { key: 'dist', label: t('trails.factDistance'), value: isNum(totalM) ? `${km1(totalM)} km` : '', mono: true },
  ] : [
    { key: 'dist', label: t('trails.factDistance'), value: isNum(totalM) ? `${km1(totalM)} km` : '', mono: true },
    { key: 'time', label: t('trails.factTime'), value: isNum(src.duration_min) ? `${hoursText(src.duration_min)} h` : '', mono: true },
    { key: 'ascent', label: t('trails.factAscent'), value: isNum(ascent) ? `${Math.round(ascent).toLocaleString(lang)} m` : '', mono: true },
    { key: 'descent', label: t('trails.factDescent'), value: isNum(descentM) ? `${Math.round(descentM).toLocaleString(lang)} m` : '', mono: true },
    { key: 'high', label: t('trails.factHigh'), value: isNum(detail?.elevation?.ele_max_m) ? `${Math.round(detail.elevation.ele_max_m).toLocaleString(lang)} m` : '', mono: true },
    waymarked && { key: 'way', label: t('detail.factWaymarked'), value: t('detail.waymarkedYes') },
    season && {
      key: 'season',
      label: t('detail.factSeason'),
      value: season.allYear ? t('detail.seasonAllYear')
        : t('detail.monthRange', { from: monthShort(season.from), to: monthShort(season.to) }),
      mono: !season.allYear,
      note: season.est ? t('prov.est') : null,
    },
  ], t);

  // The rows (T386): at most five, grouped. About this walk holds the
  // argument and the description (why, what you walk past, what to expect),
  // the route holds its parts (stages, bases, stops, the family), then the
  // photographs and every measurement. The surface bar left the rows for the
  // signature, where it shares the profile's kilometre axis.
  const aboutTexts = [
    ...why.map((w) => w.text),
    ...(story.points || []).map((p) => p.text),
    ...(story.prose || []),
  ];
  const hasWhy = why.length > 0;
  const hasSee = Array.isArray(detail?.highlights) && detail.highlights.length > 0;
  const hasExpect = story.points.length > 0 || story.prose?.length > 0;
  const hasStops = Array.isArray(stops) && stops.length > 0;
  const hasFamily = Boolean(family && family.size > 1);
  const hasRoute = hasStages || bases.length > 0 || hasStops || hasFamily;
  const onlyStops = hasStops && !hasStages && !bases.length && !hasFamily;
  const routeNames = [
    ...(detail?.stages || []).map((st) => st.name),
    ...bases.map((b) => b.city || b.name),
    ...(hasStops ? stops.slice(0, 3).map((st) => stopNameFromRef(st.poi_ref)) : []),
  ].filter(Boolean);

  const rows = [
    (hasWhy || hasSee || hasExpect) && {
      key: 'about',
      icon: BulbIcon,
      label: t(isCityDay ? 'detail.aboutDay' : 'detail.aboutWalk'),
      summary: previewNotHook(aboutTexts, hook),
      body: (
        <>
          {hasWhy && (
            <div className="tpage-why">
              <h3 className="dsk-sub">{t('trails.whyTitle')}</h3>
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
          )}
          {hasSee && (
            <div className="tpage-see">
              <h3 className="dsk-sub">{t('trails.seeTitle')}</h3>
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
            </div>
          )}
          {hasExpect && (
            <div className="tpage-expect">
              {/* Same list styling as the why block, its own class: one is
                  the argument for the walk and one is the description of it,
                  and a reader of the DOM (or a harness) has to be able to
                  tell which is which. */}
              <h3 className="dsk-sub">{t('trails.expectTitle')}</h3>
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
          )}
        </>
      ),
    },
    hasRoute && {
      key: 'route',
      icon: onlyStops ? MapPinIcon : ListDayIcon,
      label: t(onlyStops ? 'trails.stopsTitle' : 'detail.theRoute'),
      summary: previewWords(routeNames.slice(0, 3).join(', ')),
      body: (
        <>
          {hasStages && (
            <div className="tpage-part">
              <h3 className="dsk-sub">{t('route.stagesTitle')}</h3>
              <Stages
                stages={detail.stages}
                t={t}
                canOpen={(id) => stageRowById.has(String(id))}
                onOpenRoute={onOpenNeighbour
                  ? (id) => { const row = stageRowById.get(String(id)); if (row) onOpenNeighbour('trail', row); }
                  : null}
              />
            </div>
          )}
          {bases.length > 0 && (
            <div className="tpage-part">
              <h3 className="dsk-sub">{t('route.basesTitle')}</h3>
              <Bases bases={bases} t={t} onSelectDest={onSelectDest} />
            </div>
          )}
          {hasStops && (
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
          )}
          {hasFamily && (
            <p className="tpage-family-n">
              {t('trails.familyPart', { name: family.n || family.k })}
              {', '}
              {t('trails.familyStages', { n: family.size })}
            </p>
          )}
        </>
      ),
    },
    {
      key: 'facts',
      icon: InfoIcon,
      label: t('detail.factsHead'),
      summary: factLine,
      body: (
        <>
          <div className="tpage-facts">
            {/* T630: every fact keeps its slot, the placeholder where the wire has no value. */}
            <Fact label={t('trails.factDistance')} value={isNum(totalM) ? `${km1(totalM)} km` : <NotYet />} />
            <Fact label={t(isCityDay ? 'trails.factDay' : 'trails.factTime')} value={isNum(src.duration_min) ? `${hoursText(src.duration_min)} h` : <NotYet />} />
            <Fact label={t('trails.factAscent')} value={isNum(ascent) ? `${Math.round(ascent)} m` : <NotYet />} />
            <Fact label={t('trails.factDescent')} value={isNum(detail?.descent_m ?? tr.descent_m) ? `${Math.round(detail?.descent_m ?? tr.descent_m)} m` : <NotYet />} />
            <Fact label={t('trails.factHigh')} value={isNum(detail?.elevation?.ele_max_m) ? `${Math.round(detail.elevation.ele_max_m)} m` : <NotYet />} />
            {isCityDay && isNum(tr.n_stops) && <Fact label={t('trails.factStops')} value={String(tr.n_stops)} />}
            {diffKey && (
              <Fact
                label={t('trails.factDifficulty')}
                value={t(diffKey) + (derivedGrade ? ' ~' : '')}
                title={derivedGrade ? t('trails.gradeDerived') : t('trails.gradeFrom')}
                word
              />
            )}
          </div>
          <TrailRouteFacts row={tr} detail={detail} t={t} lang={lang} isCityDay={isCityDay} />
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
          {!isCityDay && (
            <Button variant="quiet" size="sm" className="tpage-kml" iconStart={<MapPinIcon size={16} />} onClick={onKml}>
              {t('trails.kml')}
            </Button>
          )}
        </>
      ),
    },
  ].filter(Boolean);

  // T430: the sights along the way as the "Why go" track, each with the
  // photograph taken nearest to it on the route where there is one.
  const shots = toPhotos(detail?.images, { fallbackCaption: tr.name }).map((p) => ({
    ...p,
    caption: [p.caption, isNum(p.alongM) ? t('trails.viewAt', { km: km1(p.alongM) }) : ''].filter(Boolean).join(', '),
  }));
  const nearestShot = (alongM) => {
    if (!isNum(alongM)) return null;
    let best = null;
    for (const p of shots) {
      if (!isNum(p.alongM)) continue;
      const d = Math.abs(p.alongM - alongM);
      if (d <= 1500 && (!best || d < best.d)) best = { p, d };
    }
    return best ? best.p : null;
  };
  const sights = (detail?.highlights || []).slice(0, 6).map((h, i) => ({
    key: `${h.name}-${i}`,
    title: h.name,
    line: [t(`trails.kind_${h.kind}`), isNum(h.ele_m) ? `${Math.round(h.ele_m).toLocaleString(lang)} m` : '']
      .filter((x) => x && !x.startsWith('trails.kind_')).join(', '),
    meta: isNum(h.along_m) ? t('trails.atKm', { km: km1(h.along_m) }) : '',
    photo: nearestShot(h.along_m),
  }));
  const reasonsList = why.slice(1).map((w) => ({ key: w.key, title: '', line: w.text }));
  const whyGo = sights.length ? sights : reasonsList;
  const galleryPhotos = shots.length ? shots
    : (tr.img?.u ? toPhotos([{ u: tr.img.u, w: tr.img.w, h: tr.img.h }], { fallbackCaption: tr.name })
      : (assoc.photoUrl ? toPhotos([assoc.photoUrl], { caption: assoc.photoOf ? t('detail.photoNear', { place: assoc.photoOf }) : tr.name }) : []));
  const before = beforeGoItems({
    lines: notForLines('trail', tr, { reasons: detail?.reasons || tr.reasons, grade, ascent, totalM }),
  });
  const sources = [
    { label: detail?.attribution_text || tr.attribution_text || 'OpenStreetMap' },
  ];

  return (
    <DetailPage
      name={tr.name}
      className={follow ? 'following' : ''}
      backLabel={backLabel || t('detail.backTrails')}
      onClose={onClose}
      onEscape={escapeClose}
      fav={fav}
      onFav={onFav}
      onShare={onShare}
      barTitleOn={follow}
      resetKey={tr.id}
      toast={toast}
      gallery={galleryPhotos.length ? (
        <PhotoGallery photos={galleryPhotos} label={tr.name} claimKey={tr.id}
          fallback={{ city: tr.name, iso2: tr.country || tr.cc }} />
      ) : null}
      head={(
        <ItemHead
          title={tr.name}
          iso2={tr.country || tr.cc}
          where={place ? [place.city, place.country].filter(Boolean).join(', ') : ''}
          rating={isCityDay ? (assoc.dest?.rating || null) : (rating || null)}
          chips={(
            <>
              {!isCityDay && loop && <Chip kind="status" icon={<LoopIcon size={16} />}>{t('trails.loop')}</Chip>}
              {ref && <Chip kind="status">{ref}</Chip>}
            </>
          )}
        />
      )}
      hook={hook}
      keyFacts={keyFacts}
      keyFactsLead={<RouteRainWarning lat={start?.lat} lon={start?.lon} sac={src.sac_scale} highlights={highlightCodes} />}
      keyFactsFoot={diffKey && derivedGrade ? `~ ${t('trails.gradeDerived')}` : null}
      whyGo={whyGo}
      whyGoTitle={sights.length ? t('trails.seeTitle') : null}
      before={before}
      map={(
        <MapShell getMap={getMap} relief beneath={['trail-casing']}>
        <div className="tpage-hero">
          <div className="tpage-map" ref={mapEl}>
            {/* The card's simplified line in ink while maplibre loads; the
                canvas crossfades over it (T396). */}
            <MapSketch lines={sketchLines} label={tr.name} />
          </div>
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
        </MapShell>
      )}
      signature={!isCityDay && (detail?.elevation || detail?.sf) ? (
        <Instrument
          kind="trail"
          title={t('sig.trailHead')}
        >
          {detail?.elevation && (
            <SlopeProfile
              elevation={detail.elevation}
              atM={follow && onRoute ? onRoute.m : null}
              onScrub={highlightAt}
              markM={markM}
              labels={{
                row: t('sig.rowEle'),
                aria: t('sig.scrubAria'),
                at: (v) => t('sig.eleAt', v),
                range: (v) => t('sig.eleRange', v),
                under: t('sig.slopeUnder'),
                mid: t('sig.slopeMid'),
                over: t('sig.slopeOver'),
              }}
            />
          )}
          {/* What is underfoot, as the profile's second track (T386): the
              same route, one share per surface, so the steep stretch and
              the loose stretch can be read together. */}
          {detail?.sf && (
            <SigRow label={t('route.surfaceTitle')} className="sig-row-gap">
              <SurfaceBar sf={detail.sf} t={t} />
            </SigRow>
          )}
        </Instrument>
      ) : null}
      rows={rows}
      primary={follow ? null : (isCityDay && assoc.destId ? (
        <Button variant="primary" iconEnd={<ChevronRightIcon size={20} />} onClick={() => onSelectDest(assoc.destId)}>
          {(baseDay && view.stayIn(assoc.dest?.city, baseDay.dayEur)) || t('trails.openDest', { city: assoc.dest?.city || '' })}
        </Button>
      ) : (
        /* Taking it into the app you already walk with is the primary action,
           because that is what this page is for (AllTrails and Komoot lead
           with the same door); following it here is a secondary that
           promises only what a browser tab can deliver. */
        <Button variant="primary" className="tpage-primary" iconStart={<DownloadIcon size={20} />} onClick={onGpx}>
          {t(canShareFiles ? 'trails.sendToApp' : 'trails.gpx')}
        </Button>
      ))}
      actions={follow ? [] : [
        start && dirUrl && (
          <a key="dir" className="btn btn-secondary" href={dirUrl} target="_blank" rel="noopener noreferrer">
            <span className="btn-icon" aria-hidden="true"><RouteIcon size={20} /></span>
            <span className="btn-label">{t('trails.startDirections')}</span>
          </a>
        ),
        isCityDay && assoc.destId && (
          <Button key="gpx" variant="secondary" iconStart={<DownloadIcon size={20} />} onClick={onGpx}>
            {t(canShareFiles ? 'trails.sendToApp' : 'trails.gpx')}
          </Button>
        ),
        <Button key="follow" variant="secondary" className="tpage-follow" iconStart={<CompassIcon size={20} />} onClick={startFollow}>
          {t('trails.follow')}
        </Button>,
        onAddToDay && (
          <Button key="day" variant="secondary" className="feat-dayplan" iconStart={<SunIcon size={20} />}
            onClick={() => onAddToDay({ id: tr.id, cc: tr.country || tr.cc, name: tr.name, lat: start ? start.lat : (tr.bbox ? (tr.bbox[1] + tr.bbox[3]) / 2 : tr.lat), lon: start ? start.lon : (tr.bbox ? (tr.bbox[0] + tr.bbox[2]) / 2 : tr.lon) })}>
            {t('feat.addToDay')}
          </Button>
        ),
      ]}
      onPdf={follow ? null : onPdf}
      pdf={{
        photos: galleryPhotos,
        where: place ? [place.city, place.country].filter(Boolean).join(', ') : '',
        route: pdfLine(pts).map((p) => [p.lon, p.lat]),
        profile: pdfLine(pts).filter((p) => Number.isFinite(p.ele)).map((p) => [p.m / 1000, p.ele]),
        url: shareUrl,
      }}
      pdfBusy={pdfBusy}
      gettingThere={start && assoc.dest && startKm != null ? (
        <ul className="igo-list">
          {/* A town before any coordinate (T386): "4 km from Gosau" is what a
              walker plans by; the coordinates are for the maps app. */}
          <li className="igo-row tpage-start-near">
            <ItemIcon name="pin" />
            <span className="igo-main">
              <span>
                {startKm >= 2
                  ? t('trails.startNear', { km: Math.round(startKm), city: assoc.dest.city })
                  : t('trails.startIn', { city: assoc.dest.city })}
              </span>
              <span className="igo-sub tpage-start-coords">{start.lat.toFixed(5)}, {start.lon.toFixed(5)}</span>
            </span>
          </li>
        </ul>
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
      sources={sources}
      sourcesExtra={(
        <>
          {/* An upload is one more source, so its door sits with the others (T333). */}
          <UploadForm layer="trail" itemId={tr.id} />
          <ReportProblem item={{ layer: 'trail', id: tr.id, cc: tr.country || tr.cc, name: tr.name }} />
        </>
      )}
    />
  );
}
