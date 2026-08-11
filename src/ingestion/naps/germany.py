"""Germany: gtfs.de curated national GTFS plus optional Mobilithek pulls.

gtfs.de aggregates the DELFI / Mobilithek NeTEx sources into daily GTFS
feeds under stable latest.zip URLs; the free tier requires attribution
("GTFS.de / DELFI"). Probed 2026-07-31: the full national aggregate downloads
anonymously, while the split feeds (fv = DB ICE/IC long distance, rv =
regional, nv = local) answer 403 because gtfs.de now binds them to the
download links of a free account. Paste those account links into
GERMANY_FEED_URLS; until then the split feeds surface as WARN, which is
correct: the data still arrives via the full aggregate. Mobilithek itself
(the German NAP) fronts NeTEx publications behind per publication
subscriptions: their download URLs go in MOBILITHEK_URLS.
"""
from ..core import config
from ..core.collector import Collector
from ..core.registry import register

GTFSDE_FEEDS = {
    "gtfsde_long_distance.zip": "https://download.gtfs.de/germany/fv/latest.zip",
    "gtfsde_regional.zip": "https://download.gtfs.de/germany/rv/latest.zip",
    "gtfsde_local.zip": "https://download.gtfs.de/germany/nv/latest.zip",
    "gtfsde_full.zip": "https://download.gtfs.de/germany/free/latest.zip",
}


@register
class Germany(Collector):
    name = "germany"
    group = "naps"
    description = "GTFS.de national feeds (DB long distance, regional, local) + Mobilithek"
    static_urls = GTFSDE_FEEDS

    def collect(self, store, session):
        for filename, url in GTFSDE_FEEDS.items():
            self.grab(session, store, url, name=filename, note="gtfs.de daily aggregate")
        account = config.env_list("GERMANY_FEED_URLS")
        for url in account:
            self.grab(session, store, url, note="gtfs.de account feed")
        extra = config.env_list("MOBILITHEK_URLS")
        for url in extra:
            self.grab(session, store, url, note="mobilithek subscription")
        return (f"{len(GTFSDE_FEEDS)} gtfs.de feeds + {len(account)} account + "
                f"{len(extra)} mobilithek URLs")
