import React from 'react';
import NotYet from '../components/NotYet.jsx';
import { DestForecast } from './DestForecast.jsx';
import { useForecast } from '../lib/weather.js';
import {
  slopeState, SLOPE_WARN_DEG, rangeRankParts, hutParts,
} from '../lib/routeEffort.js';

/**
 * The peak facts a climber sizes a day by that the key facts band does not
 * carry (T630): regional rank, the slope warning, the lift's price and hours,
 * the huts on the flanks and the forecast at the height of the summit. Every
 * field keeps its slot: a value the wire has is printed, one it does not has
 * the shared placeholder (components/NotYet.jsx).
 *
 * Wire keys (docs/SCHEMA.md, T630): `rangeRank` {n, h, p}, `slopeDeg`,
 * `huts[]`, `lift.price`, `lift.hours`. The summit forecast is live: MET
 * Norway through /api/forecast with the summit's own altitude.
 */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function Slot({ label, children, testId, warn = false }) {
  return (
    <div className={`bpage-fact${warn ? ' is-warn' : ''}`} data-testid={testId}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function RangeRank({ mountain, t }) {
  const parts = rangeRankParts(mountain.rangeRank);
  const range = mountain.range;
  if (!parts || !range) return <NotYet />;
  return (
    <>
      {parts.height != null && (
        <span className="mono">{t('mtn.rankHeight', { rank: parts.height, n: parts.n, range })}</span>
      )}
      {parts.height != null && parts.prominence != null && ', '}
      {parts.prominence != null && (
        <span className="mono">{t('mtn.rankProm', { rank: parts.prominence, n: parts.n })}</span>
      )}
    </>
  );
}

function Huts({ mountain, t, lang }) {
  const huts = (Array.isArray(mountain.huts) ? mountain.huts : []).map(hutParts).filter(Boolean);
  if (!huts.length) return <NotYet />;
  const nf = (n) => n.toLocaleString(lang);
  return (
    <ul className="bpage-huts">
      {huts.map((h) => (
        <li key={`${h.name}-${h.m}`} className="bpage-hut" data-testid="peak-hut">
          <strong>{h.name}</strong>
          {h.m != null && <span className="mono">{` ${t('mtn.hutAway', { m: nf(h.m) })}`}</span>}
          <span>{` ${t('mtn.hutBeds')}: `}{h.beds != null ? nf(h.beds) : <NotYet />}</span>
          <span>{` ${t('mtn.hutOpen')}: `}{h.open || <NotYet />}</span>
          <span>
            {` ${t('mtn.hutContact')}: `}
            {h.phone || h.email || h.web ? (
              <>
                {[h.phone, h.email].filter(Boolean).join(', ')}
                {h.web && (
                  <>
                    {(h.phone || h.email) ? ', ' : ''}
                    <a href={h.web} target="_blank" rel="noopener noreferrer">{t('mtn.hutWeb')}</a>
                  </>
                )}
              </>
            ) : <NotYet />}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SummitForecast({ mountain, t, lang }) {
  const ele = isNum(mountain.ele) ? mountain.ele : null;
  const hasPoint = isNum(mountain.lat) && isNum(mountain.lon) && ele != null;
  const forecast = useForecast(mountain.lat, mountain.lon, hasPoint, ele);
  if (!hasPoint || forecast === null) return <NotYet />;
  return (
    <div data-testid="peak-forecast">
      <p className="bpage-note">{t('mtn.summitForecastAt', { m: Math.round(ele).toLocaleString(lang) })}</p>
      <DestForecast forecast={forecast} t={t} lang={lang} headingId="h-summit-week" />
      <p className="bpage-note">{t('mtn.summitForecastCredit')}</p>
    </div>
  );
}

export function PeakFacts({ mountain, t, lang }) {
  const slope = isNum(mountain.slopeDeg) ? mountain.slopeDeg : null;
  const state = slopeState(slope);
  const lift = mountain.lift || null;
  return (
    <div className="bpage-facts bpage-peakfacts" data-testid="peak-facts">
      <dl>
        <Slot label={t('mtn.rangeRank')} testId="pf-rank"><RangeRank mountain={mountain} t={t} /></Slot>
        <Slot label={t('mtn.slope')} testId="pf-slope" warn={state === 'warn'}>
          {slope == null ? <NotYet /> : (
            <>
              <span className="mono">{t('mtn.slopeDeg', { deg: Math.round(slope) })}</span>
              <small>
                {state === 'warn' ? t('mtn.slopeWarn', { deg: SLOPE_WARN_DEG }) : t('mtn.slopeOk', { deg: SLOPE_WARN_DEG })}
              </small>
            </>
          )}
        </Slot>
        <Slot label={t('mtn.liftPrice')} testId="pf-lift-price">
          {lift?.price ? String(lift.price) : <NotYet />}
        </Slot>
        <Slot label={t('mtn.liftHours')} testId="pf-lift-hours">
          {lift?.hours ? String(lift.hours) : <NotYet />}
        </Slot>
        <Slot label={t('mtn.huts')} testId="pf-huts"><Huts mountain={mountain} t={t} lang={lang} /></Slot>
        <Slot label={t('mtn.summitForecast')} testId="pf-forecast">
          <SummitForecast mountain={mountain} t={t} lang={lang} />
        </Slot>
      </dl>
    </div>
  );
}
