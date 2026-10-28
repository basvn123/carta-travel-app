/**
 * The price lines of a priced trip (trip finder TF1, T792).
 *
 * config/slots.json lists the slots (flight, stay, food, getting around,
 * things to do). Each names an adapter in ./adapters/ that prices it from
 * the engine's quote of the trip (lib/price/trip.js quoteTrip): an adapter
 * reads the quote's parts and asks the engine again for its options, it
 * never prices anything itself. This file turns an adapter's answer into
 * the slot every screen draws:
 *
 *   { id, order, labelKey, owner, eur, eurGroup, pick, options, because, quality }
 *
 *   eur       whole-trip euros for one person, whole euros; null = not
 *             measured (drawn as NotYet, out of every sum, never 0)
 *   eurGroup  the same for the whole party (the foot's group total)
 *   owner     'carta' when question 7 left it to Carta, 'you' when the
 *             traveller chooses it; a 'you' slot still counts at its
 *             typical price, so the total stays honest
 *   quality   live | measured | modelled | missing: stored, never drawn
 *
 * A new row plus an adapter adds a slot to every trip, the receipt and
 * question 7, with no other change: everything downstream walks the list.
 * Pure: no React, no i18n.
 */
import SLOTS from '../../../config/slots.json' with { type: 'json' };
import { flight } from './adapters/flight.js';
import { stay } from './adapters/stay.js';
import { food } from './adapters/food.js';
import { local } from './adapters/local.js';
import { activities } from './adapters/activities.js';

export const QUALITIES = Object.freeze(['live', 'measured', 'modelled', 'missing']);
const STATUSES = new Set(['live', 'notYet']);

function checkRows(rows) {
  const seen = new Set();
  for (const r of rows) {
    if (!r?.id || seen.has(r.id)) throw new Error(`slots.json: duplicate or empty slot id ${r?.id}`);
    if (!STATUSES.has(r.status)) throw new Error(`slots.json: slot ${r.id} has status ${r.status}`);
    if (!r.labelKey || !r.adapter) throw new Error(`slots.json: slot ${r.id} needs a labelKey and an adapter`);
    seen.add(r.id);
  }
  return Object.freeze([...rows].sort((a, b) => a.order - b.order));
}

/** The registry rows, in their order. */
export const SLOT_ROWS = checkRows(SLOTS.slots);

/** The adapters by name. A row naming one that is missing prices as missing. */
export const ADAPTERS = Object.freeze({ flight, stay, food, local, activities });

/** The slot ids question 7 ticks by default: every pickable slot that is live. */
export function defaultPick(rows = SLOT_ROWS) {
  return rows.filter((r) => r.pickable && r.status === 'live').map((r) => r.id);
}

/** Whose pick a slot is: Carta's, or the traveller's (question 7). A slot the
 *  question does not offer stays Carta's; a notYet slot is nobody's pick. */
export function ownerOf(row, pick = defaultPick()) {
  if (row.status === 'notYet') return 'you';
  if (!row.pickable) return 'carta';
  return pick.includes(row.id) ? 'carta' : 'you';
}

const MISSING = Object.freeze({ eurGroup: null, pick: null, options: null, because: null, quality: 'missing' });

/** Whole euros a person from a party figure. */
export const perHead = (eurGroup, head) => (eurGroup == null ? null : Math.round(eurGroup / Math.max(1, head)));

const priced = (o, head) => ({
  ...o, eur: perHead(o.eurGroup, head), eurGroup: o.eurGroup == null ? null : Math.round(o.eurGroup),
});
const withDeltas = (options, eur) => (options
  ? options.map((o) => ({ ...o, delta: o.eur != null && eur != null ? o.eur - eur : null }))
  : null);

/** One adapter answer as a slot. */
function toSlot(row, out, head, owner) {
  const eur = perHead(out.eurGroup, head);
  const options = out.options?.length ? out.options.map((o) => priced(o, head)) : null;
  return {
    id: row.id,
    order: row.order,
    labelKey: row.labelKey,
    owner,
    eur,
    eurGroup: out.eurGroup == null ? null : Math.round(out.eurGroup),
    pick: owner === 'carta' && out.pick ? priced(out.pick, head) : null,
    options: withDeltas(options, eur),
    because: out.because ?? null,
    quality: QUALITIES.includes(out.quality) ? out.quality : 'missing',
  };
}

/**
 * Let each adapter set the planner setting it owns before the trip is
 * quoted (the stay tier, the Lifestyle), so the one quoteTrip call prices
 * Carta's picks.
 */
export function prepareState(state, ctx = {}, { rows = SLOT_ROWS, adapters = ADAPTERS } = {}) {
  return rows.reduce((s, row) => adapters[row.adapter]?.prepare?.(s, ctx, row) || s, state);
}

/**
 * Every slot of one trip, in registry order.
 *
 * input: { trip, quote, state, ctx }
 *   quote  the trip's one quoteTrip result
 *   state  the planner state it priced
 *   ctx    { data, countryInsights, pick, priority, stayTier, noCar, ... }
 */
export function buildSlots(input, { rows = SLOT_ROWS, adapters = ADAPTERS } = {}) {
  const { quote, ctx = {} } = input;
  const head = Math.max(1, quote?.groupSize || 1);
  const pick = Array.isArray(ctx.pick) ? ctx.pick : defaultPick(rows);
  return rows.map((row) => {
    const a = adapters[row.adapter];
    const out = row.status === 'notYet' || !a?.price || !quote ? MISSING : (a.price({ ...input, row }) || MISSING);
    return toSlot(row, out, head, ownerOf(row, pick));
  });
}

/**
 * The slot with one of its options taken instead (a lever, or a swap on the
 * receipt). The option's own engine price becomes the slot's; the deltas
 * are measured from it. An unknown option leaves the slot as it was.
 */
export function chooseOption(slot, optionId) {
  const o = slot?.options?.find((x) => x.id === optionId);
  if (!o || o.eur == null) return slot;
  return {
    ...slot,
    eur: o.eur,
    eurGroup: Math.round(o.eurGroup),
    pick: slot.owner === 'carta' ? { id: o.id, labelKey: o.labelKey, facts: o.facts, eur: o.eur, eurGroup: o.eurGroup } : null,
    options: withDeltas(slot.options, o.eur),
  };
}

/** The trip total: every slot with a figure, whoever owns it. */
export function slotTotals(slots) {
  let perPerson = 0;
  let group = 0;
  for (const s of slots) {
    if (s.eur == null) continue;
    perPerson += s.eur;
    group += s.eurGroup;
  }
  return { perPerson, group };
}
