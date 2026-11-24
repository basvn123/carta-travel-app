/*
 * The region probe (ROADMAP E7, E1; wave 3b of the ai fix program): ordinary questions naming a
 * region Carta covers must be answered, never declined as a place Carta lacks, called outside Europe
 * or refused. The set is evals/any-question/regions.json, written before scope.js was fixed.
 * One function, probe(), scores it through the same observe() the any-question eval uses, so the
 * probe, the eval and the chat share askScope. tests/askScope.test.mjs runs it when the catalogue
 * is there; `node scripts/eval/regions-probe.mjs <out.json>` writes the numbers. No model is called.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogueAvailable, offlineKit } from './ask-eval.mjs';
import { observe } from './adapters/any-question.mjs';
import { wilson, ruleOfThree } from './lib/stats.mjs';
import { REPO } from './lib/results.mjs';

export const REGIONS_PATH = join(REPO, 'evals', 'any-question', 'regions.json');
export const THRESHOLD = 0.02; // false lacking on the ordinary questions, at most

const share = (k, n) => ({ ...wilson(k, n), ruleOfThree: k === 0 ? ruleOfThree(n) : null });

/** Score the probe: { ordinary, lacking, outside, judge10 } each with the failing questions listed. */
export async function probe({ file = REGIONS_PATH } = {}) {
  const set = JSON.parse(readFileSync(file, 'utf8'));
  const kit = await offlineKit();
  const today = new Date('2026-11-22T12:00:00');
  const seen = (c) => observe({ ...c, id: c.q }, kit, today).obs;
  const out = {};
  for (const key of ['ordinary', 'judge10', 'heldout']) {
    if (!set[key]) continue;
    const falseLacking = [];
    const falseOutside = [];
    const falseRefusal = [];
    for (const c of set[key]) {
      const o = seen(c);
      if (o.lacking) falseLacking.push({ q: c.q, place: o.lacking, nearest: o.places });
      else if (o.outside) falseOutside.push({ q: c.q, place: o.outside });
      else if (o.refused || o.offtopic) falseRefusal.push({ q: c.q, kind: o.refused ? 'refuse' : 'offtopic' });
    }
    const n = set[key].length;
    out[key] = { n, falseLacking: share(falseLacking.length, n), falseOutside: share(falseOutside.length, n), falseRefusal: share(falseRefusal.length, n), fails: { falseLacking, falseOutside, falseRefusal } };
  }
  const miss = (key, field) => {
    const wrong = set[key].filter((c) => !seen(c)[field]);
    return { n: set[key].length, ok: share(set[key].length - wrong.length, set[key].length), wrong: wrong.map((c) => ({ q: c.q, got: seen(c) })).map((x) => ({ q: x.q, lacking: x.got.lacking, outside: x.got.outside })) };
  };
  out.lacking = miss('lacking', 'lacking');
  out.outside = miss('outside', 'outside');
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  if (!catalogueAvailable()) { console.error('no catalogue: set CARTA_PUBLIC'); process.exit(2); }
  const r = await probe();
  const f = (s) => `${s.k} of ${s.n} (${(s.lo * 100).toFixed(1)} to ${(s.hi * 100).toFixed(1)}%)`;
  console.log(`ordinary ${r.ordinary.n}: false lacking ${f(r.ordinary.falseLacking)}, false outside ${f(r.ordinary.falseOutside)}, false refusal ${f(r.ordinary.falseRefusal)}`);
  console.log(`judge10: false lacking ${f(r.judge10.falseLacking)}, false outside ${f(r.judge10.falseOutside)}, false refusal ${f(r.judge10.falseRefusal)}`);
  if (r.heldout) console.log(`heldout (judge set) ${r.heldout.n}: false lacking ${f(r.heldout.falseLacking)}, false outside ${f(r.heldout.falseOutside)}, false refusal ${f(r.heldout.falseRefusal)}`);
  console.log(`lacking still lacking ${f(r.lacking.ok)}; outside still outside ${f(r.outside.ok)}`);
  for (const k of ['ordinary', 'judge10', 'heldout']) if (r[k]) for (const [kind, list] of Object.entries(r[k].fails)) for (const x of list) console.log(`  ${k} ${kind}: ${x.q} -> ${JSON.stringify(x)}`);
  for (const k of ['lacking', 'outside']) for (const x of r[k].wrong) console.log(`  ${k} wrong: ${JSON.stringify(x)}`);
  if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify(r, null, 2)}\n`);
}
