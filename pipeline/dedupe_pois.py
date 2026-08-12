"""dedupe_pois.py - master-level POI dedupe, index-stable.

The day planner already collapses near-duplicate POIs at runtime
(canonicalPoiIndices in continent-app/src/planner/dayDraft.js) by SUPPRESSING
indices, never reindexing, because saved plans reference items_full by stable
index. This pass applies the same identity rules to the master itself so that:

  * the surviving entry carries the UNION of the group's signals (wiki, img,
    desc, heritage, active) - richer input for scoring and cards;
  * duplicate entries are tagged `dup: true` so scoring quotas, exports and
    audits can skip them;
  * nothing is deleted or reordered - saved plans stay valid, and the UI's
    runtime dedupe keeps working unchanged.

Identity rules (a Python port of poiIdentityKeys + the fuzzy pass, but
STRICTER than the UI: at the master level a false merge permanently degrades
the record, while the UI's runtime suppression is recoverable, so the img and
geo keys demand name corroboration here):
  core   same stopword-stripped proper-name core within the same kind FAMILY
         ("Castello di Vezio" / "Castle of Vezio")
  img    the exact same thumbnail URL on 2 entries (3+ users of one URL is a
         harvester fallback photo), within 250 m AND sharing a name token
  geo    same raw kind in the same ~110 m rounding cell AND sharing a name
         token (else adjacent Grand-Place houses / one-site museums weld)
  fuzzy  trigram name similarity >= 0.82 within 250 m

Usage:
    python dedupe_pois.py --dry          # report only
    python dedupe_pois.py                # tag + merge, atomic master write
"""
import argparse
import json
import math
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

from pipeline_io import atomic_write_json, load_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app_data" / "app_data.json"

DUPE_RADIUS_KM = 0.25
FUZZY_SIM = 0.82

# Ports of the dayDraft.js vocabularies. Keep the two in sync when editing.
NAME_STOPWORDS = set("""
di da de del della dei delle des du the of a la le il lo los las el
and et e y van der den am im zur w na i z ze przy v u nad pod pri ob
in ul ulica ulicy pw im imienia wezwaniem
castle castello castel chateau schloss burg castillo zamek hrad kasteel
castelo castelul dvorac grad var kastely slott slot linna pilis pils loss
church chiesa iglesia eglise kirche kerk kosciol parafia cerkiew kostel
kostol chram crkva cerkev biserica igreja templom kirke kyrka kyrkja
kirkko kirik baznica baznycia pfarrkirche parroquia parrocchia paroisse
parish parochie cathedral cattedrale catedral cathedrale dom duomo katedra
katedrala catedrala kathedraal domkirke domkyrka szekesegyhaz se
basilica bazylika bazilika basiliek chapel cappella chapelle kapelle
kaplica kaple kaplnka kapolna capela kapel ermita
monastery monastero monasterio monastere kloster klooster klasztor klaster
klastor kolostor samostan manastir manastire manastirea mosteiro convento
couvent convent sanktuarium santuario priory minster munster
museum museo musee muzeum museu muzeul muziejus
palace palazzo palais palast palacio palac palota paleis palatul
tower torre tour turm toren wieza vez torony toranj turnul torn bokstas
bridge ponte pont brucke brug most hid podul bro
square piazza place platz plein plaza plac rynek namesti namestie ter trg
piata praca markt
garden gardens giardino jardin garten ogrod zahrada kert jardim tuin
park parco parc abbey abbazia abbaye abdij opactwo
fort fortress fortezza forteresse festung
saint santa santo san sant st sainte santi sw swietego swietej swietych
sv svateho svaty svata svate sveti sveta svete svetog svetega szent sankt
sao sint sfantul sfanta heilige heiligen
ratusz radnice radnica rathaus
house maison casa huis haus hus
""".split())

KIND_FAMILIES = {
    "church": "worship", "cathedral": "worship", "basilica": "worship",
    "chapel": "worship", "monastery": "worship", "convent": "worship",
    "abbey": "worship", "synagogue": "worship", "mosque": "worship",
    "temple": "worship", "shrine": "worship",
    "castle": "castle", "fortress": "castle", "citadel": "castle",
    "fort": "castle",
    "ancient site": "ruins", "ruins": "ruins", "roman site": "ruins",
    "museum": "museum", "gallery": "museum",
}

_FOLD = [("ł", "l"), ("ø", "o"), ("đ", "d"), ("ð", "d"), ("æ", "ae"),
         ("œ", "oe"), ("ß", "ss"), ("þ", "th"), ("ħ", "h")]
_PAREN = re.compile(r"\([^)]*\)")
_NONAZ = re.compile(r"[^a-z0-9\s]")


def name_core(name):
    s = _PAREN.sub(" ", name or "")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    for a, b in _FOLD:
        s = s.replace(a, b)
    s = _NONAZ.sub(" ", s)
    return " ".join(w for w in s.split() if w not in NAME_STOPWORDS)


def kind_family(kind):
    k = (kind or "").lower()
    return KIND_FAMILIES.get(k, k)


def trigrams(s):
    s = f"  {s} "
    return {s[i:i + 3] for i in range(len(s) - 2)}


def tri_sim(a, b):
    ta, tb = trigrams(a), trigrams(b)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    return inter / (len(ta) + len(tb) - inter)


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = (math.sin(dphi / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2)
    return 2 * R * math.asin(min(1.0, math.sqrt(h)))


def dupe_rank(it):
    """Mirror of the UI's dupeRank/poiScore preference for the survivor."""
    r = float(it.get("rate") or 0)
    if it.get("heritage"):
        r += 0.6
    if it.get("wiki"):
        r += 0.35 + 0.05
    if it.get("img"):
        r += 0.15 + 0.02
    if it.get("desc"):
        r += 0.03
    p = it.get("pop")
    if isinstance(p, (int, float)) and p > 0:
        r += min(1.0, math.log10(p + 1) / 3.3)
    return r


MERGE_FIELDS = ("wiki", "img", "img_src", "desc", "heritage", "active")


def dedupe_dest(items):
    """Union-find over one destination's items. Returns list of groups
    (index lists) with 2+ members."""
    n = len(items)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(a, b):
        a, b = find(a), find(b)
        if a != b:
            parent[b] = a

    years = [set(re.findall(r"\b(1[0-9]{3}|20[0-2][0-9])\b", it.get("name") or ""))
             for it in items]

    def year_clash(i, j):
        """Two names carrying different explicit years are different things
        (battles, expositions), even though nameCore strips parentheses."""
        return years[i] and years[j] and not (years[i] & years[j])

    def close(i, j, km):
        a, b = items[i], items[j]
        la, lo = a.get("lat"), a.get("lon")
        lb, ob = b.get("lat"), b.get("lon")
        if not all(isinstance(v, (int, float)) for v in (la, lo, lb, ob)):
            return False
        return haversine_km(la, lo, lb, ob) <= km

    # exact identity keys
    img_users = defaultdict(list)
    keymap = defaultdict(list)
    geo_cells = defaultdict(list)
    cores = []
    toks = []
    for i, it in enumerate(items):
        img = it.get("img")
        if img:
            img_users[img].append(i)
        core = name_core(it.get("name"))
        cores.append(core)
        toks.append(set(core.split()))
        if core and len(core) >= 3:
            keymap[f"core:{kind_family(it.get('kind'))}::{core}"].append(i)
        la, lo = it.get("lat"), it.get("lon")
        if isinstance(la, (int, float)) and isinstance(lo, (int, float)):
            cell = (round(la * 1000) / 1000, round(lo * 1000) / 1000)
            geo_cells[f"{(it.get('kind') or '').lower()}@{cell}"].append(i)
    # Corroboration tokens must be DISTINCTIVE: a token shared by many of the
    # dest's POIs (the city's own name, a district) is no evidence two entries
    # are one place (port of dayDraft's document-frequency filter).
    df = defaultdict(int)
    for t in toks:
        for w in t:
            df[w] += 1
    max_df = max(3, math.ceil(n * 0.08))
    toks = [{w for w in t if df[w] < max_df} for t in toks]
    # the name-core key is identity on its own (that IS the name matching)
    for idxs in keymap.values():
        for x in range(len(idxs)):
            for y in range(x + 1, len(idxs)):
                if not year_clash(idxs[x], idxs[y]):
                    union(idxs[x], idxs[y])
    # img and geo-cell keys need a shared name token: without corroboration
    # they weld neighbours (a fallback photo used twice, adjacent same-kind
    # buildings in one ~110 m cell).
    for img, idxs in img_users.items():
        if len(idxs) == 2:            # 3+ users = fallback photo, not identity
            i, j = idxs
            if (toks[i] & toks[j]) and close(i, j, DUPE_RADIUS_KM) \
                    and not year_clash(i, j):
                union(i, j)
    for idxs in geo_cells.values():
        for x in range(len(idxs)):
            for y in range(x + 1, len(idxs)):
                i, j = idxs[x], idxs[y]
                if (toks[i] & toks[j]) and not year_clash(i, j):
                    union(i, j)

    # fuzzy pass: near-identical names within 250 m (geo-blocked grid)
    grid = defaultdict(list)
    for i, it in enumerate(items):
        la, lo = it.get("lat"), it.get("lon")
        if isinstance(la, (int, float)) and isinstance(lo, (int, float)) and cores[i]:
            grid[(int(la / 0.003), int(lo / 0.005))].append(i)
    for key, cell in grid.items():
        neigh = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                neigh.extend(grid.get((key[0] + dx, key[1] + dy), []))
        for i in cell:
            for j in neigh:
                if j <= i or find(i) == find(j):
                    continue
                if haversine_km(items[i]["lat"], items[i]["lon"],
                                items[j]["lat"], items[j]["lon"]) > DUPE_RADIUS_KM:
                    continue
                if tri_sim(cores[i], cores[j]) >= FUZZY_SIM \
                        and not year_clash(i, j):
                    union(i, j)

    groups = defaultdict(list)
    for i in range(n):
        groups[find(i)].append(i)
    return [g for g in groups.values() if len(g) > 1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    data = load_json(DATA)
    dests = data["destinations"]
    tagged = merged_fields = groups_total = 0
    examples = []
    for did, d in dests.items():
        items = (d.get("activities") or {}).get("items_full") or []
        if len(items) < 2:
            continue
        for g in dedupe_dest(items):
            groups_total += 1
            winner = max(g, key=lambda i: dupe_rank(items[i]))
            w = items[winner]
            rates = [items[i].get("rate") or 0 for i in g]
            if (w.get("rate") or 0) < max(rates):
                w["rate"] = max(rates)
            for i in g:
                if i == winner:
                    continue
                loser = items[i]
                for f in MERGE_FIELDS:
                    if loser.get(f) and not w.get(f):
                        w[f] = loser[f]
                        merged_fields += 1
                if not loser.get("dup"):
                    loser["dup"] = True
                    tagged += 1
            if len(examples) < 15:
                names = " | ".join(items[i].get("name") or "?" for i in g)
                examples.append(f"{did}: [{names}] -> keep "
                                f"'{w.get('name')}'")

    print(f"{groups_total} duplicate groups, {tagged} POIs newly tagged dup, "
          f"{merged_fields} fields merged into winners")
    for line in examples:
        print(f"   {line}")
    if args.dry:
        print("dry run: master not written")
        return
    atomic_write_json(DATA, data)
    print(f"master written -> {DATA}")


if __name__ == "__main__":
    main()
