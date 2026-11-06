/**
 * Accessibility audit (T1128, ROADMAP G10). Runs axe-core (WCAG 2.0, 2.1 and
 * 2.2, levels A and AA) on each traveller surface at a phone and a desktop
 * width, and walks each one with the Tab key to check that every stop shows
 * a focus mark and that the walk never sticks in one place.
 *
 * It does not build anything. Start a dev server (or a preview of a build
 * made with VITE_E2E_SEAMS=1, so the ?accountmock seam exists) and point it
 * at the port:
 *   npx vite --port 5173 --strictPort
 *   node scripts/verify_axe.mjs --port 5173 --out <dir outside the repo>
 * The admin screen needs a server built with a Supabase URL so the auth
 * client exists; every Supabase call is answered locally, nothing leaves the
 * machine:
 *   VITE_SUPABASE_URL=https://ntssxktaduxzpsmejwyv.supabase.co \
 *   VITE_SUPABASE_ANON_KEY=stub npx vite --port 5174 --strictPort
 *   node scripts/verify_axe.mjs --port 5173 --admin-port 5174
 * Options: --widths 390,1280  --only home,place  --tabs 60  --gate serious
 *          --shots (a screenshot of each screen as audited, into --out)
 * Exit code 1 when any screen has a violation at or above --gate (default
 * serious: serious and critical fail, moderate and minor are reported).
 * The full JSON lands in <out>/axe-audit.json.
 */
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg('port', process.env.CARTA_PORT || '5173');
const ADMIN_PORT = arg('admin-port', '');
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = arg('out', path.resolve('axe-audit'));
const WIDTHS = arg('widths', '390,1280').split(',').map(Number);
const ONLY = arg('only', '') ? arg('only', '').split(',') : null;
const TABS = Number(arg('tabs', '60'));
const GATE = arg('gate', 'serious');
const SHOTS = process.argv.includes('--shots');
const RANK = { minor: 1, moderate: 2, serious: 3, critical: 4 };
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const SEED = () => {
  try {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.homeSeen.v1', '1');
    localStorage.setItem('carta.welcomeSeen.v1', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('carta.mapGuideDone', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  } catch { /* storage off */ }
};

async function go(p, q, wait) {
  await p.goto(`${BASE}/${q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForSelector('#root nav, #root header', { timeout: 60000 });
  // The screen's own mark: missing is reported, not fatal, so a screen that
  // renders differently still gets audited and the note says so.
  if (wait) await p.waitForSelector(wait, { timeout: 20000 }).catch(() => console.log(`       (no ${wait} on ${p.url()})`));
  await sleep(2500);
  for (const sel of ['button:has-text("Accept")', 'button:has-text("Got it")']) {
    const e = p.locator(`${sel}:visible`).first();
    if (await e.count()) await e.click().catch(() => {});
  }
  await sleep(400);
}

// Each screen opens itself. `scope` is what axe looks at (null: the page).
const SCREENS = {
  home: async (p) => { await go(p, '?tab=home', 'h1'); },
  'explore-list': async (p) => { await go(p, '?tab=explore', '.xcard, .places-ccard, .xgrid'); },
  'explore-map': async (p) => {
    await go(p, '?tab=explore', '.xview-toggle');
    await p.locator('.xview-toggle:visible').first().click();
    await p.waitForSelector('.maplibregl-canvas, .xmap', { timeout: 60000 }).catch(() => {});
    await sleep(3000);
  },
  places: async (p) => { await go(p, '?tab=explore&cat=trips', '.jstyle-card, .places-ccard, main'); },
  place: async (p) => { await go(p, '?tab=explore#dest=gem%3Abled', 'main'); await sleep(2500); },
  trail: async (p) => { await go(p, '?tab=explore&cat=trails#trail=30507&tc=AD', '[class*="trail"]'); await sleep(2500); },
  beach: async (p) => { await go(p, '?tab=explore&cat=beaches#beach=se-bla-lagunen-munson-Q31856686&bc=SE', '[class*="beach"]'); await sleep(2500); },
  'plan-start': async (p) => { await go(p, '?tab=plan&mode=new', 'main'); },
  // The trip page itself: seed Italy, then walk the wizard's Next buttons
  // until the built trip shows (or the wizard runs out of steps).
  'plan-wizard': async (p) => { await go(p, '?tab=plan&cc=IT', '.wz-head-menu'); },
  'plan-review': (p) => walkWizard(p, false),
  trip: (p) => walkWizard(p, true),
  account: async (p) => { await go(p, '?tab=account&accountmock', '.account-panel, main'); },
  'account-guest': async (p) => { await go(p, '?tab=account&accountmock=guest', '.account-panel, main'); },
  pricing: async (p) => { await go(p, '?tab=pricing', 'main'); },
};

// Seed Italy, take the first ready-made route and press Next to the review
// step; `build` then presses "Plan my trip" for the trip page itself.
async function walkWizard(p, build) {
  await go(p, '?tab=plan&cc=IT', '.wz-head-menu');
  for (let i = 0; i < 8; i++) {
    const route = p.locator(':is(button,[role="button"]):visible', { hasText: /classic|triangle/i }).first();
    if (await route.count()) { await route.click().catch(() => {}); await sleep(1500); }
    const next = p.locator('button:visible', { hasText: /^Next/ }).last();
    if (!(await next.count())) break;
    await next.click().catch(() => {});
    await sleep(2500);
  }
  if (build) {
    await p.locator('button:visible', { hasText: /^Plan my trip/ }).last().click({ timeout: 15000 });
    await sleep(4000);
  }
}

// Admin: a faked admin session (the verify_admin_panel.mjs precedent) on a
// server that has a Supabase URL. Every RPC answers an empty, valid body.
const PROJECT_REF = 'ntssxktaduxzpsmejwyv';
const ADMIN = {
  id: 'admin-1', aud: 'authenticated', role: 'authenticated', email: 'owner@example.com',
  app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2025-01-01T00:00:00Z',
};
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (c) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(c)}.sig`;
async function openAdmin(p) {
  const base = `http://127.0.0.1:${ADMIN_PORT}`;
  const tok = jwt({ sub: ADMIN.id, aal: 'aal2', exp: Math.floor(Date.now() / 1000) + 360000, role: 'authenticated' });
  const factors = [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'phone' }];
  await p.addInitScript(([ref, user, token]) => {
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
      access_token: token, token_type: 'bearer', expires_in: 360000,
      expires_at: Math.floor(Date.now() / 1000) + 360000, refresh_token: 'r', user,
    }));
  }, [PROJECT_REF, { ...ADMIN, factors }, tok]);
  const json = (r, b) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await p.route(/supabase\.co\//, (r) => {
    const u = r.request().url();
    if (u.includes('/auth/v1/token')) return json(r, { access_token: tok, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { ...ADMIN, factors } });
    if (u.includes('/auth/v1/user')) return json(r, { ...ADMIN, factors });
    if (u.includes('/auth/v1/factors')) return json(r, { all: factors, totp: factors });
    if (u.includes('/rpc/is_admin')) return json(r, true);
    if (u.includes('/rpc/admin_stats')) return json(r, { users: 12, signups_7d: 2, active_7d: 5, paid: 1, trips: 7, missing: [] });
    if (u.includes('/rpc/admin_')) return json(r, []);
    return json(r, []);
  });
  await p.goto(`${base}/?tab=account`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(3500);
  await p.locator('.account-nav:visible, .ac-row:visible', { hasText: 'Admin' }).first().click({ timeout: 20000 });
  await p.locator('.adminpage-lock, .adminpage').first().waitFor({ timeout: 20000 });
  const lock = p.locator('#admin-lock-input');
  if (await lock.count()) {
    await lock.fill('right-password');
    await p.locator('button', { hasText: 'Open admin tools' }).click();
    await sleep(2500);
  }
}
if (ADMIN_PORT) SCREENS.admin = openAdmin;

// Tab walk: how many stops show no focus mark (outline or box-shadow on the
// element or on a :focus-within card) and whether focus ever sticks.
async function tabWalk(p) {
  await p.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  await p.locator('body').focus().catch(() => {});
  const stops = [];
  let stuck = 0;
  let sameName = 0;
  let last = null;
  for (let i = 0; i < TABS; i++) {
    await p.keyboard.press('Tab');
    await sleep(80);
    const s = await p.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const ring = (c) => (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || (c.boxShadow && c.boxShadow !== 'none');
      let mark = ring(cs);
      // A stretched-link card draws the ring on the card (:focus-within).
      for (let a = el.parentElement, k = 0; !mark && a && k < 4; a = a.parentElement, k++) {
        if (a.matches(':focus-within') && ring(getComputedStyle(a)) && a.querySelectorAll('a,button').length <= 3) mark = true;
      }
      const r = el.getBoundingClientRect();
      const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 50);
      const key = `${el.tagName}.${(el.className && el.className.baseVal === undefined ? el.className : '').toString().split(' ')[0]}:${label}`;
      if (!el.dataset.axeStop) el.dataset.axeStop = String(++window.__axeStops || (window.__axeStops = 1));
      return { key, uid: el.dataset.axeStop, mark, w: Math.round(r.width), h: Math.round(r.height), hidden: r.width === 0 && r.height === 0 };
    });
    if (!s) continue;
    // Stuck: Tab left focus on the same element. Same name: a different
    // control with the same name as the one before it (WCAG 2.4.4 smell).
    if (last && s.uid === last.uid) stuck++;
    else if (last && s.key === last.key) sameName++;
    last = s;
    stops.push(s);
  }
  const noMark = stops.filter((s) => !s.mark && !s.hidden);
  return {
    stops: stops.length, noRing: noMark.length, stuck, sameName,
    noRingSample: [...new Set(noMark.map((s) => s.key))].slice(0, 8),
  };
}

// CHROMIUM_PATH (or a cloud container's /opt/pw-browsers/chromium) when the
// pinned Playwright's own browser is not installed.
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const report = {};
let failed = 0;
for (const [name, open] of Object.entries(SCREENS)) {
  if (ONLY && !ONLY.includes(name)) continue;
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 900 }, reducedMotion: 'reduce' });
    // Only the app server answers: anything remote (data host, photo CDN,
    // map tiles) fails at once instead of hanging on a closed network.
    await ctx.route((u) => !/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u.href) && !/supabase\.co\//.test(u.href), (r) => r.abort());
    const p = await ctx.newPage();
    await p.addInitScript(SEED);
    const id = `${name}@${width}`;
    try {
      await open(p);
      if (SHOTS) await p.screenshot({ path: path.join(OUT, `${id}.png`) });
      const res = await new AxeBuilder({ page: p }).withTags(TAGS).exclude('.maplibregl-canvas').analyze();
      const v = res.violations.map((x) => ({
        id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.length,
        targets: x.nodes.slice(0, 6).map((n) => n.target.join(' ')),
        summary: x.nodes[0]?.failureSummary?.split('\n').slice(0, 3).join(' | '),
      }));
      // For a name that does not hold its visible text, say what each is.
      for (const x of res.violations.filter((r) => r.id === 'label-content-name-mismatch')) {
        const vx = v.find((y) => y.id === x.id);
        vx.pairs = await p.evaluate((sels) => sels.map((s) => {
          const el = document.querySelector(s);
          if (!el) return { sel: s };
          let seen = null;
          try { axe.setup(); seen = axe.commons.text.visibleVirtual(axe.utils.getNodeFromTree(el), false, false, { ignoreIconLigature: true }); axe.teardown(); } catch { /* axe not in the page */ }
          return { sel: s, name: el.getAttribute('aria-label'), text: el.innerText.replace(/\s+/g, ' ').trim(), seen };
        }), x.nodes.slice(0, 12).map((n) => n.target[0]));
      }
      const keys = await tabWalk(p);
      const byImpact = {};
      for (const x of v) byImpact[x.impact] = (byImpact[x.impact] || 0) + x.nodes;
      const gated = v.filter((x) => RANK[x.impact] >= RANK[GATE]);
      if (gated.length || keys.stuck > 3) failed++;
      report[id] = { rules: v.length, nodes: v.reduce((a, x) => a + x.nodes, 0), byImpact, violations: v, keys };
      console.log(`${gated.length ? 'FAIL' : 'ok  '} ${id.padEnd(22)} rules ${String(v.length).padStart(2)}  nodes ${String(report[id].nodes).padStart(3)}  ${JSON.stringify(byImpact)}  tab ${keys.stops} stops, ${keys.noRing} no ring, stuck ${keys.stuck}, same name ${keys.sameName}`);
      for (const x of v) console.log(`       ${x.impact.padEnd(8)} ${x.id} (${x.nodes}): ${x.targets.slice(0, 3).join(' ; ')}`);
      if (keys.noRing) console.log(`       no ring: ${keys.noRingSample.join(' ; ')}`);
    } catch (e) {
      failed++;
      report[id] = { error: e.message.split('\n')[0] };
      console.log(`ERR  ${id}: ${report[id].error}`);
      await p.screenshot({ path: path.join(OUT, `${id}-error.png`) }).catch(() => {});
    }
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'axe-audit.json'), JSON.stringify(report, null, 2));
console.log(`\n${failed ? `${failed} screen(s) fail` : 'all screens pass'} the ${GATE} gate; JSON in ${path.join(OUT, 'axe-audit.json')}`);
process.exitCode = failed ? 1 : 0;
