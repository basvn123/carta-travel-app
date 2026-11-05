# Data index

Where Carta's data contract, sources and licences are documented. Nothing moved: four files here are read by code and stay where they are (see "Read by code" below). Built by T1073 (ROADMAP B2).

## The contract and the wire

| What | Where |
|---|---|
| The master dataset and every layer's fields, schema 19 | [../SCHEMA.md](../SCHEMA.md), whose "Wire contract" table CI checks (`continent-app/scripts/ci/check-contract.mjs`, workflow `schema-contract.yml`) |
| How the master becomes the wire (boot index, country shards, detail files, R2 tier) | handbook section [The data wire](../HANDBOOK.md#the-data-wire-pipeline-to-app) |
| The pinned version | `continent-app/scripts/ci/contract.mjs` (`EXPECTED_SCHEMA_VERSION`) and each layer's writer in `pipeline/` |
| Field level lineage (source, task, file per field) | does not exist yet: ROADMAP B5 |

## Sources and licences

| What | Where |
|---|---|
| Every external source, its licence and where it is credited | [../tos/data_licenses.md](../tos/data_licenses.md), generated from `src/ingestion/core/registry.py` (`python -m src.ingestion.core.ledger --write`; CI runs `--check`, workflow `data-licences.yml`) |
| Credits shown to travellers | `continent-app/src/data/attribution.js`, derived from the ledger |
| Personal data processed (Article 30 record) | [../legal/ARTICLE30.md](../legal/ARTICLE30.md) |
| Licensed photo sources | handbook section [Licensed photo sources and credits](../HANDBOOK.md#licensed-photo-sources-and-credits) |

## Layer notes read by code

| File | Read by |
|---|---|
| [../REGIONS.md](../REGIONS.md) | `continent-app/scripts/verify_regions.mjs` |
| [../LAKES.md](../LAKES.md) | `pipeline/lakes/check_doc.py` |
| [../SCHEMA.md](../SCHEMA.md) | `continent-app/scripts/ci/check-contract.mjs` |
| [../tos/data_licenses.md](../tos/data_licenses.md) | the ledger check (generated, do not edit) |

Do not move or rename these. `REGIONS.md` and `LAKES.md` were written before many later changes and are not re-verified by T1073; rewriting them is an open item in the T1073 report.

## Configuration that shapes numbers

| File | What it holds |
|---|---|
| `continent-app/config/rating.json`, `rating_anchors.json` | rating display and anchors (handbook "Place rating") |
| `continent-app/config/pricing.json` | price engine constants (handbook "Prices and logistics") |
| `continent-app/config/recommend.json` | For you ranking |
| `continent-app/config/slots.json` | not verified here what it configures |
| `reports/rating_reference_v5.json` | the frozen rating calibration (root `reports/`) |
| `reports/coverage_contract.json` | written by `pipeline/regions/coverage.py`, read by the coverage CI gate (`pipeline/regions/coverage_gate.py`, workflow `coverage-contract.yml`); not tracked in git on this branch, not verified why |

## Quality rules

A single quality rules file is planned by ROADMAP B4 (`pipeline/quality/rules.yaml` does not exist in the tree today). Data checks that do exist run as workflows: `golden-set.yml`, `rating-tests.yml`, `coverage-contract.yml`, `trip-validator.yml`, `data-licences.yml`.
