"""The credit rule, pinned, because another layer's gate depends on it.

Tier: Manual

`credit.owes_credit()` is no longer only the photo engine's business:
pipeline/cycling/export_cycling.py imports it and DELETED its own
licence heuristic in favour of it, so a careless change here removes
photographs from that layer's cards or, far worse, lets uncredited ones
onto them. A shared rule with no test is a rule that drifts.

These are the twelve cases that rule was agreed on (plus two added by
T051), half of them written
by the cycling layer (brief 07) and three of them cases neither of us
could express until the other asked. Two matter more than they look:

  GFDL with no author must FAIL. It is the case a "does the licence
  start with cc by" test gets wrong, because GFDL demands a name and
  does not start with those letters. The rule must therefore be a
  whitelist of EXEMPTIONS, so an unfamiliar licence template fails
  closed rather than open. This is the whole reason for the shape of
  NO_CREDIT_LIC and it must not be inverted into a list of licences
  that require credit.

  A file with NO licence at all must FAIL even when it names an author.
  A name does not make an unlicensed photograph publishable.

    python pipeline/photos/verify_credit.py

ASCII clean, no em dashes, per project convention.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import credit  # noqa: E402

# (record, may we ship it, why it is here)
CASES = [
    ({"license": "CC BY-SA 2.0", "author": "Jane Doe"}, True,
     "cache shape, attributed"),
    ({"license": "CC BY-SA 2.0", "author": ""}, False,
     "cache shape, the whole problem"),
    ({"license": "CC BY-SA 2.0"}, False,
     "author key ABSENT, not merely empty"),
    ({"license": "CC0", "author": ""}, True,
     "CC0 owes nothing, so an empty author is complete"),
    ({"license": "Public domain", "author": ""}, True,
     "public domain owes nothing"),
    ({"license": "", "author": "Jane Doe"}, False,
     "no licence at all, a name does not rescue it"),
    ({"license": "GFDL", "author": ""}, False,
     "GFDL demands a name: the fail-open case"),
    ({"license": "GFDL", "author": "Jane Doe"}, True,
     "GFDL credited"),
    ({"license": "  cc0  ", "author": None}, True,
     "whitespace and a null rather than an empty string"),
    ({"lic": "CC BY-SA 4.0", "by": ""}, False,
     "WIRE shape, uncredited"),
    ({"lic": "CC BY-SA 4.0", "by": "A. Photographer"}, True,
     "WIRE shape, credited"),
    ({"license": "CC BY 2.0", "author": "",
      "no_attribution_required": True}, True,
     "harvest stamped Commons' own answer: nothing owed"),
    ({"license": "CC BY-SA 4.0", "author": " , "}, False,
     "punctuation is not a name (T051: the manifest would store it empty)"),
    ({"lic": "CC BY-SA 3.0", "by": "<span></span>"}, False,
     "an empty HTML wrapper is not a name either"),
]


def _owes_before_t051(img):
    """owes_credit as it stood before T051: the author tested with strip()."""
    lic = (img.get("license") or img.get("lic") or "").strip()
    if not lic:
        return True
    if img.get("no_attribution_required"):
        return False
    if credit.NO_CREDIT_LIC.search(lic):
        return False
    return not str(img.get("author") or img.get("by") or "").strip()


PHOTO_KEYS = ("u", "url", "thumb", "img", "big", "full")


def drift(layers):
    """T051-d: did the clean() change move any published photograph?

    The cycling and dossier exports gate on the same rule, and neither was
    re-checked when T051 changed it. Their published wire is what the last
    export let through under the old rule, so every photo record on it that
    names a licence is run through both versions: a record the old rule
    shipped and the new one refuses is a photograph the next export will
    drop. The per-layer count of credited photo records is the baseline the
    next export's count is compared with.

        python pipeline/photos/verify_credit.py --drift cycling dossier

    Reads CARTA_DATA_ROOT/continent-app/public (default: this checkout)."""
    import json
    import os
    root = Path(os.environ.get("CARTA_DATA_ROOT")
                or Path(__file__).resolve().parents[2])
    public = root / "continent-app" / "public"
    moved_total = 0
    for layer in layers:
        seen = moved = 0
        examples = []
        for f in sorted((public / layer).rglob("*.json")):
            try:
                stack = [json.loads(f.read_text(encoding="utf-8"))]
            except ValueError:
                continue
            while stack:
                node = stack.pop()
                if isinstance(node, list):
                    leaf = node
                    while isinstance(leaf, list) and leaf:
                        leaf = leaf[0]
                    if not isinstance(leaf, (int, float)):   # skip geometry
                        stack.extend(x for x in node
                                     if isinstance(x, (list, dict)))
                    continue
                if not isinstance(node, dict):
                    continue
                stack.extend(v for v in node.values()
                             if isinstance(v, (list, dict)))
                if not any(isinstance(node.get(k), str) for k in PHOTO_KEYS):
                    continue
                if not any(k in node for k in ("by", "author")):
                    continue          # not a photo record's own credit
                rec = dict(node)
                if "licence" in rec and "license" not in rec:
                    rec["license"] = rec["licence"]
                seen += 1
                if not _owes_before_t051(rec) and credit.owes_credit(rec):
                    moved += 1
                    if len(examples) < 3:
                        examples.append(f"{f.name}: {rec.get('author') or rec.get('by')!r}")
        moved_total += moved
        print(f"{layer}: {seen} credited photo records on the wire; "
              f"{moved} shipped under strip() and are refused under clean()"
              + (f" (e.g. {', '.join(examples)})" if examples else ""))
    return moved_total


def main():
    if "--drift" in sys.argv:
        layers = [a for a in sys.argv[sys.argv.index("--drift") + 1:]
                  if not a.startswith("-")] or ["cycling", "dossier"]
        moved = drift(layers)
        print(f"verdicts moved by T051's clean(): {moved}")
        return
    failures = []
    for record, may_ship, why in CASES:
        got = not credit.owes_credit(record)
        if got != may_ship:
            failures.append(f"{why}: expected ship={may_ship}, got {got}")
    for line in failures:
        print(f"  FAIL  {line}")
    if failures:
        raise SystemExit(f"{len(failures)} credit rule failures")
    print(f"credit rule holds across {len(CASES)} cases, including GFDL "
          f"and the unlicensed-but-attributed case")


if __name__ == "__main__":
    main()
