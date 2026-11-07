/*
 * Adapter: suggest-city on fixture decks (T1206, register rows T1140-b and
 * T1138-c). It guards the suggest-city prompt.
 *
 * Each case of scripts/eval/suggest-city/set.json goes through the path
 * supabase/functions/suggest-city/index.ts takes: sanitizeTownCandidates,
 * guardCityInput, buildPrompt (with the system rules), then the recorded
 * model answer through parseModelJson (loose, as a grounded call is read),
 * guardCityOutput, sanitizeSuggestions and guardCityPayload. What survives
 * is checked by rules (1 to 5 suggestions, only real candidates, no
 * duplicate, discoveries within 400 km of the stay, a short why with no
 * link or dash) and scored against the gold wish fit (good and avoid ids).
 *
 * The answers come from scripts/eval/suggest-city/answers.json (hand-written
 * with planted faults; deterministic, what CI runs) or from --answers <file>
 * (a live run's raw model texts), which makes it the quality eval of a model.
 * No model is called here.
 *
 * Gate: every prompt check and every rule check on every case. Wish fit
 * (precision on the gold) is reported, gated only at 0.5 or more.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeResult, REPO } from '../lib/results.mjs';
import { buildPrompt, LANG_NAMES } from '../../../../supabase/functions/suggest-city/prompt.mjs';
import { sanitizeSuggestions, sanitizeTownCandidates } from '../../../../supabase/functions/suggest-city/logic.mjs';
import { cleanText, haversineKm } from '../../../../supabase/functions/plan-day/logic.mjs';
import { guardCityInput, guardCityOutput, guardCityPayload, scanOutput, systemRules, LIMITS } from '../../../../supabase/functions/_shared/aiGuard.mjs';
import { parseModelJson } from '../../../../supabase/functions/_shared/aiModels.mjs';

export const id = 'suggest-city';
export const title = 'Suggest-city rules and wish fit on fixture decks';

export const DIR = join(REPO, 'continent-app', 'scripts', 'eval', 'suggest-city');
export const SET_PATH = join(DIR, 'set.json');
export const ANSWERS_PATH = join(DIR, 'answers.json');
export const MIN_PRECISION = 0.5;
export const MAX_KM = 400;
const NONCE = '0123456789ab';

const J = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** The rule checks on what reaches the traveller. Pure: [name, ok, why][]. */
export function checkSuggestions(c, candidates, suggestions) {
  const ids = new Set(candidates.map((x) => x.id));
  const seen = new Set();
  const dup = suggestions.some((s) => s.id && (seen.has(s.id) || !seen.add(s.id)));
  const far = suggestions.filter((s) => !s.inCatalog && !(Number.isFinite(s.lat) && haversineKm(c.stay.lat, c.stay.lon, s.lat, s.lon) <= MAX_KM));
  const badWhy = suggestions.filter((s) => !s.why || s.why.length > 200 || /[\u2013\u2014]/.test(s.why) || scanOutput(s.why).issues.some((i) => ['url', 'markup', 'email', 'phone'].includes(i)));
  return [
    ['count', suggestions.length >= 1 && suggestions.length <= 5, `${suggestions.length} suggestions`],
    ['real_candidates', suggestions.every((s) => !s.inCatalog || ids.has(s.id)), 'an inCatalog suggestion is not in the deck'],
    ['no_duplicate', !dup, 'a candidate twice'],
    ['near_stay', !far.length, `discoveries beyond ${MAX_KM} km: ${far.map((s) => s.name).join(', ')}`],
    ['why_clean', !badWhy.length, `why missing, long, dashed or with a link: ${badWhy.map((s) => s.id || s.name).join(', ')}`],
  ];
}

/** The prompt checks: every candidate and the wish reach it fenced, the language and focus are asked, under the cap. */
export function promptChecks(c, prompt, candidates) {
  const fails = [];
  const block = (tag) => { const a = prompt.indexOf(`<<<DATA ${NONCE} ${tag}>>>`); return a < 0 ? null : prompt.slice(a, prompt.indexOf(`<<<END ${NONCE}>>>`, a)); };
  const cands = block('CANDIDATES');
  if (cands == null) fails.push('no CANDIDATES data block');
  else for (const x of candidates) if (!cands.includes(JSON.stringify(x.id))) fails.push(`candidate ${x.id} not in the deck block`);
  if (c.freeText) { const w = block('WISH'); if (w == null || !w.includes(c.freeText)) fails.push('the wish is not inside the WISH data block'); }
  if (!prompt.includes(LANG_NAMES[c.lang] || 'English')) fails.push(`language ${c.lang} not named`);
  if (LIMITS.cityPromptChars && prompt.length > LIMITS.cityPromptChars) fails.push(`prompt ${prompt.length} characters, cap ${LIMITS.cityPromptChars}`);
  return fails;
}

/** One case through the shipped path. */
export function runCase(c, answerText) {
  const g = guardCityInput({ freeText: cleanText(c.freeText || '', 160), candidates: sanitizeTownCandidates(c.candidates) });
  const security = systemRules(NONCE);
  const prompt = buildPrompt({ stayLabel: 'their stay', focus: c.focus, interests: c.interests || [], freeText: g.freeText, lang: c.lang, candidates: g.candidates, groundedFormat: true, nonce: NONCE });
  const pFails = promptChecks(c, prompt, g.candidates);
  const out = guardCityOutput(parseModelJson(answerText ?? '', { loose: true }), { systemText: `${security}\n${prompt}` });
  if (!out.value) return { pFails, rejected: out.reason || 'no answer', suggestions: [], candidates: g.candidates };
  const sug = sanitizeSuggestions(out.value.suggestions, g.candidates, c.stay);
  const payload = guardCityPayload({ suggestions: sug, meta: {} });
  return { pFails, rejected: payload ? null : 'payload', suggestions: payload ? payload.suggestions : [], candidates: g.candidates, dropped: (out.value.suggestions.length - sug.length) + out.dropped, repaired: out.repaired };
}

export async function run({ answers = null } = {}) {
  const set = J(SET_PATH);
  const rec = J(answers || ANSWERS_PATH);
  const rows = set.cases.map((c) => {
    const r = runCase(c, rec.answers?.[c.id] ?? null);
    const checks = checkSuggestions(c, r.candidates, r.suggestions);
    const cat = r.suggestions.filter((s) => s.inCatalog);
    return {
      id: c.id, ...r, checks,
      good: cat.filter((s) => c.gold.good.includes(s.id)).length,
      avoid: cat.filter((s) => c.gold.avoid.includes(s.id)).length,
      catalog: cat.length,
      topFits: !!cat[0] && c.gold.good.includes(cat[0].id),
    };
  });
  const r4 = (x) => Math.round(x * 10000) / 10000;
  const sum = (k) => rows.reduce((t, r) => t + (r[k] || 0), 0);
  const ruleOk = (r) => !r.rejected && r.checks.every((x) => x[1]);
  const rulesPass = rows.filter(ruleOk).length / rows.length;
  const precision = sum('catalog') ? sum('good') / sum('catalog') : 0;
  const failures = [];
  for (const r of rows) {
    for (const f of r.pFails) failures.push({ key: `${r.id}.prompt`, was: null, now: null, why: f });
    if (r.rejected) failures.push({ key: `${r.id}.answer`, was: null, now: r.rejected, why: 'the answer was rejected by the shipped path' });
    for (const [k, ok, why] of r.checks) if (!ok) failures.push({ key: `${r.id}.${k}`, was: null, now: null, why });
  }
  if (precision < MIN_PRECISION) failures.push({ key: 'precision_good', was: MIN_PRECISION, now: r4(precision), why: 'fewer than half the catalogue suggestions fit the wish' });
  return makeResult({
    eval: id, title, kind: 'llm-plan',
    status: failures.length ? 'fail' : 'pass', gated: true,
    headline: { key: 'rules_pass', value: r4(rulesPass), label: `cases meeting every rule (${answers ? 'recorded answers' : 'reference answers'})`, higher_is_better: true },
    metrics: {
      rules_pass: r4(rulesPass),
      precision_good: r4(precision),
      avoid_share: sum('catalog') ? r4(sum('avoid') / sum('catalog')) : null,
      top_fits: r4(rows.filter((r) => r.topFits).length / rows.length),
      dropped: sum('dropped'),
      repaired: sum('repaired'),
      prompt_check_fails: rows.reduce((t, r) => t + r.pFails.length, 0),
      cases: rows.length,
    },
    gate: { ok: !failures.length, rule: `every prompt and rule check on every case, wish precision ${MIN_PRECISION} or more`, tolerance: null, baseline: null, failures },
    cases: { n: rows.length, passed: rows.filter((r) => ruleOk(r) && !r.pFails.length).length },
    inputs: { set: 'continent-app/scripts/eval/suggest-city/set.json', version: set.version, answers: answers || 'continent-app/scripts/eval/suggest-city/answers.json', model: rec.model ?? null },
    notes: [answers ? 'Scored on recorded model answers.' : 'Reference answers: this checks the prompt and the shipped path, not a model. Record live answers and pass --answers to score one.'],
  });
}
