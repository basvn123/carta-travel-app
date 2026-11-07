/**
 * The share images' one drawing format (T1175, ROADMAP K7).
 *
 * A share image is a list of plain drawing ops, built by a pure function
 * from the data (the trip receipt in the app, the 100 a day map and the
 * cheapest week calendar in scripts/share/). The same list is drawn two ways:
 *   drawOps(ctx, ops)   onto a <canvas> 2D context, in the browser
 *   opsToSvg(ops)       as an SVG string, for the offline generator (which
 *                       rasterises it with the Playwright Chromium the repo
 *                       already has) and for the tests
 * so the image a traveller shares and the one the tests read are the same.
 *
 * Colours are token NAMES ('umber-600'), never values: the caller passes a
 * palette that resolves them (paletteFromCss in the browser, the parsed
 * 01-tokens.css in a script). Text that prints a figure carries
 * fig: { key, value } so checkFigures() can prove every printed number
 * comes from the data (the numbers check of K7).
 *
 * Ops
 *   { t: 'rect', x, y, w, h, r, fill, stroke, sw, dash }
 *   { t: 'text', x, y, text, size, weight, fill, anchor: 'start'|'middle'|'end', fig }
 *   { t: 'path', d, fill, stroke, sw, tx, ty, scale }
 *   { t: 'circle', cx, cy, r, fill, stroke, sw }
 */

/** Every colour token a share image may use. */
export const SHARE_TOKENS = [
  'neutral-0', 'neutral-50', 'neutral-100', 'neutral-200', 'neutral-600', 'neutral-700', 'neutral-900',
  'umber-50', 'umber-100', 'umber-200', 'umber-500', 'umber-600', 'umber-700', 'umber-800',
  'sun-100', 'sun-400', 'sun-800', 'lagoon-100', 'lagoon-600', 'lagoon-700',
];

/** The palette from the page's own :root (browser only). */
export function paletteFromCss(root = typeof document !== 'undefined' ? document.documentElement : null) {
  const out = {};
  if (!root || typeof getComputedStyle === 'undefined') return out;
  const cs = getComputedStyle(root);
  for (const k of SHARE_TOKENS) out[k] = cs.getPropertyValue(`--${k}`).trim();
  return out;
}

/** The palette from the text of 01-tokens.css (scripts and tests). */
export function paletteFromTokensCss(css) {
  const out = {};
  for (const k of SHARE_TOKENS) {
    const m = new RegExp(`--${k}:\\s*([^;]+);`).exec(css || '');
    if (m) out[k] = m[1].trim();
  }
  return out;
}

const col = (pal, name) => (name ? pal[name] || name : 'none');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Split a sentence into lines of about `max` characters (no measuring:
 *  the share layouts give text generous room). */
export function wrapText(text, max) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur.length + 1 + w.length) > max) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** The ops as one SVG document. */
export function opsToSvg(ops, { w, h, pal = {}, family = 'sans-serif', bg = null } = {}) {
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`];
  if (bg) out.push(`<rect width="${w}" height="${h}" fill="${col(pal, bg)}"/>`);
  const ANCHOR = { start: 'start', middle: 'middle', end: 'end' };
  for (const o of ops) {
    if (o.t === 'rect') {
      out.push(`<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}"${o.r ? ` rx="${o.r}"` : ''} fill="${col(pal, o.fill)}"${o.stroke ? ` stroke="${col(pal, o.stroke)}" stroke-width="${o.sw || 1}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash.join(' ')}"` : ''}/>`);
    } else if (o.t === 'circle') {
      out.push(`<circle cx="${o.cx}" cy="${o.cy}" r="${o.r}" fill="${col(pal, o.fill)}"${o.stroke ? ` stroke="${col(pal, o.stroke)}" stroke-width="${o.sw || 1}"` : ''}/>`);
    } else if (o.t === 'path') {
      const tf = (o.tx || o.ty || o.scale) ? ` transform="translate(${o.tx || 0} ${o.ty || 0}) scale(${o.scale || 1})"` : '';
      out.push(`<path d="${o.d}"${tf} fill="${col(pal, o.fill)}"${o.stroke ? ` stroke="${col(pal, o.stroke)}" stroke-width="${o.sw || 1}" vector-effect="non-scaling-stroke" stroke-linejoin="round"` : ''}/>`);
    } else if (o.t === 'text') {
      out.push(`<text x="${o.x}" y="${o.y}" font-family="${esc(family)}" font-size="${o.size}" font-weight="${o.weight || 400}" fill="${col(pal, o.fill)}" text-anchor="${ANCHOR[o.anchor] || 'start'}" style="font-variant-numeric: tabular-nums">${esc(o.text)}</text>`);
    }
  }
  out.push('</svg>');
  return `${out.join('\n')}\n`;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r || 0, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Draw the ops on a canvas 2D context (browser). */
export function drawOps(ctx, ops, { pal = {}, family = 'sans-serif' } = {}) {
  for (const o of ops) {
    ctx.save();
    if (o.t === 'rect') {
      roundRect(ctx, o.x, o.y, o.w, o.h, o.r);
      if (o.fill && o.fill !== 'none') { ctx.fillStyle = col(pal, o.fill); ctx.fill(); }
      if (o.stroke) {
        ctx.strokeStyle = col(pal, o.stroke);
        ctx.lineWidth = o.sw || 1;
        if (o.dash) ctx.setLineDash(o.dash);
        ctx.stroke();
      }
    } else if (o.t === 'circle') {
      ctx.beginPath();
      ctx.arc(o.cx, o.cy, o.r, 0, Math.PI * 2);
      if (o.fill && o.fill !== 'none') { ctx.fillStyle = col(pal, o.fill); ctx.fill(); }
      if (o.stroke) { ctx.strokeStyle = col(pal, o.stroke); ctx.lineWidth = o.sw || 1; ctx.stroke(); }
    } else if (o.t === 'path' && typeof Path2D !== 'undefined') {
      ctx.translate(o.tx || 0, o.ty || 0);
      ctx.scale(o.scale || 1, o.scale || 1);
      const p = new Path2D(o.d);
      if (o.fill && o.fill !== 'none') { ctx.fillStyle = col(pal, o.fill); ctx.fill(p); }
      if (o.stroke) { ctx.strokeStyle = col(pal, o.stroke); ctx.lineWidth = (o.sw || 1) / (o.scale || 1); ctx.stroke(p); }
    } else if (o.t === 'text') {
      ctx.font = `${o.weight || 400} ${o.size}px ${family}`;
      ctx.fillStyle = col(pal, o.fill);
      ctx.textAlign = o.anchor === 'end' ? 'right' : o.anchor === 'middle' ? 'center' : 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(o.text, o.x, o.y);
    }
    ctx.restore();
  }
}

/**
 * The numbers check. Every text op that prints a digit must carry a fig
 * whose formatted value (format(fig)) is in its text, and every fig must
 * equal the value `expected` gives for its key (recomputed from the data by
 * the caller, by a second path). Returns the list of problems; empty is a
 * pass. A text op marked date: true holds a date the caller checks
 * itself (its digits are days and years, not figures). `allow` is a list of regexes for digits that are not figures (a
 * year, a date) and are checked by the caller's own words.
 */
export function checkFigures(ops, { expected = {}, format = String, allow = [], tol = 0.005 } = {}) {
  const problems = [];
  for (const o of ops) {
    if (o.t !== 'text' || o.date) continue;
    let text = String(o.text);
    for (const re of allow) text = text.replace(re, '');
    if (!o.fig) {
      if (/\d/.test(text)) problems.push(`a number without its figure: "${o.text}"`);
      continue;
    }
    const figs = Array.isArray(o.fig) ? o.fig : [o.fig];
    for (const f of figs) {
      const shown = format(f);
      if (!String(o.text).includes(shown)) problems.push(`"${o.text}" does not print ${f.key} as ${shown}`);
      if (!(f.key in expected)) { problems.push(`no expected value for ${f.key}`); continue; }
      const want = expected[f.key];
      const ok = typeof want === 'number' && typeof f.value === 'number'
        ? Math.abs(want - f.value) <= Math.max(tol, Math.abs(want) * 1e-9)
        : want === f.value;
      if (!ok) problems.push(`${f.key}: the image says ${f.value}, the data says ${want}`);
    }
  }
  return problems;
}
