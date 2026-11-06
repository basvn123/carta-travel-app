import test from 'node:test';
import assert from 'node:assert/strict';
import { channelOf, cleanChannel, mediumBucket, sendChannelVisit, channelWeeksView } from '../src/lib/channelCounts.js';

test('reads only utm_source and utm_medium', () => {
  assert.deepEqual(channelOf('?utm_source=Newsletter&utm_medium=email&utm_campaign=secret&utm_term=x'),
    { channel: 'newsletter', medium: 'email' });
});

test('no utm means none, junk is stripped and capped', () => {
  assert.deepEqual(channelOf(''), { channel: 'none', medium: 'none' });
  assert.equal(cleanChannel('a b/c<script>'), 'abcscript');
  assert.equal(cleanChannel('x'.repeat(80)).length, 32);
  assert.equal(mediumBucket('weird'), 'other');
});

test('sends exactly channel and medium to a stubbed backend, and never throws', async () => {
  const calls = [];
  const out = await sendChannelVisit(async (fn, args) => { calls.push([fn, args]); }, '?utm_source=reddit&utm_medium=social&utm_campaign=c1');
  assert.deepEqual(calls, [['channel_visit', { p_channel: 'reddit', p_medium: 'social' }]]);
  assert.equal(out.channel, 'reddit');
  await sendChannelVisit(async () => { throw new Error('function not found'); }, '?utm_source=x');
});

test('admin view: weeks newest first, channels by count, totals', () => {
  const v = channelWeeksView({ weeks: [
    { week: '2026-10-26', channels: [{ channel: 'a', n: 1 }] },
    { week: '2026-11-02', channels: [{ channel: 'none', n: 3 }, { channel: 'reddit', n: 5 }] },
  ] });
  assert.equal(v.current.week, '2026-11-02');
  assert.equal(v.current.total, 8);
  assert.equal(v.current.channels[0].channel, 'reddit');
  assert.equal(channelWeeksView({ error: 'forbidden' }), null);
});
