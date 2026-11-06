// T1133 (ROADMAP D1): one machine-readable data contract.
// docs/wire.schema.json is read by the pipeline writers (pipeline/wire_contract.py)
// and here by the app sync and CI gate (src/lib/wireSchema.js, scripts/ci/contract.mjs).
// The cases in tests/fixtures/wire_contract_cases.json (repo root) are shared with
// tests/test_wire_contract.py: the same seeded bad value must fail both, with the
// same message, field path first.
// Run: npm test (continent-app/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWire, schemaKeySet } from '../src/lib/wireSchema.js';
import {
  WIRE_SCHEMA, WIRE_SCHEMA_PATH, EXPECTED_SCHEMA_VERSION, validateAppData, assertWire,
  WireContractError, checkWireSchema, checkSchemaTable, renderWireTable,
} from '../scripts/ci/contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..', '..');
const CASES = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'fixtures', 'wire_contract_cases.json'), 'utf8'));
const FIXTURE = JSON.parse(fs.readFileSync(path.join(REPO, CASES.fixture), 'utf8'));
const WIRE = path.join(HERE, '..', 'public', 'app_data.json');

function seeded(c) {
  const data = structuredClone(FIXTURE);
  const keys = [...c.path];
  const last = keys.pop();
  let node = data;
  for (const k of keys) node = node[k];
  if (c.delete) delete node[last];
  else node[last] = structuredClone(c.value);
  return data;
}

test('the gate reads docs/wire.schema.json, version 19', () => {
  assert.equal(path.resolve(WIRE_SCHEMA_PATH), path.resolve(REPO, 'docs', 'wire.schema.json'));
  assert.equal(EXPECTED_SCHEMA_VERSION, 19);
  assert.deepEqual(checkWireSchema(WIRE_SCHEMA), []);
});

test('the fixture satisfies the schema', () => {
  assert.deepEqual(validateWire(FIXTURE, WIRE_SCHEMA), []);
  assert.deepEqual(validateAppData(FIXTURE), []);
});

test('there are enough shared cases', () => {
  assert.ok(CASES.cases.length >= 15, `${CASES.cases.length} cases`);
});

for (const c of CASES.cases) {
  test(`seeded bad value is rejected with its field path: ${c.name}`, () => {
    assert.deepEqual(validateWire(seeded(c), WIRE_SCHEMA), [c.expect]);
  });
  test(`the app sync guard refuses it: ${c.name}`, () => {
    assert.throws(() => assertWire(seeded(c), 'public/app_data.json'), (err) => {
      assert.ok(err instanceof WireContractError);
      assert.ok(err.message.includes(c.expect), err.message);
      return true;
    });
  });
}

test('sync-data checks the payload before it writes public/app_data.json', () => {
  const src = fs.readFileSync(path.join(HERE, '..', 'scripts', 'sync-data.mjs'), 'utf8');
  const guard = src.indexOf("assertWire(data, 'public/app_data.json')");
  const write = src.indexOf("writeFileSync(resolve(publicDir, 'app_data.json'), core)");
  assert.ok(guard > 0 && write > guard, 'assertWire must run before the wire write');
  assert.ok(/function writeSplit\(core\) \{[^}]*assertWire\(/.test(src), 'writeSplit must check the core first');
});

test('relations the schema cannot say still fail', () => {
  const d = structuredClone(FIXTURE);
  d.destinations.BRU.id = 'BRX';
  assert.deepEqual(validateAppData(d), ['destinations.BRU.id is "BRX", does not match its key']);
});

test('a boolean is not a number, a whole float is an integer', () => {
  const s = { type: 'object', properties: { n: { type: 'integer' }, x: { type: 'number' } } };
  assert.deepEqual(validateWire({ n: true, x: false }, s), ['n is true, expected integer', 'x is false, expected number']);
  assert.deepEqual(validateWire({ n: 3.0, x: 1 }, s), []);
});

test('catalogue mode checks presence, as the Python twin does', () => {
  const s = {
    type: 'object',
    properties: {
      m: { type: 'object', properties: { a: { 'x-presence': 'required' } } },
      d: { type: 'object', additionalProperties: { type: 'object', properties: { e: { 'x-presence': 'every' }, s: { 'x-presence': 'some' } } } },
    },
  };
  const data = { m: {}, d: { A: { e: 1 }, B: {} } };
  assert.deepEqual(validateWire(data, s), []);
  assert.deepEqual(validateWire(data, s, { catalogue: true }), [
    'm.a is missing',
    'd.*.e is "every" in docs/wire.schema.json but 1 of 2 records lack it',
    'd.*.s is listed in docs/wire.schema.json but no record carries it (renamed or dropped?)',
  ]);
});

test('docs/SCHEMA.md carries the table the schema renders', () => {
  const md = fs.readFileSync(path.join(REPO, 'docs', 'SCHEMA.md'), 'utf8');
  assert.deepEqual(checkSchemaTable(md), []);
  const keys = schemaKeySet(WIRE_SCHEMA);
  assert.equal(renderWireTable().split('\n').length, 2 + keys.meta.size + keys.every.size + keys.some.size);
  // A key dropped from the table (or added to the schema alone) is drift.
  const drifted = md.replace(/^\| `gateway_of` .*\n/m, '');
  assert.ok(checkSchemaTable(drifted).some((p) => p.includes('"gateway_of"')));
});

test('the shipped wire satisfies the schema in full', { skip: !fs.existsSync(WIRE) && 'no public/app_data.json' }, () => {
  const data = JSON.parse(fs.readFileSync(WIRE, 'utf8'));
  assert.deepEqual(validateAppData(data, { catalogue: true }), []);
});
