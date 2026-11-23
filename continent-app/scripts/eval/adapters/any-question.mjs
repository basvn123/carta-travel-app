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
 * Not gated this wave: a baseline. Wave 3 (A2g) turns graceful per type into a gate.
 * No model is called.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogueAvailable, offlineKit } from '../ask-eval.mjs';
import { parseIntent } from '../../../src/lib/ask/intent.js';
import { answerFacts, monthsOf } from '../../../src/lib/ask/rank.js';
import { composeAnswer, unknownNote } from '../../../src/lib/ask/compose.js';
import { buildPack } from '../../../src/lib/ask/context.js';
import { outsidePlace } from '../../../src/lib/ask/outside.js';
import { bindFollowUp, pointsBack } from '../../../src/lib/ask/followup.js';
import { makeLabels } from '../../../src/lib/guidedSearch.js';
import { judge, slices, worstSlice, counterfactual, metricsOf, tally, fmtShare } from '../any-question-lib.mjs';
import { plantAll, summarisePlants } from '../planted/plant.mjs';
import { makeResult, REPO } from '../lib/results.mjs';

export const id = 'any-question';
export const title = 'Any question: Ask answers by question type';
export const SET_PATH = join(REPO, 'evals', 'any-question', 'set.json');

const SHOWN = 6; // places the app shows at first (AskTurn LIMIT)

const EMPTY = { intentType: null, outside: null, lead: '', picks: [], places: [], months: [], table: false, planned: false, notes: [], cant: null, priced: false, anchored: false };

/** One question through the offline path; returns what it answered (see any-question-lib.mjs) and its context pack. */
export function observe(c, kit, today) {
  const { cat, vocabs, tFor, linkFn } = kit;
  const t = tFor(c.lang);
  const byId = new Map(cat.rows.map((p) => [p.id, p]));
  const labels = { ...makeLabels({ t, lang: c.lang, guided: cat.guided, countries: cat.countries }), place: (x) => byId.get(x)?.city || x };
  const raw = parseIntent(c.q, { vocab: vocabs[c.lang], lang: c.lang, now: today, link: linkFn });
  const ref = c.prev?.ref || null;
  // As AskTurn does: a follow-up that points back is never a place outside Europe.
  const outside = !(ref && pointsBack(c.q)) ? outsidePlace(c.q, raw) : null;
  if (outside) return { obs: { ...EMPTY, intentType: raw.type, outside, lead: t('askChat.outside.lead', { place: outside }) }, pack: null };
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
export async function runSet({ set = JSON.parse(readFileSync(SET_PATH, 'utf8')) } = {}) {
  const kit = await offlineKit();
  const today = new Date(`${set.now}T12:00:00`);
  const rows = [];
  const packs = [];
  for (const c of set.cases) {
    const { obs, pack } = observe(c, kit, today);
    const j = judge(c, obs);
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

export async function run() {
  if (!catalogueAvailable()) {
    return makeResult({
      eval: id, title, kind: 'text-check', status: 'skipped', gated: false,
      headline: { key: 'all.accurate', value: null, label: 'answers correct (skipped: no catalogue)', higher_is_better: true },
      notes: ['SKIPPED, not scored: no shipped catalogue found. Build continent-app/public/ or set CARTA_PUBLIC to a read-only copy of it. This is not a score of 0.'],
    });
  }
  const { set, rows, sl, cf, worst, plants } = await runSet();
  const all = tally(rows);
  const metrics = metricsOf(rows, sl, cf);
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
    status: 'pass', // a baseline: it ran
    gated: false,
    headline: { key: 'all.accurate', value: all.accurate.p, label: 'answers correct, offline path, all types', higher_is_better: true },
    metrics,
    gate: { ok: true, rule: 'not gated this wave: a baseline (wave 3 gates graceful per type)', tolerance: null, baseline: null, failures: [] },
    cases: {
      n: all.n,
      passed: all.accurate.k,
      items: rows.map((r) => ({ id: r.id, type: r.type, lang: r.lang, country: r.country, place: r.place, persona: r.persona, cf: r.cf?.group || null, accurate: r.accurate, kept: r.kept, graceful: r.graceful, causes: r.causes })),
    },
    inputs: { set: set.version, cases: set.cases.length, types: set.types.length, path: 'rules', plants: plants.summary.total },
    notes,
  });
}
