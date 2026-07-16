import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Same clean, key-less Carto Voyager basemap the main map uses.
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/**
 * The trip's map backdrop: a full-bleed basemap that draws the itinerary as a
 * flowing dashed line through numbered pins, one per stop, and keeps the whole
 * route framed above the bottom sheet. Purely presentational - clicking a pin
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
 */
export function TripMap({ stops = [], padBottom = 320, onSelectStop, selectedIndex = null, routeGeometry = null, routeSegments = null, showRoute = true, focus = null }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const readyRef = useRef(false);
  const onSelectRef = useRef(onSelectStop);
  onSelectRef.current = onSelectStop;

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
      // and finally straight hops between the stops - dashed, as an estimate.
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

      // Numbered pins - reconcile by teardown+rebuild (there are only a handful).
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
      // settle on the plan's own city (focus) instead of the whole continent -
      // a freshly opened saved day plan should show its city, not Europe.
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
          maxZoom: 7.5,
          duration: 700,
        });
      }
    };

    // Store so the load handler can invoke the latest closure once ready.
    map._drawTrip = draw;
    if (readyRef.current) draw();
  }, [stops, padBottom, routeGeometry, routeSegments, showRoute, focus?.lat, focus?.lon]);

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
