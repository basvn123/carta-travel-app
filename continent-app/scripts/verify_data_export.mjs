// Headless check for the GDPR Article 20 data export (T021).
//
// The export sits in the profile spoke, directly above the danger zone: the
// two halves of the same right, portability and erasure, adjacent but not
// merged. This harness fakes a signed-in traveller the same way
// verify_account_panel.mjs does, a session written into the storage key
// supabase-js reads, with every auth and RPC call intercepted. Nothing here
// touches the real project and no credentials are needed to run it.
//
// What it checks:
//   1. The section exists, above the danger zone, and is not styled as danger.
//   2. The button is armed before it does anything, like deletion is.
//   3. The wrong password is refused and no export RPC is sent.
//   4. The right password re-authenticates, calls export_user_data, and the
//      browser is handed a .json download.
//   5. The downloaded file really carries the four tables plus the account
//      block, and is indented rather than minified.
//   6. The RPC is called with no arguments, which is the property that makes
//      it impossible to point at somebody else's account.
//   7. A Google-only account gets the type-your-email route, never a password
//      form, matching how deletion treats the same account.
//   8. A signed-out visitor is never offered the section at all.
// Plus the quality floor: 44px targets and 380px clean.
//
// Run from inside continent-app/:  node scripts/verify_data_export.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const PORT = Number(process.env.PORT || 4191);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const PROJECT_REF = 'ntssxktaduxzpsmejwyv';
const RIGHT_PASSWORD = 'correct-horse-battery';
const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'traveller@example.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  user_metadata: { full_name: 'Sam Okonkwo' },
  app_metadata: { provider: 'email', providers: ['email'] },
  identities: [{ id: 'i1', provider: 'email', identity_data: { email: 'traveller@example.com' } }],
  created_at: '2026-01-01T00:00:00Z',
};
const GOOGLE_USER = {
  ...USER,
  app_metadata: { provider: 'google', providers: ['google'] },
  identities: [{ id: 'i2', provider: 'google', identity_data: { email: USER.email } }],
};

// What the real export_user_data() returns, in the shape 024 builds.
const EXPORT_PAYLOAD = {
  schema: 1,
  exportedAt: '2026-09-23T10:00:00Z',
  userId: USER.id,
  tripPlans: [{ id: 'p1', label: 'Lisbon in March', createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-02T00:00:00Z' }],
  tripPlanStops: [{ id: 's1', tripPlanId: 'p1', position: 0, destinationId: 'lisbon', city: 'Lisbon', country: 'Portugal', arriveDate: '2026-03-01', departDate: '2026-03-05', transportMode: 'plane', transportNotes: null, choices: {}, createdAt: '2026-02-01T00:00:00Z' }],
  paywallEvents: [{ at: '2026-02-03T00:00:00Z', event: 'shown', reason: 'export', tier: 'free' }],
  contentOverrides: [],
};

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

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

async function stubSupabase(page, state) {
  await page.route('**/rest/v1/rpc/ai_status*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }),
  }));

  // The export itself. The request body is kept so the harness can assert the
  // RPC is called with no arguments.
  await page.route('**/rest/v1/rpc/export_user_data*', async (route) => {
    let body = null;
    try { body = JSON.parse(route.request().postData() || '{}'); } catch { body = null; }
    state.exportCalls.push(body);
    return route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(EXPORT_PAYLOAD),
    });
  });

  // Re-auth, exactly as the deletion path uses it.
  await page.route('**/auth/v1/token*', async (route) => {
    let body = {};
    try { body = JSON.parse(route.request().postData() || '{}'); } catch { body = {}; }
    state.reauthAttempts.push(body.password);
    if (body.password !== RIGHT_PASSWORD) {
      return route.fulfill({
        status: 400, contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
      });
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'stub', token_type: 'bearer', expires_in: 360000,
        refresh_token: 'stub-refresh', user: state.user,
      }),
    });
  });

  await page.route('**/auth/v1/user*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(state.user),
  }));
  await page.route('**/rest/v1/profiles*', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ user_id: state.user.id, handle: 'sam_okonkwo', display_name: 'Sam Okonkwo', avatar_emoji: null }),
  }));
}

const seedSession = (ref, user) => `(() => {
  localStorage.setItem('continent.guestMode.v1', '1');
  localStorage.setItem('continent.homeSeen.v1', '1');
  localStorage.setItem('carta.welcomeSeen', '1');
  localStorage.setItem('carta.mapGuideDone', '1');
  localStorage.setItem('sb-${ref}-auth-token', JSON.stringify({
    access_token: 'stub', token_type: 'bearer', expires_in: 360000,
    expires_at: Math.floor(Date.now() / 1000) + 360000,
    refresh_token: 'stub-refresh', user: ${JSON.stringify(user)},
  }));
})()`;

const seedGuest = () => `(() => {
  localStorage.setItem('continent.guestMode.v1', '1');
  localStorage.setItem('continent.homeSeen.v1', '1');
  localStorage.setItem('carta.welcomeSeen', '1');
  localStorage.setItem('carta.mapGuideDone', '1');
})()`;

async function openPanel(page) {
  await page.locator('.account-avatar-btn').first().click({ timeout: 20000 });
  await page.locator('.account-panel').waitFor({ timeout: 15000 });
}
async function goToProfile(page) {
  await page.locator('.account-profile-card').click();
  await page.locator('#acct-name').waitFor({ timeout: 10000 });
}

const exportSection = (page) => page.locator('.panel-section', { hasText: 'Your data' });

try {
  await waitForServer();
  const browser = await chromium.launch();

  // -------------------------------------------------------------------------
  // A password account: the ordinary path
  // -------------------------------------------------------------------------
  const state = { reauthAttempts: [], exportCalls: [], user: USER };
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 }, acceptDownloads: true });
  await ctx.addInitScript(seedSession(PROJECT_REF, USER));
  const page = await ctx.newPage();
  await stubSupabase(page, state);
  await page.goto(`${BASE}/?o=CRL`);
  await page.locator('.account-avatar-btn').first().waitFor({ timeout: 120000 });
  await openPanel(page);
  await goToProfile(page);

  // 1. The section is there, and it is above the danger zone rather than in it.
  const section = exportSection(page);
  if (!(await section.count())) fail('the profile spoke has no data export section');

  const armBtn = section.locator('button', { hasText: 'Download my data' });
  if (!(await armBtn.count())) fail('no download button in the data section');

  const exportBox = await armBtn.boundingBox();
  const deleteBox = await page.locator('.account-delete-arm').boundingBox();
  if (exportBox && deleteBox && exportBox.y >= deleteBox.y) {
    fail('the export button sits below the delete button; portability should come before erasure');
  }
  // It must not be dressed as a destructive control.
  if (await section.locator('.account-danger-title').count()) {
    fail('the export section is filed under the danger heading');
  }
  const exportColor = await armBtn.evaluate((el) => getComputedStyle(el).color);
  const deleteColor = await page.locator('.account-delete-arm').evaluate((el) => getComputedStyle(el).color);
  if (exportColor === deleteColor) {
    fail(`the export button is painted like the delete button (${exportColor}); downloading your own data is not destructive`);
  }
  if (exportBox && exportBox.height < 44) fail(`export button is ${exportBox.height}px tall, under the 44px floor`);

  // 2. Nothing happens until it is armed.
  if (await section.locator('#acct-export-pw').count()) {
    fail('the password field is on show before the export was armed');
  }
  await armBtn.click();
  await page.locator('#acct-export-pw').waitFor({ timeout: 5000 });

  // 3. The wrong password is refused, and no export is fetched.
  await page.locator('#acct-export-pw').fill('not-the-password');
  await section.locator('button', { hasText: 'Download' }).last().click();
  await page.locator('.auth-error').first().waitFor({ timeout: 8000 });
  if (state.exportCalls.length !== 0) {
    fail(`a failed re-auth still called export_user_data ${state.exportCalls.length} time(s)`);
  }

  // 4. The right password re-authenticates and produces a download.
  await page.locator('#acct-export-pw').fill(RIGHT_PASSWORD);
  const dlWait = page.waitForEvent('download', { timeout: 20000 });
  await section.locator('button', { hasText: 'Download' }).last().click();
  const download = await dlWait;

  if (!state.reauthAttempts.includes(RIGHT_PASSWORD)) fail('the export never re-authenticated');
  if (state.exportCalls.length !== 1) {
    fail(`export_user_data was called ${state.exportCalls.length} times, expected once`);
  }

  // 6. No arguments. This is the load-bearing property of the whole feature.
  const sent = state.exportCalls[0];
  if (sent && Object.keys(sent).length !== 0) {
    fail(`export_user_data was sent arguments (${JSON.stringify(sent)}); it must read auth.uid() only`);
  }

  const name = download.suggestedFilename();
  if (!/^carta-data-\d{4}-\d{2}-\d{2}\.json$/.test(name)) {
    fail(`download is named "${name}", expected carta-data-YYYY-MM-DD.json`);
  }

  // 5. The file carries what it promises, and is readable.
  const path = await download.path();
  const raw = readFileSync(path, 'utf8');
  if (!/\n  "/.test(raw)) fail('the exported file is minified; a data export should be readable');
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { fail('the exported file is not valid JSON'); }
  if (parsed) {
    for (const key of ['tripPlans', 'tripPlanStops', 'paywallEvents', 'contentOverrides']) {
      if (!Array.isArray(parsed[key])) fail(`the export has no ${key} array`);
    }
    if (parsed.schema !== 1) fail(`the export carries schema ${parsed.schema}, expected 1`);
    // The identity block is added client side from the session, so it is the
    // part most likely to go missing in a refactor.
    if (!parsed.account) fail('the export carries no account block');
    else {
      if (parsed.account.email !== USER.email) fail('the export does not carry the account email');
      if (parsed.account.name !== USER.user_metadata.full_name) fail('the export does not carry the account name');
      if (!Array.isArray(parsed.account.signInMethods) || !parsed.account.signInMethods.includes('email')) {
        fail('the export does not say how the account signs in');
      }
    }
    if (parsed.tripPlanStops[0]?.city !== 'Lisbon') fail('the trip stops did not survive into the file');
  }

  // The confirmation is shown and can be dismissed.
  const done = section.locator('.auth-banner');
  if (!(await done.count())) fail('nothing confirmed that the download happened');
  await page.screenshot({ path: `${SHOTS}/data-export-desktop.png` });

  // 380px clean.
  await page.setViewportSize({ width: 380, height: 820 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflow) fail('the profile spoke scrolls sideways at 380px');
  await page.screenshot({ path: `${SHOTS}/data-export-phone.png` });

  // -------------------------------------------------------------------------
  // 7. A Google-only account: the email route, never a password form
  // -------------------------------------------------------------------------
  const stateG = { reauthAttempts: [], exportCalls: [], user: GOOGLE_USER };
  const ctxG = await browser.newContext({ viewport: { width: 1360, height: 950 }, acceptDownloads: true });
  await ctxG.addInitScript(seedSession(PROJECT_REF, GOOGLE_USER));
  const pageG = await ctxG.newPage();
  await stubSupabase(pageG, stateG);
  await pageG.goto(`${BASE}/?o=CRL`);
  await pageG.locator('.account-avatar-btn').first().waitFor({ timeout: 120000 });
  await openPanel(pageG);
  await goToProfile(pageG);
  const sectionG = exportSection(pageG);
  await sectionG.locator('button', { hasText: 'Download my data' }).click();
  await pageG.locator('#acct-export-email').waitFor({ timeout: 5000 });
  if (await sectionG.locator('#acct-export-pw').count()) {
    fail('a Google-only account was asked for a password it does not have');
  }
  // The wrong address is refused without calling anything.
  await pageG.locator('#acct-export-email').fill('someone@else.test');
  await sectionG.locator('button', { hasText: 'Download' }).last().click();
  await pageG.waitForTimeout(500);
  if (stateG.exportCalls.length !== 0) fail('a mistyped address still exported the account');
  // The right address goes through.
  await pageG.locator('#acct-export-email').fill(USER.email);
  const dlG = pageG.waitForEvent('download', { timeout: 20000 });
  await sectionG.locator('button', { hasText: 'Download' }).last().click();
  await dlG;
  if (stateG.exportCalls.length !== 1) fail('the Google account could not export its data');

  // -------------------------------------------------------------------------
  // 8. A signed-out visitor is never offered it
  // -------------------------------------------------------------------------
  const ctxOut = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await ctxOut.addInitScript(seedGuest());
  const pageOut = await ctxOut.newPage();
  await pageOut.goto(`${BASE}/?o=CRL`);
  await pageOut.locator('.account-avatar-btn').first().waitFor({ timeout: 120000 });
  await openPanel(pageOut);
  if (await pageOut.locator('button', { hasText: 'Download my data' }).count()) {
    fail('a signed-out visitor is offered a data export');
  }

  await browser.close();
  if (!process.exitCode) console.log('data export: all checks passed');
} catch (err) {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
} finally {
  if (srv) srv.kill();
}
