"""Outbound HTTP for every collector.

All traffic goes through PoliteSession so retries with exponential backoff,
per host rate limiting, User-Agent rotation and proxy rotation behave the
same way in every scraper.
"""
import random
import time
from urllib.parse import urlparse

import requests

from . import config
from .errors import HTTPFailed

# First entry identifies us honestly; the browser strings exist for portals
# that reject non browser agents outright. INGEST_USER_AGENT pins one string.
USER_AGENTS = [
    "CartaIngest/1.0 (+https://carta-europetravel.com; data@carta-europetravel.com)",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
]

RETRY_STATUSES = {408, 429, 500, 502, 503, 504}


class ProxyPool:
    """IP proxy rotation hook, round robin.

    INGEST_PROXY_LIST: comma separated proxy URLs (http://user:pass@host:port).
    INGEST_PROXY_PROVIDER_URL: optional endpoint returning one proxy per line,
    fetched once at startup (the hook for managed rotation services).
    With neither set, requests go out directly.
    """

    def __init__(self):
        self._proxies = config.env_list("INGEST_PROXY_LIST")
        provider = config.env("INGEST_PROXY_PROVIDER_URL")
        if provider:
            try:
                body = requests.get(provider, timeout=15).text
                self._proxies += [ln.strip() for ln in body.splitlines() if ln.strip()]
            except requests.RequestException:
                pass
        self._i = 0

    def next(self):
        if not self._proxies:
            return None
        proxy = self._proxies[self._i % len(self._proxies)]
        self._i += 1
        return {"http": proxy, "https": proxy}


class RateLimiter:
    """Minimum interval between requests to the same host."""

    def __init__(self, min_interval: float):
        self.min_interval = min_interval
        self._last: dict[str, float] = {}

    def wait(self, url: str):
        host = urlparse(url).netloc
        last = self._last.get(host)
        if last is not None:
            delta = self.min_interval - (time.monotonic() - last)
            if delta > 0:
                time.sleep(delta)
        self._last[host] = time.monotonic()


class PoliteSession:
    """requests.Session wrapper with retries, backoff, rotation and limits."""

    def __init__(self, min_interval: float | None = None, extra_headers: dict | None = None):
        self.session = requests.Session()
        interval = config.RATE_LIMIT_SECONDS if min_interval is None else min_interval
        self.limiter = RateLimiter(interval)
        self.proxies = ProxyPool()
        self.pinned_agent = config.env("INGEST_USER_AGENT")
        self.extra_headers = extra_headers or {}

    def _headers(self, overrides: dict | None) -> dict:
        agent = self.pinned_agent or random.choice(USER_AGENTS)
        headers = {"User-Agent": agent, "Accept": "*/*", **self.extra_headers}
        if overrides:
            headers.update(overrides)
        return headers

    def request(self, method, url, *, headers=None, stream=False, allow_error=(), **kw):
        last_err = None
        for attempt in range(config.HTTP_RETRIES):
            self.limiter.wait(url)
            try:
                resp = self.session.request(
                    method, url,
                    headers=self._headers(headers),
                    timeout=config.HTTP_TIMEOUT,
                    stream=stream,
                    proxies=self.proxies.next(),
                    **kw,
                )
            except requests.RequestException as exc:
                last_err = f"{type(exc).__name__}: {exc}"
            else:
                if resp.status_code < 400 or resp.status_code in allow_error:
                    return resp
                last_err = f"HTTP {resp.status_code} for {url}"
                if resp.status_code not in RETRY_STATUSES:
                    raise HTTPFailed(last_err)
                retry_after = resp.headers.get("Retry-After", "")
                if retry_after.isdigit():
                    time.sleep(min(int(retry_after), 120))
                    continue
            time.sleep((config.HTTP_BACKOFF_BASE ** attempt) + random.uniform(0, 1))
        raise HTTPFailed(f"gave up after {config.HTTP_RETRIES} attempts: {last_err}")

    def get(self, url, **kw):
        return self.request("GET", url, **kw)

    def post(self, url, **kw):
        return self.request("POST", url, **kw)

    def head_status(self, url):
        """Single attempt reachability probe for run_all --check. Returns the
        HTTP status int, or the exception class name for connection failures.
        Hosts that reject HEAD get a lightweight streamed GET instead."""
        self.limiter.wait(url)
        try:
            resp = self.session.head(url, headers=self._headers(None), timeout=20,
                                     allow_redirects=True)
            if resp.status_code in (403, 405, 501):
                resp = self.session.get(url, headers=self._headers(None), timeout=20, stream=True)
                resp.close()
            return resp.status_code
        except requests.RequestException as exc:
            return type(exc).__name__
