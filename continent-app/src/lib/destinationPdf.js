/**
 * destinationPdf.js, the place guide: the Download PDF of a destination.
 *
 * Renders from the SAME dossier contract the full-screen page reads
 * (public/dossier/{id}.json), so the PDF cannot drift from the app: one
 * contract, two renderers. Since T914 it is drawn with the kit every other
 * Carta PDF uses (pdfKit.js): Figtree with tabular figures, the role colours,
 * photographs with the credit under them, vector drawings, one footer. The
 * trip booklet (tripPdf.js) opens with the same cover.
 *
 * Page by page, in the page's order:
 *
 *   cover       the first print-clean photograph with its credit, the
 *               wordmark, the name, the country, the Score with its words and
 *               rank, UNESCO, the price a person a day, up to four facts and
 *               a QR code back to the live page
 *   at a glance the short intro, what to eat, the day cost as thin bars, the
 *               best months as a strip, good to know
 *   what to see a plain map with numbered pins (no tiles), the numbered list,
 *               a day on foot, the things to do; flows on when long
 *   around      day trips with time and mode, the counts of walks, rides and
 *               beaches, the routes with length, climb and GPX links
 *   when, stay  the month table with the best months shaded, festivals, beds
 *               and neighbourhood prices
 *   practical   quick facts, getting there and around, rhythm, book ahead,
 *               parking, the links, places like this one, then every
 *               photograph's author and licence and the sources
 *
 * Text first: one photograph, on the cover, and the rest is words, figures
 * and drawings that print in black and white. Every link is live. A section
 * without data is left out, never printed as "not available".
 *
 * The three-month rule decides what is on the paper: climate normals yes,
 * this week's forecast no; the day cost at the traveller's Lifestyle yes,
 * live fares no. The footer carries the date the prices were estimated.
 */

import { createPdf, clean, fileSlug, monthSpan as spanOf, M, W } from './pdfKit.js';
import { formatMoney } from './money.js';
import { activityLink } from './activityAffiliates.js';
import { routePageUrlHere } from './routeLinks.js';
import { destShareUrl } from './dossier.js';
import { trailClimbUp, gradeLabelKey } from './trailStory.js';
import { pdfOutdoorRows } from './destOverview.js';
import { classRankLine, natureRating, poiLabelWord, ratingWhy, ratingWords } from './rating.js';

const TIPPING = ['round', '5-10', '10-15', 'included', 'none'];
const TAP = ['safe', 'bottled', 'varies'];
const COUNT_LAYERS = ['trails', 'cycling', 'beaches', 'lakes', 'mountains'];

export async function downloadDestinationPdf({
  dossier, destination, cost, t, lang, lifestyleLabel, stayDays,
}) {
  if (!dossier || !destination) return;
  const d = dossier;
  const T = (key, vars) => clean(t(key, vars));
  const loc = lang === 'en' ? 'en-GB' : lang;

  // ── Words and figures in the reader's language ──
  const nf = (n, digits = 0) => {
    try {
      return new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
    } catch { return String(Math.round(n)); }
  };
  const eur = (v) => formatMoney(v, { locale: lang, missing: '' });
  const kmText = (km) => T('pdf.km', { km: nf(km, km < 10 && km % 1 ? 1 : 0) });
  const kmFmt = (km) => (km < 0.95 ? T('pdf.metres', { m: nf(Math.round((km * 1000) / 10) * 10) }) : kmText(km));
  const monthFmt = (style) => {
    try { return new Intl.DateTimeFormat(loc, { month: style }); } catch { return new Intl.DateTimeFormat('en-GB', { month: style }); }
  };
  const longM = monthFmt('long');
  const shortM = monthFmt('short');
  const narrowM = monthFmt('narrow');
  const monthName = (m, f = longM) => f.format(new Date(2026, m - 1, 1));
  const monthSpan = (ms) => spanOf(ms, loc);
  const dateLong = new Intl.DateTimeFormat(loc, { dateStyle: 'long' }).format(new Date());

  // ── The place ──
  const verdict = (d.verdict || destination.rating)
    ? { ...(d.verdict || {}), ...(destination.rating || {}) }
    : null;
  const words = ratingWords(verdict, t);
  const classRank = classRankLine(verdict, t);
  const why = await ratingWhy(destination.id, verdict, lang);
  const city = clean((destination.city || d.place?.name || '').replace(/\s*\([^)]*\)\s*$/, ''));
  const country = clean(destination.country || d.place?.country || '');
  const unesco = (d.place?.designations || []).some((g) => g.kind === 'unesco_whc');
  const links = d.practical?.links || {};
  const getting = d.practical?.getting_there || {};
  const share = destShareUrl(destination.id);
  const best = d.when?.best || [];

  const kit = await createPdf({
    footerLabel: `Carta, ${city}. ${T('pdf.pricesOn', { date: dateLong })}`,
    pageLabel: (n, of) => t('pdf.page', { n, of }),
  });
  const { C, doc } = kit;

  /** A row of a list: words left (with an optional number), the figure or
   *  meta right, a second line under it, an optional live link. */
  const row = ({ n = null, name, right = '', sub = '', url = '', link = '' }) => {
    const x = n != null ? M + 7.5 : M;
    const nameW = right ? W - (x - M) - 52 : W - (x - M);
    const nameL = kit.lines(name, 10.5, nameW, 'semibold');
    const rightL = right ? kit.lines(right, 9, 50) : [];
    const subL = sub ? kit.lines(sub, 9, W - (x - M), 'normal') : [];
    const head = Math.max(nameL.length * kit.lh(10.5), rightL.length * kit.lh(9) + 0.5);
    const h = head + subL.length * kit.lh(9) + (link ? kit.lh(8.5) : 0) + 3.5;
    kit.ensure(h);
    const y0 = kit.state.y;
    if (n != null) {
      doc.setFillColor(...C.text);
      doc.circle(M + 2.6, y0 + 2.1, 2.6, 'F');
      kit.font('bold', 7.5, C.white);
      doc.text(String(n), M + 2.6, y0 + 2.2, { align: 'center', baseline: 'middle' });
    }
    kit.font('semibold', 10.5);
    doc.text(nameL, x, y0, { baseline: 'top', lineHeightFactor: 1.4 });
    if (url) doc.link(x, y0, Math.min(nameW, doc.getTextWidth(nameL[0])), kit.lh(10.5), { url });
    if (right) {
      kit.font('normal', 9, C.text2);
      doc.text(rightL, M + W, y0 + 0.5, { baseline: 'top', align: 'right', lineHeightFactor: 1.4 });
    }
    let y = y0 + head;
    if (subL.length) {
      kit.font('normal', 9, C.text2);
      doc.text(subL, x, y, { baseline: 'top', lineHeightFactor: 1.4 });
      y += subL.length * kit.lh(9);
    }
    if (link) {
      kit.font('normal', 8.5, C.action);
      const label = doc.splitTextToSize(clean(link.replace(/^https?:\/\/(www\.)?/, '')), W - (x - M))[0];
      doc.textWithLink(label, x, y, { url: link, baseline: 'top' });
      y += kit.lh(8.5);
    }
    kit.state.y = y + 1.5;
    kit.rule();
    kit.state.y += 2;
  };

  // ════════════════════════════ 1. Cover ════════════════════════════
  const cover = (d.gallery || []).find((g) => g?.url && g.ok_print === true);
  const rankBits = [];
  if (words?.word) rankBits.push(words.word);
  if (verdict?.country_rank === 1) rankBits.push(T('card.topOf', { country }));
  else if (verdict?.country_badge && verdict?.country_rank) rankBits.push(T('card.rankIn', { n: verdict.country_rank, country }));
  if (classRank) rankBits.push(clean(classRank));
  const coverFacts = [];
  if (best.length) coverFacts.push({ label: T('pdf.factBest'), value: monthSpan(best) });
  if (d.place?.visit_h != null) coverFacts.push({ label: T('pdf.factVisit'), value: T('pdf.hoursAbout', { n: nf(Math.max(1, Math.round(d.place.visit_h))) }) });
  if (getting.transit) coverFacts.push({ label: T('pdf.costAround'), value: T(`dest.transit.${getting.transit}`).replace(/\.$/, '') });
  if (getting.airport) coverFacts.push({ label: T('pdf.airport'), value: getting.transfer_min != null ? `${getting.airport}, ${T('pdf.minutes', { n: nf(getting.transfer_min) })}` : getting.airport });
  await kit.cover({
    photo: cover ? { url: cover.url, caption: cover.caption || city, author: cover.author, licence: cover.licence } : null,
    title: city,
    lines: [
      [country, unesco ? T('dest.unesco') : ''].filter(Boolean).join(', '),
      words ? { score: String(words.shown), text: `${rankBits.join(', ')}.` } : null,
    ],
    price: Number.isFinite(cost?.dayEur) ? { value: eur(cost.dayEur), unit: T('dest.priceDayUnit') } : null,
    facts: coverFacts.slice(0, 4),
    qr: share ? { url: share, head: T('pdf.qrHead'), note: T('pdf.qrNote') } : null,
  });

  // ════════════════════════════ 2. At a glance ════════════════════════════
  kit.startPage(T('pdf.atGlance'));
  const intro = d.intro?.short || d.intro?.lead;
  if (intro) kit.para(intro, { size: 11.5, after: 3 });
  if (why) kit.para(why, { size: 10, color: C.text2, after: 3 });
  const dishes = (d.eat?.dishes || []).filter((x) => x?.name);
  if (dishes.length) {
    kit.h3(T('pdf.eat'));
    kit.para(dishes.map((x) => x.name).join(', '), { size: 10.5, after: 3 });
  }
  if (Number.isFinite(cost?.dayEur)) {
    kit.h2(T('pdf.costSplit'));
    const sights = cost.sightsEur ?? cost.activitiesEur ?? null;
    const around = cost.localEur ?? cost.transportEur ?? null;
    const parts = [
      { label: T('cost.bed'), value: cost.stayEur },
      { label: T('cost.food'), value: cost.foodEur },
      { label: T('pdf.factVisit'), value: sights },
      { label: T('pdf.costAround'), value: around },
    ].map((p) => ({ ...p, text: eur(p.value) }));
    const whole = parts.reduce((a, p) => a + (Number.isFinite(p.value) ? p.value : 0), 0) || cost.dayEur;
    kit.bars(parts, { of: whole });
    kit.moneyRow(T('cost.dayTotal'), eur(cost.dayEur), { bold: true });
    if (stayDays >= 2) kit.para(T('pdf.stayTotal', { price: eur(cost.dayEur * stayDays), n: stayDays }), { size: 10, style: 'semibold', after: 1 });
    if (lifestyleLabel) kit.para(lifestyleLabel, { size: 8.5, color: C.text3, after: 2 });
  }
  if (best.length) {
    kit.h2(T('pdf.factBest'));
    kit.monthStrip(best, Array.from({ length: 12 }, (_, i) => monthName(i + 1, narrowM)));
    kit.para(T('pdf.bestMonths', { months: monthSpan(best) }), { size: 9.5, color: C.text2, after: 2 });
  }
  const shortMonth = (m) => monthName(m, shortM);
  const tipArgs = (tip) => {
    const args = { ...(tip.args || {}) };
    if (args.from_m) args.from = shortMonth(args.from_m);
    if (args.to_m) args.to = shortMonth(args.to_m);
    if (args.month) args.month = monthName(args.month);
    if (args.rental_eur != null) args.rental_eur = eur(args.rental_eur);
    return args;
  };
  const tips = (d.tips || []).map((tip) => T(`tip.${tip.code}`, tipArgs(tip))).filter((s) => s && !s.startsWith('tip.'));
  if (tips.length) {
    kit.h2(T('pdf.goodToKnow'));
    for (const s of tips) kit.para(s, { size: 10.5, after: 2 });
  }

  // ════════════════════════════ 3. What to see ════════════════════════════
  const hl = [...(d.highlights || [])].sort((a, b) => (b.rank_score || 0) - (a.rank_score || 0));
  const walk = d.walk?.stops?.length ? d.walk : null;
  const dos = d.do || [];
  if (hl.length || walk || dos.length) {
    kit.startPage(T('pdf.whatToSee'));
    const pins = hl.map((h, i) => ({ lat: h.lat, lon: h.lon, n: i + 1 }));
    if (pins.some((p) => Number.isFinite(p.lat))) {
      kit.pinMap(pins, {
        h: 96,
        centre: { lat: d.place?.lat, lon: d.place?.lon },
        scaleLabel: (km) => kmFmt(km),
      });
      kit.para(T('pdf.mapNote'), { size: 8.5, color: C.text3, after: 3 });
    }
    hl.forEach((h, i) => {
      const kind = [h.label ? clean(poiLabelWord(t, h.label)) : '', h.kind].filter(Boolean).join(', ');
      row({
        n: i + 1,
        name: h.name,
        right: [kind, h.dist_km != null ? kmFmt(h.dist_km) : ''].filter(Boolean).join(', '),
        sub: h.fact || '',
        url: h.wikipedia || '',
      });
    });
    if (walk) {
      kit.h2(T('pdf.walk'));
      const bits = {
        km: walk.km != null ? nf(walk.km, walk.km % 1 ? 1 : 0) : '',
        walk: walk.walk_min != null ? T('pdf.minutes', { n: nf(walk.walk_min) }) : '',
        h: walk.visit_h != null ? nf(walk.visit_h, walk.visit_h % 1 ? 1 : 0) : '',
      };
      if (bits.km && bits.walk && bits.h) kit.para(T('pdf.walkLine', bits), { size: 10, color: C.text2, after: 2.5 });
      walk.stops.filter((s) => s?.name).forEach((s, i) => {
        row({ n: i + 1, name: s.name, right: Number.isFinite(s.min) && s.min > 0 ? T('pdf.minutes', { n: nf(s.min) }) : '' });
      });
    }
    if (dos.length) {
      kit.h2(T('dest.doTitle'));
      for (const item of dos) {
        const type = t(`dest.doType.${item.type}`);
        const meta = [type === `dest.doType.${item.type}` ? '' : clean(type), item.season?.length ? monthSpan(item.season) : ''].filter(Boolean).join(', ');
        row({ name: item.name, right: meta, sub: item.detail || '', link: item.link ? activityLink(item.link, 'pdf') : '' });
      }
    }
  }

  // ════════════════════════════ 4. Around ════════════════════════════
  const trips = (d.trips || []).filter((x) => x?.name);
  const counts = d.around?.counts || {};
  const countLine = COUNT_LAYERS.filter((k) => counts[k] > 0)
    .map((k) => T(counts[k] === 1 ? `dest.layerN1.${k}` : `dest.layerN.${k}`, { n: nf(counts[k]) })).join(', ');
  const routes = d.routes || {};
  const routeRows = [];
  const seen = new Set();
  for (const [activity, list] of [['hiking', routes.hiking], ['cycling', routes.cycling], ['hiking', d.around?.trails], ['cycling', d.around?.cycling]]) {
    for (const r of list || []) {
      const key = `${activity}:${r?.id}`;
      if (!r?.name || seen.has(key)) continue;
      seen.add(key);
      routeRows.push({ activity, r });
    }
  }
  const outdoor = pdfOutdoorRows(d.around, d.nearby);
  const water = outdoor.layers.filter((l) => !['trails', 'cycling'].includes(l.layer));
  if (trips.length || countLine || routeRows.length || water.length) {
    kit.startPage(T('dest.aroundTitle', { city }));
    if (countLine) kit.para(`${T('pdf.around', { km: nf(d.around?.radius_km || outdoor.km) })}: ${countLine}.`, { size: 10.5, color: C.text2, after: 2 });
    if (trips.length) {
      kit.h2(T('dest.tripsTitle'));
      for (const tr of trips) {
        const how = tr.kind === 'composed_trip'
          ? T('dest.tripDays', { n: tr.days || 0 })
          : [tr.travel?.minutes != null ? T('dest.minutesBy', { n: nf(tr.travel.minutes), mode: T(`mode.${tr.travel.mode}`) }) : '',
            tr.dist_km != null ? kmText(tr.dist_km) : ''].filter(Boolean).join(', ');
        const score = ratingWords(tr.rating, t);
        row({ name: tr.name, right: score ? clean(score.text) : '', sub: [how, tr.blurb].filter(Boolean).join('. ') });
      }
    }
    if (routeRows.length) {
      kit.h2(T('pdf.trailsHead'));
      for (const activity of ['hiking', 'cycling']) {
        const list = routeRows.filter((x) => x.activity === activity);
        if (!list.length) continue;
        kit.h3(T(activity === 'hiking' ? 'dest.routesHiking' : 'dest.routesCycling'));
        for (const { r } of list) {
          const bits = [];
          if (r.km_len != null) bits.push(kmText(r.km_len));
          const up = trailClimbUp(r);
          if (up != null) bits.push(T('dest.ascentUp', { m: nf(Math.round(up)) }));
          const gk = gradeLabelKey(r);
          if (gk) bits.push(T(gk));
          const from = r.km != null ? `${kmFmt(r.km)} ${r.dir ? T(`dir.${r.dir}`) : (r.bearing || '')}`.trim() : '';
          row({ name: r.name, right: from, sub: bits.join(', '), link: routePageUrlHere(activity, r) });
        }
      }
    }
    for (const { layer, rows } of water) {
      kit.h3(T(`dest.layerKind.${layer}`));
      for (const r of rows) {
        const rw = r.v5 ? ratingWords(natureRating(r), t) : null;
        row({ name: r.name, right: `${kmFmt(r.km)} ${r.bearing || ''}`.trim(), sub: [rw ? clean(rw.text) : '', r.water || ''].filter(Boolean).join(', ') });
      }
    }
  }

  // ════════════════════════════ 5. When to go and where to stay ════════════════════════════
  const normals = d.when?.normals;
  const fests = d.festivals || [];
  const sleep = d.sleep || {};
  const hoods = (sleep.neighbourhoods || []).filter((n) => n?.name && Number.isFinite(n.night_eur));
  if (normals?.length === 12 || fests.length || hoods.length) {
    kit.startPage(T('pdf.whenStay'));
    if (normals?.length === 12) {
      kit.h2(T('explore.whenTitle'));
      const on = new Set(best);
      const labelW = 26;
      const cw = (W - labelW) / 12;
      const rowsT = [
        [T('pdf.rowHigh'), (m) => (Number.isFinite(m[0]) ? nf(Math.round(m[0])) : ''), 'semibold'],
        [T('pdf.rowLow'), (m) => (Number.isFinite(m[1]) ? nf(Math.round(m[1])) : ''), 'normal'],
        [T('pdf.rowRain'), (m) => (Number.isFinite(m[2]) ? nf(Math.round(m[2])) : ''), 'normal'],
      ];
      const rh = 6.4;
      const th = rh * (rowsT.length + 1) + 1;
      kit.ensure(th + 8);
      const y0 = kit.state.y;
      for (let i = 0; i < 12; i += 1) {
        if (!on.has(i + 1)) continue;
        doc.setFillColor(...C.select);
        doc.roundedRect(M + labelW + i * cw + 0.3, y0 - 0.8, cw - 0.6, th, 1.2, 1.2, 'F');
      }
      for (let i = 0; i < 12; i += 1) {
        kit.font(on.has(i + 1) ? 'bold' : 'normal', 8.5, on.has(i + 1) ? C.text : C.text2);
        doc.text(clean(monthName(i + 1, shortM)).replace(/\.$/, ''), M + labelW + i * cw + cw / 2, y0 + 0.6, { baseline: 'top', align: 'center' });
      }
      rowsT.forEach(([label, val, style], r) => {
        const y = y0 + rh * (r + 1);
        kit.font('normal', 8.5, C.text2);
        doc.text(label, M, y + 0.6, { baseline: 'top' });
        normals.forEach((m, i) => {
          kit.font(style, 9.5);
          doc.text(val(m), M + labelW + i * cw + cw / 2, y + 0.4, { baseline: 'top', align: 'center' });
        });
      });
      kit.state.y = y0 + th + 2;
      const notes = [T('pdf.monthsNote')];
      if (best.length) notes.push(T('pdf.bestMonths', { months: monthSpan(best) }));
      kit.para(notes.join(' '), { size: 8.5, color: C.text3, after: 2 });
      if (d.when.crowding?.label) kit.para(`${T('pdf.crowding')}: ${d.when.crowding.label}${d.when.crowding.year ? ` (Eurostat ${d.when.crowding.year})` : ''}.`, { size: 9.5, color: C.text2, after: 2 });
    }
    if (fests.length) {
      kit.h2(T('dest.festivalsTitle'));
      for (const f of fests) {
        row({ name: f.name, right: f.months?.length ? monthSpan(f.months) : T('pdf.dateVaries'), sub: f.what || '', url: f.url || '' });
      }
    }
    const beds = sleep.beds || {};
    const tierRows = [['dest.tierDorm', beds.dorm], ['dest.tierPrivate', beds.private], ['dest.tierHotel', beds.hotel3], ['pdf.hotel4', beds.hotel4]]
      .filter(([, v]) => Number.isFinite(v));
    if (tierRows.length || hoods.length) {
      kit.h2(T('dest.sleepTitle'));
      for (const [k, v] of tierRows) {
        const label = T(k, { eur: '' }).replace(/\s+$/, '');
        kit.moneyRow(label.charAt(0).toUpperCase() + label.slice(1), eur(v));
      }
      if (hoods.length) {
        kit.gap(3);
        kit.h3(T('pdf.neighbourhoods'));
        const colW = (W - 8) / 2;
        for (let i = 0; i < hoods.length; i += 2) {
          kit.ensure(7);
          [hoods[i], hoods[i + 1]].forEach((n, j) => {
            if (!n) return;
            const x = M + j * (colW + 8);
            kit.font('normal', 10);
            doc.text(doc.splitTextToSize(clean(n.name), colW - 22)[0], x, kit.state.y, { baseline: 'top' });
            kit.font('semibold', 10);
            doc.text(eur(n.night_eur), x + colW, kit.state.y, { baseline: 'top', align: 'right' });
          });
          kit.state.y += 6.2;
        }
        kit.para(T('dest.sleepNote'), { size: 8.5, color: C.text3, after: 2 });
      }
      if (sleep.curve?.length === 12) {
        const cheap = sleep.curve.indexOf(Math.min(...sleep.curve));
        if (cheap >= 0) kit.para(`${T('dest.cheapestMonth', { month: monthName(cheap + 1) })}.`, { size: 9.5, color: C.text2 });
      }
    }
  }

  // ════════════════════════════ 6. Practical and credits ════════════════════════════
  kit.startPage(T('pdf.practicalTitle'));
  const es = d.essentials || null;
  if (es) {
    const quick = [];
    const langs = (es.languages || []).filter((c) => typeof c === 'string' && c);
    if (langs.length) {
      let names = langs;
      try {
        const dn = new Intl.DisplayNames([lang], { type: 'language' });
        names = langs.map((c) => dn.of(c) || c);
      } catch { /* the codes stand */ }
      quick.push({ label: T('pdf.languages'), value: names.join(', ') });
    }
    if (es.currency) {
      let cur = es.currency;
      try { cur = new Intl.DisplayNames([lang], { type: 'currency' }).of(es.currency) || es.currency; } catch { /* the code stands */ }
      quick.push({ label: T('pdf.currency'), value: cur });
    }
    if (TIPPING.includes(es.tipping)) quick.push({ label: T('pdf.tipping'), value: T(`pdf.tipping.${es.tipping}`) });
    if (es.plugs?.length) {
      quick.push({ label: T('pdf.plugs'), value: es.volts ? T('pdf.plugsValue', { types: es.plugs.join(', '), v: es.volts }) : es.plugs.join(', ') });
    }
    if (TAP.includes(es.tap_water)) quick.push({ label: T('pdf.tapWater'), value: T(`pdf.tapWater.${es.tap_water}`) });
    if (es.emergency) quick.push({ label: T('pdf.emergency'), value: String(es.emergency) });
    if (quick.length) {
      kit.h2(T('pdf.quickFacts'));
      kit.facts(quick, 3);
    }
  }
  const getRows = [];
  if (getting.airport) {
    getRows.push({ label: T('pdf.airport'), value: getting.transfer_min != null
      ? (getting.transfer_mode
        ? T('dest.flyToWithTransfer', { iata: getting.airport, n: getting.transfer_min, mode: T(`mode.${getting.transfer_mode}`) })
        : T('dest.flyToTransferNoMode', { iata: getting.airport, n: getting.transfer_min, mode: T('data.notYet') }))
      : T('dest.flyTo', { iata: getting.airport }) });
  }
  if (getting.transit) getRows.push({ label: T('pdf.transit'), value: `${T(`dest.transit.${getting.transit}`)}${getting.why ? ` ${getting.why}` : ''}` });
  if (getting.car_needed != null) {
    getRows.push({ label: T('pdf.car'), value: getting.car_needed
      ? `${T('dest.carYes')}${getting.rental_eur_day != null ? ` ${T('dest.carRental', { eur: eur(getting.rental_eur_day) })}` : ''}`
      : T('dest.carNo') });
  }
  if (d.practical?.rhythm) getRows.push({ label: T('pdf.rhythm'), value: d.practical.rhythm });
  if (d.practical?.book_ahead?.length) getRows.push({ label: T('pdf.bookAhead'), value: d.practical.book_ahead.join(', ') });
  if (d.water?.rating) getRows.push({ label: T('pdf.water'), value: `${d.water.rating}${d.water.excellent_pct != null ? `, ${T('dest.waterShare', { pct: d.water.excellent_pct, n: d.water.n_sites })}` : ''}` });
  if (getRows.length) {
    kit.h2(T('detail.gettingThere'));
    for (const r of getRows) {
      const vl = kit.lines(r.value, 10, W - 44);
      kit.ensure(vl.length * kit.lh(10) + 4);
      kit.rule();
      kit.state.y += 2;
      kit.font('semibold', 9.5, C.text2);
      doc.text(clean(r.label), M, kit.state.y, { baseline: 'top' });
      kit.font('normal', 10);
      doc.text(vl, M + 44, kit.state.y, { baseline: 'top', lineHeightFactor: 1.4 });
      kit.state.y += vl.length * kit.lh(10) + 1.5;
    }
    kit.rule();
    kit.gap(2);
  }
  const pk = d.parking;
  const spots = [...(pk?.spots || []).map((s) => ({ ...s, kind: 'spot' })), ...(pk?.park_ride ? [{ ...pk.park_ride, kind: 'pr' }] : [])];
  if (spots.length || pk?.web?.official_url) {
    kit.h2(T('explore.parkTitle'));
    if (pk.web?.advice) kit.para(pk.web.advice, { size: 9.5, color: C.text2, after: 2 });
    for (const s of spots) {
      const bits = [s.kind === 'pr' ? T('explore.park.park_ride') : T(s.fee === 'no' ? 'explore.parkFree' : s.fee === 'yes' ? 'explore.parkPaid' : 'explore.parkFeeUnknown'),
        s.capacity != null ? T('explore.parkSpaces', { n: s.capacity }) : '', s.walk_min != null ? T('dest.walkMin', { n: s.walk_min }) : ''].filter(Boolean);
      row({ name: s.name || (s.kind === 'pr' ? T('explore.park.park_ride') : T('explore.parkUnnamed')), right: bits.join(', '), link: s.nav?.gmaps || '' });
    }
    if (pk.web?.official_url) kit.link(T('dest.parkOfficial'), pk.web.official_url);
  }
  const linkRows = [
    [T('dest.linkGflights'), links.flights_google], [T('dest.linkSkyscanner'), links.skyscanner],
    [T('dest.linkBooking'), links.booking], [T('dest.linkAirbnb'), links.airbnb],
    ['GetYourGuide', links.getyourguide && activityLink(links.getyourguide, 'pdf')],
    ['Viator', links.viator && activityLink(links.viator, 'pdf')],
  ].filter(([, u]) => u);
  if (linkRows.length) {
    kit.h2(T('pdf.practical'));
    for (const [label, url] of linkRows) row({ name: label, link: url });
  }
  const similar = (d.similar || []).filter((s) => s?.name).slice(0, 5);
  if (similar.length) {
    kit.h2(T('pdf.similar'));
    for (const s of similar) {
      const sw = ratingWords({ score: s.score }, t);
      row({ name: s.name, right: [s.country, sw ? clean(sw.text) : ''].filter(Boolean).join(', ') });
    }
  }

  // Credits: every photograph's author and licence, then the sources.
  kit.h2(T('pdf.credits'));
  const credited = (d.gallery || []).filter((g) => g?.url && (g.author || g.licence));
  if (credited.length) {
    kit.h3(T('pdf.photoCredits'));
    for (const g of credited) {
      const line = `${clean(g.caption || city)}: ${[g.author, g.licence].filter(Boolean).map(clean).join(', ')}`;
      kit.ensure(6);
      kit.font('normal', 8.5, C.text2);
      const ls = doc.splitTextToSize(line, W);
      doc.text(ls, M, kit.state.y, { baseline: 'top', lineHeightFactor: 1.35 });
      if (g.page) doc.link(M, kit.state.y, Math.min(W, doc.getTextWidth(ls[0])), kit.lh(8.5), { url: g.page });
      kit.state.y += ls.length * kit.lh(8.5, 1.35) + 0.6;
    }
    kit.gap(2);
  }
  const sources = [...(d.credits || []).filter((c) => c?.name),
    ...(d.intro?.grounding?.[0]?.url ? [{ name: T('pdf.introCredit'), licence: '', url: d.intro.grounding[0].url }] : [])];
  if (sources.length) {
    kit.h3(T('pdf.dataCredits'));
    for (const c of sources) {
      const line = [clean(c.name), c.licence && c.licence !== 'see site' ? clean(c.licence) : ''].filter(Boolean).join(', ');
      kit.ensure(6);
      kit.font('normal', 8.5, c.url ? C.action : C.text2);
      const ls = doc.splitTextToSize(line, W);
      doc.text(ls, M, kit.state.y, { baseline: 'top', lineHeightFactor: 1.35 });
      if (c.url) doc.link(M, kit.state.y, Math.min(W, doc.getTextWidth(ls[0])), kit.lh(8.5), { url: c.url });
      kit.state.y += ls.length * kit.lh(8.5, 1.35) + 0.6;
    }
  }
  kit.gap(3);
  kit.para(T('pdf.generatedNote', { date: dateLong }), { size: 8.5, color: C.text3 });

  kit.save(`${fileSlug(city) || 'destination'}-carta-guide.pdf`);
}
