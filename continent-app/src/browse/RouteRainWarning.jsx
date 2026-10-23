import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useForecast } from '../lib/weather.js';
import { routeRainWarning, wetRockRoute } from '../lib/waterFacts.js';

/**
 * "Rain is forecast, wet rock is slippery" on a trail sheet (T631).
 *
 * The rule is routeRainWarning() in lib/waterFacts.js: the route is T2 or
 * harder on the SAC scale (`sac_scale`) or the trails wire marks it a gorge
 * (`f.hl` has "gorge"), and one of the next three days of the MET Norway
 * forecast at the trailhead has 1 mm or more of rain.
 *
 * It is a warning, not a field: with no forecast (still loading, offline, the
 * forecast function down) or no wet rock on the route it renders nothing at
 * all, never a placeholder. The forecast is fetched only for a route the rule
 * could apply to, so the other sheets cost no request.
 */
export function RouteRainWarning({ lat, lon, sac, highlights }) {
  const { t, lang } = useI18n();
  const applies = wetRockRoute(sac, highlights) != null;
  const forecast = useForecast(lat, lon, applies);
  const warn = applies ? routeRainWarning({ sac, highlights, forecast }) : null;
  if (!warn) return null;
  let day = warn.date;
  try {
    day = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, { weekday: 'long', timeZone: 'UTC' })
      .format(new Date(`${warn.date}T00:00:00Z`));
  } catch { /* the ISO date reads fine */ }
  return (
    <p className="lpage-swim lpage-swim-warn" role="note" data-testid="route-rain-warning">
      <span className="lpage-swim-word">{t('wx.rainWarnHead')}</span>
      <span className="lpage-swim-season">{t(`wx.rainWarn${warn.reason === 'gorge' ? 'Gorge' : 'Rock'}`, { day, mm: warn.mm })}</span>
    </p>
  );
}

export default RouteRainWarning;
