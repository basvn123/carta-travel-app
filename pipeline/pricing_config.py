"""The one price configuration, read by the pipeline (T693, plan phase F3).

continent-app/config/pricing.json holds every rule that moves a price, with
its unit, kind, source, date and review date; the app reads the same file
through continent-app/src/lib/price/config.js. rule(key) returns a rule's
value and raises on an unknown key, so a typo fails at import rather than
building a wire with a missing number.

JSON object keys are strings; int_keys() turns {"2": 0.72} back into the
{2: 0.72} the stays and car code index by.
"""
import json
from functools import lru_cache
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / "continent-app" / "config" / "pricing.json"


@lru_cache(maxsize=1)
def _rules():
    with open(PATH, encoding="utf-8") as f:
        return json.load(f)["rules"]


def rule(key):
    rules = _rules()
    if key not in rules:
        raise KeyError(f'pricing rule "{key}" is not in {PATH}')
    return rules[key]["value"]


def int_keys(d):
    return {int(k): v for k, v in d.items()}
