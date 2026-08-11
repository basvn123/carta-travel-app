import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isNum } from '../coords.js';
import { km, metres, num } from '../format.js';

// One series, so no legend: the card header names it. Recessive grid, 2px
// trace, and a crosshair readout, because the question a reviewer asks of a
// profile is always "how steep is it just there", which a static picture
// cannot answer.

const PAD = { top: 12, right: 14, bottom: 22, left: 46 };
const HEIGHT = 190;

const niceStep = (span, target) => {
  const raw = span / Math.max(target, 1);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
};

export default function ElevationProfile({ profile, meta }) {
  const svg = useRef(null);
  const holder = useRef(null);
  const [cursor, setCursor] = useState(null);
  // The viewBox tracks the real pixel width, so one SVG unit is one pixel and
  // the tick labels are not stretched sideways by a fixed-width viewBox.
  const [width, setWidth] = useState(900);

  useLayoutEffect(() => {
    if (!holder.current) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(holder.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { setCursor(null); }, [profile]);

  const VIEW = { w: width, h: HEIGHT };

  const model = useMemo(() => {
    const pts = (profile || []).filter((p) => isNum(p?.[0]) && isNum(p?.[1]));
    if (pts.length < 2) return null;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const yLo = Math.min(...ys);
    const yHi = Math.max(...ys);
    // Never a zero-height band: a flat canal path would otherwise become a
    // line of infinite slope through the middle of the card.
    const padY = Math.max((yHi - yLo) * 0.12, 10);
    const y0 = yLo - padY;
    const y1 = yHi + padY;
    const sx = (v) => PAD.left + ((v - x0) / (x1 - x0 || 1)) * (VIEW.w - PAD.left - PAD.right);
    const sy = (v) => PAD.top + (1 - (v - y0) / (y1 - y0 || 1)) * (VIEW.h - PAD.top - PAD.bottom);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join('');
    const area = `${line}L${sx(x1).toFixed(1)} ${(VIEW.h - PAD.bottom).toFixed(1)}`
      + `L${sx(x0).toFixed(1)} ${(VIEW.h - PAD.bottom).toFixed(1)}Z`;
    const yStep = niceStep(y1 - y0, 4);
    const yTicks = [];
    for (let v = Math.ceil(y0 / yStep) * yStep; v <= y1; v += yStep) yTicks.push(v);
    const xStep = niceStep(x1 - x0, 6);
    const xTicks = [];
    for (let v = 0; v <= x1; v += xStep) if (v >= x0) xTicks.push(v);
    return { pts, x0, x1, yLo, yHi, sx, sy, line, area, xTicks, yTicks };
  }, [profile, width]);

  if (!model) {
    return (
      <p className="muted" style={{ padding: '16px' }}>
        No elevation profile stored. Run pipeline/trails/elevation.py over this trip.
      </p>
    );
  }

  const onMove = (e) => {
    const rect = svg.current.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * VIEW.w;
    const frac = (vx - PAD.left) / (VIEW.w - PAD.left - PAD.right);
    const target = model.x0 + frac * (model.x1 - model.x0);
    let best = model.pts[0];
    for (const p of model.pts) {
      if (Math.abs(p[0] - target) < Math.abs(best[0] - target)) best = p;
    }
    setCursor(best);
  };

  return (
    <div ref={holder}>
      <svg
        className="profile"
        ref={svg}
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        role="img"
        aria-label={`Elevation profile, ${metres(model.yLo)} to ${metres(model.yHi)} over ${km(model.x1)}`}
        onMouseMove={onMove}
        onMouseLeave={() => setCursor(null)}
      >
        {model.yTicks.map((v) => (
          <g key={`y${v}`}>
            <line className="grid-line" x1={PAD.left} x2={VIEW.w - PAD.right} y1={model.sy(v)} y2={model.sy(v)} />
            <text className="axis-text" x={PAD.left - 6} y={model.sy(v) + 3.5} textAnchor="end">{num(v)}</text>
          </g>
        ))}
        <path className="trace-fill" d={model.area} />
        <path className="trace" d={model.line} vectorEffect="non-scaling-stroke" />
        {model.xTicks.map((v) => (
          <text key={`x${v}`} className="axis-text" x={model.sx(v)} y={VIEW.h - 6} textAnchor="middle">
            {num(v / 1000, v % 1000 === 0 ? 0 : 1)}
          </text>
        ))}
        {cursor && (
          <g>
            <line
              className="crosshair"
              x1={model.sx(cursor[0])}
              x2={model.sx(cursor[0])}
              y1={PAD.top}
              y2={VIEW.h - PAD.bottom}
            />
            <circle className="cursor-dot" cx={model.sx(cursor[0])} cy={model.sy(cursor[1])} r={4} />
          </g>
        )}
      </svg>
      <div className="readout" style={{ padding: '0 16px 14px' }}>
        <span><span className="k">at </span>{cursor ? km(cursor[0], 2) : km(0, 2)}</span>
        <span><span className="k">elevation </span>{metres(cursor ? cursor[1] : model.yLo)}</span>
        <span><span className="k">range </span>{metres(model.yLo)} to {metres(model.yHi)}</span>
        {meta?.max_grade_pct != null && (
          <span><span className="k">max grade </span>{num(meta.max_grade_pct, 1)}%</span>
        )}
        <span className="k">
          {meta?.source === 'copernicus_glo30' ? 'Copernicus GLO-30' : meta?.source || ''}
          {meta?.step_m ? `, sampled every ${num(meta.step_m)} m` : ''}
        </span>
      </div>
    </div>
  );
}
