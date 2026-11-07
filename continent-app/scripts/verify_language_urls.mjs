#!/usr/bin/env node
/**
 * verify_language_urls.mjs (T1212, ROADMAP I12): the language prefix in a real
 * browser, on a built app.
 *
 *   node scripts/verify_language_urls.mjs [--dist ../.fastbuild]
 *
 * Serves the build like Pages does for a language address (a file when there
 * is one, else the app shell, which is what the Function answers under /nl/*
 * when no prerendered page exists) and loads six addresses in Chromium. For
 * each it checks the language the app runs in (<html lang>) and the address
 * the router leaves in the bar (and, for a content address, the boot hash it
 * wrote under the same prefix). Exit 1 on any miss.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const i = argv.indexOf('--dist');
const DIST = path.resolve(APP, i >= 0 ? argv[i + 1] : '../.fastbuild');
const PORT = 4473;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

async function readFirst(rel) {
  for (const root of [DIST, path.join(APP, 'public')]) {
    const file = path.join(root, rel);
    if (!file.startsWith(root)) return null;
    try { if ((await fs.stat(file)).isFile()) return { file, body: await fs.readFile(file) }; } catch { /* next root */ }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const hit = pathname !== '/' && /\.[a-z0-9]{1,8}$/i.test(pathname) ? await readFirst(decodeURIComponent(pathname).replace(/^\/+/, '')) : null;
  if (hit) {
    res.writeHead(200, { 'content-type': TYPES[path.extname(hit.file)] || 'application/octet-stream' });
    res.end(hit.body);
    return;
  }
  if (/\.[a-z0-9]{1,8}$/i.test(pathname)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(await fs.readFile(path.join(DIST, 'index.html')));
});

const CASES = [
  { name: 'Dutch root', url: '/nl/', lang: 'nl', path: '/nl/' },
  { name: 'Italian root without slash', url: '/it', lang: 'it', path: '/it/' },
  { name: 'German trail address', url: '/de/spain/trails/176172-estels-del-sud', lang: 'de', path: '/de/', hash: /trail=176172/ },
  { name: 'English root, English browser', url: '/', lang: 'en', path: '/' },
  { name: 'English root, French browser', url: '/', locale: 'fr-FR', lang: 'fr', path: '/fr/' },
  { name: 'Prefix beats a stored choice', url: '/es/', stored: 'nl', lang: 'es', path: '/es/' },
];

let failed = 0;
await fs.access(path.join(DIST, 'index.html')).catch(() => { console.error(`no build at ${DIST}; run the fast build first`); process.exit(1); });
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const c of CASES) {
    const ctx = await browser.newContext({ locale: c.locale || 'en-US' });
    if (c.stored) await ctx.addInitScript((v) => { try { localStorage.setItem('continent.lang.v1', v); } catch { /* none */ } }, c.stored);
    // Every address the app writes, so a boot hash that a reader consumes at once is still seen.
    await ctx.addInitScript(() => {
      window.__addr = [];
      const rs = history.replaceState.bind(history);
      history.replaceState = (st, t, u) => { if (u != null) window.__addr.push(String(u)); return rs(st, t, u); };
    });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}${c.url}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction((l) => document.documentElement.lang === l, c.lang, { timeout: 15000 }).catch(() => {});
    const got = await page.evaluate(() => ({ lang: document.documentElement.lang, path: location.pathname, hash: location.hash, addr: window.__addr || [] }));
    // A trail address becomes the boot hash under the same prefix (pathBoot.js) before the reader opens it.
    const ok = got.lang === c.lang && got.path === c.path
      && (!c.hash || got.addr.some((u) => u.startsWith(c.path) && c.hash.test(u)));
    if (!ok) failed += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${c.name}: ${c.url} -> lang ${got.lang}, address ${got.path}${got.hash}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `\n${failed} of ${CASES.length} failed` : `\nall ${CASES.length} language addresses route`);
process.exit(failed ? 1 : 0);
