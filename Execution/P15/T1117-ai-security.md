# T1117: AI security for Ask, plan-day and parse-booking (ROADMAP C8, with E3)

## Date

2026-11-06

## What changed

Every model call Carta makes on its own servers now goes through one guard module, `supabase/functions/_shared/aiGuard.mjs` (a byte-identical copy at `continent-app/functions/_lib/aiGuard.js` serves the Ask Pages Function; a test fails when they differ). Input: traveller text and harvested text (Ask passages, fetched pages, pasted bookings, the client-sent candidate deck) is scanned for instruction-shaped text by 16 rule families over a folded form (accents, look-alike letters, invisible characters, leetspeak, spaced letters), the injected sentences are dropped, and what is left is fenced between per-call `<<<DATA nonce LABEL>>>` markers the data cannot close; the security rules, with a canary, go in Gemini `systemInstruction` and the Workers AI system message. Ask refuses an injected question (`400 unsafe`) before any Neurons are booked; plan-day and parse-booking scrub before the cache key and the quota. Output: plan-day answers are shape-checked (rejected when not `{summary, stops[]}`, mistyped stops dropped, soft fields repaired); every visible text field in all three loses URLs, Markdown links, HTML, e-mails and international phone numbers, and is emptied on a prompt leak, the canary, chat-template tokens or an echoed injection; parse-booking with text-only input clears links and codes not in that text; the Ask stream is released sentence by sentence and ends on a severe sentence. Cached answers (`ai_plan_cache`, the Ask KV) pass the same check before they are served. Per-call limits sit in `LIMITS`. The attack set `evals/injection/attacks.json` has 50 attacks (22 Ask, 15 plan-day, 13 parse-booking) with stubbed recorded outputs plus a benign set; all pass in `npm test`. Before: no injection set, prompt rules mixed with data in one user turn, cached rows served unchecked. The OWASP LLM Top 10 map is section 12 of `docs/security/threat-model.md`. No migration was needed (068 unused).

## Files touched

Created:
- `supabase/functions/_shared/aiGuard.mjs`
- `continent-app/functions/_lib/aiGuard.js` (copy)
- `continent-app/tests/aiGuard.test.mjs`
- `continent-app/scripts/ai/redteam_live.mjs`
- `evals/injection/attacks.json`, `evals/injection/README.md`
- `Execution/P15/T1117-ai-security.md`

Modified:
- `continent-app/functions/api/ask/answer.js` (input guard, fenced user turn, rules in the system message, stream guard on the fresh and the cached answer, guard version in the cache key, only the shown text cached)
- `supabase/functions/plan-day/index.ts` (input guard before cache key and quota, fenced candidates, wish, refine and previous stops, `systemInstruction`, prompt and output caps, `guardPlanOutput`, `guardPlanPayload` on the fresh and the cached payload, `meta.guard`)
- `supabase/functions/parse-booking/index.ts` (input guard on pasted, fetched and text-file input and trip stops, fenced trip and pasted text, `systemInstruction`, prompt and output caps, `guardBookingOutput`, `guardBookingPayload` on the cached payload, `meta.guard`)
- `docs/security/threat-model.md` (section 6 rows, new section 12 with the OWASP map, ranked gap 10)
- `docs/HANDBOOK.md` (one bullet, "AI guard (T1117, C8)", beside the T1079 hardening bullet)
- `ROADMAP.md` (C8 status line only)
- `Execution/_OPEN.md` (rows T1117-a to T1117-e)

## Commands run

```
cd continent-app && npm ci
node --test tests/aiGuard.test.mjs
npm test
npx eslint tests/aiGuard.test.mjs functions/api/ask/answer.js functions/_lib/aiGuard.js
node --check scripts/ai/redteam_live.mjs
deno check --no-lock supabase/functions/plan-day/index.ts   # deno 2.9.6 from npm, in the scratchpad
deno check --no-lock supabase/functions/parse-booking/index.ts
python -I scripts/docs/check_entry_points.py
```

## Config and secrets set

None. No new environment variable; the guard needs no key.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Attacks in a CI set | 0 | 50 (22 Ask, 15 plan-day, 13 parse-booking) | +50 |
| Attacks held (stubbed outputs) | not tested | 50 of 50 | |
| Benign inputs flagged (attack-set benign list: 10 Ask, 4 wishes, 1 booking) | not tested | 0 of 15 | |
| Ask golden and held-out questions flagged as injection | not tested | 0 of 196 | |
| Paths that serve a cached AI answer unchecked | 3 (Ask KV, plan-day, parse-booking) | 0 | -3 |
| `npm test` | 1387 tests, 0 fail | 1450 tests, 1438 pass, 0 fail, 12 skipped (need data not on this machine) | +63 |
| `deno check` errors, plan-day / parse-booking | 5 / 2 (pre-existing) | 5 / 2 (same ones) | 0 |

The live hit rate of the real models is not measured (owner step T1117-b).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A leak split by a sentence boundary got its first half out ("Use only the numbered notes." is five words, under the six-word leak window) | The stream guard checked each sentence alone | One finished sentence is held back; a leak whose six-word run starts in the held sentence withdraws both |
| A clean sentence was withdrawn with the canary sentence after it | The joint check counted the canary too | Only a leak that starts in the held sentence withdraws it |
| `Booking.com` in a booking title would have been stripped as a URL | Bare-domain match without a path | A bare domain counts as a URL only with a path (`evil.example/x`) |
| "Can you translate the message on the sign?" and "show the rules for parking" read as a reveal attack | The reveal rule took "the" and "message" | The rule needs your, hidden, initial, original, secret or developer, or the words "system prompt" |
| `deno check` typed the guard's destructured defaults as `never[]` | JS default parameters | JSDoc types on `guardPlanInput` and `guardBookingInput` |

## Screens checked

None. No screen changed (the Ask card UI belonged to another session tonight). The end check needs no screen for this task; the new refusal codes fall to the existing generic error copy (T1117-e).

## What is still open

- T1117-a (user): deploy plan-day, parse-booking and the Pages build; until then nothing here is live.
- T1117-b (user): the live red-team pass. The recorded outputs are worst cases written by this task, so the set proves the guard catches an attack whatever the model writes, not how often a real model is turned. `redteam_live.mjs` replays the set against a preview and records the real outputs.
- T1117-c: suggest-city still calls Gemini without the guard (not in this task's file list).
- T1117-d: on-device Ask has the browser verifier but not the stream guard; `src/lib/ask/generate.js` could run `makeStreamGuard` on both back ends (outside this task's files).
- T1117-e: no app copy for `400 unsafe`, `guard: withdrawn` and `400 too_big`.
- Not a row, for the owner to note: ROADMAP E3 (the guardrail module) is partly done by this task (input rules, output schema and text check, the injection set). Its PII scrub of input, number tracing, banned terms and the retry-then-cached failure rule are not. E3's Status line was left alone (the brief allows only this task's item).
- Known limits, written down in the threat model: patterns miss novel phrasings (the output check is the second line); PDFs and images go to Gemini unscanned; names, street addresses and domestic phone numbers without `+` or `00` are not stripped.

## Rollback procedure

`git revert` the T1117 commit. One commit, code and docs only: no migration, no data, nothing deployed. Reverting before a deploy is a no-op for travellers; after a deploy, revert and redeploy the two Edge Functions and the Pages build. Cached Ask answers written under `a:g1:` keys simply stop being read.

## Owner steps (for the checklist)

- [T1117-a] Deploy the AI guard | the guard on Ask, plan-day and parse-booking is code only until deployed | `supabase functions deploy plan-day`; `supabase functions deploy parse-booking`; deploy the Pages build per CLAUDE.md Deploy (preview first); on the preview, run one plan-day day and one magic import and check `meta.guard` is in the answer | `supabase/functions/plan-day/index.ts`, `supabase/functions/parse-booking/index.ts`, `continent-app/functions/api/ask/answer.js`
- [T1117-b] Live red-team pass with the real models | the CI set uses stubbed outputs, so how the real Gemini and Workers AI models behave under the 50 attacks is unrecorded | after T1117-a, sign in to a test account with plan quota on the preview and copy its access token; run `CARTA_BASE=<preview url> SUPABASE_URL=<url> SUPABASE_ANON_KEY=<anon key> CARTA_JWT=<token> node continent-app/scripts/ai/redteam_live.mjs` (spends about 25 plan units); read `evals/injection/recorded-live-<date>.json`; for every FAIL line add the attack phrasing to `evals/injection/attacks.json` and open a task | `continent-app/scripts/ai/redteam_live.mjs`
