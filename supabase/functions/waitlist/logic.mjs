// The waitlist Edge Function's pure rules (T1110, ROADMAP K3): address check,
// the signed confirm and unsubscribe links, the mails and the result pages.
// Plain ES module with no Deno API, so continent-app/tests/waitlist.test.mjs
// runs it under Node.

export const LANGS = ['en', 'nl', 'fr', 'de', 'es', 'it'];
export const ACTIONS = ['confirm', 'unsub'];
/** A confirmation link works for 7 days; an unsubscribe link never expires. */
export const CONFIRM_TTL_MS = 7 * 24 * 3600 * 1000;

export const langOf = (l) => (LANGS.includes(l) ? l : 'en');

/** The address as it is stored, or '' when it is not usable. */
export function cleanEmail(raw) {
  if (typeof raw !== 'string') return '';
  const e = raw.trim().toLowerCase();
  if (e.length < 5 || e.length > 254) return '';
  if (!/^[^@\s<>"',;]+@[^@\s<>"',;]+\.[^@\s<>"',;]+$/.test(e)) return '';
  return e;
}

export const sourceOf = (s) => (typeof s === 'string' && /^[a-z0-9_-]{1,40}$/.test(s) ? s : 'home');

// ------------------------------------------------------------ signed links

const enc = new TextEncoder();

function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

/** HMAC-SHA256 over action, address and expiry (0 = never), 32 characters. */
export async function linkToken(secret, action, email, exp) {
  if (!secret || !ACTIONS.includes(action) || !email) return '';
  return (await hmac(secret, `carta-waitlist:${action}:${email}:${exp}`)).slice(0, 32);
}

/** True only for the token linkToken gives, unexpired; compared in constant time. */
export async function verifyLink(secret, action, email, exp, token, nowMs = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length !== 32 || !cleanEmail(email)) return false;
  const x = Number(exp);
  if (!Number.isInteger(x) || x < 0) return false;
  if (action === 'confirm' && (x === 0 || x < nowMs)) return false;
  if (action === 'unsub' && x !== 0) return false;
  const want = await linkToken(secret, action, email, x);
  if (!want) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i += 1) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export async function linkUrl(base, secret, action, email, nowMs = Date.now()) {
  const exp = action === 'confirm' ? nowMs + CONFIRM_TTL_MS : 0;
  const t = await linkToken(secret, action, email, exp);
  return `${base}?${new URLSearchParams({ a: action, e: email, x: String(exp), t }).toString()}`;
}

// ------------------------------------------------------------------- words

const W = {
  en: {
    confirmSubject: 'Confirm your place on the Carta list',
    confirmBody: 'Thanks for joining the Carta list. Tap the button to confirm this address. Until you do, we send you nothing else and do not use it.',
    confirmButton: 'Confirm my address',
    confirmIgnore: 'If this was not you, ignore this mail: the address is not used and is removed after a month.',
    unsub: 'Unsubscribe',
    pageConfirmed: 'You are on the list',
    pageConfirmedBody: 'Thanks, the address is confirmed. Every mail from us has an unsubscribe link.',
    pageUnsub: 'You are unsubscribed',
    pageUnsubBody: 'Done. We will not mail this address again.',
    pageBad: 'This link does not work. It may have expired: sign up again from the Carta home page.',
    pageBack: 'Back to Carta',
  },
  nl: {
    confirmSubject: 'Bevestig je plek op de Carta-lijst',
    confirmBody: 'Bedankt voor je aanmelding voor de Carta-lijst. Tik op de knop om dit adres te bevestigen. Zolang je dat niet doet, sturen we niets anders en gebruiken we het adres niet.',
    confirmButton: 'Bevestig mijn adres',
    confirmIgnore: 'Was jij dit niet? Negeer deze mail: het adres wordt niet gebruikt en na een maand verwijderd.',
    unsub: 'Uitschrijven',
    pageConfirmed: 'Je staat op de lijst',
    pageConfirmedBody: 'Bedankt, het adres is bevestigd. Elke mail van ons heeft een uitschrijflink.',
    pageUnsub: 'Je bent uitgeschreven',
    pageUnsubBody: 'Klaar. We mailen dit adres niet meer.',
    pageBad: 'Deze link werkt niet. Hij kan verlopen zijn: meld je opnieuw aan via de startpagina van Carta.',
    pageBack: 'Terug naar Carta',
  },
};
export const words = (lang) => W[lang] || W.en;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The confirmation mail: subject, plain text and html, with the unsubscribe link in both. */
export function confirmEmail({ lang, confirm, unsub }) {
  const w = words(lang);
  return {
    subject: w.confirmSubject,
    text: `${w.confirmBody}\n\n${w.confirmButton}: ${confirm}\n\n${w.confirmIgnore}\n${w.unsub}: ${unsub}\n`,
    html: '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2a33">'
      + `<p style="font-size:16px;line-height:1.5">${esc(w.confirmBody)}</p>`
      + `<p><a href="${esc(confirm)}" style="display:inline-block;background:#8c5a2b;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px">${esc(w.confirmButton)}</a></p>`
      + `<p style="font-size:13px;line-height:1.5;color:#5b6670">${esc(w.confirmIgnore)}</p>`
      + `<p style="font-size:13px"><a href="${esc(unsub)}" style="color:#5b6670">${esc(w.unsub)}</a></p></div>`,
  };
}

/** The page a confirm or unsubscribe link opens. kind: 'confirm', 'unsub' or 'bad'. */
export function resultPage(lang, kind, appUrl) {
  const w = words(lang);
  const [title, body] = kind === 'confirm' ? [w.pageConfirmed, w.pageConfirmedBody]
    : kind === 'unsub' ? [w.pageUnsub, w.pageUnsubBody] : ['Carta', w.pageBad];
  return `<!doctype html><html lang="${langOf(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head>`
    + '<body style="margin:0;padding:24px;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">'
    + '<main style="max-width:480px;margin:48px auto;background:#ffffff;border-radius:16px;padding:24px">'
    + `<h1 style="margin:0 0 12px;font-size:20px;color:#1f2a33">${esc(title)}</h1>`
    + `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1f2a33">${esc(body)}</p>`
    + `<p style="margin:0"><a href="${esc(appUrl)}" style="color:#8c5a2b;font-weight:600">${esc(w.pageBack)}</a></p>`
    + '</main></body></html>';
}
