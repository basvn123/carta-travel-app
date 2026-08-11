"""OpenSky Network: open academic ADS-B network. Three pulls per run:

  1. states/all snapshot over a Europe bounding box (live positions)
  2. flights/arrival per configured airport over the lookback window
  3. flights/departure per airport (actual dep / arr timestamps + flight ids)

Auth: OAuth2 client credentials (OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET,
the current scheme) or legacy basic auth (OPENSKY_USER / OPENSKY_PASS).
Anonymous access covers the states snapshot only, under tight rate limits,
so without credentials the flights endpoints are skipped with a note rather
than hammered into 403s. Historical SQL / Impala access is a separate
research grant; dumps from it go through the staging sweeper
(aviation/eurocontrol.py pattern) if ever obtained.

OPENSKY_AIRPORTS overrides the ICAO list; OPENSKY_LOOKBACK_HOURS the window
(the API caps arrival / departure queries at 7 days).
"""
import time

from ..core import config
from ..core.collector import Collector
from ..core.registry import register

TOKEN_URL = config.env(
    "OPENSKY_TOKEN_URL",
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token")
API = config.env("OPENSKY_API", "https://opensky-network.org/api")

EUROPE_BBOX = {"lamin": 29.0, "lomin": -25.0, "lamax": 72.0, "lomax": 45.0}
DEFAULT_AIRPORTS = ("EBBR,EBCI,EHAM,LFPG,LFPO,EDDF,EDDB,EGLL,EGKK,EGSS,LEMD,LEBL,"
                    "LIRF,LIMC,LSZH,LOWW,EPWA,EKCH,ESSA,ENGM,LPPT,LGAV")


@register
class OpenSky(Collector):
    name = "opensky"
    group = "aviation"
    description = "OpenSky ADS-B: Europe states snapshot + per airport arrivals/departures"
    static_urls = {"api": f"{API}/states/all"}
    min_interval = 2.0  # OpenSky is strict about request pacing

    def _auth(self, session):
        cid, secret = config.env("OPENSKY_CLIENT_ID"), config.env("OPENSKY_CLIENT_SECRET")
        if cid and secret:
            resp = session.post(TOKEN_URL, data={
                "grant_type": "client_credentials",
                "client_id": cid, "client_secret": secret})
            token = resp.json().get("access_token")
            if token:
                return {"Authorization": f"Bearer {token}"}, None
            self.fail("OpenSky token endpoint returned no access_token")
        user, password = config.env("OPENSKY_USER"), config.env("OPENSKY_PASS")
        if user and password:
            return None, (user, password)
        return None, None

    def collect(self, store, session):
        headers, basic = self._auth(session)

        try:
            resp = session.get(f"{API}/states/all", params=EUROPE_BBOX,
                               headers=headers, auth=basic)
            store.save_json("states_europe.json", resp.json(),
                            url=f"{API}/states/all", note="live positions, Europe bbox")
        except Exception as exc:
            self.fail(f"states/all -> {exc}")

        if not headers and not basic:
            return ("anonymous mode: states snapshot only; set OPENSKY_CLIENT_ID / "
                    "OPENSKY_CLIENT_SECRET for flight histories")

        hours = min(config.env_int("OPENSKY_LOOKBACK_HOURS", 24), 7 * 24)
        end = int(time.time())
        begin = end - hours * 3600
        airports = config.env_list("OPENSKY_AIRPORTS", DEFAULT_AIRPORTS.split(","))
        for icao in airports:
            for kind in ("arrival", "departure"):
                url = f"{API}/flights/{kind}"
                try:
                    resp = session.get(url, params={"airport": icao,
                                                    "begin": begin, "end": end},
                                       headers=headers, auth=basic,
                                       allow_error=(404,))
                    payload = resp.json() if resp.status_code != 404 else []
                    store.save_json(f"flights_{kind}_{icao}.json", payload, url=url,
                                    note=f"{icao} {kind}, {hours}h window")
                except Exception as exc:
                    self.fail(f"{kind} {icao} -> {exc}")
        return f"{len(airports)} airports, {hours}h lookback"
