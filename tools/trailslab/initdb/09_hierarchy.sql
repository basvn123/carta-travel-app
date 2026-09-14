-- Route hierarchy and dedup: the relation graph the ingest used to throw away.
--
-- ingest_osm_routes.py flattens a superroute's children into the parent's
-- way list and keeps 21 tags of the relation; the member list, the roles,
-- and which relation is a stage of which are gone by the time a row lands
-- in trips. The R0 audit (ROUTES.md) counted the cost: zero rows with any
-- parent bookkeeping, 12.3% of the routes attached to destinations wearing
-- a stage name, and the Via Francigena parent never published while
-- nineteen of its stages are.
--
-- route_relations is the graph, one row per OSM route relation of either
-- activity whether or not a trips or cycle_routes row exists for it. It is
-- the ONLY place the full member list and the full tag set live. The
-- columns copied onto trips and cycle_routes are a convenience for the
-- gates and the export; route_relations is the truth they are copied from.
--
-- Filled by pipeline/trails/hierarchy.py (ROUTES.md R2 scans, R3
-- classifies and copies). Applied through pipeline/trails/schema.py's
-- guard by route_schema.ensure_schema(), because a no-op ALTER still takes
-- ACCESS EXCLUSIVE on trips and has frozen this lab twice before.
-- Every statement is IF NOT EXISTS so an existing lab grows without a
-- rebuild; on a fresh container initdb runs this after 07_cycling.sql,
-- which is where cycle_routes comes from.

CREATE TABLE IF NOT EXISTS route_relations (
    activity       text NOT NULL,              -- hiking | cycling
    osm_id         bigint NOT NULL,            -- the relation id
    country        text,                       -- extract that owns the row
    -- Every tag, verbatim. raw_tags on trips is a 21-key subset; this is not.
    tags_all       jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Ordered [[type, ref, role], ...] exactly as OSM gives it. Never sorted:
    -- stitching and stage order both depend on it.
    members        jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Route relations this one is a member of, and member relations of the
    -- same activity. Merged across country extracts, never overwritten.
    parent_refs    bigint[] NOT NULL DEFAULT '{}',
    child_refs     bigint[] NOT NULL DEFAULT '{}',
    -- parent | stage | variant | standalone, and whether structure or a
    -- name pattern decided it. A name-decided stage or variant is a guess
    -- and says so. A parent with stage_count 0 has only variant children:
    -- it is a line with alternatives, not an umbrella (the regional
    -- sections of the Via Francigena are this), and it may itself be a
    -- stage of something (stage_of set).
    hierarchy      text,
    hierarchy_src  text,
    stage_index    integer,                    -- 1-based, in the parent's member order
    stage_count    integer,                    -- on the parent
    in_store       boolean NOT NULL DEFAULT false,   -- a trips / cycle_routes row exists
    -- R3a. parent_refs is every relation this one is a member of; stage_of is
    -- the ONE the classify step chose as its parent (the most specific, see
    -- hierarchy.py), and top_of the root of that chain. The Via Francigena is
    -- three levels deep (path -> national section -> regional section ->
    -- stage), so "which parent" and "which path" are different answers.
    -- NULL on a root.
    stage_of       bigint,
    top_of         bigint,
    -- Other country extracts that carried this relation (cross-border).
    duplicate_in   text[] NOT NULL DEFAULT '{}',
    scanned_at     timestamptz,
    PRIMARY KEY (activity, osm_id)
);

-- The same two columns again as ALTERs, because on a lab where the table
-- already exists the CREATE above is a no-op and the guard in schema.py only
-- sees ALTER ... ADD COLUMN lines. A column declared only inside the create
-- statement reaches fresh labs and misses every existing one (the cycling
-- layer learned this the hard way). Mind the guard's regexes when wording
-- comments here: it reads this file as text.
ALTER TABLE route_relations ADD COLUMN IF NOT EXISTS stage_of bigint;
ALTER TABLE route_relations ADD COLUMN IF NOT EXISTS top_of bigint;

CREATE INDEX IF NOT EXISTS route_relations_country_idx
    ON route_relations (activity, country);

-- "Every stage of path X": the attach step's question, and the report's.
CREATE INDEX IF NOT EXISTS route_relations_top_of_idx
    ON route_relations (activity, top_of) WHERE top_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS route_relations_stage_of_idx
    ON route_relations (activity, stage_of) WHERE stage_of IS NOT NULL;

CREATE INDEX IF NOT EXISTS route_relations_hierarchy_idx
    ON route_relations (activity, hierarchy);

-- "Every child of relation X": WHERE parent_refs @> ARRAY[x]. GIN, because a
-- btree on an array column answers nothing the classify step asks.
CREATE INDEX IF NOT EXISTS route_relations_parents_gin
    ON route_relations USING GIN (parent_refs);

-- ---------------------------------------------------------------------------
-- The copy onto the store rows, keyed by (source = 'osm', source_ref).
-- ---------------------------------------------------------------------------

ALTER TABLE trips ADD COLUMN IF NOT EXISTS hierarchy text;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS hierarchy_src text;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS parent_refs bigint[];
ALTER TABLE trips ADD COLUMN IF NOT EXISTS stage_index integer;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS stage_count integer;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS stage_of bigint;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS top_of bigint;
-- R3c writes it: the ids of the rows of the same activity whose line this
-- one shares (more than 80% of the shorter inside a 30 m buffer of the
-- longer), the group's HEAD FIRST and the row itself included, so a row is
-- a head exactly when co_located[1] = id. The head has the higher network
-- tier. NULL when the row shares its line with nothing. Nothing here is
-- ever deleted, demoted or unpublished by the dedup step.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS co_located bigint[];

ALTER TABLE cycle_routes ADD COLUMN IF NOT EXISTS hierarchy text;
ALTER TABLE cycle_routes ADD COLUMN IF NOT EXISTS hierarchy_src text;
ALTER TABLE cycle_routes ADD COLUMN IF NOT EXISTS parent_refs bigint[];
ALTER TABLE cycle_routes ADD COLUMN IF NOT EXISTS stage_index integer;
ALTER TABLE cycle_routes ADD COLUMN IF NOT EXISTS stage_count integer;
ALTER TABLE cycle_routes ADD COLUMN IF NOT EXISTS stage_of bigint;
ALTER TABLE cycle_routes ADD COLUMN IF NOT EXISTS top_of bigint;
ALTER TABLE cycle_routes ADD COLUMN IF NOT EXISTS co_located bigint[];

-- "Every stage of path X" and "every member of dedup group X": the queries
-- the attach step (R6) runs per destination.
CREATE INDEX IF NOT EXISTS trips_top_of_idx ON trips (top_of) WHERE top_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS trips_stage_of_idx ON trips (stage_of) WHERE stage_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS cycle_routes_top_of_idx ON cycle_routes (top_of) WHERE top_of IS NOT NULL;
