# Paid runs, last in the order

Everything that costs money goes to the back, after all free work (owner instruction, 2026-10-03). Each run is a single command with a spend cap; Claude can run any of them the moment you say "go" with the cap. Nothing here starts before the Gemini spend cap is proven (T259). Reviewed in the owner sweep of 2026-11-12 (`.work/2026-11-12-owner-box/report.md`): the box and data-run steps that spend money were added here, and the free ones were moved to ROADMAP H9.

## Gemini runs (pipeline key; the trip scripts live in `Trips/carta-unified/carta-unified/pipeline/` and run from that folder)

1. Only if the golden set runs from CI: the `GEMINI_API_KEY` repository secret (T153-b, free; the security lane sets it with `gh secret set`).
2. T144-a with T145-a: `python pipeline/generate_trip.py` on three to five briefs; read `cost` and the critique files.
3. Claude, no spend: from those numbers, decide whether the critic gets its own model (`--critic-model`, T145-b), and tune `ESTIMATE_MIN_EUR` (150) and the estimate wording against the share of figures a person changed (T154-a).
4. T153-a: `python pipeline/golden_set.py run --live` (about 40 calls), then `bless`, commit `golden/baseline.json`, and drop `--allow-missing-baseline` from `.github/workflows/golden-set.yml`.
5. T323-b: count `groundingMetadata.webSearchQueries` over about 30 real grounded plan-day calls.
6. T150-a, then T150-d: `python -X utf8 pipeline/backfill_modules.py run --limit 5`, then the rest with `--max-usd` (estimate USD 1.5 to 3.4); Claude then reads a sample (T150-d).
7. T152-a, then T152-b: rewrite the 236 over-cap catalogue trips under the word caps.
8. T155-a, then T155-c: per batch `python pipeline/expand_catalogue.py run expansion/<batch>.json --live --max-usd <cap> --limit 3`, then the review queue, promote, join and the journey wire (estimate EUR 15 to 27 for wave 1). Claude reads and edits the 60 wave-1 briefs first (T155-b, free).
9. T040-b: the 20 real plans side by side with `PROMPT_TRIM` unset and false.
10. The LLM judges, each once, a few cents: T1148-e (plan-day judge), T1144-c (text judge), T1188-b (text checker, then calibrate), T1196-f (translation verdicts), T1198-d (photo check with images), T1150-a (tagger verifier on the gold items), T1206-d (batch mode once), T1206-f (day plans from each provider; needs each provider's key), T1138-e (Flash-Lite and Mistral Small; Mistral needs an account).

## Helper servers on Hetzner (after step 2 of `docs/owner/hetzner-box.md`, the token)

11. T047-b: a self-test spawn, about EUR 0.06: `CARTA_WORKER_TYPE_SELFTEST=cpx22 bash infra/hetzner/cax41/spawn.sh selftest`. Passes when it ends "outcome ok, exit 0" and `hcloud server list --selector role=worker` is empty.
12. T047-c: start a spawn and stop it halfway (Ctrl+C); passes when the worker is still deleted.
13. T047-d: the first heavy job, the Switzerland route maps.
14. T049-b to T049-d: the beaches photo conversion (`spawn.sh --dry-run image_transcode beaches` first), then the real run, then repeat until none are left (about 8 runs at about EUR 0.45). After it: T050-a (a real takedown test), T051-a (credits travel with the copies), T269-d (photo scores match), T269-e (`derive.py gc`, dry run first), and T1105-a (switch `heroLadder.json` to live).

## Paid data sources

15. T1112-a: Aviasales route coverage, after the Travelpayouts sign-up (T1213-f): set `AVIASALES_TOKEN`, then the probe (free, about 2.8 h).

## Moved from unsorted.md (owner sweep 2026-11-12)

| ID | Item | Order |
|---|---|---|
| T152-a | 236 of the 253 catalogue trips are over a word cap (41 summaries, 943 day blocks, 334 pro tips); bringing them within needs a model rewrite of the prose, which is a paid Gemini run and stage 3 of _OPEN-MASTER.md is not done, so the done condition "every trip within the caps" holds for generated trips only | LAST (paid, see docs/owner/paid-runs.md); after stage 3 |
| T1112-a | Run the Aviasales coverage probe with the owner token and the sweep export; steps in the report (D14) |  |
| T1105-a | Self-hosted first paint is built but ships not live: derive the `dest` and `dossier` layers to R2, then re-run `pipeline/photos/hero_ladder.py --manifests` so `continent-app/src/lib/heroLadder.json` says live; see the T1105 report's owner steps | 1 |
| T1148-e | Run the Gemini judge (`node scripts/eval/plan-day/judge.mjs --backend gemini`, a model outside plan-day's chain) on the pipeline key; the key is not in the cloud container, so only the session judge has verdicts | 3 |
| T1138-e | Ask quality for Gemini Flash-Lite and OVHcloud Mistral Small 3.2 is an owner run (ask-eval-live.mjs needs wrangler pages dev and a key); also rerun Qwen3, whose 88.7 percent is from T563 on 2026-10-22 |  |
| T1144-c | Run the truth text judge once on Gemini through the gateway (judge.mjs --backend gemini) to compare it with the blind session judge | 3 |
| T1150-a | The tagger's verifier (Gateway feature tagging, Gemini) has never run: run it on the 400 gold items, score it against the lexical run, and only then on the full corpus; the container has no key | 1 |
| T1188-b | The Gemini judge has never run (no key in the cloud container): run it on the D4 sample through the gateway, check that `gemini-pro-latest` resolves (else set AI_JUDGE_MODELS), and calibrate it ([report](P15/T1188-llm-judge.md)) | 2 |
| T1196-f | Cross-check with a second model family: run the Gemini judge (and a Gemini blind back-translation) on data/reports/validation/texts/items.json and the 2,056 flagged strings; the session judges share the drafting model's family |  |
| T1198-d | One photo check vision run with GEMINI_API_KEY to confirm calls, answers and cost; the research could not reach Google's price page | 2 |
| T1206-d | First live run of Gateway.batch (Gemini Batch Mode) on the pipeline key; the request shape is coded from memory because the docs host was blocked |  |
| T1117-b / T1206-e | Live red team: say go and Claude runs `node continent-app/scripts/ai/redteam_live.mjs` (with the suggest-city and pipeline attacks of T1206) against the live site with a throwaway test account, deleted afterwards. Cost: about 45 Gemini calls, a few cents. Done when `evals/injection/recorded-live-<date>.json` is committed and every attack that got through is in the attack set | after the next ship |
| T1206-f | Record plan-day plans per provider with continent-app/scripts/eval/plan-day/record.mjs against a local supabase functions serve plan-day, then score them with run.mjs plan-day --plans |  |
