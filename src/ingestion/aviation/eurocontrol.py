"""EUROCONTROL, two collectors.

eurocontrol_statfor: STATFOR / public statistics. The interactive dashboard
(SID) sits behind a viewer, but EUROCONTROL publishes downloadable statistics
(daily traffic variation, market segment splits, forecasts) off its data
pages; we snapshot the configured pages and mirror every linked spreadsheet /
archive. Add deeper page URLs to STATFOR_PAGES as you find them.

eurocontrol_ddr: DDR and ADRR are restricted research repositories (OneSky
account + data agreement); there is no anonymous endpoint to scrape, so this
is a staging sweeper: files you export from DDR / ADRR are dropped into
data/staging/eurocontrol/ and swept into the manifested raw store, then
renamed *.ingested so reruns skip them.
"""
from ..core import config
from ..core.collector import Collector
from ..core.registry import register
from ..core.scrape import extract_links

STATFOR_PAGES = config.env_list("STATFOR_PAGES", [
    "https://www.eurocontrol.int/our-data",
    "https://www.eurocontrol.int/dashboard/statfor-interactive-dashboard",
    "https://www.eurocontrol.int/ddr",
])
EXPORT_PATTERN = r"\.(xlsx|xls|csv|zip|json)([?#]|$)"


@register
class EurocontrolStatfor(Collector):
    name = "eurocontrol_statfor"
    group = "aviation"
    description = "STATFOR / EUROCONTROL public statistics pages + linked downloads"
    static_urls = {f"page_{i}": url for i, url in enumerate(STATFOR_PAGES)}

    def collect(self, store, session):
        mirrored = 0
        for i, page_url in enumerate(STATFOR_PAGES):
            try:
                page = session.get(page_url)
                store.save_text(f"statfor_page_{i}.html", page.text, url=page_url)
                for url in extract_links(page.text, page_url,
                                         href_pattern=EXPORT_PATTERN)[:30]:
                    if self.grab(session, store, url, note="linked statistics export"):
                        mirrored += 1
            except Exception as exc:
                self.fail(f"{page_url} -> {exc}")
        return f"{len(STATFOR_PAGES)} page snapshots, {mirrored} exports"


@register
class EurocontrolStaging(Collector):
    name = "eurocontrol_ddr"
    group = "aviation"
    description = "DDR / ADRR staged file sweeper (restricted research data)"

    def collect(self, store, session):
        base = config.STAGING_DIR / "eurocontrol"
        base.mkdir(parents=True, exist_ok=True)
        pending = [p for p in base.rglob("*")
                   if p.is_file() and not p.name.endswith(".ingested")]
        if not pending:
            return (f"staging empty: drop DDR / ADRR exports (filed trajectories, "
                    f"capacity files) into {base}")
        for path in pending:
            try:
                store.copy_in(path, note=str(path.relative_to(base)))
                path.rename(path.with_name(path.name + ".ingested"))
            except Exception as exc:
                self.fail(f"{path} -> {exc}")
        return f"swept {len(pending)} staged files"
