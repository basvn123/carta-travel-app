// Batch end check (T482): computed styles of every visible element, master against a candidate build, each served on its own port.
// A CSS move that keeps the cascade leaves this diff empty. Usage: node scripts/style-diff.mjs [masterPort] [candidatePort] > out.txt
import { chromium } from 'playwright';

const PAGES = [
  ['home', '/'],
  ['explore', '/?tab=map'],
  ['destinations', '/?tab=places'],
  ['dest', '/#dest=FCO'],
  ['region', '/#region=COAST:BE-BELGIAN-COAST'],
  ['trail', '/#trail=176172'],
  ['beach', '/#beach=gr-voidokilia-beach-Q890802&bc=GR'],
  ['lake', '/#lake=it-lake-como-Q15523&lc=IT'],
  ['mountain', '/#mtn=it-mont-blanc-Q583&mc=IT'],
  ['cycle', '/#cycle=49051&cc=GB'],
  ['journey', '/#journey=ad-hiking-coma-pedrosa-madriu'],
  ['trip', '/?tab=trip'],
  ['day', '/?tab=day'],
  ['mytrips', '/?tab=saved'],
];
const SIZES = [['phone', 390, 844], ['desk', 1280, 860]];
const PROPS = ['display', 'position', 'width', 'height', 'margin', 'padding', 'color', 'background-color', 'background-image',
  'border', 'border-radius', 'font-size', 'font-weight', 'font-family', 'line-height', 'gap', 'grid-template-columns',
  'flex-direction', 'justify-content', 'align-items', 'opacity', 'transform', 'box-shadow', 'text-transform', 'letter-spacing', 'overflow'];

const snap = async (page) => page.evaluate((PROPS) => {
  const out = {}; const seen = {};
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || el.closest('svg') && el.tagName !== 'svg') continue;
    const cls = [...el.classList].filter((c) => c !== 'pcard-part').sort().join('.');
    let key = el.tagName.toLowerCase() + (cls ? '.' + cls : '');
    seen[key] = (seen[key] || 0) + 1; key += '#' + seen[key];
    const cs = getComputedStyle(el);
    out[key] = PROPS.map((p) => cs.getPropertyValue(p)).join('|');
  }
  return out;
}, PROPS);

const browser = await chromium.launch();
let total = 0;
for (const [sz, w, h] of SIZES) {
  for (const [name, path] of PAGES) {
    const shots = [];
    for (const port of [Number(process.argv[2] || 5261), Number(process.argv[3] || 5262)]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(2500);
      shots.push(await snap(page));
      await ctx.close();
    }
    const [a, b] = shots; const diffs = [];
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[k] === b[k]) continue;
      if (!a[k] || !b[k]) { diffs.push(`${a[k] ? '-' : '+'} ${k}`); continue; }
      const pa = a[k].split('|'), pb = b[k].split('|');
      diffs.push(`~ ${k}: ` + PROPS.map((p, i) => pa[i] !== pb[i] ? `${p} ${pa[i]} -> ${pb[i]}` : null).filter(Boolean).join('; '));
    }
    total += diffs.length;
    console.log(`${sz} ${name}: ${Object.keys(a).length} elements, ${diffs.length} differ`);
    diffs.slice(0, 12).forEach((d) => console.log('   ' + d.slice(0, 220)));
  }
}
console.log('total differing', total);
await browser.close();
