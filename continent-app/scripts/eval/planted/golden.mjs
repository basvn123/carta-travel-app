/*
 * The frozen plants (tests/fixtures/plantedGolden.json) and the hand plants,
 * scored against one verifier module (ROADMAP E1, wave 4). No catalogue, no
 * model: CI runs this. A CLI prints one verifier's table:
 *
 *   node scripts/eval/planted/golden.mjs before|after [out.json]
 *
 * "before" is the frozen copy of the old verify.js (tests/fixtures/verifyBefore.mjs).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scorePlants } from './score.mjs';
import { handPlants, reversedProbes } from './hand.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const GOLDEN_PATH = join(here, '..', '..', '..', 'tests', 'fixtures', 'plantedGolden.json');

let cached = null;
export function loadGolden() {
  cached ||= JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
  return cached;
}

/** Score the frozen plants and the hand plants with `verify` ({ makeChecker, splitSentences }). */
export function scoreGolden(verify, opts, { packLimit = null } = {}) {
  const g = loadGolden();
  // packLimit: the first N packs only (a quick run for unit tests; CI's eval scores all).
  const keep = packLimit ? new Set(Object.keys(g.packs).slice(0, packLimit)) : null;
  const plants = keep ? g.plants.filter((p) => keep.has(p.pack)) : g.plants;
  const generated = scorePlants(plants, (p) => g.packs[p.pack].pack, g.knownPlaces, verify, opts);
  const hand = scorePlants(handPlants(), (p) => p.pack, g.knownPlaces, verify, opts);
  // The reversed comparisons: expected to pass (the residual of the comparison rule), counted apart.
  const rev = reversedProbes();
  const reversed = rev.map((p) => {
    const r = scorePlants([{ ...p, expect: 'drop' }], () => p.pack, g.knownPlaces, verify, opts);
    return { id: p.id, dropped: r.dropped === 1 };
  });
  return { generated, hand, reversed, plants: plants.length, packs: Object.keys(g.packs).length, seed: g.seed };
}

async function main() {
  const which = process.argv[2];
  const out = process.argv[3];
  const verify = which === 'before' ? await import('../../../tests/fixtures/verifyBefore.mjs') : await import('../../../src/lib/ask/verify.js');
  const r = scoreGolden(verify);
  const slim = (x) => ({ ...x, survivors: x.survivors.length });
  const body = { verifier: which, seed: r.seed, plants: r.plants, packs: r.packs, generated: slim(r.generated), hand: slim(r.hand), reversed: r.reversed };
  if (out) writeFileSync(resolve(out), `${JSON.stringify(body, null, 2)}\n`);
  const row = (name, x) => console.log(`${name.padEnd(20)} ${String(x.dropped).padStart(5)}/${String(x.planted).padEnd(5)} ${(x.dropShare * 100).toFixed(1)}%`);
  console.log(`verifier ${which}: ${r.plants} generated plants over ${r.packs} packs`);
  for (const [k, v] of Object.entries(r.generated.byKind)) row(k, v);
  console.log(`  of the survivors, ${r.generated.explained} hold the value in a cited note or the question by the verifier's reading (${JSON.stringify(r.generated.explainedBy)}); unexplained ${r.generated.survivors.length}`);
  row('ALL generated', { dropped: r.generated.dropped, planted: r.generated.planted, dropShare: r.generated.dropShare });
  for (const [k, v] of Object.entries(r.hand.byKind)) row(`hand ${k}`, v);
  row('ALL hand', { dropped: r.hand.dropped, planted: r.hand.planted, dropShare: r.hand.dropShare });
  console.log(`residual (coincident) ${r.generated.residual.coincident} of ${r.generated.total} (${(r.generated.residual.share * 100).toFixed(2)}%, 95% ${(r.generated.residual.lo * 100).toFixed(2)} to ${(r.generated.residual.hi * 100).toFixed(2)}%)`);
  console.log(`reversed comparisons dropped ${r.reversed.filter((x) => x.dropped).length} of ${r.reversed.length}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(2); });
