"""One outdoor row for every kind (D7, D24, wave 3).

A trail, a lake, a beach, a mountain and a cycle route reach Around, the place
page and the wire with the same small block, `o`, so that the grade a traveller
reads is the grade the score used. Pure: reads a country-file row after the v5
stamp and returns the block; the stamp pass (nature_tiers.write_kind) writes it
inline and the dossier copies it verbatim.

    {"v5": {"score", "band", "rank"}, "g", "d", "up_m", "km", "min", "rt"}

A key is absent when the kind has no such fact or the row has no value, never
0 and never null: a lake has no climb, and "0 m" is a claim.
"""
import grades

# The keys of `o`, in order.
KEYS = ("v5", "g", "d", "up_m", "km", "min", "rt")
# The index-row keys compose_around and join_nearby copy into a dossier row,
# one list for both. The legacy keys (score, tier, difficulty, ...) ride along
# one release beside `o`; the app reads `o` first.
ROW_COPY_KEYS = ("tier", "score", "thumb", "elev_m", "km_len", "duration_min",
                 "difficulty", "water", "ascent_m", "descent_m", "sac_scale",
                 "o")


def _v5(row):
    v5 = row.get("v5")
    if not v5 or v5.get("score") is None:
        return None
    return {k: v5[k] for k in ("score", "band", "rank") if v5.get(k) is not None}


def _round_trip(rt, loop):
    if rt in ("loop", "figure8", "point", "out_back"):
        return rt
    if loop is True:
        return "loop"
    return None


def outdoor_row(kind, row):
    """The `o` block for one row of `kind`, or {} when nothing is known."""
    out = {}
    v5 = _v5(row)
    if v5:
        out["v5"] = v5
    if kind == "trails":
        f = row.get("f") or {}
        out.update(
            g=f.get("g") if f.get("g") in grades.GRADE_RANK else None,
            d=f.get("d"),
            up_m=row.get("ascent_m"),
            km=round(row["distance_m"] / 1000, 1) if row.get("distance_m") else None,
            min=row.get("duration_min"),
            rt=_round_trip(f.get("rt"), row.get("is_loop")),
        )
    elif kind == "cycling":
        out.update(
            d=row.get("days"),
            up_m=row.get("asc"),
            km=row.get("km"),
            min=(row.get("dur") or {}).get("min"),
            rt=_round_trip(row.get("rt"), row.get("loop")),
        )
    elif kind == "mountains":
        diff = row.get("diff") or {}
        # An estimate is not a fact (nature_tiers.facts_of drops it too).
        out["g"] = None if diff.get("est") else grades.MOUNTAIN_DIFFICULTY.get(diff.get("k"))
    return {k: out[k] for k in KEYS if out.get(k) is not None}
