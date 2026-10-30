/**
 * tripPdf.js (T431, T914): the trip booklet, the Download PDF of a trip page.
 *
 * The trip notes a traveller carries (the research: Exodus and Macs hand
 * out trip-notes PDFs, and a week on foot is lived offline), in the page's
 * order and the page's words, from the model JourneyPage builds at the tap:
 *
 *   cover      the place guide's cover (pdfKit cover): the first photograph
 *              with its credit, the wordmark, the title, where, the days and
 *              the style, the price range a person, the best months and the
 *              fact band, and a QR code back to the journey page
 *   the week   why this trip, who it suits (the journey's `fit`, good for and
 *              less good for, when the data has it), the route as numbered
 *              pins when the trip has day places, and the price at the
 *              traveller's own choices with what it includes
 *   the days   one page a day: the day of the week, the title, the day's
 *              photograph where the trip has one, the figures as chips,
 *              morning, afternoon and evening, and tonight's bed
 *   before     where you sleep, getting there, the booking order, what could
 *              go wrong, good to know, the tips, the packing list, the
 *              emergency number
 *   credits    every photograph's author and licence, the date
 */
import { createPdf, fileSlug, clean, monthSpan, M, W, PAGE_W } from './pdfKit.js';
import { formatMoneyRange } from './money.js';

export async function downloadTripPdf(trip, ctx = {}) {
  const { t, lang } = ctx;
  const T = (key, vars) => clean(t(key, vars));
  const m = ctx.model || {};
  const name = clean(m.name || trip?.title || '');
  const loc = lang === 'en' ? 'en-GB' : lang;
  const dateLong = new Intl.DateTimeFormat(loc, { dateStyle: 'long' }).format(new Date());
  const kit = await createPdf({
    footerLabel: `Carta, ${name}. ${T('pdf.pricesOn', { date: dateLong })}`,
    pageLabel: (n, of) => t('pdf.page', { n, of }),
  });
  const { C, doc } = kit;
  const photos = (m.photos || []).filter((p) => p && p.url);
  const days = m.days || [];
  const nDays = trip?.durationDays || days.length || null;

  // Figures as chips: outlined pills that wrap, as the page's day head.
  const chips = (list) => {
    const items = (list || []).map(clean).filter(Boolean);
    if (!items.length) return;
    const h = 6.4;
    let x = M;
    kit.ensure(h + 3);
    for (const c of items) {
      kit.font('semibold', 9.5);
      const w = doc.getTextWidth(c) + 6;
      if (x + w > PAGE_W - M) {
        x = M;
        kit.state.y += h + 2;
        kit.ensure(h + 3);
      }
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.25);
      doc.roundedRect(x, kit.state.y, w, h, h / 2, h / 2, 'S');
      doc.text(c, x + 3, kit.state.y + h / 2 + 0.1, { baseline: 'middle' });
      x += w + 2;
    }
    kit.state.y += h + 4;
  };

  // ── Cover ──
  const bestMonths = trip?.bestPeriod?.months || [];
  const range = trip?.budget?.totalEur;
  const priceValue = range && (Number.isFinite(range.low) || Number.isFinite(range.high))
    ? formatMoneyRange(range.low, range.high, { locale: lang })
    : (m.price?.ppValue || '');
  const coverFacts = [
    bestMonths.length ? { label: T('pdf.factBest'), value: monthSpan(bestMonths, loc) } : null,
    ...(m.facts || []),
  ].filter((c) => c && c.value).slice(0, 4);
  await kit.cover({
    photo: photos[0] || null,
    title: name,
    lines: [
      m.where || '',
      [nDays ? T('pdf.nDays', { n: nDays }) : '', m.tags || ''].filter(Boolean).join(', '),
    ],
    price: priceValue ? { value: priceValue, unit: range ? T('money.perPerson') : (m.price?.ppLabel || '') } : null,
    facts: coverFacts,
    qr: m.url ? { url: m.url, head: T('pdf.qrHead'), note: T('pdf.qrNoteTrip') } : null,
  });

  // ── The week: why, who it suits, the route, the price ──
  kit.startPage(T('journey.whyTrip'));
  if (m.hook) kit.para(m.hook, { size: 11.5, after: 3 });
  for (const w of (m.why || []).slice(0, 5)) {
    kit.para(w.title, { size: 10.5, style: 'semibold', after: 0.3 });
    if (w.line) kit.para(w.line, { size: 10, color: C.text2, after: 2.2 });
  }
  const fit = trip?.fit || {};
  const good = (fit.good || []).filter(Boolean);
  const less = (fit.less || []).filter(Boolean);
  if (good.length || less.length || m.fit?.length) {
    kit.h2(T('journey.fitHead'));
    if (good.length) {
      kit.h3(T('pdf.tripGood'));
      for (const g of good) kit.tickRow(true, g);
      kit.gap(1);
    }
    if (less.length) {
      kit.h3(T('pdf.tripLess'));
      for (const g of less) kit.para(g, { size: 10, color: C.text2, x: M + 6, width: W - 6, after: 1.2 });
      kit.gap(1);
    }
    for (const f of m.fit || []) kit.para(f, { size: 10, after: 1.2 });
  }
  const stops = [];
  for (const p of trip?.dayPlaces || []) {
    if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lon)) continue;
    const at = stops.find((s) => s.name === p.name && Math.abs(s.lat - p.lat) < 1e-4 && Math.abs(s.lon - p.lon) < 1e-4);
    if (at) at.days.push(p.day);
    else stops.push({ name: p.name, lat: p.lat, lon: p.lon, days: [p.day] });
  }
  if (stops.length > 1) {
    kit.h2(T('pdf.route'));
    kit.pinMap(stops.map((s, i) => ({ lat: s.lat, lon: s.lon, n: i + 1 })), {
      h: 80,
      scaleLabel: (km) => T('pdf.km', { km }),
    });
    stops.forEach((s, i) => {
      kit.ensure(7);
      kit.font('semibold', 10);
      doc.text(`${i + 1}. ${clean(s.name)}`, M, kit.state.y, { baseline: 'top' });
      kit.font('normal', 9.5, C.text2);
      doc.text(s.days.filter((x) => x != null).map((x) => T('journey.dayN', { n: x })).join(', '), PAGE_W - M, kit.state.y, { baseline: 'top', align: 'right' });
      kit.state.y += 6;
    });
  }
  if (m.price?.perPerson != null) {
    kit.h2(m.price.title || t('journey.priceHead', { n: m.price.days }));
    for (const l of m.price.lines || []) kit.moneyRow(l.label, l.value);
    kit.moneyRow(m.price.ppLabel, m.price.ppValue, { bold: true });
    if (m.price.partyLabel) kit.moneyRow(m.price.partyLabel, m.price.partyValue, { bold: true });
    kit.gap(3);
    // What the price includes; what it leaves out stays on the live page.
    for (const r of (m.price.included || []).filter((x) => x.in)) kit.tickRow(true, r.label, r.value || '');
    if (m.price.note) kit.para(m.price.note, { size: 8.5, color: C.text3, after: 2 });
  }

  // ── One page a day ──
  for (const d of days) {
    kit.startPage();
    kit.para(nDays ? T('pdf.dayOf', { n: d.n, of: nDays }) : T('journey.dayN', { n: d.n }), { size: 10, style: 'semibold', color: C.text2, after: 0.6 });
    kit.h1(d.title);
    if (d.photo?.url) await kit.photo(d.photo, { ratio: 16 / 9, maxH: 92 });
    chips(d.facts ? String(d.facts).split(', ') : []);
    for (const p of d.parts || []) {
      kit.ensure(16);
      kit.para(p.when, { size: 9.5, style: 'semibold', color: C.text2, after: 0.4 });
      kit.para(p.text, { size: 10.5, after: 3 });
    }
    if (d.tonight) {
      kit.gap(1);
      kit.ensure(12);
      kit.rule();
      kit.gap(2.5);
      const label = T('journey.tonight').replace(/:$/, '');
      kit.para(label, { size: 9.5, style: 'semibold', color: C.text2, after: 0.4 });
      kit.para(d.tonight, { size: 10.5, style: 'semibold', after: 2 });
    }
  }

  // ── Before you go ──
  kit.startPage(T('journey.grpPrepare'));
  const stays = (trip?.accommodationStrategy || []).filter((s) => s?.name);
  if (stays.length) {
    kit.h2(T('journey.sleepHead'));
    for (const s of stays) {
      kit.para([s.name, s.location].filter(Boolean).join(', '), { size: 10.5, style: 'semibold', after: 0.3 });
      if (s.style) kit.para(s.style, { size: 9.5, color: C.text2, after: 2 });
    }
  }
  if (m.gateways?.length) {
    kit.h2(T('detail.gettingThere'));
    for (const g of m.gateways) kit.para(g, { size: 10, after: 1.2 });
  }
  if (m.book?.length) {
    kit.h2(T('journey.bookHead'));
    m.book.forEach((b, i) => kit.para(`${i + 1}. ${b}`, { size: 10, after: 1.4 }));
  }
  const cards = (title, list, color = C.text) => {
    if (!list?.length) return;
    kit.h2(title);
    for (const c of list) {
      if (c.title) kit.para(c.title, { size: 10.5, style: 'semibold', color, after: 0.3 });
      kit.para(c.text, { size: 9.5, color: C.text2, after: 2.2 });
    }
  };
  cards(t('journey.wrongHead'), m.risks, C.warn);
  cards(t('journey.logHead'), m.good);
  cards(t('journey.tipsHead'), m.tips);
  if (m.pack?.length) {
    kit.h2(t('journey.packHead'));
    kit.para(m.pack.join(', '), { size: 10 });
  }
  if (trip?.emergencyNumber) {
    kit.h2(T('pdf.emergency'));
    kit.para(String(trip.emergencyNumber), { size: 14, style: 'bold' });
  }

  // ── Credits ──
  kit.h2(t('pdf.credits'));
  const credited = photos.filter((p) => p.author || p.licence);
  for (const p of credited) {
    kit.para(`${clean(p.caption || '')}: ${[p.author, p.licence].filter(Boolean).join(', ')}`, { size: 8.5, color: C.text2, after: 0.6 });
  }
  kit.gap(2);
  kit.para(t('pdf.generatedNote', { date: dateLong }), { size: 9, color: C.text3 });
  if (m.url) kit.link(t('pdf.openInCarta'), m.url);

  kit.save(`carta-${fileSlug(name) || 'trip'}.pdf`);
}
