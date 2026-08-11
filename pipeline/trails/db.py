"""Connection helper for the trails content-lab PostGIS DB (tools/trailslab).

Local-only: the lab runs in Docker on port 5433 and never touches the live
Supabase project. Settings come from the repo-root .env (loaded through
pipeline/env_local.py, real environment variables win) with defaults that
match tools/trailslab/docker-compose.yml:

    TRAILSLAB_HOST=localhost
    TRAILSLAB_PORT=5433
    TRAILSLAB_DB=trailslab
    TRAILSLAB_USER=trailslab
    TRAILSLAB_PASSWORD=trailslab

Usage:
    from db import connect          # scripts inside pipeline/trails/
    with connect() as conn:
        ...
"""

import os
import sys
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
from env_local import load_env  # noqa: E402

DEFAULTS = {
    "TRAILSLAB_HOST": "localhost",
    "TRAILSLAB_PORT": "5433",
    "TRAILSLAB_DB": "trailslab",
    "TRAILSLAB_USER": "trailslab",
    "TRAILSLAB_PASSWORD": "trailslab",
}


def settings():
    """Resolved connection settings as a dict of psycopg keyword args."""
    load_env()
    get = lambda key: os.environ.get(key, DEFAULTS[key])  # noqa: E731
    return {
        "host": get("TRAILSLAB_HOST"),
        "port": int(get("TRAILSLAB_PORT")),
        "dbname": get("TRAILSLAB_DB"),
        "user": get("TRAILSLAB_USER"),
        "password": get("TRAILSLAB_PASSWORD"),
    }


def connect(**overrides):
    """Open a psycopg connection to the trailslab DB.

    Keyword overrides (host, port, dbname, ...) beat the environment,
    which beats the compose-file defaults.
    """
    kwargs = settings()
    # Fail fast when the container is down instead of hanging on the socket.
    kwargs["connect_timeout"] = 10
    kwargs.update(overrides)
    return psycopg.connect(**kwargs)


if __name__ == "__main__":
    cfg = settings()
    shown = {k: ("***" if k == "password" else v) for k, v in cfg.items()}
    print("trailslab connection settings:", shown)
