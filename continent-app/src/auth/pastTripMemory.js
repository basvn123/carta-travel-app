/**
 * pastTripMemory.js, everything about a trip that the trip's own dates and
 * stops cannot hold.
 *
 * A logged past trip is stored twice over. The skeleton (where, when, in what
 * order) goes into the structure the record already reads, a trip plan with
 * stops or a device day plan, so the classifier, the cards and the ledger keep
 * working with no special cases. Everything a memory is actually made of, who
 * came, how you got there, where you slept, what it cost, how it was, and the
 * photographs, goes here, into the trip's extras.
 *
 * Extras were already the right rails: they are keyed by plan id (a trip_plans
 * uuid or a `local:` day plan), they work for guests in localStorage, and they
 * ride to the account through the day_plans payload for anyone signed in. So a
 * trip memory syncs across devices without a single new table.
 *
 * The spend also writes real rows into the trip's expense ledger, tagged
 * `src: 'memory'`, so what you say the trip cost shows up where the app
 * already shows what a trip costs. Re-saving replaces only those rows, never
 * the ones a traveller typed into the ledger by hand.
 */
import { loadTripExtras, persistTripExtras } from '../planner/dayPlanStore.js';
import { readCrew, writeCrew } from './tripCrew.js';
import { toEur } from '../lib/currency.js';

export const MEMORY_VERSION = 1;

/** What a trip cost, split the way the app already prices a trip. */
export const SPEND_CATS = ['flights', 'stay', 'food', 'transport', 'activities', 'other'];

/** How you got between two places. Same vocabulary as the transport engine,
 *  so a logged leg reads like a planned one. */
export const TRIP_MODES = ['fly', 'train', 'bus', 'car', 'ferry', 'bike', 'walk'];

/** Where you slept. `friends` and `own` cost nothing and say so. */
export const STAY_KINDS = ['hotel', 'apartment', 'hostel', 'camping', 'friends', 'own', 'other'];

/** How it was, in one word, kept to a scale that can be averaged later. */
export const MAX_PHOTOS = 8;

export function emptyMemory() {
  return {
    v: MEMORY_VERSION,
    places: [],
    travellers: { adults: 1, children: 0 },
    // Who came. Hydrated from extras.people on load and written back there on
    // save, so it is never stored inside the memory blob itself. See
    // tripCrew.js for why the roster lives in extras rather than here.
    crew: [],
    legs: [],
    spend: { currency: 'EUR' },
    rating: null,
    story: '',
    highlights: [],
    photos: [],
    cover: null,
  };
}

/** Reads a trip's memory, always as a complete shape. Returns null when the
 *  trip has none, which is what separates a logged trip from a lived one. */
export function loadMemory(planId) {
  if (!planId) return null;
  const extras = loadTripExtras(planId);
  const raw = extras?.memory;
  if (!raw || typeof raw !== 'object') return null;
  const base = emptyMemory();
  // `companions` was the old home of who came. readCrew still reads it, for
  // trips filed before the roster moved, so drop it here rather than let two
  // copies of the same list travel together and drift apart.
  const { companions: _legacyCompanions, ...rest } = raw;
  return {
    ...base,
    ...rest,
    travellers: { ...base.travellers, ...(raw.travellers || {}) },
    spend: { ...base.spend, ...(raw.spend || {}) },
    places: Array.isArray(raw.places) ? raw.places : [],
    crew: readCrew(extras, { memory: raw }),
    legs: Array.isArray(raw.legs) ? raw.legs : [],
    highlights: Array.isArray(raw.highlights) ? raw.highlights : [],
    photos: Array.isArray(raw.photos) ? raw.photos : [],
  };
}

/** Does this trip carry a memory at all? */
export function hasMemory(planId) {
  return !!loadMemory(planId);
}

/** Every spend line as euro, so a trip in zloty still adds up next to one in
 *  euro. Returns { total, byCat, currency, foreign }. */
export function spendSummary(memory) {
  const spend = memory?.spend || {};
  const currency = spend.currency || 'EUR';
  const byCat = {};
  let total = 0;
  SPEND_CATS.forEach((cat) => {
    const n = Number(spend[cat]);
    if (!Number.isFinite(n) || n <= 0) return;
    byCat[cat] = n;
    total += toEur(n, currency);
  });
  return { total, byCat, currency, foreign: currency !== 'EUR', any: total > 0 };
}

/** What the trip cost per traveller, which is the number Carta quotes
 *  everywhere else. Null when nothing was entered. */
export function spendPerPerson(memory) {
  const { total, any } = spendSummary(memory);
  if (!any) return null;
  const t = memory?.travellers || {};
  const heads = Math.max(1, (Number(t.adults) || 0) + (Number(t.children) || 0));
  return total / heads;
}

/** The photograph the card wears, if the traveller supplied one. */
export function coverPhoto(memory) {
  if (!memory?.photos?.length) return null;
  const picked = memory.cover && memory.photos.find((p) => p.id === memory.cover);
  return (picked || memory.photos[0]).src || null;
}

/** Ledger rows generated from the spend, one per filled category. Group size
 *  splits them across everyone, which is what the ledger's balances mean. */
function spendAsExpenses(memory, labels) {
  const { byCat, currency } = spendSummary(memory);
  return Object.entries(byCat).map(([cat, amount]) => ({
    id: `memory:${cat}`,
    src: 'memory',
    desc: labels?.[cat] || cat,
    amount,
    currency,
    paidBy: 0,
    sharers: null, // the whole group
  }));
}

/** Writes the memory and rebuilds the ledger rows it owns. `labels` maps a
 *  spend category to its name in the reader's language. */
export function saveMemory(planId, memory, labels) {
  if (!planId) return;
  const extras = loadTripExtras(planId);
  const kept = (extras.expenses || []).filter((x) => x.src !== 'memory');
  // The roster goes to extras.people, the one list the ledger also splits by,
  // and is stripped from the blob so there is exactly one copy of it on disk.
  const { crew, companions: _legacyCompanions, ...blob } = memory;
  persistTripExtras(planId, {
    ...writeCrew(extras, crew),
    memory: { ...blob, v: MEMORY_VERSION },
    expenses: [...kept, ...spendAsExpenses(memory, labels)],
  });
}

/** Drops a trip's memory when the trip itself is removed. */
export function clearMemory(planId) {
  if (!planId) return;
  const extras = loadTripExtras(planId);
  if (!extras.memory) return;
  const next = { ...extras, expenses: (extras.expenses || []).filter((x) => x.src !== 'memory') };
  delete next.memory;
  persistTripExtras(planId, next);
}

/** Places with real coordinates, for the record's map. A town Carta has never
 *  catalogued still pins, because the form geocoded it when it was typed. */
export function memoryPoints(memory) {
  return (memory?.places || [])
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p) => ({ id: p.id || null, city: p.city, country: p.country || '', lat: p.lat, lon: p.lon }));
}

/** How many nights each place got, summing to the trip's own length. */
export function totalNights(memory) {
  return (memory?.places || []).reduce((n, p) => n + (Number(p.nights) || 0), 0);
}
