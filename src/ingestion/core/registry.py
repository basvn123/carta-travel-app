"""Collector registry. Every module in MODULES registers its collector classes
on import via the @register decorator; run_all drives whatever is registered.
Adding a source = adding a module here plus one file, nothing else."""
from importlib import import_module

REGISTRY: dict[str, type] = {}


def register(cls):
    REGISTRY[cls.name] = cls
    return cls


MODULES = [
    # National Access Points and multi modal aggregators
    "naps.pan_europe",
    "naps.germany",
    "naps.france",
    "naps.austria",
    "naps.belgium",
    "naps.denmark",
    "naps.finland",
    "naps.netherlands",
    "naps.norway",
    "naps.sweden",
    "naps.switzerland",
    "naps.spain",
    # Rail: realtime, cross border, EU agency registers
    "rail.sncf_realtime",
    "rail.france_crossborder",
    "rail.era",
    # Aviation
    "aviation.opensky",
    "aviation.opensky_scientific",
    "aviation.eurocontrol",
    # Maritime
    "maritime.nordic_ferries",
    "maritime.greece",
    "maritime.ferryhopper",
    # Historical pricing and yield proxies
    "pricing.renfe_kaggle",
    "pricing.ryanair_archive",
    "pricing.sncf_availability",
    # Exogenous demand catalysts (holiday calendars for the estimation model)
    "events.holidays",
]


def load_all() -> dict[str, type]:
    base = __package__.rsplit(".", 1)[0]  # src.ingestion.core -> src.ingestion
    for module in MODULES:
        import_module(f"{base}.{module}")
    return REGISTRY
