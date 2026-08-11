"""Shared paths + IO helpers for the estimation layer."""
import gzip
import json
import os
from pathlib import Path

# src/estimation/common.py -> repo root is two levels up
ROOT = Path(__file__).resolve().parents[2]

FARES_DIR = ROOT / "continent-app" / "public" / "fares"
APP_DATA = ROOT / "app_data" / "app_data.json"
DATA = ROOT / "data"
HISTORY_DIR = Path(os.getenv("ESTIMATION_HISTORY_DIR", str(DATA / "history" / "fares")))
AIRPORT_META = HISTORY_DIR.parent / "airport_meta.json"
MODELS_DIR = Path(os.getenv("ESTIMATION_MODELS_DIR", str(DATA / "models")))
DEADLETTER_DIR = DATA / "deadletter"
RAW_DIR = Path(os.getenv("INGEST_DATA_DIR", str(DATA / "raw")))
LOGS = ROOT / "logs"

MODEL_PATH = MODELS_DIR / "fare_model.joblib"
METRICS_PATH = MODELS_DIR / "fare_model_metrics.json"
ESTIMATES_PATH = MODELS_DIR / "fare_estimates.json.gz"
DRIFT_REPORT = LOGS / "drift_report.json"


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def dump_json(path, obj, indent=2):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=indent), encoding="utf-8")


def read_snapshot(path):
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return json.load(fh)


def write_snapshot(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")
    with gzip.open(tmp, "wt", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))
    tmp.replace(path)


def snapshot_paths():
    """All archived fare snapshots, oldest first (filenames are ISO dates)."""
    if not HISTORY_DIR.exists():
        return []
    return sorted(HISTORY_DIR.glob("*.json.gz"))


def latest_snapshot_path():
    paths = snapshot_paths()
    return paths[-1] if paths else None


def load_airport_meta():
    """iata -> {iso2, country, lat, lon}; empty dict when never harvested."""
    if AIRPORT_META.exists():
        try:
            return load_json(AIRPORT_META)
        except (OSError, json.JSONDecodeError):
            return {}
    return {}
