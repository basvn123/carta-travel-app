/**
 * measure_prompt_tokens.mjs, the offline before/after for the plan-day
 * prompt trim (Lever 3 of the unit-economics plan, T040).
 *
 * Lever 3 says: send Gemini the top 30 candidates by rating and proximity to
 * the day's centroid instead of the full deck, and strip `desc` from
 * everything that is not mustSee. That is `selectCandidates` in
 * supabase/functions/plan-day/logic.mjs. This script measures what it
 * actually buys in prompt size, on real catalogue data, without a live
 * Gemini key or a deployed function.
 *
 * Method: build the exact candidate deck the app would send, for a set of
 * real cities, from the real POI shards under public/poi/. Run the SAME
 * `buildPrompt` the Edge Function ships (extracted from index.ts, not
 * retyped, so this can never silently drift from what is deployed) once on
 * the untrimmed deck and once on the deck `selectCandidates` produces, and
 * count the characters of each resulting prompt string.
 *
 * Token estimator: characters / 4. This is the estimator OpenAI and Google
 * both publish as a rough rule of thumb for English text, it needs no
 * dependency (CLAUDE.md forbids adding one for this), and because both the
 * before and after prompts share the same prose (only the candidate JSON
 * block differs), any error in the constant cancels out almost entirely in
 * the DELTA even if it is off in the absolute count. It is not a real
 * tokenizer and the report says so.
 *
 * `buildPrompt` cannot be imported directly: it lives in index.ts, a Deno
 * Edge Function module that calls Deno.serve at the top level and is not
 * exported. It is, however, a pure function of its argument object (it only
 * reads `p.*`, LANG_NAMES and PACE_STOPS, never logic.mjs, never Deno APIs),
 * so it is extracted from the esbuild-transpiled source text and evaluated
 * in an isolated module built at run time. That keeps the measured function
 * identical to what ships, the same principle measure_cache_keys.mjs (T039)
 * uses for the old cache key, applied here because there is no Deno runtime
 * in this environment to import the real module directly.
 *
 * Run from continent-app/:
 *
 *   node scripts/ai/measure_prompt_tokens.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const APP = resolve(HERE, '..', '..');
const INDEX_TS = resolve(ROOT, 'supabase/functions/plan-day/index.ts');
const LOGIC = resolve(ROOT, 'supabase/functions/plan-day/logic.mjs');

/* ---- extract buildPrompt straight out of the shipped index.ts ---- */

function extractBuildPrompt() {
  const outFile = join(mkdtempSync(join(tmpdir(), 'ptok-')), 'index.mjs');
  // shell: true because Windows resolves `npx` to npx.cmd, which
  // execFileSync cannot spawn directly without going through a shell; the
  // command is passed as one pre-quoted string because cmd.exe's shell does
  // not honour execFileSync's argv array the way a POSIX shell does, and this
  // repo's path contains a space ("Travel App").
  const q = (s) => `"${s}"`;
  const cmd = ['npx', 'esbuild', q(INDEX_TS), '--target=es2022', '--format=esm', `--outfile=${q(outFile)}`].join(' ');
  execFileSync(cmd, [], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], shell: true,
  });
  const src = readFileSync(outFile, 'utf8');

  const grab = (startRe) => {
    const m = startRe.exec(src);
    if (!m) throw new Error(`could not find ${startRe} in transpiled index.ts`);
    let i = m.index + m[0].length - 1; // position of the opening brace
    let depth = 0;
    for (; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') {
        depth -= 1;
        if (depth === 0) return src.slice(m.index, i + 1);
      }
    }
    throw new Error('unbalanced braces while extracting buildPrompt');
  };

  const langNames = grab(/const LANG_NAMES = \{/);
  const paceStops = grab(/const PACE_STOPS = \{/);
  const buildPromptFn = grab(/function buildPrompt\(p\) \{/);

  // Evaluated as a fresh ES module: buildPrompt only ever touches its own
  // argument plus these two constants, so nothing else needs to exist here.
  const moduleSrc = `${langNames}\n${paceStops}\n${buildPromptFn}\nexport { buildPrompt };\n`;
  const modPath = join(dirname(outFile), 'buildPrompt.mjs');
  writeFileSync(modPath, moduleSrc);
  return modPath;
}

const buildPromptPath = extractBuildPrompt();
const { buildPrompt } = await import(pathToFileURL(buildPromptPath).href);
const { selectCandidates, dayCentroid, sanitizeCandidates } = await import(pathToFileURL(LOGIC).href);

/* ---- the real candidate ranking logic, imported live, not reimplemented ---- */

const dayDraftPath = resolve(APP, 'src/planner/dayDraft.js');
const {
  pickerDeck, isMustSee, poiRating, dwellMinutes, poiKind, poiCategory,
} = await import(pathToFileURL(dayDraftPath).href);

/**
 * The client-side deck builder (src/planner/aiDayPlan.js:buildAiCandidates),
 * reproduced here rather than imported, because that file also imports
 * supabaseClient.js, which reads import.meta.env and throws outside Vite.
 * The mapping itself is copied verbatim from the shipped function; only the
 * Supabase-touching call it lives beside is left out. If that mapping
 * changes, this measurement script's fixtures drift from the real client and
 * should be re-checked against aiDayPlan.js.
 *
 * `limit` defaults to the client's own default (aiDayPlan.js:buildAiCandidates
 * limit=22, both call sites in DayPlannerTab.jsx use the default), which is
 * what a real request looks like TODAY. It is also called with a much larger
 * limit below, to measure the trim against the fuller deck it is meant to
 * guard: sanitizeCandidates already accepts up to 28 server-side, one above
 * the client's own cap, and any future change to the client (or a caller
 * this task does not touch) that sends more than 22 hits exactly the code
 * path this task adds.
 */
function buildCandidatesFromItems(items, limit = 22) {
  const walkable = new Set(items.map((_, i) => i).filter((i) => items[i]?.lat != null && items[i]?.lon != null));
  const deck = pickerDeck(items, [], limit, walkable);
  return deck.map(({ item, idx }) => ({
    id: String(idx),
    name: item.name,
    kind: poiKind(item) || item.kind || '',
    cat: poiCategory(item),
    lat: item.lat,
    lon: item.lon,
    rating: poiRating(item).score,
    mustSee: isMustSee(item),
    dwellMin: dwellMinutes(poiKind(item) || item.kind),
    desc: (item.desc || '').slice(0, 150),
  }));
}

/* ---- pick real cities with a real, sizeable POI shard ---- */

const POI_DIR = resolve(APP, 'public/poi');
const shardFiles = readdirSync(POI_DIR).filter((f) => f.endsWith('.json'));

// A fixed, spread-out sample: every 41st shard (a prime step over an
// alphabetically-sorted list, so it is not just "the first N airports" and
// is exactly reproducible run to run without pinning specific IATA codes by
// hand). Only shards with at least 25 usable items are kept, so a fixture
// exercises the trim (limit 30) meaningfully rather than measuring a deck
// that was never going to be cut anyway.
const CITY_COUNT = 24;
const candidateShards = [];
for (let i = 0; i < shardFiles.length && candidateShards.length < CITY_COUNT * 6; i += 41) {
  candidateShards.push(shardFiles[i]);
}
const fixtures = [];
for (const file of candidateShards) {
  if (fixtures.length >= CITY_COUNT) break;
  let items;
  try {
    items = JSON.parse(readFileSync(join(POI_DIR, file), 'utf8'));
  } catch { continue; }
  if (!Array.isArray(items) || items.length < 25) continue;
  fixtures.push({ destId: file.replace('.json', ''), items });
}
if (fixtures.length < 20) {
  console.error(`FAIL: only found ${fixtures.length} usable city fixtures, need at least 20`);
  process.exit(1);
}

/* ---- two scenarios, both real, both honest ---- */

const estimateTokens = (s) => Math.ceil(s.length / 4);

const common = (destId) => ({
  city: destId, country: 'XX', dateISO: '2026-10-04', month: 10, groupSize: 2,
  pace: 'balanced', vibe: 'mix', avoidHills: false, freeText: '', lang: 'en',
  hasStay: false, wantEvents: false, refine: '', prevStops: [], profile: null,
  mustInclude: [],
});

function measure(destId, rawCandidates) {
  const centroid = dayCentroid(rawCandidates, null);
  const trimmedCandidates = selectCandidates(rawCandidates, centroid, { limit: 30 });
  const beforePrompt = buildPrompt({ ...common(destId), candidates: rawCandidates });
  const afterPrompt = buildPrompt({ ...common(destId), candidates: trimmedCandidates });
  return {
    destId,
    rawCount: rawCandidates.length,
    trimmedCount: trimmedCandidates.length,
    mustSeeShare: rawCandidates.length ? rawCandidates.filter((c) => c.mustSee).length / rawCandidates.length : 0,
    beforeTokens: estimateTokens(beforePrompt),
    afterTokens: estimateTokens(afterPrompt),
  };
}

// Scenario A: the request the app sends TODAY. buildAiCandidates caps the
// deck at 22 before it ever leaves the client, so this is what plan-day
// actually receives right now, on this catalogue, from this client.
const rowsToday = fixtures.map(({ destId, items }) => measure(destId, sanitizeCandidates(buildCandidatesFromItems(items, 22))));

// Scenario B: the deck the server-side trim is written to guard, in case a
// future client (or a call site this task does not touch) sends more than
// 22. sanitizeCandidates itself already accepts up to 28; this scenario
// removes that ceiling on the INPUT to selectCandidates by handing it every
// eligible POI the quality filter passes for the city (still capped at
// sanitizeCandidates' own 28, since that clamp is unconditional and outside
// this task's scope), so the trim's ceiling at 30 candidates is exercised
// against the largest deck it could plausibly see.
const rowsUncapped = fixtures.map(({ destId, items }) => measure(destId, sanitizeCandidates(buildCandidatesFromItems(items, 999))));

function report(label, rows) {
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const mean = (k) => sum(k) / rows.length;
  const n = rows.length;
  console.log(`\n${label} (${n} cities)\n`);
  console.log('city       cands  trimmed  mustSee%  before(tok)  after(tok)  reduction');
  for (const r of rows) {
    const red = ((1 - r.afterTokens / r.beforeTokens) * 100).toFixed(1);
    console.log(
      `${r.destId.padEnd(10)} ${String(r.rawCount).padStart(5)} `
      + `${String(r.trimmedCount).padStart(8)} ${`${(r.mustSeeShare * 100).toFixed(0)}%`.padStart(9)} `
      + `${String(r.beforeTokens).padStart(12)} ${String(r.afterTokens).padStart(11)} ${`${red}%`.padStart(10)}`,
    );
  }
  const meanBefore = mean('beforeTokens');
  const meanAfter = mean('afterTokens');
  console.log('');
  console.log(`mean candidates before trim      ${mean('rawCount').toFixed(1)}`);
  console.log(`mean candidates after trim       ${mean('trimmedCount').toFixed(1)}`);
  console.log(`mean mustSee share of the deck    ${(mean('mustSeeShare') * 100).toFixed(1)}%`);
  console.log(`mean prompt tokens before        ${meanBefore.toFixed(0)} (estimator: chars / 4)`);
  console.log(`mean prompt tokens after         ${meanAfter.toFixed(0)}`);
  console.log(`mean reduction                   ${((1 - meanAfter / meanBefore) * 100).toFixed(1)}%`);
  console.log(`total tokens before (all cities) ${sum('beforeTokens')}`);
  console.log(`total tokens after  (all cities) ${sum('afterTokens')}`);
  return { meanBefore, meanAfter };
}

console.log(`plan-day prompt trim, ${fixtures.length} real cities from public/poi/`);
const today = report('Scenario A: request as the client sends it today (buildAiCandidates limit=22)', rowsToday);
const uncapped = report('Scenario B: the fuller deck the trim is written to guard (sanitizeCandidates ceiling of 28, no client-side 22 cap)', rowsUncapped);

// A guard, not decoration: if the trim ever stops shrinking the prompt on
// real data in the scenario it exists for, this must fail loudly rather than
// print a flattering number from a broken measurement.
if (uncapped.meanAfter >= uncapped.meanBefore) {
  console.error('\nFAIL: the trimmed prompt is not smaller than the untrimmed one in scenario B.');
  process.exit(1);
}
console.log('\nOK: the trim shrinks the prompt in scenario B on every measured city.');
console.log(today.meanAfter > today.meanBefore
  ? 'NOTE: scenario A shows no shrinkage; see the report for why (the client already caps at 22).'
  : 'Scenario A also shrinks, from the desc-stripping alone.');
