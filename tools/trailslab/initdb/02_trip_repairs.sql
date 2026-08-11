-- Gap-repaired geometries, one row per repaired trip, alongside the
-- untouched original in trips.geom. Written by pipeline/trails/repair.py,
-- which also applies this file idempotently at runtime, because initdb
-- scripts only run against an empty volume.
--
-- repaired = true means the repair was auto-accepted (every gap bridged and
-- length divergence within threshold); false means a human must review it
-- (the repair script also moves draft trips to needs_review in that case).
-- Z is flattened to 0 in repaired geometry: re-run the elevation sampling
-- step after a repair before trusting ascent figures.

CREATE TABLE IF NOT EXISTS trip_repairs (
    trip_id        bigint PRIMARY KEY REFERENCES trips (id) ON DELETE CASCADE,
    geom           geometry(MultiLineStringZ, 4326) NOT NULL,
    repaired       boolean NOT NULL,
    divergence_pct numeric NOT NULL,      -- signed: (repaired - original) / original * 100
    original_len_m integer NOT NULL,
    repaired_len_m integer NOT NULL,
    repair_info    jsonb,                 -- per-gap outcomes, tolerances, valhalla url
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_repairs_geom_gist ON trip_repairs USING gist (geom);
