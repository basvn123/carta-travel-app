// Persona gate 7 (T765): each persona's top 10 in the app's own For you
// order, for its fixed month, as the input of reports/persona_check_v5.md.
//
//   node scripts/persona_check_v5.mjs [--json out.json]
//
// The order is lib/match.js sortForYou over the Explore list (every rated
// destination that is not a gateway), the same function useExploreCatalog
// sorts with, so the gate judges what a traveller sees.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sortForYou, fit } from '../src/lib/match.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const personas = JSON.parse(readFileSync(resolve(root, 'tests/personas_v5.json'), 'utf8')).personas;
const wire = JSON.parse(readFileSync(resolve(root, 'public/app_data.json'), 'utf8'));
const list = Object.entries(wire.destinations)
  .filter(([, d]) => !d.gateway_of && d.rating?.score != null)
  .map(([id, d]) => ({ id, ...d }));

export function topFor(persona, n = 10) {
  return sortForYou(list, persona.taste, persona.month).slice(0, n).map((p) => {
    const f = fit(persona.taste, p.taste, persona.month);
    return {
      id: p.id, city: p.city, country: p.country, cls: p.place?.class ?? null,
      score: p.rating.score, pct: f?.pct ?? null,
      bars: (f?.bars || []).map((b) => `${b.key} ${Math.round(b.p * 100)}`).join(', '),
      conflicts: (f?.conflicts || []).map((c) => c.key).join(', '),
    };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = personas.map((p) => ({ id: p.id, name: p.name, month: p.month, taste: p.taste, top: topFor(p) }));
  const at = process.argv.indexOf('--json');
  if (at > 0) writeFileSync(process.argv[at + 1], JSON.stringify(out, null, 2));
  for (const p of out) {
    console.log(`\n## ${p.name} (month ${p.month})`);
    p.top.forEach((r, i) => console.log(`${i + 1}. ${r.city} (${r.country}, ${r.cls}) ${r.score} | ${r.pct}% | ${r.bars}${r.conflicts ? ` | conflicts: ${r.conflicts}` : ''}`));
  }
}
