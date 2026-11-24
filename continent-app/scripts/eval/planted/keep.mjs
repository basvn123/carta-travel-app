/*
 * Keep share, before and after the cited-note verifier (ROADMAP E1, A3; decision 2.1:
 * "the stricter rule lowers the keep share. Gate: non-inferiority, margin 5 points").
 *
 * No recorded written Ask answers exist in the repo (the live E-verify run is an owner
 * step, docs/owner/ai.md), so this is a stand-in and says so: for each of the 420 packs
 * of the frozen corpus, a written answer is built from the pack's own notes the way a
 * careful model writes it, and checked by the old and the new verifier:
 *
 *   self    note 1 said as written, citing note 1
 *   combo   notes 1 and 2 said together, citing both
 *   prefix  "In <the question's place>: <first note that never names it>", citing that note only
 *           (the usual slip: the model names the place, the cited row does not; the question
 *           must not name it either, or the rule lets it stand)
 *
 * An answer is kept when verifyAnswer does not withdraw it (decision: answer kept, at least
 * one sentence and at most 30% dropped). The sentences of one answer are paired old against
 * new; the paired bootstrap (stats.mjs) gives the one-sided 97.5% lower bound of new minus old.
 * Because the answers are synthetic, this measures the cost of the rule on a worst-plausible
 * habit, not the live keep share.
 *
 *   node scripts/eval/planted/keep.mjs [out.json]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGolden } from './golden.mjs';
import { nonInferiority, wilson } from '../lib/stats.mjs';
import * as before from '../../../tests/fixtures/verifyBefore.mjs';
import * as after from '../../../src/lib/ask/verify.js';

const fold = (t) => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const asSentence = (text, cites) => `${String(text).replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '')}. ${cites.map((c) => `[${c}]`).join('')}`;

/** The three proxy answers of one pack: { self, combo, prefix } each a sentence, and the whole answer text. */
export function proxyAnswer(pack) {
  const [n1, n2] = pack.notes;
  if (!n1 || !n2) return null;
  const place = pack.places?.[0]?.city;
  // The first note that never names the place (a monthly row, a comparison of two others): the row a model cites
  // while naming the place the question is about.
  const bare = place ? pack.notes.find((n) => !fold(n.text).includes(fold(place)) && !fold(pack.question).includes(fold(place))) : null;
  const s = {
    self: asSentence(n1.text, [n1.n]),
    combo: asSentence(`${String(n1.text).replace(/[.!?]+$/, '')}; ${String(n2.text).replace(/[.!?]+$/, '')}`, [n1.n, n2.n]),
    prefix: bare ? asSentence(`In ${place}: ${bare.text}`, [bare.n]) : null,
  };
  return { sentences: s, text: Object.values(s).filter(Boolean).join(' ') };
}

export function keepShare() {
  const g = loadGolden();
  const rows = [];
  for (const [id, { pack, lang }] of Object.entries(g.packs)) {
    const a = proxyAnswer(pack);
    if (!a) continue;
    const row = { id, lang, kept: {}, sentence: {} };
    for (const [name, v] of [['before', before], ['after', after]]) {
      const r = v.verifyAnswer(a.text, pack, g.knownPlaces);
      row.kept[name] = r.withdrawn ? 0 : 1;
      const check = v.makeChecker(pack, g.knownPlaces);
      row.sentence[name] = {};
      for (const [k, text] of Object.entries(a.sentences)) {
        if (!text) continue;
        row.sentence[name][k] = v.splitSentences(text).sentences.every((x) => check(x).ok) ? 1 : 0;
      }
    }
    rows.push(row);
  }
  const answers = {
    n: rows.length,
    before: wilson(rows.filter((r) => r.kept.before).length, rows.length),
    after: wilson(rows.filter((r) => r.kept.after).length, rows.length),
    ni: nonInferiority(rows.map((r) => r.kept.before), rows.map((r) => r.kept.after), { delta: 0.05, seed: 11 }),
  };
  const bySentence = {};
  for (const k of ['self', 'combo', 'prefix']) {
    const have = rows.filter((r) => r.sentence.before[k] != null);
    bySentence[k] = {
      n: have.length,
      before: wilson(have.filter((r) => r.sentence.before[k]).length, have.length),
      after: wilson(have.filter((r) => r.sentence.after[k]).length, have.length),
      ni: nonInferiority(have.map((r) => r.sentence.before[k]), have.map((r) => r.sentence.after[k]), { delta: 0.05, seed: 11 }),
    };
  }
  const langs = {};
  for (const l of [...new Set(rows.map((r) => r.lang))].sort()) {
    const mine = rows.filter((r) => r.lang === l);
    langs[l] = { n: mine.length, before: mine.filter((r) => r.kept.before).length / mine.length, after: mine.filter((r) => r.kept.after).length / mine.length };
  }
  return { answers, bySentence, langs, rows };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = keepShare();
  const f = (x) => `${(x.p * 100).toFixed(1)}% (${x.k}/${x.n}, 95% ${(x.lo * 100).toFixed(1)} to ${(x.hi * 100).toFixed(1)})`;
  const ni = (x) => `diff ${(x.mean * 100).toFixed(1)} points, lower bound ${(x.lower * 100).toFixed(1)}, ${x.pass ? 'inside' : 'OUTSIDE'} the 5 point margin`;
  console.log(`answers kept: before ${f(r.answers.before)}; after ${f(r.answers.after)}; ${ni(r.answers.ni)}`);
  for (const [k, v] of Object.entries(r.bySentence)) console.log(`sentence ${k}: before ${f(v.before)}; after ${f(v.after)}; ${ni(v.ni)}`);
  console.log('by language (answers kept before -> after):', Object.entries(r.langs).map(([l, v]) => `${l} ${(v.before * 100).toFixed(0)}->${(v.after * 100).toFixed(0)} (n ${v.n})`).join(', '));
  if (process.argv[2]) writeFileSync(resolve(process.argv[2]), `${JSON.stringify({ ...r, rows: undefined }, null, 2)}\n`);
}
