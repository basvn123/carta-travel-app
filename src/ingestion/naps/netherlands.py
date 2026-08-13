"""Netherlands: NDOV Loket. The national GTFS aggregate (NS rail, regional
bus, tram, ferry) is openly served by OVapi under CC0; NeTEx deliveries sit
on data.ndovloket.nl as a plain directory listing, parts of which need the
free NDOV account (set NDOV_USER / NDOV_PASS for basic auth).
"""
from ..core import config
from ..core.collector import Collector
from ..core.registry import register
from ..core.scrape import extract_links

GTFS_NL = config.env("NDOV_GTFS_URL", "https://gtfs.ovapi.nl/nl/gtfs-nl.zip")
NETEX_INDEX = config.env("NDOV_NETEX_INDEX", "https://data.ndovloket.nl/netex/")


@register
class Netherlands(Collector):
    name = "netherlands"
    group = "naps"
    description = "NDOV Loket / OVapi: national GTFS (CC0) + NeTEx deliveries"
    static_urls = {"gtfs_nl": GTFS_NL, "netex_index": NETEX_INDEX}

    def collect(self, store, session):
        self.grab(session, store, GTFS_NL, name="gtfs-nl.zip", note="OVapi national aggregate")

        auth = None
        if config.env("NDOV_USER") and config.env("NDOV_PASS"):
            auth = (config.env("NDOV_USER"), config.env("NDOV_PASS"))
        try:
            index = session.get(NETEX_INDEX, auth=auth)
            store.save_text("netex_index.html", index.text, url=NETEX_INDEX)
            links = extract_links(index.text, NETEX_INDEX,
                                  href_pattern=r"\.(zip|xml|xml\.gz|gz)([?#]|$)")
            cap = config.env_int("NETHERLANDS_MAX_FILES", 20)
            for url in links[:cap]:
                self.grab(session, store, url, note="NDOV NeTEx delivery", auth=auth)
            return f"gtfs-nl + {min(len(links), cap)} of {len(links)} NeTEx files"
        except Exception as exc:
            self.fail(f"NeTEx index -> {exc} (account only? set NDOV_USER / NDOV_PASS)")
            return "gtfs-nl pulled; NeTEx index unreachable"
