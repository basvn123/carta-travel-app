"""Place ratings on the D23 validation runner (T1191, ROADMAP D23 Place ratings row).

Repeats T760 (pipeline/external_check.py) on the current ratings with more
references, as a layer on the T1187 runner. The research in T1191 says: keep
each reference separate (no blended "outside score"), match the statistic to
the reference, and review the largest gaps with the references that flag them.

The unit is a place. The population is every rated row of the catalogue
(continent-app/public/app_data.json), plus one item per published-list entry
that resolves to no rated row (a hole in the catalogue). Each place carries
these references, all read from disk:

  pageviews    average daily Wikipedia pageviews (`rating.fame`, harvested by
               pipeline/harvest_pageviews.py; 0 means not measured and is left out). Attention, not opinion. It does
               not move the score (rating_layer.py: hidden-gem flag only), so
               it is not circular, but it follows size: read with the
               population-controlled rho.
  wikivoyage   the place has an English Wikivoyage article (cache/wikivoyage.json,
               else `guide.url`); with sources/wikivoyage_status.json (owner
               step: `layer_ratings.py fetch-wikivoyage`) the article's status
               tier: outline 1, usable 2, guide 3, star 4.
  lists        named by a published list: Tripadvisor Travelers' Choice and
               Lonely Planet Best in Travel (T760's files, data/rating/external/),
               plus any list file in sources/lists/ (national tourism boards,
               European Best Destinations: owner step, one row per entry with
               its page).
  unesco       a World Heritage site lies within UNESCO_KM of the place
               (cache/unesco_whc.json). CIRCULAR: World Heritage is in the
               score's recognition part, so this reference checks the
               designation join, not the rating. Its agreement is reported
               and labelled, never gated.
  nights       Eurostat nights spent in the city (sources/eurostat_nights.json,
               owner step): demand for the metro and city stratum.

What a result says:

  flags   matched       a list entry resolves to a rated row (the coverage;
                        None for places no list names).
          listed_upper  a listed, rated place sits in the upper half of its
                        country (country_percentile >= 50).
  facts   unesco_join   a place with a World Heritage site within UNESCO_KM
                        carries the unesco_whc designation (the recognition
                        bonus reaches it). None when no site is near.
  rank    (pageviews, score): pooled tau-b over the whole catalogue.

Per country (and per place class) the layer adds, in the result's `carta`
block: n, Spearman rho with pageviews and its partial rho controlling for
log population, Kendall tau-b with the Wikivoyage tier, AUC (the chance a
place with an article outscores one without) and the listed places' AUC.
A country under MIN_N places goes into the pool row "small".

    python -I scripts/validation/runner.py ratings --write
    python -I scripts/validation/layer_ratings.py fetch-wikivoyage   # owner, network

No model; the fetch is the only network part.
"""
from __future__ import annotations

import json
import math
import re
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import runner as vr

CATALOGUE = ROOT / "continent-app" / "public" / "app_data.json"
WIKIVOYAGE = ROOT / "cache" / "wikivoyage.json"
UNESCO = ROOT / "cache" / "unesco_whc.json"
EXTERNAL = ROOT / "data" / "rating" / "external"
OUT_DIR = ROOT / "data" / "reports" / "validation" / "ratings"
SOURCES = OUT_DIR / "sources"
VERDICTS = OUT_DIR / "gap_verdicts.json"

NAME = "ratings"
SHARE = 1.0
MIN_PER_COUNTRY = 5
MIN_N = 30                    # research: per-country statistics need 30 places
UNESCO_KM = {"metro": 12.0, "city": 8.0, "town": 5.0, "village": 3.0, "area": 15.0}
WV_TIER = {"outline": 1, "usable": 2, "guide": 3, "star": 4}
GAPS_EACH = 15
MIN_LISTED = 5                # a list AUC on fewer listed places says nothing
TOP_T760 = 200
# A list entry is a place only on these lists; countries, regions, routes and
# "experiences" name no single row, so they never count against coverage.
PLACE_LISTS = ("top destinations", "trending", "cities", "destinations", "towns", "villages", "places")
NOT_PLACE_LISTS = ("countries", "regions", "experiences", "sustainable", "journey", "connect", "worth the money",
                   "learn", "eat")

CHECKS = [
    {"metric": "coverage", "kind": "hard", "direction": "higher", "tolerance_points": 0},
    {"metric": "listed_upper", "kind": "soft", "direction": "higher", "tolerance_points": 5, "min_n": 20},
    {"metric": "fact.unesco_join", "kind": "soft", "direction": "higher", "tolerance_points": 2, "min_n": 30},
    {"metric": "agreement_tau", "kind": "soft", "direction": "higher", "tolerance_points": 3, "min_n": 100},
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_json(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def names_of(row):
    """The row's name plus the parts of 'Base (Other)': 'Reykjavik (Keflavik)'."""
    city = row.get("city") or ""
    out = {norm(city)}
    m = re.match(r"^(.*?)\s*\((.*)\)\s*$", city)
    if m:
        out |= {norm(m.group(1)), norm(m.group(2))}
    return {n for n in out if n}


def km(a_lat, a_lon, b_lat, b_lon):
    p = math.pi / 180
    h = (math.sin((b_lat - a_lat) * p / 2) ** 2
         + math.cos(a_lat * p) * math.cos(b_lat * p) * math.sin((b_lon - a_lon) * p / 2) ** 2)
    return 12742 * math.asin(min(1.0, math.sqrt(h)))


def auc(scores_pos, scores_neg):
    """Mann-Whitney AUC with ties counted half: P(listed outscores unlisted)."""
    if not scores_pos or not scores_neg:
        return None
    allv = [(v, 1) for v in scores_pos] + [(v, 0) for v in scores_neg]
    ranks = vr._ranks([v for v, _ in allv])
    r_pos = sum(r for r, (_, lab) in zip(ranks, allv) if lab)
    n1, n0 = len(scores_pos), len(scores_neg)
    return round((r_pos - n1 * (n1 + 1) / 2) / (n1 * n0), 4)


def partial_rho(x, y, z):
    """Spearman rho of x and y controlling for z (partial correlation of ranks)."""
    if len(x) < 3:
        return None
    rxy = vr.spearman(list(zip(x, y)))
    rxz = vr.spearman(list(zip(x, z)))
    ryz = vr.spearman(list(zip(y, z)))
    if None in (rxy, rxz, ryz):
        return None
    den = math.sqrt(max(0.0, (1 - rxz ** 2) * (1 - ryz ** 2)))
    return round((rxy - rxz * ryz) / den, 4) if den else None


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def load_catalogue(path):
    blob = load_json(path, {}) or {}
    dests = blob.get("destinations") or {}
    if isinstance(dests, list):
        dests = {d["id"]: d for d in dests}
    rated = {k: d for k, d in dests.items() if (d.get("rating") or {}).get("score") is not None}
    return rated, (blob.get("meta") or {}).get("generated_at")


def list_points(rows):
    """{(list, year): [entries]} -> {entry index: points}, T760's rule:
    (size + 1 - rank) / size, an unranked entry earns half."""
    by = {}
    for i, r in enumerate(rows):
        by.setdefault((r.get("source"), r.get("list"), r.get("year") or r.get("edition")), []).append(i)
    pts = {}
    for idx in by.values():
        size = max([rows[i]["rank"] for i in idx if rows[i].get("rank")] or [len(idx)])
        for i in idx:
            rk = rows[i].get("rank")
            pts[i] = (size + 1 - rk) / size if rk else 0.5
    return pts


def load_lists(ctx):
    rows = []
    for name in ("tripadvisor", "lonelyplanet"):
        for r in load_json(Path(ctx.get("external", EXTERNAL)) / f"{name}.json", []) or []:
            rows.append({**r, "source": name})
    lists_dir = Path(ctx.get("sources", SOURCES)) / "lists"
    for f in sorted(lists_dir.glob("*.json")) if lists_dir.is_dir() else []:
        for r in load_json(f, []) or []:
            rows.append({**r, "source": r.get("source") or f.stem})
    return rows


def is_place_entry(entry, countries):
    """True when the entry names a single place (a city, town, island): the
    only kind a missing row is a hole for."""
    lst = norm(entry.get("list"))
    if any(norm(x) in lst for x in NOT_PLACE_LISTS):
        return False
    if norm(entry.get("name")) in countries or norm(entry.get("country")) not in countries:
        return False
    return any(norm(x) in lst for x in PLACE_LISTS)


def resolve(entry, rated, by_name):
    """A list entry's rated row id, or None: the id when given, else an exact
    name in the same country."""
    if entry.get("id") in rated:
        return entry["id"]
    if entry.get("id"):
        return None   # mapped by hand to a row that is not rated
    hits = by_name.get((norm(entry.get("country")), norm(entry.get("name"))), [])
    return hits[0] if len(hits) == 1 else None


def build(ctx):
    """Everything the layer needs, built once and kept on ctx."""
    if "_built" in ctx:
        return ctx["_built"]
    rated, gen_at = load_catalogue(ctx.get("catalogue", CATALOGUE))
    by_name = {}
    for k, d in rated.items():
        for n in names_of(d):
            by_name.setdefault((norm(d.get("country")), n), []).append(k)
    cc_of_country = {norm(d.get("country")): d.get("iso2") for d in rated.values()}

    wv_cache = load_json(ctx.get("wikivoyage", WIKIVOYAGE), {}) or {}
    wv_status = load_json(Path(ctx.get("sources", SOURCES)) / "wikivoyage_status.json", {}) or {}
    nights = load_json(Path(ctx.get("sources", SOURCES)) / "eurostat_nights.json", {}) or {}

    rows = load_lists(ctx)
    pts = list_points(rows)
    listed, holes = {}, []
    for i, r in enumerate(rows):
        k = resolve(r, rated, by_name)
        label = f"{r.get('source')} {r.get('list')} {r.get('year') or r.get('edition')}" + (
            f" #{r['rank']}" if r.get("rank") else "")
        if k:
            listed.setdefault(k, []).append({"label": label, "points": round(pts[i], 3), "url": r.get("url"),
                                             "source": r.get("source")})
        elif is_place_entry(r, cc_of_country):
            holes.append({"name": r.get("name"), "country": r.get("country"), "label": label,
                          "cc": cc_of_country.get(norm(r.get("country"))) or "??"})

    sites = [s for s in load_json(ctx.get("unesco", UNESCO), []) or []
             if s.get("lat") is not None and s.get("lon") is not None]
    places = {}
    for k, d in rated.items():
        lat, lon = d.get("city_lat") or d.get("lat"), d.get("city_lon") or d.get("lon")
        cls = (d.get("place") or {}).get("class") or "town"
        reach = UNESCO_KM.get(cls, 5.0)
        near = [s["name"] for s in sites
                if lat is not None and abs(s["lat"] - lat) < 0.3 and abs(s["lon"] - lon) < 0.4
                and km(lat, lon, s["lat"], s["lon"]) <= reach]
        wv = wv_cache.get(k) or {}
        has_wv = bool(wv.get("url")) or bool((d.get("guide") or {}).get("url"))
        status = wv_status.get(k)
        tier = WV_TIER.get(status, 0) if status else (WV_TIER["usable"] if has_wv else 0)
        r = d["rating"]
        places[k] = {
            "id": k, "name": d.get("city"), "cc": d.get("iso2") or "??", "class": cls,
            "score": r["score"], "band": r.get("band"), "hidden_gem": bool(r.get("hidden_gem")),
            "confidence": r.get("confidence"), "components": r.get("components") or {},
            "country_pct": d.get("country_percentile"), "class_pct": (r.get("class_rank") or {}).get("pct"),
            "pageviews": r.get("fame") or None, "population": (d.get("geonames") or {}).get("population"),
            "wikivoyage": has_wv, "wv_tier": tier, "wv_status": status,
            "unesco_near": near,
            "unesco_tagged": any(x.get("kind") == "unesco_whc" for x in d.get("designations") or []),
            "lists": listed.get(k, []), "nights": nights.get(k),
        }
    built = {"places": places, "holes": holes, "generated_at": gen_at, "n_list_rows": len(rows),
             "n_sites": len(sites), "wv_status_n": len(wv_status), "nights_n": len(nights)}
    ctx["_built"] = built
    return built


# ---------------------------------------------------------------------------
# Runner interface
# ---------------------------------------------------------------------------

def references(ctx):
    b = build(ctx)
    refs = [{"id": k, "countries": [p["cc"]]} for k, p in b["places"].items()]
    refs += [{"id": f"hole:{norm(h['country'])}:{norm(h['name'])}:{i}", "countries": [h["cc"]], "_hole": h}
             for i, h in enumerate(b["holes"])]
    return refs


def load(ctx):
    return build(ctx)


def match(refs, carta):
    places = carta["places"]
    out = []
    for ref in refs:
        if ref.get("_hole"):
            h = ref["_hole"]
            out.append({"id": ref["id"], "country": ref["countries"][0],
                        "flags": {"matched": False, "listed_upper": None}, "facts": {},
                        "rank": None, "note": f"not rated: {h['name']} ({h['label']})"})
            continue
        p = places[ref["id"]]
        listed = bool(p["lists"])
        out.append({
            "id": p["id"], "country": p["cc"],
            "flags": {"matched": True if listed else None,
                      "listed_upper": ((p["country_pct"] or 0) >= 50) if listed else None},
            "facts": {"unesco_join": p["unesco_tagged"] if p["unesco_near"] else None},
            "rank": (p["pageviews"], p["score"]) if p["pageviews"] is not None else None,
            "_p": p,
        })
    chosen = [r["_p"] for r in out if r.get("_p")]
    carta["_agreement"] = {"by_country": agreement(chosen, "cc"), "by_class": agreement(chosen, "class"),
                           "all": agreement(chosen, None)["all"], "t760_repeat": t760_repeat(chosen)}
    return out


def _stats(ps):
    sc = [p["score"] for p in ps]
    s = {"n": len(ps)}
    pv = [(p["pageviews"], p["score"], math.log10((p["population"] or 0) + 10)) for p in ps
          if p["pageviews"] is not None]
    s["rho_pageviews"] = vr.spearman([(a, b) for a, b, _ in pv])
    s["rho_pageviews_given_pop"] = partial_rho([a for a, _, _ in pv], [b for _, b, _ in pv], [c for _, _, c in pv])
    tiers = [(p["wv_tier"], p["score"]) for p in ps]
    s["tau_wikivoyage"] = vr.kendall_tau_b(tiers) if len({t for t, _ in tiers}) > 1 else None
    s["auc_wikivoyage"] = auc([p["score"] for p in ps if p["wikivoyage"]], [p["score"] for p in ps if not p["wikivoyage"]])
    listed = [p["score"] for p in ps if p["lists"]]
    s["auc_lists"] = auc(listed, [p["score"] for p in ps if not p["lists"]]) if len(listed) >= MIN_LISTED else None
    s["auc_unesco_circular"] = auc([p["score"] for p in ps if p["unesco_near"]],
                                   [p["score"] for p in ps if not p["unesco_near"]])
    s["listed"] = sum(1 for p in ps if p["lists"])
    s["with_wikivoyage"] = sum(1 for p in ps if p["wikivoyage"])
    s["mean_score"] = round(sum(sc) / len(sc), 2) if sc else None
    ni = [(p["nights"], p["score"]) for p in ps if p.get("nights") is not None]
    s["rho_nights"] = vr.spearman(ni) if len(ni) >= 10 else None
    return s


def t760_repeat(places, top=TOP_T760):
    """T760's own numbers on today's ratings: Spearman over the top `top` by
    score of each signal (absent = 0), and how many of the top it names."""
    order = sorted(places, key=lambda p: (-p["score"], p["id"]))[:top]
    sig = {
        "tripadvisor": lambda p: sum(x["points"] for x in p["lists"] if x.get("source") == "tripadvisor"),
        "lonelyplanet": lambda p: sum(x["points"] for x in p["lists"] if x.get("source") == "lonelyplanet"),
        "unesco": lambda p: 1.0 if p["unesco_tagged"] else 0.0,
        "wikivoyage": lambda p: float(p["wv_tier"]),
        "other_lists": lambda p: sum(x["points"] for x in p["lists"]
                                     if x.get("source") not in ("tripadvisor", "lonelyplanet")),
        "pageviews": lambda p: float(p["pageviews"] or 0),
    }
    out = {}
    for name, f in sig.items():
        vals = [f(p) for p in order]
        out[name] = {"rho": vr.spearman([(p["score"], v) for p, v in zip(order, vals)]) if any(vals) else None,
                     "named": sum(1 for v in vals if v)}
    return {"top": len(order), "signals": out}


def agreement(places, key):
    if key is None:
        return {"all": _stats(places)}
    groups = {}
    for p in places:
        groups.setdefault(p[key], []).append(p)
    out, small = {}, []
    for g in sorted(groups):
        if len(groups[g]) >= MIN_N:
            out[g] = _stats(groups[g])
        else:
            small += groups[g]
    if small:
        out["small"] = {**_stats(small), "members": sorted({p[key] for p in small})}
    return out


# ---------------------------------------------------------------------------
# Gaps: the 30 largest, two kinds (T760's split, the research's flags)
# ---------------------------------------------------------------------------

def _pv_class_pct(places):
    """Pageview percentile within the place's class (0 to 100)."""
    by = {}
    for p in places:
        if p["pageviews"] is not None:
            by.setdefault(p["class"], []).append(p)
    out = {}
    for ps in by.values():
        ranks = vr._ranks([p["pageviews"] for p in ps])
        for p, r in zip(ps, ranks):
            out[p["id"]] = round(100 * (r - 0.5) / len(ps), 1)
    return out


def flags_high(p, pv_pct):
    f = []
    if p["lists"]:
        f.append("lists")
    if p["wv_tier"] >= WV_TIER["guide"] or (p["wikivoyage"] and not p["wv_status"]):
        f.append("wikivoyage")
    if pv_pct.get(p["id"], 0) >= 75:
        f.append("pageviews")
    if p["unesco_near"]:
        f.append("unesco")
    return f


def cause(p, kind):
    """A first guess at the cause, from the score's parts; the review confirms it."""
    c = p["components"]
    name = p["name"] or ""
    if kind == "outside_high":
        if "(" in name or p["class"] == "area":
            return "row_scope"           # the reference names more (an island, a region) than the row
        if (c.get("depth") or 0) < 0.15:
            return "depth_coverage"      # POI coverage near the place is thin
        if (c.get("appeal") or 1) < 0.6:
            return "appeal_low"
        if p["unesco_near"] and not p["unesco_tagged"]:
            return "designation_missing"
        return "class_curve"
    if "(" in name:
        return "row_scope"               # a region named after one town
    if p["hidden_gem"]:
        return "hidden_gem_by_design"
    if (c.get("depth") or 0) > 0.9 and p["class"] == "village":
        return "depth_inflated"
    if (c.get("recognition") or 0) > 0.9:
        return "register_not_referenced"  # a village association the references do not see
    return "no_outside_support"


def gap_rows(places):
    pv_pct = _pv_class_pct(places)
    rows = []
    for p in places:
        cp = p["class_pct"]
        if cp is None:
            continue
        f = flags_high(p, pv_pct)
        pvp = pv_pct.get(p["id"])
        if f and (p["lists"] or len(f) >= 2) and cp < 50:
            rows.append(("outside_high", len(f) * 100 + (100 - cp), p, f, pvp))
        elif not f and cp >= 80 and pvp is not None and pvp < 50:
            rows.append(("carta_high", cp - pvp, p, f, pvp))
    out = []
    for kind in ("outside_high", "carta_high"):
        pick = sorted((r for r in rows if r[0] == kind), key=lambda r: (-r[1], r[2]["id"]))[:GAPS_EACH]
        for _, size, p, f, pvp in pick:
            out.append({"kind": kind, "id": p["id"], "name": p["name"], "country": p["cc"], "class": p["class"],
                        "score": p["score"], "class_pct": p["class_pct"], "pageviews_class_pct": pvp,
                        "flagged_by": f, "lists": [x["label"] for x in p["lists"]],
                        "wikivoyage_status": p["wv_status"] or ("article" if p["wikivoyage"] else None),
                        "unesco_near": p["unesco_near"][:3], "components": p["components"],
                        "hidden_gem": p["hidden_gem"], "cause_guess": cause(p, kind), "gap": round(size, 1)})
    return out


def gaps(results):
    places = [r["_p"] for r in results if r.get("_p")]
    rows = gap_rows(places)
    verdicts = {v["id"]: v for v in (load_json(VERDICTS, {}) or {}).get("verdicts", [])}
    for g in rows:
        v = verdicts.get(g["id"])
        if v:
            g.update({"verdict": v.get("verdict"), "cause": v.get("cause"), "reason": v.get("reason"),
                      "proposed_appeal": v.get("proposed_appeal"),
                      "register_row": v.get("register_row")})
    return rows


def describe(ctx, carta):
    path = ctx.get("catalogue", CATALOGUE)
    try:
        path = str(Path(path).relative_to(ROOT))
    except ValueError:
        path = str(path)
    return {"reference": {"sources": ["pageviews", "wikivoyage", "lists", "unesco (circular)", "nights"],
                          "list_rows": carta["n_list_rows"], "unesco_sites": carta["n_sites"],
                          "wikivoyage_status": carta["wv_status_n"], "eurostat_nights": carta["nights_n"],
                          "list_entries_not_rated": len(carta["holes"])},
            "carta": {"catalogue": path, "generated_at": carta["generated_at"], "rated": len(carta["places"]),
                      "agreement": carta.get("_agreement", {})}}


# ---------------------------------------------------------------------------
# Owner step: the Wikivoyage status tier (network)
# ---------------------------------------------------------------------------

STATUS_RE = re.compile(r"^Category:(Star|Guide|Usable|Outline) (articles|cities|regions|districts|"
                       r"parks|countries|destinations|itineraries|topics|airports)$")


def status_from_categories(cats):
    """The highest status tier among a page's categories ('Category:Guide
    cities' -> 'guide'), or None."""
    found = {m.group(1).lower() for c in cats if (m := STATUS_RE.match(c))}
    return max(found, key=WV_TIER.get) if found else None


def fetch_wikivoyage(out=SOURCES / "wikivoyage_status.json", cache=WIKIVOYAGE):
    """{place id: tier} from the categories of each place's en.wikivoyage
    article (Wikivoyage:Article status). Run on a box with network."""
    import urllib.parse
    import urllib.request
    api = "https://en.wikivoyage.org/w/api.php"
    wv = load_json(cache, {}) or {}
    by_title = {}
    for k, v in wv.items():
        if (v or {}).get("title"):
            by_title.setdefault(v["title"], []).append(k)
    titles, status = sorted(by_title), {}
    for i in range(0, len(titles), 50):
        q = {"action": "query", "format": "json", "prop": "categories", "cllimit": "max",
             "redirects": 1, "titles": "|".join(titles[i:i + 50])}
        req = urllib.request.Request(api + "?" + urllib.parse.urlencode(q),
                                     headers={"User-Agent": "carta-validation/1 (D23 ratings layer)"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.load(resp)
        back = {r["to"]: r["from"] for r in (data.get("query") or {}).get("redirects", [])}
        for page in ((data.get("query") or {}).get("pages") or {}).values():
            tier = status_from_categories([c["title"] for c in page.get("categories") or []])
            for k in by_title.get(back.get(page.get("title"), page.get("title")), []):
                if tier:
                    status[k] = tier
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(status, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {out}: {len(status)} places with a status")


if __name__ == "__main__":
    if sys.argv[1:2] == ["fetch-wikivoyage"]:
        fetch_wikivoyage()
    else:
        print(__doc__)
