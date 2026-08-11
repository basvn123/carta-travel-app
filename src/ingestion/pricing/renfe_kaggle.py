"""Renfe dynamic pricing archives from Kaggle: millions of scraped price
points across the Spanish high speed corridors (Madrid - Barcelona, Madrid -
Sevilla, Valencia; AVE / ALVIA / AV City), the canonical yield curve training
set. Downloads the configured datasets via the Kaggle API and sanity checks
the expected yield modeling columns on a small sample: insert_date,
start_date, end_date, origin, destination, train_type, train_class, fare,
price.

Auth, any one of: KAGGLE_API_TOKEN (the new unified KGAT_ tokens, needs
kaggle client 2.x), KAGGLE_USERNAME + KAGGLE_KEY (legacy pair), or the
standard ~/.kaggle/kaggle.json. Extra dataset slugs go in
KAGGLE_RENFE_DATASETS.
"""
import zipfile
from pathlib import Path

from ..core import config
from ..core.collector import Collector
from ..core.errors import AuthMissing
from ..core.registry import register

DEFAULT_DATASETS = ["thegurusteam/spanish-high-speed-rail-system-ticket-pricing"]

# The document's field vocabulary next to the synonyms actual Kaggle exports
# use (verified 2026-07-31: thegurusteam ships departure/arrival/vehicle_*
# where older exports said start_date/end_date/train_*). A concept counts as
# present when any accepted name is.
EXPECTED_CONCEPTS = {
    "insert_date": {"insert_date"},
    "origin": {"origin"},
    "destination": {"destination"},
    "start_date": {"start_date", "departure"},
    "end_date": {"end_date", "arrival"},
    "train_type": {"train_type", "vehicle_type"},
    "train_class": {"train_class", "vehicle_class"},
    "fare": {"fare"},
    "price": {"price"},
}


@register
class RenfeKaggle(Collector):
    name = "renfe_kaggle"
    group = "pricing"
    description = "Kaggle Renfe AVE dynamic pricing archives (yield curve labels)"

    def _validate(self, store, zip_path: Path):
        """Peek at the first CSV member and report which expected yield
        columns are present; the raw zip is kept either way."""
        import pandas as pd
        try:
            with zipfile.ZipFile(zip_path) as zf:
                csvs = [m for m in zf.namelist() if m.lower().endswith(".csv")]
                if not csvs:
                    self.fail(f"{zip_path.name}: no CSV members found")
                    return
                with zf.open(csvs[0]) as fh:
                    sample = pd.read_csv(fh, nrows=50)
                columns = {c.strip().lower() for c in sample.columns}
                missing = sorted(concept for concept, names in EXPECTED_CONCEPTS.items()
                                 if not (names & columns))
                report = {"zip": zip_path.name, "csv": csvs[0],
                          "columns": sorted(columns), "missing_expected": missing}
                store.save_json(f"{zip_path.stem}_column_check.json", report,
                                note="schema sanity check, 50 row sample")
        except Exception as exc:
            self.fail(f"validation of {zip_path.name} -> {exc}")

    def collect(self, store, session):
        has_token = bool(config.env("KAGGLE_API_TOKEN"))
        has_env = config.env("KAGGLE_USERNAME") and config.env("KAGGLE_KEY")
        has_file = (Path.home() / ".kaggle" / "kaggle.json").exists()
        if not (has_token or has_env or has_file):
            raise AuthMissing("set KAGGLE_API_TOKEN (KGAT_ token) or "
                              "KAGGLE_USERNAME + KAGGLE_KEY or ~/.kaggle/kaggle.json")
        try:
            import kaggle  # import performs auth, hence the guard above
        except Exception as exc:
            raise AuthMissing(f"kaggle client failed to authenticate: {exc}")

        datasets = config.env_list("KAGGLE_RENFE_DATASETS", DEFAULT_DATASETS)
        for slug in datasets:
            try:
                kaggle.api.dataset_download_files(slug, path=str(store.dir),
                                                  unzip=False, quiet=True)
                zip_path = store.dir / (slug.split("/")[-1] + ".zip")
                if zip_path.exists():
                    store.register_existing(zip_path,
                                            url=f"https://www.kaggle.com/datasets/{slug}",
                                            note="kaggle dataset archive")
                    self._validate(store, zip_path)
                else:
                    self.fail(f"{slug}: download reported success but zip not found")
            except Exception as exc:
                self.fail(f"{slug} -> {exc}")
        return f"{len(datasets)} kaggle datasets"
