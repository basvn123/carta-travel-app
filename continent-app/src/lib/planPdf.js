/**
 * planPdf.js (T432): the planned trip as a booklet, the trip planner's
 * Download PDF. It replaces the print window (lib/tripExport.js), which
 * printed whatever the browser made of an HTML page, with the same Figtree
 * booklet the trip pages print (lib/pdfKit.js, T430).
 *
 * Every figure comes from the trip as the planner prices it
 * (lib/tripTotal.js), so the paper and the screen say one total:
 *
 *   cover      the first stop's photograph, the trip's name, the dates, and
 *              the four facts that define it (who, how long, where, Lifestyle)
 *   price      the receipt lines, each an estimate or the traveller's own,
 *              the total for the party and a person
 *   route      the line through the stops, then every stop with its nights
 *              and bed, and every hop with its way and figure
 *   days       one line a day: where, which date, what is planned
 *   before     the tips Carta researched for these countries and this month
 *   credits    the photographs and the date
 */
import { createPdf, fileSlug, clean } from './pdfKit.js';
import { formatMoney } from './money.js';
import { tripLines } from './tripTotal.js';
import { tipsForTrip } from './cheapTips.js';
import { loadAirlines } from './flights/flightData.js';

const LINE_KEY = {
  out: 'itin.secGetThere',
  back: 'itin.secGetHome',
  travel: 'plan.lineTravel',
  drive: 'plan.lineDrive',
  airport: 'plan.lineAirport',
  transfers: 'plan.lineTransfers',
  between: 'plan.lineBetween',
  car: 'plan.lineCar',
  beds: 'plan.lineBeds',
  days: 'plan.lineDays',
};

const MODE_KEY = {
  train: 'trip.modeTrain', bus: 'trip.modeBus', car: 'trip.modeCar', fly: 'trip.modeFly', ferry: 'trip.modeFerry',
};

/** "Fri 16 Oct" in the reader's language. */
function longDate(iso, lang) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const loc = lang === 'en' ? 'en-GB' : lang;
  return new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

export async function downloadPlanPdf({
  label = '', priced, dayPlan = [], lifestyle = '', t, lang = 'en', transportPref = null,
}) {
  if (!priced || !priced.stopDetails.length) return;
  const money = (v) => formatMoney(v, { precision: 'cents', locale: lang });
  const est = (v) => `~${money(v)}`;
  const stops = priced.stopDetails.filter((s) => s.dest);
  const first = stops[0];
  const last = stops[stops.length - 1];
  const name = clean(label || stops.map((s) => s.dest.city).slice(0, 3).join(', '));
  const kit = await createPdf({
    footerLabel: `Carta, ${name}`,
    pageLabel: (n, of) => t('pdf.page', { n, of }),
  });
  const { C } = kit;
  const people = priced.groupSize === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: priced.groupSize });
  const dates = first.arriveDate
    ? t('plan.dateRange', { a: longDate(first.arriveDate, lang), b: longDate(last.departDate, lang) })
    : '';
  const photos = [];
  // Carta's flight each way (T518) and the airline names to write it with.
  const cartaFlight = priced.cartaFlight || null;
  const airlines = cartaFlight?.out || cartaFlight?.back ? await loadAirlines().catch(() => ({})) : {};

  // ── Cover ──
  const cover = first.dest.image?.url
    ? { url: first.dest.image.url, caption: `${first.dest.city}, ${first.dest.country}`, author: first.dest.image.credit !== first.dest.city ? first.dest.image.credit : '' }
    : null;
  if (cover) {
    photos.push(cover);
    await kit.photo(cover, { maxH: 100 });
  }
  kit.h1(name);
  if (dates) kit.para(dates, { size: 11, color: C.text2, after: 3 });
  kit.facts([
    { label: t('settings.party'), value: people },
    { label: t('wizard.summaryDates'), value: t(priced.plannedNights === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n: priced.plannedNights }) },
    { label: t('plan.yourRoute'), value: stops.map((s) => s.dest.city).join(', ') },
    { label: t('settings.lifestyle'), value: lifestyle },
  ].filter((c) => c.value), 2);

  // ── Price ──
  kit.h2(t('plan.tripTotal'));
  for (const l of tripLines(priced)) {
    // Google Flights' fare is a measured price, not an estimate (T518).
    const value = l.kind === 'missing' ? t('plan.notIn')
      : l.kind === 'yours' ? `${money(l.eur)} (${t('plan.yours')})`
        : l.kind === 'flight' ? money(l.eur)
          : est(l.eur);
    kit.moneyRow(t(LINE_KEY[l.key]), value);
  }
  kit.moneyRow(t('receipt.total', { people }), est(priced.grandTotal), { bold: true });
  if (priced.groupSize > 1) kit.moneyRow(t('plan.perPerson'), est(priced.perPerson), { bold: true });

  // ── Route ── (the heading travels with its drawing, never alone at a foot)
  kit.ensure(64 + 18);
  kit.h2(t('plan.yourRoute'));
  kit.route(stops.map((s) => [s.dest.lon, s.dest.lat]), { h: 64 });
  const f = priced.flight;
  const travelMode = f?.driving ? 'car' : (f?.mode || 'fly');
  const travelLine = (dirKey, dir) => {
    const how = t(MODE_KEY[travelMode] || 'trip.modeFly');
    const leg = cartaFlight?.[dir];
    kit.para(t(dirKey), { size: 10.5, style: 'semibold', after: 0.3 });
    if (!leg?.cost) {
      kit.para(how, { size: 9.5, color: C.text2, after: 2 });
      return;
    }
    // The flight Carta priced (T518): airline, flight number, times, the day.
    const who = [airlines?.[leg.airline]?.name || leg.airline, leg.flightNo].filter(Boolean).join(' ');
    kit.para(
      [who, t('flight.times', { dep: leg.dep, arr: leg.arr }), longDate(leg.date, lang)].filter(Boolean).join(', '),
      { size: 9.5, color: C.text2, after: 0.6 },
    );
    kit.moneyRow(`${t('flight.flightLine')} ${leg.from} > ${leg.to}`, money(leg.cost.total));
    kit.para(t('flight.bookNote'), { size: 8.5, color: C.text3, after: 2 });
  };
  travelLine('itin.secGetThere', 'out');
  stops.forEach((s, i) => {
    const sc = priced.stayCosts[priced.stopDetails.indexOf(s)];
    kit.ensure(22);
    kit.para(`${i + 1}. ${s.dest.city}, ${s.dest.country}`, { size: 11, style: 'semibold', after: 0.3 });
    kit.para(
      [t(s.nights === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n: s.nights }),
        s.arriveDate ? t('plan.dateRange', { a: longDate(s.arriveDate, lang), b: longDate(s.departDate, lang) }) : ''].filter(Boolean).join(', '),
      { size: 9.5, color: C.text2, after: 0.6 },
    );
    if (sc) kit.moneyRow(t('plan.lineBeds'), sc.ownAccom ? `${money(sc.accomTotal)} (${t('plan.yours')})` : est(sc.accomTotal));
    const leg = i < stops.length - 1 ? priced.legs[i] : null;
    if (leg && leg.mode && !leg.no_road) {
      kit.moneyRow(
        `${t(MODE_KEY[leg.mode] || 'trip.modeTrain')} ${s.dest.city} > ${stops[i + 1].dest.city}`,
        leg.own ? `${money(leg.ground_total)} (${t('plan.yours')})` : est(leg.ground_total),
      );
    }
    kit.gap(2);
  });
  travelLine('itin.secGetHome', 'back');

  // ── Days ──
  if (dayPlan.length) {
    kit.h2(t('itin.yourDays'));
    for (const d of dayPlan) {
      const what = (d.activities || []).join(', ');
      kit.moneyRow(`${t('itin.dayN', { n: d.dayNum })}  ${d.stop.dest?.city || ''}`, longDate(d.date, lang));
      if (what) kit.para(what, { size: 9, color: C.text2, after: 1 });
    }
  }

  // ── Before you go ──
  const iso2s = [...new Set(stops.map((s) => s.dest.iso2).filter(Boolean))];
  const picked = tipsForTrip({
    iso2s,
    startDate: first.arriveDate || null,
    transport: (transportPref === 'car' || transportPref === 'owncar') ? 'car' : 'flight',
    groupSize: priced.groupSize,
  });
  const tips = [...picked.byCountry.flatMap((g) => g.tips), ...picked.generic].slice(0, 10);
  if (tips.length) {
    kit.h2(t('plan.beforeYouGo'));
    for (const tip of tips) {
      kit.ensure(16);
      kit.para(tip.title, { size: 10.5, style: 'semibold', after: 0.3 });
      kit.para(tip.tip, { size: 9.5, color: C.text2, after: 2.2 });
    }
  }

  // ── Credits ──
  kit.h2(t('pdf.credits'));
  for (const p of photos) {
    kit.para(`${clean(p.caption || '')}${p.author ? `: ${p.author}` : ''}`, { size: 8.5, color: C.text2, after: 0.6 });
  }
  const today = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, { dateStyle: 'long' }).format(new Date());
  kit.gap(2);
  kit.para(t('pdf.generatedNote', { date: today }), { size: 9, color: C.text3 });

  kit.save(`carta-${fileSlug(name) || 'trip'}.pdf`);
}
