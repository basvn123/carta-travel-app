/**
 * measure_cache_keys.mjs, the offline before/after for the plan-day cache key.
 *
 * The live hit rate is a property of real traffic and cannot be measured from
 * a session with no database. What CAN be measured offline is the thing the
 * normalisation actually changes: how many distinct cache keys a fixed,
 * representative population of requests collapses into. Fewer distinct keys
 * over the same requests is, arithmetically, a higher hit rate: if N requests
 * produce K distinct keys, the steady-state hit rate is (N - K) / N, because
 * exactly one request per distinct key pays for a generation and the rest are
 * served from the row it wrote.
 *
 * That is an upper bound on the live figure, not a prediction of it: real
 * traffic is not uniform, the cache expires after seven days, and a key that
 * is only ever asked once never hits however well it is normalised. It is
 * still the right measurement, because it isolates the variable this task
 * moves and holds everything else fixed.
 *
 * The OLD key function is read out of git rather than copied into this file,
 * so the comparison can never drift from what actually shipped. Pass a
 * revision as the first argument; the default is the commit before the
 * normalisation landed.
 *
 *   node scripts/ai/measure_cache_keys.mjs [git-rev]
 *
 * Run from continent-app/ (or anywhere: paths resolve from this file).
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const LOGIC = 'supabase/functions/plan-day/logic.mjs';
const OLD_REV = process.argv[2] || 'p2-model-fallback-logging';

/* ---- load both versions of the key function ---- */

const src = execFileSync('git', ['show', `${OLD_REV}:${LOGIC}`], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 8 << 20,
});
const dir = mkdtempSync(join(tmpdir(), 'cachekey-'));
const oldPath = join(dir, 'logic_old.mjs');
writeFileSync(oldPath, src);

const { cacheKeyInput: oldKey } = await import(pathToFileURL(oldPath).href);
const { cacheKeyInput: newKey } = await import(
  pathToFileURL(join(ROOT, LOGIC)).href);

/* ---- a representative population of requests ---- */

// A deck of candidate ids. Two clients can hand the same deck in a different
// order (the app sorts by rating, the shortlist path sorts by proximity), so
// the population includes both orders of the same deck.
const DECK = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8'];
const cands = (ids) => ids.map((id) => ({ id }));

const BASE = {
  model: 'gemini-flash-latest,gemini-3.5-flash',
  destId: 'PARIS',
  month: 8,
  dateISO: '2026-08-14',
  groupSize: 2,
  pace: 'balanced',
  vibe: 'mix',
  avoidHills: false,
  lang: 'en',
  candidates: cands(DECK),
  wantEvents: false,
};

// Each entry is one axis along which real requests differ, and the values are
// what the UI can actually produce on that axis. The population is the full
// cross product, which is what makes the two numbers comparable: every
// variant is asked of both key functions.
const AXES = {
  // The four group sizes a party picker offers past a couple. The prompt and
  // the scheduler treat all four identically (both branch on >= 5).
  groupSize: [2, 3, 4, 5, 6, 8, 12],
  // The same free-text intent, typed the way people type it, plus one that
  // genuinely says something else, plus the empty variants.
  freeText: [undefined, '', '   ', 'paella', 'Paella', 'Paella!', 'paella ', 'tapas'],
  // Deck order, same ids.
  candidates: [cands(DECK), cands([...DECK].reverse())],
  // Two dates inside one month, for a non-events request.
  dateISO: ['2026-08-03', '2026-08-21'],
  // The must-include channel, empty in most requests.
  mustInclude: [undefined, [], [{ id: '', name: '', timeOfDay: '' }],
    [{ id: 'c3', name: 'Louvre', timeOfDay: 'morning' }],
    [{ id: 'c3', name: 'louvre', timeOfDay: 'morning' }]],
};

function* population() {
  for (const groupSize of AXES.groupSize) {
    for (const freeText of AXES.freeText) {
      for (const candidates of AXES.candidates) {
        for (const dateISO of AXES.dateISO) {
          for (const mustInclude of AXES.mustInclude) {
            yield { ...BASE, groupSize, freeText, candidates, dateISO, mustInclude };
          }
        }
      }
    }
  }
}

/* ---- measure ---- */

const requests = [...population()];
const oldKeys = new Set();
const newKeys = new Set();
for (const r of requests) {
  oldKeys.add(oldKey(r));
  newKeys.add(newKey(r));
}

// The cross product repeats the same intent many times over, which would
// flatter both numbers equally and tell us nothing. What matters is how many
// distinct keys the population's distinct INTENTS fork into. The intent is
// spelled out by hand here, as the answer the traveller gave rather than the
// characters they typed: one group band, one free-text meaning, one deck, one
// month, one must-include set.
const intentOf = (r) => JSON.stringify([
  r.destId,
  r.groupSize >= 5 ? '5+' : r.groupSize >= 3 ? '3-4' : String(r.groupSize),
  String(r.freeText || '').toLowerCase().replace(/[^a-z ]/g, '').trim(),
  [...r.candidates.map((c) => c.id)].sort(),
  r.month,
  (r.mustInclude || []).map((m) => `${m.id}:${String(m.name).toLowerCase()}:${m.timeOfDay}`)
    .filter((s) => s !== '::').sort(),
]);
const intents = new Set(requests.map(intentOf));

const n = requests.length;
const rate = (k) => ((n - k) / n) * 100;
const pct = (x) => `${x.toFixed(1)}%`;

// Per-axis attribution: hold everything else at BASE and vary one axis, so
// the report can say which normalisation bought which share of the collapse.
const perAxis = [];
for (const [axis, values] of Object.entries(AXES)) {
  const o = new Set();
  const w = new Set();
  for (const v of values) {
    const r = { ...BASE, [axis]: v };
    o.add(oldKey(r));
    w.add(newKey(r));
  }
  perAxis.push({ axis, values: values.length, before: o.size, after: w.size });
}

console.log(`plan-day cache key, ${OLD_REV} against the working tree\n`);
console.log(`requests in the population        ${n}`);
console.log(`distinct intents among them       ${intents.size}`);
console.log(`distinct keys before              ${oldKeys.size}`);
console.log(`distinct keys after               ${newKeys.size}`);
console.log(`keys removed                      ${oldKeys.size - newKeys.size} (${pct((1 - newKeys.size / oldKeys.size) * 100)} fewer)`);
console.log(`keys per intent before            ${(oldKeys.size / intents.size).toFixed(2)}`);
console.log(`keys per intent after             ${(newKeys.size / intents.size).toFixed(2)}`);
console.log(`ceiling hit rate before           ${pct(rate(oldKeys.size))}`);
console.log(`ceiling hit rate after            ${pct(rate(newKeys.size))}`);
console.log(`points gained                     ${(rate(newKeys.size) - rate(oldKeys.size)).toFixed(1)}pp\n`);

console.log('per axis, everything else held fixed');
console.log('axis          variants  before  after');
for (const a of perAxis) {
  console.log(`${a.axis.padEnd(13)} ${String(a.values).padStart(8)} ${String(a.before).padStart(7)} ${String(a.after).padStart(6)}`);
}

// A guard, not decoration: if the normalisation ever stops collapsing
// anything, this script must fail rather than print a cheerful zero.
if (newKeys.size >= oldKeys.size) {
  console.error('\nFAIL: the new key collapses nothing.');
  process.exit(1);
}
