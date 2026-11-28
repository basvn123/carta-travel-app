// The one frame for every email and every page an email link opens (K1 step
// C, owner 2026-11-28): the stone ground, a paper card, the Gate V arch with
// the name, a heading, the body, one terracotta button and the footer with
// the reason and Unsubscribe. notify, price-alerts and waitlist all draw
// through it, so the next colour change is this file, not three.
// An email has no stylesheet, so the values are the hex of the tokens in
// continent-app/src/styles/01-tokens.css (--text, --text-2, --surface-page,
// --surface, --border, --action). Plain ES module with no Deno API, so the
// node tests in continent-app/tests run it.

export const MAIL = Object.freeze({
  ink: '#1e2421',
  ink2: '#465049',
  stone: '#eef0ea',
  paper: '#ffffff',
  border: '#cfd5cc',
  accent: '#a54a26',
  font: 'Overpass,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
  // The wordmark is Fraunces in the app; no mail client loads a web font, so
  // the nearest serif every client has.
  mark: 'Georgia,Times New Roman,serif',
  // The arch as a hosted PNG: many mail apps drop inline SVG. It moves with
  // the domain (owner step K1-a).
  logo: 'https://carta-europetravel.com/icon-192.png',
});

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const brand = () => `<p style="margin:0 0 20px;font-family:${MAIL.mark};font-size:22px;font-weight:600;line-height:1;color:${MAIL.ink}">`
  + `<img src="${MAIL.logo}" width="24" height="24" alt="" style="display:inline-block;vertical-align:-5px;margin-right:8px;border:0">Viantra</p>`;

/** The one action of a mail or page: a terracotta button (white on it 5.82:1). */
export const mailButton = (href, label) => `<p style="margin:20px 0 0"><a href="${esc(href)}" style="display:inline-block;background:${MAIL.accent};color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;padding:14px 22px;border-radius:8px">${esc(label)}</a></p>`;

/** A body paragraph from text the caller has already escaped. */
export const mailLine = (html) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:${MAIL.ink}">${html}</p>`;

/** A quiet note under the body (an estimate, an "ignore this"), already escaped. */
export const mailNote = (html) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:${MAIL.ink2}">${html}</p>`;

/** The figure that changed, first and loudest: now, its unit, and what it was, struck. */
export const mailFigure = ({ now, unit, was }) => `<p style="margin:0 0 8px;color:${MAIL.ink};font-variant-numeric:tabular-nums">`
  + `<b style="font-size:30px;font-weight:800;letter-spacing:-0.02em">${esc(now)}</b> <span style="font-size:14px;color:${MAIL.ink2}">${esc(unit)}</span>`
  + (was ? ` <s style="font-size:15px;color:${MAIL.ink2}">${esc(was)}</s>` : '') + '</p>';

const heading = (text) => `<h1 style="margin:0 0 12px;font-size:20px;font-weight:800;line-height:1.3;color:${MAIL.ink}">${esc(text)}</h1>`;

/**
 * A whole email. `body` is html the caller built from mailLine, mailNote and
 * mailFigure; `cta` is { href, label }; `why` the reason line and `unsub`
 * { href, label } for the footer.
 */
export function mailHtml({ lang, title, body, cta, why, unsub }) {
  return `<!doctype html><html lang="${esc(lang)}"><body style="margin:0;padding:24px;background:${MAIL.stone};font-family:${MAIL.font}">`
    + `<div style="max-width:520px;margin:0 auto;background:${MAIL.paper};border:1px solid ${MAIL.border};border-radius:12px;padding:24px">`
    + brand() + (title ? heading(title) : '') + body + (cta ? mailButton(cta.href, cta.label) : '')
    + '</div>'
    + `<p style="max-width:520px;margin:16px auto 0;font-size:13px;line-height:1.5;color:${MAIL.ink2}">${why ? `${esc(why)} ` : ''}`
    + `<a href="${esc(unsub.href)}" style="color:${MAIL.ink2}">${esc(unsub.label)}</a></p>`
    + '</body></html>';
}

/** The page a confirm or unsubscribe link opens: the same card, a heading, one line and the way back. */
export function mailPage({ lang, title, heading: h, body, back }) {
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head>`
    + `<body style="margin:0;padding:24px;background:${MAIL.stone};font-family:${MAIL.font}">`
    + `<main style="max-width:480px;margin:48px auto;background:${MAIL.paper};border:1px solid ${MAIL.border};border-radius:12px;padding:24px">`
    + brand() + heading(h)
    + `<p style="margin:0 0 4px;font-size:16px;line-height:1.5;color:${MAIL.ink}">${esc(body)}</p>`
    + mailButton(back.href, back.label)
    + '</main></body></html>';
}
