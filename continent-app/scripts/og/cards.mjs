/**
 * cards.mjs, draws a spec as an SVG card.
 *
 * Two formats share one drawing: 'og' is 1200 x 630 (Open Graph, X, LinkedIn,
 * Slack, iMessage, WhatsApp link previews) and 'square' is 1080 x 1080 (a post
 * or a story frame the traveller shares by hand). The grammar is the house
 * style's (DESIGN.md "Print and share", G1 2026-11), the same objects the
 * screens and the PDFs carry:
 *
 *   - the signpost plate: the name in the plate face with the line under it
 *     in beige and the record's figure on the plate's square end (a day's
 *     cost, a height, a walking time, a Score); a plate only where a name
 *     meets its figure, never as a banner;
 *   - under it the formation (bed a solid umber wagon, food a beige wagon)
 *     for a place, or the measured facts for a beach, a lake, a mountain or
 *     a walk, each figure said once;
 *   - the months as umber wagons where a record has months;
 *   - the blaze in the wordmark slot along the foot, with the domain.
 *
 * Stone ground, flat fills, hairlines, no gradient and no shadow. Text that
 * must fit carries data attributes; render.mjs measures it in a real browser
 * with the real fonts and shrinks or wraps it there.
 */
import { C, stack } from './tokens.mjs';

/** The name in the wordmark slot; the slot takes any name. */
export const APP_NAME = 'Carta';
export const DOMAIN = 'carta-europetravel.com';

export const FORMATS = {
  og: { w: 1200, h: 630 },
  square: { w: 1080, h: 1080 },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/**
 * The blaze in a 24 x 14 box (the proportions of `.hs-blaze`): a white halo
 * with a hairline edge, the square umber paint stripe, the short ink heel.
 * `simple` drops the heel and the edge for the 16 and 32 px icon frames,
 * where they would be under a pixel.
 */
export function blazeShapes({ paint = C.accent, heel = C.ink, edge = C.blazeEdge, halo = C.card, simple = false } = {}) {
  return [
    `<rect x="0" y="0" width="24" height="14" rx="1" fill="${halo}"${simple ? '' : ` stroke="${edge}" stroke-width="0.6"`}/>`,
    `<rect x="${simple ? 2.6 : 3.36}" y="${simple ? 2.4 : 2.8}" width="${simple ? 18.8 : 17.28}" height="${simple ? 6.2 : 5.04}" fill="${paint}"/>`,
    simple ? `<rect x="12.5" y="10" width="8.9" height="2" fill="${heel}"/>` : `<rect x="12.48" y="10.5" width="8.16" height="1.54" fill="${heel}"/>`,
  ].join('');
}

const blaze = (x, y, w) => `<g transform="translate(${x} ${y}) scale(${w / 24})">${blazeShapes()}</g>`;

function text(x, y, str, { font = 'ui', size = 24, weight = 400, fill = C.ink, anchor = 'start', fit = null, extra = '' } = {}) {
  const fitAttr = fit ? ` data-fit="1" data-maxw="${fit.maxW}" data-min="${fit.min || Math.round(size * 0.6)}"` : '';
  return `<text x="${x}" y="${y}" font-family="${esc(stack(font))}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" font-variant-numeric="tabular-nums lining-nums"${fitAttr}${extra}>${esc(str)}</text>`;
}

/** The signpost plate's outline: rounded square end left, pointed end right. */
function platePath(x, y, w, h, tip, r = 12) {
  return `<path d="M${x + r} ${y}H${x + w - tip}L${x + w} ${y + h / 2}L${x + w - tip} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z" fill="${C.plate}"/>`;
}

/** The Score plate: ink, the white figure. Width from the figure's length. */
function scorePlate(x, y, value, h = 44) {
  const w = Math.round(h * 0.5 + String(value).length * h * 0.42);
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${C.plate}"/>`
    + text(x + w / 2, y + h * 0.7, value, { size: h * 0.56, weight: 800, fill: C.onPlate, anchor: 'middle' });
}

/** The months as wagons: the good ones solid umber with white letters in
 *  bold, the rest outlined on the control edge (weight says it too). */
function strip(spec, x, y, w, size) {
  const gap = 6;
  const cw = (w - gap * 11) / 12;
  const good = new Set(spec.strip.good);
  return INITIALS.map((ch, i) => {
    const on = good.has(i + 1);
    const cx = x + i * (cw + gap);
    const r = Math.min(size / 2, cw / 2);
    return (on
      ? `<rect x="${cx}" y="${y}" width="${cw}" height="${size}" rx="${r}" fill="${C.accent}"/>`
      : `<rect x="${cx + 1}" y="${y + 1}" width="${cw - 2}" height="${size - 2}" rx="${r - 1}" fill="none" stroke="${C.edge}" stroke-width="2"/>`)
      + text(cx + cw / 2, y + size * 0.67, ch, { size: size * 0.44, weight: on ? 800 : 600, fill: on ? C.onPlate : C.inkSoft, anchor: 'middle' });
  }).join('');
}

/** The formation: content-sized wagons (bed solid umber, food beige with
 *  the umber 500 edge, anything else outlined), coupled with small gaps.
 *  Widths are estimated from Overpass's average advance, then fitted. */
function formation(rows, x, y, maxW, h) {
  let cx = x;
  const out = [];
  for (const r of rows) {
    const label = `${r.label} ${r.value}`;
    const size = h * 0.46;
    const w = Math.round(h * 0.7 + label.length * size * 0.56);
    if (cx + w > x + maxW) break;
    const kind = /^bed/i.test(r.label) ? 'bed' : /^food/i.test(r.label) ? 'food' : 'go';
    const fill = kind === 'bed' ? C.accent : kind === 'food' ? C.beige : 'none';
    const stroke = kind === 'food' ? C.foodEdge : kind === 'go' ? C.accent : 'none';
    const ink = kind === 'bed' ? C.onPlate : C.umber800;
    out.push(`<rect x="${cx + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="${(h - 2) / 2}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`);
    out.push(text(cx + w / 2, y + h * 0.66, label, { size, weight: 700, fill: ink, anchor: 'middle', fit: { maxW: w - h * 0.5, min: 14 } }));
    cx += w + 6;
  }
  return out.join('');
}

/** Measured facts: label over figure, up to three across, a hairline over. */
function facts(rows, x, y, w, { cols = 3, size = 44 } = {}) {
  const list = rows.slice(0, cols);
  if (!list.length) return '';
  const cw = w / list.length;
  const out = [`<rect x="${x}" y="${y}" width="${w}" height="2" fill="${C.rule}"/>`];
  list.forEach((r, i) => {
    const fx = x + i * cw;
    out.push(text(fx, y + 40, r.label, { size: size * 0.5, weight: 600, fill: C.inkSoft, fit: { maxW: cw - 24, min: 14 } }));
    out.push(text(fx, y + 40 + size * 1.15, r.value, { size, weight: 800, fill: C.ink, fit: { maxW: cw - 24, min: 20 } }));
  });
  return out.join('');
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
  // The route as on the screens' maps: umber on a white halo.
  return `<path d="${d}" fill="none" stroke="${C.card}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="${d}" fill="none" stroke="${C.accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`
    + (first ? `<circle cx="${first[0].toFixed(1)}" cy="${first[1].toFixed(1)}" r="6" fill="${C.ink}"/>` : '');
}

/** The figure a plate carries: the panel's total, else the walk's time or
 *  its distance (the signpost's own unit). Returns { value, unit, rows }
 *  with the row that became the figure taken out of the facts. */
function plateFigure(spec) {
  const p = spec.panel;
  if (!p) return { value: null, unit: '', rows: [] };
  if (p.total) {
    const unit = p.total.tone === 'rate' ? 'Score' : (p.total.unit || p.total.label || '');
    return { value: p.total.value, unit, rows: p.rows || [] };
  }
  const rows = [...(p.rows || [])];
  const at = Math.max(0, rows.findIndex((r) => /time/i.test(r.label)));
  const [row] = rows.splice(at, 1);
  return row ? { value: row.value, unit: row.label, rows } : { value: null, unit: '', rows };
}

/** Returns { svg, width, height }. The SVG is complete and self-contained except for fonts. */
export function drawCard(spec, format = 'og') {
  const { w, h } = FORMATS[format];
  const sq = format === 'square';
  const M = sq ? 72 : 64;
  const W = w - M * 2;
  const out = [];
  out.push(`<rect width="${w}" height="${h}" fill="${C.paper}"/>`);
  const isSite = spec.type === 'site';
  const fig = plateFigure(spec);

  // The top line: the kind, and the Score plate where the record has one.
  // The square sits its block lower, so a post reads from the middle; a
  // short card (no months, no route) lower still. A wide card with months
  // takes a shorter plate so the months clear the foot.
  const short = !spec.strip && !(spec.panel && spec.panel.route);
  const drop = sq ? (short ? 330 : 232) : (spec.strip ? 72 : 84);
  const kindY = drop;
  if (!isSite) {
    out.push(text(M, kindY, spec.kind, { size: sq ? 30 : 26, weight: 700, fill: C.inkSoft }));
    if (spec.score && fig.unit !== 'Score') {
      const kw = Math.round(String(spec.kind).length * (sq ? 30 : 26) * 0.6) + 16;
      out.push(scorePlate(M + kw, kindY - (sq ? 33 : 30), spec.score, sq ? 44 : 40));
    }
  }

  // The plate: the name, the line under it in beige, the figure on the end.
  const tip = sq ? 60 : 56;
  const plateTop = isSite ? (sq ? 480 : 300) : kindY + (sq ? 40 : 32);
  const plateH = isSite ? (sq ? 190 : 150) : (sq ? 290 : (spec.strip ? 168 : 196));
  const figW = fig.value ? (sq ? 290 : 320) : 0;
  const pad = sq ? 44 : 40;
  const nameW = W - tip - pad * 2 - figW;

  if (isSite) {
    // The headline is not a place, so it stands on the ground in ink.
    const cfg = { x: M, maxW: W, titleBottom: sq ? 330 : 176, titleSize: sq ? 76 : 60, titleMin: 40, titleLines: 2, subSize: sq ? 32 : 28, subGap: sq ? 62 : 52, kindGap: 0, subMaxBottom: sq ? 392 : 228, kindFixed: true };
    out.push(`<g id="header" data-cfg='${JSON.stringify(cfg)}'>`);
    out.push(text(M, 0, '', { extra: ' data-role="kind"' }));
    out.push(text(M, 200, spec.title, { size: cfg.titleSize, weight: 800, fill: C.ink, extra: ' data-role="title"' }));
    out.push(text(M, 300, spec.subtitle, { size: cfg.subSize, fill: C.inkSoft, extra: ' data-role="sub"' }));
    out.push('</g>');
    if (spec.panel) {
      // The example: a real place on its plate, with its formation under it.
      const name = String(spec.panel.head || '').replace(/^Example,\s*/, '');
      out.push(platePath(M, plateTop, W, plateH, tip));
      out.push(text(M + pad, plateTop + plateH * 0.6, name, { font: 'plate', size: sq ? 96 : 80, weight: 700, fill: C.onPlate, fit: { maxW: nameW, min: 40 } }));
      if (fig.value) {
        out.push(text(M + W - tip - pad, plateTop + plateH * 0.55, fig.value, { size: sq ? 84 : 72, weight: 800, fill: C.onPlate, anchor: 'end', fit: { maxW: figW - 20, min: 36 } }));
        out.push(text(M + W - tip - pad, plateTop + plateH * 0.55 + (sq ? 44 : 38), fig.unit, { size: sq ? 26 : 22, weight: 600, fill: C.onPlate2, anchor: 'end' }));
      }
      out.push(formation(fig.rows, M, plateTop + plateH + 24, W, sq ? 64 : 56));
    }
  } else {
    out.push(platePath(M, plateTop, W, plateH, tip));
    const cfg = {
      x: M + pad, maxW: nameW, titleBottom: plateTop + plateH * 0.55, titleSize: sq ? 104 : 92, titleMin: sq ? 56 : 48, titleLines: 2,
      subSize: sq ? 26 : 28, subGap: sq ? 48 : 44, kindGap: 0, subMaxBottom: 0, kindFixed: true, plateTop, plateH,
    };
    cfg.subMaxBottom = cfg.titleBottom + cfg.subGap;
    out.push(`<g id="header" data-cfg='${JSON.stringify(cfg)}'>`);
    out.push(text(M, 0, '', { extra: ' data-role="kind"' }));
    out.push(text(cfg.x, 200, spec.title, { font: 'plate', size: cfg.titleSize, weight: 700, fill: C.onPlate, extra: ' data-role="title"' }));
    out.push(text(cfg.x, 300, spec.subtitle || '', { size: cfg.subSize, weight: 600, fill: C.onPlate2, extra: ' data-role="sub"' }));
    out.push('</g>');
    if (fig.value) {
      const fx = M + W - tip - pad;
      const fy = plateTop + plateH / 2 + (sq ? 14 : 10);
      out.push(text(fx, fy, fig.value, { size: sq ? 96 : 80, weight: 800, fill: C.onPlate, anchor: 'end', fit: { maxW: figW - 16, min: 36 } }));
      if (fig.unit) out.push(text(fx, fy + (sq ? 50 : 42), fig.unit, { size: sq ? 28 : 24, weight: 600, fill: C.onPlate2, anchor: 'end' }));
    }

    // Under the plate: the formation for a place, the facts for the rest.
    const p = spec.panel || {};
    const underY = plateTop + plateH + (sq ? 40 : 28);
    const route = p.route && p.route.length;
    if (spec.type === 'destination') {
      out.push(formation(fig.rows, M, underY, W, sq ? 68 : 60));
    } else if (route) {
      const rw = sq ? W : 440;
      const rh = sq ? 180 : 230;
      const rx = sq ? M : M + W - rw;
      const ry = sq ? underY + 150 : underY;
      out.push(facts(fig.rows, M, underY, sq ? W : W - rw - 32, { cols: sq ? 3 : 2, size: sq ? 52 : 44 }));
      out.push(`<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="12" fill="${C.paperDim}"/>`);
      out.push(routePath(p.route, rx, ry, rw, rh));
    } else {
      out.push(facts(fig.rows, M, underY, W, { cols: 3, size: sq ? 56 : 46 }));
    }
    if (spec.strip) {
      const sy = sq ? (route ? 0 : underY + 200) : underY + 136;
      if (sy) {
        out.push(text(M, sy, spec.strip.label, { size: sq ? 28 : 24, weight: 700, fill: C.ink }));
        out.push(strip(spec, M, sy + 18, W, sq ? 60 : 48));
      }
    }
  }

  // The foot: the wordmark slot (the blaze and the name), the domain.
  const fy = sq ? h - 64 : h - 40;
  const bw = sq ? 52 : 46;
  out.push(blaze(M, fy - bw * 0.58 - 2, bw));
  out.push(text(M + bw + 14, fy, APP_NAME, { font: 'plate', size: sq ? 46 : 40, weight: 700, fill: C.ink }));
  out.push(text(w - M, fy - 2, DOMAIN, { size: sq ? 28 : 24, weight: 700, fill: C.inkSoft, anchor: 'end' }));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${out.join('')}</svg>`;
  return { svg, width: w, height: h };
}
