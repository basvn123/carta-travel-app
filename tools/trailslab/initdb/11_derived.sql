-- Derived activities: a flag on the route, never a row of its own.
--
-- ROUTES.md R8 asks for trail running and gravel, neither of which OSM
-- tags. They are derived by pipeline/trails/derived_activities.py from
-- measurements the route already carries (shape, ascent per km, the member
-- way surfaces, the positioned way_spans).
--
-- Stored as a flag rather than as a second row, because one line on the
-- ground is one line in the store however many sports it serves. A walk
-- that is also a good run is one route with two audiences, and duplicating
-- it would double the dedup, the attach and the wire for nothing.
--
-- Shape: {"trail_running": {"score": 0.82}} on trips,
--        {"gravel": {"unpaved": 0.63, "worst_mtb": 0, "rough_share": 0.02}}
--        on cycle_routes.

ALTER TABLE trips ADD COLUMN IF NOT EXISTS derived jsonb;
ALTER TABLE cycle_routes ADD COLUMN IF NOT EXISTS derived jsonb;

-- "every trail-running route" is a containment test, which GIN serves and
-- btree does not.
CREATE INDEX IF NOT EXISTS trips_derived_gin
    ON trips USING GIN (derived);
CREATE INDEX IF NOT EXISTS cycle_routes_derived_gin
    ON cycle_routes USING GIN (derived);
