// Headless check of the published guides gallery (community/GuidesPanel.jsx,
// community/GuidesStrip.jsx, migration 019_public_guides.sql).
//
// The rules that make publishing safe live in SQL and prove themselves on
// apply (019's self-check: no crew, no spend, no exact dates, and anon can
// read while the projection helpers cannot). This covers the half that lives
// in the browser, on the ?guidesmock seam, so it needs no credentials and
// touches no project.
//
//   1. The Explore strip states a REAL count and offers exactly one action.
//   2. With nothing published the strip is absent, not empty: an empty shelf
//      on somebody else's browse page reads as a broken feature.
//   3. The gallery opens, signed out, and lists what is published.
//   4. Country chips filter, and only countries that have a guide are offered.
//   5. A guide opens: route, nights, season, byline, the author's words.
//   6. What a guide must never carry: an exact date, a crew name, a spend
//      figure. This is the client half of migration 019's whitelist.
//   7. #guide=<id> opens the gallery straight onto that guide and strips the
//      id from the address bar.
//   8. 380px: no sideways scroll.
//
// Vite preview serves dist, so REBUILD before rerunning this.
// Run from inside continent-app/:  node scripts/verify_guides.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4196;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const isUp = async () => {
  try { return (await fetch(BASE)).ok; } catch { return false; }
};
let srv = null;
const waitForServer = async () => {
  if (await isUp()) return;
  srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    shell: true, stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview never came up');
};

let failures = 0;
const fail = (msg) => { console.error('FAIL:', msg); failures += 1; process.exitCode = 1; };
const ok = (msg) => console.log('  ok:', msg);

const GUEST = `(() => {
  localStorage.setItem('continent.lang.v1', 'en');
  localStorage.setItem('continent.guestMode.v1', '1');
  localStorage.setItem('carta.welcomeSeen', '1');
  localStorage.setItem('carta.welcomeSeen.v1', '1');
  localStorage.setItem('carta.mapGuideDone', '1');
})()`;

const boot = async (ctx, query) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message.split('\n')[0]}`));
  await page.goto(`${BASE}/${query}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2200);
  return page;
};

// Explore is keyed 'map' in state but reads Explore in both bars.
const goExplore = async (page) => {
  const tab = page.locator('.header-nav-item, .bottom-nav-item')
    .filter({ hasText: /^\s*explore\s*$/i }).locator('visible=true').first();
  if (await tab.count()) {
    await tab.click();
    await page.waitForTimeout(1500);
  }
};

const run = async () => {
  await waitForServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1360, height: 950 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await ctx.addInitScript(GUEST);

  /* ---- 1. The strip: one real count, one action ---- */
  const page = await boot(ctx, '?o=CRL&guidesmock=some');
  await goExplore(page);
  const strip = page.locator('.gld-strip');
  await strip.waitFor({ timeout: 20000 });
  const stripText = await strip.innerText();
  if (!/\b3\b/.test(stripText)) fail(`the strip does not state the real count: "${stripText}"`);
  else ok(`the Explore strip states a real count: "${stripText.replace(/\n/g, ' ')}"`);
  const stripBtns = await strip.locator('button').count();
  if (stripBtns !== 1) fail(`the strip carries ${stripBtns} buttons, expected exactly 1`);
  else ok('and offers exactly one action');
  // The count is a measured number, so it is set in the mono face.
  const monoCount = await page.locator('.gld-strip-n').count();
  if (!monoCount) fail('the strip count is not set as a measured number');
  else ok('the count is set in mono, like every other figure in this app');

  /* ---- 3. The gallery, signed out ---- */
  await strip.locator('button').click();
  await page.locator('.guides-panel').waitFor({ timeout: 15000 });
  const cards = page.locator('.gld-card');
  await cards.first().waitFor({ timeout: 10000 });
  const n = await cards.count();
  if (n !== 3) fail(`the gallery lists ${n} guides, expected 3`);
  else ok('the gallery opens signed out and lists what is published');
  const firstCard = await cards.first().innerText();
  for (const [what, re] of [
    ['a title', /canals and beer/i],
    ['the route', /Ghent/],
    ['how long', /4 nights/i],
    ['the season', /September/i],
    ['a byline', /by Sofie Vermeulen/i],
  ]) {
    if (!re.test(firstCard)) fail(`a guide card is missing ${what}: "${firstCard.replace(/\n/g, ' | ')}"`);
  }
  ok('a card carries its route, its length, its season and its byline');

  /* ---- 4. Country chips ---- */
  const chips = page.locator('.gld-chip');
  const chipCount = await chips.count();
  if (chipCount < 3) fail(`only ${chipCount} country chips, expected Everywhere plus two countries`);
  else ok(`${chipCount} filter chips, one per country that actually has a guide`);
  await chips.filter({ hasText: 'Portugal' }).first().click();
  await page.waitForTimeout(600);
  const afterFilter = await page.locator('.gld-card').count();
  if (afterFilter !== 2) fail(`filtering to Portugal left ${afterFilter} guides, expected 2`);
  else ok('a country chip filters the gallery');
  await chips.filter({ hasText: 'Everywhere' }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/guides-gallery.png` });

  /* ---- 5 and 6. One guide, and what it must never carry ---- */
  await cards.first().click();
  await page.locator('.gld-stops').waitFor({ timeout: 12000 });
  const open = await page.locator('.guides-panel').innerText();
  for (const [what, re] of [
    ['the route', /Ghent/],
    ['the second stop', /Bruges/],
    ['nights per stop', /2 nights/i],
    ['the byline', /Sofie Vermeulen/],
    ["the author's words", /canal boats queue/i],
  ]) {
    if (!re.test(open)) fail(`an opened guide is missing ${what}`);
  }
  ok('an opened guide shows its route, its nights, its byline and its words');

  // The three things migration 019 strips. A date in any obvious shape, a
  // crew name that is not the author, and any currency figure at all.
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(open) || /\b\d{1,2} (September|October|May|April)\b/.test(open)) {
    fail(`an opened guide shows an exact date: "${open.replace(/\n/g, ' | ').slice(0, 200)}"`);
  } else ok('no exact date: a guide says the season, never the nights you are away');
  if (/Jonas|Ana Rocha/.test(open)) fail('an opened guide names the crew');
  else ok('no crew: they published nothing');
  if (/€|EUR\b/.test(open)) fail('an opened guide carries a spend figure');
  else ok('no spend: what the author paid is theirs');
  // And it says so, rather than asking to be taken on trust.
  if (!/never carries/i.test(open)) fail('the guide does not say what it leaves out');
  else ok('and the page states what it leaves out');
  // The route draws, from the READER'S coordinates. A guide whose map frame
  // collapses reads as broken rather than as pending, so the frame is only
  // ever rendered when there is something to put in it.
  try {
    await page.locator('.gld-map canvas').first().waitFor({ timeout: 25000 });
    const box = await page.locator('.gld-map').boundingBox();
    if (!box || box.height < 80) fail(`the guide map frame collapsed: ${JSON.stringify(box)}`);
    else ok(`the route draws as a map, ${Math.round(box.height)}px tall`);
  } catch {
    fail('an opened guide rendered no map');
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/guides-one.png` });

  /* ---- 2. Nothing published: the strip is absent, not empty ---- */
  const emptyPage = await boot(ctx, '?o=CRL&guidesmock=none');
  await goExplore(emptyPage);
  await emptyPage.waitForTimeout(1200);
  if (await emptyPage.locator('.gld-strip').count() > 0) {
    fail('the guides strip renders with nothing published');
  } else ok('with nothing published the strip is absent, not an empty shelf');
  await emptyPage.close();

  /* ---- 7. A direct link to one guide ---- */
  const deep = await boot(ctx, '?o=CRL&guidesmock=some#guide=guide-2');
  await deep.locator('.gld-stops').waitFor({ timeout: 20000 });
  if (!/Lisbon|Ghent/.test(await deep.locator('.guides-panel').innerText())) {
    fail('a #guide= link did not open a guide');
  } else ok('a #guide= link opens the gallery straight onto that guide');
  if (/#guide=/.test(deep.url())) fail(`the guide id stayed in the address bar: ${deep.url()}`);
  else ok('and the id is stripped from the address bar');
  await deep.close();
  await ctx.close();

  /* ---- 8. A phone ---- */
  const smallCtx = await browser.newContext({ viewport: { width: 380, height: 780 } });
  await smallCtx.addInitScript(GUEST);
  const sp = await boot(smallCtx, '?o=CRL&guidesmock=some#guide=guide-1');
  await sp.locator('.gld-stops').waitFor({ timeout: 20000 });
  const over = await sp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 1) fail(`${over}px of sideways scroll at 380px`);
  else ok('no sideways scroll at 380px');
  await sp.screenshot({ path: `${SHOTS}/guides-phone.png` });
  await smallCtx.close();

  await browser.close();
  if (srv) srv.kill();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
};

run().catch((err) => {
  console.error(err);
  if (srv) srv.kill();
  process.exit(1);
});
