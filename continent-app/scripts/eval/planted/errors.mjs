/*
 * Error analysis of the cited-note verifier (ROADMAP E1, A3): 50 sampled cases of the two ways
 * it can be wrong, grouped and counted.
 *
 *   kept plants    a planted error the verifier kept (survivors: the value is in a cited note by its own
 *                  reading, plus the generator's own "coincident" plants it kept)
 *   false drops    a stand-in true sentence (keep.mjs) the old verifier kept and the new one drops
 *
 *   node scripts/eval/planted/errors.mjs [out.md]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGolden } from './golden.mjs';
import { residualReason } from './score.mjs';
import { proxyAnswer } from './keep.mjs';
import { mulberry32 } from '../lib/stats.mjs';
import * as before from '../../../tests/fixtures/verifyBefore.mjs';
import * as after from '../../../src/lib/ask/verify.js';

function sample(list, n, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
const cut = (s, n = 110) => (String(s).length > n ? `${String(s).slice(0, n - 3)}...` : String(s));

export function analyse() {
  const g = loadGolden();
  const kept = [];
  const falseDrops = [];
  const byPack = new Map();
  for (const p of g.plants) (byPack.get(p.pack) || byPack.set(p.pack, []).get(p.pack)).push(p);
  for (const [id, { pack }] of Object.entries(g.packs)) {
    const check = after.makeChecker(pack, g.knownPlaces);
    for (const p of byPack.get(id) || []) {
      const ok = after.splitSentences(p.sentence).sentences.some((s) => check(s).ok);
      if (!ok) continue;
      const group = p.expect === 'coincident' ? `coincident: ${p.planted.type} also in a cited note` : `survivor: ${residualReason(p, pack) || 'UNEXPLAINED'}`;
      kept.push({ group, kind: p.kind, id: p.id, text: p.sentence, note: `planted ${p.planted.value}` });
    }
    const a = proxyAnswer(pack);
    if (!a) continue;
    const oldCheck = before.makeChecker(pack, g.knownPlaces);
    for (const [k, text] of Object.entries(a.sentences)) {
      if (!text) continue;
      for (const s of after.splitSentences(text).sentences) {
        const o = oldCheck(s);
        const n = check(s);
        if (o.ok && !n.ok) falseDrops.push({ group: `false drop: ${n.why[0].split(':')[0]} (${k})`, kind: k, id, text, note: n.why.join(', ') });
      }
    }
  }
  return { kept, falseDrops };
}

function table(title, items, total, rand, n) {
  const groups = {};
  for (const x of items) groups[x.group] = (groups[x.group] || 0) + 1;
  const lines = [`## ${title}`, '', `${items.length} cases in all${total ? ` (of ${total})` : ''}. Grouped:`, ''];
  for (const [k, v] of Object.entries(groups).sort((a, b) => b[1] - a[1])) lines.push(`- ${k}: ${v}`);
  lines.push('', `Sample of ${Math.min(n, items.length)}:`, '');
  for (const x of sample(items, n, rand)) lines.push(`- [${x.group}] ${x.id}: ${cut(x.text)} (${x.note})`);
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { kept, falseDrops } = analyse();
  const g = loadGolden();
  const rand = mulberry32(50);
  // 50 in all: a share of each in proportion, at least 10 of the smaller one.
  const nKept = Math.min(kept.length, Math.max(10, Math.round(50 * kept.length / Math.max(1, kept.length + falseDrops.length))));
  const nDrop = Math.min(falseDrops.length, 50 - nKept);
  const md = ['# Errors of the cited-note verifier (E1, A3)', '', `Frozen plants: ${g.plants.length}; stand-in true sentences: from ${Object.keys(g.packs).length} packs.`, '',
    table('Planted errors the verifier kept', kept, g.plants.length, rand, nKept), '',
    table('True stand-in sentences the new verifier drops and the old kept (false drops)', falseDrops, null, rand, nDrop), ''].join('\n');
  if (process.argv[2]) writeFileSync(resolve(process.argv[2]), `${md}\n`);
  console.log(md);
}
