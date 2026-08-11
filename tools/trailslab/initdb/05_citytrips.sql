-- City trips: market demand statistics plus the citytrip trip category.
-- Fresh labs get this via /docker-entrypoint-initdb.d; labs created before
-- this file existed get it from pipeline/trails/market_demand.py, which
-- executes it at startup (everything here is idempotent).

ALTER TYPE trip_category ADD VALUE IF NOT EXISTS 'citytrip';

-- ---------------------------------------------------------------------------
-- market_demand: official visitor-night statistics per city, the basis for
-- citytrip city selection (never the app's internal fame signals alone).
-- One row per (source, country, upstream code); a re-harvest upserts.
-- A NULL city marks a country-level context row (Eurostat tour_occ).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_demand (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    country      text NOT NULL,           -- ISO 3166-1 alpha-2
    city         text,                    -- NULL = country-level context row
    city_code    text NOT NULL,           -- upstream code: urban audit city code,
                                          -- SSB municipality number, AT Bundesland,
                                          -- or the Eurostat geo code
    nights       bigint NOT NULL,         -- annual visitor nights, latest available
    year         integer NOT NULL,        -- the year the figure describes
    source       text NOT NULL,           -- e.g. eurostat_urb_ctour, ssb_12898
    license      text NOT NULL,
    note         text,
    harvested_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS market_demand_src_uidx
    ON market_demand (source, country, city_code);
CREATE INDEX IF NOT EXISTS market_demand_country_idx
    ON market_demand (country);
