import React from 'react';
import { cheapestWindows, fareByWeekday } from './runtime_pricing.js';

const DOW_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const eur = (n) => `€${Math.round(n).toLocaleString('en-GB')}`;
const fmtDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// "Best time to go" for the currently selected destination: the cheapest
// window of the same trip length across the whole fare horizon, a chart of
// how the total moves over that horizon, and the weekday fare pattern.
export function BestTimePanel({ destination, departDate, returnDate, breakdown, choices, data, onShiftDates }) {
  const nights = breakdown.nights;

  const windows = React.useMemo(
    () => cheapestWindows(destination, nights, choices, data?.meta),
    [destination, nights, choices, data],
  );
  const weekday = React.useMemo(() => fareByWeekday(destination), [destination]);

  if (windows.length < 3) {
    return (
      <div className="panel-section">
        <p className="footnote" style={{ marginTop: 0 }}>
          Not enough fare data yet to compare travel periods for this destination.
        </p>
      </div>
    );
  }

  const cheapest = windows.reduce((a, b) => (b.total < a.total ? b : a));
  const yours = { start: departDate, end: returnDate, total: breakdown.grand_total };
  const savingsPct = Math.round(100 * (1 - cheapest.total / yours.total));
  const hasWeekday = weekday.some((v) => v != null);

  return (
    <div className="panel-section">
      <div className="section-title">Best time to go</div>

      <div className="bt-headline">
        <div className="bt-stat">
          <div className="bt-label">Cheapest {nights}-night window found</div>
          <div className="bt-value">{eur(cheapest.total)}</div>
          <div className="bt-dates">{fmtDate(cheapest.start)} - {fmtDate(cheapest.end)}</div>
        </div>
        {savingsPct > 1 && (
          <div className="bt-headline-actions">
            <span className="bt-badge">{savingsPct}% cheaper than your dates</span>
            {onShiftDates && (
              <button className="bt-cta" onClick={() => onShiftDates(cheapest.start, cheapest.end)}>
                Shift trip to {fmtDate(cheapest.start)}
              </button>
            )}
          </div>
        )}
      </div>

      <BestTimeChart windows={windows} cheapest={cheapest} yours={yours} nights={nights} />

      {hasWeekday && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>Average flight fare by day of week</div>
          <WeekdayBars values={weekday} />
        </>
      )}
    </div>
  );
}

function BestTimeChart({ windows, cheapest, yours, nights }) {
  const [hoverI, setHoverI] = React.useState(null);
  const svgRef = React.useRef(null);

  const W = 600, H = 180, padL = 42, padR = 8, padT = 14, padB = 22;

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
        <text x={x(cheapI)} y={y(pts[cheapI].total) - 10} className="bt-direct-label g" textAnchor="middle">cheapest</text>

        <circle cx={x(yoursI)} cy={y(pts[yoursI].total)} r={5} className="bt-pt bt-pt-you" />
        <text x={x(yoursI)} y={y(pts[yoursI].total) - 10} className="bt-direct-label k" textAnchor="middle">your dates</text>
      </svg>

      {hoverI != null && (
        <div
          className="bt-tooltip"
          style={{ left: `${(x(hoverI) / W) * 100}%`, top: `${(y(pts[hoverI].total) / H) * 100}%` }}
        >
          <b>{eur(pts[hoverI].total)}</b> · week of {fmtDate(pts[hoverI].start)}
        </div>
      )}

      <div className="bt-legend">
        <span className="bt-legend-item"><i className="bt-dot bt-dot-accent" /> Total cost, {nights}-night window start</span>
        <span className="bt-legend-item"><i className="bt-dot bt-dot-green" /> Cheapest window</span>
        <span className="bt-legend-item"><i className="bt-dot bt-dot-ink" /> Your selected dates</span>
      </div>
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
