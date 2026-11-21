"""Build the famous reference per outdoor kind: data/famous/<kind>.json.

D23/D24 famous coverage (2026-11-20). Usage:

    python pipeline/famous/build_reference.py --kind all [--countries DE,AT]

Sources per kind (every row lists the ones that name it):
- `wikidata`: the kind's classes with the sitelink cut in wikidata.KINDS;
- trails: `carta_trails_reference`, the 282-trail D24 reference
  (data/reports/validation/trails_reference.json, read, never rewritten:
  D23 and derived_gate read it by path). Rows citing a Wikipedia article get
  that article's QID, so they merge with the Wikidata row;
- mountains: `country_highpoint` (P610 of each country).

A failed country query keeps that country's rows from the last file, so an
endpoint outage never shrinks the list. The file header records every
source, the cuts, and the countries that fell back."""

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

import wikidata as wd  # noqa: E402

OUT_DIR = ROOT / "data" / "famous"
LEGACY_TRAILS = ROOT / "data" / "reports" / "validation" / "trails_reference.json"
SCHEMA = "carta-famous/1"
CANARIES = OUT_DIR / "canaries.json"

SOURCE_INFO = {
    "wikidata": {"name": "Wikidata", "url": "https://www.wikidata.org/",
                 "licence": "CC0 1.0"},
    "carta_trails_reference": {
        "name": "Carta D24 trails reference (15 sources)",
        "url": "data/reports/validation/trails_reference.json",
        "licence": "facts with citations, see the file's sources"},
    "carta_canary": {"name": "Carta canaries (data/famous/canaries.json)",
                     "url": "data/famous/canaries.json",
                     "licence": "names only; ids and facts from Wikidata"},
    "country_highpoint": {"name": "Wikidata P610 (highest point)",
                          "url": "https://www.wikidata.org/wiki/Property:P610",
                          "licence": "CC0 1.0"},
}


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_previous(kind):
    p = OUT_DIR / f"{kind}.json"
    if not p.exists():
        return {}
    try:
        return {r["id"]: r for r in json.loads(
            p.read_text(encoding="utf-8")).get("rows", [])}
    except (ValueError, KeyError):
        return {}


def wikipedia_qids(urls, verbose=False):
    """{wikipedia url: QID} through each wiki's pageprops, 50 titles a call."""
    by_host = {}
    for u in urls:
        p = urllib.parse.urlparse(u)
        if not p.netloc.endswith("wikipedia.org") or "/wiki/" not in p.path:
            continue
        title = urllib.parse.unquote(p.path.split("/wiki/", 1)[1])
        by_host.setdefault(p.netloc, {})[title.replace("_", " ")] = u
    out = {}
    for host, titles in by_host.items():
        names = sorted(titles)
        for i in range(0, len(names), 50):
            chunk = names[i:i + 50]
            q = urllib.parse.urlencode({
                "action": "query", "prop": "pageprops", "ppprop":
                "wikibase_item", "redirects": 1, "format": "json",
                "titles": "|".join(chunk)})
            req = urllib.request.Request(f"https://{host}/w/api.php?{q}",
                                         headers={"User-Agent":
                                                  wd.HEADERS["User-Agent"]})
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    data = json.loads(r.read().decode("utf-8"))
            except Exception as e:  # noqa: BLE001 - one wiki down is fine
                if verbose:
                    print(f"    ! {host}: {e}", file=sys.stderr)
                continue
            back = {}
            for m in (data.get("query", {}).get("normalized", []) +
                      data.get("query", {}).get("redirects", [])):
                back[m["to"]] = back.get(m["from"], m["from"])
            for page in data.get("query", {}).get("pages", {}).values():
                qid = page.get("pageprops", {}).get("wikibase_item")
                t = page.get("title")
                orig = back.get(t, t)
                orig = back.get(orig, orig)
                if qid and orig in titles:
                    out[titles[orig]] = qid
            time.sleep(0.5)
    return out


def fetch_wikidata(kind, countries, previous, verbose=False):
    """{qid: row} from Wikidata for one kind, plus the fallback list."""
    spec = wd.KINDS[kind]
    core = wd.subclasses(spec["classes"], verbose)
    extra = wd.subclasses(spec["extra_classes"], verbose) \
        if spec["extra_classes"] else []
    if core is None or extra is None:
        raise RuntimeError(f"{kind}: class tree query failed")
    core_set = set(core) | set(spec.get("direct", []))
    classes = sorted(core_set | set(extra))
    rows, fell_back = {}, []
    for cc in countries:
        got = wd.candidates(classes, wd.COUNTRY_QID[cc], spec["fetch"],
                            verbose)
        if got is None:
            fell_back.append(cc)
            for r in previous.values():
                if cc in r.get("countries", []) and r.get("qid"):
                    rows.setdefault(r["qid"], dict(r, _kept=True))
            if verbose:
                print(f"  {kind} {cc}: query failed, kept last rows")
            continue
        for qid, c in got.items():
            r = rows.setdefault(qid, {
                "qid": qid, "sitelinks": c["sitelinks"], "lat": c["lat"],
                "lon": c["lon"], "countries": [], "cls": set()})
            r["countries"].append(cc)
            r.setdefault("cls", set()).update(c["cls"])
        if verbose:
            print(f"  {kind} {cc}: {len(got)}")
    exclude = set(spec.get("exclude", []))
    if exclude:
        for q in [q for q, r in rows.items()
                  if r.get("cls") and r["cls"] <= exclude]:
            del rows[q]
    fresh = [q for q, r in rows.items() if not r.get("_kept")]
    names = wd.labels(fresh, verbose)
    props = {key: wd.values_of(fresh, prop, verbose)
             for prop, key in spec["props"].items()}
    for q in fresh:
        r = rows[q]
        cls = r.pop("cls", set())
        r["class_kind"] = "core" if cls & core_set else "extra"
        r["classes"] = sorted(cls)
        r["name"] = names.get(q, {}).get("en") or (
            names.get(q, {}).get("names") or [q])[0]
        r["names"] = names.get(q, {}).get("names", [])
        for key, vals in props.items():
            v = vals.get(q)
            if not v:
                continue
            if key in ("start", "end"):
                r[key] = wd.qid_of(v[0])
            elif key == "osm_rel":
                r[key] = int(v[0]) if v[0].isdigit() else None
            else:
                r[key] = wd.number(v[0])   # already in the key's unit
        low = " ".join(r["names"]).lower()
        r["beach_word"] = any(w in low for w in wd.BEACH_WORDS)
        if kind == "trails":
            import match
            folded = " " + " ".join(match.fold(n) for n in r["names"]) + " "
            r["weak_class"] = bool(cls) and cls <= wd.WEAK_TRAIL_CLASSES
            r["walk_word"] = any(w in folded for w in wd.WALK_WORDS)
    return rows, fell_back


def same_name_row(rows, lr):
    """The best known Wikidata row with one of the legacy trail's names and
    a country in common, or None."""
    import match
    names = {match.fold(n) for n in [lr["name"], *lr["aliases"]]} - {""}
    ccs = set(lr["countries"] or [])
    best = None
    for q, r in rows.items():
        if r.get("legacy_id") or not (set(r.get("countries") or []) & ccs):
            continue
        rn = {match.fold(n) for n in [r.get("name")] + list(r.get("names")
                                                            or [])}
        if names & rn and (best is None or (r.get("sitelinks") or 0) >
                           (rows[best].get("sitelinks") or 0)):
            best = q
    return best


def legacy_trails(verbose=False):
    data = json.loads(LEGACY_TRAILS.read_text(encoding="utf-8"))
    rows = data["trails"]
    urls = [u for r in rows for u in r.get("sources", [])
            if "wikipedia.org/wiki/" in u]
    qids = wikipedia_qids(urls, verbose)
    out = []
    for r in rows:
        q = next((qids[u] for u in r.get("sources", []) if u in qids), None)
        out.append({"ref_id": r["id"], "qid": q, "name": r["name"],
                    "aliases": r.get("aliases", []),
                    "countries": r.get("countries", []),
                    "length_km": r.get("length_km"),
                    "trail_kind": r.get("kind"),
                    "start": r.get("start"),
                    "cites": r.get("sources", [])})
    if verbose:
        print(f"  legacy trails: {len(out)}, "
              f"{sum(1 for r in out if r['qid'])} with a QID")
    return out


def add_canaries(kind, rows, verbose=False):
    """Canaries no class query caught (Elafonisi is an island, Plitvice a
    park, Porthcurno a village): resolved by exact English label to the best
    known item in a covered country, and added with source carta_canary. A
    canary already in the rows only gains the source."""
    if not CANARIES.exists():
        return
    import match
    entries = json.loads(CANARIES.read_text(encoding="utf-8"))["kinds"].get(
        kind, [])
    # Each name to its best known row: judgement 1 found "Feldberg" on an
    # Austrian 12-sitelink item instead of the Black Forest's 39, and "Via
    # Claudia Augusta" on a 2-sitelink piece, both then lifted to tier A.
    have = {}
    for q, r in rows.items():
        for n in [r.get("name")] + list(r.get("names") or []):
            k = match.fold(n)
            cur = have.get(k)
            if cur is None or (r.get("sitelinks") or 0) > \
                    (rows[cur].get("sitelinks") or 0):
                have[k] = q
    todo, pinned = [], {}
    for e in entries:
        n, cq = canary_name(e), canary_qid(e)
        q = cq if cq in rows else (None if cq else have.get(match.fold(n)))
        if q:
            rows[q]["sources"] = sorted(set(rows[q].get("sources") or
                                            ["wikidata"]) | {"carta_canary"})
            rows[q]["names"] = sorted(set(rows[q].get("names") or []) | {n})
        elif cq:
            pinned[n] = cq
        else:
            todo.append(n)
    found = wd.by_label(todo, verbose)
    if pinned:
        pts = wd.values_of(sorted(pinned.values()), "P625", verbose)
        ccs = wd.values_of(sorted(pinned.values()), "P17", verbose)
        for n, q in pinned.items():
            lat, lon = wd.parse_point((pts.get(q) or [""])[0])
            cc = sorted({wd.CC_OF_QID.get(wd.qid_of(c)) for c in
                         ccs.get(q, [])} - {None})
            if lat is not None and wd.in_europe(lat, lon) and cc:
                found[n] = [[q, None, (lat, lon), cc]]
            todo.append(n)
    new = []
    for n in todo:
        cands = found.get(n)
        if not cands:
            if verbose:
                print(f"    canary not resolved: {n}")
            continue
        q, sl, (lat, lon), ccs = cands[0]
        if q in rows:
            rows[q]["sources"] = sorted(set(rows[q]["sources"]) |
                                        {"carta_canary"})
            continue
        rows[q] = {"qid": q, "name": n, "names": [n], "sitelinks": sl,
                   "lat": lat, "lon": lon, "countries": ccs,
                   "class_kind": "canary", "classes": [],
                   "sources": ["carta_canary"]}
        new.append(q)
    if new:
        names_of = wd.labels(new, verbose)
        for q in new:
            rows[q]["names"] = sorted(set(rows[q]["names"]) |
                                      set(names_of.get(q, {}).get("names", [])))
            for prop, key in wd.KINDS[kind]["props"].items():
                v = wd.values_of([q], prop, verbose).get(q)
                if v and key == "osm_rel":
                    rows[q][key] = int(v[0]) if v[0].isdigit() else None
                elif v and key in ("start", "end"):
                    rows[q][key] = wd.qid_of(v[0])
                elif v:
                    rows[q][key] = wd.number(v[0])


def not_famous(kind):
    """{QID: reason} the hand check took out (canaries.json not_famous)."""
    try:
        d = json.loads(CANARIES.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return d.get("not_famous", {}).get(kind, {})


def finish(kind, rows):
    """Tier, id and sources on each row; drop rows below tier B and the
    ones the hand check took out."""
    out = []
    drop = not_famous(kind)
    for r in rows.values():
        if r.get("qid") in drop:
            continue
        r.pop("_kept", None)
        srcs = r.get("sources") or ["wikidata"]
        r["sources"] = sorted(set(srcs))
        t = wd.tier_of(kind, r) if "wikidata" in r["sources"] else None
        # A second, independent list lifts a row to A on its own.
        if any(s != "wikidata" for s in r["sources"]):
            t = "A"
        if t is None:
            continue
        r["tier"] = t
        r["id"] = "wd:" + r["qid"] if r.get("qid") else r["id"]
        r["countries"] = sorted(set(r.get("countries", [])))
        out.append(r)
    out.sort(key=lambda r: (r["tier"], -(r.get("sitelinks") or 0),
                            r["name"] or ""))
    return out


def build(kind, countries, verbose=False):
    previous = load_previous(kind)
    rows, fell_back = fetch_wikidata(kind, countries, previous, verbose)
    for r in rows.values():
        r.setdefault("sources", ["wikidata"])
    if kind == "trails":
        for lr in legacy_trails(verbose):
            if lr["qid"] and lr["qid"] in rows:
                r = rows[lr["qid"]]
                r["sources"] = sorted(set(r["sources"]) |
                                      {"carta_trails_reference"})
                r["legacy_id"] = lr["ref_id"]
                r["names"] = sorted(set(r.get("names", [])) |
                                    {lr["name"], *lr["aliases"]})
                r.setdefault("length_km", lr["length_km"])
                r["trail_kind"] = lr["trail_kind"]
                if lr["start"]:
                    r["trailhead"] = lr["start"]
                continue
            twin = same_name_row(rows, lr) if not lr["qid"] else None
            if twin:
                r = rows[twin]
                r["sources"] = sorted(set(r["sources"]) |
                                      {"carta_trails_reference"})
                r["legacy_id"] = lr["ref_id"]
                r["names"] = sorted(set(r.get("names", [])) |
                                    {lr["name"], *lr["aliases"]})
                r.setdefault("length_km", lr["length_km"])
                r["trail_kind"] = lr["trail_kind"]
                if lr["start"]:
                    r["trailhead"] = lr["start"]
                continue
            key = lr["qid"] or ("ref:" + lr["ref_id"])
            start = lr["start"] or {}
            rows[key] = {
                "id": "ref:" + lr["ref_id"], "qid": lr["qid"],
                "legacy_id": lr["ref_id"], "name": lr["name"],
                "names": sorted({lr["name"], *lr["aliases"]}),
                "countries": lr["countries"], "length_km": lr["length_km"],
                "trail_kind": lr["trail_kind"], "lat": start.get("lat"),
                "lon": start.get("lon"), "trailhead": lr["start"],
                "sitelinks": None,
                "sources": ["carta_trails_reference"]}
    if kind == "mountains":
        hp = wd.country_highpoints(verbose)
        for q, cc in hp.items():
            if q in rows:
                rows[q]["highpoint"] = cc
                rows[q]["sources"] = sorted(set(rows[q]["sources"]) |
                                            {"country_highpoint"})
    add_canaries(kind, rows, verbose)
    final = finish(kind, rows)
    used = sorted({s for r in final for s in r["sources"]})
    return {
        "schema": SCHEMA, "kind": kind, "generated_at": now(),
        "sources": {s: SOURCE_INFO[s] for s in used},
        "rule": {"classes": wd.KINDS[kind]["classes"],
                 "extra_classes": wd.KINDS[kind]["extra_classes"],
                 "fetch_min_sitelinks": wd.KINDS[kind]["fetch"],
                 "tier": "wikidata.tier_of"},
        "countries": countries, "fell_back": fell_back,
        "counts": {"A": sum(1 for r in final if r["tier"] == "A"),
                   "B": sum(1 for r in final if r["tier"] == "B")},
        "rows": final,
    }


def canary_name(entry):
    return entry["name"] if isinstance(entry, dict) else entry


def canary_qid(entry):
    return entry.get("qid") if isinstance(entry, dict) else None


def canary_misses(kind, rows, canaries=None):
    """Canary names (data/famous/canaries.json) that no tier A or B row
    carries among its names, folded. Tier B counts: the canary checks that
    the list can see the place, the cut decides the headline."""
    import match
    if canaries is None:
        canaries = json.loads(CANARIES.read_text(encoding="utf-8"))
    have, qids = set(), set()
    for r in rows:
        qids.add(r.get("qid"))
        for n in [r.get("name")] + list(r.get("names") or []):
            have.add(match.fold(n))
    return [canary_name(c) for c in canaries["kinds"].get(kind, [])
            if not (canary_qid(c) in qids or
                    (not canary_qid(c) and match.fold(canary_name(c)) in have))]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--kind", default="all",
                    choices=["all", *wd.KINDS.keys()])
    ap.add_argument("--countries", default="",
                    help="comma list of ISO2 codes (default: all)")
    ap.add_argument("--out", default=str(OUT_DIR))
    ap.add_argument("-q", "--quiet", action="store_true")
    a = ap.parse_args(argv)
    countries = [c.strip().upper() for c in a.countries.split(",")
                 if c.strip()] or sorted(wd.COUNTRY_QID)
    kinds = list(wd.KINDS) if a.kind == "all" else [a.kind]
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    failed = []
    for kind in kinds:
        try:
            doc = build(kind, countries, verbose=not a.quiet)
        except RuntimeError as e:
            print(f"  ! {e}; kept the last file")
            failed.append(kind)
            continue
        (out / f"{kind}.json").write_text(
            json.dumps(doc, ensure_ascii=False, indent=1) + "\n",
            encoding="utf-8")
        print(f"  {kind}: {doc['counts']['A']} famous (A), "
              f"{doc['counts']['B']} near (B); fell back: "
              f"{','.join(doc['fell_back']) or 'none'}")
        if CANARIES.exists():
            miss = canary_misses(kind, doc["rows"])
            print(f"    canaries missing: {', '.join(miss) or 'none'}")
    return 1 if len(failed) == len(kinds) else 0


if __name__ == "__main__":
    sys.exit(main())
