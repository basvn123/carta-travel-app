#!/usr/bin/env node
/*
 * The golden harness's two reports (G1, G4, G5): slices.md (pass rate per
 * country, place class and persona, with the worst slice) and errors.md (the
 * failing cases, grouped, with the engine wave that fixes each group).
 *
 *   node scripts/eval/logic-report.mjs --out <folder> [--path old|new]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, runGolden, share, sliceTable } from './lib/logic-engines.mjs';

const WAVE = { E5: 'E5 one month (fit, source, heat)', E6: 'E6 one place ranker', E8: 'E8 one day clock', E1: 'E1 honest totals', E2: 'E2 one party model', E3: 'E3 one stay ladder' };

/** The error group of a failing case, and the wave that closes it. */
export function groupOf(r) {
  if (r.set === 'month-fit') return r.id.startsWith('coverage') ? 'no place is fine in the winter months (coverage)' : 'a fine month is missing from climate.best (shoulder season, ski, winter)';
  if (r.set === 'rank') return r.id.startsWith('tie') ? 'equal scores follow file order (no fame tiebreak)' : 'persona top 5 misses places a traveller would accept';
  if (r.set === 'totals') return 'a total prints lower for a missing part';
  if (r.set === 'party') return `a party is counted differently per screen (${r.id.split('-')[1]})`;
  if (r.set === 'stay-ladder') return `a missing bed tier or a room count is not one ladder (${r.id.split('-')[1]})`;
  return 'the way back to the stay is not part of the day';
}

export function slicesMarkdown(results) {
  const rows = sliceTable(results);
  const pct = (a, b) => (b ? `${a}/${b}` : '-');
  const lines = ['# Slices', '', `Pass rate per slice of the logic golden sets (${results.length} cases). "current" cases are gated, "target" cases are the gap each engine wave closes.`, '',
    '| Dimension | Slice | Current pass | Target pass | All cases pass |', '|---|---|---|---|---|'];
  for (const s of rows) lines.push(`| ${s.dim} | ${s.value} | ${pct(s.currentPass, s.current)} | ${pct(s.targetPass, s.target)} | ${share(s.currentPass + s.targetPass, s.current + s.target)} |`);
  const ranked = rows.filter((s) => s.current + s.target >= 2).map((s) => ({ ...s, rate: (s.currentPass + s.targetPass) / (s.current + s.target) })).sort((a, b) => a.rate - b.rate);
  lines.push('', `Worst slices (two or more cases): ${ranked.slice(0, 5).map((s) => `${s.dim}=${s.value} (${s.currentPass + s.targetPass}/${s.current + s.target})`).join(', ')}.`);
  return `${lines.join('\n')}\n`;
}

export function errorsMarkdown(results) {
  const failing = results.filter((r) => !r.pass);
  const groups = new Map();
  for (const r of failing) { const g = groupOf(r); groups.set(g, [...(groups.get(g) || []), r]); }
  const order = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const lines = ['# Errors', '', `${failing.length} of ${results.length} golden cases fail (${failing.filter((r) => r.expect === 'current').length} current, ${failing.filter((r) => r.expect === 'target').length} target). Sample of up to ${CONFIG.report.errors_sample}, grouped.`, '',
    '| Group | Cases | Engine wave that fixes it |', '|---|---|---|'];
  for (const [g, rs] of order) lines.push(`| ${g} | ${rs.length} | ${WAVE[rs[0].engine]} |`);
  if (order.length) lines.push('', `Biggest group: ${order[0][0]} (${order[0][1].length} cases), fixed by ${WAVE[order[0][1][0].engine]}.`);
  let left = CONFIG.report.errors_sample;
  for (const [g, rs] of order) {
    lines.push('', `## ${g}`, '');
    for (const r of rs.slice(0, Math.max(0, left))) lines.push(`- ${r.set}/${r.id} (${r.expect}): got ${JSON.stringify(r.got)}, want ${JSON.stringify(r.want)}. ${r.source}`);
    left -= rs.length;
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--out');
  if (at < 0 || !argv[at + 1]) { console.error('usage: node scripts/eval/logic-report.mjs --out <folder> [--path old|new]'); process.exit(2); }
  const results = runGolden({ which: argv.includes('--path') ? argv[argv.indexOf('--path') + 1] : null });
  const dir = resolve(argv[at + 1]);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'slices.md'), slicesMarkdown(results));
  writeFileSync(join(dir, 'errors.md'), errorsMarkdown(results));
  console.log(`slices.md and errors.md written to ${dir}`);
}
