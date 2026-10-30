import React from 'react';
import { doPriceOf } from '../lib/price/doPrice.js';
import { formatMoney } from '../lib/money.js';
import { DestForecast } from './DestForecast.jsx';
import { useForecast } from '../lib/weather.js';
import {
  slopeState, SLOPE_WARN_DEG, rangeRankParts, hutParts,
} from '../lib/routeEffort.js';

/**
 * The peak facts a climber sizes a day by that the facts row does not carry
 * (T630; on the outdoor template since T921): the rank in its range, the
 * slope warning, the lift's price and hours, the huts on the flanks and the
 * forecast at the height of the summit.
 *
 * Since T921 a fact the wire does not have is left out, as on the place
 * page: these builders return null (or an empty list) without data, and the
 * mountain page draws only what comes back.
 *
 * Wire keys (docs/SCHEMA.md, T630): `rangeRank` {n, h, p}, `slopeDeg`,
 * `huts[]`, `lift.fare`, `lift.hours`. The summit forecast is live: MET
 * Norway through /api/forecast with the summit's own altitude.
 */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** "1 of 16 by height in Triglav Group, 1 of 16 by prominence", or ''. */
export function rangeRankLine(mountain, t) {
  const parts = rangeRankParts(mountain?.rangeRank);
  const range = mountain?.range;
  if (!parts || !range) return '';
  return [
    parts.height != null ? t('mtn.rankHeight', { rank: parts.height, n: parts.n, range }) : '',
    parts.prominence != null ? t('mtn.rankProm', { rank: parts.prominence, n: parts.n }) : '',
  ].filter(Boolean).join(', ');
}

/** The slope on the gentlest side as { title, text, warn }, or null. */
export function slopeFact(mountain, t) {
  const slope = isNum(mountain?.slopeDeg) ? mountain.slopeDeg : null;
  const state = slopeState(slope);
  if (slope == null) return null;
  return {
    title: `${t('mtn.slope')}: ${t('mtn.slopeDeg', { deg: Math.round(slope) })}`,
    text: state === 'warn' ? t('mtn.slopeWarn', { deg: SLOPE_WARN_DEG }) : t('mtn.slopeOk', { deg: SLOPE_WARN_DEG }),
    warn: state === 'warn',
  };
}

/** The lift's ticket and hours as one line, or ''. */
export function liftFareLine(mountain, t) {
  const lift = mountain?.lift || null;
  const fare = doPriceOf(lift?.fare, 'lift');
  return [
    fare ? `${t('mtn.liftPrice')}: ${formatMoney(fare.eur, { precision: Number.isInteger(fare.eur) ? 'whole' : 'cents' })}` : '',
    lift?.hours ? `${t('mtn.liftHours')}: ${String(lift.hours)}` : '',
  ].filter(Boolean).join('. ');
}

/** The huts on the flanks (OSM), each with what is known of it. */
export function flankHuts(mountain, t, lang) {
  const nf = (n) => n.toLocaleString(lang);
  return (Array.isArray(mountain?.huts) ? mountain.huts : []).map(hutParts).filter(Boolean).map((h) => ({
    key: `${h.name}-${h.m}`,
    name: h.name,
    text: [
      h.m != null ? t('mtn.hutAway', { m: nf(h.m) }) : '',
      h.beds != null ? `${t('mtn.hutBeds')}: ${nf(h.beds)}` : '',
      h.open ? `${t('mtn.hutOpen')}: ${h.open}` : '',
      [h.phone, h.email].filter(Boolean).join(', '),
    ].filter(Boolean).join(', '),
    web: h.web,
  }));
}

/** The week's forecast at the height of the summit; nothing without one. */
export function SummitForecast({ mountain, t, lang }) {
  const ele = isNum(mountain.ele) ? mountain.ele : null;
  const hasPoint = isNum(mountain.lat) && isNum(mountain.lon) && ele != null;
  const forecast = useForecast(mountain.lat, mountain.lon, hasPoint, ele);
  if (!hasPoint || !forecast) return null;
  return (
    <div className="pt-block" data-testid="peak-forecast">
      <h3 className="pt-block-title">{t('mtn.summitForecast')}</h3>
      <p className="pt-muted">{t('mtn.summitForecastAt', { m: Math.round(ele).toLocaleString(lang) })}</p>
      <DestForecast forecast={forecast} t={t} lang={lang} headingId="h-summit-week" />
      <p className="pt-muted">{t('mtn.summitForecastCredit')}</p>
    </div>
  );
}
