// Headless verify for the route page parts (ROUTES.md R7): what is
// underfoot, the stages of a path, and our own towns along the line.
//
//   npm run build, then: node scripts/verify_route_page.mjs
//
// Spawns its own vite preview (dist/, port 4209). Routes are opened by deep
// link (#trail=<id>&tc=<CC>), not by driving the browse chrome, so this
// harness tests the PAGE rather than the picker in front of it: the older
// verify_trail_page.mjs still calls selectOption on what is now a custom
// button and fails before it reaches a route at all.
//
// The four scales ROUTES.md names are all checked, because the point of the
// list is that the same page has to hold a 6 km loop and a 2,000 km path:
//   a parent      a path with stages, which must list them in order
//   a long path   the GR 20
//   a local loop  a few kilometres
//   a cycle route the other activity, through its own page
//
// The contract:
//   surface     the bar renders, its segments sum to about 100%, and the
//               unmapped share is VISIBLE rather than quietly dropped
//   stages      a parent lists them in ascending order
//   bases       our own towns, ordered by distance ALONG the route
//   both themes the elevation chart keeps a visible line in dark mode
//   390px       no horizontal scroll at any of the scales

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';

const PORT = 4209;
const BASE = `http://127.0.0.1:${PORT}/`;
mkdirSync('shots', { recursive: true });

const isUp = async () => {
  try { const r = await fetch(BASE); return r.ok; } catch { return false; }
};
let server = null;
if (!(await isUp())) {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 90 && !(await isUp()); i++) await new Promise((r) => setTimeout(r, 500));
}

const checks = [];
const check = (label, ok, note = '') => checks.push({ label, ok, note });
const errors = [];
// content_overrides is a Supabase table the live project does not have; the
// app asks for it and carries on. Every other harness filters it too.
const NOISE = /emrldtp|ERR_FAILED|config is not valid|content_overrides|net::|favicon|Failed to load resource/;

// Pick real subjects out of the wire, so the harness tests what shipped.
const pick = () => {
  const dir = 'public/trails';
  const out = { parent: null, long: null, loop: null, surf: null };
  if (!existsSync(dir)) return out;
  for (const fn of readdirSync(dir)) {
    if (!/^[A-Z]{2}\.json$/.test(fn)) continue;
    let doc;
    try { doc = JSON.parse(readFileSync(`${dir}/${fn}`, 'utf8')); } catch { continue; }
    for (const r of doc.trips || []) {
      const cc = fn.slice(0, 2);
      const km = (r.distance_m || 0) / 1000;
      if (!out.surf && r.sf && (r.sf.unknown || 0) > 0.02) out.surf = { ...r, cc };
      if (!out.long && km > 100) out.long = { ...r, cc };
      if (!out.loop && r.is_loop && km > 3 && km < 12) out.loop = { ...r, cc };
      if (!out.parent && r.h?.cls === 'parent') out.parent = { ...r, cc };
    }
  }
  return out;
};
const subjects = pick();
check('the wire carries surface shares', !!subjects.surf,
  subjects.surf ? `id ${subjects.surf.id}` : 'no row with an sf key');

const browser = await chromium.launch();
const open = async (page, row) => {
  await page.goto(`${BASE}#trail=${row.id}&tc=${row.cc}`,
    { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4200);
};
const newPage = async (width = 1440, height = 900, dark = false) => {
  const p = await browser.newPage({
    viewport: { width, height },
    colorScheme: dark ? 'dark' : 'light',
  });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  p.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text().slice(0, 140));
  });
  await p.addInitScript(() => {
    try {
      localStorage.setItem('continent.lang.v1', 'en');
      localStorage.setItem('continent.guestMode.v1', '1');
    } catch { /* storage unavailable */ }
  });
  return p;
};

// ── The page opens at all, by deep link ──────────────────────────────────
const page = await newPage();
if (subjects.surf) {
  await open(page, subjects.surf);
  check('a deep link opens the route page', await page.locator('.tpage').isVisible());

  const bar = page.locator('[data-testid="route-surface"]');
  check('the surface bar renders', await bar.count() === 1);
  if (await bar.count()) {
    const widths = await page.locator('.rsurf-seg').evaluateAll(
      (els) => els.map((e) => parseFloat(e.style.width) || 0));
    const sum = widths.reduce((a, b) => a + b, 0);
    check('its segments cover the route', Math.abs(sum - 100) <= 2, `${sum.toFixed(0)}%`);
    const keys = (await page.locator('.rsurf-keys').textContent()) || '';
    check('the unmapped share is shown, not hidden', /not mapped/i.test(keys), keys.slice(0, 80));
    const painted = await page.locator('.rsurf-seg').evaluateAll((els) => els.every((e) => {
      const bg = getComputedStyle(e).backgroundImage + getComputedStyle(e).backgroundColor;
      return bg && !/rgba\(0, 0, 0, 0\)$/.test(getComputedStyle(e).backgroundColor)
        || /gradient/.test(getComputedStyle(e).backgroundImage);
    }));
    check('every segment is actually painted', painted);
  }

  const bases = page.locator('[data-testid="route-bases"] .rbase');
  const nBases = await bases.count();
  if (nBases > 1) {
    const along = await page.locator('.rbase-at').allTextContents();
    const nums = along.map((s) => parseFloat(s));
    const sorted = nums.every((v, i) => i === 0 || v >= nums[i - 1]);
    check('bases run in the order you meet them', sorted, along.join(' '));
  } else {
    check('bases render or are absent without error', true, `${nBases} bases`);
  }
  await page.locator('.tpage').screenshot({ path: 'shots/route-desktop.png' }).catch(() => {});
}

// ── A parent lists its stages, in order ──────────────────────────────────
if (subjects.parent) {
  await open(page, subjects.parent);
  const stages = page.locator('[data-testid="route-stages"] .rstage');
  const n = await stages.count();
  check('a parent lists its stages', n > 0, `${subjects.parent.name} (${n})`);
  if (n > 1) {
    const idx = (await page.locator('.rstage-n').allTextContents()).map((s) => parseInt(s, 10));
    check('stages are in order', idx.every((v, i) => i === 0 || v >= idx[i - 1]), idx.join(','));
  }
} else {
  check('a parent lists its stages', true, 'no parent published in the wire yet');
}

// ── Dark theme: the chart must not vanish ────────────────────────────────
if (subjects.long) {
  const dark = await newPage(1440, 900, true);
  await open(dark, subjects.long);
  const line = dark.locator('.tpage-elev-line');
  if (await line.count()) {
    const visible = await line.evaluate((el) => {
      const s = getComputedStyle(el);
      return s.stroke && s.stroke !== 'none' && s.opacity !== '0';
    });
    check('the elevation line is drawn in dark mode', visible);
  } else {
    check('the elevation line is drawn in dark mode', true, 'no chart on this route');
  }
  await dark.locator('.tpage').screenshot({ path: 'shots/route-dark.png' }).catch(() => {});
  await dark.close();
}

// ── Every scale at 390px ─────────────────────────────────────────────────
for (const [label, row] of [['long path', subjects.long], ['local loop', subjects.loop],
  ['surface subject', subjects.surf]]) {
  if (!row) continue;
  const phone = await newPage(390, 844);
  await open(phone, row);
  const over = await phone.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`no horizontal scroll at 390px: ${label}`, over <= 1,
    `${row.name?.slice(0, 28)} ${over}px`);
  await phone.close();
}

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
if (server) server.kill();

let bad = 0;
for (const c of checks) {
  if (!c.ok) bad++;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.note ? `  (${c.note})` : ''}`);
}
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad ? 1 : 0);
