// S4 funnel events (ai fix program wave 1): one definition, the two new Ask
// steps land in funnel_step, and migration 078 accepts them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AI_FUNNEL, OWN_STEPS, aiFunnel, resetAiFunnelForTests } from '../src/lib/ai/funnel.js';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('the funnel names exactly the six events of the decision', () => {
  assert.deepEqual(Object.keys(AI_FUNNEL).sort(),
    ['ask_answer', 'ask_to_plan', 'checkout_click', 'partner_click', 'paywall_shown', 'plan_started']);
});

test('the two Ask steps are sent once per page load as funnel_step, anything else is dropped', async () => {
  resetAiFunnelForTests();
  const calls = [];
  const rpc = async (fn, args) => { calls.push([fn, args]); };
  assert.equal(aiFunnel('ask_answer', { rpc }), true);
  assert.equal(aiFunnel('ask_answer', { rpc }), false);
  assert.equal(aiFunnel('ask_to_plan', { rpc }), true);
  assert.equal(aiFunnel('plan_started', { rpc }), false);
  assert.equal(aiFunnel('nope', { rpc }), false);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls, [['funnel_step', { p_step: 'ask_answer' }], ['funnel_step', { p_step: 'ask_to_plan' }]]);
});

test('a failing backend never throws', () => {
  resetAiFunnelForTests();
  assert.doesNotThrow(() => aiFunnel('ask_answer', { rpc: () => Promise.reject(new Error('down')) }));
  resetAiFunnelForTests();
  assert.doesNotThrow(() => aiFunnel('ask_answer', { rpc: () => { throw new Error('sync'); } }));
});

test('the older four counters still exist where AI_FUNNEL says', () => {
  assert.match(read('continent-app/src/lib/funnelCounts.js'), /'plan_started'/);
  const pay = read('continent-app/src/lib/paywallEvents.js');
  assert.match(pay, /'shown'/);
  assert.match(pay, /'checkout'/);
  assert.match(read('continent-app/src/lib/launchEvents.js'), /'affiliate_click'/);
});

test('migration 078 lets funnel_step and funnel_counts take the Ask steps, and its down file takes them back', () => {
  const up = read('supabase/migrations/078_ai_hygiene.sql');
  const down = read('supabase/migrations/078_ai_hygiene_down.sql');
  for (const s of OWN_STEPS) assert.ok((up.match(new RegExp(`'${s}'`, 'g')) || []).length >= 2, s);
  assert.match(down, /delete from public\.funnel_counts where step in \('ask_answer', 'ask_to_plan'\)/);
});

test('Ask fires the steps: an answer in the chat, the plan door in the chat and the search panel', () => {
  const chat = read('continent-app/src/browse/ask/AskChat.jsx');
  assert.match(chat, /aiFunnel\('ask_answer'\)/);
  assert.match(chat, /aiFunnel\('ask_to_plan'\)/);
  assert.match(read('continent-app/src/browse/AskSearchFull.jsx'), /aiFunnel\('ask_to_plan'\)/);
});
