"""Nordic and Baltic ferries. Hurtigruten / Kystruten coastal sailings,
Torghatten, Fjord1 and Norled all deliver into Entur, and Waxholmsbolaget
archipelago traffic into Trafiklab, so the national aggregates pulled by the
norway / sweden collectors already contain the maritime layer. This collector
makes the ferry slice directly addressable: it scrapes Entur's stops and
timetable data page for per operator archives whose label matches ferry
operators, and pulls the Swedish regional feeds that carry archipelago
routes.

Honest gap: Baltic cruise ferry lines (Viking Line, Silja Line, Color Line
international legs) do not publish open feeds; they appear only where an
operator registers with a NAP. Direct URLs you obtain from operators go in
NORDIC_FERRY_URLS.
"""
from ..core import config
from ..core.collector import Collector
from ..core.registry import register
from ..core.scrape import extract_links

ENTUR_PAGE = config.env("ENTUR_OPERATORS_PAGE",
                        "https://developer.entur.org/stops-and-timetable-data")
OPERATOR_RE = config.env(
    "NORDIC_FERRY_OPERATOR_RE",
    r"(hurtigruten|kystruten|havila|torghatten|fjord|norled|boreal|ferr|ferje|baat)")


@register
class NordicFerries(Collector):
    name = "nordic_ferries"
    group = "maritime"
    description = "Entur / Trafiklab per operator ferry feeds (Hurtigruten, archipelago)"
    static_urls = {"entur_operators_page": ENTUR_PAGE}

    def collect(self, store, session):
        headers = {"ET-Client-Name":
                   config.env("ENTUR_CLIENT_NAME", "carta-europetravel-ingest")}
        mirrored = 0
        try:
            page = session.get(ENTUR_PAGE, headers=headers)
            store.save_text("entur_operators_page.html", page.text, url=ENTUR_PAGE)
            links = extract_links(page.text, ENTUR_PAGE, href_pattern=r"\.zip([?#]|$)",
                                  text_pattern=OPERATOR_RE)
            for url in links[:15]:
                if self.grab(session, store, url, headers=headers,
                             note="Entur ferry operator archive"):
                    mirrored += 1
        except Exception as exc:
            self.fail(f"{ENTUR_PAGE} -> {exc}")

        regional_key = config.env("TRAFIKLAB_GTFS_REGIONAL_KEY")
        if regional_key:
            base = config.env("TRAFIKLAB_BASE", "https://opendata.samtrafiken.se")
            for op in config.env_list("TRAFIKLAB_FERRY_OPERATORS", ["sl"]):
                if self.grab(session, store, f"{base}/gtfs/{op}/{op}.zip?key={regional_key}",
                             name=f"gtfs_regional_{op}.zip",
                             manifest_url=f"{base}/gtfs/{op}/{op}.zip",
                             note=f"archipelago routes inside {op}"):
                    mirrored += 1

        for url in config.env_list("NORDIC_FERRY_URLS"):
            if self.grab(session, store, url, note="operator supplied feed"):
                mirrored += 1
        return f"{mirrored} ferry archives (Viking/Silja/Color have no open feeds)"
