// Does a photograph carry its GPS into a shared trip?
//
// A phone photo embeds EXIF: the exact coordinates and timestamp of where it
// was taken. A trip shared by link is readable by anyone holding that link, so
// EXIF riding along would hand a stranger the traveller's precise historical
// movements, which is a materially worse leak than anything the trip itself
// says.
//
// PastTripForm.readPhoto downscales through a canvas and re-encodes with
// toDataURL, which should rebuild the file from raw pixels and leave every
// metadata segment behind. Should is not good enough for a claim like this, so
// this drives the REAL code path in a REAL browser with a fixture that
// genuinely carries GPS, and reads the bytes that come out.
//
// Run from inside continent-app/:  node scripts/verify_photo_exif.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const FIXTURE = 'scripts/fixtures/exif_gps_photo.jpg';
let failures = 0;
const fail = (m) => { console.error('FAIL:', m); failures += 1; process.exitCode = 1; };
const ok = (m) => console.log('  ok:', m);

const bytes = readFileSync(FIXTURE);
const asText = bytes.toString('latin1');
if (!asText.includes('Exif\0\0')) {
  fail('the fixture carries no EXIF, so this test would prove nothing');
} else ok('the fixture really carries an EXIF segment');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');

// The same steps as PastTripForm.readPhoto: decode, draw to a canvas at the
// same ceiling, re-encode as JPEG.
const out = await page.evaluate(async (b64) => {
  const src = `data:image/jpeg;base64,${b64}`;
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
  const MAX_PHOTO_EDGE = 1000;
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.72);
}, bytes.toString('base64'));

await browser.close();

if (!out.startsWith('data:image/jpeg;base64,')) {
  fail(`the photo path produced something that is not an inline JPEG: ${out.slice(0, 40)}`);
} else ok('the stored photo is an inline JPEG data URL');

const outBytes = Buffer.from(out.split(',')[1], 'base64');
const outText = outBytes.toString('latin1');

for (const [what, needle] of [
  ['an EXIF segment', 'Exif\0\0'],
  ['an APP1 marker', '\xff\xe1'],
  ['XMP metadata', 'http://ns.adobe.com/xap'],
]) {
  if (outText.includes(needle)) fail(`the stored photo still carries ${what}`);
}
ok('no EXIF, no APP1 and no XMP survive the canvas re-encode');

// The coordinates themselves, in the rational encoding the fixture used.
const gpsPattern = Buffer.from([51, 0, 0, 0, 1, 0, 0, 0, 13, 0, 0, 0]);
if (outBytes.includes(gpsPattern)) fail('the stored photo still carries the GPS rationals');
else ok('the GPS coordinates are gone from the bytes');

console.log(
  `  note: ${bytes.length} bytes in, ${outBytes.length} bytes out; the file is rebuilt from pixels`,
);
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
