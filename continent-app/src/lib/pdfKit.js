/**
 * pdfKit.js (T430, T431; house style G1 2026-11): the parts every PDF is
 * made of, so the item pages and the trip page print as one family, and as
 * the same system as the screens (DESIGN.md "Print and share"): the blaze in
 * the wordmark slot, the signpost plate holding the name, the Score plate,
 * the receipt with dotted leaders, the months as umber wagons, the relief
 * from a place's real peaks on the cover.
 *
 *   type      Overpass at 400, 600 and 800 for every word and figure, and
 *             Sofia Sans Extra Condensed 700 for plate names and the
 *             wordmark: static TTFs made from the screens' own woff2 by
 *             scripts/print-fonts/build_print_fonts.py (OFL), with tabular
 *             figures frozen in, so a column of prices lines up on paper as
 *             it does on screen
 *   colour    the role tokens of src/styles/01-tokens.css, read live, with
 *             the token mirror as the fallback; ink is never black
 *   photos    drawn through a canvas as JPEG, with the credit under each,
 *             never on it; a photograph the browser may not read (CORS) is a
 *             sunken box with its caption, never a broken image
 *   lines     a route and a climb profile as vectors, flat (the 3D rule
 *             keeps charts flat)
 *   copy      no em dash, en dash or middot (stripDashes), sentence case
 *   cover     the parts both guides open with (T914): the wordmark, the
 *             title block, the price, the facts and a QR code back to the
 *             live page (qrcode-generator, MIT, loaded with the first PDF)
 *   drawings  thin bars, the twelve-month strip and a pin map (numbered
 *             pins placed by latitude and longitude in a plain frame, no
 *             tiles), all in ink so a page prints in black and white
 *
 * jsPDF arrives with the first PDF; nothing here loads before that.
 */
import { stripDashes, formatRange } from './format.js';
import { isPartnerLink } from './partnerLink.js';
import { TOKEN_COLOURS } from '../map/tokenColors.js';
import { layoutRelief, reliefPeaks } from './relief.js';
import overpassRegular from '../assets/print-fonts/Overpass-Regular.ttf?url';
import overpassSemiBold from '../assets/print-fonts/Overpass-SemiBold.ttf?url';
import overpassExtraBold from '../assets/print-fonts/Overpass-ExtraBold.ttf?url';
import plateBold from '../assets/print-fonts/SofiaSansExtraCondensed-Bold.ttf?url';

/** The name in the wordmark slot. The slot takes any name (DESIGN.md
 *  "Shell"); this is the one place print spells it. */
export const APP_NAME = 'Carta';

export const PAGE_W = 210;
export const PAGE_H = 297;
export const M = 16;
export const W = PAGE_W - 2 * M;
const FOOT = 12;

const FALLBACK = {
  '--text': TOKEN_COLOURS['--ink'],
  '--text-2': TOKEN_COLOURS['--ink-soft'],
  '--text-3': TOKEN_COLOURS['--ink-mute'],
  '--border': TOKEN_COLOURS['--rule'],
  '--border-soft': TOKEN_COLOURS['--rule-soft'],
  '--surface-sunken': TOKEN_COLOURS['--paper-dim'],
  '--action': TOKEN_COLOURS['--accent'],
  '--select-bg': TOKEN_COLOURS['--accent-bg'],
  '--amber-ink': TOKEN_COLOURS['--amber-ink'],
  '--status-success': TOKEN_COLOURS['--status-success'],
  '--rate': TOKEN_COLOURS['--rate'],
  '--plate': TOKEN_COLOURS['--plate'],
  '--umber-200': TOKEN_COLOURS['--accent-bg'],
  '--umber-50': TOKEN_COLOURS['--accent-bg'],
  '--edge': TOKEN_COLOURS['--ink-mute'],
};

/** A token as [r, g, b]: the live value (hex or rgb()), else the mirror. */
export function rgb(name) {
  let v = '';
  try { v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch { /* no DOM */ }
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(v);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = FALLBACK[name] || TOKEN_COLOURS['--ink'];
  return [1, 3, 5].map((i) => parseInt(f.slice(i, i + 2), 16));
}

// [file name in the PDF, bundled URL, family, style]. 'bold' is Overpass
// 800, the house weight for titles and figures.
const FONT_FILES = [
  ['Overpass-Regular.ttf', overpassRegular, 'Overpass', 'normal'],
  ['Overpass-SemiBold.ttf', overpassSemiBold, 'Overpass', 'semibold'],
  ['Overpass-ExtraBold.ttf', overpassExtraBold, 'Overpass', 'bold'],
  ['SofiaSansExtraCondensed-Bold.ttf', plateBold, 'PlateFace', 'bold'],
];
let fontCache = null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const out = [];
  for (const [file, url, family, style] of FONT_FILES) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      out.push({ file, family, style, b64: btoa(bin) });
    } catch { /* that weight falls back to the built-in face */ }
  }
  fontCache = out;
  return out;
}

/** A photograph as a JPEG data URL through a canvas, or null when the
 *  browser may not read it (no CORS) or it does not load in time. */
export function photoData(url, maxW = 1400) {
  return new Promise((resolve) => {
    if (!url || typeof Image === 'undefined') { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 9000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const scale = Math.min(1, maxW / img.naturalWidth);
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve({ data: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height });
      } catch { resolve(null); }
    };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

export const clean = (s) => stripDashes(String(s ?? '')).replace(/\*\*/g, '').replace(/\s*[\u00b7\u2022]\s*/g, ', ').replace(/\s+/g, ' ').trim();
/** Months as runs in the reader's language: "June to August",
 *  "April to June, September to October". `ms` holds 1 to 12. */
export function monthSpan(ms, loc = 'en-GB') {
  let f;
  try { f = new Intl.DateTimeFormat(loc, { month: 'long' }); } catch { f = new Intl.DateTimeFormat('en-GB', { month: 'long' }); }
  const name = (m) => f.format(new Date(2026, m - 1, 1));
  const list = [...new Set((ms || []).filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b);
  const runs = [];
  for (const m of list) {
    const last = runs[runs.length - 1];
    if (last && m === last[1] + 1) last[1] = m;
    else runs.push([m, m]);
  }
  return runs.map(([a, b]) => formatRange(a, b, name)).join(', ');
}
export const fileSlug = (s) => clean(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/**
 * A new A4 document with the kit's helpers bound to it.
 * `footerLabel` names the page in the footer ("Carta, Mount Korab").
 * `partnerNote` is the disclosure line (I15): a page that carries a partner
 * link prints it above the footer rule, so the mark is not lost in the PDF.
 */
export async function createPdf({ footerLabel = APP_NAME, pageLabel = (n, of) => `${n} / ${of}`, partnerNote = '' } = {}) {
  const { jsPDF } = await import('jspdf');
  const fonts = await loadFonts();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const has = new Set();
  for (const f of fonts) {
    doc.addFileToVFS(f.file, f.b64);
    doc.addFont(f.file, f.family, f.style);
    has.add(`${f.family}:${f.style}`);
  }
  // `style` 'plate' is the plate face (Sofia Sans Extra Condensed 700).
  const face = (style) => {
    if (style === 'plate') return has.has('PlateFace:bold') ? ['PlateFace', 'bold'] : face('bold');
    return has.has(`Overpass:${style}`) ? ['Overpass', style] : ['helvetica', style === 'normal' ? 'normal' : 'bold'];
  };
  const C = {
    text: rgb('--text'), text2: rgb('--text-2'), text3: rgb('--text-3'), border: rgb('--border'),
    soft: rgb('--border-soft'), sunken: rgb('--surface-sunken'), action: rgb('--action'),
    select: rgb('--select-bg'), warn: rgb('--amber-ink'), ok: rgb('--action'),
    rate: rgb('--rate'), white: [255, 255, 255], plate: rgb('--plate'),
    onPlate2: rgb('--umber-200'), selectRow: rgb('--umber-50'), edge: rgb('--edge'),
  };
  // The relief's shade lines are ink at 20 % on the band; print has no
  // reliable alpha, so the mix is made here (and stays legible in grey).
  const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
  C.shade = mix(C.sunken, C.text, 0.2);
  C.shadeIdx = mix(C.sunken, C.text, 0.32);
  C.blazeEdge = mix(C.white, C.text, 0.38);

  /** The blaze (DESIGN.md "Signature components"), w mm wide at (x, y):
   *  a white halo, the square umber paint stripe, the short ink heel. The
   *  same proportions as `.hs-blaze`. Only where it means "here": the
   *  wordmark slot, the place on its own map, the relief cut.
   *  `blank` draws the dashed stripe (the path not yet walked). */
  const blaze = (x, y, w = 6, { blank = false } = {}) => {
    const h = (w * 14) / 24;
    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.blazeEdge);
    doc.setLineWidth(Math.max(0.12, w * 0.02));
    doc.roundedRect(x, y, w, h, h * 0.1, h * 0.1, 'FD');
    if (blank) {
      doc.setDrawColor(...C.action);
      doc.setLineWidth(h * 0.12);
      doc.setLineDashPattern([w * 0.08, w * 0.06], 0);
      doc.line(x + w * 0.14, y + h * 0.36, x + w * 0.86, y + h * 0.36);
      doc.setLineDashPattern([], 0);
    } else {
      doc.setFillColor(...C.action);
      doc.rect(x + w * 0.14, y + h * 0.2, w * 0.72, h * 0.36, 'F');
    }
    doc.setFillColor(...C.text);
    doc.rect(x + w * 0.52, y + h * 0.75, w * 0.34, Math.max(0.25, h * 0.11), 'F');
    return h;
  };
  const state = { y: M, page: 1, partner: false };
  // Any link written to the page that carries a partner id flags the page.
  for (const fn of ['link', 'textWithLink']) {
    const orig = doc[fn].bind(doc);
    doc[fn] = (...a) => {
      const url = a.find((x) => x && typeof x === 'object' && typeof x.url === 'string')?.url;
      if (url && isPartnerLink(url)) state.partner = true;
      return orig(...a);
    };
  }
  const TOTAL = '{total_pages}';

  const font = (style, size, color = C.text) => {
    doc.setFont(...face(style));
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const lh = (size, lead = 1.4) => size * 0.3528 * lead;
  const lines = (text, size, width, style = 'normal') => {
    doc.setFont(...face(style));
    doc.setFontSize(size);
    return doc.splitTextToSize(clean(text), width);
  };
  const footer = () => {
    doc.setDrawColor(...C.soft);
    doc.setLineWidth(0.2);
    doc.line(M, PAGE_H - FOOT, PAGE_W - M, PAGE_H - FOOT);
    font('normal', 7.5, C.text3);
    if (state.partner && partnerNote) {
      doc.text(clean(partnerNote), M, PAGE_H - FOOT - 1.5);
      state.partner = false;
    }
    // The wordmark slot in small: the blaze before the page's label.
    blaze(M, PAGE_H - FOOT + 2.6, 4);
    font('normal', 7.5, C.text3);
    doc.text(clean(footerLabel), M + 5.6, PAGE_H - FOOT + 4.5);
    // The total is written in after the last page, so the label is set
    // from the left at the width its final text will have (one digit).
    const pl = pageLabel(state.page, TOTAL);
    const plW = doc.getTextWidth(pageLabel(state.page, '9'));
    doc.text(pl, PAGE_W - M - plW, PAGE_H - FOOT + 4.5);
  };
  const newPage = () => {
    footer();
    doc.addPage();
    state.page += 1;
    state.y = M;
  };
  const ensure = (h) => { if (state.y + h > PAGE_H - FOOT - 4) newPage(); };
  const gap = (mm) => { state.y += mm; };

  const para = (text, { size = 10, style = 'normal', color = C.text, width = W, x = M, after = 2 } = {}) => {
    if (!text) return;
    const ls = lines(text, size, width, style);
    const step = lh(size);
    for (const l of ls) {
      ensure(step);
      font(style, size, color);
      doc.text(l, x, state.y, { baseline: 'top' });
      state.y += step;
    }
    state.y += after;
  };
  const h1 = (text) => {
    const ls = lines(text, 22, W, 'bold');
    ensure(ls.length * lh(22, 1.18) + 4);
    font('bold', 22);
    doc.text(ls, M, state.y, { baseline: 'top', lineHeightFactor: 1.18 });
    state.y += ls.length * lh(22, 1.18) + 2;
  };
  const h2 = (text) => {
    ensure(30);
    state.y += 5;
    font('bold', 14);
    doc.text(clean(text), M, state.y, { baseline: 'top' });
    state.y += lh(14) + 2.5;
  };
  const h3 = (text) => {
    ensure(18);
    font('semibold', 11);
    doc.text(clean(text), M, state.y, { baseline: 'top' });
    state.y += lh(11) + 0.8;
  };
  const rule = (color = C.soft) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.2);
    doc.line(M, state.y, PAGE_W - M, state.y);
  };

  /** Label over value, `cols` across, hairlines between rows. */
  const facts = (cells, cols = 3) => {
    const list = (cells || []).filter((c) => c && c.value);
    if (!list.length) return;
    const cw = W / cols;
    for (let i = 0; i < list.length; i += cols) {
      const row = list.slice(i, i + cols);
      // A value runs to two lines at most; the row takes the tallest.
      const vals = row.map((c) => lines(c.value, 11.5, cw - 3, 'semibold').slice(0, 2));
      const tall = Math.max(...vals.map((v) => v.length));
      ensure(9 + tall * lh(11.5, 1.2));
      rule();
      state.y += 2.5;
      row.forEach((c, k) => {
        const x = M + k * cw;
        font('normal', 8, C.text2);
        doc.text(clean(c.label), x, state.y, { baseline: 'top' });
        font('semibold', 11.5);
        doc.text(vals[k], x, state.y + 4.2, { baseline: 'top', lineHeightFactor: 1.2 });
      });
      state.y += 6.5 + tall * lh(11.5, 1.2);
    }
    rule();
    state.y += 3;
  };

  /** A tick or a cross, then the words; for "what is included". */
  const tickRow = (ok, text, value = '') => {
    ensure(7);
    const cy = state.y + 2;
    doc.setLineWidth(0.5);
    if (ok) {
      doc.setDrawColor(...C.ok);
      doc.line(M, cy, M + 1.4, cy + 1.5);
      doc.line(M + 1.4, cy + 1.5, M + 3.6, cy - 1.4);
    } else {
      doc.setDrawColor(...C.text3);
      doc.line(M + 0.4, cy - 1.2, M + 3, cy + 1.4);
      doc.line(M + 3, cy - 1.2, M + 0.4, cy + 1.4);
    }
    font('normal', 10, ok ? C.text : C.text2);
    doc.text(clean(text), M + 6, state.y, { baseline: 'top' });
    if (value) {
      font('semibold', 10);
      doc.text(clean(value), PAGE_W - M, state.y, { baseline: 'top', align: 'right' });
    }
    state.y += 6.2;
  };

  /** A receipt line (DESIGN.md "Receipt"): the words reach their figure
   *  along a dotted leader. A `bold` line is the total: ruled off in ink
   *  above it, no leader, the figure the loudest on the page section. */
  const moneyRow = (label, value, { bold = false } = {}) => {
    ensure(8);
    if (bold) {
      state.y += 1;
      doc.setDrawColor(...C.text);
      doc.setLineWidth(0.5);
      doc.line(M, state.y, PAGE_W - M, state.y);
      state.y += 2.4;
    } else {
      state.y += 1.4;
    }
    const lab = clean(label);
    const val = clean(value);
    font(bold ? 'bold' : 'normal', bold ? 11 : 10, bold ? C.text : C.text2);
    doc.text(lab, M, state.y, { baseline: 'top' });
    const lw = doc.getTextWidth(lab);
    font('bold', bold ? 13 : 10.5);
    doc.text(val, PAGE_W - M, state.y, { baseline: 'top', align: 'right' });
    const vw = doc.getTextWidth(val);
    if (!bold) {
      const x1 = M + lw + 2;
      const x2 = PAGE_W - M - vw - 2;
      if (x2 - x1 > 4) {
        doc.setDrawColor(...C.edge);
        doc.setLineWidth(0.35);
        doc.setLineCap('round');
        doc.setLineDashPattern([0.01, 1.1], 0);
        doc.line(x1, state.y + 2.7, x2, state.y + 2.7);
        doc.setLineDashPattern([], 0);
        doc.setLineCap('butt');
      }
    }
    state.y += bold ? 7.5 : 5.6;
  };

  /** A photograph at the kit's corners with its name and credit under it.
   *  `ph` is { url, caption, author, licence }. */
  const photo = async (ph, { x = M, w = W, ratio = 3 / 2, maxH = 110, caption = true, advance = true } = {}) => {
    if (!ph?.url) return 0;
    const h = Math.min(maxH, w / ratio);
    const top = state.y;
    if (advance) ensure(h + (caption ? 9 : 2));
    const img = await photoData(ph.url);
    if (img) {
      // Cover the box: crop the photograph's long side, never stretch it.
      const r = img.w / img.h;
      const boxR = w / h;
      doc.saveGraphicsState();
      doc.roundedRect(x, state.y, w, h, 3, 3, null);
      doc.clip();
      doc.discardPath();
      if (r > boxR) {
        const dw = h * r;
        doc.addImage(img.data, 'JPEG', x - (dw - w) / 2, state.y, dw, h);
      } else {
        const dh = w / r;
        doc.addImage(img.data, 'JPEG', x, state.y - (dh - h) / 2, w, dh);
      }
      doc.restoreGraphicsState();
    } else {
      doc.setFillColor(...C.sunken);
      doc.roundedRect(x, state.y, w, h, 3, 3, 'F');
      font('semibold', 10, C.text2);
      doc.text(clean(ph.caption || ''), x + w / 2, state.y + h / 2, { align: 'center', baseline: 'middle' });
    }
    state.y += h + 1.6;
    if (caption) {
      const credit = [ph.author, ph.licence].filter(Boolean).join(', ');
      // The name keeps to its side of the credit, cut to one line, so two
      // photographs side by side never print over each other.
      font('normal', 7, C.text3);
      const creditW = credit ? Math.min(w * 0.55, doc.getTextWidth(clean(credit))) + 3 : 0;
      font('semibold', 8.5);
      const capLine = doc.splitTextToSize(clean(ph.caption || ''), Math.max(10, w - creditW))[0] || '';
      doc.text(capLine, x, state.y, { baseline: 'top' });
      if (credit) {
        font('normal', 7, C.text3);
        doc.text(clean(credit), x + w, state.y + 0.4, { baseline: 'top', align: 'right', maxWidth: w * 0.55 });
      }
      state.y += 6;
    }
    const used = state.y - top;
    if (!advance) state.y = top;
    return used;
  };

  /** Two photographs side by side, each with its name and credit. */
  const photoPair = async (a, b, { ratio = 4 / 3 } = {}) => {
    const w = (W - 6) / 2;
    ensure(w / ratio + 10);
    const used = await photo(a, { x: M, w, ratio, advance: false });
    const used2 = b ? await photo(b, { x: M + w + 6, w, ratio, advance: false }) : 0;
    state.y += Math.max(used, used2) + 2;
  };

  /** A polyline of [lon, lat] points, fitted into a box, flat. */
  const route = (coords, { h = 70, color = C.action } = {}) => {
    const pts = (coords || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length < 2) return;
    ensure(h + 4);
    const lat0 = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const kx = Math.cos((lat0 * Math.PI) / 180);
    const xs = pts.map((p) => p[0] * kx);
    const ys = pts.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const s = Math.min((W - 8) / Math.max(1e-6, maxX - minX), (h - 8) / Math.max(1e-6, maxY - minY));
    const ox = M + (W - (maxX - minX) * s) / 2;
    const oy = state.y + (h - (maxY - minY) * s) / 2;
    doc.setFillColor(...C.sunken);
    doc.roundedRect(M, state.y, W, h, 3, 3, 'F');
    doc.setDrawColor(...color);
    doc.setLineWidth(0.8);
    doc.setLineJoin('round');
    doc.setLineCap('round');
    const P = (i) => [ox + (xs[i] - minX) * s, oy + (maxY - ys[i]) * s];
    for (let i = 1; i < pts.length; i += 1) doc.line(...P(i - 1), ...P(i));
    doc.setFillColor(...C.text);
    doc.circle(...P(0), 1.2, 'F');
    state.y += h + 4;
  };

  /** A climb profile from [distanceKm, elevationM] pairs, flat. */
  const profile = (pairs, { h = 34, label = '' } = {}) => {
    const pts = (pairs || []).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length < 2) return;
    ensure(h + 8);
    const maxD = pts[pts.length - 1][0] || 1;
    const minE = Math.min(...pts.map((p) => p[1]));
    const maxE = Math.max(...pts.map((p) => p[1]));
    const X = (d) => M + (d / maxD) * W;
    const Y = (e) => state.y + h - ((e - minE) / Math.max(1, maxE - minE)) * (h - 4);
    doc.setFillColor(...C.select);
    const poly = pts.map((p) => [X(p[0]), Y(p[1])]);
    const path = [[M, state.y + h], ...poly, [M + W, state.y + h]];
    doc.lines(path.slice(1).map((p, i) => [p[0] - path[i][0], p[1] - path[i][1]]), path[0][0], path[0][1], [1, 1], 'F', true);
    doc.setDrawColor(...C.action);
    doc.setLineWidth(0.6);
    for (let i = 1; i < poly.length; i += 1) doc.line(...poly[i - 1], ...poly[i]);
    font('normal', 7.5, C.text3);
    doc.text(`${Math.round(maxE).toLocaleString('en')} m`, M, state.y - 0.5, { baseline: 'bottom' });
    if (label) doc.text(clean(label), PAGE_W - M, state.y - 0.5, { baseline: 'bottom', align: 'right' });
    state.y += h + 5;
  };

  /** A link line: the words, live in the PDF. */
  const link = (label, url) => {
    if (!url) return;
    ensure(6);
    font('normal', 9.5, C.action);
    doc.textWithLink(clean(label), M, state.y, { url, baseline: 'top' });
    state.y += 5.5;
  };

  // ── Shared cover parts and drawings (T914) ──

  /** The wordmark slot at (x, y), top left, as on the screens' header: the
   *  blaze ("here") and the name in the plate face. Returns its height. */
  const wordmark = (x = M, y = state.y, size = 15) => {
    const bw = size * 0.52;
    const bh = blaze(x, y + 0.2, bw);
    font('plate', size);
    doc.text(APP_NAME, x + bw + 2, y + bh / 2 + 0.2, { baseline: 'middle' });
    return bh;
  };

  /** The Score plate: ink, the white figure out of 10. Returns its width. */
  const scorePlate = (value, x, y, { h = 6.4 } = {}) => {
    const v = clean(value);
    font('bold', h * 1.75, C.white);
    const w = doc.getTextWidth(v) + h * 0.9;
    doc.setFillColor(...C.plate);
    doc.roundedRect(x, y, w, h, 1, 1, 'F');
    font('bold', h * 1.75, C.white);
    doc.text(v, x + w / 2, y + h / 2 + 0.45, { align: 'center', baseline: 'middle' });
    return w;
  };

  /**
   * The signpost plate (DESIGN.md "Plate", place variant): an ink plate,
   * the pointed end to the right, the name in the plate face, a second line
   * in beige, the figure at the right in Overpass 800. Only where a place
   * meets its figure; never as an ordinary banner. Long names wrap to two
   * lines inside the plate.
   */
  const plate = ({ name, sub = '', figure = '', unit = '' } = {}, { size = 26 } = {}) => {
    const tip = 9;
    const pad = 6;
    const figW = figure ? (() => { font('bold', size * 0.82); return doc.getTextWidth(clean(figure)) + pad; })() : 0;
    const nameW = W - tip - pad * 2 - figW;
    const nl = lines(name, size, nameW, 'plate').slice(0, 2);
    const nameH = nl.length * lh(size, 1.0);
    const subH = sub ? lh(10.5, 1.3) + 1 : 0;
    const h = Math.max(20, nameH + subH + pad * 1.6);
    ensure(h + 4);
    const x = M;
    const y = state.y;
    const r = 1.8;
    doc.setFillColor(...C.plate);
    // Rounded square end on the left, a pointed end on the right.
    doc.roundedRect(x, y, W - tip, h, r, r, 'F');
    doc.lines([[tip, h / 2], [-tip, h / 2]], x + W - tip - 0.01, y, [1, 1], 'F', true);
    let ty = y + (h - nameH - subH) / 2;
    font('plate', size, C.white);
    doc.text(nl, x + pad, ty, { baseline: 'top', lineHeightFactor: 1.0 });
    ty += nameH + 1;
    if (sub) {
      font('semibold', 10.5, C.onPlate2);
      doc.text(lines(sub, 10.5, nameW, 'semibold')[0] || '', x + pad, ty, { baseline: 'top' });
    }
    if (figure) {
      const fx = x + W - tip - pad;
      font('bold', size * 0.82, C.white);
      doc.text(clean(figure), fx, y + h / 2 - (unit ? 1.6 : 0), { baseline: 'middle', align: 'right' });
      if (unit) {
        font('normal', 8.5, C.onPlate2);
        doc.text(clean(unit), fx, y + h / 2 + 4.6, { baseline: 'middle', align: 'right' });
      }
    }
    state.y = y + h + 3;
    return h;
  };

  /**
   * The relief (DESIGN.md "Background graphics"), drawn only from a place's
   * real peaks, in a band `h` mm high across the column: illuminated
   * contours on the band, a hard umber cut with the blaze, and the peaks'
   * real heights on the flat side, a gutter before the cut, never on the
   * contours. No peak: nothing, returns false.
   */
  const relief = (mountains, { seed = 'relief', h = 30, format = (n) => n.toLocaleString('en') } = {}) => {
    const peaks = reliefPeaks(mountains);
    if (!peaks.length) return false;
    const pxPerMm = 4;
    const zoneX = M + W * 0.3;
    const zoneW = PAGE_W - M - zoneX;
    const drawn = layoutRelief(peaks, { w: zoneW * pxPerMm, h: h * pxPerMm, seed, format });
    if (!drawn) return false;
    ensure(h + 12);
    const top = state.y;
    doc.setFillColor(...C.sunken);
    doc.roundedRect(M, top, W, h, 3, 3, 'F');
    doc.saveGraphicsState();
    doc.rect(zoneX, top, zoneW, h, null);
    doc.clip();
    doc.discardPath();
    const k = 1 / pxPerMm;
    const draw = (path, color, width) => {
      if (!path) return;
      doc.setDrawColor(...color);
      doc.setLineWidth(width);
      const re = /M([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)/g;
      let m;
      while ((m = re.exec(path))) {
        doc.line(zoneX + m[1] * k, top + m[2] * k, zoneX + m[3] * k, top + m[4] * k);
      }
    };
    draw(drawn.paths.sh2, C.shade, 0.18);
    draw(drawn.paths.sh1, C.shade, 0.24);
    draw(drawn.paths.is, C.shadeIdx, 0.32);
    draw(drawn.paths.lit2, C.white, 0.18);
    draw(drawn.paths.lit1, C.white, 0.26);
    draw(drawn.paths.il, C.white, 0.36);
    doc.restoreGraphicsState();
    // The cut: a thin umber line where the zone starts, the blaze on it.
    doc.setDrawColor(...C.action);
    doc.setLineWidth(0.5);
    doc.line(zoneX, top, zoneX, top + h);
    blaze(zoneX - 3, top + 2.5, 6);
    // Each height at its own summit: an ink point and the name and height
    // on a paper tag above it (DESIGN.md "Background graphics": a height on
    // a paper tag, never words straight on the contours).
    for (const sp of drawn.spots.slice(0, 3)) {
      const sx = zoneX + sp.x * k;
      const sy = top + sp.y * k;
      const label = clean(sp.text);
      font('semibold', 8, C.text);
      const tw = doc.getTextWidth(label) + 3;
      const tx = Math.min(Math.max(sx - tw / 2, zoneX + 1.5), PAGE_W - M - tw - 1.5);
      const tyTop = Math.max(top + 1.2, sy - 7.2);
      doc.setFillColor(...C.text);
      doc.circle(sx, Math.min(sy, top + h - 1.5), 0.7, 'F');
      doc.setFillColor(...C.white);
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.15);
      doc.roundedRect(tx, tyTop, tw, 4.6, 0.8, 0.8, 'FD');
      font('semibold', 8, C.text);
      doc.text(label, tx + 1.5, tyTop + 2.4, { baseline: 'middle' });
    }
    state.y = top + h + 3;
    return true;
  };

  /** The Score's star, filled, centred on (cx, cy). */
  const star = (cx, cy, r, color = C.rate) => {
    const pts = [];
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
    doc.setFillColor(...color);
    doc.lines(pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], 'F', true);
  };

  /** A QR code for `url`, `size` mm square at (x, y), in ink, and live as a
   *  link too. False when the encoder cannot load: the caller prints the
   *  short link alone. */
  const qr = async (url, x, y, size) => {
    if (!url) return false;
    let make;
    try { make = (await import('qrcode-generator')).default; } catch { return false; }
    const code = make(0, 'M');
    code.addData(url);
    code.make();
    const n = code.getModuleCount();
    const cell = size / n;
    doc.setFillColor(...C.text);
    for (let r = 0; r < n; r += 1) {
      let c = 0;
      while (c < n) {
        if (!code.isDark(r, c)) { c += 1; continue; }
        let e = c;
        while (e < n && code.isDark(r, e)) e += 1;
        // A hair of overlap so no white seam shows between modules.
        doc.rect(x + c * cell, y + r * cell, (e - c) * cell + 0.03, cell + 0.03, 'F');
        c = e;
      }
    }
    doc.link(x, y, size, size, { url });
    return true;
  };

  /** A new page for a section, unless this one is still empty. */
  const startPage = (title) => {
    if (state.y > M + 1) newPage();
    if (title) h1(title);
  };

  /**
   * The cover both guides open with: the wordmark slot, a photograph with
   * its credit under it, then the name. A place (`place: true`) prints its
   * name on the signpost plate with its day figure (the place and its
   * figure as one unit); a trip prints a plain title and its total on the
   * total plate. The lines under it (one may carry the Score:
   * `{ score, text }`), the relief when the place has real peaks
   * (`relief: { mountains, seed }`), the facts two across, and a QR code
   * back to the live page at the foot.
   */
  const cover = async ({ photo: ph, title, lines: sub = [], price, facts: cells = [], qr: q, place = false, relief: rel = null } = {}) => {
    wordmark(M, state.y);
    state.y += 10;
    if (ph?.url) await photo(ph, { ratio: 16 / 9, maxH: 92 });
    const rest = [...sub];
    if (place) {
      // The first plain line (the country) rides on the plate in beige.
      const i = rest.findIndex((s) => typeof s === 'string' && s);
      const plateSub = i >= 0 ? rest.splice(i, 1)[0] : '';
      plate({ name: title, sub: plateSub, figure: price?.value || '', unit: price?.unit || '' });
    } else {
      const tl = lines(title, 28, W, 'bold');
      font('bold', 28);
      doc.text(tl, M, state.y, { baseline: 'top', lineHeightFactor: 1.08 });
      state.y += tl.length * lh(28, 1.08) + 2;
    }
    for (const s of rest) {
      if (!s) continue;
      if (typeof s === 'object' && s.score) {
        const size = 11;
        // The words' first line sits on the plate's centre line.
        const ph = 6.4;
        const sw = scorePlate(s.score, M, state.y, { h: ph });
        const sx = M + sw + 2.5;
        const words = lines(s.text || '', size, PAGE_W - M - sx);
        font('normal', size, C.text2);
        doc.text(words, sx, state.y + ph / 2 + 0.9, { baseline: 'middle', lineHeightFactor: 1.35 });
        state.y += Math.max(ph + 2, ph / 2 + words.length * lh(size, 1.35) + 1);
      } else {
        para(s, { size: 11, color: C.text2, after: 1 });
      }
    }
    if (!place && price?.value) {
      // The total plate: the unit above, the figure big, once per page.
      state.y += 3;
      font('bold', 22);
      const pv = clean(price.value);
      const pw = Math.max(doc.getTextWidth(pv), (() => { font('semibold', 9); return doc.getTextWidth(clean(price.unit || '')); })()) + 12;
      const ph2 = 21;
      ensure(ph2 + 3);
      doc.setFillColor(...C.plate);
      doc.roundedRect(M, state.y, pw, ph2, 1.8, 1.8, 'F');
      font('semibold', 9, C.onPlate2);
      doc.text(clean(price.unit || ''), M + 6, state.y + 4.2, { baseline: 'top' });
      font('bold', 22, C.white);
      doc.text(pv, M + 6, state.y + 9, { baseline: 'top' });
      state.y += ph2 + 4;
    }
    if (rel?.mountains) {
      state.y += 2;
      relief(rel.mountains, { seed: rel.seed || title, format: rel.format });
    }
    state.y += 1;
    facts(cells, 2);
    if (q?.url) {
      const size = 26;
      const qy = Math.max(state.y + 4, PAGE_H - FOOT - 6 - size);
      if (qy + size <= PAGE_H - FOOT - 3) {
        const drawn = await qr(q.url, M, qy, size);
        const tx = drawn ? M + size + 6 : M;
        let ty = qy + 3;
        font('semibold', 11.5);
        doc.text(clean(q.head || ''), tx, ty, { baseline: 'top' });
        ty += lh(11.5) + 0.5;
        if (q.note) {
          font('normal', 9.5, C.text2);
          doc.text(lines(q.note, 9.5, PAGE_W - M - tx), tx, ty, { baseline: 'top' });
          ty += lh(9.5) + 0.5;
        }
        font('normal', 9, C.action);
        const short = clean(q.url.replace(/^https?:\/\/(www\.)?/, ''));
        doc.textWithLink(doc.splitTextToSize(short, PAGE_W - M - tx)[0], tx, ty, { url: q.url, baseline: 'top' });
        state.y = qy + size;
      }
    }
  };

  /** Thin bars, one a row: the label, an umber bar on the band scaled to
   *  `of` (the whole), the figure right. Rows without a figure drop out. */
  const bars = (rows, { of = null, labelW = 48, valueW = 24 } = {}) => {
    const list = (rows || []).filter((r) => r && Number.isFinite(r.value) && r.value > 0);
    if (!list.length) return;
    const whole = of || Math.max(...list.map((r) => r.value));
    const trackW = W - labelW - valueW;
    for (const r of list) {
      ensure(8);
      font('normal', 10.5);
      doc.text(clean(r.label), M, state.y, { baseline: 'top' });
      const by = state.y + 1.4;
      doc.setFillColor(...C.sunken);
      doc.roundedRect(M + labelW, by, trackW, 2.4, 1.2, 1.2, 'F');
      doc.setFillColor(...C.action);
      doc.roundedRect(M + labelW, by, Math.max(2.4, trackW * Math.min(1, r.value / whole)), 2.4, 1.2, 1.2, 'F');
      font('bold', 10.5);
      doc.text(clean(r.text), PAGE_W - M, state.y, { baseline: 'top', align: 'right' });
      state.y += 7.5;
    }
    state.y += 1;
  };

  /** The twelve-month strip: the good months as solid umber wagons with
   *  white letters (bold), the rest outlined on the control edge; the
   *  weight says it too, so it reads in black and white. */
  const monthStrip = (best, labels, { h = 9 } = {}) => {
    const on = new Set(best || []);
    ensure(h + 4);
    const cw = W / 12;
    labels.forEach((l, i) => {
      const x = M + i * cw;
      const good = on.has(i + 1);
      if (good) {
        doc.setFillColor(...C.action);
        doc.roundedRect(x + 0.4, state.y, cw - 0.8, h, h / 2, h / 2, 'F');
      } else {
        doc.setDrawColor(...C.edge);
        doc.setLineWidth(0.3);
        doc.roundedRect(x + 0.4, state.y, cw - 0.8, h, h / 2, h / 2, 'S');
      }
      font(good ? 'bold' : 'normal', 9, good ? C.white : C.text2);
      doc.text(clean(l), x + cw / 2, state.y + h / 2, { align: 'center', baseline: 'middle' });
    });
    state.y += h + 3;
  };

  /**
   * A plain map: numbered pins placed by latitude and longitude in a sunken
   * frame, no tiles. `pins` is [{ lat, lon, n }], `centre` the place itself
   * (a ring), `scaleLabel(km)` writes the scale bar's distance.
   */
  const pinMap = (pins, { h = 110, centre = null, scaleLabel = (km) => `${km} km` } = {}) => {
    const pts = (pins || []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
    if (!pts.length) return;
    ensure(h + 4);
    const top = state.y;
    const all = centre && Number.isFinite(centre.lat) && Number.isFinite(centre.lon) ? [...pts, centre] : pts;
    const lat0 = all.reduce((a, p) => a + p.lat, 0) / all.length;
    const kx = Math.cos((lat0 * Math.PI) / 180);
    const xs = all.map((p) => p.lon * kx);
    const ys = all.map((p) => p.lat);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = 10;
    const s = Math.min((W - 2 * pad) / Math.max(1e-4, maxX - minX), (h - 2 * pad) / Math.max(1e-4, maxY - minY));
    const ox = M + (W - (maxX - minX) * s) / 2;
    const oy = top + (h - (maxY - minY) * s) / 2;
    const P = (p) => [ox + (p.lon * kx - minX) * s, oy + (maxY - p.lat) * s];
    doc.setFillColor(...C.sunken);
    doc.roundedRect(M, top, W, h, 3, 3, 'F');
    // The place itself is "here": the blaze, as on the screens' maps.
    const here = all.length > pts.length ? P(centre) : null;
    // Pins that would cover each other step aside a little, then the first
    // pin is drawn last, so it sits on top.
    const placed = [];
    for (const p of pts) {
      let [x, y] = P(p);
      for (let k = 0; k < 8 && placed.some(([a, b]) => Math.hypot(a - x, b - y) < 5.2); k += 1) {
        const ang = (k * Math.PI) / 4;
        x += Math.cos(ang) * 3.2;
        y += Math.sin(ang) * 3.2;
      }
      placed.push([x, y, p.n]);
    }
    for (const [x, y, n] of [...placed].reverse()) {
      doc.setFillColor(...C.text);
      doc.setDrawColor(...C.white);
      doc.setLineWidth(0.5);
      doc.circle(x, y, 2.8, 'FD');
      font('bold', 7.5, C.white);
      doc.text(String(n), x, y + 0.1, { align: 'center', baseline: 'middle' });
    }
    if (here) blaze(here[0] - 4, here[1] - 2.33, 8);
    // A scale bar, bottom left: one degree of latitude is 111.32 km.
    const mmPerKm = s / 111.32;
    const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200].find((k) => k * mmPerKm >= 14) || 200;
    const len = nice * mmPerKm;
    if (len <= W / 2) {
      const bx = M + 5;
      const by = top + h - 5;
      doc.setDrawColor(...C.text2);
      doc.setLineWidth(0.4);
      doc.line(bx, by, bx + len, by);
      doc.line(bx, by - 1.2, bx, by);
      doc.line(bx + len, by - 1.2, bx + len, by);
      font('normal', 7.5, C.text2);
      doc.text(clean(scaleLabel(nice)), bx + len + 2, by, { baseline: 'middle' });
    }
    // North, top right.
    const nx = PAGE_W - M - 6;
    font('bold', 8, C.text2);
    doc.text('N', nx, top + 4, { align: 'center', baseline: 'top' });
    doc.setDrawColor(...C.text2);
    doc.setLineWidth(0.4);
    doc.line(nx, top + 8.2, nx, top + 12.5);
    doc.line(nx - 1, top + 9.4, nx, top + 8.2);
    doc.line(nx + 1, top + 9.4, nx, top + 8.2);
    state.y = top + h + 4;
  };

  const save = (filename) => {
    footer();
    if (typeof doc.putTotalPages === 'function') doc.putTotalPages(TOTAL);
    doc.save(filename);
  };

  return {
    doc, C, state, font, lh, lines, para, h1, h2, h3, rule, gap, ensure, newPage,
    facts, tickRow, moneyRow, photo, photoPair, route, profile, link, save,
    wordmark, star, qr, startPage, cover, bars, monthStrip, pinMap,
    blaze, plate, scorePlate, relief,
  };
}
