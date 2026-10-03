"""The one aggregator block list, read by Python and by the Edge Functions.

T327 (register row T041-f) moved BLOCKED_DOMAINS out of
pipeline/dossier/common.py into supabase/functions/_shared/blocked_domains.json
so the facts refresh job T147 builds reads the same list as the dossier sweep.
The rule around the list exists twice, in common.py and in
_shared/publisher.mjs, so these tests run the same inputs through both and
fail on any disagreement. The JavaScript half needs node on PATH and is
skipped without it.

Run from the repo root: pytest tests/test_blocked_domains.py -q
"""

import json
import os
import shutil
import subprocess
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DOSSIER = os.path.join(ROOT, "pipeline", "dossier")

# The trips pipeline has a module called common too. Import the dossier one,
# then put sys.modules and sys.path back, so a later test file importing the
# other common does not get this one from the cache.
_other = sys.modules.pop("common", None)
sys.path.insert(0, DOSSIER)
import common  # noqa: E402
sys.path.remove(DOSSIER)
sys.modules.pop("common", None)
if _other is not None:
    sys.modules["common"] = _other

LIST_FILE = os.path.join(ROOT, "supabase", "functions", "_shared", "blocked_domains.json")
PUBLISHER_MJS = os.path.join(ROOT, "supabase", "functions", "_shared", "publisher.mjs")

# The fourteen domains common.py carried inline before T327.
BEFORE_T327 = {
    "pinterest.com", "quora.com", "facebook.com", "instagram.com", "x.com",
    "twitter.com", "youtube.com", "reddit.com", "tripadvisor.com",
    "booking.com", "expedia.com", "agoda.com", "hotels.com", "trip.com",
}

HOSTS = [
    "www.tripadvisor.co.za", "tripadvisor.de", "en.tripadvisor.com", "WWW.Booking.com",
    "x.com", "xenia.gr", "trip.com", "tripsavvy.com", "wien.info", "www.wien.info",
    "romamobilita.it", "www.atac.roma.it", "tfl.gov.uk", "www.bbc.co.uk",
    "muoversi.venezia.it", "localhost", "", "facebook.co.uk", "m.youtube.com",
    "pinterest.fr", "visit.example.com:8080", "a.b.c.example.org",
]

URLS = [
    "https://www.tripadvisor.co.uk/Attraction_Review-g1",
    "https://romamobilita.it/muoversi-a-roma/parcheggio-di-scambio/",
    "https://www.atac.roma.it/utility/atac-sosta/parcheggi",
    "https://m.facebook.com/somepage",
    "https://tfl.gov.uk/modes/driving/",
    "http://wien.info:80/en",
    "not a url",
    "",
]


def test_list_file_is_the_source():
    with open(LIST_FILE, encoding="utf-8") as fh:
        listed = set(json.load(fh)["domains"])
    assert common.BLOCKED_DOMAINS == listed
    assert common.BLOCKED_DOMAINS_FILE == LIST_FILE


def test_move_changed_nothing():
    assert set(common.BLOCKED_DOMAINS) == BEFORE_T327


def test_rule_unchanged():
    assert common.is_blocked(common.registrable("www.tripadvisor.co.za"))
    assert not common.is_blocked(common.registrable("xenia.gr"))
    assert not common.is_blocked(common.registrable("tripsavvy.com"))
    assert common.registrable("www.wien.info") == "wien.info"
    assert common.publisher("https://romamobilita.it/x") == "romamobilita.it"
    assert common.publisher("https://www.booking.com/hotel") == ""


def _python_side():
    return {
        "registrable": [common.registrable(h) for h in HOSTS],
        "blocked": [common.is_blocked(common.registrable(h)) for h in HOSTS],
        "publisher": [common.publisher(u) for u in URLS],
    }


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not on PATH")
def test_python_and_javascript_agree():
    url = "file:///" + PUBLISHER_MJS.replace("\\", "/").lstrip("/")
    script = (
        f"const m = await import({json.dumps(url)});"
        f"const H = {json.dumps(HOSTS)}; const U = {json.dumps(URLS)};"
        "console.log(JSON.stringify({"
        "registrable: H.map((h) => m.registrable(h)),"
        "blocked: H.map((h) => m.isBlocked(m.registrable(h))),"
        "publisher: U.map((u) => m.publisher(u)),"
        "listed: [...m.BLOCKED_DOMAINS].sort()}));"
    )
    out = subprocess.run(["node", "--input-type=module", "-e", script],
                         capture_output=True, text=True, check=True, cwd=ROOT)
    js = json.loads(out.stdout)
    assert js.pop("listed") == sorted(common.BLOCKED_DOMAINS)
    assert js == _python_side()
