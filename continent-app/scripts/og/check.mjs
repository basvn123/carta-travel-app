/**
 * check.mjs, the gate for the brand assets. Exits 1 on any failure.
 *
 * It renders the sample cards from whatever wire is in public/ and checks the
 * things a link previewer or a store reviewer would reject, plus the carta-design
 * rules that can be checked by machine:
 *
 *   cards      every PNG is the declared size, under 300 KB, nothing truncated,
 *              no text left outside its box, and a long name still lays out
 *   copy       no em dash, no middot, none of the banned words, in any string a
 *              card shows or in index.html
 *   tokens     no hex colour typed in cards.mjs, specs.mjs, render.mjs, static.mjs
 *              (tokens.mjs reads them from styles.css)
 *   icons      each served and store icon exists at its stated pixel size, the
 *              App Store masters have no alpha channel, the maskable icon keeps
 *              the mark inside the 80 percent safe circle
 *   head       index.html points og:image and twitter:image at a file that exists,
 *              with absolute https URLs and the 1200 x 630 declaration
 *
 * Run from continent-app/:  node scripts/og/check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { APP_ROOT } from './tokens.mjs';
import { drawCard, FORMATS } from './cards.mjs';
import { SAMPLES, renderCard, rasterise, closeBrowser } from './render.mjs';
import { IOS_SIZES, ANDROID_DENSITIES, ANY_SHARE, SAFE_SHARE } from './icons.mjs';

const failures = [];
const fail = (m) => { failures.push(m); console.log(`FAIL ${m}`); };
const ok = (m) => console.log(`ok   ${m}`);
const assert = (cond, m) => (cond ? ok(m) : fail(m));

const BANNED = ['seamless', 'unlock', 'effortless', 'elevate', 'leverage', 'empower', 'curated', 'simply', 'just', 'easy'];
const MAX_BYTES = 300 * 1024;

function pngInfo(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} is not a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colourType: b[25], bytes: b.length };
}

function copyProblems(label, str) {
  const out = [];
  if (/—|–/.test(str)) out.push(`${label} has a dash character`);
  if (/·|•/.test(str)) out.push(`${label} has a middot or bullet`);
  for (const w of BANNED) if (new RegExp(`\\b${w}\\b`, 'i').test(str)) out.push(`${label} uses the banned word "${w}"`);
  return out;
}

async function cards() {
  const dir = APP_ROOT;
  for (const s of SAMPLES) {
    for (const format of Object.keys(FORMATS)) {
      const r = await renderCard({ ...s, format });
      const name = `${s.name} ${format}`;
      const { w, h } = FORMATS[format];
      const png = r.png;
      const dims = [png.readUInt32BE(16), png.readUInt32BE(20)];
      assert(dims[0] === w && dims[1] === h, `${name} is ${w} x ${h}`);
      assert(png.length <= MAX_BYTES, `${name} is ${(png.length / 1024).toFixed(0)} KB, under 300 KB`);
      assert(!r.fellBack || s.type === 'site', `${name} built from its own record`);
      assert(r.report.truncated.length === 0, `${name} has no truncated text`);
      assert(r.report.titleLines <= 2, `${name} title in two lines or fewer`);
      const strings = [r.spec.kind, r.spec.title, r.spec.subtitle, r.spec.alt, r.spec.strip?.label, r.spec.strip?.note,
        r.spec.panel?.head, ...(r.spec.panel?.rows || []).flatMap((x) => [x.label, x.value, x.note]), r.spec.panel?.total?.label];
      // names come from the data, so only the words Carta wrote are checked for banned words
      for (const str of strings.filter(Boolean)) for (const p of copyProblems(`${name} "${str}"`, str)) fail(p);
    }
  }
  void dir;

  // a name too long for two lines at the smallest size must be cut and reported, not clipped
  const long = {
    type: 'beach', kind: 'Beach', subtitle: 'Spain', title: 'Playa de la Concha de la Bahia de Santander y la Magdalena junto al Sardinero',
    panel: { head: 'What is measured', rows: [{ label: 'Bathing water', value: 'Excellent', note: 'Class at a very long monitoring site name that goes on and on for far too long', font: 'ui' }], total: { label: 'Carta score', value: '8.4', unit: 'of 10', tone: 'rate' } },
    strip: null, alt: 'long',
  };
  const { svg, width, height } = drawCard(long, 'og');
  const { report } = await rasterise(svg, width, height);
  assert(report.titleLines <= 2, 'a very long name wraps to two lines or fewer');
  assert(report.truncated.length > 0 || report.titleSize >= 44, 'a very long name is shrunk or reported as cut');
}

function tokens() {
  for (const f of ['cards.mjs', 'specs.mjs', 'render.mjs', 'static.mjs']) {
    const src = fs.readFileSync(path.join(APP_ROOT, 'scripts', 'og', f), 'utf8');
    const hits = src.match(/#[0-9a-fA-F]{6}\b/g);
    assert(!hits, `${f} has no typed hex colour${hits ? ` (${hits.join(', ')})` : ''}`);
  }
}

function icons() {
  const pub = (n) => path.join(APP_ROOT, 'public', n);
  const store = (...n) => path.join(APP_ROOT, 'brand', 'store', ...n);
  const want = [
    [pub('icon-192.png'), 192], [pub('icon-512.png'), 512], [pub('icon-maskable-512.png'), 512], [pub('apple-touch-icon.png'), 180],
    [store('android', 'playstore-512.png'), 512], [store('android', 'adaptive-foreground-432.png'), 432],
    ...Object.entries(ANDROID_DENSITIES).map(([n, s]) => [store('android', `ic_launcher-${n}-${s}.png`), s]),
    ...IOS_SIZES.map((s) => [store('ios', `AppIcon-${s}.png`), s]),
  ];
  for (const [file, size] of want) {
    if (!fs.existsSync(file)) { fail(`${path.relative(APP_ROOT, file)} exists`); continue; }
    const i = pngInfo(file);
    assert(i.w === size && i.h === size, `${path.relative(APP_ROOT, file).split(path.sep).join('/')} is ${size} x ${size}`);
  }
  for (const s of IOS_SIZES) {
    const i = pngInfo(store('ios', `AppIcon-${s}.png`));
    assert(i.colourType === 2, `AppIcon-${s}.png has no alpha channel`);
  }
  assert(pngInfo(pub('icon-192.png')).colourType === 2 && pngInfo(store('android', 'playstore-512.png')).colourType === 2, 'launcher and Play Store icons are opaque');
  // ring diameter is 26/32 of the mark box; the safe circle is 0.8 of the side
  assert((SAFE_SHARE * 26) / 32 <= 0.8, 'maskable mark sits inside the 80 percent safe circle');
  assert((ANY_SHARE * 26) / 32 <= 0.9, 'any icon keeps a margin round the ring');
  const ico = fs.readFileSync(pub('favicon.ico'));
  assert(ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === 3, 'favicon.ico holds three frames');
  const manifest = JSON.parse(fs.readFileSync(pub('manifest.webmanifest'), 'utf8'));
  for (const ic of manifest.icons) {
    if (ic.sizes === 'any') continue;
    const i = pngInfo(pub(ic.src.replace(/^\//, '')));
    assert(`${i.w}x${i.h}` === ic.sizes, `manifest ${ic.src} is ${ic.sizes}`);
  }
  assert(manifest.icons.some((x) => x.purpose === 'maskable' && x.type === 'image/png'), 'manifest has a maskable PNG');
}

function head() {
  const html = fs.readFileSync(path.join(APP_ROOT, 'index.html'), 'utf8');
  const meta = (attr, name) => (html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`)) || [])[1];
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  for (const p of copyProblems('index.html title', title)) fail(p);
  assert(/ \| Carta$/.test(title), 'title follows the "{title} | Carta" pattern');
  for (const name of ['og:title', 'og:description', 'twitter:title', 'twitter:description']) {
    const v = meta(name.startsWith('og') ? 'property' : 'name', name) || '';
    assert(v && copyProblems(name, v).length === 0, `${name} present and clean`);
  }
  for (const [attr, name] of [['property', 'og:image'], ['name', 'twitter:image']]) {
    const url = meta(attr, name) || '';
    const rel = url.replace('https://www.carta-europetravel.com/', '');
    assert(url.startsWith('https://') && fs.existsSync(path.join(APP_ROOT, 'public', rel)), `${name} is an absolute URL to a file that exists`);
    if (fs.existsSync(path.join(APP_ROOT, 'public', rel))) {
      const i = pngInfo(path.join(APP_ROOT, 'public', rel));
      assert(i.w === 1200 && i.h === 630 && i.bytes <= MAX_BYTES, `${name} file is 1200 x 630 and under 300 KB`);
    }
  }
  assert(meta('property', 'og:image:width') === '1200' && meta('property', 'og:image:height') === '630', 'og:image size declared');
  assert(!!meta('property', 'og:image:alt') && !!meta('name', 'twitter:image:alt'), 'image alt text declared');
  assert(!/·/.test(html), 'index.html has no middot');
}

try {
  tokens();
  icons();
  head();
  await cards();
} finally {
  await closeBrowser();
}
console.log(failures.length ? `\n${failures.length} failure(s)` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
