# Ask Carta (chat, RAG)

Area doc for the MAP.md row "Ask Carta (chat, RAG)". Template: ROADMAP item B2. Built by T1073 from MAP.md, the handbook headings and the real test folders; the rules and numbers live in the handbook, not here.

## Purpose

Ask Carta: a chat that answers from the catalogue with retrieval and an open model.

Screens: Ask chat, home Ask field.

## How it works

Passages and vectors are built by the pipeline (ask_index) and BM25 by an app script; the Pages Function app/functions/api/ask/answer.js calls Workers AI under a daily Neurons cap held in KV.

Full rules, formulas and thresholds (read these, do not copy them):

- [Ask Carta](../HANDBOOK.md#ask-carta)

## Files

App: continent-app/src/browse/ask/AskChat.jsx, continent-app/src/lib/ask/, continent-app/functions/api/ask.js

Pipeline and backend: pipeline/ask_index_layer.py, app/scripts/build-ask-bm25.mjs

MAP.md handbook column: Platform. Latest tasks: T572-T576.

## Data read and written

Each linked handbook section has a "Data behind it" paragraph that names the files and keys. Wire fields are in [../SCHEMA.md](../SCHEMA.md); the data index is [../data/README.md](../data/README.md). Field level lineage is ROADMAP item B5 and does not exist yet.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

App tests matched by file name: `continent-app/tests/askAnswer.test.mjs`, `continent-app/tests/askChat.test.mjs`, `continent-app/tests/askEmbed.test.mjs`, `continent-app/tests/askGenerate.test.mjs`, `continent-app/tests/askIntent.test.mjs`, `continent-app/tests/askOnDevice.test.mjs`, `continent-app/tests/askRetrieve.test.mjs`.

DOM checks: none matched by name (not verified whether another test covers this area).

Python tests matched by file name: none matched by name (not verified whether another test covers this area).

Name matching is a guide, not proof of coverage. CI workflows are listed in [../architecture/README.md](../architecture/README.md).

## Metrics

Not measured by this doc. Figures for this area sit in the latest task reports named above.

## Security notes

Workers AI and KV bindings in continent-app/wrangler.toml; the Function refuses to call a model without the KV counter. Never the Claude API.

The threat model and controls live in `docs/security/` (Track C); this doc does not restate them.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -i -E "ask carta|ask " Execution/_OPEN.md
```

## History

- 2026-11-05, T1073: first written from MAP.md and the handbook. Earlier history: the task reports named above and `Execution/P*/_DIGEST.md`.

## Last verified

2026-11-05 (T1073): paths exist (checked by a script), handbook links resolve against the handbook headings. Behaviour was not re-run.
