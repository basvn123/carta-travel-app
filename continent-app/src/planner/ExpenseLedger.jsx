import React, { useEffect, useState } from 'react';
import { eur } from '../lib/format.js';
import { EUR_RATES, CURRENCIES } from '../lib/currency.js';
import { useI18n } from '../i18n/index.jsx';
import { readCrew, writeCrew } from '../auth/tripCrew.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { fetchFriendLinks } from '../auth/friends.js';
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

// Rates live in lib/currency.js: a past trip's spend converts the same way,
// and two copies of a rate table is one copy too many.

const fmtAmount = (amount, currency) => (currency === 'EUR'
  ? eur(amount)
  : `${amount.toFixed(2)} ${currency}`);

export function ExpenseLedger({ extras, onChange, groupSize }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const n = Math.max(1, groupSize || 1);

  // Your accepted friends, as one-tap fills for the traveller slots. Guests
  // and projects without migration 011 simply never see the chips.
  const [friendOpts, setFriendOpts] = useState([]);
  useEffect(() => {
    if (!user) { setFriendOpts([]); return undefined; }
    let live = true;
    fetchFriendLinks(user.id)
      .then((rows) => { if (live) setFriendOpts(rows.filter((r) => r.kind === 'friend')); })
      .catch(() => {});
    return () => { live = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The roster is shared with the trip's record (see auth/tripCrew.js): a name
  // typed into "who came" arrives here already filled in. Clamped to the group
  // size, as it always was, so the chips and the balances stay one per head.
  const crew = readCrew(extras, { groupSize: n }).slice(0, n);
  const people = crew.map((c, i) => c.name.trim() || t('extras.travellerN', { n: i + 1 }));
  const expenses = extras.expenses || [];

  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [paidBy, setPaidBy] = useState(0);
  // null = everyone; a Set of indices once a chip is toggled off.
  const [sharerSet, setSharerSet] = useState(null);

  // A friend lands in the first unnamed slot, carrying their account as well
  // as their name. Typing a name stays exactly as good: linking is a
  // shortcut, never a requirement.
  const pickFriend = (f) => {
    const full = readCrew(extras, { groupSize: n });
    const slot = full.findIndex((c, i) => i < n && !c.name.trim());
    if (slot === -1) return;
    onChange(writeCrew(extras, full.map((c, j) => (
      j === slot ? { ...c, name: f.displayName || f.handle, userId: f.userId } : c
    ))));
  };

  const renamePerson = (i, name) => {
    // Read unclamped: a roster longer than the group size must survive being
    // renamed, and position is what an already recorded expense points at.
    const next = readCrew(extras, { groupSize: n })
      .map((c, j) => (j === i ? { ...c, name } : c));
    onChange(writeCrew(extras, next));
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
              value={crew[i]?.name ?? ''}
              placeholder={t('extras.travellerN', { n: i + 1 })}
              onChange={(e) => renamePerson(i, e.target.value)}
              aria-label={t('extras.travellerN', { n: i + 1 })}
            />
          ))}
          {(() => {
            const taken = new Set(crew.map((c) => c.userId).filter(Boolean));
            const hasSlot = crew.some((c) => !c.name.trim());
            const options = friendOpts.filter((f) => !taken.has(f.userId));
            if (!hasSlot || !options.length) return null;
            return (
              <div className="exp-friendrow">
                <span className="pasttrip-sublabel">{t('saved.pastFromFriends')}</span>
                <div className="pasttrip-friendchips">
                  {options.map((f) => (
                    <button
                      key={f.userId}
                      type="button"
                      className="pasttrip-friendchip"
                      onClick={() => pickFriend(f)}
                    >
                      {f.displayName || `@${f.handle}`}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
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
