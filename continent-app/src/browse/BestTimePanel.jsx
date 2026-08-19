import React from 'react';
import { cheapestWindows, cheapestFlexibleWindows, fareByWeekday } from '../lib/runtime_pricing.js';
import { eur } from '../lib/format.js';
import { CalendarIcon } from '../components/Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { ClimateStrip, MONTHS_SHORT } from './ClimateStrip.jsx';

const DOW_KEYS = ['bestTime.dowMon', 'bestTime.dowTue', 'bestTime.dowWed', 'bestTime.dowThu', 'bestTime.dowFri', 'bestTime.dowSat', 'bestTime.dowSun'];

const LENGTH_OPTIONS = [
  { key: 'weekend', labelKey: 'bestTime.weekend', nights: 3 },
  { key: 'week', labelKey: 'bestTime.oneWeek', nights: 7 },
  { key: 'twoWeeks', labelKey: 'bestTime.twoWeeks', nights: 14 },
  { key: 'flexible', labelKey: 'bestTime.flexible', nights: null },
];

const fmtDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Which length chip is closest to the trip the user actually has selected, // the sensible default when the tab first opens.
function closestLengthKey(nights) {
  const fixed = LENGTH_OPTIONS.filter((o) => o.nights != null);
  return fixed.reduce((a, b) => (Math.abs(b.nights - nights) < Math.abs(a.nights - nights) ? b : a)).key;
}

function windowNoun(t, lengthKey, foundNights) {
  if (lengthKey === 'weekend') return t('bestTime.nounWeekend');
  if (lengthKey === 'week') return t('bestTime.nounWeek');
  if (lengthKey === 'twoWeeks') return t('bestTime.nounTwoWeeks');
  return t('bestTime.nounNights', { n: foundNights });
}

// "Best time to go" for the currently selected destination: the cheapest
// window of a chosen trip length across the whole fare horizon, a chart of
// how the total moves over that horizon, and the weekday fare pattern.
export function BestTimePanel({ destination, departDate, returnDate, breakdown, choices, data, onShiftDates }) {
  const { t } = useI18n();
  const [lengthKey, setLengthKey] = React.useState(() => closestLengthKey(breakdown.nights));
  const activeOption = LENGTH_OPTIONS.find((o) => o.key === lengthKey);

  const windows = React.useMemo(() => {
    if (lengthKey === 'flexible') {
      return cheapestFlexibleWindows(destination, breakdown.nights, 3, choices, data?.meta, data?.destinations);
    }
    return cheapestWindows(destination, activeOption.nights, choices, data?.meta, data?.destinations);
  }, [destination, lengthKey, breakdown.nights, activeOption, choices, data]);

  const weekday = React.useMemo(() => fareByWeekday(destination), [destination]);

  const cheapest = windows.length > 0 ? windows.reduce((a, b) => (b.total < a.total ? b : a)) : null;
  const yours = { start: departDate, end: returnDate, total: breakdown.grand_total };
  const savingsPct = cheapest ? Math.round(100 * (1 - cheapest.total / yours.total)) : 0;
  const hasWeekday = weekday.some((v) => v != null);

  return (
    <div className="panel-section">
      <div className="section-title section-title-iconed"><CalendarIcon size={12} /> {t('bestTime.title')}</div>

      <div className="kind-chips bt-length-chips">
        {LENGTH_OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`chip ${lengthKey === o.key ? 'on' : ''}`}
            onClick={() => setLengthKey(o.key)}
          >
            {t(o.labelKey)}
          </button>
        ))}
      </div>

      {!cheapest || windows.length < 3 ? (
        <p className="footnote" style={{ marginTop: 0 }}>
          {t('bestTime.notEnoughData')}
        </p>
      ) : (
        <>
          <div className="bt-headline">
            <div className="bt-stat">
              <div className="bt-label">{t('bestTime.cheapestFound', { noun: windowNoun(t, lengthKey, cheapest.nights) })}</div>
              <div className="bt-value">{eur(cheapest.total)}</div>
              <div className="bt-dates">{fmtDate(cheapest.start)} - {fmtDate(cheapest.end)}</div>
            </div>
            {savingsPct > 1 && (
              <div className="bt-headline-actions">
                <span className="bt-badge">
                  <svg className="bt-badge-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 12l5 5L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t('bestTime.cheaperThanYours', { pct: savingsPct })}
                </span>
                {onShiftDates && (
                  <button className="bt-cta" onClick={() => onShiftDates(cheapest.start, cheapest.end)}>
                    {t('bestTime.shiftTripTo', { date: fmtDate(cheapest.start) })}
                  </button>
                )}
              </div>
            )}
          </div>

          <MonthBars windows={windows} cheapest={cheapest} yours={yours} />

          {hasWeekday && (
            <>
              <div className="section-title" style={{ marginTop: 18 }}>{t('bestTime.weekdayTitle')}</div>
              <WeekdayBars values={weekday} />
            </>
          )}
        </>
      )}

      {destination.climate && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>{t('bestTime.climateTitle')}</div>
          <ClimateStrip climate={destination.climate} />
        </>
      )}
    </div>
  );
}

// Cheapest achievable trip total per calendar month, as rounded bars: taller
// means pricier, the cheapest month is green, and the month holding the
// user's own departure carries an ink dot. Replaces the old per-window fare
// line, which was jagged and asked the reader to do the month bucketing by
// eye. Hover, tap or focus a bar for that month's cheapest window and dates.
function MonthBars({ windows, cheapest, yours }) {
  const { t } = useI18n();
  const [tipKey, setTipKey] = React.useState(null);

  const months = React.useMemo(() => {
    const byMonth = new Map();
    for (const w of windows) {
      const key = w.start.slice(0, 7);
      const cur = byMonth.get(key);
      if (!cur || w.total < cur.total) byMonth.set(key, w);
    }
    const list = [...byMonth.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, w]) => ({ key, w, label: MONTHS_SHORT[parseInt(key.slice(5), 10) - 1] }));
    // A horizon can wrap the year (Sep..Sep): the second appearance of a month
    // name gets its two-digit year so the axis stays unambiguous.
    const seen = new Set();
    for (const m of list) {
      if (seen.has(m.label)) m.label = `${m.label} '${m.key.slice(2, 4)}`;
      else seen.add(m.label);
    }
    return list;
  }, [windows]);

  if (months.length < 3) return null;

  const totals = months.map((m) => m.w.total);
  const vMin = Math.min(...totals);
  const vMax = Math.max(...totals);
  const span = vMax - vMin || 1;
  const cheapKey = cheapest.start.slice(0, 7);
  const yourKey = yours.start ? yours.start.slice(0, 7) : null;

  return (
    <>
      <div className="section-title" style={{ marginTop: 16 }}>{t('bestTime.monthTitle')}</div>
      <div className="month-chart">
        {months.map(({ key, w, label }) => {
          const isCheap = key === cheapKey;
          const isYou = key === yourKey;
          return (
            <button
              key={key}
              type="button"
              className={`mo-col ${isCheap ? 'is-cheap' : ''} ${isYou ? 'is-you' : ''}`}
              onMouseEnter={() => setTipKey(key)}
              onMouseLeave={() => setTipKey((k) => (k === key ? null : k))}
              onFocus={() => setTipKey(key)}
              onBlur={() => setTipKey((k) => (k === key ? null : k))}
              aria-label={t('bestTime.monthFrom', { month: label, price: eur(w.total) })}
              aria-current={isYou ? 'date' : undefined}
            >
              <div className="mo-val">{(isCheap || isYou) ? eur(w.total) : ''}</div>
              <div className="mo-bar-track">
                <div className="mo-bar" style={{ height: `${20 + ((w.total - vMin) / span) * 80}%` }} />
              </div>
              <div className="mo-name">
                {isYou && <i className="mo-you-dot" aria-hidden="true" />}
                {label}
              </div>
              {tipKey === key && (
                <div className="climate-tip mo-tip">
                  <b>{eur(w.total)}</b> {fmtDate(w.start)} - {fmtDate(w.end)}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="bt-legend">
        <span className="bt-legend-item"><i className="bt-dot bt-dot-green" /> {t('bestTime.legendCheapest')}</span>
        {yourKey && (
          <span className="bt-legend-item"><i className="bt-dot bt-dot-ink" /> {t('bestTime.legendYours')}</span>
        )}
      </div>
    </>
  );
}

function WeekdayBars({ values }) {
  const { t } = useI18n();
  const present = values.filter((v) => v != null);
  const dMin = Math.min(...present);
  const dMax = Math.max(...present);
  const span = dMax - dMin || 1;

  return (
    <div className="dow-chart">
      {values.map((v, i) => v == null ? null : (
        <div key={i} className="dow-col">
          <div className={`dow-val ${v === dMin ? 'min' : ''}`}>{eur(v)}</div>
          <div className="dow-bar-track">
            <div
              className={`dow-bar ${v === dMin ? 'min' : v === dMax ? 'max' : ''}`}
              style={{ height: `${20 + ((v - dMin) / span) * 80}%` }}
              title={t('bestTime.dowAvg', { day: t(DOW_KEYS[i]), value: eur(v) })}
            />
          </div>
          <div className="dow-name">{t(DOW_KEYS[i])}</div>
        </div>
      ))}
    </div>
  );
}
