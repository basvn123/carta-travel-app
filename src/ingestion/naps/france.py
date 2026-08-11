"""France: transport.data.gouv.fr (the French NAP) plus SNCF open data.

Resource URLs on the NAP rotate, so nothing is hardcoded: we pull the NAP's
full dataset catalogue from its JSON API, keep it as raw provenance, then
resolve the SNCF static families (TGV InOui, OUIGO, Intercites, TER) to
their current GTFS and NeTEx resources by title / publisher match.

rail/france_crossborder.py (Eurostar, Trenitalia France, Renfe AVE intl) and
rail/sncf_realtime.py (GTFS-RT, SIRI) reuse the same catalogue helpers.
"""
import re

from ..core import config
from ..core.collector import Collector
from ..core.registry import register
from ..core.storage import name_from_url

API_DATASETS = config.env("FRANCE_NAP_API", "https://transport.data.gouv.fr/api/datasets")
STATIC_FORMATS = {"gtfs", "netex"}
SNCF_TITLE_RE = r"(sncf|tgv|ouigo|intercit|\bter\b)"


def fetch_catalogue(session, store=None):
    """Full dataset catalogue from the NAP API (one call, every dataset with
    its resources). Saved raw when a store is given."""
    resp = session.get(API_DATASETS)
    catalogue = resp.json()
    if store is not None:
        store.save_json("transport_gouv_datasets.json", catalogue, url=API_DATASETS,
                        note="full NAP catalogue")
    return catalogue


def iter_resources(catalogue, title_pattern, formats):
    """Yield (dataset, resource, format, url) for datasets whose title or
    publisher matches, restricted to the requested lowercase formats."""
    pat = re.compile(title_pattern, re.I)
    for dataset in catalogue:
        title = dataset.get("title") or ""
        publisher = (dataset.get("publisher") or {}).get("name") or ""
        if not (pat.search(title) or pat.search(publisher)):
            continue
        for resource in dataset.get("resources", []):
            fmt = (resource.get("format") or "").lower()
            url = resource.get("original_url") or resource.get("url")
            if url and fmt in formats:
                yield dataset, resource, fmt, url


@register
class FranceStatic(Collector):
    name = "france_static"
    group = "naps"
    description = "SNCF static GTFS + NeTEx via transport.data.gouv.fr (TGV, OUIGO, Intercites, TER)"
    static_urls = {"datasets_api": API_DATASETS}

    def collect(self, store, session):
        catalogue = fetch_catalogue(session, store)
        seen, count = set(), 0
        for dataset, resource, fmt, url in iter_resources(catalogue, SNCF_TITLE_RE, STATIC_FORMATS):
            if url in seen:
                continue
            seen.add(url)
            slug = dataset.get("slug") or "dataset"
            name = f"{slug}__{name_from_url(url)}"
            if self.grab(session, store, url, name=name,
                         note=f"{fmt}: {dataset.get('title', '')}"):
                count += 1
        return f"{count} SNCF static resources resolved from catalogue"
