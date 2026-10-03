import React, { useMemo } from 'react';
import { Fold } from './Fold.jsx';
import { WeekProfile, MixBar, TrafficBar } from './RouteFigures.jsx';
import {
  weekRelief, surfaceMix, trafficSplit, SURFACE_TYPES,
} from '../lib/routeFigures.js';
import { count } from '../lib/format.js';
import { MountainIcon } from '../components/Icons.jsx';

/**
 * The route figures of a written week (T174, trips spec E3 and E4): the
 * climb and descent of every day as one profile on hiking, trail running and
 * cycling weeks, and on cycling weeks the surface split as a bar with the
 * traffic exposure beside it.
 *
 * Drawn with the same components as the trail and cycling pages
 * (RouteFigures.jsx), read by lib/routeFigures.js from the trip as written.
 * Renders nothing on any other style, or when the week states too little to
 * draw: the data sheet keeps the authored surface sentence either way.
 */

const pct = (v) => `${Math.round(v * 100)}%`;

function reliefSentences(relief, t) {
  const { days, top } = relief;
  const out = [];
  if (top?.up > 0) {
    out.push(t('journey.reliefSum', {
      up: count(relief.up), n: days.length, day: top.day, top: count(top.up),
    }));
  }
  if (relief.downDays === 0) out.push(t('journey.reliefDownNone'));
  else if (relief.downDays === relief.moving) out.push(t('journey.reliefDownAll', { down: count(relief.down) }));
  else out.push(t('journey.reliefDown', { down: count(relief.down), k: relief.downDays, n: relief.moving }));
  if (relief.upMissing > 0) out.push(t('journey.reliefGaps', { k: relief.upMissing, n: relief.moving }));
  return out.join(' ');
}

export function JourneyRoute({ trip, open, onToggle, t }) {
  const relief = useMemo(() => weekRelief(trip), [trip]);
  const mix = useMemo(
    () => (SURFACE_TYPES.has(trip?.tripTypeSlug) ? surfaceMix(trip?.typeSpecific?.surface) : null),
    [trip],
  );
  const traffic = useMemo(() => trafficSplit(mix), [mix]);
  if (!relief.show && !mix) return null;
  // Below one half placed, a bar would be mostly a question mark.
  const showTraffic = traffic && traffic.known >= 0.5;

  const title = relief.show
    ? t(mix ? 'journey.routeHeadRide' : 'journey.routeHeadClimb')
    : t('journey.routeHeadSurface');
  const lead = mix?.find((s) => s.tone !== 'unknown');
  const summary = relief.show
    ? t('journey.reliefSummary', { up: count(relief.up) })
    : lead && `${pct(lead.share)} ${lead.label.toLowerCase()}`;

  return (
    <Fold
      id="sec-route"
      icon={MountainIcon}
      title={title}
      summary={summary}
      open={open}
      onToggle={onToggle}
      className="jpage-route"
    >
      {relief.show && (
        <>
          <p className="bpage-prose">{reliefSentences(relief, t)}</p>
          <WeekProfile relief={relief} t={t} />
          <p className="bpage-note">{t('journey.reliefNote')}</p>
        </>
      )}
      {mix && (
        <>
          <h3 className="jroute-h">{t('route.surfaceTitle')}</h3>
          <MixBar
            testId="journey-surface"
            parts={mix.map((s) => ({
              key: s.key, tone: s.tone, share: s.share,
              label: s.label || t('journey.surfNotSplit'),
            }))}
          />
          <h3 className="jroute-h">
            {t('journey.trafficHead')}
            {showTraffic && (
              <sup className="jpage-est mono" aria-label={t('journey.trafficEstAria')} title={t('journey.trafficEstAria')}>
                {t('journey.estMark')}
              </sup>
            )}
          </h3>
          {showTraffic ? (
            <TrafficBar split={traffic} t={t} testId="journey-traffic" />
          ) : (
            <p className="bpage-prose">{t('journey.trafficUnstated')}</p>
          )}
          <p className="bpage-note">{t('journey.trafficNote')}</p>
        </>
      )}
    </Fold>
  );
}
