-- Scenic AREAS: the highlights that are places rather than points.
--
-- scenic_pois answers "is there a summit near the line". This answers "does
-- the line go THROUGH the Forest of Dean", which is a different question and
-- cannot be asked of a centroid: a large forest's centre is tens of
-- kilometres from most walks inside it, so a point would be silent on routes
-- that spend all day under its trees and positive for one that passes the
-- middle without entering.
--
-- Written by pipeline/trails/forests.py from the Geofabrik extracts, and read
-- by pipeline/trails/scenic.py's link step alongside scenic_pois.

CREATE TABLE IF NOT EXISTS scenic_areas (
    id          bigserial PRIMARY KEY,
    -- 'w123' for a closed way, 'r123' for an assembled multipolygon. The
    -- prefix is load bearing: a way and a relation can share an id, and
    -- without it the unique index below would drop one of them at random.
    osm_ref     text NOT NULL,
    country     text,
    kind        text NOT NULL,
    name        text NOT NULL,
    -- Stored MULTIPOLYGON even for a single ring, so no consumer has to
    -- branch on how many parts a forest happens to be mapped in.
    geom        geometry(MultiPolygon, 4326) NOT NULL,
    area_m2     double precision,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS scenic_areas_ref_idx
    ON scenic_areas (osm_ref);

-- The index the link join lives on. GiST on the plain geometry, matching
-- scenic_pois: the join overlaps an expanded envelope first and only then
-- runs the metric test, because a geography cast cannot use a geometry index
-- and degrades to a sequential scan.
CREATE INDEX IF NOT EXISTS scenic_areas_geom_idx
    ON scenic_areas USING GIST (geom);

CREATE INDEX IF NOT EXISTS scenic_areas_kind_idx
    ON scenic_areas (kind);
