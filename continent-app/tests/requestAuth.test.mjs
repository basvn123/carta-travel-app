// G12 (explore polish, owner point 9): "Sign in on the Together pane does
// nothing" reproduced on a build without VITE_SUPABASE_*: the dialog only
// renders when auth is configured, so the press was swallowed. Every sign-in
// door now goes through App's one requestAuth(mode), which says "sign-in is
// off" instead, and always sets the mode. The browser half is
// scripts/verify_together_signin.mjs.
// Run: npm test (continent-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it'];

test('requestAuth answers an unconfigured build and always sets the mode', () => {
  const app = src('App.jsx');
  const body = app.match(/const requestAuth = useCallback\(\(mode\) => \{([\s\S]*?)\}, \[/);
  assert.ok(body, 'requestAuth(mode) is defined in App.jsx');
  assert.match(body[1], /if \(!authConfigured\) \{ setAuthOffNote\(true\); return; \}/);
  assert.match(body[1], /setAuthModalMode\(typeof mode === 'string' \? mode : 'signin'\)/);
  assert.match(app, /\{authOffNote && \(\s*<div className="confirm-toast" role="status"/);
  assert.match(app, /onSignIn=\{\(\) => requestAuth\('signin'\)\}/);
});

test('Together, Account and My trips sign in through requestAuth only', () => {
  const ov = src('shell/AppOverlays.jsx');
  const doors = ov.match(/onOpenAuth=\{[^}]*\}\}?/g) || [];
  assert.equal(doors.length, 3, 'three onOpenAuth doors');
  for (const d of doors) assert.match(d, /requestAuth\('signin'\)/);
  assert.doesNotMatch(ov, /setAuthModalMode/, 'no door sets the mode on its own');
});

test('auth.off is in all six catalogues, without dashes or a euro sign', () => {
  for (const l of LANGS) {
    const m = src(`i18n/${l}.js`).match(/["']auth\.off["']: (["'])(.*?)\1,/);
    assert.ok(m, `${l} has auth.off`);
    assert.doesNotMatch(m[2], /[–—€]/, `${l} auth.off`);
  }
});
