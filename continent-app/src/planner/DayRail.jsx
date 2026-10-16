import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useSettings } from '../components/SettingsLine.jsx';
import { useLifestyleLabel } from './planHooks.js';
import { Button, Money } from '../components/ui/index.js';
import { ChevronRightIcon } from '../components/Icons.jsx';
import { fmtDate } from '../lib/dates.js';
import { fmtClockLoose } from './daySchedule.js';
import { fmtKm } from './dayFormat.js';

/**
 * The day planner's "Your trip" card (T459).
 *
 * The trip planner keeps one card beside every step: what the trip costs a
 * person, then its inputs (dates, people, Lifestyle), each changeable where it
 * stands. The owner asked for the day planner's structure to be that one, so
 * this is the same card, on the same classes (.plan-total, 67-v6-tripplanner),
 * with the day's own figure: what a day at the start costs one person at the
 * traveller's Lifestyle, the computeCosts() figure the planned day prints.
 *
 * On the Places step it also holds the days the picks make, said lean: a line
 * per day, the places in the order they will be walked, and when the day is
 * done. A place comes off by tapping its card again, so there is nothing to
 * edit here (owner: the per-row controls were not needed).
 *
 *   figure     { eur, est } a day here for one person, or null
 *   rows       [{ key, label, value }] the answers that shape the day
 *   days       the builder's preview ([{ no, date, town, destId, clock }]), or null
 *   onTownDay  (destId) shows that town's places, for a day with none yet
 *   footer     the card's last word (the Carta hand-off on Places)
 *   empty      nothing answered yet: the card says what it will hold
 */
export function DayRail({ figure = null, rows = [], days = null, onTownDay = null, footer = null, empty = false }) {
  const { t, lang } = useI18n();
  const settings = useSettings();
  const lifestyle = useLifestyleLabel();
  const towns = new Set((days || []).map((d) => d.destId));
  const picked = (days || []).reduce((n, d) => n + (d.clock?.rows?.length || 0), 0);

  return (
    <section className="plan-total plan-total-rail dayr" aria-labelledby="dayr-h">
      <header className="plan-total-head">
        <h2 className="plan-total-title" id="dayr-h">{t('dayr.title')}</h2>
        {figure && Number.isFinite(figure.eur) && (
          <p className="plan-total-fig">
            <span className="plan-total-n"><Money value={figure.eur} est={figure.est} /></span>
            <span className="plan-total-pp">{t('dayws.costLabel')}</span>
          </p>
        )}
        {empty && <p className="plan-total-empty">{t('dayr.before')}</p>}
      </header>

      <dl className="plan-total-inputs">
        {rows.filter((r) => r.value).map((r) => (
          <div className="plan-input" key={r.key}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
        {settings?.openLifestyle && (
          <div className="plan-input">
            <dt>{t('settings.lifestyle')}</dt>
            <dd>
              <Button variant="quiet" size="sm" className="plan-input-btn" onClick={settings.openLifestyle}
                iconEnd={<ChevronRightIcon size={16} />}>
                {lifestyle}
              </Button>
            </dd>
          </div>
        )}
      </dl>

      {days && (
        <div className="dayr-days-wrap">
          {picked === 0 && towns.size <= 1 ? (
            <p className="plan-total-empty">{t('dayr.empty')}</p>
          ) : (
            <ol className="dayr-days">
              {days.map((d) => (
                <li className="dayr-day" key={`${d.si}:${d.di}`}>
                  <p className="dayr-day-h">
                    <b>{t('itin.dayN', { n: d.no })}</b>
                    <span>{[d.date ? fmtDate(d.date, true) : '', towns.size > 1 ? d.town : ''].filter(Boolean).join(', ')}</span>
                  </p>
                  {d.clock.rows.length ? (
                    <>
                      <ol className="dayr-places">
                        {d.clock.rows.map((r) => <li key={r.key || `${r.destId}:${r.idx}`}>{r.name}</li>)}
                      </ol>
                      <p className="dayr-day-foot">
                        {d.clock.km >= 0.1
                          ? t('dayr.dayDone', { time: fmtClockLoose(d.clock.endMin), km: fmtKm(d.clock.km, lang) })
                          : t('dayr.dayDoneNear', { time: fmtClockLoose(d.clock.endMin) })}
                      </p>
                    </>
                  ) : onTownDay && d.destId ? (
                    <Button variant="quiet" size="sm" className="dayr-day-empty" onClick={() => onTownDay(d.destId)}>
                      {t('dayr.pickIn', { town: d.town })}
                    </Button>
                  ) : (
                    <p className="dayr-day-foot">{t('dayr.dayFree')}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {footer}
    </section>
  );
}
