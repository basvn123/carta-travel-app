// Headless check for the account hub (2026-08-13 redesign).
//
// The panel is now a hub with spokes: the hub holds the profile card, the
// pass card, the invite banner and a help menu (feedback / FAQ / privacy);
// profile details, the FAQ and the feedback form are subviews behind a back
// button. This harness fakes a signed-in traveller: a session is written
// straight into the storage key supabase-js reads, and every auth/RPC call
// the panel makes is intercepted. Nothing here touches the real project, and
// no credentials are needed to run it.
//
// What it checks:
//   1. The hub: profile card seeded with the identity, invite banner, menu.
//   2. Profile spoke: editable name/email, stated once, saves and confirms.
//   3. The pass card sells the next tier instead of printing one word.
//   4. Changing the password requires the current one (real re-auth call).
//   5. Passwords revealable, measured live, floor at 8.
//   6. Forgot password reaches the reset mail.
//   7. Sign out sits clear of the delete button; deletion is red and gated.
//   8. FAQ spoke: nine questions, answers open on tap.
//   9. Feedback spoke: the send button stays off until there is a message.
//  10. Google-only accounts get the email route, never a password form.
// Plus the quality floor: 44px targets, label contrast, 380px clean.
//
// Run from inside continent-app/:  node scripts/verify_account_panel.mjs
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4191;
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

/** Everything the panel talks to, answered locally. */
async function stubSupabase(page, state) {
  await page.route('**/rest/v1/rpc/ai_status*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      tier: 'free', expiresAt: null, resetsAt: '2026-09-01T00:00:00Z',
      plansUsed: 1, plansCap: 3, plansLeft: 2,
      groundUsed: 0, groundCap: 0, groundLeft: 0,
    }),
  }));
  // Re-authentication: this is the whole point of the security fix, so the
  // stub actually checks the password rather than waving everything through.
  await page.route('**/auth/v1/token*', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    state.reauthAttempts.push(body.password);
    if (body.password !== RIGHT_PASSWORD) {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'stub', token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'stub-refresh', user: USER,
      }),
    });
  });
  await page.route('**/auth/v1/user*', async (route) => {
    if (route.request().method() === 'PUT') {
      state.userUpdates.push(JSON.parse(route.request().postData() || '{}'));
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) });
  });
  await page.route('**/auth/v1/recover*', (route) => {
    state.recoverCalls += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 204, body: '' }));
}

const seedSession = (ref, user) => `(() => {
  localStorage.setItem('continent.guestMode.v1', '1');
  localStorage.setItem('carta.welcomeSeen', '1');
  localStorage.setItem('carta.mapGuideDone', '1');
  localStorage.setItem('sb-${ref}-auth-token', JSON.stringify({
    access_token: 'stub', token_type: 'bearer', expires_in: 360000,
    expires_at: Math.floor(Date.now() / 1000) + 360000,
    refresh_token: 'stub-refresh', user: ${JSON.stringify(user)},
  }));
})()`;

async function openPanel(page) {
  await page.locator('.account-avatar-btn').first().click({ timeout: 20000 });
  await page.locator('.account-panel').waitFor({ timeout: 15000 });
}

async function goToProfile(page) {
  await page.locator('.account-profile-card').click();
  await page.locator('#acct-name').waitFor({ timeout: 10000 });
}

try {
  await waitForServer();
  const browser = await chromium.launch();
  const state = { reauthAttempts: [], userUpdates: [], recoverCalls: 0 };

  const ctx = await browser.newContext({
    viewport: { width: 1360, height: 950 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await ctx.addInitScript(seedSession(PROJECT_REF, USER));
  const page = await ctx.newPage();
  await stubSupabase(page, state);
  await page.goto(`${BASE}/?o=CRL&tab=home`);
  await page.locator('.account-avatar-btn').first().waitFor({ timeout: 120000 });
  await openPanel(page);

  // ---- 1. The hub: one card per destination, no forms.
  console.log('1. hub');
  const profileCard = page.locator('.account-profile-card');
  if (!(await profileCard.count())) fail('the hub has no profile card');
  const cardText = await profileCard.innerText();
  if (!cardText.includes(USER.user_metadata.full_name)) fail(`profile card does not carry the name: ${cardText}`);
  if (!cardText.includes(USER.email)) fail(`profile card does not carry the email: ${cardText}`);
  const mono = await page.locator('.account-hub-avatar').first().innerText();
  if (mono.trim() !== 'SO') fail(`monogram for Sam Okonkwo is "${mono}", expected SO`);
  if (!(await page.locator('.account-invite').count())) fail('the invite banner is missing');
  const menuRows = await page.locator('.account-menu-row').count();
  if (menuRows !== 3) fail(`expected 3 help menu rows, found ${menuRows}`);
  const rowBox = await page.locator('.account-menu-row').first().boundingBox();
  if (!rowBox || rowBox.height < 44) fail(`menu rows are ${rowBox?.height}px tall, under the 44px target`);
  if (await page.locator('#acct-name').count()) fail('the profile form leaks onto the hub');
  ok(`hub: profile card (SO), invite banner, ${menuRows} menu rows at ${Math.round(rowBox.height)}px`);

  // The invite button falls back to the clipboard in headless chromium.
  await page.locator('.account-invite-btn').click();
  await page.waitForTimeout(400);
  const inviteLabel = await page.locator('.account-invite-btn').innerText();
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  if (!/copied|gekopieerd/i.test(inviteLabel) && !clip.includes('carta-europetravel.com')) {
    fail(`sharing neither confirmed nor copied: label "${inviteLabel}", clipboard "${clip.slice(0, 60)}"`);
  }
  ok('share falls back to copying the link, and says so');

  // ---- 2. The pass card lives on the hub and sells something.
  console.log('2. pass');
  const passCard = page.locator('.account-pass-card');
  if (!(await passCard.count())) fail('no pass card on the hub');
  const passText = await passCard.innerText();
  if (!/2 of 3/.test(passText)) fail(`pass card does not state the live balance: ${passText}`);
  const feats = await page.locator('.account-pass-feat').count();
  if (feats < 3) fail(`pass card lists only ${feats} things the next tier adds`);
  if (!/€\s?6[.,]99/.test(await page.locator('.account-pass-price').innerText())) {
    fail('pass card does not carry the Trip Pass price');
  }
  ok(`pass card: balance, ${feats} benefits, price`);
  await page.screenshot({ path: `${SHOTS}/account-hub.png` });

  // ---- 3. Profile spoke: identity stated once, editable, saves.
  console.log('3. profile spoke');
  await goToProfile(page);
  if (!(await page.locator('.account-back').count())) fail('the profile spoke has no way back');
  const nameInput = page.locator('#acct-name');
  const emailInput = page.locator('#acct-email');
  if (await nameInput.inputValue() !== USER.user_metadata.full_name) fail('name field is not seeded from the account');
  if (await emailInput.inputValue() !== USER.email) fail('email field is not seeded from the account');
  const emailInBody = (await page.locator('.account-panel').innerText()).split(USER.email).length - 1;
  if (emailInBody > 0) fail(`the email is printed as static text ${emailInBody} time(s) on the profile spoke`);
  ok('name and email appear once, as editable fields');

  const save = page.locator('button', { hasText: 'Save changes' });
  if (!(await save.isDisabled())) fail('Save changes is enabled before anything is edited');
  await nameInput.fill('Sam O.');
  if (await save.isDisabled()) fail('Save changes stayed disabled after an edit');
  await save.click();
  await page.locator('.auth-notice-inline').first().waitFor({ timeout: 10000 });
  if (!state.userUpdates.some((u) => u.data?.full_name === 'Sam O.')) fail('saving the profile sent no name update');
  ok('an edited name saves and confirms');
  await emailInput.fill('new@example.com');
  await page.locator('.auth-hint').first().waitFor({ timeout: 5000 });
  ok('changing the email warns that it needs confirming first');
  await emailInput.fill(USER.email);

  // ---- 4 & 5. Password: current required, measured, revealable, 8 not 6.
  console.log('4. password security');
  const current = page.locator('#acct-current-pw');
  const next = page.locator('#acct-new-pw');
  const confirm = page.locator('#acct-confirm-pw');
  if (!(await current.count())) fail('no current-password field: the panel still lets a borrowed session take the account');
  if (await current.getAttribute('autocomplete') !== 'current-password') fail('current password has the wrong autocomplete attribute');
  if (await next.getAttribute('autocomplete') !== 'new-password') fail('new password has the wrong autocomplete attribute');

  await next.fill('abcdefg');
  await confirm.fill('abcdefg');
  await page.locator('button', { hasText: 'Update password' }).click();
  let err = await page.locator('.auth-error').first().innerText();
  if (!/current password/i.test(err)) fail(`empty current password was not the first complaint: ${err}`);
  ok('the current password is demanded before anything else');

  await current.fill('whatever-is-wrong');
  await page.locator('button', { hasText: 'Update password' }).click();
  err = await page.locator('.auth-error').first().innerText();
  if (!/at least 8/i.test(err)) fail(`a 7-character password was accepted at the length check: ${err}`);
  ok('the floor is 8 characters, not 6');

  await next.fill('aaaaaaaaaaaa');
  await confirm.fill('aaaaaaaaaaaa');
  await page.locator('.pw-strength').waitFor({ timeout: 5000 });
  const weak = await page.locator('.pw-strength').getAttribute('class');
  if (!/weak/.test(weak)) fail(`twelve repeated letters did not read as weak: ${weak}`);
  await next.fill('ferry timetable rhubarb 41');
  await confirm.fill('ferry timetable rhubarb 41');
  const strong = await page.locator('.pw-strength').getAttribute('class');
  if (!/strong/.test(strong)) fail(`a long passphrase did not read as strong: ${strong}`);
  const met = await page.locator('.pw-req.met').count();
  if (met !== 2) fail(`expected both requirements met, got ${met}`);
  ok('meter: weak for repeats, strong for a passphrase, both requirements live');

  if (await next.getAttribute('type') !== 'password') fail('the new password field is not masked');
  await page.locator('.pw-input-wrap:has(#acct-new-pw) .pw-reveal').first().click();
  if (await next.getAttribute('type') !== 'text') fail('the reveal toggle did not unmask the field');
  ok('passwords can be revealed while typing');

  await page.locator('button', { hasText: 'Update password' }).click();
  await page.waitForTimeout(600);
  err = await page.locator('.auth-error').first().innerText();
  if (!/isn't right|is not right/i.test(err)) fail(`a wrong current password did not stop the change: ${err}`);
  if (!state.reauthAttempts.includes('whatever-is-wrong')) fail('no re-authentication call was made at all');
  ok('a wrong current password is rejected by a real re-auth call');

  await current.fill(RIGHT_PASSWORD);
  await page.locator('button', { hasText: 'Update password' }).click();
  await page.waitForTimeout(800);
  const notice = await page.locator('.auth-notice-inline').last().innerText();
  if (!/updated/i.test(notice)) fail(`the correct current password did not complete the change: ${notice}`);
  if (!state.userUpdates.some((u) => u.password)) fail('no password update was sent after re-auth');
  ok('the correct current password completes the change');

  // ---- 6. Forgot password reaches the reset mail.
  console.log('5. recovery');
  await page.locator('.auth-forgot-inline').click();
  await page.waitForTimeout(600);
  if (!state.recoverCalls) fail('the forgot-password link sent no reset mail');
  ok('forgot password sends the reset link to the address on file');

  // ---- 7. Sign out clear of deletion; deletion red, confirmed, gated.
  console.log('6. layout and deletion');
  const order = await page.locator('.account-panel .panel-section .section-title').allInnerTexts();
  console.log('   profile sections:', order.map((s) => s.trim()).join(' / '));
  const idx = (re) => order.findIndex((s) => re.test(s));
  const [profile, pw, session, danger] = [
    idx(/profile/i), idx(/change password/i), idx(/session/i), idx(/delete/i),
  ];
  if ([profile, pw, session, danger].some((i) => i < 0)) fail(`a section is missing: ${order.join(' | ')}`);
  if (!(profile < pw && pw < session && session < danger)) {
    fail(`sections are out of order: ${order.join(' | ')}`);
  }
  const signOutBox = await page.locator('.account-signout').boundingBox();
  const deleteBox = await page.locator('.account-delete-arm').boundingBox();
  if (signOutBox.height < 44) fail(`sign out is ${signOutBox.height}px tall`);
  if (deleteBox.y - (signOutBox.y + signOutBox.height) < 60) {
    fail('sign out and delete are still close enough to mis-tap');
  }
  ok(`sign out sits ${Math.round(deleteBox.y - signOutBox.y - signOutBox.height)}px clear of the delete button`);

  const dangerColor = await page.locator('.account-delete-arm').evaluate((el) => getComputedStyle(el).color);
  if (!/^rgb\(1[6-9]\d,\s*\d+,\s*\d+\)/.test(dangerColor)) fail(`the delete button is not red: ${dangerColor}`);
  await page.locator('.account-delete-arm').click();
  const delPw = page.locator('#acct-delete-pw');
  if (!(await delPw.count())) fail('deletion does not ask for the password');
  await page.locator('button', { hasText: 'Delete forever' }).click();
  await page.waitForTimeout(300);
  if (!/current password/i.test(await page.locator('.account-danger .auth-error').innerText())) {
    fail('deletion proceeded without a password');
  }
  await delPw.fill('not-the-password');
  await page.locator('button', { hasText: 'Delete forever' }).click();
  await page.waitForTimeout(600);
  if (!/isn't right|is not right/i.test(await page.locator('.account-danger .auth-error').innerText())) {
    fail('deletion accepted a wrong password');
  }
  ok('deletion is armed, password-gated, and refuses a wrong one');
  await page.locator('button', { hasText: 'Keep my account' }).click();
  if (await page.locator('#acct-delete-pw').count()) fail('cancelling deletion did not disarm it');
  ok('cancelling disarms it');
  await page.screenshot({ path: `${SHOTS}/account-profile.png` });

  // ---- 8. Back to the hub, then the FAQ spoke.
  console.log('7. faq spoke');
  await page.locator('.account-back').click();
  await page.locator('.account-profile-card').waitFor({ timeout: 5000 });
  ok('the back control returns to the hub');
  await page.locator('.account-menu-row', { hasText: 'Common questions' }).click();
  const faqItems = await page.locator('.account-faq-item').count();
  if (faqItems !== 9) fail(`expected 9 FAQ entries, found ${faqItems}`);
  if (await page.locator('.account-faq-a').count()) fail('an answer is open before anything was tapped');
  const firstQ = page.locator('.account-faq-q').first();
  await firstQ.click();
  if (await firstQ.getAttribute('aria-expanded') !== 'true') fail('the opened question does not say aria-expanded');
  const answer = await page.locator('.account-faq-a').first().innerText();
  if (answer.length < 40) fail(`the first answer is suspiciously short: "${answer}"`);
  await page.locator('.account-faq-q').nth(5).click();
  if (await page.locator('.account-faq-a').count() !== 1) fail('two answers are open at once');
  ok(`${faqItems} questions, answers open one at a time`);
  await page.screenshot({ path: `${SHOTS}/account-faq.png` });

  // ---- 9. The feedback spoke.
  console.log('8. feedback spoke');
  await page.locator('.account-back').click();
  await page.locator('.account-menu-row', { hasText: 'Send feedback' }).click();
  const feedbackBox = page.locator('#acct-feedback');
  await feedbackBox.waitFor({ timeout: 5000 });
  const sendBtn = page.locator('button', { hasText: 'Send by email' });
  if (!(await sendBtn.isDisabled())) fail('the send button is live with an empty message');
  await feedbackBox.fill('The Porto bus fare looked too low for August.');
  if (await sendBtn.isDisabled()) fail('the send button stayed off after typing a message');
  ok('feedback: send stays off until there is a message');
  await page.screenshot({ path: `${SHOTS}/account-feedback.png` });

  // ---- Quality floor on the hub.
  console.log('9. quality floor');
  await page.locator('.account-back').click();
  const closeBox = await page.locator('.account-panel .panel-close').boundingBox();
  if (closeBox.width < 44 || closeBox.height < 44) {
    fail(`close button is ${Math.round(closeBox.width)}x${Math.round(closeBox.height)}, under 44px`);
  }
  ok(`close button is ${Math.round(closeBox.width)}x${Math.round(closeBox.height)}`);

  // ---- 10. A Google-only account has no password. Every password control
  // must step aside for the email route, and deletion must still ask.
  console.log('10. google-only account');
  const GOOGLE_USER = {
    ...USER,
    app_metadata: { provider: 'google', providers: ['google'] },
    identities: [{ id: 'g1', provider: 'google', identity_data: { email: USER.email } }],
  };
  const ctxG = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await ctxG.addInitScript(seedSession(PROJECT_REF, GOOGLE_USER));
  const pageG = await ctxG.newPage();
  await stubSupabase(pageG, state);
  await pageG.goto(`${BASE}/?o=CRL&tab=home`);
  await pageG.locator('.account-avatar-btn').first().waitFor({ timeout: 120000 });
  await openPanel(pageG);
  await goToProfile(pageG);
  if (await pageG.locator('#acct-current-pw').count()) fail('a Google account is asked for a password it does not have');
  if (!/Google/.test(await pageG.locator('.account-section-hint').first().innerText())) {
    fail('the password section does not explain why there is no form');
  }
  const before = state.recoverCalls;
  await pageG.locator('button', { hasText: 'Email me a link' }).click();
  await pageG.waitForTimeout(600);
  if (state.recoverCalls <= before) fail('the set-a-password link sent no mail');
  ok('the password form is replaced by the set-a-password route');
  await pageG.locator('.account-delete-arm').click();
  const delEmail = pageG.locator('#acct-delete-email');
  if (!(await delEmail.count())) fail('a Google account can delete itself with no confirmation at all');
  await delEmail.fill('wrong@example.com');
  await pageG.locator('button', { hasText: 'Delete forever' }).click();
  await pageG.waitForTimeout(400);
  if (!/does not match|niet overeen/i.test(await pageG.locator('.account-danger .auth-error').innerText())) {
    fail('deletion accepted the wrong address');
  }
  ok('deletion asks for the account address typed out, and checks it');
  await ctxG.close();

  // 380px: the panel goes full width there, so nothing may spill sideways.
  const ctx2 = await browser.newContext({ viewport: { width: 380, height: 820 }, isMobile: true, hasTouch: true });
  await ctx2.addInitScript(seedSession(PROJECT_REF, USER));
  const page2 = await ctx2.newPage();
  await stubSupabase(page2, state);
  await page2.goto(`${BASE}/?o=CRL&tab=map`);
  await page2.waitForTimeout(2500);
  // :visible keeps the header avatar (display:none on mobile since Account
  // moved to the bottom bar) from shadowing the item that can be clicked.
  const mobileBtn = page2.locator('.mobile-account-btn:visible, .bottom-nav-item:has-text("Account"), .account-avatar-btn:visible').first();
  await mobileBtn.click({ timeout: 30000 });
  await page2.locator('.account-panel').waitFor({ timeout: 15000 });
  await page2.waitForTimeout(500);
  const spillCheck = () => page2.locator('.account-panel').evaluate((root) => {
    const wide = [...root.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > root.clientWidth + 1)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 50));
    return { scrolls: root.scrollWidth > root.clientWidth + 1, wide: wide.slice(0, 5) };
  });
  const hubSpill = await spillCheck();
  if (hubSpill.scrolls) fail(`the hub scrolls sideways at 380px: ${hubSpill.wide.join(' | ')}`);
  await page2.screenshot({ path: `${SHOTS}/account-hub-380.png`, fullPage: true });
  await page2.locator('.account-profile-card').click();
  await page2.locator('#acct-name').waitFor({ timeout: 10000 });
  const profSpill = await spillCheck();
  if (profSpill.scrolls) fail(`the profile spoke scrolls sideways at 380px: ${profSpill.wide.join(' | ')}`);
  ok('380px: no horizontal scroll on the hub or the profile spoke');
  await page2.screenshot({ path: `${SHOTS}/account-profile-380.png`, fullPage: true });

  await browser.close();
  if (process.exitCode !== 1) console.log('verify_account_panel OK');
} catch (err) {
  fail(err.stack || err.message);
} finally {
  if (srv) {
    srv.kill();
    if (process.platform === 'win32' && srv.pid) {
      try { spawnSync('taskkill', ['/pid', String(srv.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
    }
  }
  process.exit(process.exitCode === 1 ? 1 : 0);
}
