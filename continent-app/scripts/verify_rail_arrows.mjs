// G12, Explore top round 2 (owner: "the arrows move to the middle of the
// images"): the rail arrows in a browser. With a mouse they sit on the
// photos' vertical middle (within 2 px), Back over the first visible photo's
// left edge and Forward over the last one's right edge; they show on hover
// and keyboard focus only; at an end they dim (aria-disabled) and keep
// focus. On touch they never show. The head holds no arrows.
//
//   node scripts/verify_rail_arrows.mjs      (a server at CARTA_PORT, default 5182)
//
// Shots go to SHOTS_DIR when it is set: <SHOT_PREFIX>arrows-{w}x{h}.png.
import { chromium } from 'playwright';
import path from 'node:path';
import { mirrorData } from './lib/dataMirror.mjs';

const PORT = Number(process.env.CARTA_PORT) || 5182;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = process.env.SHOTS_DIR || '';
const PREFIX = process.env.SHOT_PREFIX || '';
const MOUSE = (process.env.SIZES || '820x1180,1280x800,1440x900').split(',').map((s) => s.split('x').map(Number));
const TOUCH = [[390, 844], [820, 1180]];

const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok: !!ok, note });
const browser = await chromium.launch();

async function openPage(width, height, touch) {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', hasTouch: touch, isMobile: touch });
  await mirrorData(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`${width}x${height}: no page error`, false, e.message.split('\n')[0]));
  await page.route(/supabase\.co\//, (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"no session"}' }));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
    } catch { /* storage unavailable */ }
  });
  await page.goto(BASE + '?tab=explore', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('.explore-tab .hs-rail-frame .hs-rcard-photo', { timeout: 90000 });
  await page.waitForTimeout(2500);
  return { ctx, page };
}

// The first rail's frame, its arrows and the photos in view.
const geometry = (page) => page.evaluate(() => {
  const frame = document.querySelector('.explore-tab .hs-rail-frame');
  const fr = frame.getBoundingClientRect();
  const box = (el) => {
    const b = el.getBoundingClientRect();
    return { l: b.left, r: b.right, t: b.top, b: b.bottom, mid: (b.top + b.bottom) / 2 };
  };
  const arrow = (side) => {
    const el = frame.querySelector(`.hs-rail-arrow.is-${side}`);
    const st = getComputedStyle(el);
    return { ...box(el), display: st.display, opacity: Number(st.opacity), dis: el.getAttribute('aria-disabled') };
  };
  const photos = [...frame.querySelectorAll('.hs-rcard-photo')].map(box).filter((p) => p.r > fr.left + 1 && p.l < fr.right - 1);
  const head = frame.closest('section').querySelector('.hs-rail-head');
  return {
    frame: { l: fr.left, r: fr.right },
    prev: arrow('prev'),
    next: arrow('next'),
    first: photos[0],
    last: photos[photos.length - 1],
    headArrows: head.querySelectorAll('.hs-round, .hs-rail-arrows').length,
  };
});

for (const [w, h] of MOUSE) {
  const tag = `${w}x${h} mouse`;
  const { ctx, page } = await openPage(w, h, false);
  const frame = page.locator('.explore-tab .hs-rail-frame').first();
  await frame.scrollIntoViewIfNeeded();
  await page.mouse.move(2, 2);
  await page.waitForTimeout(300);
  const rest = await geometry(page);
  check(`${tag}: no arrows in the rail head`, rest.headArrows === 0);
  check(`${tag}: the arrows are hidden until hover or focus`, rest.prev.opacity === 0 && rest.next.opacity === 0);
  const box = await frame.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
  await page.waitForTimeout(400);
  const g = await geometry(page);
  const r1 = (n) => Math.round(n * 10) / 10;
  check(`${tag}: hover shows Forward, Back dims at the start`, g.next.opacity === 1 && g.prev.dis === 'true' && g.prev.opacity > 0 && g.prev.opacity < 1,
    `next ${g.next.opacity}, prev ${g.prev.opacity} ${g.prev.dis}`);
  check(`${tag}: the arrows sit on the photo's middle (2 px)`, Math.abs(g.prev.mid - g.first.mid) <= 2 && Math.abs(g.next.mid - g.last.mid) <= 2,
    `photo ${r1(g.first.mid)}, back ${r1(g.prev.mid)}, forward ${r1(g.next.mid)}`);
  check(`${tag}: Back over the first photo's left edge`, g.prev.l >= g.first.l && g.prev.l - g.first.l <= 12 && g.prev.r < g.first.r,
    `photo ${r1(g.first.l)}, back ${r1(g.prev.l)} to ${r1(g.prev.r)}`);
  // The last photo is often a narrow peek (40 px at 820), so Forward may
  // reach past its left edge into the gap; it ends on its visible right edge.
  check(`${tag}: Forward over the last visible photo's right edge`, g.next.r <= Math.min(g.last.r, g.frame.r) && Math.min(g.last.r, g.frame.r) - g.next.r <= 12 && g.next.r > g.last.l,
    `photo ends ${r1(Math.min(g.last.r, g.frame.r))}, forward ${r1(g.next.l)} to ${r1(g.next.r)}`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${PREFIX}arrows-${w}x${h}.png`) });

  // Keyboard: See all, Back, Forward, then the cards; Forward to the end
  // keeps focus on Forward, now dimmed.
  await page.mouse.move(2, 2);
  const seeAll = page.locator('.explore-tab .hs-rail-sec').first().locator('.hs-see-all');
  await seeAll.focus();
  await page.keyboard.press('Tab');
  const onBack = await page.evaluate(() => document.activeElement?.className || '');
  await page.keyboard.press('Tab');
  const onNext = await page.evaluate(() => document.activeElement?.className || '');
  check(`${tag}: Tab goes See all, Back, Forward`, /is-prev/.test(onBack) && /is-next/.test(onNext), `${onBack} / ${onNext}`);
  await page.waitForTimeout(300);
  const shown = await geometry(page);
  check(`${tag}: keyboard focus shows the arrows`, shown.next.opacity === 1, String(shown.next.opacity));
  for (let i = 0; i < 12; i += 1) { await page.keyboard.press('Enter'); await page.waitForTimeout(250); }
  await page.waitForTimeout(600);
  const end = await page.evaluate(() => {
    const a = document.activeElement;
    return { cls: a?.className || '', dis: a?.getAttribute('aria-disabled'), opacity: a ? Number(getComputedStyle(a).opacity) : -1 };
  });
  check(`${tag}: at the end Forward keeps focus, dimmed and marked`, /is-next/.test(end.cls) && end.dis === 'true' && end.opacity > 0 && end.opacity < 1,
    JSON.stringify(end));
  await ctx.close();
}

for (const [w, h] of TOUCH) {
  const tag = `${w}x${h} touch`;
  const { ctx, page } = await openPage(w, h, true);
  const g = await geometry(page);
  check(`${tag}: no arrows on touch`, g.prev.display === 'none' && g.next.display === 'none' && g.headArrows === 0);
  await ctx.close();
}
await browser.close();

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? ` (${c.note})` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
