import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/**
 * The Day planner's explore map: opens zoomed in on the traveller's stay (a
 * standout home pin), with everything around it as filterable, tappable pins -
 * towns, beaches & nature, sights, activities. Tapping a pin FOCUSES it (the
 * panel next to the map briefs it); selection happens there, deliberately.
 *
 * `stay`:    { lat, lon, label }
 * `markers`: [{ id, label, lat, lon, cat ('town'|'beach'|'sight'|'active'),
 *              selected, focused }]
 * `onFocus(id)`
 */
export function DayExploreMap({ stay, markers = [], onFocus }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const pinsRef = useRef(new Map());
  const stayRef = useRef(null);
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  useEffect(() => {
    if (mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: stay ? [stay.lon, stay.lat] : [10, 48],
      zoom: stay ? 10.3 : 4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => { readyRef.current = true; mapRef.current._build?.(); });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; readyRef.current = false; pinsRef.current.clear(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stay pin + recenter when the address changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !stay || stay.lat == null) return;
    if (stayRef.current) { stayRef.current.remove(); stayRef.current = null; }
    const el = document.createElement('div');
    el.className = 'dem-stay';
    el.innerHTML = '<span class="dem-stay-pulse"></span><span class="dem-stay-dot"></span>'
      + `<span class="dem-stay-name">${stay.label || 'Your stay'}</span>`;
    stayRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([stay.lon, stay.lat])
      .addTo(map);
    map.jumpTo({ center: [stay.lon, stay.lat], zoom: 10.3 });
  }, [stay?.lat, stay?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild pins when the visible marker set changes (filters, radius).
  const markerKey = markers.map((m) => m.id).join(';');
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const build = () => {
      pinsRef.current.forEach((p) => p.marker.remove());
      pinsRef.current.clear();
      markers.filter((m) => m.lat != null && m.lon != null).forEach((m) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `dem-pin cat-${m.cat}`;
        el.textContent = m.label;
        el.addEventListener('click', (e) => { e.stopPropagation(); onFocusRef.current?.(m.id); });
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([m.lon, m.lat])
          .addTo(map);
        pinsRef.current.set(m.id, { marker, el });
      });
      sync();
    };
    map._build = build;
    if (readyRef.current) build();
  }, [markerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const sync = () => {
    const byId = new Map(markers.map((m) => [m.id, m]));
    pinsRef.current.forEach((p, id) => {
      const m = byId.get(id);
      if (!m) return;
      p.el.classList.toggle('on', !!m.selected);
      p.el.classList.toggle('focused', !!m.focused);
    });
  };
  useEffect(sync, [markers]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="cpm dem-map" ref={containerRef} />;
}
