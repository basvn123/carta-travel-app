// G12 (decision.md step 10): the header's Together pill wears the people
// glyph and its word; signed out, a Sign in pill opens the dialog through
// App's one requestAuth; signed in, the avatar stays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it'];

test('Together: the people glyph, the visible word and a named door', () => {
  const src = read('src/components/AppHeader.jsx');
  const door = src.slice(src.indexOf('function TogetherDoor'), src.indexOf('export function AppHeader'));
  assert.match(door, /<HouseIcon\.people size=\{20\} \/>/);
  assert.doesNotMatch(door, /TogetherIcon|rings/);
  assert.match(door, /className="tg-door-word"[^>]*>\{t\('tg\.title'\)\}/);
  assert.match(door, /title=\{t\('tg\.doorAria'\)\}/);
  assert.match(door, /hdr-pill tg-door/);
});

test('signed out: a Sign in pill that calls requestAuth; signed in: the avatar', () => {
  const src = read('src/components/AppHeader.jsx');
  const acc = src.slice(src.indexOf('function AccountLink'), src.indexOf('function TogetherDoor'));
  assert.match(acc, /if \(user \|\| !onSignIn\) return door;/);
  // Signed out the account icon stays beside Sign in: a guest's way to Account
  // (Explore rails, 2026-11-18: the two share one split pill, the face first).
  assert.match(acc, /\{door\}\s*<Button[^>]*signin-pill/);
  assert.match(acc, /t\('header\.accountTitle'\)/);
  assert.match(acc, /onClick=\{\(\) => onSignIn\('signin'\)\}/);
  assert.match(acc, /\{t\('auth\.signIn'\)\}/);
  assert.match(acc, /accountInitial\(user\)/);
  assert.match(read('src/App.jsx'), /<AppHeader[\s\S]*?onSignIn=\{requestAuth\}/);
});

test('44 px pills; the word hides only from 769 to 1099 px and, signed out, under 400 px', () => {
  const css = read('src/styles/90-together.css');
  assert.match(css, /\.hdr-pill \{[^}]*min-height: var\(--tap\);/);
  assert.match(css, /@media \(min-width: 769px\) and \(max-width: 1099px\) \{[^@]*\.tg-door-word \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 399px\) \{[^@]*\.tg-door-word \{ display: none; \}/);
});

test('the door strings in six languages', () => {
  for (const l of LANGS) {
    const src = read(`src/i18n/${l}.js`);
    assert.match(src, /['"]tg\.doorAria['"]: /, l);
    assert.match(src, /['"]auth\.signIn['"]: /, l);
  }
});
