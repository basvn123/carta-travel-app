"""The one rating configuration and its frozen reference, read by the pipeline
(T754, rating v5 batch R1).

continent-app/config/rating.json holds every number that moves a rating:
weights, tier cutoffs, register weights, quotas. The app will read the same
file (T776). reports/rating_reference_v5.json holds what was MEASURED once on
a reference catalogue and is looked up thereafter: the zlog mean and spread,
the significance percentile breakpoints, the per-class appeal scales, the
fitted-score curves, the fallback coefficients and the fame breakpoints.
Nothing in it is refit on a normal run, so adding a place cannot move
another place's score. Recalibrating is deliberate:

    python pipeline/apply_rating_layer.py --recalibrate --version v5.1

refuses unless config/rating.json already names that version and the
reference does not, so a new reference always arrives with a version bump.

cfg("a.b") returns a value and raises on an unknown key, so a typo fails at
import rather than scoring with a missing number.
"""
import json
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "continent-app" / "config" / "rating.json"


@lru_cache(maxsize=1)
def _config():
    with open(PATH, encoding="utf-8") as f:
        return json.load(f)


def cfg(key):
    node = _config()
    for part in key.split("."):
        if not isinstance(node, dict) or part not in node:
            raise KeyError(f'rating config "{key}" is not in {PATH}')
        node = node[part]
    return node


def section(key):
    """A config block without its "_about" notes."""
    return {k: v for k, v in cfg(key).items() if not k.startswith("_")}


def version():
    return cfg("version")


def reference_path():
    return ROOT / cfg("reference")


# T761 adds nature (nature_tiers.py) and beauty (the frozen gem cutoffs of
# apply_beauty_layer.py, T754-e); T762 adds taste (place_taste_profile.py).
PARTS = ("significance", "rating", "nature", "taste", "beauty")


def part_version(part):
    """The reference version this config reads for one part (T756): a model
    change that leaves a part alone does not force it to be re-measured."""
    return cfg("reference_versions")[part]
_REF_CACHE = {}


def _read_reference():
    path = reference_path()
    if not path.exists():
        return {}
    stamp = path.stat().st_mtime_ns
    hit = _REF_CACHE.get(path)
    if not hit or hit[0] != stamp:
        hit = (stamp, json.loads(path.read_text(encoding="utf-8")))
        _REF_CACHE[path] = hit
    return hit[1]


def reference(part):
    """One frozen part of the reference, checked against the config version.

    Each part is measured by its own script (score_significance.py for
    "significance", apply_rating_layer.py for "rating", nature_tiers.py for
    "nature", place_taste_profile.py for "taste", apply_beauty_layer.py for
    "beauty"), so each carries its own version and a run refuses a part that
    does not match the config.
    """
    got = _read_reference().get(part)
    if not got:
        raise FileNotFoundError(
            f"{reference_path()} has no {part} part: recalibrate it with "
            f"--recalibrate --version {part_version(part)}")
    if got.get("version") != part_version(part):
        raise ValueError(
            f"the {part} part of {reference_path().name} is "
            f"{got.get('version')} but config/rating.json reads "
            f"{part_version(part)}: recalibrate (--recalibrate --version "
            f"{part_version(part)}) or restore the matching config")
    return got


def write_part(part, payload, requested_version):
    """Recalibrate one part. Refuses without an explicit version bump: the
    requested version must be the config's, and the stored part must not
    already carry it, so a recalibration can never pass for a normal run."""
    if part not in PARTS:
        raise ValueError(f"unknown reference part {part}")
    if requested_version != part_version(part):
        raise SystemExit(
            f"REFUSED: --version {requested_version} is not the {part} "
            f"version in config/rating.json ({part_version(part)}); bump the "
            f"config first")
    ref = dict(_read_reference())
    old = (ref.get(part) or {}).get("version")
    if old == requested_version:
        raise SystemExit(
            f"REFUSED: the {part} part is already {old}; a recalibration "
            f"needs a new version in config/rating.json")
    ref["version"] = version()
    ref[part] = dict(payload, version=requested_version)
    path = reference_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(ref, indent=1), encoding="utf-8")
    _REF_CACHE.pop(path, None)
    return path


def int_keys(d):
    return {int(k): v for k, v in d.items()}
