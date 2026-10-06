import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainSourceSpec, normalisePmtilesUrl, MAPTERHORN_TILES } from '../src/lib/terrainSource.js';

const MIRROR = 'https://data.carta-europetravel.com/tiles/terrain-europe.pmtiles';

test('default is Mapterhorn XYZ tiles with attribution', () => {
  const r = terrainSourceSpec({});
  assert.equal(r.mode, 'mapterhorn');
  assert.deepEqual(r.spec.tiles, [MAPTERHORN_TILES]);
  assert.equal(r.spec.encoding, 'terrarium');
  assert.equal(r.spec.tileSize, 512);
  assert.match(r.spec.attribution, /Mapterhorn/);
  assert.equal(r.needsPmtilesProtocol, false);
});

test('mirror setting builds a pmtiles:// url and keeps the credit', () => {
  const r = terrainSourceSpec({ VITE_TERRAIN_PMTILES_URL: MIRROR });
  assert.equal(r.mode, 'mirror');
  assert.equal(r.spec.url, `pmtiles://${MIRROR}`);
  assert.equal(r.spec.tiles, undefined);
  assert.match(r.spec.attribution, /Mapterhorn/);
  assert.equal(r.needsPmtilesProtocol, true);
});

test('bad values fall back to the default', () => {
  for (const bad of ['http://evil.example/x.pmtiles', 'https://h/x.pmtiles?a=1', 'https://h/x.json', 'nonsense']) {
    assert.equal(normalisePmtilesUrl(bad), '');
    assert.equal(terrainSourceSpec({ VITE_TERRAIN_PMTILES_URL: bad }).mode, 'mapterhorn');
  }
  assert.equal(normalisePmtilesUrl('http://localhost:5207/t.pmtiles'), 'http://localhost:5207/t.pmtiles');
});
