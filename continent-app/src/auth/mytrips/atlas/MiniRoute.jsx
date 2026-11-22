import React, { useMemo } from 'react';
import { project } from './project.js';

/**
 * A past trip without a photo (G12 atlas): a small piece of the plate with
 * the trip's countries filled, its route and its stops, so the row still
 * shows where it went. Decorative; the row names the trip.
 *
 *   geo    the plate (europe_map.json)
 *   trip   { countries: [ISO], stops: [{ lat, lon }] }
 */
export function MiniRoute({ geo, trip }) {
  const pts = useMemo(() => (trip.stops || []).map((s) => project(s.lat, s.lon)).filter(Boolean), [trip]);
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const span = Math.max(140, Math.max(...xs) - Math.min(...xs) + 60, Math.max(...ys) - Math.min(...ys) + 60);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const k = span / 56;
  const own = new Set(trip.countries || []);
  return (
    <svg className="atlas-mini" viewBox={`${cx - span / 2} ${cy - span / 2} ${span} ${span}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect className="atlas-mini-sea" x={cx - span / 2} y={cy - span / 2} width={span} height={span} />
      {geo.countries.map((c) => <path key={c.cc} className={own.has(c.cc) ? 'is-own' : undefined} d={c.d} />)}
      {pts.length > 1 && <path className="atlas-mini-route" d={`M${pts.map((p) => p.join(' ')).join('L')}`} strokeWidth={2 * k} />}
      {pts.map((p, i) => <circle key={i} className="atlas-mini-stop" cx={p[0]} cy={p[1]} r={3 * k} strokeWidth={1.5 * k} />)}
    </svg>
  );
}
