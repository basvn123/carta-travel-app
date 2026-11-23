// D1, D3 (wave 2 step 1.1): the `airports` key is `x-presence: pending` until
// ship 1 puts it on the served wire. The flip afterwards is one line in
// docs/wire.schema.json ("pending" to "some"); this test proves the flip is safe
// and shows why it cannot be made before: with `some`, today's served wire
// (no place carries airports) would fail.
// The fixture is the real `airports` task's output on a temp copy of
// contract-min.json (tests/test_airports_chain.py keeps it fresh).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIRE_SCHEMA, validateAppData } from '../scripts/ci/contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..', '..');
const CHAIN = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'fixtures', 'airports_chain_wire.json'), 'utf8'));
const WIRE = path.join(HERE, '..', 'public', 'app_data.json');

const withPresence = (presence) => {
  const s = structuredClone(WIRE_SCHEMA);
  s.$defs.destination.properties.airports['x-presence'] = presence;
  return s;
};
const airportProblems = (data, schema) =>
  validateAppData(data, { catalogue: true, schema }).filter((p) => p.includes('airports'));

test('the schema lists airports as pending today', () => {
  assert.equal(WIRE_SCHEMA.$defs.destination.properties.airports['x-presence'], 'pending');
});

test('the pipeline output passes with pending and with airports as some', () => {
  assert.deepEqual(validateAppData(CHAIN, { schema: WIRE_SCHEMA }), []);
  assert.deepEqual(airportProblems(CHAIN, withPresence('some')), []);
  assert.deepEqual(airportProblems(CHAIN, withPresence('pending')), []);
});

test('with some, a wire that carries no airports fails (so the flip waits for ship 1)', () => {
  const bare = structuredClone(CHAIN);
  for (const d of Object.values(bare.destinations)) delete d.airports;
  assert.deepEqual(airportProblems(bare, withPresence('pending')), []);
  assert.equal(airportProblems(bare, withPresence('some')).length, 1);
});

test('the served wire: pending passes today, some fails until the box wire ships', { skip: !fs.existsSync(WIRE) && 'no public/app_data.json' }, () => {
  const data = JSON.parse(fs.readFileSync(WIRE, 'utf8'));
  const carries = Object.values(data.destinations).some((d) => d.airports);
  assert.deepEqual(airportProblems(data, withPresence('pending')), []);
  // After ship 1 the wire carries them and this flips to expecting no problem.
  assert.equal(airportProblems(data, withPresence('some')).length, carries ? 0 : 1);
});
