"""Greece: nap.gov.gr indexes the maritime access points for the Aegean and
Ionian ferry networks. The portal is catalogue style; we snapshot the
maritime search pages and mirror any downloadable datasets they link.
Additional catalogue query URLs go in GREECE_NAP_PAGES.
"""
from ..core import config
from ..core.collector import Collector
from ..core.registry import register
from ..core.scrape import FEED_EXT_PATTERN, extract_links

PAGES = config.env_list("GREECE_NAP_PAGES", [
    "https://nap.gov.gr/",
    "https://nap.gov.gr/en/dataset?q=maritime",
    "https://nap.gov.gr/en/dataset?q=ferry",
])


@register
class GreeceNap(Collector):
    name = "greece_nap"
    group = "maritime"
    description = "Greek NAP maritime catalogue (Aegean / Ionian access points)"
    static_urls = {"portal": PAGES[0]}

    def collect(self, store, session):
        mirrored = 0
        for i, page_url in enumerate(PAGES):
            try:
                page = session.get(page_url)
                store.save_text(f"nap_gov_gr_{i}.html", page.text, url=page_url)
                for url in extract_links(page.text, page_url,
                                         href_pattern=FEED_EXT_PATTERN)[:20]:
                    if self.grab(session, store, url, note="linked maritime dataset"):
                        mirrored += 1
            except Exception as exc:
                self.fail(f"{page_url} -> {exc}")
        return f"{len(PAGES)} catalogue snapshots, {mirrored} datasets"
