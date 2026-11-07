/**
 * The taste profile with validation (T1152, ROADMAP F3, HANDBOOK "Taste
 * profile with validation").
 *
 * From the traveller's own saves, trips and filters, which interests in the
 * Carta travel taxonomy (T1149, five facets) they keep coming back to, each
 * with the evidence behind it, so the traveller can say yes or no to it.
 * Pure: every input is an argument, so the node test runs it on fixtures.
 *
 * SCORING (research in Execution/P15/T1152-taste-profile.md):
 *   - every evidence item (a saved place, a trip, a filter) carries the nodes
 *     its tags map to (taxonomyMap.js, from pipeline/taxonomy/mapping.yaml);
 *   - an item weighs W[kind] times 0.5^(age / half life): a trip 3, a saved
 *     place 1, a filter 0.5; half life 180 days for saves and trips, 30 for
 *     filters; an item with no date counts as new;
 *   - E_t is the weight of the items carrying node t, E the weight of all;
 *   - the lift against the catalogue, smoothed so one or two items cannot
 *     swing it: lift = ((E_t + ALPHA * p_t) / (E + ALPHA)) / p_t, where p_t is
 *     the share of catalogue places carrying t;
 *   - ROLL-UP (T1215, T1152-e): an item also lends ROLLUP_SHARE (0.5) of its
 *     weight to each parent of its nodes, compounding per level up (the
 *     facet root never scores); the catalogue base rate rolls up the same
 *     way; a rejected node never lifts its parents; a parent's items say
 *     through which child they came;
 *   - a node becomes a chip when lift >= 1.5, E_t >= 2 and it rests on at
 *     least 3 distinct items (2 when one of them is a trip).
 * VALIDATION: an accepted chip stays shown while any evidence remains; a
 * rejected chip is hidden and listed under "Hidden", and its descendants are
 * hidden too unless their own evidence is twice the bar. A rejection is a
 * negative weight (tasteWeights), not a ban: nothing else is filtered by it.
 */
import { TAXONOMY } from './taxonomyMap.js';

export const WEIGHT = Object.freeze({ trip: 3, save: 1, filter: 0.5 });
export const HALF_LIFE_DAYS = Object.freeze({ trip: 180, save: 180, filter: 30 });
export const ALPHA = 3;
export const MIN_LIFT = 1.5;
export const MIN_EVIDENCE = 2;
export const MIN_ITEMS = 3;
export const MIN_ITEMS_WITH_TRIP = 2;
export const SHOWN = 6;
export const SHOWN_MAX = 12;
export const PER_FACET = 2;
export const REJECT_WEIGHT = -3;
export const ACCEPT_WEIGHT = 1;
/** The share of a child's evidence its parent takes, per level up (T1215). */
export const ROLLUP_SHARE = 0.5;
const DAY_MS = 86400000;
const FACETS = ['activity', 'setting', 'vibe', 'traveller', 'practical'];

const uniq = (list) => [...new Set(list)];
const toMs = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Date.parse(v || '');
  return Number.isFinite(n) ? n : null;
};

/** The nodes one vocabulary value means, or []. */
export function nodesOf(source, value) {
  return TAXONOMY.sources[source]?.[String(value)] || [];
}

/** The nodes a destination's own tags mean (its categories and tags). */
export function nodesOfDestination(d) {
  if (!d) return [];
  return uniq([
    ...(Array.isArray(d.categories) ? d.categories : []).flatMap((c) => nodesOf('categories', c)),
    ...(Array.isArray(d.tags) ? d.tags : []).flatMap((c) => nodesOf('tags', c)),
  ]);
}

/** A node's label in the locale, English when the taxonomy has none yet. */
export function nodeLabel(id, locale = 'en') {
  const n = TAXONOMY.nodes[id];
  if (!n) return id;
  return n.label[locale] || n.label.en || id;
}

export const nodeFacet = (id) => TAXONOMY.nodes[id]?.facet || null;
export const isNode = (id) => !!TAXONOMY.nodes[id];

function ancestors(id) {
  const out = [];
  let p = TAXONOMY.nodes[id]?.parent;
  while (p) { out.push(p); p = TAXONOMY.nodes[p]?.parent; }
  return out;
}

/**
 * The share of catalogue places that carry each node: the base rate a
 * traveller's evidence is compared with. `destinations` is app_data's map.
 */
export function baseRates(destinations) {
  const list = Object.values(destinations || {});
  const counts = new Map();
  const rolledSum = new Map();
  for (const d of list) {
    const direct = nodesOfDestination(d);
    for (const n of direct) counts.set(n, (counts.get(n) || 0) + 1);
    // The catalogue rolls up the same way the evidence does (T1215), so a
    // parent's lift compares like with like.
    for (const [n, x] of rollUp(direct.map((m) => [m, 1]))) rolledSum.set(n, (rolledSum.get(n) || 0) + x.w);
  }
  const total = list.length || 1;
  const rates = new Map();
  for (const [n, c] of counts) rates.set(n, c / total);
  const rolled = new Map();
  for (const [n, c] of rolledSum) rolled.set(n, c / total);
  return { rates, rolled, total };
}

/**
 * The weight each node gets from one item's own nodes, with the roll-up
 * (T1215, T1152-e): a node keeps its weight, each ancestor below the facet
 * root takes ROLLUP_SHARE of it per level up, and a node met twice keeps
 * the larger weight. A rejected node never lifts what is above it, and the
 * climb stops at a rejected ancestor too. `pairs` is [[node, weight]].
 */
function rollUp(pairs, rejected = null) {
  const out = new Map();
  const put = (n, w, via) => {
    const had = out.get(n);
    if (!had || w > had.w) out.set(n, { w, via });
  };
  for (const [n, w] of pairs) put(n, w, null);
  for (const [n, w] of pairs) {
    if (rejected?.has(n)) continue;
    let cur = n;
    let share = w;
    for (;;) {
      const p = TAXONOMY.nodes[cur]?.parent;
      if (!p || !TAXONOMY.nodes[p] || TAXONOMY.nodes[p].level === 0) break;
      share *= ROLLUP_SHARE;
      put(p, share, n);
      if (rejected?.has(p)) break;
      cur = p;
    }
  }
  for (const n of [...out.keys()]) if (!isNode(n)) out.delete(n);
  return out;
}

/** The base rate of a node (rolled up); one place in the catalogue when none carries it (a filter-only node). */
const rateOf = (base, id) => (base.rolled || base.rates).get(id) || 1 / (base.total + 1);

/**
 * The evidence items from what the traveller made. Each item:
 *   { key, kind: 'save' | 'trip' | 'filter', name, at (ms or null), nodes[] }
 * Inputs:
 *   saves    [{ key, kind, id, name }] the shortlist (dest, trail, beach, lake, mountain, cycle)
 *   trips    [{ id, name, at, destIds[] }] account trips, trips in progress, kept trips
 *   filters  { likes[], tripKinds[] } the taste likes and Explore trip kinds chosen
 */
export function evidenceItems({ saves = [], trips = [], filters = {}, destinations = {} } = {}) {
  const items = [];
  const seen = new Set();
  for (const s of saves) {
    if (!s || seen.has(`save:${s.key}`)) continue;
    const nodes = s.kind === 'dest' ? nodesOfDestination(destinations[s.id]) : (TAXONOMY.favKinds[s.kind] || []);
    if (!nodes.length) continue;
    seen.add(`save:${s.key}`);
    items.push({ key: `save:${s.key}`, kind: 'save', name: s.name || destinations[s.id]?.city || '', at: toMs(s.at), nodes });
  }
  for (const t of trips) {
    if (!t || seen.has(`trip:${t.id}`)) continue;
    const nodes = uniq((t.destIds || []).flatMap((id) => nodesOfDestination(destinations[id])));
    if (!nodes.length) continue;
    seen.add(`trip:${t.id}`);
    const name = t.name || uniq((t.destIds || []).map((id) => destinations[id]?.city).filter(Boolean)).slice(0, 2).join(', ');
    items.push({ key: `trip:${t.id}`, kind: 'trip', name, at: toMs(t.at), nodes });
  }
  const filterRows = [
    ...(filters.likes || []).map((v) => ['likes', v]),
    ...(filters.tripKinds || []).map((v) => ['tripKinds', v]),
  ];
  for (const [src, v] of filterRows) {
    const nodes = nodesOf(src, v);
    const key = `filter:${src}:${v}`;
    if (!nodes.length || seen.has(key)) continue;
    seen.add(key);
    items.push({ key, kind: 'filter', name: '', at: toMs(filters.at), nodes });
  }
  return items;
}

const weightOf = (item, now) => {
  const w = WEIGHT[item.kind] || 0;
  if (item.at == null) return w;
  const age = Math.max(0, (now - item.at) / DAY_MS);
  return w * 0.5 ** (age / HALF_LIFE_DAYS[item.kind]);
};

/**
 * Score every node the items reach, their own and, rolled up, their parents.
 * Returns Map(node -> { node, facet, e, lift, items[], via }), where `via`
 * maps an item key to the child node it came up through (absent when the
 * item carries the node itself). `verdicts` keeps a rejected node from
 * lifting its parents.
 */
export function scoreNodes(items, base, { now = Date.now(), verdicts = {} } = {}) {
  const rejected = new Set(Object.keys(verdicts).filter((k) => verdicts[k]?.v === 'reject'));
  const per = new Map();
  let E = 0;
  for (const it of items) {
    const w = weightOf(it, now);
    E += w;
    for (const [n, x] of rollUp(it.nodes.map((m) => [m, w]), rejected)) {
      const row = per.get(n) || { node: n, facet: nodeFacet(n), e: 0, items: [], via: {} };
      row.e += x.w;
      row.items.push(it);
      if (x.via) row.via[it.key] = x.via;
      per.set(n, row);
    }
  }
  for (const row of per.values()) {
    const p = rateOf(base, row.node);
    row.lift = ((row.e + ALPHA * p) / (E + ALPHA)) / p;
  }
  return per;
}

/** True when a scored node clears the bar (factor 2 is the bar under a rejected ancestor). */
export function clears(row, factor = 1) {
  if (!row) return false;
  const trips = row.items.filter((i) => i.kind === 'trip').length;
  const need = trips ? MIN_ITEMS_WITH_TRIP : MIN_ITEMS;
  return row.lift >= MIN_LIFT && row.e >= MIN_EVIDENCE * factor && row.items.length >= need * factor;
}

/**
 * The evidence of one chip, counted by kind, with up to three names (trips
 * first), and `all`: every item behind it in the same order, each
 * { key, kind, name, via } (T1215, T1152-e), for the chip opened up.
 */
export function evidenceOf(row) {
  const by = { save: 0, trip: 0, filter: 0 };
  for (const i of row.items) by[i.kind] += 1;
  const sorted = [...row.items].sort((a, b) => (WEIGHT[b.kind] - WEIGHT[a.kind]) || ((b.at || 0) - (a.at || 0)));
  const names = uniq(sorted.map((i) => i.name).filter(Boolean));
  const all = sorted.map((i) => ({ key: i.key, kind: i.kind, name: i.name || '', via: row.via?.[i.key] || null }));
  return { saves: by.save, trips: by.trip, filters: by.filter, names: names.slice(0, 3), more: Math.max(0, names.length - 3), all };
}

/**
 * The profile the chips draw: shown chips (at most SHOWN, or SHOWN_MAX when
 * opened up, at most PER_FACET per facet), the ones held back, and the
 * hidden (rejected) ones. `verdicts` is { [node]: { v: 'accept' | 'reject', at } }.
 * Ties break on the node id, so the order is stable between loads.
 */
export function buildProfile({ items, base, verdicts = {}, now = Date.now(), all = false }) {
  const scored = scoreNodes(items, base, { now, verdicts });
  const rejected = new Set(Object.keys(verdicts).filter((k) => verdicts[k]?.v === 'reject'));
  const candidates = [];
  const hidden = [];
  for (const row of scored.values()) {
    const v = verdicts[row.node]?.v || null;
    if (v === 'reject') { hidden.push({ ...row, verdict: 'reject', evidence: evidenceOf(row) }); continue; }
    const underRejected = ancestors(row.node).some((a) => rejected.has(a));
    const ok = v === 'accept' ? row.items.length > 0 : clears(row, underRejected ? 2 : 1);
    if (ok) candidates.push({ ...row, verdict: v, evidence: evidenceOf(row) });
  }
  // Rejected nodes with no evidence left still show under Hidden, so a
  // traveller can always take a rejection back.
  for (const node of rejected) {
    if (!scored.has(node) && isNode(node)) {
      hidden.push({ node, facet: nodeFacet(node), e: 0, lift: 0, items: [], verdict: 'reject', evidence: { saves: 0, trips: 0, filters: 0, names: [], more: 0, all: [] } });
    }
  }
  // A node and its own ancestor on the same evidence say the same thing:
  // keep the more specific one unless the ancestor rests on more items.
  const kept = candidates.filter((c) => !candidates.some((d) => d !== c
    && ancestors(d.node).includes(c.node) && d.items.length >= c.items.length && c.verdict !== 'accept'));
  kept.sort((a, b) => (b.verdict === 'accept') - (a.verdict === 'accept') || b.lift * b.e - a.lift * a.e || (a.node < b.node ? -1 : 1));
  const cap = all ? SHOWN_MAX : SHOWN;
  const perFacet = Object.fromEntries(FACETS.map((f) => [f, 0]));
  const shown = [];
  const held = [];
  for (const c of kept) {
    if (shown.length < cap && (perFacet[c.facet] ?? 0) < PER_FACET) {
      shown.push(c);
      perFacet[c.facet] = (perFacet[c.facet] ?? 0) + 1;
    } else held.push(c);
  }
  // With room left after the per-facet cap, fill it in score order.
  while (shown.length < cap && held.length) shown.push(held.shift());
  hidden.sort((a, b) => (a.node < b.node ? -1 : 1));
  return { shown, held, hidden, itemCount: items.length };
}

/**
 * The weights a ranker can read: +1 for an accepted node, -3 for a rejected
 * one (a negative, never a filter). Shape { [node]: weight }.
 */
export function tasteWeights(verdicts = {}) {
  const out = {};
  for (const [node, x] of Object.entries(verdicts)) {
    if (!isNode(node)) continue;
    if (x?.v === 'accept') out[node] = ACCEPT_WEIGHT;
    else if (x?.v === 'reject') out[node] = REJECT_WEIGHT;
  }
  return out;
}

/**
 * For a ranker (T1215, T1152-c): a function from a destination to its taste
 * lean, the sum of the weights the place meets. Each node the place carries
 * meets the nearest weighted node on its own path (itself, then its
 * ancestors), so an accepted "wine" under a rejected "food and drink" reads
 * as the acceptance; every weighted node counts once per place. Null when
 * there are no weights, so a ranker can skip the work.
 */
export function tasteLeanOf(weights = {}) {
  if (!Object.keys(weights).length) return null;
  return (d) => {
    const met = new Set();
    for (const n of nodesOfDestination(d)) {
      const hit = [n, ...ancestors(n)].find((m) => weights[m] != null);
      if (hit) met.add(hit);
    }
    let s = 0;
    for (const m of met) s += weights[m];
    return s;
  };
}

/** The position bucket a chip's tick carries: 1 (places 1 to 3), 2 (4 to 6), 3 (7 on). */
export const positionBucket = (index) => (index < 3 ? 1 : index < 6 ? 2 : 3);

/** A small, export-friendly copy of the profile (what the account keeps). */
export function profileSnapshot(profile, now = Date.now()) {
  return {
    v: 1,
    taxonomy: TAXONOMY.version,
    at: new Date(now).toISOString(),
    chips: profile.shown.map((c) => ({
      node: c.node, facet: c.facet, verdict: c.verdict || null,
      evidence: { saves: c.evidence.saves, trips: c.evidence.trips, filters: c.evidence.filters },
      lift: Math.round(c.lift * 100) / 100,
    })),
  };
}
