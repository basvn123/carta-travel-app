import React, { useCallback, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { installMapGestures } from '../lib/mapGestures.js';
import { tokenColour as token } from '../map/tokenColors.js';
import { MapShell } from './MapShell.jsx';

/**
 * Where each night of a trip is (T431): one numbered pin a night, joined in
 * order, from the trip's dayPlaces (docs/ITEM_PAGE_DATA_CONTRACT.md). The
 * day chosen on the week's chart or the day track is the one pin in the
 * action colour (carta-design: brown is "this is selected"), and a tap on a
 * pin chooses its day. A week that stays in one place draws one pin.
 *
 * Its own lazy chunk, like PointMap: maplibre arrives only with a page that
 * draws a map. The frame is the item pages' (MapShell): no Ctrl to move it,
 * Expand to open it full screen, and the 2D / 3D choice under it on a trip
 * whose days climb.
 */
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/** The nights grouped by place, so a base slept in four times is one pin
 *  that carries its first night's number. */
function stops(places) {
  const out = [];
  for (const p of places || []) {
    if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lon)) continue;
    const at = out.find((s) => s.name === p.name && Math.abs(s.lat - p.lat) < 1e-4 && Math.abs(s.lon - p.lon) < 1e-4);
    if (at) at.days.push(p.day);
    else out.push({ name: p.name, lat: p.lat, lon: p.lon, days: [p.day] });
  }
  return out;
}

export default function TripDayMap({ places, sel = null, onPick, label, relief = false }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const pinsRef = useRef([]);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const getMap = useCallback(() => mapRef.current, []);
  const list = stops(places);
  const key = list.map((s) => `${s.lat},${s.lon}`).join('|');

  useEffect(() => {
    if (!el.current || !list.length) return undefined;
    const map = new maplibregl.Map({
      container: el.current,
      style: MAP_STYLE,
      center: [list[0].lon, list[0].lat],
      zoom: 8,
      attributionControl: { compact: true },
      cooperativeGestures: false,
      dragRotate: false,
      touchPitch: false,
    });
    mapRef.current = map;
    map._gestures = installMapGestures(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    pinsRef.current = list.map((s) => {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'tmap-pin';
      pin.textContent = String(s.days[0]);
      pin.setAttribute('aria-label', `${s.name}`);
      pin.addEventListener('click', (e) => { e.stopPropagation(); pickRef.current?.(s.days[0]); });
      new maplibregl.Marker({ element: pin }).setLngLat([s.lon, s.lat]).addTo(map);
      return { pin, days: s.days };
    });
    const fit = () => {
      if (list.length === 1) { map.jumpTo({ center: [list[0].lon, list[0].lat], zoom: 10 }); return; }
      const b = new maplibregl.LngLatBounds();
      list.forEach((s) => b.extend([s.lon, s.lat]));
      map.fitBounds(b, { padding: 48, duration: 0, maxZoom: 11 });
    };
    map.on('load', () => {
      map.resize();
      if (list.length > 1) {
        map.addSource('trip-line', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: list.map((s) => [s.lon, s.lat]) } },
        });
        map.addLayer({
          id: 'trip-casing', type: 'line', source: 'trip-line',
          paint: { 'line-color': token('--surface'), 'line-width': 6, 'line-opacity': 0.9 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        map.addLayer({
          id: 'trip-line', type: 'line', source: 'trip-line',
          paint: { 'line-color': token('--text-2'), 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
      }
      fit();
      map.getContainer().classList.add('is-live');
    });
    return () => { map._gestures?.dispose(); map.remove(); mapRef.current = null; pinsRef.current = []; };
    // The pins are rebuilt only when the places change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    for (const p of pinsRef.current) {
      const on = sel != null && p.days.includes(sel);
      p.pin.classList.toggle('is-on', on);
      p.pin.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }, [sel, key]);

  if (!list.length) return null;
  return (
    <MapShell getMap={getMap} relief={relief} beneath={['trip-casing']}>
      <div ref={el} className="dsk-map-frame tmap-frame" role="region" aria-label={label} />
    </MapShell>
  );
}
