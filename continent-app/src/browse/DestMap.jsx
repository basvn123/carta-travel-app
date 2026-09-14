import React from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { isNum, declutterPins } from '../map/coords.js';

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
 * matching tile can scroll into view, and the `focus` prop marks one pin as
 * the tile the reader is looking at.
 */

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// One colour per outdoor layer, shared with the CSS (.dmap-pin.is-<layer>).
const LAYER_COLOR = {
  trails: '#3d7a4e', cycling: '#2c6376', mountains: '#6b5b95',
  lakes: '#2a6f9e', beaches: '#c48a2a', nearby: '#3d7a4e',
};

function token(name, fallback) {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function makeEl(className, html) {
  const el = document.createElement('div');
  el.className = className;
  if (html) el.innerHTML = html;
  return el;
}

const esc = (s) => String(s || '').replace(/[<>&]/g, '');

const DestMap = React.forwardRef(function DestMap({
  place, highlights = [], trips = [], nearby = [], around = [],
  active = 'highlights', height = 300, focus = null,
  onPickTrip, onPickHighlight, onPickFeature,
}, ref) {
  const holder = React.useRef(null);
  const mapRef = React.useRef(null);
  const readyRef = React.useRef(false);
  const markersRef = React.useRef([]);
  const declutterRef = React.useRef(null);
  const pinElsRef = React.useRef([]);

  React.useImperativeHandle(ref, () => ({
    resize() { try { mapRef.current?.resize(); } catch { /* not mounted */ } },
  }), []);

  const lat = place?.lat;
  const lon = place?.lon;

  const renderLayer = React.useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    declutterRef.current?.();
    declutterRef.current = null;
    pinElsRef.current = [];

    const accent = token('--accent', '#e05a47');
    const rows = active === 'trips' ? trips
      : active === 'nearby' ? nearby
        : active === 'around' ? around : highlights;
    const pts = [];

    // The town itself, always.
    const main = makeEl('pm-pin', `<span class="pm-pin-in"><span class="pm-pin-dot" style="background:${accent}"></span><span class="pm-pin-name">${esc(place?.name)}</span></span>`);
    markersRef.current.push(
      new maplibregl.Marker({ element: main, anchor: 'center' })
        .setLngLat([lon, lat]).addTo(map),
    );

    const entries = [];
    rows.forEach((row, i) => {
      if (!isNum(row.lat) || !isNum(row.lon)) return;
      pts.push([row.lon, row.lat]);
      let el;
      if (active === 'highlights') {
        el = makeEl(`dmap-pin is-hl ${focus === i ? 'is-focus' : ''}`, `<span class="dmap-pin-in"><span class="dmap-pin-n mono">${i + 1}</span><span class="dmap-pin-name">${esc(row.name)}</span></span>`);
        if (onPickHighlight) {
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => { e.stopPropagation(); onPickHighlight(i); });
        }
      } else if (active === 'trips') {
        el = makeEl('dmap-pin is-trip', `<span class="dmap-pin-in"><span class="dmap-pin-dot"></span><span class="dmap-pin-name">${esc(row.name)}${row.travel?.minutes ? ` <span class="mono">${Math.round(row.travel.minutes)}m</span>` : ''}</span></span>`);
        if (onPickTrip && row.kind === 'destination') {
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => { e.stopPropagation(); onPickTrip(row); });
        }
      } else {
        const color = LAYER_COLOR[row.layer] || LAYER_COLOR.nearby;
        el = makeEl(`dmap-pin is-nature is-${row.layer || 'nearby'}`, `<span class="dmap-pin-in"><span class="dmap-pin-dot" style="background:${color}"></span><span class="dmap-pin-name">${esc(row.name)}</span></span>`);
        if (onPickFeature && row.layer) {
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => { e.stopPropagation(); onPickFeature(row.layer, row); });
        }
      }
      el.title = row.name || '';
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([row.lon, row.lat]).addTo(map);
      markersRef.current.push(marker);
      entries.push({ el, lngLat: [row.lon, row.lat] });
      pinElsRef.current.push(el);
    });

    if (entries.length) {
      // declutterPins takes a GETTER, called fresh on every pass.
      declutterRef.current = declutterPins(map, () => entries, { padding: 3 });
    }

    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (pts.length) {
      const b = new maplibregl.LngLatBounds([lon, lat], [lon, lat]);
      for (const p of pts) b.extend(p);
      try {
        map.fitBounds(b, {
          padding: { top: 40, bottom: 28, left: 34, right: 34 },
          maxZoom: active === 'highlights' ? 14 : active === 'trips' ? 10.5 : 11.5,
          duration: reduce ? 0 : 450,
        });
      } catch { /* a bad bound is not worth a blank page */ }
    }
  // The focus pin is restyled in a lighter effect below; it must not rebuild
  // every marker.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, highlights, trips, nearby, around, lat, lon, place?.name, onPickTrip, onPickHighlight, onPickFeature]);

  React.useEffect(() => {
    if (!holder.current || !isNum(lat) || !isNum(lon)) return undefined;
    const map = new maplibregl.Map({
      container: holder.current,
      style: MAP_STYLE,
      center: [lon, lat],
      zoom: 11.5,
      attributionControl: { compact: true },
      scrollZoom: false,
      cooperativeGestures: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => { readyRef.current = true; renderLayer(); });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(holder.current);
    return () => {
      ro.disconnect();
      declutterRef.current?.();
      declutterRef.current = null;
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // The map itself is created once per destination; layers re-render below.
  }, [lat, lon]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => { renderLayer(); }, [renderLayer]);

  // Focus: restyle in place, no marker rebuild.
  React.useEffect(() => {
    if (active !== 'highlights') return;
    pinElsRef.current.forEach((el, i) => el.classList.toggle('is-focus', focus === i));
  }, [focus, active]);

  if (!isNum(lat) || !isNum(lon)) return null;
  return <div className="place-map dmap" style={{ height }} ref={holder} />;
});

export default DestMap;
