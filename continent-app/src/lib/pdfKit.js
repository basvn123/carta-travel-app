/**
 * pdfKit.js (T430, T431): the parts every Carta PDF is made of, so the item
 * pages and the trip page print as one family, in the app's own look.
 *
 *   type      Figtree, the app's one face, at 400, 600 and 700, as static
 *             TTFs with tabular figures frozen in (public/fonts, OFL), so a
 *             column of prices lines up on paper as it does on screen
 *   colour    the role tokens of src/styles/01-tokens.css, read live, with
 *             the token mirror as the fallback; ink is never black
 *   photos    drawn through a canvas as JPEG, with the credit under each,
 *             never on it; a photograph the browser may not read (CORS) is a
 *             sunken box with its caption, never a broken image
 *   lines     a route and a climb profile as vectors, flat (the 3D rule
 *             keeps charts flat)
 *   copy      no em dash, en dash or middot (stripDashes), sentence case
 *
 * jsPDF arrives with the first PDF; nothing here loads before that.
 */
import { stripDashes } from './format.js';
import { TOKEN_COLOURS } from '../map/tokenColors.js';

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

const FONT_FILES = [
  ['Figtree-Regular.ttf', 'normal'],
  ['Figtree-SemiBold.ttf', 'semibold'],
  ['Figtree-Bold.ttf', 'bold'],
];
let fontCache = null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const out = [];
  for (const [file, style] of FONT_FILES) {
    try {
      const res = await fetch(`/fonts/${file}`);
      if (!res.ok) throw new Error(String(res.status));
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      out.push({ file, style, b64: btoa(bin) });
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
export const fileSlug = (s) => clean(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/**
 * A new A4 document with the kit's helpers bound to it.
 * `footerLabel` names the page in the footer ("Carta, Mount Korab").
 */
export async function createPdf({ footerLabel = 'Carta', pageLabel = (n, of) => `${n} / ${of}` } = {}) {
  const { jsPDF } = await import('jspdf');
  const fonts = await loadFonts();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const has = new Set();
  for (const f of fonts) {
    doc.addFileToVFS(f.file, f.b64);
    doc.addFont(f.file, 'Figtree', f.style);
    has.add(f.style);
  }
  const face = (style) => (has.has(style) ? ['Figtree', style] : ['helvetica', style === 'normal' ? 'normal' : 'bold']);
  const C = {
    text: rgb('--text'), text2: rgb('--text-2'), text3: rgb('--text-3'), border: rgb('--border'),
    soft: rgb('--border-soft'), sunken: rgb('--surface-sunken'), action: rgb('--action'),
    select: rgb('--select-bg'), warn: rgb('--amber-ink'), ok: rgb('--status-success'),
  };
  const state = { y: M, page: 1 };
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
    doc.text(clean(footerLabel), M, PAGE_H - FOOT + 4.5);
    doc.text(pageLabel(state.page, TOTAL), PAGE_W - M, PAGE_H - FOOT + 4.5, { align: 'right' });
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

  /** A receipt line: words left, figure right, hairline above. */
  const moneyRow = (label, value, { bold = false } = {}) => {
    ensure(8);
    rule();
    state.y += 2;
    font(bold ? 'semibold' : 'normal', 10, bold ? C.text : C.text2);
    doc.text(clean(label), M, state.y, { baseline: 'top' });
    font(bold ? 'bold' : 'semibold', 10.5);
    doc.text(clean(value), PAGE_W - M, state.y, { baseline: 'top', align: 'right' });
    state.y += 6;
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
      font('semibold', 8.5);
      doc.text(clean(ph.caption || ''), x, state.y, { baseline: 'top' });
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

  const save = (filename) => {
    footer();
    if (typeof doc.putTotalPages === 'function') doc.putTotalPages(TOTAL);
    doc.save(filename);
  };

  return {
    doc, C, state, font, lh, lines, para, h1, h2, h3, rule, gap, ensure, newPage,
    facts, tickRow, moneyRow, photo, photoPair, route, profile, link, save,
  };
}
