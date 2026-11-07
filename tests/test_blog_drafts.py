"""T1178 (ROADMAP K14): the blog draft generator and the check script.

The generator is run on a small synthetic wire; the check script must pass its
output and refuse each seeded bad draft."""
import copy
import json
import os
import shutil
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "blog"))
import blog_drafts  # noqa: E402
import check_draft  # noqa: E402


def dest(i, high=24, comfort=80, tier=0, rating=7.5, hotel=90, best=(6,), iso="CX"):
    m = [[high, 12, 30, comfort]] * 12
    return {"city": f"Town{i}", "country": f"Land {iso}", "iso2": iso,
            "climate": {"m": m, "best": list(best)},
            "crowding": {"monthly": {"tier": [tier] * 12}},
            "rating": {"score": rating},
            "accommodation": {"beds": {"hotel3": hotel}},
            "costs": {"meal_cheap_eur": 10, "meal_mid_eur": 25}}


@pytest.fixture()
def wire():
    d = {f"D{i:02d}": dest(i, hotel=80 + i, iso=f"C{i % 8}") for i in range(40)}
    d["CROWD"] = dest(99, tier=3)
    d["LOWRATE"] = dest(98, rating=5.0)
    d["NOPRICE"] = dest(97)
    d["NOPRICE"]["costs"] = {}
    return {"meta": {"generated_at": "2026-06-07T00:00:00+00:00", "n_destinations": len(d)}, "destinations": d}


@pytest.fixture()
def blog(tmp_path, wire):
    out = tmp_path / "blog"
    blog_drafts.write_draft(wire, 6, 2027, str(out))
    return out, wire


def post(out):
    return str(out / "where-to-go-in-june-2027.md")


def test_selection_rules(wire):
    rows, counts = blog_drafts.select(wire, 6)
    ids = {r["id"] for r in rows}
    assert "CROWD" not in ids and "LOWRATE" not in ids and "NOPRICE" not in ids
    assert counts["listed"] == len(rows) == blog_drafts.LIST_N
    assert counts["season_rule"] == "best_months"
    assert [r["day_eur"] for r in rows] == sorted(r["day_eur"] for r in rows)
    per = {}
    for r in rows:
        per[r["iso2"]] = per.get(r["iso2"], 0) + 1
    assert max(per.values()) <= blog_drafts.PER_COUNTRY


def test_winter_month_falls_back_to_comfort(wire):
    rows, counts = blog_drafts.select(wire, 12)
    assert counts["season_rule"] == "top_comfort"
    assert rows


def test_generator_is_deterministic_and_draft(blog, wire, tmp_path):
    out, _ = blog
    first = open(post(out), encoding="utf-8").read()
    blog_drafts.write_draft(wire, 6, 2027, str(out))
    assert open(post(out), encoding="utf-8").read() == first
    assert "status: draft" in first


def test_generated_draft_passes_the_check_including_the_wire(blog, tmp_path):
    out, wire = blog
    wire_path = tmp_path / "wire.json"
    wire_path.write_text(json.dumps(wire))
    assert check_draft.check_file(post(out), wire_path=str(wire_path)) == []


def edit(out, fn):
    p = post(out)
    s = open(p, encoding="utf-8").read()
    open(p, "w", encoding="utf-8").write(fn(s))


def edit_data(out, fn):
    p = str(out / "data" / "where-to-go-in-june-2027.json")
    d = json.load(open(p, encoding="utf-8"))
    fn(d)
    open(p, "w", encoding="utf-8").write(json.dumps(d))


def problems(out, **kw):
    return check_draft.check_file(post(out), **kw)


def test_rejects_a_table_number_that_differs_from_the_data(blog):
    out, _ = blog
    edit(out, lambda s: s.replace("| quiet | 75 |", "| quiet | 79 |", 1))
    assert any(p.startswith("numbers:") for p in problems(out))


def test_rejects_a_prose_number_not_in_the_data(blog):
    out, _ = blog
    edit(out, lambda s: s.replace("## What the numbers say\n", "## What the numbers say\n\nAbout 4321 travellers asked.\n"))
    assert any("4321" in p for p in problems(out))


def test_rejects_a_data_file_edited_after_the_hash(blog):
    out, _ = blog
    edit_data(out, lambda d: d["rows"][0].update(day_eur=1))
    assert any("snapshot_sha256" in p for p in problems(out))


def test_rejects_a_wire_that_disagrees(blog, tmp_path):
    out, wire = blog
    w2 = copy.deepcopy(wire)
    w2["destinations"]["D01"]["costs"]["meal_mid_eur"] = 60
    wp = tmp_path / "w2.json"
    wp.write_text(json.dumps(w2))
    assert any("wire" in p for p in problems(out, wire_path=str(wp)))


@pytest.mark.parametrize("insert,needle", [
    ("A trip — any trip.", "dash"),
    ("It is simply a list.", "banned word"),
    ("The best beaches ever.", "superlative"),
    ("What a find!", "exclamation"),
])
def test_rejects_copy_rule_breaks(blog, insert, needle):
    out, _ = blog
    edit(out, lambda s: s.replace("## How we chose them\n", f"## How we chose them\n\n{insert}\n"))
    assert any(needle in p for p in problems(out)), problems(out)


def test_best_months_is_allowed_as_carta_term(blog):
    out, _ = blog
    edit(out, lambda s: s.replace("## How we chose them\n", "## How we chose them\n\nThese are best months.\n"))
    assert problems(out) == []


def img(**kw):
    base = {"src": "https://upload.wikimedia.org/x.jpg", "license": "cc-by", "credit": "A. Person", "alt": "A beach"}
    base.update(kw)
    return base


def with_image(out, **kw):
    edit_data(out, lambda d: d.update(images=[img(**kw)]))
    edit(out, lambda s: s.replace("{{chart}}", "![A beach](https://upload.wikimedia.org/x.jpg)\n\n{{chart}}"))


def test_image_with_licence_and_credit_passes(blog):
    out, _ = blog
    with_image(out)
    assert problems(out) == []


@pytest.mark.parametrize("kw,needle", [({"license": "all-rights-reserved"}, "licence"), ({"credit": ""}, "credit"), ({"alt": ""}, "alt")])
def test_rejects_unlicensed_or_uncredited_image(blog, kw, needle):
    out, _ = blog
    with_image(out, **kw)
    assert any(needle in p for p in problems(out))


def test_rejects_an_image_missing_from_the_data_file(blog):
    out, _ = blog
    edit(out, lambda s: s.replace("{{chart}}", "![x](https://example.com/y.jpg)\n\n{{chart}}"))
    assert any("not listed" in p for p in problems(out))


def test_rejects_a_post_with_no_original_data(blog):
    out, _ = blog

    def cut(d):
        d["rows"] = d["rows"][:3]
    edit_data(out, cut)
    edit(out, lambda s: "\n".join(ln for ln in s.split("\n") if not ln.startswith("| Town")))
    assert any(p.startswith("original:") or p.startswith("numbers:") for p in problems(out))


def test_rejects_a_repeated_question(blog):
    out, _ = blog
    twin = out / "another-june.md"
    twin.write_text(open(post(out), encoding="utf-8").read().replace("slug: where-to-go-in-june-2027", "slug: another-june"), encoding="utf-8")
    assert any("duplicate" in p for p in problems(out))
    os.remove(twin)
    assert problems(out) == []


def test_missing_header_field_is_refused(blog):
    out, _ = blog
    edit(out, lambda s: s.replace("author: Carta\n", ""))
    assert any("missing 'author'" in p for p in problems(out))


def test_committed_sample_draft_passes():
    blogdir = os.path.join(ROOT, "content", "blog")
    posts = [f for f in os.listdir(blogdir) if f.endswith(".md") and not f.startswith(("_", "README"))]
    assert posts
    for f in posts:
        assert check_draft.check_file(os.path.join(blogdir, f)) == [], f


def test_prose_guard():
    data = {"counts": {"with_figures": 100, "in_season": 50, "quiet": 20, "rated": 10, "listed": 10},
            "criteria": {"min_rating": 7.0}, "month_name": "June", "year": 2027}
    ok = "Of 100 places, 50 are in season."
    assert blog_drafts.guard_prose(ok, data) == ok
    assert blog_drafts.guard_prose("Of 101 places.", data) is None
    assert blog_drafts.guard_prose("A simple list.", data) is not None
    assert blog_drafts.guard_prose("It is easy.", data) is None
    assert blog_drafts.guard_prose("Dash — here.", data) is None
    assert blog_drafts.guard_prose("x" * 500, data) is None


def test_dry_run_writes_nothing(wire, tmp_path):
    blog_drafts.write_draft(wire, 6, 2027, str(tmp_path / "none"), dry_run=True)
    assert not (tmp_path / "none").exists()
    shutil.rmtree(tmp_path, ignore_errors=True)
