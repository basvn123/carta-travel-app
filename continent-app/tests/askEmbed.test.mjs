// T551: the JS query embedder and scorer against the Python reference.
//
// tests/fixtures/askEmbed.fixture.json holds 50 queries with the vector the
// Python reference (pipeline/ask_index_layer.py, the same pruned and quantised
// model) gives each, and its two-stage top ten over passages-dest. The model
// and vectors themselves are built data in public/search/ask/, not committed;
// without them the test skips and says how to build them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadModel, embed, tokenize } from '../functions/_lib/askEmbed.js';
import { search, signBits } from '../functions/_lib/askScore.js';

const here = dirname(fileURLToPath(import.meta.url));
const ASK = join(here, '..', 'public', 'search', 'ask');
const fixture = JSON.parse(readFileSync(join(here, 'fixtures', 'askEmbed.fixture.json'), 'utf8'));
const manifestPath = join(ASK, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const files = manifest && ['vocab', 'emb', 'scale'].every((k) => existsSync(join(ASK, manifest.model_files[k])));
const SKIP = files && manifest.model === fixture.model && manifest.built === fixture.built
  ? false
  : (files
    ? `public/search/ask was rebuilt after the fixture (${manifest.built} vs ${fixture.built}); run python pipeline/ask_index_layer.py --fixture`
    : 'public/search/ask has no model files; build them with python pipeline/ask_index_layer.py (T551)');

function pyVector(b64) {
  const buf = Buffer.from(b64, 'base64');
  const v = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  return Float32Array.from(v, (x) => x / 32767);
}

function cosine(a, b) {
  let s = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i += 1) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return s / (Math.sqrt(na * nb) || 1);
}

let model = null;
let dest = null;
function load() {
  if (model) return;
  const mf = manifest.model_files;
  model = loadModel({
    vocab: readFileSync(join(ASK, mf.vocab), 'utf8'),
    emb: readFileSync(join(ASK, mf.emb)),
    scale: readFileSync(join(ASK, mf.scale)),
  });
  const s = manifest.sources.dest;
  dest = {
    n: s.n,
    D: manifest.dims,
    i8: readFileSync(join(ASK, s.i8)),
    b1: readFileSync(join(ASK, s.b1)),
    rows: JSON.parse(readFileSync(join(ASK, s.passages), 'utf8')).rows,
  };
}

test('askScore: sign bits put dim i at byte i>>3, bit i&7', () => {
  const v = new Float32Array(16);
  v[0] = 1; v[3] = 0.5; v[9] = 2; v[15] = -1;
  assert.deepEqual([...signBits(v)], [0b00001001, 0b00000010]);
});

test('askScore: two stages keep the best k, filter rows out, break ties by row', () => {
  const D = 8;
  const rows = [[127, 0, 0, 0, 0, 0, 0, 0], [0, 127, 0, 0, 0, 0, 0, 0], [90, 90, 0, 0, 0, 0, 0, 0], [127, 0, 0, 0, 0, 0, 0, 0]];
  const i8 = Int8Array.from(rows.flat());
  const b1 = Uint8Array.from(rows.map((r) => signBits(r)[0]));
  const q = Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0]);
  const all = search(q, { b1, i8, n: 4, D }, { k1: 4, k: 4 });
  assert.deepEqual(all.map((h) => h.i), [0, 3, 2, 1]);
  assert.ok(Math.abs(all[0].score - 1) < 1e-9);
  const some = search(q, { b1, i8, n: 4, D }, { k1: 4, k: 2, filter: (r) => r !== 0 });
  assert.deepEqual(some.map((h) => h.i), [3, 2]);
  assert.deepEqual(search(q, { b1, i8, n: 4, D }, { filter: () => false }), []);
});

test('askEmbed: cosine with the Python vector >= 0.99 on the 50 fixture queries', { skip: SKIP }, () => {
  load();
  assert.equal(fixture.cases.length, 50);
  let worst = 1;
  for (const c of fixture.cases) {
    const js = embed(model, c.q);
    const py = pyVector(c.v);
    if (py.every((x) => x === 0)) {
      assert.ok(js.every((x) => x === 0), `"${c.q}": Python gives no tokens, JS should too`);
      continue;
    }
    const cos = cosine(js, py);
    worst = Math.min(worst, cos);
    assert.ok(cos >= 0.99, `"${c.q}": cosine ${cos.toFixed(4)}`);
  }
  assert.ok(worst >= 0.99);
});

test('askEmbed + askScore: the same top ten as Python on the fixture queries', { skip: SKIP }, () => {
  load();
  for (const c of fixture.cases) {
    if (!c.top10.length) continue;
    const q = embed(model, c.q);
    const top = search(q, dest, { k1: 500, k: 10 }).map((h) => dest.rows[h.i][0]);
    assert.deepEqual([...top].sort(), [...c.top10].sort(), `"${c.q}"`);
  }
});

test('askEmbed: tokenises a word the pruned vocabulary lacks into known pieces', { skip: SKIP }, () => {
  load();
  const ids = tokenize(model, 'Xyzzyquorpville');
  assert.ok(ids.length > 1);
  assert.ok(ids.every((id) => id !== model.unkId));
  assert.equal(embed(model, 'Xyzzyquorpville').length, manifest.dims);
});
