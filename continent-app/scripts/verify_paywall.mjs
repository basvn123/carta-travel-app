/**
 * verify_paywall.mjs, a static check that the paywall's copy has not drifted.
 *
 * The paywall spans four places that have no reason to stay in step on their
 * own: the reason codes in hooks/usePaywall.jsx, the copy map in
 * components/PassModal.jsx, the call sites that pass a reason string, and six
 * locale files. A typo in any one of them shows a traveller a blank heading at
 * the exact moment they were being asked for money, and nothing else in the
 * build would notice.
 *
 * No browser, no server, no dependencies. Run it from continent-app/:
 *
 *     node scripts/verify_paywall.mjs
 *
 * T1171 (ROADMAP I14) adds a DOM half, the Pass moment walked in a browser at
 * a phone and a desktop width, with no dead end on the way. Serve a fast build
 * with the data, then:
 *
 *     node scripts/verify_paywall.mjs --dom http://localhost:5871 [--shots <dir>]
 *
 * PW_CHROMIUM names a preinstalled browser. Screenshots (only with --shots)
 * go to a gitignored folder, never into the repo.
 *
 * Exits non-zero on the first category of failure, and prints every problem it
 * found rather than only the first.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'nl'];

const read = (p) => readFileSync(join(SRC, p), 'utf8');
const problems = [];
const note = (msg) => problems.push(msg);

// --- 1. The reason codes the hook knows about -------------------------------
const hookSrc = read('hooks/usePaywall.jsx');
const gatesBlock = hookSrc.match(/export const GATES = \{([\s\S]*?)\n\};/);
if (!gatesBlock) {
  note('usePaywall.jsx: could not find the GATES object.');
}
const gates = new Map();
for (const m of (gatesBlock?.[1] ?? '').matchAll(/^\s*(\w+):\s*\{\s*kind:\s*'(hard|soft)'/gm)) {
  gates.set(m[1], m[2]);
}
if (gates.size === 0) note('usePaywall.jsx: GATES parsed as empty.');

// --- 2. The copy map in the modal -------------------------------------------
// REASON_COPY lives in lib/passMoments.js since T497 (the modal imports it).
const modalSrc = read('components/PassModal.jsx');
const momentsSrc = read('lib/passMoments.js');
const copyBlock = momentsSrc.match(/export const REASON_COPY = \{([\s\S]*?)\n\};/);
if (!copyBlock) note('lib/passMoments.js: could not find REASON_COPY.');
const copy = new Map();
for (const m of (copyBlock?.[1] ?? '').matchAll(
  /^\s*(\w+):\s*\{\s*heading:\s*'([^']+)'(?:,\s*sub:\s*'([^']+)')?\s*\}/gm
)) {
  copy.set(m[1], { heading: m[2], sub: m[3] || null });
}

// Every gate except the plain price table needs its own heading: `browse` is
// the one that deliberately falls back to the generic pass.heading.
for (const reason of gates.keys()) {
  if (reason === 'browse') continue;
  if (!copy.has(reason)) note(`passMoments REASON_COPY is missing a heading for '${reason}'.`);
}
for (const reason of copy.keys()) {
  if (!gates.has(reason)) note(`passMoments REASON_COPY has '${reason}', which is not a gate.`);
}

// --- 3. Every reason a call site actually passes -----------------------------
const walk = (dir) => readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((e) => {
  const rel = `${dir}/${e.name}`;
  if (e.isDirectory()) return walk(rel);
  return /\.(jsx?|mjs)$/.test(e.name) ? [rel] : [];
});
const files = walk('.').map((f) => f.replace(/^\.\//, ''));
for (const f of files) {
  const src = read(f);
  for (const m of src.matchAll(/paywall\.(?:require|nudge)\('([^']+)'\)/g)) {
    if (!gates.has(m[1])) note(`${f}: calls the paywall with unknown reason '${m[1]}'.`);
  }
}

// --- 4. Every key the modal can render, in all six locales -------------------
// Read off the panel itself (T460): every t('pass.*') it names, plus the
// reason headings above. A locale that loses the small print shows a buyer no
// VAT, renewal or withdrawal line, which is a revenue and a legal failure no
// other check would catch.
const wanted = new Set([...modalSrc.matchAll(/t\(\s*'(pass\.[\w]+)'/g)].map((m) => m[1]));
for (const m of modalSrc.matchAll(/'(pass\.[\w]+)'/g)) wanted.add(m[1]);
for (const { heading, sub } of copy.values()) {
  wanted.add(heading);
  if (sub) wanted.add(sub);
}

for (const lang of LOCALES) {
  const src = read(`i18n/${lang}.js`);
  for (const key of wanted) {
    // Keys are flat and double-quoted: "pass.headingExport": "...".
    if (!src.includes(`"${key}":`)) note(`i18n/${lang}.js is missing "${key}".`);
    else if (new RegExp(`"${key.replace('.', '\\.')}":\\s*""`).test(src)) {
      note(`i18n/${lang}.js has "${key}" set to an empty string.`);
    }
  }
}

// --- 4b. The withdrawal line names the 14 days --------------------------------
// T460: the consent itself is the required tick box on Stripe's page (the
// checkout function's consent_collection, with waiverText from
// _shared/passes.mjs), shown before any card is typed. The panel states the
// same fact in its one line of small print, once per plan: the yearly line
// also names the renewal. Every locale keeps the digits, so "14" is a
// language-independent check.
for (const lang of LOCALES) {
  const src = read(`i18n/${lang}.js`);
  for (const key of ['pass.legalTrip', 'pass.legalYear']) {
    const line = src.split('\n').find((l) => l.trimStart().startsWith(`"${key}":`));
    if (!line) note(`i18n/${lang}.js is missing "${key}".`);
    else if (!line.includes('14')) note(`i18n/${lang}.js: "${key}" does not name the 14-day withdrawal period.`);
  }
}
{
  if (!modalSrc.includes("'pass.legalYear'") || !modalSrc.includes("'pass.legalTrip'")) {
    note('PassModal.jsx: the small print (pass.legalTrip, pass.legalYear) is gone.');
  }
}
const sharedPasses = readFileSync(join(process.env.CARTA_REPO_ROOT || join(SRC, '..', '..'), 'supabase', 'functions', '_shared', 'passes.mjs'), 'utf8');
if (!sharedPasses.includes('14-day right of withdrawal') || !sharedPasses.includes('renews every')) {
  note('_shared/passes.mjs: the checkout waiver text no longer names the 14 days or the yearly renewal.');
}

// --- 5. Duplicate keys, which silently take the last value -------------------
for (const lang of LOCALES) {
  const src = read(`i18n/${lang}.js`);
  const seen = new Set();
  for (const m of src.matchAll(/^\s*"(pass\.[\w.]+)":/gm)) {
    if (seen.has(m[1])) note(`i18n/${lang}.js declares "${m[1]}" more than once.`);
    seen.add(m[1]);
  }
}

// --- 6. The funnel's event names, client against server ----------------------
// paywallEvents.js drops anything not in its own set before the wire, and
// paywall_event() drops anything not in its check constraint after it. Two
// lists that must agree and live in different languages, in different repos'
// worth of distance from each other, is exactly the drift this file exists for.
// CARTA_REPO_ROOT names the root checkout when continent-app is a sibling
// worktree rather than a child of it (T265-d); the same override the T265
// scripts and verify_paywall_funnel.mjs read.
const MIGRATION = join(process.env.CARTA_REPO_ROOT || join(SRC, '..', '..'), 'supabase', 'migrations', '022_paywall_events.sql');
let sqlEvents = null;
try {
  const sql = readFileSync(MIGRATION, 'utf8');
  const check = sql.match(/check \(event in \(([^)]+)\)\)/);
  if (check) sqlEvents = new Set([...check[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
} catch {
  note('supabase/migrations/022_paywall_events.sql is missing; the funnel has no server side.');
}

const clientSrc = read('lib/paywallEvents.js');
const setLine = clientSrc.match(/const EVENTS = new Set\(\[([^\]]+)\]\)/);
const clientEvents = new Set(
  [...(setLine?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
);
if (clientEvents.size === 0) note('paywallEvents.js: could not parse its EVENTS set.');

if (sqlEvents) {
  for (const e of clientEvents) {
    if (!sqlEvents.has(e)) note(`paywallEvents.js sends '${e}', which migration 022 will drop.`);
  }
  for (const e of sqlEvents) {
    if (!clientEvents.has(e)) note(`migration 022 accepts '${e}', which nothing ever sends.`);
  }
}

// Every event name actually passed to trackPaywall must be one the client set
// admits, or it is silently discarded at the door.
for (const f of files) {
  const src = read(f);
  for (const m of src.matchAll(/trackPaywall\('([^']+)'/g)) {
    if (!clientEvents.has(m[1])) note(`${f}: trackPaywall('${m[1]}') is not a known event.`);
  }
}

// --- 7. The admin funnel's copy ----------------------------------------------
// English only, like the rest of the admin panel: one operator, one language.
const adminSrc = read('admin/AdminPage.jsx');
const enSrc = read('i18n/en.js');
for (const m of adminSrc.matchAll(/t\('(admin\.funnel[\w.]*)'/g)) {
  if (!enSrc.includes(`'${m[1]}'`)) note(`i18n/en.js is missing ${m[1]}.`);
}

// --- 8. No dead end at a locked thing (T1171, ROADMAP I14) ------------------
// Every hard gate (bar the plain price table) opens the sheet with a line
// that says what the pass gives and how: the price and the days. The sheet
// always keeps a way on for free (the free sentence or the keep note, and
// the close button), and the Pass moment's own keys exist in every locale.
for (const [reason, kind] of gates) {
  if (kind !== 'hard' || reason === 'browse') continue;
  const sub = copy.get(reason)?.sub;
  if (!sub) { note(`'${reason}' opens the sheet with no line saying what the pass gives.`); continue; }
  const line = enSrc.split('\n').find((l) => l.trimStart().startsWith(`"${sub}":`)) || '';
  if (!line.includes('{price}')) note(`en "${sub}" (gate '${reason}') does not name the price.`);
}
for (const k of ["'pass.freeSentence'", "'pass.keepNote'", "label={t('shape.close')}"]) {
  if (!modalSrc.includes(k)) note(`PassModal.jsx: the free way on (${k}) is gone.`);
}
const momentSrc = read('pass/PassMoment.jsx') + read('pass/passMoment.js');
const momentKeys = new Set([...momentSrc.matchAll(/'(paywall\.[\w.]+)'/g)].map((m) => m[1]));
if (momentKeys.size < 10) note(`pass/PassMoment.jsx: only ${momentKeys.size} paywall.* keys found.`);
for (const lang of LOCALES) {
  const src = read(`i18n/${lang}.js`);
  for (const key of momentKeys) if (!src.includes(`"${key}":`)) note(`i18n/${lang}.js is missing "${key}".`);
}

// --- report ------------------------------------------------------------------
const reasons = [...gates.entries()].map(([k, v]) => `${k}:${v}`).join(', ');
if (problems.length) {
  console.error(`verify_paywall: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`verify_paywall: ok`);
console.log(`  gates    ${gates.size}  (${reasons})`);
console.log(`  keys     ${wanted.size} x ${LOCALES.length} locales = ${wanted.size * LOCALES.length} strings`);
console.log(`  events   ${[...clientEvents].join(', ')}${sqlEvents ? ' (client and migration 022 agree)' : ''}`);
console.log(`  scanned  ${files.length} source files for reason codes`);
console.log(`  moment   ${momentKeys.size} paywall.* keys x ${LOCALES.length} locales`);

const domAt = process.argv.indexOf('--dom');
if (domAt > -1) {
  const shotsAt = process.argv.indexOf('--shots');
  const ok = await walkPassMoment({
    base: process.argv[domAt + 1] || 'http://localhost:5871',
    shots: shotsAt > -1 ? process.argv[shotsAt + 1] : '',
  });
  process.exit(ok ? 0 : 1);
}

/**
 * The Pass moment in a browser (T1171): the plan flow's shortest walk to a
 * priced trip (as verify_plan_short.mjs), "Plan this trip", then the card on
 * the trip page, at 390 and 1440. No dead end: the card names what is free
 * and what the Trip Pass adds with its price; See the Trip Pass opens the
 * sheet, which names a way on for free and closes back to the same trip;
 * Not now hides the card and says for how long; ?pm=off draws nothing.
 */
async function walkPassMoment({ base, shots }) {
  const { chromium } = await import('playwright');
  const { mkdirSync } = await import('node:fs');
  const { TIERS } = await import('../src/lib/pricing.js');
  if (shots) mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const results = [];
  for (const W of [390, 1440]) {
    const check = (name, ok, extra = '') => { results.push(ok); console.log(`[${W}] ${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`); };
    const errors = [];
    // A fresh context per walk: a planned trip stays under way in its storage.
    const openPage = async () => {
      const c = await browser.newContext({ viewport: { width: W, height: W < 769 ? 844 : 900 }, serviceWorkers: 'block' });
      const p = await c.newPage();
      p.on('pageerror', (e) => errors.push(e.message));
      await p.addInitScript(() => {
        try {
          localStorage.setItem('continent.lang.v1', 'en');
          localStorage.setItem('continent.homeSeen.v1', '1');
          localStorage.setItem('continent.mapGuideDismissed.v1', '1');
          localStorage.setItem('carta.fareNoticeSeen', '1');
        } catch { /* none */ }
      });
      return [c, p];
    };
    let [ctx, page] = await openPage();
    const shot = (name, loc) => (shots ? (loc || page).screenshot({ path: `${shots}/${W}-${name}.png` }).catch(() => {}) : null);

    // To the trip page: the shortest honest walk, then the first trip.
    const toTrip = async (q) => {
      await page.goto(`${base}/?tab=plan&${q}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.pf-open, .pfh-new', { timeout: 60000 });
      await page.getByRole('button', { name: 'Start planning' }).first().click();
      for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(350);
        if (await page.locator('.tff-card-open').count()) break;
        const btn = page.locator('.pf-foot .btn-primary, .guide-foot .btn-primary').first();
        if (!(await btn.count())) continue;
        if (await btn.isDisabled()) {
          const opts = page.locator('.pf [role=radio]:visible, .pf [role=checkbox]:visible, .pf button[aria-pressed]:visible');
          const n = Math.min(await opts.count(), 8);
          for (let k = 0; k < n && (await btn.isDisabled()); k++) {
            const o = opts.nth(k);
            if ((await o.getAttribute('aria-checked')) === 'true' || (await o.getAttribute('aria-pressed')) === 'true') continue;
            await o.click({ timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(150);
          }
        }
        if (!(await btn.isDisabled())) await btn.click();
      }
      await page.locator('.tff-card-open').first().click({ timeout: 30000 });
      await page.getByRole('button', { name: 'Plan this trip' }).first().click({ timeout: 30000 });
      await page.waitForSelector('.tpg', { timeout: 60000 });
      await page.waitForTimeout(800);
    };

    try {
      await toTrip('pm=on');
      const card = page.locator('[data-testid=pass-moment]');
      check('the Pass moment stands on the priced trip page', (await card.count()) === 1);
      await card.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await shot('1-moment', card);
      const text = await card.innerText();
      check('it says what is free', /Planning this trip is free/.test(text) && /Share a link/.test(text));
      const price = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(TIERS.trip.priceCents / 100);
      check('it names the Trip Pass with its price and days', text.includes(price) && text.includes(`${TIERS.trip.periodDays} days`), price);
      check('four free lines and four Pass lines', (await card.locator('li').count()) === 8);
      const sizes = await card.locator('button').evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height)));
      check('two buttons, each 44 px or taller', sizes.length === 2 && sizes.every((h) => h >= 44), sizes.join(','));
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check('no sideways scroll', over <= 1, `${over}px`);

      // The door: the sheet opens, names a way on for free, closes to the trip.
      await card.getByRole('button', { name: 'See the Trip Pass' }).click();
      const sheet = page.locator('.pass-sheet[role=dialog]');
      await sheet.waitFor({ timeout: 15000 });
      await shot('2-sheet');
      const sheetText = await sheet.innerText();
      check('See the Trip Pass opens the pass sheet', true);
      check('the sheet has one way forward', (await sheet.locator('.btn-primary').count()) === 1);
      check('the sheet names the free way on', /Planning is free|Your trips stay saved/.test(sheetText));
      await sheet.getByRole('button', { name: 'Close' }).click();
      await page.waitForTimeout(400);
      check('closing returns to the same trip page', (await sheet.count()) === 0 && (await page.locator('.tpg').count()) === 1 && (await card.count()) === 1);

      // Not now: hidden, with a line that says for how long and where prices stay.
      await card.getByRole('button', { name: 'Not now' }).click();
      await page.waitForTimeout(300);
      const hidden = page.locator('[data-testid=pass-moment-hidden]');
      check('Not now hides the card and says so', (await card.count()) === 0 && /Hidden for 14 days/.test(await hidden.innerText().catch(() => '')));
      const later = await page.evaluate(() => JSON.parse(localStorage.getItem('carta.pm.later.v1') || 'null'));
      check('Not now is remembered', later?.count === 1 && later.until > Date.now());

      // The flag off (its default): nothing.
      await ctx.close();
      [ctx, page] = await openPage();
      await toTrip('pm=off');
      check('?pm=off draws nothing', (await page.locator('[data-testid=pass-moment]').count()) === 0);
    } catch (e) {
      check('walk', false, e.message.split('\n')[0]);
      await shot('error');
    }
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
  await browser.close();
  const ok = results.every(Boolean);
  console.log(`verify_paywall --dom: ${results.filter(Boolean).length}/${results.length} ok`);
  return ok;
}
