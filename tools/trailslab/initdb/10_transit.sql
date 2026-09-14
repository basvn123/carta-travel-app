-- Stations, so "car-free start" is a measured fact rather than a hope.
--
-- Written by pipeline/trails/transit_stops.py from the Geofabrik extracts,
-- read by pipeline/trails/attach.py (ROUTES.md R6) to decide whether a
-- route's nearest access point can be reached without a car.
--
-- Railway stations only, with the cycling layer's exclusions (no zoo
-- miniatures, funiculars, heritage lines or freight yards), plus coach
-- stations. Ordinary bus stops are deliberately absent: millions of them,
-- most serving four buses a day, and one beside a trailhead proves nothing.

CREATE TABLE IF NOT EXISTS transit_stops (
    id       bigserial PRIMARY KEY,
    country  text NOT NULL,
    kind     text NOT NULL,        -- station | bus_station
    name     text,
    geom     geometry(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS transit_stops_geom_gist
    ON transit_stops USING GIST (geom);
CREATE INDEX IF NOT EXISTS transit_stops_country_idx
    ON transit_stops (country);
