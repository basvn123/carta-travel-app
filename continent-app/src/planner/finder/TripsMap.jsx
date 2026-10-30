import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useI18n } from '../../i18n/index.jsx';
import { formatMoney } from '../../lib/money.js';
import { cityLabel } from '../../lib/placeName.js';
import { tokenColour } from '../../map/tokenColors.js';
import { fallbackSrc } from '../../lib/heroImage.js';
import { shortDuration, thereMinutes, tripPhotos } from './finderText.js';

/**
 * Trips for you on a map (T868; T883, the owner's free direction
 * 2026-10-30): one pin a trip at its first place, the place's photo in a
 * round thumbnail and the group's total (the name in its label and title);
 * the cheapest trip in the list takes the best-value marker; the picked one
 * is the one selected state, in the action brown. From the traveller's home
 * airport a curved line runs to each trip with the time there at its
 * middle, dashed for a flight and solid for a drive; the picked trip's line
 * is brown. A pin picks, it does not open: the picked trip's card shows
 * beside the map (TripsForYou), and the card opens the trip. A pin and its
 * card light each other up under the pointer (hotId, onHot).
 *
 * Its own file so it is its own lazy chunk: maplibre arrives only when the
 * traveller asks for the map. The camera fits the pins once and then moves
 * only under the traveller's hand.
 *
 *   trips      the trips in the list's order (the sort the traveller chose)
 *   pickedId   the trip whose card shows
 *   cheapestId the cheapest whole total in the list, the best-value pin
 *   onPick(id)
 *   home       { lat, lon, name } the home airport, or null (no lines)
 *   hotId      the trip under the pointer in the list; onHot(id | null) the reverse
 */
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/** Where a trip's pin stands: its first place with coordinates. */
function pointOf(trip, destinations) {
  for (const p of trip.places) {
    const d = destinations?.[p.id];
    const lat = d?.city_lat ?? d?.lat;
    const lon = d?.city_lon ?? d?.lon;
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon, city: cityLabel(d.city || '') };
  }
  return null;
}

/** A gentle curve from home to a place, as lon/lat points (a quadratic Bezier bowed to the right). */
function arcPoints(a, b, n = 32) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const c = [(a[0] + b[0]) / 2 - dy * 0.2, (a[1] + b[1]) / 2 + dx * 0.2];
  return Array.from({ length: n + 1 }, (_, i) => {
    const k = i / n;
    const u = 1 - k;
    return [u * u * a[0] + 2 * u * k * c[0] + k * k * b[0], u * u * a[1] + 2 * u * k * c[1] + k * k * b[1]];
  });
}

const ARCS = 'tff-arcs';

export default function TripsMap({ trips, destinations, pickedId, cheapestId = null, onPick, label, home = null, hotId = null, onHot = null }) {
  const { t, lang } = useI18n();
  const el = useRef(null);
  const mapRef = useRef(null);
  const pins = useRef(new Map());
  const pickRef = useRef(onPick);
  const hotRef = useRef(onHot);
  const times = useRef([]);
  const [failed, setFailed] = useState(false);
  pickRef.current = onPick;
  hotRef.current = onHot;

  // The map, once.
  useEffect(() => {
    if (!el.current) return undefined;
    let map;
    try {
      map = new maplibregl.Map({
        container: el.current,
        style: MAP_STYLE,
        center: [10, 50],
        zoom: 3.4,
        attributionControl: { compact: true },
        cooperativeGestures: false,
        dragRotate: false,
        touchPitch: false,
      });
    } catch {
      setFailed(true);
      return undefined;
    }
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => { map.resize(); map.getContainer().classList.add('is-live'); });
    map.on('error', (e) => { if (e?.error?.status >= 400 && !map.isStyleLoaded()) setFailed(true); });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; pins.current = new Map(); times.current = []; };
  }, []);

  // The pins, for the trips as they stand; the camera fits them once.
  const fitted = useRef(false);
  const ids = trips.map((x) => x.id).join();
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const { marker } of pins.current.values()) marker.remove();
    for (const m of times.current) m.remove();
    pins.current = new Map();
    times.current = [];
    const cheapest = cheapestId;
    const bounds = new maplibregl.LngLatBounds();
    const from = Number.isFinite(home?.lat) && Number.isFinite(home?.lon) ? [home.lon, home.lat] : null;
    const lines = [];
    if (from) {
      const dot = document.createElement('div');
      dot.className = 'tff-home';
      dot.title = home.name || '';
      times.current.push(new maplibregl.Marker({ element: dot }).setLngLat(from).addTo(map));
      bounds.extend(from);
    }
    for (const trip of trips) {
      const at = pointOf(trip, destinations);
      if (!at) continue;
      const eur = trip.total?.group ?? trip.total?.perPerson;
      const fig = Number.isFinite(eur) ? formatMoney(eur, { locale: lang }) : '';
      const node = document.createElement('div');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tff-pin${trip.id === cheapest ? ' is-cheapest' : ''}`;
      btn.setAttribute('aria-label', fig ? t('tf.map.pin', { place: at.city, price: fig }) : at.city);
      btn.title = at.city;
      const photo = tripPhotos(trip, destinations)[0]?.url;
      if (photo) {
        const img = document.createElement('img');
        img.className = 'tff-pin-photo';
        img.alt = '';
        img.loading = 'lazy';
        img.src = fallbackSrc(photo, 120);
        btn.appendChild(img);
      }
      if (fig) {
        const b = document.createElement('span');
        b.className = 'tff-pin-eur';
        b.textContent = fig;
        btn.appendChild(b);
      }
      const n = document.createElement('span');
      n.className = 'tff-pin-name';
      n.textContent = at.city;
      btn.appendChild(n);
      btn.addEventListener('click', (e) => { e.stopPropagation(); pickRef.current?.(trip.id); });
      btn.addEventListener('mouseenter', () => hotRef.current?.(trip.id));
      btn.addEventListener('mouseleave', () => hotRef.current?.(null));
      node.appendChild(btn);
      // Styled on an inner child: maplibre owns the marker element's transform.
      const marker = new maplibregl.Marker({ element: node, anchor: 'bottom' }).setLngLat([at.lon, at.lat]).addTo(map);
      pins.current.set(trip.id, { marker, btn });
      bounds.extend([at.lon, at.lat]);
      if (from) {
        const pts = arcPoints(from, [at.lon, at.lat]);
        const drive = trip.slots?.find((s) => s.id === 'flight')?.pick?.id === 'drive';
        lines.push({ type: 'Feature', properties: { id: trip.id, drive }, geometry: { type: 'LineString', coordinates: pts } });
        const time = shortDuration(t, thereMinutes(trip));
        if (time) {
          const tag = document.createElement('div');
          tag.className = 'tff-arc-time';
          tag.setAttribute('aria-hidden', 'true');
          tag.textContent = time;
          times.current.push(new maplibregl.Marker({ element: tag }).setLngLat(pts[16]).addTo(map));
        }
      }
    }
    // The lines under the pins, in the token colours (MapLibre reads no CSS).
    const draw = () => {
      const data = { type: 'FeatureCollection', features: lines };
      if (map.getSource(ARCS)) { map.getSource(ARCS).setData(data); return; }
      map.addSource(ARCS, { type: 'geojson', data });
      const base = { type: 'line', source: ARCS, layout: { 'line-cap': 'round' } };
      map.addLayer({ ...base, id: `${ARCS}-fly`, filter: ['!', ['get', 'drive']], paint: { 'line-color': tokenColour('--text-3'), 'line-width': 1.5, 'line-opacity': 0.7, 'line-dasharray': [2, 2] } });
      map.addLayer({ ...base, id: `${ARCS}-drive`, filter: ['get', 'drive'], paint: { 'line-color': tokenColour('--text-3'), 'line-width': 1.5, 'line-opacity': 0.7 } });
      map.addLayer({ ...base, id: `${ARCS}-picked`, filter: ['==', ['get', 'id'], ''], paint: { 'line-color': tokenColour('--action'), 'line-width': 2.5 } });
    };
    if (map.isStyleLoaded()) draw(); else map.once('load', draw);
    if (!fitted.current && !bounds.isEmpty()) {
      fitted.current = true;
      map.fitBounds(bounds, { padding: 56, maxZoom: 7, duration: 0 });
    }
  }, [ids, destinations, lang, cheapestId, home?.lat, home?.lon]); // eslint-disable-line react-hooks/exhaustive-deps -- ids stands for the trips

  // The picked pin is the one selected state; it comes to the front.
  useEffect(() => {
    for (const [id, { btn, marker }] of pins.current) {
      const on = id === pickedId;
      btn.classList.toggle('is-picked', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      marker.getElement().style.zIndex = on ? '2' : '';
    }
    const map = mapRef.current;
    if (map?.getLayer(`${ARCS}-picked`)) map.setFilter(`${ARCS}-picked`, ['==', ['get', 'id'], pickedId || '']);
  }, [pickedId, ids]);

  // The trip under the pointer in the list lights its pin.
  useEffect(() => {
    for (const [id, { btn, marker }] of pins.current) {
      const on = id === hotId;
      btn.classList.toggle('is-hot', on);
      if (on) marker.getElement().style.zIndex = '3';
      else if (id !== pickedId) marker.getElement().style.zIndex = '';
    }
  }, [hotId, pickedId, ids]);

  return (
    <div className="tff-map" role="region" aria-label={label}>
      <div ref={el} className="tff-map-frame" />
      {failed && <p className="tff-map-failed" role="status">{t('tf.map.failed')}</p>}
    </div>
  );
}

/** Where each place of a trip stands, in trip order (places without coordinates are left out). */
function stopsOf(trip, destinations) {
  return trip.places.map((p, i) => {
    const d = destinations?.[p.id];
    const lat = d?.city_lat ?? d?.lat;
    const lon = d?.city_lon ?? d?.lon;
    return Number.isFinite(lat) && Number.isFinite(lon) ? { n: i + 1, lat, lon, city: cityLabel(d.city || '') } : null;
  }).filter(Boolean);
}

/**
 * The trip page's route (T871): the trip's places as numbered ink stops in
 * trip order, joined by one ink line that is not the measured path (the
 * route list under the map says how you move). No brown: nothing on it is
 * live or picked. The camera fits the stops once; a lone stop sits at a
 * town's zoom. In the same chunk as TripsMap, so no chunk is added.
 */
export function RouteMap({ trip, destinations, label }) {
  const { t } = useI18n();
  const el = useRef(null);
  const [failed, setFailed] = useState(false);
  const key = trip.places.map((p) => p.id).join('|');
  useEffect(() => {
    if (!el.current) return undefined;
    const stops = stopsOf(trip, destinations);
    if (!stops.length) { setFailed(true); return undefined; }
    let map;
    try {
      map = new maplibregl.Map({
        container: el.current,
        style: MAP_STYLE,
        center: [stops[0].lon, stops[0].lat],
        zoom: 7,
        attributionControl: { compact: true },
        cooperativeGestures: false,
        dragRotate: false,
        touchPitch: false,
        scrollZoom: false,
      });
    } catch {
      setFailed(true);
      return undefined;
    }
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const markers = stops.map((s) => {
      const node = document.createElement('div');
      const pin = document.createElement('span');
      pin.className = 'tff-rpin';
      const n = document.createElement('span');
      n.className = 'tff-rpin-n';
      n.textContent = String(s.n);
      const name = document.createElement('span');
      name.className = 'tff-rpin-name';
      name.textContent = s.city;
      pin.append(n, name);
      node.appendChild(pin);
      return new maplibregl.Marker({ element: node, anchor: 'left', offset: [-12, 0] }).setLngLat([s.lon, s.lat]).addTo(map);
    });
    map.on('load', () => {
      map.resize();
      map.getContainer().classList.add('is-live');
      if (stops.length > 1) {
        map.addSource('tff-route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: stops.map((s) => [s.lon, s.lat]) } } });
        map.addLayer({ id: 'tff-route', type: 'line', source: 'tff-route', paint: { 'line-color': tokenColour('--ink'), 'line-width': 2, 'line-dasharray': [2, 2] } });
      }
    });
    map.on('error', (e) => { if (e?.error?.status >= 400 && !map.isStyleLoaded()) setFailed(true); });
    if (stops.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      for (const s of stops) bounds.extend([s.lon, s.lat]);
      // The names sit right of their stops: room for them on the right.
      map.fitBounds(bounds, { padding: { top: 48, bottom: 48, left: 40, right: 130 }, maxZoom: 9, duration: 0 });
    }
    return () => { for (const m of markers) m.remove(); map.remove(); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- the key stands for the places

  return (
    <div className="tff-map tff-tp-map" role="region" aria-label={label}>
      <div ref={el} className="tff-map-frame" />
      {failed && <p className="tff-map-failed" role="status">{t('tf.map.failed')}</p>}
    </div>
  );
}
