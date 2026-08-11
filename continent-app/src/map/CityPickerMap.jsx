import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { hasLngLat, keepFitted } from './coords.js';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/* Tier glyphs, matching the app's line-icon language (24x24, currentColor).
   The icon - not colour alone - tells the traveller what kind of stop each
   pill is: a headline must-visit, a solid detour, or a quieter option. */
const TIER_ICON = {
  top: '<svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path d="m12 3.8 2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.4l-5.1 2.8 1.1-5.6-4.2-3.9 5.7-.7L12 3.8Z" fill="currentColor"/></svg>',
  great: '<svg viewBox="0 0 24 24" width="9" height="9" aria-hidden="true"><path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" fill="currentColor"/></svg>',
  good: '<svg viewBox="0 0 24 24" width="8" height="8" aria-hidden="true"><circle cx="12" cy="12" r="6.5" fill="currentColor"/></svg>',
  ok: '<svg viewBox="0 0 24 24" width="7" height="7" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
};

// Plane glyph for the "Fly here" sign on the arrival city.
const PLANE_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">'
  + '<path d="M21.5 15.5 L13.5 11 L13.5 4.5 C13.5 3.4 12.8 2.5 12 2.5 C11.2 2.5 10.5 3.4 10.5 4.5 L10.5 11 L2.5 15.5 L2.5 17.5 L10.5 15 L10.5 19.5 L8 21.2 L8 22.5 L12 21.5 L16 22.5 L16 21.2 L13.5 19.5 L13.5 15 L21.5 17.5 Z"/></svg>';

/**
 * The Stay step's map: every city of the chosen countries as a clickable
 * name-pill (the same visual language as the browse map's price pills), tinted
 * by its worth-a-visit tier. Picked cities render highlighted so the traveller
 * always sees their route taking shape geographically.
 *
 * Two interaction modes:
 *   - `onFocus` given: tapping a pill FOCUSES the city (the wizard shows its
 *     info panel with an explicit Add button), considered choices over
 *     accidental taps.
 *   - only `onToggle`: tapping toggles the city in/out directly (legacy).
 *
 * When the traveller lands somewhere (`anchor` = { lat, lon }), the map opens
 * zoomed in on that region instead of framing the whole country, the stays
 * conversation starts around where they arrive, and they can zoom out for
 * further cities.
 *
 * `cities`: [{ id, city, lat, lon, tierKey ('top'|'great'|'good'|'ok'),
 *             selected, isAnchor, focused, nights }]
 */
export function CityPickerMap({ cities = [], onToggle, onFocus, anchor = null }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const pinsRef = useRef(new Map()); // id -> { marker, el, label }
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const fitRef = useRef(null); // last bounds the pins were fitted to

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
    const unfit = keepFitted(map, containerRef.current, () => (
      fitRef.current ? { bounds: fitRef.current, padding: 46, maxZoom: 7 } : null
    ));
    mapRef.current = map;
    return () => { unfit(); map.remove(); mapRef.current = null; readyRef.current = false; pinsRef.current.clear(); };
  }, []);

  // The set of cities only changes with the chosen countries, rebuild then.
  const cityKey = cities.map((c) => c.id).join(';');
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const build = () => {
      pinsRef.current.forEach((p) => p.marker.remove());
      pinsRef.current.clear();
      const pts = cities.filter(hasLngLat);
      pts.forEach((c) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `citypick-pin tier-${c.tierKey || 'ok'}`;
        const icon = document.createElement('span');
        icon.className = 'citypick-ic';
        icon.innerHTML = TIER_ICON[c.tierKey] || TIER_ICON.ok;
        const label = document.createElement('span');
        label.className = 'citypick-name';
        label.textContent = c.city;
        const meta = document.createElement('span');
        meta.className = 'citypick-meta';
        // "Fly here" flag sits above the pill; CSS reveals it only on the
        // arrival city, so the traveller sees exactly where they land.
        const fly = document.createElement('span');
        fly.className = 'citypick-fly';
        fly.innerHTML = PLANE_SVG + '<span>Fly here</span>';
        el.append(fly, icon, label, meta);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onFocusRef.current) onFocusRef.current(c.id);
          else onToggleRef.current?.(c.id);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([c.lon, c.lat])
          .addTo(map);
        pinsRef.current.set(c.id, { marker, el, label, meta });
      });
      fitRef.current = null;
      if (hasLngLat(anchor)) {
        // Land the conversation where the traveller lands: open on the
        // arrival region, zoomed in enough that its neighbours read clearly.
        map.jumpTo({ center: [anchor.lon, anchor.lat], zoom: 7 });
      } else if (pts.length >= 2) {
        const b = pts.reduce(
          (acc, c) => acc.extend([c.lon, c.lat]),
          new maplibregl.LngLatBounds([pts[0].lon, pts[0].lat], [pts[0].lon, pts[0].lat]),
        );
        fitRef.current = b;
        map.fitBounds(b, { padding: 46, maxZoom: 7, duration: 0 });
      } else if (pts.length === 1) {
        map.jumpTo({ center: [pts[0].lon, pts[0].lat], zoom: 6.5 });
      }
      sync();
    };
    map._build = build;
    if (readyRef.current) build();
  }, [cityKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new arrival point (changed flight) recentres the view without a rebuild.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !hasLngLat(anchor)) return;
    map.flyTo({ center: [anchor.lon, anchor.lat], zoom: 7, duration: 600 });
  }, [anchor?.lat, anchor?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // Selection / nights / anchor states change often, restyle in place.
  const sync = () => {
    const byId = new Map(cities.map((c) => [c.id, c]));
    pinsRef.current.forEach((p, id) => {
      const c = byId.get(id);
      if (!c) return;
      p.el.classList.toggle('on', !!c.selected);
      p.el.classList.toggle('anchor', !!c.isAnchor);
      p.el.classList.toggle('focused', !!c.focused);
      p.label.textContent = c.city;
      // Once a city is in the trip its nights matter most; before that, its
      // rating helps the traveller weigh it. One number per pill, never both.
      if (c.selected && c.nights) {
        p.meta.textContent = `${c.nights}n`;
        p.meta.className = 'citypick-meta is-nights';
      } else if (c.score != null) {
        p.meta.textContent = c.score.toFixed(1);
        p.meta.className = 'citypick-meta is-score';
      } else {
        p.meta.textContent = '';
        p.meta.className = 'citypick-meta';
      }
    });
  };
  useEffect(sync, [cities]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="cpm citypick-map" ref={containerRef} />;
}
