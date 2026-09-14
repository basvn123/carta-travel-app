-- Curation layer: what makes a staged route worth publishing, and why.
--
-- The ingest leaves 236k OSM route relations in needs_review. Nobody is going
-- to read 236k rows, and the first 545 that reached the app were picked on
-- quality_score alone, which measures whether a relation is well FORMED, not
-- whether the walk is any good. This file adds the columns that answer the
-- second question, plus the scenic features that supply most of the evidence.
--
-- Applied idempotently by pipeline/trails/curate.py, so an existing lab does
-- not need a rebuild; repeated here for a fresh one.

-- ---------------------------------------------------------------------------
-- trips: loop shape, the published rating, and what the walk actually passes
-- ---------------------------------------------------------------------------

-- Shape. A loop starts and ends in the same place, which is the difference
-- between a walk you can drive to and a walk that needs a bus at both ends.
-- loop_source records how we know: the mapper said so, or the geometry does.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS is_loop boolean;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS loop_source text;   -- tagged | geometry

-- Rating, 0..10, one decimal, the number a traveller sees. Composed by
-- pipeline/trails/rate.py from open proxy signals only (network designation,
-- scenic feature density, elevation interest, protected land, prominence,
-- photo density, loop bonus) and normalised WITHIN a country, so a Dutch
-- dune walk is ranked against Dutch walks rather than against the Alps.
-- Deliberately not a review score: nothing here is a user opinion, and no
-- proprietary rating (AllTrails, Komoot, Strava) is ingested anywhere.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS rating numeric;
-- Component breakdown plus the reason codes the app turns into sentences.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS rating_parts jsonb;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS rated_at timestamptz;

-- The named things the route runs past, from scenic_pois below: the summits,
-- viewpoints, waterfalls, lakes and ruins that are the actual reason to walk
-- it. Shipped to the app as the "what you will see" list.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS highlights jsonb;

-- Which curation pass selected this row, so a re-run can tell its own picks
-- from a curator's and from an older wave.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS curated_at timestamptz;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS curation_note text;

CREATE INDEX IF NOT EXISTS trips_rating_idx ON trips (country, rating DESC);
CREATE INDEX IF NOT EXISTS trips_loop_idx ON trips (country, is_loop);

-- ---------------------------------------------------------------------------
-- scenic_pois: the open-data evidence behind a rating.
--
-- One Overpass query per country (pipeline/trails/scenic.py) rather than one
-- per trail: 43 queries instead of 6,000, and the spatial join happens here
-- where it belongs. Points only, including polygon centroids, because the
-- question is "does the route pass this" and a 30 m buffer answers it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scenic_pois (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    country   text NOT NULL,
    kind      text NOT NULL,        -- peak, viewpoint, waterfall, lake, castle, ...
    name      text,
    ele_m     integer,
    wikidata  text,
    osm_ref   text,                 -- "node/240109189", the dedupe key
    geom      geometry(Point, 4326) NOT NULL,
    harvested_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS scenic_pois_ref_uidx
    ON scenic_pois (osm_ref) WHERE osm_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS scenic_pois_geom_gist ON scenic_pois USING gist (geom);
CREATE INDEX IF NOT EXISTS scenic_pois_country_idx ON scenic_pois (country, kind);

-- ---------------------------------------------------------------------------
-- images: rank and geometry, so a gallery has an order and a hero has a rule.
--
-- The existing table stored candidates with no way to say which one leads.
-- rank 0 is the hero; the rest follow in ascending order. taken_lat/lon is
-- where the photograph was shot, which is what lets the app say "this view is
-- at km 7" instead of showing a picture from the next valley.
-- ---------------------------------------------------------------------------
ALTER TABLE images ADD COLUMN IF NOT EXISTS rank integer;
ALTER TABLE images ADD COLUMN IF NOT EXISTS score numeric;
ALTER TABLE images ADD COLUMN IF NOT EXISTS width integer;
ALTER TABLE images ADD COLUMN IF NOT EXISTS height integer;
ALTER TABLE images ADD COLUMN IF NOT EXISTS caption text;
ALTER TABLE images ADD COLUMN IF NOT EXISTS license_url text;
ALTER TABLE images ADD COLUMN IF NOT EXISTS taken_lat double precision;
ALTER TABLE images ADD COLUMN IF NOT EXISTS taken_lon double precision;
-- Distance along the route where the shot was taken, metres. NULL when the
-- photograph could not be placed on the line.
ALTER TABLE images ADD COLUMN IF NOT EXISTS along_m integer;

-- A file is a candidate once per subject. Re-running the photo pass updates
-- the row instead of stacking near-duplicates.
--
-- The citytrip photo pass predates the constraint and inserted the same file
-- twice for some subjects, so the duplicates go before the index can exist.
-- Lowest id wins: it is the one any other row might already reference.
DELETE FROM images a USING images b
 WHERE a.subject_type = b.subject_type
   AND a.subject_id = b.subject_id
   AND a.url = b.url
   AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS images_subject_url_uidx
    ON images (subject_type, subject_id, url);
CREATE INDEX IF NOT EXISTS images_rank_idx ON images (subject_type, subject_id, rank);

-- ---------------------------------------------------------------------------
-- Credits for the two sources this layer adds.
-- ---------------------------------------------------------------------------
INSERT INTO data_sources (name, license, attribution_template, refresh_cadence)
VALUES
    ('wikimedia_commons', 'Per-file free licence (CC BY / CC BY-SA / PD)',
     'Photographs from Wikimedia Commons, per-file licences on record', 'quarterly'),
    ('osm_scenic', 'ODbL 1.0',
     'Landmark data (c) OpenStreetMap contributors, ODbL', 'quarterly')
ON CONFLICT (name) DO NOTHING;
