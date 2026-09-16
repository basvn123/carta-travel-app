/**
 * destinationPdf.js, the downloadable destination guide.
 *
 * Renders from the SAME dossier contract the full-screen page reads
 * (public/dossier/{id}.json), so the PDF cannot drift from the app: one
 * contract, two renderers. Built with jsPDF and saved straight to the
 * reader's downloads, no print dialog.
 *
 * Text first, on purpose. The earlier print stylesheet spent a third of every
 * page on hotlinked photographs that the reader had already seen on screen,
 * and its licence gate meant some must-sees printed as grey boxes. A guide
 * people carry needs the facts in a shape they can act on: the verdict and
 * the time it takes, the sights ranked, the things to do with their evidence,
 * the outdoors inventory, the day trips with travel times, the month table,
 * bed prices, the cost receipt with a budget for the whole stay, parking
 * with navigation links, a before-you-go checklist, and the booking links.
 * Every link is live in the PDF.
 *
 * The three-month rule decides what is on the paper: climate normals yes,
 * this week's forecast no; the euro day cost with its provenance yes, live
 * fares no.
 *
 * Fonts are the app's own (Plus Jakarta Sans for prose, JetBrains Mono for
 * every measured figure), fetched once from /fonts and embedded. House style
 * travels too: no em dashes, no middots, sentence case.
 */

import { stripDashes } from './format.js';
import { activityLink } from './activityAffiliates.js';
import { destShareUrl } from './dossier.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// Ink and tint, from the app's :root. White paper: a printed alabaster ground
// is a wasted ink cartridge.
const C = {
  ink: '#0f172a', soft: '#414b5e', mute: '#7d8393', rule: '#e2ded1', ruleStrong: '#ccc7b8',
  accent: '#e05a47', rate: '#8f5a0c', rateBg: '#f6e6cb', dim: '#efece2', green: '#4a6a3a',
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;            // margin, mm
const W = PAGE_W - 2 * M; // content width
const FOOT = 12;         // footer band

const FONT_FILES = [
  ['PlusJakartaSans-Regular.ttf', 'Jakarta', 'normal'],
  ['PlusJakartaSans-SemiBold.ttf', 'Jakarta', 'bold'],
  ['JetBrainsMono-Regular.ttf', 'Mono', 'normal'],
  ['JetBrainsMono-Medium.ttf', 'Mono', 'bold'],
];
let fontCache = null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const out = [];
  for (const [file, family, style] of FONT_FILES) {
    try {
      const res = await fetch(`/fonts/${file}`);
      if (!res.ok) throw new Error(String(res.status));
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      }
      out.push({ file, family, style, b64: btoa(bin) });
    } catch { /* fall back to the built-in faces for this family */ }
  }
  fontCache = out;
  return out;
}

const clean = (s) => stripDashes(String(s ?? '')).replace(/\s*[·•]\s*/g, ', ').replace(/\s+/g, ' ').trim();
const slug = (s) => clean(s).toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');

export async function downloadDestinationPdf({
  dossier, destination, cost, t, lang, lifestyleLabel, stayDays,
}) {
  if (!dossier || !destination) return;
  const { jsPDF } = await import('jspdf');
  const fonts = await loadFonts();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const has = { Jakarta: false, Mono: false };
  for (const f of fonts) {
    doc.addFileToVFS(f.file, f.b64);
    doc.addFont(f.file, f.family, f.style);
    has[f.family] = true;
  }
  const SANS = has.Jakarta ? 'Jakarta' : 'helvetica';
  const MONO = has.Mono ? 'Mono' : 'courier';

  const d = dossier;
  const city = clean((destination.city || d.place?.name || '').replace(/\s*\([^)]*\)\s*$/, ''));
  const country = clean(destination.country || d.place?.country || '');
  const today = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, { dateStyle: 'long' }).format(new Date());
  const links = d.practical?.links || {};
  const getting = d.practical?.getting_there || {};
  const unesco = (d.place?.designations || []).some((g) => g.kind === 'unesco_whc');
  const eurFmt = (n) => (Number.isFinite(n) ? `EUR ${Math.round(n).toLocaleString('en-GB')}` : '');
  const kmFmt = (km) => (km < 0.95 ? `${Math.round((km * 1000) / 10) * 10} m` : `${Math.round(km)} km`);
  const monthList = (ms) => (ms || []).map((m) => MONTHS[m - 1]).join(', ');
  const T = (key, vars) => clean(t(key, vars));

  // ------------------------------------------------------------ primitives
  let y = M;
  let page = 1;
  const totalExp = '{total_pages}';

  const font = (family, style, size, color) => {
    doc.setFont(family, style);
    doc.setFontSize(size);
    doc.setTextColor(...hex(color));
  };
  const lh = (size) => size * 0.3528 * 1.38;
  const wrap = (text, size, width, family = SANS, style = 'normal') => {
    doc.setFont(family, style);
    doc.setFontSize(size);
    return doc.splitTextToSize(clean(text), width);
  };
  const footer = () => {
    doc.setDrawColor(...hex(C.rule));
    doc.setLineWidth(0.2);
    doc.line(M, PAGE_H - FOOT, PAGE_W - M, PAGE_H - FOOT);
    font(SANS, 'normal', 7.5, C.mute);
    doc.text(`Carta   carta-europetravel.com   ${city}`, M, PAGE_H - FOOT + 4);
    font(MONO, 'normal', 7.5, C.mute);
    doc.text(T('pdf.page', { n: page, of: totalExp }), PAGE_W - M, PAGE_H - FOOT + 4, { align: 'right' });
  };
  const newPage = () => {
    footer();
    doc.addPage();
    page += 1;
    y = M;
  };
  const ensure = (h) => { if (y + h > PAGE_H - FOOT - 3) newPage(); };
  const para = (str, opts = {}) => {
    const size = opts.size || 10;
    const lines = wrap(str, size, opts.width || W, opts.family || SANS, opts.style || 'normal');
    const h = lines.length * lh(size);
    ensure(h);
    doc.setTextColor(...hex(opts.color || C.ink));
    doc.text(lines, opts.x || M, y, { baseline: 'top' });
    y += h + (opts.after ?? 1.5);
  };
  const rule = (color = C.rule, weight = 0.2) => {
    doc.setDrawColor(...hex(color));
    doc.setLineWidth(weight);
    doc.line(M, y, PAGE_W - M, y);
  };
  const h2 = (title) => {
    // Keep a heading with at least a few lines of its section: a title as
    // the last thing on a page is a promise the page cannot keep.
    ensure(38);
    y += 4;
    font(SANS, 'bold', 13.5, C.ink);
    doc.text(clean(title), M, y, { baseline: 'top' });
    y += lh(13.5) + 1.2;
    rule(C.ruleStrong, 0.35);
    y += 3.2;
  };
  const h3 = (title) => {
    ensure(22);
    font(SANS, 'bold', 9.5, C.soft);
    doc.text(clean(title), M, y, { baseline: 'top' });
    y += lh(9.5) + 0.8;
  };
  const linkText = (label, url, x, yy, size = 7.5) => {
    if (!url) return 0;
    font(MONO, 'normal', size, C.rate);
    const lines = doc.splitTextToSize(label || url, W - (x - M));
    doc.text(lines, x, yy, { baseline: 'top' });
    const h = lines.length * lh(size);
    doc.link(x, yy, Math.min(W - (x - M), doc.getTextWidth(lines[0])), h, { url });
    return h;
  };
  const keyValue = (rows, { labelW = 42, size = 9.5 } = {}) => {
    for (const [k, v] of rows) {
      if (v == null || v === '') continue;
      const lines = wrap(v, size, W - labelW - 2);
      const h = Math.max(lines.length * lh(size), lh(size)) + 1.8;
      ensure(h);
      font(SANS, 'bold', size, C.soft);
      doc.text(clean(k), M, y + 0.9, { baseline: 'top' });
      font(SANS, 'normal', size, C.ink);
      doc.text(lines, M + labelW, y + 0.9, { baseline: 'top' });
      y += h;
      rule();
    }
    y += 1.5;
  };

  // ------------------------------------------------------------ cover
  font(MONO, 'bold', 8, C.accent);
  doc.setCharSpace(0.6);
  doc.text('CARTA  TRAVEL GUIDE', M, y, { baseline: 'top' });
  doc.setCharSpace(0);
  y += 7;
  font(SANS, 'bold', 30, C.ink);
  doc.text(city, M, y, { baseline: 'top' });
  y += lh(30) - 1;
  font(SANS, 'normal', 11, C.soft);
  doc.text(country + (unesco ? `   ${T('dest.unesco')}` : ''), M, y, { baseline: 'top' });
  y += lh(11) + 2;
  if (d.intro?.short || d.intro?.lead) {
    para(d.intro.short || d.intro.lead, { size: 10.5, color: C.ink, after: 3 });
  }

  // The fact strip.
  const facts = [];
  if (d.verdict?.score != null) facts.push([T('pdf.rating'), `${d.verdict.score.toFixed(1)} / 10`]);
  if (d.place?.visit_h != null) facts.push([T('pdf.factVisit'), `${Math.round(d.place.visit_h)} h`]);
  if (d.when?.best?.length) facts.push([T('pdf.factBest'), monthList(d.when.best)]);
  if (cost?.dayEur != null) facts.push([T('pdf.factDay'), eurFmt(cost.dayEur)]);
  const bedFrom = d.sleep?.tiers?.dorm_pp_night_eur ?? d.sleep?.per_person_night_eur;
  if (bedFrom != null) facts.push([T('dest.factSleep'), eurFmt(bedFrom)]);
  if (getting.airport) facts.push([T('pdf.airport'), getting.airport + (getting.transfer_min != null ? `, ${getting.transfer_min} min` : '')]);
  if (facts.length) {
    const colW = W / facts.length;
    ensure(16);
    doc.setFillColor(...hex(C.dim));
    doc.roundedRect(M, y, W, 15, 2, 2, 'F');
    facts.forEach(([k, v], i) => {
      const x = M + i * colW + 3;
      font(SANS, 'normal', 7, C.mute);
      doc.text(clean(k), x, y + 3, { baseline: 'top' });
      font(MONO, 'bold', 9.5, C.ink);
      doc.text(doc.splitTextToSize(String(v), colW - 5)[0], x, y + 7.6, { baseline: 'top' });
    });
    y += 19;
  }

  // ------------------------------------------------------------ at a glance
  const glance = [];
  if (d.verdict?.score != null) {
    let v = `${d.verdict.score.toFixed(1)} / 10`;
    if (d.verdict.label) v += `, ${d.verdict.label}`;
    if (d.verdict.country_rank === 1) v += `. ${T('card.topOf', { country })}`;
    else if (d.verdict.country_badge) v += `. ${T('card.rankIn', { n: d.verdict.country_rank, country })}`;
    glance.push([T('pdf.rating'), v]);
  }
  if (d.place?.visit_h != null) {
    const h = d.place.visit_h;
    glance.push([T('pdf.stayLength'), h < 6 ? T('explore.stayHalfDay') : h < 14 ? T('explore.stayOneDay') : T('explore.stayNights', { n: Math.max(2, Math.round(h / 9)) })]);
  }
  if (d.when?.best?.length) glance.push([T('pdf.factBest'), d.when.best.map((m) => MONTH_LONG[m - 1]).join(', ')]);
  if (d.when?.crowding?.label) glance.push([T('pdf.crowding'), `${d.when.crowding.label} (${d.when.crowding.year || ''})`]);
  if (getting.airport) {
    glance.push([T('pdf.airport'), getting.transfer_min != null
      ? T('dest.flyToWithTransfer', { iata: getting.airport, n: getting.transfer_min, mode: T(`mode.${getting.transfer_mode || 'train'}`) })
      : T('dest.flyTo', { iata: getting.airport })]);
  }
  if (getting.transit) glance.push([T('pdf.transit'), `${T(`dest.transit.${getting.transit}`)}${getting.why ? ` ${getting.why}` : ''}`]);
  if (getting.car_needed != null) glance.push([T('pdf.car'), getting.car_needed ? `${T('dest.carYes')}${getting.rental_eur_day != null ? ` ${T('dest.carRental', { eur: getting.rental_eur_day })}` : ''}` : T('dest.carNo')]);
  if (d.practical?.book_ahead?.length) glance.push([T('pdf.bookAhead'), d.practical.book_ahead.join(', ')]);
  if (d.practical?.rhythm) glance.push([T('pdf.rhythm'), d.practical.rhythm]);
  if (d.water?.rating) glance.push([T('pdf.water'), `${d.water.rating}${d.water.excellent_pct != null ? `, ${T('dest.waterShare', { pct: d.water.excellent_pct, n: d.water.n_sites })}` : ''}`]);
  if (glance.length) {
    h2(T('pdf.atGlance'));
    keyValue(glance);
  }

  // ------------------------------------------------------------ must-sees
  const hl = [...(d.highlights || [])].sort((a, b) => (b.rank_score || 0) - (a.rank_score || 0));
  if (hl.length) {
    h2(T('pdf.mustSee'));
    const colW = (W - 6) / 2;
    const measure = (h) => {
      const nameL = wrap(h.name, 10, colW - 8, SANS, 'bold');
      const factL = h.fact ? wrap(h.fact, 8.5, colW - 8) : [];
      return nameL.length * lh(10) + lh(7.5) + factL.length * lh(8.5) + 2.5;
    };
    const draw = (h, i, x) => {
      font(MONO, 'bold', 8, C.accent);
      doc.text(String(i + 1), x, y + 0.6, { baseline: 'top' });
      const nameL = wrap(h.name, 10, colW - 8, SANS, 'bold');
      font(SANS, 'bold', 10, C.ink);
      doc.text(nameL, x + 7, y, { baseline: 'top' });
      let yy = y + nameL.length * lh(10);
      font(MONO, 'normal', 7.5, C.mute);
      doc.text([h.kind, h.dist_km != null ? kmFmt(h.dist_km) : ''].filter(Boolean).join('   '), x + 7, yy, { baseline: 'top' });
      yy += lh(7.5);
      if (h.fact) {
        const factL = wrap(h.fact, 8.5, colW - 8);
        font(SANS, 'normal', 8.5, C.soft);
        doc.text(factL, x + 7, yy, { baseline: 'top' });
        yy += factL.length * lh(8.5);
      }
      if (h.wikipedia) doc.link(x, y, colW, yy - y, { url: h.wikipedia });
    };
    for (let i = 0; i < hl.length; i += 2) {
      const a = hl[i];
      const b = hl[i + 1];
      const rowH = Math.max(measure(a), b ? measure(b) : 0);
      ensure(rowH);
      draw(a, i, M);
      if (b) draw(b, i + 1, M + colW + 6);
      y += rowH;
    }
    y += 1;
  }

  // ------------------------------------------------------------ things to do
  const dos = d.do || [];
  if (dos.length) {
    h2(T('dest.doTitle'));
    dos.forEach((item, i) => {
      const nameL = wrap(item.name, 10, W - 9, SANS, 'bold');
      const detL = item.detail ? wrap(item.detail, 8.8, W - 9) : [];
      const ev = item.evidence;
      const evText = ev?.n_sources != null
        ? (ev.method === 'open'
          ? (ev.curated ? T('dest.evidenceCurated') : T('dest.evidenceOpen', { n: ev.n_sources }))
          : T('dest.evidence', { n: ev.n_sources, of: ev.of }))
        : '';
      const meta = [T(`dest.doType.${item.type}`) === `dest.doType.${item.type}` ? item.type : T(`dest.doType.${item.type}`),
        item.season?.length ? monthList(item.season) : '', evText].filter(Boolean).join('   ');
      const url = item.link ? activityLink(item.link, 'pdf') : '';
      const h = nameL.length * lh(10) + detL.length * lh(8.8) + lh(7.5) + (url ? lh(7) : 0) + 3.2;
      ensure(h);
      doc.setFillColor(...hex(C.accent));
      doc.circle(M + 2.2, y + 2.2, 2.2, 'F');
      font(MONO, 'bold', 7, '#ffffff');
      doc.text(String(i + 1), M + 2.2, y + 0.9, { baseline: 'top', align: 'center' });
      font(SANS, 'bold', 10, C.ink);
      doc.text(nameL, M + 8, y, { baseline: 'top' });
      let yy = y + nameL.length * lh(10);
      if (detL.length) {
        font(SANS, 'normal', 8.8, C.soft);
        doc.text(detL, M + 8, yy, { baseline: 'top' });
        yy += detL.length * lh(8.8);
      }
      font(MONO, 'normal', 7.5, ev?.method === 'open' ? C.mute : C.rate);
      doc.text(meta, M + 8, yy, { baseline: 'top' });
      yy += lh(7.5);
      if (url) yy += linkText(url.replace(/^https?:\/\//, '').slice(0, 96), url, M + 8, yy, 7);
      y = yy + 2.2;
      rule();
      y += 1.4;
    });
    if (links.getyourguide || links.viator) {
      ensure(10);
      font(SANS, 'normal', 8, C.mute);
      doc.text(T('pdf.bookNote'), M, y, { baseline: 'top' });
      y += lh(8);
      if (links.getyourguide) y += linkText(`GetYourGuide  ${activityLink(links.getyourguide, 'pdf')}`, activityLink(links.getyourguide, 'pdf'), M, y);
      if (links.viator) y += linkText(`Viator  ${activityLink(links.viator, 'pdf')}`, activityLink(links.viator, 'pdf'), M, y);
      y += 2;
    }
  }

  // ------------------------------------------------------------ around
  const around = d.around;
  const LAYERS = ['trails', 'cycling', 'mountains', 'lakes', 'beaches'];
  if (around && LAYERS.some((l) => around[l]?.length)) {
    h2(T('pdf.around', { km: around.radius_km || 20 }));
    for (const layer of LAYERS) {
      const rows = around[layer] || [];
      if (!rows.length) continue;
      h3(`${T(`dest.layerKind.${layer}`)}   ${around.counts?.[layer] || rows.length}`);
      for (const r of rows.slice(0, 6)) {
        const bits = [];
        if (r.km_len != null) bits.push(`${Math.round(r.km_len)} km`);
        if (r.ascent_m != null) bits.push(`${Math.round(r.ascent_m)} m up`);
        if (r.elev_m != null) bits.push(`${Math.round(r.elev_m)} m`);
        if (r.difficulty) bits.push(T(`dest.diff.${r.difficulty}`));
        if (r.water) bits.push(r.water);
        ensure(lh(9) + 1.5);
        font(SANS, 'normal', 9, C.ink);
        doc.text(doc.splitTextToSize(clean(r.name), W - 62)[0], M, y, { baseline: 'top' });
        font(MONO, 'normal', 7.5, C.mute);
        doc.text(bits.join('  '), M + W - 60, y + 0.4, { baseline: 'top' });
        font(MONO, 'bold', 8, C.soft);
        doc.text(`${kmFmt(r.km)} ${r.bearing || ''}${r.score != null ? `   ${r.score.toFixed(1)}` : ''}`, PAGE_W - M, y + 0.3, { baseline: 'top', align: 'right' });
        y += lh(9) + 1.2;
      }
      y += 1.5;
    }
  }

  // ------------------------------------------------------------ routes
  // ROUTES.md R6: the same rows the page shows, from the same key, measured
  // to the nearest point on the line and named for the path.
  const routes = d.routes || {};
  if ((routes.hiking?.length || 0) + (routes.cycling?.length || 0) > 0) {
    h2(T('dest.routesTitle'));
    for (const [key, label] of [['hiking', 'dest.routesHiking'],
      ['cycling', 'dest.routesCycling']]) {
      const rows = routes[key] || [];
      if (!rows.length) continue;
      h3(T(label));
      for (const r of rows) {
        const bits = [];
        if (r.km_len != null) bits.push(`${Math.round(r.km_len)} km`);
        if (r.ascent_m != null) bits.push(`${Math.round(r.ascent_m)} m up`);
        if (r.car_free) bits.push(T('dest.routesCarFree'));
        ensure(lh(9) + 1.5);
        font(SANS, 'normal', 9, C.ink);
        doc.text(doc.splitTextToSize(clean(r.name), W - 62)[0], M, y, { baseline: 'top' });
        font(MONO, 'normal', 7.5, C.mute);
        doc.text(bits.join('  '), M + W - 60, y + 0.4, { baseline: 'top' });
        font(MONO, 'bold', 8, C.soft);
        doc.text(`${kmFmt(r.km)} ${T(`dir.${r.dir}`)}`, PAGE_W - M, y + 0.3,
          { baseline: 'top', align: 'right' });
        y += lh(9) + 1.2;
        if (r.stage?.name) {
          ensure(lh(7.5) + 1);
          font(SANS, 'italic', 7.5, C.mute);
          doc.text(doc.splitTextToSize(
            clean(T('dest.routesStretch', { name: r.stage.name })), W - 62)[0],
          M + 3, y, { baseline: 'top' });
          y += lh(7.5) + 0.8;
        }
      }
      y += 1.5;
    }
    font(SANS, 'normal', 7.5, C.mute);
    const note = doc.splitTextToSize(clean(T('dest.routesCoverage')), W);
    ensure(note.length * lh(7.5));
    doc.text(note, M, y, { baseline: 'top' });
    y += note.length * lh(7.5) + 2;
  }

  // ------------------------------------------------------------ trips
  const trips = d.trips || [];
  if (trips.length) {
    h2(T('dest.tripsTitle'));
    for (const tr of trips) {
      const sub = tr.kind === 'composed_trip'
        ? T('dest.tripDays', { n: tr.days || 0 })
        : [tr.travel?.minutes != null ? T('dest.minutesBy', { n: tr.travel.minutes, mode: T(`mode.${tr.travel.mode}`) }) : '',
          tr.dist_km != null ? `${tr.dist_km} km` : ''].filter(Boolean).join('   ');
      const whyL = tr.blurb ? wrap(tr.blurb, 8.8, W - 30) : [];
      const h = lh(10) + lh(7.8) + whyL.length * lh(8.8) + 3;
      ensure(h);
      font(SANS, 'bold', 10, C.ink);
      doc.text(clean(tr.name), M, y, { baseline: 'top' });
      if (tr.rating?.score != null) {
        font(MONO, 'bold', 8.5, C.rate);
        doc.text(`${tr.rating.score.toFixed(1)}${tr.rating.label ? `  ${clean(tr.rating.label)}` : ''}`, PAGE_W - M, y + 0.5, { baseline: 'top', align: 'right' });
      }
      let yy = y + lh(10);
      font(MONO, 'normal', 7.8, C.mute);
      doc.text(sub, M, yy, { baseline: 'top' });
      yy += lh(7.8);
      if (whyL.length) {
        font(SANS, 'normal', 8.8, C.soft);
        doc.text(whyL, M, yy, { baseline: 'top' });
        yy += whyL.length * lh(8.8);
      }
      y = yy + 1.8;
      rule();
      y += 1.4;
    }
  }

  // ------------------------------------------------------------ when to go
  const normals = d.when?.normals;
  if (normals?.length === 12) {
    h2(T('explore.whenTitle'));
    const best = new Set(d.when.best || []);
    const colW = W / 12;
    ensure(26);
    normals.forEach((m, i) => {
      const x = M + i * colW;
      if (best.has(i + 1)) {
        doc.setFillColor(...hex(C.rateBg));
        doc.roundedRect(x + 0.4, y, colW - 0.8, 21, 1.2, 1.2, 'F');
      }
      font(MONO, 'normal', 7, C.mute);
      doc.text(MONTHS[i], x + colW / 2, y + 2, { baseline: 'top', align: 'center' });
      font(MONO, 'bold', 9, C.ink);
      doc.text(`${Math.round(m[0])}°`, x + colW / 2, y + 6.5, { baseline: 'top', align: 'center' });
      font(MONO, 'normal', 7.5, C.soft);
      doc.text(`${Math.round(m[1])}°`, x + colW / 2, y + 11.5, { baseline: 'top', align: 'center' });
      if (m[2] != null) {
        font(MONO, 'normal', 6.5, C.mute);
        doc.text(`${Math.round(m[2])}`, x + colW / 2, y + 16, { baseline: 'top', align: 'center' });
      }
    });
    y += 23;
    para(`${T('pdf.monthsNote')} ${T('pdf.rainNote')}${d.when.best?.length ? ` ${T('pdf.bestMonths', { months: monthList(d.when.best) })}` : ''}`, { size: 8, color: C.mute, after: 2 });
    if (d.when.crowding?.label) para(`${T('pdf.crowding')}: ${d.when.crowding.label} (Eurostat ${d.when.crowding.year || ''}).`, { size: 9, color: C.soft, after: 2 });
  }

  // ------------------------------------------------------------ sleep
  const sleep = d.sleep;
  if (sleep && (sleep.tiers || sleep.neighbourhoods?.length || sleep.seasonality)) {
    h2(T('dest.sleepTitle'));
    const tiers = sleep.tiers || {};
    const tierRows = [
      ['dest.tierDorm', tiers.dorm_pp_night_eur], ['dest.tierPrivate', tiers.private_room_night_eur],
      ['dest.tierHotel', tiers.hotel_night_eur], ['pdf.hotel4', tiers.hotel4_night_eur],
    ].filter(([, v]) => v != null);
    if (tierRows.length) {
      keyValue(tierRows.map(([k, v]) => [T(k, { eur: Math.round(v) }).replace(/\s*(EUR|€)\s*\d[\d.,]*/i, '').replace(/^\w/, (c) => c.toUpperCase()), eurFmt(v)]), { labelW: 60 });
    }
    if (sleep.neighbourhoods?.length) {
      h3(T('pdf.neighbourhoods'));
      const rows = sleep.neighbourhoods;
      const colW = (W - 6) / 2;
      for (let i = 0; i < rows.length; i += 2) {
        ensure(lh(9) + 1.5);
        [rows[i], rows[i + 1]].forEach((n, j) => {
          if (!n) return;
          const x = M + j * (colW + 6);
          font(SANS, 'normal', 9, C.ink);
          doc.text(doc.splitTextToSize(clean(n.name), colW - 22)[0], x, y, { baseline: 'top' });
          font(MONO, 'bold', 8.5, C.ink);
          doc.text(n.night_eur != null ? eurFmt(n.night_eur) : '', x + colW, y + 0.3, { baseline: 'top', align: 'right' });
        });
        y += lh(9) + 1.2;
      }
      para(T('dest.sleepNote'), { size: 8, color: C.mute });
    }
    if (sleep.seasonality?.length === 12) {
      const sMin = Math.min(...sleep.seasonality);
      const cheap = sleep.seasonality.indexOf(sMin);
      if (cheap >= 0) para(T('dest.cheapestMonth', { month: MONTH_LONG[cheap] }) + '.', { size: 9, color: C.soft });
    }
  }

  // ------------------------------------------------------------ costs
  if (cost?.dayEur != null) {
    h2(T('cost.title'));
    const rows = [[T('cost.bed'), eurFmt(cost.stayEur)], [T('cost.food'), eurFmt(cost.foodEur)]];
    for (const [k, v] of rows) {
      ensure(7);
      font(SANS, 'normal', 9.5, C.ink);
      doc.text(k, M, y, { baseline: 'top' });
      font(MONO, 'normal', 9.5, C.ink);
      doc.text(v, M + 100, y, { baseline: 'top', align: 'right' });
      y += lh(9.5) + 1;
      doc.setDrawColor(...hex(C.rule)); doc.setLineWidth(0.2); doc.line(M, y, M + 100, y);
      y += 1;
    }
    ensure(10);
    doc.setDrawColor(...hex(C.ink)); doc.setLineWidth(0.5); doc.line(M, y, M + 100, y);
    y += 2;
    font(SANS, 'bold', 10.5, C.ink);
    doc.text(T('cost.dayTotal'), M, y, { baseline: 'top' });
    font(MONO, 'bold', 12, C.ink);
    doc.text(eurFmt(cost.dayEur), M + 100, y - 0.5, { baseline: 'top', align: 'right' });
    y += lh(12) + 1;
    if (stayDays >= 2) {
      font(SANS, 'normal', 9.5, C.rate);
      doc.text(T('pdf.budget', { n: stayDays, eur: Math.round(cost.dayEur * stayDays).toLocaleString('en-GB') }), M, y, { baseline: 'top' });
      y += lh(9.5) + 1;
    }
    para(`${clean(lifestyleLabel || '')} ${T('pdf.costNote')}`, { size: 8, color: C.mute, after: 2 });
  }

  // ------------------------------------------------------------ festivals
  const fests = d.festivals || [];
  if (fests.length) {
    h2(T('dest.festivalsTitle'));
    for (const f of fests) {
      const whatL = f.what ? wrap(f.what, 8.8, W - 32) : [];
      const h = Math.max(lh(9.5) + whatL.length * lh(8.8), lh(9.5)) + 2.5;
      ensure(h);
      font(MONO, 'bold', 8, f.months?.length ? C.rate : C.mute);
      doc.text(f.months?.length ? monthList(f.months) : T('pdf.dateVaries'), M, y + 0.5, { baseline: 'top' });
      font(SANS, 'bold', 9.5, C.ink);
      doc.text(clean(f.name), M + 30, y, { baseline: 'top' });
      let yy = y + lh(9.5);
      if (whatL.length) {
        font(SANS, 'normal', 8.8, C.soft);
        doc.text(whatL, M + 30, yy, { baseline: 'top' });
        yy += whatL.length * lh(8.8);
      }
      if (f.url) doc.link(M + 30, y, W - 30, yy - y, { url: f.url });
      y = yy + 1.6;
      rule();
      y += 1.2;
    }
  }

  // ------------------------------------------------------------ tips
  const tips = d.tips || [];
  const tipArgs = (tip) => {
    const args = { ...(tip.args || {}) };
    if (args.from_m) args.from = MONTHS[args.from_m - 1];
    if (args.to_m) args.to = MONTHS[args.to_m - 1];
    if (args.month) args.month = MONTHS[args.month - 1];
    return args;
  };
  if (tips.length) {
    h2(T('dest.tipsTitle'));
    const lines = tips.map((tip) => T(`tip.${tip.code}`, tipArgs(tip)));
    const wrapped = lines.map((l) => wrap(l, 9.5, W - 14));
    const h = wrapped.reduce((a, ls) => a + ls.length * lh(9.5) + 1.4, 0) + 6;
    ensure(h);
    doc.setFillColor(...hex(C.rateBg));
    doc.roundedRect(M, y, W, h, 2, 2, 'F');
    let yy = y + 3.5;
    wrapped.forEach((ls) => {
      doc.setFillColor(...hex(C.rate));
      doc.circle(M + 5, yy + 1.9, 0.9, 'F');
      font(SANS, 'normal', 9.5, C.ink);
      doc.text(ls, M + 9, yy, { baseline: 'top' });
      yy += ls.length * lh(9.5) + 1.4;
    });
    y += h + 3;
  }

  // ------------------------------------------------------------ parking
  const pk = d.parking;
  if (pk && (pk.spots?.length || pk.park_ride || pk.web)) {
    h2(T('explore.parkTitle'));
    if (pk.web) {
      const w = pk.web;
      para(T('dest.parkChecked', { date: w.checked }), { size: 8.5, color: C.green });
      if (w.restricted) para(`${T('dest.parkRestricted')}${w.restricted_note ? ` ${w.restricted_note}` : ''}`, { size: 9, color: C.accent });
      if (w.advice) para(w.advice, { size: 9, color: C.soft });
      if (w.car_parks?.length) para(`${T('dest.parkCityNamed')}: ${w.car_parks.map((c) => c.name + (c.note ? ` (${c.note})` : '')).join(', ')}`, { size: 9 });
      if (w.park_ride_names?.length) para(`${T('explore.park.park_ride')}: ${w.park_ride_names.join(', ')}`, { size: 9 });
      if (w.official_url) { ensure(6); y += linkText(w.official_url, w.official_url, M, y) + 2; }
    }
    const spots = [...(pk.spots || []).map((s) => ({ ...s, kind: 'spot' })), ...(pk.park_ride ? [{ ...pk.park_ride, kind: 'pr' }] : [])];
    for (const s of spots) {
      ensure(lh(9.5) + lh(7.5) + lh(7) + 3);
      font(SANS, 'bold', 9.5, C.ink);
      doc.text(clean(s.name || (s.kind === 'pr' ? T('explore.park.park_ride') : T('explore.parkUnnamed'))), M, y, { baseline: 'top' });
      y += lh(9.5);
      font(MONO, 'normal', 7.5, C.mute);
      const bits = [s.kind === 'pr' ? T('explore.park.park_ride') : T(s.fee === 'no' ? 'explore.parkFree' : s.fee === 'yes' ? 'explore.parkPaid' : 'explore.parkFeeUnknown'),
        s.capacity != null ? T('explore.parkSpaces', { n: s.capacity }) : '', s.walk_min != null ? T('dest.walkMin', { n: s.walk_min }) : ''].filter(Boolean);
      doc.text(bits.join('   '), M, y, { baseline: 'top' });
      y += lh(7.5);
      y += linkText(s.nav?.gmaps, s.nav?.gmaps, M, y, 7);
      y += 1.6;
      rule();
      y += 1.2;
    }
  }

  // ------------------------------------------------------------ before you go
  const check = [];
  for (const n of d.practical?.book_ahead || []) check.push(T('pdf.checkBook', { name: n }));
  for (const tip of tips) {
    if (['vignetteNeeded', 'carNeeded', 'transferPain', 'crowdWarning'].includes(tip.code)) check.push(T(`tip.${tip.code}`, tipArgs(tip)));
  }
  if (d.when?.best?.length) check.push(T('pdf.checkMonths', { months: monthList(d.when.best) }));
  check.push(T('pdf.checkShare', { url: destShareUrl(destination.id) || 'carta-europetravel.com' }));
  if (check.length) {
    h2(T('pdf.checklist'));
    for (const line of check) {
      const ls = wrap(line, 9.5, W - 10);
      ensure(ls.length * lh(9.5) + 1.5);
      doc.setDrawColor(...hex(C.ruleStrong)); doc.setLineWidth(0.3);
      doc.rect(M, y + 0.6, 3.2, 3.2, 'S');
      font(SANS, 'normal', 9.5, C.ink);
      doc.text(ls, M + 6.5, y, { baseline: 'top' });
      y += ls.length * lh(9.5) + 1.8;
    }
  }

  // ------------------------------------------------------------ links
  const linkRows = [
    [T('dest.linkGflights'), links.flights_google], [T('dest.linkSkyscanner'), links.skyscanner],
    [T('dest.linkBooking'), links.booking], [T('dest.linkAirbnb'), links.airbnb],
    ['GetYourGuide', links.getyourguide && activityLink(links.getyourguide, 'pdf')],
    ['Viator', links.viator && activityLink(links.viator, 'pdf')],
  ].filter(([, u]) => u);
  if (linkRows.length) {
    h2(T('pdf.practical'));
    for (const [label, url] of linkRows) {
      ensure(lh(9) + 1.5);
      font(SANS, 'bold', 9, C.ink);
      doc.text(label, M, y, { baseline: 'top' });
      linkText(url, url, M + 34, y + 0.4, 7.5);
      y += lh(9) + 1.4;
    }
  }

  // ------------------------------------------------------------ credits
  h2(T('pdf.credits'));
  for (const c of d.credits || []) {
    ensure(lh(8) + 1);
    font(SANS, 'normal', 8, C.mute);
    doc.text(`${clean(c.name)}, ${clean(c.licence)}`, M, y, { baseline: 'top' });
    linkText(c.url, c.url, M + 90, y + 0.3, 6.5);
    y += lh(8) + 0.8;
  }
  if (d.intro?.grounding?.[0]?.url) {
    ensure(lh(8) + 1);
    font(SANS, 'normal', 8, C.mute);
    doc.text(T('pdf.introCredit'), M, y, { baseline: 'top' });
    linkText(d.intro.grounding[0].url, d.intro.grounding[0].url, M + 90, y + 0.3, 6.5);
    y += lh(8) + 0.8;
  }
  y += 2;
  para(T('pdf.generatedNote', { date: today }), { size: 8, color: C.mute });

  footer();
  if (typeof doc.putTotalPages === 'function') doc.putTotalPages(totalExp);
  doc.save(`${slug(city) || 'destination'}-carta-guide.pdf`);
}
