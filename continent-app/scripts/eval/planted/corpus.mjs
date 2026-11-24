/*
 * The packs the planted-error eval runs over (ROADMAP E1, wave 4, A3): the
 * context pack the Ask code builds for every question of three sets, offline
 * (no model, no retrieval). Same path as the any-question eval, so a pack here
 * is the pack the chat would send.
 *
 *   any-question   evals/any-question/set.json (326 questions, 14 types)
 *   ask-golden     tests/fixtures/ask-golden.json (the 141 of T550)
 *   ask-set        scripts/eval/ask-set.json (the Ask eval's 200)
 *
 * It needs the shipped catalogue (public/ or CARTA_PUBLIC). The frozen plants
 * of tests/fixtures/plantedGolden.json let CI score without one.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from '../lib/results.mjs';
import { offlineKit } from '../ask-eval.mjs';
import { observe } from '../adapters/any-question.mjs';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

export const SOURCES = [
  { name: 'any-question', path: join(REPO, 'evals', 'any-question', 'set.json'), id: (c) => c.id },
  { name: 'ask-golden', path: join(REPO, 'continent-app', 'tests', 'fixtures', 'ask-golden.json'), id: (c, i) => `g${i}` },
  { name: 'ask-set', path: join(REPO, 'continent-app', 'scripts', 'eval', 'ask-set.json'), id: (c) => c.id },
];

/** Every pack, as { id, source, lang, pack }, with the catalogue's city names. */
export async function collectPacks({ sources = SOURCES } = {}) {
  const kit = await offlineKit();
  const out = [];
  const seen = new Set();
  for (const s of sources) {
    const set = read(s.path);
    const today = new Date(`${set.now || '2026-10-22'}T12:00:00`);
    set.cases.forEach((c, i) => {
      const { pack } = observe(c, kit, today);
      if (!pack) return;
      const key = `${c.lang}|${c.q}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ id: `${s.name}:${s.id(c, i)}`, source: s.name, lang: c.lang, pack });
    });
  }
  const known = [...new Set(kit.cat.rows.map((r) => r.city).filter(Boolean))].sort();
  return { packs: out, knownPlaces: known };
}
