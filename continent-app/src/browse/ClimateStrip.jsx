import React from 'react';
import { useI18n, tOutsideProvider } from '../i18n/index.jsx';
import { monthName } from '../lib/dates.js';
import NotYet from '../components/NotYet.jsx';
import { climateExtras, windSeriesKmh } from '../lib/waterFacts.js';

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
// component's t; outside one the stored language is used. Month names come
// from Intl in that language (T507: they were English in all six).
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
  const lang = t.lang || 'en';
  const nm = (n) => monthName(n, lang, false) || MONTHS_SHORT[n - 1];
  return runs
    .map(([a, b]) => (a === b ? nm(a) : t('detail.monthRange', { from: nm(a), to: nm(b) })))
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
  const { t, lang } = useI18n();
  const mShort = (i) => monthName(i + 1, lang, false) || MONTHS_SHORT[i];
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
            aria-label={ink ? `${mShort(i)}: ${t('bestTime.climateTip', {
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
                <b>{mShort(i)}</b>{' '}
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

/**
 * The monthly figures the strip does not draw (T631): rain days, wind,
 * sunshine hours, water temperature and the temperature at altitude. Every
 * series keeps its slot; a series the wire does not carry says so with the
 * shared placeholder, never a blank. Derived and modelled series are marked
 * as such in their own label.
 *
 *   climate      the dest climate block (compact wire or master names)
 *   water        { temps: [12]|null, est: bool } the water temperature, or
 *                null when the place has no source (beaches, destinations)
 *   altitude     altitudeSeries() answer, null when it cannot be derived
 *   sameLevel    { town } when the place sits at the town's height, so the
 *                altitude row says the valley figures apply
 */
export function ClimateExtras({ climate, water = null, altitude = null, sameLevel = null }) {
  const { t, lang } = useI18n();
  const { rainDays } = climateExtras(climate);
  const wind = windSeriesKmh(climate);
  const nf = (n) => {
    try { return new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(n); } catch { return String(n); }
  };
  const mShort = (i) => monthName(i + 1, lang, false) || MONTHS_SHORT[i];
  const series = [
    { key: 'rain', label: t('wx.rainDays'), note: t('wx.rainDaysNote'), values: rainDays },
    { key: 'wind', label: t('wx.wind'), note: t('wx.windNote'), values: wind },
    { key: 'sun', label: t('wx.sunHours'), values: null },
    {
      key: 'water',
      label: t('wx.waterTemp'),
      note: water?.temps && water.est ? `${t('prov.est')} ${t('wx.estimate')}` : null,
      values: water?.temps || null,
      unit: '°',
    },
    altitude
      ? {
        key: 'alt-hi',
        label: t('wx.altHigh', { name: altitude.name || t('wx.altThePeak'), m: nf(altitude.m) }),
        note: t('wx.altNote'),
        values: altitude.hi,
        unit: '°',
      }
      : { key: 'alt-hi', label: t('wx.altitude'), values: null, sameLevel },
    altitude && {
      key: 'alt-lo',
      label: t('wx.altLow', { name: altitude.name || t('wx.altThePeak'), m: nf(altitude.m) }),
      values: altitude.lo,
      unit: '°',
    },
  ].filter(Boolean);
  return (
    <div className="clm-extras" data-testid="climate-extras">
      <ol className="clm-months" aria-hidden="true">
        {MONTHS_INITIAL.map((m, i) => <li key={i}>{m}</li>)}
      </ol>
      {series.map((s) => (
        <div className="clm-series" key={s.key} data-testid={`clm-${s.key}`}>
          <p className="clm-label">
            {s.label}
            {s.note && <small>{s.note}</small>}
          </p>
          {s.values ? (
            <ol className="clm-cells">
              {s.values.map((v, i) => (
                <li key={i} aria-label={`${mShort(i)}: ${v == null ? t('data.notYet') : `${nf(v)}${s.unit || ''}`}`}>
                  {v == null ? '' : `${Math.round(v)}${s.unit || ''}`}
                </li>
              ))}
            </ol>
          ) : s.sameLevel ? (
            <p className="not-yet-line" data-testid="clm-same">{t('wx.sameLevel', { town: s.sameLevel.town })}</p>
          ) : (
            <NotYet />
          )}
        </div>
      ))}
    </div>
  );
}
