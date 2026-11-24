# Owner steps: Carta's AI (Gemini, Workers AI, Ask)

Everything about Carta's AI that only the owner can do: live facts, dashboard checks, keys, labels, live runs, deploys and SQL pastes. Plan: `.work/2026-11-17-ai-north-star/decision.md` (approved 2026-11-17) and the baseline `.work/2026-11-17-gemini-rag/decision.md` S0 to S8; record `docs/decisions/0017-ai-cheapest-layer-first.md`. When a step is done, delete it here and write the answer where the step says (`docs/decisions/0003-open-items-owner-steps-and-roadmap.md`).

## What is known (lane 0 facts, public web, checked 2026-11-17)
Full table with sources: `.work/2026-11-17-ai-north-star/lane0-facts.md` (H = vendor page quoted, M = indirect, L = not found).
- **Workers AI and the EU:** no EU-only inference (Regional Services not supported, H). Cloudflare does not train on Workers AI content and does not keep inputs or outputs after the request (H). The Cloudflare DPA covers "all cloud-based solutions" without naming Workers AI (M). The owner rule T1135-d asks for a DPA, not EU residency.
- **Gemini API and the EU:** not EU-pinned (data "cached in any country", H). EEA travellers may only be served from Paid Services, a Cloud project with billing (H). Vertex `eu` is the only documented EU route (M).
- **Prices:** Workers Paid USD 5 a month (H); Workers AI 10,000 Neurons a day free, then USD 0.011 per 1,000 (H); Gemini 3.5 Flash-Lite USD 0.30 in, 2.50 out (thinking included), 0.03 cached per million (H). 3.1 Flash-Lite and 3.6 Flash prices in `continent-app/config/ai_models.json` `prices` are E-R3 figures marked `verified: false`.
- **Thinking:** `thinking_level` in `generation_config`, values lowercase; 3.5 and 3.1 Flash-Lite and 3.6 Flash accept `minimal` (H). The REST spelling `thinkingConfig.thinkingLevel` was not shown on the page (M): step AI-3 confirms it.
- **Turnstile:** free plan, unlimited verifications, 20 widgets (H); cookie and storage names NOT found (L): step AI-5.
- **AI Gateway:** caching and rate limiting free (H); whether a cache hit uses Neurons is not stated (M).
- **`-latest` aliases:** what `gemini-flash-latest` and `gemini-flash-lite-latest` point to is not published (L). Since wave 1 of the ai fix program no live chain uses them, so this only matters for the `trips` batch job and `GEMINI_MODEL` overrides.

## What wave 1 changed (2026-11-19, branch `p15-fix-ai`)
Live chains pinned to `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite`, with thinking `minimal` on plan-day, suggest-city and parse-booking; the batch chain the same (the `trips` job keeps its chain until step AI-9). Telemetry records thinking, cached and grounded counts and prices them from one table in `ai_models.json`. Cache hits no longer spend `AI_GLOBAL_DAILY_CAP`; a per-user daily limit (20 plans, 10 grounded, the same for every tier) comes first; the shared ceiling then refuses free accounts only, never a Pass holder. Funnel steps `ask_answer` and `ask_to_plan` added. None of it is live until steps AI-1 and AI-2.

## Steps

1. **AI-1 · Apply migration 078** (wave 1; needs nothing else). Opens: telemetry columns, the capacity rule, the two Ask funnel steps. Paste `supabase/migrations/078_ai_hygiene.sql` in the SQL editor, or:
   ```
   supabase db query --linked -f supabase/migrations/078_ai_hygiene.sql
   ```
   Check: `select count(*) from pg_proc where proname = 'ai_consume_v2';` answers 1. Undo: `supabase/migrations/078_ai_hygiene_down.sql` (deletes the Ask funnel counts and any `day_cap` rows; says so in its header). Proven on a throwaway Postgres 18: `PGPORT=<port> PGUSER=postgres node continent-app/scripts/ai/test_ai_capacity.mjs` (37 checks).

2. **AI-2 · Deploy the changed Edge Functions** (after AI-1; the order is safe either way, the functions fall back to the old RPC and the old event row). Opens: pinned chains, thinking minimal, the capacity rule, truthful telemetry.
   ```
   supabase functions deploy plan-day
   supabase functions deploy suggest-city
   supabase functions deploy parse-booking
   ```
   Ask's Pages Function ships with the site (`node scripts/ship.mjs --live`, owner only). Check after a day: `select feature, model, thinking, count(*), sum(tokens_thought) from ai_model_events where kind = 'call' and created_at > now() - interval '1 day' group by 1, 2, 3;`. No row should name a `-latest` model.

3. **AI-3 · Confirm the thinking field with one live call** (S1; lane0 fact 5a). Opens: rubric line "thinking minimal" moves from coded to proven.
   ```
   curl -s -H "x-goog-api-key: $GEMINI_API_KEY" -H "Content-Type: application/json" "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent" -d '{"contents":[{"role":"user","parts":[{"text":"Say ok"}]}],"generationConfig":{"thinkingConfig":{"thinkingLevel":"minimal"}}}' | head -c 600
   ```
   A 200 with `usageMetadata` means the field is right: set `"verified": true` in `ai_models.json` `thinking`. A 400 naming the field: the code already retries without it and the events say `thinking = rejected`; tell a session the error text so it can fix the spelling.

4. **AI-4 · S0 facts (one hour).** Opens: every cost figure quoted outside the research runs (north-star 9.4).
   - The live `AI_GLOBAL_DAILY_CAP`: `supabase secrets list | grep AI_GLOBAL_DAILY_CAP` (absent means the config default, 200).
   - Ask's Neuron use: Cloudflare dashboard, Workers AI, Analytics, last 30 days; and the admin panel's Ask answers per day.
   - The alias targets, one call each:
     ```
     curl -s -H "x-goog-api-key: $GEMINI_API_KEY" https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest
     curl -s -H "x-goog-api-key: $GEMINI_API_KEY" https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest
     ```
   - The Gemini key is on a billed project (Paid Services, required for EEA travellers): `gcloud billing projects describe <PROJECT_ID>` shows `billingEnabled: true`.
   - The prices marked `verified: false` in `ai_models.json` `prices` (3.1 Flash-Lite, 3.6 Flash) against https://aistudio.google.com/docs/pricing, and the Workers Paid fee at https://developers.cloudflare.com/workers/platform/pricing/.
   Write the answers under this step; a session copies them into `ai_models.json` and reruns `node continent-app/scripts/ai/gen_ai_config.mjs`.

5. **AI-5 · Turnstile cookie names** (lane 6, the cookie page). Open the site with Turnstile on a preview, DevTools, Application, Cookies and Local Storage, and list every name Turnstile sets (or read the Turnstile Privacy Addendum). Opens: the cookie page row and lane 6 (A6).

6. **AI-6 · Cloudflare DPA acceptance (T1135-d).** Cloudflare dashboard, Manage Account, Configurations or Legal: confirm the Customer DPA is accepted for the account. Opens lanes 11 (Change this day) and 14 (trip-aware Ask) with the PII scrubber on. If you want EU-only processing instead, say so: those two lanes then use Gemini on Vertex `eu`.

7. **AI-7 · The 200 judge labels** (lane 2, about 3.5 hours; 200 more after launch). The labelling tool comes with wave 2 (A2); its exact command will be written here. Opens: the judge calibration (kappa lower bound) and every gate that leans on a judge.

8. **AI-8 · Key-backed recorded runs** (lanes 2, 3, 13). With `GEMINI_API_KEY` in `supabase/.env.local`, serve plan-day locally and record the eval cases (the header of `record.mjs` has the full recipe):
   ```
   supabase start
   supabase functions serve plan-day --env-file supabase/.env.local
   cd continent-app
   SUPABASE_ANON_KEY=<local anon key> CARTA_JWT=<local user token> node scripts/eval/plan-day/record.mjs --provider gemini --out ../evals/plans/gemini-3.5-flash-lite.json
   node scripts/eval/run.mjs plan-day --plans ../evals/plans/gemini-3.5-flash-lite.json
   ```
   Opens: E-plan and the model swap (A13). Waves 2 and later add the suggest-city and parse-booking recorders here.

9. **AI-9 · The `trips` batch job on Flash-Lite.** Run its golden set on the new chain before it moves (paid, about 40 calls, key needed): `python Trips/carta-unified/carta-unified/pipeline/golden_set.py run --live --model gemini-3.5-flash-lite --model gemini-3.1-flash-lite`, then `golden_set.py diff <run>`. When it passes, a session sets `TRIPS_CHAIN` and `generate_trip.py` `MODEL_CHAIN` to the batch chain.

10. **AI-10 · Capacity triggers** (`ai_models.json` `capacity.triggers`, checked by `aiCapacity.capacityTriggers`):
    - `gemini-free-cut`: `ai_cap_events` rows with reason `global_cap` on 3 of any 7 days. Then raise the ceiling: `supabase secrets set AI_GLOBAL_DAILY_CAP=<n>` after checking the Google Cloud budget alert.
    - `ask-workers-paid`: the 450-a-day Ask warning on 5 of any 7 days. Then turn on Workers Paid (USD 5 a month; confirm the fee first, AI-4) and raise Ask's 9,000-Neuron cap in step.


11. **AI-11 · Verify the any-question labels (G2; about 1 hour).** Opens: the baseline of the any-question eval (`evals/any-question/set.json`, 326 cases) moves from drafted to checked, and gives the kappa between the draft and you. Every case was written and labelled by a Claude Code session offline (`label: "draft"`); a draft is not a fact until you have read a sample.
   1. Make the sample sheet (50 cases, seeded, the same 50 each time): `node continent-app/scripts/eval/any-question-sheet.mjs --out any-question-sample.csv`. One row per case: the question, the language, the previous place for a follow-up, what the draft says a good answer is (`draft_kind`, and the places, country and months it expects), and empty columns `owner_kind` and `note`.
   2. For each row read the question and decide what kind of answer a good Ask answer is: `figure` (a number or table), `places` (a list of places), `note` (a cited note), `door` (a link into the app, a plan, a flight search), `decline-nearest` (Carta says it does not cover it and offers the nearest covered thing) or `refuse`. Leave `owner_kind` empty when you agree with `draft_kind`; write your kind when you do not, and in `note` what is wrong (places, country, months too). Judge the question, not what Carta answers today.
   3. Score it: `node continent-app/scripts/eval/any-question-sheet.mjs --score any-question-sample.csv`. It prints the share of rows you left as drafted and Cohen's kappa between the draft kind and yours, with the 95% interval. Write that line into the Owner notes of this file. A kappa lower bound of at least 0.6 means the drafts can be trusted for the other cases; below that, a session redrafts the types where you disagreed and you read 50 more.
   Check: the score line says n 50. Undo: nothing to undo, the sheet is a separate file; set.json changes only when a session applies your notes (and then flips `label` to `verified` on the rows you read).

12. **AI-12 · E-verify live run (wave 4, A3; status OPEN, not passed).** Opens: shipping the cited-note verifier as the live default and later the figure-free switch (L3). The verifier is in the code, but the non-inferiority of "answer kept (at least one sentence)" and judged task success has not been measured: no recorded written Ask answers exist in the repo. Needs a Gemini key and the paid run. Plan: n about 470 (decision 7.1, q 0.15, margin 5 points; measure q on the first 100 pairs, never below 200).
   1. Record: `GEMINI_API_KEY=... node continent-app/scripts/ask-eval-live.mjs` over the golden 141, the held-out and new cases (it writes the raw answers; the old and new verifier replay on them offline).
   2. Replay both verifiers: `node continent-app/scripts/eval/planted/keep.mjs` shows the paired test on the stand-in; point it at the recorded answers when they exist.
   Check: lower bound of the paired difference above minus 5 points, grounding at least 0.9985, no language wholly below 0. If it fails, change the prompt so the model cites the note it quotes; never loosen the verifier. Stand-in result (not the answer): a model that names the place while citing a row that never names it is dropped almost always (see `.work/2026-11-19-fix-ai-w4/results.md`).
