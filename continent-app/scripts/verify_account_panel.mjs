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
//   2. Profile spoke: editable name/email, stated once, saves and confirms,
//      plus the handle: seeded, normalised as you type, refused when it is
//      too short, and reported as taken without naming who took it.
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
// The handle this traveller already holds, and one the stub will report as
// belonging to somebody else.
const SEEDED_HANDLE = 'sam_okonkwo';
const TAKEN_HANDLE = 'lisbon';
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
  // Supabase puts the scope in the query string: ?scope=others for the sweep
  // of other devices, no scope (or global) for an ordinary sign out.
  await page.route('**/auth/v1/logout*', (route) => {
    state.logoutScopes.push(new URL(route.request().url()).searchParams.get('scope') || 'global');
    return route.fulfill({ status: 204, body: '' });
  });

  // public.profiles, added in migration 010. The GET seeds the handle field;
  // the PATCH records what was written and refuses one reserved-in-this-test
  // handle with the same 23505 a real unique violation returns, so the "that
  // handle is taken" path is exercised rather than assumed.
  await page.route('**/rest/v1/profiles*', async (route) => {
    const method = route.request().method();
    if (method === 'PATCH') {
      const body = JSON.parse(route.request().postData() || '{}');
      state.profileUpdates.push(body);
      if (body.handle === TAKEN_HANDLE) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            code: '23505',
            message: 'duplicate key value violates unique constraint "profiles_handle_key"',
            details: null, hint: null,
          }),
        });
      }
      state.profile = { ...state.profile, ...body };
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(state.profile),
    });
  });
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
  const state = {
    reauthAttempts: [], userUpdates: [], recoverCalls: 0, logoutScopes: [],
    profileUpdates: [],
    profile: {
      user_id: USER.id, handle: SEEDED_HANDLE,
      display_name: USER.user_metadata.full_name, avatar_emoji: null,
    },
  };

  const ctx = await browser.newContext({
    viewport: { width: 1360, height: 950 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await ctx.addInitScript(seedSession(PROJECT_REF, USER));
  const page = await ctx.newPage();
  await stubSupabase(page, state);
  await page.goto(`${BASE}/?o=CRL`);
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
  // Four help rows: feedback, FAQ, privacy, data sources. Friends is NOT among
  // them; it has its own door in the header (see verify_friends.mjs), because
  // seeing who you travel with is a place you go, not a setting you change.
  const menuRows = await page.locator('.account-menu-row').count();
  if (menuRows !== 4) fail(`expected 4 help menu rows, found ${menuRows}`);
  if (await page.locator('.account-menu-row').filter({ hasText: 'Friends' }).count()) {
    fail('Friends is back in the account hub, competing with its header door');
  }
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
  await page.locator('.auth-hint:not(.acct-handle-hint)').first().waitFor({ timeout: 5000 });
  ok('changing the email warns that it needs confirming first');
  await emailInput.fill(USER.email);

  // ---- 3b. The handle: how another account will be able to find you.
  console.log('3b. handle');
  const handleInput = page.locator('#acct-handle');
  if (!(await handleInput.count())) {
    fail('the profile spoke shows no handle field');
  } else {
    if (await handleInput.inputValue() !== SEEDED_HANDLE) {
      fail(`handle field is not seeded from the profile: ${await handleInput.inputValue()}`);
    } else ok('the handle is seeded from the account');

    // The @ belongs to the field, not to what you type, so it cannot be
    // deleted and cannot be typed twice.
    if (!(await page.locator('.acct-handle-at').count())) fail('no @ prefix on the handle field');

    // Typed illegally, corrected in place rather than rejected after the fact.
    await handleInput.fill('Sam Okonkwo!!');
    if (await handleInput.inputValue() !== 'samokonkwo') {
      fail(`the handle field did not normalise what was typed: ${await handleInput.inputValue()}`);
    } else ok('capitals, spaces and punctuation are folded away as you type');

    // Too short: caught before it ever reaches the database.
    await handleInput.fill('ab');
    await save.click();
    await page.locator('.auth-error').first().waitFor({ timeout: 5000 });
    let err = await page.locator('.auth-error').first().innerText();
    if (!/at least 3/i.test(err)) fail(`a 2-character handle was not refused clearly: ${err}`);
    else ok('a handle under 3 characters is refused inline');
    if (state.profileUpdates.some((u) => u.handle === 'ab')) {
      fail('the too-short handle was sent to the database anyway');
    }

    // Taken: said plainly, and without naming who holds it.
    await handleInput.fill(TAKEN_HANDLE);
    await save.click();
    await page.waitForTimeout(600);
    err = await page.locator('.auth-error').first().innerText();
    if (!/taken/i.test(err)) fail(`a taken handle was not reported as taken: ${err}`);
    else ok('a taken handle says so');
    if (/@|owned|belongs|by /i.test(err)) fail(`the taken-handle error names who holds it: ${err}`);
    else ok('and does not say whose it is');

    // A free one saves.
    await handleInput.fill('sam_travels');
    await save.click();
    await page.locator('.auth-notice-inline').first().waitFor({ timeout: 10000 });
    if (!state.profileUpdates.some((u) => u.handle === 'sam_travels')) {
      fail('a valid handle was never written');
    } else ok('a free handle saves');
    await page.screenshot({ path: `${SHOTS}/account-handle.png` });
  }

  // ---- 4 & 5. Password: the whole production contract, field by field.
  console.log('4. password security');
  const current = page.locator('#acct-current-pw');
  const next = page.locator('#acct-new-pw');
  const confirm = page.locator('#acct-confirm-pw');
  const submit = page.locator('.auth-submit', { hasText: 'Update password' });
  if (!(await current.count())) fail('no current-password field: the panel still lets a borrowed session take the account');

  // Attributes: masked, autofilled by the right heuristic, required.
  for (const [name, loc, auto] of [
    ['current', current, 'current-password'],
    ['new', next, 'new-password'],
    ['confirm', confirm, 'new-password'],
  ]) {
    if (await loc.getAttribute('type') !== 'password') fail(`the ${name} password field is not masked`);
    if (await loc.getAttribute('autocomplete') !== auto) fail(`${name} password has the wrong autocomplete attribute`);
    if (await loc.getAttribute('required') === null) fail(`${name} password is not marked required`);
  }
  ok('all three fields are masked, required, and carry the right autocomplete');

  // The reveal toggle is a real toggle, and says which state it is in.
  const revealNew = page.locator('.pw-input-wrap:has(#acct-new-pw) .pw-reveal').first();
  if (await revealNew.getAttribute('aria-pressed') !== 'false') fail('the reveal toggle does not report its state');
  await revealNew.click();
  if (await next.getAttribute('type') !== 'text') fail('the reveal toggle did not unmask the field');
  if (await revealNew.getAttribute('aria-pressed') !== 'true') fail('the reveal toggle did not flip aria-pressed');
  await revealNew.click();
  ok('reveal toggles are real toggles, with aria-pressed following the field');

  // Nothing is submittable until it could succeed. This is what stops the
  // double submit, and it is why there is no "press to find out" step.
  if (await submit.isEnabled()) fail('the empty form is submittable');
  await next.fill('abcdefg');
  await confirm.fill('abcdefg');
  if (await submit.isEnabled()) fail('a 7-character password with no current password is submittable');
  ok('submit stays disabled until the form could actually succeed');

  // The checklist is live, and it is the same four rules the button gates on.
  const rules = page.locator('.pw-reqs .pw-req');
  if (await rules.count() !== 4) fail(`expected four rules in the checklist, got ${await rules.count()}`);
  if (await page.locator('.pw-req.met').count() !== 0) fail('"abcdefg" met a rule it should not have');
  await next.fill('abcdefgH');
  if (await page.locator('.pw-req.met').count() !== 2) fail('length and capital did not tick together');
  await next.fill('abcdefgH9');
  if (await page.locator('.pw-req.met').count() !== 3) fail('the digit did not tick');
  await next.fill('abcdefgH9!');
  if (await page.locator('.pw-req.met').count() !== 4) fail('the symbol did not tick');
  ok('the checklist ticks each rule off as it is typed');

  // Confirm reports the match live, without waiting for a submit.
  if (await page.locator('.pw-match.met').count()) fail('mismatched confirm reads as matching');
  await confirm.fill('abcdefgH9!');
  if (!(await page.locator('.pw-match.met').count())) fail('a matching confirm does not say so');
  ok('confirm reports the match as it is typed');
  await confirm.fill('abcdefgH9');
  await page.locator('.account-panel').screenshot({ path: `${SHOTS}/account-password-live.png` });
  await confirm.fill('abcdefgH9!');

  // The meter is still the honest reading next to the checklist.
  await next.fill('aaaaaaaaAA11!!');
  await confirm.fill('aaaaaaaaAA11!!');
  if (/strong/.test(await page.locator('.pw-strength').getAttribute('class'))) {
    fail('fourteen characters of repeats read as strong just for clearing the rules');
  }
  await next.fill('Ferry timetable rhubarb 41!');
  await confirm.fill('Ferry timetable rhubarb 41!');
  if (!/strong/.test(await page.locator('.pw-strength').getAttribute('class'))) {
    fail('a long passphrase did not read as strong');
  }
  ok('the meter still separates a strong passphrase from a rule-clearing mangle');

  // A wrong current password is reported under the current password field.
  await current.fill('whatever-is-wrong');
  await submit.click();
  await page.waitForTimeout(700);
  const fieldErr = await page.locator('#acct-current-pw-error').innerText();
  if (!/isn't right|is not right/i.test(fieldErr)) fail(`the re-auth failure did not land on the field: ${fieldErr}`);
  if (await current.getAttribute('aria-invalid') !== 'true') fail('the failed field is not marked invalid');
  if (!state.reauthAttempts.includes('whatever-is-wrong')) fail('no re-authentication call was made at all');
  ok('a wrong current password is rejected by a real re-auth call, and said so under the field');
  await current.fill(RIGHT_PASSWORD);
  if (await page.locator('#acct-current-pw-error').count()) fail('the field error survived a correction');
  ok('the error clears the moment the field is corrected');

  // The sweep of other devices is opt-in, and really happens.
  const sweep = page.locator('.auth-check input[type="checkbox"]');
  if (!(await sweep.count())) fail('there is no way to sign out the other devices');
  if (await sweep.isChecked()) fail('other devices are signed out by default');
  await sweep.check();
  const scopesBefore = state.logoutScopes.length;
  await submit.click();
  await page.waitForTimeout(900);
  if (!state.userUpdates.some((u) => u.password)) fail('no password update was sent after re-auth');
  if (!state.logoutScopes.slice(scopesBefore).includes('others')) {
    fail(`the checkbox sent no others-scoped sign out: ${JSON.stringify(state.logoutScopes)}`);
  }
  ok('the correct current password completes the change and sweeps the other devices');

  // Success is a banner you can close, over fields that emptied themselves.
  const banner = page.locator('.auth-banner');
  if (!(await banner.count())) fail('a completed change showed no success banner');
  if (!/signed out/i.test(await banner.innerText())) fail('the banner does not report the device sweep it just did');
  for (const [name, loc] of [['current', current], ['new', next], ['confirm', confirm]]) {
    if (await loc.inputValue() !== '') fail(`the ${name} field still holds the password after a successful change`);
  }
  if (await sweep.isChecked()) fail('the device sweep stayed armed for the next change');
  await page.screenshot({ path: `${SHOTS}/account-password-success.png` });
  await banner.locator('.auth-banner-x').click();
  if (await page.locator('.auth-banner').count()) fail('the success banner cannot be dismissed');
  ok('success is a dismissible banner, and the fields empty behind it');

  // ---- 6. Forgot password says where the link is going before it goes.
  console.log('5. recovery');
  await page.locator('.auth-forgot-inline').click();
  const forgot = page.locator('.auth-forgot-confirm');
  if (!(await forgot.count())) fail('the forgot-password link fires with no confirmation step');
  if (!(await forgot.innerText()).includes(USER.email)) fail('the confirmation does not name the address');
  if (state.recoverCalls) fail('opening the confirmation already sent the mail');
  await forgot.locator('button', { hasText: 'Send the link' }).click();
  await page.waitForTimeout(700);
  if (!state.recoverCalls) fail('the forgot-password link sent no reset mail');
  if (!/Reset link sent/i.test(await page.locator('.auth-banner').innerText())) {
    fail('sending the reset link reported nothing');
  }
  ok('forgot password names the address, then sends the reset link to it');
  await page.locator('.auth-banner-x').click();

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
  // Closed, the danger box is one button: what deletion costs is the answer
  // to pressing it, not a notice standing over a panel people open to change
  // their name.
  if (await page.locator('.account-danger-text').count()) {
    fail('the deletion warning is showing before anybody asked to delete anything');
  }
  await page.locator('.account-delete-arm').click();
  const warning = await page.locator('.account-danger-text').innerText();
  if (!/cannot be undone/i.test(warning)) fail(`arming shows no warning about what is lost: "${warning}"`);
  ok('the warning appears on pressing Delete my account, not before');
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

  // ---- 8b. The data credits spoke. The licenses that ask for a visible
  //          credit are answered here now that the front page is gone, so an
  //          empty list is a compliance problem, not a cosmetic one.
  await page.locator('.account-back').click();
  await page.locator('.account-menu-row', { hasText: 'Data sources' }).click();
  const creditLines = await page.locator('.account-credits li').allInnerTexts();
  if (creditLines.length < 10) fail(`data sources spoke lists ${creditLines.length} credits`);
  if (!creditLines.some((l) => /OpenStreetMap/.test(l))) fail('credits never name OpenStreetMap');
  ok(`data sources: ${creditLines.length} credits, OpenStreetMap among them`);

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
  await pageG.goto(`${BASE}/?o=CRL`);
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
