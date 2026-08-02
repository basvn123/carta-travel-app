"""OpenSky's bulk scientific datasets (opensky-network.org/data/scientific),
a public S3 bucket (s3.opensky-network.org/data-samples), no auth or API
client needed -- confirmed live 2026-07-31 via anonymous ListObjectsV2.

The page lists eleven datasets; most are academic side projects unrelated to
fare estimation (raw physical-layer RF samples, aircraft localization
research, in-flight emergency squawks, climb-performance modeling,
transponder capability surveys, an alternate surveillance protocol study, a
takeoff-weight challenge) and are deliberately not collected here. Two are
directly useful and are what this collector pulls:

  - trino-tables/flights/: the "Complete Trino Tables Snapshot (March 2026)",
    restricted to the `flights` table -- one row per flight with estimated
    departure/arrival airport and time, exactly the "actual flight
    executions... carrier route frequencies... block times" the document
    asks for. Confirmed: 2 parquet files, ~354 MB total, one full day,
    global coverage. The snapshot's other 8 raw Mode-S protocol tables
    (acas, allcall_replies, identification, operational_status, position,
    rollcall_replies, state_vectors, velocity) are multi-GB telemetry with
    no direct pricing signal; opt in via OPENSKY_TRINO_TABLES if ever wanted.
  - metadata/: the current aircraft database (icao24 -> type/registration,
    a seat-capacity proxy for the document's "Route Capacity" feature) plus
    the DOC 8643 aircraft-type and manufacturer lookups. Pinned to the
    undated `aircraftDatabase.csv` (the rolling latest snapshot, confirmed
    94.5 MB), not the ~40 dated monthly archives sitting alongside it.

The "Weekly 24 Hours of State Vector Data" (2017-2022, states/ prefix) is
also public and paginable the same way, but is raw multi-year position pings
at 10s resolution -- large and only loosely relevant (long-run frequency
trends at best). Not pulled by default; OPENSKY_STATES_WEEKS (comma list of
week folder dates, e.g. 2022-01-03) opts into specific weeks.
"""
from ..core import config
from ..core.collector import Collector
from ..core.registry import register
from ..core.scrape import list_s3_objects

S3_BASE = config.env("OPENSKY_S3_BASE", "https://s3.opensky-network.org/data-samples")
FLIGHTS_PREFIX = "trino-tables/flights/"
METADATA_FILES = ["metadata/README.TXT", "metadata/aircraftDatabase.csv",
                  "metadata/doc8643AircraftTypes.csv", "metadata/doc8643Manufacturers.csv"]


@register
class OpenSkyScientific(Collector):
    name = "opensky_scientific"
    group = "aviation"
    description = "OpenSky bulk datasets: Trino flights table snapshot + aircraft metadata"
    static_urls = {"s3_bucket": S3_BASE}

    def collect(self, store, session):
        total = 0

        flight_objects = list_s3_objects(session, S3_BASE, FLIGHTS_PREFIX)
        for obj in flight_objects:
            name = obj["key"].rsplit("/", 1)[-1]
            if self.grab(session, store, f"{S3_BASE}/{obj['key']}", name=name,
                         note=f"Trino flights table, {obj['size']} bytes"):
                total += 1

        for key in METADATA_FILES:
            name = key.rsplit("/", 1)[-1]
            if self.grab(session, store, f"{S3_BASE}/{key}", name=name,
                         note="OpenSky aircraft metadata"):
                total += 1

        extra_weeks = config.env_list("OPENSKY_STATES_WEEKS")
        for week in extra_weeks:
            week_objects = list_s3_objects(session, S3_BASE, f"states/.{week}/")
            for obj in week_objects:
                name = f"states_{week}_{obj['key'].rsplit('/', 1)[-1]}"
                if self.grab(session, store, f"{S3_BASE}/{obj['key']}", name=name,
                             note=f"weekly state vectors, {week}"):
                    total += 1

        extra_tables = config.env_list("OPENSKY_TRINO_TABLES")
        for table in extra_tables:
            table_objects = list_s3_objects(session, S3_BASE, f"trino-tables/{table}/")
            for obj in table_objects:
                name = obj["key"].replace("/", "__")
                if self.grab(session, store, f"{S3_BASE}/{obj['key']}", name=name,
                             note=f"Trino {table} table"):
                    total += 1

        return (f"{total} files: {len(flight_objects)} flights-table parquet + "
                f"{len(METADATA_FILES)} metadata + {len(extra_weeks)} opt-in weeks + "
                f"{len(extra_tables)} opt-in tables")
