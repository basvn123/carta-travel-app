/**
 * groupExpenses.js, Settle up on a group trip (T940, migration 058).
 *
 * Members log what they paid for the group; src/together/settle.js works
 * out who owes whom in the fewest transfers. Money moves OUTSIDE Carta,
 * through each person's own payment link (Tikkie, bunq.me, Revolut), and a
 * transfer is then marked as paid here. Every rule is in SQL: only the
 * group's joined members read or write a ledger, and a payment link is read
 * by its owner and, through group_pay_links(), by their group's members.
 *
 * Before 058 is applied every read answers `{ missing: true }` and the
 * group page draws no Settle up. Under ?friendsmock the Together store
 * never calls this module.
 */
import { getSupabase } from '../lib/supabaseClient.js';
import { isMissing } from './friendVisibility.js';

const NONE = Object.freeze({ missing: true, expenses: [], settlements: [], payLinks: new Map() });

/** An https address and nothing else, as 058 checks it. */
export function cleanPayLink(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  if (s.length > 300 || !/^https:\/\/[A-Za-z0-9.-]+(\/[^\s<>"]*)?$/.test(s)) return null;
  return s;
}

/** The host of a payment link, for its button ("tikkie.me"). */
export function payHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/** One group's ledger: { missing, expenses, settlements, payLinks }. */
export async function fetchGroupLedger(groupId) {
  const supabase = await getSupabase();
  if (!supabase || !groupId) return NONE;
  const [ex, st, pl] = await Promise.all([
    supabase.from('group_trip_expenses')
      .select('id, paid_by, amount_cents, description, split_among, created_by, created_at')
      .eq('group_id', groupId).order('created_at', { ascending: false }),
    supabase.from('group_trip_settlements')
      .select('id, from_user, to_user, amount_cents, created_by, created_at')
      .eq('group_id', groupId).order('created_at', { ascending: false }),
    supabase.rpc('group_pay_links', { g: groupId }),
  ]);
  const err = ex.error || st.error;
  if (err) {
    if (!isMissing(err)) console.warn('[settle] could not read the ledger:', err.message || err);
    return NONE;
  }
  return {
    missing: false,
    expenses: (ex.data || []).map((r) => ({
      id: r.id, paidBy: r.paid_by, amountCents: Number(r.amount_cents), description: r.description || '',
      splitAmong: Array.isArray(r.split_among) ? r.split_among : [], createdBy: r.created_by, createdAt: r.created_at,
    })),
    settlements: (st.data || []).map((r) => ({
      id: r.id, from: r.from_user, to: r.to_user, amountCents: Number(r.amount_cents), createdBy: r.created_by, createdAt: r.created_at,
    })),
    payLinks: new Map((pl.error ? [] : pl.data || []).map((r) => [r.user_id, r.url])),
  };
}

export async function addGroupExpense(groupId, userId, { paidBy, amountCents, description, splitAmong }) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('group_trip_expenses').insert({
    group_id: groupId, created_by: userId, paid_by: paidBy, amount_cents: Math.round(amountCents),
    description: String(description || '').trim().slice(0, 80), split_among: splitAmong,
  });
  if (error) throw error;
}

export async function deleteGroupExpense(expenseId) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('group_trip_expenses').delete().eq('id', expenseId);
  if (error) throw error;
}

/** "Mark as paid": one transfer, written by one of its two people. */
export async function markTransferPaid(groupId, userId, { from, to, amountCents }) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('group_trip_settlements').insert({
    group_id: groupId, created_by: userId, from_user: from, to_user: to, amount_cents: Math.round(amountCents),
  });
  if (error) throw error;
}

export async function deleteSettlement(settlementId) {
  const supabase = await getSupabase();
  const { error } = await supabase.from('group_trip_settlements').delete().eq('id', settlementId);
  if (error) throw error;
}

/** Your own payment link: { url, missing }. */
export async function fetchMyPayLink(userId) {
  const supabase = await getSupabase();
  if (!supabase || !userId) return { url: '', missing: true };
  const { data, error } = await supabase.from('pay_links').select('url').eq('user_id', userId).maybeSingle();
  if (error) return { url: '', missing: isMissing(error) };
  return { url: data?.url || '', missing: false };
}

/** Saves your payment link; an empty one removes it. */
export async function saveMyPayLink(userId, url) {
  const supabase = await getSupabase();
  if (!url) {
    const { error } = await supabase.from('pay_links').delete().eq('user_id', userId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('pay_links')
    .upsert({ user_id: userId, url, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}
