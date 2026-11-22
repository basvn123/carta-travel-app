import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../i18n/index.jsx';
import { NAME_OF, stateOf } from './plateData.js';
import { Pressable } from '../../../components/ui/Pressable.jsx';
import { CountryFlag } from '../../../components/CountryFlag.jsx';
import { countryName } from '../../../lib/countryName.js';
import { clampFrame, frame, keepMarks, viewBoxOf } from './project.js';
import { WHOLE } from './layers.js';

/**
 * The map: land you have not been to one flat grey, been in umber, the next
 * trip hatched in umber, a saved country a small umber dot; borders are
 * hairline gaps, no labels. A tap names the country under the map.
 *
 * G12 overlays (all optional, the plain map is unchanged without them):
 *   viewBox      the part of the plate to show (atlas/project.js frame)
 *   classOf(cc)  extra classes per country (the year ramp, the year filter)
 *   hatchW       the hatch's period in plate units, so it stays 6 px on screen
 *   dotR         the radius of a small country's dot in plate units
 *   showSaved    false leaves out the saved-country pins
 *   className, preserveAspectRatio, children (drawn over the countries)
 */
export function EuropeMap({
  geo, been, next, saved, label, picked, onPick,
  viewBox, classOf, hatchW = 9, dotR = 7, showSaved = true, className = '', preserveAspectRatio, children,
}) {
  const pid = useId().replace(/:/g, '');
  if (!geo) return <div className={`mt-eumap is-loading ${className}`} aria-hidden="true" />;
  const pick = (cc) => (e) => { e.stopPropagation(); onPick?.(cc === picked ? '' : cc); };
  const cls = (c) => (classOf ? ` ${classOf(c.cc) || ''}` : '');
  return (
    <svg
      className={`mt-eumap ${className}`}
      viewBox={viewBox || `0 0 ${geo.w} ${geo.h}`}
      preserveAspectRatio={preserveAspectRatio}
      role="img"
      aria-label={label}
      onClick={() => onPick?.('')}
    >
      <defs>
        <pattern id={`${pid}-hatch`} width={hatchW} height={hatchW} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={hatchW} height={hatchW} className="mt-eumap-hatch-bg" />
          <rect width={hatchW * 0.4} height={hatchW} className="mt-eumap-hatch" />
        </pattern>
      </defs>
      <path className="mt-eumap-context" d={geo.context} />
      {geo.countries.map((c) => {
        const st = stateOf(c.cc, been, next, saved);
        return (
          <path
            key={c.cc}
            className={`mt-eumap-land is-${st}${picked === c.cc ? ' is-picked' : ''}${cls(c)}`}
            d={c.d}
            style={st === 'next' ? { fill: `url(#${pid}-hatch)` } : undefined}
            onClick={pick(c.cc)}
          />
        );
      })}
      {geo.countries.filter((c) => c.dot).map((c) => (
        <circle key={`dot-${c.cc}`} className={`mt-eumap-dot is-${stateOf(c.cc, been, next, saved)}${picked === c.cc ? ' is-picked' : ''}${cls(c)}`}
          cx={c.x} cy={c.y} r={dotR} onClick={pick(c.cc)} />
      ))}
      {showSaved && geo.countries.filter((c) => !c.dot && stateOf(c.cc, been, next, saved) === 'saved').map((c) => (
        <circle key={`saved-${c.cc}`} className="mt-eumap-pin" cx={c.x} cy={c.y} r="11" onClick={pick(c.cc)} />
      ))}
      {children}
    </svg>
  );
}

/** The picked country under the map: its name, and the hand mark (T972)
 *  unless a finished trip put it on the record. */
export function CountryPick({ picked, state, canToggle, onToggle }) {
  const { t } = useI18n();
  return (
    <p className="mt-atlas-pick" aria-live="polite">
      {picked && (
        <span className="mt-atlas-pill">
          <CountryFlag country={NAME_OF[picked] || picked} size={14} />
          <b>{countryName(picked, NAME_OF[picked] || picked)}</b>
          {canToggle ? (
            <Pressable haptic="tick" className={`mt-atlas-toggle${state === 'been' ? ' is-on' : ''}`} onClick={() => onToggle(picked)}>
              {state === 'been' ? t('mt.unmarkCountry') : t('mt.markBeen')}
            </Pressable>
          ) : (
            <span className={`is-${state}`}>{t(`mt.state.${state}`)}</span>
          )}
        </span>
      )}
    </p>
  );
}

const pct = (vb, x, y) => ({ left: `${(((x - vb.x) / vb.w) * 100).toFixed(2)}%`, top: `${(((y - vb.y) / vb.h) * 100).toFixed(2)}%` });
const pathOf = (pts) => `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}`;
const EMPTY = new Set();
const WHOLE_LAYER = { whole: true };

/**
 * The light plate My trips draws on (G12, Phase B): Explore's land, sea and
 * borders (BASEMAP_COLOURS), the countries been to on an umber ramp by
 * first-visit year, the next country hatched, routes with a white casing,
 * stops, the blaze for "here", the four corners and HTML labels (never SVG
 * text, so they stay 12 px at every size). It fills its slot and frames
 * itself to the slot's own shape, never closer than about four countries.
 *
 *   layer     from atlas/layers.js (tripsLayer or europeLayer)
 *   year      the year filter: countries and routes of other years dim
 *   drawKey   changes on a tab switch only; the routes draw in then and
 *             never at first paint (reduced motion shows the end state)
 *   cornerT   { n, s, e, w } the compass letters
 *   children  what floats on the map (the count chip)
 *   zoom      { z, cx, cy } (Saved): z > 1 shows 1/z of the frame around
 *             cx, cy (plate units), kept inside the unzoomed frame; the
 *             strokes and labels stay their screen size since k follows it
 *   overlay(vb, k)  HTML drawn over the plate on the shown frame (Saved pins)
 */
export function AtlasPlate({
  geo, layer, been = EMPTY, next = EMPTY, label, year = null, drawKey = 0, picked, onPick, cornerT = {}, zoom = null, overlay = null, children,
}) {
  const box = useRef(null);
  const [size, setSize] = useState(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const read = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize((s) => (s && s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const L = layer || WHOLE_LAYER;
  const w = size?.w || 390;
  const h = size?.h || 250;
  const base = useMemo(() => {
    const f = clampFrame(L.whole || !L.focus?.length
      ? frame(WHOLE, w / h, { minW: 400, pad: 0 })
      : frame(L.focus, w / h, { minW: Math.max(220, L.minW ?? (w > 500 ? 560 : 320)), pad: L.pad ?? 0.25 }), geo?.w, geo?.h);
    // Each extreme ring (7 px) and its letter (14 px out, about 11 px half size)
    // must show whole, so the frame slides to hold them.
    const u = f.w / w;
    const marks = (L.corners || []).map((c) => {
      const lx = c.x + c.dx * u; const ly = c.y + c.dy * u;
      return {
        x0: Math.min(c.x - 10 * u, lx - 12 * u), x1: Math.max(c.x + 10 * u, lx + 12 * u),
        y0: Math.min(c.y - 10 * u, ly - 11 * u), y1: Math.max(c.y + 10 * u, ly + 11 * u),
      };
    });
    return keepMarks(f, marks, geo?.w, geo?.h);
  }, [L, w, h, geo]);
  const vb = useMemo(() => {
    if (!zoom || !(zoom.z > 1)) return base;
    const zw = base.w / zoom.z;
    const zh = base.h / zoom.z;
    const cx = zoom.cx ?? base.x + base.w / 2;
    const cy = zoom.cy ?? base.y + base.h / 2;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    return { x: clamp(cx - zw / 2, base.x, base.x + base.w - zw), y: clamp(cy - zh / 2, base.y, base.y + base.h - zh), w: zw, h: zh };
  }, [base, zoom]);
  const k = vb.w / w;
  const ramp = L.ramp || {};
  const classOf = (cc) => {
    if (L.hand?.has(cc)) return 'is-hand';
    const y = L.firstYear?.[cc];
    if (y == null) return '';
    if (year != null && !L.visits?.[cc]?.has(year)) return 'is-off';
    return `is-r${ramp[y] ?? 0}`;
  };
  const dimmed = (y) => year != null && y != null && y !== year;
  const pid = useId().replace(/:/g, '');

  return (
    <div ref={box} className={`atlas-plate${drawKey ? ' is-draw' : ''}`}>
      <EuropeMap
        geo={geo}
        been={been}
        next={next}
        saved={EMPTY}
        showSaved={false}
        label={label}
        picked={picked}
        onPick={onPick}
        viewBox={viewBoxOf(vb)}
        preserveAspectRatio="xMidYMid slice"
        classOf={classOf}
        hatchW={6 * k}
        dotR={3.4 * k}
        className={onPick ? 'is-tappable' : ''}
      >
        {size && (
          <g key={drawKey} className="atlas-overlay">
            {(L.routes || []).map((r, i) => {
              const d = pathOf(r.pts);
              // G12 atlas: on Today the legs travelled are thick, the legs to come thin and dashed.
              const lw = (r.kind === 'past' || r.kind === 'ahead' ? 2 : r.kind === 'done' ? 4 : 3) * k;
              return (
                <React.Fragment key={r.id || i}>
                  <mask id={`${pid}r${i}`} maskUnits="userSpaceOnUse" x={vb.x} y={vb.y} width={vb.w} height={vb.h}>
                    <path className="atlas-mk" d={d} pathLength="1" strokeWidth={16 * k} />
                  </mask>
                  <g className={`atlas-route is-${r.kind || 'next'}${dimmed(r.year) || (L.lift && L.lift !== r.id) ? ' is-dim' : ''}${L.lift === r.id ? ' is-lift' : ''}`} mask={`url(#${pid}r${i})`}>
                    <path className="atlas-route-case" d={d} strokeWidth={lw + 2.6 * k} />
                    <path className="atlas-route-line" d={d} strokeWidth={lw} strokeDasharray={r.kind === 'ahead' ? `${4 * k} ${5 * k}` : undefined} />
                  </g>
                </React.Fragment>
              );
            })}
            {(L.stops || []).map((s, i) => (
              <circle
                key={i}
                className={`atlas-stop${s.big ? ' is-big' : ''}${s.sun ? ' is-sun' : ''}${dimmed(s.year) ? ' is-dim' : ''}`}
                cx={s.x}
                cy={s.y}
                r={(s.big ? 5.6 : 3.6) * k}
              />
            ))}
            {L.here && (
              <g className="atlas-here">
                <circle className="atlas-here-halo" cx={L.here[0]} cy={L.here[1]} r={10 * k} />
                <circle className="atlas-here-dot" cx={L.here[0]} cy={L.here[1]} r={5.5 * k} />
              </g>
            )}
            {(L.corners || []).map((c) => (
              <circle key={`c-${c.key}`} className="atlas-corner-ring" cx={c.x} cy={c.y} r={7 * k} />
            ))}
          </g>
        )}
      </EuropeMap>
      {size && (
        <div className="atlas-labels" aria-hidden="true">
          {(L.labels || []).map((l) => (
            <span key={`l-${l.t}`} className="atlas-ml atlas-ml-name" style={pct(vb, l.x, l.y - 6 * k)}>{l.t}</span>
          ))}
          {(L.corners || []).map((c) => (
            <span key={`ct-${c.key}`} className="atlas-ml atlas-ml-corner" style={pct(vb, c.x + c.dx * k, c.y + c.dy * k)}>{cornerT[c.key] || c.key.toUpperCase()}</span>
          ))}
        </div>
      )}
      {size && overlay?.(vb, k)}
      {children}
    </div>
  );
}
