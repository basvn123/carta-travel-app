// Headless check of the day planner's landing flow after the visual-review
// pass: the progress rail is on screen from the FIRST question, saved work
// sits close under the question card, the locator map is gone (the popular
// city chips carry the choice), the date grid has thumb-sized targets, and
// the fork shows one filled action rather than two.
//
// It also drives the chat to its build state (with the catalogue fetch held
// open) so the route-building animation can be measured instead of guessed at.
//
// Run from inside continent-app/:  node scripts/verify_day_landing.mjs
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4193;
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

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
const ok = (msg) => console.log('  ok:', msg);

const SIZES = [
  { name: 'laptop', width: 1400, height: 900 },
  { name: 'short', width: 1360, height: 720 },
  { name: 'phone', width: 390, height: 844 },
];

// The gates every day-planner screenshot needs: guest mode, and every
// onboarding overlay already dismissed, or the map never gets a canvas.
const seed = (page) => page.addInitScript(() => {
  localStorage.setItem('continent.guestMode.v1', '1');
  localStorage.setItem('carta.fareNoticeSeen', '1');
  localStorage.setItem('carta.welcomeSeen', '1');
  localStorage.setItem('continent.onboardingSeen.v1', '1');
});

try {
  await waitForServer();
  const browser = await chromium.launch();

  for (const size of SIZES) {
    console.log(`\n${size.name} ${size.width}x${size.height}`);
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await ctx.newPage();
    await seed(page);
    await page.goto(`${BASE}/?tab=day&o=CRL`);
    await page.locator('.day-flow-top .wiz-steps').waitFor({ timeout: 120000 });
    await page.waitForTimeout(700);

    // 1. The rail is present and readable on step 1, not from step 2 onward.
    //    It is the trip planner's rail now (.wiz-steps, shared classes), so
    //    the three pills and their connectors became three named segments.
    const rail = await page.evaluate(() => {
      const steps = [...document.querySelectorAll('.day-flow-top .wiz-step')];
      const on = document.querySelector('.day-flow-top .wiz-step.now');
      const count = document.querySelector('.day-flow-top .shape-head-step');
      const upcoming = steps.find((d) => d.classList.contains('todo'));
      const cs = upcoming ? getComputedStyle(upcoming.querySelector('.wiz-step-name')) : null;
      return {
        dots: steps.length,
        named: steps.every((d) => (d.querySelector('.wiz-step-name')?.textContent || '').trim().length > 0),
        onIsFirst: on === steps[0],
        count: count ? count.textContent.trim() : '',
        upcomingColor: cs ? cs.color : '',
        visible: on ? on.getBoundingClientRect().top >= 0 : false,
      };
    });
    if (rail.dots !== 3) fail(`${size.name}: expected 3 steps in the rail, got ${rail.dots}`);
    if (!rail.named) fail(`${size.name}: a step in the rail has no name`);
    if (!rail.onIsFirst) fail(`${size.name}: step 1 is not the active step on the landing screen`);
    if (!/1/.test(rail.count)) fail(`${size.name}: no "step 1 of 3" counter, got "${rail.count}"`);
    if (!rail.visible) fail(`${size.name}: the rail is off screen on step 1`);
    else ok(`rail on screen at step 1, counter "${rail.count}"`);

    // 2. Saved work sits in the question column, close under the card, not a
    //    screen below the map.
    const gapInfo = await page.evaluate(() => {
      const panel = document.querySelector('.day-flow-panel');
      const saved = document.querySelector('.day-flow-saved');
      const forms = document.querySelector('.day-flow-forms');
      const map = document.querySelector('.day-flow-mappanel');
      if (!panel || !saved) return null;
      const p = panel.getBoundingClientRect();
      const s = saved.getBoundingClientRect();
      const m = map ? map.getBoundingClientRect() : null;
      return {
        gap: Math.round(s.top - p.bottom),
        inColumn: !!(forms && forms.contains(saved)),
        sameLeft: Math.abs(Math.round(s.left - p.left)) <= 2,
        // Stacked, the map is deliberately BETWEEN the question and saved
        // work, so the raw gap is the map's height and says nothing.
        stacked: !!(m && m.top >= p.bottom - 1 && m.bottom <= s.top + 1),
        gapAfterMap: m ? Math.round(s.top - m.bottom) : null,
      };
    });
    if (!gapInfo) fail(`${size.name}: no saved-work block on the landing screen`);
    else {
      const gap = gapInfo.stacked ? gapInfo.gapAfterMap : gapInfo.gap;
      if (!gapInfo.inColumn) fail(`${size.name}: saved work is not in the question column`);
      if (gap > 60) fail(`${size.name}: ${gap}px of dead space above saved work`);
      if (!gapInfo.sameLeft) fail(`${size.name}: saved work does not line up with the question card`);
      else ok(`saved work ${gap}px under the ${gapInfo.stacked ? 'map' : 'card'}, same column`);
    }

    // 3. The locator map is gone: the popular-city chips carry the choice,
    //    and the question column is one centered reading width.
    const column = await page.evaluate(() => {
      const split = document.querySelector('.day-flow-split');
      const flow = document.querySelector('.day-flow');
      if (!split || !flow) return null;
      const s = split.getBoundingClientRect();
      const f = flow.getBoundingClientRect();
      return {
        mapGone: !document.querySelector('.day-flow-mapside, .day-flow-mappanel'),
        width: Math.round(s.width),
        centered: Math.abs((s.left - f.left) - (f.right - s.right)) <= 2,
      };
    });
    if (!column) fail(`${size.name}: no question column on the landing screen`);
    else {
      if (!column.mapGone) fail(`${size.name}: the locator map still renders on the landing`);
      if (column.width > 660) fail(`${size.name}: question column is ${column.width}px, wider than a reading column`);
      if (!column.centered) fail(`${size.name}: question column is not centered`);
      else ok(`no locator map, question column ${column.width}px centered`);
    }
    await page.screenshot({ path: `${SHOTS}/day-landing-${size.name}.png`, fullPage: size.name === 'phone' });

    // 4. Step 2: the date grid's touch targets, and the chosen-destination
    //    banner standing in for the removed locator map.
    const chip = page.locator('.day-flow-chip').first();
    const chipCity = (await chip.innerText()).replace(/[\d.]+/g, '').trim();
    await chip.click();
    await page.locator('.day-flow-next').click();
    await page.locator('.day-flow-date').waitFor({ timeout: 30000 });
    await page.waitForTimeout(400);
    const destBanner = page.locator('.day-flow-dest');
    if (await destBanner.count() !== 1) fail(`${size.name}: no chosen-destination banner on step 2`);
    else {
      const bannerText = (await destBanner.innerText()).trim();
      if (!bannerText.includes(chipCity)) fail(`${size.name}: banner says "${bannerText}", expected "${chipCity}"`);
      if (await destBanner.locator('.day-thumb').count() !== 1) fail(`${size.name}: destination banner has no thumb`);
      else ok(`destination banner: "${chipCity}" with thumb`);
    }
    const cal = await page.evaluate(() => {
      const d = document.querySelector('.day-flow-date .cal-day');
      const r = d ? d.getBoundingClientRect() : null;
      const body = document.querySelector('.day-flow-screen');
      return {
        cell: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
        font: d ? parseFloat(getComputedStyle(d).fontSize) : 0,
        overflow: body ? body.scrollHeight - body.clientHeight : 0,
      };
    });
    if (!cal.cell) fail(`${size.name}: no date cells on step 2`);
    else {
      // 44px is the smallest target a thumb hits reliably; the old grid sat
      // near 43px with 12.5px numerals.
      if (cal.cell.w < 44 || cal.cell.h < 44) fail(`${size.name}: date cells are ${cal.cell.w}x${cal.cell.h}px`);
      if (cal.font < 13.5) fail(`${size.name}: date numerals at ${cal.font}px`);
      else ok(`date cells ${cal.cell.w}x${cal.cell.h}px at ${cal.font}px, step overflow ${cal.overflow}px`);
    }
    await page.screenshot({ path: `${SHOTS}/day-when-${size.name}.png` });

    // 5. Step 3: one filled action, a badge you can read, and the banner now
    //    carries the picked date too.
    await page.locator('.day-flow-next').click();
    await page.locator('.day-flow-cards').waitFor({ timeout: 30000 });
    await page.waitForTimeout(300);
    if (await page.locator('.day-flow-dest .day-flow-dest-date').count() !== 1) {
      fail(`${size.name}: the banner does not show the picked date on step 3`);
    } else ok('banner carries the picked date on step 3');
    const fork = await page.evaluate(() => {
      const solid = (el) => {
        const bg = getComputedStyle(el).backgroundColor;
        const m = bg.match(/[\d.]+/g) || [];
        return m.length >= 3 && (m.length < 4 || Number(m[3]) > 0.05);
      };
      const gos = [...document.querySelectorAll('.day-flow-card-go')];
      const tag = document.querySelector('.day-flow-card-tag');
      return {
        gos: gos.length,
        filled: gos.filter(solid).length,
        tagSize: tag ? parseFloat(getComputedStyle(tag).fontSize) : 0,
      };
    });
    if (fork.gos !== 2) fail(`${size.name}: expected 2 fork actions, got ${fork.gos}`);
    if (fork.filled !== 1) fail(`${size.name}: ${fork.filled} filled fork actions, expected exactly 1`);
    if (fork.tagSize < 10.5) fail(`${size.name}: "Recommended" badge at ${fork.tagSize}px`);
    else ok(`fork: ${fork.filled}/2 filled, badge ${fork.tagSize}px`);
    await page.screenshot({ path: `${SHOTS}/day-how-${size.name}.png` });

    // 5b. Pick places, start the plan, then come back. Starting a plan clears
    //     the chosen stay, and every step past the first is built around that
    //     stay, so the flow has to be back on question 1 (the only step that
    //     also lists saved day plans). Parked on "how" it rendered an empty
    //     page holding one dead "Start planning" button.
    await page.locator('.day-flow-card').nth(1).click();
    await page.locator('.day-explore-search-input').waitFor({ timeout: 30000 });
    await page.locator('.day-explore-search-input').fill('Tivoli');
    await page.locator('.day-explore-search-result').first().click({ timeout: 15000 });
    await page.locator('.guide-city-side-add').first().click({ timeout: 15000 });
    await page.locator('.day-build-btn').click();
    await page.locator('.trip-newtrip-btn').first().click({ timeout: 30000 });
    const back = await page.evaluate(() => ({
      count: document.querySelector('.day-flow-top .shape-head-step')?.textContent.trim() || '',
      question: !!document.querySelector('.day-flow-search'),
      saved: document.querySelectorAll('.day-flow-saved .trip-saved-item').length,
      stranded: !!document.querySelector('.day-build') && !document.querySelector('.day-explore'),
    }));
    if (back.stranded) fail(`${size.name}: back from a plan lands on the stayless build screen`);
    else if (!back.count.endsWith('1 of 3') || !back.question) fail(`${size.name}: back from a plan lands on "${back.count}", no stay question`);
    else ok(`back from a plan: ${back.count}, ${back.saved} saved plan(s) listed`);

    await ctx.close();
  }

  // 6. The route-building state. Holding the catalogue fetch open keeps the
  //    build on screen long enough to measure what it actually renders.
  console.log('\nroute-building state');
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await seed(page);
  // Hold the plan-day call open: the build state is the thing under test, and
  // it is otherwise on screen for as long as the round trip happens to take.
  await page.route('**/functions/v1/plan-day*', async (route) => {
    await new Promise((r) => setTimeout(r, 8000));
    await route.continue();
  });
  await page.goto(`${BASE}/?tab=day&o=CRL`);
  await page.locator('.day-flow-chip').first().waitFor({ timeout: 120000 });
  await page.locator('.day-flow-chip').first().click();
  await page.locator('.day-flow-next').click();
  await page.locator('.day-flow-next').click();
  await page.locator('.day-flow-card.primary').click();
  await page.locator('.chat-opt').first().waitFor({ timeout: 30000 });

  // Walk the questionnaire: single-select advances on tap, multi-select and
  // the town step need their own confirm.
  for (let guard = 0; guard < 24; guard += 1) {
    if (await page.locator('.rbs').count()) break;
    const send = page.locator('.chat-send:visible').first();
    const town = page.locator('.chat-town-picker .chat-opt').first();
    const opt = page.locator('.chat-body .chat-opt:visible').first();
    if (await page.locator('.chat-free-final').count()) {
      await page.locator('.chat-free-final .chat-send').click();
    } else if (await town.count()) {
      await town.click();
    } else if (await page.locator('.chat-opts-multi').count()) {
      await send.click();
    } else if (await opt.count()) {
      await opt.click();
    }
    await page.waitForTimeout(200);
  }
  await page.locator('.rbs').waitFor({ timeout: 30000 });
  // Long enough for the first server-cadence line to arrive, well inside the
  // held-open window.
  await page.waitForTimeout(2600);
  const rbs = await page.evaluate(() => {
    const el = document.querySelector('.rbs');
    const rows = [...document.querySelectorAll('.rbs-line-row')];
    const line = document.querySelector('.rbs-line');
    return {
      typingDotsStillUsed: !!document.querySelector('.chat-body .chat-typing'),
      hasSvg: !!document.querySelector('.rbs-svg'),
      nodes: document.querySelectorAll('.rbs-node').length,
      animated: line ? getComputedStyle(line).animationName : '',
      live: el ? el.getAttribute('aria-live') : '',
      rows: rows.map((r) => r.textContent.trim()),
      placeholders: rows.some((r) => /\{\w+\}/.test(r.textContent)),
    };
  });
  console.log(' ', JSON.stringify(rbs, null, 1));
  if (rbs.typingDotsStillUsed) fail('the build still shows a typing bubble');
  if (!rbs.hasSvg || rbs.nodes < 3) fail('no route drawing in the build state');
  if (rbs.animated !== 'rbs-draw') fail(`the route line is not drawing (animation: ${rbs.animated})`);
  if (rbs.live !== 'polite') fail('the build state is not announced to screen readers');
  if (!rbs.rows.length) fail('the build shows no log lines');
  if (rbs.placeholders) fail(`a log line rendered raw placeholders: ${rbs.rows.join(' | ')}`);
  if (!process.exitCode) ok(`route drawing + ${rbs.rows.length} log line(s), no placeholders`);
  // Three frames across one draw cycle: a single shot only ever catches the
  // line at one point, which says nothing about whether it draws.
  for (let f = 0; f < 3; f += 1) {
    await page.screenshot({ path: `${SHOTS}/day-building${f ? `-${f}` : ''}.png` });
    await page.waitForTimeout(900);
  }
  await ctx.close();

  await browser.close();
  if (process.exitCode !== 1) console.log('\nverify_day_landing OK');
} catch (err) {
  fail(err.message);
} finally {
  if (srv) {
    srv.kill();
    if (process.platform === 'win32' && srv.pid) {
      try { spawnSync('taskkill', ['/pid', String(srv.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
    }
  }
  process.exit(process.exitCode === 1 ? 1 : 0);
}
