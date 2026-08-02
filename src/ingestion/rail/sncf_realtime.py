"""SNCF realtime: GTFS-RT Trip Updates and SIRI (SX / SIRI Lite) feeds,
resolved live from the transport.data.gouv.fr catalogue (the published URLs
rotate) and polled on a fixed cycle matching the upstream ~2 minute refresh.

Tuning:
    INGEST_RT_INTERVAL  seconds between cycles (default 120)
    INGEST_RT_CYCLES    cycles per invocation (default 5; 0 = poll forever,
                        for a dedicated scheduled process)
    SNCF_RT_EXTRA_URLS  extra feed URLs to poll alongside the resolved ones

Feeds are stored raw and timestamped: .pb protobuf for GTFS-RT, .xml or
.json for SIRI. Each cycle polls all feeds concurrently through httpx so one
slow endpoint cannot eat the cycle; without httpx it degrades to sequential
requests.
"""
import re
import time
from datetime import datetime, timezone

from ..core import config
from ..core.collector import Collector
from ..core.http import USER_AGENTS
from ..core.registry import register
from ..naps.france import SNCF_TITLE_RE, fetch_catalogue, iter_resources

RT_FORMATS = {"gtfs-rt", "gtfsrt", "siri", "siri lite"}


def _slug(dataset, resource):
    base = dataset.get("slug") or "sncf"
    title = re.sub(r"[^a-z0-9]+", "-", (resource.get("title") or "feed").lower()).strip("-")
    return f"{base}__{title}"[:80]


@register
class SncfRealtime(Collector):
    name = "sncf_realtime"
    group = "rail"
    description = "SNCF GTFS-RT Trip Updates + SIRI SX Lite, 2 minute polling"

    def _resolve_feeds(self, session, store):
        catalogue = fetch_catalogue(session)
        feeds, seen = [], set()
        for dataset, resource, fmt, url in iter_resources(catalogue, SNCF_TITLE_RE, RT_FORMATS):
            if url in seen:
                continue
            seen.add(url)
            feeds.append((fmt, url, _slug(dataset, resource)))
        for i, url in enumerate(config.env_list("SNCF_RT_EXTRA_URLS")):
            if url not in seen:
                feeds.append(("gtfs-rt", url, f"extra-{i}"))
        store.save_json("resolved_feeds.json",
                        [{"format": f, "url": u, "slug": s} for f, u, s in feeds],
                        note="RT feeds resolved from NAP catalogue")
        return feeds

    @staticmethod
    def _ext(fmt, content_type):
        if "gtfs" in fmt:
            return "pb"
        return "json" if "json" in (content_type or "") else "xml"

    def _poll_sequential(self, session, store, feeds, stamp):
        for fmt, url, slug in feeds:
            try:
                resp = session.get(url)
                ext = self._ext(fmt, resp.headers.get("Content-Type", ""))
                store.save_bytes(f"{slug}_{stamp}.{ext}", resp.content, url=url, note=fmt)
            except Exception as exc:
                self.fail(f"{url} -> {exc}")

    async def _poll_async(self, store, feeds, stamp):
        import asyncio

        import httpx
        headers = {"User-Agent": config.env("INGEST_USER_AGENT", USER_AGENTS[0])}
        async with httpx.AsyncClient(timeout=60, headers=headers,
                                     follow_redirects=True) as client:
            responses = await asyncio.gather(
                *[client.get(url) for _, url, _ in feeds], return_exceptions=True)
        for (fmt, url, slug), resp in zip(feeds, responses):
            if isinstance(resp, Exception):
                self.fail(f"{url} -> {resp}")
                continue
            if resp.status_code >= 400:
                self.fail(f"HTTP {resp.status_code} {url}")
                continue
            ext = self._ext(fmt, resp.headers.get("content-type", ""))
            store.save_bytes(f"{slug}_{stamp}.{ext}", resp.content, url=url, note=fmt)

    def collect(self, store, session):
        feeds = self._resolve_feeds(session, store)
        if not feeds:
            return "no realtime feeds resolved from catalogue (filters too strict?)"
        interval = config.env_int("INGEST_RT_INTERVAL", 120)
        cycles = config.env_int("INGEST_RT_CYCLES", 5)
        cycle = 0
        while True:
            cycle += 1
            stamp = datetime.now(timezone.utc).strftime("%H%M%S")
            try:
                import asyncio
                asyncio.run(self._poll_async(store, feeds, stamp))
            except ImportError:
                self._poll_sequential(session, store, feeds, stamp)
            if cycles and cycle >= cycles:
                break
            time.sleep(interval)
        return f"{len(feeds)} feeds x {cycle} cycles at {interval}s"
