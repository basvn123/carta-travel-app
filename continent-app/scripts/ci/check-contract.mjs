/**
 * check-contract.mjs, the negative schema gate.
 *
 *   node scripts/ci/check-contract.mjs
 *   CARTA_CI_SEED_BREAK=<name> node scripts/ci/check-contract.mjs
 *
 * Three things happen, in order.
 *
 * 1. The real public/app_data.json must PASS. This is the ordinary gate: if
 *    the shipped payload has drifted off the contract, the build stops here.
 *
 * 2. The fixture must pass. It is the minimum payload, so if it fails the
 *    contract has moved and the fixture needs regenerating
 *    (node scripts/ci/make-fixture.mjs).
 *
 * 3. Every seeded break must be REJECTED. This is the part that is usually
 *    skipped, and it is the part that matters. A validator that accepts
 *    everything passes step 1 and step 2 forever while catching nothing. The
 *    only way to know a gate is attached to something is to hand it known-bad
 *    input and watch it refuse. If any break is accepted, this script exits
 *    non-zero and names it, because a gate that passes a break is worse than
 *    no gate: it is a green light with nothing behind it.
 *
 * The breaks are chosen to be the ones a real change would cause: a pipeline
 * that bumps the schema without telling the app, a sync-data step that drops
 * a meta block, a hand-edited destination, a CSV round trip that turns
 * coordinates into strings, a filter that empties the catalogue, and the
 * Windows reserved-filename escape coming undone.
 *
 * CARTA_CI_SEED_BREAK applies one named break to the REAL payload in memory
 * before step 1, so `npm run ci` can be demonstrated failing on a contract
 * break without anybody editing a data file. Nothing is ever written to
 * public/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAppData, EXPECTED_SCHEMA_VERSION } from './contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(HERE, '..', '..');
const APP_DATA = path.join(APP_ROOT, 'public', 'app_data.json');
const FIXTURE = path.join(HERE, 'fixtures', 'contract-min.json');
const FARES_DIR = path.join(APP_ROOT, 'public', 'fares');

const clone = (o) => JSON.parse(JSON.stringify(o));
const firstDestKey = (d) => Object.keys(d.destinations)[0];

/**
 * Each break takes a valid payload and returns a broken one. Named, because
 * the failure message has to say which contract moved, not just "invalid".
 */
const BREAKS = {
  'schema-version-bumped': (d) => {
    d.meta.schema_version = EXPECTED_SCHEMA_VERSION + 1;
    return d;
  },
  'meta-key-removed': (d) => {
    delete d.meta.baggage_options;
    return d;
  },
  'destination-missing-id': (d) => {
    delete d.destinations[firstDestKey(d)].id;
    return d;
  },
  'coordinates-as-strings': (d) => {
    const k = firstDestKey(d);
    d.destinations[k].lat = String(d.destinations[k].lat);
    d.destinations[k].lon = String(d.destinations[k].lon);
    return d;
  },
  'empty-destinations': (d) => {
    d.destinations = {};
    return d;
  },
  'fare-file-unescaped': (d) => d, // payload untouched; the break is in fareFiles
};

// The fare-slice break is not a payload edit, it is a bad filename list.
const FARE_FILES_FOR = (name) => (name === 'fare-file-unescaped'
  ? ['BRU', 'PRN'] // PRN.json is the printer on Windows; it must ship as PRN_
  : null);

let failed = false;
const fail = (msg) => { failed = true; console.log(`  FAIL  ${msg}`); };
const pass = (msg) => console.log(`  ok    ${msg}`);

// ---------------------------------------------------------------- the real payload
const seed = process.env.CARTA_CI_SEED_BREAK || '';
if (seed && !(seed in BREAKS)) {
  console.error(`CARTA_CI_SEED_BREAK="${seed}" is not a known break.\n`
    + `known: ${Object.keys(BREAKS).join(', ')}`);
  process.exit(2);
}

if (!fs.existsSync(APP_DATA)) {
  console.error(`public/app_data.json is missing; run \`npm run data\` first.`);
  process.exit(2);
}

console.log('contract gate\n');

let real = JSON.parse(fs.readFileSync(APP_DATA, 'utf8'));
let realFareFiles = fs.existsSync(FARES_DIR)
  ? fs.readdirSync(FARES_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
  : null;

if (seed) {
  console.log(`CARTA_CI_SEED_BREAK=${seed}: applying it to the real payload in `
    + 'memory (public/ is not touched)\n');
  real = BREAKS[seed](clone(real));
  const forced = FARE_FILES_FOR(seed);
  if (forced) realFareFiles = forced;
}

{
  const problems = validateAppData(real, { fareFiles: realFareFiles });
  if (problems.length) {
    fail(`public/app_data.json does not satisfy the contract:\n`
      + problems.slice(0, 12).map((p) => `          ${p}`).join('\n')
      + (problems.length > 12 ? `\n          ... ${problems.length - 12} more` : ''));
  } else {
    pass(`public/app_data.json satisfies the contract `
      + `(schema_version ${real.meta.schema_version}, `
      + `${Object.keys(real.destinations).length} destinations, `
      + `${realFareFiles ? realFareFiles.length : 0} fare slices)`);
  }
}

// ---------------------------------------------------------------- the fixture
if (!fs.existsSync(FIXTURE)) {
  fail('scripts/ci/fixtures/contract-min.json is missing; '
    + 'run `node scripts/ci/make-fixture.mjs`');
} else {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const problems = validateAppData(fixture, { fareFiles: ['BRU'] });
  if (problems.length) {
    fail(`the fixture no longer satisfies the contract (regenerate it with `
      + `node scripts/ci/make-fixture.mjs):\n`
      + problems.map((p) => `          ${p}`).join('\n'));
  } else {
    pass('scripts/ci/fixtures/contract-min.json satisfies the contract');
  }

  // ------------------------------------------------------------ the negative half
  console.log('\nseeded breaks, each one must be REJECTED\n');
  const names = Object.keys(BREAKS);
  let rejected = 0;
  for (const name of names) {
    const broken = BREAKS[name](clone(fixture));
    const fareFiles = FARE_FILES_FOR(name) || ['BRU'];
    const found = validateAppData(broken, { fareFiles });
    if (found.length) {
      rejected += 1;
      pass(`${name}  ->  rejected: ${found[0]}`);
    } else {
      fail(`${name}  ->  ACCEPTED. The gate does not catch this break, `
        + 'which means it is vacuous for this class of contract change.');
    }
  }
  console.log(`\n${rejected}/${names.length} seeded breaks rejected`);
  // Pair the per-break loop with a floor, for the same reason validateAppData
  // pairs its destination walk with a minimum count: "every break was
  // rejected" is trivially true of an empty break list, and a future edit that
  // empties BREAKS would otherwise turn this whole file green.
  if (names.length < 6) {
    fail(`only ${names.length} breaks are defined; this gate expects at least 6`);
  }
}

console.log(failed ? '\ncontract gate FAILED' : '\ncontract gate passed');
process.exit(failed ? 1 : 0);
