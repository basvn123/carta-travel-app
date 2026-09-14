/**
 * verify_joins.mjs - the cross-layer neighbour contract (brief 08).
 *
 * Wire-only, no browser: checks that pipeline/joins/neighbours.py left the
 * published files in the state the app relies on. Run from continent-app/:
 *
 *   node scripts/verify_joins.mjs
 *
 * What it holds:
 *   1. public/joins.json exists and names the model that stamped the wire.
 *   2. Every nb id resolves inside the SAME country's target layer file,
 *      because the app resolves ids locally and a dangling id is a dead row.
 *   3. No nb list exceeds its rule's limit.
 *   4. Mountain rated rows keep their `near` hub link: nb was chosen as a
 *      separate key precisely so the join could never clobber it.
 *   5. Trip detail stops that carry nb also carry the iso2 the app needs to
 *      resolve them.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WIRE = fileURLToPath(new URL('../public/', import.meta.url));

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`);
}
function readJson(p) {
  return JSON.parse(readFileSync(`${WIRE}${p}`, 'utf8'));
}

const LAYERS = {
  beach: ['beaches', 'beaches'],
  lake: ['lakes', 'lakes'],
  peak: ['mountains', 'mountains'],
  trail: ['trails', 'trips'],
  cycle: ['cycling', 'routes'],
};

check('joins.json exists', existsSync(`${WIRE}joins.json`));
let model = null;
if (existsSync(`${WIRE}joins.json`)) {
  model = readJson('joins.json');
  check('joins.json names a version', typeof model.version === 'string');
  check('joins.json key is nb', model.key === 'nb');
  check('joins.json carries the rule table',
    model.rules_km_limit && Object.keys(model.rules_km_limit).length > 0);
}

// Limits per (src, dst), expanded the way the pipeline expands '*'.
const limitOf = (src, dst) => {
  if (!model?.rules_km_limit) return 99;
  const hit = model.rules_km_limit[`${src}->${dst}`]
    || model.rules_km_limit[`${src}->*`];
  return hit ? hit[1] : 0;
};

const countries = readdirSync(`${WIRE}beaches`)
  .filter((f) => /^[A-Z]{2}\.json$/.test(f)).map((f) => f.slice(0, 2));

let rowsWithNb = 0;
let danglers = 0;
let overLimit = 0;
let nearKept = 0;
let nearRows = 0;
for (const cc of countries) {
  const ids = {};
  const docs = {};
  for (const [layer, [dir, ratedKey]] of Object.entries(LAYERS)) {
    if (!existsSync(`${WIRE}${dir}/${cc}.json`)) continue;
    const doc = readJson(`${dir}/${cc}.json`);
    docs[layer] = doc;
    ids[layer] = new Set(
      [...(doc[ratedKey] || []), ...(doc.listed || [])].map((r) => String(r.id)),
    );
  }
  for (const [layer, [, ratedKey]] of Object.entries(LAYERS)) {
    const doc = docs[layer];
    if (!doc) continue;
    for (const row of [...(doc[ratedKey] || []), ...(doc.listed || [])]) {
      if (layer === 'peak' && row.t === 'r') {
        nearRows += 1;
        if (row.near?.dest_id || row.near === undefined) nearKept += 1;
      }
      if (!row.nb) continue;
      rowsWithNb += 1;
      for (const [dst, list] of Object.entries(row.nb)) {
        if ((list || []).length > limitOf(layer, dst)) overLimit += 1;
        for (const id of list || []) {
          if (!ids[dst] || !ids[dst].has(String(id))) danglers += 1;
        }
      }
    }
  }
}
check('at least one row carries nb (run the joins pass before this harness)',
  rowsWithNb > 0);
check('every nb id resolves in its own country file', danglers === 0,
  `${danglers} dangling`);
check('no nb list exceeds its rule limit', overLimit === 0, `${overLimit} over`);
check('mountain rated rows keep their near hub link', nearRows === nearKept,
  `${nearRows - nearKept} rows lost near`);

// Trip details: a stop with nb must carry the iso2 that resolves it.
const tripDir = `${WIRE}trips/trip`;
if (existsSync(tripDir)) {
  let badStops = 0;
  let stopsWithNb = 0;
  for (const f of readdirSync(tripDir).slice(0, 400)) {
    if (!f.endsWith('.json')) continue;
    const doc = JSON.parse(readFileSync(`${tripDir}/${f}`, 'utf8'));
    for (const stop of doc.stops || []) {
      if (!stop.nb) continue;
      stopsWithNb += 1;
      if (!stop.iso2) badStops += 1;
    }
  }
  check('trip stops with nb carry iso2', badStops === 0, `${badStops} bad`);
  check('some trip stops carry nb', stopsWithNb > 0);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
