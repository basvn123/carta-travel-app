import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { GatewayList } from '../components/FactMeter.jsx';
import { minutesText, boldSegments } from '../lib/journeys.js';
import { LAND_TO_ROAD_MIN, AIRPORT_BEFORE_MIN, LATE_ARRIVAL } from '../lib/weekShape.js';

/**
 * Three modules a traveller plans around and the written days do not show at
 * a glance (T170, spec M2, M3, M5):
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
 *
 * T387 (v6 trips brief, V3.6) took the three out of their own folds: the
 * journey page now has seven groups, and these are blocks inside two of
 * them (the strip and the weather in The week, arrive and leave in Getting
 * there), each under an h3. The page decides where each block goes; this
 * file draws them. Rule "Derived copy stays silent" (V3.8): the weather
 * block renders only when at least one day has a fallback, and no "0 of N"
 * count is ever shown.
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

// sel is the day number in view on the day track and onPick brings a day
// onto the track (T397, brief V4.1): the week shape and the track select
// together. The selected day's bar is the one --accent item in the drawing
// (rule "Data drawings": one committed item at most in --accent).
function WeekStrip({ shape, t, sel = null, onPick = null }) {
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
              className={`jweek-col lv-${d.level == null ? 'x' : d.level}${d.day === sel ? ' is-on' : ''}`}
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
      {onPick ? (
        <div className="jweek-days jweek-picks" role="group" aria-label={t('journey.weekPickAria')}>
          {shape.days.map((d) => (
            <button
              key={d.day}
              type="button"
              className={`jweek-pick mono${d.day === sel ? ' is-on' : ''}`}
              aria-pressed={d.day === sel}
              aria-label={t('journey.weekPickDay', { n: d.day })}
              onClick={() => onPick(d.day)}
            >
              {d.day}
            </button>
          ))}
        </div>
      ) : (
        <div className="jweek-days mono" aria-hidden="true">
          {shape.days.map((d) => <span key={d.day}>{d.day}</span>)}
        </div>
      )}
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
                <span className="sr-only jweek-bed-where">{where}</span>
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
          <h4>{t('journey.wxGroupsHead')}</h4>
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
      <h4 className="jwx-sub">{t('journey.wxDaysHead')}</h4>
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

/** How the week runs: the sentence and the strip. Null when nothing shows. */
export function WeekShapeBlock({ shape, sel = null, onPick = null }) {
  const { t } = useI18n();
  if (!shape?.show) return null;
  const summary = shapeSummary(shape, t);
  return (
    <div className="jblock jpage-shape" id="jb-shape">
      <h3 className="jblock-h">{t('journey.weekHead')}</h3>
      {summary && <p className="jweek-sum">{summary}</p>}
      <WeekStrip shape={shape} t={t} sel={sel} onPick={onPick} />
    </div>
  );
}

/** Arrive and leave, open (it is how the traveller gets there). */
export function EndsBlock({ ends }) {
  const { t } = useI18n();
  if (!ends) return null;
  return (
    <div className="jblock jpage-ends" id="jb-ends">
      <EndsBody ends={ends} t={t} />
    </div>
  );
}

/** If the weather turns. Null unless a day carries a fallback. */
export function WeatherBlock({ plan, conditions, show }) {
  const { t } = useI18n();
  if (!show) return null;
  return (
    <div className="jblock jpage-weather" id="jb-weather">
      <h3 className="jblock-h">{t(conditions ? 'journey.wxHeadConditions' : 'journey.wxHead')}</h3>
      <WeatherBody plan={plan} t={t} />
    </div>
  );
}
