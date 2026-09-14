"""Region publication quotas and floors. The change that raises coverage.

This replaces the country caps (PUBLISH_MAX=120 gave Spain and Belgium the
same beach budget) with a per region target computed from an opportunity
measure: how much of the thing there actually is. Two distinct numbers,
because confusing them is exactly the standing mountain floor bug:

  quota   how many RATED rows a region should publish. A soft target; the
          score gate still applies. Nothing is invented to hit it.
  floor   the minimum rows of ANY tier the region must publish so its page
          is never empty. Satisfied by `listed` rows when nothing clears
          the rated gate.

And one guard: applicable(). A region is never held to a quota it cannot
meet; Flanders is not failing at mountains, it has none, and the audit
reports that as n/a with the reason rather than as a hole.

The table below IS the model. quotas.model_block() serialises it for the
wire index (the model ships with the data), and the formula strings there
are kept in lockstep with the lambdas here by verify_regions.mjs reading
both.

Usage:

    from quotas import published_target, floor, applicable
    published_target('COAST:ES-LUZ-CADIZ', 'beach')  -> e.g. 17
    floor('ES618', 'beach')                          -> 1
    applicable('BE25', 'mountain')                   -> False

ASCII clean, no em dashes, per project convention.
"""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "pipeline"))

from pipeline_io import load_json  # noqa: E402

OPPORTUNITY = ROOT / "cache" / "regions" / "opportunity.json"

MODEL_VERSION = "region_quota_v1"


class _R:
    """One region's opportunity row with 0.0 for anything unmeasured, so a
    formula never crashes on a region the measures have not reached. A zero
    opportunity yields the lo clamp, never a synthetic reading (no reading
    is not a bad reading)."""

    def __init__(self, vals):
        self._v = vals or {}

    def __getattr__(self, key):
        return self._v.get(key, 0.0)


# The quota table, straight from the brief. `unit` names the honest unit
# for the layer: beaches are budgeted per coastal stretch, mountains per
# GMBA range, the rest per NUTS3 sized region. The formula string is the
# lambda, spelled out for the wire.
QUOTA = {
    "beach": dict(
        unit="coast",
        per_unit=lambda r: r.coast_km / 12,
        formula="coast_km / 12",
        lo=3, hi=60),
    "lake": dict(
        unit="nuts3",
        per_unit=lambda r: r.lakes_over_5ha ** 0.5 * 1.5,
        formula="lakes_over_5ha ** 0.5 * 1.5",
        lo=2, hi=40),
    "mountain": dict(
        unit="range",
        per_unit=lambda r: r.peaks_over_p100 ** 0.4 * 2,
        formula="peaks_over_p100 ** 0.4 * 2",
        lo=2, hi=40),
    "trail": dict(
        unit="nuts3",
        per_unit=lambda r: 4 + 8 * r.protected_share + 6 * r.relief_norm,
        formula="4 + 8 * protected_share + 6 * relief_norm",
        lo=3, hi=45),
    "cycling": dict(
        unit="nuts3",
        per_unit=lambda r: 2 + r.route_km / 60,
        formula="2 + route_km / 60",
        lo=2, hi=30),
}

_opportunity = None


def _table():
    global _opportunity
    if _opportunity is None:
        _opportunity = load_json(OPPORTUNITY, {}) or {}
    return _opportunity


def has_data():
    """Whether the opportunity measures exist. A gate that cannot see them
    must skip the quota step rather than hold every region to a zero."""
    return bool(_table().get("n3"))


def region_row(region_id, unit="nuts3"):
    """The opportunity row for one region id, whichever table holds it."""
    table = _table()
    for key in (unit, "n3", "coast", "range"):
        got = (table.get(key if key != "nuts3" else "n3") or {}).get(region_id)
        if got is not None:
            return _R(got)
    return _R({})


def published_target(region_id, layer):
    """clamp(round(per_unit(region)), lo, hi), or 0 when not applicable."""
    spec = QUOTA[layer]
    if not applicable(region_id, layer):
        return 0
    r = region_row(region_id, spec["unit"])
    raw = spec["per_unit"](r)
    return int(min(spec["hi"], max(spec["lo"], round(raw))))


def applicable(region_id, layer):
    """Never hold a region to a quota it cannot meet. The rules are the
    brief's, verbatim; a coast stretch is applicable to beaches by
    construction and a range to mountains likewise."""
    if region_id.startswith("COAST:"):
        return layer in ("beach", "cycling", "trail")
    if region_id.startswith("GMBA:"):
        return layer in ("mountain", "trail", "cycling")
    r = region_row(region_id)
    if layer == "beach":
        return r.coast_km > 0 or r.lakes_over_20ha > 0
    if layer == "lake":
        return r.lakes_over_5ha > 0
    if layer == "mountain":
        return r.relief_m > 250
    return True  # trail, cycling


def why_not_applicable(region_id, layer):
    """The audit's n/a reason code for a region that is out of scope."""
    if layer == "beach":
        return "no_coast_or_large_lakes"
    if layer == "lake":
        return "no_lakes_over_5ha"
    if layer == "mountain":
        return "relief_below_250m"
    return "not_applicable"


def floor(region_id, layer, level=3):
    """The minimum rows of any tier. Separate from the quota on purpose:
    the floor is what keeps a region page from being empty, and it may be
    satisfied by listed rows when nothing clears the rated gate. Country
    floors stay whatever each layer already sets (COUNTRY_FLOOR is not
    this module's to change)."""
    if not applicable(region_id, layer):
        return 0
    return 3 if level == 2 else 1


def model_block():
    """The quota model for index.json, codes and numbers only."""
    return {
        "version": MODEL_VERSION,
        "quotas": {
            layer: {"unit": spec["unit"], "per_unit": spec["formula"],
                    "lo": spec["lo"], "hi": spec["hi"]}
            for layer, spec in QUOTA.items()
        },
        "floor": {"nuts3": 1, "nuts2": 3,
                  "note": "if applicable; country floors unchanged per layer"},
        "applicable": {
            "beach": "coast_km > 0 or lakes_over_20ha > 0",
            "lake": "lakes_over_5ha > 0",
            "mountain": "relief_m > 250",
            "trail": "always",
            "cycling": "always",
        },
        "opportunity_version": (_table() or {}).get("version", "missing"),
    }


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Show quota and floor for a region")
    ap.add_argument("region_id")
    ap.add_argument("layer", choices=sorted(QUOTA))
    args = ap.parse_args()
    print(f"applicable: {applicable(args.region_id, args.layer)}")
    print(f"quota:      {published_target(args.region_id, args.layer)}")
    print(f"floor:      {floor(args.region_id, args.layer)}")
