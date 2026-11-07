// T1206 (register row T1138-j, ROADMAP E7): the monthly switch-trigger check
// reads admin_ai_calls_weekly's output and K12 users from one JSON file and
// says which trigger of config/ai_models.json fired. A fixture month, no
// network, no Supabase.
// Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkTriggers, costPerDay, featuresOf, CONFIG_PATH } from '../scripts/ai/check_switch_triggers.mjs';

const FIXTURE = fileURLToPath(new URL('../scripts/ai/fixtures/switch_triggers_sample.json', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../scripts/ai/check_switch_triggers.mjs', import.meta.url));
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const input = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));

test('every trigger in the config is one the checker knows how to read', () => {
  const known = new Set(['cost_eur_per_day', 'mau', 'grounded_searches_per_month', 'price_change', 'quality_drop_points']);
  for (const t of config.switch.triggers) assert.ok(known.has(t.metric), `${t.id}: unknown metric ${t.metric}`);
  assert.ok(config.switch.triggers.some((t) => t.metric === 'cost_eur_per_day'));
  assert.ok(config.switch.triggers.some((t) => t.metric === 'mau'));
});

test('cost per day is the weeks summed per feature, in EUR, over the days since the first week', () => {
  const c = costPerDay(input.weekly, { asOf: '2026-12-07', fx: 0.87 });
  assert.equal(c.days, 56);
  assert.ok(Math.abs(c.eur['plan-day'] - (132 * 0.87) / 56) < 1e-9);
  assert.ok(Math.abs(c.eur.ask - (9 * 0.87) / 56) < 1e-9);
  assert.equal(costPerDay(null, { asOf: '2026-12-07', fx: 1 }), null);
  assert.deepEqual(featuresOf('all live'), ['ask', 'plan-day', 'suggest-city', 'parse-booking']);
  assert.deepEqual(featuresOf('plan-day,suggest-city'), ['plan-day', 'suggest-city']);
});

test('the fixture month fires the Ask users trigger and the plan-day cost trigger, nothing else', () => {
  const rows = checkTriggers(config, input, { asOf: '2026-12-07' });
  const r = byId(rows);
  assert.equal(rows.length, config.switch.triggers.length);
  assert.deepEqual(rows.filter((x) => x.state === 'fired').map((x) => x.id).sort(), ['ask-free-neurons', 'plan-day-open-model']);
  assert.equal(r['plan-day-open-model'].measured, 2.05);
  assert.equal(r['ask-cost'].state, 'not fired');
  assert.equal(r.gpu.state, 'not fired');
  assert.match(r['plan-day-open-model'].note, /56 of the 60 days/);
  assert.equal(r['gemini-price'].state, 'manual');
  assert.equal(r['quality-drop'].state, 'manual');
});

test('a missing number is no data, never a zero that passes', () => {
  const rows = byId(checkTriggers(config, {}, { asOf: '2026-12-07' }));
  for (const id of ['ask-free-neurons', 'ask-cost', 'plan-day-open-model', 'grounding']) assert.equal(rows[id].state, 'no data', id);
});

test('the command prints the fired triggers and exits 0; bad input exits 2', () => {
  const ok = spawnSync(process.execPath, [SCRIPT, '--input', FIXTURE], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /2 fired: ask-free-neurons, plan-day-open-model/);
  const js = spawnSync(process.execPath, [SCRIPT, '--input', FIXTURE, '--json'], { encoding: 'utf8' });
  assert.equal(JSON.parse(js.stdout).rows.length, config.switch.triggers.length);
  assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status, 2);
});
