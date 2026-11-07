/*
 * Plan-day eval (T1148, ROADMAP F6): cases, a reference planner, the rule
 * checks, the calibration sample and the judge prompt.
 *
 * A case is one "Let Carta plan" request: a city, the traveller's answers
 * and a candidate deck of 12 real places (the city's dossier highlights,
 * passed through the Edge Function's own sanitizeCandidates). A plan is
 * what plan-day's model returns: { summary, stops: [{ id, name, dwellMin,
 * why, inCatalog }] }. The rule checks run the plan through the SHIPPED
 * sanitizeAiStops and scheduleDay (supabase/functions/plan-day/logic.mjs),
 * so a plan is judged on the walk the app would really build from it.
 *
 * Nothing here calls a model. The optional judge (judge.mjs) does, on the
 * pipeline's Gemini key or as a file of verdicts written in a session.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanText, haversineKm, sanitizeAiStops, sanitizeCandidates, scheduleDay } from '../../../../supabase/functions/plan-day/logic.mjs';
import { frag, loadPrompt } from '../../../../scripts/prompts/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const DIR = here;
export const CASES_PATH = join(here, 'cases.json');
export const SAMPLE_PATH = join(here, 'sample.json');
export const SAMPLE_KEY_PATH = join(here, 'sample-key.json');
export const LABELS_PATH = join(here, 'labels.json');
export const JUDGMENTS_DIR = join(here, 'judgments');
const DOSSIER = resolve(here, '../../../public/dossier');

// The cities of the set: big and mid-size, north to south, each with the
// full 12 dossier highlights. Changing this list is a new set version.
export const CITIES = ['BCN', 'AMS', 'PRG', 'VIE', 'LIS', 'BER', 'FLR', 'EDI', 'BRU', 'MUC',
  'BUD', 'KRK', 'CPH', 'DUB', 'NAP', 'ATH', 'LJU', 'SZG', 'TLL', 'OPO'];
export const SET_VERSION = 1;

/* ---- what a place is ---- */

const CULTURE = /museum|gallery|church|cathedral|basilica|chapel|abbey|monastery|palace|castle|fortress|fort\b|monument|memorial|ruin|archaeolog|theatre|theater|opera|library|synagogue|mosque|temple|tower|hall|historic|heritage|building|architecture|art/i;
const ACTIVE = /park|garden|hill|mountain|peak|view|lookout|beach|lake|river|zoo|nature|forest|island|waterfront|harbour|harbor|bridge|trail|cliff|cave|botanic/i;

export function placeCat(kind = '', name = '') {
  const s = `${kind} ${name}`;
  if (ACTIVE.test(s)) return 'active';
  if (CULTURE.test(s)) return 'culture';
  return 'sight';
}

const DWELL = [[/museum|gallery|palace|castle|zoo/i, 90], [/cathedral|church|basilica|abbey|monastery|temple|synagogue|mosque/i, 35], [/park|garden|botanic|beach|hill/i, 50], [/square|bridge|monument|memorial|view|tower/i, 25]];
const dwellFor = (kind) => (DWELL.find(([re]) => re.test(kind)) || [null, 40])[1];

/* ---- the case set ---- */

const PACES = ['balanced', 'relaxed', 'packed', 'balanced', 'relaxed'];
const VIBES = ['mix', 'culture', 'active', 'classic', 'culture', 'mix', 'active'];
const GROUPS = [2, 2, 4, 6, 1, 3];
const WALK_KM = [10, 8, 12, 7, 15, 9];

export const PACE_RANGE = { relaxed: [3, 4], balanced: [5, 6], packed: [7, 8] };

/** Build the set from the shipped dossiers (deterministic; committed as cases.json). */
export function buildCases() {
  const cases = [];
  CITIES.forEach((code, i) => {
    const file = join(DOSSIER, `${code}.json`);
    if (!existsSync(file)) throw new Error(`no dossier for ${code}`);
    const d = JSON.parse(readFileSync(file, 'utf8'));
    const hl = (d.highlights || []).filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lon)).slice(0, 12);
    const ranked = [...hl].sort((a, b) => (b.rank_score ?? 0) - (a.rank_score ?? 0));
    const top2 = new Set(ranked.slice(0, 2).map((h) => h.id));
    const raw = hl.map((h, k) => ({
      id: `h${k}`,
      name: h.name,
      kind: h.kind || '',
      cat: placeCat(h.kind, h.name),
      lat: h.lat,
      lon: h.lon,
      rating: Math.max(0, Math.min(10, h.rank_score ?? 5)),
      mustSee: top2.has(h.id),
      dwellMin: dwellFor(`${h.kind} ${h.name}`),
      desc: '',
    }));
    const candidates = sanitizeCandidates(raw);
    // Every second case names one place: a mid-ranked one, so it is a real ask.
    const mid = ranked[Math.min(5, ranked.length - 1)];
    const named = i % 2 === 1 && mid ? [candidates[hl.indexOf(mid)].id] : [];
    const withStay = i % 3 === 0;
    cases.push({
      id: `pd${String(i + 1).padStart(2, '0')}`,
      city: d.place.name,
      country: d.place.country,
      code,
      date: `2027-${String((i % 9) + 4).padStart(2, '0')}-${String((i % 20) + 5).padStart(2, '0')}`,
      answers: {
        pace: PACES[i % PACES.length],
        vibe: VIBES[i % VIBES.length],
        groupSize: GROUPS[i % GROUPS.length],
        maxWalkKm: WALK_KM[i % WALK_KM.length],
        named,
      },
      stay: withStay ? { lat: d.place.lat, lon: d.place.lon } : null,
      candidates,
    });
  });
  return { version: SET_VERSION, built_from: 'continent-app/public/dossier/<code>.json highlights', cases };
}

export const loadCases = () => JSON.parse(readFileSync(CASES_PATH, 'utf8'));

/* ---- the reference planner (deterministic, runs in CI) ---- */

const centreOf = (c) => c.stay || {
  lat: c.candidates.reduce((s, x) => s + x.lat, 0) / c.candidates.length,
  lon: c.candidates.reduce((s, x) => s + x.lon, 0) / c.candidates.length,
};

/**
 * What a careful planner would do with only the deck: the named places,
 * then the best-rated places that fit the vibe, nearest first, cut to the
 * pace and to the walking budget as the shipped scheduleDay measures it.
 * It is the floor a model must beat, and the "good plan" half of the sample.
 */
export function referencePlan(c) {
  const a = c.answers;
  const [, hi] = PACE_RANGE[a.pace] || PACE_RANGE.balanced;
  const want = Math.min(hi, c.candidates.length);
  const centre = centreOf(c);
  const byId = new Map(c.candidates.map((x) => [x.id, x]));
  const value = (x) => x.rating + (x.mustSee ? 1 : 0) + (vibeFits(x, a.vibe) ? 3 : 0)
    - 0.35 * (haversineKm(centre.lat, centre.lon, x.lat, x.lon) ?? 0);
  // A packed day is quick visits: no stop longer than 45 minutes.
  const dwell = (x) => (a.pace === 'packed' ? Math.min(x.dwellMin, 45) : x.dwellMin);
  const picked = a.named.map((id) => byId.get(id)).filter(Boolean);
  const rest = c.candidates.filter((x) => !a.named.includes(x.id)).sort((x, y) => value(y) - value(x) || x.id.localeCompare(y.id));
  for (const x of rest) {
    if (picked.length >= want) break;
    const trial = [...picked, x];
    const s = scheduleDay(trial.map((y) => ({ ...toStop(y), dwellMin: dwell(y) })), { stay: c.stay, groupSize: a.groupSize, maxWalkKm: a.maxWalkKm });
    if (s.farDropped === 0 && s.totalKm <= a.maxWalkKm && s.endTime <= '18:00') picked.push(x);
  }
  return {
    summary: `A ${a.pace} day in ${c.city} built around its best-rated places, kept within ${a.maxWalkKm} km of walking.`,
    stops: picked.map((x) => ({
      id: x.id, name: x.name, dwellMin: dwell(x), inCatalog: true,
      why: a.named.includes(x.id) ? `You asked for ${x.name}, so the day is built around it.` : `${x.name} is one of the best-rated places nearby, rated ${x.rating.toFixed(1)} by travellers.`,
    })),
  };
}

const toStop = (x) => ({ id: x.id, name: x.name, lat: x.lat, lon: x.lon, dwellMin: x.dwellMin });

export function vibeFits(x, vibe) {
  if (vibe === 'culture') return x.cat === 'culture';
  if (vibe === 'active') return x.cat === 'active';
  if (vibe === 'classic') return x.mustSee || x.rating >= 8;
  return true;
}

/* ---- the rule checks ---- */

const DASH = /[–—]/;

/**
 * Score one plan against its case. Each check is [name, ok, detail]. The
 * plan passes when every check passes. The walk is the one scheduleDay
 * builds from the stops sanitizeAiStops keeps, exactly as plan-day does.
 */
export function checkPlan(c, plan) {
  const a = c.answers;
  const centre = centreOf(c);
  const { stops, dropped } = sanitizeAiStops(plan?.stops, c.candidates, centre, { maxStops: 10, maxExternal: 0 });
  const day = scheduleDay(stops, { stay: c.stay, groupSize: a.groupSize, maxWalkKm: a.maxWalkKm });
  const ids = stops.map((s) => s.id);
  const [lo, hi] = PACE_RANGE[a.pace] || PACE_RANGE.balanced;
  const n = stops.length;
  const deck = c.candidates.length;
  const missing = a.named.filter((id) => !ids.includes(id));
  const byId = new Map(c.candidates.map((x) => [x.id, x]));
  const free = stops.filter((s) => !a.named.includes(s.id)).map((s) => byId.get(s.id));
  const fitting = free.filter((x) => vibeFits(x, a.vibe)).length;
  const fit = free.length ? fitting / free.length : 1;
  // Half the free picks should fit the vibe, or as many as the deck holds.
  const fitAvail = c.candidates.filter((x) => !a.named.includes(x.id) && vibeFits(x, a.vibe)).length;
  const fitNeed = Math.min(fitAvail, Math.ceil(free.length / 2));
  const whys = (plan?.stops || []).map((s) => String(s?.why ?? ''));
  const texts = [String(plan?.summary ?? ''), ...whys];
  const checks = [
    ['valid', n > 0 && dropped === 0, dropped ? `${dropped} stop(s) not in the deck or repeated` : `${n} stops`],
    ['named', missing.length === 0, missing.length ? `missing ${missing.map((id) => byId.get(id)?.name || id).join(', ')}` : (a.named.length ? 'all named places in' : 'none named')],
    ['pace', n >= Math.min(lo, deck) && n <= Math.min(hi, deck), `${n} stops for ${a.pace} (${lo} to ${hi})`],
    ['walk', day.farDropped === 0 && day.totalKm <= a.maxWalkKm, `${day.totalKm} km of ${a.maxWalkKm} km, ${day.farDropped} stop(s) out of reach`],
    ['hours', day.endTime <= '18:00', `ends ${day.endTime}`],
    ['vibe', a.vibe === 'mix' || fitting >= fitNeed, `${fitting} of ${free.length} free picks fit "${a.vibe}" (${fitNeed} needed, ${Math.round(fit * 100)} percent)`],
    ['text', texts[0].trim().length > 0 && whys.length > 0 && whys.every((w) => w.trim().length >= 12 && w.length <= 240) && !texts.some((t) => DASH.test(t)),
      texts.some((t) => DASH.test(t)) ? 'a dash in the text' : (whys.some((w) => w.trim().length < 12) ? 'an empty or bare why line' : 'clean')],
  ];
  const passed = checks.filter((x) => x[1]).length;
  return { verdict: passed === checks.length ? 'pass' : 'fail', score: passed / checks.length, checks, walk: { km: day.totalKm, ends: day.endTime, stops: n } };
}

/* ---- the calibration sample ---- */

// One deliberate fault per case, in turn; a fault that cannot apply to a
// case (no named place to drop) moves on to the next kind. "subtle" swaps a
// good pick for a weaker one that still meets every rule: a plan a judge
// should still pass, so the sample is not all easy calls.
export const FAULTS = ['drop-named', 'fake-id', 'overpacked', 'off-vibe', 'sloppy-text', 'too-far', 'subtle'];

function faulty(c, plan, kind) {
  const a = c.answers;
  const p = JSON.parse(JSON.stringify(plan));
  const centre = centreOf(c);
  const km = (x) => haversineKm(centre.lat, centre.lon, x.lat, x.lon) ?? 0;
  const used = new Set(p.stops.map((s) => s.id));
  const unused = c.candidates.filter((x) => !used.has(x.id));
  const mk = (x) => ({ id: x.id, name: x.name, dwellMin: x.dwellMin, inCatalog: true, why: `${x.name} is worth a stop, rated ${x.rating.toFixed(1)} by travellers.` });
  switch (kind) {
    case 'drop-named':
      if (!a.named.length) return null;
      p.stops = p.stops.filter((s) => !a.named.includes(s.id));
      if (unused[0]) p.stops.push(mk(unused[0]));
      return p;
    case 'fake-id':
      p.stops.splice(1, 0, { id: 'h99', name: `${c.city} Old Market Hall`, dwellMin: 45, inCatalog: true, why: 'A lively covered market with local food stalls.' });
      return p;
    case 'overpacked':
      p.stops = c.candidates.slice(0, 10).map(mk);
      return p;
    case 'off-vibe': {
      if (a.vibe === 'mix') return null;
      const off = c.candidates.filter((x) => !vibeFits(x, a.vibe) && !a.named.includes(x.id));
      if (off.length < 2) return null;
      const keep = p.stops.filter((s) => a.named.includes(s.id));
      p.stops = [...keep, ...off.slice(0, Math.max(1, p.stops.length - keep.length)).map(mk)];
      return p;
    }
    case 'sloppy-text':
      p.summary = `Your day in ${c.city} — enjoy!`;
      p.stops = p.stops.map((s, k) => ({ ...s, why: k % 2 ? 'Nice.' : s.why }));
      return p;
    case 'too-far': {
      const far = [...c.candidates].sort((x, y) => km(y) - km(x));
      const spread = [far[0], far[far.length - 1], far[1], far[far.length - 2], far[2]].filter(Boolean);
      const keep = p.stops.filter((s) => a.named.includes(s.id));
      p.stops = [...keep, ...spread.filter((x) => !a.named.includes(x.id)).slice(0, Math.max(3, p.stops.length - keep.length)).map(mk)];
      return p;
    }
    case 'subtle': {
      const weak = [...unused].sort((x, y) => x.rating - y.rating);
      const k = p.stops.findIndex((s) => !a.named.includes(s.id));
      if (k < 0 || !weak.length) return null;
      p.stops[k] = mk(weak[weak.length - 1]);
      return p;
    }
    default:
      return null;
  }
}

/** 40 plans: each case's reference plan and one faulty one, shuffled by a fixed hash. */
export function buildSample(set = loadCases()) {
  const rows = [];
  set.cases.forEach((c, i) => {
    const ref = referencePlan(c);
    rows.push({ caseId: c.id, variant: 'reference', plan: ref });
    for (let t = 0; t < FAULTS.length; t++) {
      const kind = FAULTS[(i + t) % FAULTS.length];
      const p = faulty(c, ref, kind);
      if (p) { rows.push({ caseId: c.id, variant: kind, plan: p }); break; }
    }
  });
  const h = (s) => createHash('sha256').update(s).digest('hex');
  rows.sort((x, y) => h(`${x.caseId}/${x.variant}`).localeCompare(h(`${y.caseId}/${y.variant}`)));
  const byCase = new Map(set.cases.map((c) => [c.id, c]));
  const plans = rows.map((r, k) => {
    const c = byCase.get(r.caseId);
    return {
      planId: `p${String(k + 1).padStart(2, '0')}`,
      request: { city: c.city, country: c.country, date: c.date, ...c.answers, named: c.answers.named.map((id) => ({ id, name: c.candidates.find((x) => x.id === id)?.name })), startsFromStay: !!c.stay },
      candidates: c.candidates.map(({ id, name, kind, cat, rating, mustSee, dwellMin, lat, lon }) => ({ id, name, kind, cat, rating, mustSee, dwellMin, lat, lon })),
      plan: r.plan,
    };
  });
  const key = Object.fromEntries(rows.map((r, k) => [`p${String(k + 1).padStart(2, '0')}`, { caseId: r.caseId, variant: r.variant }]));
  return { sample: { version: set.version, n: plans.length, plans }, key };
}

/* ---- the judge prompt ---- */

// The rubric and the judge prompt's framing are the registry's eval-judge prompt
// (prompts/eval-judge, T1140, E5); rubric.md beside this file is gone.
const judgeFrag = (name) => frag(loadPrompt('eval-judge'), name);
export const rubricText = () => judgeFrag('rubric');
export const rubricSha = () => createHash('sha256').update(rubricText()).digest('hex').slice(0, 12);

/** The full prompt for one plan: the rubric, then the request and the plan as data. */
export function judgePrompt(p) {
  return [
    rubricText(),
    '',
    judgeFrag('request'),
    JSON.stringify(p.request),
    '',
    judgeFrag('candidates'),
    JSON.stringify(p.candidates),
    '',
    judgeFrag('plan'),
    JSON.stringify(p.plan),
  ].join('\n');
}

export const JUDGE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    named: { type: 'INTEGER' }, pace: { type: 'INTEGER' }, walk: { type: 'INTEGER' },
    vibe: { type: 'INTEGER' }, catalogue: { type: 'INTEGER' }, text: { type: 'INTEGER' },
    verdict: { type: 'STRING', enum: ['pass', 'fail'] },
    reason: { type: 'STRING' },
  },
  required: ['named', 'pace', 'walk', 'vibe', 'catalogue', 'text', 'verdict', 'reason'],
};

export const clean = (s) => cleanText(s, 300);
