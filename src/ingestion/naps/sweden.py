"""Sweden: Trafiklab (Samtrafiken) national datasets, CC0. GTFS Sweden 3 and
NeTEx Sweden are keyed downloads: free API keys, one per product, from a
trafiklab.se account (TRAFIKLAB_GTFS_SWEDEN_KEY / TRAFIKLAB_NETEX_SWEDEN_KEY).
Archipelago ferry traffic (Waxholmsbolaget etc.) rides inside the national
feeds; per operator regional GTFS additionally needs the GTFS Regional key
(TRAFIKLAB_GTFS_REGIONAL_KEY, operators via TRAFIKLAB_REGIONAL_OPERATORS).

API keys travel as query params, so manifest entries record masked URLs.
"""
from ..core import config
from ..core.collector import Collector
from ..core.errors import AuthMissing
from ..core.registry import register

BASE = config.env("TRAFIKLAB_BASE", "https://opendata.samtrafiken.se")


@register
class Sweden(Collector):
    name = "sweden"
    group = "naps"
    description = "Trafiklab: GTFS Sweden 3, NeTEx Sweden, regional operator feeds"
    static_urls = {"gtfs_sweden": f"{BASE}/gtfs-sweden/sweden.zip",
                   "netex_sweden": f"{BASE}/netex-sweden/sweden.zip"}

    def collect(self, store, session):
        gtfs_key = config.env("TRAFIKLAB_GTFS_SWEDEN_KEY")
        netex_key = config.env("TRAFIKLAB_NETEX_SWEDEN_KEY")
        regional_key = config.env("TRAFIKLAB_GTFS_REGIONAL_KEY")
        if not (gtfs_key or netex_key or regional_key):
            raise AuthMissing("set TRAFIKLAB_GTFS_SWEDEN_KEY and/or "
                              "TRAFIKLAB_NETEX_SWEDEN_KEY (free keys from trafiklab.se)")
        pulled = []
        if gtfs_key:
            self.grab(session, store, f"{BASE}/gtfs-sweden/sweden.zip?key={gtfs_key}",
                      name="gtfs_sweden3.zip",
                      manifest_url=f"{BASE}/gtfs-sweden/sweden.zip", note="GTFS Sweden 3")
            pulled.append("gtfs")
        if netex_key:
            self.grab(session, store, f"{BASE}/netex-sweden/sweden.zip?key={netex_key}",
                      name="netex_sweden.zip",
                      manifest_url=f"{BASE}/netex-sweden/sweden.zip", note="NeTEx Sweden")
            pulled.append("netex")
        if regional_key:
            operators = config.env_list("TRAFIKLAB_REGIONAL_OPERATORS", ["sl"])
            for op in operators:
                self.grab(session, store, f"{BASE}/gtfs/{op}/{op}.zip?key={regional_key}",
                          name=f"gtfs_regional_{op}.zip",
                          manifest_url=f"{BASE}/gtfs/{op}/{op}.zip",
                          note=f"regional operator {op}")
            pulled.append(f"regional x{len(operators)}")
        return ", ".join(pulled)
