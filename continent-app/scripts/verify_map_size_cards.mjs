// Headless check of two Explore-map behaviours, in the built app.
//
// T383 (design wave V3, 2026-10-08) updated every section of this harness.
// It was written for the map-era Explore (a From picker and a size pill in a
// .map-toolrow, a ranked .result-row list, photo cards that opened by
// themselves at zoom 9), none of which has rendered since Explore v5; on the
// V3 baseline it stopped at its first locator. Each section keeps the
// behaviour it guarded and reads it off today's controls, with a comment on
// what changed:
//
//   1. Size: one control drops the towns, villages and areas and keeps the
//      cities and metropolises, in the list AND on the map (one filtered set,
//      so the count cannot lie). It is the "Size of place" group of the filter
//      rail now (was the size pill beside the From picker). It survives a
//      reload, and Clear all clears it.
//   2. Pins that say something once you are zoomed in: from zoom 7 the pins
//      are price labels (name and day cost) and exactly one, the cheapest in
//      view, is emphasised (house rule "Price pins", explore N4). Before V3
//      this checked photo cards opening by themselves at zoom 9.
//   3. ...and go back to dots and clusters when you zoom out.
//   4. Phone: the inputs fit the screen without sideways page scroll and keep
//      a 44 px target (was: the From and size pills in the control row).
//
// Run from inside continent-app/:  node scripts/verify_map_size_cards.mjs
// The port is CARTA_PORT when set (a wave session's own preview), else 4199;
// an already running server on that port is used as it is.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = Number(process.env.CARTA_PORT || 4199);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const isUp = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
let srv = null;
const waitForServer = async () => {
  if (await isUp()) return;
  srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 90; i += 1) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview never came up');
};

let failed = 0;
const fail = (msg) => { failed += 1; console.error('  FAIL:', msg); };
const pass = (msg) => console.log('  ok:', msg);

const seed = () => {
  localStorage.setItem('continent.lang.v1', 'en');
  localStorage.setItem('continent.guestMode.v1', '1');
  localStorage.setItem('continent.homeSeen.v1', '1');
  localStorage.setItem('carta.fareNoticeSeen', '1');
  localStorage.setItem('carta.welcomeSeen', '1');
  localStorage.setItem('carta.welcomeSeen.v1', '1');
  localStorage.setItem('continent.onboardingSeen.v1', '1');
};

// T383: the count is the control bar's mono line ("3,855 places", "12 in
// view"); it was .results-head .results-count.
const counted = async (page) =>
  Number((await page.locator('.xbar .xbar-count').first().innerText()).replace(/\D/g, ''));

// The shell never scrolls sideways; if it does, something inside it grew wider
// than the viewport (a label placed off the edge would do it).
const scrollX = (page) => page.evaluate(() =>
  Math.round(window.scrollX || document.documentElement.scrollLeft || 0));

try {
  await waitForServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  await page.addInitScript(seed);

  console.log('loading Explore on the map...');
  await page.goto(`${BASE}/?tab=map&xw=map`);
  await page.locator('.xcontent-map .maplibregl-canvas').waitFor({ timeout: 90000 });
  await page.locator('.xcontent-main .xcard').first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);

  console.log('\n1. Size of place narrows the list and the map together');
  // T383: the size control is the rail's "Size of place" group (closed by
  // default), not a pill beside the From picker; it is opened first.
  const sizeFold = page.locator('.explore-side details.xrail-group', { has: page.locator('.xrail-legend', { hasText: /Size of place/ }) });
  if (!(await sizeFold.count())) fail('no "Size of place" group in the filter rail');
  else pass('the size control is in the filter rail');
  await sizeFold.locator('.xrail-legend').click();
  await page.waitForTimeout(300);
  const allCount = await counted(page);
  for (const word of [/^Metropolis$/, /^City$/]) {
    await sizeFold.locator('.xrail-toggle', { hasText: word }).click();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(800);
  const bigCount = await counted(page);
  if (!(bigCount > 0 && bigCount < allCount)) fail(`the count went ${allCount} -> ${bigCount}`);
  else pass(`cities and metropolises only: ${allCount} -> ${bigCount} in view`);
  const pressed = await sizeFold.locator('.xrail-toggle[aria-pressed="true"]').count();
  if (pressed !== 2) fail(`${pressed} size toggles say they are on`);
  else pass('aria-pressed follows the state');
  // The list is the countable proof, and every row left must be a city or a
  // metropolis, not a village only the map dropped.
  const kinds = await page.locator('.xcontent-main .xcard .xcard-kindword').allInnerTexts();
  const small = kinds.filter((k) => !/^(city|metropolis)$/i.test(k.trim()));
  if (!kinds.length) fail('the list emptied');
  else if (small.length) fail(`${small.length} smaller places stayed in the list`);
  else pass(`the list narrowed with it (${kinds.length} cards, all cities or metropolises)`);
  await page.screenshot({ path: `${SHOTS}/map-size-cities.png` });

  console.log('\n2. The answer survives a reload, and Clear all clears it');
  await page.waitForTimeout(900);          // let the URL mirror catch up
  // T383: the URL key is xk (the taxonomy filters), not big=1.
  if (!/[?&]xk=[^&]*metro/.test(page.url()) || !/[?&]xk=[^&]*city/.test(page.url())) fail(`the URL does not carry it: ${page.url().slice(-80)}`);
  else pass('the URL carries xk');
  await page.reload();
  await page.locator('.xcontent-main .xcard').first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);
  const chips = await page.locator('.xchip').allInnerTexts();
  if (!chips.some((c) => /City/.test(c)) || !chips.some((c) => /Metropolis/.test(c))) fail(`the filter forgot itself across a reload (chips: ${chips.join(' | ')})`);
  else pass('it is still on after a reload, as two chips');
  // T383: "Clear all" sits in the rail head and at the end of the chip row
  // (was the tray's Reset); the size filter must go with it.
  await page.locator('.explore-side .side-clear').click();
  await page.waitForTimeout(1200);
  if (await page.locator('.explore-side .xrail-toggle[aria-pressed="true"]').count()) fail('Clear all left a toggle on');
  else pass('Clear all put the villages back');

  console.log('\n3. Price pins once you are zoomed in');
  // A wheel gesture lands wherever it lands, and the threshold is exact, so
  // drive the view through the verify seam ExploreMap leaves on its container.
  const zoomTo = async (z) => {
    const ok = await page.evaluate((zoom) => {
      const el = document.querySelector('.xmap-canvas');
      const map = el?._cartaMap;
      if (!map) return false;
      map.jumpTo({ center: [12.34, 45.44], zoom });   // Venice and its neighbours
      return true;
    }, z);
    if (!ok) fail('the map verify seam (_cartaMap) is missing');
    await page.waitForTimeout(2500);
  };
  await zoomTo(8);
  const labels = page.locator('.xmap-kpin.is-label');
  const nLabels = await labels.count();
  if (!nLabels) fail('no price labels at zoom 8');
  else pass(`${nLabels} pins are labels`);
  if (nLabels > 30) fail(`${nLabels} labels is more than the cap of 30`);
  else pass('the cap holds');
  const figures = await page.locator('.xmap-kpin.is-label .xmap-kpin-eur').allInnerTexts();
  if (figures.length !== nLabels || figures.some((f) => !/^€\d+$/.test(f.trim()))) fail(`labels without a day cost: ${nLabels - figures.length}`);
  else pass('every label carries a mono day cost');
  const cheapest = page.locator('.xmap-kpin.is-cheapest');
  if ((await cheapest.count()) !== 1) fail(`${await cheapest.count()} pins are emphasised, not one`);
  else {
    const fig = Number((await cheapest.locator('.xmap-kpin-eur').innerText()).replace(/\D/g, ''));
    const min = Math.min(...figures.map((f) => Number(f.replace(/\D/g, ''))));
    if (fig !== min) fail(`the emphasised pin is €${fig}, the cheapest label is €${min}`);
    else pass(`exactly one pin is emphasised, the cheapest (€${fig})`);
  }
  const offEdge = await page.evaluate(() => {
    const m = document.querySelector('.xmap').getBoundingClientRect();
    return [...document.querySelectorAll('.xmap-kpin.is-label')]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.right < m.left || r.left > m.right).length;
  });
  if (offEdge) fail(`${offEdge} labels sit outside the map`);
  else pass('every label is on the map');
  const sx = await scrollX(page);
  if (sx) fail(`the shell scrolled ${sx}px sideways`);
  else pass('the shell did not scroll sideways');
  await page.screenshot({ path: `${SHOTS}/map-price-pins.png` });

  console.log('\n4. ...and back to dots and clusters when you zoom out');
  await zoomTo(5);
  const left = await page.locator('.xmap-kpin.is-label').count();
  if (left) fail(`${left} labels are still on the map at zoom 5`);
  else pass('every label went back to a dot or a cluster');
  await ctx.close();

  console.log('\n5. Phone: the inputs fit and keep their target');
  // T383: the phone row is the input row (Lifestyle, budget, month, car-free,
  // shortlist), one band that scrolls sideways inside itself; it was the
  // From and size pills.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const p2 = await phone.newPage();
  p2.on('pageerror', (e) => fail(`page error (phone): ${e.message}`));
  await p2.addInitScript(seed);
  await p2.goto(`${BASE}/?tab=map`);
  await p2.locator('.xinputs').waitFor({ timeout: 90000 });
  await p2.waitForTimeout(1500);
  const row = await p2.evaluate(() => {
    const items = [...document.querySelectorAll('.xinputs > *')].map((e) => Math.round(e.getBoundingClientRect().height));
    return {
      items,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  if (row.overflow > 0) fail(`the page scrolls ${row.overflow}px sideways on a phone`);
  else pass('no horizontal page overflow at 390px');
  const short = row.items.filter((h) => h < 44);
  if (short.length) fail(`${short.length} inputs are under the 44px target (${row.items.join(', ')})`);
  else pass(`every input keeps a 44px target (${row.items.length} inputs)`);
  const budget = p2.locator('.xinputs select').first();
  await budget.selectOption('60');
  await p2.waitForTimeout(1200);
  if (!/[?&]xb=60/.test(p2.url())) fail('the budget ceiling did not reach the URL');
  else pass('the budget ceiling filters and rides the URL (xb=60)');
  await p2.screenshot({ path: `${SHOTS}/map-size-phone.png` });

  await browser.close();
} finally {
  if (srv) srv.kill();
}

console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
