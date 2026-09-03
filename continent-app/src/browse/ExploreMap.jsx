import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { kindOf } from '../lib/taxonomy.js';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/**
 * The Explore map (PLAN.md C7): the same list, spatially.
 *
 * One GeoJSON source and circle layers, not 3,038 DOM markers - that is the
 * difference between 60 fps and a slideshow. The encoding is the one the
 * cards already taught: SIZE is kind (a metro draws bigger than a village),
 * FILL is verdict (the rating's ochre, filled for the top tier, pale for a
 * visit, grey for no label). Clusters below zoom 6, per the spec.
 *
 * Colours are literals mirroring the :root tokens (--rate, --rate-bg,
 * --gem-ink): a map style sheet cannot read CSS custom properties, the same
 * trade every other map in the app makes.
 *
 * Hovering previews the place in a popup; clicking opens it. Panning calls
 * onViewport(bounds) so ExploreTab can narrow the count to what is on
 * screen - the map IS the filter while it is the view.
 */

const KIND_RADIUS = { metro: 9, city: 7, area: 7, town: 5.5, village: 4.5 };
const TIER_FILL = ['match', ['get', 'tier'],
  3, '#8f5a0c', // --rate
  2, '#c08a2e',
  1, '#eddbb6',
  /* 0 */ '#b9b4a5'];

export function ExploreMap({ rows, onSelect, onViewport, t }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const popupRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onViewportRef = useRef(onViewport);
  onViewportRef.current = onViewport;

  const geojson = React.useMemo(() => ({
    type: 'FeatureCollection',
    features: rows
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.city_lon ?? p.lon, p.city_lat ?? p.lat] },
        properties: {
          id: p.id,
          city: p.city,
          country: p.country,
          tier: p.rating?.tier ?? 0,
          score: p.rating?.score ?? null,
          gem: p.rating?.hidden_gem ? 1 : 0,
          r: KIND_RADIUS[kindOf(p)] || 5.5,
        },
      })),
  }), [rows]);

  useEffect(() => {
    if (mapRef.current) return undefined;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [10, 49],
      zoom: 3.7,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('dests', {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 5,       // clusters below zoom 6
        clusterRadius: 44,
      });
      map.addLayer({
        id: 'clusters', type: 'circle', source: 'dests',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#efece2',
          'circle-stroke-color': '#8f5a0c',
          'circle-stroke-width': 1.5,
          'circle-radius': ['step', ['get', 'point_count'], 14, 25, 18, 100, 24],
        },
      });
      map.addLayer({
        id: 'cluster-count', type: 'symbol', source: 'dests',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 11,
          'text-font': ['Montserrat Medium', 'Open Sans Regular'],
        },
        paint: { 'text-color': '#0f172a' },
      });
      map.addLayer({
        id: 'dest-dots', type: 'circle', source: 'dests',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['get', 'r'],
          'circle-color': TIER_FILL,
          'circle-opacity': 0.92,
          'circle-stroke-width': ['case', ['==', ['get', 'gem'], 1], 2, 1],
          'circle-stroke-color': ['case', ['==', ['get', 'gem'], 1], '#2c6e63', '#ffffff'],
        },
      });

      map.on('click', 'clusters', async (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
        const zoom = await map.getSource('dests').getClusterExpansionZoom(f.properties.cluster_id);
        map.easeTo({ center: f.geometry.coordinates, zoom });
      });
      map.on('click', 'dest-dots', (e) => {
        const f = e.features?.[0];
        if (f) onSelectRef.current?.(f.properties.id);
      });
      map.on('mouseenter', 'dest-dots', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'dest-dots', () => {
        map.getCanvas().style.cursor = '';
        popupRef.current?.remove();
        popupRef.current = null;
      });
      map.on('mousemove', 'dest-dots', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const { city, country, score, tier } = f.properties;
        const html = `<div class="xmap-pop"><strong>${city}</strong>`
          + (score != null ? `<span class="xmap-pop-score rt-${tier}">${Number(score).toFixed(1)}</span>` : '')
          + `<br><span class="xmap-pop-sub">${country}</span></div>`;
        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({
            closeButton: false, closeOnClick: false, offset: 12,
          });
        }
        popupRef.current.setLngLat(f.geometry.coordinates).setHTML(html).addTo(map);
      });
      map.on('moveend', () => {
        const b = map.getBounds();
        onViewportRef.current?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      });
      readyRef.current = true;
    });
    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filters changed: same source, new rows.
  useEffect(() => {
    if (readyRef.current) mapRef.current?.getSource('dests')?.setData(geojson);
  }, [geojson]);

  return (
    <div className="xmap" role="region" aria-label={t('explore.mapAria')}>
      <div ref={containerRef} className="xmap-canvas" />
    </div>
  );
}
