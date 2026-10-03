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
 *
 * T082 added two halves on top of that, and a CI workflow that runs the lot
 * (.github/workflows/schema-contract.yml in the root repository).
 *
 * The documented key set. docs/SCHEMA.md carries a "Wire contract" table
 * listing every top-level meta key and every top-level destination key, and
 * whether a destination key is on every record or on some. The real payload
 * must match it both ways: no key the table does not list, no listed key
 * missing. The header's schema version must equal EXPECTED_SCHEMA_VERSION.
 * A renamed field therefore fails until SCHEMA.md says the new name.
 *
 * The database. Every Supabase call site in continent-app/src and in
 * supabase/functions (tables, columns, select strings, rpc names and their
 * named arguments, Edge Function names) is read statically and checked
 * against the catalogue that the whole of supabase/migrations builds in a
 * throwaway Postgres: the table and column exist, the function exists and
 * the arguments fit one of its signatures, and for the app's own calls anon
 * or authenticated holds the grant. The call-site extraction runs always;
 * the catalogue half needs a database:
 *
 *   PGPORT=55445 node scripts/ci/check-contract.mjs
 *
 * PGHOST, PGPORT, PGUSER pick the server (trust auth or PGPASSWORD). With no
 * PGPORT in the environment the database half SKIPS LOUDLY and the gate
 * still passes, which is right for a laptop running `npm run ci`. Under CI
 * (the CI variable set, as GitHub Actions does) a skip is a failure,
 * because a contract gate that quietly did not run is a green light with
 * nothing behind it. The script creates and drops a database named
 * carta_t082_contract and never touches anything else.
 *
 * Paths. The root checkout is CARTA_REPO_ROOT, else the parent of
 * continent-app. CARTA_MIGRATIONS overrides the migrations folder, which is
 * also how a deliberately broken migration is tried without editing the
 * real one. CARTA_CONTRACT_DERIVE_SPLIT=1 builds the boot index and the
 * country files in memory from public/app_data.json with the app's own
 * splitCatalogue() when public/boot.json is absent, which is the case in a
 * git checkout: those files are generated and live on R2, not in git.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  validateAppData, validateSplitWires, EXPECTED_SCHEMA_VERSION,
  parseSchemaContract, extractSupabaseCalls, validateDbContract,
  normaliseCatalogue, CATALOGUE_SQL,
} from './contract.mjs';
import { splitCatalogue, mergeCatalogue } from '../../src/lib/bootIndex.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(HERE, '..', '..');
const APP_DATA = path.join(APP_ROOT, 'public', 'app_data.json');
const FIXTURE = path.join(HERE, 'fixtures', 'contract-min.json');
const FARES_DIR = path.join(APP_ROOT, 'public', 'fares');
const REPO_ROOT = process.env.CARTA_REPO_ROOT || path.join(APP_ROOT, '..');
const SCHEMA_MD = path.join(REPO_ROOT, 'docs', 'SCHEMA.md');
const MIGRATIONS = process.env.CARTA_MIGRATIONS || path.join(REPO_ROOT, 'supabase', 'migrations');
const EDGE_DIR = path.join(REPO_ROOT, 'supabase', 'functions');
const BASE_SCHEMA = process.env.CARTA_BASE_SCHEMA || path.join(REPO_ROOT, 'supabase', 'schema.sql');
const SRC_DIR = path.join(APP_ROOT, 'src');
const IN_CI = !!process.env.CI && process.env.CI !== 'false';

/**
 * What Supabase provides and a bare Postgres does not, so the migrations
 * apply: the auth schema with the columns the migrations read, auth.uid()
 * and auth.jwt(), the three API roles, and the default grants the live
 * project gives every new table, sequence and function in public. Copied
 * from scripts/admin/test_rls_policies.mjs (T083), which applies the same
 * stack; that file runs on import, so it cannot be imported from. If a
 * migration starts needing more of Supabase, both copies need it.
 */
const SUPABASE_STUBS = `
create schema if not exists auth;
create table if not exists auth.users (
  id                 uuid primary key,
  email              text,
  created_at         timestamptz not null default now(),
  last_sign_in_at    timestamptz,
  email_confirmed_at timestamptz,
  banned_until       timestamptz,
  raw_app_meta_data  jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create table if not exists auth.refresh_tokens (
  id      bigserial primary key,
  user_id varchar(255),
  revoked boolean default false
);
create or replace function auth.jwt() returns jsonb language sql stable as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$fn$;
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$fn$;
do $do$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end
$do$;
grant usage on schema auth to authenticated, anon, service_role;
grant usage on schema public to authenticated, anon, service_role;
alter default privileges in schema public grant all on tables to authenticated, anon, service_role;
alter default privileges in schema public grant all on sequences to authenticated, anon, service_role;
alter default privileges in schema public grant execute on functions to authenticated, anon, service_role;
`;

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
  // T082: a field renamed by the pipeline. Every required field survives, so
  // only the documented key set can see it.
  'destination-field-renamed': (d) => {
    for (const r of Object.values(d.destinations)) {
      if ('city_lat' in r) { r.centre_lat = r.city_lat; delete r.city_lat; }
    }
    return d;
  },
  'meta-field-undocumented': (d) => {
    d.meta.fare_window_days = 120;
    return d;
  },
};

/**
 * Breaks that only a real catalogue can show: a field dropped from every
 * record, or an optional layer that no record carries any more. The trimmed
 * fixture never had these fields, so these run against the real payload in
 * catalogue mode.
 */
const CATALOGUE_BREAKS = {
  'destination-layer-dropped': (d) => {
    for (const r of Object.values(d.destinations)) delete r.rating;
    return d;
  },
  'optional-layer-vanished': (d) => {
    for (const r of Object.values(d.destinations)) delete r.crowding;
    return d;
  },
  'meta-block-dropped': (d) => {
    delete d.meta.car_model;
    return d;
  },
};

/**
 * Breaks of the frontend-to-database contract, applied to the catalogue
 * snapshot (and the call list) in memory. Each names a real table, column or
 * function the app uses today; if one stops existing the break has nothing
 * to break, is ACCEPTED, and the gate says so, which is the prompt to point
 * it at something that does exist.
 */
const DB_BREAKS = {
  'db-column-renamed': (w) => {
    const cols = w.catalogue.relations.trip_plans?.columns;
    if (cols?.delete('label')) cols.add('title');
    return w;
  },
  'db-table-dropped': (w) => { delete w.catalogue.relations.day_plans; return w; },
  'db-function-dropped': (w) => { delete w.catalogue.functions.list_public_guides; return w; },
  'db-function-arg-renamed': (w) => {
    for (const o of w.catalogue.functions.get_shared_trip || []) {
      o.inputs = o.inputs.map((a) => (a === 'share_token' ? 'p_token' : a));
      o.required = o.required.map((a) => (a === 'share_token' ? 'p_token' : a));
    }
    return w;
  },
  'db-function-arg-required': (w) => {
    for (const o of w.catalogue.functions.is_admin || []) { o.inputs.push('p_user'); o.required.push('p_user'); }
    return w;
  },
  'db-execute-revoked': (w) => {
    for (const o of w.catalogue.functions.export_user_data || []) o.exec = { authenticated: false, anon: false };
    return w;
  },
  'db-select-revoked': (w) => {
    const r = w.catalogue.relations.trip_shares;
    if (r) {
      r.priv.authenticated.select = false;
      r.priv.anon.select = false;
      for (const col of Object.values(r.colpriv)) { col.authenticated.select = false; col.anon.select = false; }
    }
    return w;
  },
  'client-column-typo': (w) => {
    w.calls.push({
      side: 'app',
      tables: [{ table: 'trip_plans', where: 'seeded:1', readCols: ['titel'], writeCols: [], columns: ['titel'], embeds: [], ops: ['select'], star: false }],
      rpcs: [],
      invokes: [],
    });
    return w;
  },
  'edge-function-missing': (w) => { w.edgeFunctions.delete('plan-day'); return w; },
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
const PAYLOAD_SEEDS = { ...BREAKS, ...CATALOGUE_BREAKS };
if (seed && !(seed in PAYLOAD_SEEDS) && !(seed in DB_BREAKS)) {
  console.error(`CARTA_CI_SEED_BREAK="${seed}" is not a known break.\n`
    + `known: ${[...Object.keys(PAYLOAD_SEEDS), ...Object.keys(DB_BREAKS)].join(', ')}`);
  process.exit(2);
}

if (!fs.existsSync(APP_DATA)) {
  console.error(`public/app_data.json is missing; run \`npm run data\` first.`);
  process.exit(2);
}

console.log('contract gate\n');

// ---------------------------------------------------------------- docs/SCHEMA.md
// Parsed first: the payload checks below use its key table. A missing or
// malformed document fails the gate rather than skipping the key checks.
let contract = null;
if (!fs.existsSync(SCHEMA_MD)) {
  fail(`${SCHEMA_MD} is missing; set CARTA_REPO_ROOT to the root checkout`);
} else {
  contract = parseSchemaContract(fs.readFileSync(SCHEMA_MD, 'utf8'));
  if (contract.problems.length) {
    fail('docs/SCHEMA.md is not a usable contract:\n'
      + contract.problems.map((p) => `          ${p}`).join('\n'));
    contract = null;
  } else if (contract.version !== EXPECTED_SCHEMA_VERSION) {
    fail(`docs/SCHEMA.md says meta.schema_version ${contract.version}, contract.mjs pins `
      + `${EXPECTED_SCHEMA_VERSION}; change both in the same commit`);
  } else {
    pass(`docs/SCHEMA.md wire contract read (schema_version ${contract.version}, `
      + `${contract.meta.size} meta keys, ${contract.every.size} destination keys on every record, `
      + `${contract.some.size} on some)`);
  }
}

let real = JSON.parse(fs.readFileSync(APP_DATA, 'utf8'));
let realFareFiles = fs.existsSync(FARES_DIR)
  ? fs.readdirSync(FARES_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
  : null;
// The real payload as shipped, for the catalogue-mode negative tests below.
const pristine = seed ? clone(real) : real;

if (seed && seed in PAYLOAD_SEEDS) {
  console.log(`CARTA_CI_SEED_BREAK=${seed}: applying it to the real payload in `
    + 'memory (public/ is not touched)\n');
  real = PAYLOAD_SEEDS[seed](clone(real));
  const forced = FARE_FILES_FOR(seed);
  if (forced) realFareFiles = forced;
}

{
  const problems = validateAppData(real, { fareFiles: realFareFiles, contract, catalogue: true });
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

// ---------------------------------------------------------------- the split wires
// The boot index, the per-country files it names, the POI shards, the fare
// slices and the country insights. Real files are sampled (the first few of
// each folder, sorted) because the folders hold thousands of files.
{
  const PUB = path.join(APP_ROOT, 'public');
  const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(PUB, rel), 'utf8'));
  const jsonIn = (dir) => (fs.existsSync(path.join(PUB, dir))
    ? fs.readdirSync(path.join(PUB, dir)).filter((f) => f.endsWith('.json')).sort()
    : []);
  const load = (dir, n) => Object.fromEntries(jsonIn(dir).slice(0, n).map((f) => [f.slice(0, -5), readJson(`${dir}/${f}`)]));

  const onDisk = fs.existsSync(path.join(PUB, 'boot.json'));
  const derive = !onDisk && process.env.CARTA_CONTRACT_DERIVE_SPLIT === '1';
  if (!onDisk && !derive) {
    fail('public/boot.json is missing; the split wires cannot be checked (run `npm run data`, '
      + 'or set CARTA_CONTRACT_DERIVE_SPLIT=1 to build them in memory from public/app_data.json)');
  } else {
    let wires;
    if (derive) {
      // A git checkout has app_data.json, fares/ and country_insights.json
      // but not boot.json, dest/ or poi/ (generated, served from R2). Build
      // the first two exactly as sync-data does, and prove the app can merge
      // them back. POI shards cannot be rebuilt: public/app_data.json ships
      // with items_full stripped, so they are checked only where they exist.
      const { boot, chunks } = splitCatalogue(clone(real));
      for (const k of Object.keys(chunks)) boot.chunks[k] = 'derived';
      const { core, missing } = mergeCatalogue(boot, chunks);
      const back = Object.keys(core.destinations).length;
      if (missing || back !== Object.keys(real.destinations).length) {
        fail(`the boot index split does not merge back: ${missing} rows missing, `
          + `${back} of ${Object.keys(real.destinations).length} destinations returned`);
      } else {
        pass(`boot index derived in memory with splitCatalogue() and merged back with mergeCatalogue() (${back} destinations)`);
      }
      const names = Object.keys(chunks).sort();
      wires = {
        boot,
        chunkNames: names,
        chunks: Object.fromEntries(names.slice(0, 5).map((n) => [n, chunks[n]])),
        poiShards: load('poi', 8),
        fareSlices: load('fares', 3),
        insights: fs.existsSync(path.join(PUB, 'country_insights.json')) ? readJson('country_insights.json') : null,
      };
      if (!Object.keys(wires.poiShards).length) {
        console.log('  NOTE  public/poi/ is not in this checkout (generated, R2 only); the POI shards are NOT checked here');
      }
    } else {
      wires = {
        boot: readJson('boot.json'),
        chunkNames: jsonIn('dest').map((f) => f.slice(0, -5)),
        chunks: load('dest', 5),
        poiShards: load('poi', 8),
        fareSlices: load('fares', 3),
        insights: fs.existsSync(path.join(PUB, 'country_insights.json')) ? readJson('country_insights.json') : null,
      };
    }
    const poiMin = derive && !Object.keys(wires.poiShards).length ? 0 : 1;
    const problems = validateSplitWires(wires, { poiMin });
    if (problems.length) {
      fail('the split wires do not satisfy the contract:\n'
        + problems.slice(0, 12).map((p) => `          ${p}`).join('\n'));
    } else {
      pass(`split wires satisfy the contract (boot index ${wires.boot.d.length} rows, `
        + `${Object.keys(wires.boot.chunks).length} country files, `
        + `${Object.keys(wires.chunks).length}/${Object.keys(wires.poiShards).length}/`
        + `${Object.keys(wires.fareSlices).length} sampled dest/poi/fare files)`);
    }

    // Negative half: known-bad wires must be rejected, or the gate is vacuous.
    const WIRE_BREAKS = {
      'boot-index-empty': (w) => { w.boot.d = []; return w; },
      'boot-chunk-missing-on-disk': (w) => { w.chunkNames = []; return w; },
      'boot-schema-bumped': (w) => { w.boot.meta.schema_version += 1; return w; },
      'dest-file-empty': (w) => { w.chunks[Object.keys(w.chunks)[0]] = {}; return w; },
      'poi-shard-not-array': (w) => { w.poiShards[Object.keys(w.poiShards)[0] || 'seeded'] = {}; return w; },
      'fare-slice-no-out': (w) => {
        const k = Object.keys(w.fareSlices)[0];
        const a = Object.keys(w.fareSlices[k])[0];
        delete w.fareSlices[k][a].out;
        return w;
      },
      'insights-empty': (w) => { w.insights = {}; return w; },
      'no-poi-sampled': (w) => { w.poiShards = {}; return w; },
    };
    // With no POI shards on disk the floor is 0, so an empty sample is the
    // expected state there and not a break.
    if (poiMin === 0) delete WIRE_BREAKS['no-poi-sampled'];
    let rejected = 0;
    for (const [name, brk] of Object.entries(WIRE_BREAKS)) {
      const found = validateSplitWires(brk(structuredClone(wires)), { poiMin });
      if (found.length) rejected += 1;
      else fail(`split-wire break ${name} was ACCEPTED; the gate is vacuous for it`);
    }
    if (rejected === Object.keys(WIRE_BREAKS).length) {
      pass(`${rejected}/${rejected} seeded split-wire breaks rejected`);
    }
  }
}

// ---------------------------------------------------------------- the fixture
if (!fs.existsSync(FIXTURE)) {
  fail('scripts/ci/fixtures/contract-min.json is missing; '
    + 'run `node scripts/ci/make-fixture.mjs`');
} else {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const problems = validateAppData(fixture, { fareFiles: ['BRU'], contract });
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
    const found = validateAppData(broken, { fareFiles, contract });
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
  if (names.length < 8) {
    fail(`only ${names.length} breaks are defined; this gate expects at least 8`);
  }
}

// ---------------------------------------------------------------- catalogue breaks
// Against the real payload as shipped, in catalogue mode, so a field that
// vanishes from every record is seen.
if (contract) {
  console.log('\ncatalogue breaks on the real payload, each one must be REJECTED\n');
  const names = Object.keys(CATALOGUE_BREAKS);
  const baseline = new Set(validateAppData(pristine, { contract, catalogue: true }));
  let rejected = 0;
  for (const name of names) {
    const found = validateAppData(CATALOGUE_BREAKS[name](clone(pristine)), { contract, catalogue: true })
      .filter((p) => !baseline.has(p));
    if (found.length) {
      rejected += 1;
      pass(`${name}  ->  rejected: ${found[0]}`);
    } else {
      fail(`${name}  ->  ACCEPTED. The documented key set does not catch this break.`);
    }
  }
  console.log(`\n${rejected}/${names.length} catalogue breaks rejected`);
  if (names.length < 3) fail(`only ${names.length} catalogue breaks are defined; this gate expects at least 3`);
}

// ---------------------------------------------------------------- the database
// Frontend to database. First the call sites, read statically from the app
// and the Edge Functions; this half needs nothing but the source. Then the
// catalogue, built by applying every migration to a throwaway database.
console.log('\nfrontend to database\n');

const walk = (dir) => (fs.existsSync(dir)
  ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return /\.(m?js|jsx|ts|tsx)$/.test(e.name) ? [p] : [];
  })
  : []);
const rel = (p) => path.relative(REPO_ROOT, p).split(path.sep).join('/');

const calls = [];
for (const [side, dir] of [['app', SRC_DIR], ['edge', EDGE_DIR]]) {
  for (const file of walk(dir)) {
    const shown = side === 'app' ? `continent-app/${path.relative(APP_ROOT, file).split(path.sep).join('/')}` : rel(file);
    calls.push({ side, ...extractSupabaseCalls(fs.readFileSync(file, 'utf8'), shown) });
  }
}
const count = (side, key) => calls.filter((c) => c.side === side).reduce((n, c) => n + c[key].length, 0);
const dynamic = calls.flatMap((c) => c.dynamic);
const unresolved = calls.flatMap((c) => c.unresolved);
const edgeFunctions = new Set(fs.existsSync(EDGE_DIR)
  ? fs.readdirSync(EDGE_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_')
      && fs.readdirSync(path.join(EDGE_DIR, e.name)).some((f) => /^index\.(ts|js|mjs)$/.test(f)))
    .map((e) => e.name)
  : []);

// Floors, never equalities: a new call site must not fail the build, an
// extractor that suddenly finds a handful must (T082 counted 38 table chains,
// 63 rpc calls and 4 invocations in the app, 9 and 5 in the Edge Functions).
const FLOORS = { appTables: 30, appRpcs: 50, appInvokes: 3, edgeCalls: 10, edgeFunctions: 4 };
const found = {
  appTables: count('app', 'tables'),
  appRpcs: count('app', 'rpcs'),
  appInvokes: count('app', 'invokes'),
  edgeCalls: count('edge', 'tables') + count('edge', 'rpcs'),
  edgeFunctions: edgeFunctions.size,
};
const short = Object.keys(FLOORS).filter((k) => found[k] < FLOORS[k]);
if (short.length) {
  fail(`the call-site extraction found too little (${short.map((k) => `${k} ${found[k]} < ${FLOORS[k]}`).join(', ')}); `
    + 'the extractor or the paths are broken, and every check below would be vacuous');
} else {
  pass(`call sites read: app ${found.appTables} table chains, ${found.appRpcs} rpc calls, `
    + `${found.appInvokes} Edge Function invocations; Edge Functions ${found.edgeCalls} calls; `
    + `${found.edgeFunctions} Edge Functions on disk`);
}
if (dynamic.length) {
  fail('call sites whose table or function name is not a literal (the gate cannot check them):\n'
    + dynamic.map((d) => `          ${d}`).join('\n'));
}
if (unresolved.length) {
  console.log(`  NOTE  ${unresolved.length} argument or column list(s) could not be read statically and are checked by name only:`);
  for (const u of unresolved.slice(0, 10)) console.log(`          ${u}`);
}

/** Apply every migration to a fresh database and read the catalogue. */
function loadCatalogue() {
  if (!process.env.PGPORT) return { skipped: 'PGPORT is not set' };
  const candidates = [process.env.PSQL, 'psql',
    'C:/Program Files/PostgreSQL/18/bin/psql.exe', 'C:/Program Files/PostgreSQL/17/bin/psql.exe']
    .filter(Boolean);
  const bin = candidates.find((c) => {
    if (c !== 'psql' && !fs.existsSync(c)) return false;
    try { execFileSync(c, ['--version'], { stdio: 'pipe' }); return true; } catch { return false; }
  });
  if (!bin) return { skipped: 'psql was not found' };
  const conn = ['-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT, '-U', process.env.PGUSER || 'postgres', '-w'];
  const psql = (db, args) => {
    const r = spawnSync(bin, [...conn, '-d', db, '-q', '-v', 'ON_ERROR_STOP=1', ...args],
      { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' }, maxBuffer: 64 * 1024 * 1024 });
    return { ok: r.status === 0 && !r.error, out: String(r.stdout || ''), err: String(r.stderr || (r.error ? r.error.message : '')) };
  };
  const ping = psql('postgres', ['-At', '-c', 'select 1']);
  if (!ping.ok) return { skipped: `could not connect: ${ping.err.trim().split('\n')[0]}` };

  const DB = 'carta_t082_contract';
  const files = fs.existsSync(MIGRATIONS)
    ? fs.readdirSync(MIGRATIONS).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)))
    : [];
  if (!files.length) return { error: `no migrations found in ${MIGRATIONS}` };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'carta-t082-'));
  try {
    psql('postgres', ['-c', `drop database if exists ${DB} with (force)`]);
    const made = psql('postgres', ['-c', `create database ${DB}`]);
    if (!made.ok) return { error: `create database failed: ${made.err.trim()}` };
    const stubs = path.join(work, 'stubs.sql');
    fs.writeFileSync(stubs, SUPABASE_STUBS, 'utf8');
    const s = psql(DB, ['-f', stubs]);
    if (!s.ok) return { error: `the Supabase stubs failed: ${s.err.trim()}` };
    // supabase/schema.sql is the base the numbered files build on (002 says
    // "after schema.sql"): it creates saved_trips and user_settings, which
    // the app still reads and writes. It goes first, then 002 onward.
    if (!fs.existsSync(BASE_SCHEMA)) return { error: `${BASE_SCHEMA} is missing; the base tables cannot be built` };
    const ordered = [BASE_SCHEMA, ...files.map((f) => path.join(MIGRATIONS, f))];
    for (const file of ordered) {
      const r = psql(DB, ['-f', file]);
      if (!r.ok) return { error: `${path.basename(file)} failed to apply: ${(r.err.match(/ERROR:.*$/m) || [r.err.trim()])[0]}` };
    }
    const q = path.join(work, 'catalogue.sql');
    fs.writeFileSync(q, CATALOGUE_SQL, 'utf8');
    const cat = psql(DB, ['-At', '-f', q]);
    if (!cat.ok) return { error: `the catalogue query failed: ${cat.err.trim()}` };
    return { migrations: ordered.length, catalogue: normaliseCatalogue(JSON.parse(cat.out.trim())) };
  } finally {
    psql('postgres', ['-c', `drop database if exists ${DB} with (force)`]);
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* leave it */ }
  }
}

const db = loadCatalogue();
if (db.skipped) {
  const msg = `the database half was SKIPPED (${db.skipped}). No column, argument or grant was checked. `
    + 'Point PGPORT (and PGHOST, PGUSER) at a throwaway trust-auth Postgres to run it.';
  if (IN_CI) fail(`${msg} Under CI a skip is a failure.`);
  else if (seed && seed in DB_BREAKS) fail(`CARTA_CI_SEED_BREAK=${seed} needs the database half, which was skipped: ${db.skipped}`);
  else console.log(`  SKIP  ${msg}`);
} else if (db.error) {
  fail(`the database half could not build the catalogue: ${db.error}`);
} else {
  const { catalogue } = db;
  const nRel = Object.keys(catalogue.relations).length;
  const nFn = Object.keys(catalogue.functions).length;
  if (nRel < 30 || nFn < 60) {
    fail(`the catalogue holds ${nRel} relations and ${nFn} functions; expected at least 30 and 60`);
  }
  let world = { calls, catalogue, edgeFunctions };
  if (seed && seed in DB_BREAKS) {
    console.log(`CARTA_CI_SEED_BREAK=${seed}: applying it to the real catalogue in memory\n`);
    world = DB_BREAKS[seed](structuredClone(world));
  }
  const problems = validateDbContract(world);
  if (problems.length) {
    fail(`the app and the database disagree (${problems.length}):\n`
      + problems.slice(0, 20).map((p) => `          ${p}`).join('\n')
      + (problems.length > 20 ? `\n          ... ${problems.length - 20} more` : ''));
  } else {
    pass(`every call site fits the catalogue of ${db.migrations} migrations `
      + `(${nRel} relations, ${nFn} functions)`);
  }

  // A break counts as rejected only when it adds a problem the unbroken
  // state does not have; otherwise one real disagreement above would make
  // every break look caught.
  console.log('\ndatabase breaks, each one must be REJECTED\n');
  const baseline = new Set(validateDbContract({ calls, catalogue, edgeFunctions }));
  const names = Object.keys(DB_BREAKS);
  let rejected = 0;
  for (const name of names) {
    const got = validateDbContract(DB_BREAKS[name](structuredClone({ calls, catalogue, edgeFunctions })))
      .filter((p) => !baseline.has(p));
    if (got.length) {
      rejected += 1;
      pass(`${name}  ->  rejected: ${got[0]}`);
    } else {
      fail(`${name}  ->  ACCEPTED. Either the gate misses this break or its target no longer exists; `
        + 'point the break at a table or function the app uses today.');
    }
  }
  console.log(`\n${rejected}/${names.length} database breaks rejected`);
  if (names.length < 9) fail(`only ${names.length} database breaks are defined; this gate expects at least 9`);
}

console.log(failed ? '\ncontract gate FAILED' : '\ncontract gate passed');
process.exit(failed ? 1 : 0);
