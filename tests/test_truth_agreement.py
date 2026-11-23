"""evals/truth/agreement.py: Cohen's kappa and raw agreement, drafted against verified (G2, D4)."""
import csv
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("truth_agreement_t", ROOT / "evals/truth/agreement.py")
ag = importlib.util.module_from_spec(_spec)
sys.modules["truth_agreement_t"] = ag
_spec.loader.exec_module(ag)

COLS = ["item_id", "kind", "name", "cc", "field", "current_value", "verified_value", "status",
        "source_url", "evidence", "text_sha", "by", "verified_on", "note"]


def write(path, rows):
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=COLS)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in COLS})


def row(i, field, value, status, kind="place"):
    return {"item_id": f"{kind}:{i}", "kind": kind, "field": field, "verified_value": value, "status": status}


def test_kappa_known_values():
    assert ag.cohen_kappa(["a", "b", "a", "b"], ["a", "b", "a", "b"]) == 1
    assert ag.cohen_kappa(["a", "a", "b", "b"], ["a", "b", "a", "b"]) == 0
    assert ag.cohen_kappa(["a", "a"], ["a", "a"]) is None          # one label: chance agreement is 1
    assert ag.cohen_kappa([], []) is None
    k = ag.cohen_kappa(["y", "y", "y", "n", "n"], ["y", "y", "n", "n", "n"])
    assert round(k, 4) == 0.6154


def test_no_owner_rows_yet(tmp_path, capsys):
    draft, sheet = tmp_path / "draft.csv", tmp_path / "sheet.csv"
    write(draft, [row(1, "country", "NL", "drafted")])
    write(sheet, [row(1, "country", "", "unverified")])
    assert ag.main(["--draft", str(draft), "--sheet", str(sheet)]) == 0
    assert capsys.readouterr().out.startswith("no owner rows yet")


def test_agreement_on_a_fixture_uses_the_field_tolerances(tmp_path, capsys):
    draft, sheet = tmp_path / "draft.csv", tmp_path / "sheet.csv"
    write(draft, [row(1, "country", "NL", "drafted"), row(2, "country", "BE", "drafted"),
                  row(3, "country", "FR", "drafted"), row(4, "country", "DE", "drafted"),
                  row(5, "population", "100000", "drafted"), row(6, "population", "100000", "drafted"),
                  row(7, "country", "IT", "unverifiable"), row(8, "country", "ES", "drafted")])
    write(sheet, [row(1, "country", "NL", "verified"), row(2, "country", "BE", "verified"),
                  row(3, "country", "FR", "verified"), row(4, "country", "AT", "verified"),
                  row(5, "population", "110000", "verified"),       # within 15 percent
                  row(6, "population", "150000", "verified"),       # off by a third
                  row(7, "country", "IT", "verified"),              # the draft was unverifiable: not matched
                  row(8, "country", "ES", "unverified")])           # owner has not done it yet
    assert ag.main(["--draft", str(draft), "--sheet", str(sheet), "--json"]) == 0
    import json
    res = json.loads(capsys.readouterr().out)
    assert res["matched"] == 6 and res["agree"] == 4 and res["raw_agreement"] == round(4 / 6, 4)
    assert res["kappa_rows"] == 4 and res["kappa"] is not None
    assert res["by_field"]["place.population"] == {"agree": 1, "rows": 2}


def test_coverage_counts_rows_the_draft_gave_up_and_few_kappa_rows_warn(tmp_path, capsys):
    draft, sheet = tmp_path / "draft.csv", tmp_path / "sheet.csv"
    write(draft, [row(1, "country", "NL", "drafted"), row(2, "country", "BE", "unverifiable"),
                  row(3, "country", "FR", "unverifiable")])
    write(sheet, [row(1, "country", "NL", "verified"), row(2, "country", "BE", "verified"),
                  row(3, "country", "FR", "verified")])
    assert ag.main(["--draft", str(draft), "--sheet", str(sheet)]) == 0
    out = capsys.readouterr().out
    assert "coverage 1 of 3" in out and "WARNING: only 1 category rows, fewer than 20" in out


def test_an_image_depicts_row_counts_toward_the_kappa(tmp_path):
    """Judge 3 fix 3: image_depicts is a yes or no label (compare "yes")."""
    draft, sheet = tmp_path / "draft.csv", tmp_path / "sheet.csv"
    write(draft, [row(1, "image_depicts", "yes", "drafted"), row(2, "image_depicts", "yes", "drafted")])
    write(sheet, [row(1, "image_depicts", "yes", "verified"), row(2, "image_depicts", "no", "verified")])
    fields = ag.json.loads((ROOT / "evals/truth/fields.json").read_text(encoding="utf-8"))["fields"]
    res = ag.compare_sheets(ag.read(draft), ag.read(sheet), fields, ag._truth())
    assert res["kappa_rows"] == 2 and res["matched"] == 2
