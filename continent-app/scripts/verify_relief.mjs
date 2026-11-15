/**
 * The background graphic rulebook, checked in the browser (G1, house style
 * 2026-11, DESIGN.md "Background graphics"). No installed tool measures text
 * near a graphic, so this does, on every relief band a page draws:
 *
 *   1. honest: a band with contours prints at least one real height ("4,309 m");
 *   2. clear zone: no text of the band's flat side overlaps the relief zone;
 *   3. contrast: each height tag's text against the tag's own ground is 4.5 or
 *      more, and the flat side's text against the band is 4.5 or more;
 *   4. no relief without peaks: a band marked without one draws no contours.
 *
 * Point it at a server and the pages to check (the style guide shows a band
 * with peaks and one without; lanes add their pages):
 *   node scripts/verify_relief.mjs --port 5310 --pages "/?styleguide"
 * Exit code 1 on any failure.
 */
import { chromium } from 'playwright';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = `http://127.0.0.1:${arg('port', process.env.CARTA_PORT || '5173')}`;
const PAGES = arg('pages', '/?styleguide').split(',');
const WIDTHS = arg('widths', '390,820,1440').split(',').map(Number);

let failed = 0;
const fail = (m) => { failed += 1; console.log(`FAIL ${m}`); };
const browser = await chromium.launch();
for (const w of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  for (const p of PAGES) {
    await page.goto(BASE + p, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const bands = await page.evaluate(() => {
      const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => [r, g, b].map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
      const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      const groundOf = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const bg = getComputedStyle(n).backgroundColor;
          if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg;
        }
        return 'rgb(255, 255, 255)';
      };
      return [...document.querySelectorAll('.relief-band')].map((band, i) => {
        const zone = band.querySelector('.relief-zone');
        const paths = band.querySelectorAll('.relief path').length;
        const spots = [...band.querySelectorAll('.relief-spot')];
        const zr = zone?.getBoundingClientRect();
        const flatText = [...band.querySelectorAll('.relief-flat *')].filter((el) => el.childNodes.length
          && [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()));
        const overlaps = zr ? flatText.filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width && r.right > zr.left + 1 && r.left < zr.right && r.bottom > zr.top && r.top < zr.bottom;
        }).map((el) => el.textContent.trim().slice(0, 40)) : [];
        const spotContrast = spots.map((s) => ratio(getComputedStyle(s).color, groundOf(s)));
        const flatContrast = flatText.map((el) => ratio(getComputedStyle(el).color, groundOf(el)));
        return {
          i, hasZone: !!zone, paths, spots: spots.map((s) => s.textContent), overlaps,
          minSpot: spotContrast.length ? Math.min(...spotContrast) : null,
          minFlat: flatContrast.length ? Math.min(...flatContrast) : null,
        };
      });
    });
    if (!bands.length) fail(`${p} @${w}: no relief band on the page`);
    for (const b of bands) {
      const at = `${p} @${w} band ${b.i}`;
      if (b.hasZone && b.paths > 0 && !b.spots.some((t) => /\d m$/.test(t.trim()))) fail(`${at}: contours but no printed height`);
      if (!b.hasZone && b.paths > 0) fail(`${at}: contours without a zone`);
      if (b.overlaps.length) fail(`${at}: text in the relief zone: ${b.overlaps.join(' | ')}`);
      if (b.minSpot != null && b.minSpot < 4.5) fail(`${at}: height tag contrast ${b.minSpot.toFixed(2)}`);
      if (b.minFlat != null && b.minFlat < 4.5) fail(`${at}: flat side text contrast ${b.minFlat.toFixed(2)}`);
      console.log(`ok? ${at}: paths ${b.paths}, heights ${JSON.stringify(b.spots)}, min tag ${b.minSpot?.toFixed(2) ?? '-'}, min flat ${b.minFlat?.toFixed(2) ?? '-'}`);
    }
  }
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'relief rulebook: all checks pass');
process.exit(failed ? 1 : 0);
