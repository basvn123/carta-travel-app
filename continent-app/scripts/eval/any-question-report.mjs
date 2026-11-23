#!/usr/bin/env node
/*
 * The any-question report (ROADMAP E1): runs the set and writes the two
 * documents a wave needs, as Markdown:
 *
 *   baseline.md  per type n, accuracy, keep, graceful with intervals; slices by
 *                language, country, place class and persona; the worst slice;
 *                the counterfactual share; the planted-error counts
 *   errors.md    50 failures sampled with a fixed seed, grouped by cause and
 *                counted (G4), the biggest group named as the next target
 *
 *   node scripts/eval/any-question-report.mjs [--out <folder>] [--seed 20261122] [--sample 50]
 *
 * CARTA_PUBLIC points at a catalogue when continent-app/public is absent.
 * Without one it stops loudly and writes nothing. No model is called.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { catalogueAvailable } from './ask-eval.mjs';
import { runSet } from './adapters/any-question.mjs';
import { tally, fmtShare, groupBy } from './any-question-lib.mjs';
import { mulberry32 } from './lib/stats.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const SCORES = ['accurate', 'kept', 'graceful'];
const row = (cells) => `| ${cells.join(' | ')} |`;
const table = (head, rows) => [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n');
const sliceTable = (dim, sl) => table([dim, 'n', ...SCORES], Object.entries(sl).map(([k, t]) => [k, t.n, ...SCORES.map((s) => fmtShare(t[s], t.n))]));

export function baselineMd({ set, rows, sl, cf, worst, plants }, meta) {
  const all = tally(rows);
  const out = [];
  out.push('# Baseline: the any-question eval (ROADMAP E1)', '');
  out.push(`Run ${meta.at} on ${meta.git}. Path: the offline rules path (parseIntent, follow-up binding, outsidePlace, answerFacts, composeAnswer, unknownNote), no retrieval, no model. Set: ${set.cases.length} cases, version ${set.version}; every label is a draft (G2) until the owner verifies a sample. Not gated.`, '');
  out.push('Scores (each 0 or 1 per case): accurate = the answer kind is the expected one and every given expectation holds (intent, places, country, months, the lacking place named); kept = a lead and at least one pick, table, plan or note, or a correct decline; graceful = never a dead end (a figure, a note, a door or a decline with the nearest places), and for harmful requests only a refusal counts. Intervals are 95% Wilson; a zero is shown with its rule-of-three bound (at most 3/n at 95%).', '');
  out.push(`All types: n ${all.n}, accurate ${fmtShare(all.accurate, all.n)}, kept ${fmtShare(all.kept, all.n)}, graceful ${fmtShare(all.graceful, all.n)}.`, '');
  out.push('## Per type', '', sliceTable('type', Object.fromEntries(set.types.map((t) => [t, sl.type[t]]))), '');
  out.push('## Slices', '', '### By language', '', sliceTable('lang', sl.lang), '', '### By country (of the place or country asked about; none = no place)', '', sliceTable('country', sl.country), '', '### By place class', '', sliceTable('place', sl.place), '', '### By persona', '', sliceTable('persona', sl.persona), '');
  out.push('## Worst slice', '');
  if (worst) {
    const t = sl[worst.dim][worst.name];
    out.push(`Lowest accuracy among language, country, place class and persona slices with at least 10 cases: **${worst.dim} = ${worst.name}**, ${fmtShare(t.accurate, t.n)} (n ${t.n}).`, '');
  } else out.push('No slice has 10 cases.', '');
  const worstType = Object.entries(sl.type).sort((a, b) => a[1].accurate.p - b[1].accurate.p)[0];
  out.push(`Worst type: **${worstType[0]}**, accurate ${fmtShare(worstType[1].accurate, worstType[1].n)}.`, '');
  out.push('## Counterfactual consistency (G9)', '');
  out.push('Six-language groups are consistent when every language got the same intent type, months and set of top three place ids. Two-country groups are consistent when both got the same intent type, answer kinds and accurate flag (the place ids differ by construction).', '');
  out.push(table(['kind', 'groups', 'consistent', 'share'], ['lang', 'country'].map((k) => [k === 'lang' ? 'same question, six languages' : 'same question, two countries', cf[k].groups, cf[k].consistent, fmtShare({ k: cf[k].consistent, p: cf[k].share.p, lo: cf[k].share.lo, hi: cf[k].share.hi, zeroBound: cf[k].groups ? 3 / cf[k].groups : null }, cf[k].groups)])), '');
  for (const k of ['lang', 'country']) {
    const split = cf[k].items.filter((x) => !x.same);
    if (split.length) out.push(`Inconsistent ${k} groups: ${split.map((x) => x.group).join(', ')}.`, '');
  }
  out.push('## Planted errors over the packs of this run', '');
  out.push(`${plants.packs} context packs gave ${plants.summary.total} plants (${plants.summary.drop} expect a drop, ${plants.summary.coincident} coincident, residual share ${plants.summary.coincidentShare == null ? 'n/a' : `${(plants.summary.coincidentShare * 100).toFixed(1)}%`}). Scoring the verifier against them is wave A3.`, '');
  out.push(table(['kind', 'plants'], Object.entries(plants.summary.byKind).map(([k, v]) => [k, v.total])), '');
  return `${out.join('\n')}\n`;
}

const describe = (r) => `intent ${r.obs.intentType || '-'}, kinds ${r.kinds.join('+') || 'none'}${r.obs.outside ? `, outside "${r.obs.outside}"` : ''}${r.obs.cant ? `, cant "${r.obs.cant}"` : ''}, places ${r.obs.places.slice(0, 4).join(',') || '-'}${r.obs.months.length ? `, months ${r.obs.months.join(',')}` : ''}`;
const want = (r) => { const e = r.expect; return `${[e.kind, ...(e.also || [])].join('/')}${e.intent ? `, intent ${e.intent}` : ''}${e.places ? `, places ${e.places.join(',')}` : ''}${e.placesAny ? `, any of ${e.placesAny.join(',')}` : ''}${e.country ? `, country ${e.country}` : ''}${e.months ? `, months ${e.months.join(',')}` : ''}${e.lacking ? `, names ${e.lacking}` : ''}`; };

export function errorsMd({ rows }, { seed = 20261122, sample = 50 } = {}) {
  const fails = rows.filter((r) => !r.accurate);
  const cause = (r) => r.causes[0] || 'unknown';
  const pop = groupBy(fails, cause);
  const rand = mulberry32(seed);
  const order = fails.map((r) => r).sort((a, b) => a.id.localeCompare(b.id));
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const picked = order.slice(0, Math.min(sample, order.length));
  const byCause = groupBy(picked, cause);
  const ranked = [...pop.entries()].sort((a, b) => b[1].length - a[1].length);
  const out = [];
  out.push('# Errors: failures of the any-question baseline (G4)', '');
  out.push(`${fails.length} of ${rows.length} cases were not accurate. ${picked.length} were sampled with seed ${seed} and are read below, grouped by their first (primary) cause. The counts per cause are over all ${fails.length} failures, not only the sample.`, '');
  out.push('## Causes, all failures', '', table(['cause', 'failures', 'share of failures', 'in the sample', 'types'], ranked.map(([c, list]) => [c, list.length, `${((list.length / fails.length) * 100).toFixed(1)}%`, (byCause.get(c) || []).length, [...new Set(list.map((r) => r.type))].join(', ')])), '');
  const [topCause, topList] = ranked[0];
  const topTypes = [...groupBy(topList, (r) => r.type).entries()].sort((a, b) => b[1].length - a[1].length).map(([t, l]) => `${t} ${l.length}`).join(', ');
  out.push('## Biggest group: the target for wave 3 (A2g)', '', `**${topCause}**: ${topList.length} failures (${((topList.length / fails.length) * 100).toFixed(1)}% of all). By type: ${topTypes}.`, '');
  out.push('Cause names: no-refusal = a harmful request was answered, not refused; wrong-kind = the answer was a different kind than a good one; place-missing = a place the question names is not in the answer; wrong-intent = the parser read another kind of question; country-miss = cards outside the asked country; month-missed = the asked month is not read; not-declined = a request outside Europe or travel was answered as a search; lacking-not-declined = a place Carta lacks was not declined with the nearest covered places; lacking-not-named = the decline did not name the lacking place; no-nearest = the decline offers no covered place; nearest-elsewhere = the nearest places are in another country; no-practical-answer = no note answered an entry or practical question.', '');
  out.push('## The sample, by cause', '');
  for (const [c] of ranked) {
    const list = byCause.get(c);
    if (!list) continue;
    out.push(`### ${c} (${list.length} in the sample, ${pop.get(c).length} in all)`, '');
    for (const r of list.sort((a, b) => a.id.localeCompare(b.id))) out.push(`- ${r.id} [${r.lang}] "${r.q}"\n  - wanted: ${want(r)}\n  - got: ${describe(r)}${r.causes.length > 1 ? `\n  - also: ${r.causes.slice(1).join(', ')}` : ''}`);
    out.push('');
  }
  return `${out.join('\n')}\n`;
}

async function main() {
  if (!catalogueAvailable()) {
    console.error('any-question report: no shipped catalogue found. Build continent-app/public/ or set CARTA_PUBLIC to a read-only copy. Nothing written (this is not a score of 0).');
    process.exit(3);
  }
  const res = await runSet();
  const dir = resolve(arg('--out', '.'));
  mkdirSync(dir, { recursive: true });
  const git = (await import('./lib/results.mjs')).gitSha() || 'unknown commit';
  writeFileSync(join(dir, 'baseline.md'), baselineMd(res, { at: new Date().toISOString().slice(0, 10), git }));
  writeFileSync(join(dir, 'errors.md'), errorsMd(res, { seed: Number(arg('--seed', 20261122)), sample: Number(arg('--sample', 50)) }));
  console.log(`wrote baseline.md and errors.md to ${dir}`);
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(2); });
