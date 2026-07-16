import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// Inline SVG plane, mirroring TransportIcons' PlaneIcon (markers are plain DOM,
// so the icon is embedded as markup rather than a React component).
const PLANE_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
  + '<path d="M21.5 15.5 L13.5 11 L13.5 4.5 C13.5 3.4 12.8 2.5 12 2.5 C11.2 2.5 10.5 3.4 10.5 4.5 L10.5 11 L2.5 15.5 L2.5 17.5 L10.5 15 L10.5 19.5 L8 21.2 L8 22.5 L12 21.5 L16 22.5 L16 21.2 L13.5 19.5 L13.5 15 L21.5 17.5 Z"/></svg>';

/**
 * The "how do you get there?" map: every bookable Ryanair route into the
 * chosen countries as a plane+price pill at its destination. People plan trips
 * spatially - seeing WHERE the cheap flights land beats scanning a list.
 *
 * `options`: [{ id, city, lat, lon, eur, selected }]
 * `origin`:  { lat, lon, city } of the departure airport (home pin + a faint
 *            great-circle line to the selected flight).
 * `onPick(id)`: select/deselect a flight.
 */
export function FlightPickerMap({ options = [], origin = null, onPick }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const pinsRef = useRef(new Map()); // id -> { marker, el }
  const originRef = useRef(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [10, 48],
      zoom: 3.4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => { readyRef.current = true; mapRef.current._build?.(); });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; readyRef.current = false; pinsRef.current.clear(); };
  }, []);

  // Rebuild pins when the option set changes (countries/dates edited).
  const optKey = options.map((o) => `${o.id}:${o.eur}`).join(';');
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const build = () => {
      pinsRef.current.forEach((p) => p.marker.remove());
      pinsRef.current.clear();
      if (originRef.current) { originRef.current.remove(); originRef.current = null; }

      const pts = options.filter((o) => o.lat != null && o.lon != null);
      pts.forEach((o) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'fpm-pin';
        el.title = `${o.city}: fly for ${o.eurLabel || ''}`;
        el.innerHTML = `${PLANE_SVG}<span class="fpm-price">${o.eurLabel}</span><span class="fpm-city">${o.city}</span>`;
        el.addEventListener('click', (e) => { e.stopPropagation(); onPickRef.current?.(o.id); });
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([o.lon, o.lat])
          .addTo(map);
        pinsRef.current.set(o.id, { marker, el });
      });

      if (origin && origin.lat != null) {
        const el = document.createElement('div');
        el.className = 'fpm-origin';
        el.innerHTML = `<span class="fpm-origin-dot"></span><span class="fpm-origin-name">${origin.city || 'Home'}</span>`;
        originRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([origin.lon, origin.lat])
          .addTo(map);
      }

      const all = [...pts, ...(origin && origin.lat != null ? [origin] : [])];
      if (all.length >= 2) {
        const b = all.reduce(
          (acc, c) => acc.extend([c.lon, c.lat]),
          new maplibregl.LngLatBounds([all[0].lon, all[0].lat], [all[0].lon, all[0].lat]),
        );
        map.fitBounds(b, { padding: 52, maxZoom: 7, duration: 0 });
      } else if (all.length === 1) {
        map.jumpTo({ center: [all[0].lon, all[0].lat], zoom: 5.5 });
      }
      sync();
    };
    map._build = build;
    if (readyRef.current) build();
  }, [optKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Selection changes restyle in place - no rebuild.
  const sync = () => {
    const byId = new Map(options.map((o) => [o.id, o]));
    pinsRef.current.forEach((p, id) => {
      p.el.classList.toggle('on', !!byId.get(id)?.selected);
    });
  };
  useEffect(sync, [options]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="cpm fpm-map" ref={containerRef} />;
}
