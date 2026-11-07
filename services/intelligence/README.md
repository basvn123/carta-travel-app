# Carta Intelligence API (ROADMAP F5, T1154)

One internal HTTP API over Carta's intelligence code: the travel taxonomy and tagger (F1),
the place linker (F4), similar items, and the taste profile (F3). Built on that code, not a
copy of it: the Python tagger and taxonomy are imported from `pipeline/taxonomy/`, the
JavaScript linker and taste profile run in one long-lived Node process (`bridge/bridge.mjs`)
that imports `continent-app/src/lib/linking` and `continent-app/src/lib/taste`.
Handbook: `docs/HANDBOOK.md`, "Carta Intelligence API". Threat model: section 14.
OpenAPI: `openapi.json`, rendered in `docs/reference/openapi.md`.

| Endpoint | Does | Engine |
|---|---|---|
| `POST /tag` | Tags up to 100 catalogue items (layer and id) or free texts on the taxonomy, with scores, uses and quoted evidence; `use` picks the threshold (filter 0.75, profile 0.6, search 0.45, all) | `pipeline/taxonomy/tagger.py` `tag_item` |
| `GET /taxonomy`, `GET /taxonomy/{id}` | The taxonomy, whole, per facet or one node | `pipeline/taxonomy/taxonomy.py` |
| `POST /link` | Links up to 100 messy mentions to catalogue places, with context (country, airport, lat and lon), confidence and "did you mean" | `continent-app/src/lib/linking/linker.js` `linkPlace` |
| `POST /similar` | Items like an item, or carrying given tags: TF-IDF weighted cosine over the tagger's tags, half of each tag's weight rolled up to its parent; filter by layer or a shortlist | `intelligence/engines.py` `SimilarityIndex` over `cache/taxonomy/tags.json` |
| `POST /profile` | The taste chips from a traveller's saves, trips, filters and verdicts, with evidence, ranker weights and the snapshot | `continent-app/src/lib/taste/profile.js` `buildProfile` |
| `GET /healthz` | Liveness, no key | |
| `GET /metrics` | Prometheus text, needs a key (send it as `Authorization: Bearer`) | `prometheus_client` |

Read only: the API stores nothing and writes no file. Request and response bodies are never
logged (`/profile` carries a traveller's own saves and trips).

## Auth, rate limit, logs, metrics

- **Key**: `X-API-Key: <key>` or `Authorization: Bearer <key>`. `INTEL_API_KEYS` holds
  `id:sha256[:per-minute]` entries; only hashes are stored. No key configured, no start.
  Wrong or missing key: 401 `unauthorized`, nothing more.
- **Rate limit**: a token bucket per key, `INTEL_BURST` tokens (30), refilled at
  `INTEL_RATE_PER_MIN` (120) or the key's own rate. A request is one token (a batch of 100
  is one request). Empty: 429 with `Retry-After`. Responses carry `X-RateLimit-Remaining`.
  In memory, one worker: a restart refills every bucket.
- **Logs**: one JSON object per line on stdout: `ts`, `level`, `msg`, `request_id`
  (from `X-Request-Id`, sanitised, else new; echoed back), `key_id`, `route`, `status`, `ms`.
- **Metrics**: `intel_requests_total{route,status}`, `intel_request_seconds{route}`,
  `intel_items_total{route}`, `intel_auth_failures_total`, `intel_rate_limited_total{key_id}`,
  `intel_bridge_calls_total{fn,outcome}`, `intel_bridge_restarts_total`, `intel_similar_index_items`.
- **Node bridge**: started on the first `/link` or `/profile` call (about 0.4 s: it reads
  `app_data.json`, the search index and the Ask lexicon), then about 1 ms per mention. A call
  over `INTEL_BRIDGE_TIMEOUT_S` (10) kills it; the next call starts a new one. While Node is
  down those two endpoints answer 503; the Python ones keep working.

## Configuration

| Variable | Default | What |
|---|---|---|
| `INTEL_API_KEYS` | none (refuses to start) | `id:sha256[:per-minute]`, comma separated |
| `INTEL_RATE_PER_MIN`, `INTEL_BURST` | 120, 30 | the default bucket |
| `INTEL_BRIDGE_TIMEOUT_S` | 10 | per bridge call |
| `INTEL_TAGS_PATH` | `cache/taxonomy/tags.json`, else `tags-sample.json` | the tag file `/similar` indexes |
| `CARTA_PUBLIC` | `continent-app/public` | the shipped data: the tagger's Corpus and its mapped tags both read it (T1154-d) |
| `INTEL_NODE` | `node` | the Node binary |

## Run

Local: `pip install -r requirements-dev.txt`, then from this folder
`INTEL_API_KEYS=dev:$(python -c "import hashlib;print(hashlib.sha256(b'dev').hexdigest())") uvicorn intelligence.app:app --port 8090 --workers 1`
and `curl -H 'X-API-Key: dev' localhost:8090/taxonomy/set.beach`. Swagger UI at `/docs`.

Run on the box (owner step T1154-a): make a key
(`python -c "from intelligence.auth import new_key; k, h = new_key(); print(k); print(h)"`),
copy `.env.example` to `.env` with the hash, run the full tagger once
(`python -I pipeline/taxonomy/tagger.py --all`, 30 s) so `/similar` indexes every item, then
`docker compose -f services/intelligence/compose.yaml up -d --build` from the repo root. The
container listens on 127.0.0.1:8090 only, runs as uid 10001 on a read-only root with the data
mounted read-only, all capabilities dropped.

## Test

`python -m pytest services/intelligence/tests -q` (needs Node 22 or later on the path). The
eval sets are the contract: `/tag` must equal the tagger and score on the taxonomy eval's
seed set through the one eval runner; `/link` must hold the linking eval's 300 mentions within
its tolerance of the blessed baseline; `/profile` runs `evals/profile.json` (the F3 rules as
cases); `/similar` must follow the seed set's gold labels better than chance. After changing a
route or a model, regenerate `openapi.json` with `python -m intelligence.openapi_dump` and the
reference with `python -I scripts/docs/build_reference.py`. CI: `.github/workflows/intelligence.yml`.
