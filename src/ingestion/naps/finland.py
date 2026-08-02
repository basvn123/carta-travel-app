"""Finland: Traficom's FinAP (finap.fi, CC-BY 4.0) plus Fintraffic's open
rail APIs. finap.fi is a single page app, so its HTML snapshot is thin and
per operator download URLs (visible after free registration) belong in
FINLAND_FEED_URLS. The Digitraffic rail endpoints need no key at all and
give station metadata, live running trains, and the full day's schedules as
JSON; they are pulled on every run.
"""
from datetime import datetime, timezone

from ..core import config
from ..core.collector import Collector
from ..core.registry import register

FINAP_URL = config.env("FINAP_URL", "https://finap.fi/")
DIGITRAFFIC_BASE = config.env("DIGITRAFFIC_BASE", "https://rata.digitraffic.fi/api/v1")


@register
class Finland(Collector):
    name = "finland"
    group = "naps"
    description = "Traficom FinAP catalogue + Digitraffic open rail JSON (no key)"
    static_urls = {"finap": FINAP_URL, "digitraffic_stations": f"{DIGITRAFFIC_BASE}/metadata/stations"}

    def collect(self, store, session):
        try:
            page = session.get(FINAP_URL)
            store.save_text("finap_index.html", page.text, url=FINAP_URL)
        except Exception as exc:
            self.fail(f"{FINAP_URL} -> {exc}")

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        endpoints = {
            "digitraffic_stations.json": f"{DIGITRAFFIC_BASE}/metadata/stations",
            "digitraffic_live_trains.json": f"{DIGITRAFFIC_BASE}/live-trains",
            f"digitraffic_trains_{today}.json": f"{DIGITRAFFIC_BASE}/trains/{today}",
        }
        for filename, url in endpoints.items():
            self.grab(session, store, url, name=filename, note="Fintraffic Digitraffic rail")

        direct = config.env_list("FINLAND_FEED_URLS")
        for url in direct:
            self.grab(session, store, url, note="FinAP registered feed")
        return f"digitraffic x{len(endpoints)} + {len(direct)} FinAP feeds"
