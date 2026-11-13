"""Shared, polite clients for the beach layer's four open sources.

Tier: Library

Every source here is free, citable and licence clean, which is the whole point
of the layer: the beaches Carta publishes are built from open data plus our own
scoring and our own prose, never from a places API whose terms forbid keeping
what it returns.

  Wikidata (CC0)         the named beach itself: label, coordinates, country,
                         the region it sits in, its main image, its Commons
                         category and its sitelink count, which is the only
                         honest fame signal that is free and Europe wide.
  OpenStreetMap (ODbL)   every OTHER named beach, and the physical tags no
                         other source carries: surface, lifeguard, nudism,
                         access. Held in its own cache and its own wire fields
                         so the share alike obligation travels with it.
  Wikimedia Commons      three or four photographs per beach, each with its
                         licence and author captured for the credit line.
                         Searched by name AND coordinate (nearcoord), because
                         a plain geosearch returns whatever was uploaded from
                         that hillside, most of it not the beach.
  Wikipedia              the article extract, used as a FACT source only (we
                         read attributes out of it, we never ship its prose)
                         and its pageview count as a second fame signal.

Politeness is not optional on any of them: one shared user agent that names
the project and a contact, a minimum interval per host, exponential backoff on
429 and 5xx, and every answer cached on disk so a re-run costs nothing. The
Overpass endpoints in particular hand out 429s freely, which is what the
fallback mirrors are for.

ASCII clean, no em dashes, per project convention.
"""

import http.client
import json
import os
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "cache" / "beaches"

CONTACT = "bas.vannieuwenhuyse123@gmail.com"
UA = f"CartaBeaches/1.0 (https://carta-europetravel.com; {CONTACT})"

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
# FULL PLANET instances only. overpass.osm.ch was in this list for one run and
# it is a Swiss regional database: it answers a query for Austria with a
# perfectly well formed empty result, which every caller then reads as "Austria
# has no beaches". It cost two countries before the pattern showed. Any mirror
# added here has to be checked with a query outside its own country first.
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
# Two harvest processes can halve the wall clock without either mirror seeing
# two requests at once, as long as they start from different ends of the list.
# CARTA_OVERPASS=kumi (or a full URL) moves that endpoint to the front.
_PREFERRED = os.environ.get("CARTA_OVERPASS", "").strip()
if _PREFERRED:
    OVERPASS_ENDPOINTS.sort(key=lambda url: _PREFERRED not in url)
COMMONS_API = "https://commons.wikimedia.org/w/api.php"

# Per host floor between calls. Wikidata's public endpoint asks for one query
# at a time; Overpass wants a gap big enough that two runs of this script do
# not add up to an abusive rate; the MediaWiki APIs are fine at five a second
# but we are in no hurry.
MIN_INTERVAL = {
    "query.wikidata.org": 1.5,
    "overpass-api.de": 8.0,
    "overpass.kumi.systems": 4.0,
    "maps.mail.ru": 6.0,
    # 0.4 s, and IMAGE_WORKERS is 2. Four workers at 0.2 s (five requests a
    # second) walked straight into a wall of 429s: the imageinfo generator
    # queries are expensive ones, and Wikimedia rate limits an anonymous
    # client on those harder than the plain API budget suggests.
    "commons.wikimedia.org": 0.4,
    "wikimedia.org": 0.25,
    # Thumbnails, not queries. upload.wikimedia.org is a CDN serving static
    # files, which costs Wikimedia far less than an imageinfo generator, and
    # the lake layer's pixel probe fetches one per candidate. Its own budget,
    # so downloading pictures never eats into the API's gap.
    "upload.wikimedia.org": 0.15,
}
DEFAULT_INTERVAL = 0.35
_last_call = {}
# The pacer is shared state and the photograph pass runs on a small thread
# pool, so the gap has to be claimed under a lock. Without it four workers all
# read the same "last call" and fire together, which is the opposite of what
# the interval is for.
_pace_lock = threading.Lock()


class SourceError(Exception):
    """One request failed for good. The caller skips that item."""


def _host(url):
    return urllib.parse.urlparse(url).netloc


# ---------------------------------------------------------------------------
# Transport: a short connect, a memory of dead addresses, a bench for dead hosts
# ---------------------------------------------------------------------------
# 2026-11-13 (ROADMAP H9): the build box's two IPv4 addresses are refused by
# overpass-api.de and one of its two IPv6 addresses drops the box's SYNs, while
# the other IPv6 address answers. urllib gives connect and read ONE timeout, so
# every request waited up to the full read timeout (300 s for Overpass) on the
# silent address before trying the next, and nothing remembered it: the lakes
# harvest spent 48 hours on 45 of 94 batches, adding load to the hosts that had
# blocked the box. Now each address gets CONNECT_TIMEOUT to accept, an address
# that failed is tried last for the rest of the process, and a host where no
# address connected BENCH_AFTER times in a row is benched for BENCH_SECONDS:
# requests to it fail at once, so a harvest ends and resumes on the next run
# instead of hammering a host that refuses it. Reads keep their long timeout.
CONNECT_TIMEOUT = float(os.environ.get("CARTA_CONNECT_TIMEOUT") or 12)
BENCH_AFTER = 2
BENCH_SECONDS = float(os.environ.get("CARTA_BENCH_SECONDS") or 1800)
_bad_addr = {}      # (host, address) -> monotonic time of its last failure
_host_fails = {}    # host -> connects in a row where no address accepted
_benched = {}       # host -> monotonic time it may be tried again
_net_lock = threading.Lock()


class HostBenched(urllib.error.URLError):
    """No address of this host accepted a connection lately; not tried now.
    A URLError, so a caller that already retries URLErrors moves on to its
    next mirror without new code."""


def benched_until(host):
    """Seconds until a benched host is tried again, or 0."""
    with _net_lock:
        left = _benched.get(host, 0.0) - time.monotonic()
    return max(0.0, left)


def _connect(address, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, source_address=None):
    """socket.create_connection with the rules above."""
    host, port = address[0], address[1]
    left = benched_until(host)
    if left > 0:
        raise HostBenched(f"{host} benched for {left:.0f}s more: no address accepted a connection")
    infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    with _net_lock:
        # Never-failed addresses first, then the one that failed longest ago.
        infos.sort(key=lambda i: _bad_addr.get((host, i[4][:2]), 0.0))
    last = None
    for family, socktype, proto, _, sockaddr in infos:
        sock = socket.socket(family, socktype, proto)
        try:
            sock.settimeout(CONNECT_TIMEOUT)
            if source_address:
                sock.bind(source_address)
            sock.connect(sockaddr)
        except OSError as exc:
            last = exc
            sock.close()
            with _net_lock:
                _bad_addr[(host, sockaddr[:2])] = time.monotonic()
            continue
        sock.settimeout(socket.getdefaulttimeout() if timeout is socket._GLOBAL_DEFAULT_TIMEOUT else timeout)
        with _net_lock:
            _bad_addr.pop((host, sockaddr[:2]), None)
            _host_fails[host] = 0
        return sock
    with _net_lock:
        _host_fails[host] = _host_fails.get(host, 0) + 1
        if _host_fails[host] >= BENCH_AFTER:
            _benched[host] = time.monotonic() + BENCH_SECONDS
            _host_fails[host] = 0
    raise last or OSError(f"no address for {host}")


class _HTTPConnection(http.client.HTTPConnection):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._create_connection = _connect


class _HTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._create_connection = _connect


class _HTTPHandler(urllib.request.HTTPHandler):
    def http_open(self, req):
        return self.do_open(_HTTPConnection, req)


class _HTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, req):
        kwargs = {"context": self._context}
        # Python 3.11 keeps check_hostname on the handler; 3.12 folded it into the context.
        if getattr(self, "_check_hostname", None) is not None:
            kwargs["check_hostname"] = self._check_hostname
        return self.do_open(_HTTPSConnection, req, **kwargs)


_OPENER = urllib.request.build_opener(_HTTPHandler(), _HTTPSHandler())


def urlopen(req, timeout):
    """urllib.request.urlopen with the transport rules above; for the
    harvesters that keep their own retry loop."""
    return _OPENER.open(req, timeout=timeout)


def _wait(url):
    host = _host(url)
    gap = MIN_INTERVAL.get(host, DEFAULT_INTERVAL)
    with _pace_lock:
        now = time.monotonic()
        due = max(now, _last_call.get(host, 0.0) + gap)
        _last_call[host] = due
    if due > now:
        time.sleep(due - now)


def request(url, *, data=None, headers=None, timeout=90, tries=4,
            backoff=6.0, quiet=False):
    """One HTTP call with the shared user agent, the per host pace and
    backoff on the statuses that clear on their own (429, 5xx)."""
    head = {"User-Agent": UA, "Accept": "application/json"}
    if headers:
        head.update(headers)
    body = data
    if isinstance(body, dict):
        body = urllib.parse.urlencode(body).encode("utf-8")
        head.setdefault("Content-Type", "application/x-www-form-urlencoded")
    last = None
    host = urllib.parse.urlparse(url).hostname or ""
    for attempt in range(tries):
        if benched_until(host) > 0:
            # No sleep and no retry: the bench says the host refuses us now.
            raise SourceError(f"{url} -> {host} benched ({last or 'no address accepted a connection'})")
        _wait(url)
        req = urllib.request.Request(url, data=body, headers=head,
                                     method="POST" if body else "GET")
        try:
            with urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as exc:
            last = f"HTTP {exc.code}"
            if exc.code not in (429, 500, 502, 503, 504):
                raise SourceError(f"{url} -> {last}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = str(exc)
        if attempt < tries - 1:
            pause = backoff * (2 ** attempt)
            if not quiet:
                print(f"    retry in {pause:.0f}s ({last})")
            time.sleep(pause)
    raise SourceError(f"{url} failed after {tries} tries ({last})")


def get_json(url, **kw):
    return json.loads(request(url, **kw).decode("utf-8"))


# ---------------------------------------------------------------------------
# Wikidata
# ---------------------------------------------------------------------------

def sparql(query, timeout=180):
    """POST, never GET: these queries are long enough that a GET URL trips the
    endpoint's own length limits, and POST is what it asks for anyway."""
    raw = request(WIKIDATA_SPARQL, data={"query": query, "format": "json"},
                  headers={"Accept": "application/sparql-results+json"},
                  timeout=timeout)
    return json.loads(raw.decode("utf-8"))["results"]["bindings"]


def cell(row, key, default=None):
    """One SPARQL binding's value, or the default when the OPTIONAL was unmet."""
    got = row.get(key)
    return got["value"] if got else default


# ---------------------------------------------------------------------------
# Overpass
# ---------------------------------------------------------------------------

def overpass(query, timeout=300, tries=3, backoff=20.0):
    """Try the endpoints in order. A 429 from the main instance is normal
    under load and the mirrors answer the identical query.

    The `remark` check is the important line here. Overpass answers a query
    that ran out of time or memory with HTTP 200, an EMPTY elements list and a
    remark explaining itself. Read naively that is "this country has no
    beaches", which is exactly how a first run came back with 3,940 beaches in
    Spain from Wikidata and none at all from OSM. Treating it as the failure it
    is sends the query to the next mirror, and lets the caller fall back to
    tiling."""
    last = None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            raw = request(endpoint, data={"data": query}, timeout=timeout,
                          tries=tries, backoff=backoff)
            answer = json.loads(raw.decode("utf-8"))
            remark = answer.get("remark") or ""
            if "error" in remark.lower() or "timed out" in remark.lower():
                raise SourceError(f"overpass remark: {remark[:120]}")
            return answer.get("elements", [])
        except (SourceError, ValueError) as exc:
            last = exc
            print(f"    {_host(endpoint)} declined ({str(exc)[:90]}), "
                  f"trying the next mirror")
    raise SourceError(f"every Overpass endpoint declined ({last})")


# ---------------------------------------------------------------------------
# MediaWiki (Commons and Wikipedia share one shape)
# ---------------------------------------------------------------------------

def mediawiki(params, api=COMMONS_API, timeout=60):
    params = dict(params)
    params.setdefault("action", "query")
    params.setdefault("format", "json")
    params.setdefault("formatversion", "2")
    return get_json(api + "?" + urllib.parse.urlencode(params), timeout=timeout)


def wikipedia_api(lang):
    return f"https://{lang}.wikipedia.org/w/api.php"


# ---------------------------------------------------------------------------
# Disk cache, one JSON per country per stage
# ---------------------------------------------------------------------------

def cache_path(stage, cc):
    CACHE.mkdir(parents=True, exist_ok=True)
    return CACHE / f"{stage}_{cc.upper()}.json"


def load_cache(stage, cc):
    path = cache_path(stage, cc)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None


def save_cache(stage, cc, payload):
    """Atomic, same reason pipeline_io.atomic_write_json exists: a Ctrl-C
    halfway through a 40 minute harvest must not cost the whole country."""
    path = cache_path(stage, cc)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=1),
                   encoding="utf-8")
    os.replace(tmp, path)


# ---------------------------------------------------------------------------
# Geometry helpers every stage needs
# ---------------------------------------------------------------------------

def haversine_km(lat1, lon1, lat2, lon2):
    from math import asin, cos, radians, sin, sqrt
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = (sin(d_lat / 2) ** 2
         + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2)
    return 2 * 6371.0 * asin(min(1.0, sqrt(a)))
