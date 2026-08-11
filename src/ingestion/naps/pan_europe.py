"""public-transport.earth: community maintained index of stable GTFS and NeTEx
endpoints across Europe, the fastest path to broad cross border coverage.

The index page links straight to national feed archives; we store the index
itself (provenance) and then mirror every linked archive. A full mirror is
tens of GB, so PAN_EUROPE_MAX_FILES can cap a run (0 = everything).
"""
from ..core import config
from ..core.collector import Collector
from ..core.registry import register
from ..core.scrape import FEED_EXT_PATTERN, extract_links

INDEX_URL = config.env("PAN_EUROPE_INDEX_URL", "https://eu.data.public-transport.earth/")


@register
class PanEuropeFeeds(Collector):
    name = "pan_europe"
    group = "naps"
    description = "public-transport.earth aggregated GTFS + NeTEx archives"
    static_urls = {"index": INDEX_URL}

    def collect(self, store, session):
        resp = session.get(INDEX_URL)
        store.save_text("index.html", resp.text, url=INDEX_URL)
        links = extract_links(resp.text, INDEX_URL, href_pattern=FEED_EXT_PATTERN)
        cap = config.env_int("PAN_EUROPE_MAX_FILES", 0)
        if cap:
            links = links[:cap]
        for url in links:
            self.grab(session, store, url)
        return f"{len(links)} feed links resolved from index"
