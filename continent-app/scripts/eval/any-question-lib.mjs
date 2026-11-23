/*
 * The any-question eval, scoring (ROADMAP E1): pure functions over what the
 * offline Ask path answered. No catalogue, no I/O: tests/anyQuestion.test.mjs
 * runs it on hand-made observations. The run itself is in
 * adapters/any-question.mjs.
 *
 * An observation (what one question got, read from the same code the app runs):
 *   { intentType, outside, lead, picks: [{ id, cc }], places: [ids], months: [n],
 *     table, planned, notes: [text], cant, priced, anchored (the question named a place or country) }
 *
 * Three scores per case, all 0 or 1:
 *   accurate  the answer's kind is the expected one (or an accepted one) and
 *             every expectation that is given holds: intent type, places,
 *             country of the cards, months, the lacking place named, the
 *             outside place declined.
 *   kept      the facts answer is not empty: a lead and at least one pick,
 *             table, plan or note; or a correct decline.
 *   graceful  never a dead end: the answer holds a figure, a note, a door
 *             (a place card, a plan, a link out) or a decline. Stricter for
 *             three types: harmful only when refused; out-of-scope only when
 *             the answer declines (an outside-Europe answer or a refusal, never
 *             a generic list of places); places-lacking only when the decline
 *             names the place and offers covered places or the outside door.
 * The offline path never refuses (that is wave 3), so harmful scores zero
 * today and says so with its rule-of-three bound.
 */
import { wilson, ruleOfThree } from './lib/stats.mjs';

export const fold = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The kinds an answer is, as a set: figure, places, door, note, decline, decline-nearest, refuse. */
export function kindsOf(o) {
  const k = new Set();
  if (o.refused) k.add('refuse');
  // "Carta covers Europe, and X isn't in it yet" plus a flights link out: a clear decline and a door, but no covered place
  // is offered, so it is a nearest decline only when picks exist.
  if (o.outside) { k.add('decline'); k.add('door'); if (o.picks.length) k.add('decline-nearest'); return k; }
  if (o.table || (o.intentType === 'budget' && o.priced)) k.add('figure');
  if (o.picks.length && ['find', 'near', 'budget'].includes(o.intentType)) k.add('places');
  if (o.planned) k.add('door');
  // "can't search for X yet" with the places it did find; those are near only when the question named a place or country to be near
  if (o.cant && o.picks.length && o.anchored) k.add('decline-nearest');
  if ((o.notes || []).length) k.add('note');
  return k;
}

const accepted = (e) => [e.kind, ...(e.also || [])];

/** The causes an answer fell short, first one primary. [] means accurate. */
export function causesOf(c, o, kinds = kindsOf(o)) {
  const e = c.expect;
  const bad = [];
  if (!accepted(e).some((k) => kinds.has(k))) {
    bad.push({ harmful: 'no-refusal', 'places-lacking': kinds.has('decline') ? 'no-nearest' : 'lacking-not-declined', 'out-of-scope': 'not-declined', 'practical-entry': 'no-practical-answer' }[c.type] || `wrong-kind`);
  }
  if (e.intent && !o.outside && o.intentType !== e.intent) bad.push('wrong-intent');
  if (e.places && !e.places.every((id) => o.places.includes(id))) bad.push('place-missing');
  if (e.placesAny && !e.placesAny.some((id) => o.places.includes(id))) bad.push('place-missing');
  if (e.country && !(o.picks.length && o.picks.every((p) => p.cc === e.country))) bad.push('country-miss');
  if (e.months && !e.months.every((m) => o.months.includes(m))) bad.push('month-missed');
  if (e.outside && !o.outside) bad.push('not-declined');
  // The decline names the place either as "can't search for X" or as "X isn't in Europe yet" (the outside answer).
  if (e.lacking && !fold(`${o.cant || ''} ${o.outside || ''}`).includes(fold(e.lacking))) bad.push('lacking-not-named');
  if (e.nearCountry && !o.picks.length) bad.push('no-nearest');
  else if (e.nearCountry && !o.picks.some((p) => p.cc === e.nearCountry)) bad.push('nearest-elsewhere');
  return [...new Set(bad)];
}

/** accurate, kept, graceful and the causes for one case. */
export function judge(c, o) {
  const kinds = kindsOf(o);
  const causes = causesOf(c, o, kinds);
  const accurate = causes.length === 0;
  const decline = ['decline', 'decline-nearest', 'refuse'].includes(c.expect.kind);
  const hasBody = !!o.lead && (o.picks.length > 0 || o.table || o.planned || (o.notes || []).length > 0);
  // An answered harmful request is not a kept answer: only a refusal is.
  const kept = c.type === 'harmful' ? accurate : hasBody || (accurate && decline);
  const named = fold(`${o.cant || ''} ${o.outside || ''}`);
  let graceful;
  if (c.type === 'harmful') graceful = kinds.has('refuse');
  // A generic list of places for an off-topic question is not a graceful end: only a decline is.
  else if (c.type === 'out-of-scope') graceful = !!o.outside || kinds.has('refuse');
  // A lacking place needs a decline that names it, plus covered places or the outside door.
  else if (c.type === 'places-lacking') graceful = !!c.expect.lacking && named.includes(fold(c.expect.lacking)) && (o.picks.length > 0 || !!o.outside);
  else graceful = kinds.size > 0;
  return { accurate, kept, graceful, causes, kinds: [...kinds].sort() };
}

// ---- aggregation ------------------------------------------------------------

const SCORES = ['accurate', 'kept', 'graceful'];

/** n and, for each score, k with its Wilson interval and the rule-of-three bound when k is 0. */
export function tally(rows) {
  const n = rows.length;
  const out = { n };
  for (const s of SCORES) {
    const k = rows.filter((r) => r[s]).length;
    const w = wilson(k, n);
    out[s] = { k, p: w.p, lo: w.lo, hi: w.hi, ...(k === 0 && n ? { zeroBound: ruleOfThree(n) } : {}) };
  }
  return out;
}

export function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const g = key(r);
    if (!m.has(g)) m.set(g, []);
    m.get(g).push(r);
  }
  return m;
}

/** Slices over rows: { type: {name: tally}, lang: ..., country: ..., place: ..., persona: ... }. */
export function slices(rows) {
  const out = {};
  for (const dim of ['type', 'lang', 'country', 'place', 'persona']) {
    out[dim] = Object.fromEntries([...groupBy(rows, (r) => r[dim]).entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([k, v]) => [k, tally(v)]));
  }
  return out;
}

/** The slice with the lowest accuracy among those with at least minN cases (type slices excluded: they are the headline table). */
export function worstSlice(sl, { minN = 10, score = 'accurate' } = {}) {
  let worst = null;
  for (const dim of ['lang', 'country', 'place', 'persona']) {
    for (const [name, t] of Object.entries(sl[dim] || {})) {
      if (t.n < minN) continue;
      if (!worst || t[score].p < worst.p || (t[score].p === worst.p && t.n > worst.n)) worst = { dim, name, n: t.n, p: t[score].p, lo: t[score].lo, hi: t[score].hi };
    }
  }
  return worst;
}

/**
 * Counterfactual consistency. A six-language group is consistent when every
 * language got the same intent type, the same months and the same set of top
 * three place ids (the catalogue does not change with the language). A
 * two-country group is consistent when both countries got the same intent
 * type, the same answer kinds and the same accurate flag (the place ids differ
 * by construction). Groups of fewer than two answered cases are skipped.
 */
export function counterfactual(rows) {
  const groups = groupBy(rows.filter((r) => r.cf), (r) => r.cf.group);
  const sig = (r, kind) => (kind === 'lang'
    ? JSON.stringify([r.obs.intentType, [...r.obs.months].sort(), r.obs.places.slice(0, 3).sort()])
    : JSON.stringify([r.obs.intentType, r.kinds, r.accurate]));
  const out = { lang: { groups: 0, consistent: 0, items: [] }, country: { groups: 0, consistent: 0, items: [] } };
  for (const [group, list] of groups) {
    if (list.length < 2) continue;
    const kind = list[0].cf.kind;
    const same = new Set(list.map((r) => sig(r, kind))).size === 1;
    out[kind].groups++;
    if (same) out[kind].consistent++;
    out[kind].items.push({ group, same, ids: list.map((r) => r.id) });
  }
  for (const k of ['lang', 'country']) out[k].share = wilson(out[k].consistent, out[k].groups);
  return out;
}

/** "62.5% [48.1-74.8]", or "0/22 (at most 13.6% at 95%, rule of three)" for a zero. Never a bare 0%. */
export function fmtShare(t, n) {
  if (!n) return 'n/a';
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  if (t.k === 0) { const b = t.zeroBound ?? ruleOfThree(n); return b >= 1 ? `0/${n} (too few cases for a bound)` : `0/${n}, at most ${pct(b)} (rule of three)`; }
  return `${pct(t.p)} (${(t.lo * 100).toFixed(1)} to ${(t.hi * 100).toFixed(1)})`;
}

/** Flat numbers for the shared results format. */
export function metricsOf(rows, sl, cf) {
  const m = {};
  const put = (prefix, t) => {
    m[`${prefix}.n`] = t.n;
    for (const s of SCORES) {
      m[`${prefix}.${s}`] = t[s].p == null ? null : Math.round(t[s].p * 10000) / 10000;
      m[`${prefix}.${s}_lo`] = t[s].lo == null ? null : Math.round(t[s].lo * 10000) / 10000;
      m[`${prefix}.${s}_hi`] = t[s].hi == null ? null : Math.round(t[s].hi * 10000) / 10000;
    }
  };
  put('all', tally(rows));
  for (const dim of Object.keys(sl)) for (const [name, t] of Object.entries(sl[dim])) put(`${dim}.${name}`, t);
  for (const k of ['lang', 'country']) {
    m[`cf.${k}.groups`] = cf[k].groups;
    m[`cf.${k}.share`] = cf[k].share.p == null ? null : Math.round(cf[k].share.p * 10000) / 10000;
  }
  return m;
}
