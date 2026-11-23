/*
 * Adapter: the any-question eval (ROADMAP E1, wave 2 of the ai fix program).
 *
 * What it asks: for each of the 14 kinds of question a traveller puts to Ask
 * Carta, how often does today's offline answer path (parseIntent, the
 * follow-up binding, outsidePlace, answerFacts, composeAnswer, unknownNote:
 * the code the app runs before any model) give a correct, kept and graceful
 * answer, and does it give the same facts across languages and countries?
 *
 * The set is evals/any-question/set.json (drafted labels, README.md there).
 * The path is the rules path, as the Ask eval's own `rules` row: no retrieval,
 * so no index is needed and CI could run it. It needs the shipped catalogue:
 * continent-app/public/, or CARTA_PUBLIC for a read-only copy. Without one the
 * result is `skipped`, loudly, never a score of 0.
 *
 * Gated since wave 3 (E7): graceful 100% per type, floors on the three types wave 3
 * fixed, and paired non-inferiority per type against any-question-baseline.json (the
 * wave 2 scores). The scope rule is src/lib/ask/scope.js, the function the chat runs.
 * Without the catalogue the result is `skipped`, loudly, never a pass. CI has the
 * catalogue (it is in git) but not the gazetteer (gitignored): the towns the set names
 * come from evals/any-question/towns.json, so the gate runs in CI.
 * No model is called.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogueAvailable, gazetteerAvailable, publicPath, offlineKit } from '../ask-eval.mjs';
import { parseIntent } from '../../../src/lib/ask/intent.js';
import { answerFacts, monthsOf } from '../../../src/lib/ask/rank.js';
import { composeAnswer, unknownNote, scopeLines } from '../../../src/lib/ask/compose.js';
import { buildPack } from '../../../src/lib/ask/context.js';
import { askScope, needsGazetteer } from '../../../src/lib/ask/scope.js';
import { shardsFor, prepareTowns } from '../../../src/lib/search/gazetteer.js';
import { foldName } from '../../../src/lib/searchIndex.js';
import { bindFollowUp } from '../../../src/lib/ask/followup.js';
import { makeLabels } from '../../../src/lib/guidedSearch.js';
import { judge, slices, worstSlice, counterfactual, metricsOf, tally, fmtShare, gateOf, NI_DELTA } from '../any-question-lib.mjs';
import { plantAll, summarisePlants } from '../planted/plant.mjs';
import { makeResult, REPO } from '../lib/results.mjs';

export const id = 'any-question';
export const title = 'Any question: Ask answers by question type';
export const SET_PATH = join(REPO, 'evals', 'any-question', 'set.json');
export const BASELINE_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'any-question-baseline.json');

const SHOWN = 6; // places the app shows at first (AskTurn LIMIT)

const EMPTY = { intentType: null, outside: null, lacking: null, refused: false, offtopic: false, lead: '', picks: [], places: [], months: [], table: false, planned: false, notes: [], cant: null, priced: false, anchored: false };

// The gazetteer's towns for a name, read from the shipped shards (the app fetches the same files).
let gazetteerIndex = null;
const shardCache = new Map();
// CI has the catalogue but not the gazetteer (public/search/places/ is gitignored): the towns the set's
// lacking cases name are committed in evals/any-question/towns.json and read when the shards are absent.
export const TOWNS_PATH = join(REPO, 'evals', 'any-question', 'towns.json');
let fixtureTowns = null;
function townsFor(name) {
  if (!gazetteerAvailable()) {
    fixtureTowns ||= prepareTowns(JSON.parse(readFileSync(TOWNS_PATH, 'utf8')).towns);
    const key = foldName(name);
    return fixtureTowns.filter((t) => t.folds.includes(key));
  }
  gazetteerIndex ||= JSON.parse(readFileSync(publicPath('search/places/index.json'), 'utf8'));
  const out = [];
  for (const f of shardsFor(gazetteerIndex, foldName(name))) {
    if (!shardCache.has(f)) shardCache.set(f, prepareTowns(JSON.parse(readFileSync(publicPath(`search/places/${f}`), 'utf8'))));
    out.push(...shardCache.get(f));
  }
  return out;
}

/** One question through the offline path; returns what it answered (see any-question-lib.mjs) and its context pack. */
export function observe(c, kit, today) {
  const { cat, vocabs, tFor, linkFn } = kit;
  const t = tFor(c.lang);
  const byId = new Map(cat.rows.map((p) => [p.id, p]));
  const labels = { ...makeLabels({ t, lang: c.lang, guided: cat.guided, countries: cat.countries }), place: (x) => byId.get(x)?.city || x };
  const raw = parseIntent(c.q, { vocab: vocabs[c.lang], lang: c.lang, now: today, link: linkFn });
  const ref = c.prev?.ref || null;
  // The chat's own question, asked of the same function: refuse, decline, or answer.
  const name = needsGazetteer(c.q, raw, ref, { lang: c.lang });
  const scope = askScope(c.q, raw, { ref, lang: c.lang, rows: cat.rows, towns: name ? townsFor(name) : null });
  if (scope.kind !== 'answer') {
    const lines = scopeLines(scope, t);
    const picks = (scope.nearest || []).map((p) => ({ id: p.id, cc: p.cc }));
    const obs = {
      ...EMPTY, intentType: raw.type, lead: lines.lead, picks, places: picks.map((p) => p.id),
      refused: scope.kind === 'refuse', offtopic: scope.kind === 'offtopic',
      outside: scope.kind === 'outside' ? scope.place : null, lacking: scope.kind === 'lacking' ? scope.place : null,
    };
    return { obs, pack: null };
  }
  const intent = ref ? bindFollowUp(c.q, raw, ref) : raw;
  const facts = answerFacts(intent, { rows: cat.rows, byId, guided: cat.guided, today, limit: SHOWN });
  const answer = composeAnswer(facts, intent, { t, lang: c.lang, labels });
  const cant = unknownNote(intent, t);
  const picks = facts.picks.slice(0, SHOWN).map((p) => ({ id: p.id, cc: p.dest.iso2 }));
  const places = [...new Set([...picks.map((p) => p.id), facts.when?.id, ...(facts.compare || []).map((p) => p.id), ...(facts.plan?.order || [])].filter(Boolean))];
  const months = [...new Set([...monthsOf(intent), facts.query?.month].filter(Boolean))];
  const obs = {
    intentType: intent.type, outside: null, lead: answer.lead || '', picks, places, months,
    table: !!answer.table?.rows?.length, planned: !!facts.plan, notes: answer.notes || [], cant,
    priced: facts.picks.some((p) => p.price),
    anchored: !!(intent.places?.length || intent.facets?.country || intent.facets?.near),
  };
  let pack = null;
  if (facts.picks.length) {
    const monthsText = (d) => (d.climate?.best || []).map((m) => labels.month(m)).join(', ');
    const answerForPack = cant ? { ...answer, notes: [cant, ...answer.notes] } : answer;
    pack = buildPack({ question: c.q, lang: c.lang, facts: { ...facts, picks: facts.picks.slice(0, SHOWN) }, answer: answerForPack, passages: [], labels: { monthsText, estWord: t('money.est') } });
  }
  return { obs, pack };
}

/** The whole set, scored. rows hold the case's slice keys, its scores, causes and observation. */
export async function runSet({ set = JSON.parse(readFileSync(SET_PATH, 'utf8')), seedDrop = false } = {}) {
  const kit = await offlineKit();
  const today = new Date(`${set.now}T12:00:00`);
  const rows = [];
  const packs = [];
  for (const c of set.cases) {
    const { obs, pack } = observe(c, kit, today);
    let j = judge(c, obs);
    // A known regression, for the gate to catch (tests, `run.mjs --seed-drop`): every second accurate answer turns wrong.
    if (seedDrop && j.accurate && rows.length % 2 === 0) j = { ...j, accurate: false, graceful: false, causes: ['seeded'] };
    rows.push({
      id: c.id, type: c.type, lang: c.lang, country: c.slice?.country || 'none', place: c.slice?.place || 'none', persona: c.slice?.persona || 'none',
      cf: c.cf || null, q: c.q, expect: c.expect, obs, ...j,
    });
    if (pack) packs.push({ id: c.id, pack });
  }
  const sl = slices(rows);
  const cf = counterfactual(rows);
  const plants = plantAll(packs, { seed: 20261122, perKind: 3 });
  return { set, rows, sl, cf, worst: worstSlice(sl), plants: { list: plants, summary: summarisePlants(plants), packs: packs.length } };
}

export async function run(opts = {}) {
  if (!catalogueAvailable()) {
    return makeResult({
      eval: id, title, kind: 'text-check', status: 'skipped', gated: true,
      headline: { key: 'all.accurate', value: null, label: 'answers correct (skipped: no catalogue)', higher_is_better: true },
      gate: { ok: true, rule: 'skipped: the gate needs the shipped catalogue, so it did not run (not a pass)', tolerance: null, baseline: 'scripts/eval/any-question-baseline.json', failures: [] },
      notes: ['SKIPPED, not scored: no shipped catalogue (public/app_data.json, search_index.json, search/guided.json) found. Build continent-app/public/ or set CARTA_PUBLIC to a read-only copy of it. This is not a score of 0 and not a pass: the floors and the non-inferiority check did not run.'],
    });
  }
  const { set, rows, sl, cf, worst, plants } = await runSet({ seedDrop: !!opts.seedDrop });
  const all = tally(rows);
  const metrics = metricsOf(rows, sl, cf);
  const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : null;
  const gate = gateOf(rows, baseline, cf);
  for (const [type, n] of Object.entries(gate.ni)) { metrics[`ni.${type}.lower`] = Math.round(n.lower * 10000) / 10000; metrics[`ni.${type}.mean`] = Math.round(n.mean * 10000) / 10000; }
  metrics['called_outside'] = rows.filter((r) => r.causes.includes('called-outside')).length;
  for (const [k, v] of Object.entries(plants.summary.byKind)) metrics[`plants.${k}`] = v.total;
  metrics['plants.total'] = plants.summary.total;
  metrics['plants.coincident_share'] = plants.summary.coincidentShare == null ? null : Math.round(plants.summary.coincidentShare * 10000) / 10000;
  const notes = [
    `offline rules path, no retrieval; ${set.cases.length} drafted cases, labels are drafts until the owner verifies a sample`,
    `accurate ${fmtShare(all.accurate, all.n)}, kept ${fmtShare(all.kept, all.n)}, graceful ${fmtShare(all.graceful, all.n)}`,
  ];
  for (const [type, t] of Object.entries(sl.type)) {
    for (const s of ['accurate', 'kept', 'graceful']) if (t[s].k === 0) notes.push(`${type} ${s}: ${fmtShare(t[s], t.n)}`);
  }
  if (worst) notes.push(`worst slice: ${worst.dim} ${worst.name}, accurate ${fmtShare(sl[worst.dim][worst.name].accurate, worst.n)}`);
  return makeResult({
    eval: id,
    title,
    kind: 'text-check',
    status: gate.ok ? 'pass' : 'fail',
    gated: true,
    headline: { key: 'all.accurate', value: all.accurate.p, label: 'answers correct, offline path, all types', higher_is_better: true },
    metrics,
    gate: {
      ok: gate.ok,
      rule: `graceful 100% per type; harmful accurate 23 of 24, out-of-scope and places-lacking accurate 80%; per type non-inferior to wave 2 (delta ${NI_DELTA * 100} points, paired); six-language counterfactual share not lower${gate.unpaired ? `; ${gate.unpaired} cases not in the baseline are unpaired` : ''}`,
      tolerance: NI_DELTA,
      baseline: 'scripts/eval/any-question-baseline.json',
      failures: gate.failures,
    },
    cases: {
      n: all.n,
      passed: all.accurate.k,
      items: rows.map((r) => ({ id: r.id, type: r.type, lang: r.lang, country: r.country, place: r.place, persona: r.persona, cf: r.cf?.group || null, accurate: r.accurate, kept: r.kept, graceful: r.graceful, causes: r.causes })),
    },
    inputs: { set: set.version, cases: set.cases.length, types: set.types.length, path: 'rules', plants: plants.summary.total },
    notes,
  });
}
