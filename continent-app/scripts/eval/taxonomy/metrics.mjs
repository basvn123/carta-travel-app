/*
 * Multi-label tagging metrics for the taxonomy eval (T1149, ROADMAP F1).
 *
 * Input: gold = [{ item_id, labels: [node id] }], predictions = { item_id: [{ tag, score }] }
 * (best first), and the taxonomy as { id: { facet, parent } }.
 *
 * Ranking (the bi-encoder's job, scored on the ranked list):
 *   p_at_5      hits in the top 5 / 5
 *   rp_at_5     hits in the top 5 / min(5, gold count): R-precision at 5, the
 *               ESCO extraction metric (Decorte et al. 2023); an item with 3
 *               gold tags can still score 1
 *   r_at_10     hits in the top 10 / gold count
 *   mrr         1 / rank of the first hit
 * Set (after the threshold: score >= threshold, or every prediction when none):
 *   micro P, R, F1 over all (item, tag) pairs; macro F1 over the tags that
 *   appear in the gold (each tag's F1, averaged); per facet micro F1
 *   lenient_micro_f1  a prediction one step up or down the tree from a gold
 *               tag counts as a hit (parent for child or child for parent)
 * Calibration: ece, expected calibration error of the score as a probability
 *   that the tag is gold, 10 equal-width bins, over every scored prediction.
 * All shares are rounded to 4 places. Items with no gold labels are skipped.
 */

const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const f1 = (p, r) => (p + r > 0 ? (2 * p * r) / (p + r) : 0);

export function neighbours(tax, id) {
  const n = new Set([id]);
  const p = tax[id]?.parent;
  if (p) n.add(p);
  for (const [k, v] of Object.entries(tax)) if (v.parent === id) n.add(k);
  return n;
}

export function score({ gold, predictions, taxonomy, threshold = null }) {
  const items = gold.filter((g) => g.labels && g.labels.length);
  const rank = { p5: [], rp5: [], r10: [], mrr: [] };
  let tp = 0; let fp = 0; let fn = 0; let ltp = 0; let lfp = 0; let lfn = 0;
  const perTag = {};
  const perFacet = {};
  const bins = Array.from({ length: 10 }, () => ({ n: 0, conf: 0, hit: 0 }));
  const bump = (o, k, f) => { o[k] = o[k] || { tp: 0, fp: 0, fn: 0 }; o[k][f] += 1; };
  for (const g of items) {
    const G = new Set(g.labels);
    const ranked = (predictions[g.item_id] || []).map((x) => x.tag);
    const top = (k) => ranked.slice(0, k).filter((t) => G.has(t)).length;
    rank.p5.push(top(5) / 5);
    rank.rp5.push(top(5) / Math.min(5, G.size));
    rank.r10.push(top(10) / G.size);
    const first = ranked.findIndex((t) => G.has(t));
    rank.mrr.push(first < 0 ? 0 : 1 / (first + 1));
    const chosen = (predictions[g.item_id] || []).filter((x) => threshold == null || x.score >= threshold).map((x) => x.tag);
    const S = new Set(chosen);
    for (const t of S) {
      const facet = taxonomy[t]?.facet || 'unknown';
      if (G.has(t)) { tp += 1; bump(perTag, t, 'tp'); bump(perFacet, facet, 'tp'); } else { fp += 1; bump(perTag, t, 'fp'); bump(perFacet, facet, 'fp'); }
    }
    for (const t of G) if (!S.has(t)) { fn += 1; bump(perTag, t, 'fn'); bump(perFacet, taxonomy[t]?.facet || 'unknown', 'fn'); }
    // lenient: one step up or down the tree is a hit
    const near = (t, set) => [...neighbours(taxonomy, t)].some((x) => set.has(x));
    for (const t of S) { if (near(t, G)) ltp += 1; else lfp += 1; }
    for (const t of G) if (!near(t, S)) lfn += 1;
    for (const x of predictions[g.item_id] || []) {
      const s = Math.min(1, Math.max(0, Number(x.score) || 0));
      const b = bins[Math.min(9, Math.floor(s * 10))];
      b.n += 1; b.conf += s; b.hit += G.has(x.tag) ? 1 : 0;
    }
  }
  const P = tp + fp ? tp / (tp + fp) : 0;
  const R = tp + fn ? tp / (tp + fn) : 0;
  const LP = ltp + lfp ? ltp / (ltp + lfp) : 0;
  const LR = ltp + lfn ? ltp / (ltp + lfn) : 0;
  const goldTags = Object.entries(perTag).filter(([, c]) => c.tp + c.fn > 0);
  const macro = mean(goldTags.map(([, c]) => f1(c.tp + c.fp ? c.tp / (c.tp + c.fp) : 0, c.tp / (c.tp + c.fn))));
  const nScored = bins.reduce((s, b) => s + b.n, 0);
  const ece = nScored ? bins.reduce((s, b) => s + (b.n ? (b.n / nScored) * Math.abs(b.conf / b.n - b.hit / b.n) : 0), 0) : null;
  const facet = {};
  for (const [k, c] of Object.entries(perFacet)) {
    const p = c.tp + c.fp ? c.tp / (c.tp + c.fp) : 0;
    const r = c.tp + c.fn ? c.tp / (c.tp + c.fn) : 0;
    facet[k] = r4(f1(p, r));
  }
  const unknown = [...new Set(items.flatMap((g) => g.labels).filter((t) => !taxonomy[t]))];
  return {
    n_items: items.length,
    n_gold_labels: items.reduce((s, g) => s + g.labels.length, 0),
    p_at_5: r4(mean(rank.p5)),
    rp_at_5: r4(mean(rank.rp5)),
    r_at_10: r4(mean(rank.r10)),
    mrr: r4(mean(rank.mrr)),
    micro_precision: r4(P),
    micro_recall: r4(R),
    micro_f1: r4(f1(P, R)),
    macro_f1: r4(macro),
    lenient_micro_f1: r4(f1(LP, LR)),
    ece: r4(ece),
    facet_micro_f1: facet,
    unknown_gold_labels: unknown,
  };
}
