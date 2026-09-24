# T040: Trim the plan-day prompt, not the output (Lever 3)

## Task ID

T040

## Date

2026-09-24

## What changed

`plan-day` now caps the candidate list it hands to Gemini at 30 places, ranked by rating and proximity to the day's centroid, and strips the `desc` field from every candidate that is not guaranteed a place in the plan. Two new pure functions in `logic.mjs`, `dayCentroid` and `selectCandidates`, do the work; `index.ts` calls them once, right after the request is sanitized, and everything downstream, the prompt, the model-output validation and the cache key, now runs on the trimmed deck instead of the full one.

The mechanics matter more than the headline number, so read this section before the measurement table.

`dayCentroid` picks the point a walking day actually starts from: the traveller's stay or anchor coordinates when one was given, otherwise the mean of the candidate coordinates. `selectCandidates` then splits the deck in two. Anything `mustSee`, or named by hand through `mustInclude` (`keepIds`), is kept whole and never scored: a place the traveller asked for by name cannot be trimmed away by a ranking that has no idea it was asked for. Everything else is scored as rating minus a distance penalty that only starts to bite past 5 km, sorted, and filled into whatever room is left under the limit of 30. The score is deliberately simple and untuned, because its job is to choose which 30 survive, not to plan the day; sequencing is still entirely the model's and the server-side scheduler's job, unchanged by this task. The function is deterministic: the same candidates, the same centroid and the same `keepIds` always produce the same kept set, because the only inputs are numbers already on each candidate and a fixed id tie-break, never iteration order or randomness. That determinism is why it was safe to fold into the cache key (see below).

`desc` is stripped from every candidate outside the guaranteed set, whether or not the count-based cut removes it. A place that has no chance of being the model's headline recommendation does not need a paragraph to be sequenced correctly.

Three call sites changed to use the trimmed deck (`promptCandidates`) instead of the full one: `buildPrompt` (the actual token saving), `sanitizeAiStops` (a candidate the model was never shown is exactly as unearned as a hallucinated one, and must be dropped the same way, not let through because it happens to still exist in the untrimmed deck), and the cache key.

### The cache key decision T039 asked for

T039 flagged that this task would have to decide, in writing, whether the cache key is computed on the full candidate list or the trimmed one. It is computed on the trimmed list, `promptCandidates`. This is deliberate, not an oversight, and it only holds because `selectCandidates` is provably deterministic: two requests whose full decks differ but whose top-30 trims come out identical are, after this task, asking Gemini the exact same question, so they must share a cache row. Keying on the full deck instead would fork the cache on candidates the model never even saw. This follows the same rule T039's report states for its own normalisation: a distinction may leave the key only when nothing downstream can see it, and nothing downstream of the trim point ever sees the untrimmed deck again in this request.

### The shadow-mode flag

`PROMPT_TRIM` is a new environment variable, read once per request. Unset or any value other than the literal string `false` means the trim runs, which is the default and what should ship. Setting it to `false` restores the untrimmed candidate list everywhere the trim would otherwise apply, so the owner can run a live A/B later by toggling one Supabase secret rather than a deploy. No code path was removed to make this possible; the flag is a single boolean gate around the `selectCandidates` call.

### What this task could not do here

This session has no Supabase access, no Gemini key and no deploy rights. The live A/B, and the 20-real-plan side-by-side quality check the task asks for, cannot be produced from a terminal with no way to call Gemini or read production traffic. What follows is the honest offline substitute: a deterministic implementation with tests, and a token measurement built from the real catalogue and the real, shipped prompt-building code, not from a redrawn approximation of it.

## Files touched

**Root repo, modified:**

- `supabase/functions/plan-day/logic.mjs` (added `dayCentroid`, `selectCandidates`)
- `supabase/functions/plan-day/index.ts` (wired the trim in ahead of `buildPrompt`, `sanitizeAiStops` and the cache key; added the `PROMPT_TRIM` flag)

**Root repo, created:**

- `Execution/P2/T040-prompt-token-trim.md` (this report)

**App repo (`continent-app/`, its own git tree), modified:**

- `scripts/ai/test_plan_logic.mjs` (tests for `selectCandidates` and `dayCentroid`)

**App repo, created:**

- `scripts/ai/measure_prompt_tokens.mjs`

## Commands run

Root repo:

```
git checkout -b p2-prompt-token-trim
git add supabase/functions/plan-day/index.ts supabase/functions/plan-day/logic.mjs
git commit -m "T040: Trim the plan-day prompt to the top-30 candidate deck"
```

App repo:

```
git checkout -b p2-prompt-token-trim
git add scripts/ai/test_plan_logic.mjs scripts/ai/measure_prompt_tokens.mjs
git commit -m "T040: Test the prompt trim and measure its token effect offline"
```

Verification, from `continent-app/`:

```
node scripts/ai/test_plan_logic.mjs
node scripts/ai/test_import_logic.mjs
node scripts/ai/measure_cache_keys.mjs
node scripts/ai/measure_prompt_tokens.mjs
npm run build
npx esbuild ../supabase/functions/plan-day/index.ts --outfile=/dev/null
```

All six passed, re-run once more after this task's session was interrupted and resumed, with identical results both times (the trim and the measurement are deterministic, so this is expected, not merely hoped for). The build finished in 3 minutes 6 seconds with the pre-existing chunk-size warnings only (unrelated to this task; the app already ships large vendor chunks such as `maplibre-gl` and `jspdf`). The esbuild parse of `index.ts` completed with no errors both times.

## Config and secrets set

None yet. `PROMPT_TRIM` is read by the deployed function but nothing sets it; its absence means the trim is ON by default, which is the intended shipped behaviour. Setting it to `false` on the live project is how the owner runs the shadow-mode A/B; see "What is still open."

## Before/after measurements

Measured by `scripts/ai/measure_prompt_tokens.mjs`, which extracts the real `buildPrompt` out of the shipped `supabase/functions/plan-day/index.ts` (via `esbuild`, evaluated fresh each run, never retyped by hand, so it cannot silently drift from what is deployed) and runs it against real POI catalogue data from `continent-app/public/poi/` for 24 cities spread across the shard list. Token counts use characters divided by 4, the estimator OpenAI and Google both publish as a rough rule of thumb for English text; it is not a real tokenizer, and CLAUDE.md's ban on new dependencies rules one out. Because the before and after prompts share all the same surrounding prose and only the candidate JSON block differs, an error in the constant mostly cancels out of the *delta* even where it is off in the absolute count.

Two scenarios, because one number would have been misleading on its own.

**Scenario A, the request as the client sends it today.** `buildAiCandidates` in `src/planner/aiDayPlan.js` already caps the deck at 22 before it ever leaves the browser (`limit = 22`, both call sites in `DayPlannerTab.jsx` use the default). This is what `plan-day` actually receives right now.

**Scenario B, the fuller deck the trim exists to guard.** `sanitizeCandidates` in `logic.mjs` independently caps the server's own intake at 28 (unconditionally, one candidate above the client's cap, and unchanged by this task since it is outside this task's scope). This scenario removes the client's 22-cap on the input, so the deck reaching `selectCandidates` is as large as the server-side pipeline currently ever allows, which is the honest ceiling to measure the trim against.

| Metric | Scenario A (today, cap 22) | Scenario B (server ceiling, cap 28) |
|---|---|---|
| Cities measured | 24 | 24 |
| Mean candidates before trim | 22.0 | 27.8 |
| Mean candidates after trim | 22.0 | 27.8 |
| Mean mustSee share of the deck | 71.4% | 63.9% |
| Mean prompt tokens before (chars/4) | 1,258 | 1,507 |
| Mean prompt tokens after | 1,254 | 1,500 |
| Mean reduction | 0.3% | 0.4% |
| Total tokens before, all 24 cities | 30,194 | 36,168 |
| Total tokens after, all 24 cities | 30,099 | 36,010 |

This is far short of the "roughly halves input tokens" the unit-economics brief and the task prompt both describe, and the honest reason is worth stating plainly rather than smoothing over: on the real catalogue, in the real pipeline as it exists today, this trim barely engages.

Two structural facts explain why, both found while building the measurement, not assumed going in.

First, the candidate-count cut never fires. `selectCandidates`'s limit is 30; `sanitizeCandidates` already hard-caps its own input at 28 candidates, and the client caps its own output at 22 before that. The count-based half of the trim is currently inert, because nothing upstream of it in the shipped pipeline ever hands it more than 28 candidates to cut from. It is not dead code: it is a guard against a client change or a new call site that raises those caps, and `selectCandidates`'s tests and the "Scenario B" measurement both exercise it directly. But on the traffic this app sends today, it removes zero candidates from zero requests.

Second, and this is why the `desc`-strip half barely moves the number either: `desc` is already almost entirely absent from non-mustSee candidates in the catalogue itself. A sampled sweep across the POI shards (run ad hoc during this task, reproducible from `dayDraft.js`'s exports, not itself committed as a script since it is a one-line check rather than a reusable measurement) found 714 mustSee candidates carrying a `desc` against 683 without one, roughly even, but only 61 non-mustSee candidates carrying a `desc` against 642 without one, about 9%. The harvesting pipeline apparently only writes descriptions for the catalogue's own prominent places to begin with, so a candidate that is not mustSee usually had no `desc` to strip in the first place. The strip is correct and costs nothing to keep, it just is not the free win the 6k-token estimate implied, because the token weight was never really sitting there.

Put together: this task ships a defensible, tested, deterministic trim that will earn its keep the moment either cap upstream is raised (a bigger client deck, a future call site that skips the 22-cap, a catalogue enrichment pass that starts writing `desc` more broadly), but on today's actual traffic shape the measured saving is under half a percent, not the ~30 to 50% the unit-economics brief estimated for "the prompt." The brief's ~6k-input-token figure for a plan is also not reproduced here: this measurement's baseline prompt lands around 1.2 to 1.5k estimated tokens for the candidate-list portion alone (excluding the model's own system overhead and the profile/rules text also present in a real request, which this script's fixtures deliberately hold at empty/default to isolate the candidate-list effect). Reconciling that gap, and finding where 6k tokens are actually going if they are, is not something this task's scope covers; it is worth a look before leaning harder on this lever. See "What is still open."

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `execFileSync('npx', ...)` threw `spawnSync npx ENOENT` in `measure_prompt_tokens.mjs` | Windows resolves `npx` to `npx.cmd`, which `execFileSync` cannot spawn directly without a shell | Added `shell: true` |
| esbuild then failed with "Must use outdir when there are multiple input files" | `shell: true` on Windows runs the command through `cmd.exe`, which splits the repo's path on the space in "Travel App" into two arguments instead of honouring the array | Built the command as one pre-quoted string and passed it to `execFileSync` as a single argument, rather than relying on the argv array |
| First cut of the "mustSee never dropped" test asserted 31 candidates from a 30-deep deck plus one mustSee | Miscounted how `room = limit - kept.length` behaves: a single guaranteed candidate reduces the ranked fill by one, so the total stays at the limit rather than exceeding it, and only exceeds it when the guaranteed count itself is larger than the limit | Fixed the test's expectation to 30, and added a second check that the ranked fill still finds 29 ordinary seats alongside the one mustSee; also tightened the doc comment on `selectCandidates` in `logic.mjs`, which had the same imprecise claim |

## What is still open

The live A/B this task's done condition asks for cannot run from this session: no Supabase access, no Gemini key, no deploy rights. Once `plan-day` is redeployed with this change, the owner can run it by setting the `PROMPT_TRIM` Supabase secret to `false` for a control window (a day, or a fixed request count), then unsetting it (or setting it to anything other than `false`) for a treatment window of similar length and similar traffic mix, and comparing `ai_model_events` (already logging every generation, from T038) filtered by the two windows on: token usage if Gemini's response ever surfaces it, the fallback rate, and a manual read-through of a sample of plans from each window for a qualitative check that the trimmed-deck plans are not worse. User row, registered below with the exact procedure.

The 20-real-plan side-by-side the task asks for is the same live-traffic problem in a different shape: it needs a Gemini key and real requests, neither available here. Registered as a user item with a concrete procedure: pull 20 real `plan-day` requests' `candidates` payloads (or reconstruct 20 from real catalogue decks, which this task's `measure_prompt_tokens.mjs` fixtures already do for 24 cities), run each once with `PROMPT_TRIM` unset and once with it set to `false` against a real Gemini key, and read the 20 pairs of plans side by side for whether the stop selection, sequencing or quality visibly differs. If they do not differ, as the trim is designed to guarantee (mustSee and named stops are exempt, and the model was already choosing a shortlist out of a deck this size or smaller), that is the confirmation the "free saving" framing needs before leaning on it further.

The measured saving is small on today's real traffic, for the two structural reasons explained above: the count-based cut is currently inert because nothing upstream sends more than 28 candidates, and the `desc`-strip mostly has nothing to strip because the catalogue rarely writes a `desc` for a non-mustSee place to begin with. This is not a bug in the implementation, it is a mismatch between where the unit-economics brief expected the token weight to be and where the measurement shows it actually is. Registered as a next-task item: find where the "~6k input tokens per plan" figure in `CARTA_UNIT_ECONOMICS.md` §2.2 is actually going, since it is not reproduced by this measurement's baseline (roughly 1.2 to 1.5k tokens for the candidate-list-driven portion of the prompt). Candidates worth checking first: whether Gemini's own token accounting counts the JSON schema and system scaffolding much more heavily than character count implies, whether a heavier real request (a full profile, several `mustInclude` entries, a long `freeText` wish, a `refine` loop carrying `prevStops`) routinely adds more than this script's minimal fixtures do, or whether the brief's figure was an estimate that has simply never been checked against a real prompt until now.

`selectCandidates`'s distance penalty (`(km - 5) * 0.15` against a rating out of 10) is untuned; it was picked to be simple and monotonic, not fitted to anything. If the count-based cut ever does start engaging (see above), it is worth revisiting once there is a real deck larger than 30 to observe it against. Noted, not registered: nothing depends on it being exactly right today, since the cut currently never fires.

## Rollback procedure

Both commits are on `p2-prompt-token-trim` in their own repo and each reverts on its own.

Root repo:

```
git revert 91e5d68c8
```

App repo (`continent-app/`):

```
git revert 7a6db64
```

Reverting the root commit restores the untrimmed candidate list on every code path (prompt, validation, cache key) in one step, since all three read from the same `promptCandidates` variable this task introduced; there is nothing partially applied to clean up. No data is affected: this task changes what is sent to Gemini and what is hashed into the cache key, not anything stored. A revert after some live traffic under the new cache key would simply cold-start the cache again in the same way T039's version bump already does, which is expected and harmless.

If only the shadow-mode escape hatch is wanted without a full revert, setting `PROMPT_TRIM=false` as a Supabase secret and redeploying achieves the same effect without touching git history.

---

## Notes for the maintainer

The rule that governs every exemption in `selectCandidates` is the same one T039 wrote down for the cache key, applied one level earlier: a candidate may be cut only when cutting it changes nothing the traveller asked for by name. `mustSee` and `keepIds` are not a ranking tie-break, they are a hard exemption checked before any scoring happens, which is why `kept` is computed first and `room` is what is left over, not the other way round. If a future change adds a third "never cut" category (an event the traveller is chasing, say), it belongs in the same `kept` filter, not as a boost to the score: a boost can still lose to a stronger boost, an exemption cannot.

The cache-key decision is the one part of this task most likely to be revisited, so it is worth restating why it is not a mistake to key on the trimmed deck rather than the full one. The key exists to answer "will two requests get the same answer from Gemini", and after this task the answer to that question is fully determined by `promptCandidates`, never by `candidates`. Keying on the untrimmed list would be measuring something the model cannot see, the same category of error T039's report warns against for every other field in the key.

`measure_prompt_tokens.mjs` extracts `buildPrompt` from the transpiled `index.ts` at run time rather than keeping a hand-copied version, for the same reason `measure_cache_keys.mjs` reads the old cache key out of git: a copied-in function silently stops being the one that ships the moment the original changes. The extraction works because `buildPrompt` is accidentally pure, it touches only its argument and two module-level constant objects defined just above it, never `Deno.*` or `logic.mjs`. If a future change makes `buildPrompt` call into `logic.mjs` or read an env var directly, this script's brace-matching extraction will still pull the function text out correctly, but the constants it also needs to grab (`LANG_NAMES`, `PACE_STOPS`) may no longer be sufficient, and the script's guard (it throws if it cannot find the expected `const` or `function` headers) will fail loudly rather than silently measuring a broken prompt. That is the intended failure mode; do not paper over it by copying the function in by hand.

The two-scenario measurement (client-capped-today vs. server-ceiling) is deliberate, not padding. A single number here, taken from whichever scenario was measured first, would have either overstated the saving (using the server ceiling and letting a reader assume that is what ships) or hidden that the trim is a real, tested guard rather than a no-op (using only today's client-capped traffic). Keep both if this measurement is ever re-run after a change to either cap.
