// Logic wave 0a (ROADMAP C9, N5; judge 1): the two visible changes, checked
// in a real browser at a phone (390x844) and a desktop (1440x900) size.
//   a. Back from Stripe: `?pass=ok` leaves the address once the app mounts
//      (hooks/useEntitlement.js, V-5).
//   b. Sign out with "remove": the page lands on the clean path (the /nl/
//      prefix kept, no query, no hash) and the device copy is gone, the
//      address mirror continent.state.v1 included (N5).
//   c. Account delete: the same landing and the same clear.
//
// No real account: like verify_account_panel.mjs, a session is written into
// the storage key supabase-js reads and every Supabase call is answered
// locally. The build must know a Supabase URL, so build with a stub one:
//   VITE_SUPABASE_URL=https://ntssxktaduxzpsmejwyv.supabase.co VITE_SUPABASE_ANON_KEY=stub \
//     node node_modules/vite/bin/vite.js build ...
// Without it the app is guest-only: (a) still runs, (b) and (c) report
// "not verified".
//
// Run from inside continent-app/:  node scripts/verify_signout_clean.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = (process.argv[2] || `http://127.0.0.1:${Number(process.env.CARTA_PORT) || 5601}`).replace(/\/$/, '');
const PROJECT_REF = 'ntssxktaduxzpsmejwyv';
const SUPA = `https://${PROJECT_REF}.supabase.co`;
const PASSWORD = 'correct-horse-battery';
const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated', role: 'authenticated', email: 'traveller@example.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  user_metadata: { full_name: 'Sam Okonkwo' },
  app_metadata: { provider: 'email', providers: ['email'] },
  identities: [{ id: 'i1', provider: 'email', identity_data: { email: 'traveller@example.com' } }],
  created_at: '2026-01-01T00:00:00Z',
};
const SIZES = [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }];
// What the traveller had on this device before the clear.
const MIRROR = 'g=3&o=BRU&dh=50.85,4.35,Home&fav=d:BRU';
const SEEDED_KEPT = '[{"id":"verify-kept"}]';

let failures = 0;
const fail = (msg) => { console.log(`  FAIL: ${msg}`); failures += 1; };
const ok = (msg) => console.log(`  ok: ${msg}`);
const notVerified = (msg) => console.log(`  NOT VERIFIED: ${msg}`);

// Seeds once per tab (a sessionStorage flag), so the page the clear lands on
// is not seeded again and shows what the clear left.
const seed = (signedIn) => `(() => {
  if (sessionStorage.getItem('verify.seeded')) return;
  sessionStorage.setItem('verify.seeded', '1');
  localStorage.setItem('continent.guestMode.v1', '1');
  localStorage.setItem('continent.homeSeen.v1', '1');
  localStorage.setItem('carta.welcomeSeen', '1');
  localStorage.setItem('carta.mapGuideDone', '1');
  localStorage.setItem('continent.state.v1', ${JSON.stringify(MIRROR)});
  localStorage.setItem('carta.keptTrips.v1', ${JSON.stringify(SEEDED_KEPT)});
  localStorage.setItem('carta.travelStyles.v1', '{"styles":[]}');
  ${signedIn ? `localStorage.setItem('sb-${PROJECT_REF}-auth-token', JSON.stringify({
    access_token: 'stub', token_type: 'bearer', expires_in: 360000,
    expires_at: Math.floor(Date.now() / 1000) + 360000,
    refresh_token: 'stub-refresh', user: ${JSON.stringify(USER)},
  }));` : ''}
})()`;

async function stubSupabase(page, calls) {
  // Anything not named below: an empty answer, never the network.
  await page.route(`${SUPA}/**`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(`${SUPA}/rest/v1/rpc/ai_status*`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ tier: 'free', plansUsed: 0, plansCap: 0, plansLeft: 0, groundUsed: 0, groundCap: 0, groundLeft: 0 }),
  }));
  await page.route(`${SUPA}/auth/v1/user*`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) }));
  await page.route(`${SUPA}/auth/v1/token*`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ access_token: 'stub', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'stub-refresh', user: USER }),
  }));
  await page.route(`${SUPA}/auth/v1/logout*`, (route) => { calls.logout += 1; return route.fulfill({ status: 204, body: '' }); });
  await page.route(`${SUPA}/rest/v1/rpc/delete_user*`, (route) => { calls.deleteUser += 1; return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }); });
}

/** Watch the main frame's document loads (not history.replaceState); returns the URLs. */
function navLog(page) {
  const log = [];
  page.on('request', (r) => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) log.push(r.url()); });
  return log;
}

/** A DOM click that survives the page settling (a boot reload, a re-render):
 *  waits for the element again and retries. Checks where the page lands, not
 *  hit-testing. */
async function domClick(page, selector) {
  for (let i = 0; ; i += 1) {
    try {
      const el = page.locator(selector).first();
      // The app's boot keeps the main thread busy for tens of seconds on a
      // loaded machine, so the waits are long.
      await el.waitFor({ timeout: 120000 });
      await el.evaluate((n) => n.click(), null, { timeout: 120000 });
      return;
    } catch (e) {
      if (i >= 4) throw e;
      await page.waitForLoadState('load').catch(() => {});
      await page.waitForTimeout(1500);
    }
  }
}

/** After the clear: the landing is the clean path, and the person's things are gone. */
async function checkLanding(page, nav, before, label) {
  const target = `${BASE}/nl/`;
  for (let i = 0; i < 240 && nav.length === before; i += 1) await page.waitForTimeout(500);
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
  const landed = nav.slice(before);
  if (landed[0] === target) ok(`${label}: landed on ${target} (no query, no hash)${landed.length > 1 ? `; later loads: ${landed.slice(1).join(', ')}` : ''}`);
  else fail(`${label}: first navigation after the clear was ${landed[0] || '(none)'}, wanted ${target}`);
  // The landing page can still be settling (a second load); read it once stable.
  const settled = async (fn) => {
    for (let i = 0; ; i += 1) {
      try { return await page.evaluate(fn); } catch (e) {
        if (i >= 5) throw e;
        await page.waitForLoadState('load').catch(() => {});
        await page.waitForTimeout(1000);
      }
    }
  };
  const left = await settled(() => ({
    mirror: localStorage.getItem('continent.state.v1'),
    kept: localStorage.getItem('carta.keptTrips.v1'),
    styles: localStorage.getItem('carta.travelStyles.v1'),
    token: Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k)),
    search: location.search,
  }));
  // The new page writes its own fresh mirror at once (defaults); what must
  // not be there is the person: the home point, the shortlist, the party.
  const m = new URLSearchParams(left.mirror || '');
  if (left.mirror === null || (!m.has('dh') && !m.has('fav') && m.get('g') !== '3' && m.get('o') !== 'BRU')) {
    ok(`${label}: continent.state.v1 is ${left.mirror === null ? 'null' : `fresh ("${left.mirror}")`}, no home point, shortlist, party or start`);
  } else fail(`${label}: continent.state.v1 still holds the person: "${left.mirror}"`);
  if (left.kept !== SEEDED_KEPT && left.styles === null) ok(`${label}: carta.keptTrips.v1 and carta.travelStyles.v1 removed`);
  else fail(`${label}: device things left: keptTrips=${left.kept} styles=${left.styles}`);
  if (!left.token.length) ok(`${label}: the session token is gone`);
  else fail(`${label}: session token left: ${left.token.join(', ')}`);
  if (/(?:^|[?&])(dh|fav)=/.test(left.search)) fail(`${label}: the address carries a person key again: ${left.search}`);
  else ok(`${label}: address now "${left.search || '(empty)'}"`);
}

const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    console.log(`\n== ${size.name} ${size.width}x${size.height}`);

    // ---- a. ?pass=ok leaves the address.
    {
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
      await ctx.addInitScript(seed(true));
      const page = await ctx.newPage();
      await stubSupabase(page, { logout: 0, deleteUser: 0 });
      await page.goto(`${BASE}/?pass=ok&tab=explore`);
      try {
        await page.waitForFunction(() => !new URLSearchParams(location.search).has('pass'), null, { timeout: 120000 });
        ok(`a. ?pass=ok left the address after mount; address now "${await page.evaluate(() => location.search)}"`);
      } catch {
        fail(`a. ?pass=ok still in the address after 30 s: ${await page.evaluate(() => location.href)}`);
      }
      await ctx.close();
    }

    // ---- b. Sign out with "remove".
    {
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
      await ctx.addInitScript(seed(true));
      const page = await ctx.newPage();
      const calls = { logout: 0, deleteUser: 0 };
      await stubSupabase(page, calls);
      const nav = navLog(page);
      const from = `${BASE}/nl/?tab=account&fav=d:BRU&dh=50.85,4.35,X`;
      await page.goto(from);
      const signOut = page.locator('.ac-signout:visible').first();
      try {
        await signOut.waitFor({ timeout: 120000 });
      } catch {
        notVerified('b. no sign-out button (is the build guest-only? build with a stub VITE_SUPABASE_URL)');
        await ctx.close();
        continue;
      }
      await page.waitForTimeout(3000);
      await domClick(page, '.ac-signout:visible');
      await page.locator('.ac-out-ask .ac-out-ask-btns button').first().waitFor({ timeout: 120000 });
      const before = nav.length;
      await domClick(page, '.ac-out-ask .ac-out-ask-btns button');
      await checkLanding(page, nav, before, 'b. sign out with remove');
      if (calls.logout > 0) ok('b. the remote sign-out was called');
      await ctx.close();
    }

    // ---- c. Account delete.
    {
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
      await ctx.addInitScript(seed(true));
      const page = await ctx.newPage();
      const calls = { logout: 0, deleteUser: 0 };
      await stubSupabase(page, calls);
      const nav = navLog(page);
      await page.goto(`${BASE}/nl/?tab=account&view=data&fav=d:BRU&dh=50.85,4.35,X`);
      // The danger row (account/parts.jsx Row, `is-danger`): Delete my account.
      const arm = page.locator('.ac-row.is-danger:visible').first();
      try {
        await arm.waitFor({ timeout: 120000 });
      } catch {
        notVerified('c. no delete button on the data view');
        await ctx.close();
        continue;
      }
      await page.waitForTimeout(3000);
      await domClick(page, '.ac-row.is-danger:visible');
      await page.locator('.account-delete-btn').first().waitFor({ timeout: 120000 });
      const pw = page.locator('#acct-delete-pw');
      if (await pw.count()) await pw.fill(PASSWORD);
      const email = page.locator('#acct-delete-email');
      if (await email.count()) await email.fill(USER.email);
      const before = nav.length;
      await domClick(page, '.account-delete-btn');
      await checkLanding(page, nav, before, 'c. account delete');
      if (calls.deleteUser > 0) ok('c. delete_user was called');
      else fail('c. delete_user was never called');
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
