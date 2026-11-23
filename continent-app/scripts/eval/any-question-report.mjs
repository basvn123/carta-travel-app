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

/** The root cause of a failure: what in the answer path went wrong, finer than the scorer's cause. */
export function rootOf(r) {
  const c = r.causes[0] || 'unknown';
  if (c === 'no-refusal') return 'harmful request answered as a search, no refusal path';
  if (c === 'not-declined') return r.expect.outside ? 'place outside Europe not recognised (outsidePlace misses the phrasing)' : 'off-topic question answered as a place search';
  if (r.type === 'places-lacking') return r.obs.outside ? 'lacking place called "outside Europe", no covered place offered' : 'lacking place not declined';
  if (r.type === 'follow-up') return 'follow-up turn not bound to the last place (month, cost or day count asked of nothing)';
  if (r.expect.intent === 'plan') return 'day count, weekend or road trip not read as a plan';
  if (r.type === 'getting-there') return 'getting-there question answered as a search (no route, flight or car answer)';
  if (r.type === 'prices-budgets') return 'price question not read as a budget or a place cost';
  if (r.type === 'other-languages') return 'phrasing in another language not read as the intended question';
  return `${c} in ${r.type}`;
}

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
  const roots = [...groupBy(fails, rootOf).entries()].sort((a, b) => b[1].length - a[1].length);
  out.push('## Root causes, all failures (wrong-kind split)', '', 'A scorer cause such as wrong-kind mixes several root causes; the root causes are assigned by rule per type and scorer cause (`rootOf`), not by reading each answer.', '', table(['root cause', 'failures', 'share', 'types'], roots.map(([c, l]) => [c, l.length, `${((l.length / fails.length) * 100).toFixed(1)}%`, [...new Set(l.map((r) => r.type))].join(', ')])), '');
  const [topCause, topList] = roots[0];
  const topTypes = [...groupBy(topList, (r) => r.type).entries()].sort((a, b) => b[1].length - a[1].length).map(([t, l]) => `${t} ${l.length}`).join(', ');
  out.push('## Biggest root cause: the target for wave 3 (A2g)', '', `**${topCause}**: ${topList.length} failures (${((topList.length / fails.length) * 100).toFixed(1)}% of all). By type: ${topTypes}.`, '');
  const [nextCause, nextList] = roots.find(([c]) => !c.startsWith('harmful')) || roots[0];
  if (nextCause !== topCause) out.push(`Biggest root cause that is not the missing refusal path: **${nextCause}**, ${nextList.length} failures (${((nextList.length / fails.length) * 100).toFixed(1)}%).`, '');
  // Label check: a failure whose answer is of the expected kind's own family is a label or scorer disagreement, not an Ask error.
  const family = { decline: ['decline', 'decline-nearest'], 'decline-nearest': ['decline', 'decline-nearest'] };
  const sameFamilyAll = fails.filter((r) => (family[r.expect.kind] || []).some((k) => r.kinds.includes(k)) && r.causes[0] === 'not-declined');
  // decision.md (out-of-scope labels): an outside place read as a covered one, or an off-topic
  // question read as a place outside Europe, is a misread that only looks like a decline; the label is right.
  const misread = (r) => (r.expect.outside && !r.obs.outside) || (!r.expect.outside && r.obs.outside);
  const declineShaped = sameFamilyAll.filter(misread);
  const sameFamily = sameFamilyAll.filter((r) => !misread(r));
  const suspect = fails.filter((r) => r.type === 'places-lacking' && !r.obs.outside && r.obs.places.length && !r.obs.cant);
  out.push('## Label errors found', '', 'Found in the first read (2026-11-22, fixed in the set): five places the set called absent are in the catalogue (Valletta is a member of Malta, Siguenza, Samothraki, Kuressaare and Positano are destinations or members), and ten other-languages cases carried country none. The set builder now refuses a lacking name that matches any destination, name or member.', '', suspect.length ? `Still suspect after the fix (answered as a covered place, check the label): ${suspect.map((r) => `${r.id} "${r.q}"`).join('; ')}.` : 'No places-lacking case is currently answered as a covered place.', '', declineShaped.length ? `Decline-shaped misreads, label right (decision.md, out-of-scope labels): ${declineShaped.map((r) => `${r.id} "${r.q}"`).join('; ')}.` : 'No decline-shaped misread.', '', sameFamily.length ? `Failures filed as not-declined whose answer is a decline (check the label): ${sameFamily.map((r) => `${r.id} "${r.q}"`).join('; ')}.` : 'No other failure filed as not-declined holds a decline answer.', '');
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
