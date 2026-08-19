// Headless check of sharing a saved trip as a read-only link (phase 2 of
// docs/SHARING_FRIENDS_BUILD.md).
//
// The whitelist that decides what leaves an account lives in SQL and proves
// itself on apply (the self-check block at the end of migration 009). This
// covers the half that lives in the browser:
//   1. A share link opens signed out, ahead of the entry gate, and shows the
//      trip. That ordering is the feature: a share that opens on a signup
//      wall does not get opened.
//   2. It offers no way to edit anything.
//   3. A withdrawn link says so plainly instead of erroring or going blank.
//   4. The reader never sees the ledger, the booking references or the notes,
//      and a crew member is a name with no account attached.
//   5. Mobile width: nothing scrolls sideways.
//
// Uses the ?sharemock seam (auth/tripShares.js), so it needs no credentials.
// Run from inside continent-app/:  node scripts/verify_trip_share.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4194;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

// Any well-formed uuid: the mock seam stands in for the lookup, but the client
// still refuses a token that is not shaped like one, so this has to be real.
const TOKEN = '11111111-2222-4333-8444-555555555555';

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

const run = async () => {
  await waitForServer();
  const browser = await chromium.launch();

  /* ---- 1, 2, 4: a live link, opened by a stranger ---- */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  await page.goto(`${BASE}?sharemock=1#shared=${TOKEN}`, { waitUntil: 'domcontentloaded' });

  const view = page.locator('.stview');
  try {
    await view.waitFor({ timeout: 15000 });
    ok('the link opens straight into the trip, with no gate in front of it');
  } catch {
    fail('the shared trip never rendered');
    await page.screenshot({ path: `${SHOTS}/share-failed.png` });
    await browser.close();
    if (srv) srv.kill();
    return;
  }

  // Nothing that asks the reader to sign in should be on this screen.
  for (const label of ['Continue without an account', 'Sign in', 'Create an account']) {
    if (await page.getByRole('button', { name: label }).count()) {
      fail(`the shared trip screen shows "${label}", the gate is in front of the share`);
    }
  }
  ok('no sign-in wall in front of the shared trip');

  const text = await view.innerText();
  for (const [what, re] of [
    ['the trip label', /Two weeks in Portugal/],
    ['both stops', /Lisbon/],
    ['the second stop', /Porto/],
    ['who came', /Sofie and Jonas/],
    ['the story', /pastel de nata/],
    ['the rating', /\b8\b/],
  ]) {
    if (!re.test(text)) fail(`the shared trip is missing ${what}`);
  }
  ok('the trip, its stops, its people and its memory all render');

  // 2. Read only. The memory view's edit button is conditional on an onEdit
  // handler, and the viewer deliberately passes none.
  if (await page.locator('.memo-edit').count()) fail('the shared trip offers an edit button');
  else ok('no edit control anywhere on the shared trip');
  const inputs = await page.locator('.stview input, .stview textarea').count();
  if (inputs > 0) fail(`the shared trip has ${inputs} editable field(s)`);
  else ok('no editable fields');

  // 4. Nothing private came along. The fixture mirrors what the SQL projection
  // returns, so this is a second pair of eyes on the same contract.
  for (const [what, re] of [
    ['an expense ledger', /paidBy|settle|owes/i],
    ['a booking reference', /PNR|confirmation number/i],
    ['private notes', /landlord/i],
  ]) {
    if (re.test(text)) fail(`the shared trip leaks ${what}`);
  }
  ok('no ledger, no booking references, no notes');

  // F3 of the security review: a photo renders only when it is an inline
  // data: image. The fixture carries one honest photo and one remote tracking
  // pixel; exactly the honest one may reach the DOM, because a remote src
  // would report to its host who viewed this trip.
  const photoSrcs = await page.evaluate(
    () => [...document.querySelectorAll('.memo-photos img')].map((i) => i.getAttribute('src') || ''),
  );
  if (photoSrcs.length !== 1 || !photoSrcs[0].startsWith('data:image/')) {
    fail(`photo guard: expected exactly 1 inline image, got ${JSON.stringify(photoSrcs)}`);
  } else ok('a remote photo src never reaches the DOM, the inline one renders');

  const leakedIds = await page.evaluate(() => {
    const html = document.querySelector('.stview')?.innerHTML || '';
    return /userId|uuid-of-/.test(html);
  });
  if (leakedIds) fail('the shared trip carries an account id behind a crew name');
  else ok('crew members are names, with no account attached');

  await page.screenshot({ path: `${SHOTS}/share-view.png`, fullPage: true });

  // The token must not survive in the address bar, or a reload reopens
  // somebody else's trip from the reader's own history.
  const url = page.url();
  if (/shared=/.test(url)) fail(`the token stayed in the address bar: ${url}`);
  else ok('the token is stripped from the address bar');

  // Dismissing hands the reader the normal app rather than a dead end.
  await page.getByRole('button', { name: /Price your own trip/i }).first().click();
  await page.waitForTimeout(800);
  if (await page.locator('.stview').count()) fail('dismissing the shared trip did nothing');
  else ok('dismissing opens the app');
  await ctx.close();

  /* ---- 3: a withdrawn link ---- */
  const goneCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const gone = await goneCtx.newPage();
  gone.on('pageerror', (e) => fail(`page error on the withdrawn link: ${e.message}`));
  await gone.goto(`${BASE}?sharemock=gone#shared=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await gone.locator('.stview-gone').waitFor({ timeout: 15000 }).catch(() => {
    fail('a withdrawn link did not show the "no longer works" state');
  });
  const goneText = await gone.locator('.stview').innerText().catch(() => '');
  if (/no longer works/i.test(goneText)) ok('a withdrawn link says so plainly');
  else fail(`a withdrawn link reads: "${goneText.replace(/\n/g, ' | ')}"`);
  // It must not hint that the token was ever real.
  if (/revoked|expired by|owner/i.test(goneText)) {
    fail('the withdrawn state leaks whether the token ever existed');
  } else ok('it does not say whether the token was ever real');
  await gone.screenshot({ path: `${SHOTS}/share-gone.png` });
  await goneCtx.close();

  /* ---- 5: mobile width ---- */
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mpage = await mob.newPage();
  await mpage.goto(`${BASE}?sharemock=1#shared=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await mpage.locator('.stview').waitFor({ timeout: 15000 });
  await mpage.waitForTimeout(400);
  const overflow = await mpage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow <= 1) ok('no sideways scroll at 390px');
  else fail(`page scrolls sideways by ${overflow}px at 390px`);
  await mpage.screenshot({ path: `${SHOTS}/share-mobile.png` });
  await mob.close();

  await browser.close();
  if (srv) srv.kill();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
};

run().catch((e) => {
  console.error('FAIL:', e.message);
  process.exitCode = 1;
  if (srv) srv.kill();
});
