-- Filters, tiers and regions: what a walker narrows a list by, and where the
-- route lives. The columns behind the trails brief's six filters.
--
-- 06_curation.sql answered "is this walk worth publishing". This one answers
-- "is it the walk I am looking for": how hard, how far up, what shape, what
-- it passes, who it suits. Every column here is derived by a named pass and
-- every derived value says it is derived, because a guessed alpine grade and
-- a mapper's alpine grade are not the same claim.
--
-- Applied idempotently by pipeline/trails/attributes.py (and by curate.py,
-- which needs the region and tier columns before it can select); every
-- statement is IF NOT EXISTS, so an existing lab does not need a rebuild.

-- ---------------------------------------------------------------------------
-- Where the route is: the region spine, stamped once, read by every gate
-- ---------------------------------------------------------------------------

-- The compact wire block (n3/n2/co/ra/bg/h4), exactly the shape
-- pipeline/regions/assign.wire_rg() produces for every other layer.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS rg jsonb;
-- The owning level 3 region, lifted out of rg so the quota gate can GROUP BY
-- it and an index can serve it. Midpoint of the route's length owns it, per
-- the assignment contract for lines.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS nuts3 text;
-- Every level 3 region and range the line passes through, so a route can
-- appear on each of their pages even though only one of them budgets for it.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS region_crosses text[];
ALTER TABLE trips ADD COLUMN IF NOT EXISTS regionized_at timestamptz;

CREATE INDEX IF NOT EXISTS trips_nuts3_idx ON trips (nuts3, category, status);

-- ---------------------------------------------------------------------------
-- Tier: the third outcome between publish and drop
-- ---------------------------------------------------------------------------

-- 'r' rated, the walk we are recommending, carries a rating.
-- 'l' listed: continuity and geometry sanity passed, named, deduped, in
--     region, and NOT scored. The wire omits the rating key entirely and the
--     app renders it as a visibly different card. It exists so a region page
--     in Moldova is not empty, and so "we have nothing here" is said by a
--     short list rather than by a blank screen.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS tier text;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS derived_route boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS trips_tier_idx ON trips (country, tier, status);

-- ---------------------------------------------------------------------------
-- Filter 1: difficulty, worst segment wins
-- ---------------------------------------------------------------------------

-- easy | moderate | hard | very_hard | alpine. Separate from trips.difficulty,
-- which is validate.py's three-value effort class and stays as it is: this is
-- the published five-value grade a filter chip maps onto.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS grade text;
-- tagged   at least one member way carries sac_scale/via_ferrata_scale and the
--          grade comes from the hardest of them
-- derived  no member way says anything; the grade comes from the DEM (sustained
--          gradient, ascent per km) and is a guess that says so
ALTER TABLE trips ADD COLUMN IF NOT EXISTS grade_src text;
-- The evidence: the worst sac_scale seen and how much of the line carries it,
-- the worst trail_visibility, the via ferrata scale, the DEM terms.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS grade_parts jsonb;

-- ---------------------------------------------------------------------------
-- Filter 4: route type
-- ---------------------------------------------------------------------------

-- loop | out_back | point | figure8. is_loop stays: it is the cheap boolean
-- the card chip and the curation gate read, and it is exactly (route_type IN
-- ('loop', 'figure8')).
ALTER TABLE trips ADD COLUMN IF NOT EXISTS route_type text;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS route_type_src text;   -- tagged | geometry
ALTER TABLE trips ADD COLUMN IF NOT EXISTS route_type_parts jsonb;

-- ---------------------------------------------------------------------------
-- Filter 5: highlights as codes
-- ---------------------------------------------------------------------------

-- The KINDS a route runs past, deduped, as codes rather than a count.
-- trips.highlights already holds the named features; this is what a filter
-- can index and what the rating's variety term counts.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS highlight_kinds text[];

CREATE INDEX IF NOT EXISTS trips_highlight_kinds_idx
    ON trips USING gin (highlight_kinds);

-- ---------------------------------------------------------------------------
-- Filter 6: suitability
-- ---------------------------------------------------------------------------

-- {"tagged": ["dog", "wheelchair"], "derived": ["family", "beginner"],
--  "cover": {"wheelchair": 0.31, ...}}
--
-- Tagged and derived are DIFFERENT codes on purpose, and wheelchair is only
-- ever tagged: telling somebody in a wheelchair that a path is passable
-- because its gradient looked gentle on a 30 m DEM is the one claim in this
-- layer that could put a person in trouble.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS suitability jsonb;

-- ---------------------------------------------------------------------------
-- Surface: the rating's newest component and the road-walking complaint
-- ---------------------------------------------------------------------------

-- {"quality": 0.72, "road_share": 0.11, "known": 0.63, "by_surface": {...}}
-- Length-weighted shares over the member ways. `known` is how much of the
-- line said anything at all, so a country that does not tag surface scores
-- neutral rather than badly.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS surface jsonb;

-- The length-weighted member way tag summary every derivation above reads,
-- kept so a re-derivation does not need another pass over 30 GB of extracts.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS way_tags jsonb;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS way_tags_at timestamptz;

-- ---------------------------------------------------------------------------
-- The three facts the generated prose knew and the structured fields did not
-- ---------------------------------------------------------------------------

-- describe.py is retired (see docs/TRAILS.md). It composed from the same
-- numbers the facts row prints, in a script's voice, and the page had stopped
-- reading it; these three are everything it knew that the fields did not, so
-- they become fields.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS waymark_ref text;     -- "follow the CBE signs"
ALTER TABLE trips ADD COLUMN IF NOT EXISTS publisher text;       -- "published by swisstopo"
ALTER TABLE trips ADD COLUMN IF NOT EXISTS passes jsonb;         -- [{"name": "...", "m": 800}]

-- ---------------------------------------------------------------------------
-- Season, and the family a route belongs to
-- ---------------------------------------------------------------------------

-- {"from": "jun", "to": "oct", "n": 5, "est": true}. An ESTIMATE from the
-- route's top height and its latitude, the same rule and the same shape the
-- mountain layer publishes, and flagged est so the app can say "typically".
ALTER TABLE trips ADD COLUMN IF NOT EXISTS season jsonb;

-- The named family a route belongs to, so the E paths (E1..E12) and every
-- other long path have a page even when their stages take one slot between
-- them. family_key is curate.py's own union-find key, stored.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS family_key text;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS family_name text;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS family_size integer;

CREATE INDEX IF NOT EXISTS trips_family_idx ON trips (family_key);

-- ---------------------------------------------------------------------------
-- Portal verification, lifted out of validation_runs for the badge
-- ---------------------------------------------------------------------------

-- The cross-check is already durable in validation_runs; these two exist so
-- the export does not have to join the ledger for a badge that appears on
-- every card of four countries.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS portal_ok boolean;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS portal_source text;

-- ---------------------------------------------------------------------------
-- Credits for the sources this brief adds
-- ---------------------------------------------------------------------------
INSERT INTO data_sources (name, license, attribution_template, refresh_cadence)
VALUES
    ('natural_england_national_trails', 'Open Government Licence v3.0',
     '(c) Natural England copyright. Contains Ordnance Survey data '
     '(c) Crown copyright and database right',
     'quarterly')
ON CONFLICT (name) DO NOTHING;
