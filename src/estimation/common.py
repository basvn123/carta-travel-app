"""Shared paths + IO helpers for the estimation layer (ground calibration).

The fare model paths and snapshot helpers were removed in T511 with the old
flight fare logic."""
import json
from pathlib import Path
import os

# src/estimation/common.py -> repo root is two levels up
ROOT = Path(__file__).resolve().parents[2]

DATA = ROOT / "data"
RAW_DIR = Path(os.getenv("INGEST_DATA_DIR", str(DATA / "raw")))


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def dump_json(path, obj, indent=2):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=indent), encoding="utf-8")
