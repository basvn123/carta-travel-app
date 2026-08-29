"""More community-picked bests than P18 alone, for the same cost.

Wikidata carries view properties beyond P18, each a single file a person
chose for one aspect of the subject. They are the same quality of signal
as P18 (a human said "this file shows it") and they arrive from the same
Special:EntityData fetch the layers already run, so they are close to
free.

Precedence after P18, per the brief:

  P4640  panoramic image        every category (fills the panorama slot)
  P8592  aerial view            every category
  P5252  winter view            mountains only, where winter sells
  P3451  nighttime view         rarely wanted on any card; fetched so the
                                record is complete, ranked last, and the
                                night-word penalty in the layers' own
                                beauty lore still applies to it

Every file returned here enters the funnel at evidence tier `p18`: the
claim is the same kind of claim. The relevance rejector stays P18-exempt
for them too, and the softened precedence in select.py (bonus, not
autowin) applies unchanged.

ASCII clean, no em dashes, per project convention.
"""

ENTITY_URL = "https://www.wikidata.org/wiki/Special:EntityData/{qid}.json"

# In precedence order. The bool is "wanted on every category"; False means
# only the categories listed in ONLY_FOR.
VIEW_PROPS = (
    ("P18", True),
    ("P4640", True),      # panoramic image
    ("P8592", True),      # aerial view
    ("P5252", False),     # winter view
    ("P3451", True),      # nighttime view, deprioritised by order
)
ONLY_FOR = {"P5252": {"mountain"}}


def view_images(get_json, qid, category=None):
    """[(prop, "File:...jpg")] for one item, in precedence order.

    `get_json` is the layer's polite client (same pacer, same UA). A
    malformed or missing entity answers an empty list, never an error:
    this pass adds candidates, it must not be able to sink an enrich."""
    if not qid:
        return []
    try:
        data = get_json(ENTITY_URL.format(qid=qid)) or {}
        claims = (((data.get("entities") or {}).get(qid) or {})
                  .get("claims")) or {}
    except Exception:
        return []
    out = []
    for prop, everywhere in VIEW_PROPS:
        if not everywhere and category not in ONLY_FOR.get(prop, set()):
            continue
        for claim in claims.get(prop) or []:
            snak = (claim.get("mainsnak") or {})
            if snak.get("snaktype") != "value":
                continue
            name = ((snak.get("datavalue") or {}).get("value"))
            if isinstance(name, str) and name.strip():
                title = name.strip().replace("_", " ")
                if not title.startswith("File:"):
                    title = f"File:{title}"
                out.append((prop, title))
    return out
