import React from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { isNum } from '../map/coords.js';

/**
 * The locator map in the destination panel: this place, pinned, with the
 * sights around it.
 *
 * Loaded through React.lazy from the panel, so maplibre and its stylesheet
 * stay out of the Explore bundle for everyone who never opens a destination.
 *
 * Two gotchas this file exists to contain, both already paid for elsewhere in
 * the repo:
 *
 *   maplibre-gl.css is imported lazily here, and it lands AFTER the app's own
 *   stylesheet in the cascade. Anything it can reach (marker positioning in
 *   particular) has to be defended in the markup rather than assumed from
 *   styles.css, which is why the pin's own transform lives on an INNER element
 *   (maplibre rewrites the marker root's inline transform every frame).
 *
 *   Every coordinate is gated through isNum. One NaN inside setLngLat or
 *   fitBounds throws, and the throw reaches the app-wide error boundary, so a
 *   single half-geocoded sight would blank the whole app.
 *
 * scrollZoom is off on purpose. The map sits inside a scrolling panel, and a
 * map that eats the scroll wheel traps a reader halfway down the page.
 */

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/** A design token as a concrete colour: MapLibre paint cannot read a CSS var. */
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

export default function PlaceMap({ lat, lon, city, pois = [], height = 208 }) {
  const holder = React.useRef(null);
  const mapRef = React.useRef(null);

  // Only the sights that actually have a coordinate, capped: the map is an
  // orientation aid, not a second copy of the list below it.
  const pins = React.useMemo(
    () => (pois || []).filter((p) => isNum(p.lat) && isNum(p.lon)).slice(0, 12),
    [pois],
  );

  React.useEffect(() => {
    if (!holder.current || !isNum(lat) || !isNum(lon)) return undefined;
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const map = new maplibregl.Map({
      container: holder.current,
      style: MAP_STYLE,
      center: [lon, lat],
      zoom: 12.4,
      attributionControl: { compact: true },
      scrollZoom: false,
      cooperativeGestures: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const accent = token('--accent', '#e05a47');

    map.on('load', () => {
      // The town itself: one pin, named, and unmistakably the subject.
      const main = makeEl('pm-pin', `<span class="pm-pin-in"><span class="pm-pin-dot" style="background:${accent}"></span><span class="pm-pin-name">${
        String(city || '').replace(/[<>&]/g, '')
      }</span></span>`);
      new maplibregl.Marker({ element: main, anchor: 'center' })
        .setLngLat([lon, lat]).addTo(map);

      for (const p of pins) {
        const el = makeEl('pm-poi', '<span class="pm-poi-in"></span>');
        el.title = p.name || '';
        new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([p.lon, p.lat]).addTo(map);
      }

      // Frame the sights when there are any, but never zoom past the town.
      if (pins.length >= 2) {
        const b = new maplibregl.LngLatBounds([lon, lat], [lon, lat]);
        for (const p of pins) b.extend([p.lon, p.lat]);
        try {
          map.fitBounds(b, { padding: 42, maxZoom: 14, duration: reduce ? 0 : 500 });
        } catch { /* a bad bound is not worth a blank panel */ }
      }
    });

    // The panel animates in, so the canvas can be measured mid-transition.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(holder.current);

    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
  }, [lat, lon, city, pins]);

  if (!isNum(lat) || !isNum(lon)) return null;
  return <div className="place-map" style={{ height }} ref={holder} />;
}
