import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Same clean, key-less Carto Voyager basemap the main map uses.
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// Category glyphs for the pickable POI pins, the same visual language as the
// explore map's pins (dem-pin), so "tappable place" reads the same everywhere.
const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const POI_CAT_ICONS = {
  town: S('<path d="M4 21V8l7-4 7 4v13"/><path d="M9 21v-5h4v5"/><path d="M8 10h.5M14 10h.5M8 13.5h.5M14 13.5h.5"/>'),
  beach: S('<path d="M3 20h18"/><path d="m4 20 5-8 3.5 5 2.5-3.5L20 20"/><path d="M9 12l1.5-2"/>'),
  sight: S('<path d="M12 3l2.4 5.9 6.1.5-4.7 4 1.5 6L12 16.1 6.6 19.4l1.5-6-4.7-4 6.1-.5z"/>'),
  active: S('<circle cx="13" cy="4.5" r="1.9"/><path d="M11 21l2-5-2.5-2.5.5-4 3.5 2 3 .8"/><path d="M13 16l-3.5.5L7 21"/>'),
};
const POI_STAR_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3l2.4 5.9 6.1.5-4.7 4 1.5 6L12 16.1 6.6 19.4l1.5-6-4.7-4 6.1-.5z"/></svg>';
const POI_PLUS_ICON = S('<path d="M12 5v14M5 12h14"/>');

/**
 * The trip's map backdrop: a full-bleed basemap that draws the itinerary as a
 * flowing dashed line through numbered pins, one per stop, and keeps the whole
 * route framed above the bottom sheet. Purely presentational, clicking a pin
 * calls `onSelectStop(index)` so the sheet can scroll/highlight if it wants.
 *
 * `stops` is the ordered list of { lat, lon, city } (stops without a resolved
 * destination are skipped). `padBottom` is how much of the viewport the bottom
 * sheet covers, so the route stays visible in the exposed strip.
 *
 * `routeGeometry` (optional) is a real, street-following path as [[lon,lat],...]
 * - e.g. an OSRM walking route. When given it's drawn as a solid line instead of
 * the straight dashed hops between pins; without it we fall back to straight
 * segments through the stops.
 *
 * `pois` (optional) are PICKABLE candidate places drawn as labelled explore
 * pins alongside the numbered route: [{ id, label, lat, lon,
 * cat ('town'|'beach'|'sight'|'active'), must }]. Tapping one calls
 * `onPoiClick(id)` - the Day planner adds it to the day, the pin becomes a
 * numbered stop, and the route redraws. Purely additive: without `pois` the
 * map behaves exactly as before.
 */
export function TripMap({ stops = [], padBottom = 320, onSelectStop, selectedIndex = null, routeGeometry = null, routeSegments = null, showRoute = true, focus = null, pois = null, onPoiClick = null, fitMaxZoom = 7.5 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const poiMarkersRef = useRef([]);
  const lastFrameKeyRef = useRef(null);
  const readyRef = useRef(false);
  const onSelectRef = useRef(onSelectStop);
  onSelectRef.current = onSelectStop;
  const onPoiClickRef = useRef(onPoiClick);
  onPoiClickRef.current = onPoiClick;

  // Initialise once.
  useEffect(() => {
    if (mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [10, 48],
      zoom: 3.6,
      attributionControl: { compact: true },
      interactive: true,
    });
    map.on('load', () => {
      map.addSource('trip-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'trip-route-line',
        type: 'line',
        source: 'trip-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#c8501e',
          'line-width': 2.5,
          'line-dasharray': [1.5, 1.6],
          'line-opacity': 0.85,
        },
      });
      // Ferry legs of a route get their own over-water styling (dashed blue) so
      // a lake or sea crossing never reads as a walk in a straight line.
      map.addSource('trip-ferry', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'trip-ferry-line',
        type: 'line',
        source: 'trip-ferry',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#2b6f9e',
          'line-width': 3,
          'line-dasharray': [1, 1.4],
          'line-opacity': 0.9,
        },
      });
      // The container's final size settles a frame after this tab mounts (its
      // layout is driven by --panel-w / --filter-h). MapLibre sizes its canvas
      // once at construction, so without this it can bake in a 0x0 canvas and
      // render blank forever. Resize now, and keep observing for later changes.
      map.resize();
      readyRef.current = true;
      mapRef.current._drawTrip?.();
    });
    mapRef.current = map;

    // Re-sync the canvas to the container whenever it changes size (tab mount,
    // window resize, sheet width changes). This is what keeps the map from
    // staying blank when the container wasn't fully laid out at construction.
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => map.resize());
      ro.observe(containerRef.current);
    }

    return () => {
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  // Redraw pins + route whenever the stop list (or the sheet height) changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = () => {
      const pts = stops.filter((s) => s && s.lat != null && s.lon != null);

      // Route line: prefer mode-tagged segments (walk drawn solid, ferry drawn
      // as its own over-water line), then the flat street-following geometry,
      // and finally straight hops between the stops, dashed, as an estimate.
      const src = map.getSource('trip-route');
      const fsrc = map.getSource('trip-ferry');
      const asFeature = (coords) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
      if (src) {
        const segs = showRoute && Array.isArray(routeSegments) ? routeSegments : null;
        if (segs && segs.length) {
          const walk = segs.filter((s) => s.mode !== 'ferry' && s.coordinates?.length >= 2);
          const ferry = segs.filter((s) => s.mode === 'ferry' && s.coordinates?.length >= 2);
          src.setData({ type: 'FeatureCollection', features: walk.map((s) => asFeature(s.coordinates)) });
          fsrc?.setData({ type: 'FeatureCollection', features: ferry.map((s) => asFeature(s.coordinates)) });
          map.setPaintProperty('trip-route-line', 'line-dasharray', [1, 0]);
          map.setPaintProperty('trip-route-line', 'line-width', 4);
        } else {
          const hasReal = showRoute && Array.isArray(routeGeometry) && routeGeometry.length >= 2;
          const line = !showRoute ? null
            : hasReal ? routeGeometry
            : (pts.length >= 2 ? pts.map((p) => [p.lon, p.lat]) : null);
          src.setData({
            type: 'FeatureCollection',
            features: line ? [asFeature(line)] : [],
          });
          fsrc?.setData({ type: 'FeatureCollection', features: [] });
          map.setPaintProperty('trip-route-line', 'line-dasharray', hasReal ? [1, 0] : [1.5, 1.6]);
          map.setPaintProperty('trip-route-line', 'line-width', hasReal ? 4 : 2.5);
        }
      }

      // Numbered pins, reconcile by teardown+rebuild (there are only a handful).
      markersRef.current.forEach((m) => m.marker.remove());
      // A `stay` point (the traveller's own address) gets its own quiet pin
      // and doesn't consume a stop number.
      let stopNo = 0;
      markersRef.current = pts.map((p, i) => {
        const el = document.createElement('div');
        el.className = p.stay ? 'trip-pin trip-pin-stay' : 'trip-pin';
        el.title = p.stay ? 'Your stay' : (p.city || `Stop ${i + 1}`);
        const num = document.createElement('span');
        num.textContent = p.stay ? '' : String((stopNo += 1));
        el.appendChild(num);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectRef.current?.(i);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([p.lon, p.lat])
          .addTo(map);
        return { marker, el };
      });

      // Frame the whole route in the strip above the sheet. With no stops yet,
      // settle on the plan's own city (focus) instead of the whole continent,       // a freshly opened saved day plan should show its city, not Europe.
      //
      // In pickable-pin mode (pois given) frame only once per focus: while the
      // traveller taps pins to build the day, every add changes `stops`, and
      // re-fitting each time would yank the viewport out from under them.
      const frameKey = focus ? `${focus.lat},${focus.lon}` : null;
      if (pois != null && frameKey && lastFrameKeyRef.current === frameKey) return;
      lastFrameKeyRef.current = frameKey;
      if (pts.length === 0 && focus && focus.lat != null && focus.lon != null) {
        map.easeTo({
          center: [focus.lon, focus.lat],
          zoom: focus.zoom ?? 11,
          duration: 700,
          padding: { bottom: padBottom },
        });
      } else if (pts.length === 1) {
        map.easeTo({ center: [pts[0].lon, pts[0].lat], zoom: 6, duration: 700, padding: { bottom: padBottom } });
      } else if (pts.length >= 2) {
        const bounds = pts.reduce(
          (b, p) => b.extend([p.lon, p.lat]),
          new maplibregl.LngLatBounds([pts[0].lon, pts[0].lat], [pts[0].lon, pts[0].lat]),
        );
        map.fitBounds(bounds, {
          padding: { top: 70, left: 60, right: 60, bottom: padBottom + 20 },
          maxZoom: fitMaxZoom,
          duration: 700,
        });
      }
    };

    // Store so the load handler can invoke the latest closure once ready.
    map._drawTrip = draw;
    if (readyRef.current) draw();
  }, [stops, padBottom, routeGeometry, routeSegments, showRoute, focus?.lat, focus?.lon, pois != null, fitMaxZoom]);

  // Pickable candidate pins (Day planner): rebuild when the visible set
  // changes, a tapped pin leaves this list (it becomes a numbered stop), so
  // teardown+rebuild keeps the map honest with zero reconciliation logic.
  const poisKey = (pois || []).map((p) => p.id).join(';');
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    poiMarkersRef.current.forEach((m) => m.remove());
    poiMarkersRef.current = [];
    (pois || []).filter((p) => p.lat != null && p.lon != null).forEach((p) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `dem-pin trip-poi-pin cat-${p.cat || 'sight'}`;
      const ico = document.createElement('span');
      ico.className = 'dem-pin-ico';
      ico.innerHTML = POI_CAT_ICONS[p.cat] || POI_CAT_ICONS.sight;
      const add = document.createElement('span');
      add.className = 'trip-poi-pin-add';
      add.innerHTML = POI_PLUS_ICON;
      const lbl = document.createElement('span');
      lbl.className = 'dem-pin-lbl';
      lbl.textContent = p.label;
      el.append(ico, lbl);
      if (p.must) {
        const star = document.createElement('span');
        star.className = 'dem-pin-star';
        star.innerHTML = POI_STAR_ICON;
        star.title = 'A true must-see';
        el.append(star);
      }
      el.append(add);
      el.title = `Add ${p.label} to this day`;
      el.addEventListener('click', (e) => { e.stopPropagation(); onPoiClickRef.current?.(p.id); });
      poiMarkersRef.current.push(
        new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([p.lon, p.lat])
          .addTo(map),
      );
    });
    return () => {
      poiMarkersRef.current.forEach((m) => m.remove());
      poiMarkersRef.current = [];
    };
  }, [poisKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Highlight the selected pin and ease it into the visible strip.
  useEffect(() => {
    const map = mapRef.current;
    markersRef.current.forEach((m, i) => m.el.classList.toggle('active', i === selectedIndex));
    if (map && selectedIndex != null) {
      const p = stops.filter((s) => s && s.lat != null && s.lon != null)[selectedIndex];
      if (p) map.easeTo({ center: [p.lon, p.lat], padding: { bottom: padBottom }, duration: 500 });
    }
  }, [selectedIndex, stops, padBottom]);

  return <div className="trip-map" ref={containerRef} />;
}
