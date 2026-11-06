// T1106 (H13): errors stay local. SectionBoundary catches a render error,
// shows one short message with a retry, and clears on retry or a new resetKey.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true } });
test.after(() => vite.close());
const load = async () => {
  const [{ default: React }, server, bnd, seed] = await Promise.all([
    import('react'), import('react-dom/server'),
    vite.ssrLoadModule('/src/components/ErrorBoundary.jsx'), vite.ssrLoadModule('/src/lib/seedError.js'),
  ]);
  return { React, ...server, ...bnd, ...seed };
};

test('seeded error helper: named, wildcard, cleared', async () => {
  const { seedError, clearSeededErrors, isSeeded, maybeThrowSeeded } = await load();
  assert.equal(isSeeded('card-a'), false);
  seedError('card-a');
  assert.equal(isSeeded('card-a'), true);
  assert.equal(isSeeded('card-b'), false);
  assert.throws(() => maybeThrowSeeded('card-a'), /Seeded test error/);
  clearSeededErrors();
  assert.doesNotThrow(() => maybeThrowSeeded('card-a'));
  seedError('*');
  assert.equal(isSeeded('anything'), true);
  clearSeededErrors();
});

test('a caught error renders the local message with a retry, siblings untouched', async () => {
  const { React, renderToStaticMarkup, SectionBoundary } = await load();
  const b = new SectionBoundary({ name: 'explore', children: null });
  b.state = SectionBoundary.getDerivedStateFromError(new Error('boom'));
  const html = renderToStaticMarkup(b.render());
  assert.match(html, /data-crash-section="explore"/);
  assert.match(html, /This part could not load/);
  assert.match(html, /Try again/);
  assert.doesNotMatch(html, /boom/, 'the raw error never reaches the traveller');
  assert.doesNotMatch(html, /crash-screen/);
  const card = new SectionBoundary({ name: 'c', compact: true });
  card.state = { error: new Error('x') };
  assert.match(renderToStaticMarkup(card.render()), /is-compact[\s\S]*This card could not load/);
  // sibling cards render normally
  const ok = renderToStaticMarkup(React.createElement(SectionBoundary, { name: 'other' }, React.createElement('p', null, 'fine')));
  assert.match(ok, /<p>fine<\/p>/);
});

test('retry clears the error; a stale chunk error is rethrown for the top guard', async () => {
  const { SectionBoundary } = await load();
  const b = new SectionBoundary({ name: 'x' });
  let state = { error: new Error('boom') };
  b.setState = (s) => { state = { ...state, ...s }; };
  b.retry();
  assert.equal(state.error, null);
  const stale = new SectionBoundary({ name: 'x' });
  stale.state = { error: new Error('Failed to fetch dynamically imported module') };
  assert.throws(() => stale.render(), /dynamically imported/);
});

test('every main screen in App.jsx is wrapped in a named boundary', () => {
  const src = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  for (const n of ['home', 'explore', 'places', 'trip', 'day', 'planstart', 'pricing']) {
    assert.ok(src.includes(`<SectionBoundary name="${n}">`), `${n} is not wrapped`);
  }
  assert.equal((src.match(/<SectionBoundary /g) || []).length, (src.match(/<\/SectionBoundary>/g) || []).length);
});
