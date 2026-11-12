/*
 * Adapter: the taxonomy tagging eval (T1149, ROADMAP F1) in the shared results format.
 *
 * Gold: scripts/eval/taxonomy/gold.csv, the 400-item template the owner fills
 * (docs/ai/taxonomy-labelling-guide.md). Until it holds labels the eval scores
 * the 15-item seed set, seed-gold.csv, which the T1149 session labelled to
 * prove the eval runs; its numbers say nothing about quality.
 * Predictions: --predictions <file> (the T1150 tagger's output, format below),
 * or by default the "today's tags" baseline: every tag Carta already holds,
 * mapped through pipeline/taxonomy/mapping.yaml (pipeline/taxonomy/taxonomy.py).
 *
 *   predictions file: { "name": "...", "threshold": 0.5 | null, "cost_eur_per_1000": 0.12 | null,
 *                       "items": { "<item_id>": [{ "tag": "set.lake", "score": 0.91 }, ...] } }
 *
 * Scope: nodes with source "data" are left out of gold and predictions (set by rule, not tagged).
 * The gate: every gold label is a taxonomy id, the taxonomy and mapping are
 * valid, and the eval runs. The scores are not gated: there is no owner gold
 * yet and no tagger. T1150 sets the score gate once both exist (T1149-c).
 * No model is called.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeResult } from '../lib/results.mjs';
import { runPython } from './python.mjs';
import { score } from '../taxonomy/metrics.mjs';

export const id = 'taxonomy';
export const title = 'Taxonomy tagging (P@5, F1)';

export async function run({ predictions = null } = {}) {
  const d = runPython(`
import json, sys
sys.path.insert(0, 'pipeline/taxonomy')
import taxonomy as t, tag_sources as s, build_label_template as b
from pathlib import Path
problems = t.validate() + t.mapping_problems(s.collect())
gold_rows = [r for r in b.read() if (r.get('labels') or '').strip()]
seed = not gold_rows
rows = b.read(Path('continent-app/scripts/eval/taxonomy/seed-gold.csv')) if seed else gold_rows
items = [{'item_id': r['item_id'], 'layer': r['layer'], 'country': r['country'], 'kind': r['kind'],
          'labels': [x.strip() for x in r['labels'].split(';') if x.strip()]} for r in rows]
tax = {n['id']: {'facet': n['facet'], 'parent': n['parent'], 'source': n['source']} for n in t.load()['nodes']}
print(json.dumps({'problems': problems, 'seed': seed, 'template_rows': len(b.read()), 'items': items, 'taxonomy': tax,
                  'version': t.load()['version'], 'summary': t.summary(),
                  'baseline': t.baseline_predictions(items)}))
`);
  let pred = { name: 'baseline: today\'s tags mapped (pipeline/taxonomy/mapping.yaml)', threshold: null, cost_eur_per_1000: 0, items: d.baseline };
  if (predictions) pred = JSON.parse(readFileSync(resolve(predictions), 'utf8'));
  // Nodes with source "data" are set by rule from a data field (trail grade, Blue Flag), never by the
  // tagger, so they are left out of both sides; tags that are not taxonomy ids stay in, to be caught.
  const scored = (t) => d.taxonomy[t]?.source !== 'data';
  const gold = d.items.map((g) => ({ ...g, labels: g.labels.filter(scored) }));
  const items = Object.fromEntries(Object.entries(pred.items || {}).map(([k, v]) => [k, v.filter((x) => scored(x.tag))]));
  const m = score({ gold, predictions: items, taxonomy: d.taxonomy, threshold: pred.threshold ?? null });
  const failures = [];
  for (const p of d.problems.slice(0, 20)) failures.push({ key: 'taxonomy', was: null, now: null, why: p });
  if (m.unknown_gold_labels.length) failures.push({ key: 'gold.unknown_labels', was: 0, now: m.unknown_gold_labels.length, why: `gold labels that are not taxonomy ids: ${m.unknown_gold_labels.join(', ')}` });
  if (!m.n_items) failures.push({ key: 'gold.n_items', was: null, now: 0, why: 'no labelled item to score' });
  const notes = [
    d.seed
      ? `Scored on the ${m.n_items}-item seed set (seed-gold.csv, labelled by the T1149 session): the eval runs, the numbers mean nothing until the owner fills gold.csv (${d.template_rows} rows, T1149-a).`
      : `Scored on ${m.n_items} owner-labelled items of gold.csv.`,
    `Predictions: ${pred.name}${pred.threshold != null ? `, threshold ${pred.threshold}` : ', every prediction counts as chosen'}.`,
  ];
  return makeResult({
    eval: id,
    title,
    kind: 'classification',
    status: failures.length ? 'fail' : 'pass',
    gated: true,
    headline: { key: 'rp_at_5', value: m.rp_at_5 ?? 0, label: 'R-precision at 5 (P@5 capped at the gold count)', higher_is_better: true },
    metrics: {
      p_at_5: m.p_at_5, rp_at_5: m.rp_at_5, r_at_10: m.r_at_10, mrr: m.mrr,
      micro_precision: m.micro_precision, micro_recall: m.micro_recall, micro_f1: m.micro_f1,
      macro_f1: m.macro_f1, lenient_micro_f1: m.lenient_micro_f1, ece: m.ece,
      ...Object.fromEntries(Object.entries(m.facet_micro_f1).map(([k, v]) => [`facet_f1.${k}`, v])),
      n_items: m.n_items, n_gold_labels: m.n_gold_labels,
      cost_eur_per_1000: pred.cost_eur_per_1000 ?? null,
      'taxonomy.nodes': d.summary.nodes,
      'taxonomy.six_language_labels': d.summary.labelled_six_languages,
    },
    gate: { ok: !failures.length, rule: 'taxonomy and mapping valid, every gold label a taxonomy id, at least one item scored (scores not gated yet)', tolerance: null, baseline: null, failures },
    cases: null,
    inputs: { taxonomy_version: d.version, gold: d.seed ? 'continent-app/scripts/eval/taxonomy/seed-gold.csv' : 'continent-app/scripts/eval/taxonomy/gold.csv', predictions: predictions || 'baseline' },
    notes,
  });
}
