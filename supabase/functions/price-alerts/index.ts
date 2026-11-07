/**
 * price-alerts, Carta's price alert emails (T1205, ROADMAP I17). Migration
 * 073 holds the tables; pipeline/price_alerts.py on the box prices the
 * alerts after each data refresh and calls this function.
 *
 * Doors:
 *
 *   POST {"job":"optin","lang"}   from the page, the traveller's own session,
 *        right after price_alert_save answered "confirmed": false. Mails the
 *        one confirmation link of the double opt-in (at most once in 10
 *        minutes). No alert email goes out before that link is clicked.
 *   GET or POST ?a=confirm|unsub&u=&x=&t=   the links in the emails: the
 *        confirmation, and the one-click unsubscribe (also the
 *        List-Unsubscribe-Post form, RFC 8058). t is an HMAC of action,
 *        account and expiry with PRICE_ALERTS_LINK_SECRET.
 *   POST {"job":"open"}   from the box, header x-alerts-secret: the alerts to
 *        price (id, kind, spec, share, baseline). No address, no account id.
 *   POST {"job":"check","items":[{"id","eur"}]}   from the box: each total is
 *        recorded (price_alert_record); an alert that fell by its share is
 *        marked fired in the same statement and mailed once. A failed send
 *        releases it for the next run.
 *   POST {"job":"purge"}   from the box after each run: alerts 30 days past
 *        expiry or firing are deleted.
 *
 * The flag: nothing at all happens until PRICE_ALERTS_ENABLED is "1" and the
 * secrets are set; every door then answers {"code":"off"}.
 *
 * Secrets: RESEND_API_KEY (the I6 Resend key), PRICE_ALERTS_FROM ("Carta
 * <alerts@carta-europetravel.com>"), PRICE_ALERTS_LINK_SECRET (signs the
 * links), PRICE_ALERTS_BOX_SECRET (the box's header; the box never holds the
 * service role key), PRICE_ALERTS_ENABLED, APP_URL (optional). SUPABASE_URL,
 * SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are set by the platform.
 * Deploy with `--no-verify-jwt`: the box and the links carry no Supabase
 * session, and this function checks every door itself.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  langOf, cleanChecks, linkUrl, verifyLink, optinEmail, dropEmail, openUrl, resultPage,
} from './logic.mjs';
import { withCors, readJson, bodyProblem, secretMatches } from '../_shared/http.mjs';

const MAX_BODY = 262144;
const CORS = {
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

// deno-lint-ignore no-explicit-any
type Db = any;

async function send(to: string, mail: { subject: string; text: string; html: string }, unsub: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env('PRICE_ALERTS_FROM'),
      to: [to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
  return res.ok;
}

async function runOptin(req: Request, body: Record<string, unknown>, db: Db, base: string, secret: string) {
  const authed = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  });
  const { data: userData } = await authed.auth.getUser();
  const user = userData?.user;
  if (!user?.email) return json(401, { code: 'auth' });
  const { data: verdict, error } = await db.rpc('price_alert_optin_claim', { p_user: user.id });
  if (error) return json(200, { ok: false, code: 'unavailable' });
  if (verdict !== 'send') return json(200, { ok: true, code: verdict });
  const { data: row } = await db.from('price_alert_consent').select('lang').eq('user_id', user.id).maybeSingle();
  const lang = langOf((row?.lang as string) || (body.lang as string));
  const confirm = await linkUrl(base, secret, 'confirm', user.id);
  const unsub = await linkUrl(base, secret, 'unsub', user.id);
  let sent = false;
  try { sent = await send(user.email, optinEmail({ lang, confirm, unsub }), unsub); } catch { sent = false; }
  if (!sent) {
    await db.rpc('price_alert_optin_unclaim', { p_user: user.id });
    return json(200, { ok: false, code: 'unavailable' });
  }
  return json(200, { ok: true, code: 'sent' });
}

async function runCheck(body: Record<string, unknown>, db: Db, base: string, secret: string, appUrl: string) {
  const items = cleanChecks(body.items);
  const out = { checked: 0, armed: 0, held: 0, fired: 0, sent: 0, failed: 0, gone: 0 };
  for (const it of items) {
    const { data: verdict, error } = await db.rpc('price_alert_record', { p_id: it.id, p_eur: it.eur });
    if (error) { out.failed += 1; continue; }
    out.checked += 1;
    if (verdict === 'armed') { out.armed += 1; continue; }
    if (verdict === 'hold') { out.held += 1; continue; }
    if (verdict !== 'fire') { out.gone += 1; continue; }
    out.fired += 1;
    const { data: rows } = await db.rpc('price_alert_mail', { p_id: it.id });
    const m = Array.isArray(rows) ? rows[0] : null;
    let ok = false;
    if (m?.email) {
      const unsub = await linkUrl(base, secret, 'unsub', m.user_id);
      const mail = dropEmail({
        lang: langOf(m.lang), label: m.label, was: m.baseline_eur, now: m.fired_eur,
        since: m.armed_at, open: openUrl(appUrl), unsub,
      });
      try { ok = await send(m.email, mail, unsub); } catch { ok = false; }
    }
    if (ok) out.sent += 1;
    else { out.failed += 1; await db.rpc('price_alert_release', { p_id: it.id }); }
  }
  return out;
}

Deno.serve(withCors(async (req) => {
  const linkSecret = env('PRICE_ALERTS_LINK_SECRET');
  const boxSecret = env('PRICE_ALERTS_BOX_SECRET');
  const appUrl = (env('APP_URL') || 'https://www.carta-europetravel.com').replace(/\/+$/, '');
  const base = `${env('SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/price-alerts`;
  const on = env('PRICE_ALERTS_ENABLED') === '1' && !!linkSecret && !!boxSecret
    && !!env('RESEND_API_KEY') && !!env('PRICE_ALERTS_FROM');
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const url = new URL(req.url);

  // A link from an email. An unsubscribe must work even with the flag off.
  if (url.searchParams.has('t')) {
    if (!linkSecret) return html(503, resultPage('en', 'bad', appUrl));
    if (req.method !== 'GET' && req.method !== 'POST') return json(405, { code: 'method' });
    const a = url.searchParams.get('a') || '';
    const u = url.searchParams.get('u') || '';
    const x = url.searchParams.get('x') || '';
    const t = url.searchParams.get('t') || '';
    if (!(await verifyLink(linkSecret, a, u, x, t))) return html(400, resultPage('en', 'bad', appUrl));
    const { data: row } = await db.from('price_alert_consent').select('lang').eq('user_id', u).maybeSingle();
    const lang = langOf(row?.lang);
    const { data, error } = await db.rpc(a === 'confirm' ? 'price_alert_confirm' : 'price_alert_unsubscribe', { p_user: u });
    // The one-click POST from a mail client wants a bare 200.
    if (req.method === 'POST' && a === 'unsub') return new Response(null, { status: error ? 500 : 200 });
    if (error) return html(500, resultPage(lang, 'bad', appUrl));
    if (!data) return html(400, resultPage(lang, 'bad', appUrl));
    return html(200, resultPage(lang, a === 'confirm' ? 'confirm' : 'unsub', appUrl));
  }

  if (req.method !== 'POST') return json(405, { code: 'method' });
  if (!on) return json(200, { ok: false, code: 'off' });

  let body: Record<string, unknown>;
  try { body = await readJson(req, MAX_BODY); } catch (err) { const p = bodyProblem(err); return json(p.status, { code: p.code }); }

  if (body.job === 'optin') return runOptin(req, body, db, base, linkSecret);

  if (!(await secretMatches(req.headers.get('x-alerts-secret') || '', boxSecret))) return json(401, { code: 'auth' });
  if (body.job === 'open') {
    const { data, error } = await db.rpc('price_alerts_open');
    if (error) return json(500, { code: 'unavailable' });
    return json(200, { alerts: data || [] });
  }
  if (body.job === 'check') return json(200, await runCheck(body, db, base, linkSecret, appUrl));
  if (body.job === 'purge') {
    const { data, error } = await db.rpc('price_alert_purge');
    return json(error ? 500 : 200, { purged: error ? 0 : data });
  }
  return json(400, { code: 'bad_request' });
}, { methods: 'GET, POST, OPTIONS', extraOrigins: () => Deno.env.get('ALLOWED_ORIGINS') || '' }));
