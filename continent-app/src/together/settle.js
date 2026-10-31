/**
 * settle.js, who owes whom on a group trip (T940). Pure: no React, no
 * Supabase, every amount in whole euro CENTS so nothing drifts.
 *
 *   splitCents(amount, people)   one expense split equally, the odd cents
 *                                going one each to the first people in id
 *                                order, so every device splits it the same.
 *   balances(expenses, settlements)
 *                                each person's net: what they paid minus
 *                                their shares, plus what they paid back,
 *                                minus what was paid back to them. Positive
 *                                is owed money, negative owes.
 *   simplify(balances)           the fewest transfers that settle every
 *                                balance. Exact for up to MAX_EXACT people
 *                                (the most zero-sum groups, found over
 *                                bitmasks); a greedy largest-to-largest
 *                                match beyond that, and inside each group.
 *
 * The expense and settlement shapes are the client's (src/auth/
 * groupExpenses.js): { paidBy, amountCents, splitAmong: [userId] } and
 * { from, to, amountCents }.
 */

export const MAX_EXACT = 14;

const cents = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0);

/** Euros typed by a person ("12,50", "12.5", 12) as cents, or null. */
export function toCents(text) {
  const s = String(text ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100);
  return n > 0 ? n : null;
}

/** One expense split equally. Returns a Map userId -> cents. */
export function splitCents(amountCents, people) {
  const ids = [...new Set((people || []).filter(Boolean))].sort();
  const out = new Map();
  const total = cents(amountCents);
  if (!ids.length || total <= 0) return out;
  const base = Math.floor(total / ids.length);
  let rest = total - base * ids.length;
  for (const id of ids) {
    out.set(id, base + (rest > 0 ? 1 : 0));
    if (rest > 0) rest -= 1;
  }
  return out;
}

/** Net cents per person (Map), every person named anywhere included. */
export function balances(expenses = [], settlements = []) {
  const net = new Map();
  const add = (id, v) => { if (id) net.set(id, (net.get(id) || 0) + v); };
  for (const e of expenses || []) {
    const amount = cents(e.amountCents);
    if (amount <= 0 || !e.paidBy) continue;
    const shares = splitCents(amount, e.splitAmong);
    if (!shares.size) continue;
    add(e.paidBy, amount);
    for (const [id, share] of shares) add(id, -share);
  }
  for (const s of settlements || []) {
    const amount = cents(s.amountCents);
    if (amount <= 0 || !s.from || !s.to || s.from === s.to) continue;
    add(s.from, amount);
    add(s.to, -amount);
  }
  return net;
}

/** Greedy: the largest debtor pays the largest creditor, repeated. */
function greedy(entries) {
  const pos = entries.filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const neg = entries.filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const out = [];
  const byV = (a, b) => (b.v - a.v) || a.id.localeCompare(b.id);
  while (pos.length && neg.length) {
    pos.sort(byV);
    neg.sort(byV);
    const p = pos[0];
    const n = neg[0];
    const amount = Math.min(p.v, n.v);
    out.push({ from: n.id, to: p.id, amountCents: amount });
    p.v -= amount;
    n.v -= amount;
    if (!p.v) pos.shift();
    if (!n.v) neg.shift();
  }
  return out;
}

/**
 * The most disjoint zero-sum groups the non-zero balances split into.
 * A group of k people settles in k - 1 transfers, so the most groups is the
 * fewest transfers overall. dp[mask] is the most complete groups inside
 * mask; a mask whose sum is zero closes one more.
 */
function zeroSumGroups(entries) {
  const n = entries.length;
  const full = (1 << n) - 1;
  const sum = new Array(full + 1).fill(0);
  for (let m = 1; m <= full; m += 1) {
    const low = m & -m;
    sum[m] = sum[m ^ low] + entries[31 - Math.clz32(low)][1];
  }
  const dp = new Array(full + 1).fill(0);
  const from = new Array(full + 1).fill(-1);
  for (let m = 1; m <= full; m += 1) {
    let best = -1;
    let bestBit = -1;
    for (let b = 0; b < n; b += 1) {
      if (!(m & (1 << b))) continue;
      const v = dp[m ^ (1 << b)];
      if (v > best) { best = v; bestBit = b; }
    }
    dp[m] = best + (sum[m] === 0 ? 1 : 0);
    from[m] = bestBit;
  }
  // Walk back: every time the count drops, the people removed since the
  // last drop form one zero-sum group.
  const groups = [];
  let m = full;
  let current = [];
  while (m) {
    const b = from[m];
    const closes = sum[m] === 0 && dp[m] > dp[m ^ (1 << b)];
    if (closes && current.length) { groups.push(current); current = []; }
    current.push(entries[b]);
    m ^= 1 << b;
  }
  if (current.length) groups.push(current);
  return groups;
}

/**
 * The transfers that settle every balance: [{ from, to, amountCents }],
 * largest first. A balance Map or an object of userId -> cents.
 */
export function simplify(net) {
  const entries = [...(net instanceof Map ? net.entries() : Object.entries(net || {}))]
    .map(([id, v]) => [id, cents(v)])
    .filter(([, v]) => v !== 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) return [];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total !== 0) throw new Error('balances do not add up to zero');
  const parts = entries.length <= MAX_EXACT ? zeroSumGroups(entries) : [entries];
  return parts.flatMap(greedy).sort((a, b) => (b.amountCents - a.amountCents) || a.from.localeCompare(b.from));
}

/** Everything the Settle up screen draws, from the ledger. */
export function settleUp(expenses = [], settlements = []) {
  const net = balances(expenses, settlements);
  const spent = (expenses || []).reduce((s, e) => s + Math.max(0, cents(e.amountCents)), 0);
  return { net, transfers: simplify(net), spentCents: spent };
}
