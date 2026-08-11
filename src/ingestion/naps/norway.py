"""Norway: Entur, the national journey planning hub (rail, express bus,
regional ferries, NLOD licensed). The aggregated national GTFS and NeTEx
archives are on Entur's public storage; SIRI ET / SX / VM snapshots come
from the realtime REST API. No key needed, but Entur asks every client to
identify with an ET-Client-Name header (ENTUR_CLIENT_NAME overrides ours).
"""
from datetime import datetime, timezone

from ..core import config
from ..core.collector import Collector
from ..core.registry import register

ARCHIVES = {
    "rb_norway-aggregated-gtfs.zip":
        "https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_norway-aggregated-gtfs.zip",
    "rb_norway-aggregated-netex.zip":
        "https://storage.googleapis.com/marduk-production/outbound/netex/rb_norway-aggregated-netex.zip",
}
SIRI_BASE = config.env("ENTUR_SIRI_BASE", "https://api.entur.io/realtime/v1/rest")


@register
class Norway(Collector):
    name = "norway"
    group = "naps"
    description = "Entur: national GTFS + NeTEx archives, SIRI ET/SX/VM snapshots"
    static_urls = {**ARCHIVES, "siri_sx": f"{SIRI_BASE}/sx"}

    def collect(self, store, session):
        headers = {"ET-Client-Name":
                   config.env("ENTUR_CLIENT_NAME", "carta-europetravel-ingest")}
        for filename, url in ARCHIVES.items():
            self.grab(session, store, url, name=filename, headers=headers)
        stamp = datetime.now(timezone.utc).strftime("%H%M%S")
        for channel in ("et", "sx", "vm"):
            self.grab(session, store, f"{SIRI_BASE}/{channel}",
                      name=f"siri_{channel}_{stamp}.xml", headers=headers,
                      note=f"SIRI {channel.upper()} snapshot")
        return "2 archives + 3 SIRI snapshots"
