# Travel intelligence (taxonomy, tagger, taste, place linking, Intelligence API, MCP)

Area doc for the MAP.md row "Travel intelligence (taxonomy, tagger, taste, place linking, Intelligence API, MCP)". Template: ROADMAP item B2. Written by T1215 from MAP.md, the handbook headings and the task reports T1149 to T1156; the rules and numbers live in the handbook, not here.

## Purpose

One travel vocabulary (the taxonomy) and the code that reads places and travellers through it: the batch tagger, the traveller's taste profile, the place linker, the Intelligence API that serves them to other callers, and the read-only MCP server.

Screens: My trips, Your Europe tab ("Your taste" card); Explore search with the linker flag (`?link=1`). The Intelligence API and the MCP server have no screen.

## How it works

The taxonomy (`pipeline/taxonomy/carta_taxonomy.yaml`, five facets) maps today's tags through `mapping.yaml`. The tagger (`pipeline/taxonomy/tagger.py`, pipeline task `taxonomy_tags`) tags every place, trail, beach, lake and mountain with quoted evidence. The app's taste profile reads saves, trips and filters through a generated map (`app/src/lib/taste/taxonomyMap.js`). The place linker (`app/src/lib/linking/`) turns a messy mention into a catalogue place. `services/intelligence/` serves `/tag`, `/link`, `/similar`, `/taxonomy` and `/profile` over the same code; `services/mcp/` offers four read-only tools over the shipped data.

Full rules, formulas and thresholds (read these, do not copy them):

- [Travel taxonomy and tagging](../HANDBOOK.md#travel-taxonomy-and-tagging)
- [Taste profile with validation](../HANDBOOK.md#taste-profile-with-validation)
- [Place linking](../HANDBOOK.md#place-linking)
- [Carta Intelligence API](../HANDBOOK.md#carta-intelligence-api)
- [Carta MCP server](../HANDBOOK.md#carta-mcp-server)
- [../ai/taxonomy.md](../ai/taxonomy.md) and [../ai/taxonomy-labelling-guide.md](../ai/taxonomy-labelling-guide.md)

## Files

App: continent-app/src/lib/taste/, continent-app/src/auth/mytrips/TasteChips.jsx, continent-app/src/lib/linking/, continent-app/scripts/eval/taxonomy/, continent-app/scripts/eval/linking/

Pipeline and backend: pipeline/taxonomy/, services/intelligence/, services/mcp/, supabase/migrations/072_taste_profile.sql

MAP.md handbook column: Platform. Latest tasks: T1149 to T1156, T1215.

## Data read and written

The tagger reads the shipped wires under `continent-app/public` and writes `cache/taxonomy/tags.json`; the tags are not on the wire yet (register row T1150-d). The taste profile keeps verdicts on the device (`carta.taste.v1`) and, once migration 072 is live, in `account_things`. The linker reads `public/app_data.json`, `search_index.json` and `search/ask/lexicon.json`.

## Logic IDs used

None yet. Rule IDs and `docs/logic/` arrive with ROADMAP item B3.

## Quality checks

Python: `tests/test_taxonomy.py`, `tests/test_taxonomy_tagger.py`, `services/intelligence/tests/` (workflow `intelligence.yml`). App: `continent-app/tests/taxonomyEval.test.mjs`, `continent-app/tests/tasteProfile.test.mjs`, `continent-app/tests/placeLinking.test.mjs`, `continent-app/scripts/verify_taste_profile.mjs`. MCP: `services/mcp/tests/` (workflow `mcp.yml`). Evals: `node scripts/eval/run.mjs taxonomy` and `linking` from `continent-app/`.

## Metrics

Not measured by this doc. The eval figures are in [../reference/evals.md](../reference/evals.md) and the task reports named above.

## Security notes

The Intelligence API needs an API key per caller and rate-limits in memory (one worker); the MCP server is stdio only, read-only, with no secret. Never the Claude API. Threat model sections 13 and 14 in `docs/security/threat-model.md`.

## Known limits

Each linked handbook section ends with a "Limits" paragraph; read those first.

## Open items

The register is the truth. Find this area's open rows with:

```
grep -E "\| T11(49|50|52|53|54|55|56)-|\| T1215-" Execution/_OPEN.md
```

## History

- 2026-11-07, T1215: first written (register rows T1150-h, T1154-g, T1155-e). Earlier history: the task reports T1149 to T1156.

## Last verified

2026-11-07 (T1215): paths exist (`scripts/docs/check_entry_points.py` checks the MAP row), handbook anchors match the headings. Behaviour was not re-run for this doc.
