/**
 * cards.mjs, the per-page share card for the prerender (T221, register T212-b).
 *
 * Only with build.mjs --cards. For each page that has a card type it builds
 * the spec with scripts/og/specs.mjs from the record already in hand, draws it
 * with cards.mjs and rasterises it in the one shared headless Chromium that
 * scripts/og/render.mjs keeps. The PNG lands at og/<page key>.png beside the
 * pages, and the Function serves it at /og/p/<page key>.png.
 *
 * A spec that comes back null (a record that cannot carry a card honestly)
 * leaves the page on the site card, /og/site.png, as T212 designed. A page is
 * written only after its card exists, so og:image never names a missing file.
 *
 * Trail cards draw the route, so they need the geometry that pass one strips;
 * the country file is read again here, once per country.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  destinationSpec, beachSpec, lakeSpec, mountainSpec, trailSpec,
} from '../og/specs.mjs';
import { drawCard } from '../og/cards.mjs';
import { rasterise, closeBrowser } from '../og/render.mjs';

const SPEC = { beach: beachSpec, lake: lakeSpec, mountain: mountainSpec };

export async function renderCards(jobs, { out, data, destRows, onFallback }) {
  const geometry = new Map();
  const trailWithGeometry = (row) => {
    const cc = row.country;
    if (!geometry.has(cc)) {
      const f = path.join(data, 'trails', `${cc}.json`);
      const rows = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).trips || [] : [];
      geometry.set(cc, new Map(rows.map((r) => [r.id, r.geometry])));
    }
    return { ...row, geometry: geometry.get(cc).get(row.id) };
  };
  let made = 0;
  let fell = 0;
  const t0 = Date.now();
  try {
    for (const job of jobs) {
      const { card } = job;
      let spec = null;
      if (card.type === 'destination') spec = destRows[card.key] ? destinationSpec(card.key, destRows[card.key]) : null;
      else if (card.type === 'trail') spec = trailSpec(trailWithGeometry(card.row));
      else spec = SPEC[card.type]?.(card.row) || null;
      if (!spec) { onFallback(job); fell += 1; continue; }
      const { svg, width, height } = drawCard(spec, 'og');
      const { png } = await rasterise(svg, width, height);
      const file = path.join(out, job.file);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, png);
      job.page.card.alt = spec.alt;
      made += 1;
    }
  } finally {
    await closeBrowser();
  }
  console.log(`[prerender] ${made} cards, ${fell} on the site card, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return jobs;
}
