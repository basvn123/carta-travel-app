import React from 'react';
import { useI18n } from '../i18n/index.jsx';

/**
 * Real climate normals (NASA POWER, 2001-2020) as a 12-month comfort strip:
 * bar height + colour = tourist comfort, with the daytime high above and the
 * best-weather months called out. Extracted from BestTimePanel so the Explore
 * panel can show "when to go" without any of the fare machinery around it.
 *
 * The wire ships climate compact (scripts/sync-data.mjs): m = twelve
 * [t_high, t_low, precip_mm, comfort] tuples, best = best-month numbers.
 */

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_INITIAL = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

const T_HIGH = 0;
const T_LOW = 1;
const PRECIP = 2;
const COMFORT = 3;

// Comfort tier -> colour band. Mirrors apply_climate.py's 0-100 index.
export function comfortTier(c) {
  if (c >= 78) return 'great';
  if (c >= 60) return 'good';
  if (c >= 45) return 'mixed';
  return 'poor';
}

// Collapse a list of 1-12 month numbers into readable ranges, e.g.
// [4,5,9,10,11] -> "Apr-May, Sep-Nov".
export function fmtMonthRanges(nums) {
  if (!nums || !nums.length) return '';
  const sorted = [...nums].sort((a, b) => a - b);
  const runs = [];
  let start = sorted[0], prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) { prev = sorted[i]; continue; }
    runs.push([start, prev]); start = prev = sorted[i];
  }
  runs.push([start, prev]);
  return runs
    .map(([a, b]) => (a === b ? MONTHS_SHORT[a - 1] : `${MONTHS_SHORT[a - 1]}-${MONTHS_SHORT[b - 1]}`))
    .join(', ');
}

export function ClimateStrip({ climate }) {
  const { t } = useI18n();
  const [hoverI, setHoverI] = React.useState(null);
  const months = climate.m || [];
  if (months.length !== 12) return null;

  const comforts = months.map((m) => m[COMFORT]);
  const cMin = Math.min(...comforts);
  const cMax = Math.max(...comforts);
  const span = cMax - cMin || 1;
  const best = new Set(climate.best || []);
  const bestLabel = fmtMonthRanges(climate.best);

  const legend = [
    { tier: 'great', key: 'bestTime.climateLegendIdeal' },
    { tier: 'good', key: 'bestTime.climateLegendGood' },
    { tier: 'mixed', key: 'bestTime.climateLegendMixed' },
    { tier: 'poor', key: 'bestTime.climateLegendPoor' },
  ];

  return (
    <>
      {bestLabel && (
        <p className="climate-best">{t('bestTime.climateBest', { months: bestLabel })}</p>
      )}
      <div className="climate-chart">
        {months.map((m, i) => (
          <div
            key={i}
            className={`climate-col ${best.has(i + 1) ? 'is-best' : ''}`}
            onMouseEnter={() => setHoverI(i)}
            onMouseLeave={() => setHoverI(null)}
          >
            <div className="climate-temp">{m[T_HIGH] == null ? '' : `${Math.round(m[T_HIGH])}°`}</div>
            <div className="climate-bar-track">
              <div
                className={`climate-bar climate-${comfortTier(m[COMFORT])}`}
                style={{ height: `${20 + ((m[COMFORT] - cMin) / span) * 80}%` }}
              />
            </div>
            <div className="climate-name">{MONTHS_INITIAL[i]}</div>
            {hoverI === i && (
              <div className="climate-tip">
                <b>{MONTHS_SHORT[i]}</b>{' '}
                {t('bestTime.climateTip', {
                  hi: m[T_HIGH] == null ? '?' : Math.round(m[T_HIGH]),
                  lo: m[T_LOW] == null ? '?' : Math.round(m[T_LOW]),
                  precip: m[PRECIP] == null ? '?' : Math.round(m[PRECIP]),
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="bt-legend climate-legend">
        {legend.map((l) => (
          <span key={l.tier} className="bt-legend-item">
            <i className={`bt-dot climate-dot-${l.tier}`} /> {t(l.key)}
          </span>
        ))}
      </div>
    </>
  );
}
