// Screenshot audit of both planners, every step, at a phone and a laptop size.
//
//   node scripts/shoot-planners.mjs                 (starts `vite` on :4231)
//   node scripts/shoot-planners.mjs --url=http://localhost:5173/
//   node scripts/shoot-planners.mjs --only=day       (trip | day)
//   node scripts/shoot-planners.mjs --viewport=mobile (mobile | desktop)
//
// Shots land in shots/planners/<viewport>/<name>.png, and every screen is
// audited for: horizontal scroll, sub-44px tap targets on the phone, console
// errors, and a sticky footer covering the last focusable control. The
// offender list prints at the end and is written to shots/planners/report.json.
//
// Data and auth come through the ?*mock seams in lib/e2eSeams.js: ?paymock
// stands in for an entitled traveller (the planned view and the bot both gate
// on it), ?savedmock puts one trip behind "Continue a trip". Nominatim and the
// plan-day Edge Function are intercepted, so the run is deterministic and
// costs neither service anything.
import { chromium, devices } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const PORT = 4231;
const BASE = (argv.url || `http://127.0.0.1:${PORT}/`).replace(/\/?$/, '/');
const OUT = 'shots/planners';

const VIEWPORTS = [
  { key: 'mobile', width: 375, height: 812, mobile: true },
  { key: 'desktop', width: 1280, height: 800, mobile: false },
].filter((v) => !argv.viewport || v.key === argv.viewport);
const FLOWS = ['trip', 'day'].filter((f) => !argv.only || f === argv.only);

// ── server ────────────────────────────────────────────────────────────────
let server = null;
const isUp = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
if (!(await isUp())) {
  if (argv.url) { console.error(`nothing answers at ${BASE}`); process.exit(1); }
  server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 120 && !(await isUp()); i += 1) await new Promise((r) => setTimeout(r, 500));
  if (!(await isUp())) { console.error('vite dev server never came up'); process.exit(1); }
}

// ── fixtures ──────────────────────────────────────────────────────────────
const NOISE = /favicon|net::ERR_|Failed to load resource|maplibre|WebGL|tile|Nominatim|ResizeObserver|emrldtp|entrypoint_config|config is not valid/i;
const GEO = [{
  display_name: 'Hotel Artemide, Via Nazionale, Rome, Lazio, Italy', name: 'Hotel Artemide',
  lat: '41.8996', lon: '12.4939', category: 'tourism', type: 'hotel',
  address: { country: 'Italy', country_code: 'it' },
}];
const PLAN = {
  summary: 'A morning in ancient Rome, lunch in Monti, then the fountains and the Pantheon after the crowds thin.',
  stops: [
    { external: true, name: 'Colosseum', lat: 41.8902, lon: 12.4922, arrive: '09:30', dwellMin: 90, why: 'Book the first slot: by eleven the queue wraps the building.', walkMinFromPrev: 0 },
    { external: true, name: 'Roman Forum', lat: 41.8925, lon: 12.4853, arrive: '11:15', dwellMin: 75, why: 'Same ticket as the Colosseum, and the shade is better before noon.', walkMinFromPrev: 8 },
    { external: true, name: 'Monti, lunch', lat: 41.8946, lon: 12.4913, arrive: '12:45', dwellMin: 60, why: 'Trattorias here still price for locals.', walkMinFromPrev: 10 },
    { external: true, name: 'Trevi Fountain', lat: 41.9009, lon: 12.4833, arrive: '14:15', dwellMin: 30, why: 'Quietest in the early afternoon.', walkMinFromPrev: 14 },
    { external: true, name: 'Pantheon', lat: 41.8986, lon: 12.4769, arrive: '15:00', dwellMin: 45, why: 'Free to enter, and the light through the oculus is best mid-afternoon.', walkMinFromPrev: 9 },
  ],
  totals: { walkKm: 4.6, endTime: '16:00' },
};

// ── audit ─────────────────────────────────────────────────────────────────
const report = [];
let consoleErrors = [];

async function audit(page, vp, flow, name) {
  const dir = `${OUT}/${vp.key}`;
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${dir}/${flow}-${name}.png` });

  const facts = await page.evaluate(({ mobile }) => {
    const doc = document.documentElement;
    const vis = (el) => {
      if (!el.isConnected) return false;
      if (el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.title || el.className || el.tagName)
      .toString().replace(/\s+/g, ' ').trim().slice(0, 48);

    // A dialog or sheet on top of the page: only its controls are reachable,
    // so only they are measured.
    const layers = [...document.querySelectorAll('[role="dialog"], .fsheet, .sheet-shell, .pass-overlay')].filter(vis);
    const scope = layers.length ? layers[layers.length - 1] : document.body;

    const targets = [...scope.querySelectorAll('button, a[href], [role="button"], input, select, [role="tab"], [role="option"]')]
      .filter(vis)
      // The tile licence's attribution links are 12px by MapLibre's design
      // and not something a traveller taps; they are excluded, not fixed.
      .filter((el) => !el.closest('.maplibregl-ctrl-attrib'));
    // A ::before with negative insets is a real tap box (browsers hit-test
    // pseudo-elements), so the measured rect grows by it.
    const tapRect = (el) => {
      // A checkbox inside its <label> is tapped through the label.
      const lab = el.matches('input[type="checkbox"], input[type="radio"]') ? el.closest('label') : null;
      const r = (lab || el).getBoundingClientRect();
      const ps = getComputedStyle(el, '::before');
      if (ps.content === 'none' || ps.position !== 'absolute') return r;
      const px = (v) => (v.endsWith('px') ? parseFloat(v) : 0);
      const t = px(ps.top), b = px(ps.bottom), l = px(ps.left), rr = px(ps.right);
      return { width: r.width - l - rr, height: r.height - t - b };
    };
    const small = mobile ? targets
      .map((el) => ({ el, r: tapRect(el) }))
      .filter(({ r }) => r.width < 44 || r.height < 44)
      .map(({ el, r }) => `${label(el)} [${Math.round(r.width)}x${Math.round(r.height)}] <${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}>`)
      : [];

    // Sticky footers: anything fixed or sticky that hugs the bottom edge.
    const footers = [...scope.querySelectorAll('*')].filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') return false;
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.width >= innerWidth * 0.5 && r.bottom >= innerHeight - 2 && r.top > innerHeight * 0.4;
    }).map((el) => ({ el, r: el.getBoundingClientRect() }));

    // The last focusable control that is not part of a footer, scrolled fully
    // into view the way a keyboard user would reach it.
    const focusables = targets.filter((el) => !footers.some((f) => f.el.contains(el)) && !el.disabled && el.tabIndex >= 0);
    const last = focusables[focusables.length - 1] || null;
    let overlap = null;
    const scrolled = [...document.querySelectorAll('*')].filter((el) => el.scrollTop > 0).map((el) => [el, el.scrollTop]);
    const winY = scrollY;
    if (last && footers.length) {
      last.scrollIntoView({ block: 'end' });
      const lr = last.getBoundingClientRect();
      for (const f of footers) {
        const fr = f.el.getBoundingClientRect();
        const covered = Math.min(lr.bottom, fr.bottom) - Math.max(lr.top, fr.top);
        if (covered > 2) overlap = `${label(last)} hidden ${Math.round(covered)}px under ${label(f.el) || f.el.className}`;
      }
      for (const el of [...document.querySelectorAll('*')]) if (el.scrollTop > 0) el.scrollTop = 0;
      for (const [el, top] of scrolled) el.scrollTop = top;
      window.scrollTo(0, winY);
    }
    return {
      hscroll: doc.scrollWidth - innerWidth,
      small,
      overlap,
      footers: footers.length,
    };
  }, { mobile: vp.mobile });

  const errs = [...new Set(consoleErrors)];
  consoleErrors = [];
  const row = { viewport: vp.key, flow, name, ...facts, errors: errs };
  report.push(row);
  const flags = [];
  if (facts.hscroll > 0) flags.push(`hscroll +${facts.hscroll}px`);
  if (facts.small.length) flags.push(`${facts.small.length} small targets`);
  if (facts.overlap) flags.push('footer overlap');
  if (errs.length) flags.push(`${errs.length} console errors`);
  console.log(`  ${flags.length ? 'FLAG' : 'ok  '} ${vp.key}/${flow}-${name}${flags.length ? '  ' + flags.join(', ') : ''}`);
  return row;
}

// ── helpers ───────────────────────────────────────────────────────────────
const seed = (page) => page.addInitScript(() => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
  } catch { /* storage unavailable */ }
});

async function newPage(browser, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    userAgent: vp.mobile ? devices['iPhone 13'].userAgent : undefined,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await seed(page);
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) consoleErrors.push('console: ' + m.text().slice(0, 160));
  });
  await page.route('**/nominatim.openstreetmap.org/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(GEO),
  }));
  await page.route('**/functions/v1/plan-day**', async (r) => {
    await new Promise((res) => setTimeout(res, 1200));
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAN) });
  });
  return { ctx, page };
}

const open = async (page, url) => {
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(1500);
};
const click = async (page, sel, ms = 700) => {
  const loc = page.locator(sel).first();
  await loc.waitFor({ timeout: 30000 });
  await loc.click();
  await page.waitForTimeout(ms);
};
const clickText = async (page, re, ms = 500) => {
  const loc = page.getByText(re).first();
  if (await loc.isVisible().catch(() => false)) { await loc.click(); await page.waitForTimeout(ms); return true; }
  console.log(`    (no control matching ${re})`);
  return false;
};
const dismissPass = async (page) => {
  if (!(await page.locator('.pass-overlay').count())) return;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  if (await page.locator('.pass-overlay').count()) {
    await page.locator('.pass-overlay .pass-close, .pass-overlay [aria-label*="lose" i]').first().click().catch(() => {});
    await page.waitForTimeout(500);
  }
};
const guideNext = async (page, ms = 1300) => {
  await page.locator('.guide-next:visible').first().click();
  await page.waitForTimeout(ms);
};

// ── the trip planner ──────────────────────────────────────────────────────
async function tripFlow(browser, vp) {
  const { ctx, page } = await newPage(browser, vp);
  const shot = (name) => audit(page, vp, 'trip', name);
  try {
    await open(page, '?tab=trip&o=CRL&paymock');
    await page.locator('.guide-next').first().waitFor({ timeout: 90000 });
    await page.waitForTimeout(800);

    // 1 Booked
    await shot('01-booked');
    await clickText(page, /^Nothing yet$/);
    await guideNext(page);

    // 2 From
    await page.locator('.guide-airport-chip, .guide-origin-home-card').first().waitFor({ timeout: 30000 }).catch(() => {});
    await shot('02-from');
    await guideNext(page);

    // 3 When: flexible, 7 nights, a month
    await clickText(page, /I'm flexible/);
    for (let i = 0; i < 25; i += 1) {
      const cur = (await page.locator('.guide-people-lg span').first().textContent().catch(() => '0')).trim();
      const k = Number(cur.match(/\d+/)?.[0] || 0);
      if (k === 7 || !k) break;
      await page.locator('.guide-people-lg button').nth(k < 7 ? 1 : 0).click();
      await page.waitForTimeout(60);
    }
    const month = page.locator('.guide-month-grid .guide-chip').nth(1);
    if (await month.count()) await month.click();
    await page.waitForTimeout(300);
    await shot('03-when');
    await guideNext(page);

    // 4 Where: the quiz tab, answered
    await page.locator('.guide-wtabs [role="tab"]').first().waitFor({ timeout: 30000 });
    await page.locator('.guide-wtabs [role="tab"]').nth(0).click();
    await page.waitForTimeout(500);
    for (const label of [/^Hidden gems$/, /^Hiking$/]) {
      const chip = page.locator('.wq-chip').filter({ hasText: label }).first();
      if (await chip.count()) await chip.click(); else await page.locator('.wq-chip').first().click();
      await page.waitForTimeout(200);
    }
    await page.locator('.wq-next').click().catch(() => {});
    await page.waitForTimeout(400);
    await clickText(page, /^Shoestring$/);
    await clickText(page, /Fly in, then trains/);
    await clickText(page, /Anywhere in Europe/);
    await clickText(page, /^A few stops$/);
    await page.locator('.mcard').first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
    await shot('04-where-quiz');

    // the country brief, opened from the first recommendation
    if (await page.locator('.mcard-info').count()) {
      await click(page, '.mcard-info', 1500);
      await page.locator('.cbrief, .cbrief-close').first().waitFor({ timeout: 30000 }).catch(() => {});
      await shot('05-where-brief');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      if (await page.locator('.cbrief-close:visible').count()) {
        await page.locator('.cbrief-close:visible').first().click().catch(() => {});
        await page.waitForTimeout(400);
      }
    }

    // the pick-by-hand tab
    await page.locator('.guide-wtabs [role="tab"]').nth(1).click();
    await page.waitForTimeout(800);
    await shot('06-where-hand');
    await click(page, '.guide-ccard-pick', 600);
    await guideNext(page, 2500);

    // 5 Trips
    await page.locator('.wtrip').first().waitFor({ timeout: 45000 });
    await page.waitForTimeout(1200);
    await shot('07-trips');

    // the trip page, opened from a card
    await click(page, '.wtrip-what', 1500);
    await page.locator('.tpage-back').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    await shot('08-trip-page');
    await page.locator('.tpage-back').first().click();
    await page.waitForTimeout(700);

    await click(page, '.wtrip-choose', 900);
    await guideNext(page, 2500);

    // 6 Getting there
    await page.locator('.tleg-head').first().waitFor({ timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await shot('09-getting-there');
    await guideNext(page, 1800);

    // 7 Finish
    await page.locator('.guide-summary-title, .guide-summary-fact').first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
    await shot('10-finish');

    // the planned view
    await guideNext(page, 3500);
    await dismissPass(page);
    await page.locator('.trip-planday-btn, .trip-sheet').first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await shot('11-planned');
  } catch (e) {
    console.log(`  ERROR trip/${vp.key}: ${String(e).split('\n')[0].slice(0, 200)}`);
    report.push({ viewport: vp.key, flow: 'trip', name: 'aborted', error: String(e).slice(0, 300) });
    await page.screenshot({ path: `${OUT}/${vp.key}/trip-ERROR.png` }).catch(() => {});
  }
  await ctx.close();
}

// ── the day planner ───────────────────────────────────────────────────────
const answerStay = async (page) => {
  await page.locator('.day-flow-search input').fill('Hotel Artemide Rome');
  await page.locator('.day-flow-search .trip-add-btn').click();
  await page.locator('.day-stay-result').first().waitFor({ timeout: 30000 });
  await page.locator('.day-stay-result').first().click();
  await page.locator('.day-flow-chosen').waitFor({ timeout: 30000 });
};
const pickDate = async (page) => {
  await page.locator('.day-flow-date').waitFor({ timeout: 30000 });
  const cells = page.locator('.day-flow-date .cal-day:not(.disabled):not(.outside):not([aria-disabled="true"]):not([disabled])');
  if (await cells.count() > 3) await cells.nth(3).click();
  await page.waitForTimeout(300);
};
const addIdea = async (page, q) => {
  const input = page.locator('.day-ideas-input');
  await input.fill(q);
  await page.locator('.day-ideas-row').first().waitFor({ timeout: 30000 });
  await page.locator('.day-ideas-row').first().click();
  await page.waitForTimeout(400);
};
const walkBot = async (page, stopAt) => {
  for (let guard = 0; guard < 30; guard += 1) {
    if (await page.locator('.rbs, .chat-result').count()) return;
    const prog = (await page.locator('.chat-progress').textContent().catch(() => '')).trim();
    if (stopAt && new RegExp(`^\\D*${stopAt}\\b`).test(prog)) return;
    const send = page.locator('.chat-send:visible').first();
    const town = page.locator('.chat-town-picker .chat-opt').first();
    const opt = page.locator('.chat-body .chat-opt:visible').first();
    if (await page.locator('.chat-free-final').count()) await page.locator('.chat-free-final .chat-send').click();
    else if (await town.count()) await town.click();
    else if (await page.locator('.chat-opts-multi').count()) {
      const first = page.locator('.chat-opts-multi .chat-opt').first();
      if (await first.count() && !(await page.locator('.chat-opts-multi .chat-opt.on').count())) await first.click();
      await send.click();
    } else if (await opt.count()) await opt.click();
    await page.waitForTimeout(350);
  }
};

async function dayFlow(browser, vp) {
  const { ctx, page } = await newPage(browser, vp);
  const shot = (name) => audit(page, vp, 'day', name);
  try {
    await open(page, '?tab=day&o=CRL&paymock&savedmock');
    await page.locator('.day-flow-search input').waitFor({ timeout: 90000 });
    await page.waitForTimeout(1000);

    // 1 Start point
    await shot('01-start');

    // the Continue-a-trip sheet
    if (await page.locator('.dtcard').count()) {
      await click(page, '.dtcard', 900);
      await page.locator('.dtday-sheet').waitFor({ timeout: 15000 }).catch(() => {});
      await shot('02-continue-sheet');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else console.log('    (no Continue-a-trip card rendered)');

    await answerStay(page);
    await click(page, '.day-flow-next', 900);

    // 2 When
    await pickDate(page);
    await shot('03-when');
    await click(page, '.day-flow-next', 900);

    // 3 Ideas, yes, with two of them
    await page.locator('.day-ideas-choice-btn').first().waitFor({ timeout: 30000 });
    await page.locator('.day-ideas-choice-btn').first().click();
    await page.waitForTimeout(500);
    await addIdea(page, 'Colosseum');
    await page.locator('.day-ideas-clear').click().catch(() => {});
    await addIdea(page, 'Pantheon');
    await page.waitForTimeout(500);
    await shot('04-ideas');
    await click(page, '.day-ideas-body .day-flow-next', 900);

    // 4 How
    await page.locator('.day-flow-card').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    await shot('05-how');

    // the bot, at its third question, then its answer
    await click(page, '.day-flow-card.primary', 1200);
    await page.locator('.chat-opt').first().waitFor({ timeout: 30000 });
    await walkBot(page, 3);
    await page.waitForTimeout(400);
    await shot('06-bot-q3');
    await walkBot(page, 0);
    await page.locator('.chat-result').waitFor({ timeout: 60000 });
    await page.waitForTimeout(2500);
    await shot('07-bot-result');
  } catch (e) {
    console.log(`  ERROR day/${vp.key}: ${String(e).split('\n')[0].slice(0, 200)}`);
    report.push({ viewport: vp.key, flow: 'day', name: 'aborted', error: String(e).slice(0, 300) });
    await page.screenshot({ path: `${OUT}/${vp.key}/day-ERROR.png` }).catch(() => {});
  }
  await ctx.close();

  // Build it myself: a fresh page, the quick answers, then the builder.
  const b = await newPage(browser, vp);
  const bshot = (name) => audit(b.page, vp, 'day', name);
  try {
    await open(b.page, '?tab=day&o=CRL&paymock');
    await b.page.locator('.day-flow-search input').waitFor({ timeout: 90000 });
    await answerStay(b.page);
    await click(b.page, '.day-flow-next', 900);
    await pickDate(b.page);
    await click(b.page, '.day-flow-next', 900);
    await b.page.locator('.day-ideas-choice-btn').first().waitFor({ timeout: 30000 });
    await b.page.locator('.day-ideas-choice-btn').nth(1).click();
    await b.page.locator('.day-flow-card').first().waitFor({ timeout: 30000 });
    await b.page.locator('.day-flow-card').nth(1).click();
    await b.page.locator('.dayex-card').first().waitFor({ timeout: 45000 });
    await b.page.waitForTimeout(2500);
    await bshot('08-build-list');
    await b.page.locator('.dayex-add').first().click({ timeout: 15000 });
    await b.page.waitForTimeout(400);
    const viewSwitch = b.page.locator('.dayex-view button').nth(1);
    if (await viewSwitch.isVisible().catch(() => false)) {
      await viewSwitch.click();
      await b.page.waitForTimeout(3000);
      await bshot('09-build-map');
      await b.page.locator('.dayex-view button').nth(0).click();
      await b.page.waitForTimeout(600);
    } else {
      // Desktop keeps the map beside the list; the list shot already has it.
      await b.page.waitForTimeout(2000);
      await bshot('09-build-map');
    }
    await click(b.page, '.dayex-tray-summary', 900);
    await bshot('10-build-tray');
  } catch (e) {
    console.log(`  ERROR builder/${vp.key}: ${String(e).split('\n')[0].slice(0, 200)}`);
    report.push({ viewport: vp.key, flow: 'day', name: 'builder-aborted', error: String(e).slice(0, 300) });
    await b.page.screenshot({ path: `${OUT}/${vp.key}/day-builder-ERROR.png` }).catch(() => {});
  }
  await b.ctx.close();
}

// ── run ───────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    console.log(`\n${vp.key} ${vp.width}x${vp.height}`);
    if (FLOWS.includes('trip')) await tripFlow(browser, vp);
    if (FLOWS.includes('day')) await dayFlow(browser, vp);
  }
} finally {
  await browser.close();
  if (server) {
    server.kill();
    if (process.platform === 'win32' && server.pid) {
      try { spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
    }
  }
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

// ── offenders ─────────────────────────────────────────────────────────────
console.log('\n== Offenders ==');
let n = 0;
for (const r of report) {
  const lines = [];
  if (r.error) lines.push(`aborted: ${r.error.split('\n')[0]}`);
  if (r.hscroll > 0) lines.push(`horizontal scroll: +${r.hscroll}px`);
  if (r.overlap) lines.push(`sticky footer covers the last control: ${r.overlap}`);
  for (const e of r.errors || []) lines.push(`console: ${e}`);
  for (const s of r.small || []) lines.push(`under 44px: ${s}`);
  if (!lines.length) continue;
  n += lines.length;
  console.log(`\n${r.viewport}/${r.flow}-${r.name}`);
  for (const l of lines) console.log(`  - ${l}`);
}
console.log(`\n${n} offender line(s) across ${report.length} screens. Shots in ${OUT}/, report in ${OUT}/report.json`);
process.exit(n ? 1 : 0);
