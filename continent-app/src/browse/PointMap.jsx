import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * One place on a real map, for the detail pages of things you arrive at
 * rather than follow: a beach, a lake, a summit (T180, destinations spec 5.4
 * slot 4). The trail and cycling pages draw their own line maps; this is the
 * same basemap and the same pin with no line.
 *
 * Its own file so that it is its own lazy chunk: DetailSkeleton loads it with
 * React.lazy, and maplibre (already a shared chunk of the trail and cycling
 * pages) arrives only once a page that needs it is open. The beach, lake and
 * mountain pages used to skip a map to save that weight; the spec now puts a
 * map on every detail page, and lazy is how it costs nothing on the list.
 *
 * The 3D toggle (top right) and "Fly the route" belong to the terrain and
 * flyover work, and are not drawn here yet.
 */
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

export default function PointMap({ lat, lon, label, zoom = 11 }) {
  const el = useRef(null);
  useEffect(() => {
    if (!el.current || !Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
    const map = new maplibregl.Map({
      container: el.current,
      style: MAP_STYLE,
      center: [lon, lat],
      zoom,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    // Styled on an inner child: maplibre owns the marker element's transform.
    const pin = document.createElement('div');
    const dot = document.createElement('span');
    dot.className = 'tpage-start-pin';
    pin.appendChild(dot);
    new maplibregl.Marker({ element: pin }).setLngLat([lon, lat]).addTo(map);
    // The frame can still be settling its size when the map is built (the
    // maplibre stylesheet arrives with this chunk), so measure again and put
    // the place back in the middle once the style has loaded.
    map.on('load', () => { map.resize(); map.jumpTo({ center: [lon, lat], zoom }); });
    // The marker is decoration with nothing behind it: keep it out of the
    // accessibility tree rather than reading "Map marker" (T190).
    pin.setAttribute('aria-hidden', 'true');
    pin.removeAttribute('aria-label');
    return () => map.remove();
  }, [lat, lon, zoom]);
  return <div ref={el} className="dsk-map-frame" role="region" aria-label={label} />;
}
