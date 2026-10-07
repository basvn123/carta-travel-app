import test from 'node:test';
import assert from 'node:assert/strict';
import { reportKey, REPORT_WHATS } from '../src/lib/reportKey.js';

test('reportKey carries layer, id, what and the optional fields only when present', () => {
  const k = reportKey({ layer: 'lake', id: 'si-lake-bled-Q207302', cc: 'SI', what: 'photo', name: 'Lake Bled' });
  assert.deepEqual(k, { layer: 'lake', id: 'si-lake-bled-Q207302', what: 'photo', cc: 'SI', name: 'Lake Bled' });
  assert.deepEqual(reportKey({ layer: 'cycle', id: 1150, what: 'price' }), { layer: 'cycle', id: '1150', what: 'price' });
});

test('an unknown what falls back to other, and the key stays far under 4096 bytes', () => {
  assert.equal(reportKey({ layer: 'beach', id: 'x', what: 'nonsense' }).what, 'other');
  const big = reportKey({ layer: 'trail', id: 'x'.repeat(60), cc: 'DE', what: 'missing', name: 'n'.repeat(500) });
  assert.ok(JSON.stringify(big).length < 400);
  assert.deepEqual(REPORT_WHATS, ['photo', 'text', 'price', 'missing', 'other']);
});
