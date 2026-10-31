/**
 * notify, Carta's opt-in emails (T944): trip reminders and price drops on
 * saved places, sent through Resend's HTTP API, only to accounts that turned
 * the switch on (public.email_prefs, migration 060).
 *
 * Three doors:
 *
 *   POST {"job":"reminders"}   from pg_cron (migration 060), with the header
 *        x-notify-secret: NOTIFY_SECRET. Every trip whose first dated stop
 *        starts in 7 days (6 catches a missed run) gets one email.
 *   POST {"kind":"price","items":[{key,city,was,now}]}   from the page, with
 *        the traveller's own session. Day prices are computed in the browser
 *        from the traveller's settings, so the page reports a clear drop
 *        against the price recorded at save time; this checks the switch,
 *        cleans the items and rate limits (logic.mjs pickDrops).
 *   GET or POST ?u=&k=&t=   the one-click unsubscribe link in every email
 *        (and its List-Unsubscribe-Post form, RFC 8058). k is trip, price or
 *        all; t is an HMAC of the account and k with NOTIFY_SECRET.
 *
 * Send once: before an email goes out its row is claimed in email_log
 * (unique on user, kind, ref); a failed send removes the claim, so the next
 * run tries again and a success is never repeated.
 *
 * Secrets: RESEND_API_KEY, NOTIFY_FROM ("Carta <trips@carta-europetravel.com>"),
 * NOTIFY_SECRET (any long random string, also the vault secret
 * notify_secret), APP_URL (optional, default https://www.carta-europetravel.com).
 * SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are set by the
 * platform. Without RESEND_API_KEY or NOTIFY_FROM nothing is sent.
 * Deploy with `--no-verify-jwt`: the cron call and the unsubscribe link carry
 * no Supabase session, and this function checks every door itself.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  KINDS, langOf, pickDrops, pickReminders, dropEmail, reminderEmail,
  unsubPage, unsubPatch, unsubUrl, verifyUnsub,
} from './logic.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(
  JSON.stringify(body),
  { status, headers: { ...CORS, 'Content-Type': 'application/json' } },
);
const html = (status: number, body: string) => new Response(
  body,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
);

const env = (k: string) => Deno.env.get(k) || '';
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// deno-lint-ignore no-explicit-any
type Db = any;

async function send(to: string, mail: { subject: string; text: string; html: string }, unsub: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env('NOTIFY_FROM'),
      to: [to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      headers: {
        'List-Unsubscribe': `<${unsub}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  });
  return res.ok;
}

/** Claim, send, and release the claim when the send fails. */
async function sendOnce(db: Db, userId: string, kind: string, refs: string[], doSend: () => Promise<boolean>) {
  const rows = refs.map((ref) => ({ user_id: userId, kind, ref }));
  const { data, error } = await db.from('email_log')
    .upsert(rows, { onConflict: 'user_id,kind,ref', ignoreDuplicates: true })
    .select('ref');
  if (error) return false;
  const claimed = (data || []).map((r: { ref: string }) => r.ref);
  if (claimed.length !== refs.length) {
    // Another run holds some of them: give back what this run claimed.
    if (claimed.length) await db.from('email_log').delete().eq('user_id', userId).eq('kind', kind).in('ref', claimed);
    return false;
  }
  let ok = false;
  try { ok = await doSend(); } catch { ok = false; }
  if (!ok) await db.from('email_log').delete().eq('user_id', userId).eq('kind', kind).in('ref', refs);
  return ok;
}

async function runReminders(db: Db, base: string, secret: string, appUrl: string) {
  const now = Date.now();
  const today = isoDay(now);
  const { data: rows, error } = await db.rpc('notify_reminder_candidates', {
    p_from: isoDay(now + 6 * 86400000), p_to: isoDay(now + 7 * 86400000),
  });
  if (error) return { code: 'candidates_failed' };
  const users = [...new Set((rows || []).map((r: { user_id: string }) => r.user_id))];
  const sent = new Set<string>();
  if (users.length) {
    const { data: log } = await db.from('email_log').select('user_id, ref')
      .eq('kind', 'trip_reminder').in('user_id', users);
    for (const r of log || []) sent.add(`${r.user_id}|${r.ref}`);
  }
  let n = 0;
  for (const r of pickReminders(rows || [], sent, today)) {
    const unsub = await unsubUrl(base, secret, r.user_id, 'trip');
    const mail = reminderEmail({ lang: langOf(r.lang), label: r.label, places: r.places, starts: r.starts, days: r.days, appUrl, unsub });
    if (await sendOnce(db, r.user_id, 'trip_reminder', [r.ref], () => send(r.email, mail, unsub))) n += 1;
  }
  return { sent: n };
}

async function runPrice(req: Request, body: Record<string, unknown>, db: Db, base: string, secret: string, appUrl: string) {
  const authed = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  });
  const { data: userData } = await authed.auth.getUser();
  const user = userData?.user;
  if (!user?.email) return json(401, { code: 'auth' });
  const { data: prefs } = await db.from('email_prefs').select('price_drops, lang').eq('user_id', user.id).maybeSingle();
  if (!prefs?.price_drops) return json(200, { sent: 0, code: 'off' });
  const now = Date.now();
  const { data: recent } = await db.from('email_log').select('ref, sent_at')
    .eq('user_id', user.id).eq('kind', 'price_drop')
    .gte('sent_at', new Date(now - 7 * 86400000).toISOString());
  const items = pickDrops(body.items, recent || [], now, isoDay(now));
  if (!items.length) return json(200, { sent: 0, code: 'nothing' });
  const unsub = await unsubUrl(base, secret, user.id, 'price');
  const mail = dropEmail({ lang: langOf(prefs.lang), items, appUrl, unsub });
  const ok = await sendOnce(db, user.id, 'price_drop', items.map((i) => i.ref), () => send(user.email!, mail, unsub));
  return json(200, { sent: ok ? 1 : 0 });
}

async function runUnsubscribe(url: URL, db: Db, secret: string, appUrl: string) {
  const u = url.searchParams.get('u') || '';
  const k = url.searchParams.get('k') || '';
  const t = url.searchParams.get('t') || '';
  const okToken = KINDS.includes(k) && await verifyUnsub(secret, u, k, t);
  if (!okToken) return html(400, unsubPage('en', false, appUrl));
  const { data: prefs } = await db.from('email_prefs').select('lang').eq('user_id', u).maybeSingle();
  const lang = langOf(prefs?.lang);
  const { error } = await db.from('email_prefs').update(unsubPatch(k)).eq('user_id', u);
  return html(error ? 500 : 200, unsubPage(lang, !error, appUrl));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const secret = env('NOTIFY_SECRET');
  const appUrl = (env('APP_URL') || 'https://www.carta-europetravel.com').replace(/\/+$/, '');
  const base = `${env('SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/notify`;
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const url = new URL(req.url);

  // The unsubscribe link: a GET from the email, or the one-click POST a mail
  // client makes from List-Unsubscribe-Post. Both carry u, k and t.
  if (url.searchParams.has('t')) {
    if (!secret) return html(503, unsubPage('en', false, appUrl));
    if (req.method !== 'GET' && req.method !== 'POST') return json(405, { code: 'method' });
    return runUnsubscribe(url, db, secret, appUrl);
  }
  if (req.method !== 'POST') return json(405, { code: 'method' });

  // No email goes out until the owner sets the secrets.
  if (!env('RESEND_API_KEY') || !env('NOTIFY_FROM') || !secret) return json(200, { sent: 0, code: 'not_configured' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { code: 'bad_json' }); }

  if (body.job === 'reminders') {
    if (req.headers.get('x-notify-secret') !== secret) return json(401, { code: 'auth' });
    return json(200, await runReminders(db, base, secret, appUrl));
  }
  if (body.kind === 'price') return runPrice(req, body, db, base, secret, appUrl);
  return json(400, { code: 'bad_request' });
});
