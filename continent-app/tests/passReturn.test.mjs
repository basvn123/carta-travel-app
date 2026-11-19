// V-5 (logic wave 0a, ROADMAP D13/quotas): Stripe's ?pass=ok leaves the
// address once read, and the poll that waits for the webhook does not depend
// on the address or on the `user` effect that may re-run.
// Run: node --test tests/passReturn.test.mjs (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/hooks/useEntitlement.js', import.meta.url), 'utf8');

// The hook module imports JSX (AuthContext), so the pure helper is lifted
// out of the source and run on its own.
function lift(name) {
  const start = src.indexOf(`export function ${name}(`);
  const body = src.slice(start, src.indexOf('\n}', start) + 2).replace('export ', '');
  return new Function(`${body}\nreturn ${name};`)();
}

test('the address loses pass and keeps everything else', () => {
  const strip = lift('addressWithoutPass');
  assert.equal(strip({ pathname: '/', search: '?pass=ok', hash: '' }), '/');
  assert.equal(strip({ pathname: '/nl/', search: '?tab=pricing&pass=cancel&cf=IT', hash: '#dest=BRU' }), '/nl/?tab=pricing&cf=IT#dest=BRU');
  assert.equal(strip({ pathname: '/', search: '?tab=explore', hash: '' }), null);
});

test('the poll reads the boot value, and the strip is its own one-shot effect', () => {
  const poll = src.slice(src.indexOf("Returning from Stripe"), src.indexOf('}, [user, refresh]);'));
  assert.match(poll, /passReturn\(\) !== 'ok'/);
  assert.doesNotMatch(poll, /location\.search|replaceState/, 'the poll effect neither reads nor strips the address');
  const strip = src.slice(src.indexOf('const stripped = useRef(false);'), src.indexOf('return { ...state, refresh };'));
  assert.match(strip, /stripped\.current = true;\s*passReturn\(\);/, 'the boot value is read before the strip');
  assert.match(strip, /replaceState/);
  assert.match(strip, /\}, \[\]\);/, 'no user dependency: a user change cannot re-run or cancel it');
  const urlState = readFileSync(new URL('../src/lib/urlState.js', import.meta.url), 'utf8');
  const own = /const OWN_KEYS = \[([^\]]*)\]/.exec(urlState)[1];
  assert.doesNotMatch(own, /'pass'/);
});
