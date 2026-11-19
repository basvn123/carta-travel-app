/**
 * aiConfig: GENERATED from continent-app/config/ai_models.json by
 * continent-app/scripts/ai/gen_ai_config.mjs. Do not edit by hand: change the
 * config and run the script. Two byte-identical copies (supabase/functions/
 * _shared and continent-app/functions/_lib); aiConfig.test.mjs fails when
 * either differs from the config.
 */

/** Live Gemini chain (plan-day, suggest-city, parse-booking): pinned ids, no -latest alias. */
export const GEMINI_LIVE_CHAIN = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite"
];

/** Batch chain; pipeline/ai_gateway.py GEMINI_CHAIN must equal it. */
export const GEMINI_BATCH_CHAIN = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite"
];

/** USD per million tokens. cachedIn null: priced as normal input. verified false: E-R3, not the vendor page. */
export const PRICE_USD_PER_M = {
  "gemini-3.5-flash-lite": {
    "in": 0.3,
    "out": 2.5,
    "cachedIn": 0.03,
    "verified": true
  },
  "gemini-3.1-flash-lite": {
    "in": 0.25,
    "out": 1.5,
    "cachedIn": null,
    "verified": false
  },
  "gemini-3.6-flash": {
    "in": 0.75,
    "out": 3.75,
    "cachedIn": null,
    "verified": false
  }
};

/** A model not in the table: the dearest known, so the estimate errs high. */
export const DEFAULT_PRICE = {
  "in": 0.75,
  "out": 3.75,
  "cachedIn": null,
  "verified": false
};

/** Grounded search: USD per query at the paid rate (the free monthly queries are a month-level discount). */
export const GROUNDING_USD_PER_QUERY = 0.014;
export const GROUNDING_FREE_QUERIES_PER_MONTH = 5000;

/** Workers AI paid price per 1,000 Neurons. */
export const USD_PER_1000_NEURONS = 0.011;

/** Thinking levels each pinned model accepts. */
export const THINKING_LEVELS = {
  "gemini-3.5-flash-lite": [
    "minimal",
    "low",
    "medium",
    "high"
  ],
  "gemini-3.1-flash-lite": [
    "minimal",
    "low",
    "medium",
    "high"
  ],
  "gemini-3.6-flash": [
    "minimal",
    "low",
    "medium",
    "high"
  ]
};

/** The thinking level each feature asks for (null: the model's default). */
export const THINKING_BY_FEATURE = {
  "plan-day": "minimal",
  "suggest-city": "minimal",
  "parse-booking": "minimal",
  "ask": null,
  "eval-judge": null
};

/** Capacity rules (QUOTA-005, S3). */
export const AI_CAPACITY = {
  "globalDailyCapDefault": 200,
  "cacheHitsCountAgainstGlobal": false,
  "userDailyLimit": {
    "plan": 20,
    "ground": 10
  },
  "breaker": {
    "guestShare": 0.5,
    "freeShare": 1,
    "pass": "never"
  },
  "triggers": [
    {
      "id": "gemini-free-cut",
      "signal": "a day with at least one ai_cap_events row of reason global_cap",
      "k": 3,
      "n": 7,
      "then": "raise AI_GLOBAL_DAILY_CAP in step with the spend it allows (owner: supabase secrets set), after checking the Google Cloud budget alert"
    },
    {
      "id": "ask-workers-paid",
      "signal": "a day with at least 450 Ask answers (the admin panel warning)",
      "k": 5,
      "n": 7,
      "then": "turn on Workers Paid (USD 5 a month per account, lane0-facts 2a) and raise Ask's 9,000-Neuron cap in step"
    }
  ]
};
