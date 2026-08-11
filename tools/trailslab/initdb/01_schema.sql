-- Trails and daytrips content lab, staging schema.
-- Runs once via /docker-entrypoint-initdb.d on first container start.
-- Everything here is staging: rows move through the status workflow
-- (draft -> needs_review -> approved -> published, or rejected) and only
-- approved content is ever exported towards the app.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;

CREATE TYPE trip_category AS ENUM ('hike', 'daytrip');
CREATE TYPE trip_status AS ENUM (
    'draft', 'needs_review', 'approved', 'published', 'rejected'
);

-- Keep updated_at honest without every writer having to remember it.
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- trips: one row per hike or daytrip, geometry in 3D (Z = ellipsoidal metres
-- from the DEM sampling step, so ascent/descent can be recomputed).
-- ---------------------------------------------------------------------------
CREATE TABLE trips (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    country           text NOT NULL,                -- ISO 3166-1 alpha-2
    category          trip_category NOT NULL,
    title             text NOT NULL,
    geom              geometry(MultiLineStringZ, 4326) NOT NULL,
    distance_m        integer,
    ascent_m          integer,
    descent_m         integer,
    duration_min      integer,
    difficulty        text,                         -- normalised easy/moderate/hard scale
    sac_scale         text,                         -- raw OSM sac_scale when present
    network           text,                         -- lwn/rwn/nwn/iwn for OSM route relations
    source            text NOT NULL,                -- osm, swisstopo, ign_bdtopo, turrutebasen, ...
    source_ref        text,                         -- stable upstream id (relation id, portal id)
    license           text NOT NULL,
    attribution_text  text,
    status            trip_status NOT NULL DEFAULT 'draft',
    quality_score     numeric,
    raw_tags          jsonb,
    gap_info          jsonb,                        -- geometry gaps found during validation
    elevation         jsonb,                        -- DEM profile + sampling metadata (elevation.py)
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    last_validated_at timestamptz
);

CREATE TRIGGER trips_set_updated_at
    BEFORE UPDATE ON trips
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX trips_geom_gist ON trips USING gist (geom);
CREATE INDEX trips_country_idx ON trips (country);
CREATE INDEX trips_status_idx ON trips (status);
-- One row per upstream object; concurrent ingest runs upsert instead of
-- racing each other into duplicates (applied live on 2026-08-07).
CREATE UNIQUE INDEX trips_source_ref_uidx
    ON trips (source, source_ref) WHERE source_ref IS NOT NULL;

-- ---------------------------------------------------------------------------
-- trip_stops: ordered stops of a daytrip (also usable for hike waypoints).
-- leg_* describes how you get TO this stop from the previous one.
-- ---------------------------------------------------------------------------
CREATE TABLE trip_stops (
    trip_id          bigint NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
    seq              integer NOT NULL,
    poi_ref          text,                          -- app POI key or external id
    dwell_min        integer,
    leg_mode         text,                          -- walk, drive, transit, bike, ferry
    leg_duration_min integer,
    leg_geom         geometry(LineString, 4326),    -- 2D on purpose: routing output
    PRIMARY KEY (trip_id, seq)
);

CREATE INDEX trip_stops_leg_geom_gist ON trip_stops USING gist (leg_geom);

-- ---------------------------------------------------------------------------
-- images: candidate imagery per subject. NC and ND licensed material is
-- rejected at insert time so it can never reach the approval queue.
-- ---------------------------------------------------------------------------
CREATE TABLE images (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subject_type     text NOT NULL,                 -- trip, trip_stop, poi
    subject_id       bigint NOT NULL,
    url              text NOT NULL,
    title            text,
    author           text,
    source_url       text,
    license          text NOT NULL,
    attribution_text text,
    is_approved      boolean NOT NULL DEFAULT false,
    -- Catches CC BY-NC, CC BY-ND, CC BY-NC-SA and the spelled-out variants.
    -- The letter-boundary guards keep words like "and" or "domain" from matching.
    CONSTRAINT images_no_nc_nd CHECK (
        license !~* '(^|[^a-z])(nc|nd)([^a-z]|$)'
        AND license !~* 'non-?commercial|no-?deriv'
    )
);

CREATE INDEX images_subject_idx ON images (subject_type, subject_id);

-- ---------------------------------------------------------------------------
-- validation_runs: one row per automated check per subject, append-only.
-- ---------------------------------------------------------------------------
CREATE TABLE validation_runs (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subject_type text NOT NULL,
    subject_id   bigint NOT NULL,
    check_name   text NOT NULL,
    passed       boolean NOT NULL,
    score        numeric,
    details      jsonb,
    run_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX validation_runs_subject_idx ON validation_runs (subject_type, subject_id);

-- ---------------------------------------------------------------------------
-- portal_trails: official geometries from national portals (swisstopo, IGN,
-- Kartverket), kept verbatim to cross-validate the OSM-derived trips.
-- Generic geometry type: portals ship LineString, MultiLineString, with or
-- without Z. SRID is still pinned to 4326.
-- ---------------------------------------------------------------------------
CREATE TABLE portal_trails (
    id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    country text NOT NULL,
    name    text,
    geom    geometry(Geometry, 4326) NOT NULL,
    source  text NOT NULL,
    license text NOT NULL
);

CREATE INDEX portal_trails_geom_gist ON portal_trails USING gist (geom);
CREATE INDEX portal_trails_country_idx ON portal_trails (country);

-- ---------------------------------------------------------------------------
-- data_sources: refresh bookkeeping per upstream source. The license ledger
-- of record stays docs/tos/data_licenses.md; this table drives automation.
-- ---------------------------------------------------------------------------
CREATE TABLE data_sources (
    name               text PRIMARY KEY,
    license            text NOT NULL,
    attribution_template text,
    last_refreshed_at  timestamptz,
    refresh_cadence    text                          -- weekly, monthly, quarterly
);

INSERT INTO data_sources (name, license, attribution_template, refresh_cadence) VALUES
    ('osm',          'ODbL 1.0',
     'Trail data (c) OpenStreetMap contributors, ODbL', 'monthly'),
    ('copernicus_glo30', 'Copernicus DEM terms (free use with credit)',
     'Elevation data: Copernicus GLO-30 (c) ESA and Airbus', 'yearly'),
    ('swisstopo',    'swisstopo open government data (free use with source)',
     'Source: Federal Office of Topography swisstopo', 'quarterly'),
    ('ign_bdtopo',   'Etalab Licence Ouverte 2.0',
     'Source: IGN BD TOPO (Etalab 2.0)', 'quarterly'),
    ('turrutebasen', 'CC BY 4.0',
     'Trail network: Kartverket Turrutebasen (CC BY 4.0)', 'quarterly');
