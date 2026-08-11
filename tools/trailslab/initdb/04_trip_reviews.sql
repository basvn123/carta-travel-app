-- Human review decisions, written by the local review app
-- (tools/trailslab/review), which also applies this file idempotently at
-- startup, because initdb scripts only run against an empty volume (same
-- pattern as 02_trip_repairs.sql and 03_trip_descriptions.sql).
--
-- Everything automated writes to validation_runs; this table is the other
-- half of the ledger: what a person decided, when, and what they changed on
-- the way. status=approved is only ever reachable through a row here, so the
-- table doubles as the publish gate's audit trail. Append-only by
-- convention: a later decision adds a row, it never edits an earlier one.
--
-- changed holds {field: {from, to}} for edit actions, so a description that
-- a curator rewrote can be told apart from the generated one afterwards.

CREATE TABLE IF NOT EXISTS trip_reviews (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trip_id     bigint NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
    action      text NOT NULL,          -- approve, reject, edit, reopen
    reviewer    text,                   -- OS user of the reviewing session
    note        text,
    changed     jsonb,                  -- {field: {from, to}} for edits
    prev_status trip_status,
    new_status  trip_status,
    quality_score numeric,              -- score at decision time, for later drift checks
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_reviews_trip_idx
    ON trip_reviews (trip_id, created_at DESC);

-- The review queue sorts thousands of trips by their newest popularity and
-- portal_agreement rows. On the plain (subject_type, subject_id) index that
-- is a heap probe per trip per check; with check_name and run_at in the
-- index the lookup is one index-only fetch each.
CREATE INDEX IF NOT EXISTS validation_runs_latest_idx
    ON validation_runs (subject_type, subject_id, check_name, run_at DESC);
