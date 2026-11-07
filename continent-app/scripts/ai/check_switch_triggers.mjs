#!/usr/bin/env node
/**
 * The monthly switch-trigger check (T1206, register row T1138-j, ROADMAP E7).
 *
 * continent-app/config/ai_models.json `switch.triggers` says when a live AI
 * feature should move (a cost per day or a monthly-user count past a line).
 * This script reads the numbers and prints which trigger fired. It decides
 * nothing and switches nothing: a fired trigger is the owner's review
 * (docs/ai/model-strategy.md, "review": monthly, first Monday).
 *
 *   node scripts/ai/check_switch_triggers.mjs --input <telemetry.json> [--as-of 2026-12-07] [--json]
 *
 * The input is one JSON file the owner fills once a month:
 *   {
 *     "weekly": <the jsonb that public.admin_ai_calls_weekly(8) returns (migration 071):
 *               { since, weeks: [{ week, features: [{ feature, calls, costUsd, ... }] }], costByDay }>,
 *     "mau": <monthly active users from K12 (one number for Carta)>,
 *     "groundedSearchesPerMonth": <optional: grounded Gemini prompts in the last 30 days>
 *   }
 * Get "weekly" from the admin AI calls panel (AiCalls.jsx reads the same
 * call) or the SQL editor as an admin. A missing number is reported as
 * "no data", never as zero.
 *
 * Cost per day of a feature = its costUsd over every week the input holds,
 * in EUR (config fx_eur_per_usd), divided by the days from `since` to the
 * as-of date. admin_ai_calls_weekly gives at most 8 weeks (56 days), so a
 * 60 day trigger is checked on the shorter window and says so.
 * Exit 0 always (a report, not a gate); 2 on bad input.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_PATH = path.resolve(HERE, '../../config/ai_models.json');

/** The features a trigger's `feature` names. */
export const LIVE = ['ask', 'plan-day', 'suggest-city', 'parse-booking'];
export function featuresOf(name) {
  const n = String(name || '').trim();
  if (n === 'all live') return LIVE;
  if (n === 'all gemini') return ['plan-day', 'suggest-city', 'parse-booking'];
  if (n === 'any') return null;
  return n.split(',').map((s) => s.trim()).filter(Boolean);
}

const DAY = 86_400_000;

/** EUR per day per feature from admin_ai_calls_weekly's output. */
export function costPerDay(weekly, { asOf, fx }) {
  if (!weekly || !Array.isArray(weekly.weeks) || !weekly.since) return null;
  const end = Date.parse(asOf);
  const days = Math.max(1, Math.round((end - Date.parse(weekly.since)) / DAY) + 1);
  const usd = {};
  for (const w of weekly.weeks) {
    for (const f of w.features || []) usd[f.feature] = (usd[f.feature] || 0) + (Number(f.costUsd) || 0);
  }
  const eur = Object.fromEntries(Object.entries(usd).map(([k, v]) => [k, (v * fx) / days]));
  return { days, eur };
}

const cmp = (op, a, b) => (op === '>=' ? a >= b : op === '>' ? a > b : op === '<=' ? a <= b : op === '<' ? a < b : false);

/**
 * Every trigger with its state: fired (true or false), the value checked,
 * or state 'no data' / 'manual' (a trigger this script cannot measure).
 */
export function checkTriggers(config, input, { asOf = new Date().toISOString().slice(0, 10) } = {}) {
  const fx = Number(config.fx_eur_per_usd) || 1;
  const cost = costPerDay(input.weekly, { asOf, fx });
  const out = [];
  for (const t of config.switch?.triggers || []) {
    const row = { id: t.id, feature: t.feature, metric: t.metric, op: t.op, value: t.value, action: t.action, owner: t.owner };
    if (t.metric === 'cost_eur_per_day') {
      const feats = featuresOf(t.feature);
      if (!cost || !feats) { out.push({ ...row, state: 'no data', note: 'no admin_ai_calls_weekly output in the input' }); continue; }
      const v = feats.reduce((s, f) => s + (cost.eur[f] || 0), 0);
      const short = t.window_days && cost.days < t.window_days ? `; ${cost.days} of the ${t.window_days} days the trigger asks for` : '';
      out.push({ ...row, state: cmp(t.op, v, t.value) ? 'fired' : 'not fired', measured: Math.round(v * 100) / 100, note: `EUR a day over ${cost.days} days, ${feats.join(' + ')}${short}` });
    } else if (t.metric === 'mau') {
      const v = Number.isFinite(input.mau) ? input.mau : null;
      if (v == null) { out.push({ ...row, state: 'no data', note: 'no mau (K12) in the input' }); continue; }
      out.push({ ...row, state: cmp(t.op, v, t.value) ? 'fired' : 'not fired', measured: v, note: 'monthly active users (K12)' });
    } else if (t.metric === 'grounded_searches_per_month') {
      const v = Number.isFinite(input.groundedSearchesPerMonth) ? input.groundedSearchesPerMonth : null;
      if (v == null) { out.push({ ...row, state: 'no data', note: 'no groundedSearchesPerMonth in the input' }); continue; }
      out.push({ ...row, state: cmp(t.op, v, t.value) ? 'fired' : 'not fired', measured: v, note: 'grounded prompts, last 30 days' });
    } else {
      out.push({ ...row, state: 'manual', note: 'not measured from telemetry: check by hand (price pages, eval scores)' });
    }
  }
  return out;
}

function main(argv) {
  const arg = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
  const file = arg('--input');
  if (!file) {
    console.error('usage: node scripts/ai/check_switch_triggers.mjs --input <telemetry.json> [--as-of YYYY-MM-DD] [--json]');
    return 2;
  }
  let input;
  try {
    input = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`cannot read ${file}: ${e.message}`);
    return 2;
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const asOf = arg('--as-of') || input.asOf || new Date().toISOString().slice(0, 10);
  const rows = checkTriggers(config, input, { asOf });
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ asOf, rows }, null, 1));
    return 0;
  }
  console.log(`Switch triggers, as of ${asOf} (config/ai_models.json, ${rows.length} triggers)\n`);
  for (const r of rows) {
    const m = r.measured != null ? ` measured ${r.measured} ${r.op} ${r.value}` : '';
    console.log(`${r.state.toUpperCase().padEnd(9)} ${r.id} (${r.feature}, ${r.metric})${m}: ${r.note}`);
    if (r.state === 'fired') console.log(`          action: ${r.action} [${r.owner}]`);
  }
  const fired = rows.filter((r) => r.state === 'fired');
  console.log(`\n${fired.length} fired${fired.length ? `: ${fired.map((r) => r.id).join(', ')}` : ''}. A fired trigger is a review for the owner, not a switch.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
