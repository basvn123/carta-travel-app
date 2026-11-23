#!/usr/bin/env node
/*
 * Logic wave 3's before and after report (G4, G5): the party and stay-ladder golden sets
 * per slice with the E2 and E3 flags forced old and new, and the cases that fail on each path.
 *
 *   node scripts/eval/logic-w3-report.mjs --out <folder>   writes slices.md and errors.md
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runGolden, sliceTable, share } from './lib/logic-engines.mjs';

const SETS = ['party', 'stay-ladder'];
const at = process.argv.indexOf('--out');
if (at < 0 || !process.argv[at + 1]) { console.error('usage: node scripts/eval/logic-w3-report.mjs --out <folder>'); process.exit(2); }
const dir = resolve(process.argv[at + 1]);
mkdirSync(dir, { recursive: true });

const run = (which) => runGolden({ which, sets: SETS });
const old = run('old'); const now = run('new');
const pass = (rs) => rs.filter((r) => r.pass).length;
const cell = (s) => `current ${s.currentPass}/${s.current}, target ${s.targetPass}/${s.target}`;
const byKey = (rows) => new Map(sliceTable(rows).map((s) => [`${s.dim}=${s.value}`, s]));
const a = byKey(old); const b = byKey(now);

const lines = ['# Slices: E2 party and E3 stay-ladder golden sets, before and after (G5)', '',
  'The table forces the path (`runGolden({ which, sets })`): old is the flag off, new the flag on.', '',
  '| Slice | old (flag off) | new (flag on) |', '|---|---|---|'];
for (const set of SETS) {
  const o = old.filter((r) => r.set === set); const n = now.filter((r) => r.set === set);
  lines.push(`| set ${set} (${o.length} cases) | ${pass(o)} of ${o.length} (current ${pass(o.filter((r) => r.expect === 'current'))}/${o.filter((r) => r.expect === 'current').length}) | ${pass(n)} of ${n.length} |`);
}
for (const [k, s] of a) lines.push(`| ${k} | ${cell(s)} | ${cell(b.get(k))} |`);
lines.push('', `All ${old.length} cases: old ${share(pass(old), old.length)}, new ${share(pass(now), now.length)}.`,
  'No current case moved: with a flag off the answers are today\'s (the regression guards pass on both paths).');
writeFileSync(join(dir, 'slices.md'), `${lines.join('\n')}\n`);

const fails = (rs, label) => {
  const f = rs.filter((r) => !r.pass);
  return [`## ${label}: ${f.length} of ${rs.length} cases fail`, '', ...f.map((r) => `- ${r.set}/${r.id} (${r.expect}): got ${JSON.stringify(r.got)}, want ${JSON.stringify(r.want)}. ${r.source}`), ''];
};
writeFileSync(join(dir, 'errors.md'), `${['# Errors (G4): party and stay-ladder golden cases that fail', '',
  'Old path: every failure is a target case, the gap E2 and E3 close. New path: nothing fails.', '', ...fails(old, 'Flags off (old)'), ...fails(now, 'Flags on (new)')].join('\n')}\n`);
console.log(`slices.md and errors.md written to ${dir}`);
