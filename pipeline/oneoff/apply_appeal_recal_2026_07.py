"""Merge the 2026-07 appeal recalibration overlay into curated_appeal.json.

The July (07d) scoring batch compressed the ceiling: its 842 destinations
max out at appeal 8.5, which after the blend's ~-0.3 drag means none can
reach tier 3 "Worth the journey" - including Pompeii. The overlay
(app_data/appeal_2026_07_recal.json) carries the hand-reviewed corrections;
this script applies them, keeping each entry's existing gem flag and
recording the old value in the why-note trail.

Idempotent. Run before apply_rating_layer.py.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CURATED = ROOT / "app_data" / "curated_appeal.json"
OVERLAY = ROOT / "app_data" / "appeal_2026_07_recal.json"


def main():
    curated = json.loads(CURATED.read_text(encoding="utf-8"))
    overlay = json.loads(OVERLAY.read_text(encoding="utf-8"))
    changed = 0
    for did, patch in overlay.items():
        if did.startswith("_"):
            continue
        rec = curated.get(did)
        if not rec:
            print(f"  skip {did}: not in curated_appeal.json")
            continue
        if rec.get("appeal") == patch["appeal"]:
            continue
        print(f"  {did}: appeal {rec.get('appeal')} -> {patch['appeal']}")
        rec["appeal"] = patch["appeal"]
        rec["why"] = patch.get("why") or rec.get("why")
        changed += 1
    CURATED.write_text(json.dumps(curated, indent=1, ensure_ascii=False),
                       encoding="utf-8")
    print(f"updated {changed} entries. Re-run apply_rating_layer.py to rebuild ratings.")


if __name__ == "__main__":
    main()
