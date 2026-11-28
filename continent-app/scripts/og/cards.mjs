/**
 * cards.mjs, draws a spec as an SVG card.
 *
 * Two formats share one drawing: 'og' is 1200 x 630 (Open Graph, X, LinkedIn,
 * Slack, iMessage, WhatsApp link previews) and 'square' is 1080 x 1080 (a post
 * or a story frame the traveller shares by hand). The grammar is the house
 * style's (DESIGN.md "Shell, home and print", G1 2026-11), the same objects the
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
 *   - the Viantra arch and name in the wordmark slot along the foot, with
 *     the domain (K1, decision 0018).
 *
 * Stone ground, flat fills, hairlines, no gradient and no shadow. Text that
 * must fit carries data attributes; render.mjs measures it in a real browser
 * with the real fonts and shrinks or wraps it there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { C, stack, APP_ROOT } from './tokens.mjs';

/** The name in the wordmark slot; the slot takes any name. */
export const APP_NAME = 'Viantra';
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

/**
 * The Viantra lockup (K1, signed off 2026-11-26): the terracotta arch whose
 * opening is a V and the outlined Fraunces wordmark, read from the kit's
 * brand/viantra/svg/viantra-lockup.svg so the card never drifts from it.
 * In its 1054 x 294 box the arch runs from y 24 to 209 (185 tall) and starts
 * at x 24. Drawn with the arch `archH` tall, its foot on `baseline`, at `x`.
 */
const LOCKUP = fs.readFileSync(path.join(APP_ROOT, 'brand', 'viantra', 'svg', 'viantra-lockup.svg'), 'utf8')
  .replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
function lockup(x, baseline, archH) {
  const k = archH / 185;
  return `<svg x="${(x - 24 * k).toFixed(1)}" y="${(baseline - 209 * k).toFixed(1)}" width="${(1054 * k).toFixed(1)}" height="${(294 * k).toFixed(1)}" viewBox="0 0 1054 294">${LOCKUP}</svg>`;
}

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

/** Measured facts: label over figure, up to three across, a hairline over,
 *  each figure's note (how it was measured) under it in the second ink.
 *  Returns { svg, h }. */
function facts(rows, x, y, w, { cols = 3, size = 44 } = {}) {
  const list = rows.slice(0, cols);
  if (!list.length) return { svg: '', h: 0 };
  const cw = w / list.length;
  const notes = list.some((r) => r.note);
  const labelY = y + Math.round(size * 0.82);
  const valueY = labelY + Math.round(size * 1.12);
  const noteY = valueY + Math.round(size * 0.62);
  const out = [`<rect x="${x}" y="${y}" width="${w}" height="2" fill="${C.rule}"/>`];
  list.forEach((r, i) => {
    const fx = x + i * cw;
    out.push(text(fx, labelY, r.label, { size: size * 0.5, weight: 600, fill: C.inkSoft, fit: { maxW: cw - 24, min: 14 } }));
    out.push(text(fx, valueY, r.value, { size, weight: 800, fill: C.ink, fit: { maxW: cw - 24, min: 20 } }));
    if (r.note) out.push(text(fx, noteY, r.note, { size: Math.max(16, size * 0.42), weight: 500, fill: C.inkSoft, fit: { maxW: cw - 24, min: 12 } }));
  });
  return { svg: out.join(''), h: (notes ? noteY : valueY) - y + Math.round(size * 0.2) };
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
 *  its distance (the signpost's own unit). Returns { value, unit, note, rows }
 *  with the row that became the figure taken out of the facts (its note
 *  rides along and is printed on the head line). */
function plateFigure(spec) {
  const p = spec.panel;
  if (!p) return { value: null, unit: '', note: '', rows: [] };
  if (p.total) {
    const unit = p.total.tone === 'rate' ? 'Score' : (p.total.unit || p.total.label || '');
    return { value: p.total.value, unit, note: '', rows: p.rows || [] };
  }
  const rows = [...(p.rows || [])];
  const at = Math.max(0, rows.findIndex((r) => /time/i.test(r.label)));
  const [row] = rows.splice(at, 1);
  return row ? { value: row.value, unit: row.label, note: row.note || '', rows } : { value: null, unit: '', note: '', rows };
}

/** Returns { svg, width, height }. The SVG is complete and self-contained except for fonts. */
export function drawCard(spec, format = 'og') {
  const { w, h } = FORMATS[format];
  const sq = format === 'square';
  const M = sq ? 72 : 64;
  const W = w - M * 2;
  const isSite = spec.type === 'site';
  const fig = plateFigure(spec);
  const p = spec.panel || {};

  // The foot: the wordmark slot (the blaze and the name), the domain.
  const fy = sq ? h - 64 : h - 40;
  const bw = sq ? 52 : 46;
  const footTop = fy - bw * 0.58 - 2;

  // Sizes of the parts, per format.
  const S = sq
    ? { kind: 30, tip: 60, pad: 44, plateH: 280, gap: 30, head: 26, formH: 68, facts: 52, stripLabel: 28, pill: 56, stripNote: 24, sitePlateH: 190, title: 76 }
    : { kind: 26, tip: 56, pad: 40, plateH: 168, gap: 22, head: 22, formH: 56, facts: 42, stripLabel: 24, pill: 44, stripNote: 20, sitePlateH: 150, title: 60 };
  const figW = fig.value ? (sq ? 290 : 320) : 0;
  const nameW = W - S.tip - S.pad * 2 - figW;
  const sh = spec.score && fig.unit !== 'Score' ? (sq ? 52 : 46) : 0;
  const sw = sh ? Math.round(sh * 0.5 + String(spec.score).length * sh * 0.42) : 0;
  const route = p.route && p.route.length;

  /** Draws the block from `top`; returns { svg, bottom }. Run once to
   *  measure, once to place, so every card sits centred above the foot. */
  const block = (top) => {
    const out = [];
    let y = top;
    if (isSite) {
      // The headline is not a place, so it stands on the ground in ink.
      const titleBottom = y + S.title * 0.8 + (sq ? S.title * 1.08 : 0);
      const cfg = { x: M, maxW: W, titleBottom, titleSize: S.title, titleMin: 40, titleLines: 2, subSize: sq ? 32 : 28, subGap: sq ? 62 : 52, kindGap: 0, subMaxBottom: titleBottom + (sq ? 62 : 52), kindFixed: true };
      out.push(`<g id="header" data-cfg='${JSON.stringify(cfg)}'>`);
      out.push(text(M, 0, '', { extra: ' data-role="kind"' }));
      out.push(text(M, 200, spec.title, { size: cfg.titleSize, weight: 800, fill: C.ink, extra: ' data-role="title"' }));
      out.push(text(M, 300, spec.subtitle, { size: cfg.subSize, fill: C.inkSoft, extra: ' data-role="sub"' }));
      out.push('</g>');
      y = cfg.subMaxBottom + (sq ? 44 : 30);
      if (spec.panel) {
        // The example: its head ("Example"), then a real place on its plate
        // with its unit, then its formation.
        const name = String(p.head || '').replace(/^Example,\s*/, '');
        out.push(text(M, y + S.head * 0.8, 'Example', { size: S.head, weight: 700, fill: C.inkSoft }));
        y += S.head + 10;
        const ph = S.sitePlateH;
        out.push(platePath(M, y, W, ph, S.tip));
        out.push(text(M + S.pad, y + ph * 0.6, name, { font: 'plate', size: sq ? 96 : 80, weight: 700, fill: C.onPlate, fit: { maxW: nameW, min: 40 } }));
        if (fig.value) {
          out.push(text(M + W - S.tip - S.pad, y + ph * 0.52, fig.value, { size: sq ? 84 : 72, weight: 800, fill: C.onPlate, anchor: 'end', fit: { maxW: figW - 20, min: 36 } }));
          out.push(text(M + W - S.tip - S.pad, y + ph * 0.52 + (sq ? 42 : 36), fig.unit, { size: sq ? 26 : 22, weight: 600, fill: C.onPlate2, anchor: 'end', fit: { maxW: figW - 20, min: 14 } }));
        }
        y += ph + S.gap;
        out.push(formation(fig.rows, M, y, W, S.formH));
        y += S.formH;
      }
      return { svg: out.join(''), bottom: y };
    }

    // The kind.
    out.push(text(M, y + S.kind * 0.8, spec.kind, { size: S.kind, weight: 700, fill: C.inkSoft }));
    y += S.kind + 12;

    // The plate: the name, the line under it in beige, the figure and its
    // unit on the square end.
    const plateTop = y;
    // A wide card with months takes a shorter plate, so all of it fits.
    const plateH = !sq && spec.strip ? 136 : S.plateH;
    out.push(platePath(M, plateTop, W, plateH, S.tip));
    const cfg = {
      x: M + S.pad, maxW: nameW, titleBottom: plateTop + plateH * 0.55, titleSize: sq ? 96 : 88, titleMin: sq ? 56 : 48, titleLines: 2,
      subSize: sq ? 26 : 26, subGap: sq ? 48 : 40, kindGap: 0, subMaxBottom: 0, kindFixed: true, plateTop, plateH,
    };
    cfg.subMaxBottom = cfg.titleBottom + cfg.subGap;
    out.push(`<g id="header" data-cfg='${JSON.stringify(cfg)}'>`);
    out.push(text(M, 0, '', { extra: ' data-role="kind"' }));
    out.push(text(cfg.x, 200, spec.title, { font: 'plate', size: cfg.titleSize, weight: 700, fill: C.onPlate, extra: ' data-role="title"' }));
    out.push(text(cfg.x, 300, spec.subtitle || '', { size: cfg.subSize, weight: 600, fill: C.onPlate2, extra: ' data-role="sub"' }));
    out.push('</g>');
    if (fig.value) {
      const fx = M + W - S.tip - S.pad;
      const fyy = plateTop + plateH / 2 + (sq ? 12 : 8);
      out.push(text(fx, fyy, fig.value, { size: sq ? 92 : 76, weight: 800, fill: C.onPlate, anchor: 'end', fit: { maxW: figW - 16, min: 36 } }));
      if (fig.unit) out.push(text(fx, fyy + (sq ? 46 : 38), fig.unit, { size: sq ? 26 : 22, weight: 600, fill: C.onPlate2, anchor: 'end', fit: { maxW: figW - 16, min: 14 } }));
    }
    y = plateTop + plateH + S.gap;

    // The head line: the panel's head on the left; on the right the Score
    // plate (when the plate's figure is not the Score) or the note of the
    // figure the plate carries (a walk's time: how it was estimated).
    const headY = y + Math.max(S.head * 0.8, sh * 0.72);
    if (p.head) out.push(text(M, headY, p.head, { size: S.head, weight: 700, fill: C.inkSoft, fit: { maxW: W * 0.5, min: 14 } }));
    if (sh) {
      const lw = Math.round(S.head * 0.56 * 5) + 10;
      out.push(scorePlate(M + W - sw, headY - sh * 0.72, spec.score, sh));
      out.push(text(M + W - sw - 12, headY, 'Score', { size: S.head, weight: 700, fill: C.inkSoft, anchor: 'end' }));
      void lw;
    } else if (fig.note) {
      out.push(text(M + W, headY, `${fig.unit}: ${fig.note.charAt(0).toLowerCase()}${fig.note.slice(1)}`, { size: S.head * 0.86, weight: 500, fill: C.inkSoft, anchor: 'end', fit: { maxW: W * 0.48, min: 12 } }));
    }
    y = headY + (sq ? 22 : 16);

    // The content: the formation for a place, the facts (with their notes)
    // for the rest, a walk's route beside them (under them on the square).
    if (spec.type === 'destination') {
      out.push(formation(fig.rows, M, y, W, S.formH));
      y += S.formH;
    } else if (route) {
      const rw = sq ? W : 420;
      const f = facts(fig.rows, M, y, sq ? W : W - rw - 32, { cols: sq ? 3 : 2, size: S.facts });
      out.push(f.svg);
      const rh = sq ? 170 : Math.max(f.h, 150);
      const rx = sq ? M : M + W - rw;
      const ry = sq ? y + f.h + 20 : y;
      out.push(`<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="12" fill="${C.paperDim}"/>`);
      out.push(routePath(p.route, rx, ry, rw, rh));
      y = sq ? ry + rh : y + Math.max(f.h, rh);
    } else {
      const f = facts(fig.rows, M, y, W, { cols: 3, size: !sq && spec.strip ? 36 : S.facts });
      out.push(f.svg);
      y += f.h;
    }

    // The months, with what they mean on the label's line (the lake's
    // warmest water) and the method under them.
    if (spec.strip) {
      y += sq ? 34 : 26;
      const ly = y + S.stripLabel * 0.8;
      out.push(text(M, ly, spec.strip.label, { size: S.stripLabel, weight: 700, fill: C.ink }));
      const note = String(spec.strip.note || '');
      const m = /^(Warmest water about [^,]+)(?:,\s*(.*))?$/.exec(note);
      if (m) out.push(text(M + W, ly, m[1], { size: S.stripLabel, weight: 700, fill: C.ink, anchor: 'end', fit: { maxW: W * 0.55, min: 14 } }));
      y = ly + 14;
      out.push(strip(spec, M, y, W, S.pill));
      y += S.pill;
      const method = m ? (m[2] ? `${m[2].charAt(0).toUpperCase()}${m[2].slice(1)}` : '') : note;
      if (method && !sq && m) {
        // On the wide card the method rides on the label's line.
        out.push(text(M + Math.round(spec.strip.label.length * S.stripLabel * 0.58) + 14, ly, method, { size: S.stripNote, weight: 500, fill: C.inkSoft, fit: { maxW: W * 0.25, min: 12 } }));
      } else if (method) {
        out.push(text(M, y + S.stripNote + 8, method, { size: S.stripNote, weight: 500, fill: C.inkSoft, fit: { maxW: W, min: 12 } }));
        y += S.stripNote + 12;
      }
    }
    return { svg: out.join(''), bottom: y };
  };

  // Measure, then centre the block between the top margin and the foot.
  const room = footTop - (sq ? 24 : 20);
  const probe = block(0);
  const top = Math.max(M * (sq ? 0.75 : 0.6), M * 0.6 + (room - M * 0.6 - probe.bottom) / 2);
  const placed = block(Math.round(top));

  const out = [`<rect width="${w}" height="${h}" fill="${C.paper}"/>`, placed.svg];
  // The lockup stands on the foot's baseline (APP_NAME is in its outlines).
  out.push(lockup(M, fy, Math.round(bw * 0.9)));
  out.push(text(w - M, fy - 2, DOMAIN, { size: sq ? 28 : 24, weight: 700, fill: C.inkSoft, anchor: 'end' }));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${out.join('')}</svg>`;
  return { svg, width: w, height: h };
}
