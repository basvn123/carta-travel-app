#!/usr/bin/env node
/*
 * Shadow diff (G7, ROADMAP G4): run the old and the new path of a logic engine
 * over the persona set (tests/personas_v5.json, the twelve gate-7 travellers)
 * and write what changed as markdown, so a wave can show its effect before it
 * flips its flag in config/flags.json.
 *
 *   node scripts/eval/shadow-diff.mjs <engine> --out <folder>
 *   engine: E1 (budget search and trip label per persona), E5 (months fine per persona), E6 (top 10 For you per persona), E1 (totals), E9 (state-scope journeys per persona), noop (the fixture engine)
 *
 * An engine's new path is registered in scripts/eval/lib/logic-engines.mjs
 * (ENGINE_PATHS). Until a wave registers it, the engine reports "no new path
 * yet" and exits 1; "noop" has old equal to new and proves the report works.
 * It reads the committed places fixture, so it runs in CI with no wire file.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_PATHS, PERSONAS, PLACES } from './lib/logic-engines.mjs';
import { personaTotals } from './lib/totals-engine.mjs';
import { replayJourneys } from './lib/state-engine.mjs';

const places = () => Object.values(PLACES);
/** What one persona sees from an engine path: a short list of place ids. */
export const VIEWS = {
  E5: (fn, p) => places().filter((pl) => fn(pl, p.month, { guard: p.taste?.party === 'family' })).map((pl) => pl.id),
  E6: (fn, p) => fn(places(), p.taste, p.month).slice(0, 10),
  noop: (fn, p) => fn(places(), p.taste, p.month).slice(0, 10),
  // E1 (logic wave 1): what the budget search offers and the two-stop trip's label, per persona; fn is 'old' or 'new'.
  E1: (which, p) => { const r = personaTotals(p, which); return [`budget ${r.budget}`, ...r.fits.map((x) => `fits ${x}`), ...r.tight.map((x) => `tight ${x}`), `getting there: ${r.there || 'not said'}`, `trip: ${r.trip}`]; },
  // E9 (logic wave 2): what each state-scope journey leaves for a persona's travel style, one line per journey; fn is 'old' or 'new'.
  E9: (which, p) => Object.entries(replayJourneys(which, p)).map(([j, o]) => `${j}: ${Object.entries(o).map(([k, v]) => `${k}=${Array.isArray(v) ? `[${v.join(',')}]` : v}`).join(' ')}`),
};
const NOOP_PATH = (pool) => pool.map((x) => x.id);
const pathsOf = (engine) => (engine === 'noop' ? { old: NOOP_PATH, new: NOOP_PATH } : (engine === 'E1' || engine === 'E9') ? { old: 'old', new: 'new' } : ENGINE_PATHS[engine]);

/** The diff as data: one row per persona with the old and new lists. */
export function shadowDiff(engine) {
  const view = VIEWS[engine];
  const paths = pathsOf(engine);
  if (!view || !paths) throw new Error(`no shadow view for engine "${engine}" (known: ${Object.keys(VIEWS).join(', ')})`);
  if (!paths.new) throw new Error(`engine ${engine} has no new path yet: register it in scripts/eval/lib/logic-engines.mjs`);
  return Object.values(PERSONAS).map((p) => {
    const was = view(paths.old, p); const now = view(paths.new, p);
    return { persona: p.id, month: p.month, was, now, same: JSON.stringify(was) === JSON.stringify(now), added: now.filter((x) => !was.includes(x)), dropped: was.filter((x) => !now.includes(x)) };
  });
}

export function toMarkdown(engine, rows) {
  const changed = rows.filter((r) => !r.same);
  const name = (id) => PLACES[id]?.city || id;
  const lines = [`# Shadow diff: ${engine}`, '', `${changed.length} of ${rows.length} personas see a different answer (old against new path).`, ''];
  lines.push('| Persona | Month | Same | Added | Dropped |', '|---|---|---|---|---|');
  for (const r of rows) lines.push(`| ${r.persona} | ${r.month} | ${r.same ? 'yes' : 'no'} | ${r.added.map(name).join(', ')} | ${r.dropped.map(name).join(', ')} |`);
  for (const r of changed) lines.push('', `## ${r.persona} (month ${r.month})`, '', `Old: ${r.was.map(name).join(', ')}`, '', `New: ${r.now.map(name).join(', ')}`);
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const engine = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--out');
  const at = argv.indexOf('--out');
  if (!engine || at < 0 || !argv[at + 1]) { console.error('usage: node scripts/eval/shadow-diff.mjs <engine> --out <folder>'); process.exit(2); }
  try {
    const rows = shadowDiff(engine);
    const dir = resolve(argv[at + 1]);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `shadow-${engine}.md`);
    writeFileSync(file, toMarkdown(engine, rows));
    writeFileSync(join(dir, `shadow-${engine}.json`), `${JSON.stringify(rows, null, 1)}
`);
    console.log(`${file}: ${rows.filter((r) => !r.same).length} of ${rows.length} personas changed`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
