"""The Carta Intelligence API (T1154, ROADMAP F5): FastAPI app.

    uvicorn intelligence.app:app --host 0.0.0.0 --port 8090 --workers 1

Endpoints (OpenAPI in docs/reference/openapi.md):
  POST /tag        F1 tagger (pipeline/taxonomy/tagger.py) on catalogue items or free text
  GET  /taxonomy   F1 taxonomy (pipeline/taxonomy/carta_taxonomy.yaml)
  POST /link       F4 place linker (continent-app/src/lib/linking) through the Node bridge
  POST /similar    TF-IDF cosine over the tagger's tags (engines.SimilarityIndex)
  POST /profile    F3 taste profile (continent-app/src/lib/taste/profile.js) through the bridge
  GET  /healthz    no key; GET /metrics, Prometheus text, needs a key

Every endpoint but /healthz needs an API key (X-API-Key or Authorization:
Bearer) and is rate limited per key. One worker: the rate limit and the
Node bridge live in the process.
"""
from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from . import __version__
from . import engines as E
from . import models as M
from .auth import match_key
from .bridge import BridgeError, NodeBridge
from .config import KeySpec, Settings
from .logs import ctx, setup
from .metrics import Metrics
from .ratelimit import TokenBucket

DESCRIPTION = """Carta Intelligence: the travel taxonomy, tagging, place linking, similar items
and the taste profile as one internal API (ROADMAP F5). Read only: nothing is stored, and
no request or response body is logged. Runs on the build box for the pipeline's batch jobs;
not exposed to travellers. Auth: an API key in `X-API-Key` (or `Authorization: Bearer`).
Rate limit: a token bucket per key; 429 with `Retry-After` when empty."""

KEYED = {401: {"description": "Missing or wrong API key"},
         429: {"description": "Rate limited; wait Retry-After seconds"}}
BRIDGED = {**KEYED, 503: {"description": "The Node bridge (linker or taste profile) is unavailable"}}

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False, description="The caller's API key")
bearer = HTTPBearer(auto_error=False, description="The same key as a bearer token (for Prometheus)")


def guard(request: Request, key: Annotated[str | None, Depends(api_key_header)],
          cred: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]) -> KeySpec:
    """The key check and the rate limit, before every endpoint but /healthz."""
    st = request.app.state
    spec = match_key(key or (cred.credentials if cred else None), st.settings.keys)
    if spec is None:
        st.metrics.auth_failures.inc()
        raise HTTPException(401, "unauthorized", headers={"WWW-Authenticate": "Bearer"})
    c = ctx.get()
    if c is not None:
        c["key_id"] = spec.key_id
    ok, retry, left = st.limiter.take(spec.key_id, spec.rate_per_min)
    request.state.rate_left = left
    if not ok:
        st.metrics.rate_limited.labels(spec.key_id).inc()
        raise HTTPException(429, "rate limited", headers={"Retry-After": str(int(retry))})
    return spec


Keyed = Annotated[KeySpec, Depends(guard)]


def create_app(settings: Settings | None = None, bridge: NodeBridge | None = None) -> FastAPI:
    s = settings or Settings.from_env()
    if not s.keys:
        raise RuntimeError("INTEL_API_KEYS is empty: the API refuses to start without a key (fail closed)")
    log = setup()
    metrics = Metrics()
    limiter = TokenBucket(s.rate_per_min, s.burst)
    br = bridge or NodeBridge(s.node, s.public, s.app, s.bridge_timeout_s, metrics, log)
    tg = E.Tagger(s.public)
    sim = E.SimilarityIndex.from_file(s.tags_path)
    metrics.similar_items.set(sim.n)
    nodes = E.tx.nodes()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        log.info("start", extra={"items": sim.n})
        yield
        br.stop()
        log.info("stop")

    app = FastAPI(title="Carta Intelligence API", version=__version__, description=DESCRIPTION, lifespan=lifespan,
                  docs_url="/docs", redoc_url=None)
    app.state.settings, app.state.metrics, app.state.bridge, app.state.similar = s, metrics, br, sim
    app.state.limiter, app.state.tagger = limiter, tg

    @app.middleware("http")
    async def observe(request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        rid = "".join(ch for ch in rid if ch.isalnum() or ch in "-_")[:64] or uuid.uuid4().hex[:16]
        token = ctx.set({"request_id": rid})
        t0 = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
        finally:
            ms = (time.perf_counter() - t0) * 1000
            route = getattr(request.scope.get("route"), "path", None) or "unmatched"
            metrics.requests.labels(route, str(status)).inc()
            metrics.latency.labels(route).observe(ms / 1000)
            log.info("request", extra={"route": route, "method": request.method, "status": status, "ms": round(ms, 1)})
            ctx.reset(token)
        response.headers["X-Request-Id"] = rid
        left = getattr(request.state, "rate_left", None)
        if left is not None:
            response.headers["X-RateLimit-Remaining"] = str(left)
        return response

    @app.exception_handler(BridgeError)
    async def bridge_down(_request: Request, exc: BridgeError):
        log.warning("bridge error", extra={"error": str(exc)[:200]})
        return JSONResponse({"detail": "linker or profile engine unavailable"}, status_code=503)

    def label(t: str) -> str:
        return ((nodes.get(t) or {}).get("label") or {}).get("en") or t

    def shape(tags: list[dict], use: str, evidence: bool) -> list[M.Tag]:
        out = []
        for t in tags:
            if use != "all" and use not in t["uses"]:
                continue
            out.append(M.Tag(tag=t["tag"], label=label(t["tag"]), facet=(nodes.get(t["tag"]) or {}).get("facet"),
                             score=t["score"], by=t["by"], uses=t["uses"], implied=t["implied"],
                             evidence=t["evidence"] if evidence else []))
        return out

    @app.get("/healthz", response_model=M.Health, tags=["ops"], summary="Liveness, no key")
    def healthz():
        return M.Health(ok=True, version=__version__, bridge=br.alive(), similar_index_items=sim.n)

    @app.get("/metrics", responses=KEYED, tags=["ops"], summary="Prometheus metrics", response_class=Response)
    def metrics_view(_k: Keyed):
        return Response(generate_latest(metrics.registry), media_type=CONTENT_TYPE_LATEST)

    @app.post("/tag", responses=KEYED, response_model=M.TagResponse, tags=["intelligence"],
              summary="Tag catalogue items or free text on the travel taxonomy (F1 tagger)")
    def tag(req: M.TagRequest, _k: Keyed):
        results = []
        for it in req.items:
            if it.id:
                got = tg.tag_catalogue(it.layer, it.id)
                if got is None:
                    results.append(M.TagResult(layer=it.layer, id=it.id, name=None, found=False, n_passages=0, tags=[]))
                    continue
                item, tags, n = got
                results.append(M.TagResult(layer=it.layer, id=it.id, name=item.get("name"), found=True, n_passages=n,
                                           tags=shape(tags, req.use, req.evidence)))
            else:
                tags, n = tg.tag_text(it.layer, it.name or "", it.text or "")
                results.append(M.TagResult(layer=it.layer, id=None, name=it.name, found=True, n_passages=n,
                                           tags=shape(tags, req.use, req.evidence)))
        metrics.items.labels("/tag").inc(len(req.items))
        return M.TagResponse(tagger_version=E.tagger.TAGGER_VERSION, taxonomy_version=E.tx.load()["version"],
                             thresholds=E.USES, results=results)

    @app.get("/taxonomy", responses=KEYED, response_model=M.TaxonomyResponse, tags=["intelligence"], summary="The travel taxonomy")
    def taxonomy(_k: Keyed, facet: Annotated[str | None, Query(max_length=40, description="Only this facet")] = None):
        return E.taxonomy_doc(facet)

    @app.get("/taxonomy/{node_id}", responses=KEYED, response_model=M.TaxonomyNode, tags=["intelligence"], summary="One taxonomy node")
    def taxonomy_node(node_id: str, _k: Keyed):
        for n in E.taxonomy_doc()["nodes"]:
            if n["id"] == node_id:
                return n
        raise HTTPException(404, "no such node")

    @app.post("/link", responses=BRIDGED, response_model=M.LinkResponse, tags=["intelligence"],
              summary="Link messy place mentions to catalogue places (F4 linker)")
    def link(req: M.LinkRequest, _k: Keyed):
        args = {"mentions": [{"mention": m.text, "ctx": (m.ctx.model_dump(exclude_none=True) if m.ctx else {}),
                              "limit": req.limit} for m in req.mentions]}
        rows = br.call("link", args)
        metrics.items.labels("/link").inc(len(req.mentions))
        return M.LinkResponse(results=[M.LinkResult(text=m.text, **r) for m, r in zip(req.mentions, rows)])

    @app.post("/similar", responses=KEYED, response_model=M.SimilarResponse, tags=["intelligence"],
              summary="Items like an item, or carrying given tags (TF-IDF cosine over F1 tags)")
    def similar(req: M.SimilarRequest, _k: Keyed):
        layers = set(req.layers) if req.layers else None
        among = set(req.among) if req.among else None
        if req.item:
            key = f"{req.item.layer}:{req.item.id}"
            vec = sim.vecs.get(key)
            if vec is None:
                got = tg.tag_catalogue(req.item.layer, req.item.id)
                if got is None:
                    return M.SimilarResponse(query=key, index_items=sim.n, found=False, neighbours=[])
                vec = sim.vector_for_tags(got[1])
        else:
            unknown = [t for t in req.tags if t not in nodes]
            if unknown:
                raise HTTPException(422, f"unknown taxonomy ids: {', '.join(unknown[:5])}")
            key = "tags:" + ",".join(req.tags)
            vec = sim.vector_for_tags([{"tag": t, "score": 1.0} for t in req.tags])
        res = sim.query(vec, k=req.k, exclude=key, layers=layers, among=among)
        metrics.items.labels("/similar").inc()
        return M.SimilarResponse(query=key, index_items=sim.n, found=True, neighbours=res)

    @app.post("/profile", responses=BRIDGED, response_model=M.ProfileResponse, tags=["intelligence"],
              summary="The taste profile from a traveller's saves, trips and filters (F3)")
    def profile(req: M.ProfileRequest, _k: Keyed):
        r = br.call("profile", req.model_dump(exclude_none=True))
        metrics.items.labels("/profile").inc()
        return M.ProfileResponse(taxonomy_version=E.tx.load()["version"], **r)

    return app


def __getattr__(name: str):
    # `uvicorn intelligence.app:app` builds the app from the environment on first access,
    # so importing this module (tests, the OpenAPI dump) needs no key.
    if name == "app":
        globals()["app"] = create_app()
        return globals()["app"]
    raise AttributeError(name)
