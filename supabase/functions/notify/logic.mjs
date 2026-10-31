/**
 * notify/logic.mjs, the pure half of the notify Edge Function (T944): what
 * is due, what was already sent, the unsubscribe token and the words of
 * each email. No network and no Deno globals, so continent-app's node tests
 * run it (tests/notify.test.mjs). WebCrypto (crypto.subtle) is the same in
 * Deno and in Node 18 and later.
 */

export const LANGS = ['en', 'nl', 'fr', 'de', 'es', 'it'];
export const KINDS = ['trip', 'price', 'all'];

// A clear drop: at least this many euros AND at least this share of the
// price recorded at save time. The page asks with the same rule
// (continent-app/src/lib/priceDrop.js); the test keeps the two equal.
export const DROP_MIN_EUR = 5;
export const DROP_MIN_SHARE = 0.1;
// One price email a day at most, one place at most once a week, five places
// in one email.
export const PRICE_GAP_MS = 20 * 3600 * 1000;
export const PLACE_GAP_MS = 7 * 24 * 3600 * 1000;
export const MAX_DROP_ITEMS = 5;
// A reminder goes 7 days before the first dated stop; day 6 catches a run
// that was missed.
export const REMINDER_DAYS = [7, 6];

export function isClearDrop(was, now) {
  if (!Number.isFinite(was) || !Number.isFinite(now) || was <= 0 || now <= 0) return false;
  const diff = was - now;
  return diff >= DROP_MIN_EUR && diff >= was * DROP_MIN_SHARE;
}

export const langOf = (l) => (LANGS.includes(l) ? l : 'en');

// ---------------------------------------------------------------- tokens

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

/** The token in an unsubscribe link: HMAC-SHA256 of the account and kind. */
export async function unsubToken(secret, userId, kind) {
  if (!secret || !userId || !KINDS.includes(kind)) return '';
  return (await hmac(secret, `carta-unsubscribe:${userId}:${kind}`)).slice(0, 32);
}

/** True only for the token unsubToken gives; compared in constant time. */
export async function verifyUnsub(secret, userId, kind, token) {
  if (!secret || typeof token !== 'string' || token.length !== 32) return false;
  if (!/^[0-9a-f-]{36}$/i.test(String(userId || ''))) return false;
  const want = await unsubToken(secret, userId, kind);
  if (!want) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i += 1) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export async function unsubUrl(base, secret, userId, kind) {
  const t = await unsubToken(secret, userId, kind);
  const q = new URLSearchParams({ u: userId, k: kind, t });
  return `${base}?${q.toString()}`;
}

// ---------------------------------------------------------------- send once

export const reminderRef = (row) => `trip:${row.trip_plan_id}:${row.starts}`;
export const dropRef = (key, dayIso) => `price:${key}:${dayIso}`;

/** Whole days from today (YYYY-MM-DD, UTC) to a date. */
export function daysUntil(today, date) {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * The reminders to send today: candidate rows (notify_reminder_candidates)
 * whose trip starts in 7 days (or 6, a missed run), one per trip and start
 * date, minus every ref already in the log.
 */
export function pickReminders(rows, sentRefs, today) {
  const sent = sentRefs instanceof Set ? sentRefs : new Set(sentRefs || []);
  const out = [];
  const seen = new Set();
  for (const r of rows || []) {
    if (!r || !r.user_id || !r.email || !r.trip_plan_id || !r.starts) continue;
    const days = daysUntil(today, r.starts);
    if (!REMINDER_DAYS.includes(days)) continue;
    const ref = reminderRef(r);
    if (sent.has(`${r.user_id}|${ref}`) || seen.has(`${r.user_id}|${ref}`)) continue;
    seen.add(`${r.user_id}|${ref}`);
    out.push({ ...r, days, ref });
  }
  return out;
}

const KEY_OK = /^dest:[A-Za-z0-9_-]{1,40}$/;

/**
 * What the page reported, cleaned: only destination saves, whole euros, a
 * clear drop, a name. `recent` is this account's price_drop log of the last
 * week ({ ref, sent_at }). Nothing when a price email went out in the last
 * 20 hours; a place mailed in the last week is left out; five at most.
 */
export function pickDrops(items, recent, nowMs, dayIso) {
  const log = Array.isArray(recent) ? recent : [];
  if (log.some((r) => nowMs - Date.parse(r.sent_at) < PRICE_GAP_MS)) return [];
  const recentKeys = new Set(log
    .filter((r) => nowMs - Date.parse(r.sent_at) < PLACE_GAP_MS)
    .map((r) => String(r.ref || '').replace(/^price:/, '').replace(/:\d{4}-\d{2}-\d{2}$/, '')));
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== 'object') continue;
    const key = String(it.key || '');
    const city = String(it.city || '').trim().slice(0, 80);
    const was = Math.round(Number(it.was));
    const now = Math.round(Number(it.now));
    if (!KEY_OK.test(key) || !city || seen.has(key) || recentKeys.has(key)) continue;
    if (was > 5000 || !isClearDrop(was, now)) continue;
    seen.add(key);
    out.push({ key, city, was, now, ref: dropRef(key, dayIso) });
    if (out.length >= MAX_DROP_ITEMS) break;
  }
  return out;
}

// ---------------------------------------------------------------- words

const LOCALE = { en: 'en-GB', nl: 'nl-NL', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', it: 'it-IT' };

export function euros(n, lang) {
  return new Intl.NumberFormat(LOCALE[langOf(lang)], { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export function longDate(iso, lang) {
  return new Intl.DateTimeFormat(LOCALE[langOf(lang)], { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${String(iso).slice(0, 10)}T12:00:00Z`));
}

const W = {
  en: {
    tripSubject: '{name} starts in {n} days',
    tripBody: 'Your trip to {places} starts on {date}.',
    tripOpen: 'Open your trip',
    dropSubjectOne: '{city} costs less now',
    dropSubjectMany: 'Places you saved cost less now',
    dropLine: '{city}: {now} a person a day, {was} when you saved it.',
    dropOpen: 'Open your saved places',
    whyTrip: 'You get this email because you turned on trip reminders in Carta.',
    whyPrice: 'You get this email because you turned on price drops in Carta.',
    unsub: 'Unsubscribe',
    trip: 'your trip',
    pageTitle: 'Unsubscribed',
    pageOk: 'You will get no more of these emails from Carta.',
    pageBad: 'This link did not work. Turn emails off in Carta, under Account, Preferences.',
    pageBack: 'Open Carta',
  },
  nl: {
    tripSubject: '{name} begint over {n} dagen',
    tripBody: 'Je reis naar {places} begint op {date}.',
    tripOpen: 'Open je reis',
    dropSubjectOne: '{city} kost nu minder',
    dropSubjectMany: 'Plekken die je bewaarde kosten nu minder',
    dropLine: '{city}: {now} per persoon per dag, {was} toen je het bewaarde.',
    dropOpen: 'Open je bewaarde plekken',
    whyTrip: 'Je krijgt deze e-mail omdat je reisherinneringen aanzette in Carta.',
    whyPrice: 'Je krijgt deze e-mail omdat je prijsdalingen aanzette in Carta.',
    unsub: 'Afmelden',
    trip: 'je reis',
    pageTitle: 'Afgemeld',
    pageOk: 'Je krijgt deze e-mails van Carta niet meer.',
    pageBad: 'Deze link werkte niet. Zet e-mails uit in Carta, bij Account, Voorkeuren.',
    pageBack: 'Open Carta',
  },
  fr: {
    tripSubject: '{name} commence dans {n} jours',
    tripBody: 'Votre voyage à {places} commence le {date}.',
    tripOpen: 'Ouvrir votre voyage',
    dropSubjectOne: '{city} coûte moins cher',
    dropSubjectMany: 'Des lieux enregistrés coûtent moins cher',
    dropLine: '{city} : {now} par personne et par jour, {was} quand vous l’avez enregistré.',
    dropOpen: 'Ouvrir vos lieux enregistrés',
    whyTrip: 'Vous recevez cet e-mail car vous avez activé les rappels de voyage dans Carta.',
    whyPrice: 'Vous recevez cet e-mail car vous avez activé les baisses de prix dans Carta.',
    unsub: 'Se désabonner',
    trip: 'votre voyage',
    pageTitle: 'Désabonné',
    pageOk: 'Vous ne recevrez plus ces e-mails de Carta.',
    pageBad: 'Ce lien n’a pas fonctionné. Désactivez les e-mails dans Carta, sous Compte, Préférences.',
    pageBack: 'Ouvrir Carta',
  },
  de: {
    tripSubject: '{name} beginnt in {n} Tagen',
    tripBody: 'Deine Reise nach {places} beginnt am {date}.',
    tripOpen: 'Reise öffnen',
    dropSubjectOne: '{city} kostet jetzt weniger',
    dropSubjectMany: 'Gemerkte Orte kosten jetzt weniger',
    dropLine: '{city}: {now} pro Person und Tag, {was} beim Merken.',
    dropOpen: 'Gemerkte Orte öffnen',
    whyTrip: 'Du bekommst diese E-Mail, weil du Reiseerinnerungen in Carta eingeschaltet hast.',
    whyPrice: 'Du bekommst diese E-Mail, weil du Preissenkungen in Carta eingeschaltet hast.',
    unsub: 'Abmelden',
    trip: 'deine Reise',
    pageTitle: 'Abgemeldet',
    pageOk: 'Du bekommst diese E-Mails von Carta nicht mehr.',
    pageBad: 'Dieser Link hat nicht funktioniert. Schalte E-Mails in Carta unter Konto, Einstellungen aus.',
    pageBack: 'Carta öffnen',
  },
  es: {
    tripSubject: '{name} empieza en {n} días',
    tripBody: 'Tu viaje a {places} empieza el {date}.',
    tripOpen: 'Abrir tu viaje',
    dropSubjectOne: '{city} cuesta menos ahora',
    dropSubjectMany: 'Lugares que guardaste cuestan menos ahora',
    dropLine: '{city}: {now} por persona y día, {was} cuando lo guardaste.',
    dropOpen: 'Abrir tus lugares guardados',
    whyTrip: 'Recibes este correo porque activaste los recordatorios de viaje en Carta.',
    whyPrice: 'Recibes este correo porque activaste las bajadas de precio en Carta.',
    unsub: 'Darse de baja',
    trip: 'tu viaje',
    pageTitle: 'Baja confirmada',
    pageOk: 'Ya no recibirás estos correos de Carta.',
    pageBad: 'Este enlace no ha funcionado. Desactiva los correos en Carta, en Cuenta, Preferencias.',
    pageBack: 'Abrir Carta',
  },
  it: {
    tripSubject: '{name} inizia tra {n} giorni',
    tripBody: 'Il tuo viaggio a {places} inizia {date}.',
    tripOpen: 'Apri il tuo viaggio',
    dropSubjectOne: '{city} costa meno ora',
    dropSubjectMany: 'Luoghi salvati costano meno ora',
    dropLine: '{city}: {now} a persona al giorno, {was} quando l’hai salvato.',
    dropOpen: 'Apri i luoghi salvati',
    whyTrip: 'Ricevi questa email perché hai attivato i promemoria di viaggio in Carta.',
    whyPrice: 'Ricevi questa email perché hai attivato i cali di prezzo in Carta.',
    unsub: 'Annulla iscrizione',
    trip: 'il tuo viaggio',
    pageTitle: 'Iscrizione annullata',
    pageOk: 'Non riceverai più queste email da Carta.',
    pageBad: 'Questo link non ha funzionato. Disattiva le email in Carta, in Account, Preferenze.',
    pageBack: 'Apri Carta',
  },
};

export const words = (lang) => W[langOf(lang)];

const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? String(v[k]) : ''));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function listOf(names, lang) {
  try { return new Intl.ListFormat(LOCALE[langOf(lang)], { type: 'conjunction' }).format(names); } catch { return names.join(', '); }
}

// One quiet layout for every email: Carta's ink on white, one brown link
// (the hex values of --text, --text-2, --surface-page and --action in
// continent-app/src/styles/01-tokens.css, since an email has no stylesheet),
// system fonts (an email client loads no web font reliably).
function shell(lang, lines, cta, why, unsub) {
  const w = words(lang);
  const body = lines.map((l) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:#1f2a33">${esc(l)}</p>`).join('');
  return `<!doctype html><html lang="${langOf(lang)}"><body style="margin:0;padding:24px;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">`
    + '<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:24px">'
    + '<p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1f2a33">Carta</p>'
    + body
    + `<p style="margin:16px 0 0"><a href="${esc(cta.href)}" style="color:#8c5a2b;font-weight:600;font-size:16px">${esc(cta.label)}</a></p>`
    + '</div>'
    + `<p style="max-width:520px;margin:16px auto 0;font-size:13px;line-height:1.5;color:#44515c">${esc(why)} <a href="${esc(unsub)}" style="color:#44515c">${esc(w.unsub)}</a></p>`
    + '</body></html>';
}

/** The trip reminder: subject, text and html. */
export function reminderEmail({ lang, label, places, starts, days, appUrl, unsub }) {
  const w = words(lang);
  const names = (places || []).filter(Boolean);
  const name = String(label || '').trim() || (names[0] ? names[0] : w.trip);
  const subject = fill(w.tripSubject, { name, n: days });
  const line = fill(w.tripBody, { places: listOf(names.length ? names : [name], lang), date: longDate(starts, lang) });
  const href = `${appUrl}/?tab=trips`;
  return {
    subject,
    text: `${line}\n\n${w.tripOpen}: ${href}\n\n${w.whyTrip}\n${w.unsub}: ${unsub}\n`,
    html: shell(lang, [line], { href, label: w.tripOpen }, w.whyTrip, unsub),
  };
}

/** The price drop email for one to five places. */
export function dropEmail({ lang, items, appUrl, unsub }) {
  const w = words(lang);
  const lines = items.map((it) => fill(w.dropLine, { city: it.city, now: euros(it.now, lang), was: euros(it.was, lang) }));
  const subject = items.length === 1 ? fill(w.dropSubjectOne, { city: items[0].city }) : w.dropSubjectMany;
  const href = `${appUrl}/?tab=trips`;
  return {
    subject,
    text: `${lines.join('\n')}\n\n${w.dropOpen}: ${href}\n\n${w.whyPrice}\n${w.unsub}: ${unsub}\n`,
    html: shell(lang, lines, { href, label: w.dropOpen }, w.whyPrice, unsub),
  };
}

/** The page an unsubscribe link opens. */
export function unsubPage(lang, ok, appUrl) {
  const w = words(lang);
  return `<!doctype html><html lang="${langOf(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(w.pageTitle)}</title></head>`
    + '<body style="margin:0;padding:24px;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">'
    + '<main style="max-width:480px;margin:48px auto;background:#ffffff;border-radius:16px;padding:24px">'
    + `<h1 style="margin:0 0 12px;font-size:20px;color:#1f2a33">${esc(ok ? w.pageTitle : 'Carta')}</h1>`
    + `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1f2a33">${esc(ok ? w.pageOk : w.pageBad)}</p>`
    + `<p style="margin:0"><a href="${esc(appUrl)}" style="color:#8c5a2b;font-weight:600">${esc(w.pageBack)}</a></p>`
    + '</main></body></html>';
}

/** Which switch an unsubscribe kind turns off. */
export function unsubPatch(kind) {
  if (kind === 'trip') return { trip_reminders: false };
  if (kind === 'price') return { price_drops: false };
  if (kind === 'all') return { trip_reminders: false, price_drops: false };
  return null;
}
