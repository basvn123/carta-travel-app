/**
 * spend/model.js, the money of the Uitgaven page and the Reiskas (G15,
 * decision in .work/2026-11-21-spend-capture/decision.md). Pure: no React,
 * no storage, every amount in whole euro CENTS so nothing drifts.
 *
 * A spend is one row in the trip's own ledger, `extras.expenses`, beside the
 * rows the old Spent today form wrote and the rows a past-trip memory writes
 * (`src: 'memory'`). New rows keep every field the old readers use
 * (`amount`, `currency`, `cat`, `date`, `paidBy`, `sharers`), so
 * `spendOnDay` and an older client still read them, and add:
 *
 *   v: 2           the shape
 *   cents          the whole spend in euro cents (the amount through toEur)
 *   rate           euro per unit of `currency` when it was logged
 *   payer          the person id who paid
 *   split          { personId: cents }, summing to `cents` exactly
 *   mineCents      your share, the one number the personal ledger reads, so
 *                  a spend shared with three friends is never counted as
 *                  four times your spending
 *   priv           "Alleen ik": never enters the kas
 *   src            'hand' | 'mic' | 'scan', how it was put in
 *   photoId        the receipt photo, kept on this device (receiptStore.js)
 *
 * People are keyed by id, never by position: 'me' for the traveller holding
 * the phone, and the crew's own ids (tripCrew.js, `p0`, `p1`...) for the
 * others. Phase 1 is a local kas on one phone; an account uid takes the
 * place of a crew id when the kas is shared (migration 077, phase 2).
 *
 * Old rows (no `split`) read as an equal split over the people. They never
 * said who paid, so they stay out of the kas balances rather than invent a
 * payer; your share of them still counts as your spending.
 */
import { simplify } from '../../together/settle.js';
import { namedCrew, readCrew } from '../../auth/tripCrew.js';

export const ME = 'me';

/** What a spend on the road is, in the past-trip memory's own words. */
export const DAY_CATS = ['food', 'transport', 'activities', 'other'];

const int = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0);

/** A euro figure as cents. */
export const toCentsEur = (eur) => int(Number(eur) * 100);

/** Cents as a euro figure, for formatMoney. */
export const eurOf = (cents) => int(cents) / 100;

/**
 * The people a kas splits between: you first, then the trip's named crew.
 * With nobody named and a group bigger than one, the unnamed seats (their
 * crew ids, `name` empty) stand in, so a spend still splits over the group
 * size the old form used.
 */
export function kasPeople(extras, { groupSize = 1 } = {}) {
  const named = namedCrew(readCrew(extras));
  const others = named.length ? named
    : readCrew({ people: [] }, { groupSize: Math.max(0, int(groupSize) - 1) });
  return [{ id: ME, name: '', me: true }, ...others.map((c) => ({ id: c.id, name: c.name.trim(), me: false }))];
}

/**
 * An equal split: Map-free { id: cents }, summing to `cents`. The odd cents
 * go to the payer (the critique-money rule), or to the first sharer when
 * the payer is not among them.
 */
export function splitEqual(cents, ids, payer) {
  const list = [...new Set((ids || []).filter(Boolean))];
  const total = int(cents);
  if (!list.length || total <= 0) return {};
  const base = Math.floor(total / list.length);
  const out = {};
  list.forEach((id) => { out[id] = base; });
  const rest = total - base * list.length;
  const to = list.includes(payer) ? payer : list[0];
  out[to] += rest;
  return out;
}

/** An amount shared equally as per-person amounts (the Per persoon fields
 *  and "Gelijk verdelen"): { id: amount }, the odd cent to the payer. */
export function equalAmounts(amount, ids, payer) {
  const s = splitEqual(Math.round(Number(amount) * 100), ids, payer);
  const out = {};
  Object.entries(s).forEach(([id, c]) => { out[id] = c / 100; });
  return out;
}

/** The sum of a split's cents. */
export const splitSum = (split) => Object.values(split || {}).reduce((s, v) => s + int(v), 0);

/**
 * Per-person amounts typed in the spend's own currency, as euro cents that
 * add up to `cents` exactly: each converted and rounded, the rounding
 * difference to the payer (or the largest share).
 */
export function splitFromAmounts(amounts, rate, cents, payer) {
  const out = {};
  Object.entries(amounts || {}).forEach(([id, a]) => {
    const n = Number(a);
    if (Number.isFinite(n) && n > 0) out[id] = int(n * rate * 100);
  });
  const ids = Object.keys(out);
  if (!ids.length) return {};
  const diff = int(cents) - splitSum(out);
  if (diff) {
    const to = ids.includes(payer) ? payer : ids.sort((a, b) => out[b] - out[a])[0];
    out[to] += diff;
  }
  return out;
}

/**
 * One new ledger row from the add sheet's draft:
 *   { amount, currency, rate, cat, desc, payer, mode: 'all'|'each'|'me',
 *     shares: { id: amount in the spend currency }, src, photoId, date }
 * `people` is kasPeople(). Returns null when the amount or the split does
 * not hold.
 */
export function makeSpend(draft, people, { id = `${Date.now()}`, date } = {}) {
  const amount = Number(draft?.amount);
  if (!(amount > 0)) return null;
  const rate = Number(draft.rate) > 0 ? Number(draft.rate) : 1;
  const cents = int(amount * rate * 100);
  if (cents <= 0) return null;
  const ids = people.map((p) => p.id);
  const payer = ids.includes(draft.payer) ? draft.payer : ME;
  const mode = draft.mode === 'me' || people.length < 2 ? 'me' : draft.mode === 'each' ? 'each' : 'all';
  let split;
  if (mode === 'me') split = { [ME]: cents };
  else if (mode === 'each') split = splitFromAmounts(draft.shares, rate, cents, payer);
  else split = splitEqual(cents, ids, payer);
  if (splitSum(split) !== cents) return null;
  const priv = mode === 'me';
  // The crew position of the payer, for a client that still reads paidBy.
  const paidBy = Math.max(0, ids.indexOf(payer) - 1);
  return {
    id,
    v: 2,
    desc: String(draft.desc || '').trim().slice(0, 80),
    amount: Math.round(amount * 100) / 100,
    currency: draft.currency || 'EUR',
    rate,
    cents,
    date: date || draft.date || null,
    cat: DAY_CATS.includes(draft.cat) ? draft.cat : 'other',
    src: ['mic', 'scan'].includes(draft.src) ? draft.src : 'hand',
    payer: priv ? ME : payer,
    split,
    mineCents: int(split[ME]),
    priv,
    ...(draft.photoId ? { photoId: draft.photoId } : {}),
    paidBy,
    sharers: null,
  };
}

/**
 * Any ledger row as the page reads it:
 *   { id, desc, cat, date, currency, amount, cents, payer, split, mine,
 *     priv, src, photoId, legacy }
 * `toEur(amount, currency)` values a row that has no `cents` (an old row).
 * Null for a memory row or a row with no amount.
 */
export function readSpend(row, people, toEur = (n) => n) {
  if (!row || row.src === 'memory') return null;
  const amount = Number(row.amount);
  if (!(amount > 0)) return null;
  const cents = Number.isFinite(row.cents) && row.cents > 0 ? int(row.cents) : toCentsEur(toEur(amount, row.currency || 'EUR'));
  if (cents <= 0) return null;
  const base = {
    id: String(row.id), desc: row.desc || '', cat: DAY_CATS.includes(row.cat) ? row.cat : 'other',
    date: row.date || null, currency: row.currency || 'EUR', amount, cents,
    src: row.src || 'hand', photoId: row.photoId || null,
  };
  if (row.split && typeof row.split === 'object' && splitSum(row.split) === cents) {
    const split = {};
    Object.entries(row.split).forEach(([k, v]) => { if (int(v) > 0) split[k] = int(v); });
    const priv = !!row.priv;
    return { ...base, payer: row.payer || ME, split, mine: int(split[ME]), priv, legacy: false };
  }
  // An old row: an equal split over the people, or over the crew seats it
  // names. It never said who paid.
  const ids = people.map((p) => p.id);
  const seats = Array.isArray(row.sharers) && row.sharers.length
    ? row.sharers.map((i) => `p${i}`).filter((id) => ids.includes(id)) : [];
  const among = seats.length ? seats : ids;
  const split = splitEqual(cents, among, ME);
  return { ...base, payer: null, split, mine: int(split[ME]), priv: false, legacy: true };
}

/** Every readable row of a ledger, newest first. */
export function readLedger(expenses, people, toEur, dayOf) {
  return (expenses || [])
    .map((row) => {
      const r = readSpend(row, people, toEur);
      return r ? { ...r, day: dayOf ? dayOf(row) : r.date } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (String(b.day || '') + b.id).localeCompare(String(a.day || '') + a.id, undefined, { numeric: true }));
}

/** Your share of the rows spent on one day, in cents, and by category. */
export function mineOnDay(rows, dayIso) {
  const byCat = {};
  let cents = 0;
  (rows || []).filter((r) => r.day === dayIso).forEach((r) => {
    cents += r.mine;
    byCat[r.cat] = (byCat[r.cat] || 0) + r.mine;
  });
  return { cents, byCat };
}

/**
 * The kas: each person's net in cents (positive gets money back), from the
 * shared rows and the transfers marked paid ({ from, to, cents }).
 */
export function kasBalances(rows, settled = [], people = []) {
  const net = {};
  people.forEach((p) => { net[p.id] = 0; });
  const add = (id, v) => { net[id] = (net[id] || 0) + v; };
  (rows || []).forEach((r) => {
    if (r.priv || r.legacy || !r.payer) return;
    add(r.payer, r.cents);
    Object.entries(r.split).forEach(([id, c]) => add(id, -c));
  });
  (settled || []).forEach((s) => {
    const c = int(s?.cents);
    if (c <= 0 || !s.from || !s.to || s.from === s.to) return;
    add(s.from, c);
    add(s.to, -c);
  });
  return net;
}

/** The fewest transfers that settle the kas: [{ from, to, cents }]. */
export function kasTransfers(net) {
  return simplify(net).map((t) => ({ from: t.from, to: t.to, cents: t.amountCents }));
}

/**
 * The wink tags on the Iedereen rows: the top creditor and the top debtor.
 * Null ids when nobody is owed (or owes).
 */
export function kasExtremes(net) {
  const entries = Object.entries(net || {}).filter(([, v]) => v !== 0);
  if (!entries.length) return { top: null, low: null };
  const top = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const low = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
  return { top: top[1] > 0 ? top[0] : null, low: low[1] < 0 ? low[0] : null };
}

/* ───────────── The ledger bridge ───────────── */

/**
 * Your share of the road spend over the whole trip, in euro, by category:
 * the personal ledger the cost chart and the year card read. A memory row
 * is the traveller's own typed total and is not road spend.
 */
export function roadSpendByCat(expenses, people, toEur) {
  const out = {};
  readLedger(expenses, people, toEur).forEach((r) => {
    if (r.mine > 0) out[r.cat] = (out[r.cat] || 0) + r.mine / 100;
  });
  return out;
}

/**
 * What a trip cost a person, for Your Europe and the year card: per
 * category, the memory's typed figure where the traveller typed one, else
 * the logged road spend. Never a whole-ledger override, so a typed hotel
 * total keeps the logged food. Null when neither holds anything.
 *
 *   memory   the past-trip memory (or null)
 *   road     roadSpendByCat()
 *   toEur    lib/currency toEur
 */
export function tripSpendPP(memory, road = {}, toEur = (n) => n) {
  const spend = memory?.spend || {};
  const t = memory?.travellers || {};
  const heads = Math.max(1, (Number(t.adults) || 0) + (Number(t.children) || 0));
  const cats = new Set([...Object.keys(spend).filter((k) => k !== 'currency'), ...Object.keys(road || {})]);
  let total = 0;
  cats.forEach((cat) => {
    const typed = Number(spend[cat]);
    if (Number.isFinite(typed) && typed > 0) total += toEur(typed, spend.currency || 'EUR') / heads;
    else if (Number(road?.[cat]) > 0) total += Number(road[cat]);
  });
  return total > 0 ? total : null;
}
