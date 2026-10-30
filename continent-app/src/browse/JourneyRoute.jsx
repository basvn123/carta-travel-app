import React, { useMemo } from 'react';
import { TrainIcon, CarIcon, BusIcon, FerryIcon, BikeIcon, BootIcon, RouteIcon } from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { stripDashes } from '../lib/format.js';
import { WeekClimb } from './TripWeek.jsx';
import { PSection } from './PageTemplate.jsx';

const TripDayMap = React.lazy(() => import('./TripDayMap.jsx'));

/**
 * The trip page's Route section (T913, the place and trip template of the
 * owner's approved spec, 2026-10-30; this file held the week's climb and
 * surface figures, T174, which no page drew any more).
 *
 *   the map    one numbered pin a night from the trip's dayPlaces
 *              (TripDayMap), the chosen day the brown one
 *   the legs   each move from one base to the next, with its day and, when
 *              the day's written figures name it, the way and the time
 *              ("Train 2 h", from itinerary[].dayStats); nothing is made up
 *   the climb  the week's climb chart on walking, running and riding weeks
 *
 * With none of the three the section is not drawn, and the jump bar's Route
 * link goes with it.
 */

const MODE_WORDS = [
  [/^(train|rail|linha|railway)/i, TrainIcon],
  [/^(car|drive|driver|taxi|rental)/i, CarIcon],
  [/^(bus|coach)/i, BusIcon],
  [/^(ferry|boat|rabelo|catamaran)/i, FerryIcon],
  [/^(flight|fly|plane)/i, PlaneIcon],
  [/^(bike|cycle|ride)/i, BikeIcon],
  [/^(walk|hike|on foot|trek)/i, BootIcon],
];

/** The bases in order: consecutive nights in one place are one stop. */
export function routeStops(places) {
  const out = [];
  for (const p of places || []) {
    if (!p?.name) continue;
    const last = out[out.length - 1];
    if (last && last.name === p.name) { last.days.push(p.day); continue; }
    out.push({ name: p.name, lat: p.lat, lon: p.lon, days: [p.day] });
  }
  return out;
}

/** The way a day moves, from its written figures ("Train, 2 h" before its price):
 *  the first part when it names a way, without its price. */
function dayMove(day) {
  const first = String(day?.dayStats || '').split(/\s\/\s/)[0]?.trim() || '';
  const hit = MODE_WORDS.find(([re]) => re.test(first));
  if (!hit) return null;
  const text = stripDashes(first)
    .replace(/[\u20AC$\u00A3]\s?[\d.,]+(\s*to\s*[\u20AC$\u00A3]?\s?[\d.,]+)?/g, '')
    .replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '');
  return text ? { Icon: hit[1], text } : null;
}

export function JourneyRoute({
  trip, t, itinerary, stats, sel = null, onPick, chart = false, map = true, relief = false,
}) {
  const stops = useMemo(() => routeStops(trip?.dayPlaces), [trip]);
  const legs = useMemo(() => stops.slice(1).map((to, i) => {
    const from = stops[i];
    const day = (itinerary || []).find((d) => d.day === to.days[0]) || null;
    return { key: `${i}:${to.name}`, n: i + 1, from: from.name, to: to.name, day: to.days[0], move: dayMove(day) };
  }), [stops, itinerary]);
  const hasMap = map && stops.some((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));
  const hasChart = chart && (stats?.days || []).some((d) => d && (d.up > 0 || d.km > 0));
  if (!hasMap && !legs.length && !hasChart) return null;
  return (
    <PSection id="pt-route" title={t('jx.jump.route')}
      note={stops.length > 1 ? t('jx.routeStops', { n: stops.length }) : null}>
      {(hasMap || legs.length > 0) && (
        <div className={`pt-see${hasMap ? ' has-map' : ''}`}>
          {hasMap && (
            <div className="pt-mapbox">
              <React.Suspense fallback={<div className="dsk-map-frame" />}>
                <TripDayMap places={trip.dayPlaces} sel={sel} onPick={onPick} relief={relief}
                  label={t('journey.mapAria', { name: trip.title })} />
              </React.Suspense>
            </div>
          )}
          {legs.length > 0 && (
            <ol className="pt-legs">
              {legs.map((l) => {
                const Icon = l.move?.Icon || RouteIcon;
                return (
                  <li key={l.key}>
                    <span className="pt-num" aria-hidden="true">{l.n}</span>
                    <span className="pt-leg-main">
                      <b>{t('jx.legFromTo', { from: l.from, to: l.to })}</b>
                      <small>{t('journey.dayN', { n: l.day })}</small>
                    </span>
                    {l.move && (
                      <span className="pt-leg-mode">
                        <Icon size={14} />
                        <span>{l.move.text}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
      {hasChart && <WeekClimb days={stats.days} sel={sel} onPick={onPick} />}
    </PSection>
  );
}
