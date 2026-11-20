// G12, D10 (Explore clean, 2026-11-20): Explore's rail cards and list rows
// in a browser, in six languages and five widths. On every drawn rail card
// the basis sits right under the figure (0 to 8 px), the figures of a strip
// stand on one line, no figure carries a "+", and no text in the card is
// cut. The list rows (phone and desktop) cut no name, region or country,
// and the figure never overlaps the name. The water mark is the house icon
// in umber; nothing on the page is teal. The receipt from a card has no
// "+". With a mouse, a rail arrow's top is 16 px or more under the save
// disc's bottom.
//
//   node scripts/verify_rail_cards.mjs   (a server at CARTA_PORT, default 4802)
//
// Settings in the URL: the whole trip for the group by plane (ps=t, pv=t,
// t=plane), the cell where a way can be missing. Shots go to SHOTS_DIR.
import { chromium } from 'playwright';
import path from 'node:path';
import { mirrorData } from './lib/dataMirror.mjs';

const PORT = Number(process.env.CARTA_PORT) || 4802;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = process.env.SHOTS_DIR || '';
const LANGS = (process.env.LANGS || 'en,nl,de,fr,es,it').split(',');
const SIZES = (process.env.SIZES || '360x780,390x844,820x1180,1180x820,1440x900').split(',').map((s) => s.split('x').map(Number));
const QUERY = process.env.QUERY ?? '&ps=t&pv=t&t=plane';

const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok: !!ok, note });
const browser = await chromium.launch();

async function open(lang, width, height, url) {
  const touch = width < 1024;
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', hasTouch: touch, isMobile: touch && width < 600 });
  await mirrorData(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.route(/supabase\.co\//, (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"no session"}' }));
  await page.addInitScript((l) => {
    try {
      localStorage.setItem('continent.lang.v1', l);
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
    } catch { /* storage unavailable */ }
  }, lang);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  return { ctx, page, errors };
}

const TEAL = `(() => {
  const teal = (c) => {
    const m = c && c.match(/rgba?\\(([\\d.]+), ([\\d.]+), ([\\d.]+)(?:, ([\\d.]+))?\\)/);
    if (!m || (m[4] != null && Number(m[4]) < 0.15)) return false;
    const [r, g, b] = [m[1], m[2], m[3]].map((v) => Number(v) / 255);
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
    if (d < 0.12 || mx - 0 < 0.2) return false;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    return h >= 165 && h <= 215 && d / mx > 0.3;
  };
  const out = [];
  for (const el of document.querySelectorAll('.explore-tab *, .bottom-nav *, .xband *, header *')) {
    // A flag keeps its own colours (a country's blue is not the app's).
    if (el.closest('.maplibregl-canvas, img, picture, .country-flag, [class*="flag"]')) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') continue;
    for (const k of ['color', 'backgroundColor', 'borderTopColor', 'fill', 'stroke']) {
      if (k === 'color' && !el.childNodes.length) continue;
      if (k.startsWith('border') && parseFloat(s.borderTopWidth) === 0) continue;
      if (teal(s[k])) { out.push((el.className?.baseVal ?? el.className) + ' ' + k + ' ' + s[k]); break; }
    }
  }
  return out.slice(0, 5);
})()`;

for (const lang of LANGS) {
  for (const [w, h] of SIZES) {
    const tag = `${lang} ${w}`;
    const { ctx, page, errors } = await open(lang, w, h, `${BASE}?tab=explore${QUERY}`);
    await page.waitForSelector('.explore-tab .xrc .xrc-fig', { timeout: 90000 });
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => {
      const out = { cards: 0, gap: [], aligned: [], plus: [], cut: [], clamped: [] };
      for (const rail of [...document.querySelectorAll('.explore-tab .xrails-rail')].slice(0, 4)) {
        const tops = [];
        for (const c of rail.querySelectorAll('.xrc:not(.xrc-spacer)')) {
          const fig = c.querySelector('.xrc-fig');
          if (!fig) continue;
          out.cards += 1;
          const name = c.querySelector('.hs-rcard-name')?.textContent || '';
          const fb = fig.getBoundingClientRect();
          const basis = c.querySelector('.xrc-basis');
          if (basis) {
            const d = basis.getBoundingClientRect().top - fb.bottom;
            if (d < -1 || d > 8) out.gap.push(`${name} ${d.toFixed(1)}`);
          }
          tops.push([name, fb.top]);
          if (/\+/.test(fig.textContent)) out.plus.push(name);
          for (const el of c.querySelectorAll('.xrc-text *')) {
            if (el.children.length || !el.textContent.trim()) continue;
            if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.cut.push(`${name}: ${el.className}`);
          }
          const nm = c.querySelector('.hs-rcard-name');
          if (nm && nm.scrollHeight > nm.clientHeight + 2) out.clamped.push(name);
        }
        if (tops.length > 1) {
          const t0 = Math.min(...tops.map((x) => x[1]));
          const t1 = Math.max(...tops.map((x) => x[1]));
          if (t1 - t0 > 1) out.aligned.push(`${rail.querySelector('h2')?.textContent}: ${(t1 - t0).toFixed(1)} px`);
        }
      }
      return out;
    });
    check(`${tag}: rail cards drawn`, r.cards >= 4, `${r.cards}`);
    check(`${tag}: basis within 8 px under the figure`, !r.gap.length, r.gap.slice(0, 3).join('; '));
    check(`${tag}: figures on one line per strip`, !r.aligned.length, r.aligned.slice(0, 2).join('; '));
    check(`${tag}: no "+" on a figure`, !r.plus.length, r.plus.slice(0, 3).join(', '));
    check(`${tag}: no cut text on a card`, !r.cut.length && !r.clamped.length, [...r.cut, ...r.clamped].slice(0, 3).join('; '));
    const teal = await page.evaluate(TEAL);
    check(`${tag}: nothing teal on Explore`, !teal.length, teal.join(' | '));
    if (SHOTS && (lang === 'en' || lang === 'nl')) {
      await page.locator('.explore-tab .xrails-rail').first().screenshot({ path: path.join(SHOTS, `rail-${lang}-${w}.png`) }).catch(() => {});
    }
    // The receipt from the first card.
    if (lang === 'en' || lang === 'nl') {
      await page.locator('.explore-tab .xrc .xrc-text').first().click();
      await page.waitForSelector('.rcp-total', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(900);
      const total = await page.locator('.rcp-total').first().innerText().catch(() => '');
      check(`${tag}: the receipt opens with no "+"`, total && !/\+/.test(total), total.replace(/\s+/g, ' '));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `receipt-${lang}-${w}.png`) });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
    // With a mouse: an arrow's top is 16 px or more under the save disc.
    if (w >= 1024) {
      const frame = page.locator('.explore-tab .hs-rail-frame').first();
      await frame.hover();
      await page.waitForTimeout(400);
      const a = await page.evaluate(() => {
        const f = document.querySelector('.explore-tab .hs-rail-frame');
        const arrow = f.querySelector('.hs-rail-arrow.is-next');
        const disc = f.querySelector('.hs-rcard-save');
        if (!arrow || !disc || getComputedStyle(arrow).display === 'none') return null;
        return arrow.getBoundingClientRect().top - disc.getBoundingClientRect().bottom;
      });
      check(`${tag}: rail arrow 16 px or more under the save disc`, a == null || a >= 16, a == null ? 'no arrow' : `${a.toFixed(1)} px`);
    }
    // The list view: rows never cut, the figure never over the name.
    await page.locator('.xrails-rail .hs-see-all:visible').first().click();
    await page.locator('.xrows--ledger .xrow').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    const L = await page.evaluate(() => {
      const out = { rows: 0, cut: [], over: [] };
      for (const row of [...document.querySelectorAll('.xrows--ledger .xrow-hs')].slice(0, 30)) {
        out.rows += 1;
        const name = row.querySelector('.xrow-name')?.textContent || '';
        for (const el of row.querySelectorAll('.xrow-name, .xrow-region, .xrow-ctry, .xfig-amount, .xfig-basis')) {
          if (el.scrollWidth > el.clientWidth + 1 || getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth) out.cut.push(`${name}: ${el.className}`);
        }
        const fig = row.querySelector('.xfig')?.getBoundingClientRect();
        for (const sel of ['.xrow-name', '.xrow-country']) {
          const b = row.querySelector(sel)?.getBoundingClientRect();
          if (fig && b && b.right > fig.left + 1 && b.left < fig.right - 1 && b.bottom > fig.top + 1 && b.top < fig.bottom - 1) out.over.push(`${name} ${sel}`);
        }
      }
      return out;
    });
    check(`${tag}: list rows drawn`, L.rows >= 8, `${L.rows}`);
    check(`${tag}: list rows cut nothing`, !L.cut.length, L.cut.slice(0, 3).join('; '));
    check(`${tag}: the figure never overlaps the name or region`, !L.over.length, L.over.slice(0, 3).join('; '));
    if (SHOTS && (lang === 'en' || lang === 'nl' || lang === 'de')) await page.screenshot({ path: path.join(SHOTS, `list-${lang}-${w}.png`) });
    check(`${tag}: no page error`, !errors.length, errors.slice(0, 2).join('; '));
    await ctx.close();
  }
}

await browser.close();
const failed = checks.filter((c) => !c.ok);
for (const c of failed) console.log(`FAIL ${c.label}${c.note ? ` (${c.note})` : ''}`);
console.log(`${checks.length - failed.length}/${checks.length} checks pass`);
process.exit(failed.length ? 1 : 0);
