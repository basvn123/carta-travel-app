"""Austria: Mobilitaetsverbuende Oesterreich data hub, the delivery service
behind the Austrian NAP (mobilitydata.gv.at). Covers national rail, bus,
tram and cableways in NeTEx and GTFS.

Registration is free, but downloads need an OAuth token from the hub's
Keycloak: set MOBILITYDATA_AT_USER and MOBILITYDATA_AT_PASSWORD. The API base
and token endpoint are env overridable in case they rotate.

Two API quirks found by probing live (2026-07-31), both undocumented:
  1. GET /data-sets 400s ("boolean string is expected") unless
     tagFilterModeInclusive is present, even though the Angular client only
     sends it when a caller opted into tag filtering.
  2. Every listed dataset's actual file lives at
     /data-sets/{dataSetId}/{year}/file (year from activeVersions[].year),
     not inside the listing JSON itself as a plain URL.

All 49 datasets share one data license ("Datenlizenz Mobilitaetsverbuende
Oesterreich"). Until the account holder accepts it once through the web UI
at https://data.mobilitaetsverbuende.at/, every file request answers 451
"Unavailable For Legal Reasons" — this is a real legal click-through the
human must do, so the collector detects it on the first file and stops
rather than hammering all 49 datasets into the same 451, or auto-accepting
anything on the user's behalf.
"""
from ..core import config
from ..core.collector import Collector
from ..core.errors import IngestError
from ..core.registry import register

TOKEN_URL = config.env(
    "AUSTRIA_TOKEN_URL",
    "https://user.mobilitaetsverbuende.at/auth/realms/dbp-public/protocol/openid-connect/token")
API_BASE = config.env("AUSTRIA_API_BASE", "https://data.mobilitaetsverbuende.at/api/public/v1")
PORTAL_URL = config.env("AUSTRIA_PORTAL_URL", "https://data.mobilitaetsverbuende.at/")


@register
class Austria(Collector):
    name = "austria"
    group = "naps"
    description = "Mobility Data Austria hub: NeTEx + GTFS (rail, bus, tram, cableway)"
    required_env = ("MOBILITYDATA_AT_USER", "MOBILITYDATA_AT_PASSWORD")
    # The listing endpoint 400s unauthenticated (missing the required tag
    # filter param), which still proves reachability to --check.
    static_urls = {"datasets_listing": f"{API_BASE}/data-sets"}

    def _token(self, session) -> str:
        resp = session.post(TOKEN_URL, data={
            "grant_type": "password",
            "client_id": config.env("AUSTRIA_CLIENT_ID", "dbp-public-ui"),
            "username": config.env("MOBILITYDATA_AT_USER"),
            "password": config.env("MOBILITYDATA_AT_PASSWORD"),
        })
        token = resp.json().get("access_token")
        if not token:
            raise IngestError("Keycloak token response had no access_token")
        return token

    @staticmethod
    def _file_targets(listing):
        """(dataset_id, year, filename) for every active version, deduped."""
        seen, targets = set(), []
        for dataset in listing:
            for version in dataset.get("activeVersions", []):
                key = (dataset["id"], version.get("year"))
                if key in seen or not version.get("year"):
                    continue
                seen.add(key)
                info = (version.get("dataSetVersion") or {}).get("file") or {}
                name = info.get("originalName") or f"dataset_{dataset['id']}_{version['year']}.zip"
                targets.append((dataset["id"], version["year"], name, dataset.get("nameEn", "")))
        return targets

    def collect(self, store, session):
        headers = {"Authorization": f"Bearer {self._token(session)}"}
        listing_url = f"{API_BASE}/data-sets"
        resp = session.get(listing_url, headers=headers,
                           params={"tagFilterModeInclusive": "true"})
        listing = resp.json()
        store.save_json("datasets_listing.json", listing, url=listing_url,
                        note=f"{len(listing)} datasets")

        targets = self._file_targets(listing)
        pinned = config.env_list("AUSTRIA_DATASET_URLS")
        if not targets:
            for url in pinned:
                self.grab(session, store, url, headers=headers, note="pinned dataset URL")
            return f"0 datasets had an active version; {len(pinned)} pinned URLs"

        # Probe the first file un-streamed so a shared license gate (451) is
        # caught in one request instead of failing all N downloads the same way.
        ds_id, year, name, title = targets[0]
        first_url = f"{API_BASE}/data-sets/{ds_id}/{year}/file"
        probe = session.get(first_url, headers=headers, allow_error=(451,))
        if probe.status_code == 451:
            for url in pinned:
                self.grab(session, store, url, headers=headers, note="pinned dataset URL")
            return (f"blocked: account has not accepted the shared data license yet. "
                    f"Log into {PORTAL_URL}, open any dataset and accept the license "
                    f"once (covers all {len(targets)} datasets), then rerun. "
                    f"{len(pinned)} pinned URLs fetched meanwhile.")

        store.save_bytes(name, probe.content, url=first_url, note=f"{title} ({year})")
        for ds_id, year, name, title in targets[1:]:
            url = f"{API_BASE}/data-sets/{ds_id}/{year}/file"
            self.grab(session, store, url, name=name, headers=headers,
                      note=f"{title} ({year})")
        for url in pinned:
            self.grab(session, store, url, headers=headers, note="pinned dataset URL")
        return f"{len(targets)} dataset files + {len(pinned)} pinned URLs"
