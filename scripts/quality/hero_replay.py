"""Hero replay: the ban list run over the shipped heroes (D17, wave 2 step 1.5).

Read-only. For every destination of public/app_data.json it reads the hero
file (`image.url`) and counts the banned ones (pipeline/photos/hero_bans.py,
the place's own name left out). Then it plays the picker: the ladder is the
hero followed by the dossier gallery (`public/dossier/<id>.json`); the first
file that trips no ban is the choice.

- banned_before   heroes that trip a ban today;
- replaced        banned heroes with a clean ladder file (the picker's swap);
- stuck           banned heroes whose whole ladder is banned: they keep their
                  hero and are listed (the T1198-f review list);
- banned_after    banned heroes left after the swap (= stuck);
- stop rule       if more than 5 percent of all heroes would swap, stop (exit 2)
                  and report: the list is then too wide, not the pictures.

    python -X utf8 scripts/quality/hero_replay.py [--public DIR] [--out FILE.json]

Exit 0 when a replay ran under the stop rule; 1 when banned_after is above the
T1198-f allowance in the docstring of the caller (default 0 stuck is not
required: stuck places are listed, not failed). 2 is the stop rule.
"""
from __future__ import annotations

import argparse
import collections
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "continent-app" / "public"
STOP_SHARE = 0.05


def _bans():
    spec = importlib.util.spec_from_file_location("hero_bans", ROOT / "pipeline" / "photos" / "hero_bans.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


hb = _bans()


def gallery(public: Path, did: str) -> list[str]:
    f = public / "dossier" / f"{did.replace(':', '-')}.json"   # dossier_file_base: "gem:tenno" is gem-tenno
    if not f.is_file():
        return []
    try:
        g = json.loads(f.read_text(encoding="utf-8")).get("gallery") or []
    except ValueError:
        return []
    return [x.get("url") for x in g if isinstance(x, dict) and x.get("url")]


def replay(dests: dict, public: Path | None = None) -> dict:
    with_hero = banned = 0
    tags = collections.Counter()
    replaced, stuck = [], []
    for did, d in dests.items():
        url = (d.get("image") or {}).get("url")
        if not url:
            continue
        with_hero += 1
        subject = d.get("city") or d.get("name") or ""
        bad = hb.banned(url, subject)
        if not bad:
            continue
        banned += 1
        tags.update(bad)
        pick = next((u for u in (gallery(public, did) if public else []) if not hb.banned(u, subject)), None)
        row = {"id": did, "place": subject, "country": d.get("iso2"), "file": url.split("?")[0].rsplit("/", 1)[-1][:80],
               "tags": bad}
        (replaced if pick else stuck).append(dict(row, to=(pick or "").split("?")[0].rsplit("/", 1)[-1][:80]) if pick else row)
    res = {"heroes": with_hero, "banned_before": banned, "replaced": len(replaced), "stuck": len(stuck),
           "banned_after": len(stuck), "tags": dict(tags),
           "swap_share": round(len(replaced) / with_hero, 4) if with_hero else 0.0,
           "stop": bool(with_hero) and len(replaced) / with_hero > STOP_SHARE,
           "stuck_list": stuck, "replaced_list": replaced[:60]}
    return res


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Hero replay (D17)")
    ap.add_argument("--public", default=str(PUBLIC))
    ap.add_argument("--out")
    a = ap.parse_args(argv)
    public = Path(a.public)
    dests = json.loads((public / "app_data.json").read_text(encoding="utf-8"))["destinations"]
    res = replay(dests, public)
    if a.out:
        Path(a.out).write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in res.items() if not k.endswith("_list")}, ensure_ascii=False))
    for r in res["stuck_list"][:40]:
        print("stuck (T1198-f):", r["id"], r["place"], r["file"], r["tags"])
    if res["stop"]:
        print(f"STOP: {res['swap_share']:.1%} of heroes would swap, over {STOP_SHARE:.0%}")
        return 2
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
