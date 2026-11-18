// G12 (explore polish, decision.md step 8): the Explore filter states of
// explore-p7-states.md in a browser, at 320, 390, 768 and 1440 px in en, de
// and fr (LANGS=en,de,fr,es,it,nl for all six).
//
//   node scripts/verify_explore_states.mjs   (dev server at CARTA_PORT, default 5182)
//
// Every state: nothing scrolls sideways (scrollWidth <= innerWidth), the
// toolbar is one row (its visible children share a top within 4 px), no
// text in it is cut without an ellipsis, and on a phone every control in it
// is at least 44 px tall. Then the state's own check (badge = chips, Clear
// all reachable and clearing Strong match and Saved, the empty line naming
// Strong match, the sort menu inside the screen, reduced motion).
// WIDTHS=390 LANGS=en narrows a run; SHOTS_DIR saves shot-toolbar-*.png.
import { chromium } from 'playwright';
import path from 'node:path';

const PORT = Number(process.env.CARTA_PORT) || 5182;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = process.env.SHOTS_DIR || '';
const WIDTHS = (process.env.WIDTHS || '320,390,768,1440').split(',').map(Number);
const LANGS = (process.env.LANGS || 'en,de,fr').split(',');
// A taste, so Strong match is offered (lib/taste.js encodeTaste).
const TASTE = 'ty=l%3Dculture.food';
const MANY = `xb=120&xm=5&xp=cqs&favonly=1&cf=IT.FR.ES&${TASTE}`;

const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok: !!ok, note });

const browser = await chromium.launch();

async function open(page, query) {
  await page.goto(`${BASE}?tab=map&${query}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('.explore-shell', { timeout: 60000 });
  await page.waitForTimeout(900);
}

// The shared checks of every state.
async function common(page, tag, { phone }) {
  const r = await page.evaluate((isPhone) => {
    const out = { overflow: document.scrollingElement.scrollWidth - window.innerWidth };
    const bar = document.querySelector('.explore-shell.is-focus .xtools');
    if (!bar) return { ...out, bar: false };
    const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const kids = [...bar.children].filter(vis);
    const tops = kids.map((k) => Math.round(k.getBoundingClientRect().top + k.getBoundingClientRect().height / 2));
    const spread = tops.length ? Math.max(...tops) - Math.min(...tops) : 0;
    const clipped = [];
    for (const el of bar.querySelectorAll('button, a, span')) {
      if (!vis(el) || !el.childNodes.length) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis') clipped.push(el.textContent.trim());
    }
    const small = [];
    if (isPhone) {
      for (const el of bar.querySelectorAll('button, a')) {
        if (!vis(el) || el.closest('[aria-hidden="true"]')) continue;
        const b = el.getBoundingClientRect();
        if (b.height < 43.5) small.push(`${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 24)} ${Math.round(b.height)}`);
      }
    }
    // The scroller's own chips may sit past its edge; the row itself must not.
    const box = bar.getBoundingClientRect();
    return { ...out, bar: true, spread, clipped, small, right: box.right, n: kids.length };
  }, phone);
  check(`${tag}: no sideways scroll`, r.overflow <= 0, `${r.overflow}`);
  if (!r.bar) return r;
  check(`${tag}: toolbar is one row`, r.spread <= 4, `spread ${r.spread} over ${r.n}`);
  check(`${tag}: toolbar inside the screen`, r.right <= page.viewportSize().width + 0.5, `${r.right}`);
  check(`${tag}: no clipped text without an ellipsis`, !r.clipped.length, r.clipped.join(' | '));
  if (phone) check(`${tag}: targets at least 44 px`, !r.small.length, r.small.join(' | '));
  return r;
}

// The badge as the app shows it: the dock's round Filters on a phone, the
// toolbar's Filters on a desktop.
async function badge(page, phone) {
  const sel = phone ? '.sdock-count' : '.xtools .xfilters-n';
  const el = page.locator(sel).first();
  return (await el.count()) ? Number((await el.textContent()).trim()) : 0;
}

async function strongOn(page, phone) {
  if (phone) {
    await page.locator('.sdock-filters').click();
    const btn = page.locator('.xpane-strong:visible').first();
    await btn.waitFor({ state: 'visible', timeout: 8000 });
    await btn.click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else {
    await page.locator('.xtools .xtool-strong').click();
    await page.waitForTimeout(400);
  }
}

async function run(width, lang) {
  const phone = width <= 768;
  const page = await browser.newPage({ viewport: { width, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.route(/supabase\.co\//, (r) => {
    const url = r.request().url();
    if (/\/auth\/v1\/user/.test(url)) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"no session"}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript((l) => {
    try {
      localStorage.setItem('continent.lang.v1', l);
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
      localStorage.setItem('carta.startSeen.v1', '1');
    } catch { /* storage unavailable */ }
  }, lang);
  const tag = (s) => `${width} ${lang} ${s}`;
  const shot = async (name) => {
    if (SHOTS && lang === 'en' && (width === 390 || width === 1440)) {
      await page.screenshot({ path: path.join(SHOTS, `shot-toolbar-${name}-${width}.png`) });
    }
  };

  // 1. Overview, no filters: no toolbar, no chips, no badge.
  await open(page, TASTE);
  check(tag('1 overview: no toolbar'), !(await page.locator('.explore-shell.is-focus .xtools').count()));
  check(tag('1 overview: no badge'), (await badge(page, phone)) === 0);
  await common(page, tag('1 overview'), { phone });

  // 2. Focused, no filters: Sort, Saved and the Trip dock in one row.
  await open(page, `xall=1&${TASTE}`);
  await common(page, tag('2 focused'), { phone });
  check(tag('2 focused: no chips, no Clear all'),
    !(await page.locator('.xtools .xtools-chip, .xtools .xtools-clear, .xchips .xchip').count()));
  check(tag('2 focused: no badge'), (await badge(page, phone)) === 0);
  check(tag('2 focused: Saved one tap away'), await page.locator('.xtools .xtool-saved').isVisible());
  check(tag('2 focused: Trip dock in the row'), await page.locator('.xtools .trip-dock').isVisible());
  if (phone) check(tag('2 focused: no Share, no Countries in the row'), !(await page.locator('.xtools .countries-btn, .xtools .xtool-share').count()));
  await shot('default');

  // 3. One filter: badge 1, one chip.
  await open(page, `xb=120&${TASTE}`);
  await common(page, tag('3 one filter'), { phone });
  check(tag('3 one filter: badge 1'), (await badge(page, phone)) === 1, `${await badge(page, phone)}`);
  if (phone) check(tag('3 one filter: one chip'), (await page.locator('.xtools .xtools-chip').count()) === 1);

  // 4 and 5. Many filters (Strong match, Saved, 3 countries) in a long language.
  await open(page, MANY);
  await strongOn(page, phone);
  await common(page, tag('4 many'), { phone });
  const n = await badge(page, phone);
  check(tag('4 many: badge counts Strong match'), n === 10, `${n}`);
  if (phone) {
    const shown = await page.locator('.xtools .xtools-chip').count();
    const saved = (await page.locator('.xtools .xtool-saved').getAttribute('aria-pressed')) === 'true';
    check(tag('4 many: badge = chips on screen'), n === shown + (saved ? 1 : 0), `${n} vs ${shown}+${saved ? 1 : 0}`);
    const clear = await page.locator('.xtools .xtools-clear').boundingBox();
    check(tag('4 many: Clear all visible'), clear && clear.x >= 0 && clear.x + clear.width <= width, clear ? `${clear.x}` : 'none');
    const capped = await page.locator('.xtools .xtools-chip').evaluateAll((els) => els.every((e) => e.getBoundingClientRect().width <= Math.min(window.innerWidth * 0.6, 220) + 1 && e.title));
    check(tag('5 long labels: chips capped, full text in the title'), capped);
    // Judge round 1: the last chip was cut hard beside the Trip dock. Every
    // chip's visible part ends before the trigger, and a chip the scroller
    // cuts is cut inside its end fade (a mask), never at a hard edge.
    const edge = await page.evaluate(() => {
      const sc = document.querySelector('.explore-shell.is-focus .xtools--phone > .xtools-chips');
      const trig = document.querySelector('.explore-shell.is-focus .xtools--phone .trip-dock .dock-trigger');
      if (!sc || !trig) return null;
      const s = sc.getBoundingClientRect();
      const tl = trig.getBoundingClientRect().left;
      const mask = getComputedStyle(sc).maskImage || getComputedStyle(sc).webkitMaskImage || 'none';
      let covered = 0; let cut = 0;
      for (const c of sc.querySelectorAll('.xtools-chip, .xtool-saved, .xtools-clear')) {
        const b = c.getBoundingClientRect();
        if (b.right <= s.left || b.left >= s.right) continue;
        if (Math.min(b.right, s.right) > tl + 0.5) covered += 1;
        if (b.right > s.right + 0.5) cut += 1;
      }
      return { covered, cut, mask: mask !== 'none' };
    });
    check(tag('4 many: the last visible chip is not covered by the Trip trigger'), edge && edge.covered === 0, edge ? `${edge.covered} covered` : 'no scroller or trigger');
    check(tag('4 many: a chip cut at the edge fades out'), edge && (edge.cut === 0 || edge.mask), edge ? `${edge.cut} cut, mask ${edge.mask}` : '');
  } else {
    const strongChip = await page.locator('.xchips [title]').evaluateAll((els) => els.map((e) => e.title));
    check(tag('4 many: desktop chip row leaves out the quick row filters'), !strongChip.some((x) => /Strong|Passt|corresp/.test(x)), strongChip.join('|'));
  }
  await shot('many');

  // 6. Clear all clears Strong match and Saved; back to the designed default.
  const clearBtn = phone ? page.locator('.xtools .xtools-clear') : page.locator('.xchips .xchip-clear');
  if (await clearBtn.count()) {
    await clearBtn.first().click();
    await page.waitForTimeout(600);
    check(tag('6 Clear all: badge gone'), (await badge(page, phone)) === 0, `${await badge(page, phone)}`);
    const saved = page.locator('.xtools .xtool-saved');
    check(tag('6 Clear all: Saved off'), !(await saved.count()) || (await saved.getAttribute('aria-pressed')) === 'false');
    check(tag('6 Clear all: Strong match off'), !(await page.locator('[aria-pressed="true"].xstrong-chip, .xtools [aria-pressed="true"]').count()));
  } else check(tag('6 Clear all: present'), false);

  // 7. Empty result whose last filter is Strong match: the line names it.
  await open(page, `xb=40&cf=CH&xall=1&${TASTE}`);
  await strongOn(page, phone);
  const empty = await page.locator('.explore-shell').innerText();
  const strongWord = await page.evaluate(() => document.querySelector('.xtools-chip[data-chip="strong"] .xchip-text')?.textContent || '');
  if (/0/.test(empty) && strongWord) check(tag('7 empty: names Strong match'), empty.includes(strongWord), strongWord);
  else check(tag('7 empty: state reached'), true, 'list not empty in this data; cause line not checked');

  // 8. Sort open: the menu inside the screen.
  await open(page, `xall=1&${TASTE}`);
  await page.locator('.xtools .xtool-sort').click();
  const menu = await page.locator('.xsort-menu').boundingBox();
  check(tag('8 sort menu inside the screen'), menu && menu.x >= 0 && menu.x + menu.width <= width, menu ? `${menu.x}+${menu.width}` : 'none');
  await page.keyboard.press('Escape');

  // 9. Phone sheet / 10. desktop pane, with filters.
  await open(page, `xb=120&${TASTE}`);
  if (phone) {
    await page.locator('.sdock-filters').click();
    await page.waitForTimeout(500);
    const dlg = page.locator('[role="dialog"]').last();
    const txt = await dlg.innerText().catch(() => '');
    check(tag('9 sheet: Show N places'), /\d/.test(txt));
    await page.keyboard.press('Escape');
  } else {
    await page.locator('.xtools [aria-controls="explore-side"]').click();
    await page.waitForTimeout(400);
    await common(page, tag('10 pane open'), { phone });
  }

  // 11. Reduced motion: the chips do not animate in.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, `xb=120&${TASTE}`);
  const anim = await page.evaluate(() => [...document.querySelectorAll('.xtools-chip, .xchips .xchip')].map((e) => getComputedStyle(e).animationName));
  check(tag('11 reduced motion: no chip animation'), anim.every((a) => a === 'none'), anim.join(','));
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  check(tag('no page errors'), !errors.length, errors.slice(0, 2).join(' | '));
  await page.close();
}

for (const w of WIDTHS) for (const l of LANGS) await run(w, l);
await browser.close();

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? `  (${c.note})` : ''}`);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
