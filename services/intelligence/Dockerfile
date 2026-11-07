# Carta Intelligence API (T1154, ROADMAP F5). Build from the repo root:
#   docker build -f services/intelligence/Dockerfile -t carta-intelligence:1.0.0 .
# The shipped data is mounted read-only at run time (compose.yaml), not baked in.
# Node comes from the official image of the same Debian release (multi-stage copy):
# the bridge needs only the node binary, no npm and no node_modules.
# Base images pinned by digest (T1215, register row T1154-e; digests read from Docker Hub on 2026-11-07).
# To move a base: read the new index digest for the tag and change both the tag comment and the digest.
FROM node:24-trixie-slim@sha256:0820eaa85e07d0490446dd01d14707e17e6108a36988cf374899cd057eb3812d AS node

FROM python:3.13-slim-trixie@sha256:09a17cad02668ae61ece136b4fd36ac3849e14f670ebedb637ea3e15580525bc
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN useradd --system --uid 10001 --home /app app
WORKDIR /app
COPY services/intelligence/requirements.txt services/intelligence/requirements.txt
RUN pip install -r services/intelligence/requirements.txt
# The code the API calls, at the same paths as in the repo (ROOT is /app).
COPY pipeline/prompt_registry.py pipeline/prompt_registry.py
COPY pipeline/taxonomy/ pipeline/taxonomy/
COPY prompts/ prompts/
COPY continent-app/src/lib/linking/ continent-app/src/lib/linking/
COPY continent-app/src/lib/taste/ continent-app/src/lib/taste/
COPY services/intelligence/ services/intelligence/
RUN mkdir -p continent-app/public cache/taxonomy && chown -R app /app/cache
USER app
WORKDIR /app/services/intelligence
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8090/healthz', timeout=4).status == 200 else 1)"
# Run with an init process (compose.yaml `init: true`, or `docker run --init`) so the Node child is reaped.
# One worker: the rate limit and the Node bridge live in the process.
CMD ["uvicorn", "intelligence.app:app", "--host", "0.0.0.0", "--port", "8090", "--workers", "1", "--no-access-log", "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1"]
