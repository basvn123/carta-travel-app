# Model card: place tagger (stub)

ROADMAP F8 and F1, T1156. Status: **stub. This model does not exist yet.** Do not link this card from the public page as a live feature. It is here so the card has a home and a checklist before the model ships.

## What it will be

The F2 distilled tagger (F2) assigns taxonomy tags to places and trails, trained on the F1 labels (T1150). The taxonomy is `pipeline/taxonomy/carta_taxonomy.yaml` 1.1.0 (labels in six languages since T1215): 268 nodes in five facets (activity, setting, vibe, traveller, practical). See [taxonomy.md](taxonomy.md) and T1149.

## What exists today

- The taxonomy, the mapping from today's tags, a 400-item label template and the eval (T1149). Run by `continent-app/scripts/eval/run.mjs --predictions <file>`.
- A baseline: today's tags mapped to nodes. On a 15-item seed set the session labelled itself (89 scored labels): R-precision at 5 0.433, recall at 10 0.444, MRR 0.810, micro F1 0.431, macro F1 0.339, lenient micro F1 0.544, ECE 0.271. These numbers show the eval runs; they say nothing about quality (T1149).

## To fill in when the model ships

| Section | Needs |
|---|---|
| Model, size, licence, where it runs | F2 and E7 compute choice |
| Training data | the F1 label set, who labelled, agreement between labellers |
| Evaluation | micro and macro F1 and ECE on a held-out set that beats the baseline above; F1 per facet |
| Fairness | F1 per country and per language against the coverage parity table (`docs/data/coverage-parity.md`) |
| Use | tags feed filters and "why" chips; a tag is a label with a score, never shown as fact below the threshold |
| Limits | what it cannot tag (the `practical` nodes with `source: data` are facts, not tags) |
| Privacy | none expected: input is catalogue text, no personal data |
| EU AI Act | not high-risk; internal classification of catalogue data |

## Change log

- 2026-11-06 (T1156): stub.
