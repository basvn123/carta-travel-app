# AI day plan logic (PLANDAY)

How "Let Carta plan" turns a town, the traveller's answers and Carta's own places into a walking day (or up to 7 days), how a plan is cached, timed and refused, how the town suggester picks day trips, and the rules of the day planner's ideas and storage that sit around it. Main code: `supabase/functions/plan-day/index.ts`, `supabase/functions/plan-day/logic.mjs`, `supabase/functions/suggest-city/`, `supabase/functions/_shared/passes.mjs`, `continent-app/src/planner/aiDayPlan.js`, `continent-app/src/planner/dayPlanStore.js`, `continent-app/src/planner/days/`. HANDBOOK pointer: "### AI day plan (plan-day)", "### AI town suggestions (suggest-city)" and "### Day planner" (docs/HANDBOOK.md). Last verified against the code: 2026-11-07 (T1206).

IDs are catalogue IDs only for now: the `// LOGIC: <ID>` / `# LOGIC: <ID>` tags in code and `scripts/docs/logic_check.py` are the second half of ROADMAP B3 and not yet done. Line numbers are as of 2026-11-06 and will drift; the constant name is the stable handle.

The allowance itself (tiers, `ai_consume`, the shared daily ceiling, refunds in SQL) is in `quotas-paywall.md` (QUOTA). Tests named `continent-app/scripts/ai/test_*.mjs` are the `check('...')` harnesses run by `npm run test:quota` or by hand, not by `npm test`.

## Rules

### PLANDAY-001 Who may ask for an AI plan
- Decides: whether the traveller gets an AI plan or the built-in planner.
- Rule: plan-day and suggest-city need a signed-in user (401 `auth`); without `GEMINI_API_KEY` they answer 503 `no_ai`; without Supabase config the client answers `no_auth_config`, a chunk that does not load is `network`, and an undeployed function (404 or gateway `NOT_FOUND`) is read as `no_ai`.
- Constant: `supabase/functions/plan-day/index.ts:116` and `:106` (the `no_ai` refusal from `modelAccess` in `supabase/functions/_shared/aiModels.mjs:350`); `continent-app/src/planner/aiDayPlan.js:125`
- Test: no test

### PLANDAY-002 The deck the client offers
- Decides: which of the town's places the AI may choose from.
- Rule: the day planner's quality-ranked picker deck, minus places the town's other days already hold; 22 places by default, 24 from the chat planner. Places the traveller named are put first whatever their rank or walkability, the cap grows to hold all of them, and each is marked must see. Each candidate carries a description of at most 150 characters. Fewer than 3 candidates is `too_few` before any call.
- Constant: `buildAiCandidates` `limit = 22` in `continent-app/src/planner/aiDayPlan.js:28`; forced slice `aiDayPlan.js:53`; must see `aiDayPlan.js:65`; desc `aiDayPlan.js:67`; `limit: 24` in `continent-app/src/planner/DayPlannerTab.jsx:3273`
- Test: no test

### PLANDAY-003 What the server accepts
- Decides: which answers can shape the plan and how far each can go.
- Rule: group 1 to 20 (default 2); pace relaxed, balanced or packed (default balanced); vibe classic, culture, active, foodie or mix (default mix); free text 280 characters; days 1 to 7; a date only as YYYY-MM-DD, else the current month; up to 12 previous stop names; up to 8 named places, an id kept only if it is a real candidate. The chat profile is whitelisted field by field: steps 1,000 to 40,000, walking 1 to 40 km, up to 3 moods and 5 diet answers, start time only as HH:MM. Bodies over 400,000 bytes are refused.
- Constant: `MAX_BODY` in `supabase/functions/plan-day/index.ts:70` = 400000; clamps `index.ts:121` to `:207`
- Test: no test

### PLANDAY-004 Candidate clean-up on the server
- Decides: which offered places survive to the prompt.
- Rule: only the first 28 candidates are read; ids cut to 8 characters, duplicates and rows without a name or coordinates dropped; rating clamped 0 to 10 (default 5); visit time clamped 5 to 360 minutes (default 40); name 90 and description 150 characters. Fewer than 3 left is 400 `too_few`.
- Constant: `sanitizeCandidates` in `supabase/functions/plan-day/logic.mjs:45` (slice 28 at `:49`); `index.ts:139`
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "candidates: keeps valid, drops empty-name/dupe/no-coords"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "candidates: dwell clamped sane"

### PLANDAY-005 Prompt trim
- Decides: which candidates the model actually reads.
- Rule: keep every must-see and named place, then fill up to 30 + 12 per extra day by rating minus 0.15 a km past 5 km from the day's centre (the stay, else the mean of the candidates), ties by id; strip the description from every place that is not must-see or named. `PROMPT_TRIM=false` sends the whole deck.
- Constant: `selectCandidates` in `supabase/functions/plan-day/logic.mjs:128` (`limit = 30`, penalty `:135`); `dayCentroid` in `logic.mjs:80`; `limit: 30 + 12 * (days - 1)` in `index.ts:239`
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "trim: caps at the limit"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "trim: a mustSee candidate is never dropped, however low its rating"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "trim: deterministic even when the input list order changes"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "centroid: prefers the stay when one is given"

### PLANDAY-006 Two free changes to a plan
- Decides: whether "fewer steps" or "more food" costs another plan.
- Rule: a refine with a genuine token (HMAC-SHA256 over user, plan hash, changes spent and expiry, server secret) for this user, under 24 hours old, with fewer than 2 changes spent, spends no unit; each answer carries the next token and `refinesLeft`.
- Constant: `REFINES_FREE` in `supabase/functions/plan-day/logic.mjs:515` = 2; `TOKEN_TTL_MS` in `logic.mjs:516` = 24 h; `index.ts:269` to `:272`
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "refine token: two free changes"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "refine token: an expired token is refused"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "refine token: a spent count still verifies but is not under the cap"

### PLANDAY-007 Quota before cache
- Decides: that a cached plan still counts against the allowance.
- Rule: one `plan` unit is consumed before the cache lookup (unless a free refine); a refusal is logged to `ai_cap_events` and answered 429 with `user_cap` or `global_cap`, the tier, cap and used; a quota read error is 503 `quota_check`. A cache hit returns the plan with the units left.
- Constant: `supabase/functions/plan-day/index.ts:273` to `:289`
- Test: no test

### PLANDAY-008 Plan cache key and freshness
- Decides: when two travellers share one generated plan.
- Rule: SHA-256 of: key version 6, days (if over 1), model chain, place, month (the exact date when events are asked), group band 1, 2, 3-4 or 5+, pace, vibe, hills, normalised free text, events, the whole profile (walking km rounded; steps / 1350 when only steps), named places, normalised refine, previous stops, language and the sorted trimmed candidate ids; empty fields drop out. A row is served for 7 days and only if it passes the payload guard.
- Constant: `CACHE_KEY_VERSION` in `supabase/functions/plan-day/logic.mjs:591` = 6; `cacheKeyInput` in `logic.mjs:668`; freshness `index.ts:327`
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "cache v6"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "cache key: 6 and 7 share the 5+ band"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "cache key: events mode keys on the exact date"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "cache key: the same walking budget from a different steps figure does not fork"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "cache: one day and three days are different questions"

### PLANDAY-009 Model chain
- Decides: which Gemini model writes the plan.
- Rule: default `gemini-flash-lite-latest`, `gemini-3.5-flash-lite`, `gemini-flash-latest`, `gemini-3.1-flash-lite`; `GEMINI_MODELS` replaces the chain, `GEMINI_MODEL` is moved to the front; at most 6 models, no duplicates.
- Constant: `DEFAULT_MODEL_CHAIN` in `supabase/functions/plan-day/logic.mjs:500` (re-export of `GEMINI_CHAIN` in `supabase/functions/_shared/aiModels.mjs:81`, T1137); `modelChain` in `logic.mjs:500` (defined in `aiModels.mjs:144`)
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "chain: default when nothing is configured"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "chain: never unbounded"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "chain: a lite model leads"

### PLANDAY-010 When to try the next model
- Decides: whether a busy model ends the request or hands over.
- Rule: 429, 404 and 5xx move to the next model; any other status stops with 502 `ai_error`. All models spent with a last 429 is 429 `global_cap`; out of time with no answer is 504 `ai_timeout`.
- Constant: `shouldFallOver` in `supabase/functions/plan-day/logic.mjs:500` (defined in `supabase/functions/_shared/aiModels.mjs:189`); the chain and its refusals in `callModel`, `aiModels.mjs:492` to `:494`; `index.ts:428`
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "fallover: 429 spent budget advances"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "fallover: 400 bad request stops the chain"

### PLANDAY-011 Time budget
- Decides: how long the traveller can wait for a plan.
- Rule: one 80 s budget for the chain; the first model gets up to 40 s, later ones up to 25 s, never more than what is left; under 8 s left stops the chain.
- Constant: `AI_TIME_BUDGET_MS` = 80000, `AI_FIRST_ATTEMPT_MS` = 40000, `AI_LATER_ATTEMPT_MS` = 25000, `AI_MIN_ATTEMPT_MS` = 8000 in `supabase/functions/plan-day/logic.mjs:575` to `:578` (values from `AI_FEATURES['plan-day']` in `supabase/functions/_shared/aiModels.mjs:112`)
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "budget: first model gets 40 s"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "budget: too little left stops the chain"

### PLANDAY-012 Generation settings
- Decides: how varied and how long a plan can be.
- Rule: structured JSON output (`RESPONSE_SCHEMA`: summary, stops with id, name, arrive, dwellMin, why, inCatalog, isEvent); temperature 0.25, 0.45 for a refine so it differs; 8192 output tokens; a prompt over the guard's limit is 400 `too_big`.
- Constant: `RESPONSE_SCHEMA` in `supabase/functions/plan-day/prompt.mjs` (the `schema` fragment of `prompts/plan-day/v1.md`, T1140); `index.ts:422` and `:426`; `too_big` `index.ts:375`; `LIMITS.planPromptChars` in `supabase/functions/_shared/aiGuard.mjs:49` = 60000
- Test: no test

### PLANDAY-013 What the prompt asks for
- Decides: the shape of the day the model proposes.
- Rule: catalogue ids only; relaxed 3 or 4 stops, balanced 5 or 6, packed 7 or 8 (several days: about 4, 5 or 7 a day, strongest first); start at the traveller's start time or 09:30 and finish by 18:00; June to August puts indoor stops 13:00 to 16:00; a group of 5 or more gets the large-group note; named places must all appear; a profile line only for each answer given; output in the traveller's language with no em or en dashes.
- Constant: `buildPrompt` in `supabase/functions/plan-day/prompt.mjs`; the text is the registry prompt `prompts/plan-day/v1.md` (fragments `pace.relaxed`, `pace.balanced`, `pace.packed`, `oneDay`, `multiDay`; T1140)
- Test: no test

### PLANDAY-014 Events beside the day
- Decides: whether festivals or markets show next to the plan.
- Rule: with "events" ticked the prompt asks for at most two events as non-catalogue stops; events come back listed beside the day (at most 2), never routed; an event without in-area coordinates carries none.
- Constant: `index.ts:450` to `:457`; `maxExternal = 3, maxKmFromCentre = 60` in `supabase/functions/plan-day/logic.mjs:162`
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "events: near event kept and flagged"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "events: far event kept unmapped, never pinned"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "events: catalogue stops never flagged as events"

### PLANDAY-015 Live search costs a grounded unit on top
- Decides: whether the events search runs live and what it spends.
- Rule: only when events are asked, `AI_ENABLE_GROUNDING` is not false and a `ground` unit can be consumed; it is spent in addition to the `plan` unit. Otherwise the plan runs ungrounded and says why: `off`, `tier` (free has no grounded units) or `cap` (a paid allowance spent, logged).
- Constant: `supabase/functions/plan-day/index.ts:388` to `:409`
- Test: no test

### PLANDAY-016 Stops are checked against the deck
- Decides: which proposed stops the traveller sees.
- Rule: a stop must carry an id from the trimmed deck the model saw; its name and coordinates come from Carta; duplicates and invented ids are dropped; visit time clamped 10 to 360 (default 40); at most 10 a day, 40 in all; non-catalogue stops other than events are dropped. Fewer than 2 stops left is 502 `ai_bad_output`.
- Constant: `sanitizeAiStops` in `supabase/functions/plan-day/logic.mjs:161`; `maxStops: Math.min(40, 10 * days)` in `index.ts:448`; `index.ts:453` to `:458`
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "ai stops: catalogue ids resolved to our data"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "ai stops: duplicate id dropped"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "ai stops: hallucinated id dropped"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "ai stops: catalogue coords are ours"

### PLANDAY-017 Reordering a one-day plan
- Decides: whether the server changes the model's order of stops.
- Rule: with 3 or more stops, a 2-opt route (seeded nearest-neighbour from the stay) replaces the model's order only when it is over 12 percent and over 400 m shorter.
- Constant: `twoOptOrder` in `supabase/functions/plan-day/logic.mjs:245`; `logic.mjs:407`
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "schedule: bad order re-optimized"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "schedule: good order left alone"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "2-opt: shorter than crossed path"

### PLANDAY-018 Walking budget and long legs
- Decides: which stops are cut because the day cannot be walked.
- Rule: budget = the traveller's walking answer or 12 km (at least 1); no leg over max(6.5 km, budget / 2); the largest group of stops that keeps every leg and the total inside those limits survives, in the model's order (ties: shorter path); the cut count is reported as `farDropped`.
- Constant: `DEFAULT_MAX_WALK_KM` in `supabase/functions/plan-day/logic.mjs:359` = 12; `MAX_LEG_KM` in `logic.mjs:366` = 6.5; leg cap `logic.mjs:428`; `walkableSubset` in `logic.mjs:302`
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "budget: a scattered deck never becomes an 80 km walk"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "budget: maxWalkKm is honoured"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "budget: the walkable cluster survives its outliers"

### PLANDAY-019 The stay as walking start
- Decides: whether the walk to the first stop counts against the day.
- Rule: the stay starts the walk only when it is within 2.5 km of a stop; further out the first hop is a ride, not costed (`fromStay` false).
- Constant: `STAY_WALK_MAX_KM` in `supabase/functions/plan-day/logic.mjs:370` = 2.5
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "stay: a distant stay is not walked"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "stay: a stay round the corner still starts the walk"

### PLANDAY-020 Arrival times
- Decides: the times on each stop and when the day ends.
- Rule: the day starts at the traveller's start time or 09:30; walking at 4.5 km/h, 3.8 km/h for a group of 5 or more; a 75-minute lunch after the first stop that ends at or after 12:30; the clock is not wrapped past 24:00.
- Constant: `scheduleDay` defaults `dayStartMin = 9 * 60 + 30, lunchMin = 75` in `supabase/functions/plan-day/logic.mjs:394`; speed `logic.mjs:432`; lunch `logic.mjs:446`
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "schedule: starts at/after 09:30"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "schedule: lunch inserted"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "schedule: big group ends later"
- Test: `continent-app/scripts/ai/test_plan_logic.mjs` :: "clock: a day past midnight reads past 24h, not wrapped"

### PLANDAY-021 Several days and the too-few rule
- Decides: when a plan is refused as not walkable, and what several days cost.
- Rule: one unit buys up to 7 days; for several days the server returns the chosen stops untimed and the app splits and routes them. A one-day plan with fewer than 2 timed stops is 400 `too_few`.
- Constant: `supabase/functions/plan-day/index.ts:148`, `:463` and `:478`
- Test: no test

### PLANDAY-022 A failure gives the unit back
- Decides: that an outage on Carta's side never costs the traveller a plan.
- Rule: every failure after the quota step refunds each unit spent (`plan`, and `ground` when spent); a free refine spent nothing.
- Constant: `failed` in `supabase/functions/plan-day/index.ts:363`; `refund` in `supabase/functions/_shared/passes.mjs:93`
- Test: no test

### PLANDAY-023 What the app does with a failure
- Decides: whether the traveller sees "try again", the Pass, or the built-in planner.
- Rule: `ai_busy`, `ai_timeout`, `ai_error`, `network` and `ai_bad_output` offer a retry; only `user_cap` offers the Pass (`global_cap` is Carta's own ceiling); an answer without stops is `ai_bad_output`; every failure is reported to the edge error log first.
- Constant: `RETRYABLE` in `continent-app/src/planner/AiDayPlanModal.jsx:32`, `continent-app/src/planner/days/AutoPlanBar.jsx:12`, `continent-app/src/planner/days/DayBotChat.jsx:30`; `UPSELL_CODES` in `AiDayPlanModal.jsx:43`; `aiDayPlan.js:132`
- Test: no test

### PLANDAY-024 Let Carta plan them
- Decides: how a whole trip's days are planned at once.
- Rule: days are planned one by one; a failure stops the run and says how far it got; "resume" is offered after a stop or a retryable failure, the Trip Pass only after `user_cap`; a town with too few places left for another day is counted as skipped.
- Constant: `AutoPlanBar` in `continent-app/src/planner/days/AutoPlanBar.jsx:21`
- Test: no test

### PLANDAY-025 Filling the chat planner's days
- Decides: how many places each day gets when the AI chose fewer.
- Rule: per day 3 places for a morning or afternoon, 6 for a long day into the evening, else 5; missing places are filled from the deck in rank order, skipping those already chosen.
- Constant: `perDay` in `continent-app/src/planner/days/useDayChatAi.js:195`
- Test: no test

### PLANDAY-026 Mapping the plan back into the planner
- Decides: which AI stops become the day's numbered pins.
- Rule: a stop becomes an assignment only if its index exists in the town's items with coordinates and is not already used; non-catalogue stops are kept as extras (visit 45 minutes when none given), without a pin when they have no coordinates.
- Constant: `splitAiPlan` in `continent-app/src/planner/aiDayPlan.js:180`; default dwell `aiDayPlan.js:195`
- Test: no test

### PLANDAY-027 Day plans on the device
- Decides: where day plans live and which copy wins across devices.
- Rule: plans in `carta.dayplans.v1` (guests included), a legacy one-town plan read as one stop of at least 1 day; each local write stamps the plan in `carta.dayplan.meta.v1` for newest-wins sync, writes from the account do not; deleting a plan removes its picks, answers, extras and documents.
- Constant: `STANDALONE_KEY` and `META_KEY` in `continent-app/src/planner/dayPlanStore.js:27` to `:28`; `migrate` in `dayPlanStore.js:117`; `deleteStandalonePlan` in `dayPlanStore.js:164`
- Test: no test

### PLANDAY-028 Town suggester candidates
- Decides: which towns the AI may suggest for a day trip.
- Rule: catalogue towns within 300 km of the stay, gateways left out, top rated first, at most 150, then 120 sent; the server reads at most 150 with 6 tags each, free text 160 characters, up to 8 known interests; fewer than 3 is 400 `too_few`.
- Constant: `SUGGEST_TOWN_KM` = 300 and `SUGGEST_TOWN_CAP` = 150 in `continent-app/src/planner/days/useDayChatAi.js:150` to `:151`; `buildCityCandidates` `limit = 120` in `continent-app/src/planner/aiCitySuggest.js:20`; `sanitizeTownCandidates` in `supabase/functions/suggest-city/logic.mjs:19`; `supabase/functions/suggest-city/index.ts:176` to `:181`
- Test: `continent-app/scripts/ai/test_suggest_city_logic.mjs` :: "candidates: keeps valid, drops empty id/name/dupe"
- Test: `continent-app/scripts/ai/test_suggest_city_logic.mjs` :: "candidates: tags capped and cleaned"

### PLANDAY-029 Town suggester: grounded or not, and what it spends
- Decides: whether a traveller gets live discoveries beyond the catalogue.
- Rule: grounded when `AI_ENABLE_CITY_GROUNDING` is not false and the traveller has a `ground` unit left; then one `ground` unit is spent, else one `plan` unit. A lost race for the `ground` unit falls back to a `plan` unit, ungrounded. A failure refunds the unit actually spent.
- Constant: `supabase/functions/suggest-city/index.ts:189` to `:232`
- Test: no test

### PLANDAY-030 Town suggestions are checked
- Decides: which suggested towns are shown.
- Rule: at most 5; a catalogue pick must be a real candidate id (Carta's name and country); a web discovery needs coordinates within 400 km of the stay; duplicates dropped.
- Constant: `sanitizeSuggestions` `maxSuggestions = 5, maxKmFromStay = 400` in `supabase/functions/suggest-city/logic.mjs:45`
- Test: `continent-app/scripts/ai/test_suggest_city_logic.mjs` :: "suggestions: far web discovery dropped"
- Test: `continent-app/scripts/ai/test_suggest_city_logic.mjs` :: "suggestions: hallucinated catalogue id dropped"
- Test: `continent-app/scripts/ai/test_suggest_city_logic.mjs` :: "suggestions: capped at maxSuggestions"

### PLANDAY-031 Town suggester cache and model
- Decides: when two travellers share one set of suggestions.
- Rule: key over the chain, the stay rounded to 0.01 degree (about 1 km), focus, sorted interests, lower-cased free text, language, the grounded flag and sorted candidate ids; served for 7 days; temperature 0.3.
- Constant: `cacheKeyInput` in `supabase/functions/suggest-city/logic.mjs:80` (rounding `:86`); `supabase/functions/suggest-city/index.ts:244` and `:274`
- Test: `continent-app/scripts/ai/test_suggest_city_logic.mjs` :: "cache key: nearby stay points share a key (rounded)"
- Test: `continent-app/scripts/ai/test_suggest_city_logic.mjs` :: "cache key: grounding toggle changes the key"

### PLANDAY-032 How far a town's ideas reach
- Decides: which trails, beaches, lakes, peaks and cycle routes show as ideas for a stop.
- Rule: within 30 km for trails, 40 km for beaches and lakes, 50 km for peaks, 40 km for cycle routes, measured from the stay.
- Constant: `REACH_KM` in `continent-app/src/planner/days/useStopIdeas.js:20` = { trail 30, water 40, peak 50, cycle 40 }
- Test: no test

### PLANDAY-033 Idea sections for a stop
- Decides: which idea sections a stop shows and in what order.
- Rule: section order follows the trip's main goal (culture, relax, outdoors, food, or none); at most 12 rows a section; "can't miss" is the must-sees when there are 2 or more, else the top 6 sights; with children or slow walkers, trails and cycle routes over 400 m of climb or 10 km and peaks of 1500 m or more without a lift are left out; empty sections go last, marked empty.
- Constant: `ORDER` and `SECTION_MAX` = 12 in `continent-app/src/planner/days/dayIdeas.js:26` and `:34`; `buildIdeaSections` in `dayIdeas.js:57`
- Test: `continent-app/tests/dayIdeas.test.mjs` :: "sections follow the goal; the party trims long climbs; empty sections stay last"

### PLANDAY-034 The trip's money in parts
- Decides: the total, the figure a person a day and the split shown on the days overview.
- Rule: receipt lines folded into getting there, stays, food and getting around; a line still to price counts as nothing and is reported missing; per person a day = per person / nights; parts of 0 are hidden.
- Constant: `PART_OF` and `PARTS` in `continent-app/src/planner/days/tripCost.js:11` to `:17`; `costOverview` in `tripCost.js:24`
- Test: `continent-app/tests/dayIdeas.test.mjs` :: "the trip's money in parts, read from priceTrip"

## Rules with no test

PLANDAY-001, PLANDAY-002, PLANDAY-003, PLANDAY-007, PLANDAY-012, PLANDAY-013, PLANDAY-015, PLANDAY-021, PLANDAY-022, PLANDAY-023, PLANDAY-024, PLANDAY-025, PLANDAY-026, PLANDAY-027, PLANDAY-029, PLANDAY-032

## HANDBOOK disagreements

| HANDBOOK says | Code does | Where |
|---|---|---|
| "With 'events' ticked and a `ground` unit left, Google Search grounding runs and up to 2 festivals or markets come back" | The prompt asks for up to 2 events whenever events are ticked, grounded or not; grounding only adds live search, and a grounded plan spends a `ground` unit on top of the `plan` unit | `supabase/functions/plan-day/prompt.mjs:106`, `supabase/functions/plan-day/index.ts:392` to `:409` |
| "large groups (5+) walk about 20 percent slower" | The prompt says 20 percent; the scheduler that sets the times walks 3.8 km/h against 4.5 km/h, about 16 percent slower | `supabase/functions/plan-day/logic.mjs:432` |
| "a leg over `MAX_LEG_KM = 6.5` ... is dropped" | The leg cap is max(6.5 km, walking budget / 2), so a traveller with a budget over 13 km gets longer legs | `supabase/functions/plan-day/logic.mjs:428` |
| Re-timing starts the day per the Day planner's 09:30 | plan-day starts at the traveller's own start time when the profile gives one | `supabase/functions/plan-day/index.ts:471` |
| The client maps `ai_busy` among the failure codes | The server never sends `ai_busy`; an exhausted chain on 429 answers `global_cap`. Only the `?aiplanmock=busy3` seam produces `ai_busy` | `supabase/functions/_shared/aiModels.mjs:493` (passed on at `supabase/functions/plan-day/index.ts:428`), `continent-app/src/planner/aiDayPlan.js:86` |
