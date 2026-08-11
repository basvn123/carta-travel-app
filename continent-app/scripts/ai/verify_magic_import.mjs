// End-to-end verify of the magic-import flow without a deployed backend and
// without spending any AI quota: a fake Supabase session makes the app treat
// us as signed in, and the parse-booking call is intercepted and answered
// with a canned payload shaped exactly like the real function's response.
//
// Covers the whole chain the unit tests cannot: dropzone -> upload -> Edge
// Function -> booking rows auto-filled (badged, blanks only) -> Activity
// Inbox -> route an activity to a day -> the day row wears it -> everything
// survives a reload off the persisted draft extras.
//
//   node scripts/ai/verify_magic_import.mjs

import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4192;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/ai/shots';
mkdirSync(SHOTS, { recursive: true });

const PROJECT_REF = 'ntssxktaduxzpsmejwyv';

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

// A planned trip injected through the share hash (marker "0." = plain
// base64url JSON), so no wizard driving is needed to reach the overview.
const TRIP = {
  tripStart: '2026-08-10',
  stops: [{ destinationId: 'BRU', nights: 4, activities: [] }],
  groupSize: 2,
  label: 'Import check',
};
const tripHash = `0.${Buffer.from(JSON.stringify(TRIP)).toString('base64url')}`;

// The canned Edge Function answer: one booking per surface we assert on.
const PARSE_RESULT = {
  summary: 'One flight, one stay, one tour.',
  bookings: [
    { kind: 'flight_out', title: 'Ryanair CRL to BRU', code: 'AB12CD', eur: 184.5, link: 'https://www.ryanair.com/manage', date: '2026-08-10' },
    { kind: 'stay', title: 'Hotel Le Dixseptieme', city: 'Brussels', code: 'HTL-774', eur: 420 },
    { kind: 'activity', title: 'Kayak tour', city: 'Brussels', code: 'KY-55', eur: 60 },
  ],
  activities: [
    { name: 'Old town food walk', city: 'Brussels', eur: 15, durationMin: 120, note: 'From the itinerary PDF.', day: 2 },
    { name: 'Comic strip route', city: 'Brussels', durationMin: 90 },
  ],
  meta: { model: 'mock', fellBack: false, files: 1, cached: false },
  pass: { tier: 'free', plansLeft: 2 },
};

const errors = [];
let failures = 0;
const check = (name, cond) => {
  if (!cond) failures += 1;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`);
};
// The fake session is not a real JWT; the sync layer's 401s are mock noise.
const isMockAuthNoise = (s) => /401|day_plans|user_settings|trip_plans|Invalid (JWT|Refresh Token)|AuthApiError|JWSError/i.test(s);

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => {
    const msg = (e && (e.message || e.toString())) || String(e);
    if (!isMockAuthNoise(msg)) errors.push(`pageerror: ${msg.split('\n')[0]}`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/tile|cartocdn|ERR_|emrldtp|config is not valid|MIME type|Service worker/i.test(t)) return;
    if (isMockAuthNoise(t)) return;
    errors.push(`console: ${t.slice(0, 140)}`);
  });

  // Answer the Edge Function ourselves.
  let calls = 0;
  await page.route('**/functions/v1/parse-booking', async (route) => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 600)); // let the busy state render
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PARSE_RESULT),
    });
  });

  await page.addInitScript(({ ref }) => {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    const year = Math.floor(Date.now() / 1000) + 31536000;
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
      access_token: 'mock.access.token',
      token_type: 'bearer',
      expires_in: 31536000,
      expires_at: year,
      refresh_token: 'mock-refresh',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'mock@example.com',
        app_metadata: { provider: 'email' },
        user_metadata: {},
      },
    }));
  }, { ref: PROJECT_REF });

  await page.goto(`${BASE}/?tab=trip&o=CRL#trip=${tripHash}`);

  // A shared trip asks before it opens; take the offer.
  await page.getByRole('button', { name: 'Open trip' }).click({ timeout: 120000 });
  await page.locator('.trip-extras:not(.exp-ledger)').waitFor({ timeout: 60000 });
  await page.locator('.trip-extras:not(.exp-ledger)').scrollIntoViewIfNeeded();

  // ---- 1. The dropzone is there, above the booking rows. ----
  const dz = page.locator('.extras-dropzone');
  check('dropzone renders inside the bookings section', await dz.count() === 1);
  await page.screenshot({ path: `${SHOTS}/import-1-dropzone.png`, fullPage: true });

  // ---- 2. Upload a file through the hidden input. ----
  await page.setInputFiles('.extras-dropzone input[type=file]', {
    name: 'confirmation.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 mock booking confirmation'),
  });
  await page.locator('.extras-drop-busy').waitFor({ timeout: 5000 });
  check('busy state shows while parsing', true);
  await page.locator('.extras-drop-status.ok').waitFor({ timeout: 15000 });
  check('exactly one Edge Function call', calls === 1);
  const status = await page.locator('.extras-drop-status.ok').textContent();
  check('status reports fills and stages', /3/.test(status) && /2/.test(status));

  // ---- 3. Booking rows: filled, badged, blanks only. ----
  const values = await page.locator('.extras-input').evaluateAll((els) => els.map((e) => e.value));
  check('confirmation code landed in a row', values.includes('AB12CD'));
  check('stay code landed too', values.includes('HTL-774'));
  check('paid amount landed', values.includes('184.5'));
  const badges = await page.locator('.extras-ai-badge').count();
  check('auto-filled badges on the touched rows', badges === 3);
  const labels = await page.locator('.extras-label-input').evaluateAll((els) => els.map((e) => e.value));
  check('the booked tour became a labelled custom row', labels.some((l) => l.includes('Kayak tour')));

  // ---- 4. The Activity Inbox staged the two activities. ----
  const inbox = page.locator('.extras-inbox');
  check('inbox section appeared', await inbox.count() === 1);
  check('inbox counts two staged activities', (await inbox.locator('.extras-inbox-count').textContent()) === '2');
  check('day suggestion rides the routing button', (await inbox.locator('.extras-inbox-day .dropdown-label').first().textContent()).includes('Day 2'));
  await inbox.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/import-2-filled.png`, fullPage: true });

  // ---- 5. Route the first activity to day 2. ----
  await inbox.locator('.extras-inbox-day .dropdown-trigger').first().click();
  await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Day 2' }).first().click();
  await page.waitForTimeout(300);
  check('inbox count dropped to one', (await inbox.locator('.extras-inbox-count').textContent()) === '1');
  const chip = page.locator('.itin-day-extra', { hasText: 'Old town food walk' });
  check('the day row wears the routed activity', await chip.count() === 1);
  check('the chip carries its price', (await chip.textContent()).includes('15'));

  // ---- 6. Discard the second one; the inbox folds away. ----
  await inbox.locator('.extras-inbox-item .extras-remove').first().click();
  await page.waitForTimeout(200);
  check('discarding the last item removes the inbox', await page.locator('.extras-inbox').count() === 0);
  await page.screenshot({ path: `${SHOTS}/import-3-routed.png`, fullPage: true });

  // ---- 7. Everything survives a reload off the persisted draft. ----
  await page.goto(`${BASE}/?tab=trip&o=CRL`);
  await page.locator('.trip-extras:not(.exp-ledger)').waitFor({ timeout: 60000 });
  const values2 = await page.locator('.extras-input').evaluateAll((els) => els.map((e) => e.value));
  check('filled codes survive a reload', values2.includes('AB12CD'));
  check('badges survive a reload', (await page.locator('.extras-ai-badge').count()) === 3);
  check('the routed day chip survives a reload', (await page.locator('.itin-day-extra', { hasText: 'Old town food walk' }).count()) === 1);

  // ---- 8. Section rhythm: the extras stack runs at one 28px beat. ----
  const gaps = await page.evaluate(() => [...document.querySelectorAll('.extras-section + .extras-section')]
    .map((el) => getComputedStyle(el).marginTop));
  check('extras sections keep the 28px rhythm', gaps.length > 0 && gaps.every((g) => g === '28px'));

  await browser.close();
} catch (err) {
  failures += 1;
  console.error('FAIL:', err.stack || err.message);
} finally {
  if (srv) {
    srv.kill();
    if (process.platform === 'win32' && srv.pid) {
      try { spawnSync('taskkill', ['/pid', String(srv.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
    }
  }
}

for (const e of errors) console.error('  page error:', e);
if (errors.length) failures += errors.length;
console.log(failures ? `\n${failures} FAILURE(S)` : '\nverify_magic_import OK');
process.exit(failures ? 1 : 0);
