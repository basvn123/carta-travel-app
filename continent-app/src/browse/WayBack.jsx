import React from 'react';
import { wayBackPlan, splitMinutes } from '../lib/wayBack.js';
import { Button } from '../components/ui/index.js';

/**
 * The way back on a one-way walk's page (T1185, ROADMAP D24). Says how to get
 * from the end to the start: public transport where a stop of one kind is
 * found at both ends (no times: there is no timetable feed), a taxi estimate
 * from the straight line, and the walk back along the route. With no record
 * it says plainly that we do not know. `onPlan` opens the day planner on
 * this walk, so the return is planned with the rest of the day.
 */
export function WayBack({ wb, viaTrek = false, t, lang = 'en', onPlan = null }) {
  const plan = wayBackPlan(wb);
  const nf = (v) => Number(v).toLocaleString(lang, { maximumFractionDigits: 1 });
  const time = (min) => {
    const { h, min: m } = splitMinutes(min);
    if (!h) return t('wayBack.min', { min: m });
    return m ? t('wayBack.hm', { h, min: m }) : t('wayBack.h', { h });
  };
  return (
    <div className="pt-block" data-testid="way-back">
      <h3 className="pt-block-title">{t('wayBack.title')}</h3>
      {!plan ? (
        <p className="pt-muted" data-testid="way-back-unknown">{t('wayBack.unknown')}</p>
      ) : (
        <>
          <p className="pt-muted">
            {viaTrek ? `${t('wayBack.trek')} ` : ''}{t('wayBack.apart', { km: nf(plan.km) })}
          </p>
          <ul className="pt-way-list" data-testid="way-back-list">
            <li data-way="pt">
              <strong>{t('wayBack.pt')}. </strong>
              {plan.pt === 'both' && t('wayBack.ptBoth', { modes: plan.modes.map((m) => t(`wayBack.mode.${m}`)).join(', ') })}
              {plan.pt === 'none' && t('wayBack.ptNone')}
              {plan.pt === 'unknown' && t('wayBack.ptUnknown')}
            </li>
            {plan.taxi && (
              <li data-way="taxi">{t('wayBack.taxi', { time: time(plan.taxi.min), km: nf(plan.taxi.km) })}</li>
            )}
            {plan.walk && Number.isFinite(plan.walk.km) && Number.isFinite(plan.walk.min) && (
              <li data-way="walk">{t('wayBack.walk', { km: nf(plan.walk.km), time: time(plan.walk.min) })}</li>
            )}
          </ul>
        </>
      )}
      {onPlan && (
        <Button variant="quiet" size="sm" onClick={onPlan} data-testid="way-back-plan">
          {t('wayBack.plan')}
        </Button>
      )}
    </div>
  );
}
