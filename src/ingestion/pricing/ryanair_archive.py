"""Low cost carrier historical price archives: community scraper projects
publish daily fare snapshots per route and days-to-departure on GitHub,
exactly the escalation curves (180 days out to departure) the estimation
model needs as labels.

The document names a project called "Ryanair Timecapsule", but its own
citation for that claim points to an unrelated placeholder GitHub page, and
neither that phrase nor close variants return anything on GitHub search
(confirmed live 2026-07-31: 0 results for "ryanair timecapsule" and "ryanair
price history dataset"). It does not appear to be a real, findable project.
Real LCC price-scraper repos exist under plainer phrasing though (confirmed:
dozens of results for "ryanair price scraper", "ryanair flight prices",
"wizzair price scraper"), so the defaults use that phrasing across the LCCs
the document names (Ryanair, Wizz Air, easyJet) instead.

Repos are discovered through the GitHub search API, ranked by stars, and
mirrored as default branch zipballs; pin exact owner/name entries in
LCC_ARCHIVE_REPOS to skip discovery. GITHUB_TOKEN raises the API rate limit
(optional, but the search endpoint is capped at 30/min even authenticated).
Oversized repos are skipped, not failed (LCC_ARCHIVE_MAX_KB, default 512000).

This complements the in house forward looking carrier harvesters
(pipeline/harvest_ryanair / wizzair / vueling / volotea): those collect
future fares, this collects history.
"""
import re

from ..core import config
from ..core.collector import Collector
from ..core.registry import register

SEARCH_URL = "https://api.github.com/search/repositories"
DEFAULT_QUERIES = ["ryanair price scraper", "ryanair flight prices",
                   "wizzair price scraper", "easyjet price scraper"]


@register
class RyanairArchive(Collector):
    name = "ryanair_archive"
    group = "pricing"
    description = "GitHub LCC price history archives (Ryanair, Wizz Air, easyJet scrapers)"
    static_urls = {"github_search": SEARCH_URL}
    min_interval = 2.5  # GitHub search API caps at 30 req/min even authenticated

    def collect(self, store, session):
        headers = {"Accept": "application/vnd.github+json"}
        token = config.env("GITHUB_TOKEN")
        if token:
            headers["Authorization"] = f"Bearer {token}"

        repos = config.env_list("LCC_ARCHIVE_REPOS")
        skipped_size = []
        if not repos:
            max_kb = config.env_int("LCC_ARCHIVE_MAX_KB", 512000)
            found = {}
            for query in config.env_list("LCC_ARCHIVE_QUERIES", DEFAULT_QUERIES):
                try:
                    resp = session.get(SEARCH_URL,
                                       params={"q": query, "per_page": 5, "sort": "stars"},
                                       headers=headers)
                    payload = resp.json()
                    slug = re.sub(r"[^a-z0-9]+", "_", query.lower()).strip("_")
                    store.save_json(f"github_search_{slug}.json", payload, url=SEARCH_URL,
                                    note=f"query: {query}")
                    for item in payload.get("items", []):
                        full = item.get("full_name")
                        if not full or full in found:
                            continue
                        if item.get("size", 0) > max_kb:
                            skipped_size.append(full)
                            continue
                        found[full] = item
                except Exception as exc:
                    self.fail(f"search '{query}' -> {exc}")
            repos = list(found)[:config.env_int("LCC_ARCHIVE_MAX_REPOS", 3)]

        for full in repos:
            self.grab(session, store, f"https://api.github.com/repos/{full}/zipball",
                      name=f"{full.replace('/', '__')}.zip", headers=headers,
                      note="default branch zipball")
        note = f"{len(repos)} repos mirrored"
        if skipped_size:
            note += f"; skipped oversized: {', '.join(skipped_size)}"
        return note
