"""Heat and fire months per place (ROADMAP D20, T1200).

Tier: Scheduled (run_pipeline task heat_fire)

Reads the twelve monthly climate rows in either shape (see _rows: the master's
climate.months dicts, or the wire's compact climate.m tuples) and adds, beside
them:

  climate.heat   month numbers whose mean daytime high is extreme_c or more
  climate.fire   month numbers with wildfire danger
  climate.risk   {"src", "asof", "fire_basis"}: where the months came from

Fire basis, in order:
  1. cache/fire_fwi.json (owner-supplied, see docs/HANDBOOK.md Heat and fire
     months): {"<dest id>": [12 monthly mean Fire Weather Index values]} from
     the EFFIS / Copernicus CEMS fire danger reanalysis. A month at fire_fwi
     (EFFIS "high" class floor) or more is a fire month. "fire_basis": "fwi".
  2. Otherwise a dry-heat proxy from the climate layer itself: a high of
     fire_high_c or more with under fire_dry_mm of rain. "fire_basis": "dryheat".
     It is a proxy, and the app says so ("dry heat" wording, never a forecast).

Every threshold is the pricing.json rule `when.heat`. `best` is NOT changed
here: the app drops heat and fire months from the best months for families
and heat avoiders (continent-app/src/lib/heatRisk.js), so the data stays one
truth for every traveller. Idempotent. Keeps the block's `_src` and `_asof`.

Usage: python pipeline/heat_fire.py [app_data.json ...]
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline_io import atomic_write_json
from pricing_config import rule

ROOT = Path(__file__).resolve().parents[1]
FWI = ROOT / "cache" / "fire_fwi.json"
DEFAULT_TARGETS = [
    ROOT / "app_data" / "app_data.json",
    ROOT / "continent-app" / "public" / "app_data.json",
]
RULE = rule("when.heat")


def heat_months(rows, extreme_c=None):
    """Months (1 to 12) whose mean daytime high is extreme_c or more."""
    lim = RULE["extreme_c"] if extreme_c is None else extreme_c
    return [i + 1 for i, r in enumerate(rows) if isinstance(r[0], (int, float)) and r[0] >= lim]


def fire_months(rows, fwi=None):
    """(months, basis). `fwi` is twelve monthly mean FWI values or None."""
    if isinstance(fwi, list) and len(fwi) == 12 and any(isinstance(v, (int, float)) for v in fwi):
        return [i + 1 for i, v in enumerate(fwi) if isinstance(v, (int, float)) and v >= RULE["fire_fwi"]], "fwi"
    out = []
    for i, r in enumerate(rows):
        hi, mm = r[0], r[2]
        if isinstance(hi, (int, float)) and isinstance(mm, (int, float)) \
                and hi >= RULE["fire_high_c"] and mm < RULE["fire_dry_mm"]:
            out.append(i + 1)
    return out, "dryheat"


def _rows(climate):
    """Twelve [t_high, t_low, precip_mm, comfort] rows, or None.

    D20 (wave 1, V-8): the master (app_data/app_data.json, what the box runs
    this task on) keeps climate.months as dicts; only the wire has the
    compact climate.m tuples, which sync-data.mjs builds. Reading `m` alone
    made the task a no-op on the master, so no heat or fire month ever
    reached the wire."""
    rows = climate.get("m")
    if isinstance(rows, list) and len(rows) == 12:
        return rows
    months = climate.get("months")
    if isinstance(months, list) and len(months) == 12 and all(isinstance(m, dict) for m in months):
        return [[m.get("t_high"), m.get("t_low"), m.get("precip_mm"), m.get("comfort")] for m in months]
    return None


def annotate(climate, fwi=None, asof=None):
    """Add heat/fire/risk to one climate block in place. Returns True if it has months."""
    rows = _rows(climate)
    if rows is None:
        return False
    fire, basis = fire_months(rows, fwi)
    climate["heat"] = heat_months(rows)
    climate["fire"] = fire
    climate["risk"] = {"src": "climate+fwi" if basis == "fwi" else "climate", "fire_basis": basis,
                       "asof": asof or datetime.now(timezone.utc).date().isoformat()}
    return True


def patch(path, fwi_all=None):
    if not path.exists():
        print(f"  skip (missing): {path}")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    n = hot = burn = 0
    for did, dest in data.get("destinations", {}).items():
        c = dest.get("climate")
        if isinstance(c, dict) and annotate(c, (fwi_all or {}).get(did)):
            n += 1
            hot += bool(c["heat"])
            burn += bool(c["fire"])
    atomic_write_json(path, data, indent=1, ensure_ascii=False)
    print(f"  {path.name}: {n} places, {hot} with heat months, {burn} with fire months")


def main():
    fwi_all = {}
    if FWI.exists():
        try:
            fwi_all = json.loads(FWI.read_text(encoding="utf-8"))
        except ValueError:
            print("  cache/fire_fwi.json unreadable (LFS pointer?): using the dry-heat proxy")
    for t in [Path(a) for a in sys.argv[1:]] or DEFAULT_TARGETS:
        patch(t, fwi_all)


if __name__ == "__main__":
    main()
