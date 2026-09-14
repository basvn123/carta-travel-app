"""Shared, crash-safe IO for the offline data pipeline.

Every script that rewrites the multi-megabyte master (app_data/app_data.json)
should write through ``atomic_write_json`` so an interrupted write - a Ctrl-C,
a crash, or a full disk - can never leave a truncated, unparseable file behind.
A direct ``path.write_text(json.dumps(...))`` truncates the file first and then
streams the new bytes, so a failure mid-write destroys the dataset the app and
every downstream script load.

The pattern mirrors the cache writer already in enrich_activities.py: dump to a
temp file on the same directory, flush + fsync it to disk, then ``os.replace``
onto the target (atomic on the same filesystem). ``indent=1`` is the pipeline's
canonical on-disk format, so keeping every writer on this one helper also stops
the whole-file git churn caused by scripts disagreeing on serialization.

Usage:
    from pipeline_io import atomic_write_json, load_json
    data = load_json(MASTER)
    ...
    atomic_write_json(MASTER, data)
"""
import json
import time
import os


def atomic_write_json(path, data, *, indent=1, ensure_ascii=False,
                      separators=None):
    """Serialize ``data`` to ``path`` atomically (tmp -> fsync -> os.replace).

    ``path`` may be a str or pathlib.Path. The temp file lives beside the target
    so os.replace stays on one filesystem and is truly atomic. Pass ``indent=
    None, separators=(",", ":")`` for the compact form served files use.
    """
    path = os.fspath(path)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=indent, ensure_ascii=ensure_ascii,
                  separators=separators)
        f.flush()
        os.fsync(f.fileno())
    _replace_with_retry(tmp, path)


# On Windows os.replace raises PermissionError (WinError 5) whenever ANY other
# handle is open on the target: a second pipeline script reading it, an editor,
# or the virus scanner that opens every file the moment it is written. It is
# transient and clears in seconds, but it aborted a four-hour POI harvest on
# 2026-08-17 at the very last write, leaving the finished work stranded in the
# .tmp file. Retrying costs nothing and turns a lost run into a pause.
_REPLACE_TRIES = 6
_REPLACE_BACKOFF_S = 1.5


def _replace_with_retry(tmp, path):
    last = None
    for attempt in range(_REPLACE_TRIES):
        try:
            os.replace(tmp, path)
            return
        except PermissionError as e:          # Windows: target handle is open
            last = e
            time.sleep(_REPLACE_BACKOFF_S * (attempt + 1))
    # Out of retries. The temp file is complete and valid, so say exactly where
    # it is: the caller's work is recoverable with a single move.
    raise PermissionError(
        f"could not replace {path} after {_REPLACE_TRIES} attempts "
        f"({last}). The finished data is intact at {tmp} - close whatever "
        f"holds the target and move it into place.")


def load_json(path, default=None):
    """Read + parse JSON, returning ``default`` (``{}`` when unset) on any
    failure (missing file, partial/corrupt content)."""
    try:
        with open(os.fspath(path), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {} if default is None else default
