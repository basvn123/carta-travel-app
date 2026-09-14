/**
 * weather.js, the live 7-day forecast on a destination's Explore panel.
 *
 * Open-Meteo's public forecast API: no key, CORS-open, and licensed for
 * non-commercial use with attribution (docs/tos/data_licenses.md has the
 * row; the panel prints the credit). One request per opened destination,
 * cached for the session, fetched only when the panel is actually open, so
 * browsing the grid costs zero calls.
 *
 * This is deliberately client-side: a forecast is the one block on the page
 * that CANNOT be kept fresh by a pipeline cadence, it is stale the day
 * after it is harvested. The climate normals (NASA POWER, in the wire) say
 * what a month is usually like; this says what this week actually looks like.
 */
import { useEffect, useState } from 'react';

const cache = new Map();

// WMO weather interpretation codes -> a compact kind the UI can draw.
// Groups follow Open-Meteo's published table.
export function weatherKind(code) {
  if (code === 0) return 'sun';
  if (code === 1 || code === 2) return 'partsun';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloud';
}

export function fetchForecast(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (!cache.has(key)) {
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}`
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
      + '&timezone=auto&forecast_days=7';
    cache.set(key, fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const d = j?.daily;
        if (!d || !Array.isArray(d.time)) return null;
        return d.time.map((iso, i) => ({
          date: iso,
          code: d.weather_code?.[i] ?? null,
          kind: weatherKind(d.weather_code?.[i] ?? 3),
          hi: d.temperature_2m_max?.[i] ?? null,
          lo: d.temperature_2m_min?.[i] ?? null,
          rainPct: d.precipitation_probability_max?.[i] ?? null,
        }));
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
