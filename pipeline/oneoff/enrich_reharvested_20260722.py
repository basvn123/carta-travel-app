"""One-off: Wikipedia-enrich ONLY the dests re-harvested on 2026-07-22.

The 791 OTM-saturated dests were invalidated and re-fetched with the paged +
sitelink-ranked otm_items (dead-zone fix: Brussels' Atomium et al). A plain
`harvest_activities.py enrich` would also re-try every historical lookup
failure across all 1,570 dests (multi-hour Wikipedia sweep); this driver
limits the en + local-language passes to the re-harvested ids, then patches.

Run from repo root:  python pipeline/oneoff/enrich_reharvested_20260722.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import harvest_activities as ha  # noqa: E402

BACKUP = ha.ROOT / "cache" / "activities.backup_20260722.json"


def reharvested_ids():
    """The invalidation criterion, replayed against the pre-run backup."""
    backup = json.loads(BACKUP.read_text(encoding="utf-8"))
    ids = set()
    for k, v in backup.items():
        if not v or v.get("source") != "opentripmap":
            continue
        sights = [i for i in (v.get("items_full") or []) if not i.get("active")]
        if len(sights) >= 40:
            ids.add(k)
    return ids


def main():
    ids = reharvested_ids()
    cache = ha.load_json(ha.CACHE)
    dests = ha.load_json(ha.PRIMARY).get("destinations", {})
    print(f"Enriching {len(ids)} re-harvested dests only")

    total = ha._run_enrich_pass(
        cache, "en",
        [(d, i) for d, i in ha._missing_cards(cache, dests) if d in ids])
    max_rounds = max((len(v) for v in ha.COUNTRY_LANG.values()), default=0)
    for round_idx in range(max_rounds):
        by_lang = {}
        for did, it in ha._missing_cards(cache, dests, lang_round=round_idx):
            if did not in ids:
                continue
            lang = ha.COUNTRY_LANG[dests[did]["country"]][round_idx]
            by_lang.setdefault(lang, []).append((did, it))
        for lang, items in by_lang.items():
            total += ha._run_enrich_pass(cache, lang, items)
    print(f"Enrich done: {total} POI occurrences got a Wikipedia card.")
    ha.patch(cache)


if __name__ == "__main__":
    main()
