"""Spain: nap.mitma.es (the Spanish NAP, snapshotted; bulk access is login
gated) plus Renfe's own open endpoints: the long standing gtransit zip for
AVE / Larga Distancia, and data.renfe.com's CKAN catalogue for Cercanias and
everything else. Historical AVE pricing lives in pricing/renfe_kaggle.py.
"""
from ..core import config
from ..core.collector import Collector
from ..core.registry import register
from ..core.storage import name_from_url

# Probed 2026-07-31: the AV / Larga Distancia gtransit zip is live; the old
# Cercanias gtransit URL is 404, and Cercanias GTFS now ships through the
# data.renfe.com CKAN catalogue queried below.
RENFE_DIRECT = {
    "renfe_av_ld_gtfs.zip":
        "https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip",
}
CKAN_SEARCH = config.env("RENFE_CKAN", "https://data.renfe.com/api/3/action/package_search")
NAP_URL = config.env("SPAIN_NAP_URL", "https://nap.mitma.es/")


@register
class Spain(Collector):
    name = "spain"
    group = "naps"
    description = "Renfe GTFS (AVE/LD + Cercanias), data.renfe.com CKAN, NAP snapshot"
    static_urls = {**RENFE_DIRECT, "renfe_ckan": CKAN_SEARCH, "nap": NAP_URL}

    def collect(self, store, session):
        for filename, url in RENFE_DIRECT.items():
            self.grab(session, store, url, name=filename, note="Renfe gtransit")

        try:
            resp = session.get(CKAN_SEARCH, params={"q": "gtfs", "rows": 50})
            payload = resp.json()
            store.save_json("renfe_ckan_gtfs.json", payload, url=CKAN_SEARCH)
            cap = config.env_int("SPAIN_MAX_CKAN_FILES", 10)
            grabbed = 0
            for dataset in payload.get("result", {}).get("results", []):
                for resource in dataset.get("resources", []):
                    url = resource.get("url") or ""
                    fmt = (resource.get("format") or "").lower()
                    if grabbed >= cap:
                        break
                    if url and (fmt in ("gtfs", "zip") or url.lower().endswith(".zip")):
                        name = f"{dataset.get('name', 'dataset')}__{name_from_url(url)}"
                        if self.grab(session, store, url, name=name,
                                     note=dataset.get("title", "")):
                            grabbed += 1
        except Exception as exc:
            self.fail(f"data.renfe.com CKAN -> {exc}")

        try:
            nap = session.get(NAP_URL)
            store.save_text("nap_mitma_index.html", nap.text, url=NAP_URL)
        except Exception as exc:
            self.fail(f"{NAP_URL} -> {exc}")
        return "gtransit zips + CKAN catalogue + NAP snapshot"
