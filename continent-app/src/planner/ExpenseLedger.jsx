import React, { useState } from 'react';
import { eur } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';
import { ReceiptIcon } from '../components/Icons.jsx';

/**
 * ExpenseLedger, the group's shared-spend book for a planned trip.
 *
 * Every expense records who fronted it and who shares it; balances fold each
 * person's payments minus their shares into one number, and the settle-up
 * lines turn those numbers into the fewest "X pays Y" transfers. Lives on the
 * same extras rails as bookings/notes (local first, shadowed to the account
 * when signed in), so a saved trip carries its ledger.
 */

// Approximate EUR value of one unit of each supported currency. The ledger is
// a fairness tool, not a bank: near-enough mid-market rates are exactly right
// for splitting a dinner in Kraków, and they keep the ledger fully offline.
const EUR_RATES = {
  EUR: 1, GBP: 1.17, CHF: 1.05, PLN: 0.23, CZK: 0.041, HUF: 0.0025,
  SEK: 0.088, NOK: 0.086, DKK: 0.134, RON: 0.20, BGN: 0.51, TRY: 0.022,
};
const CURRENCIES = Object.keys(EUR_RATES);

const fmtAmount = (amount, currency) => (currency === 'EUR'
  ? eur(amount)
  : `${amount.toFixed(2)} ${currency}`);

export function ExpenseLedger({ extras, onChange, groupSize }) {
  const { t } = useI18n();
  const n = Math.max(1, groupSize || 1);
  const people = Array.from(
    { length: n },
    (_, i) => (extras.people?.[i] || '').trim() || t('extras.travellerN', { n: i + 1 }),
  );
  const expenses = extras.expenses || [];

  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [paidBy, setPaidBy] = useState(0);
  // null = everyone; a Set of indices once a chip is toggled off.
  const [sharerSet, setSharerSet] = useState(null);

  const renamePerson = (i, name) => {
    const next = Array.from({ length: n }, (_, j) => (j === i ? name : (extras.people?.[j] ?? '')));
    onChange({ ...extras, people: next });
  };

  const toggleSharer = (i) => {
    const cur = sharerSet ? new Set(sharerSet) : new Set(people.map((_, j) => j));
    if (cur.has(i)) cur.delete(i); else cur.add(i);
    if (cur.size === 0) return; // an expense nobody shares is not an expense
    setSharerSet(cur);
  };
  const sharing = (i) => (sharerSet ? sharerSet.has(i) : true);

  const addExpense = (e) => {
    e.preventDefault();
    const amt = Number(String(amount).replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) return;
    const sharers = sharerSet && sharerSet.size < n ? [...sharerSet].sort((a, b) => a - b) : null;
    onChange({
      ...extras,
      expenses: [...expenses, {
        id: `${Date.now()}`,
        desc: desc.trim(),
        amount: amt,
        currency,
        paidBy: Math.min(paidBy, n - 1),
        sharers, // null = the whole group
      }],
    });
    setDesc('');
    setAmount('');
    setSharerSet(null);
  };
  const removeExpense = (id) => onChange({ ...extras, expenses: expenses.filter((x) => x.id !== id) });

  // Net balance per person in EUR: what they fronted minus their share.
  const balances = Array(n).fill(0);
  let totalEur = 0;
  expenses.forEach((x) => {
    const rate = EUR_RATES[x.currency] ?? 1;
    const val = (x.amount || 0) * rate;
    const sharers = Array.isArray(x.sharers) && x.sharers.length
      ? x.sharers.filter((i) => i >= 0 && i < n)
      : people.map((_, i) => i);
    if (!sharers.length || !Number.isFinite(val)) return;
    totalEur += val;
    if (x.paidBy >= 0 && x.paidBy < n) balances[x.paidBy] += val;
    sharers.forEach((i) => { balances[i] -= val / sharers.length; });
  });

  // Settle-up: repeatedly fold the largest debt into the largest credit.
  const settlements = [];
  const bal = balances.map((v, i) => ({ i, v }));
  for (let guard = 0; guard < 4 * n; guard += 1) {
    bal.sort((a, b) => a.v - b.v);
    const debtor = bal[0];
    const creditor = bal[bal.length - 1];
    if (!debtor || !creditor || debtor.v > -0.5 || creditor.v < 0.5) break;
    const amt = Math.min(-debtor.v, creditor.v);
    settlements.push({ from: debtor.i, to: creditor.i, amt });
    debtor.v += amt;
    creditor.v -= amt;
  }

  const hasForeign = expenses.some((x) => x.currency !== 'EUR');

  return (
    <div className="trip-extras exp-ledger">
      <div className="trip-block-title">
        <ReceiptIcon size={12} /> {t('extras.expensesTitle')}
        {expenses.length > 0 && <span className="extras-count">{expenses.length}</span>}
      </div>

      {n > 1 && (
        <div className="exp-people">
          {people.map((name, i) => (
            <input
              key={i}
              className="extras-input exp-person"
              value={extras.people?.[i] ?? ''}
              placeholder={t('extras.travellerN', { n: i + 1 })}
              onChange={(e) => renamePerson(i, e.target.value)}
              aria-label={t('extras.travellerN', { n: i + 1 })}
            />
          ))}
        </div>
      )}

      {expenses.map((x) => {
        const sharers = Array.isArray(x.sharers) && x.sharers.length ? x.sharers : null;
        return (
          <div className="exp-row" key={x.id}>
            <span className="exp-row-main">
              <b>{x.desc || t('extras.expUntitled')}</b>
              <small>
                {sharers
                  ? t('extras.expPaidBySome', { name: people[x.paidBy] || '?', n: sharers.length })
                  : t('extras.expPaidByAll', { name: people[x.paidBy] || '?' })}
              </small>
            </span>
            <span className="exp-row-amt">{fmtAmount(x.amount, x.currency)}</span>
            <button className="extras-remove" onClick={() => removeExpense(x.id)} title={t('extras.removeTitle')}>×</button>
          </div>
        );
      })}

      <form className="exp-add" onSubmit={addExpense}>
        <input
          className="extras-input exp-desc"
          value={desc}
          placeholder={t('extras.expDescPlaceholder')}
          onChange={(e) => setDesc(e.target.value)}
        />
        <input
          className="extras-input extras-price"
          inputMode="decimal"
          value={amount}
          placeholder="0.00"
          onChange={(e) => setAmount(e.target.value)}
          aria-label={t('extras.expAmountAria')}
        />
        <select className="extras-input exp-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {n > 1 && (
          <select
            className="extras-input exp-payer"
            value={paidBy}
            onChange={(e) => setPaidBy(Number(e.target.value))}
            aria-label={t('extras.expPaidByAria')}
          >
            {people.map((name, i) => (
              <option key={i} value={i}>{t('extras.expPaidByOpt', { name })}</option>
            ))}
          </select>
        )}
        <button type="submit" className="extras-add-btn" disabled={!Number(String(amount).replace(',', '.'))}>
          + {t('extras.expAdd')}
        </button>
        {n > 1 && (
          <div className="exp-sharers">
            <span className="exp-sharers-lbl">{t('extras.expSplitAmong')}</span>
            {people.map((name, i) => (
              <button
                type="button"
                key={i}
                className={`exp-sharer-chip ${sharing(i) ? 'on' : ''}`}
                onClick={() => toggleSharer(i)}
                aria-pressed={sharing(i)}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </form>

      {expenses.length > 0 && (
        <div className="exp-balances">
          <div className="exp-total">{t('extras.expTotal', { total: eur(totalEur) })}</div>
          {n > 1 && (settlements.length > 0 ? (
            settlements.map((s, i) => (
              <div className="exp-settle" key={i}>
                {t('extras.expSettle', { from: people[s.from], to: people[s.to], amount: eur(s.amt) })}
              </div>
            ))
          ) : (
            <div className="exp-settle exp-square">{t('extras.expSquare')}</div>
          ))}
          {hasForeign && <div className="exp-rate-note">{t('extras.expRateNote')}</div>}
        </div>
      )}
    </div>
  );
}
