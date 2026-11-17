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

/** The cost colour of each line, the formation's (house style G1 2026-11,
 *  DESIGN.md "Formation"): the bed a solid umber wagon, food and drink the
 *  beige wagon on its umber 500 edge, getting there and back in ink (inside
 *  the trip total, so never the outlined pill), the rest a quiet grey. */
export const RECEIPT_LINE_TONE = {
  out: 'neutral-700', back: 'neutral-700', travel: 'neutral-700', beds: 'umber-600', days: 'umber-100',
};
const LINE_EDGE = { days: 'umber-500' };
const OTHER_TONE = 'neutral-200';
const OTHER_EDGE = 'neutral-600';
const tone = (k) => RECEIPT_LINE_TONE[k] || OTHER_TONE;
const edge = (k) => LINE_EDGE[k] || (RECEIPT_LINE_TONE[k] ? null : OTHER_EDGE);

/** The blaze, w px wide at (x, y): white halo, umber stripe, ink heel. */
function blazeOps(x, y, w) {
  const h = (w * 14) / 24;
  return [
    { t: 'rect', x, y, w, h, r: h * 0.1, fill: 'neutral-0', stroke: 'neutral-600', sw: 1 },
    { t: 'rect', x: x + w * 0.14, y: y + h * 0.2, w: w * 0.72, h: h * 0.36, fill: 'umber-600' },
    { t: 'rect', x: x + w * 0.52, y: y + h * 0.75, w: w * 0.34, h: Math.max(2, h * 0.11), fill: 'neutral-900' },
  ];
}

/** A dotted leader from x1 to x2 on the line at y (a receipt line). */
function leaderOps(x1, x2, y) {
  const out = [];
  for (let x = x1; x <= x2; x += 14) out.push({ t: 'circle', cx: Math.round(x), cy: y, r: 1.8, fill: 'neutral-500' });
  return out;
}

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
  const dates = dateText(model.start, model.end);
  const headH = (dates ? 270 : 230) + (titleLines.length - 1) * 58;
  ops.push({ t: 'rect', x: X0, y: 60, w: W, h: headH, r: 28, fill: 'neutral-50' });
  ops.push({ t: 'rect', x: X0, y: 60 + headH - 40, w: W, h: 40, fill: 'neutral-50' });
  ops.push({ t: 'text', x: L, y: 128, text: t('share.receiptKicker'), size: 24, weight: 700, fill: 'umber-700' });
  titleLines.forEach((line, i) => ops.push({ t: 'text', x: L, y: 186 + i * 58, text: line, size: 50, weight: 800, fill: 'neutral-900' }));
  let y = 186 + (titleLines.length - 1) * 58 + 52;
  const stay = [
    t(model.nights === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n: model.nights }),
    t(model.party === 1 ? 'share.receiptParty1' : 'share.receiptPartyN', { n: model.party }),
  ].join(', ');
  if (dates) {
    ops.push({ t: 'text', x: L, y, text: dates, size: 28, weight: 500, fill: 'neutral-700', date: true });
    y += 40;
  }
  ops.push({
    t: 'text', x: L, y, text: stay, size: 28, weight: 700, fill: 'neutral-700',
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
    const sw = edge(l.key);
    ops.push({ t: 'rect', x: Math.round(x * 10) / 10, y, w: Math.round((last ? R - x : w) * 10) / 10, h: 28, r: 14, fill: tone(l.key), stroke: sw, sw: sw ? 2 : undefined });
    x += w + GAP;
  });

  // The lines.
  y += 28 + 72;
  const step = Math.round(Math.min(84, (dates ? 480 : 520) / Math.max(1, model.lines.length)));
  for (const l of model.lines) {
    const label = t(RECEIPT_LINE_KEY[l.key] || 'plan.lineBetween') + (l.kind === 'yours' ? ` (${t('plan.yours')})` : '');
    // The line's wagon: a pill in its formation colour; a line without a
    // figure is the dashed wagon, outside the sum.
    const missing = l.kind === 'missing';
    ops.push({ t: 'rect', x: L, y: y - 24, w: 30, h: 18, r: 9, fill: missing ? 'none' : tone(l.key), stroke: missing ? 'neutral-500' : edge(l.key), sw: 2, dash: missing ? [5, 4] : undefined });
    ops.push({ t: 'text', x: L + 44, y, text: label, size: 32, weight: 600, fill: 'neutral-900' });
    const lw = Math.min(560, label.length * 15.5);
    if (missing) {
      const nt = t('plan.notIn');
      ops.push(...leaderOps(L + 62 + lw, R - nt.length * 14 - 16, y - 6));
      ops.push({ t: 'text', x: R, y, text: nt, size: 26, weight: 600, fill: 'neutral-700', anchor: 'end' });
    } else {
      const v = Math.round(l.eur);
      const mv = money(v);
      ops.push(...leaderOps(L + 62 + lw, R - mv.length * 20 - 16, y - 6));
      ops.push({ t: 'text', x: R, y, text: mv, size: 34, weight: 800, fill: 'neutral-900', anchor: 'end', fig: { key: `line.${l.key}`, value: v, money: true } });
    }
    y += step;
  }

  // The sum on the total plate (ink, the label in beige, the figure in
  // white, the engine's own total), then a person a day under it.
  y += 8;
  const total = Math.round(model.total);
  ops.push({ t: 'rect', x: L - 8, y, w: R - L + 16, h: 112, r: 12, fill: 'neutral-900' });
  ops.push({
    t: 'text', x: L + 24, y: y + 68, text: t(model.party === 1 ? 'share.receiptTotal1' : 'share.receiptTotalN', { n: model.party }),
    size: 30, weight: 700, fill: 'umber-200', fig: model.party === 1 ? undefined : { key: 'party', value: model.party },
  });
  ops.push({ t: 'text', x: R - 24, y: y + 78, text: money(total), size: 64, weight: 800, fill: 'neutral-0', anchor: 'end', fig: { key: 'total', value: total, money: true } });
  y += 112 + 52;
  const day = Math.round(model.perPersonDay);
  ops.push({ t: 'text', x: L, y, text: t('share.receiptPerDay', { price: money(day) }), size: 28, weight: 700, fill: 'umber-700', fig: { key: 'perPersonDay', value: day, money: true } });

  // The foot: what the figures are, from when, and where to plan one.
  ops.push({ t: 'rect', x: X0, y: 1150, w: W, h: 140, r: 28, fill: 'umber-50' });
  ops.push({ t: 'rect', x: X0, y: 1150, w: W, h: 40, fill: 'umber-50' });
  const note = wrapText(t('share.receiptNote', { date: pricedOn }), 78).slice(0, 2);
  note.forEach((line, i) => ops.push({ t: 'text', x: L, y: 1196 + i * 30, text: line, size: 21, weight: 500, fill: 'neutral-700', date: true }));
  // The wordmark slot: the blaze before the brand line.
  ops.push(...blazeOps(L, 1243, 32));
  ops.push({ t: 'text', x: L + 44, y: 1262, text: t('share.receiptBrand'), size: 22, weight: 700, fill: 'umber-700' });
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
