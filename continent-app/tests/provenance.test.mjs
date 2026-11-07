// T1143 (ROADMAP D3): field provenance on the wire. Since schema 20 every key
// block carries _src and _asof; the loader lifts them into a side table so the
// screens see the blocks they always had, and a schema 19 shard passes through.
// Run: npm test (continent-app/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liftProvenance, liftShard, provenanceOf, provenanceAll } from '../src/lib/provenance.js';
import { createCatalogue } from '../src/lib/catalogue.js';
import { splitCatalogue, buildRankTier, decodeRankTier } from '../src/lib/bootIndex.js';

const v19 = () => ({
  id: 'BRU', city: 'Brussels', iso2: 'BE', lat: 50.9, lon: 4.48, tier: 'airport',
  categories: ['city'],
  rating: { score: 7.1, band: 'good' },
  costs: { meal_mid_eur: 22, level: 'city' },
  climate: { m: [1, 2], best: [5, 6] },
});
const v20 = () => {
  const r = v19();
  Object.assign(r.rating, { _src: 'carta_rating', _asof: '2026-11-01' });
  Object.assign(r.costs, { _src: 'carta_food', _asof: '2026-10-30' });
  Object.assign(r.climate, { _src: 'climate', _asof: '2026-06-07' });
  return r;
};

test('the stamps move off the block into the side table', () => {
  const r = liftProvenance(v20());
  assert.deepEqual(r, v19());
  assert.deepEqual(provenanceOf(r, 'rating'), { src: 'carta_rating', asof: '2026-11-01' });
  assert.deepEqual(provenanceOf(r, 'costs'), { src: 'carta_food', asof: '2026-10-30' });
  assert.deepEqual(Object.keys(provenanceAll(r)).sort(), ['climate', 'costs', 'rating']);
});

test('a schema 19 record passes through unchanged, with no provenance', () => {
  const r = liftProvenance(v19());
  assert.deepEqual(r, v19());
  assert.equal(provenanceOf(r, 'rating'), null);
  assert.deepEqual(provenanceAll(r), {});
});

test('the stamp follows the block through a copy of the record', () => {
  const r = liftProvenance(v20());
  const copy = { ...r, id: 'BRU' };
  assert.deepEqual(provenanceOf(copy, 'climate'), { src: 'climate', asof: '2026-06-07' });
});

test('lists, scalars and missing blocks read null', () => {
  const r = liftShard({ BRU: v20() }).BRU;
  assert.equal(provenanceOf(r, 'categories'), null);
  assert.equal(provenanceOf(r, 'city'), null);
  assert.equal(provenanceOf(r, 'crowding'), null);
  assert.equal(provenanceOf(null, 'rating'), null);
});

async function loadThroughCatalogue(records) {
  const core = { meta: { schema_version: 20 }, destinations: records };
  const { boot, chunks } = splitCatalogue(core);
  const b = JSON.parse(JSON.stringify(boot));
  b.chunks = Object.fromEntries(Object.keys(chunks).map((k) => [k, 'h']));
  const wire = Object.fromEntries(Object.entries(chunks).map(([k, v]) => [k, JSON.stringify(v)]));
  const cat = createCatalogue({ loadBoot: () => b, loadCountry: (k) => JSON.parse(wire[k]), coalesceMs: 0 });
  await cat.ensureAll();
  return { snap: cat.snapshot(), boot, chunks };
}

test('the catalogue hands screens the same records from a schema 19 and a schema 20 wire', async () => {
  const old = await loadThroughCatalogue({ BRU: v19() });
  const neu = await loadThroughCatalogue({ BRU: v20() });
  assert.deepEqual(neu.snap.destinations, old.snap.destinations);
  assert.equal(provenanceOf(old.snap.destinations.BRU, 'rating'), null);
  assert.deepEqual(provenanceOf(neu.snap.destinations.BRU, 'rating'), { src: 'carta_rating', asof: '2026-11-01' });
});

test('the rank tier carries no stamps and pools as before', async () => {
  const a = v20();
  const b = { ...v20(), id: 'CRL', city: 'Charleroi', lat: 50.46, lon: 4.45 };
  b.costs = { meal_mid_eur: 22, level: 'city', _src: 'carta_food', _asof: '2026-11-05' };
  const { boot, chunks } = splitCatalogue({ meta: {}, destinations: { BRU: a, CRL: b } });
  const rank = buildRankTier(boot, Object.assign({}, ...Object.values(chunks)), 'k');
  assert.ok(!JSON.stringify(rank).includes('_asof'), 'no _asof in the rank tier');
  assert.ok(!JSON.stringify(rank).includes('_src'), 'no _src in the rank tier');
  const costs = rank.fields.indexOf('costs');
  assert.equal(rank.pools[costs].length, 1, 'two baskets that differ only in date are one pool entry');
  const lite = decodeRankTier({ ...boot, rank: { key: 'k' } }, rank);
  assert.equal(provenanceOf(lite.BRU, 'costs'), null);
});

test('sync-data carries the stamps across the blocks its diet rebuilds', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../scripts/sync-data.mjs', import.meta.url), 'utf8');
  const take = src.indexOf('const stamps = provenanceOfBlocks(d);');
  const give = src.indexOf('restoreProvenance(d, stamps);');
  const guard = src.indexOf("assertWire(data, 'public/app_data.json')");
  assert.ok(take > 0 && give > take && guard > give, 'stamps taken, restored, then the wire checked');
});
