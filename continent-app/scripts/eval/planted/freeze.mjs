/*
 * Freeze the golden plant cases (ROADMAP E1, wave 4). Builds the packs over the
 * catalogue (CARTA_PUBLIC), generates the plants with the seeded generator and
 * writes tests/fixtures/plantedGolden.json: the packs, the catalogue's place
 * names and every plant. CI scores that file with no catalogue and no model, and
 * the plants stay the same when the generator or the catalogue changes. Re-run
 * only on purpose:
 *
 *   CARTA_PUBLIC=<path to a public/> node scripts/eval/planted/freeze.mjs [--before out.json]
 *
 * --before also scores the FROZEN old verifier and writes the drop share per kind
 * (the plant-before.json of the wave).
 */
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPacks } from './corpus.mjs';
import { plantAll } from './plant.mjs';
import { scorePlants } from './score.mjs';
import { handPlants } from './hand.mjs';
import * as before from '../../../tests/fixtures/verifyBefore.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const GOLDEN_PATH = join(here, '..', '..', '..', 'tests', 'fixtures', 'plantedGolden.json');
export const SEED = 20261124;
export const PER_KIND = 3;

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };

async function main() {
  const { packs, knownPlaces } = await collectPacks();
  const plants = plantAll(packs.map((p) => ({ id: p.id, pack: p.pack })), { seed: SEED, perKind: PER_KIND });
  const data = {
    version: 1, seed: SEED, perKind: PER_KIND,
    about: 'Frozen planted-error cases (E1 wave 4). Packs and catalogue place names are copied so CI needs no catalogue. Regenerate with scripts/eval/planted/freeze.mjs.',
    knownPlaces,
    packs: Object.fromEntries(packs.map((p) => [p.id, { source: p.source, lang: p.lang, pack: p.pack }])),
    plants: plants.map(({ id, kind, sentence, cites, planted, source, expect, pack }) => ({ id, kind, sentence, cites, planted, source, expect, pack })),
  };
  writeFileSync(GOLDEN_PATH, `${JSON.stringify(data)}\n`);
  console.log(`frozen ${plants.length} plants over ${packs.length} packs -> ${GOLDEN_PATH}`);
  const out = arg('--before');
  if (out) {
    const byId = (p) => data.packs[p.pack].pack;
    const gen = scorePlants(data.plants, byId, knownPlaces, before);
    const hand = handPlants();
    const h = scorePlants(hand, (p) => p.pack, knownPlaces, before);
    const strip = (r) => ({ ...r, survivors: r.survivors.length });
    writeFileSync(resolve(out), `${JSON.stringify({ verifier: 'before wave 4 (tests/fixtures/verifyBefore.mjs)', seed: SEED, generated: strip(gen), hand: strip(h) }, null, 2)}\n`);
    console.log(`before: generated drop ${(gen.dropShare * 100).toFixed(1)}% of ${gen.planted}; hand ${(h.dropShare * 100).toFixed(1)}% of ${h.planted}; written to ${out}`);
  }
}
main().catch((e) => { console.error(e); process.exit(2); });
