/**
 * weather.js, the live 7-day forecast on the destination page, the trip card
 * and the day planner.
 *
 * MET Norway's Locationforecast (CC BY 4.0, commercial use allowed with the
 * credit the page prints), fetched through our own Pages Function
 * /api/forecast (T483): MET wants an identifying User-Agent and caching, and
 * the same origin needs no CSP entry. The rows are built by
 * lib/metForecast.js. One request per opened destination, cached for the
 * session, fetched only when the panel is actually open, so browsing the
 * grid costs zero calls.
 *
 * This is deliberately live: a forecast is the one block on the page that
 * CANNOT be kept fresh by a pipeline cadence, it is stale the day after it
 * is harvested. The climate normals (NASA POWER, in the wire) say what a
 * month is usually like; this says what this week actually looks like.
 */
import { useEffect, useState } from 'react';

const cache = new Map();

/** Daily rows { date, kind, hi, lo, rainMm, updated }, or null when the
 *  forecast could not be fetched. `updated` is when MET last ran the model. */
export function fetchForecast(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (!cache.has(key)) {
    cache.set(key, fetch(`/api/forecast?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || !Array.isArray(j.days) || !j.days.length) return null;
        return j.days.map((d) => ({ ...d, updated: j.updated || null }));
      })
      .catch(() => null));
  }
  return cache.get(key);
}

/** 7 daily rows, undefined while loading, null when the fetch failed. */
export function useForecast(lat, lon, open) {
  const [rows, setRows] = useState(undefined);
  useEffect(() => {
    if (!open || lat == null || lon == null) return undefined;
    let live = true;
    setRows(undefined);
    fetchForecast(lat, lon).then((r) => { if (live) setRows(r); });
    return () => { live = false; };
  }, [lat, lon, open]);
  return rows;
}
