"""T1174 (ROADMAP K14): the extra blog post types and their checks, on a synthetic wire."""
import copy
import json
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
sys.path.insert(0, os.path.join(ROOT, "pipeline", "blog"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "blog"))
import blog_drafts  # noqa: E402
import blog_drafts_more as more  # noqa: E402
import check_draft  # noqa: E402


def dest(i, hotel=100, rating=7.5, iso="CX"):
    return {"city": f"Town{i}", "country": f"Land {iso}", "iso2": iso,
            "climate": {"m": [[20, 10, 30, 70]] * 12, "best": [6]},
            "crowding": {"monthly": {"tier": [0] * 12}},
            "rating": {"score": rating},
            "accommodation": {"beds": {"hotel3": hotel}},
            "costs": {"meal_cheap_eur": 10, "meal_mid_eur": 25}}


def make_wire(gen, n=40, hotel=lambda i: 100 + i, extra=0):
    d = {f"D{i:02d}": dest(i, hotel=hotel(i), rating=6 + (i % 30) / 10, iso=f"C{i % 12}") for i in range(n)}
    for j in range(extra):
        d[f"N{j:02d}"] = dest(200 + j, hotel=90, rating=8.5 - j / 10, iso=f"C{j % 12}")
    return {"meta": {"generated_at": gen, "n_destinations": len(d)}, "destinations": d}


@pytest.fixture()
def world(tmp_path):
    """Out dir holding the May snapshot; a June wire with moved prices and 12 new places."""
    out = tmp_path / "blog"
    may = make_wire("2026-05-07T00:00:00+00:00")
    more.write_snapshot(str(out), more.snapshot_of(may))
    june = make_wire("2026-06-07T00:00:00+00:00", hotel=lambda i: 100 + i + (i * 3 if i % 2 else -i), extra=12)
    wp = tmp_path / "wire.json"
    wp.write_text(json.dumps(june))
    return out, june, str(wp)


def fares(origin="AMS", dests=12, weeks=5):
    rows = []
    for k in range(dests):
        for w in range(weeks):
            rows.append({"dest": f"D{k:02d}", "depart": f"2027-05-{1 + w * 7:02d}", "price_eur": 60 + k * 3 + (w * 9) % 31})
    return {"generated_at": "2026-11-01T00:00:00+00:00", "origin": origin, "origin_name": "Amsterdam",
            "window": {"label": "May 2027", "slug": "may-2027"}, "fares": rows}


def run(world, tmp_path, with_fares=True):
    out, june, wp = world
    paths = []
    if with_fares:
        fp = tmp_path / "fares-ams-may-2027.json"
        fp.write_text(json.dumps(fares()))
        paths = [str(fp)]
    slugs, notes = more.run(june, 12, 2026, str(out), more.TYPES[1:], paths)
    return out, wp, slugs, notes


def test_three_types_written_and_pass_the_check(world, tmp_path):
    out, wp, slugs, notes = run(world, tmp_path)
    assert sorted(slugs) == ["lowest-fare-week-from-ams-may-2027", "new-on-carta-december-2026",
                             "what-changed-in-december-2026"]
    assert notes == []
    for s in slugs:
        text = open(out / f"{s}.md", encoding="utf-8").read()
        assert "status: draft" in text
        assert check_draft.check_file(str(out / f"{s}.md"), wire_path=wp) == [], s


def test_no_earlier_snapshot_skips_the_comparisons(tmp_path):
    out = tmp_path / "blog"
    wire = make_wire("2026-06-07T00:00:00+00:00")
    slugs, notes = more.run(wire, 12, 2026, str(out), more.TYPES[1:], [])
    assert slugs == []
    assert len(notes) == 3 and all("skipped" in n for n in notes)
    assert os.path.exists(more.snapshot_path(str(out), wire["meta"]["generated_at"]))


def test_a_rerun_compares_with_the_older_snapshot_not_itself(world, tmp_path):
    out, june, _ = world
    more.run(june, 12, 2026, str(out), ("what-changed",), [])
    slugs, _ = more.run(june, 12, 2026, str(out), ("what-changed",), [])
    assert slugs == ["what-changed-in-december-2026"]


def test_changed_rows_follow_the_two_snapshots(world, tmp_path):
    out, wp, slugs, _ = run(world, tmp_path)
    d = json.load(open(out / "data" / "what-changed-in-december-2026.json"))
    assert len(d["rows"]) >= more.MIN_ROWS
    assert all(abs(r["change_pct"]) >= more.MIN_CHANGE_PCT for r in d["rows"])
    assert [abs(r["change_pct"]) for r in d["rows"]] == sorted((abs(r["change_pct"]) for r in d["rows"]), reverse=True)
    per = {}
    for r in d["rows"]:
        per[r["iso2"]] = per.get(r["iso2"], 0) + 1
    assert max(per.values()) <= more.PER_COUNTRY


def test_new_places_are_only_those_absent_before(world, tmp_path):
    out, wp, slugs, _ = run(world, tmp_path)
    d = json.load(open(out / "data" / "new-on-carta-december-2026.json"))
    assert d["counts"]["new"] == 12 and d["counts"]["listed"] == len(d["rows"])
    assert all(r["id"].startswith("N") for r in d["rows"])


def test_fares_one_lucky_week_is_not_a_row(world, tmp_path):
    out, june, wp = world
    f = fares()
    f["fares"] = [x for x in f["fares"] if not (x["dest"] == "D03" and x["depart"] != "2027-05-01")]
    data = more.build_fares(f, "data/inputs/x.json", "0" * 64, june)
    assert "D03" not in {r["id"] for r in data["rows"]}
    assert all(r["saving_eur"] >= 0 for r in data["rows"])


def edit(out, slug, fn_md=None, fn_data=None):
    if fn_md:
        p = out / f"{slug}.md"
        p.write_text(fn_md(p.read_text(encoding="utf-8")), encoding="utf-8")
    if fn_data:
        p = out / "data" / f"{slug}.json"
        d = json.loads(p.read_text(encoding="utf-8"))
        fn_data(d)
        p.write_text(json.dumps(d, indent=2), encoding="utf-8")


def test_check_refuses_seeded_faults(world, tmp_path):
    out, wp, slugs, _ = run(world, tmp_path)
    ch, new, fare = "what-changed-in-december-2026", "new-on-carta-december-2026", "lowest-fare-week-from-ams-may-2027"
    base = {s: ((out / f"{s}.md").read_text(encoding="utf-8"), (out / "data" / f"{s}.json").read_text(encoding="utf-8")) for s in slugs}

    def reset():
        for s, (m, d) in base.items():
            (out / f"{s}.md").write_text(m, encoding="utf-8")
            (out / "data" / f"{s}.json").write_text(d, encoding="utf-8")

    def problems(s):
        return check_draft.check_file(str(out / f"{s}.md"), wire_path=wp)

    # a table cell changed
    edit(out, ch, lambda t: t.replace("| up |", "| down |", 1) if "| up |" in t else t.replace("| down |", "| up |", 1))
    assert any("Direction" in p for p in problems(ch)); reset()
    # a price that is not the wire's: the data row and the hash move together, the wire still disagrees
    def bump(d):
        d["rows"][0]["bed_now"] += 1
        d["rows_sha256"] = blog_drafts.snapshot_hash({"rows": d["rows"], "counts": d["counts"]})
    edit(out, ch, None, bump)
    assert any("snapshot_sha256" in p or "bed_now" in p for p in problems(ch)); reset()
    # the earlier snapshot was edited after the post cited it
    snap = more.previous_snapshot(str(out), "2026-06-07T00:00:00+00:00")[0]
    sd = json.load(open(snap)); sd["places"]["D01"]["bed"] = 9999
    open(snap, "w").write(json.dumps(sd))
    assert any("earlier snapshot does not match" in p for p in problems(ch)); 
    sd["places"]["D01"]["bed"] = 101; open(snap, "w").write(json.dumps(sd))
    # a place claimed as new that was in the earlier snapshot
    def old_id(d):
        d["rows"][0]["id"] = "D01"
        d["rows_sha256"] = blog_drafts.snapshot_hash({"rows": d["rows"], "counts": d["counts"]})
    reset(); edit(out, new, None, old_id)
    assert any("not new" in p for p in problems(new)); reset()
    # a fares file that changed
    fp = out / "data" / "inputs" / "fares-ams-may-2027.json"
    orig = fp.read_text()
    fp.write_text(orig.replace('"price_eur": 60', '"price_eur": 61', 1))
    assert any("fares file does not match" in p for p in problems(fare))
    fp.write_text(orig)
    # hype word and a dash
    edit(out, fare, lambda t: t.replace("Lowest fare week", "Cheapest fare week", 1)); assert any("hype" in p for p in problems(fare)); reset()
    edit(out, ch, lambda t: t.replace("moved most", "moved most – now", 1)); assert any("dash" in p for p in problems(ch)); reset()
    assert problems(ch) == problems(new) == problems(fare) == []


def test_copy_of_the_templates_has_no_hype(world, tmp_path):
    out, wp, slugs, _ = run(world, tmp_path)
    for s in slugs:
        t = (out / f"{s}.md").read_text(encoding="utf-8").split("---", 2)[2]
        assert not check_draft.copy_problems("x", t), s


# ---- the monthly routine (scripts/blog/monthly_pr.py)

def _git(repo, *a):
    import subprocess
    return subprocess.run(["git", "-C", str(repo), *a], capture_output=True, text=True, check=True).stdout.strip()


@pytest.fixture()
def box(tmp_path, world):
    """A bare 'remote', a checkout on main with a clean blog folder, and fresh drafts written into it."""
    import subprocess
    remote, repo = tmp_path / "remote.git", tmp_path / "box"
    subprocess.run(["git", "init", "-q", "--bare", str(remote)], check=True)
    subprocess.run(["git", "init", "-q", "-b", "main", str(repo)], check=True)
    for k, v in (("user.email", "t@t"), ("user.name", "t")):
        _git(repo, "config", k, v)
    (repo / "content" / "blog").mkdir(parents=True)
    (repo / "content" / "blog" / "README.md").write_text("# blog\n")
    _git(repo, "add", "."); _git(repo, "commit", "-q", "-m", "init")
    _git(repo, "remote", "add", "origin", str(remote))
    _git(repo, "push", "-q", "-u", "origin", "main")
    out, june, wp = world
    import shutil
    shutil.copytree(out / "data", repo / "content" / "blog" / "data")
    more.run(june, 12, 2026, str(repo / "content" / "blog"), ("what-changed", "new-on-carta"), [])
    return repo, remote, wp


def test_monthly_pr_dry_run_changes_nothing(box):
    sys.path.insert(0, os.path.join(ROOT, "scripts", "blog"))
    import monthly_pr
    repo, remote, _ = box
    lines = []
    assert monthly_pr.run(str(repo), "2026-12", push=False, log=lines.append) == 0
    assert any("dry run" in x for x in lines)
    assert _git(repo, "rev-parse", "--abbrev-ref", "HEAD") == "main"
    assert _git(repo, "branch", "--list", "blog-drafts-*") == ""


def test_monthly_pr_pushes_a_branch_not_main(box):
    import monthly_pr
    repo, remote, _ = box
    assert monthly_pr.run(str(repo), "2026-12", push=True, log=lambda *_: None) == 0
    assert _git(repo, "rev-parse", "--abbrev-ref", "HEAD") == "main"
    heads = _git(remote, "branch", "--list").replace("*", "").split()
    assert "blog-drafts-2026-12" in heads and "main" in heads
    assert _git(remote, "log", "-1", "--format=%s", "main") == "init"
    files = _git(remote, "show", "--name-only", "--format=", "blog-drafts-2026-12").splitlines()
    assert files and all(f.startswith("content/blog/") for f in files)


def test_monthly_pr_stops_on_a_refused_draft(box):
    import monthly_pr
    repo, remote, _ = box
    p = repo / "content" / "blog" / "what-changed-in-december-2026.md"
    p.write_text(p.read_text(encoding="utf-8").replace("Which places", "Which places!"), encoding="utf-8")
    lines = []
    assert monthly_pr.run(str(repo), "2026-12", push=True, log=lines.append) == 1
    assert _git(remote, "branch", "--list").replace("*", "").split() == ["main"]
