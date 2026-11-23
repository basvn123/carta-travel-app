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
 *   results.md   (wave 3, E7) per type, language and slice before and after against
 *                any-question-baseline.json: accuracy with the paired non-inferiority
 *                lower bound, graceful, the worst slice, the counterfactual share
 *
 *   node scripts/eval/any-question-report.mjs [--out <folder>] [--seed 20261122] [--sample 50]
 *
 * CARTA_PUBLIC points at a catalogue when continent-app/public is absent.
 * Without one it stops loudly and writes nothing. No model is called.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { catalogueAvailable, offlineKit } from './ask-eval.mjs';
import { parseIntent } from '../../src/lib/ask/intent.js';
import { askScope } from '../../src/lib/ask/scope.js';
import { runSet, BASELINE_PATH } from './adapters/any-question.mjs';
import { tally, fmtShare, groupBy, slices, worstSlice, gateOf, NI_DELTA } from './any-question-lib.mjs';
import { mulberry32, wilson } from './lib/stats.mjs';

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
  out.push(`Run ${meta.at} on ${meta.git}. Path: the offline rules path (parseIntent, askScope, follow-up binding, answerFacts, composeAnswer, unknownNote), no retrieval, no model. Set: ${set.cases.length} cases, version ${set.version}; every label is a draft (G2) until the owner verifies a sample. Gated since wave 3 (E7): see results.md.`, '');
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

const describe = (r) => `intent ${r.obs.intentType || '-'}, kinds ${r.kinds.join('+') || 'none'}${r.obs.outside ? `, outside "${r.obs.outside}"` : ''}${r.obs.lacking ? `, lacking "${r.obs.lacking}"` : ''}${r.obs.cant ? `, cant "${r.obs.cant}"` : ''}, places ${r.obs.places.slice(0, 4).join(',') || '-'}${r.obs.months.length ? `, months ${r.obs.months.join(',')}` : ''}`;
const want = (r) => { const e = r.expect; return `${[e.kind, ...(e.also || [])].join('/')}${e.intent ? `, intent ${e.intent}` : ''}${e.places ? `, places ${e.places.join(',')}` : ''}${e.placesAny ? `, any of ${e.placesAny.join(',')}` : ''}${e.country ? `, country ${e.country}` : ''}${e.months ? `, months ${e.months.join(',')}` : ''}${e.lacking ? `, names ${e.lacking}` : ''}`; };

/** The root cause of a failure: what in the answer path went wrong, finer than the scorer's cause. */
export function rootOf(r) {
  const c = r.causes[0] || 'unknown';
  if (c === 'no-refusal') return 'harmful request answered as a search, no refusal path';
  if (c === 'not-declined') return r.expect.outside ? 'place outside Europe not recognised (outsidePlace misses the phrasing)' : 'off-topic question answered as a place search';
  if (r.type === 'places-lacking') return r.obs.outside ? 'lacking place called "outside Europe", no covered place offered' : r.obs.lacking ? 'lacking place named but not placed (the gazetteer and the catalogue text do not know it: no nearest places)' : 'lacking place not declined';
  if (r.type === 'follow-up') return 'follow-up turn not bound to the last place (month, cost or day count asked of nothing)';
  if (r.expect.intent === 'plan') return 'day count, weekend or road trip not read as a plan';
  if (r.type === 'getting-there') return 'getting-there question answered as a search (no route, flight or car answer)';
  if (r.type === 'prices-budgets') return 'price question not read as a budget or a place cost';
  if (r.type === 'other-languages') return 'phrasing in another language not read as the intended question';
  return `${c} in ${r.type}`;
}

export function errorsMd({ rows }, { seed = 20261122, sample = 50, title = '' } = {}) {
  const meta = { title };
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
  out.push(`# Errors: failures of the any-question eval (G4)${meta.title ? `, ${meta.title}` : ''}`, '');
  out.push(`${fails.length} of ${rows.length} cases were not accurate. ${picked.length} were sampled with seed ${seed} and are read below, grouped by their first (primary) cause. The counts per cause are over all ${fails.length} failures, not only the sample.`, '');
  out.push('## Causes, all failures', '', table(['cause', 'failures', 'share of failures', 'in the sample', 'types'], ranked.map(([c, list]) => [c, list.length, `${((list.length / fails.length) * 100).toFixed(1)}%`, (byCause.get(c) || []).length, [...new Set(list.map((r) => r.type))].join(', ')])), '');
  const roots = [...groupBy(fails, rootOf).entries()].sort((a, b) => b[1].length - a[1].length);
  out.push('## Root causes, all failures (wrong-kind split)', '', 'A scorer cause such as wrong-kind mixes several root causes; the root causes are assigned by rule per type and scorer cause (`rootOf`), not by reading each answer.', '', table(['root cause', 'failures', 'share', 'types'], roots.map(([c, l]) => [c, l.length, `${((l.length / fails.length) * 100).toFixed(1)}%`, [...new Set(l.map((r) => r.type))].join(', ')])), '');
  const [topCause, topList] = roots[0];
  const topTypes = [...groupBy(topList, (r) => r.type).entries()].sort((a, b) => b[1].length - a[1].length).map(([t, l]) => `${t} ${l.length}`).join(', ');
  out.push('## Biggest root cause: the next target for the backlog', '', `**${topCause}**: ${topList.length} failures (${((topList.length / fails.length) * 100).toFixed(1)}% of all). By type: ${topTypes}.`, '');
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

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const pts = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}`;
const k = (t) => `${t.accurate.k}/${t.n}`;

/** Before (the committed wave 2 baseline, per case) and after (this run), joined by case id. */
export function resultsMd({ rows, sl, cf, worst }, baseline, meta = {}) {
  const old = rows.map((r) => ({ ...r, accurate: !!baseline.cases[r.id]?.accurate, kept: !!baseline.cases[r.id]?.kept, graceful: !!baseline.cases[r.id]?.graceful }));
  const slOld = slices(old);
  const gate = gateOf(rows, baseline, cf);
  const out = [];
  out.push('# Results: the any-question eval, before and after wave 3 (E7, E1)', '');
  out.push(`Run ${meta.at || ''} on ${meta.git || 'unknown commit'}. Before = wave 2 as merged (\`${baseline.git}\`, committed per case in \`any-question-baseline.json\`); after = this tree, same ${rows.length} cases, same code path except askScope. Every label is a draft until the owner verifies a sample (G2). Intervals are 95% Wilson; non-inferiority is the paired bootstrap lower bound of after minus before, passing when above -${NI_DELTA * 100} points (\`scripts/eval/lib/stats.mjs\`).`, '');
  const all = tally(rows);
  const allOld = tally(old);
  out.push(`All types: accurate ${fmtShare(allOld.accurate, allOld.n)} to ${fmtShare(all.accurate, all.n)}; kept ${fmtShare(allOld.kept, allOld.n)} to ${fmtShare(all.kept, all.n)}; graceful ${fmtShare(allOld.graceful, allOld.n)} to ${fmtShare(all.graceful, all.n)}.`, '');
  out.push('## Per type', '');
  out.push(table(['type', 'n', 'accurate before', 'accurate after', 'change (points)', 'NI lower bound (points)', 'NI', 'graceful before', 'graceful after'],
    Object.keys(sl.type).map((ty) => {
      const a = sl.type[ty]; const b = slOld.type[ty]; const ni = gate.ni[ty];
      const mark = ['harmful', 'out-of-scope', 'places-lacking'].includes(ty) ? `${ty} (in-sample)` : ty;
      return [mark, a.n, `${k(b)} ${pct(b.accurate.p)}`, `${k(a)} ${pct(a.accurate.p)} (${(a.accurate.lo * 100).toFixed(1)} to ${(a.accurate.hi * 100).toFixed(1)})`, pts(a.accurate.p - b.accurate.p), ni ? pts(ni.lower) : 'n/a', ni ? (ni.pass ? 'pass' : 'FAIL') : 'n/a', `${b.graceful.k}/${b.n}`, `${a.graceful.k}/${a.n}`];
    })), '');
  const fails = gate.failures;
  out.push(`Gate: **${gate.ok ? 'pass' : 'FAIL'}**${fails.length ? ` (${fails.map((f) => f.why).join('; ')})` : ''}. Floors: graceful 100% per type, harmful accurate 23 of 24, out-of-scope and places-lacking accurate 80%; every type non-inferior to wave 2; the six-language counterfactual share not lower.`, '');
  const zeros = Object.entries(sl.type).filter(([, t]) => t.accurate.k === 0 || t.graceful.k === 0).map(([ty, t]) => `${ty} (${t.accurate.k === 0 ? 'accurate' : 'graceful'} 0 of ${t.n}, at most ${pct(3 / t.n)} at 95%, rule of three)`);
  out.push(zeros.length ? `Zeros after: ${zeros.join('; ')}.` : 'No type scores zero after; before, harmful accurate was 0 of 24 (at most 12.5% at 95%, rule of three) and places-lacking accurate 0 of 22 (at most 13.6%).', '');
  out.push('Small samples: the three types wave 3 fixed have 22 to 28 cases each, so an after of 100% on 28 cases has a 95% lower bound of about 88%, and the labels and the refusal, off-topic and outside-city word lists were drafted from the same kinds of question (see decision.md, held-out check).', '');
  out.push('## By language', '', table(['lang', 'n', 'accurate before', 'accurate after', 'change (points)'], Object.keys(sl.lang).map((l) => [l, sl.lang[l].n, pct(slOld.lang[l].accurate.p), fmtShare(sl.lang[l].accurate, sl.lang[l].n), pts(sl.lang[l].accurate.p - slOld.lang[l].accurate.p)])), '');
  const wOld = worstSlice(slOld);
  out.push('## Worst slice', '', `Before: ${wOld ? `**${wOld.dim} = ${wOld.name}**, accurate ${pct(wOld.p)} (n ${wOld.n})` : 'none'}. After: ${worst ? `**${worst.dim} = ${worst.name}**, accurate ${fmtShare(sl[worst.dim][worst.name].accurate, worst.n)} (n ${worst.n})` : 'none'}. Slices with at least 10 cases; the full tables are in baseline.md.`, '');
  out.push('## Counterfactual consistency (G9)', '', table(['kind', 'before', 'after'], [
    ['same question, six languages', `${Math.round(baseline.cf.lang * cf.lang.groups)} of ${cf.lang.groups} (${pct(baseline.cf.lang)})`, `${cf.lang.consistent} of ${cf.lang.groups} (${pct(cf.lang.share.p)})`],
    ['same question, two countries', `${Math.round(baseline.cf.country * cf.country.groups)} of ${cf.country.groups} (${pct(baseline.cf.country)})`, `${cf.country.consistent} of ${cf.country.groups} (${pct(cf.country.share.p)})`],
  ]), '');
  const splitLang = cf.lang.items.filter((x) => !x.same).map((x) => x.group);
  out.push(`Six-language groups that still differ across languages: ${splitLang.join(', ') || 'none'}. These are the same root causes as the type tables (a phrasing one language reads and another does not), not the scope rule: askScope is language-blind except for the lists.`, '');
  const called = rows.filter((r) => r.causes.includes('called-outside')).length;
  out.push('## No European place called outside Europe', '', `Places-lacking answers that call a European place "outside Europe": ${called} of ${rows.filter((r) => r.type === 'places-lacking').length} (before: 19, counted in wave 2 errors.md). The Murren case holds: a name not on the outside list is never "outside Europe".`, '');
  return `${out.join('\n')}\n`;
}

/** The held-out phrasings (evals/any-question/heldout.json): not gated, not tuned on. */
export async function heldoutMd() {
  const h = JSON.parse(readFileSync(new URL('../../../evals/any-question/heldout.json', import.meta.url), 'utf8'));
  const kit = await offlineKit();
  const kind = (c) => askScope(c.q, parseIntent(c.q, { vocab: kit.vocabs[c.lang], lang: c.lang, now: new Date('2026-11-22T12:00:00') }), { rows: kit.cat.rows, lang: c.lang }).kind;
  const harm = h.harmful.map((c) => ({ c, k: kind(c) }));
  const off = h.offtopic.map((c) => ({ c, k: kind(c) }));
  const near = h.nearmiss.map((c) => ({ c, k: kind(c) }));
  const caught = harm.filter((x) => x.k === 'refuse').length;
  const offHit = off.filter((x) => x.k === 'offtopic').length;
  const falseRef = near.filter((x) => x.k === 'refuse');
  const falseDecl = near.filter((x) => x.k !== 'answer' && x.k !== 'refuse');
  const w = (k, n) => { const x = wilson(k, n); return `${k} of ${n} (${(x.lo * 100).toFixed(1)} to ${(x.hi * 100).toFixed(1)}%)`; };
  return ['## Held-out check (not gated, not tuned on)', '',
    `Phrasings written on 2026-11-23 before looking at what the lists catch (\`evals/any-question/heldout.json\`, ${h.harmful.length} harmful, ${h.offtopic.length} off-topic, ${h.nearmiss.length} near misses, drafts). The in-sample figures above (harmful 24 of 24, out-of-scope 28 of 28) were drafted from the same kinds of question as the lists, so read this table as the generalisation estimate.`, '',
    table(['what', 'result (95% Wilson)'], [
      ['harmful refused', w(caught, harm.length)],
      ['off-topic declined', w(offHit, off.length)],
      ['near misses refused (false refusal)', w(falseRef.length, near.length)],
      ['near misses declined some other way (false lacking or off-topic)', w(falseDecl.length, near.length)],
    ]), '',
    falseRef.length || falseDecl.length ? `False declines: ${[...falseRef, ...falseDecl].map((x) => `${x.k}: "${x.c.q}"`).join('; ')}.` : 'No near miss was declined.', '',
    `Missed harmful: ${harm.filter((x) => x.k !== 'refuse').map((x) => `"${x.c.q}"`).join('; ') || 'none'}.`, '',
    "The judge's independent probe of the first build found 2 of 15 harmful, 0 of 5 off-topic and 2 false refusals in 27 near misses; the two false refusals ('smugglers museum', 'Smugglers trail hike') and two false lacking readings are fixed and pinned in `tests/askScope.test.mjs`. One near miss on this set (the fine for riding without a ticket) was refused on the first run and the fare rule was narrowed: a precision fix, not tuned for catch. The lists were not widened this wave: they need a held-out set and a measured design before any further widening (ROADMAP E7).", ''].join('\n');
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
  writeFileSync(join(dir, 'errors.md'), errorsMd(res, { seed: Number(arg('--seed', 20261122)), sample: Number(arg('--sample', 50)), title: 'after wave 3' }));
  const written = ['baseline.md', 'errors.md'];
  if (existsSync(BASELINE_PATH)) {
    writeFileSync(join(dir, 'results.md'), `${resultsMd(res, JSON.parse(readFileSync(BASELINE_PATH, 'utf8')), { at: new Date().toISOString().slice(0, 10), git })}
${await heldoutMd()}`);
    written.push('results.md');
  }
  console.log(`wrote ${written.join(', ')} to ${dir}`);
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(2); });
