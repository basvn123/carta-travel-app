#!/usr/bin/env node
/**
 * T1175 (ROADMAP K7): rasterise the share SVGs to PNG.
 *
 * Uses the Playwright Chromium the repo already has (continent-app's
 * devDependency; no new package, research in Execution/P15/T1175-shareable-assets.md).
 * The app's own Figtree (continent-app/public/fonts, OFL) is inlined as a data
 * URL, so the PNG sets the type the app sets and nothing is fetched.
 *
 *   node scripts/share/render_png.mjs <file.svg> [more.svg ...]
 *   node scripts/share/render_png.mjs --dir scripts/share/out
 * Writes <file>.png beside each SVG at the SVG's own size (scale 1).
 * CHROMIUM_PATH overrides the browser binary.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = process.env.CARTA_APP || join(ROOT, 'continent-app');

export async function renderPngs(files) {
  const require = createRequire(join(APP, 'package.json'));
  const { chromium } = require('playwright');
  const fonts = ['Figtree-latin.woff2', 'Figtree-latin-ext.woff2']
    .map((f) => readFileSync(join(APP, 'public', 'fonts', f)).toString('base64'));
  const face = fonts.map((b) => `@font-face{font-family:'Figtree';font-weight:300 900;src:url(data:font/woff2;base64,${b}) format('woff2');}`).join('');
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const out = [];
  try {
    for (const f of files) {
      const svg = readFileSync(f, 'utf8');
      const w = Number(/width="(\d+)"/.exec(svg)?.[1] || 1080);
      const h = Number(/height="(\d+)"/.exec(svg)?.[1] || 1350);
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${face}html,body{margin:0;padding:0}svg{display:block}</style></head><body>${svg}</body></html>`);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => Promise.all([300, 400, 500, 600, 700, 800].map((wt) => document.fonts.load(`${wt} 20px Figtree`))));
      const png = f.replace(/\.svg$/, '.png');
      writeFileSync(png, await page.locator('svg').screenshot({ type: 'png' }));
      await page.close();
      out.push(png);
    }
  } finally {
    await browser.close();
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let files = args.filter((a) => a.endsWith('.svg'));
  const di = args.indexOf('--dir');
  if (di >= 0) {
    const dir = args[di + 1];
    if (!existsSync(dir)) { console.error(`no folder ${dir}`); process.exit(2); }
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.svg') ? [join(d, e.name)] : []));
    files = files.concat(walk(dir));
  }
  if (!files.length) { console.error('no SVG given'); process.exit(2); }
  const done = await renderPngs(files);
  console.log(`wrote ${done.length} PNG`);
}
