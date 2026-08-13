import React, { useMemo } from 'react';
import { useTrails } from '../lib/trails.js';
import { useI18n } from '../i18n/index.jsx';
import { RouteIcon } from './Icons.jsx';

const NEARBY_KM = 40;
const MAX_ROWS = 4;

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function bboxCentre(bbox) {
  return bbox?.length === 4
    ? { lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2 }
    : null;
}

const hours = (min) => {
  const h = min / 60;
  return h >= 10 ? String(Math.round(h)) : h.toFixed(1);
};

/**
 * "Hikes and day trips nearby" for the destination detail panel: the city's
 * own composed day first, then published trails whose extent sits within
 * NEARBY_KM of the city centre. Facts only, in the catalogue's own numbers;
 * resolves to nothing (renders null) for the many countries and towns with
 * no published content yet.
 */
export function TrailsNearby({ destination }) {
  const { t } = useI18n();
  const trips = useTrails(destination?.iso2) || [];

  const rows = useMemo(() => {
    if (!trips.length || !destination) return [];
    const lat = destination.city_lat ?? destination.lat;
    const lon = destination.city_lon ?? destination.lon;
    const cityDay = trips.filter(
      (tr) => tr.category === 'citytrip' && tr.anchor?.dest === destination.id);
    const hikes = trips
      .filter((tr) => tr.category !== 'citytrip')
      .map((tr) => {
        const c = bboxCentre(tr.bbox);
        return c && lat != null
          ? { tr, km: haversineKm(lat, lon, c.lat, c.lon) } : null;
      })
      .filter((e) => e && e.km <= NEARBY_KM)
      .sort((a, b) => a.km - b.km)
      .map((e) => e.tr);
    return [...cityDay, ...hikes].slice(0, MAX_ROWS);
  }, [trips, destination]);

  if (!rows.length) return null;

  return (
    <div className="panel-section trails-nearby">
      <div className="trails-nearby-title">
        <RouteIcon size={13} /> {t('trails.nearbyTitle')}
      </div>
      {rows.map((tr) => {
        const isCityDay = tr.category === 'citytrip';
        const kindLabel = isCityDay
          ? t('trails.cityDay')
          : (tr.distance_m <= 25000 ? t('trails.dayHike') : t('trails.trail'));
        return (
          <div key={tr.id} className="trails-nearby-row">
            <div className="trails-nearby-head">
              <span className="trails-nearby-name">{tr.name}</span>
              <span className={`trails-nearby-kind ${isCityDay ? 'city' : ''}`}>{kindLabel}</span>
            </div>
            <div className="trails-nearby-facts">
              {tr.distance_m != null && (
                <span>{(tr.distance_m / 1000).toFixed(1).replace(/\.0$/, '')} km</span>
              )}
              {tr.duration_min != null && <span>{hours(tr.duration_min)} h</span>}
              {!isCityDay && tr.ascent_m != null && <span>+{Math.round(tr.ascent_m)} m</span>}
              {isCityDay && tr.n_stops != null && (
                <span>{t('trails.stops', { n: tr.n_stops })}</span>
              )}
            </div>
            {tr.summary && <p className="trails-nearby-summary">{tr.summary}</p>}
          </div>
        );
      })}
      <p className="trails-nearby-credit">{t('trails.credit')}</p>
    </div>
  );
}
