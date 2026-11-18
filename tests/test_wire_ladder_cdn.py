"""T052-d: the CDN mode of pipeline/photos/wire_ladder.py.

Every export run_pipeline.py starts joins the image ladder from the CDN. These
tests pin the three outcomes without the network: a good manifest is used and
kept as the last good copy, a 404 means no ladder, and a network failure falls
back to the last good copy (or to no ladder when there is none)."""

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load():
    spec = importlib.util.spec_from_file_location(
        "wire_ladder_under_test", ROOT / "pipeline" / "photos" / "wire_ladder.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


MANIFEST = {"schema": "carta.img-manifest.v1", "layer": "beaches", "sources": {}}


def test_a_good_manifest_is_used_and_kept(tmp_path):
    wl = _load()
    body = json.dumps(MANIFEST).encode()
    path = wl.cdn_manifest("beaches", fetch=lambda url: (200, body), local_dir=tmp_path)
    assert path == tmp_path / "beaches.json"
    assert json.loads(path.read_text())["schema"] == "carta.img-manifest.v1"


def test_a_404_means_no_ladder_even_with_an_old_copy(tmp_path):
    wl = _load()
    (tmp_path / "lakes.json").write_text(json.dumps(dict(MANIFEST, layer="lakes")))
    assert wl.cdn_manifest("lakes", fetch=lambda url: (404, b""), local_dir=tmp_path) is None


def test_a_network_failure_uses_the_last_good_copy(tmp_path):
    wl = _load()
    (tmp_path / "mountains.json").write_text(json.dumps(dict(MANIFEST, layer="mountains")))
    path = wl.cdn_manifest("mountains", fetch=lambda url: (0, b""), local_dir=tmp_path)
    assert path == tmp_path / "mountains.json"


def test_a_network_failure_without_a_copy_means_no_ladder(tmp_path):
    wl = _load()
    assert wl.cdn_manifest("beaches", fetch=lambda url: (503, b""), local_dir=tmp_path) is None


def test_a_wrong_manifest_is_not_used(tmp_path):
    wl = _load()
    body = json.dumps(dict(MANIFEST, layer="lakes")).encode()
    assert wl.cdn_manifest("beaches", fetch=lambda url: (200, body), local_dir=tmp_path) is None


def test_off_and_unset_join_nothing():
    wl = _load()
    assert wl.load("beaches", "off") is None
    assert wl.load("beaches", "") is None


def test_the_cli_default_follows_the_environment(monkeypatch):
    import argparse
    wl = _load()
    monkeypatch.setenv("CARTA_IMG_MANIFEST", "cdn")
    p = argparse.ArgumentParser()
    wl.add_arguments(p)
    assert p.parse_args([]).img_manifest == "cdn"
    monkeypatch.delenv("CARTA_IMG_MANIFEST")
    p = argparse.ArgumentParser()
    wl.add_arguments(p)
    assert p.parse_args([]).img_manifest == ""
