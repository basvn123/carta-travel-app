"""Cross border rail via the French NAP: Eurostar, Trenitalia France and
Renfe's international AVE routes publish GTFS (and some GTFS-RT) through
transport.data.gouv.fr rather than their home portals. Same catalogue
resolution as france_static, different operator filter.
"""
from ..core.collector import Collector
from ..core.registry import register
from ..core.storage import name_from_url
from ..naps.france import API_DATASETS, fetch_catalogue, iter_resources

CROSSBORDER_TITLE_RE = r"(eurostar|thalys|trenitalia|renfe|flixtrain)"
FORMATS = {"gtfs", "netex", "gtfs-rt", "gtfsrt"}


@register
class FranceCrossborder(Collector):
    name = "france_crossborder"
    group = "rail"
    description = "Eurostar / Trenitalia France / Renfe intl feeds via the French NAP"
    static_urls = {"datasets_api": API_DATASETS}

    def collect(self, store, session):
        catalogue = fetch_catalogue(session)
        seen, count = set(), 0
        for dataset, resource, fmt, url in iter_resources(
                catalogue, CROSSBORDER_TITLE_RE, FORMATS):
            if url in seen:
                continue
            seen.add(url)
            slug = dataset.get("slug") or "crossborder"
            if self.grab(session, store, url, name=f"{slug}__{name_from_url(url)}",
                         note=f"{fmt}: {dataset.get('title', '')}"):
                count += 1
        return f"{count} cross border resources"
