// Haptics (house style 2026-11, G5): a touch commit vibrates once with the
// right pattern; a mouse, a second call inside 50 ms, the "off" setting and
// reduced motion (with no explicit choice) stay silent. touchFeedback no
// longer vibrates on pointerdown.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const calls = [];
const store = new Map();
let reduced = false;
globalThis.window = { matchMedia: () => ({ matches: reduced }), addEventListener() {} };
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document = { visibilityState: 'visible' };
Object.defineProperty(globalThis, 'navigator', {
  value: { vibrate: (p) => { calls.push(p); return true; }, userAgent: 'Android' },
  configurable: true,
});

const H = await import('../src/lib/haptics.js');

beforeEach(() => {
  calls.length = 0;
  store.clear();
  reduced = false;
});

test('a touch commit vibrates once with the pattern of its kind', () => {
  H._resetHapticsForTest({ input: 'touch' });
  H.haptic('tick');
  H._resetHapticsForTest({ input: 'touch' });
  H.haptic('confirm');
  H._resetHapticsForTest({ input: 'touch' });
  H.haptic('warn');
  assert.deepEqual(calls, [10, [10, 60, 14], [20, 80, 20]]);
});

test('a mouse or a key never vibrates', () => {
  H._resetHapticsForTest({ input: 'mouse' });
  H.haptic('tick');
  H._resetHapticsForTest({ input: 'key' });
  H.haptic('confirm');
  assert.equal(calls.length, 0);
});

test('two commits inside 50 ms give one tick', () => {
  H._resetHapticsForTest({ input: 'touch' });
  H.haptic('tick');
  H.haptic('tick');
  assert.equal(calls.length, 1);
});

test('the setting: off is silent, reduced motion is silent unless the traveller chose on', () => {
  H.setHapticsSetting('off');
  H._resetHapticsForTest({ input: 'touch' });
  H.haptic('tick');
  assert.equal(calls.length, 0);
  H.setHapticsSetting('auto');
  reduced = true;
  H._resetHapticsForTest({ input: 'touch' });
  H.haptic('tick');
  assert.equal(calls.length, 0);
  H.setHapticsSetting('on');
  H._resetHapticsForTest({ input: 'touch' });
  H.haptic('tick');
  assert.equal(calls.length, 1);
  assert.equal(H.hapticsSetting(), 'on');
});

test('available on a vibrating phone; the setting change reaches a listener', () => {
  H._resetHapticsForTest({ input: 'touch' });
  assert.equal(H.hapticsAvailable(), true);
  let seen = null;
  const off = H.onHapticsSetting((v) => { seen = v; });
  H.setHapticsSetting('off');
  off();
  assert.equal(seen, 'off');
});

test('touchFeedback no longer vibrates on pointerdown', () => {
  const src = fs.readFileSync(new URL('../src/lib/touchFeedback.js', import.meta.url), 'utf8');
  assert.ok(!/navigator\.vibrate/.test(src));
  assert.ok(!/addEventListener\('pointerdown'/.test(src));
});

test('no screen vibrates directly: navigator.vibrate lives in haptics.js only', () => {
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.(jsx?|mjs)$/.test(e.name) && !p.endsWith('lib/haptics.js')
        && /navigator\.vibrate\s*\(/.test(fs.readFileSync(p, 'utf8'))) hits.push(p);
    }
  };
  walk(new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  assert.deepEqual(hits, []);
});

// A stand-in element: matches() decides which selector it belongs to.
const el = (kind, { kit = false, disabled = false } = {}) => {
  const self = {
    disabled,
    getAttribute: () => null,
    closest(sel) {
      if (sel.includes('.ui-chip')) return kit ? self : null;
      if (sel.includes('aria-pressed') && kind === 'toggle') return self;
      return null;
    },
  };
  return self;
};

test('a click on a toggle outside the kit commits one tick; kit controls, folds and disabled toggles do not', async () => {
  const { committedToggle } = await import('../src/lib/touchFeedback.js');
  assert.ok(committedToggle(el('toggle')));
  assert.equal(committedToggle(el('toggle', { kit: true })), null);
  assert.equal(committedToggle(el('fold')), null);
  assert.equal(committedToggle(el('toggle', { disabled: true })), null);
  const src = fs.readFileSync(new URL('../src/lib/touchFeedback.js', import.meta.url), 'utf8');
  assert.match(src, /addEventListener\('click'/);
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /aria-expanded/);
});
