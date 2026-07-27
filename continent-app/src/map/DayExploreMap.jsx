import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { hasLngLat, finitePts, declutterPins } from './coords.js';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// A small, consistent glyph per category so every pin reads at a glance -
// stroked line icons in the same visual language as the rest of the app.
const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const CAT_ICONS = {
  town: S('<path d="M4 21V8l7-4 7 4v13"/><path d="M9 21v-5h4v5"/><path d="M8 10h.5M14 10h.5M8 13.5h.5M14 13.5h.5"/>'),
  beach: S('<path d="M3 20h18"/><path d="m4 20 5-8 3.5 5 2.5-3.5L20 20"/><path d="M9 12l1.5-2"/>'),
  sight: S('<path d="M12 3l2.4 5.9 6.1.5-4.7 4 1.5 6L12 16.1 6.6 19.4l1.5-6-4.7-4 6.1-.5z"/>'),
  active: S('<circle cx="13" cy="4.5" r="1.9"/><path d="M11 21l2-5-2.5-2.5.5-4 3.5 2 3 .8"/><path d="M13 16l-3.5.5L7 21"/>'),
};
const CHECK_ICON = S('<path d="M5 12.5l4.5 4.5L19 6.5"/>');
const STAR_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3l2.4 5.9 6.1.5-4.7 4 1.5 6L12 16.1 6.6 19.4l1.5-6-4.7-4 6.1-.5z"/></svg>';

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
export function DayExploreMap({ stay, markers = [], onFocus, onStayClick, stayFocused, flyTo }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const pinsRef = useRef(new Map());
  const declutterRef = useRef(null);
  const stayRef = useRef(null);
  const stayElRef = useRef(null);
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const onStayClickRef = useRef(onStayClick);
  onStayClickRef.current = onStayClick;

  useEffect(() => {
    if (mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: hasLngLat(stay) ? [stay.lon, stay.lat] : [10, 48],
      zoom: hasLngLat(stay) ? 10.3 : 4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => { readyRef.current = true; mapRef.current._build?.(); });
    // Better-rated places win the right to keep their name when pins collide.
    const stopDeclutter = declutterPins(map, () => (
      [...pinsRef.current.values()].map(({ el, m }) => ({
        el,
        lngLat: [m.lon, m.lat],
        priority: (m.score ?? (m.must ? 8 : 4)) + (m.cat === 'town' ? 2 : 0),
      }))
    ));
    declutterRef.current = stopDeclutter;
    mapRef.current = map;
    return () => {
      declutterRef.current = null;
      stopDeclutter();
      map.remove(); mapRef.current = null; readyRef.current = false; pinsRef.current.clear();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stay pin + recenter when the address changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasLngLat(stay)) return;
    if (stayRef.current) { stayRef.current.remove(); stayRef.current = null; }
    const el = document.createElement('div');
    el.className = 'dem-stay';
    // A proper teardrop map pin whose tip lands on the coordinate, with a home
    // glyph inside the head (this is "your stay") and the label above it. The
    // pin artwork is a static SVG string; the label is third-party data (a
    // Nominatim display name), so it goes in via textContent, never innerHTML.
    const nameEl = document.createElement('span');
    nameEl.className = 'dem-stay-name';
    nameEl.textContent = stay.label || 'Your stay';
    el.appendChild(nameEl);
    el.insertAdjacentHTML('beforeend',
      '<span class="dem-stay-pin"><span class="dem-stay-pulse"></span>'
      + '<svg class="dem-stay-svg" viewBox="0 0 26 36" width="26" height="36" aria-hidden="true">'
      + '<path class="dem-stay-body" d="M13 1C6.4 1 1 6.3 1 12.9 1 21.6 13 35 13 35s12-13.4 12-22.1C25 6.3 19.6 1 13 1z"/>'
      + '<path class="dem-stay-glyph" d="M8.4 13.4 13 9.4l4.6 4M9.6 12.4V17.2h6.8V12.4"/>'
      + '</svg></span>');
    // When the stay sits in a catalogue town, the red pin is the way in to it:
    // clicking briefs that town and everything around it.
    el.addEventListener('click', (e) => { e.stopPropagation(); onStayClickRef.current?.(); });
    stayElRef.current = el;
    stayRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([stay.lon, stay.lat])
      .addTo(map);
    map.jumpTo({ center: [stay.lon, stay.lat], zoom: 10.3 });
  }, [stay?.lat, stay?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // Glide to a searched/suggested pin (each request bumps flyTo.k), keeping the
  // stay in view by never zooming further out than we already are.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasLngLat(flyTo)) return;
    map.easeTo({
      center: [flyTo.lon, flyTo.lat],
      zoom: Math.max(map.getZoom(), 11.5),
      duration: 700,
    });
  }, [flyTo?.k]); // eslint-disable-line react-hooks/exhaustive-deps

  // The pin only behaves as a button when there's a town to brief.
  useEffect(() => {
    const el = stayElRef.current;
    if (!el) return;
    el.classList.toggle('dem-stay-clickable', !!onStayClick);
    el.classList.toggle('focused', !!stayFocused);
  }, [onStayClick, stayFocused, stay?.lat, stay?.lon]);

  // Rebuild pins when the visible marker set changes (filters, radius).
  const markerKey = markers.map((m) => m.id).join(';');
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Frame the whole picture: every visible pin plus the stay, so nothing
    // worth tapping sits outside the map. Top padding leaves room for the
    // pin labels; maxZoom keeps a tight cluster from zooming in to street level.
    const fitAll = () => {
      const pts = finitePts(markers).map((m) => [m.lon, m.lat]);
      if (hasLngLat(stay)) pts.push([stay.lon, stay.lat]);
      if (pts.length < 2) return;
      const bounds = pts.reduce(
        (b, p) => b.extend(p),
        new maplibregl.LngLatBounds(pts[0], pts[0]),
      );
      map.fitBounds(bounds, {
        padding: { top: 72, right: 60, bottom: 48, left: 60 },
        maxZoom: 12.5,
        duration: 650,
      });
    };
    const build = () => {
      pinsRef.current.forEach((p) => p.marker.remove());
      pinsRef.current.clear();
      finitePts(markers).forEach((m) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `dem-pin cat-${m.cat}`;
        const ico = document.createElement('span');
        ico.className = 'dem-pin-ico';
        ico.innerHTML = CAT_ICONS[m.cat] || '';
        const chk = document.createElement('span');
        chk.className = 'dem-pin-chk';
        chk.innerHTML = CHECK_ICON;
        const lbl = document.createElement('span');
        lbl.className = 'dem-pin-lbl';
        lbl.textContent = m.label;
        el.append(ico, chk, lbl);
        // Guidance at a glance: towns wear their 0-10 traveller rating
        // (tier-coloured like every ScoreChip), must-see places a star.
        if (m.score != null) {
          const rate = document.createElement('span');
          rate.className = `dem-pin-rate rt-${m.tier ?? 0}`;
          rate.textContent = m.score.toFixed(1);
          el.append(rate);
        } else if (m.must) {
          const star = document.createElement('span');
          star.className = 'dem-pin-star';
          star.innerHTML = STAR_ICON;
          star.title = 'A true must-see';
          el.append(star);
        }
        el.title = m.label;
        el.addEventListener('click', (e) => { e.stopPropagation(); onFocusRef.current?.(m.id); });
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([m.lon, m.lat])
          .addTo(map);
        pinsRef.current.set(m.id, { marker, el, m });
      });
      sync();
      fitAll();
      // A filter chip rebuilds the pins; fitAll only moves the map when there
      // are two points to frame, so ask for a collision pass either way.
      declutterRef.current?.rerun();
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
