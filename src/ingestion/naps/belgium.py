"""Belgium: unified opendata gateway for GTFS static + realtime across all
four operators (De Lijn, SNCB/NMBS, STIB/MIVB, TEC), plus SNCB's NeTEx (EPIP)
scheduled timetable scraped from its transportdata.be dataset page (the
unified gateway has no NeTEx, only GTFS).

The gateway was found by the user browsing its portal directly, not by
guessing: the docs/subscribe UI lives at
api-management-opendata-production.developer.azure-api.net, but the actual
request host has no "developer." prefix (confirmed live 2026-07-31: that
subdomain 404s every API path, while the bare host answers real auth/quota
responses). Auth is BELGIUM_OPENDATA_KEY sent as `Ocp-Apim-Subscription-Key`
(a separate subscription from data.delijn.be -- confirmed a different Azure
APIM instance). This supersedes the old separate TEC (opendata.tec-wl.be)
and STIB (opendatasoft) sources: one gateway, one key, four operators, and
realtime that none of the old individual sources provided.

Caution: verification testing tripped a ~24h call-volume quota on this
account (403 "Out of call volume quota", separate from the shorter per
-second 429 rate limit on the realtime endpoints) -- a first real run may
need to wait that window out. 403 is not in the framework's retry set, so a
quota hit fails that one artifact fast instead of retry-looping into more
quota burn.
"""
from ..core import config
from ..core.collector import Collector
from ..core.registry import register
from ..core.scrape import FEED_EXT_PATTERN, extract_links

GATEWAY = config.env("BELGIUM_OPENDATA_BASE",
                     "https://api-management-opendata-production.azure-api.net")
SNCB_NETEX_PAGE = config.env(
    "SNCB_NETEX_PAGE",
    "https://www.transportdata.be/dataset/sncb-netex-scheduled-timetable")

GTFS_STATIC = {
    "delijn": "/api/gtfs/feed/delijn/static",
    "nmbssncb": "/api/gtfs/feed/nmbssncb/static",
    "stibmivb": "/api/gtfs/feed/stibmivb/static",
    "tec": "/api/gtfs/feed/tec/static",
}
GTFS_REALTIME = {
    "delijn": ["alert", "trip-update"],
    "nmbssncb": ["alert", "trip-update"],
    "tec": ["alert", "trip-update", "vehicle-position"],
    # stibmivb has no /gtfs/feed/.../rt/* entries; its realtime lives under
    # the dataset-style API below instead.
}
STIB_DATASETS = {
    "static": ["rail", "roads", "shape-files", "stopDetails", "stopsByLine"],
    "rt": ["TravellersInformation", "VehiclePositions", "WaitingTimes"],
}


def _ext_for(content_type, fallback):
    content_type = (content_type or "").lower()
    if "zip" in content_type:
        return "zip"
    if "protobuf" in content_type or "octet-stream" in content_type:
        return "pb"
    if "json" in content_type:
        return "json"
    if "xml" in content_type:
        return "xml"
    return fallback


@register
class Belgium(Collector):
    name = "belgium"
    group = "naps"
    description = ("Unified BE opendata gateway: GTFS static+realtime "
                   "(De Lijn, SNCB, STIB, TEC) + SNCB NeTEx EPIP")
    static_urls = {"gateway_version": f"{GATEWAY}/api/version",
                   "sncb_netex_page": SNCB_NETEX_PAGE}

    def _grab_typed(self, session, store, url, base_name, note, fallback_ext, headers):
        """grab() but the actual extension is only known from the response's
        Content-Type (GTFS zips, GTFS-RT protobuf, and STIB's assorted
        dataset formats all live behind the same-looking gateway paths)."""
        try:
            resp = session.get(url, headers=headers, stream=True)
            ext = _ext_for(resp.headers.get("Content-Type"), fallback_ext)
            store.save_response(f"{base_name}.{ext}", resp, url, note=note)
            return True
        except Exception as exc:
            self.fail(f"{url} -> {exc}")
            return False

    def collect(self, store, session):
        # SNCB NeTEx EPIP: resolve current file links off the dataset page
        # (unaffected by the gateway; not available there).
        try:
            page = session.get(SNCB_NETEX_PAGE)
            store.save_text("sncb_netex_dataset_page.html", page.text, url=SNCB_NETEX_PAGE)
            for url in extract_links(page.text, SNCB_NETEX_PAGE,
                                     href_pattern=FEED_EXT_PATTERN)[:10]:
                self.grab(session, store, url, note="SNCB NeTEx EPIP")
        except Exception as exc:
            self.fail(f"SNCB NeTEx page -> {exc}")

        key = config.env("BELGIUM_OPENDATA_KEY")
        if not key:
            return "gateway skipped (set BELGIUM_OPENDATA_KEY); SNCB NeTEx EPIP still pulled"

        headers = {"Ocp-Apim-Subscription-Key": key}
        total = 0

        for operator, path in GTFS_STATIC.items():
            if self._grab_typed(session, store, f"{GATEWAY}{path}",
                                f"{operator}_gtfs_static", f"GTFS static: {operator}",
                                "zip", headers):
                total += 1

        for operator, kinds in GTFS_REALTIME.items():
            for kind in kinds:
                url = f"{GATEWAY}/api/gtfs/feed/{operator}/rt/{kind}"
                if self._grab_typed(session, store, url, f"{operator}_rt_{kind}",
                                    f"GTFS-RT {kind}: {operator}", "pb", headers):
                    total += 1

        for category, names in STIB_DATASETS.items():
            for dataset in names:
                url = f"{GATEWAY}/api/datasets/stibmivb/{category}/{dataset}"
                if self._grab_typed(session, store, url, f"stibmivb_{category}_{dataset}",
                                    f"STIB {category} dataset: {dataset}", "json", headers):
                    total += 1

        return f"{total} gateway artifacts across delijn/nmbssncb/stibmivb/tec + SNCB NeTEx EPIP"
