"""T1116: the register dry runs count rows and never write a file."""
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "register"))
import dry_run

TABLE = "\n".join([  # noqa: FLY002
    "# Open items register", "",
    "| ID | Raised by | Item | Owner | Status | Order |", "|---|---|---|---|---|---|",
    "| T030-a | T030 | Set the key (procedure: Execution/P15/_OPEN-stripe.md, step 1) | user | open | 1 |",
    "| T030-b | T030 | Paste it (procedure: Execution/P15/_OPEN-stripe.md, step 2) | user | open | 2 |",
    "| T031-a | T031 | Look at the thing on a phone | user | open | |",
    "| T400-a | T400 | The explore card chip needs a focus ring | next task | open | |",
    "| T401-a | T401 | The place page photo carousel jumps | next task | open | |",
    "| T900-a | T900 | Pipeline layer drops a column (D1) | next task | open | |",
    "",
])


def rows():
    return dry_run.parse_text(TABLE)


def test_parse_handles_lf_and_crlf():
    assert len(rows()) == 6
    assert len(dry_run.parse_text(TABLE.replace("\n", "\r\n"))) == 6


def test_option_counts():
    r = rows()
    assert dry_run.summary("d", r)["rows"] == 6
    # a: two stripe steps -> 1 row, the unpointed owner row -> 1 row, 3 next-task rows stay
    assert dry_run.summary("a", r)["rows"] == 5
    # b: the two T400 band rows fold; T900 stays
    assert dry_run.summary("b", r)["rows"] == 4
    assert dry_run.summary("c", r)["rows"] == 3


def test_folded_rows_get_a_target():
    s = dry_run.summary("b", rows())
    assert sum(s["folded"].values()) == 2


def test_roadmap_item_from_row_text():
    r = {r["id"]: r for r in rows()}
    assert dry_run.roadmap_item(r["T900-a"])[0] == "D1"


def test_dry_run_writes_nothing():
    p = ROOT / "Execution" / "_OPEN.md"
    before = hashlib.sha256(p.read_bytes()).hexdigest()
    for opt in "abcd":
        dry_run.summary(opt, dry_run.load(p))
    assert hashlib.sha256(p.read_bytes()).hexdigest() == before
