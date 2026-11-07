"""Photo correctness: does the hero show the place it fronts? (T1198, ROADMAP D17)

Tier: Scheduled (run_pipeline task photo_check; Commons and the model run on
the owner's box, everything else runs offline)

T1077 found heroes that were a government group photo (Appenzell) and a
university building (Palermo); the shipped wire still has the Danish island
Fur fronted by a grizzly bear, the lead image of the en.wikipedia article
"Fur". Each passed every gate it met, because each gate asks "is this a
usable photograph", not "is this photograph OF this place". This module asks
the second question, on a sample per run, in three tiers by cost:

  1. Cheap signals, no model. The file name and caption, the Commons
     categories, the MIME type and pixel size, and the coordinate the file
     publishes (EXIF GPS or the {{Location}} template, both in Commons'
     `coordinates`). The map, emblem, diagram, satellite, document, collage
     and historical lexicons and the distance rule are the hero audit's
     (pipeline/audit/audit_hero_images.py classify), reused, never copied. Added
     here: interiors, group and portrait photos, animals, institutional
     buildings, a file that names ANOTHER place of the run and not this one,
     and the positive evidence that the file names its subject at all.
  2. A vision check, only for the photos tier 1 leaves unsure. Gemini through
     the pipeline gateway (pipeline/ai_gateway.py, feature photo_check), the
     prompt `photo-check` in the registry (prompts/photo-check/v1.md), never
     the Claude API. A session backend reads verdicts from a file instead,
     for fixtures and for a Claude Code session judging offline.
  3. A person: whatever is still unsure after tier 2 goes to the report's
     review list (pipeline/photos/review.py is the queue).

Verdicts per photo: ok (named and no bad signal, or the vision check says it
shows the place), flag (a strong bad signal, or the vision check says it
does not), unsure (nothing either way). A flagged hero is replaced by the
next candidate on its own photo ladder that comes out ok: a layer row's
`images` list in order (images[0] is the hero), a destination's dossier
gallery in order. Nothing outside the ladder is ever picked, so every
replacement keeps the credit, licence and evidence it shipped with. No ok
candidate: the hero stays, and the row is listed for review.

The flag rate (flagged heroes over checked heroes in the sample) is the D2
rule: scripts/validation/layer_photos.py puts it on the D23 validation
runner, whose gate scripts/quality/engine.py reads (hard, lower is better,
2 points of tolerance against the baseline).

Sample: per layer the `sample.per_layer` count of correctness.json, picked by
sha256(salt, layer, id) with the ISO week as the salt, so a week's runs see
the same rows and the sample rotates weekly. About 500 heroes a run give a
95% interval of plus or minus 2 points at a 5% flag rate (T1198 research).

Usage, from the repo root:
    python pipeline/photos/correctness.py                       # sample, cheap tier, cached metadata
    python pipeline/photos/correctness.py --fetch-meta          # ask Commons for missing metadata (owner box)
    python pipeline/photos/correctness.py --vision gemini       # tier 2 for the unsure (GEMINI_API_KEY)
    python pipeline/photos/correctness.py --vision session:FILE # tier 2 from a verdicts file
    python pipeline/photos/correctness.py --vision-prompts DIR  # write the tier 2 prompts for a session judge
    python pipeline/photos/correctness.py --all --layers dest   # every row, not a sample
    python pipeline/photos/correctness.py --apply               # also write the replacements into the wires
    python pipeline/photos/correctness.py --validate            # also the D23 result (once a baseline exists)

Writes data/reports/photo_check/<date>.json (schema carta-photo-check/1).
--apply reorders the shipped ladders in place (see apply_layer_row and
apply_dest); without it nothing outside data/reports changes.

ASCII clean, no em dashes, per project convention.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
PIPELINE = HERE.parent
ROOT = PIPELINE.parent
if str(PIPELINE) not in sys.path:
    sys.path.insert(0, str(PIPELINE))

CONFIG = HERE / "correctness.json"
PUBLIC = Path(os.environ.get("CARTA_DATA_ROOT") or ROOT / "continent-app" / "public")
REPORTS = ROOT / "data" / "reports" / "photo_check"
META_CACHE = ROOT / "cache" / "hero_image_meta.json"   # shared with the hero audit
SCHEMA = "carta-photo-check/1"
VERDICTS = ("ok", "flag", "unsure")
LAYERS = ("dest", "beaches", "lakes", "mountains")
SHAPE_LAYERS = ("beaches", "lakes", "mountains")


def _audit():
    """pipeline/audit/audit_hero_images.py, loaded once by path (its lexicons and classify)."""
    if "carta_audit_hero_images" in sys.modules:
        return sys.modules["carta_audit_hero_images"]
    spec = importlib.util.spec_from_file_location("carta_audit_hero_images", PIPELINE / "audit" / "audit_hero_images.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["carta_audit_hero_images"] = mod
    spec.loader.exec_module(mod)
    return mod


AUDIT = _audit()


def config(path=CONFIG):
    return json.loads(Path(path).read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Lexicons added by D17. The audit's own (map, emblem, diagram, satellite,
# document, collage, historical, off_subject) are used through classify().
# ---------------------------------------------------------------------------

def _rx(words):
    return re.compile(r"\b(" + words + r")\b", re.I)


# Strong: the photograph is of the wrong kind of thing for a place hero.
INTERIOR = _rx(r"interior|interiors|interieur|innenansicht|innenraum|"
               r"wnetrze|nave|altar|altarpiece|choir stalls|organ loft|vestibule|lobby|foyer|"
               r"staircase|reading room|exhibition hall|inside the")
PEOPLE = _rx(r"group photo|group photograph|group picture|gruppenfoto|gruppenbild|family photo|"
             r"team photo|class photo|delegation|delegations|press conference|signing ceremony|"
             r"summit meeting|official visit|state visit|working visit|bilateral meeting|"
             r"council meeting|cabinet meeting|portrait|portraits|headshot|selfie|"
             r"minister|ministers|president|prime minister|chancellor|ambassador|mayor of|lord mayor|"
             r"bundesrat|landammann|regierungsrat|government of|members of")
ANIMAL = _rx(r"bear|bears|grizzly|ursus|wolf|wolves|deer|stag|fox|lynx|bison|elk|moose|"
             r"eagle|owl|heron|stork|gull|seal pup|puffin|parrot|"
             r"cat|kitten|dog|puppy|horse|pony|cow|cattle|sheep|goat|pig|"
             r"insect|butterfly|moth|beetle|bee|spider|snail|lizard|snake|frog|fish|"
             r"mink|fur seal|fur coat|pelt|pelts")
# Weak: a true photograph of a real building that is rarely what a place
# hero should be (the Palermo university building). Sent to tier 2.
INSTITUTION = _rx(r"university|universita|universidad|universitat|universite|uniwersytet|"
                  r"faculty|campus|ministry|ministerium|ministero|ministerio|parliament building|"
                  r"police station|hospital|clinic|school building|courthouse|office building|"
                  r"headquarters|data centre|data center")
# Category shapes that settle the kind of file on their own (leading word,
# the audit's rule: "Interiors of X" is an interior, "Buildings with flags"
# is not a flag).
CAT_INTERIOR = re.compile(r"^(interiors? of|interior of|naves? of|altars? (of|in)|inside )", re.I)
CAT_PEOPLE = re.compile(r"^(group photographs|portrait photographs|portraits of|people of|"
                        r"meetings of|official visits|state visits|delegations|politicians of|"
                        r"members of|press conferences)", re.I)
CAT_ANIMAL = re.compile(r"^(ursus|canis|felis|vulpes|cervus|animals|mammals of|birds of|"
                        r"fauna of|insects of|dogs|cats|horses|cattle)\b", re.I)
CAT_VIEWS = re.compile(r"^(views of|panoramics of|aerial (photographs|views) of|skylines of|"
                       r"landscapes of|beaches of|lakes of|mountains of)\s+(.+)$", re.I)

# Words that do not identify a subject on their own: a file named "beach.jpg"
# does not name Playa de la Concha.
GENERIC = set("""
the of de del della di da do du des la le les los las el il lo und and en et a an y i
beach beaches playa plage spiaggia strand praia plaza plaja plazh paralia
lake lakes lago lac see jezero jezioro jarvi jarv loch lough meer
mount mountain mountains monte mont berg pic pico piz peak spitze vrh gora
river rio fiume fleuve island isle isola ile insel otok wyspa
old town city village town new north south east west upper lower great little
saint san santa sankt st ste national park nature reserve
""".split())


def fold(s):
    return AUDIT.fold(s)


def split_words(s):
    """'GrizzlyBearJeanBeaufort_2.jpg' -> 'Grizzly Bear Jean Beaufort 2 jpg'."""
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", str(s or ""))
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", s)
    return re.sub(r"[_./:%()\-,;]+", " ", s)


def name_keys(name):
    """The folded forms that count as naming a subject: the whole name, and its
    distinctive words (four letters or more, not generic)."""
    whole = fold(name)
    if not whole:
        return set(), set()
    words = {w for w in whole.split() if len(w) >= 4 and w not in GENERIC and not w.isdigit()}
    return {whole}, words


def strip_name(text, name):
    """The text with the subject's own name words taken out (folded, so
    accents and case do not matter)."""
    t = " " + fold(text) + " "
    for w in fold(name).split():
        t = t.replace(f" {w} ", " ")
    return re.sub(r"\s+", " ", t).strip()


def names_subject(text, name, aliases=()):
    """True when the folded text names the subject (whole name, or one distinctive word)."""
    t = " " + fold(split_words(text)) + " "
    for n in (name, *aliases):
        whole, words = name_keys(n)
        if any(f" {w} " in t for w in whole):
            return True
        if any(f" {w} " in t for w in words):
            return True
    return False


# ---------------------------------------------------------------------------
# Photos and subjects
# ---------------------------------------------------------------------------

def photo_from_record(rec):
    """A wire image record of any layer, as one shape:
    {key, title, url, page, caption, w, h, ev}. key is the Commons file title
    when one can be read, else the URL."""
    if not isinstance(rec, dict):
        return None
    url = rec.get("url") or rec.get("big") or rec.get("u")
    if not url:
        return None
    title = AUDIT.file_title_from_url(url)
    page = rec.get("page") or ""
    if not title and "commons.wikimedia.org/wiki/File" in page:
        title = "File:" + urllib.parse.unquote(page.split("/wiki/")[-1].split(":", 1)[-1]).replace("_", " ")
    return {"key": title or url, "title": title, "url": url, "page": page,
            "caption": rec.get("caption") or "", "w": rec.get("w"), "h": rec.get("h"),
            "ev": rec.get("ev")}


def _load(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def dest_subjects(public=PUBLIC):
    """Destinations: hero = app_data image, ladder = the hero then the dossier
    gallery in order (the hero's own entry skipped where it sits there too)."""
    blob = _load(Path(public) / "app_data.json", {}) or {}
    out = []
    for did, d in (blob.get("destinations") or {}).items():
        hero = photo_from_record(d.get("image"))
        if not hero:
            continue
        doss = _load(Path(public) / "dossier" / f"{did.replace(':', '-')}.json", {}) or {}
        ladder = [hero]
        for g in doss.get("gallery") or []:
            p = photo_from_record(g)
            if p and p["key"] != hero["key"]:
                ladder.append(p)
        lat = d.get("city_lat") if d.get("city_lat") is not None else d.get("lat")
        lon = d.get("city_lon") if d.get("city_lon") is not None else d.get("lon")
        out.append({"layer": "dest", "id": did, "name": d.get("city") or did, "cc": d.get("iso2") or "",
                    "lat": lat, "lon": lon, "area": (d.get("place") or {}).get("class") == "area",
                    "ladder": ladder, "_gallery": doss.get("gallery") or []})
    return out


def layer_subjects(layer, public=PUBLIC):
    """Beaches, lakes, mountains: one shard per country, rows under the layer
    key, ladder = the row's images in order."""
    out = []
    root = Path(public) / layer
    for shard in sorted(root.glob("[A-Z][A-Z].json")):
        blob = _load(shard, {}) or {}
        rows = blob.get(layer) if isinstance(blob, dict) else None
        for r in rows or []:
            ladder = [p for p in (photo_from_record(x) for x in r.get("images") or []) if p]
            if not ladder:
                continue
            out.append({"layer": layer, "id": str(r.get("id")), "name": r.get("name") or "",
                        "cc": r.get("cc") or shard.stem, "lat": r.get("lat"), "lon": r.get("lon"),
                        "area": False, "ladder": ladder})
    return out


def subjects_for(layer, public=PUBLIC):
    return dest_subjects(public) if layer == "dest" else layer_subjects(layer, public)


def week_salt(now):
    y, w, _ = now.isocalendar()
    return f"{y}-W{w:02d}"


def sample(subjects, n, salt):
    """The n subjects with the lowest sha256(salt|layer|id): stable for a salt."""
    def rank(s):
        return hashlib.sha256(f"{salt}|{s['layer']}|{s['id']}".encode("utf-8")).hexdigest()
    return sorted(subjects, key=rank)[:n] if n is not None else list(subjects)


def gazetteer(subjects):
    """Folded whole names of every subject of a layer, for the other-place test.
    Only names of six letters or more: short names collide with ordinary words."""
    g = {}
    for s in subjects:
        f = fold(s["name"])
        if len(f) >= 6:
            g.setdefault(f, set()).add(s["id"])
    return g


# ---------------------------------------------------------------------------
# Tier 1: cheap signals
# ---------------------------------------------------------------------------

STRONG = {"svg", "not_photo", "map", "satellite", "emblem", "diagram", "collage", "document",
          "wrong_place", "off_subject", "interior", "people", "animal"}
WEAK = {"historical", "far_coord", "institution", "names_other_place", "unnamed", "animal_hint",
        "weak_subject"}
# Layout and size reasons the audit also returns: not a correctness question
# (technical.py and the hero audit own them), kept as notes only.
SHAPE = {"tiny", "strip", "portrait", "narrow", "unknown_file"}
NAMED_TIERS = {"p18", "title", "viewcat", "category", "name"}


def _km(subject, cfg):
    key = "dest_area" if subject["layer"] == "dest" and subject.get("area") else subject["layer"]
    return (cfg.get("km") or {}).get(key) or {"far": 30, "certain": 300}


def _place_test(subject, meta, cfg):
    """wrong_place / far_coord from the file's published coordinate."""
    if not meta or subject.get("lat") is None or subject.get("lon") is None:
        return [], None
    best = None
    for c in meta.get("co") or []:
        k = AUDIT._km_pts(subject["lat"], subject["lon"], c[0], c[1])
        best = k if best is None or k < best else best
    if best is None:
        return [], None
    lim = _km(subject, cfg)
    if best > lim["certain"]:
        return ["wrong_place"], round(best, 1)
    if best > lim["far"]:
        return ["far_coord"], round(best, 1)
    return [], round(best, 1)


def cheap_check(subject, photo, meta=None, gaz=None, cfg=None):
    """Tier 1 for one photo: {verdict, reasons, notes, named, km}."""
    cfg = cfg or {}
    title = photo.get("title") or ""
    label = " ; ".join(x for x in (AUDIT.readable(title), photo.get("caption") or "",
                                   (meta or {}).get("name") or "") if x)
    cats = [c.strip() for c in re.split(r"[;|]", (meta or {}).get("cats") or "") if c.strip()]
    named = (photo.get("ev") in NAMED_TIERS
             or names_subject(label, subject["name"])
             or any(names_subject(c, subject["name"]) for c in cats))
    # The lexicons read the file's words WITHOUT the subject's own name: a
    # beach called President, a reservoir called Slezska Harta ("harta" is
    # Romanian for map) or a Plaza Mayor must not trip them.
    words = strip_name(split_words(label), subject["name"])
    reasons = set()
    ext = (re.search(r"\.(\w{3,4})$", title) or [None, "jpg"])[1]
    # The audit's classify on that stripped name: map, emblem, diagram,
    # satellite, document, collage, svg, not_photo, historical, off_subject
    # (categories) and shape. Without metadata it answers unknown_file only,
    # so its name lexicons then run here.
    if title:
        m2 = dict(meta, name=strip_name((meta or {}).get("name") or "", subject["name"])) if meta else None
        audit = AUDIT.classify(f"File:{words}.{ext}", m2, url=photo.get("url"), dest=None)
        reasons |= {r for r in audit if r not in ("wrong_place", "far_coord")}
    if not meta:
        safe = AUDIT.SAFE_HINTS.search(words)
        for tag, rx in AUDIT.BAD_NAME_RE:
            if rx.search(words) and not (tag in ("emblem", "document") and safe):
                reasons.add(tag)
        if AUDIT.HISTORICAL.search(words):
            reasons.add("historical")
        if re.search(r"\.svg$", title, re.I):
            reasons.add("svg")
    # "seals" is an emblem word and an animal: on a photograph (not a
    # drawing format) it is the animal (Horsey Dunes seals).
    if "emblem" in reasons and ext.lower() not in ("svg", "png", "gif"):
        if not any(rx.search(re.sub(r"\bseals?\b", " ", words, flags=re.I))
                   for tag, rx in AUDIT.BAD_NAME_RE if tag == "emblem"):
            reasons.discard("emblem")
            reasons.add("animal" if not named else "animal_hint")
    place, km = _place_test(subject, meta, cfg)
    reasons |= set(place)
    if AUDIT.OFF_SUBJECT.search(words) or AUDIT.WEAK_SUBJECT.search(words):
        reasons.add("weak_subject")
    if INTERIOR.search(words) or any(CAT_INTERIOR.match(c) for c in cats):
        reasons.add("interior")
    if PEOPLE.search(words) or any(CAT_PEOPLE.match(c) for c in cats):
        reasons.add("people")
    # An animal word in a file that also names the place (a horse fair in the
    # town square) is a weak hint, not a verdict.
    if ANIMAL.search(words) or any(CAT_ANIMAL.match(c) for c in cats):
        reasons.add("animal" if not named else "animal_hint")
    if INSTITUTION.search(words):
        reasons.add("institution")
    if gaz and not named:
        t = " " + fold(words + " " + " ".join(cats)) + " "
        others = [n for n, ids in gaz.items() if subject["id"] not in ids and f" {n} " in t]
        if others:
            reasons.add("names_other_place")
    if not named:
        reasons.add("unnamed")
    strong = sorted(reasons & STRONG)
    weak = sorted(reasons & WEAK)
    notes = sorted(reasons & SHAPE)
    if strong:
        verdict = "flag"
    elif weak:
        verdict = "unsure"
    else:
        verdict = "ok"
    return {"verdict": verdict, "reasons": strong + weak, "notes": notes, "named": named, "km": km}


# ---------------------------------------------------------------------------
# Tier 2: vision
# ---------------------------------------------------------------------------

def vision_prompt(cfg=None):
    from prompt_registry import prompt as _registry_prompt
    return _registry_prompt(((cfg or {}).get("vision") or {}).get("prompt") or "photo-check")


def vision_kinds(p=None):
    """The kinds the model may answer, read from the rubric's answer shape
    (`"kind": "a" | "b" | ...`), so the list lives once, in the prompt."""
    p = p or vision_prompt()
    m = re.search(r'"kind":\s*((?:"[a-z_]+"\s*\|?\s*)+)', p.text("rubric"))
    return tuple(re.findall(r'"([a-z_]+)"', m.group(1))) if m else ("photo_of_place", "other")


def vision_schema(p=None):
    """The JSON schema Gemini answers in (the gateway's `schema`)."""
    return {
        "type": "OBJECT",
        "properties": {
            "shows_place": {"type": "STRING", "enum": ["yes", "no", "unsure"]},
            "kind": {"type": "STRING", "enum": list(vision_kinds(p))},
            "confidence": {"type": "NUMBER"},
            "reason": {"type": "STRING"},
        },
        "required": ["shows_place", "kind", "confidence", "reason"],
    }


def build_vision_prompt(subject, photo, p=None):
    """The tier 2 text for one photo: the rubric, then the subject and the
    photo's own words as data. The image travels beside it."""
    p = p or vision_prompt()
    kind = {"dest": "town, city or region", "beaches": "beach", "lakes": "lake",
            "mountains": "mountain"}.get(subject["layer"], "place")
    body = {"place": subject["name"], "place_type": kind, "country": subject.get("cc"),
            "file_name": AUDIT.readable(photo.get("title") or ""), "caption": photo.get("caption") or ""}
    return p.text("rubric").strip() + "\n\n" + p.text("item", body=json.dumps(body, ensure_ascii=False,
                                                                               indent=1)).strip() + "\n"


def normalise_vision(ans, min_conf=0.6):
    """A model answer as {verdict, kind, confidence, reason}; None when unusable."""
    if not isinstance(ans, dict):
        return None
    shows = str(ans.get("shows_place") or "").lower()
    kind = ans.get("kind") if ans.get("kind") in vision_kinds() else "other"
    try:
        conf = float(ans.get("confidence"))
    except (TypeError, ValueError):
        conf = 0.0
    if shows not in ("yes", "no", "unsure"):
        return None
    if shows == "unsure" or conf < min_conf:
        verdict = "unsure"
    elif shows == "yes" and kind == "photo_of_place":
        verdict = "ok"
    else:
        verdict = "flag"
    return {"verdict": verdict, "kind": kind, "confidence": round(conf, 2),
            "reason": str(ans.get("reason") or "")[:200]}


class SessionVision:
    """Verdicts from a file: {"verdicts": {photo key: {shows_place, kind, confidence, reason}}}.
    For fixtures, and for a Claude Code session that judged the images offline."""
    name = "session"

    def __init__(self, path, min_conf=0.6):
        blob = _load(path, {}) or {}
        self.verdicts = blob.get("verdicts") or {}
        self.model = blob.get("model") or "session"
        self.min_conf = min_conf
        self.calls = 0

    def judge(self, subject, photo):
        self.calls += 1
        return normalise_vision(self.verdicts.get(photo["key"]), self.min_conf)


def thumb_url(photo, px=640):
    """The Commons thumbnail of the file at px wide (Special:FilePath redirects to it)."""
    if photo.get("title") and "@" not in photo["title"]:
        name = photo["title"].split(":", 1)[-1].replace(" ", "_")
        return ("https://commons.wikimedia.org/wiki/Special:FilePath/"
                + urllib.parse.quote(name) + f"?width={int(px)}")
    return photo.get("url")


def image_opener(image_b64, mime, base=None):
    """An opener for the gateway that adds the image to the Gemini request.

    The gateway (pipeline/ai_gateway.py) sends text parts only; its `opener`
    seam is the one place a request can be extended without naming a
    provider endpoint here. This adds one inline_data part beside the user
    text and leaves everything else (the guard, the fallbacks, the events) to
    the gateway. Register row T1198-a moves image parts into the gateway."""
    base = base or urllib.request.urlopen

    def opener(req, timeout=None):
        body = json.loads(req.data.decode("utf-8"))
        parts = ((body.get("contents") or [{}])[0]).setdefault("parts", [])
        parts.append({"inline_data": {"mime_type": mime, "data": image_b64}})
        gc = body.setdefault("generationConfig", {})
        gc.setdefault("mediaResolution", "MEDIA_RESOLUTION_LOW")
        new = urllib.request.Request(req.full_url, data=json.dumps(body).encode("utf-8"),
                                     headers=dict(req.header_items()), method="POST")
        return base(new, timeout=timeout)
    return opener


def ensure_feature(gateway_mod, cfg):
    """The gateway feature tier 2 calls, added at run time the way the text
    judge adds its own (pipeline/judge/backends.py), while ai_gateway.py has
    no photo_check entry (register row T1198-a)."""
    v = cfg.get("vision") or {}
    name = v.get("feature", "photo_check")
    if name not in gateway_mod.FEATURES:
        gateway_mod.FEATURES[name] = {
            "provider": "gemini", "models": list(v.get("models") or gateway_mod.GEMINI_CHAIN),
            "budget_s": 300, "first_s": 60, "later_s": 60, "min_s": 10, "retry_429_s": 30,
            "min_interval_s": 6.5, "max_prompt_chars": 8_000, "max_output_chars": 4_000}
    return name


class GeminiVision:
    """Tier 2 through the gateway. fetch(url) -> (bytes, mime) is injectable for tests."""
    name = "gemini"

    def __init__(self, cfg, env=None, fetch=None, base_opener=None, sleep=None):
        import ai_gateway
        self.ai = ai_gateway
        self.cfg = cfg
        self.v = cfg.get("vision") or {}
        self.feature = ensure_feature(ai_gateway, cfg)
        self.env = os.environ if env is None else env
        self.fetch = fetch or _fetch_image
        self.base = base_opener
        self.sleep = sleep
        self.p = vision_prompt(cfg)
        self.calls = 0
        self.model = None
        # Fails fast (AIRefusal no_ai) when no key is set: the caller then
        # runs without tier 2 and says so in the report.
        ai_gateway.Gateway(self.feature, env=self.env)
        if ai_gateway.resolve_config(self.feature, self.env)["provider"] != "gemini":
            raise ai_gateway.AIRefusal("config", "photo_check sends images to gemini only")

    def judge(self, subject, photo):
        if self.calls >= int(self.v.get("max_calls", 150)):
            return None
        data, mime = self.fetch(thumb_url(photo, self.v.get("thumb_px", 640)))
        if not data:
            return None
        self.calls += 1
        gw = self.ai.Gateway(self.feature, env=self.env, sleep=self.sleep,
                             opener=image_opener(base64.b64encode(data).decode("ascii"), mime, self.base))
        screen = [AUDIT.readable(photo.get("title") or ""), photo.get("caption") or "", subject["name"]]
        try:
            res = gw.call(build_vision_prompt(subject, photo, self.p), json=True, schema=vision_schema(self.p),
                          screen=screen, temperature=0.0, max_tokens=512)
        except self.ai.AIRefusal:
            return None
        self.model = res.model
        return normalise_vision(self.ai.parse_model_json(res.text, loose=True),
                                float(self.v.get("min_confidence", 0.6)))


def _fetch_image(url, limit=4_000_000):
    req = urllib.request.Request(url, headers={"User-Agent": "CartaPhotoCheck/1.0 (pipeline)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            mime = (r.headers.get("Content-Type") or "image/jpeg").split(";")[0].strip()
            data = r.read(limit + 1)
    except OSError:
        return None, None
    if len(data) > limit or not mime.startswith("image/"):
        return None, None
    return data, mime


def decide(cheap, vision=None):
    """The photo's final verdict from tier 1 and (optionally) tier 2. A strong
    tier 1 flag stands whatever the model says; tier 2 settles only unsure."""
    if cheap["verdict"] != "unsure" or not vision:
        return cheap["verdict"]
    return vision["verdict"]


# ---------------------------------------------------------------------------
# One subject, the run
# ---------------------------------------------------------------------------

def check_photo(subject, photo, meta_for, gaz, cfg, vision=None):
    cheap = cheap_check(subject, photo, meta_for(photo), gaz, cfg)
    vis = vision.judge(subject, photo) if (vision and cheap["verdict"] == "unsure") else None
    return {"key": photo["key"], "url": photo["url"], "verdict": decide(cheap, vis),
            "cheap": cheap, "vision": vis}


def check_subject(subject, meta_for, gaz, cfg, vision=None):
    """The hero's verdict, and for a flagged hero the first ok candidate down
    its ladder (index into subject['ladder'])."""
    ladder = subject["ladder"]
    hero = check_photo(subject, ladder[0], meta_for, gaz, cfg, vision)
    out = {"layer": subject["layer"], "id": subject["id"], "name": subject["name"], "cc": subject["cc"],
           "hero": hero, "replacement": None, "tried": [], "action": "keep"}
    if hero["verdict"] == "unsure":
        out["action"] = "review"
    if hero["verdict"] != "flag":
        return out
    depth = int(cfg.get("ladder_depth", 6))
    for i, cand in enumerate(ladder[1:depth + 1], start=1):
        r = check_photo(subject, cand, meta_for, gaz, cfg, vision)
        out["tried"].append({"index": i, "key": r["key"], "verdict": r["verdict"],
                             "reasons": r["cheap"]["reasons"]})
        if r["verdict"] == "ok":
            out["replacement"] = {"index": i, "key": cand["key"], "url": cand["url"]}
            out["action"] = "replace"
            return out
    out["action"] = "review"
    return out


def meta_lookup(cache):
    def get(photo):
        t = photo.get("title")
        return cache.get(t) if t else None
    return get


def rates(results):
    n = len(results)
    c = {v: sum(r["hero"]["verdict"] == v for r in results) for v in VERDICTS}
    rep = sum(r["action"] == "replace" for r in results)
    flagged = c["flag"]
    return {"checked": n, "ok": c["ok"], "flagged": flagged, "unsure": c["unsure"],
            "replaced": rep, "flag_rate": round(flagged / n, 4) if n else None,
            "unsure_rate": round(c["unsure"] / n, 4) if n else None,
            "replaced_share": round(rep / flagged, 4) if flagged else None}


def run(layers=LAYERS, public=PUBLIC, cfg=None, meta_cache=None, vision=None, now=None, all_rows=False,
        fetch_meta=None):
    """The check over a sample of each layer. fetch_meta(titles, cache) fills
    the metadata cache from Commons (owner box); None uses only the cache."""
    cfg = cfg or config()
    now = now or datetime.now(timezone.utc)
    salt = week_salt(now) if (cfg.get("sample") or {}).get("salt", "week") == "week" else str(cfg["sample"]["salt"])
    cache = meta_cache if meta_cache is not None else (_load(META_CACHE, {}) or {})
    per = (cfg.get("sample") or {}).get("per_layer") or {}
    results, by_layer = [], {}
    for layer in layers:
        subs = subjects_for(layer, public)
        gaz = gazetteer(subs)
        pick = sample(subs, None if all_rows else int(per.get(layer, 100)), salt)
        if fetch_meta:
            depth = int(cfg.get("ladder_depth", 6))
            titles = [p["title"] for s in pick for p in s["ladder"][:depth + 1] if p.get("title")]
            fetch_meta(titles, cache)
        got = [check_subject(s, meta_lookup(cache), gaz, cfg, vision) for s in pick]
        by_layer[layer] = {"population": len(subs), **rates(got)}
        results += got
    with_meta = sum(1 for r in results if cache.get(r["hero"]["key"]))
    return {
        "schema": SCHEMA, "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "salt": salt,
        "sample": "all" if all_rows else per, "config_version": cfg.get("version"),
        "vision": {"backend": getattr(vision, "name", None), "model": getattr(vision, "model", None),
                   "calls": getattr(vision, "calls", 0)} if vision else {"backend": None},
        "metadata": {"heroes_with_commons_metadata": with_meta, "heroes": len(results)},
        "totals": rates(results), "layers": by_layer, "results": results,
        "review": [{"layer": r["layer"], "id": r["id"], "name": r["name"], "url": r["hero"]["url"],
                    "reasons": r["hero"]["cheap"]["reasons"], "verdict": r["hero"]["verdict"]}
                   for r in results if r["action"] == "review"],
    }


# ---------------------------------------------------------------------------
# Applying a replacement to the ladder
# ---------------------------------------------------------------------------

def apply_layer_row(row, index):
    """Move images[index] to the front of a layer row's ladder; the flagged
    hero drops out (it stays in the report). The placeholder `ph` belongs to
    the hero slot only, so it is removed from both moved records: the next
    export recomputes it for the new hero."""
    imgs = list(row.get("images") or [])
    if not 0 < index < len(imgs):
        return False
    new = {k: v for k, v in imgs[index].items() if k != "ph"}
    row["images"] = [new] + [x for i, x in enumerate(imgs) if i not in (0, index)]
    return True


def apply_dest(dest, gallery_rec):
    """A destination's hero from a dossier gallery record: same file, the
    hero's own shape (url, credit, page, source, w, h)."""
    if not gallery_rec or not gallery_rec.get("url"):
        return False
    dest["image"] = {"url": gallery_rec["url"], "credit": dest.get("city") or "",
                     "page": gallery_rec.get("page"), "source": "photo_check",
                     "w": gallery_rec.get("w"), "h": gallery_rec.get("h"),
                     "_src": "commons", "_asof": datetime.now(timezone.utc).strftime("%Y-%m-%d")}
    return True


def apply(report, public=PUBLIC):
    """Write every `replace` action of a report into the shipped wires. Returns
    the count applied per layer. The keys are re-checked, so a wire that moved
    since the report was written is left alone."""
    todo = [r for r in report["results"] if r["action"] == "replace"]
    done = {}
    dests = [r for r in todo if r["layer"] == "dest"]
    if dests:
        path = Path(public) / "app_data.json"
        blob = _load(path, {})
        for r in dests:
            d = (blob.get("destinations") or {}).get(r["id"])
            hero = photo_from_record((d or {}).get("image"))
            if not hero or hero["key"] != r["hero"]["key"]:
                continue
            doss = _load(Path(public) / "dossier" / f"{r['id'].replace(':', '-')}.json", {}) or {}
            rec = next((g for g in doss.get("gallery") or []
                        if (photo_from_record(g) or {}).get("key") == r["replacement"]["key"]), None)
            if apply_dest(d, rec):
                done["dest"] = done.get("dest", 0) + 1
        path.write_text(json.dumps(blob, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for layer in SHAPE_LAYERS:
        rows = [r for r in todo if r["layer"] == layer]
        for cc in sorted({r["cc"] for r in rows}):
            path = Path(public) / layer / f"{cc}.json"
            blob = _load(path)
            if not blob:
                continue
            by_id = {str(x.get("id")): x for x in blob.get(layer) or []}
            for r in (x for x in rows if x["cc"] == cc):
                row = by_id.get(r["id"])
                keys = [(photo_from_record(i) or {}).get("key") for i in (row or {}).get("images") or []]
                if not keys or keys[0] != r["hero"]["key"] or r["replacement"]["key"] not in keys:
                    continue
                if apply_layer_row(row, keys.index(r["replacement"]["key"])):
                    done[layer] = done.get(layer, 0) + 1
            path.write_text(json.dumps(blob, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return done


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def make_vision(spec, cfg):
    """(backend or None, why) from --vision none | session:FILE | gemini."""
    if not spec or spec == "none":
        return None, "off"
    if spec.startswith("session:"):
        return SessionVision(spec.split(":", 1)[1], float((cfg.get("vision") or {}).get("min_confidence", 0.6))), "session"
    if spec == "gemini":
        import ai_gateway
        try:
            return GeminiVision(cfg), "gemini"
        except ai_gateway.AIRefusal as e:
            return None, f"gemini unavailable ({e.code}): tier 2 skipped, unsure heroes go to review"
    raise SystemExit(f"photo_check: unknown --vision {spec}")


def write_prompts(report, out_dir, public=PUBLIC):
    """One prompt file per unsure hero, plus a manifest, for a session judge."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    p = vision_prompt()
    ids = []
    for r in report["results"]:
        if r["hero"]["cheap"]["verdict"] != "unsure":
            continue
        subject = {"layer": r["layer"], "name": r["name"], "cc": r["cc"]}
        photo = {"title": r["hero"]["key"] if r["hero"]["key"].startswith("File:") else None,
                 "url": r["hero"]["url"], "caption": ""}
        fid = hashlib.sha1(r["hero"]["key"].encode("utf-8")).hexdigest()[:12]
        (out / f"{fid}.txt").write_text(build_vision_prompt(subject, photo, p) + "\nIMAGE: "
                                        + (thumb_url(photo) or "") + "\n", encoding="utf-8")
        ids.append({"file": f"{fid}.txt", "key": r["hero"]["key"]})
    (out / "manifest.json").write_text(json.dumps({"prompt": p.id, "version": p.version, "items": ids},
                                                  indent=1), encoding="utf-8")
    return len(ids)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--public", default=str(PUBLIC))
    ap.add_argument("--layers", default=",".join(LAYERS))
    ap.add_argument("--all", action="store_true", help="every row, not the weekly sample")
    ap.add_argument("--meta", default=str(META_CACHE), help="Commons metadata cache (the hero audit's)")
    ap.add_argument("--fetch-meta", action="store_true", help="ask Commons for missing metadata (network)")
    ap.add_argument("--vision", default="none", help="none | session:FILE | gemini")
    ap.add_argument("--vision-prompts", default=None, help="write tier 2 prompts for a session judge to DIR")
    ap.add_argument("--apply", action="store_true", help="write the replacements into the wires")
    ap.add_argument("--validate", action="store_true",
                    help="also write the D23 runner result (layer photos) once its baseline exists")
    ap.add_argument("--out", default=str(REPORTS))
    ap.add_argument("--now", default=None)
    a = ap.parse_args(argv)
    cfg = config()
    now = datetime.fromisoformat(a.now.replace("Z", "+00:00")) if a.now else datetime.now(timezone.utc)
    cache = _load(a.meta, {}) or {}
    fetch = None
    if a.fetch_meta:
        def fetch(titles, c):
            AUDIT.commons_meta(titles, c)
    vision, why = make_vision(a.vision, cfg)
    layers = [x for x in a.layers.split(",") if x]
    rep = run(layers, Path(a.public), cfg, cache, vision, now, a.all, fetch)
    rep["vision"]["note"] = why
    if a.fetch_meta:
        Path(a.meta).write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{rep['generated_at'][:10]}.json"
    if a.apply:
        rep["applied"] = apply(rep, Path(a.public))
    path.write_text(json.dumps(rep, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    t = rep["totals"]
    print(f"photo_check: {t['checked']} heroes, {t['flagged']} flagged ({(t['flag_rate'] or 0) * 100:.1f}%), "
          f"{t['unsure']} unsure, {t['replaced']} replaced from the ladder; tier 2: {why}; report {path}")
    if a.vision_prompts:
        print(f"photo_check: {write_prompts(rep, a.vision_prompts)} prompts written to {a.vision_prompts}")
    if a.validate:
        return validate(path)
    return 0


def validate(report_path, valid_dir=None):
    """The D2 rule's input: the D23 runner's `photos` result for this report.
    Written only once the owner has set the baseline (register row T1198-b):
    a hard check with no baseline fails by design, and that must not fail a
    pipeline run before anyone has looked at the first report."""
    import subprocess
    valid_dir = Path(valid_dir or os.environ.get("CARTA_VALIDATION_DIR") or ROOT / "data" / "reports" / "validation")
    if not (valid_dir / "photos" / "baseline.json").is_file():
        print(f"photo_check: no D23 baseline at {valid_dir / 'photos' / 'baseline.json'} yet; "
              "the flag rate is not gated until the owner writes it (T1198-b)")
        return 0
    env = dict(os.environ, CARTA_PHOTO_CHECK=str(report_path))
    return subprocess.run([sys.executable, "-I", str(ROOT / "scripts" / "validation" / "runner.py"), "photos",
                           "--write", "--out", str(valid_dir)], env=env).returncode


if __name__ == "__main__":
    sys.exit(main())
