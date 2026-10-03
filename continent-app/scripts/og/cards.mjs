/**
 * cards.mjs, draws a spec as an SVG card.
 *
 * Two formats share one drawing: 'og' is 1200 x 630 (Open Graph, X, LinkedIn,
 * Slack, iMessage, WhatsApp link previews) and 'square' is 1080 x 1080 (a post
 * or a story frame the traveller shares by hand). The grammar is the
 * product's own: a name set in the display face, one white bordered receipt on
 * the paper ground, mono for measured numbers and the ui face for words, a
 * twelve cell month strip where a record has months, and the compass mark with
 * the domain along the foot. Flat fills, hairline borders, no gradient and no
 * shadow, because carta-design bans both.
 *
 * Text that must fit carries data attributes (data-fit, data-wrap and the
 * header config); render.mjs measures it in a real browser with the real fonts
 * and shrinks or wraps it there, because Node cannot measure a glyph.
 */
import { C, stack } from './tokens.mjs';

export const FORMATS = {
  og: { w: 1200, h: 630 },
  square: { w: 1080, h: 1080 },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/** The compass mark, in the 32 unit box the favicon and Logo.jsx share. */
export function markShapes() {
  return [
    `<circle cx="16" cy="16" r="13" fill="none" stroke="${C.ink}" stroke-width="1.5"/>`,
    `<circle cx="16" cy="16" r="9.5" fill="none" stroke="${C.rule}" stroke-width="1"/>`,
    `<path d="M16 5.5 L19 16 L16 13.2 L13 16 Z" fill="${C.accent}"/>`,
    `<path d="M16 26.5 L13 16 L16 18.8 L19 16 Z" fill="${C.ink}"/>`,
    `<circle cx="16" cy="16" r="1.4" fill="${C.paper}" stroke="${C.ink}" stroke-width="1"/>`,
  ].join('');
}

const mark = (x, y, size) => `<g transform="translate(${x} ${y}) scale(${size / 32})">${markShapes()}</g>`;

function text(x, y, str, { font = 'ui', size = 24, weight = 400, fill = C.ink, anchor = 'start', fit = null, extra = '' } = {}) {
  const fitAttr = fit ? ` data-fit="1" data-maxw="${fit.maxW}" data-min="${fit.min || Math.round(size * 0.6)}"` : '';
  const num = font === 'mono' ? ' font-variant-numeric="tabular-nums"' : '';
  return `<text x="${x}" y="${y}" font-family="${esc(stack(font))}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${num}${fitAttr}${extra}>${esc(str)}</text>`;
}

function strip(spec, x, y, w, size) {
  const gap = 4;
  const cw = (w - gap * 11) / 12;
  const good = new Set(spec.strip.good);
  const cells = INITIALS.map((ch, i) => {
    const on = good.has(i + 1);
    const cx = x + i * (cw + gap);
    return (on ? `<rect x="${cx}" y="${y}" width="${cw}" height="${size}" rx="5" fill="${C.good}"/>` : '')
      + text(cx + cw / 2, y + size * 0.66, ch, { font: 'mono', size: size * 0.45, weight: on ? 600 : 400, fill: on ? C.green : C.inkSoft, anchor: 'middle' });
  }).join('');
  return cells;
}

function routePath(lines, x, y, w, h) {
  const pts = lines.flat().filter((p) => Array.isArray(p) && p.length >= 2);
  if (!pts.length) return '';
  const lats = pts.map((p) => p[1]);
  const lons = pts.map((p) => p[0]);
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const spanX = Math.max((maxLon - minLon) * k, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const pad = 18;
  const s = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const ox = x + (w - spanX * s) / 2;
  const oy = y + (h - spanY * s) / 2;
  const proj = ([lo, la]) => [ox + (lo - minLon) * k * s, oy + (maxLat - la) * s];
  let first = null;
  const d = lines.map((line) => {
    const step = Math.max(1, Math.ceil(line.length / 300));
    const sel = line.filter((_, i) => i % step === 0 || i === line.length - 1);
    return sel.map((p, i) => {
      const [px, py] = proj(p);
      if (!first) first = [px, py];
      return `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`;
    }).join('');
  }).join('');
  return `<path d="${d}" fill="none" stroke="${C.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
    + (first ? `<circle cx="${first[0].toFixed(1)}" cy="${first[1].toFixed(1)}" r="6" fill="${C.ink}"/>` : '');
}

function panel(spec, x, y, w, h, format) {
  const p = spec.panel;
  const inner = 28;
  const ix = x + inner;
  const iw = w - inner * 2;
  const out = [];
  out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${C.card}" stroke="${C.rule}" stroke-width="2"/>`);
  out.push(text(ix, y + 50, p.head, { size: 22, weight: 600, fill: C.inkSoft, fit: { maxW: iw } }));
  out.push(`<rect x="${ix}" y="${y + 68}" width="${iw}" height="2" fill="${C.ruleSoft}"/>`);
  let top = y + 86;
  if (p.route) {
    const rh = format === 'og' ? 128 : 150;
    out.push(`<rect x="${ix}" y="${top}" width="${iw}" height="${rh}" rx="8" fill="${C.paperDim}"/>`);
    out.push(routePath(p.route, ix, top, iw, rh));
    top += rh + 14;
  }
  const totalH = p.total ? 128 : 0;
  const bottom = y + h - totalH - 12;
  const n = p.rows.length;
  const pitch = Math.min(n <= 2 ? 104 : 80, (bottom - top) / Math.max(1, n));
  p.rows.forEach((r, i) => {
    const ry = top + i * pitch;
    out.push(text(ix, ry + 30, r.label, { size: 25, weight: 600, fill: C.ink, fit: { maxW: iw * 0.5 } }));
    out.push(text(ix + iw, ry + 30, r.value, {
      font: r.font === 'ui' ? 'ui' : 'mono', size: r.font === 'ui' ? 26 : 28, weight: 600, fill: C.ink, anchor: 'end', fit: { maxW: iw * 0.5, min: 16 },
    }));
    if (r.note) out.push(text(ix, ry + 58, r.note, { size: 19, fill: C.inkSoft, fit: { maxW: iw, min: 14 } }));
    if (i < n - 1) out.push(`<rect x="${ix}" y="${ry + pitch - 8}" width="${iw}" height="1" fill="${C.ruleSoft}"/>`);
  });
  if (p.total) {
    const ty = y + h - totalH;
    const t = p.total;
    out.push(`<rect x="${ix}" y="${ty}" width="${iw}" height="3" fill="${C.ink}"/>`);
    out.push(text(ix, ty + 38, t.label, { size: 22, weight: 600, fill: C.inkSoft }));
    const fill = t.tone === 'rate' ? C.rate : C.ink;
    const vy = ty + 104;
    out.push(text(ix, vy, t.value, { font: 'mono', size: 68, weight: 600, fill, fit: { maxW: iw * 0.7, min: 40 }, extra: ' data-total="1"' }));
    if (t.unit) out.push(text(ix + iw, vy, t.unit, { size: 26, fill: C.inkSoft, anchor: 'end' }));
  }
  return out.join('');
}

/** Returns { svg, width, height }. The SVG is complete and self-contained except for fonts. */
export function drawCard(spec, format = 'og') {
  const { w, h } = FORMATS[format];
  const sq = format === 'square';
  const M = sq ? 72 : 64;
  const hasPanel = !!spec.panel;
  const out = [];
  out.push(`<rect width="${w}" height="${h}" fill="${C.paper}"/>`);

  // header block: kind label, title, subtitle. Positions are finished in the browser.
  const colW = sq ? w - M * 2 : hasPanel ? 568 : w - M * 2;
  const cfg = sq
    ? { x: M, maxW: colW, titleBottom: 270, titleSize: 88, titleMin: 52, titleLines: 2, subSize: 32, subGap: 66, kindGap: 22, subMaxBottom: 380 }
    : { x: M, maxW: colW, titleBottom: 262, titleSize: 68, titleMin: 44, titleLines: 2, subSize: 28, subGap: 58, kindGap: 20, subMaxBottom: spec.strip ? 384 : hasPanel ? 470 : 520 };
  out.push(`<g id="header" data-cfg='${JSON.stringify(cfg)}'>`);
  out.push(text(M, 100, spec.kind, { size: sq ? 28 : 24, weight: 600, fill: C.inkSoft, extra: ' data-role="kind"' }));
  out.push(text(M, 200, spec.title, { font: 'display', size: cfg.titleSize, weight: 600, fill: C.ink, extra: ' data-role="title"' }));
  out.push(text(M, 300, spec.subtitle, { size: cfg.subSize, fill: C.inkSoft, extra: ' data-role="sub"' }));
  out.push('</g>');

  if (hasPanel) {
    if (sq) {
      const ph = spec.strip ? 440 : 520;
      out.push(panel(spec, M, 400, w - M * 2, ph, format));
      if (spec.strip) {
        out.push(text(M, 884, spec.strip.label, { size: 24, weight: 600, fill: C.ink }));
        out.push(strip(spec, M, 898, w - M * 2, 42));
        out.push(text(M, 968, spec.strip.note, { size: 22, fill: C.inkSoft, fit: { maxW: w - M * 2, min: 16 } }));
      }
    } else {
      out.push(panel(spec, 688, 48, 448, 472, format));
      if (spec.strip) {
        out.push(text(M, 418, spec.strip.label, { size: 24, weight: 600, fill: C.ink }));
        out.push(strip(spec, M, 436, 568, 46));
        out.push(text(M, 518, spec.strip.note, { size: 22, fill: C.inkSoft, fit: { maxW: 568, min: 16 } }));
      }
    }
  }

  // foot: the mark, the wordmark, the domain
  const fy = sq ? h - 52 : h - 36;
  out.push(mark(M, fy - 34, 40));
  out.push(text(M + 52, fy - 3, 'Carta', { font: 'display', size: 32, weight: 600, fill: C.ink }));
  out.push(text(w - M, fy - 4, 'carta-europetravel.com', { size: 24, weight: 600, fill: C.inkSoft, anchor: 'end' }));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${out.join('')}</svg>`;
  return { svg, width: w, height: h };
}
