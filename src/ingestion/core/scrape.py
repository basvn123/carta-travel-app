"""Small HTML / JSON scraping helpers shared by the portal collectors."""
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

# Anything that looks like a downloadable feed artifact.
FEED_EXT_PATTERN = r"\.(zip|xml|xml\.gz|gz|csv|xlsx|json|pb|br|7z)([?#]|$)"


def extract_links(html: str, base_url: str, href_pattern: str | None = None,
                  text_pattern: str | None = None) -> list[str]:
    """Absolute, deduplicated links from an HTML page, filtered by regexes on
    the resolved href and/or the anchor text."""
    soup = BeautifulSoup(html, "html.parser")
    href_re = re.compile(href_pattern, re.I) if href_pattern else None
    text_re = re.compile(text_pattern, re.I) if text_pattern else None
    seen, out = set(), []
    for anchor in soup.find_all("a", href=True):
        url = urljoin(base_url, anchor["href"])
        if href_re and not href_re.search(url):
            continue
        if text_re and not text_re.search(anchor.get_text(" ", strip=True) or ""):
            continue
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def list_s3_objects(session, base_url: str, prefix: str,
                    delimiter: str | None = None) -> list[dict]:
    """Paginate a public, unauthenticated S3-compatible ListObjectsV2 endpoint
    and return every object under `prefix` as {"key", "size"}. Works against
    any bucket that answers plain ?list-type=2 (no SigV4 needed) -- e.g.
    OpenSky's public data-samples bucket."""
    objects = []
    token = None
    while True:
        params = {"list-type": "2", "prefix": prefix, "max-keys": "1000"}
        if delimiter:
            params["delimiter"] = delimiter
        if token:
            params["continuation-token"] = token
        xml = session.get(base_url, params=params).text
        for block in re.findall(r"<Contents>(.*?)</Contents>", xml, re.S):
            key = re.search(r"<Key>([^<]+)</Key>", block)
            size = re.search(r"<Size>([^<]+)</Size>", block)
            if key:
                objects.append({"key": key.group(1),
                               "size": int(size.group(1)) if size else None})
        if "<IsTruncated>true</IsTruncated>" not in xml:
            break
        token_match = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", xml)
        if not token_match:
            break
        token = token_match.group(1)
    return objects


def find_urls_in_json(obj, pattern: str = FEED_EXT_PATTERN) -> list[str]:
    """Walk an arbitrary JSON payload and return every http(s) string that
    looks like a downloadable artifact. Used for portals whose API response
    shapes drift (Austria's data hub, CKAN variants)."""
    pat = re.compile(pattern, re.I)
    out: list[str] = []

    def walk(node):
        if isinstance(node, dict):
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)
        elif isinstance(node, str) and node.startswith("http") and pat.search(node):
            out.append(node)

    walk(obj)
    return list(dict.fromkeys(out))
