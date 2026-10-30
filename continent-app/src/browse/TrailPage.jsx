import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../styles/items.css';
import { ReportProblem } from '../components/ReportProblem.jsx';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { RouteRainWarning } from './RouteRainWarning.jsx';
import { loadTrail, loadTrails } from '../lib/trails.js';
import {
  haversineKm, stopNameFromRef, trailRating,
  tripGrade, gradeIsDerived, tripHighlights, ROUTE_TYPES, tripRouteType,
  trailWaymarked, trailSeason,
} from '../lib/trailCards.js';
import { trailStory, trailReasons, trailPlace } from '../lib/trailStory.js';
import {
  routePoints, routeLength, nearestOnRoute, sliceRoute, remainingRelief,
  hikeTimeMin, isLoopRoute, basesAlong,
} from '../lib/trailGeo.js';
import { SurfaceBar, Stages, Bases } from './RouteParts.jsx';
import { pointAlong } from '../lib/signature.js';
import {
  trailGpx, trailFileBase, trailShareUrl, trailheadDirectionsUrl,
  shareOrDownloadFile, shareTrailLink, stopNamesOf,
} from '../lib/trailExport.js';
import { tokenColour as token } from '../map/tokenColors.js';
import { useI18n } from '../i18n/index.jsx';
import { NearbyOutdoors } from './NearbyOutdoors.jsx';
import { MapSketch } from './DetailSkeleton.jsx';
import { usePlaceExits } from '../hooks/usePlaceExits.js';
import { keyFactCells, bboxCentre, markMapLive, TRAIL_LEVEL, TRAIL_EFFORT_LEVEL } from '../lib/detailSkeleton.js';
import { haversineKm as kmBetween } from '../lib/nearby.js';
import { notForLines } from '../lib/notFor.js';
import { natureRankLine } from '../lib/rating.js';
import { featureHref } from '../lib/featureHref.js';
import {
  DownloadIcon, CompassIcon, RouteIcon, MountainIcon, MapPinIcon, CloseIcon,
  CalendarIcon, BootIcon, BottleIcon, BedIcon, ParkingIcon, BusIcon, TrainIcon,
  FerryIcon, LoopIcon, TicketIcon, InfoIcon, ArrowRightIcon,
} from '../components/Icons.jsx';
import { isNum } from '../map/coords.js';
import { UploadForm } from '../community/UploadForm.jsx';
import { ItemIcon } from './ItemParts.jsx';
import { Button } from '../components/ui/index.js';
import { formatMoney } from '../lib/money.js';
import { toPhotos } from '../lib/itemPhotos.js';
import { beforeGoItems } from '../lib/beforeGo.js';
import { useItemPdf } from '../hooks/useItemPdf.js';
import { installMapGestures } from '../lib/mapGestures.js';
import { MapShell } from './MapShell.jsx';
import {
  OutdoorPage, PSection, StayLine, RouteBlock, HeightProfile, GradeCard, CheckRows,
  SafetyBlock, AlongCards, OtherNearby, OxLinkButton, SAC_STEP, plainName, outdoorPdfModel,
} from './OutdoorParts.jsx';

/**
 * The trail page: a published hike or city day as a page of its own, opened
 * from a card in the Explore tab or from a shared #trail= link.
 *
 * Since T916 it stands on the place page's template (OutdoorParts.jsx, the
 * owner's approved spec of 2026-10-30): the photographs, the head (the name
 * without the OSM route number, which moves to a badge; the Score, the rank
 * in the region, the flag and the region, one lead line), six facts (grade,
 * length, time, climb, high point, route type), a jump bar, then one long
 * page: Route (the map with 2D / 3D and full screen, the height profile, the
 * hand-offs), Before you go (the grade card, season, waymarks, water, huts,
 * dogs, permits, the hazards and the safety block), Getting there (the
 * start, parking, transit, one way or loop), Along the way (the sights, the
 * stages and the towns on the way), and Nearby. The side card holds the one
 * primary, "Add to a day plan", with "Stay nearby" priced in it.
 *
 * It still answers the four things a walker asks:
 *   where does it go        the route on a real map, elevation under it
 *   what is it like         composed lines, not the pipeline's boilerplate
 *                           (lib/trailStory.js)
 *   can I follow it here    yes: live GPS against the line, progress, remaining
 *                           climb, an off-route warning, the screen kept awake
 *   can I take it with me   GPX for hiking apps, a link for anyone, the PDF
 *
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
/** A walking time to the nearest five minutes: "7 h", "2 h 35 min". */
const duration = (min) => {
  const r = Math.max(5, Math.round(min / 5) * 5);
  const h = Math.floor(r / 60);
  const m = r % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
};

const ROUTE_LABEL = Object.fromEntries(ROUTE_TYPES.map(({ key, labelKey }) => [key, labelKey]));
/** Carta's grade where no mapper tagged an SAC scale: its T step, estimated. */
const GRADE_STEP = { easy: 1, moderate: 2, hard: 3, very_hard: 4, alpine: 5 };
const MONTH_CODES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const TRANSIT_ICON = { bus: BusIcon, train: TrainIcon, tram: TrainIcon, ferry: FerryIcon };

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
  // Rating v5 (T763): the list row carries the v5 block, the detail file not.
  const rating = trailRating(tr);
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
  const onGpx = async () => {
    const gpx = trailGpx(tr, detail, { link: shareUrl, stopNames });
    const how = await shareOrDownloadFile(trailFileBase(tr), gpx, 'gpx', tr.name);
    setToast(how === 'shared' ? null : t('trails.savedGpx'));
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

  const grade = tripGrade(src) || tripGrade(tr);
  const derivedGrade = gradeIsDerived(src) || gradeIsDerived(tr);
  const highlightCodes = tripHighlights(src).length ? tripHighlights(src) : tripHighlights(tr);
  const family = detail?.family || tr.fam || null;
  const stops = detail?.stops;
  const ascent = detail?.ascent_m ?? tr.ascent_m;
  const descentM = detail?.descent_m ?? tr.descent_m;
  const highM = detail?.elevation?.ele_max_m;
  const dirUrl = start ? trailheadDirectionsUrl(start.lat, start.lon) : '';
  const nf = (v) => Math.round(v).toLocaleString(lang);

  const why1 = why[0]?.text || '';
  const hook = why1 || story.points[0]?.text || '';
  // The name without its OSM route number; the number becomes a badge.
  const named = plainName(tr.name, tr.f?.ref || detail?.waymark_ref || null);

  // The grade as a T step: the mapper's SAC tag when the route carries one,
  // Carta's own grade otherwise (then marked as estimated).
  const sacTag = SAC_STEP[src.sac_scale] || SAC_STEP[tr.sac_scale] || 0;
  const gradeStep = isCityDay ? 0 : (sacTag || GRADE_STEP[grade] || 0);
  const gradeEst = !sacTag && (derivedGrade || !grade);
  const gradeWord = gradeStep ? t('ox.gradeShort', { n: gradeStep, word: t(`ox.grade.t${gradeStep}`) }) : '';

  // One way, a loop or there and back: the wire's shape, else the loop test.
  const rt = tripRouteType(src) || tripRouteType(tr);
  const shapeKey = rt && ROUTE_LABEL[rt] ? ROUTE_LABEL[rt]
    : loop === true ? 'trails.shapeLoop' : loop === false ? 'trails.shapePoint' : null;
  const shapeWord = shapeKey ? t(shapeKey) : '';
  const isLoopShape = rt === 'loop' || rt === 'figure8' || (!rt && loop === true);

  const lengthText = isNum(totalM) ? `${km1(totalM)} km` : '';
  const timeText = isNum(src.duration_min) ? duration(src.duration_min) : '';
  const climbText = isNum(ascent) ? `${nf(ascent)} m` : '';
  const waymarked = trailWaymarked(src) || trailWaymarked(tr);
  const season = trailSeason(src) || trailSeason(tr);

  // The six facts (the spec): grade, length, time, climb, high point, route
  // type. A city day has its own three.
  const keyFacts = keyFactCells(isCityDay ? [
    { key: 'time', label: t('trails.factDay'), value: isNum(src.duration_min) ? `${hoursText(src.duration_min)} h` : '' },
    { key: 'stops', label: t('trails.factStops'), value: isNum(tr.n_stops) ? String(tr.n_stops) : '' },
    { key: 'dist', label: t('trails.factDistance'), value: lengthText },
  ] : [
    { key: 'diff', label: t('ox.fact.grade'), value: gradeWord },
    { key: 'dist', icon: 'km', label: t('ox.fact.length'), value: lengthText },
    { key: 'time', label: t('ox.fact.time'), value: timeText },
    {
      key: 'climb',
      label: t('ox.fact.climb'),
      value: climbText ? (isNum(descentM) ? t('ox.climbUpDown', { up: nf(ascent), down: nf(descentM) }) : climbText) : '',
    },
    { key: 'high', label: t('ox.fact.high'), value: isNum(highM) ? `${nf(highM)} m` : '' },
    { key: 'route', icon: isLoopShape ? 'loop' : 'start', label: t('ox.fact.route'), value: shapeWord },
  ], t);

  // T430: the sights along the way, each with the photograph taken nearest
  // to it on the route where there is one.
  const shots = toPhotos(detail?.images, { fallbackCaption: named.name }).map((p) => ({
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
  const kindWord = (k) => { const w = t(`trails.kind_${k}`); return w.startsWith('trails.kind_') ? '' : w; };
  const sights = (detail?.highlights || []).slice(0, 6).map((h, i) => ({
    key: `${h.name}-${i}`,
    title: h.name,
    line: [kindWord(h.kind), isNum(h.ele_m) ? `${nf(h.ele_m)} m` : '',
      isNum(h.along_m) ? t('trails.atKm', { km: km1(h.along_m) }) : ''].filter(Boolean).join(', '),
    photo: nearestShot(h.along_m),
  }));
  const galleryPhotos = shots.length ? shots
    : (tr.img?.u ? toPhotos([{ u: tr.img.u, w: tr.img.w, h: tr.img.h }], { fallbackCaption: named.name })
      : (assoc.photoUrl ? toPhotos([assoc.photoUrl], { caption: assoc.photoOf ? t('detail.photoNear', { place: assoc.photoOf }) : named.name }) : []));
  const before = beforeGoItems({
    lines: notForLines('trail', tr, { reasons: detail?.reasons || tr.reasons, grade, ascent, totalM }),
  });
  const sources = [
    { label: detail?.attribution_text || tr.attribution_text || 'OpenStreetMap' },
  ];

  /* Before you go: season, waymarks, water, huts, dogs, permit, hazards. */
  const monthName = (v) => {
    const n = typeof v === 'number' ? v : MONTH_CODES.indexOf(String(v || '').slice(0, 3).toLowerCase()) + 1;
    return n >= 1 && n <= 12 ? monthShort(n) : '';
  };
  const atKm = (m) => (isNum(m) ? t('trails.atKm', { km: km1(m) }) : '');
  const waterPts = (detail?.water_points || []).filter((w) => w && (w.name || isNum(w.along_m)));
  const huts = (detail?.huts || []).filter((h) => h && h.name);
  const isUrl = (s) => /^https?:\/\//i.test(String(s || ''));
  const beforeRows = [
    season && {
      key: 'season',
      icon: <CalendarIcon size={16} />,
      title: season.allYear ? t('detail.seasonAllYear')
        : t('detail.monthRange', { from: monthShort(season.from), to: monthShort(season.to) }),
      text: season.est ? t('ox.seasonEst') : t('ox.seasonText'),
    },
    waymarked && {
      key: 'way',
      icon: <BootIcon size={16} />,
      title: t('ox.waymarked'),
      text: named.ref ? t('ox.waymarkedRef', { ref: named.ref }) : t('ox.waymarkedText'),
    },
    waterPts.length > 0 && {
      key: 'water',
      icon: <BottleIcon size={16} />,
      title: t('ox.water'),
      text: [waterPts.slice(0, 3).map((w) => [w.name || t('ox.waterPoint'), atKm(w.along_m)].filter(Boolean).join(' ')).join('; '),
        t('ox.waterNote')].join('. '),
    },
    ...huts.slice(0, 3).map((h, i) => {
      const bits = [atKm(h.along_m), isNum(h.ele_m) ? `${nf(h.ele_m)} m` : ''].filter(Boolean).join(', ');
      const open = Array.isArray(h.season) && h.season.length === 2 && monthName(h.season[0]) && monthName(h.season[1])
        ? t('ox.hutOpen', { from: monthName(h.season[0]), to: monthName(h.season[1]) }) : '';
      const book = h.booking && !isUrl(h.booking) ? String(h.booking) : '';
      return {
        key: `hut-${i}`,
        icon: <BedIcon size={16} />,
        title: h.name,
        text: [t('ox.hut'), bits, open, book].filter(Boolean).join(', '),
        link: isUrl(h.booking) ? <a href={h.booking} target="_blank" rel="noopener noreferrer">{t('ox.hutBook')}</a> : null,
      };
    }),
    ['yes', 'leash', 'no'].includes(detail?.dogs) && {
      key: 'dogs',
      icon: <InfoIcon size={16} />,
      title: t(`ox.dogs.${detail.dogs}`),
      text: '',
    },
    detail?.permit && {
      key: 'permit',
      icon: <TicketIcon size={16} />,
      title: t('ox.permit'),
      text: String(detail.permit),
    },
    ...before.map((it) => ({
      key: it.key,
      icon: <ItemIcon name={it.icon} size={16} />,
      title: t(it.titleKey, it.params),
      text: t(it.subKey, it.params),
      warn: Boolean(it.safety),
    })),
  ];

  /* Getting there: the start, parking, transit, one way or a loop. */
  const access = detail?.access || tr.access || null;
  const startInfo = detail?.start || null;
  const startName = startInfo?.name || null;
  const startEle = isNum(startInfo?.ele) ? startInfo.ele : (pts[0] && isNum(pts[0].ele) ? pts[0].ele : null);
  const nearLine = start && assoc.dest && startKm != null
    ? (startKm >= 2 ? t('trails.startNear', { km: Math.round(startKm), city: assoc.dest.city }) : t('trails.startIn', { city: assoc.dest.city }))
    : '';
  const mText = (m) => (m >= 1000 ? `${km1(m)} km` : `${Math.round(m)} m`);
  const parking = access?.parking || null;
  const parkFee = parking
    ? (isNum(parking.eur_day) ? t('ox.parkDay', { price: formatMoney(parking.eur_day) })
      : parking.fee === false ? t('ox.parkFree') : parking.fee === true ? t('ox.parkPaid') : '')
    : '';
  const transit = (Array.isArray(access?.transit) ? access.transit : []).filter((s) => s && s.name).slice(0, 3);
  const gettingRows = start ? [
    {
      key: 'start',
      icon: <MapPinIcon size={16} />,
      title: startName
        ? (isNum(startEle) ? t('ox.startNamedEle', { name: startName, ele: nf(startEle) }) : t('ox.startNamed', { name: startName }))
        : (isNum(startEle) ? t('ox.startEle', { ele: nf(startEle) }) : t('ox.start')),
      text: [nearLine, `${start.lat.toFixed(5)}, ${start.lon.toFixed(5)}`].filter(Boolean).join('. '),
      link: dirUrl ? <a href={dirUrl} target="_blank" rel="noopener noreferrer">{t('ox.directions')}</a> : null,
    },
    parking && {
      key: 'park',
      icon: <ParkingIcon size={16} />,
      title: parking.name ? t('ox.parkNamed', { name: parking.name }) : t('ox.parkStart'),
      text: [isNum(parking.m) ? t('ox.mFromStart', { d: mText(parking.m) }) : '', parkFee].filter(Boolean).join(', '),
    },
    ...transit.map((s, i) => {
      const Icon = TRANSIT_ICON[s.mode] || BusIcon;
      return {
        key: `tr-${i}`,
        icon: <Icon size={16} />,
        title: t(`ox.transit.${TRANSIT_ICON[s.mode] ? s.mode : 'bus'}`, { name: s.name }),
        text: isNum(s.m) ? t('ox.mWalk', { d: mText(s.m) }) : '',
      };
    }),
    !isCityDay && shapeKey && {
      key: 'shape',
      icon: isLoopShape ? <LoopIcon size={16} /> : <ArrowRightIcon size={16} />,
      title: shapeWord,
      text: t(isLoopShape ? 'ox.shapeLoop' : rt === 'out_back' ? 'ox.shapeBack' : 'ox.shapeOneWay'),
    },
  ] : [];

  /* The stages, the towns on the way, a city day's stops. */
  const hasStops = Array.isArray(stops) && stops.length > 0;
  const hasFamily = Boolean(family && family.size > 1);

  const onAdd = onAddToDay ? () => onAddToDay({
    id: tr.id, cc: tr.country || tr.cc, name: named.name,
    lat: start ? start.lat : (tr.bbox ? (tr.bbox[1] + tr.bbox[3]) / 2 : tr.lat),
    lon: start ? start.lon : (tr.bbox ? (tr.bbox[0] + tr.bbox[2]) / 2 : tr.lon),
  }) : null;

  const pdfModel = () => outdoorPdfModel({
    name: named.name,
    hook,
    facts: keyFacts,
    why: sights.length ? sights : why.slice(1).map((w) => ({ title: '', line: w.text })),
    before,
    sources,
    t,
    extra: {
      photos: galleryPhotos,
      where: place ? [place.city, place.country].filter(Boolean).join(', ') : '',
      route: pdfLine(pts).map((p) => [p.lon, p.lat]),
      profile: pdfLine(pts).filter((p) => Number.isFinite(p.ele)).map((p) => [p.m / 1000, p.ele]),
      url: shareUrl,
    },
  });

  const gpxLabel = t(canShareFiles ? 'trails.sendToApp' : 'trails.gpx');
  const sfKnown = detail?.sf ? 1 - (Number(detail.sf.unknown) || 0) : 0;
  const rankLine = !isCityDay && rating && !rating.unscored
    ? natureRankLine({ rank: rating.rank }, t, { place: place?.country || '' }) : '';

  const mapNode = (
    <MapShell getMap={getMap} relief beneath={['trail-casing']}>
      <div className="tpage-hero">
        <div className="tpage-map" ref={mapEl}>
          {/* The card's simplified line in ink while maplibre loads; the
              canvas crossfades over it (T396). */}
          <MapSketch lines={sketchLines} label={named.name} />
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
  );

  const profileNode = !isCityDay && (detail?.elevation || sfKnown >= 0.5) ? (
    <>
      {detail?.elevation && (
        <HeightProfile
          elevation={detail.elevation}
          atM={follow && onRoute ? onRoute.m : null}
          onScrub={highlightAt}
          markM={markM}
        />
      )}
      {/* What is underfoot, on the same route, where enough of it is known. */}
      {sfKnown >= 0.5 && (
        <div className="ox-surface">
          <p className="pt-muted">{t('route.surfaceTitle')}</p>
          <SurfaceBar sf={detail.sf} t={t} />
        </div>
      )}
    </>
  ) : null;

  const jumps = [
    { key: 'route', id: 'ox-route', label: t('ox.jump.route') },
    { key: 'before', id: 'ox-before', label: t('go.head') },
    { key: 'getting', id: 'ox-getting', label: t('detail.gettingThere') },
    { key: 'along', id: 'ox-along', label: t('ox.jump.along') },
    { key: 'near', id: 'ox-near', label: t('ox.jump.nearby') },
  ];

  const hasAlong = sights.length > 0 || hasStages || bases.length > 0 || hasStops || hasFamily;
  const climbLine = isNum(ascent) ? t('ox.climbM', { m: nf(ascent) }) : '';

  return (
    <OutdoorPage
      name={named.name}
      className="tpage-v2"
      backLabel={backLabel || t('detail.backTrails')}
      onClose={onClose}
      onEscape={escapeClose}
      fav={fav}
      onFav={onFav}
      onShare={onShare}
      resetKey={tr.id}
      toast={toast}
      following={follow}
      photos={galleryPhotos}
      photoFallback={{ city: named.name, iso2: tr.country || tr.cc }}
      head={{
        title: named.name,
        iso2: tr.country || tr.cc,
        where: place ? [place.country, place.city].filter(Boolean).join(', ') : '',
        rating: isCityDay ? (assoc.dest?.rating || null) : (rating || null),
        rank: rankLine,
        badges: [named.ref ? t('ox.routeRef', { ref: named.ref }) : null],
        lead: hook,
      }}
      factsLead={<RouteRainWarning lat={start?.lat} lon={start?.lon} sac={src.sac_scale} highlights={highlightCodes} />}
      facts={keyFacts}
      jumps={jumps}
      card={{
        title: t(isCityDay ? 'ox.card.day' : 'ox.card.walk'),
        rows: isCityDay ? [] : [
          { key: 'g', label: t('ox.fact.grade'), value: gradeWord },
          { key: 'l', label: t('ox.fact.length'), value: lengthText },
          { key: 't', label: t('ox.fact.time'), value: timeText },
          { key: 'c', label: t('ox.fact.climb'), value: climbText },
          { key: 'r', label: t('ox.fact.route'), value: shapeWord },
        ],
        onAdd,
        secondary: [
          <Button key="gpx" variant="secondary" size="sm" iconStart={<DownloadIcon size={16} />} onClick={onGpx}>
            {t('ox.gpx')}
          </Button>,
          dirUrl ? <OxLinkButton key="dir" href={dirUrl} icon={<RouteIcon size={16} />}>{t('ox.directions')}</OxLinkButton> : null,
        ],
        stay: assoc.destId && assoc.dest?.city ? (
          <StayLine destId={assoc.destId} city={assoc.dest.city} km={startKm ?? assoc.km} onOpen={onSelectDest} />
        ) : null,
      }}
      dock={{
        fig: [lengthText, timeText].filter(Boolean).join(', ') || named.name,
        note: gradeStep ? `T${gradeStep}` : '',
        sub: [climbLine, shapeWord && shapeWord.toLocaleLowerCase(lang)].filter(Boolean).join(', '),
      }}
      sources={sources}
      sourcesExtra={(
        <>
          {/* An upload is one more source, so its door sits with the others (T333). */}
          <UploadForm layer="trail" itemId={tr.id} />
          <ReportProblem item={{ layer: 'trail', id: tr.id, cc: tr.country || tr.cc, name: named.name }} />
        </>
      )}
    >
      <PSection id="ox-route" title={t('ox.jump.route')}
        note={!isCityDay && shapeWord ? shapeWord : null}>
        <RouteBlock
          map={mapNode}
          profile={profileNode}
          actions={follow ? null : (
            <>
              <Button variant="secondary" size="sm" className="ox-gpx" iconStart={<DownloadIcon size={16} />} onClick={onGpx}>
                {gpxLabel}
              </Button>
              <Button variant="secondary" size="sm" className="tpage-follow" iconStart={<CompassIcon size={16} />} onClick={startFollow}>
                {t('trails.follow')}
              </Button>
              <Button variant="secondary" size="sm" className="ipage-pdf" loading={pdfBusy}
                iconStart={<DownloadIcon size={16} />} onClick={() => onPdf(pdfModel())}>
                {t('ox.pdf')}
              </Button>
            </>
          )}
        />
      </PSection>

      {(gradeStep > 0 || beforeRows.some(Boolean)) && (
        <PSection id="ox-before" title={t('go.head')}>
          <GradeCard level={gradeStep} est={gradeEst} />
          <CheckRows rows={beforeRows} />
          {!isCityDay && <SafetyBlock />}
        </PSection>
      )}

      {gettingRows.some(Boolean) && (
        <PSection id="ox-getting" title={t('detail.gettingThere')}>
          <CheckRows rows={gettingRows} />
        </PSection>
      )}

      {hasAlong && (
        <PSection id="ox-along" title={t('ox.jump.along')}>
          <AlongCards items={sights} />
          {hasStages && (
            <div className="pt-block">
              <h3 className="pt-block-title">{t('route.stagesTitle')}</h3>
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
            <div className="pt-block">
              <h3 className="pt-block-title">{t('route.basesTitle')}</h3>
              <Bases bases={bases} t={t} onSelectDest={onSelectDest} />
            </div>
          )}
          {hasStops && (
            <div className="pt-block">
              <h3 className="pt-block-title">{t('trails.stopsTitle')}</h3>
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
            </div>
          )}
          {hasFamily && (
            <p className="pt-muted">
              {t('trails.familyPart', { name: family.n || family.k })}
              {', '}
              {t('trails.familyStages', { n: family.size })}
            </p>
          )}
        </PSection>
      )}

      {(exits.length > 0 || tr.nb) && (
        <PSection id="ox-near" title={t('ox.otherWalks')}>
          <OtherNearby exits={exits} hrefOf={(r) => featureHref('trail', { id: r.id, cc: r.country || r.cc })} />
          <NearbyOutdoors
            row={tr}
            cc={tr.country}
            headings={{ peak: 'nb.trail.peak', lake: 'nb.trail.lake', beach: 'nb.trail.beach' }}
            onOpen={onOpenNeighbour}
          />
        </PSection>
      )}
    </OutdoorPage>
  );
}
