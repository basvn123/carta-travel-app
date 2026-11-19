#!/usr/bin/env node
/**
 * gen_ai_config.mjs: the one way the live AI code learns its models, prices,
 * thinking levels and capacity rules (ai fix program wave 1, ROADMAP E3, E4,
 * E7; S1 to S3 of the gemini-rag decision).
 *
 * continent-app/config/ai_models.json is the source of truth. The Edge
 * Functions cannot read it at run time (Supabase bundles only
 * supabase/functions), so this script writes the parts the code needs into
 * one plain ES module, twice, byte-identical:
 *
 *   supabase/functions/_shared/aiConfig.mjs     (plan-day, suggest-city, parse-booking)
 *   continent-app/functions/_lib/aiConfig.mjs   (Ask's Pages Function)
 *
 *   node continent-app/scripts/ai/gen_ai_config.mjs          write both files
 *   node continent-app/scripts/ai/gen_ai_config.mjs --check  exit 1 when either is stale
 *
 * continent-app/tests/aiConfig.test.mjs fails when the files, the config or
 * the copies disagree, so a price or chain edited in only one place cannot ship.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../..');
export const CONFIG_PATH = path.join(ROOT, 'continent-app/config/ai_models.json');
export const OUTPUTS = [
  path.join(ROOT, 'supabase/functions/_shared/aiConfig.mjs'),
  path.join(ROOT, 'continent-app/functions/_lib/aiConfig.mjs'),
];

const js = (v) => JSON.stringify(v, null, 2);

/** The module text for a parsed ai_models.json. Pure. */
export function renderAiConfig(cfg) {
  const models = cfg.prices.models;
  const prices = {};
  const thinkingLevels = {};
  for (const [id, p] of Object.entries(models)) {
    prices[id] = { in: p.in, out: p.out, cachedIn: p.cached_in ?? null, verified: !!p.verified };
    thinkingLevels[id] = [...(p.thinking_levels || [])];
  }
  const dearest = {
    in: Math.max(...Object.values(prices).map((p) => p.in)),
    out: Math.max(...Object.values(prices).map((p) => p.out)),
    cachedIn: null,
    verified: false,
  };
  const g = cfg.prices.grounding;
  const c = cfg.capacity;
  const capacity = {
    globalDailyCapDefault: c.global_daily_cap_default,
    cacheHitsCountAgainstGlobal: !!c.cache_hits_count_against_global,
    userDailyLimit: { plan: c.user_daily_limit.plan, ground: c.user_daily_limit.ground },
    breaker: { guestShare: c.breaker.guest_share, freeShare: c.breaker.free_share, pass: c.breaker.pass },
    triggers: c.triggers.map((t) => ({ id: t.id, signal: t.signal, k: t.k, n: t.n, then: t.then })),
  };
  return `/**
 * aiConfig: GENERATED from continent-app/config/ai_models.json by
 * continent-app/scripts/ai/gen_ai_config.mjs. Do not edit by hand: change the
 * config and run the script. Two byte-identical copies (supabase/functions/
 * _shared and continent-app/functions/_lib); aiConfig.test.mjs fails when
 * either differs from the config.
 */

/** Live Gemini chain (plan-day, suggest-city, parse-booking): pinned ids, no -latest alias. */
export const GEMINI_LIVE_CHAIN = ${js(cfg.live_chain.gemini)};

/** Batch chain; pipeline/ai_gateway.py GEMINI_CHAIN must equal it. */
export const GEMINI_BATCH_CHAIN = ${js(cfg.batch_chain.gemini)};

/** USD per million tokens. cachedIn null: priced as normal input. verified false: E-R3, not the vendor page. */
export const PRICE_USD_PER_M = ${js(prices)};

/** A model not in the table: the dearest known, so the estimate errs high. */
export const DEFAULT_PRICE = ${js(dearest)};

/** Grounded search: USD per query at the paid rate (the free monthly queries are a month-level discount). */
export const GROUNDING_USD_PER_QUERY = ${g.usd_per_1000_queries / 1000};
export const GROUNDING_FREE_QUERIES_PER_MONTH = ${g.free_queries_per_month};

/** Workers AI Neurons per million tokens: in, out. */
export const NEURON_PRICES = ${js(Object.fromEntries(Object.entries(cfg.prices.workers_ai_neurons_per_m).filter(([k]) => k !== 'source')))};

/** Workers AI paid price per 1,000 Neurons. */
export const USD_PER_1000_NEURONS = ${cfg.prices.workers_ai_usd_per_1000_neurons};

/** Thinking levels each pinned model accepts. */
export const THINKING_LEVELS = ${js(thinkingLevels)};

/** The thinking level each feature asks for (null: the model's default). */
export const THINKING_BY_FEATURE = ${js(cfg.thinking.per_feature)};

/** Capacity rules (QUOTA-005, S3). */
export const AI_CAPACITY = ${js(capacity)};
`;
}

function main() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const text = renderAiConfig(cfg);
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const out of OUTPUTS) {
    // Line endings are git's business (a Windows checkout has CRLF): compare the text.
    const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8').replace(/\r\n/g, '\n') : null;
    if (cur === text) continue;
    if (check) { stale += 1; console.error(`stale: ${path.relative(ROOT, out)}`); } else { fs.writeFileSync(out, text, 'utf8'); console.log(`wrote ${path.relative(ROOT, out)}`); }
  }
  if (check && stale) process.exit(1);
  if (check) console.log('aiConfig is up to date');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
