import React from 'react';
import {
  SunIcon, PartSunIcon, CloudIcon, FogIcon, RainIcon, DrizzleIcon, SnowIcon, StormIcon,
} from '../components/Icons.jsx';

/**
 * "The next 7 days" on the destination page (moved out of DestinationPage.jsx
 * by T499; the MET Norway forecast since T483). `forecast` is useForecast's
 * answer: undefined while it loads (the block holds its height), null when
 * there is none (nothing renders), else the days.
 */
const WEATHER_GLYPH = {
  sun: SunIcon, partsun: PartSunIcon, cloud: CloudIcon, fog: FogIcon,
  drizzle: DrizzleIcon, rain: RainIcon, snow: SnowIcon, storm: StormIcon,
};

export function DestForecast({ forecast, t, lang, headingId = 'h-week' }) {
  if (forecast === null) return null;
  const fmtDay = (iso) => {
    try {
      return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, { weekday: 'short', timeZone: 'UTC' })
        .format(new Date(iso + 'T00:00:00Z'));
    } catch { return iso.slice(5); }
  };
  const nf = (n) => {
    try { return new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(n); } catch { return String(Math.round(n)); }
  };
  return (
    <div className={`destp-week${forecast === undefined ? ' is-waiting' : ''}`} aria-busy={forecast === undefined || undefined}>
      <h3 className="destp-subhead" id={headingId}>{t('dest.weekNext')}</h3>
      {forecast === undefined && <span className="sr-only">{t('state.loading')}</span>}
      {Array.isArray(forecast) && forecast.length > 0 && (
        <div className="xp-weather" role="list" aria-labelledby={headingId}>
          {forecast.map((day) => {
            const Glyph = WEATHER_GLYPH[day.kind] || CloudIcon;
            return (
              <div key={day.date} className="xp-wday" title={day.date} role="listitem">
                <span className="xp-wday-name">{fmtDay(day.date)}</span>
                <Glyph size={16} className="xp-wday-icon" />
                <span className="xp-wday-hi">{day.hi != null ? `${nf(day.hi)}°` : ''}</span>
                <span className="xp-wday-lo">{day.lo != null ? `${nf(day.lo)}°` : ''}</span>
                {day.rainMm != null && day.rainMm >= 1 && (
                  <span className="xp-wday-rain">{`${nf(day.rainMm)} mm`}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
