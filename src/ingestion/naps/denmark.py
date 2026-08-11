"""Denmark: the Danish NAP (nap.vd.dk) catalogues rail, metro, regional bus
and domestic ferry feeds; the national GTFS itself comes from Rejseplanen
Labs, which hands out download URLs bound to a free developer account.

We snapshot the NAP catalogue pages and mirror any directly linked feed
artifacts; the account scoped Rejseplanen URLs go in DENMARK_FEED_URLS once
registered (they are stable per account).
"""
from ..core import config
from ..core.collector import Collector
from ..core.registry import register
from ..core.scrape import FEED_EXT_PATTERN, extract_links

# Probed 2026-07-31: nap.vd.dk (no www) is the live host and redirects into
# the Vejdirektoratet data exchange portal, a SPA, so the snapshot is thin
# and the account URLs below carry the real weight.
PAGES = config.env_list("DENMARK_PAGES", ["https://nap.vd.dk/"])


@register
class Denmark(Collector):
    name = "denmark"
    group = "naps"
    description = "Danish NAP catalogue + Rejseplanen Labs feeds (rail, metro, bus, ferry)"
    static_urls = {f"page_{i}": url for i, url in enumerate(PAGES)}

    def collect(self, store, session):
        harvested = 0
        for i, page_url in enumerate(PAGES):
            try:
                page = session.get(page_url)
                store.save_text(f"nap_page_{i}.html", page.text, url=page_url)
                for url in extract_links(page.text, page_url,
                                         href_pattern=FEED_EXT_PATTERN)[:20]:
                    if self.grab(session, store, url, note="linked from NAP catalogue"):
                        harvested += 1
            except Exception as exc:
                self.fail(f"{page_url} -> {exc}")
        direct = config.env_list("DENMARK_FEED_URLS")
        for url in direct:
            self.grab(session, store, url, note="Rejseplanen account feed")
        if not direct:
            return f"{harvested} catalogue artifacts; set DENMARK_FEED_URLS with Rejseplanen account links"
        return f"{harvested} catalogue artifacts + {len(direct)} account feeds"
