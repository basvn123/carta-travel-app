"""Shared fixtures: one app on the real shipped wires (continent-app/public),
with a tag file for /similar built by the F1 tagger from the 200-item sample
plus the 15 seed eval items."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

SERVICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE))

from fastapi.testclient import TestClient
from intelligence import engines as E
from intelligence.app import create_app
from intelligence.auth import hash_key
from intelligence.config import ROOT, KeySpec, Settings

KEY = "test-pipeline-key-0123456789abcdef"
OTHER = "test-ops-key-abcdef0123456789"
H = {"X-API-Key": KEY}
EVALS = SERVICE / "evals"
APP_EVAL = ROOT / "continent-app" / "scripts" / "eval"


def keys():
    return [KeySpec("pipeline", hash_key(KEY), 100000), KeySpec("ops", hash_key(OTHER))]


@pytest.fixture(scope="session")
def seed_items():
    return E.tagger.eval_items("seed")


@pytest.fixture(scope="session")
def tags_file(tmp_path_factory, seed_items):
    sample = json.loads((ROOT / "cache" / "taxonomy" / "tags-sample.json").read_text(encoding="utf-8"))
    seed = E.tagger.run(seed_items, E.tagger.Corpus(ROOT / "continent-app" / "public"), log=None)
    items = {**sample["items"], **seed["items"]}
    p = tmp_path_factory.mktemp("tags") / "tags.json"
    p.write_text(json.dumps({"items": items}), encoding="utf-8")
    return p


@pytest.fixture(scope="session")
def settings(tags_file):
    return Settings(keys=keys(), rate_per_min=60, burst=30, tags_path=tags_file)


@pytest.fixture(scope="session")
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c
