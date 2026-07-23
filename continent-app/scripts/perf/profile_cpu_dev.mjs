// CPU-profile the synthetic 25k load against the DEV server so function
// names survive. The synthetic dataset is streamed from a sidecar server via
// a request-URL rewrite (the page still thinks it fetched /app_data.json).
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SYNTH = path.join(os.tmpdir(), 'carta-perf', 'synthetic_app_data.json');
const DATA_PORT = 4175;
const DEV_PORT = 4176;
const BASE = `http://localhost:${DEV_PORT}`;
const require = createRequire(path.join(APP, 'package.json'));
const { chromium } = require('playwright');

const dataServer = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  fs.createReadStream(SYNTH).pipe(res);
});
await new Promise((r) => dataServer.listen(DATA_PORT, r));

const dev = spawn('npx.cmd', ['vite', '--port', String(DEV_PORT), '--strictPort'], {
  cwd: APP, shell: true, stdio: 'ignore',
});
const up = async () => {
  for (let i = 0; i < 120; i += 1) {
    try { const r = await fetch(BASE); if (r.ok) return true; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};
if (!(await up())) { dev.kill(); throw new Error('dev server never came up'); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem('continent.guestMode.v1', '1'));
await page.route('**/app_data.json', (route) => route.continue({ url: `http://localhost:${DATA_PORT}/app_data.json` }));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.start');

const t0 = Date.now();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.locator('.result-row').first().waitFor({ timeout: 240000 });
console.log(`dev load-to-rows: ${Date.now() - t0} ms (dev build, slower than prod; use for attribution only)`);

const { profile } = await cdp.send('Profiler.stop');
await browser.close();
dev.kill();
dataServer.close();

const nodesById = new Map(profile.nodes.map((n) => [n.id, n]));
const selfMs = new Map();
const interval = (profile.endTime - profile.startTime) / profile.samples.length / 1000;
for (const id of profile.samples) {
  const n = nodesById.get(id);
  if (!n) continue;
  const cf = n.callFrame;
  const url = (cf.url || '').split('/').slice(-2).join('/').split('?')[0];
  const key = `${cf.functionName || '(anonymous)'} @ ${url}:${cf.lineNumber + 1}`;
  selfMs.set(key, (selfMs.get(key) || 0) + interval);
}
const top = [...selfMs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
console.log(`total sampled: ${Math.round(profile.samples.length * interval)} ms`);
for (const [k, ms] of top) console.log(`${String(Math.round(ms)).padStart(6)} ms  ${k}`);
