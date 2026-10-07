import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sniffImage, stripJpeg, stripPng, stripImageMetadata, isMetadataFree,
} from '../src/lib/stripImageMeta.js';
import {
  readGpx, trimGpx, haversineM, PRIVACY_RADIUS_M, PRIVACY_JITTER_M,
} from '../src/lib/gpxPrivacy.js';

/* ---- fixtures: real file structure, synthetic pixels --------------------- */

const bytes = (...parts) => Uint8Array.from(parts.flat());
const str = (s) => [...s].map((c) => c.charCodeAt(0));
const seg = (marker, payload) => {
  const len = payload.length + 2;
  return [0xff, marker, len >> 8, len & 0xff, ...payload];
};

// A little-endian TIFF block with one IFD0 entry: tag 0x8825 (GPS IFD).
const exifPayload = (withGps) => [
  ...str('Exif\0\0'),
  ...str('II'), 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // header, IFD0 at 8
  0x01, 0x00, // one entry
  ...(withGps ? [0x25, 0x88] : [0x0f, 0x01]), 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, // next IFD
  ...str('GPS 50.8503 N 4.3517 E'),
];

const SCAN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0x78]; // stuffed byte and a restart marker

function jpeg({ gps = true, trailer = true } = {}) {
  return bytes(
    [0xff, 0xd8],
    seg(0xe0, [...str('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    seg(0xe1, exifPayload(gps)),
    seg(0xe1, str('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>owner</x:xmpmeta>')),
    seg(0xe2, [...str('ICC_PROFILE\0'), 1, 1, 9, 9]),
    seg(0xe2, [...str('MPF\0'), 1, 2, 3]),
    seg(0xed, str('Photoshop 3.0\0IPTC by-line')),
    seg(0xfe, str('shot by somebody')),
    seg(0xdb, [0, ...Array(64).fill(1)]),
    seg(0xc0, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]),
    seg(0xc4, [0, ...Array(16).fill(0)]),
    seg(0xda, [1, 1, 0, 0, 63, 0]),
    SCAN,
    [0xff, 0xd9],
    trailer ? [0xff, 0xd8, ...seg(0xe1, exifPayload(true)), 0xff, 0xd9] : [],
  );
}

const crc = [0, 0, 0, 0];
const chunk = (type, data) => [0, 0, data.length >> 8, data.length & 0xff, ...str(type), ...data, ...crc];
function png() {
  return bytes(
    [0x89, ...str('PNG'), 0x0d, 0x0a, 0x1a, 0x0a],
    chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
    chunk('tEXt', str('Author\0somebody')),
    chunk('eXIf', exifPayload(true).slice(6)),
    chunk('iTXt', str('XML:com.adobe.xmp\0\0\0\0\0<x/>')),
    chunk('tIME', [7, 234, 10, 7, 12, 0, 0]),
    chunk('IDAT', [1, 2, 3, 4]),
    chunk('IEND', []),
    str('appended'),
  );
}

const has = (b, s) => Buffer.from(b).includes(Buffer.from(s, 'latin1'));

/* ---- images ------------------------------------------------------------- */

test('sniffs the two formats it can walk, and nothing else', () => {
  assert.equal(sniffImage(jpeg()), 'jpeg');
  assert.equal(sniffImage(png()), 'png');
  assert.equal(sniffImage(bytes(str('GIF89a...'))), null);
  assert.throws(() => stripImageMetadata(bytes(str('RIFF....WEBPVP8 '))), { code: 'unsupported' });
});

test('a JPEG loses EXIF with its GPS, XMP, IPTC, MPF, the comment and the trailer', () => {
  const src = jpeg();
  const { bytes: out, removed } = stripJpeg(src);
  assert.deepEqual(removed, ['exif-gps', 'xmp', 'app2', 'iptc', 'comment', 'trailer']);
  for (const leak of ['Exif', 'GPS 50.8503', 'xmpmeta', 'IPTC', 'shot by', 'MPF']) {
    assert.ok(has(src, leak), `fixture carries ${leak}`);
    assert.ok(!has(out, leak), `${leak} removed`);
  }
  assert.ok(has(out, 'JFIF') && has(out, 'ICC_PROFILE'), 'JFIF and the colour profile stay');
  assert.ok(Buffer.from(out).includes(Buffer.from(SCAN)), 'scan data copied byte for byte');
  assert.deepEqual([...out.subarray(-2)], [0xff, 0xd9], 'ends at EOI');
  assert.ok(isMetadataFree(out), 'a second pass finds nothing');
  assert.ok(!isMetadataFree(src));
});

test('EXIF without a GPS directory is named exif, not exif-gps', () => {
  const { removed } = stripJpeg(jpeg({ gps: false, trailer: false }));
  assert.equal(removed[0], 'exif');
  assert.ok(!removed.includes('trailer'));
});

test('a truncated or garbled JPEG is refused, never passed through', () => {
  const src = jpeg({ trailer: false });
  assert.throws(() => stripJpeg(src.subarray(0, src.length - 2)), { code: 'corrupt' });
  assert.throws(() => stripJpeg(src.subarray(0, 30)), { code: 'corrupt' });
  const bad = src.slice();
  bad[2 + 18] = 0x00; // break the marker after APP0
  assert.throws(() => stripJpeg(bad), { code: 'corrupt' });
  assert.equal(isMetadataFree(bad), false);
});

test('a PNG loses its text, EXIF and time chunks and the bytes after IEND', () => {
  const src = png();
  const { bytes: out, removed } = stripPng(src);
  assert.deepEqual(removed, ['text', 'exif', 'itxt', 'time', 'trailer']);
  for (const leak of ['tEXt', 'eXIf', 'iTXt', 'tIME', 'somebody', 'appended']) assert.ok(!has(out, leak), leak);
  for (const keep of ['IHDR', 'IDAT', 'IEND']) assert.ok(has(out, keep), keep);
  assert.ok(isMetadataFree(out));
});

/* ---- tracks ------------------------------------------------------------- */

// A walk due north from a front door in Brussels, one point every ~111 m
// (0.001 degrees of latitude), 40 points, with times, heart rate, a waypoint
// at home and the owner's name in the metadata.
const HOME = { lat: 50.85, lon: 4.35 };
function gpx({ n = 40, step = 0.001 } = {}) {
  const pts = Array.from({ length: n }, (_, i) => (
    `<trkpt lat="${(HOME.lat + i * step).toFixed(6)}" lon="${HOME.lon}"><ele>${50 + i}</ele>`
    + `<time>2026-09-0${1}T08:${String(i % 60).padStart(2, '0')}:00Z</time>`
    + '<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>141</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>'
  )).join('\n');
  return `<?xml version="1.0"?>
<gpx version="1.1" creator="Garmin Connect" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Morning walk</name><author><name>Jan Peeters</name><email id="jan" domain="example.com"/></author></metadata>
  <wpt lat="${HOME.lat}" lon="${HOME.lon}"><name>Home</name></wpt>
  <trk><name>Morning walk</name><trkseg>
${pts}
  </trkseg></trk>
</gpx>`;
}

const pin = { random: () => 0 }; // radius exactly PRIVACY_RADIUS_M

test('reads trkpt and rtept geometry, ignores waypoints, refuses what is not GPX', () => {
  const segs = readGpx(gpx({ n: 5 }));
  assert.equal(segs.length, 1);
  assert.equal(segs[0].length, 5);
  assert.deepEqual(segs[0][0], { lat: 50.85, lon: 4.35, ele: 50 });
  const rte = readGpx("<gpx><rte><rtept lat='1' lon='2'/><rtept lat='1.1' lon='2'/></rte></gpx>");
  assert.equal(rte[0].length, 2);
  assert.throws(() => readGpx('<kml></kml>'), { code: 'not_gpx' });
  assert.throws(() => readGpx('<gpx><wpt lat="1" lon="2"/></gpx>'), { code: 'no_points' });
});

test('no point within the privacy radius of the start or the end survives', () => {
  const src = gpx();
  const flat = readGpx(src).flat();
  const first = flat[0];
  const last = flat[flat.length - 1];
  const near = (p) => haversineM(p, first) <= PRIVACY_RADIUS_M || haversineM(p, last) <= PRIVACY_RADIUS_M;
  const before = flat.filter(near).length;
  const res = trimGpx(src, pin);
  const after = readGpx(res.gpx).flat();
  assert.ok(before >= 8, `fixture has points near the ends (${before})`);
  assert.equal(after.filter(near).length, 0);
  assert.equal(res.total, 40);
  assert.equal(res.kept + res.removed, 40);
  assert.equal(res.kept, after.length);
  assert.equal(res.radiusM, PRIVACY_RADIUS_M);
  assert.ok(res.lengthM > 3000 && res.lengthM < 3500, `length ${res.lengthM}`);
});

test('the written file carries geometry only', () => {
  const out = trimGpx(gpx(), pin).gpx;
  for (const leak of ['<time', 'hr>', '<extensions', '<wpt', 'Jan Peeters', 'email', 'Morning walk', 'Garmin', '<metadata']) {
    assert.ok(!out.includes(leak), `${leak} removed`);
  }
  assert.match(out, /<trkpt lat="50\.85\d*" lon="4\.35"><ele>\d+<\/ele><\/trkpt>/);
});

test('a loop that passes home in the middle is split there, not bridged', () => {
  // out 2.2 km north, back home, out 2.2 km east, back home
  const north = Array.from({ length: 20 }, (_, i) => ({ lat: HOME.lat + i * 0.001, lon: HOME.lon }));
  const leg = [...north, ...north.slice().reverse()];
  const east = Array.from({ length: 20 }, (_, i) => ({ lat: HOME.lat, lon: HOME.lon + i * 0.0016 }));
  const all = [...leg, ...east, ...east.slice().reverse()];
  const text = `<gpx><trk><trkseg>${all.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"/>`).join('')}</trkseg></trk></gpx>`;
  const res = trimGpx(text, pin);
  assert.equal(res.segments, 2, 'two runs, one per leg');
  for (const p of readGpx(res.gpx).flat()) assert.ok(haversineM(p, HOME) > PRIVACY_RADIUS_M);
});

test('the radius grows by a random extra of at most the jitter', () => {
  const lo = trimGpx(gpx(), { random: () => 0 });
  const hi = trimGpx(gpx(), { random: () => 0.999999 });
  assert.equal(lo.radiusM, PRIVACY_RADIUS_M);
  assert.equal(hi.radiusM, PRIVACY_RADIUS_M + PRIVACY_JITTER_M);
  assert.ok(hi.kept <= lo.kept);
});

test('a track that lies wholly inside the hidden circles is refused', () => {
  assert.throws(() => trimGpx(gpx({ n: 6 }), pin), { code: 'too_short' });
});
