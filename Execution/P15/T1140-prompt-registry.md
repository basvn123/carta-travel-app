# T1140: the prompt registry (ROADMAP E5, round 2 session S56)

Branch `p15-s56-prompt-registry` from `origin/p15-round2` (55a09c9c01). Builds on T1137 (the model gateway, E3) and T1148 (the eval runner, F6).

## Date

2026-11-06

## What changed

Every prompt Carta sends a model now lives in a versioned file instead of in code. `prompts/registry.json` lists 15 prompts, each with an id, its current version and file, the sha256 of its text, the `run.mjs` eval that guards it and its last score (or the other guard where no `run.mjs` eval exists): `security-rules` (aiGuard's system rules), `ask`, `plan-day`, `suggest-city`, `parse-booking` (with its Gemini response schema), `eval-judge` (the plan-day judge's rubric, same hash as before), the pipeline's `intros`, `parking`, `lexicon` and `trips-shared`, and the five Trips generator pass prompts, registered where the golden set already hashes them. A file is `prompts/<id>/v<N>.md`: front matter, prose and a changelog, then fenced fragments with `{{name}}` slots; code keeps only the choice of lines. The Edge Functions, Ask's Pages Function and the app import a generated module (`supabase/functions/_shared/prompts.js`, byte-identical copy `continent-app/functions/_lib/prompts.js`), which `supabase functions deploy`, the Pages build and Vite bundle like any import; Node scripts and the pipeline read the files (`scripts/prompts/lib.mjs`, `pipeline/prompt_registry.py`). The loader's output is byte-identical to the old code on all 138 captured inputs (126 JS, 12 Python, every branch of every builder), proven by tests against outputs captured from 55a09c9c01. A new `prompts` workflow fails when a prompt's text changes without a version bump (registry hash, and against the base commit: a committed version never changes), when the generated module is stale, and when a bumped prompt has no score for its new version or its eval fails (a bump runs the eval through `run.mjs --check`); a seeded in-place edit must fail it. Before, 12 code files held prompt text and no prompt had a version tied to an eval; now no code file does, and 3 of 15 prompts have a `run.mjs` eval (the other 12 name their guard; T1140-b).

## Research

None chosen beyond the layout. The roadmap asked for `prompts/<function>/vN.md`; the precedent was the Trips generator's own versioned prompt files (`Trips/.../pipeline/prompts/k*.md`, header lines and a body, `{{name}}` slots filled by `fill()`), which this task keeps and registers in place. Choices and why:

- **Where the folder is.** The repository root: the prompts run in Deno (Edge Functions), Workers (Pages Functions), the browser (Ask on device) and Python (pipeline), and the root is the only folder all of them can reach. `continent-app/` would put pipeline prompts in the app; `supabase/` would put them in Deno's tree.
- **How bundled runtimes load them.** A generated ES module, not a runtime file read. Deno Deploy only ships the module graph (a `Deno.readTextFile` of a non-imported file would need `static_files` config per function), and Pages Functions have no filesystem. A plain import is bundled by both, and Vite tree-shakes unused exports, so each export is one plain object per prompt (the Ask answer bundle carries `ask` and `security-rules`; the app's AskChat chunk only `ask`). JSON imports were the other option; they need import attributes (`with { type: 'json' }`), which the pinned Deno, esbuild and Vite each handle differently, and they are not tree-shaken.
- **Format.** Fenced fragments (`### name`, `~~~`, text, `~~~`) rather than one body per file: the four Edge Function and Ask builders pick lines by the traveller's answers, so a prompt is a set of named lines. The fence makes leading and trailing newlines explicit, which byte identity needs (three fragments start with a blank line).
- **Version rule.** Immutable version files, checked against the base commit in git, plus a hash in the registry for a check without git. A hash alone can be updated by hand next to the edit; the base comparison cannot.

## Files touched

Created:
- `prompts/README.md`, `prompts/registry.json`, `prompts/{security-rules,ask,plan-day,suggest-city,parse-booking,eval-judge,intros,parking,lexicon,trips-shared}/v1.md`, `prompts/_golden/js.json`, `prompts/_golden/py.json`
- `scripts/prompts/lib.mjs` (format, hash, Node loader), `scripts/prompts/registry.mjs` (build, check, bump, record), `scripts/prompts/capture-golden.mjs`, `scripts/prompts/capture_golden.py`
- `supabase/functions/_shared/prompts.js` and its copy `continent-app/functions/_lib/prompts.js` (generated)
- `supabase/functions/plan-day/prompt.mjs`, `supabase/functions/suggest-city/prompt.mjs`, `supabase/functions/parse-booking/prompt.mjs`
- `pipeline/prompt_registry.py`
- `continent-app/tests/promptRegistry.test.mjs`, `tests/test_prompt_registry.py`
- `.github/workflows/prompts.yml`
- this report

Modified (prompt lines and imports only):
- `supabase/functions/plan-day/index.ts`, `supabase/functions/suggest-city/index.ts`, `supabase/functions/parse-booking/index.ts` (buildPrompt, RESPONSE_SCHEMA and LANG_NAMES now imported from `prompt.mjs`)
- `supabase/functions/_shared/aiGuard.mjs` and its copy `continent-app/functions/_lib/aiGuard.js` (`systemRules`, `askUserPrompt`)
- `continent-app/src/lib/ask/context.js` (`systemPrompt`, `userPrompt`; nothing in retrieval or ranking)
- `continent-app/scripts/eval/plan-day/plan-day-lib.mjs` (`rubricText`, `judgePrompt`; `RUBRIC_PATH` removed, it had no users), `continent-app/scripts/eval/plan-day/judge.mjs` (one comment)
- `pipeline/dossier/rewrite_intros.py`, `pipeline/dossier/parking_check.py`, `pipeline/ask_lexicon.py` (`OLLAMA_PROMPT` became `ollama_prompt()`)
- `Trips/carta-unified/carta-unified/pipeline/generate_trip.py` (`retry_prompt`, `_prompt_registry`), `Trips/carta-unified/carta-unified/pipeline/backfill_modules.py` (`previous_block`, the retry)
- `docs/HANDBOOK.md` (new "Prompt registry" bullet after "AI gateway"; the Evals section's two `rubric.md` mentions), `ROADMAP.md` (E5 status), `Execution/_OPEN.md` (rows T1140-a to T1140-f appended)

Deleted: `continent-app/scripts/eval/plan-day/rubric.md` (now `prompts/eval-judge/v1.md`, fragment `rubric`, same bytes and hash).

Outside the brief's list, each needed to stay green: `continent-app/tests/aiGuard.test.mjs` (its static check now reads `prompt.mjs` beside each `index.ts`, where the data blocks moved), `.github/workflows/golden-set.yml` (both sparse checkouts add `pipeline/prompt_registry.py` and `prompts/trips-shared`, since the generator's retry line, which the self-test exercises, now comes from the registry; two path triggers added), `docs/logic/plan-day.md` (PLANDAY-013 and the RESPONSE_SCHEMA line point to `prompt.mjs`; the docs drift check failed on `PACE_STOPS`).

## Commands run

```
git fetch origin && git checkout -b p15-s56-prompt-registry origin/p15-round2
cd continent-app && npm ci && cd ..
node scripts/prompts/capture-golden.mjs --rev 55a09c9c01        # outputs of the old JS builders
python3 -I scripts/prompts/capture_golden.py --rev 55a09c9c01   # outputs of the old pipeline code
node scripts/prompts/registry.mjs build
for id in <each id>; do node scripts/prompts/registry.mjs record $id; done
node scripts/prompts/registry.mjs check
node scripts/prompts/registry.mjs check --base 55a09c9c01
node scripts/prompts/registry.mjs check --seed-edit             # exit 1, "prompt registry: FAIL"
cd continent-app && node --test tests/promptRegistry.test.mjs && npm test
npx eslint tests/promptRegistry.test.mjs src/lib/ask/context.js functions/_lib/aiGuard.js functions/_lib/prompts.js
npx eslint --no-ignore scripts/eval/plan-day/plan-day-lib.mjs scripts/eval/plan-day/judge.mjs
node scripts/eval/ask-eval.mjs --check
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs   # and on a worktree of 55a09c9c01
node_modules/.bin/rolldown functions/api/ask/answer.js --format esm --platform neutral --file <scratch>   # the Pages bundle's prompts
cd .. && node continent-app/scripts/eval/run.mjs --check
deno check --no-lock supabase/functions/{plan-day,parse-booking,suggest-city}/index.ts   # deno 2.9.6 from npm in the scratchpad
python3 -m pytest tests/test_prompt_registry.py tests/test_ai_gateway.py tests/test_generate_trip.py tests/test_backfill_modules.py tests/test_golden_set.py tests/test_trip_critic.py -q
(cd Trips/carta-unified/carta-unified && python3 -X utf8 pipeline/golden_set.py self-test)   # also in a sparse clone shaped like golden-set.yml
ruff check --select E9,F63,F7,F82 pipeline tests Trips/carta-unified/carta-unified/pipeline scripts/prompts
python3 -I scripts/docs/drift.py
```

The git-based bump check was also run on throwaway commits in a scratch worktree: an in-place edit of `plan-day/v1.md` fails (4 failures); the same edit with the registry hash updated by hand and the module rebuilt still fails against the base; `bump plan-day`, the edit in `v2.md`, `record` and `build` pass and run the plan-day eval.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Code files holding prompt text | 12 (the three Edge Function `index.ts`, both aiGuard copies, `context.js`, `plan-day-lib.mjs`, `rewrite_intros.py`, `parking_check.py`, `ask_lexicon.py`, `generate_trip.py`, `backfill_modules.py`) | 0 (test: no eight-word run of any registry prompt in a code file outside comments; 7 shared vocabulary or validator phrases allowed by name) | -12 |
| Prompts with an id, a version, a guard and a last score | 0 (5 Trips files had a version header) | 15 | +15 |
| Prompts whose bump runs a `run.mjs` eval | 0 | 3 (ask, plan-day, eval-judge) of 15 | +3 |
| Loader output identical to the old code | n/a | 138 of 138 inputs (126 JS incl. 40 judge prompts by hash, 12 Python); 3 response schemas identical | |
| Judge rubric hash | dd1b55440404 | dd1b55440404 | 0 |
| Seeded in-place edit | nothing noticed it | `check --seed-edit` exit 1; git base check exit 1 | |
| `npm test` | 1623 tests (the after count minus the 11 new) | see the line under this table | +11 |
| pytest, prompt and generator suites | 105 | 111 (6 new) | +6 |
| Fast build `assets/` | 9,913,935 bytes | 9,914,507 bytes | +572 |
| AskChat chunk (the only app chunk with a prompt) | 67,010 bytes | 67,582 bytes | +572 |
| Prompts in the Pages answer bundle | Ask system, security rules | the same two (others tree-shaken) | 0 |
| `deno check` errors, plan-day / parse-booking / suggest-city | 5 / 2 / 2 (T1137) | 5 / 2 / 2, the same ones | 0 |
| `node continent-app/scripts/eval/run.mjs --check` | pass (T1148) | pass: ask nDCG@10 0.6003, trails 2,089 of 2,089, quality 75 of 75, plan-day 20 of 20, judge kappa against rules 0.898 | 0 |
| `ask-eval.mjs --check` | pass | pass | 0 |
| Docs drift | 0 | 0 (after the PLANDAY-013 fix) | 0 |

`npm test` after: 1634 tests, 1622 pass, 0 fail, 12 skipped (the first full run, before the aiGuard static-check fix, had 1 failure; see below).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `aiGuard.test.mjs` "guard input, the system slot ..." failed: "plan-day/index.ts: no data block" | The static check greps `index.ts` for `dataBlock('`; the data blocks moved with the prompt into `prompt.mjs` | The check reads `index.ts` and `prompt.mjs` together |
| Docs drift: PLANDAY-013 `PACE_STOPS` not found in `index.ts` | The pace lines are fragments now | PLANDAY-013 names `buildPrompt` in `prompt.mjs` and the fragments |
| The first grep test found 8 "prompts in code" | Seven-word runs matched comments, docstrings and shared vocabularies (the booking kinds, the effort scale) | Comments and statement docstrings are stripped, words only, eight-word runs, and seven named phrases allowed with a reason; a planted prompt line in `logic.mjs` still fails it |
| The pipeline test failed when run with the Trips suites | `pipeline/dossier/common.py` and the Trips `common.py` share a module name | The test loads the dossier jobs with their own `common` and restores the other |
| `record` wrote no score | `run.mjs --json` prints the array and then its verdict line | Parse from the first `[` to the last `]` |

Gotchas: a prompt fragment is the text between the fences, so a fragment that should start or end with a newline has an empty line there; `writeFragment` refuses a text holding a line `~~~`. The generated module is checked by CI, so a prompt change without `registry.mjs build` fails. Python reads the files on Windows with carriage returns dropped, so a CRLF checkout gives the same bytes.

## Screens checked

None. No screen changed: every prompt is byte-identical, and the only app bundle change is the Ask system prompt now arriving through the registry object (+572 bytes in the AskChat chunk). The batch's end check needs no screen for this task.

## What is still open

- T1140-a (user): deploy the three Edge Functions and the Pages build; nothing changes for travellers, so it can ride on T1137-a.
- T1140-b: 12 of 15 prompts have no `run.mjs` eval, so their bump runs nothing; their guards (the injection set, the golden set) run in their own workflows. Adapters for those two, and offline evals for suggest-city and parse-booking, would make every bump run an eval.
- T1140-c: the Trips generator's Gemini schema field descriptions (about 5 strings in `generate_trip.py`) are still code. Moving them changes what the golden set measures, so it belongs with a rebaseline.
- T1140-d: a rubric bump runs the plan-day eval, whose judge kappa still reads the old rubric's verdicts (flagged by hash, not failed).
- T1140-e: `MAP.md` and `docs/README.md` do not point to `prompts/`; the `index.ts` line numbers in `docs/logic/plan-day.md` are about 140 lines off.
- T1140-f: T1148-c is done here (plan-day's `buildPrompt` and `RESPONSE_SCHEMA` are importable from `prompt.mjs`); its row should move to `_OPEN-CLOSED.md` (this task appends only).
- Not a new row: T1137-c (fence suggest-city's wish and the pipeline's harvested text) stays open. It changes prompt text, which this task keeps byte-identical; it is now a `suggest-city` v2 and `intros` v2 bump through the registry.

## Rollback procedure

`git revert` the T1140 commit. Code, prompt files, tests, CI and docs only: no data, no migration, no deploy, no secret. After a deploy, revert and redeploy the three Edge Functions and the Pages build. Caches are unaffected: the prompts, `GUARD_VERSION` and every cache key are unchanged.

## Owner steps (for the checklist)

- [T1140-a] Deploy the prompt registry | the Edge Functions and Ask load their prompts from the bundled registry module only once deployed; the prompts are unchanged | with T1137-a: `supabase functions deploy plan-day`, `supabase functions deploy suggest-city`, `supabase functions deploy parse-booking`, then the Pages build per CLAUDE.md Deploy (preview first); on the preview run one plan-day day, one town suggestion, one magic import and one Ask question and check each answers as before | `supabase/functions/_shared/prompts.js`, `continent-app/functions/_lib/prompts.js`
