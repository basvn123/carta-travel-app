// G5: the opening screen (HANDBOOK "Opening screen"). The splash is static
// markup in index.html run by src/lib/bootSplash.js; these pin the parts that
// break quietly: the prerender's root, the CSP, the colours, the words and
// when it lifts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { liftDelay, INTRO_MS } from '../src/lib/bootSplash.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../src/styles/01-tokens.css', import.meta.url), 'utf8');
const token = (name) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(tokens)?.[1].toLowerCase();

test('the prerender still finds an empty root, and the splash sits after it', () => {
  const root = html.indexOf('<div id="root"></div>');
  const splash = html.indexOf('<div id="boot-splash"');
  assert.ok(root > 0, 'prerenderShell.spliceShell needs <div id="root"></div> exactly');
  assert.ok(splash > root, 'the splash is a sibling after #root, so the CSS can hide it on a prerendered page');
});

test('the splash markup carries no inline style (the CSP allows none)', () => {
  const start = html.indexOf('<div id="boot-splash"');
  const block = html.slice(start, html.indexOf('<script', start));
  assert.doesNotMatch(block, /\sstyle=/);
});

test('the browser bar starts deep umber and goes back to the stone ground', () => {
  const meta = /<meta name="theme-color" content="(#[0-9a-f]{6})" data-app="(#[0-9a-f]{6})"/i.exec(html);
  assert.ok(meta, 'theme-color meta with data-app');
  assert.equal(meta[1].toLowerCase(), token('umber-800'));
  assert.equal(meta[2].toLowerCase(), token('neutral-50'));
});

test('the slow line exists in all six languages, without dashes', () => {
  for (const lang of ['en', 'nl', 'de', 'fr', 'es', 'it']) {
    const src = readFileSync(new URL(`../src/i18n/${lang}.js`, import.meta.url), 'utf8');
    const m = /'shell\.slowLoad':\s*'([^']+)'/.exec(src);
    assert.ok(m, `${lang}: shell.slowLoad`);
    assert.doesNotMatch(m[1], /[–—]/, `${lang}: no en or em dash`);
  }
});

test('the opening plays out once per session, never under automation', () => {
  // First open: wait for what is left of the opening.
  assert.equal(liftDelay({ now: 400, shownAt: 100, firstVisit: true, automated: false }), INTRO_MS - 300);
  // The opening is over: lift at once.
  assert.equal(liftDelay({ now: 5000, shownAt: 100, firstVisit: true, automated: false }), 0);
  // Later in the session, or a test browser: never wait for the animation.
  assert.equal(liftDelay({ now: 400, shownAt: 100, firstVisit: false, automated: false }), 0);
  assert.equal(liftDelay({ now: 400, shownAt: 100, firstVisit: true, automated: true }), 0);
  // Never longer than the opening itself, whatever the clocks say.
  assert.ok(liftDelay({ now: 0, shownAt: 9000, firstVisit: true, automated: false }) <= INTRO_MS);
});
