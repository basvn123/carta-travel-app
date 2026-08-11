"""Central configuration for the ingestion framework.

Everything tunable lives in environment variables, loaded from the repo root
.env (same convention as the pipeline scripts), so endpoints and credentials
change without code edits. Portal URLs rotate; every collector therefore
reads its endpoints through env overrides with sensible defaults.
"""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # dotenv is in requirements.txt; degrade to plain env vars
    load_dotenv = None

# src/ingestion/core/config.py -> repo root is three levels up
ROOT = Path(__file__).resolve().parents[3]

if load_dotenv:
    load_dotenv(ROOT / ".env")

DATA_DIR = Path(os.getenv("INGEST_DATA_DIR", str(ROOT / "data" / "raw")))
STAGING_DIR = Path(os.getenv("INGEST_STAGING_DIR", str(ROOT / "data" / "staging")))

HTTP_TIMEOUT = float(os.getenv("INGEST_HTTP_TIMEOUT", "90"))
HTTP_RETRIES = int(os.getenv("INGEST_HTTP_RETRIES", "5"))
HTTP_BACKOFF_BASE = float(os.getenv("INGEST_HTTP_BACKOFF_BASE", "1.7"))
RATE_LIMIT_SECONDS = float(os.getenv("INGEST_RATE_LIMIT_SECONDS", "1.0"))


def env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    return value if value not in (None, "") else default


def env_list(name: str, default: list[str] | None = None) -> list[str]:
    raw = os.getenv(name)
    if not raw:
        return list(default or [])
    return [part.strip() for part in raw.split(",") if part.strip()]


def env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw in (None, ""):
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw in (None, ""):
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")
