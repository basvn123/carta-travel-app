"""Carta raw data ingestion framework.

Full coverage collectors for the European transport sources catalogued in
"European Transport Datasets.pdf": NAP timetable feeds (GTFS / NeTEx / SIRI /
HRDF), rail realtime, aviation telemetry and repositories, maritime ferries,
and historical pricing / yield proxy archives.

Raw acquisition only: no parsing, no feature engineering, no ML. Native file
formats are preserved under data/raw/<source>/<YYYY-MM-DD>/ with a per day
manifest.jsonl.

Entry point:
    python -m src.ingestion.run_all --list
"""
