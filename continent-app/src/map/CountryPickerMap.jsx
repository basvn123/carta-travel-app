import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { flagUrl } from '../lib/tripGuide.js';
import { hasLngLat } from './coords.js';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/**
 * A pannable map of every country in the catalogue, one clickable flag+name pin
 * at each country's centroid. Tapping a pin toggles it in `selected` (a Set of
 * country names) via `onToggle`. Lets you pick neighbouring countries visually
 * instead of hunting through the alphabetical list.
 */
export function CountryPickerMap({ countries = [], selected, onToggle }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const pinsRef = useRef(new Map()); // country name -> { marker, el }
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;

  // Init once + drop all pins on load, framed to fit every country.
  useEffect(() => {
    if (mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [12, 50],
      zoom: 3,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => { readyRef.current = true; mapRef.current._build?.(); });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; readyRef.current = false; pinsRef.current.clear(); };
  }, []);

  // Build/refresh the pins whenever the country list changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const build = () => {
      pinsRef.current.forEach((p) => p.marker.remove());
      pinsRef.current.clear();
      const pts = countries.filter((c) => hasLngLat(c.centroid));
      pts.forEach((c) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'cpm-pin';
        const img = flagUrl(c.iso2, 40);
        if (img) {
          const flag = document.createElement('img');
          flag.className = 'cpm-flag';
          flag.src = img;
          flag.alt = '';
          flag.loading = 'lazy';
          el.appendChild(flag);
        }
        const name = document.createElement('span');
        name.className = 'cpm-name';
        name.textContent = c.country;
        el.appendChild(name);
        el.addEventListener('click', (e) => { e.stopPropagation(); onToggleRef.current?.(c.country); });
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([c.centroid.lon, c.centroid.lat])
          .addTo(map);
        pinsRef.current.set(c.country, { marker, el });
      });
      if (pts.length >= 2) {
        const b = pts.reduce(
          (acc, c) => acc.extend([c.centroid.lon, c.centroid.lat]),
          new maplibregl.LngLatBounds(
            [pts[0].centroid.lon, pts[0].centroid.lat],
            [pts[0].centroid.lon, pts[0].centroid.lat],
          ),
        );
        map.fitBounds(b, { padding: 44, maxZoom: 5, duration: 0 });
      }
      syncSelection();
    };
    map._build = build;
    if (readyRef.current) build();
  }, [countries]);

  // Toggle the highlight on each pin when the selection changes.
  const syncSelection = () => {
    pinsRef.current.forEach((p, name) => p.el.classList.toggle('on', !!selected?.has(name)));
  };
  useEffect(syncSelection, [selected]);

  return <div className="cpm" ref={containerRef} />;
}
