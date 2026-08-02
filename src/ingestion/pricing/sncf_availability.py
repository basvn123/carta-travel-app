"""SNCF seat availability proxies: the TGV MAX 30 day pass availability
dataset on ressources.data.sncf.com (the document's
disponibilite-places-max feed). Depletion of the discounted allocation per
train number over the booking window is a direct occupancy proxy, the label
side of demand driven price escalation.

For each configured Opendatasoft dataset id we store the dataset metadata, a
100 record sample, and the full CSV export via the Explore v2.1 API. The
full export is millions of rows; disable it with SNCF_ODS_FULL_EXPORT=0
when only sampling. Extra ODS dataset ids (regularity, other availability
feeds) go in SNCF_ODS_DATASETS.
"""
from ..core import config
from ..core.collector import Collector
from ..core.registry import register

ODS_BASE = config.env("SNCF_ODS_BASE",
                      "https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets")
DEFAULT_DATASETS = ["tgvmax"]


@register
class SncfAvailability(Collector):
    name = "sncf_availability"
    group = "pricing"
    description = "SNCF TGV MAX 30 day seat availability (occupancy proxy labels)"
    static_urls = {"ods_dataset": f"{ODS_BASE}/{DEFAULT_DATASETS[0]}"}

    def collect(self, store, session):
        datasets = config.env_list("SNCF_ODS_DATASETS", DEFAULT_DATASETS)
        full_export = config.env_flag("SNCF_ODS_FULL_EXPORT", True)
        for ds in datasets:
            base = f"{ODS_BASE}/{ds}"
            try:
                meta = session.get(base)
                store.save_json(f"{ds}_metadata.json", meta.json(), url=base)
            except Exception as exc:
                self.fail(f"{ds} metadata -> {exc}")
                continue  # dataset id is wrong or gone; skip its exports
            try:
                sample = session.get(f"{base}/records", params={"limit": 100})
                store.save_json(f"{ds}_sample_100.json", sample.json(),
                                url=f"{base}/records")
            except Exception as exc:
                self.fail(f"{ds} sample -> {exc}")
            if full_export:
                self.grab(session, store, f"{base}/exports/csv",
                          name=f"{ds}_full.csv", note="full ODS export")
        mode = "metadata + sample + full csv" if full_export else "metadata + sample"
        return f"{len(datasets)} ODS datasets ({mode})"
