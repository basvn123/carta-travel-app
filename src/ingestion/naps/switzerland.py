"""Switzerland: opentransportdata.swiss (SBB rail, cable cars, boats, express
bus), sourced from its public DCAT catalog dump rather than the CKAN action
API.

Corrects an earlier guess: this portal's CKAN API lives at
api.opentransportdata.swiss/ckan-api (not data.opentransportdata.swiss/api/3
/action as first assumed) and only documents two actions, package_list and
package_show; there is no package_search. Its own documentation asks that
the API be used "for occasional queries to individual datasets, not for
frequent full scans" and names the DCAT catalog (catalog.xml / catalog.ttl)
as the catalog-wide alternative -- confirmed live 2026-07-31: it is public,
needs no token, and lists every dataset/resource (~90 datasets, 845+
distributions) in one request. So the sweep for current GTFS/NeTEx/HRDF
resources reads that dump instead of hammering package_show per dataset.

Auth: OTD_SWISS_TOKEN, sent as `Authorization: Bearer <token>` -- confirmed
live: the bare header without "Bearer " 401s with "Authorization field
missing". The catalog dump itself needs no token; only the actual resource
downloads do (confirmed 403 anonymous), so without a token this collector
still identifies and records the matching datasets, it just cannot fetch
their files yet.
"""
import re

from lxml import etree

from ..core import config
from ..core.collector import Collector
from ..core.registry import register

CATALOG_URL = config.env("OTD_SWISS_CATALOG_URL",
                         "https://data.opentransportdata.swiss/catalog.xml")
# No \b word boundaries: the mainline GTFS dataset is titled "(GTFS2020)"
# with the version glued straight onto the format tag ("s" to "2" is not a
# boundary), so a bounded gtfs regex silently missed it (caught 2026-07-31).
KEYWORD_RE = re.compile(r"gtfs|netex|hrdf", re.I)

NS = {
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "dcat": "http://www.w3.org/ns/dcat#",
    "dct": "http://purl.org/dc/terms/",
}
RDF_ABOUT = f"{{{NS['rdf']}}}about"
RDF_RESOURCE = f"{{{NS['rdf']}}}resource"


def _text_or_resource(el):
    if el is None:
        return None
    return el.get(RDF_RESOURCE) or (el.text.strip() if el.text else None)


def _sort_key(resource):
    # Distribution filenames embed a sortable ...YYYYMMDDHHMM.zip suffix;
    # extracting it and sorting numerically descending gets the current
    # snapshot first even when the feed's own element order ever changes.
    match = re.search(r"(\d{8,14})(?=\D*\.zip$)", resource["title"] or "")
    return match.group(1) if match else (resource["title"] or "")


def parse_catalog(xml_bytes):
    """[(dataset_title, [{downloadURL, title}, ...]), ...] restricted to
    datasets whose title mentions gtfs/netex/hrdf, each resource list newest
    first."""
    root = etree.fromstring(xml_bytes)

    distributions = {}
    for dist in root.iter(f"{{{NS['dcat']}}}Distribution"):
        about = dist.get(RDF_ABOUT)
        if about:
            distributions[about] = {
                "downloadURL": _text_or_resource(dist.find("dcat:downloadURL", NS)),
                "title": _text_or_resource(dist.find("dct:title", NS)),
            }

    matched = []
    for dataset in root.iter(f"{{{NS['dcat']}}}Dataset"):
        titles = [t.text.strip() for t in dataset.findall("dct:title", NS) if t.text]
        if not titles or not any(KEYWORD_RE.search(t) for t in titles):
            continue
        refs = [d.get(RDF_RESOURCE) for d in dataset.findall("dcat:distribution", NS)]
        resources = [distributions[r] for r in refs
                    if r in distributions and distributions[r]["downloadURL"]]
        resources.sort(key=_sort_key, reverse=True)
        matched.append((titles[0], resources))
    return matched


@register
class Switzerland(Collector):
    name = "switzerland"
    group = "naps"
    description = "opentransportdata.swiss: DCAT catalog -> current GTFS/NeTEx/HRDF resources"
    static_urls = {"catalog": CATALOG_URL}

    def collect(self, store, session):
        resp = session.get(CATALOG_URL)
        store.save_bytes("catalog.xml", resp.content, url=CATALOG_URL,
                         note="public DCAT catalog dump, ~90 datasets")
        matched = parse_catalog(resp.content)
        store.save_json("matched_datasets.json",
                        [{"title": t, "resource_count": len(r)} for t, r in matched],
                        note=f"{len(matched)} datasets matched gtfs/netex/hrdf")

        token = config.env("OTD_SWISS_TOKEN")
        if not token:
            return (f"{len(matched)} datasets identified via the DCAT catalog, but file "
                    f"downloads need OTD_SWISS_TOKEN (confirmed 403 anonymous)")

        headers = {"Authorization": f"Bearer {token}"}
        per_dataset = config.env_int("SWISS_MAX_FILES_PER_DATASET", 1)
        total = 0
        for title, resources in matched:
            for resource in resources[:per_dataset]:
                name = resource["title"] or "resource.zip"
                if self.grab(session, store, resource["downloadURL"], name=name,
                             headers=headers, note=title):
                    total += 1
        return f"{total} files across {len(matched)} matched datasets"
