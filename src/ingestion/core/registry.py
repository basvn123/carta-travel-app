"""Collector registry and the data licence ledger, one module (T078).

Two things used to live apart and drift apart: the roster of what runs
(this file, plus the cadence table in run_pipeline.py) and the ledger of
what each source is licensed for (docs/tos/data_licenses.md, hand written).
They are now one table. This module is the single source of truth for

  * execution metadata: RUNS, one entry per collector name and per
    pipeline/harvest_*.py script, with its cadence, the run_pipeline.py task
    it runs under and its failure mode;
  * legal governance: SOURCES, one row per external source and use, with
    the licence, whether attribution is required, whether share-alike
    applies and where the credit is rendered today; plus SECTIONS (the
    ledger's chapters and their prose) and WIRE_REVIEW (the per-wire
    produced-work verdicts).

docs/tos/data_licenses.md is GENERATED from this module by
`python -m src.ingestion.core.ledger --write` and never edited by hand;
`--check` (run in CI by .github/workflows/data-licences.yml) fails when the
file is stale or when the tables disagree with the tree.

The rule that makes the ledger impossible to forget: @register refuses a
collector whose name has no RUNS entry and no SOURCES row, so adding a
source without its licence row breaks `run_all --list`, the tests and CI
before it can ship. The same check covers every pipeline/harvest_*.py file,
and validate() is where both rules live.

Every module in MODULES registers its collector classes on import via the
@register decorator; run_all drives whatever is registered. Adding a source
= adding a module here, one file, one RUNS entry and one SOURCES row.
"""
from dataclasses import dataclass
from importlib import import_module
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


class MissingLicenceRow(Exception):
    """A collector or harvester exists without its registry entries."""


@dataclass(frozen=True)
class Run:
    """Execution metadata for one collector or one harvester script.

    cadence  weekly | monthly | quarterly | backfill | after | manual, the
             same vocabulary as run_pipeline.py's CADENCE MODEL.
    task     the run_pipeline.py task key the source runs under; "" when it
             is never scheduled (Manual tier, run by hand).
    failure  soft: the task logs the failure and the weekly run carries on
             (run_pipeline `soft`); hard: the task fails and its chain stops;
             manual: there is no schedule, the operator sees the failure.
    """
    cadence: str
    task: str
    failure: str
    note: str = ""


@dataclass(frozen=True)
class Section:
    """One chapter of the generated ledger. Rows point at it by id."""
    id: str
    title: str
    level: str = "##"
    columns: tuple = ()
    intro: str = ""
    outro: str = ""
    retired: bool = False


@dataclass(frozen=True)
class Source:
    """One ledger row: an external source and one use of it.

    collectors  names of the src/ingestion collectors this row covers.
    scripts     repo paths of the scripts this row covers; the harvester
                coverage check reads pipeline/harvest_*.py entries from here.
    retired     the row is history: its scripts may be gone from the tree.
    The six text fields are the six ledger columns, verbatim.
    """
    key: str
    section: str
    name: str
    takes: str
    licence: str
    attribution: str
    share_alike: str
    attributed: str
    collectors: tuple = ()
    scripts: tuple = ()
    retired: bool = False


@dataclass(frozen=True)
class WireReview:
    """One row of the share-alike review: produced work or database extract."""
    wire: str
    ships: str
    verdict: str
    travels: str


# --------------------------------------------------------------------------
# Execution metadata. Keys are collector names (as in Collector.name) or
# repo-relative harvester paths. Cadence and the soft flag are checked
# against run_pipeline.py's task table by validate(), so this copy cannot
# rot silently.
# --------------------------------------------------------------------------

_WEEKLY = Run("weekly", "ingestion", "soft")

RUNS: dict[str, Run] = {
    # src/ingestion collectors: the weekly raw open-data mirror. Keyless
    # sources SKIP, partial ones WARN, and the task is soft, so none of them
    # can block the ship.
    "pan_europe": _WEEKLY,
    "germany": _WEEKLY,
    "france_static": _WEEKLY,
    "austria": _WEEKLY,
    "belgium": _WEEKLY,
    "denmark": _WEEKLY,
    "finland": _WEEKLY,
    "netherlands": _WEEKLY,
    "norway": _WEEKLY,
    "sweden": _WEEKLY,
    "switzerland": _WEEKLY,
    "spain": _WEEKLY,
    "sncf_realtime": Run("weekly", "ingestion", "soft",
                         "the one long runner, about 10 minutes of polling"),
    "france_crossborder": _WEEKLY,
    "era": _WEEKLY,
    "opensky": _WEEKLY,
    "opensky_scientific": _WEEKLY,
    "eurocontrol_statfor": _WEEKLY,
    "eurocontrol_ddr": Run("weekly", "ingestion", "soft",
                           "sweeps data/staging/eurocontrol; nothing is downloaded"),
    "nordic_ferries": _WEEKLY,
    "greece_nap": _WEEKLY,
    "ferryhopper": _WEEKLY,
    "flixbus_gtfs": _WEEKLY,
    "renfe_kaggle": _WEEKLY,
    "ryanair_archive": _WEEKLY,
    "sncf_availability": _WEEKLY,
    "travelpayouts": Run("manual", "tp_stage", "soft",
                         "retired from the schedule with the fare tasks (T255); "
                         "still part of the weekly ingestion sweep, where a missing "
                         "token SKIPs"),
    "holidays": Run("monthly", "demand_events", "soft",
                    "also part of the weekly ingestion sweep"),
    "school_holidays": Run("monthly", "demand_events", "soft",
                           "also part of the weekly ingestion sweep"),
    # pipeline/harvest_*.py: the destination content harvesters. Task keys
    # and cadences are run_pipeline.py's; "manual" with no task is the
    # Manual tier (the script's own header says so).
    "pipeline/harvest_accommodation.py": Run("quarterly", "lodging", "hard"),
    "pipeline/harvest_activities.py": Run("backfill", "activities", "hard"),
    "pipeline/harvest_all_origins.py": Run("manual", "fares", "hard",
                                           "every fare harvest is retired (T255, 2026-10-01)"),
    "pipeline/harvest_bathing_water.py": Run("quarterly", "bathing_water", "hard"),
    "pipeline/harvest_climate_power.py": Run("backfill", "climate", "hard"),
    "pipeline/harvest_events.py": Run("monthly", "events", "soft"),
    "pipeline/harvest_flight_times.py": Run("monthly", "flight_times", "hard",
                                            "reads the retired Ryanair endpoint; "
                                            "scheduled but produces nothing new until "
                                            "a fare source returns"),
    "pipeline/harvest_geonames.py": Run("backfill", "geonames", "hard"),
    "pipeline/harvest_hostelworld.py": Run("monthly", "staytiers", "hard",
                                           "SKIPs without partner credentials"),
    "pipeline/harvest_hotels_liteapi.py": Run("monthly", "staytiers", "hard",
                                              "SKIPs without an API key"),
    "pipeline/harvest_image_licenses.py": Run("manual", "", "manual"),
    "pipeline/harvest_images.py": Run("backfill", "images", "hard"),
    "pipeline/harvest_pageviews.py": Run("monthly", "poi_significance", "soft",
                                         "the fame task imports it for the destination half"),
    "pipeline/harvest_parking.py": Run("quarterly", "parking", "soft"),
    "pipeline/harvest_place_signals.py": Run("quarterly", "coverage", "soft"),
    "pipeline/harvest_poi_wikidata.py": Run("monthly", "poi_significance", "soft"),
    "pipeline/harvest_pois_overture.py": Run("backfill", "overture", "hard"),
    "pipeline/harvest_pois_wikidata_images.py": Run("backfill", "poi_images_wikidata", "hard"),
    "pipeline/harvest_protected_areas_osm.py": Run("backfill", "nature", "hard"),
    "pipeline/harvest_tourism_density.py": Run("quarterly", "crowding", "hard"),
    "pipeline/harvest_unesco_whc.py": Run("quarterly", "unesco", "soft"),
    "pipeline/harvest_urban_fabric.py": Run("manual", "", "manual"),
    "pipeline/harvest_wikivoyage.py": Run("backfill", "guide", "hard"),
    "pipeline/harvest_wikivoyage_listings.py": Run("monthly", "poi_significance", "soft"),
}


# --------------------------------------------------------------------------
# The collector registry.
# --------------------------------------------------------------------------

REGISTRY: dict[str, type] = {}


def sources_for(name: str = "", script: str = "") -> tuple:
    """The ledger rows that cover a collector name or a script path."""
    return tuple(s for s in SOURCES
                 if (name and name in s.collectors) or (script and script in s.scripts))


def register(cls):
    """Register a collector class. Refuses one that has no execution entry
    or no licence row: the ledger rule enforced at import time, so a new
    collector without its governance fails `run_all --list`, the tests and
    CI rather than quietly shipping uncredited data."""
    missing = []
    if cls.name not in RUNS:
        missing.append(f"RUNS[{cls.name!r}]")
    if not sources_for(name=cls.name):
        missing.append(f"a SOURCES row with collectors=({cls.name!r},)")
    if missing:
        raise MissingLicenceRow(
            f"collector {cls.name!r} ({cls.__module__}) has no licence governance: "
            f"add {' and '.join(missing)} in src/ingestion/core/registry.py")
    cls.run = RUNS[cls.name]
    cls.sources = sources_for(name=cls.name)
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
    # Long distance bus networks
    "bus.flixbus_gtfs",
    # Historical pricing and yield proxies
    "pricing.renfe_kaggle",
    "pricing.ryanair_archive",
    "pricing.sncf_availability",
    "pricing.travelpayouts",
    # Exogenous demand catalysts (holiday calendars for the estimation model)
    "events.holidays",
]


def load_all() -> dict[str, type]:
    base = __package__.rsplit(".", 1)[0]  # src.ingestion.core -> src.ingestion
    for module in MODULES:
        import_module(f"{base}.{module}")
    return REGISTRY


# --------------------------------------------------------------------------
# Validation: the rules CI enforces. validate() returns a list of problems,
# empty when the registry, the tree and run_pipeline.py agree.
# --------------------------------------------------------------------------

def harvester_scripts(root: Path = ROOT) -> list[str]:
    """Every pipeline/harvest_*.py in the tree, repo-relative, posix."""
    return sorted(p.relative_to(root).as_posix() for p in (root / "pipeline").glob("harvest_*.py"))


def pipeline_tasks(root: Path = ROOT) -> dict[str, dict]:
    """run_pipeline.py's task table, read by regex (key, cadence, soft), so
    the RUNS copy of a cadence is checked against the driver that owns it.
    run_pipeline.py is never imported: importing it runs environment setup."""
    import re
    src = (root / "run_pipeline.py").read_text(encoding="utf-8")
    tasks = {}
    for m in re.finditer(r'\{\s*\n\s*"key":\s*"([^"]+)"', src):
        depth, start = 0, m.start()
        for end in range(start, len(src)):
            if src[end] == "{":
                depth += 1
            elif src[end] == "}":
                depth -= 1
                if depth == 0:
                    break
        body = src[start:end + 1]
        cadence = re.search(r'"cadence":\s*"([^"]+)"', body)
        tasks[m.group(1)] = {
            "cadence": cadence.group(1) if cadence else "",
            "soft": '"soft": True' in body,
            "scripts": set(re.findall(r"pipeline/[\w/]+\.py", body)),
        }
    return tasks


def validate(registry: dict | None = None, harvesters: list[str] | None = None,
             root: Path = ROOT) -> list[str]:
    """Every rule the ledger depends on, as a list of human-readable
    problems. Pass `registry` and `harvesters` to test the rules against a
    synthetic roster; by default they are the live collectors and the
    harvest_*.py files on disk."""
    problems = []
    registry = load_all() if registry is None else registry
    harvesters = harvester_scripts(root) if harvesters is None else harvesters
    keys = [s.key for s in SOURCES]
    section_ids = {s.id for s in SECTIONS}

    # Structural: unique keys, known sections, no empty cells.
    dupes = sorted({k for k in keys if keys.count(k) > 1})
    for k in dupes:
        problems.append(f"SOURCES key {k!r} is used more than once")
    for s in SOURCES:
        if s.section not in section_ids:
            problems.append(f"SOURCES[{s.key!r}] points at unknown section {s.section!r}")
        for field in ("name", "takes", "licence", "attribution", "share_alike", "attributed"):
            if not getattr(s, field).strip():
                problems.append(f"SOURCES[{s.key!r}] has an empty {field} cell")

    # Storable-copy verdicts (T300-d): one per row, from the closed vocabulary.
    for k in keys:
        if k not in STORABLE:
            problems.append(f"SOURCES[{k!r}] has no STORABLE verdict")
    for k, v in STORABLE.items():
        if k not in keys:
            problems.append(f"STORABLE[{k!r}] names a row that does not exist")
        if v not in STORABLE_VOCAB:
            problems.append(f"STORABLE[{k!r}] is {v!r}, not one of {STORABLE_VOCAB}")

    for app_name, rows in APP_CREDITS.items():
        for k in rows:
            if k not in keys:
                problems.append(f"APP_CREDITS[{app_name!r}] names {k!r}, which is not a ledger row")

    # Collectors: every registered collector has a RUNS entry and a row;
    # every RUNS collector entry and every row's collector name is real.
    for name in registry:
        if name not in RUNS:
            problems.append(f"collector {name!r} has no RUNS entry")
        if not sources_for(name=name):
            problems.append(f"collector {name!r} has no SOURCES row (collectors=({name!r},))")
    known_runs_scripts = {k for k in RUNS if k.startswith("pipeline/")}
    for name in RUNS:
        if name not in known_runs_scripts and name not in registry:
            problems.append(f"RUNS[{name!r}] names a collector that is not registered")
    for s in SOURCES:
        for name in s.collectors:
            if name not in registry:
                problems.append(f"SOURCES[{s.key!r}] names unknown collector {name!r}")

    # Harvesters: every pipeline/harvest_*.py on disk has a RUNS entry and a
    # row; every RUNS harvester entry and every live row's script exists.
    covered = {p for s in SOURCES for p in s.scripts}
    for script in harvesters:
        if script not in RUNS:
            problems.append(f"harvester {script} has no RUNS entry")
        if script not in covered:
            problems.append(f"harvester {script} has no SOURCES row (scripts=({script!r},))")
    on_disk = set(harvesters)
    for script in known_runs_scripts:
        if script not in on_disk:
            problems.append(f"RUNS[{script!r}] names a harvester that is not in the tree")
    retired_sections = {s.id for s in SECTIONS if s.retired}
    for s in SOURCES:
        if s.retired or s.section in retired_sections:
            continue
        for p in s.scripts:
            if p.split("/")[0] in ("pipeline", "tools", "src") and not (root / p).exists():
                problems.append(f"SOURCES[{s.key!r}] names {p}, which is not in the tree "
                                f"(mark the row retired=True if that is history)")

    # Cadence: RUNS agrees with run_pipeline.py's task table.
    tasks = pipeline_tasks(root)
    for name, run in RUNS.items():
        if run.task:
            task = tasks.get(run.task)
            if task is None:
                problems.append(f"RUNS[{name!r}] names run_pipeline task {run.task!r}, which does not exist")
                continue
            if task["cadence"] != run.cadence:
                problems.append(f"RUNS[{name!r}] says {run.cadence}, run_pipeline task "
                                f"{run.task!r} says {task['cadence']}")
            soft = run.failure == "soft"
            if task["soft"] != soft:
                problems.append(f"RUNS[{name!r}] failure {run.failure!r} disagrees with "
                                f"run_pipeline task {run.task!r} (soft={task['soft']})")
        else:
            if run.cadence != "manual" or run.failure != "manual":
                problems.append(f"RUNS[{name!r}] has no task, so cadence and failure must be 'manual'")
            scheduled = [k for k, t in tasks.items() if name in t["scripts"]]
            if scheduled:
                problems.append(f"RUNS[{name!r}] is marked manual but run_pipeline schedules it "
                                f"under {', '.join(scheduled)}")
    return problems


# --------------------------------------------------------------------------
# The ledger. HEADER and each Section's intro/outro are the prose of
# docs/tos/data_licenses.md; SOURCES are its rows, verbatim. Edit here,
# then `python -m src.ingestion.core.ledger --write`.
# --------------------------------------------------------------------------

HEADER = """\
# Carta data license ledger

Every external data source currently in use, its license, and where (or
whether) it is attributed today. Compiled 2026-08-06 from the ingestion
roster (`python -m src.ingestion.run_all --list`, 29 collectors), the
`pipeline/harvest_*.py` headers, the runtime services the app calls from the
browser, and the price-map blueprint's license notes.

Rules of the ledger:

- A new collector or harvester must add a row before it ships: a `SOURCES`
  row and a `RUNS` entry in `src/ingestion/core/registry.py`, which this
  file is generated from. CI fails until both exist.
- "Attribution required" is what the license or terms demand, not what we
  currently do. Gaps are marked MISSING in the last column and collected in
  the follow-up list at the bottom.
- `continent-app/src/data/attribution.js` is derived from this table: every
  row with a required user-facing credit has an entry there, and the Data
  sources screen renders it (Account panel, `auth/AccountPanel.jsx`).
- Entries marked "verify" carry a license claim taken from the portal or from
  general knowledge that has not been confirmed against the current terms
  text; confirm before relying on it.
"""

SECTIONS = (
    Section(
        id="fares_direct",
        title="1. Flight fares, direct carrier harvest (primary source)",
        level="##",
        columns=('Source', 'What we take', 'License', 'Attribution required', 'Share-alike', 'Where attributed today'),
        intro="",
        outro="",
    ),
    Section(
        id="fare_partners",
        title="2. Fare caches and partner APIs",
        level="##",
        columns=('Source', 'What we take', 'License', 'Attribution required', 'Share-alike', 'Where attributed today'),
        intro="",
        outro="",
    ),
    Section(
        id="naps",
        title="3. National timetable feeds (ingestion, naps group)",
        level="##",
        columns=('Source', 'What we take', 'License', 'Attribution required', 'Share-alike', 'Where attributed today'),
        intro="""\
Raw ETL into `data/raw/`, not shipped to users directly; they feed the ground
transport calibration and reach layers, so required credits still belong in
the app once those surfaces render from this data.
""",
        outro="",
    ),
    Section(
        id="collectors",
        title="4. Rail, aviation, maritime, pricing history and events collectors",
        level="##",
        columns=('Source', 'What we take', 'License', 'Attribution required', 'Share-alike', 'Where attributed today'),
        intro="",
        outro="",
    ),
    Section(
        id="content_layers",
        title="5. Destination content layers (pipeline harvesters)",
        level="##",
        columns=('Source', 'What we take', 'License', 'Attribution required', 'Share-alike', 'Where attributed today'),
        intro="",
        outro="",
    ),
    Section(
        id="runtime",
        title="6. Runtime services called from the browser",
        level="##",
        columns=('Source', 'What we take', 'License', 'Attribution required', 'Share-alike', 'Where attributed today'),
        intro="",
        outro="",
    ),
    Section(
        id="trails_lab",
        title="7. Trails and daytrips content lab",
        level="##",
        columns=('Source', 'What we take', 'License', 'Attribution required', 'Share-alike', 'Where attributed today'),
        intro="""\
Sources the trails vertical ingests into the local PostGIS lab
(`tools/trailslab`, port 5433). Approved content became user-facing on
2026-08-11: `pipeline/trails/export_wire.py` promotes approved trips to
published and writes them to `continent-app/public/trails/{CC}.json` as
produced works, each carrying its own `attribution_text`. Nothing ships in
bulk, so the ODbL derived-database obligations stay with the lab. The lab's
`images` table rejects NC and ND licensed material at insert, and its
`data_sources` table carries the attribution template per source. The three
national portal rows were updated 2026-08-07 when the first
`pipeline/trails/crosscheck_portals.py` harvest ran.
""",
        outro="",
    ),
    Section(
        id="features_retired",
        retired=True,
        title="8. Natural features layer (beaches and mountains) - RETIRED 2026-09-02",
        level="##",
        columns=('Source', 'What we take', 'License', 'Attribution required', 'Share-alike', 'Where attributed today'),
        intro="""\
**This layer was retired per brief 08.** The wire predated the beaches and
mountains layers (sections above) that replaced it, and nothing under
`continent-app/src` ever read `public/features/`, so the repo was carrying
this section's obligations for a surface that never rendered. The code moved
to `archive/pipeline_features`, the `features` task left `run_pipeline.py`,
and `public/features/` is deleted from the tree. The table below is kept as
the record of what the wire carried while it existed; every obligation in it
ended with the publication. Two of its rows have since been overtaken and are
corrected here rather than left to mislead:

- The UNESCO cache DOES have a harvester now: `pipeline/harvest_unesco_whc.py`
  writes `cache/unesco_whc.json` from the WHC's official XML, so the
  provenance of its rows is real. `attribution.js` also carries a UNESCO row.
  Both facts postdate the table text.
- The "35 attribution-required files with no author" count belonged to this
  wire. The live layers were re-audited 2026-09-02: beaches and lakes ship
  zero author-less licensed images, and the mountains wire was repaired the
  same day (17 authors recovered from Commons Attribution/Credit fields, 35
  waived as not attribution-required, 94 uncreditable files dropped; the wire
  re-exported clean).

The `pipeline/features/*` chain lifted beaches and summits out of the POI layer
into standalone entities, scored them, and published tiers 1 and 2 as one file
per priced country: `continent-app/public/features/<ISO2>.json` plus
`index.json`. At retirement that was 5,472 features across 43 country files.

Nothing in this layer downloads anything new. Every input is a cache that
already has a row above; what changed is that the derived rows are now
PUBLISHED, and publishing is what turns a scoring signal into an attribution
obligation. That is why each source gets its own row here rather than a
footnote on the section 5 row it reuses.

What a shipped row actually contains: a name, a coordinate, a tier and a rank,
plus a bathing-water class, a designation list, an elevation, a Wikipedia
reference and a photo with its full TASL block where they exist. It contains no
prose from any source. Each country file carries a `sources` block resolving
the short keys its features cite (`osm` in all 43, `eea` in 28, `whc` in 13),
which is the citation surface the UI has to render.
""",
        outro="""\
The share-alike question this layer raised is settled for the live wires by
the per-file review table in the "Share-alike review" section below; this
layer itself no longer publishes anything, which closes its half of follow-up
item 2 by deletion.
""",
    ),
    Section(
        id="trips",
        title="9. Composed trips (pipeline/trips)",
        level="##",
        columns=('Source and use', 'What is used', 'Licence', 'Attribution required', 'Share-alike', 'Where it is credited'),
        intro="""\
The trip layer publishes multi day itineraries to `continent-app/public/trips`.
It introduces no new external source: everything it reads is already in the
sections above. What is new is the USE, which is what this section records.
""",
        outro="""\
What the layer deliberately does NOT do, and why it matters here:

- It writes no prose. Every sentence on a trip card or a trip page is composed
  in the app from reason codes through `t()` (`continent-app/src/lib/tripStory.js`),
  so there is no generated text with an unclear provenance, and the six
  translations stay honest.
- It stores no third-party itinerary text. A Wikivoyage itinerary contributes
  its title, its URL and which of its stops resolve onto the catalogue. The
  route Carta ships is composed independently and merely CORROBORATED against
  it, which is why `namedRoute` is worth only 0.4 of a point.
- It calls no paid API and warehouses nothing from one.
""",
    ),
    Section(
        id="journeys",
        title="9b. Curated trip library (pipeline/journeys), 2026-09-02",
        level="##",
        columns=('Source and use', 'What is used', 'Licence', 'Attribution required', 'Share-alike', 'Where it is credited'),
        intro="""\
The journeys layer publishes the 253 hand-written week itineraries
(`Trips/carta-unified`, schema v2.0) to `continent-app/public/journeys`. The
itinerary text, budgets, logistics and tips are Carta's own editorial
content: written in-house (Cowork batches), unified by the
`Trips/carta-unified` pipeline, no third-party prose. The only external
source is the photography.
""",
        outro="",
    ),
    Section(
        id="regions",
        title="10. Region spine (pipeline/regions)",
        level="##",
        columns=('Source', 'What we take', 'License', 'Attribution required', 'Share-alike', 'Where attributed today'),
        intro="""\
The unit between "beach" and "country": NUTS/ITL/geoBoundaries admin
regions, named coastal stretches cut from the EEA coastline, GMBA mountain
ranges, WISE river basin districts and the EEA biogeographical regions,
built once a year into `cache/regions/regions.gpkg` and shipped as region
ids on every layer row plus `public/region/*.json` and `public/coverage.json`.
""",
        outro="""\
Rejected for this layer, so a later search does not relitigate them: GADM
(explicitly non-commercial) and WDPA/Protected Planet (non-commercial); the
spine uses NUTS/ITL/geoBoundaries and will use Natura 2000 + Emerald for
protection instead.
""",
    ),
    Section(
        id="followups",
        title="MISSING attributions, follow-up list",
        level="##",
        intro="""\
Cleared on 2026-08-11 by the footer pass. The app renders a Data sources
block from `continent-app/src/data/attribution.js`, which covers what the
previous eleven
entries asked for: OpenStreetMap contributors, GeoNames, Inside Airbnb, the
EuroGeographics boundary notice, EEA bathing water, the CHELSA citation,
OpenTripMap, Wikipedia and Wikivoyage text, Wikimedia Commons, Overture Maps,
ExchangeRate-API, and the four national timetable feeds whose credit
obligation is unambiguous (GTFS.de / DELFI, transport.data.gouv.fr / SNCF,
Entur, opentransportdata.swiss) plus Digitraffic and Transitous. The trails
sources joined it the same day: Copernicus GLO-30, swisstopo, IGN and
Kartverket.

What is still open, and what each needs:

1. Wikimedia Commons POI thumbnails: per-file credit. The footer credits
   Commons as a whole and the destination hero links to its source page, but a
   CC BY-SA photo in a POI grid still owes its own author and licence. Needs a
   per-image credit surface, and the per-file data is already harvested for
   citytrip stops (`compose_citytrips.py`) so the shape exists.
2. Share-alike review of the OSM-derived slice of `app_data.json`: crediting
   OpenStreetMap answers attribution, not the ODbL obligations on a derived
   database. The trails export solved the same question by shipping produced
   works only; the nature and POI layers have not had that review.
   RESOLVED 2026-09-02: the review exists as section 12 below, a per-file
   produced-work / database-extract table covering every wire the app ships.
3. Belgian operators (SNCB, De Lijn, STIB, TEC): RESOLVED 2026-09-23. Each
   operator's open data terms have been verified against their published portals
   (transportdata.be for SNCB, data.delijn.be for De Lijn, Brussels open data
   for STIB, and TEC's terms via the unified gateway). Each requires attribution.
   Rows added to `attribution.js`.
4. Hostelworld and LiteAPI: display terms come with the partner agreements,
   which are still pending. The stay tiers ship on fixtures until then.
5. Feeds still marked "Raw ETL only": nothing renders from them yet. Each row
   says what its credit becomes when something does.
6. UNESCO World Heritage Centre: RESOLVED. `pipeline/harvest_unesco_whc.py`
   now writes `cache/unesco_whc.json` from the WHC's official XML, and
   `attribution.js` carries the UNESCO row. The natural-features wire that
   first raised this is retired (section 8).
7. The natural-features citation surface: CLOSED by retirement of the wire
   (section 8). The live layer pages (beaches, lakes, mountains, trails,
   cycling) render per-image credits from the TASL rows they ship.
8. 35 shipped photos with an attribution-required licence and no author name:
   CLOSED 2026-09-02. The count belonged to the retired features wire; the
   live wires were re-audited the same day (beaches 0, lakes 0, mountains
   repaired via `pipeline/photos/fill_authors.py` and re-exported clean).

Open risk items, not attribution but licensing scope: Ferryhopper commercial
terms (section 2, row 39: not user-facing yet, agreement required), OpenSky
commercial-use terms (section 4, row 71: commercial endpoint agreement needed
before display), and Numbeo anchor provenance (section 5, row 126: limited to
hand-curated seed anchors for calibration, acceptable in current scope). GFDL
and GPL photos were flagged in the retired features wire; the live photo layers
enforce CC0/CC BY/CC BY-SA at insert and carry no GFDL or GPL files. Each risk
item is flagged in its row above with the gate or decision needed.
""",
        outro="",
    ),
    Section(
        id="attribution_paste",
        title="Ready to paste into `continent-app/src/data/attribution.js`",
        level="##",
        intro="""\
Written here rather than applied: the front end is being edited in a parallel
session, so this file's derived credits are handed over instead of merged.
Entry order in that file follows this ledger, roughly by how much of the
product each source carries.

ONE NEW ENTRY. Place it after the European Environment Agency entry, which is
the other designation-and-quality source in the same block:

```js
  {
    source: 'UNESCO World Heritage Centre',
    license: 'UNESCO WHC terms of use (verify)',
    credit: 'World Heritage designations from the UNESCO World Heritage List',
  },
```

ONE AMENDED ENTRY. The existing OpenStreetMap credit names what the app showed
before this layer existed; beaches and summits are now their own published
entities, so the line should say so:

```js
  {
    source: 'OpenStreetMap',
    license: 'ODbL 1.0',
    credit: 'Map data, points of interest, nature areas, beaches, summits and '
      + 'trail routes © OpenStreetMap contributors',
  },
```

NOTHING ELSE CHANGES IN THAT FILE. The EEA, Wikipedia, Wikivoyage, Wikimedia
Commons, OpenTripMap and Overture entries already cover their part of this
layer, and Wikidata is CC0 and correctly absent. The two credits the footer
cannot carry are per-feature, and belong in the features UI itself:

- the country file's `sources` block, rendered wherever its features are shown
  (`osm` in all 43 files, `eea` in 28, `whc` in 13; each entry is already a
  `{name, url}` pair ready to render as a link),
- the per-photo credit from the feature's own `image` object:
  `image.author`, `image.licence` and `image.licence_url`, which is exactly
  the per-file obligation follow-up item 1 has been open on since 2026-08-11.
""",
        outro="",
    ),
    Section(
        id="dossiers",
        title="Destination dossiers and the PDF export (2026-08-25)",
        level="##",
        intro="""\
The dossier layer (`pipeline/dossier/`, wire at `continent-app/public/dossier/`)
recombines sources already in this ledger: OpenStreetMap (parking, trails,
nearby features), Wikidata (highlight reconciliation, events), Wikivoyage
(intro body, quoted with source link, CC BY-SA), OpenTripMap (highlight
spine), Wikimedia Commons (all photographs), EEA (bathing class), JRC and
Eurostat (crowding), CARTO and OpenStreetMap (the printed map image). No new
source, but a new obligation:

- **A PDF is redistribution.** The on-screen footer credit does not discharge
  attribution once the file is on a stranger's laptop, so every exported
  guide ends with a credits page listing each photograph's author, licence
  and Commons file page, plus the data credit block. This is rendered from
  the dossier's own `credits[]` and per-image TASL, never from a lookup.
- **The image gate** (`build_dossier.py` + `fill_licences.py`): an image
  ships in the PDF only with a resolved redistribution-safe licence AND a
  named author where the licence requires one (`ok_print`). NC, ND and
  permission-only files are refused. Unresolved TASL means the panel may
  still show the photo with its Commons link, but the PDF will not carry it.
- Booking and search deeplinks in the dossier (Google Flights, Skyscanner,
  Booking.com, Airbnb, GetYourGuide, Viator, Google Maps, Waze, Apple Maps)
  are outbound links, not ingested data; no licence obligation attaches.
""",
        outro="",
    ),
    Section(
        id="resolutions",
        title="Resolutions, 2026-08-26 (dossier spec section 11)",
        level="##",
        columns=('Source', 'What we take', 'License', 'Attribution required', 'Share-alike', 'Where attributed today'),
        intro="""\
Three of the open items above are now closed in code:
""",
        outro="""\
- **WorldClim scope (open risk item): CLOSED, 2026-08-30.** `dest.climate`
  moved to NASA POWER (see `apply_climate.py` header) and the lakes
  swim-season model, the last remaining consumer, moved to CHELSA V2.1
  (CC BY 4.0, commercial use permitted with attribution) in
  `pipeline/lakes/lake_climate.py`. Nothing shipped is derived from
  WorldClim any more. `pipeline/harvest_climate_worldclim.py` and
  `cache/worldclim` are retained only so a pre-2026-08-30 build can be
  reproduced, and neither is on any current build path.
- **Item 6 (UNESCO provenance): resolved.** `harvest_unesco_whc.py` is the
  harvester the tree was missing; the fresh official harvest reproduces 95
  percent of the old file's keys (the rest are renamed sites and 2025-26
  inscriptions), previous file kept at `cache/unesco_whc_prev.json`, and the
  ready-to-paste `attribution.js` entry below is now actually pasted.
- **Viator / GetYourGuide affiliate ids:** the dossier stores bare URLs;
  `src/lib/activityAffiliates.js` decorates them at render time from
  `VITE_GYG_PARTNER_ID` / `VITE_VIATOR_PID` (same env pattern as omio.js and
  affiliate.js). Until those are set every link stays a plain search: no
  obligation, no tracking. Outbound affiliate links carry no data-licence
  obligation either way.
""",
    ),
    Section(
        id="s4_sweep",
        title="S4 research sweep: complete for tier 2+ (2026-08-26)",
        level="###",
        intro="""\
The "best things to do" evidence pass now covers **237 destination files
across all 230 tier 2+ places** (every one validated by `research_do.py`: each
shipped item names at least three distinct registrable domains, no source
prose is stored, and every detail sentence is composed from facts). That is
1,566 web-evidenced items; the other 13,229 come from the keyless open-data
tier in `derive_do.py`, which is labelled separately in the UI and never
conflated with this one.

Thirty five files were originally built from a pool too small for the sweep's
own standard, because they were researched by fetching known guide pages
rather than searching. All of them have been re-searched and deepened: the
smallest pool in the set is now eight publishers and the median is twenty two,
`thin_sources` in `data/reports/dossier_research.json` is empty, and no item
claims more corroboration than its file can show.

**What counts as one publisher** is now a single definition,
`pipeline/dossier/common.publisher`, imported by the harvester and by the
validator that judges its output. It folds country editions together
(`tripadvisor.co.za` and `.de` are `tripadvisor.com`) and drops the
aggregators the automated sweep already refused, because a site republishing
what its users typed is not a second opinion. Before this the two halves of
the sweep disagreed: a hand-written file counted domains `web_sweep.py` would
have thrown away, so "named by 8 of 14 guides" meant different things
depending on which path produced the file. `research_do.py` now enforces it,
along with two gaps nothing was checking: an item citing a URL absent from its
own `sources`, and `n_usable_sources` exceeding what the file actually lists.

The copyright position is unchanged and is the reason the format looks the
way it does: the web decides WHICH things matter and in what order, and never
supplies the words. What we store per item is a name, our own sentence, a
count of corroborating domains and up to three source URLs. A fact
corroborated by three independent publishers is a fact about the world, not
anyone's expression, and "named by 23 of 40 guides" is a citation rather than
a quotation.

Booking and official links inside a research file are URLs that were actually
seen in results; nothing is synthesised. They are outbound links, so no data
licence attaches, and `src/lib/activityAffiliates.js` is what decorates the
GetYourGuide and Viator ones once partner ids exist.

The sweep is now part of the monthly `dossier` task rather than something run
by hand: `web_sweep.py --all --if-configured` runs before the build, does
nothing at all when no search key is set, and picks up any destination with no
research file the day one is. `plan_research.py --copy-siblings` fills
multi-airport places, `research_do.py` refuses anything that misses the gate,
and `audit.py --strict` closes the task.

---
""",
        outro="",
    ),
    Section(
        id="cycling",
        title="11. The cycling layer (pipeline/cycling), 2026-08-30",
        level="##",
        columns=('Source', 'What we take', 'License', 'Attribution required', 'Share-alike', 'Where attributed today'),
        intro="""\
ODbL is this layer's backbone, and it has one consequence the other layers do
not face. A rendered map tile and a static image are **produced works** and may
be licensed however we like; a route-details response and a GPX export are
**database extracts**, and the OSMF's own produced-work guideline names GPX as
the paradigm case. So `public/cycling/route/{id}.json` is split in two: an
`osm` block holding the geometry, the source tags, the licence and the
attribution string, and a `carta` block holding our scenic score, safety score,
service towns, stage plans and reasons. The credit lives inside the `osm`
object so it cannot be separated from the data it describes, and
`lib/cycling.js`'s `gpxCredit()` is the single place a GPX exporter reads it
from. Tours reference route ids rather than restating geometry.
""",
        outro="""\
Notes carried forward:

- **WDPA / Protected Planet is refused**, as the master spec requires: the
  UNEP-WCMC licence is non-commercial. Natura 2000 plus Emerald plus CDDA is
  the cleared route to the same question, and Emerald is the half that covers
  the non-EU countries this layer most needs it for.
- **ESA WorldCover is cleared (CC BY 4.0) and still not used**, but the
  component it was for is no longer absent: `landcover.py` measures the same
  fraction from the OSM polygons already on disk. WorldCover remains the
  fallback if OSM land-cover coverage ever proves too uneven, and the
  `known_share` shipped beside every reading is what would show that.
- A tour is our own composition and carries no upstream licence of its own.
  What it carries is the ids of the routes it rides, and those routes carry
  ODbL.
""",
    ),
    Section(
        id="share_alike",
        title="12. Share-alike review: produced work or database extract, per wire file (2026-09-02)",
        level="##",
        columns=('Wire', 'Ships', 'Verdict', 'How the obligation travels'),
        intro="""\
The review follow-up item 2 asked for, applied to every file family the app
ships. The test is the OSMF produced-work guideline: a selection that is
scored, rewritten and composed is a produced work; anything shipping a
geometry a user could reconstruct the source database from (a line, a GPX) is
a database extract, and ODbL terms must travel with the file itself, not just
with the app around it.
""",
        outro="",
    ),
    Section(
        id="scope",
        title="13. Scope: Turkey and Ukraine, decided (2026-09-02)",
        level="##",
        intro="""\
Brief 08 flagged that one layer answered for a continent the rest of the app
does not sell. The decision, recorded here so the asymmetry is documented
rather than accidental:

- **Turkey is out of the content catalogue this cycle**, all layers. The
  region spine carries its statistical regions, the cycling lab has 12,539
  land-cover cells and its routes harvested, so inclusion is a harvest and
  curation decision for a later cycle, not a data gap.
- **Ukraine is published where a layer's data clears its own gate, behind the
  wartime advisory**: mountains ship UA rows, trails and cycling hold UA
  staged in the lab with an empty wire file, beaches and lakes do not
  publish it. An empty `UA.json` shell is the deliberate state for a layer
  with staged-but-unpublished data: the file exists so nothing 404s into SPA
  HTML, and its zero counts say "nothing published" honestly.
""",
        outro="",
    ),
    Section(
        id="image_copies",
        title="14. Self-hosted image copies (R2, cdn.carta-europetravel.com), 2026-09-27",
        level="##",
        columns=('Source', 'What we take', 'License', 'Attribution required', 'Share-alike', 'Where attributed today'),
        intro="""\
From T049 on, a photograph can reach a reader as our own copy rather than
as a hotlink: `pipeline/photos/derive.py` resizes the Commons or Geograph
original into three AVIF and two WebP rungs, stores them in the R2 bucket
under `img/{ab}/{cd}/{sha1}/`, and serves them from
cdn.carta-europetravel.com. T010's verdict is what makes this allowed and
what it costs. A hotlink leaves the copy with Wikimedia; a stored copy is
redistribution, so Carta is the publisher of that file and must discharge
its licence itself, at the point of redistribution. For CC BY and CC BY-SA
that means the author, the licence (with its link) and the source page
travel with every copy. Resizing and a format change are technical
modifications (CC 4.0 section 2(a)(4)), not an adaptation, so share-alike
attaches to the file as it is and to nothing around it, and the copy keeps
exactly the licence the original carries. NC, ND, unlicensed and
non-free files may be hotlinked by nobody here and stored by nobody here.
""",
        outro="""\
Two consequences for anyone touching the image path. First, a file that
leaves a layer or is taken down must also leave R2 (`takedown.py`, T050):
a stored copy we can no longer credit correctly is a copy we should not
hold. Second, the manifest is the only door. Any surface that renders a
CDN URL without the manifest entry behind it prints a photograph with no
author, which on our own copy is our breach, not Wikimedia's.
""",
    ),
    Section(
        id="retired_rows",
        title="15. Retired rows (history)",
        level="##",
        columns=('Source', 'What we take', 'License', 'Attribution required', 'Share-alike', 'Where attributed today'),
        intro="""Rows for code that no longer runs, moved here by T310 so a reader skimming a
live chapter does not take them for current. The ledger is also the record of
what was shipped, so they stay, in the order they appeared. Whole chapters
that were retired (section 8) keep their place. Each row's name says which
script it was and when it was retired.
""",
        outro="",
    ),
)

SOURCES = (
    # 1. Flight fares, direct carrier harvest (primary source)
    Source(
        key="ryanair_farefinder_api",
        section="fares_direct",
        scripts=('pipeline/harvest_all_origins.py', 'pipeline/harvest_flight_times.py'),
        name="Ryanair farefinder API (`pipeline/harvest_all_origins.py`, `harvest_flight_times.py`)",
        takes="Cheapest fare per day per route, departure and arrival times",
        licence="None: public unauthenticated endpoint, direct harvest. Prices are facts; ToS risk accepted and kept polite (rate limits, resumable runs)",
        attribution="No",
        share_alike="No",
        attributed="Carrier shown on fare surfaces (provenance code FR)",
    ),
    Source(
        key="wizz_air_timetable_api",
        retired=True,
        section="fares_direct",
        scripts=('pipeline/archive/harvest_wizzair.py',),
        name="Wizz Air timetable API (`pipeline/archive/harvest_wizzair.py`, RETIRED)",
        takes="Per-day fares both directions, converted to EUR",
        licence="Same as Ryanair: public endpoint, direct harvest",
        attribution="No",
        share_alike="No",
        attributed="Carrier shown (provenance code W6). RETIRED 2026-10-03 (T311, T267-a): the harvester is in pipeline/archive/ and no task runs it",
    ),
    Source(
        key="vueling_apiw_endpoints",
        retired=True,
        section="fares_direct",
        scripts=('pipeline/archive/harvest_vueling.py',),
        name="Vueling apiw endpoints (`pipeline/archive/harvest_vueling.py`, RETIRED)",
        takes="Route discovery plus full per-day fare calendar",
        licence="Same: public endpoint, direct harvest",
        attribution="No",
        share_alike="No",
        attributed="Carrier shown (provenance code VY). RETIRED 2026-10-03 (T311, T267-a): the harvester is in pipeline/archive/ and no task runs it",
    ),
    Source(
        key="volotea_getminprice_api",
        retired=True,
        section="fares_direct",
        scripts=('pipeline/archive/harvest_volotea.py',),
        name="Volotea getminprice API (`pipeline/archive/harvest_volotea.py`, RETIRED)",
        takes="Cheapest fare per window per route",
        licence="Same: public endpoint with a static site key, direct harvest",
        attribution="No",
        share_alike="No",
        attributed="Carrier shown (provenance code V7). RETIRED 2026-10-03 (T311, T267-a): the harvester is in pipeline/archive/ and no task runs it",
    ),
    Source(
        key="exchangerate_api_open_endpoint",
        retired=True,
        section="fares_direct",
        scripts=('pipeline/archive/harvest_wizzair.py',),
        name="ExchangeRate-API open endpoint (open.er-api.com, used by `harvest_wizzair.py`)",
        takes="Daily EUR conversion table (`cache/fx_rates_eur.json`)",
        licence="Free open endpoint; terms require a credit link (\"Rates by Exchange Rate API\"), verify current wording",
        attribution="Yes",
        share_alike="No",
        attributed="Home footer, Data sources block. RETIRED 2026-10-03 (T311, T267-a): the harvester is in pipeline/archive/ and no task runs it",
    ),
    Source(
        key="ryanair_timetable_api",
        retired=True,
        section="fares_direct",
        scripts=("pipeline/archive/harvest_ryanair_schedules.py",),
        name="Ryanair timetable API, services-api.ryanair.com/timtbl (`pipeline/archive/harvest_ryanair_schedules.py`, RETIRED)",
        takes="Published departure and arrival times per directed leg per month; departure times are patched into the fares table as `out_f` / `ret_f`, flight numbers stay in the cache. Row added 2026-10-01 (T078): the script existed without one",
        licence="Same as the farefinder row: public unauthenticated endpoint, direct harvest; a timetable is facts. Manual tier, idle since the fare harvests were retired (T255, 2026-10-01)",
        attribution="No",
        share_alike="No",
        attributed="Carrier shown on fare surfaces (provenance code FR); nothing new to credit. RETIRED 2026-10-03 (T311, T267-a): the harvester is in pipeline/archive/ and no task runs it",
    ),
    # 2. Fare caches and partner APIs
    Source(
        key="travelpayouts_aviasales",
        section="fare_partners",
        collectors=('travelpayouts',),
        name="Travelpayouts / Aviasales (collector: travelpayouts)",
        takes="Cached fares for carriers Carta cannot scrape, staged to `data/derived/tp_fares.json`",
        licence="Affiliate programme API terms; data shown with affiliate deeplinks",
        attribution="Deeplink with partner marker per programme terms; verify display wording rules",
        share_alike="No",
        attributed="Deeplinks carry the marker; fare provenance label (TP) in the UI",
    ),
    Source(
        key="hostelworld_partner_api",
        section="fare_partners",
        scripts=('pipeline/harvest_hostelworld.py',),
        name="Hostelworld Partner API (`pipeline/harvest_hostelworld.py`)",
        takes="Per-city dorm and private-room price medians",
        licence="Partner / affiliate agreement (credentials pending per stay-tier notes)",
        attribution="Per agreement, verify",
        share_alike="No",
        attributed="MISSING, verify agreement display terms",
    ),
    Source(
        key="liteapi_nuitee",
        section="fare_partners",
        scripts=('pipeline/harvest_hotels_liteapi.py',),
        name="LiteAPI, Nuitee (`pipeline/harvest_hotels_liteapi.py`)",
        takes="Per-city 3-star and 4/5-star entry-price medians",
        licence="LiteAPI terms of service (self-service key)",
        attribution="Per terms, verify",
        share_alike="No",
        attributed="MISSING, verify",
    ),
    Source(
        key="ferryhopper_trips_widget",
        section="fare_partners",
        collectors=('ferryhopper',),
        name="Ferryhopper trips widget (collector: ferryhopper)",
        takes="Port pairs, schedules, base fares (sampling)",
        licence="Commercial aggregator, no open license. Ingestion README: keep sampling gentle and confirm terms before scaling",
        attribution="n/a",
        share_alike="No",
        attributed="Not user-facing yet. RISK: confirm terms before any display",
    ),
    Source(
        key="omio",
        section="fare_partners",
        name="Omio",
        takes="Nothing today: outbound deeplinks only (Impact affiliate, `continent-app/src/lib/omio.js`)",
        licence="Impact programme terms",
        attribution="n/a",
        share_alike="No",
        attributed="n/a. Price display is the subject of `omio_outreach.md`",
    ),
    Source(
        key="flix_prices",
        section="fare_partners",
        name="Flix prices",
        takes="Nothing today (the GTFS schedule feed has its own row in section 4, prices are not taken)",
        licence="n/a",
        attribution="n/a",
        share_alike="No",
        attributed="n/a. Price display is the subject of `flix_outreach.md`",
    ),
    # 3. National timetable feeds (ingestion, naps group)
    Source(
        key="public_transport_earth_index",
        section="naps",
        collectors=('pan_europe',),
        name="public-transport.earth index (collector: pan_europe)",
        takes="Aggregated GTFS and NeTEx archives it links",
        licence="Per linked feed, varies",
        attribution="Per feed",
        share_alike="Some feeds",
        attributed="Raw ETL only",
    ),
    Source(
        key="gtfs_de_delfi_plus",
        section="naps",
        collectors=('germany',),
        name="GTFS.de / DELFI plus Mobilithek (collector: germany)",
        takes="DE national GTFS (long distance, regional, local), Mobilithek subscription feeds",
        licence="GTFS.de: CC BY-SA 4.0 per blueprint, free tier requires attribution (per `CREDENTIALS.md`). Mobilithek datasets mostly dl-de/by-2.0, verify per dataset",
        attribution="Yes",
        share_alike="Yes (CC BY-SA)",
        attributed="Home footer, Data sources block",
    ),
    Source(
        key="transport_data_gouv_fr",
        section="naps",
        collectors=('france_static',),
        name="transport.data.gouv.fr / SNCF (collector: france_static)",
        takes="SNCF static GTFS and NeTEx (TGV, OUIGO, Intercites, TER)",
        licence="ODbL per blueprint; some datasets licence ouverte, verify per dataset",
        attribution="Yes",
        share_alike="Yes (ODbL derived database)",
        attributed="Home footer, Data sources block",
    ),
    Source(
        key="mobility_data_austria",
        section="naps",
        collectors=('austria',),
        name="Mobility Data Austria (collector: austria)",
        takes="NeTEx and GTFS for rail, bus, tram, cableway",
        licence="Shared portal license, account-gated acceptance",
        attribution="Per license, verify",
        share_alike="Verify",
        attributed="Raw ETL only",
    ),
    Source(
        key="belgian_operators_sncb_de",
        section="naps",
        collectors=('belgium',),
        name="Belgian operators: SNCB, De Lijn, STIB, TEC (collector: belgium)",
        takes="GTFS static and realtime, SNCB NeTEx EPIP",
        licence="SNCB: transportdata.be open data terms (NeTEx EPIP published with attribution requirement); De Lijn: data.delijn.be open data licence (CC BY 4.0 equivalent); STIB/MIVB: Brussels open data portal open licence; TEC: Walloon open data terms (merged into unified gateway 2026-07-31)",
        attribution="Yes, attribution to the respective operator",
        share_alike="No",
        attributed="Home footer, Data sources block (SETTLED 2026-09-23)",
    ),
    Source(
        key="danish_nap_plus_rejseplanen",
        section="naps",
        collectors=('denmark',),
        name="Danish NAP plus Rejseplanen (collector: denmark)",
        takes="Rail, metro, bus, ferry feeds",
        licence="Account terms (Rejseplanen Labs)",
        attribution="Per terms, verify",
        share_alike="No",
        attributed="Raw ETL only",
    ),
    Source(
        key="traficom_finap_plus_digitraffic",
        section="naps",
        collectors=('finland',),
        name="Traficom FinAP plus Digitraffic (collector: finland)",
        takes="FinAP catalogue, Digitraffic open rail JSON",
        licence="Digitraffic: CC BY 4.0. FinAP per dataset",
        attribution="Yes (Digitraffic)",
        share_alike="No",
        attributed="Home footer, Data sources block",
    ),
    Source(
        key="ndov_loket_ovapi",
        section="naps",
        collectors=('netherlands',),
        name="NDOV Loket / OVapi (collector: netherlands)",
        takes="NL national GTFS, NeTEx deliveries",
        licence="CC0 per blueprint and collector header",
        attribution="No",
        share_alike="No",
        attributed="None needed",
    ),
    Source(
        key="entur",
        section="naps",
        collectors=('norway',),
        name="Entur (collector: norway)",
        takes="NO national GTFS, NeTEx, SIRI ET/SX/VM",
        licence="NLOD (Norwegian licence for open government data)",
        attribution="Yes",
        share_alike="No",
        attributed="Home footer, Data sources block",
    ),
    Source(
        key="trafiklab_samtrafiken",
        section="naps",
        collectors=('sweden',),
        name="Trafiklab / Samtrafiken (collector: sweden)",
        takes="GTFS Sweden 3, NeTEx Sweden, regional feeds",
        licence="CC0 per collector header, verify per feed",
        attribution="No",
        share_alike="No",
        attributed="None needed",
    ),
    Source(
        key="opentransportdata_swiss",
        section="naps",
        collectors=('switzerland',),
        name="opentransportdata.swiss (collector: switzerland)",
        takes="GTFS, NeTEx, HRDF via the DCAT catalogue",
        licence="Portal terms of use (free token)",
        attribution="Yes per portal terms, verify",
        share_alike="No",
        attributed="Home footer, Data sources block",
    ),
    Source(
        key="renfe_open_data",
        section="naps",
        collectors=('spain',),
        name="Renfe open data (collector: spain)",
        takes="Renfe GTFS (AVE, LD, Cercanias), CKAN datasets, NAP snapshot",
        licence="Renfe portal terms, verify per dataset",
        attribution="Per terms, verify",
        share_alike="No",
        attributed="Raw ETL only",
    ),
    # 4. Rail, aviation, maritime, pricing history and events collectors
    Source(
        key="sncf_gtfs_rt_plus",
        section="collectors",
        collectors=('sncf_realtime',),
        name="SNCF GTFS-RT plus SIRI SX Lite (collector: sncf_realtime)",
        takes="Trip updates, disruption messages",
        licence="ODbL via the French NAP",
        attribution="Yes",
        share_alike="Yes",
        attributed="Raw ETL only, MISSING once surfaced",
    ),
    Source(
        key="french_nap_cross_border",
        section="collectors",
        collectors=('france_crossborder',),
        name="French NAP cross-border feeds (collector: france_crossborder)",
        takes="Eurostar, Trenitalia France, Renfe international",
        licence="ODbL or licence ouverte per dataset, verify",
        attribution="Yes",
        share_alike="Varies",
        attributed="Raw ETL only",
    ),
    Source(
        key="era_registers",
        section="collectors",
        collectors=('era',),
        name="ERA registers (collector: era)",
        takes="ERADIS, ERSAD accessibility, RINF exports",
        licence="EU open data reuse (Commission Decision 2011/833/EU), verify",
        attribution="Yes, source acknowledgement",
        share_alike="No",
        attributed="Raw ETL only",
    ),
    Source(
        key="opensky_network",
        section="collectors",
        collectors=('opensky', 'opensky_scientific'),
        name="OpenSky Network (collectors: opensky, opensky_scientific)",
        takes="ADS-B state snapshots, per-airport arrivals and departures, bulk Trino flights table",
        licence="OpenSky terms of use: research orientation, citation requested; commercial use needs a separate OpenSky agreement, verify",
        attribution="Yes, citation",
        share_alike="No",
        attributed="Raw ETL only. RISK: resolve the commercial-use question before any user-facing feature builds on it",
    ),
    Source(
        key="eurocontrol_statfor",
        section="collectors",
        collectors=('eurocontrol_statfor',),
        name="EUROCONTROL STATFOR (collector: eurocontrol_statfor)",
        takes="Public statistics downloads",
        licence="© EUROCONTROL, reuse with source acknowledgement, verify conditions",
        attribution="Yes",
        share_alike="No",
        attributed="Raw ETL only",
    ),
    Source(
        key="eurocontrol_ddr_adrr",
        section="collectors",
        collectors=('eurocontrol_ddr',),
        name="EUROCONTROL DDR / ADRR (collector: eurocontrol_ddr)",
        takes="Manually staged restricted research files",
        licence="Restricted research access, no redistribution",
        attribution="n/a",
        share_alike="No",
        attributed="Never user-facing, keep internal only",
    ),
    Source(
        key="nordic_ferry_feeds_via",
        section="collectors",
        collectors=('nordic_ferries',),
        name="Nordic ferry feeds via Entur and Trafiklab (collector: nordic_ferries)",
        takes="Per-operator ferry archives (Hurtigruten, archipelago)",
        licence="Entur NLOD, Trafiklab CC0",
        attribution="Yes (Entur part)",
        share_alike="No",
        attributed="Home footer, Data sources block (the Entur credit)",
    ),
    Source(
        key="flix_eu_gtfs_feed",
        section="collectors",
        collectors=('flixbus_gtfs',),
        name="Flix EU GTFS feed (collector: flixbus_gtfs)",
        takes="Coach network schedules and stops, folded into `data/derived/flix_network.json` (contract E)",
        licence="Primary endpoint (gtfs.gis.flix.tech) publishes no explicit license; the NDOV loket mirror is CC0 1.0. The collector records which source served the zip in the contract's meta.license",
        attribution="Per served source: none required for the CC0 mirror; unclear for the primary, which is one reason `flix_outreach.md` exists",
        share_alike="No",
        attributed="Contract meta records the license; UI credit not required today (schedules feed estimates, no Flix prices shown)",
    ),
    Source(
        key="greek_nap",
        section="collectors",
        collectors=('greece_nap',),
        name="Greek NAP (collector: greece_nap)",
        takes="Maritime catalogue (Aegean, Ionian)",
        licence="Per dataset (EU PSI reuse), verify",
        attribution="Per dataset",
        share_alike="No",
        attributed="Raw ETL only",
    ),
    Source(
        key="kaggle_renfe_archives",
        section="collectors",
        collectors=('renfe_kaggle',),
        name="Kaggle Renfe archives (collector: renfe_kaggle)",
        takes="AVE dynamic pricing history",
        licence="Per Kaggle dataset page, verify",
        attribution="Per dataset, verify",
        share_alike="Verify",
        attributed="Model training only",
    ),
    Source(
        key="github_lcc_price_archives",
        section="collectors",
        collectors=('ryanair_archive',),
        name="GitHub LCC price archives (collector: ryanair_archive)",
        takes="Historical Ryanair, Wizz Air, easyJet scrape repos",
        licence="Per repository license, verify each repo",
        attribution="Per repo, verify",
        share_alike="Verify",
        attributed="Model training only",
    ),
    Source(
        key="sncf_tgv_max_availability",
        section="collectors",
        collectors=('sncf_availability',),
        name="SNCF TGV MAX availability (collector: sncf_availability)",
        takes="30-day seat availability (occupancy proxy)",
        licence="Unofficial public endpoint, no license",
        attribution="n/a",
        share_alike="No",
        attributed="Model feature only",
    ),
    Source(
        key="nager_date",
        section="collectors",
        collectors=('holidays',),
        name="Nager.Date (collector: holidays)",
        takes="Public holidays, current and next year",
        licence="MIT",
        attribution="License notice in distribution, not user-facing; this ledger entry serves as the record",
        share_alike="No",
        attributed="None needed in UI",
    ),
    Source(
        key="openholidays_api",
        section="collectors",
        collectors=('school_holidays',),
        name="OpenHolidays API (collector: school_holidays)",
        takes="School holiday spans",
        licence="Open data aggregated from per-country public sources, verify",
        attribution="Verify",
        share_alike="No",
        attributed="Raw ETL only",
    ),
    # 5. Destination content layers (pipeline harvesters)
    Source(
        key="inside_airbnb",
        section="content_layers",
        scripts=('pipeline/harvest_accommodation.py',),
        name="Inside Airbnb (`pipeline/harvest_accommodation.py`)",
        takes="Listing-level nightly medians, per-city seasonality, per-capacity and neighbourhood medians",
        licence="CC BY 4.0 (per harvester header)",
        attribution="Yes",
        share_alike="No",
        attributed="Home footer, Data sources block",
    ),
    Source(
        key="eea_wise_bathing_water",
        section="content_layers",
        scripts=('pipeline/harvest_bathing_water.py',),
        name="EEA WISE bathing water (`pipeline/harvest_bathing_water.py`)",
        takes="Official bathing site classifications near each destination",
        licence="EEA standard re-use policy, effectively CC BY 4.0, verify",
        attribution="Yes",
        share_alike="No",
        attributed="WaterQualityBadge shows the rating; source credited in the Account panel's Data sources screen",
    ),
    Source(
        key="worldclim_2_1",
        retired=True,
        section="content_layers",
        scripts=('pipeline/harvest_climate_worldclim.py',),
        name="WorldClim 2.1 (`pipeline/harvest_climate_worldclim.py`, RETIRED)",
        takes="Monthly climate normals sampled per destination",
        licence="Free for academic and other non-commercial use; commercial use needs permission",
        attribution="Yes, citation (Fick and Hijmans 2017)",
        share_alike="No",
        attributed="RETIRED. The destination climate strip moved to NASA POWER and the lake season model moved to CHELSA V2.1 on 2026-08-30. No shipped wire is derived from WorldClim; the harvester and its cache are kept only so an old build can be reproduced",
    ),
    Source(
        key="geonames_cities500",
        section="content_layers",
        scripts=('pipeline/harvest_geonames.py',),
        name="GeoNames cities500 (`pipeline/harvest_geonames.py`)",
        takes="Population, settlement class, elevation, timezone",
        licence="CC BY 4.0 (per harvester header)",
        attribution="Yes",
        share_alike="No",
        attributed="Home footer, Data sources block",
    ),
    Source(
        key="wikipedia",
        section="content_layers",
        scripts=('pipeline/harvest_images.py', 'pipeline/harvest_pageviews.py', 'pipeline/trails/popularity.py'),
        name="Wikipedia (`pipeline/harvest_images.py`, `harvest_pageviews.py`, `pipeline/trails/popularity.py`, live `cityResearch.js`)",
        takes="Lead image pointers, article URLs, pageview counts, live summaries",
        licence="Text CC BY-SA 4.0; pageview statistics CC0",
        attribution="Yes for text",
        share_alike="Yes for text",
        attributed="Image credit link on the destination hero (DetailPanel); live research names Wikipedia in the chat copy; Account panel's Data sources screen carries the text credit and licence",
    ),
    Source(
        key="wikimedia_commons",
        section="content_layers",
        scripts=('pipeline/harvest_pois_wikidata_images.py',),
        name="Wikimedia Commons (destination hero images, POI thumbnails via `harvest_pois_wikidata_images.py`)",
        takes="Photo files hotlinked as thumbnails",
        licence="Per file: CC BY-SA, CC BY or public domain",
        attribution="Yes, per file",
        share_alike="Some files",
        attributed="Hero image links to its Wikipedia page (DetailPanel credit); Home footer, Data sources block credits Commons as a whole; per-file credit on POI thumbnails still MISSING",
    ),
    Source(
        key="bayerische_vermessungsverwaltung_wanderwege",
        section="content_layers",
        scripts=('pipeline/trails/crosscheck_portals.py',),
        name="Bayerische Vermessungsverwaltung Wanderwege (`pipeline/trails/crosscheck_portals.py` DE loader)",
        takes="Named signposted hiking-route GPX geometries, Bavaria, for the portal cross-check",
        licence="CC BY 4.0",
        attribution="Yes (\"Bayerische Vermessungsverwaltung\")",
        share_alike="No",
        attributed="Trails credits block (validation source; no BVV geometry is published in the wire)",
    ),
    Source(
        key="wikidata_sitelink_counts_live",
        section="content_layers",
        scripts=('pipeline/backfill_landmarks.py', 'pipeline/harvest_poi_wikidata.py', 'pipeline/harvest_pois_wikidata_images.py', 'pipeline/score_significance.py', 'pipeline/trails/popularity.py'),
        name="Wikidata (`pipeline/harvest_pois_wikidata_images.py`, `pipeline/harvest_poi_wikidata.py` QID/sitelink/P1435/P1174 per POI, `pipeline/backfill_landmarks.py` box harvest reused by `pipeline/score_significance.py` as per-POI sitelink evidence for the absolute significance (`it.sig`, 2026-09), `pipeline/trails/popularity.py` sitelink counts, live `cityResearch.js`)",
        takes="Entity coordinates, labels, P18 image pointers, descriptions, sitelink counts, heritage designations, visitor counts",
        licence="CC0",
        attribution="No",
        share_alike="No",
        attributed="None needed",
    ),
    Source(
        key="wikivoyage",
        section="content_layers",
        scripts=('pipeline/harvest_wikivoyage.py', 'pipeline/harvest_wikivoyage_listings.py'),
        name="Wikivoyage (`pipeline/harvest_wikivoyage.py`, `pipeline/harvest_wikivoyage_listings.py` See/Do listing names, coords, order and article status as a POI significance signal, activities tier 2)",
        takes="Intro blurbs, See and Do listings",
        licence="CC BY-SA 4.0",
        attribution="Yes",
        share_alike="Yes (blurb text; the listing-derived numeric rate signal is facts, not prose)",
        attributed="\"Open the travel guide\" link on the destination panel; Account panel's Data sources screen carries the blurb credit and licence",
    ),
    Source(
        key="opentripmap",
        section="content_layers",
        scripts=('pipeline/harvest_activities.py',),
        name="OpenTripMap (`pipeline/harvest_activities.py`, preferred tier)",
        takes="POI lists with importance rate per destination",
        licence="Free API tier; terms ask for a credit link, verify current wording",
        attribution="Yes",
        share_alike="Underlying data derives from OSM and Wikidata",
        attributed="Home footer, Data sources block",
    ),
    Source(
        key="overture_maps_places",
        section="content_layers",
        scripts=('pipeline/harvest_pois_overture.py',),
        name="Overture Maps Places (`pipeline/harvest_pois_overture.py`)",
        takes="Bulk sightseeing POIs for the whole catalogue",
        licence="CDLA-Permissive 2.0",
        attribution="Not required, credit recommended",
        share_alike="No",
        attributed="Home footer, Data sources block (the recommended credit)",
    ),
    Source(
        key="openstreetmap_via_overpass",
        section="content_layers",
        scripts=('pipeline/harvest_protected_areas_osm.py',),
        name="OpenStreetMap via Overpass (`pipeline/harvest_protected_areas_osm.py`, live `cityResearch.js`)",
        takes="Protected areas layer, live town POIs",
        licence="ODbL 1.0",
        attribution="Yes: © OpenStreetMap contributors",
        share_alike="Yes: derived databases carry ODbL obligations",
        attributed="Map tiles credit OSM via the attribution control; the nature and POI layers shipped inside app_data.json are credited in the Account panel's Data sources screen. Share-alike review still needed for the OSM-derived slice of app_data.json",
    ),
    Source(
        key="openstreetmap_via_overpass_harvest_parking",
        section="content_layers",
        scripts=('pipeline/harvest_parking.py',),
        name="OpenStreetMap via Overpass (`pipeline/harvest_parking.py`)",
        takes="amenity=parking spots near each destination centre: name, position, fee, capacity, park_ride; shipped as `public/destinfo/{CC}.json`",
        licence="ODbL 1.0",
        attribution="Yes: © OpenStreetMap contributors",
        share_alike="Yes: the destinfo parking slice is an OSM-derived database",
        attributed="Explore panel's parking section prints the OSM credit; Account panel's Data sources screen (OSM entry covers it)",
    ),
    Source(
        key="openstreetmap_via_geofabrik_country",
        section="content_layers",
        scripts=('pipeline/harvest_urban_fabric.py',),
        name="OpenStreetMap via Geofabrik country extracts (`pipeline/harvest_urban_fabric.py`, read with pyosmium from `data/raw/geofabrik/`)",
        takes="Urban-fabric measurements within 1 km of each destination centre: pedestrian/living-street metres, heritage- and historic-tagged object counts, named principal square, canal metres, named bridge count, city-walls presence; shipped only as the aggregated `beauty.components.urban` number inside app_data.json",
        licence="ODbL 1.0",
        attribution="Yes: (c) OpenStreetMap contributors",
        share_alike="Substantial-extract aggregation: the shipped value is a computed statistic, but it derives from OSM and rides the same share-alike review flagged for the app_data OSM slice",
        attributed="Account panel Data sources screen (OSM entry); map attribution control",
    ),
    Source(
        key="openstreetmap_via_geofabrik_country_enrich_beaches",
        section="content_layers",
        scripts=('pipeline/beaches/enrich_beaches.py', 'pipeline/beaches/osm_extract.py'),
        name="OpenStreetMap via Geofabrik country extracts (`pipeline/beaches/osm_extract.py`, read with pyosmium from `data/raw/geofabrik/`) and via Overpass for the 400 m context sweep (`pipeline/beaches/enrich_beaches.py`)",
        takes="The bulk pass moved off Overpass onto the extracts in 03-BEACHES.md and widened with it: named and UNNAMED `natural=beach`, plus `natural=shingle`, `natural=sand`, `leisure=beach_resort` and `leisure=swimming_area`; the surface, lifeguard, nudism and access tags; the beach LENGTH read off the way or polygon geometry, which is the `space` component of beach_beauty_v2; and, for an unnamed beach, a name borrowed from the nearest named bay, cape or settlement within 300 m. Overpass still answers what stands within 400 m of a shortlisted beach. Shipped as `public/beaches/{CC}.json`",
        licence="ODbL 1.0",
        attribution="Yes: (c) OpenStreetMap contributors",
        share_alike="Yes: the published rows are selected, scored and rewritten items (a produced work), and each carries its own ODbL credit. A name DERIVED from a neighbouring OSM feature is itself ODbL and ships marked as such (`nameSrc: \"osm_near\"`)",
        attributed="LIVE: per-beach `credit` array in the wire, the Beaches list prints the credit line, Account panel's Data sources screen",
    ),
    Source(
        key="wikidata_beaches",
        section="content_layers",
        scripts=('pipeline/beaches/harvest_beaches.py',),
        name="Wikidata beaches (`pipeline/beaches/harvest_beaches.py`)",
        takes="Beach entities: label, local label, coordinates, admin region, P18 image, Commons category, sitelink count, length, protected-area and part-of links",
        licence="CC0",
        attribution="No",
        share_alike="No",
        attributed="None needed; the beach page links the Wikidata item",
    ),
    Source(
        key="wikimedia_commons_beach_photographs",
        section="content_layers",
        scripts=('pipeline/beaches/enrich_beaches.py',),
        name="Wikimedia Commons beach photographs (`pipeline/beaches/enrich_beaches.py`)",
        takes="Three or four files per beach, found by name plus `nearcoord`, with LicenseShortName, LicenseUrl and Artist kept per file",
        licence="Per file: CC BY-SA, CC BY, CC0 or public domain",
        attribution="Yes, per file",
        share_alike="Some files",
        attributed="LIVE: author and licence printed under every photograph on the beach page, linking the Commons file page",
    ),
    Source(
        key="wikipedia_beach_articles",
        section="content_layers",
        scripts=('pipeline/beaches/enrich_beaches.py',),
        name="Wikipedia beach articles (`pipeline/beaches/enrich_beaches.py`)",
        takes="FACTS ONLY: a fixed vocabulary matched against the intro extract (substrate, water colour, cliffs, dunes, access, protection), plus the 60-day pageview count. No prose is stored or shipped",
        licence="CC BY-SA 4.0",
        attribution="Facts are not protected; no credit obligation for the extracted attributes",
        share_alike="No, because no text is reused",
        attributed="The beach page links the article it read",
    ),
    Source(
        key="eea_wise_bathing_water_enrich_beaches",
        section="content_layers",
        scripts=('pipeline/beaches/enrich_beaches.py',),
        name="EEA WISE bathing water, beach layer (`pipeline/beaches/enrich_beaches.py`, reads `cache/eea_bathing_water.json`)",
        takes="The nearest official bathing site's class and previous class, per beach",
        licence="EEA standard re-use policy, effectively CC BY 4.0, verify",
        attribution="Yes",
        share_alike="No",
        attributed="LIVE: the class is a sentence on every beach page and a row in its facts, EEA credited in the list credit line and the Data sources screen",
    ),
    Source(
        key="eea_wise_bathing_water_eea_spine",
        section="content_layers",
        scripts=('pipeline/beaches/eea_spine.py', 'pipeline/harvest_bathing_water.py'),
        name="EEA WISE bathing water as a SPINE, beach layer (`pipeline/beaches/eea_spine.py`, merged by `harvest_beaches.merge_spine`, cache written by `pipeline/harvest_bathing_water.py --sites-only`)",
        takes="The whole register rather than only the class: 22,289 designated bathing sites (14,861 coastal or transitional, 7,428 lake or river) with name, registry identifier, coordinate and up to ten seasons of classification. Sites that match a beach already found contribute their reading; sites nothing else knew about become catalogue rows in their own right, marked `nameSrc: \"eea\"` because the name is the member state's registry name and not necessarily the beach's",
        licence="EEA standard re-use policy, effectively CC BY 4.0, verify",
        attribution="Yes",
        share_alike="No",
        attributed="LIVE: the class is a sentence on every beach page and a row in its facts; every row that carries a class carries the EEA credit; Account panel's Data sources screen",
    ),
    Source(
        key="natura_2000_and_the",
        section="content_layers",
        scripts=('pipeline/beaches/protection.py',),
        name="Natura 2000 and the Emerald Network (`pipeline/beaches/protection.py`, EEA biodiversity ArcGIS `ProtectedSites/Natura2000Sites` layer 2 and `ProtectedSites/EmeraldSites` layers 0, 1 and 2)",
        takes="29,749 protected site POLYGONS (27,173 Natura 2000, 2,576 Emerald), each with its site code, name and member state, generalised to 50 m. Used to answer whether a beach is INSIDE a protected site, which the centroid cache it replaces could never prove. Emerald is the Bern Convention's non-EU twin, so the claim now works in the United Kingdom, Norway, Switzerland, the Western Balkans, Ukraine and Turkey instead of stopping at the EU border",
        licence="CC BY 4.0",
        attribution="Yes: European Environment Agency",
        share_alike="No",
        attributed="LIVE: the `prot` block on the row, a fact row on the beach page, a filter chip, and the Natura credit line in every affected row's `credit` array",
    ),
    Source(
        key="eea_coastline_for_analysis",
        section="content_layers",
        scripts=('pipeline/beaches/coastline.py',),
        name="EEA coastline for analysis v3 (`pipeline/beaches/coastline.py`, already cached for the region spine)",
        takes="Which way a beach faces. The land polygons answer \"is this probe point sea or shore\", which turns the local run of the coastline into an ASPECT, a true bearing from the sand out to the water; combined with the sunset azimuth for the latitude and the bathing season it answers \"does the sun set over this beach\". No new download: the file was already on disk for `pipeline/regions`",
        licence="EEA standard re-use policy, effectively CC BY, verify",
        attribution="Yes: (c) European Environment Agency",
        share_alike="No",
        attributed="LIVE: the `aspect` and `sunset` fields on the row, the Sunset filter chip and a fact row on the beach page; EEA row in Account > Data sources",
    ),
    Source(
        key="environment_agency_and_natural",
        section="content_layers",
        scripts=('pipeline/beaches/uk_bathing.py',),
        name="Environment Agency and Natural Resources Wales bathing waters (`pipeline/beaches/uk_bathing.py`, `environment.data.gov.uk/bwq/`)",
        takes="NOT YET INGESTED. The client is written to the documented linked-data API and the licence is clear; every path under `/bwq/` currently answers HTTP 403 from an Azure Application Gateway while the same host's root answers 200, so this is a network-level block rather than a retired service. Until it lifts, Great Britain publishes with the water component DROPPED and the remaining weights renormalised, never defaulted to a class nobody measured",
        licence="Open Government Licence v3.0",
        attribution="Yes, when ingested",
        share_alike="No",
        attributed="n/a while nothing ships. SEPA (Scotland) and DAERA (Northern Ireland) are not wired at all and are recorded as open items in `docs/BEACHES.md`",
    ),
    Source(
        key="wikidata_water_bodies",
        section="content_layers",
        scripts=('pipeline/lakes/harvest_lakes.py',),
        name="Wikidata water bodies (`pipeline/lakes/harvest_lakes.py`)",
        takes="Lake, reservoir and lagoon entities per country: label, local label, coordinates, admin region, P31 types, surface area, maximum depth, elevation, P18 image, Commons category, sitelink count, protected-area, part-of and basin-country links; shipped as `public/lakes/{CC}.json`",
        licence="CC0",
        attribution="No",
        share_alike="No",
        attributed="None needed; the lake page links the Wikidata item",
    ),
    Source(
        key="openstreetmap_named_water_bodies",
        section="content_layers",
        scripts=('pipeline/lakes/osm_water.py',),
        name="OpenStreetMap named water bodies via Geofabrik per-country extracts (`pipeline/lakes/osm_water.py`, extracts cached under `data/raw/geofabrik/`, filtered copies under `cache/lakes/osm_extract/`)",
        takes="Every NAMED water area in a country (`natural=water`, `water=lake|reservoir|lagoon|pond`, `leisure=swimming_area`): name, centroid, ellipsoidal surface area, the `access`, `swimming`, `usage` and `wikidata` tags, and a shore block counted from the same extract (metres of walkable way within 50 m of the waterline, beaches, slipways, swimming places, marinas, piers, car parks, and the ways that say access=private). This is the layer's SECOND SPINE and is why Great Britain, Ireland, Norway and Iceland can publish a national list at all",
        licence="ODbL 1.0",
        attribution="Yes: (c) OpenStreetMap contributors",
        share_alike="Yes: the published rows are selected, scored and rewritten items (a produced work), and each carries its own ODbL credit",
        attributed="LIVE: per-lake `credit` array in the wire, the Lakes list prints the credit line, Account panel's Data sources screen",
    ),
    Source(
        key="openstreetmap_via_overpass_enrich_lakes",
        section="content_layers",
        scripts=('pipeline/lakes/enrich_lakes.py',),
        name="OpenStreetMap via Overpass (`pipeline/lakes/enrich_lakes.py`)",
        takes="What stands within the shore radius of each shortlisted water body: swimming areas, beaches, marinas, slipways, dive and boat rental, ferry terminals, parking, toilets, food, campsites, peaks, cliffs, glaciers, waterfalls, castles and how much is built; plus any `swimming` and `access` tags on the water itself. No country sweep for geometry, unlike the beach layer",
        licence="ODbL 1.0",
        attribution="Yes: (c) OpenStreetMap contributors",
        share_alike="Yes: the published rows are selected, scored and rewritten items (a produced work), and each carries its own ODbL credit",
        attributed="LIVE: per-lake `credit` array in the wire, the Lakes list prints the credit line, Account panel's Data sources screen",
    ),
    Source(
        key="wikimedia_commons_lake_photographs",
        section="content_layers",
        scripts=('pipeline/lakes/enrich_lakes.py',),
        name="Wikimedia Commons lake photographs (`pipeline/lakes/enrich_lakes.py`)",
        takes="Up to five files per water body, found by Commons category, by name plus `nearcoord` and by geosearch at a radius scaled to the lake, with LicenseShortName, LicenseUrl and Artist kept per file",
        licence="Per file: CC BY-SA, CC BY, CC0 or public domain",
        attribution="Yes, per file",
        share_alike="Some files",
        attributed="LIVE: author and licence printed under every photograph on the lake page, linking the Commons file page",
    ),
    Source(
        key="wikipedia_lake_articles",
        section="content_layers",
        scripts=('pipeline/lakes/enrich_lakes.py',),
        name="Wikipedia lake articles (`pipeline/lakes/enrich_lakes.py`)",
        takes="FACTS ONLY: a fixed vocabulary matched against the intro extract (origin, surroundings, colour, activities, protection) plus the sentences that mention swimming, which are held in the CACHE ONLY so a prohibition can be detected, and the 60-day pageview count. No prose is stored in the wire or shipped",
        licence="CC BY-SA 4.0",
        attribution="Facts are not protected; no credit obligation for the extracted attributes",
        share_alike="No, because no text is reused",
        attributed="The lake page links the article it read",
    ),
    Source(
        key="eea_wise_bathing_water_enrich_lakes",
        section="content_layers",
        scripts=('pipeline/lakes/enrich_lakes.py',),
        name="EEA WISE bathing water, lake layer (`pipeline/lakes/enrich_lakes.py`, reads `cache/eea_bathing_water.json`)",
        takes="Every Lake and River type bathing site within the water body's own shore radius: the best class, the previous class, and the COUNT of designated sites, which is the layer's strongest evidence that swimming somewhere is lawful and monitored",
        licence="EEA standard re-use policy, effectively CC BY 4.0, verify",
        attribution="Yes, EEA and the Member State authorities that report the coordinates",
        share_alike="No",
        attributed="LIVE: the class and the site count are rows in the lake page's facts, the count drives the swimming verdict, EEA credited in the list credit line and the Data sources screen",
    ),
    Source(
        key="chelsa_v2_1_lake",
        section="content_layers",
        scripts=('pipeline/lakes/lake_climate.py',),
        name="CHELSA V2.1, lake layer (`pipeline/lakes/lake_climate.py`, cropped once into `cache/lakes/chelsa`)",
        takes="Monthly mean 2 m air temperature normals (1981-2010, 30 arc seconds) sampled at each lake's own coordinate, turned into a MODELLED surface temperature and swimming season. Published as an estimate, never as a measurement, with the model named in `public/lakes/index.json`",
        licence="CC BY 4.0",
        attribution="Yes, citation (Karger et al. 2017)",
        share_alike="No",
        attributed="LIVE: the month strip on the lake page carries an estimate note; the per-lake `credit` array names CHELSA whenever a temperature series ships; Data sources block carries the citation. REPLACED WorldClim 2.1 on 2026-08-30 and closed its non-commercial risk item",
    ),
    Source(
        key="geograph_britain_and_ireland",
        section="content_layers",
        scripts=('pipeline/photos/geograph.py',),
        name="Geograph Britain and Ireland (`pipeline/photos/geograph.py`; bulk dumps from data.geograph.org.uk for discovery, keyed syndicator API for the shortlisted thumbnails)",
        takes="Photographs of GB and IE grid squares for the beach, lake, mountain and trail galleries where Commons is thin: title, photographer real name, capture date, WGS84 coordinate, thumbnail URL",
        licence="CC BY-SA 2.0, per image",
        attribution="Yes, per image: photographer named, licence linked, image linked back to its geograph.org.uk page",
        share_alike="Yes",
        attributed="Per-image author and licence in the wire and under every photograph, same fields as Commons; Geograph row in Account > Data sources",
    ),
    Source(
        key="mapillary",
        section="content_layers",
        scripts=('pipeline/photos/mapillary.py',),
        name="Mapillary (`pipeline/photos/mapillary.py`)",
        takes="Street-level existence proof ONLY, for rows that would otherwise ship with zero images: image id, thumbnail, coordinate, capture date. Evidence tier `street`, which the selection rules bar from ever leading a card",
        licence="CC BY-SA 4.0, per image",
        attribution="Yes, per image",
        share_alike="Yes",
        attributed="Per-image credit in the wire; Mapillary row in Account > Data sources. Not yet live: no wire ships a `street` image until a layer harvest adopts it",
    ),
    Source(
        key="wikidata_mountains",
        section="content_layers",
        scripts=('pipeline/mountains/harvest_peaks.py',),
        name="Wikidata mountains (`pipeline/mountains/harvest_peaks.py`, reads the already harvested `cache/features_wikidata.json` spine)",
        takes="Mountain, summit, hill and volcano entities per country: label, local label, coordinates, elevation, prominence, isolation, P18 image, Commons category, mountain range, protected area, P31 classes, sitelink count, and the P610 highest points of each country and its regions; shipped as `public/mountains/{CC}.json`",
        licence="CC0",
        attribution="No",
        share_alike="No",
        attributed="None needed; the mountain page links the Wikidata item",
    ),
    Source(
        key="openstreetmap_via_overpass_enrich_peaks",
        section="content_layers",
        scripts=('pipeline/mountains/enrich_peaks.py',),
        name="OpenStreetMap via Overpass (`pipeline/mountains/enrich_peaks.py`)",
        takes="What stands within 1.5 to 4 km of each shortlisted summit: aerialways and their stations, funicular and rack railways, alpine and wilderness huts, viewpoints, summit restaurants and cafes, parking, towers, observatories and summit crosses, glaciers, cliffs and aretes, national park boundaries, and the paths that carry a `sac_scale` or `via_ferrata_scale` grade. No country sweep for geometry",
        licence="ODbL 1.0",
        attribution="Yes: (c) OpenStreetMap contributors",
        share_alike="Yes: the published rows are selected, scored and rewritten items (a produced work), and each carries its own ODbL credit",
        attributed="LIVE: per-mountain `credit` array in the wire, the Mountains list prints the credit line, Account panel's Data sources screen. The lift claim names OSM as its source on the page",
    ),
    Source(
        key="wikimedia_commons_mountain_photographs",
        section="content_layers",
        scripts=('pipeline/mountains/enrich_peaks.py',),
        name="Wikimedia Commons mountain photographs (`pipeline/mountains/enrich_peaks.py`)",
        takes="Up to six files per mountain, found by Wikidata P18, by Commons category, by name plus `nearcoord`, and by geosearch at a radius scaled to the landform, with LicenseShortName, LicenseUrl and Artist kept per file, capped at two files per photographer",
        licence="Per file: CC BY-SA, CC BY, CC0 or public domain",
        attribution="Yes, per file",
        share_alike="Some files",
        attributed="LIVE: author and licence printed under every photograph on the mountain page, linking the Commons file page",
    ),
    Source(
        key="wikipedia_mountain_articles",
        section="content_layers",
        scripts=('pipeline/mountains/enrich_peaks.py',),
        name="Wikipedia mountain articles (`pipeline/mountains/enrich_peaks.py`)",
        takes="FACTS ONLY: a fixed vocabulary matched against the intro extract (glacier, volcano, lifts, huts, via ferrata, protection, observatory, wildlife) plus the 60-day pageview count. No prose is stored in the wire or shipped, and an article mention of a cable car may only ever produce the weakest lift claim, \"lifts on the mountain\"",
        licence="CC BY-SA 4.0",
        attribution="Facts are not protected; no credit obligation for the extracted attributes",
        share_alike="No, because no text is reused",
        attributed="The mountain page links the article it read, and names Wikipedia as the source of a lift claim that came from it",
    ),
    Source(
        key="wikidata_recurring_events",
        section="content_layers",
        scripts=('pipeline/harvest_events.py',),
        name="Wikidata recurring events (`pipeline/harvest_events.py`)",
        takes="Festival/event entities with coordinates, labels, descriptions, sitelink counts, month of year; shipped as `public/destinfo/{CC}.json`",
        licence="CC0",
        attribution="No",
        share_alike="No",
        attributed="None needed; the panel links each event's Wikipedia article",
    ),
    Source(
        key="open_meteo_forecast_api",
        section="content_layers",
        scripts=('continent-app/src/lib/weather.js',),
        name="Open-Meteo forecast API (live, `continent-app/src/lib/weather.js`)",
        takes="7-day daily forecast fetched client-side when a destination panel is open",
        licence="Free tier for non-commercial use, data CC BY 4.0; commercial use needs the paid API, verify Carta's affiliate status against their definition",
        attribution="Yes, link to Open-Meteo",
        share_alike="No",
        attributed="Explore panel's weather section prints \"Live forecast by Open-Meteo.com\"; add to Data sources screen. RISK: commercial scope. This is now the LAST non-commercial source on a shipped surface, the WorldClim pair having been replaced on 2026-08-30; resolve with an API subscription if Carta monetises",
    ),
    Source(
        key="eurostat_tour_occ_nin3",
        section="content_layers",
        scripts=('pipeline/harvest_tourism_density.py',),
        name="Eurostat tour_occ_nin3 plus GISCO NUTS 3 boundaries (`pipeline/harvest_tourism_density.py`)",
        takes="Regional tourism density (crowding tiers)",
        licence="Eurostat reuse: CC BY 4.0. GISCO boundaries carry the EuroGeographics notice",
        attribution="Yes, both",
        share_alike="No",
        attributed="Crowding tooltip cites Eurostat with year; the EuroGeographics boundary notice is in the Account panel's Data sources screen",
    ),
    Source(
        key="numbeo_point_anchors",
        section="content_layers",
        scripts=('pipeline/gen_mock_data.py',),
        name="Numbeo point anchors (`pipeline/gen_mock_data.py` country tables, oneoff calibrations)",
        takes="Hand-read meal, drink and grocery price anchors used to seed lifestyle costs",
        licence="Proprietary site, no open license; small hand-typed factual excerpts, not a bulk harvest",
        attribution="n/a",
        share_alike="No",
        attributed="In-data source tags only. RISK: verify acceptable use, plan replacement with an open source over time",
    ),
    Source(
        key="wikimedia_commons_file_metadata",
        section="content_layers",
        scripts=("pipeline/harvest_image_licenses.py",),
        name="Wikimedia Commons file metadata, imageinfo extmetadata (`pipeline/harvest_image_licenses.py`)",
        takes="The Title, Author, Source and Licence chain (LicenseShortName, LicenseUrl, Artist, Credit, Restrictions) for every POI thumbnail hosted on upload.wikimedia.org, written to `cache/poi_image_licenses.json`; files whose licence fails the gate (NC, ND, permission-only, no licence metadata) are marked `ok: false`. Row added 2026-10-01 (T078): the script existed without one",
        licence="The metadata is facts about a file and Commons publishes it as CC0 structured data; the photographs it describes keep their own per-file licence (the Wikimedia Commons rows)",
        attribution="No, for the metadata itself. It is what makes the per-file credit on the photographs possible",
        share_alike="No",
        attributed="Not a displayed source. The TASL it harvests is what the POI thumbnail credit (follow-up item 1) renders once that surface exists",
    ),
    Source(
        key="wikidata_place_registers_pageviews",
        section="content_layers",
        scripts=("pipeline/harvest_place_signals.py",),
        name="Wikidata place registers plus Wikipedia pageviews (`pipeline/harvest_place_signals.py`)",
        takes="Members of every place-level register in `pipeline/place_registries.py` (coordinates, population, sitelink count) matched onto the coverage candidates and written to `data/derived/place_registry.json`; sitelink counts and twelve-month pageviews per shortlisted place in `cache/place_signals.json`. Ranking signals for the coverage report only; nothing it writes ships to users. Row added 2026-10-01 (T078): the script existed without one",
        licence="Wikidata CC0; Wikimedia pageview statistics CC0",
        attribution="No",
        share_alike="No",
        attributed="None needed. A designation that does reach the wire carries its own row (UNESCO, in the resolutions section)",
    ),
    # 6. Runtime services called from the browser
    Source(
        key="carto_voyager_basemap",
        section="runtime",
        name="CARTO Voyager basemap (all `src/map/*` components)",
        takes="Vector tiles and map style, no API key",
        licence="CARTO free basemap terms: require © CARTO plus © OpenStreetMap contributors, verify tier limits",
        attribution="Yes",
        share_alike="No",
        attributed="Map attribution control (the style declares its credits, MapLibre renders them)",
    ),
    Source(
        key="osrm_on_fossgis",
        section="runtime",
        name="OSRM on FOSSGIS (`src/lib/routing.js`)",
        takes="Walking and driving routes, ferry-aware",
        licence="Public service usage policy; underlying data ODbL",
        attribution="OSM credit where routes render; FOSSGIS credit is courtesy",
        share_alike="No",
        attributed="Privacy policy names the service; routes draw on the OSM-credited map",
    ),
    Source(
        key="nominatim",
        section="runtime",
        name="Nominatim (`src/lib/geocode.js`, `cityResearch.js`)",
        takes="Address and place search",
        licence="Public service usage policy; data ODbL",
        attribution="Yes, OSM credit",
        share_alike="No",
        attributed="Privacy policy names the service",
    ),
    Source(
        key="overpass_api",
        section="runtime",
        name="Overpass API (live town research, `cityResearch.js`)",
        takes="Live OSM POI queries for off-catalogue towns",
        licence="Shared community endpoint; data ODbL",
        attribution="Yes, OSM credit",
        share_alike="Yes",
        attributed="Chat flow copy names OpenStreetMap; formal credit in the Account panel's Data sources screen",
    ),
    Source(
        key="supabase_google_sign_in",
        section="runtime",
        name="Supabase, Google sign-in, Gemini plan-day function",
        takes="Services, not data sources",
        licence="Service terms",
        attribution="n/a",
        share_alike="n/a",
        attributed="Privacy policy covers them; out of scope for this ledger",
    ),
    # 7. Trails and daytrips content lab
    Source(
        key="openstreetmap_named_landforms_via",
        section="trails_lab",
        scripts=('pipeline/mountains/osm_spine.py',),
        name="OpenStreetMap named landforms via Overpass (`pipeline/mountains/osm_spine.py`)",
        takes="Named peaks, volcanoes, saddles and passes, plus ridges, aretes and cliffs over 500 m and named plateaus, per country, as the mountain layer's second spine",
        licence="ODbL 1.0",
        attribution="Yes: (c) OpenStreetMap contributors",
        share_alike="Yes: the published rows are a derived database and the obligation travels with them",
        attributed="LIVE: the OSM line in every affected mountain row's `credit[]`, plus Account > Data sources",
    ),
    Source(
        key="openstreetmap_route_relations_via",
        section="trails_lab",
        scripts=('pipeline/trails/ingest_osm_routes.py',),
        name="OpenStreetMap route relations via Geofabrik per-country extracts (`pipeline/trails/ingest_osm_routes.py`)",
        takes="Hiking route relations (geometry, sac_scale, network, names) as trip candidates; extracts cached under `data/raw/geofabrik/`",
        licence="ODbL 1.0",
        attribution="Yes: © OpenStreetMap contributors",
        share_alike="Yes: the trips table is a derived database, ODbL obligations apply to any published extract",
        attributed="LIVE: per-trip `attribution_text` in every exported file, plus the Account panel's Data sources screen",
    ),
    Source(
        key="copernicus_glo_30_dem",
        section="trails_lab",
        name="Copernicus GLO-30 DEM",
        takes="30 m elevation samples to give trail geometries their Z and recompute ascent and descent",
        licence="Copernicus DEM instance terms: free use including commercial, credit required, verify current wording",
        attribution="Yes, source credit (Copernicus programme, ESA and Airbus)",
        share_alike="No",
        attributed="LIVE: ascent, descent and the elevation profile ship with published trips. Home footer, Data sources block",
    ),
    Source(
        key="copernicus_glo_30_dem_terrain",
        section="trails_lab",
        scripts=('pipeline/mountains/terrain.py',),
        name="Copernicus GLO-30 DEM, windowed COG reads (`pipeline/mountains/terrain.py`)",
        takes="Per-summit elevation check, prominence by flooding to the key col, isolation, a 30 km viewshed and the gentlest ascent line's steepest stretch. Read as HTTP range requests over the public S3 COGs; no tile is redistributed and none is kept on disk, only the derived numbers in `cache/mountains/terrain.json`",
        licence="Copernicus DEM instance terms: free use including commercial, credit required",
        attribution="Yes, and the wording is prescribed: \"(c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA\"",
        share_alike="No",
        attributed="LIVE: `credit[]` on every mountain row that carries a computed figure, the mountain page's sources block, and Account > Data sources. NOTE: akirmse/mountains' precomputed prominence CSVs are deliberately NOT used; the code is MIT but those data files carry no stated licence, so the numbers are recomputed here",
    ),
    Source(
        key="swisstopo_swisstlm3d_wanderwege",
        section="trails_lab",
        scripts=('pipeline/trails/crosscheck_portals.py',),
        name="swisstopo swissTLM3D-Wanderwege (`pipeline/trails/crosscheck_portals.py`)",
        takes="Official Swiss hiking trail geometries: the GeoPackage resolved via the data.geo.admin.ch STAC API into `data/raw/swisstopo/`, staged to `portal_trails` to cross-validate OSM trips",
        licence="swisstopo open government data terms (free use since 2021, source attribution asked), verify per dataset",
        attribution="Yes: source swisstopo",
        share_alike="No",
        attributed="LIVE as a validation signal: no portal geometry is exported, the agreement check is. Home footer, Data sources block",
    ),
    Source(
        key="ign_bd_topo_layer",
        section="trails_lab",
        scripts=('pipeline/trails/crosscheck_portals.py',),
        name="IGN BD TOPO layer itineraire_autre (`pipeline/trails/crosscheck_portals.py`)",
        takes="Official French route itineraries (geometry plus toponyme) via the Geoplateforme WFS, raw pages in `data/raw/ign_bdtopo/`, staged to `portal_trails` to cross-validate OSM trips",
        licence="Etalab Licence Ouverte 2.0",
        attribution="Yes: IGN, BD TOPO, Etalab 2.0",
        share_alike="No",
        attributed="LIVE as a validation signal: no portal geometry is exported, the agreement check is. Home footer, Data sources block",
    ),
    Source(
        key="kartverket_turrutebasen",
        section="trails_lab",
        scripts=('pipeline/trails/crosscheck_portals.py',),
        name="Kartverket Turrutebasen (`pipeline/trails/crosscheck_portals.py`)",
        takes="Official Norwegian marked trail network: nationwide Fotrute GML ordered through the Geonorge download API into `data/raw/turrutebasen/`, staged to `portal_trails` to cross-validate OSM trips",
        licence="CC BY 4.0",
        attribution="Yes: Kartverket, Turrutebasen",
        share_alike="No",
        attributed="LIVE as a validation signal: no portal geometry is exported, the agreement check is. Home footer, Data sources block",
    ),
    Source(
        key="natural_england_national_trails",
        section="trails_lab",
        scripts=('pipeline/trails/crosscheck_portals.py',),
        name="Natural England National Trails (England) (`pipeline/trails/crosscheck_portals.py`)",
        takes="The sixteen waymarked National Trails of England as paged GeoJSON off their ArcGIS Feature Server, raw pages in `data/raw/natural_england_national_trails/`, staged to `portal_trails` to cross-validate OSM trips inside an England bbox",
        licence="Open Government Licence v3.0 (confirmed on the data.gov.uk dataset page 2026-08-30; commercial reuse permitted)",
        attribution="Yes, wording taken from the dataset page: \"(c) Natural England copyright. Contains Ordnance Survey data (c) Crown copyright and database right\"",
        share_alike="No",
        attributed="LIVE as a validation signal: no portal geometry is exported, the agreement check is. Account > Data sources. NOTE: England only. The Wales Coast Path (Natural Resources Wales) and Scotland's Great Trails (NatureScot) are separate datasets under separate licences and are NOT covered by this row",
    ),
    Source(
        key="self_hosted_valhalla_over",
        section="trails_lab",
        scripts=('pipeline/trails/repair.py',),
        name="Self-hosted Valhalla over the Geofabrik extracts (`tools/trailslab/valhalla`, used by `pipeline/trails/repair.py` and `compose_daytrips.py`)",
        takes="Pedestrian and driving route geometries: spliced into repaired hike geometry and stored as daytrip `trip_stops.leg_geom`",
        licence="Engine is MIT licensed software; the routes it returns are derived from the same ODbL extracts",
        attribution="Yes: © OpenStreetMap contributors, wherever a routed line renders",
        share_alike="Yes: routed geometry inherits the extracts' ODbL obligations",
        attributed="LIVE inside published trips (repaired hike lines, daytrip legs); the OpenStreetMap credit covers it",
    ),
    Source(
        key="transitous_public_plan_api",
        section="trails_lab",
        scripts=('pipeline/trails/compose_daytrips.py', 'tools/reachability/build_reach.py'),
        name="Transitous public plan API, api.transitous.org (`tools/reachability/build_reach.py`, `pipeline/trails/compose_daytrips.py`)",
        takes="Door to door public transport durations and itinerary geometry: reach minutes per destination (contract D) and daytrip transit legs",
        licence="Volunteer-run MOTIS instance aggregating national and regional feeds; the underlying feed licenses apply per country (several are CC BY, ODbL or NLOD, see section 3). Usage is by community goodwill: one request per second, contact address in the User-Agent",
        attribution="Per feed, verify before any surface quotes a timetable",
        share_alike="Per feed",
        attributed="Reach artifacts ship durations only, not timetables, and the reach filter renders them today, so Transitous is credited in the Account panel's Data sources screen. Daytrip legs stay staging until a daytrip is published",
    ),
    Source(
        key="wikivoyage_as_description_signal",
        retired=True,
        section="trails_lab",
        scripts=('pipeline/trails/describe.py',),
        name="Wikivoyage as description signal (`pipeline/trails/describe.py`, RETIRED 2026-08-30)",
        takes="Guide intro for the route name, sent to the model as CONTEXT to judge which supplied facts matter. Never quoted or paraphrased: it is not a mappable source field in the verification pass, and any generated sentence sharing a six word run with the snippet is dropped in code",
        licence="CC BY-SA 4.0",
        attribution="Yes if any of its prose is ever used",
        share_alike="Yes if any of its prose is ever used",
        attributed="Not attributed and deliberately not used as text. Each `description_grounding` row records which guide, if any, was in context. If a future change quotes it, this becomes a CC BY-SA credit plus share-alike obligation on the description. RETIRED: describe.py no longer runs (the three facts its prose knew are wire fields now, see docs/TRAILS.md), so nothing in the app reaches Wikivoyage through this path any more",
    ),
    Source(
        key="eurostat_urban_audit_plus",
        section="trails_lab",
        scripts=('pipeline/trails/market_demand.py',),
        name="Eurostat urban audit `urb_ctour` (CR2001V nights spent per city) plus `tour_occ_ninat` country totals (`pipeline/trails/market_demand.py`)",
        takes="Annual visitor nights per city and per country, the demand basis for citytrip city selection; raw responses under `data/raw/market_demand/`",
        licence="Eurostat reuse policy: CC BY 4.0",
        attribution="Yes: source Eurostat, dataset and year (stored per market_demand row and printed with every citytrip ranking)",
        share_alike="No",
        attributed="Staging only; the demand basis (source plus year) is stored in each citytrip's raw_tags for any later surface",
    ),
    Source(
        key="statistics_norway_statbank_table",
        section="trails_lab",
        scripts=('pipeline/trails/market_demand.py',),
        name="Statistics Norway StatBank table 12898, guest nights per municipality (`pipeline/trails/market_demand.py`, NO fallback)",
        takes="Latest annual guest nights per Norwegian municipality (hotel plus camping, holiday dwelling and hostel categories summed)",
        licence="NLOD 2.0",
        attribution="Yes: source Statistics Norway",
        share_alike="No",
        attributed="Staging only, as above",
    ),
    Source(
        key="statistik_austria_ogd",
        section="trails_lab",
        scripts=('pipeline/trails/market_demand.py',),
        name="Statistik Austria OGD `OGD_touextsai_Tour_UA_1` (`pipeline/trails/market_demand.py`, AT fallback)",
        takes="Monthly nights per Bundesland summed to calendar years; only Wien is stored as a city figure (the one Bundesland that is a city)",
        licence="CC BY 4.0 (data.statistik.gv.at open data terms)",
        attribution="Yes: source Statistik Austria",
        share_alike="No",
        attributed="Staging only, as above",
    ),
    Source(
        key="wikimedia_commons_stop_images",
        section="trails_lab",
        scripts=('pipeline/trails/compose_citytrips.py',),
        name="Wikimedia Commons stop images for citytrips (`pipeline/trails/compose_citytrips.py`)",
        takes="Per-file licence, author and description URL resolved via the Wikimedia API for every citytrip stop image; NC/ND and unresolvable files are dropped before staging",
        licence="Per file: CC0, CC BY, CC BY-SA, public domain and kin; the lab `images` table rejects NC/ND at insert",
        attribution="Yes, per file (author, licence and source URL stored per images row)",
        share_alike="Some files (CC BY-SA)",
        attributed="Staging only; per-file credit ships with any published citytrip surface",
    ),
    Source(
        key="openstreetmap_scenic_features_via",
        section="trails_lab",
        scripts=('pipeline/trails/scenic.py',),
        name="OpenStreetMap scenic features via Overpass (`pipeline/trails/scenic.py`)",
        takes="Named summits, viewpoints, waterfalls, glaciers, gorges, caves, lakes, castles, ruins, monasteries, lighthouses, huts and springs within 600 m of a curated route: name, kind, elevation, position. Swept per 1.5 degree grid cell into the lab's `scenic_pois`, cached under `cache/beaches/scenic_cell_*.json`",
        licence="ODbL 1.0",
        attribution="Yes: (c) OpenStreetMap contributors",
        share_alike="Yes: `scenic_pois` is a derived database. What ships is the per-route highlight list and a density score, both selected produced works, and each carries the OSM credit",
        attributed="LIVE: the highlight list and the rating's scenery term ship in `public/trails/`; every trip's `attribution_text` names OSM, and the Account panel's Data sources screen covers it",
    ),
    Source(
        key="wikimedia_commons_trail_photographs",
        section="trails_lab",
        scripts=('pipeline/trails/trail_images.py',),
        name="Wikimedia Commons trail photographs (`pipeline/trails/trail_images.py`)",
        takes="Up to six files per curated route, found by geosearch at points along the line plus a name-and-nearcoord pass, kept only when the camera stood within 400 m of the route. LicenseShortName, LicenseUrl, Artist, description and the shot coordinate are stored per file",
        licence="Per file: CC0, CC BY, CC BY-SA, public domain and kin; the lab `images` table's CHECK rejects NC and ND at insert and the harvester refuses them again before writing",
        attribution="Yes, per file (author, licence and Commons file page stored and shipped per image)",
        share_alike="Some files (CC BY-SA), on the photograph only, never on the route data",
        attributed="LIVE: hero image on every trail card, the views strip on the trail page prints author and licence per photograph on tap, the strip carries a Commons source line, and each country file lists the Commons credit in `attribution`",
    ),
    Source(
        key="claude_api_or_gemini",
        retired=True,
        section="trails_lab",
        scripts=('pipeline/trails/describe.py',),
        name="Claude API (`--provider claude`) or Gemini API (`--provider gemini`) in `pipeline/trails/describe.py`",
        takes="Not a data source: the model only rewrites the facts block we assemble from staged rows. The stored `description_md` is our own text and inherits the licenses of the facts behind it (ODbL for OSM tags and geometry, portal terms for the confirmation line)",
        licence="Anthropic commercial terms: customer owns the outputs. Google Gemini terms: same for outputs, but on the **free** tier Google may use prompts and responses to improve their products, so only open-data facts go in the prompt",
        attribution="No credit obligation to either vendor",
        share_alike="No",
        attributed="n/a. Trail credits still owe OSM and the national portals as above. NOTE: the EEA paid-services rule that put `plan-day` on a billed Gemini key covers API clients offered to users; describe.py is a local batch script and is not one, so the free tier is in scope for it only while it stays local",
    ),
    # 8. Natural features layer (beaches and mountains) - RETIRED 2026-09-02
    Source(
        key="openstreetmap_via_the_existing",
        section="features_retired",
        scripts=('pipeline/features/build_features.py',),
        name="OpenStreetMap via the existing POI layer (`pipeline/features/build_features.py` over `continent-app/public/activities_full.json`, harvested by OpenTripMap, Overture and Overpass: see section 5)",
        takes="The spine: names, coordinates, kinds and the POI rate for every beach and summit, deduped and re-identified",
        licence="ODbL 1.0",
        attribution="Yes: © OpenStreetMap contributors",
        share_alike="Yes: the wire is an extract of a derived database",
        attributed="Every feature lists `osm` in its `sources` and every country file resolves the citation; the Data sources screen's OpenStreetMap credit covers the app. MISSING: no features surface renders the citation block yet",
    ),
    Source(
        key="osm_protected_areas",
        section="features_retired",
        scripts=('pipeline/harvest_protected_areas_osm.py',),
        name="OSM protected areas (`pipeline/harvest_protected_areas_osm.py` -> `cache/osm_protected_areas.json`, joined at 5 km)",
        takes="The protected area around a feature and the designations read off it: national_park (808 shipped), natural_monument (162), wilderness (52), plus geopark and ramsar by site name",
        licence="ODbL 1.0",
        attribution="Yes: © OpenStreetMap contributors",
        share_alike="Yes, as above",
        attributed="Same `osm` citation. The inferred natura2000 label is scored but deliberately never shipped: it is protect_class read as a habitat site, not a site-code join",
    ),
    Source(
        key="eea_wise_bathing_water_harvest_bathing_water",
        section="features_retired",
        scripts=('pipeline/harvest_bathing_water.py',),
        name="EEA WISE bathing water (`cache/eea_bathing_water.json` via `pipeline/harvest_bathing_water.py`, joined at 2 km)",
        takes="The official class (Excellent, Good, Sufficient, Poor) and the season year, on 2,089 of the 5,472 shipped features. A Poor class caps a beach at tier 3",
        licence="EEA standard re-use policy, effectively CC BY 4.0, verify",
        attribution="Yes",
        share_alike="No",
        attributed="28 country files carry the `eea` citation and the `bathing_year`; the Data sources screen credits the EEA. MISSING at the feature surface until the UI renders the file's `sources` block",
    ),
    Source(
        key="unesco_world_heritage_list",
        section="features_retired",
        scripts=('pipeline/features/rank_features.py',),
        name="UNESCO World Heritage List (`cache/unesco_whc.json`, natural and mixed properties only, joined at 10 km by `pipeline/features/rank_features.py`)",
        takes="The `unesco` designation on 276 shipped features, and the \"UNESCO World Heritage Centre, World Heritage List\" citation in 13 country files",
        licence="UNESCO World Heritage Centre terms of use: reuse with source attribution; parts of the WHC site are CC BY-SA 3.0 IGO, verify. Also verify the cache itself: no harvester for its 1,247 rows exists anywhere in the current tree, so its provenance is asserted by its field shape, not by a script",
        attribution="Yes, verify",
        share_alike="Verify",
        attributed="MISSING. This is the first user-facing use of the cache (`beauty_layer.py` and `rating_layer.py` only ever used it as a hidden scoring signal), and `attribution.js` has no UNESCO entry",
    ),
    Source(
        key="wikimedia_commons_per_file",
        section="features_retired",
        scripts=('pipeline/features/enrich_images.py',),
        name="Wikimedia Commons, per file (`cache/poi_image_licenses.json`, gated in `build_features.py` and `rank_features.py`, resolved by `pipeline/features/enrich_images.py`)",
        takes="2,766 photos, each shipped with url, author, licence and licence_url. NC, ND, permission-only and unresolved-licence files are refused rather than shipped uncredited",
        licence="Per file: CC BY-SA (1,996), CC BY (306), public domain or CC0 (368), plus a handful of GFDL and GPL",
        attribution="Yes, per file",
        share_alike="Yes for the CC BY-SA, GFDL and GPL files",
        attributed="The TASL row ships with every image, which is the data the credit needs. MISSING: nothing renders it yet, and 35 attribution-required files ship with a licence but no author name (a gap in the licence cache, not in the wire)",
    ),
    Source(
        key="wikipedia_enrich_wikidata",
        section="features_retired",
        scripts=('pipeline/features/enrich_wikidata.py', 'pipeline/harvest_pageviews.py'),
        name="Wikipedia (`pipeline/harvest_pageviews.py` counts carried on the POI, article references resolved by `pipeline/features/enrich_wikidata.py`)",
        takes="Pageview counts as half of the fame term, and the article reference (\"en:Es Trenc\") on 2,193 shipped features. No sentence of article text is taken",
        licence="Pageview statistics CC0; article text CC BY-SA 4.0",
        attribution="No for the statistics; a reference is a link, not text",
        share_alike="No, while no prose ships",
        attributed="Home footer credits Wikipedia for the text it does use elsewhere. The day a feature card prints a sentence from an article, this becomes a CC BY-SA credit plus a share-alike obligation on that text",
    ),
    Source(
        key="wikidata",
        section="features_retired",
        scripts=('pipeline/features/enrich_wikidata.py',),
        name="Wikidata (`pipeline/features/enrich_wikidata.py`, plus `cache/wikidata_sitelinks.json` and `cache/poi_wikidata.json` from the significance pass)",
        takes="QIDs, elevation and prominence for summits, sitelink counts as the other half of the fame term",
        licence="CC0",
        attribution="No",
        share_alike="No",
        attributed="None needed",
    ),
    Source(
        key="wikivoyage_listings",
        section="features_retired",
        scripts=('pipeline/harvest_wikivoyage_listings.py',),
        name="Wikivoyage listings (`cache/wikivoyage_listings.json` via `pipeline/harvest_wikivoyage_listings.py`, curation term in `rank_features.py`)",
        takes="Whether an editor listed this feature and how early they listed it: a weight, never the prose",
        licence="CC BY-SA 4.0",
        attribution="Yes if any of its prose is ever used",
        share_alike="Yes if any of its prose is ever used",
        attributed="Section 5's row carries the blurb credit in the footer. Nothing further is owed while only the numeric signal is used",
    ),
    # 9. Composed trips (pipeline/trips)
    Source(
        key="wikivoyage_go_next_graph",
        section="trips",
        scripts=('pipeline/trips/harvest_routes.py',),
        name="Wikivoyage Go next graph (`pipeline/trips/harvest_routes.py` -> `cache/trips/routes.json`)",
        takes="Which places an editor lists as the onward journey from here: the LINK STRUCTURE and the wikilink targets, resolved onto catalogue ids. No prose is stored or shown. Drives which bases a chain may join, and the `editorialRoute` reason code",
        licence="CC BY-SA 4.0",
        attribution="Yes",
        share_alike="Only if prose is ever used; link structure and article class are facts",
        attributed="`attribution` block in `/trips/index.json`, rendered in Account > Data sources",
    ),
    Source(
        key="wikivoyage_itinerary_articles",
        section="trips",
        name="Wikivoyage itinerary articles (same harvest)",
        takes="Article title, URL, article status class and the ordered list of places the article links. Shown as \"It follows the Brenner Pass\" with a link to the article. The TITLE is quoted; nothing else is",
        licence="CC BY-SA 4.0",
        attribution="Yes",
        share_alike="No: a title plus a link is a reference, not a derivative of the text",
        attributed="Named in the trip page's `follows` line, which links straight to the article; plus the index `attribution` block",
    ),
    Source(
        key="wikivoyage_get_in_sections",
        section="trips",
        name="Wikivoyage Get in sections (same harvest)",
        takes="A boolean per mode (does the arrivals section mention a rail station, a ferry, an airport), never the text",
        licence="CC BY-SA 4.0",
        attribution="Yes",
        share_alike="No, the booleans are facts",
        attributed="Index `attribution` block",
    ),
    Source(
        key="wikivoyage_article_status",
        section="trips",
        name="Wikivoyage article status (`{{guidecity}}`, `{{starcity}}`)",
        takes="A quality weight on a base, and the `no_written_guide` warning",
        licence="CC BY-SA 4.0",
        attribution="Yes",
        share_alike="No, the class is a fact",
        attributed="Index `attribution` block",
    ),
    Source(
        key="eurostat_tourist_nights_per",
        section="trips",
        name="Eurostat tourist nights per NUTS3 (`cache/eurostat_nights_nuts3.json`, already harvested for the crowding layer)",
        takes="A demand CHECK on a base: does anyone actually go to this region. Never ranked on alone",
        licence="CC BY 4.0",
        attribution="Yes",
        share_alike="No",
        attributed="Existing Eurostat credit, widened to name the use",
    ),
    Source(
        key="catalogue_master",
        section="trips",
        name="Catalogue master (`app_data/app_data.json`)",
        takes="Ratings, coordinates, categories, climate normals, accommodation anchors, designations, hero photographs and the POI shortlists. Each of those carries its own row in sections 5 and 8",
        licence="Mixed, per row above",
        attribution="Per row above",
        share_alike="Per row above",
        attributed="Per row above",
    ),
    Source(
        key="wikimedia_commons_photographs",
        section="trips",
        name="Wikimedia Commons photographs",
        takes="The hero on every stop and the photograph beside every named sight, spliced to a 500 px thumbnail. The export gate rejects any image URL whose host is not a Wikimedia one, so a file whose licence was never resolved cannot reach the wire",
        licence="Per file",
        attribution="Yes",
        share_alike="Per file",
        attributed="Existing Commons credit; the per-file obligation is follow-up item 1, unchanged",
    ),
    # 9b. Curated trip library (pipeline/journeys), 2026-09-02
    Source(
        key="wikipedia_lead_images_via",
        section="journeys",
        scripts=('pipeline/journeys/build_wire.py',),
        name="Wikipedia lead images via the pageimages API (`pipeline/journeys/build_wire.py` -> `cache/journey_images.json`)",
        takes="One lead-image thumbnail per trip and per trip style, found by the place names the record itself carries (basecamps, sub-region, resolved coordinate place) plus a full-text search fallback; the article title and URL are stored as the credit",
        licence="Images per file (Commons: CC BY-SA, CC BY, CC0, public domain); pageimages metadata CC0",
        attribution="Yes, per file",
        share_alike="Some files",
        attributed="LIVE: \"Photo: {place}, Wikipedia\" printed under the hero on the journey page and in its sources block, linking the article; the library list credits Commons in its footer line. Per-file author and licence resolution is the same follow-up obligation as the destination heroes (follow-up item 1)",
    ),
    # 10. Region spine (pipeline/regions)
    Source(
        key="eurostat_gisco_nuts_2024",
        section="regions",
        scripts=('pipeline/regions/region_sources.py',),
        name="Eurostat GISCO NUTS 2024 (`pipeline/regions/region_sources.py`, fetch_nuts)",
        takes="NUTS 0..3 boundaries at 1:1M with ids and Latin names, the admin spine for 39 countries; region ids shipped on every layer row (`rg.n3`, `rg.n2`) and as `public/region/{N2}.json` pages",
        licence="EC reuse decision 2011/833/EU; Eurostat states compatibility with CC BY 4.0. The boundary geometry additionally requires the EuroGeographics notice, verify the current wording on the Eurostat copyright page before a public launch",
        attribution="Yes: (c) European Union, 1995-2026, and (c) EuroGeographics for the administrative boundaries",
        share_alike="No",
        attributed="LIVE: Eurostat and EuroGeographics rows in Account > Data sources, extended to name the region spine",
    ),
    Source(
        key="eurostat_gisco_lau_2024",
        section="regions",
        name="Eurostat GISCO LAU 2024 (`region_sources.py`, fetch_lau)",
        takes="Local Administrative Units (municipal) boundaries, held in the GeoPackage for future municipality-level assignment; nothing municipal ships in the wire yet",
        licence="Same as NUTS above",
        attribution="Yes, same notice",
        share_alike="No",
        attributed="Covered by the Eurostat and EuroGeographics rows",
    ),
    Source(
        key="ons_open_geography_itl",
        section="regions",
        name="ONS Open Geography ITL 1..3, January 2025 (`region_sources.py`, fetch_itl)",
        takes="International Territorial Level boundaries for the UK (the UK is not in NUTS 2024), 20 m generalised, queried from the ONS ArcGIS services",
        licence="Open Government Licence v3.0; boundaries also carry OS crown copyright",
        attribution="Yes: OGL source statement plus \"Contains OS data (c) Crown copyright and database right 2025\"",
        share_alike="No",
        attributed="LIVE: ONS row in Account > Data sources",
    ),
    Source(
        key="geoboundaries_gbopen",
        section="regions",
        name="geoBoundaries gbOpen (`region_sources.py` + `build_regions.py`, UKR ADM1/ADM2, MDA ADM1, AND ADM1, SMR ADM1, FRO ADM0, MCO ADM0)",
        takes="Admin regions for the countries GISCO leaves at country level. Per-release licences differ: UKR ADM1 is ODbL (OpenStreetMap derived), UKR ADM2 public domain, the rest per the API's licence field; the fetch pins release commits so the licence recorded matches the bytes",
        licence="Mixed per file: ODbL / CC BY / public domain, as the geoBoundaries API reports",
        attribution="Yes: geoBoundaries (Runfola et al. 2020) plus (c) OpenStreetMap contributors for the ODbL files",
        share_alike="ODbL files yes",
        attributed="LIVE: geoBoundaries row in Account > Data sources; OSM row already covers the ODbL obligation",
    ),
    Source(
        key="gmba_mountain_inventory_v2",
        section="regions",
        name="GMBA Mountain Inventory v2.0 standard basic (`region_sources.py`, fetch_gmba)",
        takes="Named mountain range polygons touching Europe with hierarchy (the Dolomites inside the Alps), shipped as `rg.ra` ids and `public/region/GMBA_*.json` pages",
        licence="CC BY 4.0",
        attribution="Yes: citation Snethlage et al. 2022, GMBA Mountain Inventory v2, EarthEnv",
        share_alike="No",
        attributed="LIVE: GMBA row in Account > Data sources",
    ),
    Source(
        key="eea_coastline_for_analysis_regions",
        section="regions",
        name="EEA coastline for analysis v3.0 2017 (`region_sources.py`, fetch_eea_coastline; cut by `coasts.py`)",
        takes="The polygon shoreline, cut into ~2,600 coastal stretches (the \"Costa de la Luz\" unit), shipped as `rg.co` ids, stretch pages and per-region coast_km in the quota model",
        licence="EEA standard re-use policy, effectively CC BY, verify",
        attribution="Yes: (c) European Environment Agency",
        share_alike="No",
        attributed="LIVE: EEA row in Account > Data sources, extended to name the coastline",
    ),
    Source(
        key="eea_biogeographical_regions",
        section="regions",
        name="EEA biogeographical regions (`region_sources.py`, fetch_biogeo)",
        takes="The eleven regions (Alpine, Atlantic, Boreal, ...) as a recommendation axis, shipped as `rg.bg` codes",
        licence="EEA standard re-use policy, verify",
        attribution="Yes",
        share_alike="No",
        attributed="LIVE: EEA row in Account > Data sources",
    ),
    Source(
        key="eea_wise_wfd_river",
        section="regions",
        name="EEA/WISE WFD river basin districts 2022 (`region_sources.py`, fetch_rbd)",
        takes="River basin district polygons for the lake layer's basin ids (`rg.ba`)",
        licence="EEA standard re-use policy, verify",
        attribution="Yes",
        share_alike="No",
        attributed="LIVE: EEA row in Account > Data sources",
    ),
    # Resolutions, 2026-08-26 (dossier spec section 11)
    Source(
        key="nasa_power_climatology_api",
        section="resolutions",
        scripts=('pipeline/harvest_climate_power.py',),
        name="NASA POWER climatology API (`pipeline/harvest_climate_power.py`)",
        takes="12-month climate normals (T2M, T2M_RANGE, precipitation, solar) per destination, 2001-2020, lapse-corrected to destination elevation",
        licence="US Government work: no use restriction; NASA asks for an acknowledgement",
        attribution="No (given anyway)",
        share_alike="No",
        attributed="Account > Data sources; dossier `credits[]` and the PDF credits page wherever normals print",
    ),
    Source(
        key="nasa_power_climatology_api_season",
        section="resolutions",
        scripts=('pipeline/mountains/season.py',),
        name="NASA POWER climatology API (`pipeline/mountains/season.py`)",
        takes="12-month normals (T2M, PRECTOTCORR) per 0.5 degree cell, lapse-corrected to each summit's own elevation, turned into a snow probability and a best-months array",
        licence="US Government work: no use restriction; NASA asks for an acknowledgement",
        attribution="No (given anyway)",
        share_alike="LIVE: `credit[]` on every mountain row carrying a season, and Account > Data sources. ERA5-Land (Copernicus CDS) is the source brief 05 names and `--source era5` is written for it; it needs a CDS key, which this repo does not have, so POWER is the shipped default and `season.src` records which one answered",
        attributed="No",
    ),
    Source(
        key="open_meteo_elevation_api",
        section="resolutions",
        name="Open-Meteo elevation API (Copernicus DEM GLO-90, same harvester)",
        takes="One ground elevation per destination for the lapse correction",
        licence="CC BY 4.0 (Copernicus DEM)",
        attribution="Covered by the existing Copernicus credit",
        share_alike="No",
        attributed="Copernicus GLO row above",
    ),
    Source(
        key="unesco_world_heritage_centre",
        section="resolutions",
        scripts=('pipeline/harvest_unesco_whc.py',),
        name="UNESCO World Heritage Centre list XML (`pipeline/harvest_unesco_whc.py` -> `cache/unesco_whc.json`)",
        takes="Site name, category, region, per-country coordinates for inscribed properties",
        licence="UNESCO WHC terms of use (verify wording on the syndication page)",
        attribution="Yes",
        share_alike="No",
        attributed="`attribution.js` entry added; dossier `credits[]` where a designation is shown",
    ),
    # 11. The cycling layer (pipeline/cycling), 2026-08-30
    Source(
        key="openstreetmap_relations_via_geofabrik",
        section="cycling",
        scripts=('pipeline/cycling/harvest_cycling.py',),
        name="OpenStreetMap `route=bicycle` relations, via Geofabrik extracts (`pipeline/cycling/harvest_cycling.py`)",
        takes="Route geometry, `network`/`ref`/`operator`, and the per-way `highway`/`surface`/`smoothness`/`tracktype`/`maxspeed`/`cycleway` tags behind every surface and safety figure (`way_spans`)",
        licence="ODbL 1.0",
        attribution="Yes",
        share_alike="Yes, on the extract",
        attributed="LIVE: OSM row in Account > Data sources; `osm.attribution` inside every route file; inside the `<copyright>` and `<desc>` of every GPX the app writes",
    ),
    Source(
        key="openstreetmap_node_network",
        section="cycling",
        name="OpenStreetMap node network (same harvester)",
        takes="`rcn_ref` junctions and the connection relations between them, for the NL and BE planning graph (`cycle_nodes`, `cycle_node_edges`)",
        licence="ODbL 1.0",
        attribution="Yes",
        share_alike="Yes",
        attributed="Covered by the OSM row",
    ),
    Source(
        key="openstreetmap_services",
        section="cycling",
        name="OpenStreetMap services (`enrich_cycling.py`, same extracts)",
        takes="Sleeping, campsite, drinking water, bicycle shop, bicycle repair, grocery and railway station objects within 2 km of a route, clustered onto named places into service towns",
        licence="ODbL 1.0",
        attribution="Yes",
        share_alike="Yes",
        attributed="Covered by the OSM row; service town names print on every stage",
    ),
    Source(
        key="openstreetmap_land_cover",
        section="cycling",
        scripts=('pipeline/cycling/landcover.py',),
        name="**OpenStreetMap land cover** (`pipeline/cycling/landcover.py`, same extracts)",
        takes="`landuse` / `natural` / `waterway` polygons within 500 m of a cycle route, classified wild / water / farm / built, for the scenic score's forest-and-water component. Stored simplified to 50 m in EPSG:3035",
        licence="ODbL 1.0",
        attribution="Yes",
        share_alike="Yes",
        attributed="Covered by the OSM row. **This replaces the ESA WorldCover the brief names**, which is cleared (CC BY 4.0) but is roughly 100 GB at 10 m for Europe; OSM is already on disk, is vector rather than raster, and distinguishes `landuse=forest` from `natural=wood` and managed meadow from wild grassland, which is the distinction the score needs",
    ),
    Source(
        key="eurovelo_gpx_tracks",
        section="cycling",
        name="**EuroVelo GPX tracks** (`cycle_sources.eurovelo_gpx`, `en.eurovelo.com/route/get-gpx/{id}?developed=1`)",
        takes="The 17 routes' developed sections, used as ground truth to validate the OSM geometry and to produce an agreement percentage per route. Never published as geometry in their own right",
        licence="**ODbL 1.0 since 2024-10-09**",
        attribution="Yes, and the wording is **prescribed**: \"Contains information from EuroVelo GPX tracks downloaded from www.EuroVelo.com on [DATE], which is made available here under the Open Database License (ODbL).\" A paraphrase is not compliance",
        share_alike="Yes",
        attributed="LIVE: `attribution.js` EuroVelo row; the sentence with the real download date is written into `public/cycling/index.json` by `export_cycling.eurovelo_credit_line()`",
    ),
    Source(
        key="sustrans_walk_wheel_cycle",
        section="cycling",
        name="**Sustrans / Walk Wheel Cycle Trust National Cycle Network (Public)** (`services5.arcgis.com/.../National_Cycle_Network_Public/FeatureServer/0`)",
        takes="NCN alignments for GB and Northern Ireland, used only to measure agreement with the OSM line. Confirmed on the Hub's own dataset description, which links the OGL text",
        licence="Open Government Licence v3.0. Also contains Ordnance Survey data, (c) Crown copyright and database right",
        attribution="Yes: OGL source statement plus the OS notice",
        share_alike="No",
        attributed="LIVE: Sustrans row in `attribution.js` and in the cycling wire's attribution block",
    ),
    Source(
        key="spatial_hub_scotland_cycling",
        section="cycling",
        name="Spatial Hub Scotland \"Cycling Network\" (`geo.spatialhub.scot/geoserver/sh_cycnt/wfs`)",
        takes="**Nothing today.** Published under OGL v3 but the WFS answers an anonymous `GetFeature` with 403 Forbidden",
        licence="Open Government Licence v3.0",
        attribution="Yes, if ever used",
        share_alike="No",
        attributed="n/a. Recorded as `status: gated` in `cycle_sources.PORTALS` with the reason and the contact (spatialhub@improvementservice.org.uk). Scotland's ground truth comes from the Sustrans dataset, which now carries the Scottish NCN",
    ),
    Source(
        key="base_nationale_des_amenagements",
        section="cycling",
        name="Base Nationale des Amenagements Cyclables (`data.gouv.fr`, newest GeoJSON resolved from the dataset API)",
        takes="The French cycling network, as a SCHEMA REFERENCE ONLY",
        licence="Licence Ouverte 2.0 (Etalab)",
        attribution="Yes",
        share_alike="No",
        attributed="**Deliberately excluded from the agreement measurement.** The dataset describes itself as \"all digitized bicycle facilities in metropolitan France processed through OpenStreetMap\", so it is an OSM export in a national schema. Measuring our OSM lines against it would report a high number meaning only that both sides read the same database. The resource id is never pinned: data.gouv.fr mints a new one on every monthly republish",
    ),
    Source(
        key="toerisme_vlaanderen_cycling_node",
        section="cycling",
        name="Toerisme Vlaanderen cycling node network v2",
        takes="Flemish node network, cross-check only",
        licence="Flemish open data licence, verify current wording",
        attribution="Yes",
        share_alike="No",
        attributed="As above",
    ),
    Source(
        key="opendata_swiss_schweizmobil_veloland",
        section="cycling",
        name="**opendata.swiss / SchweizMobil Veloland** (`ch.astra.veloland`, resolved through the geo.admin STAC API)",
        takes="309 official Swiss national and regional cycle routes (the `Route.shp` member of `veloland_2056.shp.zip`), used only to measure agreement with the OSM line",
        licence="opendata.swiss terms: free reuse with the source named",
        attribution="Yes",
        share_alike="No",
        attributed="LIVE: cycling wire attribution block. **opendata.swiss answers an automated GET with 403**, so discovery goes through the federal STAC collection, which is the published machine-readable index and is what the trails layer already uses for swisstopo",
    ),
    Source(
        key="gip_at",
        section="cycling",
        name="GIP.at (Austria)",
        takes="**Nothing.** Registration gated",
        licence="Unconfirmed",
        attribution="n/a",
        share_alike="n/a",
        attributed="Recorded as `status: gated`; Austria uses OSM alone",
    ),
    Source(
        key="eea_natura_2000",
        section="cycling",
        name="**EEA Natura 2000** (`bio.discomap.eea.europa.eu/.../N2KBackbone/MapServer/1`)",
        takes="Protected site polygons, simplified server-side to about 100 m, for the scenic score's protection component",
        licence="EEA standard re-use policy (effectively CC BY 4.0), verify",
        attribution="Yes: (c) European Environment Agency",
        share_alike="No",
        attributed="LIVE: EEA row in Account > Data sources, extended to name the protected sites",
    ),
    Source(
        key="eea_emerald_network",
        section="cycling",
        name="**EEA Emerald Network** (`.../ProtectedSites/EmeraldSites/MapServer/3`)",
        takes="The Bern Convention twin of Natura 2000, which is what gives the Cairngorms, the Norwegian fjords and the Swiss passes a protection reading at all",
        licence="EEA standard re-use policy, verify",
        attribution="Yes",
        share_alike="No",
        attributed="Covered by the EEA row",
    ),
    Source(
        key="copernicus_glo_30_dem_elevation",
        section="cycling",
        scripts=('pipeline/trails/elevation.py',),
        name="Copernicus GLO-30 DEM (via `pipeline/trails/elevation.py`)",
        takes="Elevation profile, smoothed ascent and descent per route and per stage",
        licence="Copernicus DEM terms, free use with credit",
        attribution="Yes",
        share_alike="No",
        attributed="LIVE: Copernicus row in Account > Data sources",
    ),
    Source(
        key="eea_coastline_for_analysis_cycling",
        section="cycling",
        name="EEA coastline for analysis v3.0 (mirrored from `cache/regions/regions.gpkg`)",
        takes="Distance to the sea, for the scenic score's coast component",
        licence="EEA standard re-use policy",
        attribution="Yes",
        share_alike="No",
        attributed="Covered by the existing EEA coastline row in section 10",
    ),
    Source(
        key="nasa_power_2001_2020",
        section="cycling",
        scripts=('pipeline/harvest_climate_power.py',),
        name="NASA POWER 2001-2020 normals (`cache/climate.json`, harvested by `pipeline/harvest_climate_power.py`)",
        takes="The months a tour can be ridden, and the best of them",
        licence="US Government work, no use restriction; NASA asks for an acknowledgement",
        attribution="No (given anyway)",
        share_alike="No",
        attributed="LIVE: NASA POWER row in Account > Data sources. **The brief names ERA5-Land**; brief 04 retired WorldClim over its non-commercial licence and landed on POWER, which is already cached and already cleared, so a third climate source is not added for one array of months",
    ),
    Source(
        key="wikimedia_commons_and_geograph",
        section="cycling",
        scripts=('pipeline/cycling/cycle_images.py',),
        name="Wikimedia Commons and Geograph photographs (`pipeline/cycling/cycle_images.py`)",
        takes="Up to six photographs per route, camera measured within 400 m of the real line",
        licence="Per file (Commons); CC BY-SA 2.0 (Geograph)",
        attribution="Yes, per file",
        share_alike="Per file",
        attributed="LIVE: Commons and Geograph rows in Account > Data sources; author and licence stored on every image row and printed under every photograph. The `images` table's NC/ND CHECK constraint rejects a non-commercial file at insert time, so one cannot reach the wire",
    ),
    Source(
        key="operator_bike_on_train",
        section="cycling",
        scripts=('pipeline/cycling/seed_bike_rail.py',),
        name="Operator bike-on-train policies (`pipeline/cycling/seed_bike_rail.py`)",
        takes="69 hand-curated rows: reservation rule, seasonal restriction, folded-bike rule, a fee code and the operator's own policy URL",
        licence="Facts about a published policy, not a dataset. No licence attaches to \"reservation required\"",
        attribution="No",
        share_alike="No",
        attributed="The operator's policy URL ships on the row and the page links it. `--verify` re-fetches every URL; the output states plainly that a live link is not a current policy",
    ),
    # 14. Self-hosted image copies (R2, cdn.carta-europetravel.com), 2026-09-27
    Source(
        key="carta_image_copies_on",
        section="image_copies",
        scripts=('pipeline/photos/derive.py',),
        name="Carta image copies on R2 (`pipeline/photos/derive.py`, served from `cdn.carta-europetravel.com/img/`; manifest `img/manifest/<layer>.json`)",
        takes="Resized copies (AVIF 320/640/1280, WebP 320/640) of the Commons and Geograph files already ledgered in sections 5, 7 and 11. No new source: the originals' rows still govern",
        licence="Per file, unchanged from the original: CC BY-SA, CC BY, CC0, public domain, GFDL; NC, ND and unlicensed files are refused before storage (`derive.storable`)",
        attribution="Yes, per file, exactly as the original",
        share_alike="Per file (the copy only)",
        attributed="The gate: `credit.owes_credit` refuses a file owing a name it lacks before any object is written, and the manifest carries `[licence, author]` per entry plus the Commons and Geograph page templates, so the credit travels with the pixels and is never looked up from Wikimedia at render time. `src/lib/imageCredit.js` `creditFromManifest` turns a CDN URL plus the manifest into author, licence, licence link and page. Proven offline by `pipeline/photos/verify_attribution_cdn.py`; live check pending (Execution/P3/_OPEN-hetzner.md step 28). Account > Data sources carries a \"Carta image copies\" row. Not live until T052 serves the ladder",
    ),
    Source(
        key="waymarked_trails_route_list",
        section="trails_lab",
        scripts=('pipeline/trails/waymarked.py',),
        name="Waymarked Trails route list (`pipeline/trails/waymarked.py`, `/api/v1/list/by_area`, INT and NAT hiking routes)",
        takes="Only the list of international and national hiking routes the service knows over the catalogue: relation ids, names, refs and network groups, stored in `data/trails/waymarked_routes.json`. No geometry, no tiles, no rendered map is kept. It is the fifth evidence source of the famous-trail registry (T113), so a signed national trail nobody wrote an article about can still become a registry row",
        licence="ODbL 1.0 (OpenStreetMap data, served by waymarkedtrails.org; the service needs no key)",
        attribution="Yes: (c) OpenStreetMap contributors, already carried by every OSM row above",
        share_alike="Only the ids, names, refs and groups are kept, so no database extract is redistributed; if geometry were ever stored from it the ODbL share-alike would attach",
        attributed="Internal evidence for the registry only; nothing from this list is shown to a traveller as such. The OSM credit in Account > Data sources covers the underlying data. Be polite to the service: the harvest asks 785 boxes for the whole of Europe and keeps a checkpoint (T113 report)",
    ),
)

# Storable-copy verdict per ledger row (T010's classification, written down
# by T310). Question asked: may Carta keep its own copy of this data and
# serve it (R2, the wire, the app bundle), not merely link to it? The
# vocabulary is closed (see STORABLE_VOCAB); validate() enforces it.
#   Yes                                no condition beyond good manners
#   Yes, with credit                   attribution travels with the copy
#   Yes, with credit and share-alike   ODbL or CC BY-SA: credit plus the
#                                      share-alike duty on the derived work
#   Yes, per file, with credit         the licence is per file; credit and the
#                                      file's own terms travel with each copy
#   No                                 non-commercial, restricted or no right
#                                      to redistribute: do not store to serve
#   Verify                             the licence cell itself says verify, or
#                                      terms are agreement-bound: a human
#                                      confirms before any stored copy ships
#   n/a                                not a data source (a service, a vendor
#                                      term or a fact about a policy)
#   Per row above                      the catalogue row inherits its parts
STORABLE_VOCAB = (
    "Yes", "Yes, with credit", "Yes, with credit and share-alike",
    "Yes, per file, with credit", "No", "Verify", "n/a", "Per row above",
)
STORABLE: dict[str, str] = {
    'ryanair_farefinder_api': 'Yes',
    'wizz_air_timetable_api': 'Yes',
    'vueling_apiw_endpoints': 'Yes',
    'volotea_getminprice_api': 'Yes',
    'exchangerate_api_open_endpoint': 'Verify',
    'ryanair_timetable_api': 'Yes',
    'travelpayouts_aviasales': 'Verify',
    'hostelworld_partner_api': 'Verify',
    'liteapi_nuitee': 'Verify',
    'ferryhopper_trips_widget': 'No',
    'omio': 'n/a',
    'flix_prices': 'n/a',
    'public_transport_earth_index': 'Verify',
    'gtfs_de_delfi_plus': 'Yes, with credit and share-alike',
    'transport_data_gouv_fr': 'Yes, with credit and share-alike',
    'mobility_data_austria': 'Verify',
    'belgian_operators_sncb_de': 'Yes, with credit',
    'danish_nap_plus_rejseplanen': 'Verify',
    'traficom_finap_plus_digitraffic': 'Yes, with credit',
    'ndov_loket_ovapi': 'Yes',
    'entur': 'Yes, with credit',
    'trafiklab_samtrafiken': 'Verify',
    'opentransportdata_swiss': 'Verify',
    'renfe_open_data': 'Verify',
    'sncf_gtfs_rt_plus': 'Yes, with credit and share-alike',
    'french_nap_cross_border': 'Yes, with credit and share-alike',
    'era_registers': 'Verify',
    'opensky_network': 'No',
    'eurocontrol_statfor': 'Verify',
    'eurocontrol_ddr_adrr': 'No',
    'nordic_ferry_feeds_via': 'Yes, with credit',
    'flix_eu_gtfs_feed': 'Verify',
    'greek_nap': 'Verify',
    'kaggle_renfe_archives': 'Verify',
    'github_lcc_price_archives': 'Verify',
    'sncf_tgv_max_availability': 'Yes',
    'nager_date': 'Yes',
    'openholidays_api': 'Verify',
    'inside_airbnb': 'Yes, with credit',
    'eea_wise_bathing_water': 'Yes, with credit',
    'worldclim_2_1': 'No',
    'geonames_cities500': 'Yes, with credit',
    'wikipedia': 'Yes, with credit and share-alike',
    'wikimedia_commons': 'Yes, per file, with credit',
    'bayerische_vermessungsverwaltung_wanderwege': 'Yes, with credit',
    'wikidata_sitelink_counts_live': 'Yes',
    'wikivoyage': 'Yes, with credit and share-alike',
    'opentripmap': 'Verify',
    'overture_maps_places': 'Yes',
    'openstreetmap_via_overpass': 'Yes, with credit and share-alike',
    'openstreetmap_via_overpass_harvest_parking': 'Yes, with credit and share-alike',
    'openstreetmap_via_geofabrik_country': 'Yes, with credit and share-alike',
    'openstreetmap_via_geofabrik_country_enrich_beaches': 'Yes, with credit and share-alike',
    'wikidata_beaches': 'Yes',
    'wikimedia_commons_beach_photographs': 'Yes, per file, with credit',
    'wikipedia_beach_articles': 'Yes, with credit and share-alike',
    'eea_wise_bathing_water_enrich_beaches': 'Yes, with credit',
    'eea_wise_bathing_water_eea_spine': 'Yes, with credit',
    'natura_2000_and_the': 'Yes, with credit',
    'eea_coastline_for_analysis': 'Yes, with credit',
    'environment_agency_and_natural': 'Yes, with credit',
    'wikidata_water_bodies': 'Yes',
    'openstreetmap_named_water_bodies': 'Yes, with credit and share-alike',
    'openstreetmap_via_overpass_enrich_lakes': 'Yes, with credit and share-alike',
    'wikimedia_commons_lake_photographs': 'Yes, per file, with credit',
    'wikipedia_lake_articles': 'Yes, with credit and share-alike',
    'eea_wise_bathing_water_enrich_lakes': 'Yes, with credit',
    'chelsa_v2_1_lake': 'Yes, with credit',
    'geograph_britain_and_ireland': 'Yes, per file, with credit',
    'mapillary': 'Yes, per file, with credit',
    'wikidata_mountains': 'Yes',
    'openstreetmap_via_overpass_enrich_peaks': 'Yes, with credit and share-alike',
    'wikimedia_commons_mountain_photographs': 'Yes, per file, with credit',
    'wikipedia_mountain_articles': 'Yes, with credit and share-alike',
    'wikidata_recurring_events': 'Yes',
    'open_meteo_forecast_api': 'No',
    'eurostat_tour_occ_nin3': 'Yes, with credit',
    'numbeo_point_anchors': 'No',
    'wikimedia_commons_file_metadata': 'Yes',
    'wikidata_place_registers_pageviews': 'Yes',
    'carto_voyager_basemap': 'n/a',
    'osrm_on_fossgis': 'Yes, with credit and share-alike',
    'nominatim': 'Yes, with credit and share-alike',
    'overpass_api': 'Yes, with credit and share-alike',
    'supabase_google_sign_in': 'n/a',
    'openstreetmap_named_landforms_via': 'Yes, with credit and share-alike',
    'openstreetmap_route_relations_via': 'Yes, with credit and share-alike',
    'copernicus_glo_30_dem': 'Yes, with credit',
    'copernicus_glo_30_dem_terrain': 'Yes, with credit',
    'swisstopo_swisstlm3d_wanderwege': 'Yes, with credit',
    'ign_bd_topo_layer': 'Yes, with credit',
    'kartverket_turrutebasen': 'Yes, with credit',
    'natural_england_national_trails': 'Yes, with credit',
    'self_hosted_valhalla_over': 'Yes, with credit and share-alike',
    'transitous_public_plan_api': 'Verify',
    'wikivoyage_as_description_signal': 'Yes, with credit and share-alike',
    'eurostat_urban_audit_plus': 'Yes, with credit',
    'statistics_norway_statbank_table': 'Yes, with credit',
    'statistik_austria_ogd': 'Yes, with credit',
    'wikimedia_commons_stop_images': 'Yes, per file, with credit',
    'openstreetmap_scenic_features_via': 'Yes, with credit and share-alike',
    'wikimedia_commons_trail_photographs': 'Yes, per file, with credit',
    'claude_api_or_gemini': 'n/a',
    'openstreetmap_via_the_existing': 'Yes, with credit and share-alike',
    'osm_protected_areas': 'Yes, with credit and share-alike',
    'eea_wise_bathing_water_harvest_bathing_water': 'Yes, with credit',
    'unesco_world_heritage_list': 'Verify',
    'wikimedia_commons_per_file': 'Yes, per file, with credit',
    'wikipedia_enrich_wikidata': 'Yes, with credit and share-alike',
    'wikidata': 'Yes',
    'wikivoyage_listings': 'Yes, with credit and share-alike',
    'wikivoyage_go_next_graph': 'Yes, with credit and share-alike',
    'wikivoyage_itinerary_articles': 'Yes, with credit and share-alike',
    'wikivoyage_get_in_sections': 'Yes, with credit and share-alike',
    'wikivoyage_article_status': 'Yes, with credit and share-alike',
    'eurostat_tourist_nights_per': 'Yes, with credit',
    'catalogue_master': 'Per row above',
    'wikimedia_commons_photographs': 'Yes, per file, with credit',
    'wikipedia_lead_images_via': 'Yes, per file, with credit',
    'eurostat_gisco_nuts_2024': 'Yes, with credit',
    'eurostat_gisco_lau_2024': 'Yes, with credit',
    'ons_open_geography_itl': 'Yes, with credit',
    'geoboundaries_gbopen': 'Yes, per file, with credit',
    'gmba_mountain_inventory_v2': 'Yes, with credit',
    'eea_coastline_for_analysis_regions': 'Yes, with credit',
    'eea_biogeographical_regions': 'Yes, with credit',
    'eea_wise_wfd_river': 'Yes, with credit',
    'nasa_power_climatology_api': 'Yes',
    'nasa_power_climatology_api_season': 'Yes',
    'open_meteo_elevation_api': 'Yes, with credit',
    'unesco_world_heritage_centre': 'Verify',
    'openstreetmap_relations_via_geofabrik': 'Yes, with credit and share-alike',
    'openstreetmap_node_network': 'Yes, with credit and share-alike',
    'openstreetmap_services': 'Yes, with credit and share-alike',
    'openstreetmap_land_cover': 'Yes, with credit and share-alike',
    'eurovelo_gpx_tracks': 'Yes, with credit and share-alike',
    'sustrans_walk_wheel_cycle': 'Yes, with credit',
    'spatial_hub_scotland_cycling': 'Yes, with credit',
    'base_nationale_des_amenagements': 'Yes, with credit',
    'toerisme_vlaanderen_cycling_node': 'Verify',
    'opendata_swiss_schweizmobil_veloland': 'Yes, with credit',
    'gip_at': 'n/a',
    'eea_natura_2000': 'Yes, with credit',
    'eea_emerald_network': 'Yes, with credit',
    'copernicus_glo_30_dem_elevation': 'Yes, with credit',
    'eea_coastline_for_analysis_cycling': 'Yes, with credit',
    'nasa_power_2001_2020': 'Yes',
    'wikimedia_commons_and_geograph': 'Yes, per file, with credit',
    'operator_bike_on_train': 'n/a',
    'carta_image_copies_on': 'Yes, per file, with credit',
    'waymarked_trails_route_list': 'Yes, with credit and share-alike',
}


# User-facing credits (T078-b). Each entry of continent-app/src/data/attribution.js
# (the Account > Data sources screen) is named here with the ledger row that
# obliges it. `python -m src.ingestion.core.ledger --check-app <path>` fails
# when the app file has an entry no row obliges, when a row here has no entry
# in the app file, or when a key is not a ledger row. The credit wording stays
# in the app file (it is English licence text, not generated prose).
APP_CREDITS: dict[str, tuple] = {
    "OpenStreetMap": ("openstreetmap_via_geofabrik_country",),
    "CARTO": ("carto_voyager_basemap",),
    "Wikipedia": ("wikipedia",),
    "Wikivoyage": ("wikivoyage",),
    "Wikimedia Commons": ("wikimedia_commons",),
    "Geograph Britain and Ireland": ("geograph_britain_and_ireland",),
    "Carta image copies": ("carta_image_copies_on",),
    "Mapillary": ("mapillary",),
    "GeoNames": ("geonames_cities500",),
    "Inside Airbnb": ("inside_airbnb",),
    "Eurostat": ("eurostat_tour_occ_nin3",),
    "EuroGeographics": ("eurostat_gisco_nuts_2024",),
    "European Environment Agency": ("eea_wise_bathing_water",),
    "ONS Open Geography": ("ons_open_geography_itl",),
    "GMBA Mountain Inventory": ("gmba_mountain_inventory_v2",),
    "geoBoundaries": ("geoboundaries_gbopen",),
    "NASA POWER": ("nasa_power_climatology_api",),
    "UNESCO World Heritage Centre": ("unesco_world_heritage_centre",),
    "CHELSA": ("chelsa_v2_1_lake",),
    "OpenTripMap": ("opentripmap",),
    "Overture Maps": ("overture_maps_places",),
    "EuroVelo": ("eurovelo_gpx_tracks",),
    "Walk Wheel Cycle Trust (Sustrans)": ("sustrans_walk_wheel_cycle",),
    "Spatial Hub Scotland (Improvement Service)": ("spatial_hub_scotland_cycling",),
    "SchweizMobil and the Federal Roads Office (ASTRA)": ("opendata_swiss_schweizmobil_veloland",),
    "European Environment Agency, protected sites": ("eea_natura_2000",),
    "Copernicus GLO-30": ("copernicus_glo_30_dem",),
    "swisstopo": ("swisstopo_swisstlm3d_wanderwege",),
    "IGN": ("ign_bd_topo_layer",),
    "Kartverket": ("kartverket_turrutebasen",),
    "Natural England": ("natural_england_national_trails",),
    "Transitous": ("transitous_public_plan_api",),
    "SNCB / NMBS": ("belgian_operators_sncb_de",),
    "De Lijn": ("belgian_operators_sncb_de",),
    "STIB / MIVB": ("belgian_operators_sncb_de",),
    "TEC": ("belgian_operators_sncb_de",),
    "GTFS.de / DELFI": ("gtfs_de_delfi_plus",),
    "Entur": ("entur",),
    "Digitraffic": ("traficom_finap_plus_digitraffic",),
    "opentransportdata.swiss": ("opentransportdata_swiss",),
    "transport.data.gouv.fr": ("transport_data_gouv_fr",),
    "Open-Meteo": ("open_meteo_forecast_api",),
    "Exchange Rate API": ("exchangerate_api_open_endpoint",),
}

WIRE_REVIEW = (
    WireReview(
        wire="`public/beaches/*.json`",
        ships="Named points (lat/lon), scores, facets, photos",
        verdict="Produced work. Selected, scored, tiered and rewritten rows; a point plus our own measurements is not a reconstructable slice of OSM",
        travels="OSM credited in each file's credit block and the Data sources screen; per-photo TASL rows in-band",
    ),
    WireReview(
        wire="`public/lakes/*.json`",
        ships="Named points, swim verdicts, season models, photos",
        verdict="Produced work, same reasoning",
        travels="Same",
    ),
    WireReview(
        wire="`public/mountains/*.json`",
        ships="Named points, prominence/viewshed measurements, photos",
        verdict="Produced work, same reasoning",
        travels="Same; Copernicus DEM attribution in the ledger and `attribution.js`",
    ),
    WireReview(
        wire="`public/trails/*.json` + `public/trails/trip/*.json` + GPX/KML exports",
        ships="Full route geometry (simplified MultiLineString), per-row `license` and `attribution_text`",
        verdict="**Database extract.** GPX is the OSMF guideline's paradigm case",
        travels="ODbL terms travel in-band: every row carries `license` and `attribution_text`, and the GPX/KML writers put the credit inside the exported file",
    ),
    WireReview(
        wire="`public/cycling/*.json` + `route/*.json` + GPX",
        ships="Route geometry in the `osm` block; scores, stage plans, tours in the `carta` block",
        verdict="**Extract for the `osm` block, produced work for the `carta` block**, kept in separate structures for exactly this reason (brief 07 section 7)",
        travels="`osm.attribution` per route, GPX `<copyright>` + credit line; tours carry route ids, and the routes carry the ODbL terms",
    ),
    WireReview(
        wire="`public/trips/*`",
        ships="Composed itineraries over catalogue cities (points)",
        verdict="Produced work. Our own composition; city coordinates are not a reconstructable database",
        travels="Sources credited per file `attribution` block",
    ),
    WireReview(
        wire="`public/region/*.json`, `coverage.json`",
        ships="Region names/ids, counts, quotas",
        verdict="Produced work over GISCO/ITL/GMBA/geoBoundaries inputs, each with its own attribution row",
        travels="Data sources screen",
    ),
    WireReview(
        wire="`public/app_data.json` (POI slice)",
        ships="POI names, coordinates and kinds harvested from OSM/Overture/OpenTripMap, selected and re-scored",
        verdict="**Treated as an extract.** Selection and scoring are ours, but names + coordinates at this density could substitute for the source query, which is the honest test",
        travels="OSM and Overture credited on the Data sources screen; the slice ships under the same ODbL terms it arrived under, and this row is the standing record of that",
    ),
    WireReview(
        wire="`public/features/*`",
        ships="retired 2026-09-02",
        verdict="n/a",
        travels="obligations ended with publication (section 8)",
    ),
)
