# T1154: Intelligence API (ROADMAP F5)

Round 2 session S70, batch 7. ROADMAP item **F5**.

## Date

2026-11-07

## What changed

Carta now has an Intelligence API: `services/intelligence/`, a FastAPI service with five endpoints over the intelligence code already merged, calling it rather than copying it. `POST /tag` runs the F1 tagger (`pipeline/taxonomy/tagger.py`, `tag_item`) on up to 100 catalogue items or free texts and returns tags with score, uses and quoted evidence; `GET /taxonomy` serves the F1 taxonomy; `POST /link` runs the F4 linker (`continent-app/src/lib/linking/linker.js`) and `POST /profile` the F3 taste profile (`src/lib/taste/profile.js`), both in one long-lived Node child that imports the app's own modules; `POST /similar` is new, a TF-IDF weighted cosine over the tagger's tags with a parent roll-up, returning the shared tags as its reason. Every route but `/healthz` needs an API key (SHA-256 hashes in the environment, no key no start), a token bucket per key limits the rate (429 with Retry-After), logs are JSON lines with request id and key id and never a body, and `/metrics` serves Prometheus counters and latency histograms. The pytest suite (90 tests) runs each endpoint against its eval set as a contract test: through the API the taxonomy eval scores exactly what the tagger scores (R-precision at 5 0.4767 on the seed set, through the one eval runner), the linking eval's 300 mentions score MRR 0.997 and accuracy@1 0.993 (the blessed baseline), the 12 F3 rule cases of `evals/profile.json` hold, and the nearest seed item by `/similar` shares 0.213 gold labels (Jaccard) against 0.053 for a random pair. A Dockerfile and compose file for the box are written; the image was built and run in the session (uid 10001, read-only root, data mounted read-only) and answered all routes. The OpenAPI file is rendered into `docs/reference/openapi.md` by `scripts/docs/build_reference.py`, and the threat model has section 14. Running it on the box is the owner's (T1154-a); no pipeline job calls it yet (T1154-b).

## Research

A research subagent compared the options on PyPI, Docker Hub and nodejs.org on 2026-11-06 (bpcreech.com, PyMiniRacer's docs, was blocked by the session network).

| Question | Options | Pick and why |
|---|---|---|
| Framework | FastAPI 0.162.0 (MIT), Litestar 2.25.0 (MIT), Starlette 1.10 alone (BSD-3), Flask 3.1 + pydantic (BSD-3) (https://pypi.org/project/fastapi/, https://pypi.org/project/litestar/) | FastAPI 0.162.0: Pydantic v2 and OpenAPI built in, security schemes, TestClient, named in the roadmap. Pinned with uvicorn 0.54.0 |
| Rate limit | slowapi 0.1.10 (MIT), fastapi-limiter 0.2.0 (needs Redis), an in-process token bucket per key | Own token bucket (about 40 lines): no dependency, keyed by API key, testable with a fake clock, sends Retry-After. Limit: one worker, resets on restart (T1154-f) |
| Metrics | prometheus_client 0.26.0 (Apache-2.0), prometheus-fastapi-instrumentator 8.1 (ISC), OpenTelemetry SDK 1.45 (https://pypi.org/project/prometheus-client/) | prometheus_client with a small middleware plus bridge counters; OpenTelemetry is a collector too many for one box |
| Logs | stdlib with own JSON formatter, python-json-logger 4.2 (BSD-2), structlog 26.1 | The subagent picked python-json-logger; I kept the stdlib formatter (25 lines) to save a dependency, since the only context is three fields on a contextvar |
| API key | APIKeyHeader with SHA-256 and compare_digest; `id:hash` entries per caller; HMAC signing or JWT (https://fastapi.tiangolo.com/reference/security/) | `id:sha256[:rate]` entries, every hash compared, 401 with no detail; keys from `secrets.token_urlsafe(32)`, so a plain SHA-256 is enough |
| Calling the JS engines | persistent Node child over NDJSON, node per request, PyMiniRacer 0.14 (ISC, no ESM imports), quickjs (unmaintained), a second HTTP service | Persistent child: the real ES modules imported once (0.33 s), then about 1 ms per mention; request ids, timeout, restart on crash |
| Image | python slim plus Node copied from the official node image (same Debian release), a combined third-party image, apt nodejs (https://hub.docker.com/_/python, https://hub.docker.com/_/node) | Multi-stage: `python:3.13-slim-trixie` with `node` from `node:24-trixie-slim` (Node 20 is end of life; 24 is LTS). The subagent suggested Python 3.14; 3.13 matches what the pipeline and CI run here |
| /similar method | TF-IDF weighted cosine, weighted Jaccard, BM25 style | TF-IDF cosine (idf = log(N/df) + 1, weight = tagger score x idf, half to the parent), explainable by its shared tags; pure Python with an inverted index, no numpy needed at 26,588 items |

## Files touched

- Created, `services/intelligence/`: `intelligence/` (`app.py`, `models.py`, `engines.py`, `bridge.py`, `auth.py`, `ratelimit.py`, `logs.py`, `metrics.py`, `config.py`, `openapi_dump.py`, `__init__.py`), `bridge/bridge.mjs`, `evals/profile.json` (12 cases), `tests/` (7 files, 90 tests), `openapi.json` (generated), `requirements.txt`, `requirements-dev.txt`, `Dockerfile`, `Dockerfile.dockerignore`, `compose.yaml`, `.env.example`, `README.md`.
- Created: `.github/workflows/intelligence.yml`, `docs/reference/openapi.md` (generated), this report.
- Modified: `scripts/docs/build_reference.py` (the OpenAPI source: `render_openapi` reads `openapi.json` as text, `openapi.md` fails `--check` when stale), `docs/reference/python.md` (regenerated: it lists the new function), `docs/reference/README.md` (one row for `openapi.md`, the "OpenAPI waits for F5" sentence dropped; this is what T1167-b asked for), `docs/security/threat-model.md` (section 14), `docs/HANDBOOK.md` (section "Carta Intelligence API" and its contents line), `ROADMAP.md` (F5 status), `Execution/_OPEN.md` (rows T1154-a to T1154-g).
- Not touched: the tagger, taxonomy, linker and taste code (called as they are), `MAP.md` (T1154-g), the root `requirements.txt` and `tests/` (the service's tests live with it and run in their own workflow).

## Commands run

```
git fetch origin && git checkout -b p15-s70-intelligence-api origin/p15-round2
pip install fastapi==0.162.0 uvicorn==0.54.0 prometheus-client==0.26.0 httpx==0.28.1 pytest ruff
cd services/intelligence && python -m intelligence.openapi_dump
cd ../.. && python -I scripts/docs/build_reference.py && python -I scripts/docs/build_reference.py --check
ruff check services/intelligence scripts/docs/build_reference.py
python -m pytest services/intelligence/tests -q                      # 90 passed
dockerd &   # the container has Docker; apt inside a build has no network here
pip download -r services/intelligence/requirements.txt -d <scratch>/wheels --only-binary=:all: ...
docker build -f <scratch>/verify.Dockerfile --build-context wheels=<scratch>/wheels -t carta-intelligence:verify .   # the Dockerfile with the pip line pointed at the wheels
docker run --init --read-only --cap-drop ALL ... -v continent-app/public:/app/continent-app/public:ro carta-intelligence:verify   # healthz, 401, /link, /tag, /similar by curl
python -I scripts/docs/drift.py                                      # 0 drift
python -m pytest tests -q $(quarantine deselects)                    # 792 passed, 2 failed (see What broke)
cd continent-app && npm ci && npm test                               # 1712 passed, 1 failed (see What broke)
```

## Config and secrets set

None set anywhere. New variables, read only by the service: `INTEL_API_KEYS` (`id:sha256[:per-minute]`), `INTEL_RATE_PER_MIN` (120), `INTEL_BURST` (30), `INTEL_BRIDGE_TIMEOUT_S` (10), `INTEL_TAGS_PATH`, `CARTA_PUBLIC`, `CARTA_APP`, `INTEL_NODE`. Constants: `FREE_TEXT_LEAD` = 2, `PARENT_SHARE` = 0.5, `MIN_SCORE` = the tagger's search threshold 0.45 (`engines.py`).

## Before/after measurements

Before is the engine called directly (the numbers its own task reported); after is the same eval through the API. Measured in the cloud container on the real shipped wires.

| Metric | Before | After | Delta |
|---|---|---|---|
| Intelligence endpoints | 0 | 5 (`/tag`, `/link`, `/similar`, `/taxonomy`, `/profile`) plus `/healthz`, `/metrics` | +5 |
| Taxonomy eval, seed set, R-precision at 5 (T1150 tagger direct vs `/tag`) | 0.4767 | 0.4767 | 0 (parity test: identical tags and scores) |
| Same, P@5 / recall at 10 / MRR / micro F1 / macro F1 | 0.4533 / 0.5161 / 0.7944 / 0.4375 / 0.3969 | 0.4533 / 0.5161 / 0.7944 / 0.4375 / 0.3969 | 0 |
| Linking eval, 300 mentions, MRR / accuracy@1 (linker direct, baseline.json, vs `/link`) | 0.997 / 0.993 | 0.997 / 0.993 | 0 |
| `/profile` contract cases (F3 rules) | n/a | 12 of 12 | new |
| `/similar`, seed set: gold Jaccard of nearest item (random pair as before) | 0.053 | 0.213 | +0.160 (seed labels by a session, T1154-c) |
| Tests for the service | 0 | 90 passing | +90 |
| Latency p50 / p95, warm (TestClient, ms) | n/a | tag 1 place 5.5 / 6.6; link 1 mention 3.6 / 5.1; link 100 mentions 54.7 / 71.2; similar 3.0 / 4.1; profile 3.2 / 3.9; taxonomy 4.6 / 5.4 | new |
| Cold start | n/a | Node bridge 330 ms (reads app_data, search index, lexicon); first `/tag` about 1.2 s (corpus load) | new |
| Image size | n/a | 387 MB | new |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `Annotated[KeySpec, Depends(guard)]` broke OpenAPI generation | With `from __future__ import annotations`, FastAPI resolves annotations from module globals, and the dependency alias was local to `create_app` | `guard` reads settings, limiter and metrics from `request.app.state` and `Keyed` is module level |
| First Docker build failed at `apt-get install tini` | The build container has no DNS for deb.debian.org here; it also is not needed | Dropped apt: compose sets `init: true` (Docker's own tini) and the README says `docker run --init` |
| A missing Node binary gave 500 | `Popen` raised `FileNotFoundError`, not the bridge's error | `_start` turns `OSError` into `BridgeError`, which answers 503; tested |
| Full pytest: `test_rating_inputs.py::test_beauty_v2_reads_no_register` (JSONDecodeError) and `test_rating_stability.py::test_adding_places_moves_nobody_else` fail; `npm test`: `recommendLevers.test.mjs` "the flight lever re-orders" fails | Not this task: they read the catalogue and rating inputs; this branch changes no app, pipeline or data file (the only non-service code is `scripts/docs/build_reference.py`) | Left for the round 2 orchestrator to compare with `origin/p15-round2` CI; not quarantined here |
| Gotcha | `taxonomy.py` reads mapped tags from `continent-app/public` under the repo root whatever `CARTA_PUBLIC` says | The compose file mounts the data at exactly that path; T1154-d |

## Screens checked

None; no screen changed. The container was checked by curl: `/healthz` 200 with no key, `/tag` 401 with no key, `/link` "cracovia" to Krakow, `/tag` Prague, `/similar` Prague, `/profile` (bearer key) a beach chip, `/metrics` 200, running as uid 10001; after the last code change the image was rebuilt and Docker's HEALTHCHECK reported healthy.

## What is still open

Register rows T1154-a to T1154-g: run it on the box (owner), a first pipeline caller, `/similar` on real labels, `taxonomy.py`'s fixed data root, pip-audit and a digest pin, the in-memory rate limit, and a MAP.md line.

## Owner steps (for the checklist)

- [T1154-a] Start the Intelligence API on the box | the pipeline's batch jobs and any later caller need the service running; nothing calls it until it is up | on the box, from the repo root: `cd services/intelligence && python -c "from intelligence.auth import new_key; k, h = new_key(); print(k); print(h)"`, keep the key for the caller; copy `.env.example` to `.env` and set `INTEL_API_KEYS=pipeline:<hash>:6000`; run `python -I pipeline/taxonomy/tagger.py --all` (30 s) so `/similar` indexes every item; `docker compose -f services/intelligence/compose.yaml up -d --build`; check `curl localhost:8090/healthz` | services/intelligence/README.md, "Run"

## Rollback procedure

`git revert` the T1154 commits. Nothing is one-way: no data, migration or deploy changed. On the box, if started: `docker compose -f services/intelligence/compose.yaml down` and delete `services/intelligence/.env`.
