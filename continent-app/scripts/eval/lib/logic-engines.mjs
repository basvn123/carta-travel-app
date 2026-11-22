/*
 * The logic engines' golden harness core (G1, ROADMAP G4): the golden sets,
 * the engine registry, the metrics and the slices. The adapter
 * (adapters/logic-engines.mjs) turns this into a carta-eval/1 result; the
 * shadow diff (shadow-diff.mjs) runs the same registry over the personas.
 *
 * Three sets, one per engine family of the logic audit
 * (.work/2026-11-17-app-logic-audit/proposal-simplify.md):
 *   month-fit        E5   is a place fine in a month (tests/fixtures/logic-golden/month-fit.json)
 *   rank             E6   P@k and nDCG@k of the For you order, and tie order (rank.json)
 *   day-feasibility  E8   a day ends before the day does, legs in order (day-feasibility.json)
 *
 * Every case states its answer and its source, and is one of two kinds:
 *   expect "current"  today's engine gives the stated answer: a regression guard, GATED
 *   expect "target"   the audit names the right answer and today's engine gives another:
 *                     REPORTED, not gated; it is the gap the engine wave closes and
 *                     turns "current" in the commit that closes it
 *
 * Each engine has an "old" path (the code that ships) and, once its wave
 * lands, a "new" path. The harness scores the path config/flags.json names
 * unless a path is asked for, so a wave shows its effect as a score diff.
 * The places are real ones, cut from the wire into places.json
 * (build-logic-fixture.mjs), so CI needs no public/ folder.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sortForYou } from '../../../src/lib/match.js';
import { bestMonthsFor } from '../../../src/lib/heatRisk.js';
import { buildDaySchedule, DAY_END_MIN, DINNER_EARLIEST_MIN } from '../../../src/planner/daySchedule.js';
import { flag } from '../../../src/lib/flags.js';

const here = dirname(fileURLToPath(import.meta.url));
export const APP = resolve(here, '../../..');
export const GOLDEN_DIR = resolve(APP, 'tests/fixtures/logic-golden');
export const CONFIG = JSON.parse(readFileSync(resolve(APP, 'config/logic-golden.json'), 'utf8'));
export const SETS = { 'month-fit': 'E5', rank: 'E6', 'day-feasibility': 'E8' };

const read = (name) => JSON.parse(readFileSync(resolve(GOLDEN_DIR, name), 'utf8'));
export const PLACES = Object.fromEntries(read('places.json').places.map((p) => [p.id, p]));
export const PERSONAS = Object.fromEntries(JSON.parse(readFileSync(resolve(APP, 'tests/personas_v5.json'), 'utf8')).personas.map((p) => [p.id, p]));
export const loadSet = (name) => read(`${name}.json`);

/* ---- metrics ---- */

export const pAtK = (ranked, gains, k) => ranked.slice(0, k).filter((id) => (gains[id] || 0) > 0).length / k;
export function ndcgAtK(ranked, gains, k) {
  const dcg = (ids) => ids.slice(0, k).reduce((s, id, i) => s + (gains[id] || 0) / Math.log2(i + 2), 0);
  const ideal = dcg(Object.entries(gains).sort((a, b) => b[1] - a[1]).map(([id]) => id));
  return ideal ? dcg(ranked) / ideal : 0;
}

/* ---- the old paths: what ships today ---- */

/** E5 today: a month is "fine" when the pipeline's climate.best holds it (heat months dropped for a guarded party). */
const monthFitOld = (place, month, { guard = false } = {}) => bestMonthsFor(place.climate, guard).best.includes(month);

/** E6 today: sortForYou over the pool; with no taste it keeps the pool's own order. */
const rankOld = (pool, taste, month) => sortForYou(pool, taste || {}, month ?? null).map((p) => p.id);

/** E8 today: buildDaySchedule, read the way the day screen reads it. */
function dayOld(c) {
  const stops = c.stops;
  const s = buildDaySchedule({
    items: stops, legMin: (i) => stops[i].legAfterMin ?? null, dwellMin: (it) => it.dwellMin,
    stayLegMin: c.stayLegMin || 0,
  });
  const gaps = s.rows.slice(1).map((r, i) => r.arriveMin - s.rows[i].departMin);
  return {
    fits: s.endMin <= DAY_END_MIN,
    legsInOrder: gaps.every((g, i) => g >= (stops[i].legAfterMin ?? 0)),
    dinnerNotEarly: !s.dinner || s.dinner.startMin >= DINNER_EARLIEST_MIN,
    lunchBetweenStops: !s.lunch || (s.lunch.startMin === s.rows[s.lunch.afterIndex].departMin),
    endMin: s.endMin,
  };
}

/** The registry: a wave registers its engine's new path here and flips config/flags.json. */
export const ENGINE_PATHS = { E5: { old: monthFitOld, new: null }, E6: { old: rankOld, new: null }, E8: { old: dayOld, new: null } };

export function pathFor(engine, which) {
  const p = which || (flag(engine) === 'new' ? 'new' : 'old');
  const fn = ENGINE_PATHS[engine]?.[p];
  if (!fn) throw new Error(`engine ${engine} has no "${p}" path yet`);
  return fn;
}

/* ---- scoring one case ---- */

const poolOf = (c) => (c.pool ? c.pool.map((id) => PLACES[id]) : Object.values(PLACES).filter((p) => !c.iso2 || p.iso2 === c.iso2));

export function scoreCase(setName, c, fn) {
  if (setName === 'month-fit') {
    if (c.coverage) {
      const n = Object.values(PLACES).filter((p) => fn(p, c.month, {})).length;
      return { pass: n >= c.coverage.min, got: n, want: `>= ${c.coverage.min}` };
    }
    const got = fn(PLACES[c.place], c.month, { guard: !!c.guard });
    return { pass: got === c.want, got, want: c.want };
  }
  if (setName === 'rank') {
    const taste = c.persona ? PERSONAS[c.persona].taste : c.taste;
    const month = c.persona ? PERSONAS[c.persona].month : c.month;
    const ranked = fn(poolOf(c), taste, month);
    if (c.order) return { pass: JSON.stringify(ranked.slice(0, c.order.length)) === JSON.stringify(c.order), got: ranked.slice(0, c.order.length), want: c.order };
    const gains = Object.fromEntries(c.relevant.map((id) => [id, 1]));
    const p = pAtK(ranked, gains, c.k); const n = ndcgAtK(ranked, gains, c.k);
    return { pass: p >= c.min_p_at_k, got: Math.round(p * 100) / 100, want: `P@${c.k} >= ${c.min_p_at_k}`, p_at_k: p, ndcg_at_k: n, top: ranked.slice(0, c.k) };
  }
  const got = fn(c);
  const bad = Object.entries(c.want).filter(([k, v]) => got[k] !== v);
  return { pass: !bad.length, got: Object.fromEntries(Object.keys(c.want).map((k) => [k, got[k]])), want: c.want, endMin: got.endMin };
}

/** Run every case of every set; `which` picks old or new for all, or null to follow the flags. */
export function runGolden({ which = null, sets = Object.keys(SETS) } = {}) {
  const out = [];
  for (const name of sets) {
    const set = loadSet(name);
    const fn = pathFor(SETS[name], which);
    for (const c of set.cases) {
      const r = scoreCase(name, c, fn);
      out.push({ set: name, engine: SETS[name], id: c.id, expect: c.expect, source: c.source, slices: c.slices || {}, ...r });
    }
  }
  return out;
}

/** Pass rate per slice value, over current and target cases separately. */
export function sliceTable(results) {
  const rows = new Map();
  for (const r of results) {
    for (const [dim, val] of Object.entries(r.slices)) {
      const key = `${dim}\t${val}`;
      const row = rows.get(key) || { dim, value: val, current: 0, currentPass: 0, target: 0, targetPass: 0 };
      if (r.expect === 'current') { row.current++; row.currentPass += r.pass ? 1 : 0; } else { row.target++; row.targetPass += r.pass ? 1 : 0; }
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.dim.localeCompare(b.dim) || a.value.localeCompare(b.value));
}

export const share = (n, d) => (d ? Math.round((n / d) * 10000) / 10000 : null);
