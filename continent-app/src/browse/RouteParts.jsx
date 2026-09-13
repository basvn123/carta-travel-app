import React from 'react';
import { ChevronRightIcon } from '../components/Icons.jsx';

/**
 * The three things ROUTES.md R7 asks a route page for that neither
 * TrailPage nor CyclePage had: what is underfoot, what the stages of a path
 * are, and which of our own towns you could sleep in along the way.
 *
 * Shared rather than duplicated, because a walk and a ride answer all three
 * the same way and the two pages have already drifted apart once. Each
 * component renders NOTHING when its data is absent, so a wire published
 * before these keys existed simply shows the page it always showed.
 */

const pct = (v) => `${Math.round(v * 100)}%`;

// The order the bar stacks in, hardest ground last, with the unknown share
// always at the end where it cannot be mistaken for a measurement.
const SURFACE_ORDER = ['paved', 'gravel', 'path', 'other', 'unknown'];
const SURFACE_KEY = {
  paved: 'route.surfPaved', gravel: 'route.surfGravel', path: 'route.surfPath',
  other: 'route.surfOther', unknown: 'route.surfUnknown',
};

/**
 * Surface as one stacked bar. `sf` is route_schema.surface_summary: five
 * shares that sum to 1, where `unknown` is the share of the line no mapper
 * has tagged. ROUTES.md is explicit that the unknown share stays visible:
 * hiding it would turn "nobody has said" into "it is fine".
 */
export function SurfaceBar({ sf, t }) {
  if (!sf) return null;
  const parts = SURFACE_ORDER
    .map((k) => [k, Number(sf[k]) || 0])
    .filter(([, v]) => v > 0.005);
  if (!parts.length) return null;
  return (
    <div className="rsurf" data-testid="route-surface">
      <div className="rsurf-bar" role="img"
        aria-label={parts.map(([k, v]) => `${t(SURFACE_KEY[k])} ${pct(v)}`).join(', ')}>
        {parts.map(([k, v]) => (
          <span key={k} className={`rsurf-seg is-${k}`} style={{ width: pct(v) }} />
        ))}
      </div>
      <ul className="rsurf-keys">
        {parts.map(([k, v]) => (
          <li key={k}>
            <span className={`rsurf-dot is-${k}`} aria-hidden="true" />
            {t(SURFACE_KEY[k])}
            <span className="mono">{pct(v)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The stages of a path, in order, each opening its own page.
 *
 * Only a parent has these. A stage instead gets the line above it, naming
 * the path it belongs to, which is the same relationship read from the other
 * end (R6 names a row for its path; this names a path's pieces).
 */
export function Stages({ stages, t, onOpenRoute }) {
  const rows = (stages || []).filter((s) => s && (s.id || s.osm));
  if (!rows.length) return null;
  return (
    <ol className="rstages" data-testid="route-stages">
      {rows.map((s) => (
        <li key={s.osm || s.id}>
          <button
            type="button"
            className="rstage"
            onClick={() => onOpenRoute?.(s.id)}
            disabled={!onOpenRoute || !s.id}
          >
            <span className="rstage-n mono">{s.i}</span>
            <span className="rstage-name">{s.name || t('route.stageN', { n: s.i })}</span>
            {s.id ? <ChevronRightIcon size={12} /> : (
              <span className="rstage-off">{t('route.stageNotPublished')}</span>
            )}
          </button>
        </li>
      ))}
    </ol>
  );
}

/**
 * "Bases along the route": our own destinations near the line, in the order
 * you would meet them.
 *
 * Ordered by distance ALONG the route rather than by distance from it, so
 * the list reads as an itinerary. The caller supplies both numbers because
 * only it knows the geometry; this renders them.
 */
export function Bases({ bases, t, onSelectDest }) {
  if (!bases?.length) return null;
  return (
    <ul className="rbases" data-testid="route-bases">
      {bases.map((b) => (
        <li key={b.id}>
          <button
            type="button"
            className="rbase"
            onClick={() => onSelectDest?.(b.id)}
            disabled={!onSelectDest}
          >
            <span className="rbase-at mono">{b.alongKm} km</span>
            <span className="rbase-main">
              <span className="rbase-name">{b.city}</span>
              <span className="rbase-sub">
                {t('route.baseOff', { km: b.offKm })}
                {b.country ? ` ${b.country}` : ''}
              </span>
            </span>
            <ChevronRightIcon size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}
