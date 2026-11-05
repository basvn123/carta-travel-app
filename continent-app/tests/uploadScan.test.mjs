// T1070: the server privacy pass of the upload path (supabase/functions/
// upload-scan/logic.mjs) and the copies of the two privacy modules it runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import {
  scanUpload, secretOk, splitPurge,
} from '../../supabase/functions/upload-scan/logic.mjs';
import { isMetadataFree } from '../src/lib/stripImageMeta.js';
import { readGpx } from '../src/lib/gpxPrivacy.js';

const here = dirname(fileURLToPath(import.meta.url));
const app = (p) => resolve(here, '..', p);
const shared = (p) => resolve(here, '../../supabase/functions/_shared', p);

/* ---- fixtures (the shapes of uploadPrivacy.test.mjs) --------------------- */

const str = (s) => [...s].map((c) => c.charCodeAt(0));
const seg = (marker, payload) => {
  const len = payload.length + 2;
  return [0xff, marker, len >> 8, len & 0xff, ...payload];
};
const exifWithGps = [
  ...str('Exif\0\0'), ...str('II'), 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, ...str('GPS 50.8503 N 4.3517 E'),
];
function jpeg({ exif = true } = {}) {
  return Uint8Array.from([
    0xff, 0xd8,
    ...seg(0xe0, [...str('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...(exif ? seg(0xe1, exifWithGps) : []),
    ...seg(0xdb, [0, ...Array(64).fill(1)]),
    ...seg(0xc0, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]),
    ...seg(0xc4, [0, ...Array(16).fill(0)]),
    ...seg(0xda, [1, 1, 0, 0, 63, 0]),
    0x12, 0x34, 0xff, 0xd9,
  ]);
}

// A straight 60-point track north from Brussels, about 111 m a step, with a
// time and a heart rate on every point and the owner's name in metadata.
function gpx(points = 60) {
  const pts = Array.from({ length: points }, (_, i) => `<trkpt lat="${(50.85 + i * 0.001).toFixed(4)}" lon="4.3517">`
    + `<ele>50</ele><time>2026-10-0${1}T10:${String(i).padStart(2, '0')}:00Z</time>`
    + '<extensions><hr>140</hr></extensions></trkpt>').join('');
  return `<?xml version="1.0"?><gpx version="1.1" creator="watch"><metadata><author><name>Jan Owner</name></author></metadata>`
    + `<wpt lat="50.85" lon="4.3517"><name>Home</name></wpt><trk><trkseg>${pts}</trkseg></trk></gpx>`;
}
const enc = (s) => new TextEncoder().encode(s);

/* ---- the copies stay the app's modules ------------------------------------ */

test('the Edge Function runs byte-identical copies of the device privacy modules', () => {
  for (const f of ['stripImageMeta.js', 'gpxPrivacy.js']) {
    assert.equal(readFileSync(shared(f), 'utf8'), readFileSync(app(`src/lib/${f}`), 'utf8'),
      `supabase/functions/_shared/${f} has drifted from continent-app/src/lib/${f}: copy it again`);
  }
});

/* ---- photos -------------------------------------------------------------- */

test('a photo that skipped the device pass is stripped on the server', () => {
  const dirty = jpeg();
  assert.equal(isMetadataFree(dirty), false);
  const res = scanUpload('photo', dirty);
  assert.equal(res.result, 'cleaned');
  assert.equal(res.contentType, 'image/jpeg');
  assert.equal(isMetadataFree(res.bytes), true);
  assert.ok(!Buffer.from(res.bytes).includes(Buffer.from('GPS 50.8503')), 'the GPS text is gone');
});

test('a photo the device already cleaned is kept as it is', () => {
  assert.deepEqual(scanUpload('photo', jpeg({ exif: false })), { result: 'clean' });
});

test('a file that is not a JPEG or PNG, or is empty, is refused, never passed through', () => {
  assert.equal(scanUpload('photo', enc('GIF89a not a photo')).result, 'refused:unsupported');
  assert.equal(scanUpload('photo', new Uint8Array()).result, 'refused:empty');
  assert.equal(scanUpload('photo', enc(gpx())).result, 'refused:unsupported');
  const cut = jpeg().slice(0, 12); // a JPEG that ends inside its first segment
  assert.equal(scanUpload('photo', cut).result, 'refused:corrupt');
});

/* ---- tracks -------------------------------------------------------------- */

test('a full track is rewritten as geometry only, hidden at its ends', () => {
  const res = scanUpload('track', enc(gpx()), { random: () => 0 });
  assert.equal(res.result, 'cleaned');
  assert.equal(res.contentType, 'application/gpx+xml');
  const out = new TextDecoder().decode(res.bytes);
  for (const gone of ['<time>', '<hr>', 'Jan Owner', 'Home', '<wpt']) assert.ok(!out.includes(gone), `${gone} removed`);
  const kept = readGpx(out).flat();
  assert.ok(kept.length > 0 && kept.length < 60, `${kept.length} of 60 points kept`);
  assert.ok(kept.every((p) => p.lat > 50.8545), 'nothing within 500 m of the start survives');
});

test('a track that is wholly inside the hidden circles, or not GPX, is refused', () => {
  assert.equal(scanUpload('track', enc(gpx(6)), { random: () => 0 }).result, 'refused:too_short');
  assert.match(scanUpload('track', enc('just text')).result, /^refused:/);
  assert.equal(scanUpload('track', Uint8Array.from([0xff, 0xfe, 0xfd])).result, 'refused:not_gpx');
  assert.equal(scanUpload('video', jpeg()).result, 'refused:bad_kind');
});

/* ---- the door and the queue ---------------------------------------------- */

test('the cron secret is compared whole, and nothing passes without one', async () => {
  assert.equal(await secretOk('s3cret-value', 's3cret-value'), true);
  assert.equal(await secretOk('s3cret-valuf', 's3cret-value'), false);
  assert.equal(await secretOk('', 's3cret-value'), false);
  assert.equal(await secretOk('anything', ''), false);
  assert.equal(await secretOk(undefined, 's3cret-value'), false);
});

test('the purge queue splits into files for one remove() and folders to list first', () => {
  const { files, folders } = splitPurge([
    { id: 1, path: 'u1/a.jpg', is_prefix: false },
    { id: 2, path: 'u2/', is_prefix: true },
    { id: 3, path: '', is_prefix: false },
    null,
  ]);
  assert.deepEqual(files.map((r) => r.id), [1]);
  assert.deepEqual(folders.map((r) => r.id), [2]);
});
