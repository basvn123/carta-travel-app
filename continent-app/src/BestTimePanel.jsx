import React from 'react';
import { cheapestWindows, cheapestFlexibleWindows, fareByWeekday } from './runtime_pricing.js';

const DOW_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const LENGTH_OPTIONS = [
  { key: 'weekend', label: 'Weekend', nights: 3 },
  { key: 'week', label: '1 week', nights: 7 },
  { key: 'twoWeeks', label: '2 weeks', nights: 14 },
  { key: 'flexible', label: 'Flexible ±3 days', nights: null },
];

const eur = (n) => `€${Math.round(n).toLocaleString('en-GB')}`;
const fmtDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Which length chip is closest to the trip the user actually has selected -
// the sensible default when the tab first opens.
function closestLengthKey(nights) {
  const fixed = LENGTH_OPTIONS.filter((o) => o.nights != null);
  return fixed.reduce((a, b) => (Math.abs(b.nights - nights) < Math.abs(a.nights - nights) ? b : a)).key;
}

function windowNoun(lengthKey, foundNights) {
  if (lengthKey === 'weekend') return 'weekend';
  if (lengthKey === 'week') return 'week';
  if (lengthKey === 'twoWeeks') return '2-week trip';
  return `${foundNights}-night trip`;
}

// "Best time to go" for the currently selected destination: the cheapest
// window of a chosen trip length across the whole fare horizon, a chart of
// how the total moves over that horizon, and the weekday fare pattern.
export function BestTimePanel({ destination, departDate, returnDate, breakdown, choices, data, onShiftDates }) {
  const [lengthKey, setLengthKey] = React.useState(() => closestLengthKey(breakdown.nights));
  const activeOption = LENGTH_OPTIONS.find((o) => o.key === lengthKey);

  const windows = React.useMemo(() => {
    if (lengthKey === 'flexible') {
      return cheapestFlexibleWindows(destination, breakdown.nights, 3, choices, data?.meta);
    }
    return cheapestWindows(destination, activeOption.nights, choices, data?.meta);
  }, [destination, lengthKey, breakdown.nights, activeOption, choices, data]);

  const weekday = React.useMemo(() => fareByWeekday(destination), [destination]);

  const cheapest = windows.length > 0 ? windows.reduce((a, b) => (b.total < a.total ? b : a)) : null;
  const yours = { start: departDate, end: returnDate, total: breakdown.grand_total };
  const savingsPct = cheapest ? Math.round(100 * (1 - cheapest.total / yours.total)) : 0;
  const hasWeekday = weekday.some((v) => v != null);

  return (
    <div className="panel-section">
      <div className="section-title">Best time to go</div>

      <div className="kind-chips bt-length-chips">
        {LENGTH_OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`chip ${lengthKey === o.key ? 'on' : ''}`}
            onClick={() => setLengthKey(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>

      {!cheapest || windows.length < 3 ? (
        <p className="footnote" style={{ marginTop: 0 }}>
          Not enough fare data yet to compare travel periods for this destination.
        </p>
      ) : (
        <>
          <div className="bt-headline">
            <div className="bt-stat">
              <div className="bt-label">Cheapest {windowNoun(lengthKey, cheapest.nights)} found</div>
              <div className="bt-value">{eur(cheapest.total)}</div>
              <div className="bt-dates">{fmtDate(cheapest.start)} - {fmtDate(cheapest.end)}</div>
            </div>
            {savingsPct > 1 && (
              <div className="bt-headline-actions">
                <span className="bt-badge">
                  <svg className="bt-badge-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 12l5 5L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {savingsPct}% cheaper than your dates
                </span>
                {onShiftDates && (
                  <button className="bt-cta" onClick={() => onShiftDates(cheapest.start, cheapest.end)}>
                    Shift trip to {fmtDate(cheapest.start)} -&gt;
                  </button>
                )}
              </div>
            )}
          </div>

          <BestTimeChart windows={windows} cheapest={cheapest} yours={yours} />

          {hasWeekday && (
            <>
              <div className="section-title" style={{ marginTop: 18 }}>Average flight fare by day of week</div>
              <WeekdayBars values={weekday} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function BestTimeChart({ windows, cheapest, yours }) {
  const [hoverI, setHoverI] = React.useState(null);
  const svgRef = React.useRef(null);

  const W = 600, H = 180, padL = 42, padR = 8, padT = 22, padB = 22;

  // Downsample so the line stays legible over a long fare horizon.
  const step = Math.max(1, Math.ceil(windows.length / 60));
  const pts = windows.filter((_, i) => i % step === 0);

  const values = pts.map((w) => w.total);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const span = maxV - minV || 1;

  const x = (i) => padL + (i / Math.max(1, pts.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - minV) / span) * (H - padT - padB);

  const closestIdx = (iso) => {
    const t = new Date(iso + 'T00:00:00Z').getTime();
    let bi = 0, bd = Infinity;
    pts.forEach((w, i) => {
      const d = Math.abs(new Date(w.start + 'T00:00:00Z').getTime() - t);
      if (d < bd) { bd = d; bi = i; }
    });
    return bi;
  };
  const cheapI = closestIdx(cheapest.start);
  const yoursI = closestIdx(yours.start);

  const pathD = pts.map((w, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(w.total)}`).join(' ');
  const areaD = `${pathD} L${x(pts.length - 1)},${H - padB} L${x(0)},${H - padB} Z`;

  let lastMonth = null;
  const monthTicks = [];
  pts.forEach((w, i) => {
    const m = new Date(w.start + 'T00:00:00Z').getUTCMonth();
    if (m !== lastMonth) {
      lastMonth = m;
      monthTicks.push({ i, label: new Date(w.start + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short' }) });
    }
  });
  const yTicks = [minV, Math.round((minV + maxV) / 2), maxV];

  const handleMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let idx = Math.round(((relX - padL) / (W - padL - padR)) * (pts.length - 1));
    idx = Math.max(0, Math.min(pts.length - 1, idx));
    setHoverI(idx);
  };

  return (
    <div className="bt-chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverI(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} className="bt-grid" />
            <text x={2} y={y(v) + 3} className="bt-axis">{eur(v)}</text>
          </g>
        ))}
        {monthTicks.map(({ i, label }) => (
          <text key={i} x={x(i)} y={H - 6} className="bt-axis" textAnchor="middle">{label}</text>
        ))}

        <path d={areaD} className="bt-area" />
        <path d={pathD} className="bt-line" />

        {hoverI != null && (
          <line x1={x(hoverI)} x2={x(hoverI)} y1={padT} y2={H - padB} className="bt-crosshair" />
        )}

        <circle cx={x(cheapI)} cy={y(pts[cheapI].total)} r={5} className="bt-pt bt-pt-cheap" />
        <circle cx={x(yoursI)} cy={y(pts[yoursI].total)} r={5} className="bt-pt bt-pt-you" />
      </svg>

      <ChartPin xPct={(x(cheapI) / W) * 100} yPct={(y(pts[cheapI].total) / H) * 100} dotClass="green" label="cheapest" />
      <ChartPin xPct={(x(yoursI) / W) * 100} yPct={(y(pts[yoursI].total) / H) * 100} dotClass="ink" label="your dates" />

      {hoverI != null && (
        <div
          className="bt-tooltip"
          style={{ left: `${(x(hoverI) / W) * 100}%`, top: `${(y(pts[hoverI].total) / H) * 100}%` }}
        >
          <b>{eur(pts[hoverI].total)}</b> · week of {fmtDate(pts[hoverI].start)}
        </div>
      )}

      <div className="bt-legend">
        <span className="bt-legend-item"><i className="bt-dot bt-dot-accent" /> Total cost by trip start date</span>
        <span className="bt-legend-item"><i className="bt-dot bt-dot-green" /> Cheapest window</span>
        <span className="bt-legend-item"><i className="bt-dot bt-dot-ink" /> Your selected dates</span>
      </div>
    </div>
  );
}

// A small floating label pinned to a chart point. Flips to stay clear of the
// chart edges instead of overlapping the line or getting clipped: right-
// anchored near the right edge, left-anchored near the left edge, and pushed
// below the point instead of above when the point itself is near the top.
function ChartPin({ xPct, yPct, dotClass, label }) {
  const h = xPct < 15 ? 'left' : xPct > 85 ? 'right' : 'center';
  const v = yPct < 24 ? 'below' : 'above';
  return (
    <div className={`bt-pin bt-pin-${h} bt-pin-${v}`} style={{ left: `${xPct}%`, top: `${yPct}%` }}>
      <i className={`bt-pin-dot bt-dot-${dotClass}`} />
      {label}
    </div>
  );
}

function WeekdayBars({ values }) {
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
              title={`${DOW_NAMES[i]} avg ${eur(v)}`}
            />
          </div>
          <div className="dow-name">{DOW_NAMES[i]}</div>
        </div>
      ))}
    </div>
  );
}
