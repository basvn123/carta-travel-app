// Windows reserves a handful of names (PRN is the printer), and git refuses to
// index a file called PRN.json, so Pristina's fare slice used to be written,
// never committed, and silently missing in production. lib/fareFile.js escapes
// those codes on both ends; this checks the app really asks for the escaped
// name, gets it, and prices the catalogue from it.
//   Run from inside continent-app/:  node scripts/verify_fares_url.mjs
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fareFileBase, faresUrl } from '../src/lib/fareFile.js';

const PORT = 4192;
const BASE = `http://127.0.0.1:${PORT}`;

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

// 1. The naming rule itself: reserved codes escaped, ordinary ones untouched.
for (const [code, want] of [['PRN', 'PRN_'], ['CON', 'CON_'], ['AUX', 'AUX_'],
  ['CRL', 'CRL'], ['BRU', 'BRU'], ['PRG', 'PRG']]) {
  if (fareFileBase(code) !== want) fail(`fareFileBase(${code}) = ${fareFileBase(code)}, want ${want}`);
}

// 2. The written files match it: no reserved name left in public/fares/.
const stray = ['PRN', 'CON', 'AUX', 'NUL'].filter((c) => existsSync(`public/fares/${c}.json`));
if (stray.length) fail(`reserved-name slices still on disk: ${stray.join(', ')}`);
if (!existsSync('public/fares/PRN_.json')) fail('public/fares/PRN_.json missing');

const isUp = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
let srv = null;
const waitForServer = async () => {
  if (await isUp()) return;
  srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60; i += 1) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview never came up');
};

try {
  await waitForServer();

  // 3. The slice serves, and holds the anchors the app prices against.
  const res = await fetch(`${BASE}${faresUrl('PRN')}`);
  if (!res.ok) fail(`GET ${faresUrl('PRN')} -> HTTP ${res.status}`);
  const slice = res.ok ? await res.json() : {};
  const anchors = Object.keys(slice);
  const withOut = anchors.filter((a) => slice[a]?.out && Object.keys(slice[a].out).length);
  console.log(`served ${faresUrl('PRN')}: ${anchors.length} anchors, ${withOut.length} with outbound fares`);
  if (!withOut.length) fail('PRN slice served but has no outbound fares');

  // 4. Pristina is a real origin in the shipped payload, or none of this ships.
  const coverage = JSON.parse(readFileSync('public/app_data.json', 'utf8'))?.meta?.origin_coverage || {};
  if (!coverage.PRN) fail(`meta.origin_coverage has no PRN (got ${coverage.PRN})`);
  else console.log(`meta.origin_coverage.PRN = ${coverage.PRN} anchors`);

  // 5. The running app asks for the escaped name and nothing else.
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const fareReqs = [];
  page.on('response', (r) => {
    const p = new URL(r.url()).pathname;
    if (p.startsWith('/fares/')) fareReqs.push({ path: p, status: r.status() });
  });
  await page.addInitScript(() => {
    localStorage.setItem('continent.lang.v1', 'en');
    localStorage.setItem('continent.guestMode.v1', '1');
    localStorage.setItem('carta.welcomeSeen', '1');
    localStorage.setItem('carta.fareNoticeSeen', '1');
    localStorage.setItem('continent.onboardingSeen.v1', '1');
    localStorage.setItem('continent.mapGuideDismissed.v1', '1');
  });
  await page.goto(`${BASE}/?tab=map&o=PRN`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  console.log('fare requests:', JSON.stringify(fareReqs));
  const good = fareReqs.find((r) => r.path === '/fares/PRN_.json' && r.status === 200);
  if (!good) fail('app never fetched /fares/PRN_.json with a 200');
  if (fareReqs.some((r) => r.path === '/fares/PRN.json')) fail('app still asks for the reserved /fares/PRN.json');

  await browser.close();
} catch (err) {
  fail(err.message);
} finally {
  if (srv) {
    srv.kill();
    if (process.platform === 'win32' && srv.pid) {
      try { spawnSync('taskkill', ['/pid', String(srv.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
    }
  }
  if (process.exitCode !== 1) console.log('verify_fares_url OK');
  process.exit(process.exitCode === 1 ? 1 : 0);
}
