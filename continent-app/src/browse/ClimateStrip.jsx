import React from 'react';
import { useI18n, tOutsideProvider } from '../i18n/index.jsx';

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
// [4,5,9,10,11] -> "Apr to May, Sep to Nov", the joiner from the
// language (T502: ranges use the word "to", never a hyphen). Pass the
// component's t; outside one the stored language is used.
export function fmtMonthRanges(nums, t = tOutsideProvider) {
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
    .map(([a, b]) => (a === b ? MONTHS_SHORT[a - 1] : t('detail.monthRange', { from: MONTHS_SHORT[a - 1], to: MONTHS_SHORT[b - 1] })))
    .join(', ');
}

/**
 * `month` (1 to 12) outlines the traveller's month, the month the receipt
 * prices (carta-design "Month": the chosen month outlined 2 px --ink on every
 * strip in view). `figures` prints each month's night low and rain under its
 * initial, so a phone or a keyboard reads every month without a hover
 * (T385, brief V3-4); the hover tip is kept only where `figures` is off.
 *
 * With `figures` the strip is drawn as data in the ink ramp (carta-design
 * "Data drawings", the month strip; T395, brief V4-5): comfort is the bar's
 * height and its ink weight, the best months a bold initial beside the
 * "Best weather" words, no hue and no legend; the key line above says what
 * the shade means, so the strip reads the same in greyscale.
 *
 * `compact` (T499, the destination page's Overview) draws the same ink
 * strip without the figures under it, with the "Best weather" line above it
 * and no legend: the full strip with figures is one tap away, on When to go.
 */
export function ClimateStrip({ climate, month = null, figures = false, compact = false }) {
  const { t } = useI18n();
  const ink = figures || compact;
  const [hoverI, setHoverI] = React.useState(null);
  const months = climate.m || [];
  if (months.length !== 12) return null;

  const comforts = months.map((m) => m[COMFORT]);
  const cMin = Math.min(...comforts);
  const cMax = Math.max(...comforts);
  const span = cMax - cMin || 1;
  const best = new Set(climate.best || []);
  const bestLabel = fmtMonthRanges(climate.best, t);

  const legend = [
    { tier: 'great', key: 'bestTime.climateLegendIdeal' },
    { tier: 'good', key: 'bestTime.climateLegendGood' },
    { tier: 'mixed', key: 'bestTime.climateLegendMixed' },
    { tier: 'poor', key: 'bestTime.climateLegendPoor' },
  ];

  return (
    <>
      {/* With figures (the destination page) the strip stands alone: the
          page's key facts already name the best months, and the sentence
          explaining the bars went with the other method lines (T429). */}
      {bestLabel && !figures && (
        <p className="climate-best">{t('bestTime.climateBest', { months: bestLabel })}</p>
      )}
      <div className={`climate-chart ${ink ? 'has-figures' : ''} ${compact ? 'is-compact' : ''}`} role={ink ? 'list' : undefined}>
        {months.map((m, i) => (
          <div
            key={i}
            className={`climate-col ${best.has(i + 1) ? 'is-best' : ''} ${month === i + 1 ? 'is-chosen' : ''}`}
            onMouseEnter={ink ? undefined : () => setHoverI(i)}
            onMouseLeave={ink ? undefined : () => setHoverI(null)}
            role={ink ? 'listitem' : undefined}
            aria-label={ink ? `${MONTHS_SHORT[i]}: ${t('bestTime.climateTip', {
              hi: m[T_HIGH] == null ? '?' : Math.round(m[T_HIGH]),
              lo: m[T_LOW] == null ? '?' : Math.round(m[T_LOW]),
              precip: m[PRECIP] == null ? '?' : Math.round(m[PRECIP]),
            })}` : undefined}
          >
            <div className="climate-temp">{m[T_HIGH] == null ? '' : `${Math.round(m[T_HIGH])}°`}</div>
            <div className="climate-bar-track">
              <div
                className={`climate-bar climate-${comfortTier(m[COMFORT])}`}
                style={{ height: `${20 + ((m[COMFORT] - cMin) / span) * 80}%` }}
              />
            </div>
            <div className="climate-name">{MONTHS_INITIAL[i]}</div>
            {figures && (
              <>
                <div className="climate-lo" aria-hidden="true">{m[T_LOW] == null ? '' : `${Math.round(m[T_LOW])}°`}</div>
                <div className="climate-rain" aria-hidden="true">{m[PRECIP] == null ? '' : Math.round(m[PRECIP])}</div>
              </>
            )}
            {!ink && hoverI === i && (
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
      {!ink && (
      <div className="bt-legend climate-legend">
        {legend.map((l) => (
          <span key={l.tier} className="bt-legend-item">
            <i className={`bt-dot climate-dot-${l.tier}`} /> {t(l.key)}
          </span>
        ))}
      </div>
      )}
    </>
  );
}
