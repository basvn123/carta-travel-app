import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Money } from '../../components/ui/index.js';
import { srcSetFor, thumbAt } from '../../lib/heroImage.js';
import { tabHref } from '../../lib/urlState.js';
import { ROUTE_PHOTO, SLOVENIA, fitProjection, routeTotals, smoothPath } from '../../lib/homeDemo.js';
import { useInView, useReveal } from './useHome.js';

/**
 * The route card (T606, the owner's Komoot reference: "an image which means
 * something"). The story's trip drawn on the country it crosses: Slovenia's
 * outline, a line from Ljubljana to Lake Bled to Lake Bohinj that draws
 * itself once when the card comes into view (stroke-dashoffset, about
 * 1.6 s), each town's pill with its nights and its own day price arriving as
 * the line passes it, and the trip's total a person at the end, beds plus
 * food and drink. A photograph of Bled leans on the map, its credit under
 * the card. The line is geometry, not a picture: the towns sit at their own
 * coordinates; it claims nothing about the road.
 *
 * Without a price for every stop the total pill stays away, so the card
 * never sums a guess. Under reduced motion it is drawn at once.
 *
 * Props
 *   rows    catalogue rows with day costs
 *   places  catalogue destinations (coordinates and names)
 *   door, onNavigate
 */
const W = 640;
const H = 420;

export function HomeRoute({ rows, places, door, onNavigate }) {
  const { t } = useI18n();
  const reveal = useReveal();
  const cardRef = React.useRef(null);
  const drawn = useInView(cardRef, { once: true, threshold: 0.4 });
  const { stops, total, nights, est } = routeTotals(rows);
  const at = (id) => {
    const d = places?.[id];
    if (!d) return null;
    return [d.city_lon ?? d.lon, d.city_lat ?? d.lat];
  };
  const coords = stops.map((s) => at(s.id));
  if (coords.some((c) => !c)) return null;
  // The map frames the trip, not the country: its towns sit some 40 km
  // apart, and on the whole of Slovenia their pills would overlap. The
  // outline runs off the card's edges the way a map crop does.
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const frame = [[Math.min(...lons) - 0.42, Math.min(...lats) - 0.2], [Math.max(...lons) + 0.42, Math.max(...lats) + 0.2]];
  const project = fitProjection(frame, W, H, 0);
  const outline = `${SLOVENIA.map((p, i) => `${i ? 'L' : 'M'}${project(p).map((n) => n.toFixed(1)).join(' ')}`).join(' ')} Z`;
  const pts = coords.map(project);
  const line = smoothPath(pts);

  return (
    <section className="hv-section hv-route" aria-labelledby="hv-route-title" {...reveal}>
      <div className="hv-route-say">
        <h2 id="hv-route-title" className="hv-h2">{t('home.routeTitle')}</h2>
        <p className="hv-lead">{t('home.routeBody')}</p>
        <a className="btn btn-secondary" href={tabHref('trip')} onClick={door(() => onNavigate('trip'))}>
          <span className="btn-label">{t('home.routeDoor')}</span>
        </a>
      </div>
      <figure className={`hv-route-card${drawn ? ' is-drawn' : ''}`} ref={cardRef}>
        <div className="hv-route-map">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('home.routeAlt')}>
            <path className="hv-route-land" d={outline} />
            <path className="hv-route-line-under" d={line} />
            <path className="hv-route-line" d={line} pathLength="1" />
            {pts.map(([x, y], i) => (
              <circle key={stops[i].id} className="hv-route-dot" cx={x} cy={y} r={i === 0 || i === pts.length - 1 ? 7 : 6}
                style={{ '--i': i }} />
            ))}
          </svg>
          {stops.map((s, i) => {
            const [x, y] = pts[i];
            const name = places?.[s.id]?.city || s.id;
            return (
              <span key={s.id} className={`hv-route-pill${y === Math.min(...pts.map((p) => p[1])) ? ' is-up' : ''}`} style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, '--i': i }}>
                <span className="hv-pill-name">{name}</span>
                <span className="hv-pill-unit">{t('home.nightsN', { n: s.nights })}</span>
              </span>
            );
          })}
          {total != null && (
            <span className="hv-route-total" style={{ '--i': stops.length }}>
              <span className="hv-route-total-label">{t('home.routeTotal', { n: nights })}</span>
              <Money value={total} est={est} />
            </span>
          )}
          <span className="hv-route-photo" aria-hidden="true">
            <img src={thumbAt(ROUTE_PHOTO.url, 640)} srcSet={srcSetFor(ROUTE_PHOTO.url, 960)} sizes="260px"
              alt="" loading="lazy" decoding="async" style={{ objectPosition: ROUTE_PHOTO.focus }} />
          </span>
        </div>
        <figcaption className="hv-caption">
          <a href={ROUTE_PHOTO.page} target="_blank" rel="noopener noreferrer">{ROUTE_PHOTO.credit}</a>
          {t('home.photoBy', { who: ROUTE_PHOTO.author, licence: ROUTE_PHOTO.licence })}
        </figcaption>
      </figure>
    </section>
  );
}
