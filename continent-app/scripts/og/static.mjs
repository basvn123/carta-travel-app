/**
 * static.mjs, writes the two share images that are not per page.
 *
 * public/og/site.png is the fallback og:image for the home page and for any
 * page whose record cannot carry its own card (below the page floor, T205).
 * brand/social/site-square.png is the same card at 1080 x 1080 for a post
 * made by hand. The example receipt on them is one real destination read
 * from the wire, named on the card, so the figure is never typed in.
 *
 * Run from continent-app/ with the wire in public/ (npm run data first):
 *   node scripts/og/static.mjs [--sample Lisbon]
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_ROOT } from './tokens.mjs';
import { renderCard, closeBrowser } from './render.mjs';

export async function buildStatic(sample = 'Lisbon') {
  const out = [];
  for (const [format, file] of [['og', path.join(APP_ROOT, 'public', 'og', 'site.png')], ['square', path.join(APP_ROOT, 'brand', 'social', 'site-square.png')]]) {
    const r = await renderCard({ type: 'site', format, siteSample: sample });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, r.png);
    out.push(`${path.relative(APP_ROOT, file).split(path.sep).join('/')} ${r.png.length} bytes`);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--sample');
  buildStatic(i > 0 ? process.argv[i + 1] : 'Lisbon').then((o) => console.log(o.join('\n'))).finally(closeBrowser);
}
