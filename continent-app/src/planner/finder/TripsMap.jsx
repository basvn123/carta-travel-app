import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useI18n } from '../../i18n/index.jsx';
import { formatMoney } from '../../lib/money.js';
import { cityLabel } from '../../lib/placeName.js';

/**
 * Trips for you on a map (T868, the Map toggle of layout A): one price pin
 * a trip at its first place, the group's total first and the place's name
 * after it (the house rule "Price pins"); the cheapest trip in the list
 * takes the best-value marker; the picked one is the one selected state.
 * A pin picks, it does not open: the picked trip's card shows beside the
 * map (TripsForYou), and the card opens the trip.
 *
 * Its own file so it is its own lazy chunk: maplibre arrives only when the
 * traveller asks for the map. The camera fits the pins once and then moves
 * only under the traveller's hand.
 *
 *   trips      the trips in the list's order (the sort the traveller chose)
 *   pickedId   the trip whose card shows
 *   cheapestId the cheapest whole total in the list, the best-value pin
 *   onPick(id)
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

export default function TripsMap({ trips, destinations, pickedId, cheapestId = null, onPick, label }) {
  const { t, lang } = useI18n();
  const el = useRef(null);
  const mapRef = useRef(null);
  const pins = useRef(new Map());
  const pickRef = useRef(onPick);
  const [failed, setFailed] = useState(false);
  pickRef.current = onPick;

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
    return () => { map.remove(); mapRef.current = null; pins.current = new Map(); };
  }, []);

  // The pins, for the trips as they stand; the camera fits them once.
  const fitted = useRef(false);
  const ids = trips.map((x) => x.id).join();
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const { marker } of pins.current.values()) marker.remove();
    pins.current = new Map();
    const cheapest = cheapestId;
    const bounds = new maplibregl.LngLatBounds();
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
      node.appendChild(btn);
      // Styled on an inner child: maplibre owns the marker element's transform.
      const marker = new maplibregl.Marker({ element: node, anchor: 'bottom' }).setLngLat([at.lon, at.lat]).addTo(map);
      pins.current.set(trip.id, { marker, btn });
      bounds.extend([at.lon, at.lat]);
    }
    if (!fitted.current && !bounds.isEmpty()) {
      fitted.current = true;
      map.fitBounds(bounds, { padding: 56, maxZoom: 7, duration: 0 });
    }
  }, [ids, destinations, lang, cheapestId]); // eslint-disable-line react-hooks/exhaustive-deps -- ids stands for the trips

  // The picked pin is the one selected state; it comes to the front.
  useEffect(() => {
    for (const [id, { btn, marker }] of pins.current) {
      const on = id === pickedId;
      btn.classList.toggle('is-picked', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      marker.getElement().style.zIndex = on ? '2' : '';
    }
  }, [pickedId, ids]);

  return (
    <div className="tff-map" role="region" aria-label={label}>
      <div ref={el} className="tff-map-frame" />
      {failed && <p className="tff-map-failed" role="status">{t('tf.map.failed')}</p>}
    </div>
  );
}
