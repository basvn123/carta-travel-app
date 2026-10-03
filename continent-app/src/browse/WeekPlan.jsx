import React, { useMemo } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Fold } from './Fold.jsx';
import { useFolds } from './useFolds.js';
import { GatewayList } from '../components/FactMeter.jsx';
import { parseGateway } from '../lib/gateway.js';
import { minutesText, boldSegments } from '../lib/journeys.js';
import {
  weekShape, tripEnds, weatherPlan, CONDITION_TYPES,
  LAND_TO_ROAD_MIN, AIRPORT_BEFORE_MIN, LATE_ARRIVAL,
} from '../lib/weekShape.js';
import { RouteIcon, LuggageIcon, RainIcon } from '../components/Icons.jsx';

/**
 * Three modules a traveller plans around and the written days do not show at
 * a glance (T170, spec M2, M3, M5). They sit above the day by day:
 *
 *   How the week runs   one strip: where you sleep each night, where you
 *                       change beds, and how hard each day is
 *   Arrive and leave    day zero and the day after the last: the airports,
 *                       the latest sensible landing, what to collect and give
 *                       back, the run to the airport, the bags
 *   The weather         a named fallback per day; on winter and water trips
 *                       the days regrouped by the conditions they need
 *
 * Everything comes from src/lib/weekShape.js, which reads the trip as written
 * and returns null where the trip does not say. This file only lays it out.
 * The folds keep their own open set (the page's set is the page's), reset per
 * trip the same way.
 */

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function Text({ text }) {
  return boldSegments(text).map((seg, i) => (seg.bold
    ? <b key={i}>{seg.text}</b>
    : <React.Fragment key={i}>{seg.text}</React.Fragment>));
}

const LEVEL_KEY = ['journey.weekLevel0', 'journey.weekLevel1', 'journey.weekLevel2', 'journey.weekLevel3'];

function count(t, n, one, many, none) {
  if (!n && none) return t(none);
  return n === 1 ? t(one) : t(many, { n });
}

/** The one-sentence reading of the strip: beds first, then effort. */
function shapeSummary(shape, t) {
  const { bases } = shape;
  const parts = [];
  if (bases.source === 'listed') {
    parts.push(t('journey.weekListed', { n: bases.listed.length, places: bases.listed.join(', ') }));
  } else if (bases.runs.length === 1) {
    parts.push(t('journey.weekOneBase', { place: bases.runs[0].label }));
  } else if (bases.runs.length > 1) {
    parts.push(bases.moves === 1
      ? t('journey.weekMovesOne', { bases: bases.runs.length })
      : t('journey.weekMoves', { bases: bases.runs.length, moves: bases.moves }));
  }
  if (shape.measured > 0) {
    const hard = count(t, shape.hard, 'journey.weekHardOne', 'journey.weekHard', 'journey.weekHardNone');
    const rest = shape.rest ? `, ${count(t, shape.rest, 'journey.weekRestOne', 'journey.weekRest')}` : '';
    parts.push(`${hard}${rest}.`);
  }
  return parts.join(' ');
}

function WeekStrip({ shape, t }) {
  const n = shape.days.length;
  const { bases } = shape;
  const unit = shape.days.find((d) => d.unit)?.unit;
  const anyGap = shape.days.some((d) => d.level == null);
  const exitCol = bases.exit && !bases.nights[n - 1] ? n - 1 : -1;
  return (
    <div className="jweek" style={{ '--jweek-days': n }}>
      {shape.measured > 0 && (
        <ol className="jweek-effort" aria-label={t('journey.weekEffortAria')}>
          {shape.days.map((d) => (
            <li
              key={d.day}
              className={`jweek-col lv-${d.level == null ? 'x' : d.level}`}
              title={`${t('journey.dayN', { n: d.day })}: ${d.title}`}
            >
              <span className="jweek-bar" aria-hidden="true" />
              <span className="sr-only">
                {t('journey.weekDayAria', {
                  n: d.day,
                  level: d.level == null ? t('journey.weekUnmeasured') : t(LEVEL_KEY[d.level]),
                })}
              </span>
              {d.rest && <span className="jweek-rest" aria-hidden="true">{t('journey.weekLevel0')}</span>}
            </li>
          ))}
        </ol>
      )}
      <div className="jweek-days mono" aria-hidden="true">
        {shape.days.map((d) => <span key={d.day}>{d.day}</span>)}
      </div>
      {bases.runs.length > 0 && (
        <ol className="jweek-beds" aria-label={t('journey.weekBedsAria')}>
          {bases.runs.map((r, i) => {
            const nights = r.to - r.from + 1;
            const where = nights === 1
              ? t('journey.weekNightOne', { n: r.from + 1, place: r.line })
              : t('journey.weekNights', { from: r.from + 1, to: r.to + 1, place: r.line });
            return (
              <li
                key={`${r.from}-${r.label}`}
                className={`jweek-bed ${i > 0 ? 'is-move' : ''}`}
                style={{ gridColumn: `${r.from + 1} / ${r.to + 2}` }}
                title={where}
              >
                <span className="jweek-bed-name" aria-hidden="true">{r.label}</span>
                <span className="sr-only">{where}</span>
              </li>
            );
          })}
          {exitCol >= 0 && (
            <li className="jweek-bed is-out" style={{ gridColumn: `${exitCol + 1} / ${exitCol + 2}` }}>
              <span className="jweek-bed-name">{t('journey.weekOut')}</span>
            </li>
          )}
        </ol>
      )}
      {shape.measured > 0 && unit && (
        <p className="jweek-key">
          {t(`journey.weekKey.${unit}`)}
          {anyGap ? ` ${t('journey.weekKeyGap')}` : ''}
        </p>
      )}
    </div>
  );
}

function EndsBody({ ends, t }) {
  const { arrive, leave, airports } = ends;
  const rows = airports.map((a) => ({ code: a.code, name: a.name, detail: a.detail }));
  return (
    <div className="jends">
      <article className="jends-side">
        <h3>{t('journey.endsArrive')}</h3>
        <dl>
          {rows.length > 0 && (
            <div className="bpage-fact">
              <dt>{t('journey.endsFly')}</dt>
              <dd><GatewayList rows={rows} /></dd>
            </div>
          )}
          {arrive.landBy && arrive.timed && (
            <div className="bpage-fact">
              <dt>{t('journey.endsLandBy')}</dt>
              <dd>
                <span className="mono">{arrive.landBy}</span>
                <small>
                  {t('journey.endsLandNote', {
                    place: arrive.timed.place,
                    late: hhmm(LATE_ARRIVAL),
                    buffer: minutesText(LAND_TO_ROAD_MIN),
                    transfer: minutesText(arrive.timed.minutes),
                    code: arrive.timed.code,
                  })}
                </small>
              </dd>
            </div>
          )}
          {(arrive.firstNight || arrive.firstBase) && (
            <div className="bpage-fact">
              <dt>{t('journey.endsFirstNight')}</dt>
              <dd>{arrive.firstNight || arrive.firstBase}</dd>
            </div>
          )}
          {arrive.collect ? (
            <div className="bpage-fact">
              <dt>{t('journey.endsCollect')}</dt>
              <dd>
                <Text text={arrive.collect} />
                <small>{t('journey.endsHours')}</small>
              </dd>
            </div>
          ) : arrive.opening && (
            <div className="bpage-fact">
              <dt>{t('journey.endsDayOne')}</dt>
              <dd><Text text={arrive.opening} /></dd>
            </div>
          )}
        </dl>
      </article>

      <article className="jends-side">
        <h3>{t('journey.endsLeave', { n: leave.lastDay })}</h3>
        <dl>
          {(leave.exit || leave.lastBase) && (
            <div className="bpage-fact">
              <dt>{t('journey.endsLastNight')}</dt>
              <dd>
                {leave.exit
                  ? (leave.exit.text || t('journey.endsNoBed', { n: leave.lastDay }))
                  : leave.lastBase}
              </dd>
            </div>
          )}
          {leave.giveBack && (
            <div className="bpage-fact">
              <dt>{t('journey.endsGiveBack')}</dt>
              <dd><Text text={leave.giveBack} /></dd>
            </div>
          )}
          {leave.timed && (
            <div className="bpage-fact">
              <dt>{t('journey.endsToAirport')}</dt>
              <dd>
                <span className="mono">{minutesText(leave.timed.before)}</span>
                <small>
                  {t('journey.endsLeaveNote', {
                    place: leave.timed.place,
                    transfer: minutesText(leave.timed.minutes),
                    code: leave.timed.code,
                    wait: minutesText(AIRPORT_BEFORE_MIN),
                  })}
                </small>
              </dd>
            </div>
          )}
          {!leave.timed && leave.timedElsewhere && leave.lastBase && (
            <div className="bpage-fact">
              <dt>{t('journey.endsToAirport')}</dt>
              <dd>
                {t('journey.endsTimedElsewhere', {
                  code: leave.timedElsewhere.code,
                  place: leave.timedElsewhere.place,
                  last: leave.lastBase,
                })}
              </dd>
            </div>
          )}
          <div className={`bpage-fact ${leave.luggage ? '' : 'bpage-fact-empty'}`}>
            <dt>{t('journey.endsBags')}</dt>
            <dd>{leave.luggage ? <Text text={leave.luggage} /> : t('journey.endsBagsNone')}</dd>
          </div>
        </dl>
      </article>
    </div>
  );
}

const NEED_KEY = {
  wind: 'journey.needWind',
  swell: 'journey.needSwell',
  calm: 'journey.needCalm',
  powder: 'journey.needPowder',
  clear: 'journey.needClear',
  trees: 'journey.needTrees',
  most: 'journey.needMost',
  any: 'journey.needAny',
};

const FALLBACK_KEY = { bail: 'journey.fbBail', weather: 'journey.fbWeather', option: 'journey.fbOption' };

function WeatherBody({ plan, t }) {
  return (
    <>
      {plan.groups && (
        <div className="jwx-groups">
          <h3>{t('journey.wxGroupsHead')}</h3>
          <p className="jwx-hint">
            {t('journey.wxGroupsHint', { first: plan.groups.travel[0].day, last: plan.groups.travel[1].day })}
          </p>
          <dl>
            {plan.groups.options.map((g) => (
              <div key={g.need} className="bpage-fact jwx-group">
                <dt>{t(NEED_KEY[g.need])}</dt>
                <dd>
                  <ul>
                    {g.days.map((d) => (
                      <li key={d.day}>
                        <span className="jwx-n mono">{t('journey.dayN', { n: d.day })}</span>
                        {' '}
                        {d.title}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <h3 className="jwx-sub">{t('journey.wxDaysHead')}</h3>
      <ol className="jwx-days">
        {plan.days.map((d) => (
          <li key={d.day} className={d.fallback || d.swap ? '' : 'is-empty'}>
            <span className="jwx-n mono">{t('journey.dayN', { n: d.day })}</span>
            <div className="jwx-body">
              <span className="jwx-title">{d.title}</span>
              {d.fallback ? (
                <p>
                  <b>{t(FALLBACK_KEY[d.fallback.kind])}</b>
                  {' '}
                  <Text text={d.fallback.text} />
                </p>
              ) : d.swap ? (
                <p>{t('journey.fbSwap', { n: d.swap, title: plan.flex.title })}</p>
              ) : (
                <p>{t('journey.fbNone')}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

export function WeekPlan({ trip }) {
  const { t } = useI18n();
  const shape = useMemo(() => weekShape(trip), [trip]);
  const ends = useMemo(() => tripEnds(trip, parseGateway), [trip]);
  const plan = useMemo(() => weatherPlan(trip), [trip]);
  const conditions = CONDITION_TYPES.has(trip?.tripTypeSlug) && !!plan?.groups;
  // The strip is a glance and opens on arrival; on a winter or water week the
  // forecast plan is how the days are read, so it opens too.
  const { isOpen, toggle } = useFolds(conditions ? ['shape', 'weather'] : ['shape'], trip?.id);

  if (!trip?.itinerary?.length) return null;
  const summary = shape.show ? shapeSummary(shape, t) : '';

  return (
    <>
      {shape.show && (
        <Fold
          id="sec-shape"
          icon={RouteIcon}
          title={t('journey.weekHead')}
          summary={summary}
          open={isOpen('shape')}
          onToggle={() => toggle('shape')}
          className="jpage-shape"
        >
          {summary && <p className="jweek-sum">{summary}</p>}
          <WeekStrip shape={shape} t={t} />
        </Fold>
      )}

      {ends && (
        <Fold
          id="sec-ends"
          icon={LuggageIcon}
          title={t('journey.endsHead')}
          summary={ends.arrive.landBy && ends.arrive.timed
            ? t('journey.endsSummary', { time: ends.arrive.landBy, code: ends.arrive.timed.code })
            : ends.airports.map((a) => a.code).join(', ')}
          open={isOpen('ends')}
          onToggle={() => toggle('ends')}
          className="jpage-ends"
        >
          <EndsBody ends={ends} t={t} />
        </Fold>
      )}

      {plan?.show && (
        <Fold
          id="sec-weather"
          icon={RainIcon}
          title={t(conditions ? 'journey.wxHeadConditions' : 'journey.wxHead')}
          summary={t('journey.wxSummary', { n: plan.covered, m: plan.days.length })}
          open={isOpen('weather')}
          onToggle={() => toggle('weather')}
          className="jpage-weather"
        >
          <WeatherBody plan={plan} t={t} />
        </Fold>
      )}
    </>
  );
}
