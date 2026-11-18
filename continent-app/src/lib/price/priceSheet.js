// The price sheet's choices, pure (D10, explore polish decision step 6).
// The sheet opens from the row figure and from each wagon; what it says on
// each tab and where its button leads are decided here, so a node test can
// pin the honesty rules (copy.md sections 2 to 6) without a browser.

import { rowFigures } from './rowFigures.js';

export const TABS = ['flight', 'stay', 'food', 'in'];

const GROUND = new Set(['train', 'bus', 'car']);

/** The tab a tapped part opens on: the figure explains itself on "In this price". */
export function tabForPart(part) {
  if (part === 'way') return 'flight';
  if (part === 'bed') return 'stay';
  if (part === 'food') return 'food';
  return 'in';
}

/** The first tab's label key: the row's own way when it goes over ground,
 *  since a "Flight" tab over a train fare would be a false heading. */
export function wayTabKey(cost) {
  const mode = cost?.way?.mode;
  return GROUND.has(mode) ? `way.${mode}` : 'price.tabFlight';
}

export const isGroundWay = (cost) => GROUND.has(cost?.way?.mode);

/**
 * Where each tab's button hands over: getting there and the whole day lead
 * to the Trip dock at From; bed, food and the ground way to the Style Studio
 * at the step that moves that number (Style Studio, G12: the studio is the
 * one place a style is edited).
 */
export function handoff(tab, cost = null) {
  if (tab === 'stay') return { studio: 'spend', key: 'price.changeStay' };
  if (tab === 'food') return { studio: 'spend', key: 'price.changeFood' };
  if (tab === 'flight' && isGroundWay(cost)) return { studio: 'way', key: 'price.changeWay' };
  if (tab === 'flight') return { dock: 'trip', focus: 'from', key: 'price.changeFlight' };
  return { dock: 'trip', focus: 'from', key: 'price.changeTrip' };
}

const bedLine = (cost) => (cost?.lines || []).find((l) => l.key === 'bed') || null;

/** The Stay basis (copy.md 4): measured here, few stays, or estimated wider. */
export function stayBasisKey(cost) {
  const line = bedLine(cost);
  if (cost?.stayLevel !== 'city' || line?.provenance?.repaired) return 'price.stay.basisWide';
  if (line?.thin) return 'price.stay.basisThin';
  return capturedMonth(cost) ? 'price.stay.basisLocal' : 'price.stay.basisLocalNoDate';
}

/** 'YYYY-MM' the bed prices were captured, when the row knows it. */
export function capturedMonth(cost) {
  const c = bedLine(cost)?.provenance?.captured;
  const m = typeof c === 'string' ? /^(\d{4})-(\d{2})/.exec(c) : null;
  return m ? `${m[1]}-${m[2]}` : null;
}

/** The Food basis (copy.md 5): local prices, or the country's. */
export function foodBasisKey(cost) {
  return cost?.foodLevel === 'city' ? 'price.food.basisLocal' : 'price.food.basisCountry';
}

/**
 * "In this price" (copy.md 6, decision change 4): bed, food, the day they
 * make, then local transport, then getting there kept apart. Amounts are
 * the row's own (rowFigures), so the sheet and the row cannot disagree.
 * `eur` null means the data has no figure: the sheet says so in words.
 */
export function inPriceRows(cost, { group = false, seats = 1, wayEur = null } = {}) {
  const f = rowFigures(cost, { group, seats });
  const tr = (cost?.lines || []).find((l) => l.key === 'transport');
  // Only a fare the engine put in the day counts; anything else is not yet
  // measured, never a zero.
  const trEur = tr && tr.status === 'included' && Number.isFinite(tr.eur) ? tr.eur * f.seats : null;
  const mode = cost?.way?.mode || 'plane';
  return [
    { key: 'bed', eur: f.bed },
    { key: 'food', eur: f.food },
    { key: 'sum', eur: f.day },
    { key: 'transport', eur: trEur },
    { key: 'way', eur: Number.isFinite(wayEur) && wayEur > 0 ? wayEur : null, mode, apart: true },
  ];
}
