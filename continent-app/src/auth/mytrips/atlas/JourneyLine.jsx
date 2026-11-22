import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { journeyModel } from './journeyLine.js';

/**
 * The journey line (G12, My trips atlas): Carta's planner motif, one umber
 * pill per stop as long as its nights on a 2 px ink line, with a bead per
 * day. Done days are filled, today is the one saffron bead with an umber
 * ring (the ring carries the contrast on stone), days to come are outlined:
 * fill against outline, so colour is never the only signal. On the spend
 * line a bead's area grows with the day's own total and today keeps only
 * the umber ring (the page's saffron is the food plan bar).
 *
 * Drawn for the eye; `label` says the whole line in words (role img).
 *
 *   stops       [{ city, nights }]
 *   dayNum      today's day (1 based), 0 before the trip
 *   variant     'today' | 'card' | 'spend'
 *   dayTotals   spend only, see journeyLine.js
 *   dayLabels   spend only: one short word per day under its bead
 *   strong      the index of a stop whose name is set heavier (tomorrow's move)
 *   draw        true after a tab change: the done beads wipe in, today lands
 *               (never at first paint; reduced motion shows the end state)
 */
export function JourneyLine({
  stops = [], dayNum = 0, variant = 'today', dayTotals = null, dayLabels = null, strong = -1,
  label = '', draw = false, className = '',
}) {
  const box = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const read = () => { const w = Math.floor(el.getBoundingClientRect().width); if (w > 0) setWidth((v) => (v === w ? v : w)); };
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const spend = variant === 'spend';
  // A margin as wide as the largest bead's radius keeps the end beads whole.
  const pad = spend ? 12 : 8;
  const inner = Math.max(0, (width || 320) - pad * 2);
  const m = useMemo(
    () => journeyModel({ stops, dayNum, width: inner, variant, dayTotals }),
    [stops, dayNum, inner, variant, dayTotals],
  );
  const H = spend ? 28 : 24;
  const cy = H / 2;
  const done = m.beads.filter((b) => b.state === 'done');
  const rest = m.beads.filter((b) => b.state !== 'done' && b.state !== 'today');
  const today = m.beads.find((b) => b.state === 'today');
  return (
    <div ref={box} className={`jl is-${variant}${draw ? ' is-draw' : ''}${className ? ` ${className}` : ''}`}>
      {width > 0 && (
        <>
          <svg className="jl-svg" width={width} height={H} viewBox={`${-pad} 0 ${width} ${H}`} role="img" aria-label={label}>
            {m.pills.map((p) => (
              <rect key={`p${p.first}`} className="jl-pill" x={p.x} y={cy - 6} width={Math.max(0, p.w)} height="12" rx="6" />
            ))}
            <line className="jl-ln" x1={0} y1={cy} x2={inner} y2={cy} />
            {done.length > 0 && (
              <g className="jl-done">
                {done.map((b) => <circle key={b.day} className="jl-bead is-done" cx={b.cx} cy={cy} r={b.r} />)}
              </g>
            )}
            {rest.map((b) => (
              <circle key={b.day} className={`jl-bead is-${b.state}`} cx={b.cx} cy={cy} r={b.r} />
            ))}
            {today && <circle className={`jl-bead is-today${spend && !(today.eur > 0) ? ' is-zero' : ''}`} cx={today.cx} cy={cy} r={today.r} />}
            {m.mode === 'pills' && m.todayX != null && (
              <rect className="jl-tick" x={m.todayX - 2} y={cy - 8} width="4" height="16" rx="2" />
            )}
          </svg>
          {spend && dayLabels && m.mode !== 'pills' && (
            <div className="jl-days" aria-hidden="true">
              {m.beads.map((b) => (
                <span key={b.day} className={b.state === 'today' ? 'is-today' : undefined} style={{ left: `${pad + b.cx}px` }}>{dayLabels[b.day - 1] || ''}</span>
              ))}
            </div>
          )}
          <div className="jl-labs" aria-hidden="true">
            {m.pills.map((p, i) => (p.label && p.city ? (
              <span key={`l${p.first}`} className={p.here || i === strong ? 'is-strong' : undefined} style={{ left: `${pad + p.x}px`, maxWidth: `${Math.max(0, p.w)}px` }}>{p.city}</span>
            ) : null))}
          </div>
        </>
      )}
    </div>
  );
}
