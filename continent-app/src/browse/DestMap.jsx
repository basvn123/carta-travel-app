import React from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { isNum, declutterPins } from '../map/coords.js';
import { keyablePin, nameMarker } from '../map/pinKeys.js';
import { TOKEN_COLOURS as TC } from '../map/tokenColors.js';
import { durationMs } from '../lib/motion.js';
import { installMapGestures } from '../lib/mapGestures.js';


/**
 * The destination page's one map. Four toggleable layers rather than four
 * maps: highlights (numbered, matching the tiles under it), everything within
 * 20 km (one colour per outdoor layer), nearby top picks, and day trips. The
 * parent owns the toggle; this component renders the layer it is told to.
 *
 * Same two contained gotchas as before: the lazily imported maplibre-gl.css
 * lands after styles.css (so pin transforms live on an inner element the
 * library never touches), and every coordinate goes through isNum because one
 * NaN in setLngLat/fitBounds blanks the whole app via the error boundary.
 *
 * Pins talk back: a numbered pin click calls onPickHighlight(index) so the
 * matching tile can scroll into view. Map and list stay in sync both ways
 * (carta-design "Map and list in sync", T395): `hover` is the tile or pin
 * under the pointer or in focus, ringed 2 px ink; pointing at a pin calls
 * onHoverHighlight so the tile outlines too. `focus` is the committed
 * selection (a click or tap on a tile or a pin): its badge is the one
 * accent on the map and the camera eases to it.
 *
 * Every pin that does something on click is also a keyboard stop (T190,
 * map/pinKeys.js): Tab reaches it, Enter or Space does what the click does.
 * Pins with nothing behind them (the town itself, a day trip that is not a
 * catalogue place) stay out of the tab order.
 */

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// One colour per outdoor layer, shared with the CSS (.dmap-pin.is-<layer>).
const LAYER_COLOR = {
  trails: TC['--trail-pin'], cycling: TC['--swim-ink'], mountains: TC['--mountain-ink'],
  lakes: TC['--lake-ink'], beaches: TC['--beach-ink'], nearby: TC['--trail-pin'],
};

function makeEl(className, html) {
  const el = document.createElement('div');
  el.className = className;
  if (html) el.innerHTML = html;
  return el;
}

const esc = (s) => String(s || '').replace(/[<>&]/g, '');

const DestMap = React.forwardRef(function DestMap({
  place, highlights = [], trips = [], nearby = [], around = [],
  active = 'highlights', height = 300, focus = null, hover = null,
  onPickTrip, onPickHighlight, onPickFeature, onHoverHighlight,
}, ref) {
  const holder = React.useRef(null);
  const mapRef = React.useRef(null);
  const readyRef = React.useRef(false);
  const markersRef = React.useRef([]);
  const declutterRef = React.useRef(null);
  const pinElsRef = React.useRef([]);
  // The focus pin is restyled in place by the light effect below, so a
  // rebuild reads the current focus through a ref instead of depending on it.
  const focusRef = React.useRef(focus);
  focusRef.current = focus;
  const hoverRef = React.useRef(hover);
  hoverRef.current = hover;
  const hoverCb = React.useRef(onHoverHighlight);
  hoverCb.current = onHoverHighlight;
  // The pick callbacks arrive as fresh arrows on every parent render. Read
  // through a ref, so a hover (which re-renders the parent) never rebuilds
  // the markers under the pointer or takes the focus off a pin (T395).
  const picks = React.useRef({});
  picks.current = { onPickTrip, onPickHighlight, onPickFeature };

  React.useImperativeHandle(ref, () => ({
    resize() { try { mapRef.current?.resize(); } catch { /* not mounted */ } },
  }), []);

  const lat = place?.lat;
  const lon = place?.lon;

  // The parent rebuilds its row arrays on every render; the markers rebuild
  // only when what they show changes, read from a ref and keyed by content.
  const rowsRef = React.useRef({});
  rowsRef.current = { highlights, trips, nearby, around };
  const rowsKey = [highlights, trips, nearby, around]
    .map((a) => (a || []).map((r) => `${r.id ?? r.name}:${r.lat}:${r.lon}`).join('|')).join('#');
  const hasTrip = !!onPickTrip;
  const hasHl = !!onPickHighlight;
  const hasFeature = !!onPickFeature;
  const renderLayer = React.useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    declutterRef.current?.();
    declutterRef.current = null;
    pinElsRef.current = [];

    const { highlights, trips, nearby, around } = rowsRef.current;
    const rows = active === 'trips' ? trips
      : active === 'nearby' ? nearby
        : active === 'around' ? around : highlights;
    const pts = [];

    // The town itself, always.
    const main = makeEl('pm-pin', `<span class="pm-pin-in"><span class="pm-pin-dot dmap-home-dot"></span><span class="pm-pin-name">${esc(place?.name)}</span></span>`);
    markersRef.current.push(
      new maplibregl.Marker({ element: main, anchor: 'center' })
        .setLngLat([lon, lat]).addTo(map),
    );
    nameMarker(main, '');

    const entries = [];
    rows.forEach((row, i) => {
      if (!isNum(row.lat) || !isNum(row.lon)) return;
      pts.push([row.lon, row.lat]);
      let el;
      if (active === 'highlights') {
        el = makeEl(`dmap-pin is-hl ${focusRef.current === i ? 'is-focus' : ''} ${hoverRef.current === i ? 'is-hover' : ''}`, `<span class="dmap-pin-in"><span class="dmap-pin-n mono">${i + 1}</span><span class="dmap-pin-name">${esc(row.name)}</span></span>`);
        if (hasHl) {
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => { e.stopPropagation(); picks.current.onPickHighlight?.(i); });
          keyablePin(el, `${i + 1} ${row.name || ''}`.trim(), () => picks.current.onPickHighlight?.(i), { map, lngLat: [row.lon, row.lat] });
        }
        // Pointing at a pin, or tabbing to it, outlines its tile.
        el.addEventListener('mouseenter', () => hoverCb.current?.(i));
        el.addEventListener('mouseleave', () => hoverCb.current?.(null));
        el.addEventListener('focus', () => hoverCb.current?.(i));
        el.addEventListener('blur', () => hoverCb.current?.(null));
      } else if (active === 'trips') {
        el = makeEl('dmap-pin is-trip', `<span class="dmap-pin-in"><span class="dmap-pin-dot"></span><span class="dmap-pin-name">${esc(row.name)}${row.travel?.minutes ? ` <span class="mono">${Math.round(row.travel.minutes)}m</span>` : ''}</span></span>`);
        if (hasTrip && row.kind === 'destination') {
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => { e.stopPropagation(); picks.current.onPickTrip?.(row); });
          keyablePin(el, row.name, () => picks.current.onPickTrip?.(row), { map, lngLat: [row.lon, row.lat] });
        }
      } else {
        const color = LAYER_COLOR[row.layer] || LAYER_COLOR.nearby;
        el = makeEl(`dmap-pin is-nature is-${row.layer || 'nearby'}`, `<span class="dmap-pin-in"><span class="dmap-pin-dot" style="background:${color}"></span><span class="dmap-pin-name">${esc(row.name)}</span></span>`);
        if (hasFeature && row.layer) {
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => { e.stopPropagation(); picks.current.onPickFeature?.(row.layer, row); });
          keyablePin(el, row.name, () => picks.current.onPickFeature?.(row.layer, row), { map, lngLat: [row.lon, row.lat] });
        }
      }
      el.title = row.name || '';
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([row.lon, row.lat]).addTo(map);
      nameMarker(el);
      markersRef.current.push(marker);
      entries.push({ el, lngLat: [row.lon, row.lat] });
      pinElsRef.current.push(el);
    });

    if (entries.length) {
      // declutterPins takes a GETTER, called fresh on every pass.
      declutterRef.current = declutterPins(map, () => entries, { padding: 3 });
    }

    if (pts.length) {
      const b = new maplibregl.LngLatBounds([lon, lat], [lon, lat]);
      for (const p of pts) b.extend(p);
      try {
        map.fitBounds(b, {
          padding: { top: 40, bottom: 28, left: 34, right: 34 },
          maxZoom: active === 'highlights' ? 14 : active === 'trips' ? 10.5 : 11.5,
          // The camera moves once, to what the layer shows (--dur-4; 0 under
          // reduced motion, which durationMs answers).
          duration: durationMs('--dur-4'),
        });
      } catch { /* a bad bound is not worth a blank page */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the rows are read from rowsRef; rowsKey is their content
  }, [active, rowsKey, lat, lon, place?.name, hasTrip, hasHl, hasFeature]);

  // The map's load handler draws whatever layer is current by then.
  const renderLayerRef = React.useRef(renderLayer);
  renderLayerRef.current = renderLayer;

  React.useEffect(() => {
    if (!holder.current || !isNum(lat) || !isNum(lon)) return undefined;
    const map = new maplibregl.Map({
      container: holder.current,
      style: MAP_STYLE,
      center: [lon, lat],
      zoom: 11.5,
      attributionControl: { compact: true },
      cooperativeGestures: false,
      dragRotate: false,
      touchPitch: false,
    });
    mapRef.current = map;
    // Two fingers pan, a pinch or a mouse wheel zooms, and on a phone the
    // map stays still under a scrolling thumb (T430, lib/mapGestures.js).
    map._gestures = installMapGestures(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      readyRef.current = true;
      renderLayerRef.current();
      // The compact credit opens itself over the pins on a wide map; it
      // starts folded to its button, one tap from the full line (T446).
      holder.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(holder.current);
    return () => {
      ro.disconnect();
      declutterRef.current?.();
      declutterRef.current = null;
      readyRef.current = false;
      map._gestures?.dispose();
      map.remove();
      mapRef.current = null;
    };
    // The map itself is created once per destination; layers re-render below.
  }, [lat, lon]);

  React.useEffect(() => { renderLayer(); }, [renderLayer]);

  // Hover and selection: restyle in place, no marker rebuild.
  React.useEffect(() => {
    if (active !== 'highlights') return;
    pinElsRef.current.forEach((el, i) => el.classList.toggle('is-hover', hover === i));
  }, [hover, active]);
  React.useEffect(() => {
    if (active !== 'highlights') return;
    pinElsRef.current.forEach((el, i) => el.classList.toggle('is-focus', focus === i));
    // The committed highlight: the camera eases to it when it sits outside
    // the frame, so a tile chosen in the list is never selected off-map.
    const map = mapRef.current;
    const row = focus != null ? highlights[focus] : null;
    if (!map || !readyRef.current || !row || !isNum(row.lat) || !isNum(row.lon)) return;
    try {
      if (!map.getBounds().contains([row.lon, row.lat])) {
        map.easeTo({ center: [row.lon, row.lat], duration: durationMs('--dur-4') });
      }
    } catch { /* the map is gone */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to a new selection only; the highlight rows are read at that moment
  }, [focus, active]);

  if (!isNum(lat) || !isNum(lon)) return null;
  return <div className="place-map dmap" style={{ height }} ref={holder} />;
});

export default DestMap;
