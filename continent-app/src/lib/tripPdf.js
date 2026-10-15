/**
 * tripPdf.js (T431): the trip booklet, the Download PDF of a trip page.
 *
 * The trip notes a traveller carries (the research: Exodus and Macs hand
 * out trip-notes PDFs, and a week on foot is lived offline), in the page's
 * order and the page's words, from the model JourneyPage builds at the tap:
 *
 *   cover      the first photograph, the title, where, the style and the
 *              difficulty, the hook, the fact band and why this trip
 *   price      the week at the traveller's own choices, line by line, the
 *              party total, and what is and is not included
 *   fit        the months and who it suits
 *   the days   each day's title, figures, tonight's bed and the written day,
 *              with its photograph where the trip has one
 *   before     getting there, the booking order, what could go wrong, good
 *              to know, the tips and the packing list
 *   credits    every photograph's author and licence, the sources, the date
 */
import { createPdf, fileSlug, clean } from './pdfKit.js';

export async function downloadTripPdf(trip, ctx = {}) {
  const { t, lang } = ctx;
  const m = ctx.model || {};
  const name = clean(m.name || trip?.title || '');
  const kit = await createPdf({
    footerLabel: `Carta, ${name}`,
    pageLabel: (n, of) => t('pdf.page', { n, of }),
  });
  const { C } = kit;
  const photos = (m.photos || []).filter((p) => p && p.url);

  // ── Cover ──
  if (photos[0]) await kit.photo(photos[0], { maxH: 104 });
  kit.h1(name);
  if (m.where) kit.para(m.where, { size: 10.5, color: C.text2, after: 1 });
  if (m.tags) kit.para(m.tags, { size: 10, style: 'semibold', color: C.text2, after: 2.5 });
  if (m.hook) kit.para(m.hook, { size: 12, after: 4 });
  kit.facts(m.facts || [], 3);
  if (m.why?.length) {
    kit.h2(t('journey.whyTrip'));
    for (const w of m.why.slice(0, 5)) {
      kit.para(w.title, { size: 10.5, style: 'semibold', after: 0.3 });
      if (w.line) kit.para(w.line, { size: 10, color: C.text2, after: 2.2 });
    }
  }

  // ── Price ──
  if (m.price?.perPerson != null) {
    kit.h2(m.price.title || t('journey.priceHead', { n: m.price.days }));
    for (const l of m.price.lines || []) kit.moneyRow(l.label, l.value);
    kit.moneyRow(m.price.ppLabel, m.price.ppValue, { bold: true });
    if (m.price.partyLabel) kit.moneyRow(m.price.partyLabel, m.price.partyValue, { bold: true });
    kit.gap(3);
    for (const r of m.price.included || []) kit.tickRow(r.in, r.label, r.value || '');
    if (m.price.note) kit.para(m.price.note, { size: 8.5, color: C.text3, after: 2 });
  }

  // ── Is this week for you ──
  if (m.fit?.length) {
    kit.h2(t('journey.fitHead'));
    for (const f of m.fit) kit.para(f, { size: 10, after: 1.2 });
  }

  // ── The days ──
  if (m.days?.length) {
    kit.newPage();
    kit.h2(t('journey.grpWeek'));
    for (const d of m.days) {
      kit.ensure(d.photo ? 120 : 46);
      if (d.photo) await kit.photo(d.photo, { maxH: 70 });
      kit.para(t('journey.dayN', { n: d.n }), { size: 9, style: 'semibold', color: C.text2, after: 0.4 });
      kit.para(d.title, { size: 13, style: 'bold', after: 1 });
      if (d.facts) kit.para(d.facts, { size: 10, style: 'semibold', after: 1.2 });
      if (d.tonight) kit.para(`${t('journey.tonight')} ${d.tonight}`, { size: 10, color: C.text2, after: 2 });
      for (const p of d.parts || []) {
        kit.para(p.when, { size: 8.5, style: 'semibold', color: C.text3, after: 0.3 });
        kit.para(p.text, { size: 9.5, after: 1.6 });
      }
      kit.gap(2);
      kit.rule();
      kit.gap(4);
    }
  }

  // ── Before you go ──
  if (m.gateways?.length) {
    kit.h2(t('detail.gettingThere'));
    for (const g of m.gateways) kit.para(g, { size: 10, after: 1.2 });
  }
  if (m.book?.length) {
    kit.h2(t('journey.bookHead'));
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

  // ── Credits ──
  kit.h2(t('pdf.credits'));
  const credited = photos.filter((p) => p.author || p.licence);
  for (const p of credited) {
    kit.para(`${clean(p.caption || '')}: ${[p.author, p.licence].filter(Boolean).join(', ')}`, { size: 8.5, color: C.text2, after: 0.6 });
  }
  const today = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, { dateStyle: 'long' }).format(new Date());
  kit.gap(2);
  kit.para(t('pdf.generatedNote', { date: today }), { size: 9, color: C.text3 });
  if (m.url) kit.link(t('pdf.openInCarta'), m.url);

  kit.save(`carta-${fileSlug(name) || 'trip'}.pdf`);
}
