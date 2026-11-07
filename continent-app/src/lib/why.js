/**
 * why.js, "why this place" (T1208, ROADMAP G9).
 *
 * A chip says why a place fits this traveller, and only with evidence on both
 * sides:
 *   the place   carries a taxonomy node (F1) because of its own listing (its
 *               categories and tags, mapped through the taxonomy) or because
 *               the tagger quoted a sentence for it (tagger format, see
 *               pipeline/taxonomy/tagger.py; not on the wire yet, T1150-d)
 *   you         said Yes to that node (or a broader one) in "Your taste"
 *               (F3, lib/taste/store.js), or picked a like that maps to it
 *
 * No evidence, no chip. A node the traveller said Not me to (or anything
 * under it) never shows. Confidence is said in words, never as a percent:
 * the tagger's score is not a calibrated probability (research in
 * Execution/P15/T1208-trust-visible.md).
 *
 *   score >= STRONG (0.75, the tagger's filter threshold)   'strong'
 *   score >= LIKELY (0.6, the tagger's profile threshold)   'likely'
 *   lower                                                   no chip
 *
 * A listing tag is scored the way the tagger scores a mapped tag: a
 * noisy-OR of MAPPED_WEIGHT over at most two listing values that point at
 * the node, so one value is 0.62 (likely) and two are 0.86 (strong).
 */
import { TAXONOMY } from './taste/taxonomyMap.js';

export const STRONG = 0.75;
export const LIKELY = 0.6;
export const MAPPED_WEIGHT = 0.62;
/** At most this many chips on a card (research: two to three, strongest first). */
export const CARD_MAX = 2;
/** At most this many "known for" chips on the place page. */
export const KNOWN_MAX = 3;

/**
 * Nodes most places carry say nothing about why this one fits: on the
 * 2026-06-07 wire set.heritage is on 70% of places (T1152), and
 * act.sightseeing is what "culture" means for every city. tests/why.test.mjs
 * fails when another node passes half of the catalogue, so the list is
 * kept honest as the data moves.
 */
export const BROAD = Object.freeze(new Set(['set.heritage', 'act.sightseeing']));

const nodes = TAXONOMY.nodes;
const noisyOr = (ws) => 1 - ws.reduce((p, w) => p * (1 - w), 1);
const round = (x) => Math.round(x * 10000) / 10000;

function ancestors(id) {
  const out = [];
  let p = nodes[id]?.parent;
  while (p) { out.push(p); p = nodes[p]?.parent; }
  return out;
}

/** 'strong', 'likely' or null for a score. */
export function confidenceOf(score) {
  if (!(Number(score) >= LIKELY)) return null;
  return score >= STRONG ? 'strong' : 'likely';
}

/**
 * The nodes a place carries, with their evidence and score:
 *   [{ node, score, conf, evidence: [{ kind: 'listing', values[] } | { kind: 'quote', text, src }] }]
 * From the record's categories and tags, plus `tagged` (a tagger item's
 * `tags` list) when the caller holds one. Only nodes at LIKELY or more and
 * with evidence; a node whose narrower node is also there gives way to it.
 */
export function placeTags(record, tagged = null) {
  const by = new Map();
  const add = (node) => {
    if (!by.has(node)) by.set(node, { node, listing: [], quotes: [], tagScore: 0 });
    return by.get(node);
  };
  for (const field of ['categories', 'tags']) {
    const list = Array.isArray(record?.[field]) ? record[field] : [];
    for (const v of list) {
      for (const n of TAXONOMY.sources[field]?.[String(v)] || []) {
        if (!nodes[n]) continue;
        const row = add(n);
        if (!row.listing.includes(v)) row.listing.push(v);
      }
    }
  }
  for (const tg of Array.isArray(tagged) ? tagged : []) {
    if (!tg || !nodes[tg.tag] || tg.implied) continue;
    const quotes = (tg.evidence || []).filter((e) => e && typeof e.text === 'string' && e.match && e.src !== 'tags');
    const hasEv = quotes.length > 0 || (tg.evidence || []).length > 0;
    if (!hasEv) continue;
    const row = add(tg.tag);
    row.tagScore = Math.max(row.tagScore, Number(tg.score) || 0);
    for (const q of quotes.slice(0, 1)) row.quotes.push({ text: q.text, src: q.src });
  }
  const out = [];
  for (const row of by.values()) {
    const mapped = row.listing.length ? noisyOr(Array(Math.min(2, row.listing.length)).fill(MAPPED_WEIGHT)) : 0;
    const score = round(Math.max(mapped, row.tagScore));
    const conf = confidenceOf(score);
    if (!conf) continue;
    const evidence = [];
    if (row.quotes.length) evidence.push({ kind: 'quote', ...row.quotes[0] });
    if (row.listing.length) evidence.push({ kind: 'listing', values: row.listing });
    if (!evidence.length) continue;
    out.push({ node: row.node, score, conf, evidence });
  }
  const here = new Set(out.map((r) => r.node));
  const narrower = (id) => out.some((r) => r.node !== id && ancestors(r.node).includes(id));
  return out
    .filter((r) => !(here.has(r.node) && narrower(r.node)))
    .sort((a, b) => b.score - a.score || (a.node < b.node ? -1 : 1));
}

/**
 * The traveller's side: { yes: Map(node -> 'accepted' | like key), no: Set }.
 * `verdicts` is lib/taste/store.js's { [node]: { v } }, `likes` the taste
 * likes (lib/taste.js). A Yes in "Your taste" outranks a picked like.
 */
export function travellerNodes({ verdicts = {}, likes = [] } = {}) {
  const yes = new Map();
  const no = new Set();
  for (const [node, x] of Object.entries(verdicts || {})) {
    if (!nodes[node]) continue;
    if (x?.v === 'accept') yes.set(node, { kind: 'accepted', node });
    else if (x?.v === 'reject') no.add(node);
  }
  for (const like of Array.isArray(likes) ? likes : []) {
    for (const node of TAXONOMY.sources.likes?.[like] || []) {
      if (nodes[node] && !yes.has(node)) yes.set(node, { kind: 'like', node, like });
    }
  }
  return { yes, no };
}

/**
 * The chips: place tags the traveller has said yes to (the node itself or a
 * broader one), strongest first, each { node, score, conf, evidence, you }.
 * `you` is { kind: 'accepted' | 'like', node, like? }: the traveller's own
 * evidence. Rejected nodes and anything under them never show. A BROAD node
 * matches only when the traveller said Yes to it by name.
 */
export function whyChips(record, traveller, { tagged = null, max = CARD_MAX } = {}) {
  if (!traveller || !traveller.yes?.size) return [];
  const out = [];
  for (const tag of placeTags(record, tagged)) {
    const line = [tag.node, ...ancestors(tag.node)];
    if (line.some((n) => traveller.no.has(n))) continue;
    const hit = line.map((n) => traveller.yes.get(n)).find(Boolean);
    if (!hit) continue;
    if (BROAD.has(tag.node) && !(hit.kind === 'accepted' && hit.node === tag.node)) continue;
    out.push({ ...tag, you: hit });
  }
  out.sort((a, b) => (b.you.kind === 'accepted') - (a.you.kind === 'accepted') || b.score - a.score || (a.node < b.node ? -1 : 1));
  return out.slice(0, max);
}

/**
 * What the place is known for on its page, beyond the chips: its STRONG
 * tags that are not BROAD and not already a chip, at most KNOWN_MAX. Tags
 * the traveller said Not me to stay out.
 */
export function knownFor(record, { tagged = null, skip = [], no = new Set(), max = KNOWN_MAX } = {}) {
  const taken = new Set(skip);
  return placeTags(record, tagged)
    .filter((t) => t.conf === 'strong' && !BROAD.has(t.node) && !taken.has(t.node)
      && ![t.node, ...ancestors(t.node)].some((n) => no.has(n)))
    .slice(0, max);
}

/** A node's label in the locale, English when the taxonomy has none. */
export function whyLabel(node, locale = 'en') {
  const n = nodes[node];
  if (!n) return node;
  return n.label[locale] || n.label.en || node;
}
