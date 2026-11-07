#!/usr/bin/env node
/**
 * The style-src of the CSP (T1090, ROADMAP C5, row T1079-c).
 *
 * The app allows no inline style: style-src is 'self' plus the sha256 of each
 * <style> element the app itself writes, and nothing else. There are two:
 *
 *   PRINT_CSS   src/lib/tripExport.js       the print view's popup document,
 *               which inherits the app's CSP (it is an about:blank window the
 *               app writes into)
 *   STYLE       scripts/prerender/html.mjs  the reading column of a prerendered
 *               page, which the Pages Function serves under the shell's CSP
 *
 * Everything else styles itself from bundled sheets ('self') or through the
 * CSSOM (React style props, MapLibre, element.style), which no style-src
 * governs. A style="" attribute in an HTML string or a new <style> element is
 * refused in the browser; scripts/verify_csp.mjs proves none is left.
 *
 *   node scripts/csp-hashes.mjs            print the expected style-src
 *   node scripts/csp-hashes.mjs --check    exit 1 when public/_headers differs
 *   node scripts/csp-hashes.mjs --write    rewrite the style-src in public/_headers
 *
 * Change either stylesheet and run --write; tests/cspHashes.test.mjs fails
 * until you do. A prerendered page in R2 carries the STYLE of the run that
 * wrote it, so a STYLE change also needs a fresh prerender upload.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HEADERS = path.join(APP, 'public', '_headers');

const sha = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/** The style-src value the sources call for. */
export async function expectedStyleSrc() {
  const { PRINT_CSS } = await import(pathToFileURL(path.join(APP, 'src/lib/tripExport.js')).href);
  const { STYLE } = await import(pathToFileURL(path.join(APP, 'scripts/prerender/html.mjs')).href);
  if (typeof PRINT_CSS !== 'string' || typeof STYLE !== 'string') throw new Error('PRINT_CSS or STYLE is not exported');
  return `'self' ${sha(PRINT_CSS)} ${sha(STYLE)}`;
}

const STYLE_SRC = /(Content-Security-Policy:[^\n]*?\bstyle-src )([^;]*)(;)/;

/** The style-src value public/_headers ships. */
export function shippedStyleSrc(text = fs.readFileSync(HEADERS, 'utf8')) {
  const m = STYLE_SRC.exec(text);
  if (!m) throw new Error('public/_headers has no CSP with a style-src');
  return m[2].trim();
}

async function main() {
  const want = await expectedStyleSrc();
  const mode = process.argv[2];
  if (!mode) { console.log(`style-src ${want}`); return; }
  const text = fs.readFileSync(HEADERS, 'utf8');
  const have = shippedStyleSrc(text);
  if (mode === '--check') {
    if (have === want) { console.log('[csp-hashes] public/_headers style-src is current'); return; }
    console.error(`[csp-hashes] public/_headers style-src is stale.\n  shipped:  ${have}\n  expected: ${want}\nRun: node scripts/csp-hashes.mjs --write`);
    process.exit(1);
  }
  if (mode === '--write') {
    fs.writeFileSync(HEADERS, text.replace(STYLE_SRC, (_, a, _b, c) => `${a}${want}${c}`));
    console.log(`[csp-hashes] wrote style-src ${want}`);
    return;
  }
  console.error('usage: node scripts/csp-hashes.mjs [--check|--write]');
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
