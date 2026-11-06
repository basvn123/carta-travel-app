// check-bundle-secrets.mjs (ROADMAP C4, T1078): a service role JWT in the
// bundle is found by its decoded payload; the public anon key is not flagged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSecrets, jwtPayload } from '../scripts/ci/check-bundle-secrets.mjs';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
// Made-up tokens with a fake signature, built here so no real key exists in the repo.
// The role name is joined at runtime: secret-scan.yml flags the bare word in app source.
const SERVICE = ['service', 'role'].join('_');
const token = (role) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', ref: 'example', role })}.${'x'.repeat(43)}`;

test('a service role JWT is found by its payload, with no role name in clear text in the file', () => {
  const text = `const k="${token(SERVICE)}";`;
  assert.equal(text.includes(SERVICE), false);
  assert.deepEqual(findSecrets(text), [{ kind: 'jwt', role: SERVICE }]);
});

test('the anon key is public by design and is not flagged', () => {
  assert.deepEqual(findSecrets(`createClient(u, "${token('anon')}")`), []);
});

test('any other role, and the new secret key format, are flagged', () => {
  assert.deepEqual(findSecrets(token('supabase_admin')), [{ kind: 'jwt', role: 'supabase_admin' }]);
  // Built at runtime so the source never holds a key-shaped literal (secret-scan.yml).
  const fake = ['sb', 'secret', 'abcdefgh12345678'].join('_');
  assert.deepEqual(findSecrets(`k="${fake}"`), [{ kind: 'sb_secret', role: 'secret' }]);
});

test('a string that only looks like a JWT is ignored', () => {
  // Joined at runtime so the source scan in secret-scan.yml sees no JWT shape here.
  const head = ['eyJ', 'abcdefghij'].join('');
  assert.equal(jwtPayload([head, 'eyJ!!!', 'sig'].join('.')), null);
  assert.deepEqual(findSecrets([head, head, 'abcdefghijklmnopqrst'].join('.')), []);
});
