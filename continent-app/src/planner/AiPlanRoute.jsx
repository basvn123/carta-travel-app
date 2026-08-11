import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { TripMap } from '../map/TripMap.jsx';
import { fetchWalkingRoute } from '../lib/routing.js';
import { PoiThumb } from './DayActivityRows.jsx';
import { MapPinIcon, TicketIcon, SparkIcon } from '../components/Icons.jsx';

// A preview map is a few hundred pixels tall, so it cannot afford the framing
// margins the full-screen map uses (there is no bottom sheet to clear here).
// The top is the exception: padding positions the stop's COORDINATE, while its
// pin is drawn 37px above that and a decluttered pin lifts further still, so a
// tight top margin decapitates the northernmost stop of the day.
// Module scope keeps the identity stable, otherwise TripMap would re-frame on
// every render and the map would drift while you read the list.
const PREVIEW_PAD = { top: 54, left: 28, right: 28, bottom: 30 };

const plottable = (s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lon);

/**
 * A proposed day, as a route you can look at rather than a list you have to
 * imagine.
 *
 * The map above the stops is the same one the plan lands on when imported:
 * numbered pins in the bot's visiting order, joined by the real walking route
 * OSRM returns for those points. It answers the question the text alone cannot,
 * which is whether the day is actually a shape, one neighbourhood walked
 * through, or three corners of the city stitched together.
 *
 * Row and pin are one thing: tapping either selects both, and the map eases to
 * the stop. The numbers on the thumbnails are what makes that link legible
 * before anything is tapped at all.
 *
 * Presentational, and shared by both places a proposal appears (the day
 * planner's dialog and the chat planner's transcript). Nothing here imports
 * anything: the proposal is still only a proposal.
 *
 *   stops   the plan's stops, in order, carrying { name, lat, lon, why, img,
 *           cat, external, isEvent, walkMinFromPrev }
 *   phases  sparse macro-block label keys (Morning / Midday / ...), by index
 */
export function AiPlanRoute({ stops, phases = [] }) {
  const { t } = useI18n();
  const [sel, setSel] = useState(null);
  const [route, setRoute] = useState(null);

  // The stops the map can actually draw, each keeping the number of its place
  // in the DAY. A stop the router cannot plot must never renumber the ones it
  // can, or the list and the map stop agreeing about which stop is stop 4.
  const plotted = useMemo(() => (stops || [])
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => plottable(s)), [stops]);

  const pins = useMemo(() => plotted.map(({ s, i }) => ({
    lat: s.lat, lon: s.lon, city: s.name, no: i + 1,
  })), [plotted]);

  // Street-following walking route through the proposal, so the preview shows
  // the walk as it would be walked. While it loads (or if the router has no
  // answer) TripMap falls back to straight hops on its own.
  const routeKey = pins.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join(';');
  useEffect(() => {
    let alive = true;
    setRoute(null);
    if (pins.length < 2) return undefined;
    fetchWalkingRoute(pins).then((r) => { if (alive) setRoute(r); });
    return () => { alive = false; };
  }, [routeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // TripMap indexes its pins, the list indexes the day. Translate both ways.
  const selPin = sel == null ? null : plotted.findIndex((p) => p.i === sel);
  const focus = pins.length ? { lat: pins[0].lat, lon: pins[0].lon, zoom: 13.5 } : null;

  return (
    <div className="ai-route">
      {pins.length >= 2 && (
        <div className="ai-route-map">
          <TripMap
            stops={pins}
            padBottom={20}
            routeGeometry={route?.geometry || null}
            routeSegments={route?.segments || null}
            focus={focus}
            selectedIndex={selPin >= 0 ? selPin : null}
            onSelectStop={(pinIdx) => {
              const hit = plotted[pinIdx];
              setSel((cur) => (hit && cur === hit.i ? null : hit?.i ?? null));
            }}
            fitPadding={PREVIEW_PAD}
            fitMaxZoom={15.5}
            scrollZoom={false}
            easeToSelected={false}
          />
        </div>
      )}

      <ol className="ai-sched">
        {(stops || []).map((s, i) => {
          const canShow = plottable(s);
          const body = (
            <>
              <span className="ai-sched-thumb">
                <PoiThumb
                  img={s.img}
                  cat={s.cat}
                  name={s.name}
                  Glyph={s.external ? SparkIcon : undefined}
                />
                <span className="ai-sched-no">{i + 1}</span>
              </span>
              <span className="ai-sched-body">
                <b>
                  {s.name}
                  {s.isEvent ? (
                    <span className="ai-disc-tag ai-event-tag"><TicketIcon size={9} /> {t('ai.eventTag')}</span>
                  ) : s.external ? (
                    <span className="ai-disc-tag"><MapPinIcon size={9} /> {t('ai.discovery')}</span>
                  ) : null}
                </b>
                {s.why && <small>{s.why}</small>}
                {i > 0 && s.walkMinFromPrev > 0 && (
                  <small className="ai-sched-walk">{t('ai.walkLeg', { min: s.walkMinFromPrev })}</small>
                )}
              </span>
            </>
          );
          return (
            <li
              key={i}
              className={`ai-sched-stop${s.external ? ' ext' : ''}${sel === i ? ' on' : ''}`}
            >
              <span className="ai-sched-time">{phases[i] ? t(phases[i]) : ''}</span>
              {canShow ? (
                <button
                  type="button"
                  className="ai-sched-main"
                  onClick={() => setSel((cur) => (cur === i ? null : i))}
                  aria-pressed={sel === i}
                  title={t('ai.showOnMap', { name: s.name })}
                >
                  {body}
                </button>
              ) : (
                <span className="ai-sched-main">{body}</span>
              )}
            </li>
          );
        })}
      </ol>
      {pins.length >= 2 && <p className="ai-route-hint">{t('ai.mapHint')}</p>}
    </div>
  );
}
