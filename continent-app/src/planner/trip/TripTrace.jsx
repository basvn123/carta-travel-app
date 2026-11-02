import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { BusIcon, FerryIcon, HomeIcon, TrainIcon } from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';

/**
 * The trip drawn on Europe (T1005, owner 2026-11-02: "a better, more
 * insightful map with the full trajectory, a title, clean"). The same
 * public/europe_map.json as My trips' Your Europe (T970): Natural Earth,
 * Lambert azimuthal equal-area at 52N 10E, already SVG paths. The frame
 * below is that file's (pipeline/oneoff/build_europe_map.py: the catalogue's
 * extent padded 2%, 1000 units wide), so a point lands where its country is.
 *
 * Cropped to the trip with room round it: home, the flight there as a
 * dashed arc, the ground between the stops as a line in the stop colour (a
 * flown hop an arc too), the flight home bowed the other way so the two do
 * not sit on each other. The trip's countries are tinted. Labels and marks
 * are HTML over the drawing, so they stay sharp at any crop.
 *
 *   trace  { home, airIn, airOut, stops: [{ lat, lon, city, nights, iso2 }],
 *            hops: [mode between stop i and i + 1], driving }
 */
const R = 6371;
const LON0 = (10 * Math.PI) / 180;
const LAT0 = (52 * Math.PI) / 180;
const MINX = -1758.481338462631;
const MAXY = 2288.2574054579854;
const SCALE = 0.24931956659572943;
const VIEW_W = 1000;
const VIEW_H = 1034.5;
const ASPECT = 1.5;

function project(lat, lon) {
  const lam = (lon * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const k = Math.sqrt(2 / (1 + Math.sin(LAT0) * Math.sin(phi) + Math.cos(LAT0) * Math.cos(phi) * Math.cos(lam - LON0)));
  const x = R * k * Math.cos(phi) * Math.sin(lam - LON0);
  const y = R * k * (Math.cos(LAT0) * Math.sin(phi) - Math.sin(LAT0) * Math.cos(phi) * Math.cos(lam - LON0));
  return [(x - MINX) * SCALE, (MAXY - y) * SCALE];
}

let geoPromise = null;
function useGeo() {
  const [geo, setGeo] = useState(null);
  useEffect(() => {
    let live = true;
    if (!geoPromise) {
      geoPromise = fetch('/europe_map.json')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .catch(() => { geoPromise = null; return null; });
    }
    geoPromise.then((g) => { if (live) setGeo(g); });
    return () => { live = false; };
  }, []);
  return geo;
}

/** The view: the points' box, padded, widened to the card's shape, inside the map. */
function frame(pts) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  let x0 = Math.min(...xs);
  let x1 = Math.max(...xs);
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, (y1 - y0) * ASPECT, 110);
  const padX = span * 0.2;
  let w = Math.max(x1 - x0, span) + padX * 2;
  let h = w / ASPECT;
  if (y1 - y0 + padX * 1.4 > h) { h = y1 - y0 + padX * 1.4; w = h * ASPECT; }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  x0 = Math.min(Math.max(cx - w / 2, 0), Math.max(0, VIEW_W - w));
  y0 = Math.min(Math.max(cy - h / 2, 0), Math.max(0, VIEW_H - h));
  return { x: x0, y: y0, w, h };
}

/** A quadratic arc from a to b bowed to one side, and its point at t. */
function arc(a, b, side = 1) {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const bow = 0.2 * side;
  const c = [mx - dy * bow, my + dx * bow];
  const at = (u) => [
    (1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0],
    (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1],
  ];
  return { d: `M${a[0]} ${a[1]} Q${c[0]} ${c[1]} ${b[0]} ${b[1]}`, at };
}

const MODE_ICON = { train: TrainIcon, bus: BusIcon, ferry: FerryIcon, fly: PlaneIcon };

export function TripTrace({ trace, label }) {
  const { t } = useI18n();
  const geo = useGeo();
  const stops = (trace?.stops || []).filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));
  if (!stops.length) return null;
  const P = (p) => (p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? project(p.lat, p.lon) : null);
  const home = P(trace.home);
  const airIn = trace.driving ? null : P(trace.airIn);
  const airOut = trace.driving ? null : P(trace.airOut);
  const sp = stops.map((s) => project(s.lat, s.lon));
  const all = [home, airIn, airOut, ...sp].filter(Boolean);
  const v = frame(all);
  const pct = (p) => ({ left: `${((p[0] - v.x) / v.w) * 100}%`, top: `${((p[1] - v.y) / v.h) * 100}%` });

  // Where the names sit (beside each mark, to the left near the right edge),
  // so a flight's plane can be put on its arc clear of them.
  const leftOf = (p) => p[0] - v.x > v.w * 0.62;
  const boxes = [home, ...sp].filter(Boolean).map((p) => {
    const wd = v.w * 0.36;
    const x0 = leftOf(p) ? p[0] - wd : p[0] - v.w * 0.04;
    return [x0, p[1] - v.h * 0.09, x0 + wd + v.w * 0.04, p[1] + v.h * 0.09];
  });
  const clear = (q) => boxes.every(([x0, y0, x1, y1]) => q[0] < x0 || q[0] > x1 || q[1] < y0 || q[1] > y1);

  // The lines, in the order the trip goes.
  const near = (a, b) => a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) < v.w * 0.03;
  const lines = [];
  const planes = [];
  const flyLine = (a, b, side, key) => {
    if (!a || !b || near(a, b)) return;
    const g = arc(a, b, side);
    lines.push(<path key={key} d={g.d} className="tt-fly" vectorEffect="non-scaling-stroke" />);
    const u = [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78].find((x) => clear(g.at(x)));
    if (u != null) planes.push({ key, at: g.at(u) });
  };
  const groundLine = (a, b, key, mode = '') => {
    if (!a || !b || near(a, b)) return;
    if (mode === 'fly') { flyLine(a, b, 1, key); return; }
    lines.push(<path key={key} d={`M${a[0]} ${a[1]} L${b[0]} ${b[1]}`} className="tt-ground" vectorEffect="non-scaling-stroke" />);
  };
  if (trace.driving) {
    groundLine(home, sp[0], 'drive-out');
  } else {
    flyLine(home, airIn || sp[0], 1, 'fly-out');
    groundLine(airIn, sp[0], 'in');
  }
  sp.slice(1).forEach((p, i) => groundLine(sp[i], p, `hop-${i}`, trace.hops?.[i] || ''));
  if (trace.driving) {
    groundLine(sp[sp.length - 1], home, 'drive-back');
  } else {
    groundLine(sp[sp.length - 1], airOut, 'out');
    flyLine(airOut || sp[sp.length - 1], home, 1, 'fly-back');
  }

  const tripCountries = new Set(stops.map((s) => s.iso2).filter(Boolean));
  const modes = [...new Set((trace.hops || []).filter((m) => m && m !== 'fly'))];

  return (
    <figure className="tt" aria-label={label}>
      <div className="tt-map" style={{ aspectRatio: `${v.w} / ${v.h}` }}>
        <svg className="tt-svg" viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
          {geo && <path className="tt-context" d={geo.context} />}
          {geo && geo.countries.map((c) => (
            <path key={c.cc} d={c.d} className={`tt-land${tripCountries.has(c.cc) ? ' is-trip' : ''}`} vectorEffect="non-scaling-stroke" />
          ))}
          {lines}
        </svg>
        {planes.map((p) => (
          <span key={p.key} className="tt-plane" style={pct(p.at)} aria-hidden="true"><PlaneIcon size={12} /></span>
        ))}
        {[airIn, airOut].filter(Boolean).filter((a, i, arr) => i === 0 || !near(a, arr[0])).map((a, i) => (
          <span key={`air-${i}`} className="tt-air" style={pct(a)} aria-hidden="true" />
        ))}
        {home && (
          <span className={`tt-pin is-home${leftOf(home) ? ' is-left' : ''}`} style={pct(home)}>
            <span className="tt-dot"><HomeIcon size={12} /></span>
            <span className="tt-label">{trace.home.name}</span>
          </span>
        )}
        {sp.map((p, i) => (
          <span key={`stop-${i}`} className={`tt-pin is-stop${leftOf(p) ? ' is-left' : ''}`} style={pct(p)}>
            <span className="tt-dot">{i + 1}</span>
            <span className="tt-label">
              {stops[i].city}
              <small>{t(stops[i].nights === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n: stops[i].nights })}</small>
            </span>
          </span>
        ))}
      </div>
      <figcaption className="tt-key">
        {!trace.driving && <span className="tt-key-item"><span className="tt-swatch is-fly" aria-hidden="true" />{t('trip.modeFly')}</span>}
        {(modes.length > 0 || trace.driving) && (
          <span className="tt-key-item">
            <span className="tt-swatch is-ground" aria-hidden="true" />
            {(trace.driving ? ['car'] : modes).map((m) => {
              const I = MODE_ICON[m];
              return I ? <I key={m} size={14} aria-hidden="true" /> : null;
            })}
            {(trace.driving ? [t('trip.modeCar')] : modes.map((m) => t(`trip.mode${m[0].toUpperCase()}${m.slice(1)}`))).join(', ')}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
