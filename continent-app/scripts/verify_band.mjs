// G12, Explore top round 2 (owner: the style disc "often disappears or
// appears higher"): the two corners in a browser. The heart sits bottom left
// and, on a phone, Map bottom right, in two fixed 48 px slots just above the
// bottom nav (desktop: the heart alone, 24 px from the corner). Nothing moves
// them: their place is logged every 100 ms while the list scrolls slowly
// and fast and while the tab changes, and it must never change. At the end
// of every list, at rest, they cover nothing; a control that takes keyboard
// focus under a slot is scrolled clear of it (scroll-padding-bottom).
//
//   node scripts/verify_band.mjs      (a server at CARTA_PORT, default 5182)
//
// SIZES=360x640,390x844 picks the sizes (default the five of the contract),
// LANGS=en,de,fr the languages (default en). The search panel: see
// searchPanel() below.
// Shots go to SHOTS_DIR when it is set: <SHOT_PREFIX>corners-{w}x{h}-{state}.png.
// Supabase is answered locally (signed out); the service worker is blocked.
import { chromium } from 'playwright';
import path from 'node:path';
import { mirrorData } from './lib/dataMirror.mjs';
import { ICON_ALIGN_JS } from './lib/iconAlign.mjs';

const PORT = Number(process.env.CARTA_PORT) || 5182;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = process.env.SHOTS_DIR || '';
const PREFIX = process.env.SHOT_PREFIX || '';
const SIZES = (process.env.SIZES || '360x640,390x844,820x1180,1280x800,1440x900')
  .split(',').map((s) => s.split('x').map(Number));
// LANGS=en,de,fr runs each size in each language.
const LANGS = (process.env.LANGS || 'en').split(',');
let LANG = 'en';

const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok: !!ok, note });
const browser = await chromium.launch();

// Where the two corners are now, and the nav's top.
const corners = (page) => page.evaluate(() => {
  const r = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    if (!b.width) return null;
    return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), vis: getComputedStyle(el).visibility };
  };
  const nav = document.querySelector('.bottom-nav');
  const nb = nav && nav.getBoundingClientRect();
  return { heart: r('.corner-slot--left .corner-btn'), map: r('.corner-map .corner-btn'), navTop: nb && nb.height ? Math.round(nb.top) : innerHeight };
});

// Every visible thing a traveller reads or presses that a slot covers: a
// text run, a link, a button, a field, a photo.
const covered = (page) => page.evaluate(() => {
  const slots = [...document.querySelectorAll('.corner-slot .corner-btn')]
    .map((el) => el.getBoundingClientRect()).filter((b) => b.width && b.height);
  const hits = [];
  const meet = (r, s) => Math.min(r.right, s.right) > Math.max(r.left, s.left) && Math.min(r.bottom, s.bottom) > Math.max(r.top, s.top);
  for (const el of document.querySelectorAll('.explore-tab *, .places-tab *')) {
    if (el.closest('.corner-slot, [aria-hidden="true"], [inert]')) continue;
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!ownText && !el.matches('a, button, input, select, img')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight) continue;
    // A closed <details> keeps a box for its hidden lines (the photo
    // credits); checkVisibility leaves those out, and anything faded.
    if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    for (const s of slots) {
      if (meet(r, s)) hits.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.textContent || el.alt || '').trim().slice(0, 20)}"`);
    }
  }
  return hits;
});

// Logs both corners every 100 ms until stopped; the distinct places seen.
const startLog = (page) => page.evaluate(() => {
  window.__cornerLog = [];
  const at = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return 'none';
    const b = el.getBoundingClientRect();
    return `${Math.round(b.left)},${Math.round(b.top)},${getComputedStyle(el.closest('.corner-slot')).visibility}`;
  };
  window.__cornerTimer = setInterval(() => {
    window.__cornerLog.push(`${at('.corner-slot--left .corner-btn')}|${at('.corner-map .corner-btn')}`);
  }, 100);
});
const stopLog = (page) => page.evaluate(() => {
  clearInterval(window.__cornerTimer);
  return { n: window.__cornerLog.length, places: [...new Set(window.__cornerLog)] };
});

async function wheel(page, dy, steps, pause) {
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2, height * 0.5);
  for (let i = 0; i < steps; i += 1) { await page.mouse.wheel(0, dy / steps); await page.waitForTimeout(pause); }
}

// Scrolls the list to its true end: rails below the fold load as they come
// near, so the end moves until it stays put.
async function toEnd(page) {
  let last = -1;
  for (let i = 0; i < 8; i += 1) {
    const h = await page.evaluate(() => {
      let top = 0;
      for (const el of document.querySelectorAll('.explore-tab, .places-tab')) {
        if (!el.clientHeight) continue;
        el.scrollTop = el.scrollHeight;
        top = Math.max(top, el.scrollHeight);
      }
      return top;
    });
    await page.waitForTimeout(700);
    if (h === last) break;
    last = h;
  }
  await page.waitForTimeout(500);
}

async function open(page, url) {
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('.corner-slot--left .corner-btn', { timeout: 90000 });
  await page.waitForTimeout(2500);
}

// Judge 1 (360x640 de): the phone search panel ran under the nav, the
// corners covered it, and the field's focus ring was cut flat. With the
// field focused and a word typed: the ring is whole (no ancestor clips it,
// nothing is painted over it); on a phone both corners have faded out, the
// panel ends above the nav, Filters and Ask are on screen and a tap on
// Filters opens the sheet.
async function searchPanel(page, tag, phone) {
  await page.locator('.band-input').first().click();
  await page.keyboard.type('par', { delay: 30 });
  await page.waitForTimeout(900);
  const ring = await page.evaluate(() => {
    const box = document.querySelector('.band-search');
    const cs = getComputedStyle(box);
    const out = (parseFloat(cs.outlineWidth) || 0) + (parseFloat(cs.outlineOffset) || 0);
    const b = box.getBoundingClientRect();
    const r = { l: b.left - out, t: b.top - out, r: b.right + out, b: b.bottom + out };
    const clips = [];
    for (let el = box.parentElement; el && el !== document.documentElement; el = el.parentElement) {
      const s = getComputedStyle(el);
      const clipping = s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.clipPath !== 'none' || /paint|strict|content/.test(s.contain);
      if (!clipping) continue;
      const e = el.getBoundingClientRect();
      if (e.left > r.l + 0.5 || e.top > r.t + 0.5 || e.right < r.r - 0.5 || e.bottom < r.b - 0.5) clips.push(String(el.className).split(' ')[0]);
    }
    // What is hit on the ring's band, top and bottom, left and right of
    // the middle: it must be the field or one of its ancestors.
    const over = [];
    for (const [x, y] of [[(r.l + r.r) / 2, r.t + 1.5], [r.l + 14, r.t + 1.5], [(r.l + r.r) / 2, r.b - 1.5], [r.l + 1.5, (r.t + r.b) / 2]]) {
      const top = document.elementFromPoint(x, y);
      // A box with no ground of its own paints nothing over the ring.
      const ground = top && getComputedStyle(top).backgroundColor;
      const paints = ground && ground !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(ground);
      // The panel shares the field's stacking context: a field stacked
      // above it paints its ring over the panel.
      const panel = top?.closest?.('.band-search-panel');
      const under = panel && (Number(getComputedStyle(box).zIndex) || 0) > (Number(getComputedStyle(panel).zIndex) || 0);
      if (top && paints && !under && !top.contains(box) && !box.contains(top)) over.push(`${String(top.className).split(' ')[0]}@${Math.round(x)},${Math.round(y)}`);
    }
    return { width: cs.outlineStyle === 'none' ? 0 : out, clips, over };
  });
  check(`${tag}: the field's focus ring shows`, ring.width > 0, JSON.stringify(ring));
  check(`${tag}: no ancestor clips the field's focus ring`, ring.clips.length === 0, ring.clips.join(', '));
  check(`${tag}: nothing lies over the field's focus ring`, ring.over.length === 0, ring.over.join(', '));
  if (phone) {
    const p = await page.evaluate(() => {
      const nav = document.querySelector('.bottom-nav');
      const nb = nav?.getBoundingClientRect();
      const navTop = nb && nb.height ? nb.top : innerHeight;
      const slots = [...document.querySelectorAll('.corner-slot')].map((el) => {
        const s = getComputedStyle(el);
        return `${s.visibility}/${s.opacity}`;
      });
      const panel = document.querySelector('.band-search-panel')?.getBoundingClientRect();
      const acts = [...document.querySelectorAll('.sp-actions .sp-action')].map((el) => {
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return { top: Math.round(b.top), bottom: Math.round(b.bottom), hit: !!hit && el.contains(hit) };
      });
      return { navTop: Math.round(navTop), panelBottom: panel && Math.round(panel.bottom), slots, acts };
    });
    check(`${tag}: the corners fade out while the search is open`, p.slots.length > 0 && p.slots.every((s) => s === 'hidden/0'), p.slots.join(' '));
    check(`${tag}: the search panel ends above the nav`, p.panelBottom != null && p.panelBottom <= p.navTop, `${p.panelBottom} vs ${p.navTop}`);
    check(`${tag}: Filters and Ask are on screen and nothing covers them`, p.acts.length === 2
      && p.acts.every((a) => a.top >= 0 && a.bottom <= p.navTop && a.hit), JSON.stringify(p.acts));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${PREFIX}search-${tag}.png`) });
    await page.locator('.sp-actions .sp-action').first().click();
    const sheet = await page.waitForSelector('.flt-show', { timeout: 8000 }).then(() => true, () => false);
    check(`${tag}: a tap on the panel's Filters opens the sheet`, sheet);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    const back = await page.evaluate(() => [...document.querySelectorAll('.corner-slot')].map((el) => getComputedStyle(el).visibility));
    check(`${tag}: the corners come back when the search and the sheet close`, back.every((v) => v === 'visible'), back.join(' '));
  } else {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${PREFIX}search-${tag}.png`) });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  }
  await page.locator('.band-input').first().blur();
  await page.waitForTimeout(400);
}

async function run(width, height) {
  const tag = `${width}x${height}${LANG === 'en' ? '' : ` ${LANG}`}`;
  const phone = width <= 768;
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
  await mirrorData(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.route(/supabase\.co\//, (r) => {
    const url = r.request().url();
    if (/\/auth\/v1\/user/.test(url)) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"no session"}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript((lang) => {
    try {
      localStorage.setItem('continent.lang.v1', lang);
      localStorage.setItem('continent.guestMode.v1', '1');
      localStorage.setItem('continent.homeSeen.v1', '1');
      localStorage.setItem('carta.welcomeSeen.v1', '1');
      localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    } catch { /* storage unavailable */ }
  }, LANG);
  await open(page, '?tab=explore');
  await page.waitForSelector('.xprice', { timeout: 60000 }).catch(() => {});
  // Owner 2026-11-21 (G12): the band's chips, Filters and Ask put their
  // icon level with the word's capitals, 1 px or less (lib/iconAlign.mjs).
  await page.evaluate(() => document.fonts.ready);
  const icons = await page.evaluate(ICON_ALIGN_JS);
  const iconsOff = icons.filter((r) => Math.abs(r.dCap) > 1);
  check(`${tag}: every icon in the band level with its word's capitals`, icons.length >= 5 && iconsOff.length === 0,
    `${icons.length} chips, worst ${Math.max(...icons.map((r) => Math.abs(r.dCap)))} px${iconsOff.length ? `: ${JSON.stringify(iconsOff.slice(0, 3))}` : ''}`);

  // The slots at rest.
  const home = await corners(page);
  const h = home.heart;
  const gap = phone ? 12 : 24;
  check(`${tag}: heart bottom left, 48 px`, h && h.x <= 24 && h.w === 48 && h.h === 48, JSON.stringify(h));
  check(`${tag}: heart ${gap} px above the ${phone ? 'nav' : 'window edge'}`, h && h.y + h.h === home.navTop - gap, `${h && h.y + h.h} vs ${home.navTop - gap}`);
  if (phone) {
    const m = home.map;
    check(`${tag}: Map bottom right, 48 px, level with the heart`, m && m.w === 48 && m.h === 48 && m.y === h.y && width - (m.x + m.w) === h.x,
      JSON.stringify(m));
    check(`${tag}: the old floating Map pill is gone`, (await page.locator('.xview-fab').count()) === 0);
  } else {
    check(`${tag}: no Map corner on a desktop`, home.map === null);
  }
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${PREFIX}corners-${tag}-rest.png`) });

  await searchPanel(page, tag, phone);

  // Slow, fast, up: the slots never move.
  await startLog(page);
  await wheel(page, 1200, 40, 100);
  await wheel(page, 4000, 8, 30);
  await page.waitForTimeout(400);
  await wheel(page, -2400, 6, 30);
  await page.waitForTimeout(400);
  await wheel(page, -600, 20, 100);
  const scrolled = await stopLog(page);
  check(`${tag}: one place for the corners through ${scrolled.n} samples of slow and fast scrolling`,
    scrolled.places.length === 1 && scrolled.n >= 50, scrolled.places.slice(0, 4).join(' ; '));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${PREFIX}corners-${tag}-scrolled.png`) });

  // A control under a slot takes focus: it is scrolled clear, the slot stays.
  const focus = await page.evaluate(async () => {
    const slot = document.querySelector('.corner-slot--left .corner-btn').getBoundingClientRect();
    const sc = [...document.querySelectorAll('.explore-tab, .places-tab')].find((el) => el.clientHeight);
    const cands = [...sc.querySelectorAll('a[href], button')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width && r.height && !el.closest('[inert], [aria-hidden="true"]') && r.left < slot.right && r.right > slot.left;
    });
    // The first one below the slot's top: scroll it so it sits under the slot.
    const el = cands.find((c) => c.getBoundingClientRect().top > slot.top - 400);
    if (!el) return { none: true };
    sc.scrollTop += el.getBoundingClientRect().top - slot.top - 4;
    await new Promise((res) => setTimeout(res, 300));
    const before = el.getBoundingClientRect();
    el.focus();
    await new Promise((res) => setTimeout(res, 600));
    const after = el.getBoundingClientRect();
    const now = document.querySelector('.corner-slot--left .corner-btn').getBoundingClientRect();
    return { before: Math.round(before.bottom), after: Math.round(after.bottom), slotTop: Math.round(slot.top), slotMoved: now.top !== slot.top, name: el.className };
  });
  check(`${tag}: a focused control under the heart is scrolled clear of it`, focus.none || (focus.after <= focus.slotTop && !focus.slotMoved), JSON.stringify(focus));

  // The end of the overview: nothing under either slot at rest.
  await toEnd(page);
  const endHits = await covered(page);
  check(`${tag}: at the end of the overview the corners cover nothing`, endHits.length === 0, endHits.slice(0, 4).join('; '));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${PREFIX}corners-${tag}-end.png`) });

  // A list (the first rail's See all) and its end.
  await page.evaluate(() => { for (const el of document.querySelectorAll('.explore-tab')) el.scrollTop = 0; });
  await page.waitForTimeout(500);
  const seeAll = page.locator('.explore-tab .hs-see-all:visible').first();
  if (await seeAll.count()) {
    await seeAll.click();
    await page.waitForTimeout(2000);
    const inList = await corners(page);
    check(`${tag}: the list keeps the corners where they were`, inList.heart && inList.heart.y === h.y && inList.heart.x === h.x,
      JSON.stringify(inList.heart));
    await toEnd(page);
    const listHits = await covered(page);
    check(`${tag}: at the end of a list the corners cover nothing`, listHits.length === 0, listHits.slice(0, 4).join('; '));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${PREFIX}corners-${tag}-list-end.png`) });
  }

  // A tab change (Places to Trails and back) never moves the heart, and the
  // layer tabs and the trip library end clear of it too.
  await open(page, '?tab=explore');
  await startLog(page);
  // Each tab draws its own row, so the visible one is read again after a change.
  const tabs = () => page.locator('.band-cats [role="tab"]:visible, .xcats-bar [role="tab"]:visible');
  let changed = false;
  if (await tabs().count() > 1) {
    changed = await tabs().nth(1).click({ timeout: 8000 }).then(() => true, () => false);
    await page.waitForTimeout(1500);
    await tabs().nth(0).click({ timeout: 8000 }).catch(() => { changed = false; });
    await page.waitForTimeout(1500);
  }
  check(`${tag}: the tabs changed (Places, the next tab, Places)`, changed);
  const switched = await stopLog(page);
  const heartPlaces = new Set(switched.places.map((p) => p.split('|')[0]).filter((p) => p !== 'none'));
  check(`${tag}: a tab change leaves the heart where it was`, heartPlaces.size === 1, [...heartPlaces].join(' ; '));
  for (const cat of ['trails', 'beaches', 'trips']) {
    await open(page, `?tab=explore&cat=${cat}`);
    const c = await corners(page);
    await toEnd(page);
    const hits = await covered(page);
    check(`${tag} ${cat}: heart in the same slot, nothing covered at the end`,
      c.heart && c.heart.x === h.x && c.heart.y === h.y && !hits.length, `${JSON.stringify(c.heart)} ${hits.slice(0, 3).join('; ')}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${PREFIX}corners-${tag}-${cat}-end.png`) });
  }

  check(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
  return { tag, home, scrolled: scrolled.places.length };
}

const out = [];
for (const lang of LANGS) {
  LANG = lang;
  for (const [w, h] of SIZES) out.push(await run(w, h));
}
await browser.close();

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.note ? ` (${c.note})` : ''}`);
}
for (const o of out) console.log(`${o.tag}: heart ${JSON.stringify(o.home.heart)} map ${JSON.stringify(o.home.map)}, places while scrolling ${o.scrolled}`);
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
