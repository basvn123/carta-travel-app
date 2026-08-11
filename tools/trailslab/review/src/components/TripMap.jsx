import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { cleanLines, boundsOf } from '../coords.js';

// Same basemap the app draws on, so a reviewer judges the line against the
// terrain they will see in production.
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

const SOURCES = {
  portal: { id: 'portal', colour: '#1f6f8b', width: 5, opacity: 0.5 },
  repair: { id: 'repair', colour: '#8f5a0c', width: 3, opacity: 0.9 },
  trip: { id: 'trip', colour: '#e05a47', width: 3.4, opacity: 1 },
};

const featureOf = (geometry) => ({
  type: 'FeatureCollection',
  features: geometry ? [{ type: 'Feature', geometry, properties: {} }] : [],
});

/**
 * The staged geometry on a map, with the two overlays a curator needs to
 * judge it: the gap-repaired line (routed across the holes) and the official
 * portal geometry the crosscheck matched it against.
 *
 * Every coordinate is filtered through coords.js first. A staging row with a
 * NaN vertex renders as the parts that survive, with a count of what was
 * dropped, rather than throwing inside MapLibre and taking the app down.
 */
export default function TripMap({ geometry, repairGeometry, portal, showRepair, showPortal }) {
  const holder = useRef(null);
  const map = useRef(null);
  const [ready, setReady] = useState(false);
  const clean = cleanLines(geometry);
  const cleanRepair = cleanLines(repairGeometry);

  useEffect(() => {
    if (map.current || !holder.current) return undefined;
    const m = new maplibregl.Map({
      container: holder.current,
      style: MAP_STYLE,
      center: [8.2, 46.8],
      zoom: 6,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }));
    m.on('load', () => {
      // Portal first, trip last: the line under review draws on top of the
      // official geometry it is being compared with.
      Object.values(SOURCES).forEach(({ id, colour, width, opacity }) => {
        m.addSource(id, { type: 'geojson', data: featureOf(null) });
        m.addLayer({
          id,
          type: 'line',
          source: id,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': colour, 'line-width': width, 'line-opacity': opacity },
        });
      });
      setReady(true);
    });
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  // Trip geometry, and the view that frames it.
  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.getSource('trip').setData(featureOf(clean.geometry));
    const bounds = boundsOf(geometry);
    if (bounds) {
      map.current.fitBounds(bounds, { padding: 40, duration: 0, maxZoom: 15 });
    }
  }, [ready, geometry]);

  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.getSource('repair').setData(
      featureOf(showRepair ? cleanRepair.geometry : null),
    );
  }, [ready, repairGeometry, showRepair]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const parts = [];
    if (showPortal && portal) {
      for (const seg of portal.segments || []) {
        const { geometry: g } = cleanLines(seg.geometry);
        if (g) parts.push(...g.coordinates);
      }
    }
    map.current.getSource('portal').setData(
      featureOf(parts.length ? { type: 'MultiLineString', coordinates: parts } : null),
    );
  }, [ready, portal, showPortal]);

  const dropped = clean.dropped + (showRepair ? cleanRepair.dropped : 0);

  return (
    <div className="map-wrap">
      <div className="map-canvas" ref={holder} />
      {!clean.geometry && (
        <div className="map-note">No plottable geometry on this trip</div>
      )}
      {dropped > 0 && (
        <div className="map-note">
          {dropped} unusable coordinates skipped
        </div>
      )}
    </div>
  );
}
