/**
 * price-alerts/logic.mjs, the pure half of the price-alerts Edge Function
 * (T1205, ROADMAP I17): the signed opt-in and unsubscribe links, the box's
 * payload check, the drop rule and the words of both emails in six
 * languages. No network and no Deno globals, so continent-app's node tests
 * run it (tests/priceAlerts.test.mjs). WebCrypto is the same in Deno and Node.
 */

export const LANGS = ['en', 'nl', 'fr', 'de', 'es', 'it'];
export const ACTIONS = ['confirm', 'unsub'];
/** The shares a traveller can choose; migration 073 checks the same three. */
export const SHARES = [0.05, 0.1, 0.2];
/** A confirmation link works for 7 days; an unsubscribe link never expires. */
export const CONFIRM_TTL_MS = 7 * 24 * 3600 * 1000;
/** The most checks one box request may carry. */
export const MAX_CHECKS = 2000;

export const langOf = (l) => (LANGS.includes(l) ? l : 'en');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s) => typeof s === 'string' && UUID.test(s);

/**
 * The drop rule, the same as price_alert_record in 073: the alert fires when
 * the total is at or below the baseline less the share, rounded down.
 */
export function isDue(baseline, eur, share) {
  if (!(baseline > 0) || !(eur > 0) || !SHARES.includes(Number(share))) return false;
  return eur <= Math.floor(baseline * (1 - Number(share)));
}

/** The box's checks, cleaned: a known id once, a whole euro total in range. */
export function cleanChecks(items) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== 'object' || !isUuid(it.id) || seen.has(it.id)) continue;
    const eur = Math.round(Number(it.eur));
    if (!Number.isFinite(eur) || eur <= 0 || eur > 100000) continue;
    seen.add(it.id);
    out.push({ id: it.id, eur });
    if (out.length >= MAX_CHECKS) break;
  }
  return out;
}

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

/** HMAC-SHA256 over action, account and expiry (0 = never), 32 characters. */
export async function linkToken(secret, action, userId, exp) {
  if (!secret || !ACTIONS.includes(action) || !isUuid(userId)) return '';
  return (await hmac(secret, `carta-price-alerts:${action}:${userId.toLowerCase()}:${exp}`)).slice(0, 32);
}

/** True only for the token linkToken gives, unexpired; compared in constant time. */
export async function verifyLink(secret, action, userId, exp, token, nowMs = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length !== 32 || !isUuid(userId)) return false;
  const x = Number(exp);
  if (!Number.isInteger(x) || x < 0) return false;
  if (action === 'confirm' && (x === 0 || x < nowMs)) return false;
  if (action === 'unsub' && x !== 0) return false;
  const want = await linkToken(secret, action, userId, x);
  if (!want) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i += 1) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export async function linkUrl(base, secret, action, userId, nowMs = Date.now()) {
  const exp = action === 'confirm' ? nowMs + CONFIRM_TTL_MS : 0;
  const t = await linkToken(secret, action, userId, exp);
  return `${base}?${new URLSearchParams({ a: action, u: userId, x: String(exp), t }).toString()}`;
}

// ------------------------------------------------------------------- words

const LOCALE = { en: 'en-GB', nl: 'nl-NL', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', it: 'it-IT' };

export function euros(n, lang) {
  return new Intl.NumberFormat(LOCALE[langOf(lang)], { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export function shortDate(iso, lang) {
  return new Intl.DateTimeFormat(LOCALE[langOf(lang)], { day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${String(iso).slice(0, 10)}T12:00:00Z`));
}

const W = {
  en: {
    optinSubject: 'Confirm your Carta price alerts',
    optinBody: 'You asked Carta to email you when a place or trip you saved gets cheaper. Tap the button to confirm this address. Until you do, we send you no price alert.',
    optinButton: 'Confirm price alerts',
    optinIgnore: 'If this was not you, ignore this email: nothing will be sent.',
    dropSubject: '{label} is {pct} cheaper',
    dropBody: '{label}: Carta now estimates {now}, against {was} when we first checked on {date}.',
    dropNote: 'This is Carta\'s estimate from the latest stay and flight prices, not a booking quote. This alert is now done: save it again to watch the new price.',
    dropOpen: 'Open in Carta',
    why: 'You get this email because you saved a price alert in Carta and confirmed your address.',
    unsub: 'Unsubscribe from price alerts',
    pageConfirmed: 'Price alerts are on',
    pageConfirmedBody: 'Thanks, the address is confirmed. We email you once when an alert\'s total falls by the share you chose.',
    pageUnsub: 'You are unsubscribed',
    pageUnsubBody: 'Done. We will send you no more price alerts. Saving an alert again asks you to confirm again.',
    pageBad: 'This link does not work. It may have expired: save the alert again in Carta.',
    pageBack: 'Back to Carta',
  },
  nl: {
    optinSubject: 'Bevestig je prijsalerts van Carta',
    optinBody: 'Je vroeg Carta je te mailen wanneer een bewaarde plek of reis goedkoper wordt. Tik op de knop om dit adres te bevestigen. Zolang je dat niet doet, sturen we geen prijsalert.',
    optinButton: 'Prijsalerts bevestigen',
    optinIgnore: 'Was jij dit niet? Negeer deze e-mail: er wordt niets verstuurd.',
    dropSubject: '{label} is {pct} goedkoper',
    dropBody: '{label}: Carta schat het nu op {now}, tegen {was} toen we het op {date} voor het eerst controleerden.',
    dropNote: 'Dit is een schatting van Carta op basis van de laatste prijzen voor verblijf en vluchten, geen boekingsofferte. Deze alert is nu klaar: bewaar hem opnieuw om de nieuwe prijs te volgen.',
    dropOpen: 'Openen in Carta',
    why: 'Je krijgt deze e-mail omdat je een prijsalert bewaarde in Carta en je adres bevestigde.',
    unsub: 'Afmelden voor prijsalerts',
    pageConfirmed: 'Prijsalerts staan aan',
    pageConfirmedBody: 'Bedankt, het adres is bevestigd. We mailen je één keer wanneer het totaal van een alert daalt met het aandeel dat je koos.',
    pageUnsub: 'Je bent afgemeld',
    pageUnsubBody: 'Klaar. We sturen je geen prijsalerts meer. Bewaar je opnieuw een alert, dan vragen we opnieuw om bevestiging.',
    pageBad: 'Deze link werkt niet. Hij kan verlopen zijn: bewaar de alert opnieuw in Carta.',
    pageBack: 'Terug naar Carta',
  },
  fr: {
    optinSubject: 'Confirmez vos alertes de prix Carta',
    optinBody: 'Vous avez demandé à Carta de vous écrire quand un lieu ou un voyage enregistré devient moins cher. Touchez le bouton pour confirmer cette adresse. Tant que vous ne le faites pas, nous n\'envoyons aucune alerte.',
    optinButton: 'Confirmer les alertes',
    optinIgnore: 'Si ce n\'était pas vous, ignorez cet e-mail : rien ne sera envoyé.',
    dropSubject: '{label} coûte {pct} de moins',
    dropBody: '{label} : Carta estime maintenant {now}, contre {was} lors de notre première vérification le {date}.',
    dropNote: 'C\'est une estimation de Carta d\'après les derniers prix d\'hébergement et de vols, pas un devis de réservation. Cette alerte est terminée : enregistrez-la à nouveau pour suivre le nouveau prix.',
    dropOpen: 'Ouvrir dans Carta',
    why: 'Vous recevez cet e-mail car vous avez enregistré une alerte de prix dans Carta et confirmé votre adresse.',
    unsub: 'Se désabonner des alertes de prix',
    pageConfirmed: 'Les alertes de prix sont activées',
    pageConfirmedBody: 'Merci, l\'adresse est confirmée. Nous vous écrivons une fois quand le total d\'une alerte baisse de la part choisie.',
    pageUnsub: 'Vous êtes désabonné',
    pageUnsubBody: 'C\'est fait. Vous ne recevrez plus d\'alertes de prix. Enregistrer une nouvelle alerte vous demandera de confirmer à nouveau.',
    pageBad: 'Ce lien ne fonctionne pas. Il a peut-être expiré : enregistrez l\'alerte à nouveau dans Carta.',
    pageBack: 'Retour à Carta',
  },
  de: {
    optinSubject: 'Bestätige deine Preisalarme bei Carta',
    optinBody: 'Du hast Carta gebeten, dir zu schreiben, wenn ein gespeicherter Ort oder eine Reise günstiger wird. Tippe auf den Knopf, um diese Adresse zu bestätigen. Bis dahin senden wir dir keinen Preisalarm.',
    optinButton: 'Preisalarme bestätigen',
    optinIgnore: 'Warst du das nicht? Ignoriere diese E-Mail: Es wird nichts gesendet.',
    dropSubject: '{label} ist {pct} günstiger',
    dropBody: '{label}: Carta schätzt jetzt {now}, gegenüber {was} bei unserer ersten Prüfung am {date}.',
    dropNote: 'Das ist eine Schätzung von Carta aus den neuesten Unterkunfts- und Flugpreisen, kein Buchungsangebot. Dieser Alarm ist nun erledigt: Speichere ihn erneut, um den neuen Preis zu verfolgen.',
    dropOpen: 'In Carta öffnen',
    why: 'Du erhältst diese E-Mail, weil du in Carta einen Preisalarm gespeichert und deine Adresse bestätigt hast.',
    unsub: 'Preisalarme abbestellen',
    pageConfirmed: 'Preisalarme sind an',
    pageConfirmedBody: 'Danke, die Adresse ist bestätigt. Wir schreiben dir einmal, wenn die Summe eines Alarms um den gewählten Anteil fällt.',
    pageUnsub: 'Du bist abgemeldet',
    pageUnsubBody: 'Erledigt. Wir senden dir keine Preisalarme mehr. Speicherst du wieder einen Alarm, bitten wir erneut um Bestätigung.',
    pageBad: 'Dieser Link funktioniert nicht. Vielleicht ist er abgelaufen: Speichere den Alarm erneut in Carta.',
    pageBack: 'Zurück zu Carta',
  },
  es: {
    optinSubject: 'Confirma tus alertas de precio de Carta',
    optinBody: 'Pediste a Carta que te escriba cuando un lugar o un viaje guardado baje de precio. Toca el botón para confirmar esta dirección. Hasta entonces no te enviamos ninguna alerta.',
    optinButton: 'Confirmar alertas',
    optinIgnore: 'Si no fuiste tú, ignora este correo: no se enviará nada.',
    dropSubject: '{label} cuesta un {pct} menos',
    dropBody: '{label}: Carta estima ahora {now}, frente a {was} cuando lo comprobamos por primera vez el {date}.',
    dropNote: 'Es una estimación de Carta con los últimos precios de alojamiento y vuelos, no un presupuesto de reserva. Esta alerta ha terminado: guárdala de nuevo para seguir el nuevo precio.',
    dropOpen: 'Abrir en Carta',
    why: 'Recibes este correo porque guardaste una alerta de precio en Carta y confirmaste tu dirección.',
    unsub: 'Darse de baja de las alertas de precio',
    pageConfirmed: 'Las alertas de precio están activadas',
    pageConfirmedBody: 'Gracias, la dirección está confirmada. Te escribimos una vez cuando el total de una alerta baje en la parte que elegiste.',
    pageUnsub: 'Te has dado de baja',
    pageUnsubBody: 'Hecho. No te enviaremos más alertas de precio. Si guardas otra alerta, te pediremos confirmar de nuevo.',
    pageBad: 'Este enlace no funciona. Puede que haya caducado: guarda la alerta de nuevo en Carta.',
    pageBack: 'Volver a Carta',
  },
  it: {
    optinSubject: 'Conferma i tuoi avvisi di prezzo Carta',
    optinBody: 'Hai chiesto a Carta di scriverti quando un luogo o un viaggio salvato costa meno. Tocca il pulsante per confermare questo indirizzo. Finché non lo fai, non ti inviamo alcun avviso.',
    optinButton: 'Conferma gli avvisi',
    optinIgnore: 'Se non sei stato tu, ignora questa email: non verrà inviato nulla.',
    dropSubject: '{label} costa il {pct} in meno',
    dropBody: '{label}: Carta ora stima {now}, contro {was} al nostro primo controllo del {date}.',
    dropNote: 'È una stima di Carta dai prezzi più recenti di alloggi e voli, non un preventivo di prenotazione. Questo avviso è concluso: salvalo di nuovo per seguire il nuovo prezzo.',
    dropOpen: 'Apri in Carta',
    why: 'Ricevi questa email perché hai salvato un avviso di prezzo in Carta e confermato il tuo indirizzo.',
    unsub: 'Annulla l\'iscrizione agli avvisi di prezzo',
    pageConfirmed: 'Gli avvisi di prezzo sono attivi',
    pageConfirmedBody: 'Grazie, l\'indirizzo è confermato. Ti scriviamo una volta quando il totale di un avviso scende della quota scelta.',
    pageUnsub: 'Iscrizione annullata',
    pageUnsubBody: 'Fatto. Non ti invieremo più avvisi di prezzo. Se salvi un nuovo avviso, ti chiederemo di confermare di nuovo.',
    pageBad: 'Questo link non funziona. Potrebbe essere scaduto: salva di nuovo l\'avviso in Carta.',
    pageBack: 'Torna a Carta',
  },
};
export const words = (lang) => W[langOf(lang)];
export const WORDS = W;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (k in v ? String(v[k]) : `{${k}}`));

const FRAME_OPEN = '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2a33">';
const button = (href, label) => `<p><a href="${esc(href)}" style="display:inline-block;background:#8c5a2b;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px">${esc(label)}</a></p>`;
const small = (html) => `<p style="font-size:13px;line-height:1.5;color:#5b6670">${html}</p>`;

/** The one confirmation email of the double opt-in. Plain, no promotion. */
export function optinEmail({ lang, confirm, unsub }) {
  const w = words(lang);
  return {
    subject: w.optinSubject,
    text: `${w.optinBody}\n\n${w.optinButton}: ${confirm}\n\n${w.optinIgnore}\n${w.unsub}: ${unsub}\n`,
    html: `${FRAME_OPEN}<p style="font-size:16px;line-height:1.5">${esc(w.optinBody)}</p>${button(confirm, w.optinButton)}`
      + `${small(esc(w.optinIgnore))}${small(`<a href="${esc(unsub)}" style="color:#5b6670">${esc(w.unsub)}</a>`)}</div>`,
  };
}

/** The share a total fell, as a whole percent string in the reader's language. */
export function percentOff(was, now, lang) {
  const share = was > 0 ? Math.max(0, (was - now) / was) : 0;
  return new Intl.NumberFormat(LOCALE[langOf(lang)], { style: 'percent', maximumFractionDigits: 0 }).format(Math.floor(share * 100) / 100);
}

/** The drop email: both totals, the date of the first check, the estimate note and the unsubscribe link. */
export function dropEmail({ lang, label, was, now, since, open, unsub }) {
  const w = words(lang);
  const name = String(label || '').trim().slice(0, 120) || 'Carta';
  const v = { label: name, pct: percentOff(was, now, lang), now: euros(now, lang), was: euros(was, lang), date: shortDate(since, lang) };
  const ve = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, esc(x)]));
  return {
    subject: fill(w.dropSubject, v),
    text: `${fill(w.dropBody, v)}\n\n${w.dropNote}\n\n${w.dropOpen}: ${open}\n\n${w.why}\n${w.unsub}: ${unsub}\n`,
    html: `${FRAME_OPEN}<p style="font-size:16px;line-height:1.5">${fill(esc(w.dropBody), ve)}</p>`
      + `${small(esc(w.dropNote))}${button(open, w.dropOpen)}`
      + `${small(esc(w.why))}${small(`<a href="${esc(unsub)}" style="color:#5b6670">${esc(w.unsub)}</a>`)}</div>`,
  };
}

/** Where the drop email's button opens: My trips, where saved places and trips live (as notify does). */
export function openUrl(appUrl) {
  return `${String(appUrl || '').replace(/\/+$/, '')}/?tab=trips`;
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
