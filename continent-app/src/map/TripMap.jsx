import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { hasLngLat, declutterPins } from './coords.js';

// Same clean, key-less Carto Voyager basemap the main map uses.
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// Country outlines for the `countryFills` layer, fetched once per session and
// shared by every map that asks for them. The basemap's vector tiles carry
// boundary LINES but no admin polygons, so a country cannot be painted from
// the tiles: these shapes ship with the app (see
// pipeline/oneoff/build_country_shapes.py).
let countryShapesPromise = null;
const loadCountryShapes = () => {
  if (!countryShapesPromise) {
    countryShapesPromise = fetch('/country_shapes.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .catch(() => ({ type: 'FeatureCollection', features: [] }));
  }
  return countryShapesPromise;
};

// How close two numbered stop pins may come, in screen pixels, before the
// later one is nudged clear. A pin is 26px wide, so this is "touching".
const MIN_PIN_SEP = 30;

// The drawn teardrop, which is bigger than the 26px marker box it hangs from
// and rises above its own coordinate. Used to keep a decluttered pin on the map.
const PIN_HALF = 19;
const PIN_TALL = 38;

// Category glyphs for the pickable POI pins, the same visual language as the
// explore map's pins (dem-pin), so "tappable place" reads the same everywhere.
const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const POI_CAT_ICONS = {
  town: S('<path d="M4 21V8l7-4 7 4v13"/><path d="M9 21v-5h4v5"/><path d="M8 10h.5M14 10h.5M8 13.5h.5M14 13.5h.5"/>'),
  beach: S('<path d="M3 20h18"/><path d="m4 20 5-8 3.5 5 2.5-3.5L20 20"/><path d="M9 12l1.5-2"/>'),
  sight: S('<path d="M12 3l2.4 5.9 6.1.5-4.7 4 1.5 6L12 16.1 6.6 19.4l1.5-6-4.7-4 6.1-.5z"/>'),
  active: S('<circle cx="13" cy="4.5" r="1.9"/><path d="M11 21l2-5-2.5-2.5.5-4 3.5 2 3 .8"/><path d="M13 16l-3.5.5L7 21"/>'),
};
const POI_STAR_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3l2.4 5.9 6.1.5-4.7 4 1.5 6L12 16.1 6.6 19.4l1.5-6-4.7-4 6.1-.5z"/></svg>';
const POI_PLUS_ICON = S('<path d="M12 5v14M5 12h14"/>');
// AI discoveries (day planner): places the AI found beyond the catalogue.
const POI_SPARK_ICON = S('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>');
// Festivals and dated events, which the catalogue structurally cannot hold.
const POI_EVENT_ICON = S('<path d="M4 8h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z"/><path d="M14 8v12"/>');

// The pushpin for places that are marked rather than sequenced (the travel
// record). Colours live in the stylesheet so it stays on the palette.
const PUSHPIN_SVG = '<svg class="trip-pin-push" viewBox="0 0 24 30" aria-hidden="true">'
  + '<path class="trip-pin-needle" d="M10.5 16h3L12 29.6z"/>'
  + '<circle class="trip-pin-head" cx="12" cy="9.6" r="8.4"/>'
  + '<circle class="trip-pin-dot" cx="12" cy="9.6" r="3.1"/></svg>';

/**
 * A chevron for the route line, drawn pixel by pixel into an RGBA buffer.
 * A line alone says which places are joined; it doesn't say which way the day
 * runs. Repeating this glyph along the line answers that at a glance.
 *
 * Built in code rather than loaded as an image so it stays inside the app's
 * strict CSP: no external asset and no data: URL to whitelist.
 */
function routeArrowImage(px = 26) {
  const data = new Uint8Array(px * px * 4);
  // Paper cream cut out of the rust line, the way a road sign reads: the
  // chevron has to contrast with the line it rides, not match it.
  const ink = [247, 242, 233];
  const halo = [150, 56, 18];
  const thickness = px * 0.15;
  const put = (x, y, rgb, a) => {
    const i = (y * px + x) * 4;
    if (a <= data[i + 3] / 255) return;
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2];
    data[i + 3] = Math.round(a * 255);
  };
  // Distance to the two strokes of a ">" chevron, rasterised with a soft edge.
  const seg = (x, y, x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
  };
  const a1 = [px * 0.34, px * 0.24], a2 = [px * 0.68, px * 0.5], a3 = [px * 0.34, px * 0.76];
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const d = Math.min(
        seg(x, y, a1[0], a1[1], a2[0], a2[1]),
        seg(x, y, a2[0], a2[1], a3[0], a3[1]),
      );
      const inkA = Math.max(0, Math.min(1, thickness - d + 0.5));
      const haloA = Math.max(0, Math.min(1, thickness + 1.3 - d + 0.5));
      if (haloA > 0) put(x, y, halo, haloA * 0.55);
      if (inkA > 0) put(x, y, ink, inkA);
    }
  }
  return { width: px, height: px, data };
}

/**
 * The trip's map backdrop: a full-bleed basemap that draws the itinerary as a
 * flowing dashed line through numbered pins, one per stop, and keeps the whole
 * route framed above the bottom sheet. Purely presentational, clicking a pin
 * calls `onSelectStop(index)` so the sheet can scroll/highlight if it wants.
 *
 * `stops` is the ordered list of { lat, lon, city } (stops without a resolved
 * destination are skipped). `padBottom` is how much of the viewport the bottom
 * sheet covers, so the route stays visible in the exposed strip.
 *
 * `routeGeometry` (optional) is a real, street-following path as [[lon,lat],...]
 * - e.g. an OSRM walking route. When given it's drawn as a solid line instead of
 * the straight dashed hops between pins; without it we fall back to straight
 * segments through the stops.
 *
 * `pois` (optional) are PICKABLE candidate places drawn as labelled explore
 * pins alongside the numbered route: [{ id, label, lat, lon,
 * cat ('town'|'beach'|'sight'|'active'), must }]. Tapping one calls
 * `onPoiClick(id)` - the Day planner adds it to the day, the pin becomes a
 * numbered stop, and the route redraws. Purely additive: without `pois` the
 * map behaves exactly as before.
 *
 * `countryFills` (optional) is a list of ISO2 codes to paint as filled
 * countries under the pins, e.g. ['AT','DE'] for the travel record's map of
 * where you have been.
 *
 * `photoZoom` (optional) is the zoom at which a plain pin carrying an `img`
 * swaps its head for a photo of the place, so zooming in tells you more than
 * zooming in on a dot would. `zoomControls` adds the +/- buttons, and
 * `cooperativeGestures` makes the wheel scroll the page unless ctrl is held,
 * which is what an embedded map inside a scrolling panel wants.
 */
export function TripMap({ stops = [], padBottom = 320, onSelectStop, selectedIndex = null, routeGeometry = null, routeSegments = null, showRoute = true, focus = null, pois = null, onPoiClick = null, onViewChange = null, fitMaxZoom = 7.5, fitPadding = null, scrollZoom = true, easeToSelected = true, countryFills = null, photoZoom = null, zoomControls = false, cooperativeGestures = false, mapLocale = null }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const poiMarkersRef = useRef([]);
  const lastFrameKeyRef = useRef(null);
  const declutterRef = useRef(null);
  const readyRef = useRef(false);
  const onSelectRef = useRef(onSelectStop);
  onSelectRef.current = onSelectStop;
  const onPoiClickRef = useRef(onPoiClick);
  onPoiClickRef.current = onPoiClick;
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  // iso2 -> [west, south, east, north], filled once the shapes land, so the
  // framing can hold a painted country whose pins sit in one corner of it.
  const countryBoundsRef = useRef(new Map());
  const countryFillsRef = useRef(countryFills);
  countryFillsRef.current = countryFills;
  const photoZoomRef = useRef(photoZoom);
  photoZoomRef.current = photoZoom;
  // The zoom the current framing settled on. Photos are meant to answer "I
  // zoomed in", so the threshold is one step past whatever the map opened at,
  // however wide or tight that was, and never later than `photoZoom`.
  const frameZoomRef = useRef(null);

  // Two stops 80m apart land on the same 26px pin at the zoom a whole day fits
  // into, and the pin drawn last simply covers the one before it: that is how a
  // six-stop route reads as "1, 2, 4, 5" with a number missing, or as the same
  // number twice when only a sliver of the buried pin shows. Nothing may move a
  // pin off its coordinate for good, so colliding pins fan apart in SCREEN
  // space only, recomputed on every move, and settle back onto the true point
  // as soon as the traveller zooms in far enough for them to stand apart.
  //
  // Returns declutter entries for the (nudged) stop pins, highest priority and
  // never demoted, so the numbers also win against candidate POI labels.
  const spreadStopPins = () => {
    const map = mapRef.current;
    if (!map) return [];
    const placed = [];
    // A pin wearing a photo is 44px across, not 26, so it needs more room
    // than a teardrop before two of them read as one.
    const sep = containerRef.current?.classList.contains('pins-photo') ? 54 : MIN_PIN_SEP;
    const clear = (x, y) => placed.every((p) => Math.hypot(p.x - x, p.y - y) >= sep);
    // Nowhere off the map. The pin is drawn UPWARD from its point (anchor
    // bottom), so a lift of 30-55px near the top edge put whole stop numbers
    // outside the canvas: on the full-screen map they hid under the header, and
    // on the AI proposal's small preview they landed on the card around it.
    // Better an overlapping pin, which the traveller can zoom apart, than a
    // pin that is not on the map at all.
    const canvas = map.getCanvas();
    const W = canvas.clientWidth || 0;
    const H = canvas.clientHeight || 0;
    const onMap = (x, y) => x >= PIN_HALF && x <= W - PIN_HALF && y >= PIN_TALL && y <= H;
    // Straight up first, then up-and-out, then sideways: a nudged pin should
    // read as lifted off a cluster, not as belonging to its neighbour.
    const fan = (pt) => {
      for (const r of [sep, sep * 1.85]) {
        for (const deg of [-90, -50, -130, -20, -160, 0, 180, 40, 140, 90]) {
          const a = (deg * Math.PI) / 180;
          const dx = Math.round(Math.cos(a) * r);
          const dy = Math.round(Math.sin(a) * r);
          if (clear(pt.x + dx, pt.y + dy) && onMap(pt.x + dx, pt.y + dy)) return { dx, dy };
        }
      }
      return { dx: 0, dy: 0 };
    };
    const out = [];
    markersRef.current.forEach((m) => {
      if (!m.el || !m.lngLat) return;
      let pt;
      try { pt = map.project(m.lngLat); } catch { return; }
      const { dx, dy } = clear(pt.x, pt.y) ? { dx: 0, dy: 0 } : fan(pt);
      placed.push({ x: pt.x + dx, y: pt.y + dy });
      m.el.style.setProperty('--pin-dx', `${dx}px`);
      m.el.style.setProperty('--pin-dy', `${dy}px`);
      m.el.classList.toggle('nudged', dx !== 0 || dy !== 0);
      let lngLat = m.lngLat;
      if (dx || dy) {
        try {
          const ll = map.unproject([pt.x + dx, pt.y + dy]);
          lngLat = [ll.lng, ll.lat];
        } catch { /* keep the true point */ }
      }
      out.push({ el: m.el, lngLat, priority: 100, keep: true });
    });
    return out;
  };

  // Initialise once.
  useEffect(() => {
    if (mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [10, 48],
      zoom: 3.6,
      attributionControl: { compact: true },
      interactive: true,
      // A map embedded in a scrolling column must not eat the wheel: reading
      // past the AI proposal would zoom the map instead of scrolling the page.
      // Drag, double-tap and pinch still work, and the route frames itself.
      scrollZoom,
      // The middle ground for an embedded map you are meant to explore: the
      // wheel scrolls the page until you hold ctrl, and one finger pans the
      // page while two move the map. MapLibre states both in an overlay.
      cooperativeGestures,
      ...(mapLocale ? { locale: mapLocale } : {}),
    });
    if (zoomControls) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), 'top-right');
    }
    // Above a threshold a plain pin is worth more than a dot: it becomes the
    // place's own photograph. The class rides the container so pins built
    // later inherit the current zoom state without a second pass.
    const syncPinZoom = () => {
      const el = containerRef.current;
      const abs = photoZoomRef.current;
      if (!el) return;
      if (abs == null) { el.classList.remove('pins-photo'); return; }
      const framed = frameZoomRef.current;
      const at = framed == null ? abs : Math.min(abs, framed + 0.9);
      const want = map.getZoom() >= at;
      if (want === el.classList.contains('pins-photo')) return;
      el.classList.toggle('pins-photo', want);
      // Pins just changed size: re-spread them against the new separation.
      spreadStopPins();
      declutterRef.current?.rerun();
    };
    map._syncPinZoom = syncPinZoom;
    map.on('zoom', syncPinZoom);
    map.on('load', syncPinZoom);
    map.on('load', () => {
      map.addSource('trip-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'trip-route-line',
        type: 'line',
        source: 'trip-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#c8501e',
          'line-width': 2.5,
          'line-dasharray': [1.5, 1.6],
          'line-opacity': 0.85,
        },
      });
      // Direction: chevrons riding the route line, so the day reads as a
      // sequence (stop 1 to 2 to 3) and not just as a set of joined dots.
      if (!map.hasImage('route-arrow')) map.addImage('route-arrow', routeArrowImage());
      map.addLayer({
        id: 'trip-route-arrows',
        type: 'symbol',
        source: 'trip-route',
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 92,
          'icon-image': 'route-arrow',
          'icon-size': 0.62,
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: { 'icon-opacity': 0.95 },
      });
      // Ferry legs of a route get their own over-water styling (dashed blue) so
      // a lake or sea crossing never reads as a walk in a straight line.
      map.addSource('trip-ferry', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'trip-ferry-line',
        type: 'line',
        source: 'trip-ferry',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#2b6f9e',
          'line-width': 3,
          'line-dasharray': [1, 1.4],
          'line-opacity': 0.9,
        },
      });
      // The container's final size settles a frame after this tab mounts (its
      // layout is driven by --panel-w / --filter-h). MapLibre sizes its canvas
      // once at construction, so without this it can bake in a 0x0 canvas and
      // render blank forever. Resize now, and keep observing for later changes.
      map.resize();
      readyRef.current = true;
      mapRef.current._drawTrip?.();
      mapRef.current._drawCountries?.();
    });
    // Let the parent react to where the map is looking (zoom-reveal of more
    // pins): report zoom + viewport bounds after every settle.
    map.on('moveend', () => {
      const cb = onViewChangeRef.current;
      if (!cb) return;
      const b = map.getBounds();
      cb({ zoom: map.getZoom(), bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] });
    });
    mapRef.current = map;

    // Re-sync the canvas to the container whenever it changes size (tab mount,
    // window resize, sheet width changes). This is what keeps the map from
    // staying blank when the container wasn't fully laid out at construction.
    //
    // Resizing alone is not enough when the container had NO size yet: the
    // framing that ran against a 0x0 canvas put every stop of the day on the
    // same pixel, and the pins then fanned out of the map entirely, so a
    // walking route read as a flower of numbers over the card. When a
    // container goes from unlaid-out to real, frame the route again (and drop
    // the frame-once memory, so a map that only frames once still gets its
    // one framing against a real canvas).
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      const laidOut = (el) => el.clientWidth >= 40 && el.clientHeight >= 40;
      let wasLaidOut = laidOut(containerRef.current);
      ro = new ResizeObserver(() => {
        map.resize();
        const el = containerRef.current;
        if (!el) return;
        const now = laidOut(el);
        if (now && !wasLaidOut) {
          lastFrameKeyRef.current = null;
          map._drawTrip?.();
        }
        wasLaidOut = now;
      });
      ro.observe(containerRef.current);
    }

    // Candidate POI pins are dense by design (up to 220 on a zoomed-in city),
    // so they get the same collision pass a real symbol layer would run.
    // Must-sees outrank ordinary places for the right to keep their name.
    //
    // The route's numbered pins join that pass as unbeatable entries: the day's
    // own stops are the one thing on this map that may never be buried, so a
    // candidate label that lands on top of a stop number gives up its name
    // instead. They also fan apart in screen space first (see spreadStopPins),
    // and the pass is fed the nudged positions so it declutters what is
    // actually drawn.
    const stopDeclutter = declutterPins(map, () => {
      const stopEntries = spreadStopPins();
      return [
        ...stopEntries,
        ...poiMarkersRef.current.map((entry) => (entry && entry.el ? {
          el: entry.el,
          lngLat: entry.lngLat,
          priority: entry.priority,
        } : null)).filter(Boolean),
      ];
    });
    declutterRef.current = stopDeclutter;

    return () => {
      declutterRef.current = null;
      stopDeclutter();
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // Deliberately once: scrollZoom is a construction-time option, and
    // rebuilding the map to change it would throw the viewport away.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw pins + route whenever the stop list (or the sheet height) changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // What zoom a framing will land on, worked out before the animation runs,
    // so the photo-pin threshold is known the moment the map is framed.
    const rememberFrameZoom = (bounds, opts) => {
      let z = null;
      try { z = map.cameraForBounds(bounds, { padding: opts.padding })?.zoom ?? null; } catch { z = null; }
      frameZoomRef.current = z == null ? null : Math.min(z, opts.maxZoom ?? Infinity);
      map._syncPinZoom?.();
    };

    const draw = () => {
      const pts = stops.filter(hasLngLat);

      // Route line: prefer mode-tagged segments (walk drawn solid, ferry drawn
      // as its own over-water line), then the flat street-following geometry,
      // and finally straight hops between the stops, dashed, as an estimate.
      const src = map.getSource('trip-route');
      const fsrc = map.getSource('trip-ferry');
      const asFeature = (coords) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
      if (src) {
        const segs = showRoute && Array.isArray(routeSegments) ? routeSegments : null;
        if (segs && segs.length) {
          const walk = segs.filter((s) => s.mode !== 'ferry' && s.coordinates?.length >= 2);
          const ferry = segs.filter((s) => s.mode === 'ferry' && s.coordinates?.length >= 2);
          src.setData({ type: 'FeatureCollection', features: walk.map((s) => asFeature(s.coordinates)) });
          fsrc?.setData({ type: 'FeatureCollection', features: ferry.map((s) => asFeature(s.coordinates)) });
          map.setPaintProperty('trip-route-line', 'line-dasharray', [1, 0]);
          map.setPaintProperty('trip-route-line', 'line-width', 4);
        } else {
          const hasReal = showRoute && Array.isArray(routeGeometry) && routeGeometry.length >= 2;
          const line = !showRoute ? null
            : hasReal ? routeGeometry
            : (pts.length >= 2 ? pts.map((p) => [p.lon, p.lat]) : null);
          src.setData({
            type: 'FeatureCollection',
            features: line ? [asFeature(line)] : [],
          });
          fsrc?.setData({ type: 'FeatureCollection', features: [] });
          map.setPaintProperty('trip-route-line', 'line-dasharray', hasReal ? [1, 0] : [1.5, 1.6]);
          map.setPaintProperty('trip-route-line', 'line-width', hasReal ? 4 : 2.5);
        }
      }

      // Numbered pins, reconcile by teardown+rebuild (there are only a handful).
      markersRef.current.forEach((m) => m.marker.remove());
      // A `stay` point (the traveller's own address) gets its own quiet pin
      // and doesn't consume a stop number. `no` lets the caller state the
      // number itself: the itinerary is the authority on which stop this is, so
      // a stop the map cannot plot (no coordinates) can never shift the numbers
      // of the ones it can, and the sidebar and the map always agree.
      // `plain` is a place on the map that is not a step in anything: the
      // travel record's visited cities have no order to carry, so they get the
      // teardrop without a number.
      let stopNo = 0;
      markersRef.current = pts.map((p, i) => {
        const bare = p.stay || p.plain;
        if (!bare) stopNo += 1;
        const no = bare ? null : (p.no ?? stopNo);
        // The marker element belongs to maplibre: it rewrites that element's
        // inline `transform` on every frame, which beats anything a stylesheet
        // says. So the teardrop's rotation lives on an inner shape and the
        // number rides upright inside it. Rotating the marker element itself is
        // what silently dropped the rotation and left every stop number tilted
        // 45 degrees, which is how a 6 came to read as a 9.
        const el = document.createElement('div');
        const withPhoto = !!(p.plain && p.img);
        el.className = `trip-pin${p.stay ? ' trip-pin-stay' : ''}${p.plain ? ' trip-pin-plain' : ''}${withPhoto ? ' has-photo' : ''}`;
        el.title = p.stay ? 'Your stay' : (p.city || `Stop ${no}`);
        const shape = document.createElement('span');
        shape.className = 'trip-pin-shape';
        if (p.plain) {
          // A pushpin, not a numbered teardrop: a round head on a needle
          // whose tip is the coordinate (the marker is anchored bottom).
          shape.innerHTML = PUSHPIN_SVG;
          // Zoomed in, the head lifts into a photo of the place with its name
          // under the needle. The needle never moves: the pin still points.
          if (withPhoto) {
            const photo = document.createElement('span');
            photo.className = 'trip-pin-photo';
            photo.style.backgroundImage = `url("${p.img}")`;
            const label = document.createElement('span');
            label.className = 'trip-pin-label';
            label.textContent = p.city || '';
            el.append(photo, label);
          }
        } else {
          const num = document.createElement('span');
          num.className = 'trip-pin-no';
          num.textContent = bare ? '' : String(no);
          shape.appendChild(num);
        }
        el.appendChild(shape);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectRef.current?.(i);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([p.lon, p.lat])
          .addTo(map);
        return { marker, el, lngLat: [p.lon, p.lat] };
      });
      spreadStopPins();

      // Frame the whole route in the strip above the sheet. With no stops yet,
      // settle on the plan's own city (focus) instead of the whole continent,       // a freshly opened saved day plan should show its city, not Europe.
      //
      // In pickable-pin mode (pois given) frame only once per focus: while the
      // traveller taps pins to build the day, every add changes `stops`, and
      // re-fitting each time would yank the viewport out from under them.
      const frameKey = focus ? `${focus.lat},${focus.lon}` : null;
      if (pois != null && frameKey && lastFrameKeyRef.current === frameKey) return;
      lastFrameKeyRef.current = frameKey;
      // A painted country belongs inside the frame: pins in one corner of
      // Germany must not leave the rest of it off the map.
      const fillBoxes = (countryFillsRef.current || [])
        .map((iso) => countryBoundsRef.current.get(iso))
        .filter(Boolean);
      if (fillBoxes.length) {
        const bounds = fillBoxes.reduce(
          (b, [w, s, e, n]) => b.extend([w, s]).extend([e, n]),
          new maplibregl.LngLatBounds(
            [fillBoxes[0][0], fillBoxes[0][1]],
            [fillBoxes[0][2], fillBoxes[0][3]],
          ),
        );
        pts.forEach((p) => bounds.extend([p.lon, p.lat]));
        const opts = {
          padding: fitPadding || { top: 70, left: 60, right: 60, bottom: padBottom + 20 },
          maxZoom: fitMaxZoom,
          duration: 700,
        };
        rememberFrameZoom(bounds, opts);
        map.fitBounds(bounds, opts);
        return;
      }
      if (pts.length === 0 && hasLngLat(focus)) {
        map.easeTo({
          center: [focus.lon, focus.lat],
          zoom: focus.zoom ?? 11,
          duration: 700,
          padding: { bottom: padBottom },
        });
      } else if (pts.length === 1) {
        frameZoomRef.current = 6;
        map._syncPinZoom?.();
        map.easeTo({ center: [pts[0].lon, pts[0].lat], zoom: 6, duration: 700, padding: { bottom: padBottom } });
      } else if (pts.length >= 2) {
        const bounds = pts.reduce(
          (b, p) => b.extend([p.lon, p.lat]),
          new maplibregl.LngLatBounds([pts[0].lon, pts[0].lat], [pts[0].lon, pts[0].lat]),
        );
        const opts = {
          // Framing margins assume a full-screen map with a sheet over its
          // bottom. An embedded map (the AI proposal preview) is a few hundred
          // pixels tall and states its own, or the route fits into a letterbox.
          padding: fitPadding || { top: 70, left: 60, right: 60, bottom: padBottom + 20 },
          maxZoom: fitMaxZoom,
          duration: 700,
        };
        rememberFrameZoom(bounds, opts);
        map.fitBounds(bounds, opts);
      }
    };

    // Store so the load handler can invoke the latest closure once ready.
    map._drawTrip = draw;
    if (readyRef.current) draw();
  }, [stops, padBottom, routeGeometry, routeSegments, showRoute, focus?.lat, focus?.lon, pois != null, fitMaxZoom, fitPadding]);

  // Filled countries (the travel record): the shapes load on first use only,
  // so every other map in the app pays nothing for this layer.
  const fillsKey = (countryFills || []).join(',');
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    const codes = (countryFills || []).filter(Boolean);
    const apply = async () => {
      if (!map.getSource('country-shapes')) {
        if (!codes.length) return;
        const data = await loadCountryShapes();
        if (cancelled || mapRef.current !== map || map.getSource('country-shapes')) return;
        map.addSource('country-shapes', { type: 'geojson', data });
        (data.features || []).forEach((f) => {
          let w = 180, s = 90, e = -180, n = -90;
          f.geometry.coordinates.forEach((poly) => poly.forEach((ring) => ring.forEach(([x, y]) => {
            if (x < w) w = x;
            if (x > e) e = x;
            if (y < s) s = y;
            if (y > n) n = y;
          })));
          countryBoundsRef.current.set(f.properties.iso2, [w, s, e, n]);
        });
        // Beneath the basemap's first symbol layer: a painted country must sit
        // under the place names it is there to give context to, never over them.
        const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
        map.addLayer({
          id: 'country-fill',
          type: 'fill',
          source: 'country-shapes',
          paint: { 'fill-color': '#e05a47', 'fill-opacity': 0.2 },
        }, firstSymbol);
        map.addLayer({
          id: 'country-outline',
          type: 'line',
          source: 'country-shapes',
          paint: { 'line-color': '#c8501e', 'line-width': 1.1, 'line-opacity': 0.75 },
        }, firstSymbol);
      }
      const filter = ['in', ['get', 'iso2'], ['literal', codes]];
      map.setFilter('country-fill', filter);
      map.setFilter('country-outline', filter);
      // The shapes arrive after the first framing, and a painted country is
      // part of what has to fit: frame again now that its extent is known.
      lastFrameKeyRef.current = null;
      map._drawTrip?.();
    };
    map._drawCountries = apply;
    if (readyRef.current) apply();
    return () => { cancelled = true; };
  }, [fillsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pickable candidate pins (Day planner): rebuild when the visible set
  // changes, a tapped pin leaves this list (it becomes a numbered stop), so
  // teardown+rebuild keeps the map honest with zero reconciliation logic.
  const poisKey = (pois || []).map((p) => `${p.id}${p.sel ? 's' : ''}`).join(';');
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    poiMarkersRef.current.forEach((m) => m.marker.remove());
    poiMarkersRef.current = [];
    (pois || []).filter(hasLngLat).forEach((p) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `dem-pin trip-poi-pin cat-${p.cat || 'sight'}${p.sel ? ' sel' : ''}${p.discovery ? ' ai-disc' : ''}${p.event ? ' ai-event' : ''}`;
      const ico = document.createElement('span');
      ico.className = 'dem-pin-ico';
      ico.innerHTML = p.event ? POI_EVENT_ICON : p.discovery ? POI_SPARK_ICON : (POI_CAT_ICONS[p.cat] || POI_CAT_ICONS.sight);
      const lbl = document.createElement('span');
      lbl.className = 'dem-pin-lbl';
      lbl.textContent = p.label;
      el.append(ico, lbl);
      if (p.must) {
        const star = document.createElement('span');
        star.className = 'dem-pin-star';
        star.innerHTML = POI_STAR_ICON;
        star.title = 'A true must-see';
        el.append(star);
      }
      // An AI discovery is a status pin too: it lives outside the catalogue,
      // so there is nothing behind it to add to the plan.
      if (p.discovery) {
        el.title = `${p.label} (a Carta bot find)`;
        poiMarkersRef.current.push({
          marker: new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([p.lon, p.lat])
            .addTo(map),
          el,
          lngLat: [p.lon, p.lat],
          priority: 9,
        });
        return;
      }
      // A selected pin ("show selected" mode) is a status, not a control:
      // it's already in the plan, so no plus affordance and no click-to-add.
      if (!p.sel) {
        const add = document.createElement('span');
        add.className = 'trip-poi-pin-add';
        add.innerHTML = POI_PLUS_ICON;
        el.append(add);
        el.title = `Add ${p.label} to this day`;
        el.addEventListener('click', (e) => { e.stopPropagation(); onPoiClickRef.current?.(p.id); });
      } else {
        el.title = `${p.label} is already in your plan`;
      }
      poiMarkersRef.current.push({
        marker: new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([p.lon, p.lat])
          .addTo(map),
        el,
        lngLat: [p.lon, p.lat],
        // Already in the plan > must-see > everything else.
        priority: p.sel ? 10 : p.must ? 8 : 4,
      });
    });
    // Filtering the deck rebuilds every pin without moving the map, so ask for
    // a collision pass: otherwise the new set draws all its labels at once and
    // a dense old town is a wall of overlapping names until you pan.
    declutterRef.current?.rerun();
    return () => {
      poiMarkersRef.current.forEach((m) => m.marker.remove());
      poiMarkersRef.current = [];
    };
  }, [poisKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Highlight the selected pin and ease it into the visible strip.
  //
  // A map that already frames every stop (the AI proposal preview) must not
  // recentre on the one you picked: it would push the rest of the day off a
  // 232px map to show you something you could already see.
  useEffect(() => {
    const map = mapRef.current;
    markersRef.current.forEach((m, i) => m.el.classList.toggle('active', i === selectedIndex));
    if (map && easeToSelected && selectedIndex != null) {
      const p = stops.filter(hasLngLat)[selectedIndex];
      if (p) map.easeTo({ center: [p.lon, p.lat], padding: { bottom: padBottom }, duration: 500 });
    }
  }, [selectedIndex, stops, padBottom, easeToSelected]);

  return <div className="trip-map" ref={containerRef} />;
}
