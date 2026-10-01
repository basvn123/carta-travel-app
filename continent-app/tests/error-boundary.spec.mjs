// A crash the traveller sees is also recorded (T083).
//
//   node tests/error-boundary.spec.mjs
//
// Starts the Vite dev server on 5204 with a placeholder Supabase project, so
// the real supabase client is built and every request it makes can be caught
// here. Nothing leaves the machine: the placeholder host is never contacted,
// every request to it is answered by page.route below.
//
// The crash is made by serving a replacement for /src/App.jsx whose render
// throws. Everything else is the committed code: main.jsx, the ErrorBoundary,
// edgeFailure.js and the supabase client. So the path from a render error to
// the telemetry request is exercised end to end, with only the network
// replaced.
//
// Asserted:
//   1. A render error shows the crash panel and sends exactly one
//      log_edge_error call, with fn 'app', code 'client_crash', origin
//      'client' and no statuses.
//   2. The request carries nothing about the error: not its message, not the
//      component stack, not the page.
//   3. A stale-chunk error reloads once without recording anything; when the
//      chunk is still broken after the reload, the crash panel shows and that
//      one is recorded.
//   4. The positive control: the probe sees the request at all. Without the
//      ErrorBoundary call the count in 1 would be 0, and the run fails there.
//
// The database side (040 refuses fn 'app' until its two closed lists are
// widened) is in Execution/P4/T083-rls-tests-and-errorboundary.md and
// register row T083-b; this spec proves what the browser sends.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const PORT = 5204;
const BASE = `http://127.0.0.1:${PORT}/`;
const FAKE_SUPABASE = 'http://127.0.0.1:5205';
const SECRET = 't083-private-detail-do-not-send';

const checks = [];
const check = (label, ok, note = '') => {
  checks.push({ label, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${note ? `  (${note})` : ''}`);
};

const vite = spawn(process.execPath, [path.join(APP, 'node_modules/vite/bin/vite.js'),
  '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: APP,
  env: { ...process.env, VITE_SUPABASE_URL: FAKE_SUPABASE, VITE_SUPABASE_ANON_KEY: 'placeholder-anon-key' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let viteLog = '';
vite.stdout.on('data', (d) => { viteLog += d; });
vite.stderr.on('data', (d) => { viteLog += d; });

const waitForServer = async () => {
  for (let i = 0; i < 120; i += 1) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

/** A replacement App module whose render throws the given message. */
const throwingApp = (message) => `
export default function App() {
  throw new Error(${JSON.stringify(message)});
}
`;

/**
 * Open the app with App.jsx replaced, and collect every request to the
 * placeholder Supabase host. Returns the page and the captured requests.
 */
async function openCrashing(browser, message) {
  const page = await browser.newPage();
  const sent = [];
  await page.route(/\/src\/App\.jsx(\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: throwingApp(message),
  }));
  await page.route(`${FAKE_SUPABASE}/**`, (route) => {
    const req = route.request();
    sent.push({ url: req.url(), body: req.postData() || '', headers: req.headers(), page: page.url() });
    route.fulfill({ status: 204, body: '' });
  });
  page.on('console', () => {}); // the boundary logs the error on purpose
  await page.goto(BASE, { waitUntil: 'commit', timeout: 60000 });
  return { page, sent };
}

const rpcCalls = (sent) => sent.filter((s) => s.url.includes('/rest/v1/rpc/log_edge_error'));

let browser;
try {
  const up = await waitForServer();
  check('the dev server came up on 5204', up, up ? '' : viteLog.slice(-400));
  if (!up) throw new Error('no dev server');
  browser = await chromium.launch();

  // Warm-up, not asserted. The first page load makes Vite optimise its
  // dependencies, and when that finishes it reloads the page, which would
  // count as a second load in the checks below.
  {
    const { page } = await openCrashing(browser, 'warm-up');
    await page.locator('.crash-screen').waitFor({ timeout: 180000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.close();
  }

  // 1, 2 and 4: an ordinary render error.
  {
    const { page, sent } = await openCrashing(browser, `Render failed: ${SECRET}`);
    const panel = page.locator('.crash-screen[role="alert"]');
    await panel.waitFor({ timeout: 90000 }).catch(() => {});
    check('a render error shows the crash panel', await panel.isVisible().catch(() => false));
    await page.waitForTimeout(1500); // fire and forget: let the request go out
    const calls = rpcCalls(sent);
    check('the crash sends exactly one log_edge_error call', calls.length === 1, `${calls.length} sent`);
    let body = {};
    try { body = JSON.parse(calls[0]?.body || '{}'); } catch { /* checked below */ }
    check('fn is app, code is client_crash, origin is client',
      body.p_fn === 'app' && body.p_code === 'client_crash' && body.p_origin === 'client', JSON.stringify(body));
    check('no HTTP or upstream status is claimed', body.p_http === null && body.p_upstream === null);
    check('the call carries exactly the five writer arguments',
      Object.keys(body).sort().join(',') === 'p_code,p_fn,p_http,p_origin,p_upstream', Object.keys(body).join(','));
    const everything = sent.map((s) => `${s.url} ${s.body}`).join('\n');
    check('nothing sent to Supabase contains the error message', !everything.includes(SECRET));
    check('nothing sent contains a component stack or a page path',
      !/componentStack|at App|\/src\//.test(calls.map((c) => c.body).join('')));
    check('the error text is still shown to the traveller on screen',
      (await page.locator('.crash-detail').textContent({ timeout: 2000 }).catch(() => '') || '').includes(SECRET));
    await page.close();
  }

  // 3: a stale chunk reloads once and records nothing, then a still-broken
  // chunk after the reload is a real crash and is recorded once.
  {
    const { page, sent } = await openCrashing(browser,
      'Failed to fetch dynamically imported module: /assets/Gone-abc123.js');
    let navigations = 0;
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations += 1; });
    const panel = page.locator('.crash-screen[role="alert"]');
    await panel.waitFor({ timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(1500);
    check('a stale-chunk error reloads the page once', navigations === 1, `${navigations} navigations`);
    check('after the reload a still-broken chunk shows the crash panel', await panel.isVisible().catch(() => false));
    const calls = rpcCalls(sent);
    check('the reload itself records nothing; the crash after it records once', calls.length === 1, `${calls.length} sent`);
    await page.close();
  }
} catch (err) {
  check('the spec ran to the end', false, err.message);
} finally {
  if (browser) await browser.close();
  vite.kill();
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length} checks, ${checks.length - failed} passing, ${failed} failing.`);
if (failed || checks.length === 0) process.exit(1);
