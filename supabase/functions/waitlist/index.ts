/**
 * waitlist, Carta's waitlist and newsletter sign-up with double opt-in
 * (T1110, ROADMAP K3). Migration 066 holds the table.
 *
 *   POST {"email","locale","source"}   from the form on the Home page. Stores
 *        the address unconfirmed and mails a confirmation link. The answer is
 *        {"ok":true} whether the address is new, already confirmed or
 *        throttled, so the form cannot be used to find out who is on the
 *        list. Nothing else is ever mailed before the link is clicked.
 *   GET ?a=confirm&e=&x=&t=   the link in the confirmation mail: sets
 *        confirmed_at. The token is an HMAC of action, address and expiry
 *        with WAITLIST_SECRET; confirmation links last 7 days.
 *   GET or POST ?a=unsub&e=&x=0&t=   the unsubscribe link in every mail (and
 *        its List-Unsubscribe-Post form, RFC 8058).
 *
 * Secrets: RESEND_API_KEY, WAITLIST_FROM ("Carta <hello@carta-europetravel.com>"),
 * WAITLIST_SECRET (any long random string), APP_URL (optional). SUPABASE_URL
 * and SUPABASE_SERVICE_ROLE_KEY are set by the platform. Without
 * RESEND_API_KEY, WAITLIST_FROM and WAITLIST_SECRET nothing is stored or sent
 * and the form says "unavailable". Deploy with `--no-verify-jwt`: the links
 * carry no Supabase session and this function checks every door itself.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  cleanEmail, sourceOf, langOf, linkUrl, verifyLink, confirmEmail, resultPage,
} from './logic.mjs';
import { withCors, readJson, bodyProblem } from '../_shared/http.mjs';

const MAX_BODY = 4096;
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

async function send(to: string, mail: { subject: string; text: string; html: string }, unsub: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env('WAITLIST_FROM'),
      to: [to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
  return res.ok;
}

Deno.serve(withCors(async (req) => {
  const secret = env('WAITLIST_SECRET');
  const appUrl = (env('APP_URL') || 'https://www.carta-europetravel.com').replace(/\/+$/, '');
  const base = `${env('SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/waitlist`;
  const configured = !!(secret && env('RESEND_API_KEY') && env('WAITLIST_FROM'));
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const url = new URL(req.url);

  // A link from a mail: confirm or unsubscribe.
  if (url.searchParams.has('t')) {
    if (!secret) return html(503, resultPage('en', 'bad', appUrl));
    if (req.method !== 'GET' && req.method !== 'POST') return json(405, { code: 'method' });
    const a = url.searchParams.get('a') || '';
    const e = url.searchParams.get('e') || '';
    const x = url.searchParams.get('x') || '';
    const t = url.searchParams.get('t') || '';
    if (!(await verifyLink(secret, a, e, x, t))) return html(400, resultPage('en', 'bad', appUrl));
    // A mail scanner that opens the link only prefetches with GET; confirming on GET is
    // the accepted trade for a one-tap flow, and a click is idempotent.
    const { data: row } = await db.from('waitlist_signups').select('locale').eq('email', e).maybeSingle();
    const lang = langOf(row?.locale);
    const { data, error } = await db.rpc(a === 'confirm' ? 'waitlist_confirm' : 'waitlist_unsubscribe', { p_email: e });
    if (error) return html(500, resultPage(lang, 'bad', appUrl));
    if (!data) return html(400, resultPage(lang, 'bad', appUrl));
    return html(200, resultPage(lang, a === 'confirm' ? 'confirm' : 'unsub', appUrl));
  }

  if (req.method !== 'POST') return json(405, { code: 'method' });
  if (!configured) return json(200, { ok: false, code: 'unavailable' });

  let body: Record<string, unknown>;
  try { body = await readJson(req, MAX_BODY); } catch (err) { const p = bodyProblem(err); return json(p.status, { code: p.code }); }
  const email = cleanEmail(body.email);
  if (!email) return json(400, { ok: false, code: 'email' });
  const lang = langOf(body.locale as string);

  const { data: verdict, error } = await db.rpc('waitlist_join', { p_email: email, p_locale: lang, p_source: sourceOf(body.source) });
  if (error) return json(200, { ok: false, code: 'unavailable' });
  if (verdict === 'send') {
    const confirm = await linkUrl(base, secret, 'confirm', email);
    const unsub = await linkUrl(base, secret, 'unsub', email);
    let sent = false;
    try { sent = await send(email, confirmEmail({ lang, confirm, unsub }), unsub); } catch { sent = false; }
    // A failed send must not lock the visitor out for the throttle window.
    if (!sent) {
      await db.from('waitlist_signups').update({ last_sent_at: null }).eq('email', email);
      return json(200, { ok: false, code: 'unavailable' });
    }
  }
  return json(200, { ok: true });
}, { methods: 'GET, POST, OPTIONS', extraOrigins: () => Deno.env.get('ALLOWED_ORIGINS') || '' }));
