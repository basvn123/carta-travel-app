"""The credit rule, pinned, because another layer's gate depends on it.

`credit.owes_credit()` is no longer only the photo engine's business:
pipeline/cycling/export_cycling.py imports it and DELETED its own
licence heuristic in favour of it, so a careless change here removes
photographs from that layer's cards or, far worse, lets uncredited ones
onto them. A shared rule with no test is a rule that drifts.

These are the twelve cases that rule was agreed on, half of them written
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
]


def main():
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
