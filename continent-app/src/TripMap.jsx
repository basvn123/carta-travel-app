import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

// Same clean, key-less Carto Voyager basemap the main map uses.
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/**
 * The trip's map backdrop: a full-bleed basemap that draws the itinerary as a
 * flowing dashed line through numbered pins, one per stop, and keeps the whole
 * route framed above the bottom sheet. Purely presentational — clicking a pin
 * calls `onSelectStop(index)` so the sheet can scroll/highlight if it wants.
 *
 * `stops` is the ordered list of { lat, lon, city } (stops without a resolved
 * destination are skipped). `padBottom` is how much of the viewport the bottom
 * sheet covers, so the route stays visible in the exposed strip.
 */
export function TripMap({ stops = [], padBottom = 320, onSelectStop, selectedIndex = null }) {
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
      readyRef.current = true;
      mapRef.current._drawTrip?.();
    });
    mapRef.current = map;
    return () => {
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

      // Route line through the stops.
      const src = map.getSource('trip-route');
      if (src) {
        src.setData({
          type: 'FeatureCollection',
          features: pts.length >= 2 ? [{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lon, p.lat]) },
          }] : [],
        });
      }

      // Numbered pins — reconcile by teardown+rebuild (there are only a handful).
      markersRef.current.forEach((m) => m.marker.remove());
      markersRef.current = pts.map((p, i) => {
        const el = document.createElement('div');
        el.className = 'trip-pin';
        el.title = p.city || `Stop ${i + 1}`;
        const num = document.createElement('span');
        num.textContent = String(i + 1);
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

      // Frame the whole route in the strip above the sheet.
      if (pts.length === 1) {
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
  }, [stops, padBottom]);

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
