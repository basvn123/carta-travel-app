/**
 * The shareable trip receipt image (T1175, ROADMAP K7).
 *
 * A saved trip, priced the way My trips prices it (lib/myTrips.js
 * plannerStateFromPlan, then lib/tripTotal.js quoteTrip and tripLines, the
 * lines every screen and the PDF render), laid out as a 1080 x 1350 card
 * (4:5, the shape the big share targets crop least) in draw.js ops.
 *
 *   receiptModel(plan, { data, stayTier, lifestyle })   the figures, or null
 *   receiptOps(model, { t, money, dateText, pricedOn })  the drawing
 *   receiptExpected(plan, opts)                          the same figures by
 *       a second path (lib/myTrips.js tripFigure), for the numbers check
 *   checkReceipt(ops, model, plan, opts)                 [] when every
 *       printed figure matches the data and the lines add up to the total
 *
 * The image holds no photo and no map, so it needs no image credit; its
 * foot says the figures are Carta's estimate on a date, and where a flight
 * line is Google Flights' fare (owner rule: never Carta's own).
 */
import { plannerStateFromPlan, tripFigure, nightsBetween } from '../myTrips.js';
import { quoteTrip, tripLines } from '../tripTotal.js';
import { wrapText, checkFigures } from './draw.js';

export const RECEIPT_W = 1080;
export const RECEIPT_H = 1350;

/** The i18n key of each receipt line (lib/planPdf.js uses the same). */
export const RECEIPT_LINE_KEY = {
  out: 'itin.secGetThere',
  back: 'itin.secGetHome',
  travel: 'plan.lineTravel',
  drive: 'plan.lineDrive',
  airport: 'plan.lineAirport',
  transfers: 'plan.lineTransfers',
  between: 'plan.lineBetween',
  car: 'plan.lineCar',
  daytrips: 'plan.lineDaytrips',
  beds: 'plan.lineBeds',
  days: 'plan.lineDays',
};

/** The cost colour of each line (carta-design: flight saffron, bed the
 *  action umber, food and drink lagoon; the rest a quiet umber). */
export const RECEIPT_LINE_TONE = {
  out: 'sun-400', back: 'sun-400', travel: 'sun-400', beds: 'umber-600', days: 'lagoon-600',
};
const OTHER_TONE = 'umber-200';

/** The receipt's figures for a saved trip, or null when it cannot be priced. */
export function receiptModel(plan, { data, stayTier = 'home', lifestyle = null } = {}) {
  const state = plannerStateFromPlan(plan, { stayTier, lifestyle });
  if (!state || !data?.destinations) return null;
  let priced;
  try { priced = quoteTrip(state, { data }); } catch { return null; }
  const total = priced?.grandTotal;
  if (!Number.isFinite(total) || total <= 0) return null;
  const nights = state.stops.reduce((n, s) => n + (s.nights || 1), 0) || 1;
  const party = priced.party?.head || 1;
  const stops = (plan.stops || []).filter((s) => s.destination_id);
  const cities = stops.map((s) => data.destinations[s.destination_id]?.city || s.city || s.destination_id);
  const lines = tripLines(priced).map((l) => ({ key: l.key, kind: l.kind, eur: Number.isFinite(l.eur) ? l.eur : 0 }));
  const start = stops[0]?.arrive_date || plan.start_date || null;
  const end = stops.at(-1)?.depart_date || plan.end_date || null;
  return {
    title: [...new Set(cities)].join(', '),
    start,
    end,
    nights,
    party,
    lines,
    total,
    perPerson: priced.perPerson,
    perPersonDay: priced.perPerson / nights,
  };
}

/** The figures the image must print, from the second path (tripFigure). */
export function receiptExpected(plan, opts = {}) {
  const f = tripFigure(plan, opts);
  const m = receiptModel(plan, opts);
  if (!f || !m) return null;
  const out = {
    total: Math.round(f.total),
    perPersonDay: Math.round(f.perPersonDay),
    nights: f.nights,
    party: f.party,
  };
  for (const l of m.lines) if (l.kind !== 'missing') out[`line.${l.key}`] = Math.round(l.eur);
  return out;
}

/** The drawing. `t` is the i18n function, `money` formats whole euros
 *  (formatMoney), `dateText(start, end)` words the dates, `pricedOn` is the
 *  day the trip was priced, already worded. */
export function receiptOps(model, { t, money, dateText = () => '', pricedOn = '' }) {
  const ops = [];
  const X0 = 60, W = 960, PAD = 56;
  const L = X0 + PAD, R = X0 + W - PAD;
  ops.push({ t: 'rect', x: X0, y: 60, w: W, h: 1230, r: 28, fill: 'neutral-0' });

  // The head: kicker, the route, the dates, the nights and the party.
  const titleLines = wrapText(model.title, 28).slice(0, 2);
  if (wrapText(model.title, 28).length > 2) titleLines[1] = `${titleLines[1].replace(/,?$/, '')} ...`;
  const headH = 230 + (titleLines.length - 1) * 58;
  ops.push({ t: 'rect', x: X0, y: 60, w: W, h: headH, r: 28, fill: 'umber-100' });
  ops.push({ t: 'rect', x: X0, y: 60 + headH - 40, w: W, h: 40, fill: 'umber-100' });
  ops.push({ t: 'text', x: L, y: 128, text: t('share.receiptKicker'), size: 24, weight: 700, fill: 'umber-700' });
  titleLines.forEach((line, i) => ops.push({ t: 'text', x: L, y: 186 + i * 58, text: line, size: 50, weight: 800, fill: 'neutral-900' }));
  let y = 186 + (titleLines.length - 1) * 58 + 52;
  const dates = dateText(model.start, model.end);
  const stay = [
    t(model.nights === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n: model.nights }),
    t(model.party === 1 ? 'share.receiptParty1' : 'share.receiptPartyN', { n: model.party }),
  ].join(', ');
  ops.push({ t: 'text', x: L, y, text: dates ? `${dates},` : '', size: 28, weight: 500, fill: 'neutral-700', date: true });
  ops.push({
    t: 'text', x: dates ? R : L, y, text: stay, size: 28, weight: 600, fill: 'neutral-700', anchor: dates ? 'end' : 'start',
    fig: [{ key: 'nights', value: model.nights }, { key: 'party', value: model.party }],
  });

  // The cost bar: one segment per priced line, weighted by its euros.
  y = 60 + headH + 48;
  const segs = model.lines.filter((l) => l.kind !== 'missing' && l.eur > 0);
  const sum = segs.reduce((s, l) => s + l.eur, 0) || 1;
  const GAP = 4, BAR = R - L;
  const usable = BAR - GAP * Math.max(0, segs.length - 1);
  let x = L;
  segs.forEach((l, i) => {
    const w = Math.max(6, (l.eur / sum) * usable);
    const last = i === segs.length - 1;
    ops.push({ t: 'rect', x: Math.round(x * 10) / 10, y, w: Math.round((last ? R - x : w) * 10) / 10, h: 24, r: 12, fill: RECEIPT_LINE_TONE[l.key] || OTHER_TONE });
    x += w + GAP;
  });

  // The lines.
  y += 24 + 64;
  const step = Math.min(64, 520 / Math.max(1, model.lines.length));
  for (const l of model.lines) {
    const label = t(RECEIPT_LINE_KEY[l.key] || 'plan.lineBetween') + (l.kind === 'yours' ? ` (${t('plan.yours')})` : '');
    ops.push({ t: 'circle', cx: L + 9, cy: y - 10, r: 9, fill: l.kind === 'missing' ? 'none' : (RECEIPT_LINE_TONE[l.key] || OTHER_TONE), stroke: l.kind === 'missing' ? 'umber-200' : null, sw: 2 });
    ops.push({ t: 'text', x: L + 32, y, text: label, size: 28, weight: 600, fill: 'neutral-900' });
    if (l.kind === 'missing') {
      ops.push({ t: 'text', x: R, y, text: t('plan.notIn'), size: 24, weight: 500, fill: 'neutral-600', anchor: 'end' });
    } else {
      const v = Math.round(l.eur);
      ops.push({ t: 'text', x: R, y, text: money(v), size: 30, weight: 700, fill: 'neutral-900', anchor: 'end', fig: { key: `line.${l.key}`, value: v, money: true } });
    }
    y += step;
  }

  // The sum: a 3px ink rule, the total, a person a day.
  y += 4;
  ops.push({ t: 'rect', x: L, y, w: R - L, h: 3, fill: 'neutral-900' });
  y += 66;
  const total = Math.round(model.total);
  ops.push({
    t: 'text', x: L, y, text: t(model.party === 1 ? 'share.receiptTotal1' : 'share.receiptTotalN', { n: model.party }),
    size: 30, weight: 700, fill: 'neutral-900', fig: model.party === 1 ? undefined : { key: 'party', value: model.party },
  });
  ops.push({ t: 'text', x: R, y: y + 6, text: money(total), size: 60, weight: 800, fill: 'neutral-900', anchor: 'end', fig: { key: 'total', value: total, money: true } });
  y += 52;
  const day = Math.round(model.perPersonDay);
  ops.push({ t: 'text', x: L, y, text: t('share.receiptPerDay', { price: money(day) }), size: 28, weight: 600, fill: 'lagoon-700', fig: { key: 'perPersonDay', value: day, money: true } });

  // The foot: what the figures are, from when, and where to plan one.
  ops.push({ t: 'rect', x: X0, y: 1150, w: W, h: 140, r: 28, fill: 'umber-50' });
  ops.push({ t: 'rect', x: X0, y: 1150, w: W, h: 40, fill: 'umber-50' });
  const note = wrapText(t('share.receiptNote', { date: pricedOn }), 78).slice(0, 2);
  note.forEach((line, i) => ops.push({ t: 'text', x: L, y: 1196 + i * 30, text: line, size: 21, weight: 500, fill: 'neutral-700', date: true }));
  ops.push({ t: 'text', x: L, y: 1262, text: t('share.receiptBrand'), size: 22, weight: 700, fill: 'umber-700' });
  return ops;
}

/** The numbers check for one receipt: [] when it passes. */
export function checkReceipt(ops, model, plan, opts = {}, money = String) {
  const expected = receiptExpected(plan, opts);
  if (!expected) return ['the trip cannot be priced'];
  const problems = checkFigures(ops, {
    expected,
    format: (f) => (f.money ? money(f.value) : String(f.value)),
  });
  // The lines add up to the total (the receipt never prints a sum it does not show).
  const sum = model.lines.filter((l) => l.kind !== 'missing').reduce((s, l) => s + l.eur, 0);
  if (Math.abs(sum - model.total) > 0.05) problems.push(`the lines add up to ${Math.round(sum * 100) / 100}, the receipt total is ${Math.round(model.total * 100) / 100}`);
  // The dates printed are the trip's own.
  const n = model.start && model.end ? nightsBetween(model.start, model.end) : null;
  if (n != null && n > 0 && n !== model.nights) problems.push(`the dates hold ${n} nights, the receipt says ${model.nights}`);
  return problems;
}
