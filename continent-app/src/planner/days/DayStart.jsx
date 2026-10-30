import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip, Money } from '../../components/ui/index.js';
import { BedIcon, ClockIcon, MapPinIcon, PlusIcon, SparkIcon, SunIcon, TicketIcon, PiggyIcon } from '../../components/Icons.jsx';
import { fmtClockLoose } from '../daySchedule.js';

/**
 * Start your day (T898, the owner's plan days board 2026-10-30): what a
 * traveller needs before they leave, on top of the day (TripIt's "Go now",
 * Gemini planning around travel times). Only facts Carta has: when to
 * leave the bed, the first stop and when it is reached, the town's usual
 * high that month, the tickets the day holds, what the day costs a person
 * and the bed it ends at. An empty day says so and offers the two ways to
 * fill it.
 *
 *   leaveMin, first { name, arriveMin }, highC, tickets { n, perPerson }
 *   dayCost { eur, est }, stayLabel, onPlan, onAdd
 */
export function DayStart({ leaveMin = null, first = null, highC = null, tickets = null, dayCost = null, stayLabel = '', onPlan = null, onAdd = null }) {
  const { t } = useI18n();
  if (!first) {
    return (
      <section className="dst is-empty" aria-labelledby="dst-h">
        <h2 className="dst-h" id="dst-h">{t('dst.empty')}</h2>
        <div className="dst-acts">
          {onPlan && <Button variant="primary" size="sm" iconStart={<SparkIcon size={16} />} onClick={onPlan}>{t('dst.plan')}</Button>}
          {onAdd && <Button variant="secondary" size="sm" iconStart={<PlusIcon size={16} />} onClick={onAdd}>{t('dst.add')}</Button>}
        </div>
      </section>
    );
  }
  const facts = [
    { k: 'first', Icon: MapPinIcon, label: t('dst.first'), value: first.arriveMin != null ? t('dst.firstAt', { name: first.name, time: fmtClockLoose(first.arriveMin) }) : first.name },
    highC != null && { k: 'high', Icon: SunIcon, label: t('dst.high'), value: t('dst.highC', { n: Math.round(highC) }) },
    tickets?.known > 0 && { k: 'tickets', Icon: TicketIcon, label: t('dst.tickets'), value: tickets.perPerson > 0 ? <Money value={tickets.perPerson} precision="whole" /> : t('dst.ticketsN', { n: tickets.known }) },
    dayCost && { k: 'cost', Icon: PiggyIcon, label: t('dst.cost'), value: <Money value={dayCost.eur} est={dayCost.est} precision="whole" /> },
    stayLabel && { k: 'bed', Icon: BedIcon, label: t('dst.bed'), value: stayLabel },
  ].filter(Boolean);
  return (
    <section className="dst" aria-labelledby="dst-h">
      <div className="dst-top">
        <h2 className="dst-h" id="dst-h">{t('dst.title')}</h2>
        {leaveMin != null && (
          <Chip kind="status" tone="neutral" icon={<ClockIcon size={12} />}>{t('dst.leave', { time: fmtClockLoose(leaveMin) })}</Chip>
        )}
      </div>
      <dl className="dst-facts">
        {facts.map(({ k, Icon, label, value }) => (
          <div key={k} className="dst-fact">
            <span className="dst-ic" aria-hidden="true"><Icon size={16} /></span>
            <div className="dst-txt"><dt>{label}</dt><dd>{value}</dd></div>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * The days as chips (T898): All days first (inside a trip), then every day
 * with its date; the day in hand dark, an empty day marked with a ring. A
 * row that scrolls on a phone (Wanderlog's and Stippl's day pills).
 *
 *   days [{ k, label, date, empty }], current, onPick(k), onAll
 */
export function DayPills({ days, current, onPick, onAll = null }) {
  const { t } = useI18n();
  return (
    <nav className="dpl" aria-label={t('dayws.daySwitchAria')}>
      <ul className="dpl-row">
        {onAll && (
          <li><Button variant="secondary" size="sm" className="dpl-pill is-all" onClick={onAll}>{t('days.allDays')}</Button></li>
        )}
        {days.map((d) => (
          <li key={d.k}>
            <Button variant="secondary" size="sm" className={`dpl-pill${d.k === current ? ' is-now' : ''}${d.empty ? ' is-empty' : ''}`}
              aria-current={d.k === current ? 'date' : undefined} onClick={() => onPick(d.k)}>
              <span className="dpl-day">{d.label}</span>
              {d.date && <span className="dpl-date">{d.date}</span>}
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
