-- Cycling layer staging schema: the sixth content layer, built as a sibling
-- of trails rather than from scratch. Written by pipeline/cycling/*, which
-- also applies this file idempotently at runtime, because initdb scripts only
-- ever run against an empty volume (same pattern as 02_trip_repairs.sql).
--
-- Two published things live here, and keeping them apart is the whole point:
--
--   cycle_routes   named, signed, real-world cycle routes. The catalogue.
--                  OSM-derived geometry, ODbL, exportable as GPX with the
--                  attribution travelling inside the file.
--   cycle_tours    multi-day plans composed OVER those routes at build time
--                  by stage_planner.py, validated by ten hard checks, and
--                  never generated at request time. Ours, not a database
--                  extract, which is why the wire keeps them in a separate
--                  structure from the geometry they ride on.
--
-- The licence posture (brief 07 section 7) is the reason for that split, and
-- it is enforced in export_cycling.py rather than here: the lab is internal,
-- the wire is what ships.
--
-- Route status reuses trip_status: the workflow is identical
-- (draft -> needs_review -> approved -> published, or rejected) and a second
-- enum spelling the same five words would only be a way for the two to drift.

-- ---------------------------------------------------------------------------
-- cycle_routes: one row per real-world cycle route.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cycle_routes (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    country           text NOT NULL,                -- ISO 3166-1 alpha-2
    name              text,
    ref               text,                         -- EV6, NCN 78, LF1
    network           text,                         -- icn / ncn / rcn / lcn
    cycle_network     text,                         -- EuroVelo, NL:LF, ...
    operator          text,
    geom              geometry(MultiLineStringZ, 4326) NOT NULL,
    distance_m        integer,
    ascent_m          integer,                      -- smoothed, enrich_cycling
    descent_m         integer,
    roundtrip         boolean,
    source            text NOT NULL,                -- osm, eurovelo_gpx, ...
    source_ref        text,                         -- relation id, portal id
    license           text NOT NULL,
    attribution_text  text,
    status            trip_status NOT NULL DEFAULT 'draft',
    -- Tier is derived by the gate, never hand set, except 'e' from a seed.
    -- r = rated, l = listed (no score ships), e = editorial.
    tier              text,
    rating            numeric,                      -- 0..10, cycle_index.py
    rating_parts      jsonb,
    reasons           jsonb,                        -- codes for cycleStory.js
    -- Enrichment, each its own structure so a partial pass is legible.
    way_spans         jsonb,                        -- per-member-way tags+length
    surface           jsonb,                        -- paved/traffic-free/worst
    safety            jsonb,                        -- house metric + parts
    scenic            jsonb,                        -- composite + parts
    services          jsonb,                        -- service towns on the line
    elevation         jsonb,                        -- profile + sampling meta
    season            jsonb,                        -- months from climatology
    regions           jsonb,                        -- nuts3/nuts2/coast/h3r4
    near              jsonb,                        -- cross-layer ids, brief 08
    images            jsonb,                        -- ranked photographs
    agreement         jsonb,                        -- national portal check
    raw_tags          jsonb,
    gap_info          jsonb,                        -- assembly bookkeeping
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    last_validated_at timestamptz
);

DO $$ BEGIN
    CREATE TRIGGER cycle_routes_set_updated_at
        BEFORE UPDATE ON cycle_routes
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS cycle_routes_geom_gist
    ON cycle_routes USING gist (geom);
CREATE INDEX IF NOT EXISTS cycle_routes_country_idx ON cycle_routes (country);
CREATE INDEX IF NOT EXISTS cycle_routes_status_idx ON cycle_routes (status);
CREATE INDEX IF NOT EXISTS cycle_routes_ref_idx ON cycle_routes (ref);
-- One row per upstream object, so concurrent ingests upsert instead of
-- racing each other into duplicates. Same convention as trips.
CREATE UNIQUE INDEX IF NOT EXISTS cycle_routes_source_ref_uidx
    ON cycle_routes (source, source_ref) WHERE source_ref IS NOT NULL;

-- ---------------------------------------------------------------------------
-- cycle_repairs: spliced geometry alongside the untouched original, exactly
-- as trip_repairs does for trails. splice_cycling.py writes it; every reader
-- checks source_geom_md5 so a re-ingest invalidates a stale repair instead of
-- publishing a line that no longer matches its route.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cycle_repairs (
    route_id       bigint PRIMARY KEY REFERENCES cycle_routes (id) ON DELETE CASCADE,
    geom           geometry(MultiLineStringZ, 4326) NOT NULL,
    repaired       boolean NOT NULL,
    divergence_pct numeric NOT NULL,
    original_len_m integer NOT NULL,
    repaired_len_m integer NOT NULL,
    repair_info    jsonb,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cycle_repairs_geom_gist
    ON cycle_repairs USING gist (geom);

-- ---------------------------------------------------------------------------
-- cycle_services: service towns, the atoms the stage planner cuts at.
-- Clustered from OSM sleeping, water, food, bike and rail amenities within a
-- 2 km buffer of a route line. A stage never ends at an arbitrary GPS point.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cycle_services (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    country      text NOT NULL,
    name         text,
    geom         geometry(Point, 4326) NOT NULL,
    sleep_n      integer NOT NULL DEFAULT 0,   -- hotel/guest_house/hostel/chalet
    campsite_n   integer NOT NULL DEFAULT 0,
    bike_shop_n  integer NOT NULL DEFAULT 0,
    repair_n     integer NOT NULL DEFAULT 0,   -- bicycle_repair_station
    water_n      integer NOT NULL DEFAULT 0,   -- drinking_water
    grocery_n    integer NOT NULL DEFAULT 0,
    station_n    integer NOT NULL DEFAULT 0,   -- railway=station|halt
    station_name text,
    score        numeric,                      -- service_score(), 0..1
    osm_refs     jsonb,
    UNIQUE (country, name, geom)
);

CREATE INDEX IF NOT EXISTS cycle_services_geom_gist
    ON cycle_services USING gist (geom);
-- The route-to-town join tests ST_DWithin in GEOGRAPHY, and a plain geometry
-- index cannot serve that. Without this the join scans every town in the
-- country once per route, which is eleven thousand geography casts of a full
-- route line each time and a pass that does not finish.
CREATE INDEX IF NOT EXISTS cycle_services_geog_gist
    ON cycle_services USING gist ((geom::geography));
CREATE INDEX IF NOT EXISTS cycle_services_country_idx ON cycle_services (country);

-- ---------------------------------------------------------------------------
-- cycle_nodes / cycle_node_edges: the knooppunten planning graph for NL, BE
-- and the parts of DE and FR that have one. Vertices are numbered junctions
-- (rcn_ref), edges are the connection relations with their stitched geometry.
--
-- rcn_ref is NOT unique across a country: provincial numbering resets, so the
-- key is (country, rcn_ref, network_name) and the disambiguation of the rest
-- is by location, which is what harvest_cycling.py does when it links edges.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cycle_nodes (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    country      text NOT NULL,
    rcn_ref      text NOT NULL,
    network_name text,
    osm_node     bigint,
    geom         geometry(Point, 4326) NOT NULL,
    UNIQUE (country, osm_node)
);

CREATE INDEX IF NOT EXISTS cycle_nodes_geom_gist ON cycle_nodes USING gist (geom);
CREATE INDEX IF NOT EXISTS cycle_nodes_ref_idx ON cycle_nodes (country, rcn_ref);

CREATE TABLE IF NOT EXISTS cycle_node_edges (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    country    text NOT NULL,
    ref        text,                             -- "12-34", lower-higher
    from_node  bigint REFERENCES cycle_nodes (id) ON DELETE CASCADE,
    to_node    bigint REFERENCES cycle_nodes (id) ON DELETE CASCADE,
    geom       geometry(LineString, 4326) NOT NULL,
    length_m   integer,
    source_ref text,
    UNIQUE (source_ref)
);

CREATE INDEX IF NOT EXISTS cycle_node_edges_geom_gist
    ON cycle_node_edges USING gist (geom);
CREATE INDEX IF NOT EXISTS cycle_node_edges_country_idx
    ON cycle_node_edges (country);

-- ---------------------------------------------------------------------------
-- cycle_portal_routes: official national geometries (Sustrans, Spatial Hub
-- Scotland, BNAC, Toerisme Vlaanderen, opendata.swiss), kept verbatim to
-- measure agreement with the OSM-derived line. Same role portal_trails plays
-- for hiking, and the same generic geometry type for the same reason.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cycle_portal_routes (
    id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Nullable, unlike every other country column in this schema. A EuroVelo
    -- GPX track is one continuous line across ten countries, and naming one
    -- of them would be a worse answer than naming none. The agreement query
    -- filters on source and ref, never on this.
    country text,
    name    text,
    ref     text,
    geom    geometry(Geometry, 4326) NOT NULL,
    source  text NOT NULL,
    license text NOT NULL
);

CREATE INDEX IF NOT EXISTS cycle_portal_routes_geom_gist
    ON cycle_portal_routes USING gist (geom);
-- Projected once, indexed, for the agreement measurement. Transforming
-- 37,206 Sustrans geometries per route inside the query is the same trap the
-- service join and the scenic score each had to be dug out of; populate this
-- with ST_MakeValid(ST_Transform(geom, 3035)) after any portal load.
ALTER TABLE cycle_portal_routes
    ADD COLUMN IF NOT EXISTS geom_3035 geometry(Geometry, 3035);
CREATE INDEX IF NOT EXISTS cycle_portal_3035_gist
    ON cycle_portal_routes USING gist (geom_3035);
CREATE INDEX IF NOT EXISTS cycle_portal_routes_country_idx
    ON cycle_portal_routes (country);

-- ---------------------------------------------------------------------------
-- cycle_tours: the product. Composed at build time by stage_planner.py over
-- published routes, validated by validate_cycling.py, and only then exported.
-- stages holds the ordered day plan; every field in it is measured, not
-- claimed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cycle_tours (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    country      text NOT NULL,
    slug         text NOT NULL UNIQUE,
    title        text NOT NULL,
    route_ids    bigint[] NOT NULL,
    pace         text NOT NULL,                 -- relaxed / balanced / strong
    bike_type    text NOT NULL,                 -- touring / gravel / any
    days         integer NOT NULL,
    distance_m   integer NOT NULL,
    ascent_m     integer,
    geom         geometry(MultiLineStringZ, 4326) NOT NULL,
    stages       jsonb NOT NULL,
    checks       jsonb,
    season       jsonb,
    scenic       numeric,
    safety       numeric,
    rating       numeric,
    regions      jsonb,
    near         jsonb,
    images       jsonb,
    status       trip_status NOT NULL DEFAULT 'draft',
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
    CREATE TRIGGER cycle_tours_set_updated_at
        BEFORE UPDATE ON cycle_tours
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS cycle_tours_geom_gist ON cycle_tours USING gist (geom);
CREATE INDEX IF NOT EXISTS cycle_tours_country_idx ON cycle_tours (country);

-- ---------------------------------------------------------------------------
-- bike_rail: hand-curated operator policies, because there is no open
-- machine-readable dataset of which trains carry how many bicycles. EU
-- Regulation 2021/782 sets a floor and requires carriers to publish terms,
-- but it is a legal minimum, not a feed. Written by seed_bike_rail.py.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bike_rail (
    country       text NOT NULL,
    operator      text NOT NULL,
    reservation   text NOT NULL,      -- required / recommended / none / varies
    seasonal      boolean NOT NULL DEFAULT false,
    folded_free   boolean,
    fee_note      text,               -- code, not prose: cycleStory.js renders
    url           text NOT NULL,
    checked_on    date NOT NULL,
    PRIMARY KEY (country, operator)
);

-- ---------------------------------------------------------------------------
-- Source bookkeeping. The licence ledger of record stays
-- docs/tos/data_licenses.md; this table only drives refresh automation.
-- ---------------------------------------------------------------------------
INSERT INTO data_sources (name, license, attribution_template, refresh_cadence)
VALUES
    ('eurovelo_gpx', 'ODbL 1.0',
     'Contains information from EuroVelo GPX tracks downloaded from '
     'www.EuroVelo.com on {date}, which is made available here under the '
     'Open Database License (ODbL).', 'yearly'),
    ('sustrans_ncn', 'Open Government Licence v3.0',
     'National Cycle Network data (c) Sustrans, Open Government Licence v3.0',
     'monthly'),
    ('spatialhub_cycling', 'Open Government Licence v3.0',
     'Cycling Network data from the Spatial Hub, (c) the Scottish local '
     'authorities, Open Government Licence v3.0', 'quarterly'),
    ('bnac_france', 'Licence Ouverte 2.0 (Etalab)',
     'Base Nationale des Amenagements Cyclables, Licence Ouverte 2.0', 'monthly'),
    ('toerisme_vlaanderen', 'Flemish open data licence',
     'Cycling node network from Toerisme Vlaanderen', 'quarterly'),
    ('opendata_swiss_veloland', 'opendata.swiss terms (free reuse with source)',
     'Veloland route network, SchweizMobil / opendata.swiss', 'quarterly'),
    ('esa_worldcover', 'CC BY 4.0',
     'Land cover: ESA WorldCover 10 m (c) ESA / Contains modified Copernicus '
     'Sentinel data', 'yearly')
ON CONFLICT (name) DO NOTHING;
