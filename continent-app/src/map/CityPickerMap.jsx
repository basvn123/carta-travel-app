import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/**
 * The Stay step's map: every city of the chosen countries as a clickable
 * name-pill (the same visual language as the browse map's price pills), tinted
 * by its worth-a-visit tier. Tapping a pill toggles the city in/out of the
 * trip via `onToggle(id)`; picked cities render highlighted so the traveller
 * always sees their route taking shape geographically.
 *
 * `cities`: [{ id, city, lat, lon, tierKey ('top'|'great'|'good'|'ok'),
 *             selected, isAnchor, nights }]
 */
export function CityPickerMap({ cities = [], onToggle }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const pinsRef = useRef(new Map()); // id -> { marker, el, label }
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;

  useEffect(() => {
    if (mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [12, 48],
      zoom: 4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => { readyRef.current = true; mapRef.current._build?.(); });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; readyRef.current = false; pinsRef.current.clear(); };
  }, []);

  // The set of cities only changes with the chosen countries - rebuild then.
  const cityKey = cities.map((c) => c.id).join(';');
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const build = () => {
      pinsRef.current.forEach((p) => p.marker.remove());
      pinsRef.current.clear();
      const pts = cities.filter((c) => c.lat != null && c.lon != null);
      pts.forEach((c) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `citypick-pin tier-${c.tierKey || 'ok'}`;
        const label = document.createElement('span');
        label.className = 'citypick-name';
        label.textContent = c.city;
        el.appendChild(label);
        el.addEventListener('click', (e) => { e.stopPropagation(); onToggleRef.current?.(c.id); });
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([c.lon, c.lat])
          .addTo(map);
        pinsRef.current.set(c.id, { marker, el, label });
      });
      if (pts.length >= 2) {
        const b = pts.reduce(
          (acc, c) => acc.extend([c.lon, c.lat]),
          new maplibregl.LngLatBounds([pts[0].lon, pts[0].lat], [pts[0].lon, pts[0].lat]),
        );
        map.fitBounds(b, { padding: 46, maxZoom: 7, duration: 0 });
      } else if (pts.length === 1) {
        map.jumpTo({ center: [pts[0].lon, pts[0].lat], zoom: 6.5 });
      }
      sync();
    };
    map._build = build;
    if (readyRef.current) build();
  }, [cityKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Selection / nights / anchor states change often - restyle in place.
  const sync = () => {
    const byId = new Map(cities.map((c) => [c.id, c]));
    pinsRef.current.forEach((p, id) => {
      const c = byId.get(id);
      if (!c) return;
      p.el.classList.toggle('on', !!c.selected);
      p.el.classList.toggle('anchor', !!c.isAnchor);
      p.label.textContent = c.selected && c.nights
        ? `${c.city} · ${c.nights}n`
        : c.city;
    });
  };
  useEffect(sync, [cities]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="cpm citypick-map" ref={containerRef} />;
}
