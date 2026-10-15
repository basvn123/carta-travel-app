/**
 * itemPdf.js (T430): the Download PDF of an item page (a trail, a beach, a
 * lake, a mountain, a cycle route or tour), and the door to the trip booklet
 * (tripPdf.js).
 *
 * It prints the page's own words in the page's order, from the model the
 * page's shell hands over (DetailPage pdfModel: the name, the hook, the fact
 * band, the reasons to go, the before-you-go rows, the sources, plus the
 * page's photographs, where it is, its line and its climb). Nothing here
 * reads the data a second time, so the paper cannot disagree with the
 * screen. One page for most places: a cover photograph, the facts, the line
 * and the climb as vectors, the reasons, before you go, two more
 * photographs, and the credits.
 */
import { createPdf, fileSlug, clean } from './pdfKit.js';

export async function downloadItemPdf(kind, item, ctx = {}) {
  if (kind === 'trip') {
    const mod = await import('./tripPdf.js');
    await mod.downloadTripPdf(item, ctx);
    return;
  }
  const { t, lang } = ctx;
  const m = ctx.model || {};
  const name = clean(m.name || item?.name || ctx.title || '');
  const kit = await createPdf({
    footerLabel: `Carta, ${name}`,
    pageLabel: (n, of) => t('pdf.page', { n, of }),
  });
  const photos = (m.photos || []).filter((p) => p && p.url);

  if (photos[0]) await kit.photo(photos[0], { maxH: 96 });
  kit.h1(name);
  if (m.where) kit.para(m.where, { size: 10.5, color: kit.C.text2, after: 2.5 });
  if (m.hook) kit.para(m.hook, { size: 12, after: 4 });
  kit.facts(m.facts || [], 3);

  if (Array.isArray(m.route) && m.route.length > 1) {
    kit.h2(t('pdf.route'));
    kit.route(m.route, { h: 64 });
    if (Array.isArray(m.profile) && m.profile.length > 1) {
      kit.profile(m.profile, { label: t('pdf.climbLabel') });
    }
  }

  if (m.why?.length) {
    kit.h2(t('item.whyGo'));
    for (const w of m.why.slice(0, 5)) {
      if (w.title) kit.h3(w.title);
      kit.para(w.line, { size: 10, color: kit.C.text2, after: 2.5 });
    }
  }

  if (m.before?.length) {
    kit.h2(t('go.head'));
    for (const b of m.before) {
      kit.para(b.title, { size: 10.5, style: 'semibold', color: b.safety ? kit.C.warn : kit.C.text, after: 0.5 });
      kit.para(b.line, { size: 10, color: kit.C.text2, after: 2.5 });
    }
  }

  if (m.getting?.length) {
    kit.h2(t('detail.gettingThere'));
    for (const g of m.getting) kit.para(g, { size: 10, after: 1.5 });
  }

  if (photos.length > 1) {
    kit.h2(t('pdf.photoCredits'));
    await kit.photoPair(photos[1], photos[2]);
    if (photos[3]) await kit.photoPair(photos[3], photos[4]);
  }

  kit.h2(t('pdf.credits'));
  const today = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, { dateStyle: 'long' }).format(new Date());
  if (m.sources?.length) kit.para(`${t('item.sources')} ${m.sources.map((s) => s.label).join(', ')}`, { size: 9, color: kit.C.text2 });
  kit.para(t('pdf.generatedNote', { date: today }), { size: 9, color: kit.C.text3 });
  if (m.url) kit.link(t('pdf.openInCarta'), m.url);

  kit.save(`carta-${fileSlug(name) || kind}.pdf`);
}
