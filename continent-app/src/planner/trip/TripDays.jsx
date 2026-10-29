import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Segmented } from '../../components/ui/index.js';
import { SparkIcon } from '../../components/Icons.jsx';
import { fmtDate } from '../../lib/dates.js';
import { cityLabel } from '../../lib/placeName.js';
import { dayPlaceNames } from './dayNames.js';
import { useTripDayStore } from './useTripDayStore.js';
import { OwnIdeas } from './OwnIdeas.jsx';
import { ideasOnDay } from './ownIdeas.js';
import { DayNote } from './DayNote.jsx';

const SHOWN = 4;

/**
 * The Days tab (T849, owner board panel 9): every day as a card that says
 * what it holds, read from the day planner's own records: the day and its
 * date, where it is (or the day out, T843), the first places planned on it
 * by name (and how many more), the activities routed to it from a booking
 * and the traveller's own ideas put on it (T850, Your ideas above the days).
 * No price on a day (the owner: the "a person" figure can go).
 *
 * A day is planned as loosely or as closely as wanted (T851): a few words
 * of your own (DayNote), or place by place in the day planner ("Plan it
 * myself"); "Let Carta plan the days" at the top plans every empty day. Each
 * day has its own pace (owner D3), which the day planner and Carta's day
 * plans read for that day.
 *
 *   dayPlan    useTripPlanner's days ({ dayNum, stopIndex, dayOfStay, date, stop })
 *   dayTrips   priced.dayTrips
 *   planKey    the trip's plan id, or the draft's
 *   onPlanDay(day), onCartaPlan()
 */
export function TripDays({ dayPlan = [], dayTrips = [], planKey, onPlanDay, onCartaPlan = null }) {
  const { t } = useI18n();
  const dests = dayPlan.map((d) => d.stop?.dest).filter(Boolean);
  const store = useTripDayStore(planKey, dests);
  const { assignments, prefs, extras, fetched, savePrefs } = store;
  // T851 (owner D3): a day's own pace, kept where the day planner reads it.
  const paceOf = (d) => prefs?.dayPace?.[`${d.stopIndex}-${d.dayOfStay - 1}`] || prefs?.pace || 'balanced';
  const setPace = (d, v) => savePrefs({ ...prefs, dayPace: { ...(prefs?.dayPace || {}), [`${d.stopIndex}-${d.dayOfStay - 1}`]: v } });

  return (
    <section className="tpd" aria-labelledby="tpd-h">
      <div className="tpd-head">
        <h2 className="itin-h" id="tpd-h">{t('itin.yourDays')}</h2>
        {onCartaPlan && (
          <Button variant="secondary" size="sm" iconStart={<SparkIcon size={16} />} onClick={onCartaPlan}>{t('tp.days.carta')}</Button>
        )}
      </div>
      <OwnIdeas store={store} dayPlan={dayPlan} />
      <ol className="tpd-list">
        {dayPlan.map((d) => {
          const dest = d.stop?.dest;
          const names = dayPlaceNames({
            dest,
            picks: assignments?.[d.stopIndex]?.[d.dayOfStay - 1],
            fetched,
            customs: prefs?.customPois?.[d.stop?.destinationId] || [],
          });
          const booked = (extras.dayExtras?.[d.dayNum] || []).map((a) => a.name).filter(Boolean);
          const out = dayTrips.find((x) => x.stopIndex === d.stopIndex && x.day === d.dayOfStay);
          const where = out
            ? t('tp.dt.dayTo', { to: cityLabel(out.dest?.city || ''), from: cityLabel(dest?.city || '') })
            : cityLabel(dest?.city || '') || t('itin.unknown');
          // T850: the traveller's own ideas put on this day, after the places.
          const own = ideasOnDay(extras, d.dayNum).map((x) => x.text);
          const all = [...names, ...booked, ...own];
          return (
            <li key={d.dayNum} className={`tpd-day${all.length ? ' is-planned' : ''}`} data-day={d.dayNum}>
              <div className="tpd-day-head">
                <span className="tpd-day-n">{t('itin.dayN', { n: d.dayNum })}</span>
                <span className="tpd-day-meta">
                  <b>{where}</b>
                  {d.date ? <small>{fmtDate(d.date, true)}</small> : null}
                </span>
              </div>
              <DayNote day={d.dayNum} store={store} />
              {all.length > 0 ? (
                <ul className="tpd-places" aria-label={t('tp.days.places', { n: d.dayNum })}>
                  {all.slice(0, SHOWN).map((n, i) => <li key={`${n}-${i}`}>{n}</li>)}
                  {all.length > SHOWN && <li className="tpd-more">{t('tp.days.more', { n: all.length - SHOWN })}</li>}
                </ul>
              ) : !extras.dayNotes?.[d.dayNum] && (
                <p className="tpd-empty">{t('tp.days.empty')}</p>
              )}
              <div className="tpd-pace">
                <Segmented
                  size="sm"
                  label={t('tp.pace.label', { n: d.dayNum })}
                  value={paceOf(d)}
                  onChange={(v) => setPace(d, v)}
                  options={[
                    { value: 'relaxed', label: t('tp.pace.relaxed') },
                    { value: 'balanced', label: t('tp.pace.balanced') },
                    { value: 'packed', label: t('tp.pace.packed') },
                  ]}
                />
              </div>
              <div className="tpd-acts">
                <Button variant={all.length ? 'quiet' : 'secondary'} size="sm" onClick={() => onPlanDay?.(d)}>
                  {t(all.length ? 'tp.days.change' : 'tp.days.myself')}
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
