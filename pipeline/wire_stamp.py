"""One clock for every wire stamp (T1099, D12).

Tier: Library

A wire's `generated_at` must be the moment the writer ran, never a copied or
constant date. Writers that do not already read the clock call `build_stamp()`;
`tests/test_wire_stamps.py` fails on a writer with a literal stamp.
"""
from datetime import datetime, timezone


def build_stamp(now=None):
    """UTC ISO-8601 to the second, e.g. 2026-11-06T09:30:00Z."""
    now = now or datetime.now(timezone.utc)
    return now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
