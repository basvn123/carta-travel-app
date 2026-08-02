"""European Union Agency for Railways registers: ERADIS (interoperability and
safety), station / accessibility data (ERSAD) and the register of
infrastructure (RINF), the metadata layer for the Single European Railway
Area (stations, platforms, operator licensing).

These are interactive web databases, not bulk feeds: the collector snapshots
the configured register pages and mirrors any CSV / XLSX / ZIP exports they
link. Deeper pulls (the RINF API) need an ERA account; authenticated export
URLs from such an account go in ERA_EXPORT_URLS.
"""
from ..core import config
from ..core.collector import Collector
from ..core.registry import register
from ..core.scrape import extract_links

# Probed 2026-07-31: ERA's own registers overview page moved (404); the EU
# open data portal's ERA publisher catalogue is live and links dataset
# distributions directly, so it replaces the dead page.
PAGES = config.env_list("ERA_PAGES", [
    "https://eradis.era.europa.eu/",
    "https://rinf.era.europa.eu/",
    "https://www.era.europa.eu/",
    "https://data.europa.eu/data/datasets?publisher=European%20Union%20Agency%20for%20Railways&locale=en",
])
EXPORT_PATTERN = r"\.(csv|xlsx|xls|zip|json)([?#]|$)"


@register
class EraRegisters(Collector):
    name = "era"
    group = "rail"
    description = "ERA registers: ERADIS, ERSAD / station accessibility, RINF"
    static_urls = {f"page_{i}": url for i, url in enumerate(PAGES)}

    def collect(self, store, session):
        mirrored = 0
        for i, page_url in enumerate(PAGES):
            try:
                page = session.get(page_url)
                store.save_text(f"era_page_{i}.html", page.text, url=page_url)
                for url in extract_links(page.text, page_url,
                                         href_pattern=EXPORT_PATTERN)[:40]:
                    if self.grab(session, store, url, note="linked register export"):
                        mirrored += 1
            except Exception as exc:
                self.fail(f"{page_url} -> {exc}")
        for url in config.env_list("ERA_EXPORT_URLS"):
            if self.grab(session, store, url, note="account export"):
                mirrored += 1
        return f"{len(PAGES)} register snapshots, {mirrored} exports"
