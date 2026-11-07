# T1198: Photo correctness, heroes checked against their place (ROADMAP D17)

Round 3 session S114, batch 13. Branch `p15-s114-photo-correctness`.

## Date

2026-11-07

## What changed

Carta now checks a weekly sample of heroes against the place they front.
- **The check.** `pipeline/photos/correctness.py`, run by the task `photo_check`.
- **Before.** Nothing asked whether a hero shows its place. The hero audit (`hero_audit`, monthly, destinations only) asks whether a file is a usable photograph, and the shipped wire proves the gap: Fur, a Danish island, is fronted by a grizzly bear from the en.wikipedia article "Fur".
- **How it decides.**
  - **Tier 1, cheap signals.** File name, caption, Commons categories, MIME type, size and the published coordinate. These reuse the hero audit's lexicons and add interiors, group photos and portraits, animals, institutional buildings, a file that names another place of the run, and positive evidence that the file names its subject.
  - **Tier 2, vision.** Only the unsure photos go to Gemini, through the gateway with the registry prompt `photo-check`.
  - **Replacement.** A flagged hero is replaced by the first ok candidate on its own ladder: the dossier gallery for a destination, the `images` list for a beach, lake or mountain.
- **The D2 rule.** The flag rate is a hard D2 rule through the new D23 runner layer `photos`.
- **The seeded tests pass.** Every seeded wrong hero is flagged: the grizzly, a prime minister's portrait, a government group photo, a university building, a map known only from its category, an interior known only from its category, a wrong town known only from its coordinate, a photo naming another place, and a satellite image. Every control passes. All 7 replacements come from the ladder.
- **On the shipped wire** (cheap tier on file names only, since this container has no Commons metadata):
  - **The weekly sample:** 500 heroes, 1 flagged (0.2%), 63 unsure.
  - **The whole list:** 8,942 heroes, 42 flagged (0.47%), 1,110 unsure, 12 with a ladder replacement.
  - **Real finds:**
    - Keir Starmer's official portrait on Tiverton, Hythe and Rothwell
    - the Japanese Emperor's flag on Tenno
    - the Flag of Europe on Eu
    - telephone dialling code maps on Kington and Heathfield
    - Lisbon Castle on Sao Jorge (Azores), unsure for tier 2
    - Amsterdam on Hunnerberg, unsure for tier 2

## Research

A research subagent compared the options on 2026-11-07. It could not reach ai.google.dev, so its prices come from aggregators and need a re-check before any budget is fixed (part of owner step T1198-d).

| Question | Options | Choice and why |
|---|---|---|
| Vision model | gemini-2.5-flash-lite (about $0.06 per 1,000 images), gemini-3.1-flash-lite ($0.18), gemini-3 flash ($0.36), gemini-3.5-flash ($1.10), gemini-3.1-pro ($1.40 to $7). Sources: https://ai.google.dev/pricing, https://www.cloudzero.com/blog/gemini-pricing/, https://tokencost.app/blog/gemini-3-5-flash-pricing | **The Flash tier: `gemini-flash-latest`, then `gemini-3.5-flash`.** This is the gateway's own chain head, so a model switch stays a config change (E7). Cost does not decide it, because 150 calls a run cost cents on every tier. The hard cases (a homonym, the wrong town) need world knowledge, and that is where Flash-Lite is weakest. Pro is not used. |
| Image input | inline base64, or the File API / file URI. The inline limit is 20 MB per request: https://ai.google.dev/gemini-api/docs/image-understanding | **A 640 px Commons thumbnail inline, at `MEDIA_RESOLUTION_LOW`** (about 280 tokens on Gemini 3: https://ai.google.dev/gemini-api/docs/media-resolution). It is far under the limit, so no upload step is needed. |
| Cheap signals | Commons `imageinfo` with extmetadata (Categories, ObjectName, GPS) and `coordinates` (https://www.mediawiki.org/wiki/Extension:CommonsMetadata/en); Wikidata's own P18 guidance to use P94, P242 and P154 instead (https://www.wikidata.org/wiki/Property:P18) | **The hero audit's existing batched Commons call (`commons_meta`) and its cache**, reused rather than copied. P94, P242 and P154 equality is a later signal (T1198-h). No published "wrong P18" dataset was found. |
| A local middle tier | CLIP ViT-L/14 or SigLIP 2 zero-shot (https://arxiv.org/abs/2502.14786); no published figures for map or logo detection | **Not added.** The CLIP veto in `relevance.py` already exists for the layers that run it. A zero-shot tier must first be calibrated on Carta's own labels (T1198-c). CLIP cannot catch the wrong town. |
| Sample size | n = 1.96² p(1-p) / E²: 190 at 2%, 280 at 3%, 460 at 5% for plus or minus 2 points | **500 a run** (200 destinations, 100 each of beaches, lakes and mountains), rotating weekly. A trend between two runs needs the pooled window that the D23 baseline gives. |
| Where the D2 rule lives | A completeness rule in `scripts/quality/rules.yaml` (the engine requires each rule to be a scorecard field); or a D23 runner layer read by `gate_from_disk` | **A D23 runner layer.** It already has the baseline, the Wilson interval for a sample, a lower-is-better direction, and the D2 hook. |

## Files touched

- **Created:**
  - `pipeline/photos/correctness.py`: the check, both tiers, the ladder walk, `apply`, the CLI and `validate`
  - `pipeline/photos/correctness.json`: the sample, distance limits, ladder depth and vision settings
  - `prompts/photo-check/v1.md`
  - `scripts/validation/layer_photos.py`
  - `tests/test_photo_correctness.py` (18 tests)
  - this report
- **Modified:**
  - `run_pipeline.py`: the task `photo_check`, before `photo_sources`
  - `scripts/validation/runner.py`: one line, `photos` in `LAYERS`
  - `prompts/registry.json`: the `photo-check` entry
  - `docs/reference/tasks.md` and `docs/reference/python.md`: regenerated
  - `docs/HANDBOOK.md`: the new section "Photo correctness (D17)"
  - `ROADMAP.md`: D17 status
  - `Execution/_OPEN.md`: rows T1198-a to T1198-h appended

## Commands run

```
python pipeline/photos/correctness.py --now 2026-11-07T12:00:00Z --out <scratch>           # the weekly sample
python pipeline/photos/correctness.py --all --now 2026-11-07T12:00:00Z --out <scratch>     # every hero
CARTA_PHOTO_CHECK=<scratch>/2026-11-07.json python -I scripts/validation/runner.py photos --out <scratch>
node scripts/prompts/registry.mjs record photo-check && node scripts/prompts/registry.mjs build
python -I scripts/docs/build_reference.py
python -m pytest tests/test_photo_correctness.py -q
```

## Config and secrets set

None. The tier 2 run needs `GEMINI_API_KEY` on the box, which the other Gemini jobs already use.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Heroes checked against their place per run | 0 | 500 (weekly sample) | +500 |
| Seeded wrong heroes flagged (fixture) | n/a | 9 of 9 | |
| Seeded controls flagged (fixture) | n/a | 0 of 5 | |
| Fixture replacements taken from the ladder | n/a | 7 of 7 | |
| Weekly sample, cheap tier, names only (2026-W45) | Not measured | 1 flagged of 500 (0.2%), 63 unsure (12.6%) | |
| Whole list, cheap tier, names only | Not measured | 42 flagged of 8,942 (0.47%): destinations 37 of 3,841, beaches 4 of 2,745, lakes 0 of 1,628, mountains 1 of 728 | |
| Flagged heroes with an ok candidate on the ladder (whole list) | n/a | 12 of 42 | |
| Fur's grizzly hero | passes the hero audit's `classify` | flagged (`animal`), replaced by the Fur Museum photo at ladder index 5 on the shipped wire | |
| tests/test_photo_correctness.py | 0 tests | 18 pass | +18 |
| pytest, CI set (minus quarantine), in this container | 2 fail on the untouched base branch too (test_rating_inputs, test_rating_stability: LFS pointer inputs) | 993 pass, the same 2 fail, 11 skipped | 0 new failures |
| npm test (continent-app) | | 1,898 tests, 1,886 pass, 0 fail | |
| npm run lint | | exit 0 | |
| Gateway guard (continent-app/tests/aiGateway.test.mjs) | 33 pass | 33 pass | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first whole-list run flagged Plaza Mayor (Madrid, Ainsa, La Alberca, Almagro), President Beach, the Slezska Harta reservoir, Horsey seals and Puig Major | Lexicon words inside place names: "mayor", "president", "harta" (Romanian for map), "seals" (an emblem word) | The subject's own name is removed before the word lists run. "Mayor" counts only as "mayor of" or "lord mayor". "Seals" on a photograph is an animal hint, not an emblem. 52 flags became 42, all checked by name. |
| Town halls were sent to tier 2 as institutions | A town hall is an ordinary, good hero | Removed from the institution list (1,194 unsure became 1,110) |
| The gateway sends text parts only | `ai_gateway.py` has no image input and no `photo_check` feature, and it is outside this task's files | An opener passed to the gateway adds one `inline_data` part, and the feature is registered at run time, as the text judge does (`pipeline/judge/backends.py`). No provider endpoint is named outside the gateway, and `aiGateway.test.mjs` passes (33 of 33). Moving both into the gateway is T1198-a. |
| A hard D23 check with no baseline fails by design | The first pipeline run would fail D2 before anyone had seen a report | `--validate` writes the runner result only once `data/reports/validation/photos/baseline.json` exists (owner step T1198-b) |
| The prompt registry test failed in npm test ("no eight-word run of any registry prompt is left in a code file") | The answer kinds were a tuple in correctness.py that repeated the rubric's answer shape | The kinds are now read from the rubric (`vision_kinds`), so the list lives only in the prompt. The test passes (11 of 11). |
| `test_rates` expected 5 replacements | My count missed Tiverton, Appenzell and Kirkenes, whose fixture ladders hold a named photo | The expected value is now 7, with the list in a comment. The code was right. |

## Screens checked

None. Nothing a traveller sees changed: the wires change only with `--apply`, which this task did not run. The screens to check after the owner applies a report are the destination panel heroes (Fur, Tiverton, Tenno) and the beach cards, at phone and desktop width.

## What is still open

- **T1198-a (next task).** Image input and the `photo_check` feature belong in `pipeline/ai_gateway.py` (an `images=` argument for gemini, a FEATURES entry, mirrored in `continent-app/config/ai_models.json`). Once they are there, drop the opener and `ensure_feature` from `correctness.py`.
- **T1198-b (owner).** The first run on the box with Commons metadata, a review of the report, then the baseline. Until then the flag rate is measured but not gated.
- **T1198-c (next task).** A labelled eval for the `photo-check` prompt is needed before tier 2's `min_confidence` and the `unnamed` doubt can be tuned. Sources: the review ledger (`pipeline/photos/review.py`) and the seeded cases here. A calibrated CLIP or SigLIP middle tier is a choice for after that eval.
- **T1198-d (owner).** One tier 2 run with `GEMINI_API_KEY`, to confirm the calls, the answers and the cost. The research could not reach Google's price page.
- **T1198-e (next task).** `--apply` edits the shipped wires, which the next export rewrites. A replacement must also land in each layer's source: for destinations the `cache/wiki_images.json` that `hero_audit` writes, for the layers their rich caches or `data/overrides`. Otherwise it lasts one export.
- **T1198-f (owner).** Look at the 42 heroes flagged on the whole list (`--all`), and approve or refuse the 12 ladder replacements before anything is applied. Most of the 30 without a replacement are small UK and French towns whose galleries are thin. They need a photo, which is D9's gallery pass.
- **T1198-g (next task).** Trails, cycling routes and trips heroes are not sampled yet (single `img` fields, different wires).
- **T1198-h (next task).** `unnamed` sends about one hero in five to tier 2 (lakes 19%). With Commons metadata, a category naming the subject should clear most of them. Wikidata P94, P242 and P154 equality is a further cheap signal. Measure both after T1198-b.

## Owner steps (for the checklist)

- [T1198-b] Photo check first run and baseline | the flag rate is measured but not gated until a baseline exists | on the box: `python pipeline/photos/correctness.py --fetch-meta`; read data/reports/photo_check/<date>.json (totals, review list); `CARTA_PHOTO_CHECK=data/reports/photo_check/<date>.json python -I scripts/validation/runner.py photos --write --write-baseline` | docs/HANDBOOK.md, Photo correctness (D17)
- [T1198-d] Photo check vision tier run | confirms the Gemini image calls, answers and cost (prices from aggregators only) | with GEMINI_API_KEY set: `python pipeline/photos/correctness.py --fetch-meta --vision gemini`; check `vision.calls` and the tier 2 answers in the report; compare the token use in AI_EVENTS_JSONL with https://ai.google.dev/pricing | pipeline/photos/correctness.json (vision)
- [T1198-f] Review the flagged heroes before applying | replacements are automatic, taste is not (Starmer on Tiverton, Flag of Europe on Eu, a grizzly on Fur) | `python pipeline/photos/correctness.py --all --fetch-meta`; read every `flag` result and its `replacement`; approve with `--apply` (lasts until the next export, see T1198-e) or fix by hand in the review queue (`python pipeline/photos/review.py`) | Execution/P15/T1198-photo-correctness.md

## Rollback procedure

`git revert` the T1198 commits on this branch. Nothing is one-way: no wire, cache or live data was written, and no migration exists.
