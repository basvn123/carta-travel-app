"""T1222: the review API's startup migrations never queue behind a busy lab.

    python -m pytest tests/test_review_api_migrations.py -q

"ADD COLUMN IF NOT EXISTS" takes ACCESS EXCLUSIVE on trips even when the
column is there, so on the box (the lab shared with the pipeline) a start
during a trails run stalled both. apply_migrations now checks the catalogue
first and runs the DDL only when something is missing, under a lock timeout.
Stub connections, no database.
"""

import sys
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("psycopg")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools" / "trailslab" / "review" / "api"))

import server as S  # noqa: E402


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql):
        self.conn.executed.append(sql)

    def fetchone(self):
        return (self.conn.migrated,)


class FakeConn:
    def __init__(self, migrated):
        self.migrated = migrated
        self.executed = []
        self.committed = False

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.committed = True


def run(monkeypatch, migrated):
    conn = FakeConn(migrated)
    monkeypatch.setattr(S, "connect", lambda: conn)
    S.apply_migrations()
    return conn


def test_a_migrated_lab_gets_no_ddl_and_so_takes_no_table_lock(monkeypatch):
    conn = run(monkeypatch, migrated=True)
    assert conn.executed == [S.MIGRATED_SQL]
    assert not conn.committed


def test_a_lab_missing_a_migration_runs_it_under_a_lock_timeout(monkeypatch):
    conn = run(monkeypatch, migrated=False)
    assert conn.executed[0] == S.MIGRATED_SQL
    assert "lock_timeout" in conn.executed[1]
    ddl = "".join(conn.executed[2:])
    assert "ALTER TABLE trips ADD COLUMN IF NOT EXISTS description_md" in ddl
    assert "CREATE TABLE IF NOT EXISTS trip_reviews" in ddl
    assert conn.committed


def test_the_check_names_every_object_the_migrations_create():
    sql = "".join((S.INITDB / n).read_text(encoding="utf-8")
                  for n in S.RUNTIME_MIGRATIONS)
    for name in ("description_md", "described_at", "trip_reviews",
                 "trip_reviews_trip_idx", "validation_runs_latest_idx"):
        assert name in sql
        assert f"'{name}'" in S.MIGRATED_SQL
