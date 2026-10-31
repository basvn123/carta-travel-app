/**
 * emailPrefs.js, the two opt-in email switches (T944): trip reminders and
 * price drops on saved places, both off by default, one row per account in
 * public.email_prefs (migration 060). The notify Edge Function reads the
 * same row before it sends anything.
 *
 * Each call answers and never throws:
 *   { state: 'ok', prefs }        the row, or both off when there is none
 *   { state: 'missing' }          migration 060 is not applied: Account
 *                                 hides the Emails group, the page sends no
 *                                 price drop requests
 *   { state: 'error' }            the network or the database said no
 *
 * The ?accountmock seam keeps the switches in memory.
 */
import { getSupabase } from '../../lib/supabaseClient.js';
import { IS_ACCOUNT_MOCK } from './accountMock.js';

export const EMAILS_OFF = Object.freeze({ trip_reminders: false, price_drops: false });
const LANGS = ['en', 'nl', 'fr', 'de', 'es', 'it'];

let mock = { ...EMAILS_OFF };
// One read per account per page load; a save replaces it.
let cached = null; // { userId, res }

const isMissing = (error) => {
  const code = String(error?.code || '');
  return code === 'PGRST205' || code === '42P01' || /email_prefs/.test(String(error?.message || '')) && /not find|does not exist/i.test(String(error?.message || ''));
};

const pick = (row) => ({ trip_reminders: !!row?.trip_reminders, price_drops: !!row?.price_drops });

export async function loadEmailPrefs(userId) {
  if (IS_ACCOUNT_MOCK) return { state: 'ok', prefs: { ...mock } };
  if (!userId) return { state: 'error' };
  if (cached?.userId === userId) return cached.res;
  const supabase = await getSupabase().catch(() => null);
  if (!supabase) return { state: 'error' };
  try {
    const { data, error } = await supabase.from('email_prefs')
      .select('trip_reminders, price_drops').eq('user_id', userId).maybeSingle();
    if (error) return { state: isMissing(error) ? 'missing' : 'error' };
    const res = { state: 'ok', prefs: data ? pick(data) : { ...EMAILS_OFF } };
    cached = { userId, res };
    return res;
  } catch {
    return { state: 'error' };
  }
}

/** Writes both switches and the email language; the database stamps consent. */
export async function saveEmailPrefs(userId, prefs, lang) {
  const next = pick(prefs);
  if (IS_ACCOUNT_MOCK) { mock = next; return { state: 'ok', prefs: { ...mock } }; }
  if (!userId) return { state: 'error' };
  const supabase = await getSupabase().catch(() => null);
  if (!supabase) return { state: 'error' };
  try {
    const { error } = await supabase.from('email_prefs').upsert({
      user_id: userId, ...next, lang: LANGS.includes(lang) ? lang : 'en',
    }, { onConflict: 'user_id' });
    if (error) return { state: isMissing(error) ? 'missing' : 'error' };
    const res = { state: 'ok', prefs: next };
    cached = { userId, res };
    return res;
  } catch {
    return { state: 'error' };
  }
}
