"""The image brief as a vision-scoring prompt.

Tier: Library

The brief lives in docs/IMAGE_BRIEF.md; this module is that document
turned into text for a vision model, plus the one rule the model must not
be trusted with (distance). Change both together and bump PROMPT_VERSION.

Model neutral on purpose. Runtime and pipeline AI is Gemini only, and
nothing here imports an SDK: build_prompt() returns a string, parse_result()
reads the JSON that comes back, apply_distance_rule() makes the final call.

Deliberately a new file rather than an edit to relevance.py, which is the
CLIP veto and is being changed by another task.

ASCII clean, no em dashes, per project convention.
"""

import json

PROMPT_VERSION = "brief_v1"

MAX_DISTANCE_M = 2000

SECTIONS = ("mountain", "trail", "cycling", "beach", "lake")

# What the hero and the gallery answer, per section. Mirrors the table in
# docs/IMAGE_BRIEF.md.
HERO = {
    "mountain": "what you see FROM the summit",
    "trail": "the best viewpoint on the route, looking outward",
    "cycling": "the surface under the tyre with the landscape beyond",
    "beach": "the beach along its length from water level, so the entry "
             "and the sand can be read",
    "lake": "the shore looking across the water, so the colour and the "
            "far side are visible",
}

GALLERY = {
    "mountain": "what the mountain looks like from the valley, the hut, "
                "or the last 100 m",
    "trail": "a named moment along the walk, in walking order",
    "cycling": "a named feature the route passes",
    "beach": "the view from the beach outward, or the walk down to it",
    "lake": "the swimming entry, the shore path, or the view from above",
}

REJECT_CODES = ("animal_plant_closeup", "vehicle", "interior",
                "map_diagram", "satellite", "person_subject",
                "marker_subject", "too_far")

_TEMPLATE = """You score one photograph for a European travel app. Every \
image must answer "what will I see", not "what does it look like".

The photograph is for a {section}: {name}.
The hero image for a {section} answers: {hero}.
A gallery image for a {section} answers: {gallery}.

Hard rejects. If the MAIN subject of the image is any of these, set \
reject to the code and score both answers 0:
- animal_plant_closeup: an animal or a plant in close-up
- vehicle: a car, train, boat or bicycle as the subject
- interior: an indoor photograph
- map_diagram: a map, plan, diagram, board or screenshot
- satellite: a satellite or aerial-map image
- person_subject: an identifiable person as the main subject
- marker_subject: a signpost, waymark or trail marker as the subject (a \
sign at the edge of a good view is fine, a sign the photograph is about \
is not)

Distance. {distance_line} Say whether the image is explicitly framed as \
a view of the feature from somewhere else ("seen from"), based on what \
you can see and on this caption: {caption}. Do not reject on distance \
yourself, only report seen_from.

Scoring. answers_hero and answers_gallery are integers 0 to 5. Score \
what the image shows, not how pretty it is. A beautiful image of the \
wrong thing scores low. {section_note}

Reply with one JSON object and nothing else, with exactly these keys:
{{"subject": str, "reject": str or null, "answers_hero": int, \
"answers_gallery": int, "seen_from": bool, "subject_is_marker": bool, \
"note": str}}"""


def build_prompt(section, name, distance_m=None, caption="", surface=""):
    """The prompt text for one image. `distance_m` is the metre distance
    from the image coordinate to the feature, from metadata, or None."""
    if section not in SECTIONS:
        raise ValueError(f"unknown section {section!r}")
    if distance_m is None:
        distance_line = ("The distance from the camera to the feature is "
                         "unknown.")
    else:
        distance_line = (f"The camera was {int(distance_m)} m from the "
                         f"feature.")
    note = ""
    if section == "cycling":
        note = ("If the surface in frame is implausible for a route "
                f"described as {surface or 'of unknown surface'}, score "
                "the hero answer 1 or lower.")
    return _TEMPLATE.format(
        section=section, name=name, hero=HERO[section],
        gallery=GALLERY[section], distance_line=distance_line,
        caption=caption or "(none)", section_note=note)


def parse_result(text):
    """The model's JSON, or None when it is not usable. Tolerates a code
    fence. Clamps scores to 0..5 and maps an unlisted reject code to
    'unknown' so it still counts as a reject."""
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.strip("`")
        if t.lower().startswith("json"):
            t = t[4:]
    try:
        r = json.loads(t)
    except ValueError:
        return None
    if not isinstance(r, dict):
        return None
    for k in ("answers_hero", "answers_gallery"):
        try:
            r[k] = max(0, min(5, int(r.get(k, 0))))
        except (TypeError, ValueError):
            return None
    if r.get("reject") not in (None,) + REJECT_CODES:
        r["reject"] = "unknown"
    r["seen_from"] = bool(r.get("seen_from"))
    r["subject_is_marker"] = bool(r.get("subject_is_marker"))
    if r["subject_is_marker"] and not r.get("reject"):
        r["reject"] = "marker_subject"
    return r


def distance_m(lat1, lon1, lat2, lon2):
    """Great-circle metres between the image and the feature (T126-b: the
    caller used to have to supply distance_m and nothing computed it)."""
    import math
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = (math.sin(dp / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


EXEMPT_REJECTS = ("marker_subject", "too_far")


def apply_distance_rule(result, distance_m, p18=False):
    """Rule 8, decided in code: an image over 2 km from the feature is
    rejected unless the model reported it as framed 'seen from'. Unknown
    distance does not reject, and is recorded. `p18` is True for a Wikidata
    P18 image: a person stated it depicts the item, so the two new rejects
    (marker_subject, too_far) never veto it (owner decision 2026-10-07,
    T362, T126-b). Other rejects still apply."""
    if result is None:
        return None
    out = dict(result)
    out["distance_known"] = distance_m is not None
    if p18 and out.get("reject") in EXEMPT_REJECTS:
        out["reject"] = None
        out["p18_exempt"] = True
    elif (distance_m is not None and distance_m > MAX_DISTANCE_M
            and not out.get("seen_from") and not out.get("reject")
            and not p18):
        out["reject"] = "too_far"
    if out.get("reject"):
        out["answers_hero"] = 0
        out["answers_gallery"] = 0
    return out


if __name__ == "__main__":
    p = build_prompt("lake", "Lake Bled", 350, "Bled from the island")
    assert "Lake Bled" in p and "350 m" in p
    assert "—" not in p
    r = parse_result('```json\n{"subject":"lake","reject":null,'
                     '"answers_hero":9,"answers_gallery":2,'
                     '"seen_from":false,"subject_is_marker":false,'
                     '"note":"x"}\n```')
    assert r["answers_hero"] == 5
    assert apply_distance_rule(r, 3000)["reject"] == "too_far"
    assert apply_distance_rule(dict(r, seen_from=True), 3000)["reject"] \
        is None
    assert apply_distance_rule(r, None)["distance_known"] is False
    assert apply_distance_rule(r, 3000, p18=True)["reject"] is None
    mk = dict(r, reject="marker_subject")
    assert apply_distance_rule(mk, 10, p18=True)["reject"] is None
    assert apply_distance_rule(dict(r, reject="blurry"), 10,
                               p18=True)["reject"] == "blurry"
    assert 110000 < distance_m(0, 0, 1, 0) < 112000
    assert parse_result("nope") is None
    for s in SECTIONS:
        build_prompt(s, "x")
    print("vision_prompt ok")
