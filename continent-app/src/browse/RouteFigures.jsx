import React from 'react';
import { count } from '../lib/format.js';
import {
  slopeRuns, slopeShares, profileAt, trafficMix, kmOf,
} from '../lib/signature.js';
import { SpanAxis } from './Signature.jsx';

/**
 * The route figures, one family for the trail page, the cycling page and the
 * journey page (T174, trips spec E3 and E4, destinations spec C6 and C9).
 *
 *   ElevationChart  a measured profile: the trail and cycling detail wires
 *   WeekProfile     a week of stated climbs and descents, one column a day
 *   MixBar          one 100%-wide stacked bar with its key: the surface mix
 *                   (SurfaceBar in RouteParts.jsx is a MixBar) and the
 *                   traffic exposure
 *   MixKeys         the key under a MixBar, also used on its own
 *   SlopeProfile    the trail page's signature (T181): the profile shaded
 *                   by steepness, scrubbable, driving a point on the map
 *
 * The two charts draw through the same AreaPlot, so a trail profile and a
 * week profile share their scale, strokes and fills; the bars share one
 * segment grammar and one tone set. When the route track wire exists
 * (T177-b), a journey hands its profile to ElevationChart and the week
 * profile keeps its place as the per-day summary.
 */

const W = 320;
const PAD = 2;
const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/**
 * The shared plot: areas closed down (or up) to their own base line, each
 * with its stroke, and vertical marks. Stretched to the column's width, so
 * every stroke opts out of the non-uniform scale or a vertical mark ends up
 * fatter than the profile line.
 */
function AreaPlot({ H, areas, marks = [], label, className = '' }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`tpage-elev-svg ${className}`} role="img" aria-label={label} preserveAspectRatio="none">
      {marks.map((m) => (
        <line key={`${m.className}-${m.x}`} x1={m.x} y1={PAD} x2={m.x} y2={H - PAD} className={m.className} vectorEffect="non-scaling-stroke" />
      ))}
      {areas.map((a) => (
        <React.Fragment key={a.key}>
          <polyline points={pts([[a.line[0][0], a.base], ...a.line, [a.line[a.line.length - 1][0], a.base]])} className={a.areaClass} />
          <polyline points={pts(a.line)} className={a.lineClass} vectorEffect="non-scaling-stroke" />
        </React.Fragment>
      ))}
    </svg>
  );
}

/**
 * The measured elevation profile, with the walker's position on it while
 * following (`atM`). `elevation` is the trail and cycling detail block:
 * `profile` as [along_m, ele_m] pairs, `ele_min_m` and `ele_max_m`.
 */
export function ElevationChart({ elevation, atM = null, label, maxLabel, className = '', testId }) {
  const profile = elevation?.profile;
  if (!Array.isArray(profile) || profile.length < 2) return null;
  const H = 84;
  const dMax = profile[profile.length - 1][0] || 1;
  let eMin = elevation.ele_min_m;
  let eMax = elevation.ele_max_m;
  if (!Number.isFinite(eMin) || !Number.isFinite(eMax)) {
    eMin = Infinity; eMax = -Infinity;
    for (const p of profile) {
      if (p[1] < eMin) eMin = p[1];
      if (p[1] > eMax) eMax = p[1];
    }
  }
  const span = Math.max(1, eMax - eMin);
  const x = (d) => PAD + Math.min(1, d / dMax) * (W - 2 * PAD);
  const y = (e) => H - PAD - ((e - eMin) / span) * (H - 2 * PAD);
  const line = profile.map(([d, e]) => [x(d), y(e)]);
  const marks = Number.isFinite(atM) ? [{ x: x(atM), className: 'tpage-elev-here' }] : [];
  return (
    <div className={`tpage-elev ${className}`} data-testid={testId}>
      <AreaPlot
        H={H}
        label={label}
        marks={marks}
        areas={[{ key: 'up', line, base: H - PAD, areaClass: 'tpage-elev-area', lineClass: 'tpage-elev-line' }]}
      />
      <div className="tpage-elev-axis">
        <span>{Math.round(eMin)} m</span>
        <span>{Math.round(eMax)} m {maxLabel}</span>
      </div>
    </div>
  );
}

/**
 * The week as a profile: one column per day, the stated climb as a rise
 * above the line and the stated descent as a fall below it, on one scale.
 * The day boundaries are the hairlines. Inside a column the shape is drawn
 * (a shoulder in, a level, a shoulder out), not measured, and the note under
 * the chart says so; only the column heights are the plan's figures.
 *
 * `relief` is lib/routeFigures.weekRelief(trip). The figures under each
 * column are the stated metres, blank where the day states none.
 */
// A stated figure with its sign; a stated zero is "0", never "+0" or "-0".
const signed = (v, sign) => (v == null ? '' : v === 0 ? '0' : `${sign}${count(v)}`);

export function WeekProfile({ relief, t }) {
  if (!relief?.show) return null;
  const { days } = relief;
  const n = days.length;
  const H = 96;
  const maxUp = Math.max(1, ...days.map((d) => d.up || 0));
  const maxDown = Math.max(0, ...days.map((d) => d.down || 0));
  const scale = (H - 2 * PAD) / (maxUp + maxDown);
  const axis = PAD + maxUp * scale;
  const colW = (W - 2 * PAD) / n;
  const shoulder = colW * 0.22;
  const trace = (k, sign) => {
    const out = [[PAD, axis]];
    days.forEach((d, i) => {
      const x0 = PAD + i * colW;
      const x1 = x0 + colW;
      const v = d[k] || 0;
      if (v > 0) {
        const yv = axis - sign * v * scale;
        out.push([x0 + 1, axis], [x0 + shoulder, yv], [x1 - shoulder, yv], [x1 - 1, axis]);
      } else {
        out.push([x1, axis]);
      }
    });
    return out;
  };
  const areas = [{ key: 'up', line: trace('up', 1), base: axis, areaClass: 'tpage-elev-area', lineClass: 'tpage-elev-line' }];
  if (maxDown > 0) {
    areas.push({ key: 'down', line: trace('down', -1), base: axis, areaClass: 'rfig-down-area', lineClass: 'rfig-down-line' });
  }
  const marks = days.slice(1).map((_, i) => ({ x: PAD + (i + 1) * colW, className: 'rfig-day' }));
  const aria = days.map((d) => t('journey.reliefDayAria', {
    day: d.day,
    up: d.up == null ? '?' : count(d.up),
    down: d.down == null ? '?' : count(d.down),
  })).join('. ');
  const showDown = relief.downDays > 0;
  return (
    <div className="rfig-week" data-testid="journey-relief" style={{ '--rfig-n': n }}>
      <AreaPlot H={H} areas={areas} marks={marks} label={`${t('journey.reliefAria')}. ${aria}`} className="rfig-week-svg" />
      <ol className="rfig-days" aria-hidden="true">
        {days.map((d) => (
          <li key={d.day}>
            <span className="rfig-up mono">{signed(d.up, '+')}</span>
            {showDown && <span className="rfig-down mono">{d.rest ? '' : signed(d.down, '−')}</span>}
            <span className="rfig-dn mono">{d.day}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const pct = (v) => `${Math.round(v * 100)}%`;

/**
 * The key under a stacked bar: a swatch, the label and the figure. A part
 * may carry its own `value` (the cycling page prints kilometres per class,
 * T181); without one the key prints the share.
 */
export function MixKeys({ parts, className = '' }) {
  const shown = (parts || []).filter((p) => p.share > 0.005);
  if (!shown.length) return null;
  return (
    <ul className={`rsurf-keys ${className}`.trim()}>
      {shown.map((p) => (
        <li key={p.key}>
          <span className={`rsurf-dot is-${p.tone}`} aria-hidden="true" />
          {p.label}
          <span className="mono">{p.value ?? pct(p.share)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One stacked bar and its key. `parts` is [{ key, tone, label, share, value }]
 * with shares that sum to 1; `tone` picks the fill (paved, gravel, path,
 * other and unknown for surface, free, shared and unknown for traffic, slope0
 * to slope2 for steepness). `value`, when given, is printed in the key in
 * place of the share; `keys={false}` leaves the key to the caller, who
 * may want it below an axis. The unknown share is left as the bar's own ground, so
 * an absence of a reading never looks like one more surface. Shares under
 * half a percent are not drawn.
 */
export function MixBar({ parts, className = '', testId, keys = true }) {
  const shown = (parts || []).filter((p) => p.share > 0.005);
  if (!shown.length) return null;
  return (
    <div className={`rsurf ${className}`} data-testid={testId}>
      <div className="rsurf-bar" role="img" aria-label={shown.map((p) => `${p.label} ${p.value ?? pct(p.share)}`).join(', ')}>
        {shown.map((p) => (
          <span key={p.key} className={`rsurf-seg is-${p.tone}`} style={{ width: pct(p.share) }} />
        ))}
      </div>
      {keys && <MixKeys parts={shown} />}
    </div>
  );
}

/**
 * Traffic exposure as a MixBar: away from cars, shared with cars, and the
 * share nobody could place.
 */
export function TrafficBar({ split, t, testId = 'route-traffic', totalM = null, keys = true }) {
  if (!split) return null;
  return <MixBar className="rtraffic" testId={testId} keys={keys} parts={trafficMix(split, t, totalM)} />;
}

/**
 * The trail's signature (T181, destinations spec 5.5): the measured profile
 * with every stretch shaded by how steep it is, on the same three steps the
 * wire reports (under 10, 10 to 15, over 15 percent, lib/signature.js), and
 * a marker you can drag along it. `onScrub(along_m | null)` tells the page
 * where the marker is, so the page can put the same point on the map
 * (TrailPage's highlightAt). `atM` is the walker's own position while
 * following, drawn as before.
 *
 * The shading is the ink ramp the surface bar uses, weight rather than hue;
 * the marker is the one accent, because it is the live point on the route.
 * The marker and its dot are HTML laid over the SVG, which is stretched to
 * the column, so the dot stays round at every width.
 *
 * It is a slider to assistive technology and to the keyboard: arrows move a
 * fiftieth of the walk, Page Up and Page Down a fifth, Home and End to the
 * ends. On a phone a sideways drag scrubs and a vertical one still scrolls.
 */
export function SlopeProfile({
  elevation, atM = null, onScrub = null, labels, testId = 'trail-slope',
}) {
  const profile = elevation?.profile;
  const [at, setAt] = React.useState(null);
  const boxRef = React.useRef(null);
  const geo = React.useMemo(() => {
    if (!Array.isArray(profile) || profile.length < 2) return null;
    const H = 96;
    const dMax = profile[profile.length - 1][0] || 1;
    let eMin = elevation.ele_min_m;
    let eMax = elevation.ele_max_m;
    if (!Number.isFinite(eMin) || !Number.isFinite(eMax)) {
      eMin = Infinity; eMax = -Infinity;
      for (const p of profile) {
        if (p[1] < eMin) eMin = p[1];
        if (p[1] > eMax) eMax = p[1];
      }
    }
    const span = Math.max(1, eMax - eMin);
    const x = (d) => PAD + Math.min(1, d / dMax) * (W - 2 * PAD);
    const y = (e) => H - PAD - ((e - eMin) / span) * (H - 2 * PAD);
    const runs = slopeRuns(profile).map((r) => {
      const seg = profile.slice(r.from, r.to + 1).map(([d, e]) => [x(d), y(e)]);
      const poly = [[seg[0][0], H], ...seg, [seg[seg.length - 1][0], H]];
      return { key: `${r.from}-${r.cls}`, cls: r.cls, points: pts(poly) };
    });
    const line = pts(profile.map(([d, e]) => [x(d), y(e)]));
    return { H, dMax, eMin, eMax, span, runs, line };
  }, [profile, elevation]);

  const report = React.useCallback((v) => {
    setAt(v);
    onScrub?.(v);
  }, [onScrub]);

  if (!geo) return null;
  const { H, dMax, eMin, eMax, span } = geo;
  const read = at != null ? profileAt(profile, at) : null;
  const pctX = (d) => `${((PAD + Math.min(1, d / dMax) * (W - 2 * PAD)) / W) * 100}%`;
  const pctY = (e) => `${((H - PAD - ((e - eMin) / span) * (H - 2 * PAD)) / H) * 100}%`;
  const km = (m) => (m / 1000).toFixed(1);

  const fromPointer = (ev) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return;
    const share = Math.max(0, Math.min(1, (ev.clientX - box.left) / box.width));
    report(share * dMax);
  };
  const onKey = (ev) => {
    const step = dMax / 50;
    const now = at ?? 0;
    const go = {
      ArrowRight: now + step, ArrowUp: now + step,
      ArrowLeft: now - step, ArrowDown: now - step,
      PageUp: now + step * 10, PageDown: now - step * 10,
      Home: 0, End: dMax,
    }[ev.key];
    if (go == null) return;
    ev.preventDefault();
    report(Math.max(0, Math.min(dMax, go)));
  };

  const readout = read
    ? labels.at({ km: km(read.along), m: count(read.ele), pct: Math.round(Math.abs(read.grade)) })
    : labels.range({ min: count(eMin), max: count(eMax) });
  const slopeParts = slopeShares(elevation);

  return (
    <div className="sig-trail" data-testid={testId}>
      <div className="sig-cap">
        <span>{labels.row}</span>
        <span className="mono" aria-live="polite">{readout}</span>
      </div>
      <div
        ref={boxRef}
        className="sig-scrub tpage-elev"
        role="slider"
        tabIndex={0}
        aria-label={labels.aria}
        aria-valuemin={0}
        aria-valuemax={Math.round(dMax)}
        aria-valuenow={Math.round(read?.along ?? 0)}
        aria-valuetext={readout}
        onPointerDown={(ev) => {
          ev.currentTarget.setPointerCapture?.(ev.pointerId);
          fromPointer(ev);
        }}
        onPointerMove={(ev) => {
          if (ev.pointerType === 'mouse' || ev.buttons) fromPointer(ev);
        }}
        onPointerLeave={(ev) => { if (ev.pointerType === 'mouse') report(null); }}
        onBlur={() => report(null)}
        onKeyDown={onKey}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="tpage-elev-svg sig-profile" aria-hidden="true" preserveAspectRatio="none">
          {geo.runs.map((r) => (
            <polygon key={r.key} points={r.points} className={`sig-slope is-slope${r.cls}`} />
          ))}
          <polyline points={geo.line} className="sig-profile-line" vectorEffect="non-scaling-stroke" />
          {Number.isFinite(atM) && (
            <line x1={PAD + Math.min(1, atM / dMax) * (W - 2 * PAD)} x2={PAD + Math.min(1, atM / dMax) * (W - 2 * PAD)}
              y1={PAD} y2={H - PAD} className="tpage-elev-here" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {read && (
          <>
            <span className="sig-scrub-line" style={{ left: pctX(read.along) }} aria-hidden="true" />
            <span className="sig-scrub-dot" style={{ left: pctX(read.along), top: pctY(read.ele) }} aria-hidden="true" />
          </>
        )}
      </div>
      <SpanAxis marks={['0 km', km(dMax / 2), `${km(dMax)} km`]} />
      {slopeParts && (
        <MixKeys parts={slopeParts.map((p) => ({ ...p, label: labels[p.key], value: kmOf(p.share, dMax) }))} className="sig-keys" />
      )}
    </div>
  );
}
