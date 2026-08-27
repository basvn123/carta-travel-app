import React from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { isNum, declutterPins } from '../map/coords.js';

/**
 * The destination page's one map. Three toggleable layers rather than three
 * maps: highlights (numbered, matching the cards under it), day trips, and
 * nearby nature. The parent owns the toggle; this component just renders the
 * layer it is told to.
 *
 * Same two contained gotchas as PlaceMap: the lazily imported maplibre-gl.css
 * lands after styles.css (so pin transforms live on an inner element the
 * library never touches), and every coordinate goes through isNum because one
 * NaN in setLngLat/fitBounds blanks the whole app via the error boundary.
 *
 * preserveDrawingBuffer is on, which PlaceMap deliberately avoids: the PDF
 * export snapshots this canvas with toDataURL, and without the flag WebGL
 * hands back transparent pixels. The cost (a retained back buffer) is paid
 * only while a destination page is actually open.
 */

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

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
  place, highlights = [], trips = [], nearby = [], active = 'highlights',
  height = 300, onPickTrip,
}, ref) {
  const holder = React.useRef(null);
  const mapRef = React.useRef(null);
  const readyRef = React.useRef(false);
  const markersRef = React.useRef([]);
  const declutterRef = React.useRef(null);
  // What the active layer put on the map, kept for the snapshot: DOM markers
  // are not part of the WebGL canvas, so the export redraws them by hand.
  const pinsRef = React.useRef([]);

  React.useImperativeHandle(ref, () => ({
    snapshot() {
      const map = mapRef.current;
      if (!map) return null;
      try {
        const gl = map.getCanvas();
        const out = document.createElement('canvas');
        out.width = gl.width;
        out.height = gl.height;
        const ctx = out.getContext('2d');
        ctx.drawImage(gl, 0, 0);
        const scale = gl.width / gl.clientWidth;
        const accent = token('--accent', '#e05a47');
        for (const pin of pinsRef.current) {
          let pt;
          try { pt = map.project(pin.lngLat); } catch { continue; }
          const x = pt.x * scale;
          const y = pt.y * scale;
          const r = (pin.n != null ? 9 : 6) * scale;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = pin.color || accent;
          ctx.fill();
          ctx.lineWidth = 2 * scale;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
          if (pin.n != null) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `600 ${10 * scale}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(pin.n), x, y + 0.5 * scale);
          }
        }
        return out.toDataURL('image/jpeg', 0.85);
      } catch { return null; }
    },
  }), []);

  const lat = place?.lat;
  const lon = place?.lon;

  // Build the marker set for the active layer. Runs on layer switch and on
  // map ready; tears its own markers down first.
  const renderLayer = React.useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    declutterRef.current?.();
    declutterRef.current = null;

    const accent = token('--accent', '#e05a47');
    const rows = active === 'trips' ? trips
      : active === 'nearby' ? nearby : highlights;
    const pts = [];
    pinsRef.current = [];

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
        el = makeEl('dmap-pin', `<span class="dmap-pin-in"><span class="dmap-pin-n mono">${i + 1}</span><span class="dmap-pin-name">${esc(row.name)}</span></span>`);
      } else if (active === 'trips') {
        el = makeEl('dmap-pin is-trip', `<span class="dmap-pin-in"><span class="dmap-pin-dot"></span><span class="dmap-pin-name">${esc(row.name)}${row.travel?.minutes ? ` <span class="mono">${Math.round(row.travel.minutes)}m</span>` : ''}</span></span>`);
        if (onPickTrip && row.kind === 'destination') {
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => { e.stopPropagation(); onPickTrip(row); });
        }
      } else {
        el = makeEl('dmap-pin is-nature', `<span class="dmap-pin-in"><span class="dmap-pin-dot"></span><span class="dmap-pin-name">${esc(row.name)}</span></span>`);
      }
      el.title = row.name || '';
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([row.lon, row.lat]).addTo(map);
      markersRef.current.push(marker);
      entries.push({ el, lngLat: [row.lon, row.lat] });
      pinsRef.current.push({
        lngLat: [row.lon, row.lat],
        n: active === 'highlights' ? i + 1 : null,
        color: active === 'nearby' ? '#3d7a4e' : null,
      });
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
          padding: 46,
          maxZoom: active === 'highlights' ? 14 : 10.5,
          duration: reduce ? 0 : 450,
        });
      } catch { /* a bad bound is not worth a blank page */ }
    }
  }, [active, highlights, trips, nearby, lat, lon, place?.name, onPickTrip]);

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
      preserveDrawingBuffer: true,
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

  if (!isNum(lat) || !isNum(lon)) return null;
  return <div className="place-map dmap" style={{ height }} ref={holder} />;
});

export default DestMap;
