#!/usr/bin/env node
/*
 * The byte-identical proof for the prompt registry (T1140, ROADMAP E5).
 *
 *   node scripts/prompts/capture-golden.mjs --rev 55a09c9c01   (the last commit before the registry)
 *
 * Reads the JS prompt builders as they were in commit --rev (git show), runs
 * them over a fixed set of inputs that reaches every branch of every builder,
 * and writes the inputs and the exact outputs to prompts/_golden/js.json.
 * continent-app/tests/promptRegistry.test.mjs then runs today's builders,
 * which read the registry, over the same inputs and wants the same bytes.
 * The Python twin is scripts/prompts/capture_golden.py.
 *
 * Nothing here calls a model.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const rev = argv[argv.indexOf('--rev') + 1];
if (!argv.includes('--rev') || !rev) { console.error('usage: capture-golden.mjs --rev <commit before the registry>'); process.exit(2); }
const OUT = join(ROOT, 'prompts/_golden/js.json');

const show = (path) => execFileSync('git', ['show', `${rev}:${path}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const sha = (s) => createHash('sha256').update(s).digest('hex');
const tmp = mkdtempSync(join(tmpdir(), 'carta-golden-'));

/** A file of commit --rev, written into the temp folder at its repo path. */
function put(path, text = show(path)) {
  const to = join(tmp, path);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, text);
  return to;
}

/** An Edge Function's prompt code (LANG_NAMES to the end of buildPrompt) as an importable module. */
function edgeModule(fn) {
  const src = show(`supabase/functions/${fn}/index.ts`);
  const a = src.indexOf('const LANG_NAMES');
  const b = src.indexOf('async function sha256Hex');
  if (a < 0 || b < 0) throw new Error(`${fn}: markers not found`);
  const code = `import { dataBlock } from '../_shared/aiGuard.mjs';\n${stripTypeScriptTypes(src.slice(a, b))}\nexport { buildPrompt, RESPONSE_SCHEMA };\n`;
  return put(`supabase/functions/${fn}/old-prompt.mjs`, code);
}

const load = async (file) => import(pathToFileURL(file).href);

put('supabase/functions/_shared/aiGuard.mjs');
const guard = await load(join(tmp, 'supabase/functions/_shared/aiGuard.mjs'));
const planDay = await load(edgeModule('plan-day'));
const suggestCity = await load(edgeModule('suggest-city'));
const parseBooking = await load(edgeModule('parse-booking'));

// Ask: context.js imports three app modules; they are read from the same commit.
for (const p of ['continent-app/src/lib/ask/context.js', 'continent-app/src/lib/ask/rank.js', 'continent-app/src/lib/format.js', 'continent-app/src/lib/money.js']) put(p);
let ask = null;
try { ask = await load(join(tmp, 'continent-app/src/lib/ask/context.js')); } catch {
  // rank.js pulls more of the app; fall back to the live tree for the imports only.
  const src = show('continent-app/src/lib/ask/context.js').replace(/from '\.\.\/format\.js'/, `from '${pathToFileURL(join(ROOT, 'continent-app/src/lib/format.js')).href}'`)
    .replace(/from '\.\.\/money\.js'/, `from '${pathToFileURL(join(ROOT, 'continent-app/src/lib/money.js')).href}'`)
    .replace(/from '\.\/rank\.js'/, `from '${pathToFileURL(join(ROOT, 'continent-app/src/lib/ask/rank.js')).href}'`);
  ask = await load(put('continent-app/src/lib/ask/context-old.js', src));
}

// The judge: plan-day-lib reads rubric.md beside it and the sample from the live tree.
put('continent-app/scripts/eval/plan-day/rubric.md');
const libSrc = show('continent-app/scripts/eval/plan-day/plan-day-lib.mjs');
const judgeFns = (() => {
  const a = libSrc.indexOf('export const rubricText');
  const b = libSrc.indexOf('export const JUDGE_SCHEMA');
  return libSrc.slice(a, b);
})();
const judgeMod = await load(put('continent-app/scripts/eval/plan-day/old-judge.mjs',
  `import { readFileSync } from 'node:fs';\nimport { createHash } from 'node:crypto';\nconst RUBRIC_PATH = ${JSON.stringify(join(tmp, 'continent-app/scripts/eval/plan-day/rubric.md'))};\n${judgeFns}`));
const { readFileSync } = await import('node:fs');
const sample = JSON.parse(readFileSync(join(ROOT, 'continent-app/scripts/eval/plan-day/sample.json'), 'utf8'));

/* ---- inputs ---- */

const NONCE = 'n0nce7q';
const deck = [
  { id: 'h0', name: 'Belem Tower', kind: 'Tower', cat: 'culture', rating: 9.1, mustSee: true, dwellMin: 45, lat: 38.6916, lon: -9.216 },
  { id: 'h1', name: 'Jardim da Estrela', kind: 'Park', cat: 'active', rating: 7.8, mustSee: false, dwellMin: 40, lat: 38.7135, lon: -9.1597, desc: 'A green garden with a bandstand.' },
  { id: 'h2', name: 'Alfama', kind: 'Neighbourhood', cat: 'sight', rating: 8.6, mustSee: true, dwellMin: 60, lat: 38.7118, lon: -9.1302 },
];
const planBase = {
  city: 'Lisbon', country: 'Portugal', dateISO: '2027-05-14', month: 5, groupSize: 2, pace: 'balanced', vibe: 'mix',
  avoidHills: false, freeText: '', lang: 'en', hasStay: false, candidates: deck, wantEvents: false, refine: '',
  prevStops: [], profile: null, mustInclude: [], days: 1, nonce: NONCE,
};
const profiles = [
  {}, { steps: 12000, maxWalkKm: 9 }, { steps: 12000 }, { maxWalkKm: 8 }, { avoidHills: true, transitOk: true },
  { companions: 'family' }, { companions: 'solo' }, { companions: 'partner' }, { companions: 'group' },
  { known: 'first' }, { known: 'again' }, { window: 'morning' }, { window: 'afternoon' }, { window: 'evening' },
  { food: 'sit' }, { food: 'quick' }, { food: 'picnic' }, { food: 'none' }, { diet: ['vegan', 'halal'] }, { diet: [] },
  { avoidCrowds: true }, { indoor: true }, { stepFree: true }, { weather: { rain: true } }, { weather: { hot: true } },
  { weather: null }, { moods: ['slow mornings', 'markets'] }, { startTime: '08:00' },
];
const planCases = [
  {}, { pace: 'relaxed' }, { pace: 'packed' }, { pace: 'weird' },
  { days: 3 }, { days: 2, pace: 'relaxed' }, { days: 4, pace: 'packed' }, { days: 2, pace: 'weird' },
  { groupSize: 6 }, { groupSize: 5, month: 7 }, { month: 8 }, { month: 9 }, { avoidHills: true }, { hasStay: true },
  ...profiles.map((profile) => ({ profile })),
  { mustInclude: [{ name: 'Belem Tower', id: 'h0', lat: 38.69, lon: -9.21, timeOfDay: 'morning' }, { name: 'Pasteis shop', id: null, lat: null, lon: null, timeOfDay: null }] },
  { mustInclude: [{ name: 'Alfama', id: 'h2', lat: null, lon: null, timeOfDay: null }] },
  { freeText: 'A quiet day with good coffee and one viewpoint.' },
  { wantEvents: true }, { wantEvents: true, dateISO: '' },
  { refine: 'Fewer museums, more outdoors.', prevStops: ['Belem Tower', 'Alfama'] }, { refine: 'Shorter walk.', prevStops: [] },
  { lang: 'nl' }, { lang: 'it' }, { lang: 'xx' }, { city: 'Porto', country: 'Portugal', candidates: deck.slice(0, 1) }, { candidates: [] },
  {
    days: 2, pace: 'packed', groupSize: 7, month: 7, avoidHills: true, hasStay: true, freeText: 'Tiles and trams.', wantEvents: true,
    refine: 'More food.', prevStops: ['Alfama'], lang: 'de',
    profile: { steps: 15000, avoidHills: true, transitOk: true, companions: 'family', known: 'again', window: 'evening', food: 'picnic', diet: ['vegetarian'], avoidCrowds: true, indoor: true, stepFree: true, weather: { rain: true, hot: true }, moods: ['history'], startTime: '10:15' },
    mustInclude: [{ name: 'Alfama', id: 'h2', lat: null, lon: null, timeOfDay: 'evening' }],
  },
].map((over) => ({ ...planBase, ...over }));

const towns = [
  { id: 'BRG', name: 'Braga', country: 'Portugal', km: 55, rating: 8.1, tags: ['churches', 'old town'] },
  { id: 'GMR', name: 'Guimaraes', country: 'Portugal', km: 50, tags: ['castle'] },
];
const cityBase = { stayLabel: 'Porto', focus: null, interests: [], freeText: '', lang: 'en', candidates: towns, groundedFormat: false };
const cityCases = [
  {}, { focus: 'nature' }, { focus: 'city' }, { focus: 'mix' }, { interests: ['food', 'beach'] }, { freeText: 'Somewhere with a river beach.' },
  { lang: 'fr' }, { lang: 'zz' }, { groundedFormat: true }, { candidates: [] },
  { focus: 'nature', interests: ['nature', 'photo'], freeText: 'Waterfalls', lang: 'es', groundedFormat: true },
].map((over) => ({ ...cityBase, ...over }));

const trip = {
  groupSize: 3,
  stops: [
    { city: 'Palermo', country: 'Italy', arrive: '2027-06-02', nights: 3, firstDay: 1, lastDay: 4 },
    { city: 'Cefalu', country: '', arrive: '', nights: 2, firstDay: 4, lastDay: 6 },
  ],
};
const bookBase = { context: trip, lang: 'en', hasFiles: false, text: '', nonce: NONCE };
const bookCases = [
  {}, { hasFiles: true }, { text: 'Ryanair FR123 CRL to PMO, ref ABC123, 84.20 EUR' }, { text: 'Hotel Miramare 2 nights', hasFiles: true },
  { lang: 'nl' }, { lang: 'qq' }, { context: { groupSize: 1, stops: [] } },
].map((over) => ({ ...bookBase, ...over }));

const askLangs = ['en', 'nl', 'de', 'fr', 'es', 'it', 'xx'];
const askUser = [
  { question: 'porto or lisbon in may', notes: ['Porto, Portugal; score 8.1 of 10', 'Lisbon, Portugal; 31 mm rain in May'] },
  { question: 'cheap beach in june', notes: ['Split, Croatia; total 820 for the group'] },
];
const packs = [
  { v: 4, lang: 'en', question: 'porto or lisbon in may', notes: ['Porto, Portugal', 'Lisbon, Portugal'] },
  { v: 4, lang: 'nl', question: 'quiet lake', notes: [{ text: 'Bled, Slovenia; score 8.4 of 10' }, { text: 'Hallstatt, Austria' }] },
];

/* ---- outputs ---- */

const out = {
  rev, note: 'Inputs and the exact outputs of the prompt builders at commit rev, before the prompt registry (T1140). Written by scripts/prompts/capture-golden.mjs; read by continent-app/tests/promptRegistry.test.mjs.',
  'plan-day': planCases.map((input) => ({ input, output: planDay.buildPrompt(input) })),
  'plan-day.schema': JSON.stringify(planDay.RESPONSE_SCHEMA),
  'suggest-city': cityCases.map((input) => ({ input, output: suggestCity.buildPrompt(input) })),
  'suggest-city.schema': JSON.stringify(suggestCity.RESPONSE_SCHEMA),
  'parse-booking': bookCases.map((input) => ({ input, output: parseBooking.buildPrompt(input) })),
  'parse-booking.schema': JSON.stringify(parseBooking.RESPONSE_SCHEMA),
  'security-rules': [NONCE, 'abc123'].map((nonce) => ({ input: { nonce }, output: guard.systemRules(nonce) })),
  'ask.user': askUser.map((input) => ({ input, output: guard.askUserPrompt(input, NONCE) })),
  'ask.system': askLangs.map((lang) => ({ input: { lang }, output: ask.systemPrompt(lang) })),
  'ask.device': packs.map((input) => ({ input, output: ask.userPrompt(input) })),
  'eval-judge.rubricSha': judgeMod.rubricSha(),
  'eval-judge': sample.plans.map((p) => ({ input: { planId: p.planId }, sha256: sha(judgeMod.judgePrompt(p)), chars: judgeMod.judgePrompt(p).length })),
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
const n = Object.values(out).filter(Array.isArray).reduce((s, a) => s + a.length, 0);
console.log(`${n} prompts from ${rev} written to ${OUT}`);
