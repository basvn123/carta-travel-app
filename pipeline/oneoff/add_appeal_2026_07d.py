"""Merge curated_appeal entries for the 2026-07d Europe-wide research batch
(842 new dests researched by region agents; appeal 0-10 editorial traveller-appeal,
gem=True only for under-the-radar spots).
Reads app_data/appeal_2026_07d.json: { "gem:slug": [appeal, gem, why], ... }
Idempotent: overwrites the keys it owns, leaves the rest untouched."""
import json
from pathlib import Path

P = Path("app_data/curated_appeal.json")
SRC = Path("app_data/appeal_2026_07d.json")

new = json.loads(SRC.read_text(encoding="utf-8"))
data = json.loads(P.read_text(encoding="utf-8"))
before = len(data)
for k, (appeal, gem, why) in new.items():
    data[k] = {"appeal": appeal, "gem": bool(gem), "why": why}
P.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"curated_appeal: {before} -> {len(data)} entries ({len(new)} written)")
