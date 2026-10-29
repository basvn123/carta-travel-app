import React, { useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Field, Money, Segmented } from '../../components/ui/index.js';
import NotYet from '../../components/NotYet.jsx';
import { formatMoney } from '../../lib/money.js';
import { budgetCheck } from '../flow/budget.js';

/**
 * The trip's total against its budget (T846, owner board panel 3, after
 * Wanderlog's budget card): from 1024 px in the side column beside every
 * tab, so the total stays in view while the route, the costs or the days
 * change (T843-b); on a phone under the cost band.
 *
 * The total for the party, then, with a budget, what one person spends
 * against it (the budget is a person's, as the trip settings ask it: the
 * whole trip, or a day of bed plus food and drink) as a thin ink bar and
 * one line, "€234 under your budget". Edit budget (or Set a budget) opens
 * the two fields in place. Saving writes the trip settings' budget, so the
 * settings sheet and the receipt say the same.
 *
 *   priced    quoteTrip() output
 *   party     head count;  nights   the trip's nights
 *   budget    { kind: 'total' | 'day', eur }
 *   onSave(budget)
 */
export function BudgetCard({ priced, party = 1, nights = 0, budget, onSave }) {
  const { t, lang } = useI18n();
  const [editing, setEditing] = useState(false);
  // A first budget is for the whole trip (the card's own figure); a set one keeps its kind.
  const [kind, setKind] = useState(budget?.eur > 0 && budget?.kind === 'day' ? 'day' : 'total');
  const [eur, setEur] = useState(budget?.eur > 0 ? String(budget.eur) : '');
  const total = priced?.grandTotal;
  const has = budget?.eur > 0;
  const check = has ? budgetCheck(priced, budget, { party, nights }) : null;
  const spent = has
    ? (budget.kind === 'total' ? priced?.perPerson : ((priced?.parts?.beds || 0) + (priced?.parts?.days || 0)) / Math.max(1, party) / Math.max(1, nights))
    : null;
  const share = has && Number.isFinite(spent) ? Math.min(1, spent / budget.eur) : 0;
  const money = (v, p = 'cents') => formatMoney(v, { precision: p, locale: lang });
  const save = () => {
    const n = Math.round(Number(String(eur).replace(',', '.')) || 0);
    onSave({ kind, eur: Math.max(0, Math.min(100000, n)) });
    setEditing(false);
  };

  return (
    <section className="tpbud" aria-labelledby="tpbud-h" data-testid="tp-budget">
      <div className="tpbud-head">
        <h2 className="tpbud-h" id="tpbud-h">{t(has ? 'tp.bud.title' : 'tp.bud.total')}</h2>
        {!editing && (
          <Button variant="quiet" size="sm" className="tpbud-edit" onClick={() => setEditing(true)}>
            {t(has ? 'tp.bud.edit' : 'tp.bud.set')}
          </Button>
        )}
      </div>
      <p className="tpbud-total">
        <span className="tpbud-n">{Number.isFinite(total) ? <Money value={total} est precision="cents" /> : <NotYet />}</span>
        <span className="tpbud-for">{t('receipt.total', { people: party === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: party }) })}</span>
      </p>
      {has && check && !editing && (
        <>
          <div className="tpbud-bar" role="img" aria-label={t('tp.bud.barAria', { spent: money(spent), budget: money(budget.eur, 'whole') })}>
            <span style={{ width: `${Math.round(share * 100)}%` }} className={check.over ? 'is-over' : ''} />
          </div>
          <p className="tpbud-line">
            <span>{t(budget.kind === 'total' ? 'tp.bud.ofTrip' : 'tp.bud.ofDay', { spent: money(spent), budget: money(budget.eur, 'whole') })}</span>
            <span className={`tpbud-gap${check.over ? ' is-over' : ''}`}>
              {t(check.over ? 'plan.budgetOver' : 'plan.budgetUnder', { price: money(check.gap, 'whole') })}
            </span>
          </p>
        </>
      )}
      {editing && (
        <div className="tpbud-form">
          <Segmented block size="sm" label={t('tp.bud.kind')} value={kind} onChange={setKind}
            options={[{ value: 'total', label: t('tp.bud.kindTrip') }, { value: 'day', label: t('tp.bud.kindDay') }]} />
          <Field label={t(kind === 'total' ? 'tp.bud.eurTrip' : 'tp.bud.eurDay')} value={eur} inputMode="numeric" autoComplete="off"
            onChange={(e) => setEur(e.target.value.replace(/[^\d]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
          <div className="tpbud-acts">
            <Button variant="secondary" size="sm" onClick={save}>{t('tp.ed.save')}</Button>
            {has && <Button variant="quiet" size="sm" onClick={() => { onSave({ kind, eur: 0 }); setEur(''); setEditing(false); }}>{t('tp.bud.clear')}</Button>}
            <Button variant="quiet" size="sm" onClick={() => setEditing(false)}>{t('tp.bal.cancel')}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
