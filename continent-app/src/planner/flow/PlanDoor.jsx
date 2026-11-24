import React, { useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useSettings } from '../../components/SettingsLine.jsx';
import { Button, Chip, Field, Segmented, Switch } from '../../components/ui/index.js';
import { ArrowRightIcon, HeartIcon, SparkIcon } from '../../components/Icons.jsx';
import { partyText } from '../../lib/party.js';
import { styleName } from '../../browse/styles/styleBits.jsx';

/**
 * The door on Plan home (G12 plan rethink lane L5, decision §3.1): one line
 * ("Where do you start?", read on the device by Tell's parser once a trip
 * starts), Surprise me (or Show trips with text), three chips (a place, a
 * budget, something booked), what Carta knows from the style, and context
 * cards only when something stands behind them. No chat, no replies.
 *
 *   onStart({ text, seed, tell })  a new trip; `seed` a PlanSeed (the budget
 *                                  chip pins its amount), `tell` opens Tell
 *                                  (a typed line, or the booked chip's upload)
 *   kept                           kept trips (hearts on found trips)
 *   onOpenKept()                   My trips on them
 *   past                           the latest past trip ({ name, nights }) or null
 */
export function PlanDoor({ onStart, kept = [], onOpenKept = null, past = null }) {
  const { t } = useI18n();
  const app = useSettings();
  const ts = app?.travelStyles || null;
  const [text, setText] = useState('');
  const [hint, setHint] = useState('');
  const [budget, setBudget] = useState(null); // null | { eur, per, cap }
  const fieldRef = useRef(null);
  const line = text.trim();
  const st = ts?.active || null;
  const budgetSeed = budget && Number(budget.eur) > 0
    ? { source: 'door', budget: { eur: Number(budget.eur), kind: 'total', per: budget.per, mode: budget.cap ? 'cap' : 'soft' }, pins: ['budget'] }
    : null;
  const go = () => onStart({ text: line, seed: budgetSeed, tell: Boolean(line) });
  return (
    <section className="pf-door" aria-labelledby="pf-door-h">
      <h2 className="sr-only" id="pf-door-h">{t('pf.door.title')}</h2>
      <div className="pf-door-line">
        <label className="sr-only" htmlFor="pf-door-field">{t('pf.door.title')}</label>
        <textarea
          id="pf-door-field"
          ref={fieldRef}
          className="pf-prompt-field"
          rows={2}
          maxLength={600}
          value={text}
          placeholder={hint || t('pf.door.title')}
          onChange={(e) => setText(e.target.value)}
        />
        <Button variant="primary" iconEnd={<ArrowRightIcon size={18} />} onClick={go}>
          {t(line ? 'pf.door.show' : 'pf.door.surprise')}
        </Button>
      </div>
      <ul className="pf-door-chips" aria-label={t('pf.door.chips')}>
        <li>
          <Chip kind="filter" selected={hint === t('pf.door.placeHint')}
            onClick={() => { setHint(t('pf.door.placeHint')); fieldRef.current?.focus(); }}>
            {t('pf.door.place')}
          </Chip>
        </li>
        <li>
          <Chip kind="filter" selected={Boolean(budget)}
            onClick={() => setBudget(budget ? null : { eur: '', per: 'person', cap: false })}>
            {t('pf.door.budget')}
          </Chip>
        </li>
        <li>
          <Chip kind="filter" selected={false} onClick={() => onStart({ text: line, seed: budgetSeed, tell: true })}>
            {t('pf.door.booked')}
          </Chip>
        </li>
      </ul>
      {budget && (
        <div className="pf-door-budget">
          <Field label={t('pf.door.amount')} type="number" inputMode="numeric" min={1} value={budget.eur}
            onChange={(e) => setBudget({ ...budget, eur: e.target.value.replace(/[^0-9]/g, '') })} />
          <Segmented label={t('pf.door.per')} size="sm" value={budget.per} onChange={(v) => setBudget({ ...budget, per: v })}
            options={[{ value: 'person', label: t('pf.door.perPerson') }, { value: 'group', label: t('pf.door.perGroup') }]} />
          <Switch label={t('pf.door.cap')} checked={budget.cap} onChange={(v) => setBudget({ ...budget, cap: v })} />
        </div>
      )}
      {st && (
        <p className="pf-door-knows">
          {t('pf.door.knows', { style: styleName(t, st), who: partyText(t, { adults: st.who.adults, children: st.who.kids, babies: st.who.babies }) })}
          {' '}
          <Button variant="quiet" size="sm" onClick={() => ts.setOpen({ view: 'overview' })}>{t('pf.door.styleChange')}</Button>
        </p>
      )}
      {(kept.length > 0 || past) && (
        <ul className="pf-door-cards">
          {kept.length > 0 && onOpenKept && (
            <li>
              <Button variant="secondary" size="sm" iconStart={<HeartIcon size={16} />} onClick={onOpenKept}>
                {t('pf.door.saved', { n: kept.length })}
              </Button>
            </li>
          )}
          {past && (
            <li>
              <Button variant="secondary" size="sm" iconStart={<SparkIcon size={16} />}
                onClick={() => (past.onPlan ? past.onPlan() : onStart({ seed: { source: 'past', label: past.name, when: past.nights ? { mode: 'any', nights: past.nights } : null } }))}>
                {t('pf.door.like', { name: past.name })}
              </Button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
